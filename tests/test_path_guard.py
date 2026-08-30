"""Round-2 tests: settings robustness, path guards, force_reload semantics.

Uses the real ``main.Plugin`` with the decky/decky_plugin mocks from
conftest, monkeypatching module-level constants so no real user state
is touched.
"""
import asyncio
from types import SimpleNamespace

import filelock
import pytest
import saveparser

import main


@pytest.fixture()
def plugin(tmp_path, monkeypatch):
    # Redirect settings storage into tmp_path before the plugin touches it.
    monkeypatch.setattr(main, "SETTINGS_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")
    p = main.Plugin()
    return p


# --- settings.json robustness ---------------------------------------------

def test_load_settings_with_non_dict_json(plugin):
    # Valid JSON but not an object: must fall back to defaults, not crash
    # plugin startup (previously AttributeError in _coerce_settings).
    main.SETTINGS_PATH.write_text("[1, 2, 3]", encoding="utf-8")
    plugin._load_settings()
    assert plugin._settings["scan_interval_seconds"] == 30
    assert plugin._settings["theme"] == "default"


def test_load_settings_with_garbage_json(plugin):
    main.SETTINGS_PATH.write_text("{not json", encoding="utf-8")
    plugin._load_settings()
    assert plugin._settings["scan_interval_seconds"] == 30


def test_save_settings_swallows_lock_timeout(plugin, monkeypatch):
    # A contended settings lock raises filelock.Timeout, which does NOT
    # derive from OSError — must not propagate to update_settings callers.
    class FakeTimeout(filelock.Timeout):
        def __init__(self):
            super().__init__("fake")

    class BusyLock:
        def __init__(self, lock_path, timeout=None):
            pass

        def __enter__(self):
            raise FakeTimeout()

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(filelock, "FileLock", BusyLock)
    plugin._save_settings()  # must not raise
    assert not main.SETTINGS_PATH.with_suffix(".json.tmp").exists()


# --- path guards ------------------------------------------------------------

def test_save_data_from_path_blocks_traversal(plugin):
    outside = "/etc/passwd.rxdata"
    result = asyncio.run(plugin.get_save_data_from_path(outside))
    assert result.get("error") == "parse_failed"
    assert "traversal" in result.get("message", "").lower()


def test_save_data_from_path_rejects_non_rxdata(plugin):
    result = asyncio.run(plugin.get_save_data_from_path("relative.txt"))
    assert result.get("error") == "parse_failed"
    assert "extension" in result.get("message", "").lower()


def test_load_pbs_moves_rejects_non_txt(plugin):
    result = asyncio.run(plugin.load_pbs_moves("/tmp/evil.rxdata"))
    assert result.get("loaded") is False
    assert result.get("error") == "invalid_extension"


# --- force_reload semantics --------------------------------------------------

def test_force_reload_bypasses_lru_cache(plugin, tmp_path, monkeypatch):
    save_file = tmp_path / "Game.rxdata"
    save_file.write_bytes(b"\x04\x08stub")

    monkeypatch.setattr(main, "find_save_file", lambda override: save_file)

    force_calls = []
    monkeypatch.setattr(
        main, "parse_save_file",
        lambda path: force_calls.append(path)
        or SimpleNamespace(to_dict=lambda: {"forced": path}),
    )
    lru_calls = []
    monkeypatch.setattr(
        saveparser, "parse_save_file",
        lambda path: lru_calls.append(path) or SimpleNamespace(
            to_dict=lambda: {"cached": path}
        ),
    )

    # force=True must call the real parser, not the lru-cached wrapper.
    out = asyncio.run(plugin.get_save_data(force_reload=True))
    assert len(force_calls) == 1
    assert out == {"forced": str(save_file)}

    # Two non-force calls with an unchanged mtime and a cold instance
    # cache: the lru wrapper parses once, then serves from lru_cache.
    plugin._save_cache = None
    plugin._save_cache_at = 0.0
    asyncio.run(plugin.get_save_data())
    plugin._save_cache = None
    plugin._save_cache_at = 0.0
    asyncio.run(plugin.get_save_data())
    assert len(lru_calls) == 1
