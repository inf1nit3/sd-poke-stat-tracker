"""Round-5 tests for main.Plugin endpoints that were never executed.

Covers the type-chart passthroughs, settings lifecycle (incl. the
ghost-save-cache regression from round 5), moves/PBS endpoints,
themes, and the process-introspection endpoints with stubbed backends.
"""
import asyncio
import time
from pathlib import Path
from typing import ClassVar

import pytest

import main


@pytest.fixture()
def plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SETTINGS_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")
    p = main.Plugin()
    # Plugin() does not run the decky _main() lifecycle in tests.
    p._initialized = True
    return p


# --- plugin info -------------------------------------------------------------

def test_get_plugin_info_shape(plugin):
    info = asyncio.run(plugin.get_plugin_info())
    assert info["initialized"] is True
    assert info["type_chart_loaded"] is True
    assert info["type_chart_types"] == 18
    assert "version" in info or "name" in info  # PLUGIN_INFO fields present


# --- type chart passthroughs ---------------------------------------------------

def test_type_chart_passthrough_uses_settings_gen(plugin):
    plugin._settings["type_chart_gen"] = 5
    out = asyncio.run(plugin.get_type_chart())
    assert out["generation"] == 5


def test_matchup_passthrough(plugin):
    res = asyncio.run(plugin.get_matchup("Ice", ["Grass", "Flying"]))
    assert res["multiplier"] == 4.0
    err = asyncio.run(plugin.get_matchup("Bogus", ["Water"]))
    assert "error" in err


def test_defense_offense_passthrough(plugin):
    d = asyncio.run(plugin.get_defense_summary(["Fire", "Flying"]))
    assert "Rock" in d["summary"]["quadruple"]
    o = asyncio.run(plugin.get_offense_summary("Electric"))
    assert "Ground" in o["summary"]["immune"]


# --- settings lifecycle ----------------------------------------------------------

def test_update_settings_coerces_patch(plugin):
    out = asyncio.run(plugin.update_settings({"scan_interval_seconds": "45"}))
    assert out["scan_interval_seconds"] == 45
    assert plugin._settings["scan_interval_seconds"] == 45


def test_update_settings_unknown_key_dropped(plugin):
    out = asyncio.run(plugin.update_settings({"nonsense_key": 1}))
    assert "nonsense_key" not in out


def test_update_settings_rejects_bad_types(plugin):
    with pytest.raises(TypeError):
        asyncio.run(plugin.update_settings({"save_path_override": 123}))
    with pytest.raises(TypeError):
        asyncio.run(plugin.update_settings({"touchmenu_position": {"x": 1}}))
    with pytest.raises(TypeError):
        asyncio.run(plugin.update_settings("not a dict"))


def test_update_settings_save_path_override_resets_cache(plugin):
    plugin._save_cache = {"party": []}
    plugin._save_cache_path = "/old.rxdata"
    plugin._cached_save_path = Path("/old.rxdata")
    asyncio.run(plugin.update_settings({"save_path_override": None}))
    assert plugin._save_cache is None
    assert plugin._save_cache_path is None
    assert plugin._cached_save_path is None


class _FakeWatcher:
    instances: ClassVar[list["_FakeWatcher"]] = []

    def __init__(self, path_provider, on_change, interval):
        self.interval = interval
        self.started = False
        self.stopped = False
        _FakeWatcher.instances.append(self)

    def start(self):
        self.started = True

    def stop(self):
        self.stopped = True


@pytest.fixture()
def fake_watcher(monkeypatch):
    _FakeWatcher.instances = []
    monkeypatch.setattr(main, "SaveFileWatcher", _FakeWatcher)
    return _FakeWatcher


def test_set_watcher_enabled_toggle(plugin, fake_watcher):
    out = asyncio.run(plugin.set_watcher_enabled(True))
    assert out["watcher_active"] is True
    assert plugin._watcher is not None and plugin._watcher.started
    out = asyncio.run(plugin.set_watcher_enabled(False))
    assert out["watcher_active"] is False
    assert plugin._watcher is None
    assert fake_watcher.instances[0].stopped


def test_update_settings_watcher_toggle_uses_fake(plugin, fake_watcher):
    asyncio.run(plugin.update_settings({"watcher_enabled": False}))
    assert plugin._watcher is None
    asyncio.run(plugin.update_settings({"watcher_enabled": True}))
    assert plugin._watcher is not None


# --- ghost-save-cache regression (B1) ---------------------------------------------

def test_resolve_active_save_cached_re_resolves_when_file_gone(
    plugin, tmp_path, monkeypatch
):
    ghost = tmp_path / "ghost.rxdata"
    ghost.write_bytes(b"\x04\x08")
    resolved: list[Path | None] = []

    def fake_find(override):
        resolved.append(override)
        # After the ghost vanishes, discovery points at a new save.
        return new_save if ghost_gone["v"] else ghost

    new_save = tmp_path / "new.rxdata"
    new_save.write_bytes(b"\x04\x08")
    ghost_gone = {"v": False}
    monkeypatch.setattr(main, "find_save_file", fake_find)

    first = plugin._resolve_active_save_cached()
    assert first == ghost
    # Cache hit: no second resolve.
    assert plugin._resolve_active_save_cached() == ghost
    assert len(resolved) == 1

    ghost.unlink()
    ghost_gone["v"] = True
    second = plugin._resolve_active_save_cached()
    assert second == new_save
    assert len(resolved) == 2
    # And the new path is now cached.
    assert plugin._resolve_active_save_cached() == new_save
    assert len(resolved) == 2


def test_resolve_active_save_cached_returns_none_when_nothing_found(
    plugin, tmp_path, monkeypatch
):
    monkeypatch.setattr(main, "find_save_file", lambda override: None)
    assert plugin._resolve_active_save_cached() is None
    assert plugin._resolve_active_save_cached() is None  # stays None, no crash


# --- moves / PBS -------------------------------------------------------------------

def test_get_move_info_and_lookup(plugin):
    info = asyncio.run(plugin.get_move_info("Tackle"))
    assert info is not None and info["source"] == "static"
    assert asyncio.run(plugin.get_move_info("Zzzqxvwy")) is None
    with pytest.raises(TypeError):
        asyncio.run(plugin.get_move_info(42))
    out = asyncio.run(plugin.lookup_moves(["Tackle", "Zzzqxvwy"]))
    assert out["Tackle"] is not None and out["Zzzqxvwy"] is None
    with pytest.raises(TypeError):
        asyncio.run(plugin.lookup_moves(["ok", 5]))


def test_load_pbs_moves_roundtrip(plugin, tmp_path):
    pbs = tmp_path / "moves.txt"
    pbs.write_text(
        "[FLAMETHROWER]\nName = Flamethrower\nType = FIRE\n"
        "Category = Special\nPower = 90\nAccuracy = 100\nPP = 15\n",
        encoding="utf-8",
    )
    out = asyncio.run(plugin.load_pbs_moves(str(pbs)))
    assert out["loaded"] is True and out["count"] == 1
    assert asyncio.run(plugin.get_move_info("Flamethrower"))["source"] == "pbs"
    cleared = asyncio.run(plugin.clear_pbs())
    assert cleared["database"]["pbs_count"] == 0
    # Flamethrower is in the shipped static DB: PBS overlay gone, static
    # entry restored (previously served from "pbs").
    assert asyncio.run(plugin.get_move_info("Flamethrower"))["source"] == "static"


def test_auto_load_pbs(plugin, tmp_path, monkeypatch):
    # No last_save_path and no steam roots: nothing found.
    out = asyncio.run(plugin.auto_load_pbs())
    assert out["loaded"] is False and out["source"] is None


# --- themes -------------------------------------------------------------------------

def test_get_themes_shape(plugin):
    out = asyncio.run(plugin.get_themes())
    assert out["active"]["id"] == "default"
    assert any(t["id"] == "default" for t in out["themes"])


def test_get_active_theme(plugin):
    theme = asyncio.run(plugin.get_active_theme())
    assert theme["id"] == "default"
    plugin._settings["theme"] = "does-not-exist"
    theme = asyncio.run(plugin.get_active_theme())
    # Unknown id falls back to the default theme instead of crashing.
    assert theme["id"] == "default"


# --- process introspection ------------------------------------------------------------

def test_find_process_by_save(plugin, monkeypatch):
    monkeypatch.setattr(
        main, "find_process_by_save_path",
        lambda p: {"pid": 4242, "name": "Game.exe", "exe": "C:/Game.exe",
                   "cmdline_str": "Game.exe --windowed"},
    )
    out = asyncio.run(plugin.find_process_by_save("C:/save.rxdata"))
    assert out == {"pid": 4242, "name": "Game.exe", "exe": "C:/Game.exe",
                   "cmdline": "Game.exe --windowed"}
    monkeypatch.setattr(main, "find_process_by_save_path", lambda p: None)
    assert asyncio.run(plugin.find_process_by_save("x")) is None


def test_get_process_memory_regions_validation(plugin, monkeypatch):
    monkeypatch.setattr(
        main, "get_process_memory_map",
        lambda pid: [{"start": "0x1000", "end": "0x2000", "perms": "rw-p",
                      "path": "[anon]"}],
    )
    assert len(asyncio.run(plugin.get_process_memory_regions(4242))) == 1
    for bad in (0, -1, "4242", 1.5, None):
        with pytest.raises(TypeError):
            asyncio.run(plugin.get_process_memory_regions(bad))


# --- find_save_path / using_override ------------------------------------------------

def test_find_save_path_reports_override_only_when_used(plugin, tmp_path, monkeypatch):
    """Regression (round 6): an unreadable override makes find_save_file
    fall back to scanning — the endpoint must not claim override usage."""
    scanned = tmp_path / "scanned" / "Game.rxdata"
    scanned.parent.mkdir()
    scanned.write_bytes(b"x")
    plugin._settings["save_path_override"] = str(tmp_path / "missing" / "Game.rxdata")
    monkeypatch.setattr(main, "find_save_file", lambda override: scanned)
    out = asyncio.run(plugin.find_save_path())
    assert out["path"] == str(scanned)
    assert out["using_override"] is False


def test_find_save_path_reports_override_when_it_wins(plugin, tmp_path, monkeypatch):
    override = tmp_path / "my" / "Game.rxdata"
    override.parent.mkdir()
    override.write_bytes(b"x")
    plugin._settings["save_path_override"] = str(override)
    monkeypatch.setattr(main, "find_save_file", lambda override: Path(override))
    out = asyncio.run(plugin.find_save_path())
    assert out["using_override"] is True


def test_find_save_path_without_override(plugin, tmp_path, monkeypatch):
    scanned = tmp_path / "Game.rxdata"
    scanned.write_bytes(b"x")
    monkeypatch.setattr(main, "find_save_file", lambda override: scanned)
    out = asyncio.run(plugin.find_save_path())
    assert out["using_override"] is False
    assert out["path"] == str(scanned)


# --- _on_watcher_change live-source demotion (round 8) ------------------------------

class _FakeParsed:
    def __init__(self) -> None:
        self.trainer_name = "Red"
        self.party = [1, 2, 3]

    def to_dict(self):
        return {"trainer_name": "Red", "party": []}


class _FakeStreamServer:
    def __init__(self, connected: bool, last_data_at: float) -> None:
        self._status = {
            "connected": connected,
            "last_data_at": last_data_at,
            "listening": True,
        }

    @property
    def status(self):
        return self._status


def _run_watcher_change(plugin, monkeypatch, save_path):
    monkeypatch.setattr(main, "parse_save_file", lambda p: _FakeParsed())
    monkeypatch.setattr(plugin, "_save_settings", lambda: None)
    plugin._on_watcher_change(save_path)


def test_watcher_change_keeps_stream_source_while_fresh(plugin, tmp_path, monkeypatch):
    """Regression (round 8): a disk autosave while the stream is actively
    sending must not demote the live source to disk — memory updates
    would then be allowed to overwrite fresher stream data."""
    save = tmp_path / "Game.rxdata"
    save.write_bytes(b"x")
    plugin._live_source = "stream"
    plugin._stream_server = _FakeStreamServer(True, time.time())
    _run_watcher_change(plugin, monkeypatch, save)
    assert plugin._live_source == "stream"


def test_watcher_change_demotes_stale_stream(plugin, tmp_path, monkeypatch):
    save = tmp_path / "Game.rxdata"
    save.write_bytes(b"x")
    plugin._live_source = "stream"
    plugin._stream_server = _FakeStreamServer(True, time.time() - 60.0)
    _run_watcher_change(plugin, monkeypatch, save)
    assert plugin._live_source == "disk"


def test_watcher_change_demotes_without_stream_server(plugin, tmp_path, monkeypatch):
    save = tmp_path / "Game.rxdata"
    save.write_bytes(b"x")
    plugin._live_source = "stream"
    plugin._stream_server = None
    _run_watcher_change(plugin, monkeypatch, save)
    assert plugin._live_source == "disk"


def test_watcher_change_demotes_disconnected_stream(plugin, tmp_path, monkeypatch):
    save = tmp_path / "Game.rxdata"
    save.write_bytes(b"x")
    plugin._live_source = "stream"
    plugin._stream_server = _FakeStreamServer(False, time.time())
    _run_watcher_change(plugin, monkeypatch, save)
    assert plugin._live_source == "disk"
