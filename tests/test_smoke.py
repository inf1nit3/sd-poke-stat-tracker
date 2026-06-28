"""
pytest-discoverable wrapper around tests/smoke_test.py.

Re-exposes the smoke checks as pytest test cases so `pytest tests/`
discovers them. The canonical command for "run all tests" is now::

    pytest tests/

which also catches the legacy `tests/smoke_test.py` standalone script
(via the testpaths config in pyproject.toml).

This module is intentionally thin — it imports smoke_test.py and
calls its `check()` function via reflection-free closure.
"""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent


def _setup_decky_mock():
    """Ensure `decky` and `decky_plugin` modules are importable without Decky Loader."""
    import types
    if "decky" not in sys.modules:
        m = types.ModuleType("decky")

        class _L:
            def info(self, *a, **kw): pass
            def warning(self, *a, **kw): pass
            def error(self, *a, **kw): pass
            def debug(self, *a, **kw): pass

        m.logger = _L()
        sys.modules["decky"] = m

    if "decky_plugin" not in sys.modules:
        dp = types.ModuleType("decky_plugin")
        dp.DECKY_PLUGIN_SETTINGS_DIR = str(REPO / "data")
        dp.DECKY_PLUGIN_RUNTIME_DIR = str(REPO / "data")
        dp.DECKY_PLUGIN_VERSION = "0.1.0-test"
        sys.modules["decky_plugin"] = dp

    # Add repo root (for `import main` — that's the real plugin entry;
# pokemon-overlay-plugin/main.py is an outdated duplicate) and py_modules/
# for direct submodule imports.
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "py_modules"))


_setup_decky_mock()


@pytest.fixture(scope="module")
def plugin():
    """Single Plugin instance shared across backend tests."""
    import main  # noqa: E402
    sf = REPO / "data" / "settings.json"
    if sf.exists():
        sf.unlink()
    p = main.Plugin()
    asyncio.run(p._main())
    yield p
    asyncio.run(p._unload())
    if sf.exists():
        sf.unlink()


# ---------------------------------------------------------------------------
# C1: live_memory_enabled default off
# ---------------------------------------------------------------------------
def test_C1_live_memory_enabled_default_off(plugin):
    settings = asyncio.run(plugin.get_settings())
    assert settings["live_memory_enabled"] is False


# ---------------------------------------------------------------------------
# M2: settings.json schema coercion on _load_settings
# ---------------------------------------------------------------------------
def test_M2a_str_coerced_to_int(plugin):
    """scan_interval_seconds='30' -> int 30."""
    sf = REPO / "data" / "settings.json"
    sf.parent.mkdir(parents=True, exist_ok=True)
    sf.write_text(json.dumps({"scan_interval_seconds": "30"}))
    settings = asyncio.run(plugin.get_settings())
    assert isinstance(settings["scan_interval_seconds"], int)
    assert settings["scan_interval_seconds"] == 30


def test_M2b_unknown_key_dropped(plugin):
    """Unknown keys must not pollute self._settings."""
    sf = REPO / "data" / "settings.json"
    sf.write_text(json.dumps({"unknown_garbage": "x"}))
    settings = asyncio.run(plugin.get_settings())
    assert "unknown_garbage" not in settings


def test_M2c_range_clamp():
    """scan_interval_seconds=99999 -> clamped to 600 (on fresh Plugin._main)."""
    import main
    sf = REPO / "data" / "settings.json"
    sf.parent.mkdir(parents=True, exist_ok=True)
    sf.write_text(json.dumps({"scan_interval_seconds": 99999}))
    try:
        p = main.Plugin()
        asyncio.run(p._main())
        settings = asyncio.run(p.get_settings())
        assert settings["scan_interval_seconds"] == 600
        asyncio.run(p._unload())
    finally:
        if sf.exists():
            sf.unlink()


# ---------------------------------------------------------------------------
# M2b: update_settings coercion (live patches from frontend)
# ---------------------------------------------------------------------------
def test_M2b_update_coerces_str_to_int(plugin):
    out = asyncio.run(plugin.update_settings({"scan_interval_seconds": "45"}))
    assert isinstance(out["scan_interval_seconds"], int)
    assert out["scan_interval_seconds"] == 45


def test_M2b_update_coerces_int_to_bool(plugin):
    out = asyncio.run(plugin.update_settings({"watcher_enabled": 1}))
    assert out["watcher_enabled"] is True
    out = asyncio.run(plugin.update_settings({"watcher_enabled": 0}))
    assert out["watcher_enabled"] is False


# ---------------------------------------------------------------------------
# C3: EV feature detection in v18+ saves
# ---------------------------------------------------------------------------
def test_C3_v18_ev_hp_zero_still_counts_as_evs():
    import saveparser
    sd = saveparser.SaveData(
        version="v18+", essentials_version=None, trainer_name="ASH",
        party=[saveparser.PokemonSummary(
            species="PIKACHU", nickname=None, level=5, hp=20, max_hp=20,
            status=0, status_name="OK", type1="Electric", type2=None,
            moves=["THUNDERSHOCK"], ability=None, item=None, gender=0, gender_name="M",
            shiny=False, nature="HARDY",
            attack=None, defense=None, spatk=None, spdef=None, speed=None,
            iv_hp=31, iv_attack=31, iv_defense=31, iv_spatk=31, iv_spdef=31, iv_speed=31,
            ev_hp=0, ev_attack=0, ev_defense=0, ev_spatk=0, ev_spdef=0, ev_speed=0,
            happiness=70,
        )],
        money=0, badges=0, location_name="", map_id=None, x=None, y=None,
        play_time_seconds=0, parsed_at=0.0, source_path="<test>",
    )
    f = sd._compute_features()
    assert f["evs"] is True
    assert f["happiness"] is True


def test_C3_v17_missing_evs_returns_false():
    import saveparser
    sd = saveparser.SaveData(
        version="v17+", essentials_version=None, trainer_name="ASH",
        party=[saveparser.PokemonSummary(
            species="PIKACHU", nickname=None, level=5, hp=20, max_hp=20,
            status=0, status_name="OK", type1="Electric", type2=None,
            moves=["THUNDERSHOCK"], ability=None, item=None, gender=0, gender_name="M",
            shiny=False, nature="HARDY",
            attack=None, defense=None, spatk=None, spdef=None, speed=None,
            iv_hp=31, iv_attack=31, iv_defense=31, iv_spatk=31, iv_spdef=31, iv_speed=31,
            ev_hp=None, ev_attack=None, ev_defense=None, ev_spatk=None, ev_spdef=None, ev_speed=None,
            happiness=None,
        )],
        money=0, badges=0, location_name="", map_id=None, x=None, y=None,
        play_time_seconds=0, parsed_at=0.0, source_path="<test>",
    )
    f = sd._compute_features()
    assert f["evs"] is False


# ---------------------------------------------------------------------------
# M3: plugin self-match excluded from savepath
# ---------------------------------------------------------------------------
def test_M3_process_excluded_matches_plugin_path():
    import savepath

    class _FakeProc:
        def __init__(self, cmdline): self._cmdline = cmdline
        def cmdline(self): return self._cmdline

    plugin_proc = _FakeProc(
        ["python3", "main.py", "/home/deck/homebrew/plugins/sd-poke-stat-tracker/main.py"]
    )
    game_proc = _FakeProc(["wine", "Game.exe"])
    assert savepath._process_excluded(plugin_proc) is True  # type: ignore[arg-type]
    assert savepath._process_excluded(game_proc) is False  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# M4: install_game_mod generic game-dir detection
# ---------------------------------------------------------------------------
@pytest.mark.skipif(
    not shutil.which("ruby"),
    reason="ruby not installed (skipping install_game_mod smoke check)",
)
def test_M4_generic_rglob_finds_game():
    fake_home = tempfile.mkdtemp(prefix="pytest-home-")
    try:
        fake_game = Path(fake_home) / "Downloads" / "Pokemon Test 1.0"
        fake_game.mkdir(parents=True)
        (fake_game / "Game.exe").write_text("fake")
        (fake_game / "Plugins").mkdir()
        env = os.environ.copy()
        env["HOME"] = fake_home

        # explicit --game-dir path
        proc = subprocess.run(
            ["python3", str(REPO / "scripts" / "install_game_mod.py"), "--game-dir", str(fake_game)],
            capture_output=True, text=True, env=env,
        )
        assert proc.returncode == 0, proc.stderr
        assert (fake_game / "Plugins" / "PokeStatStream" / "stream.rb").exists()

        # rglob fallback
        shutil.rmtree(fake_game / "Plugins" / "PokeStatStream")
        proc = subprocess.run(
            ["python3", str(REPO / "scripts" / "install_game_mod.py")],
            capture_output=True, text=True, env=env,
        )
        assert proc.returncode == 0, proc.stderr
        assert "Installed" in proc.stdout
        assert (fake_game / "Plugins" / "PokeStatStream" / "stream.rb").exists()
    finally:
        shutil.rmtree(fake_home, ignore_errors=True)


# ---------------------------------------------------------------------------
# M5: stream.rb typo fixed, ruby syntax OK
# ---------------------------------------------------------------------------
def test_M5_stream_rb_no_putrsor():
    src = (REPO / "game-mod" / "stream.rb").read_text()
    assert "putrsor" not in src
    assert "log_error" in src


@pytest.mark.skipif(not shutil.which("ruby"), reason="ruby not installed")
def test_M5_ruby_syntax_ok():
    proc = subprocess.run(
        ["ruby", "-c", str(REPO / "game-mod" / "stream.rb")],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0
    assert "Syntax OK" in proc.stdout


# ---------------------------------------------------------------------------
# C2: store.ts adaptive polling
# ---------------------------------------------------------------------------
def test_C2_store_ts_adaptive_polling():
    src = (REPO / "src" / "store.ts").read_text()
    assert "setInterval(() => {\n    refreshSave(false);\n    refreshLiveState();\n  }, 1500);" not in src
    assert "fastMs" in src and "slowMs" in src
    assert "consecutiveIdle" in src


# ---------------------------------------------------------------------------
# M1: SettingsView themes fetched once
# ---------------------------------------------------------------------------
def test_M1_settingsview_themes_once_only():
    src = (REPO / "src" / "views" / "SettingsView.tsx").read_text()
    assert "}, [theme?.id]);" not in src
    # Themes are fetched once on mount (guarded by themes.length > 0 check).
    assert "themes.length > 0" in src or "themesLoaded" in src


# ---------------------------------------------------------------------------
# Build sanity
# ---------------------------------------------------------------------------
@pytest.mark.skipif(not (REPO / "node_modules" / ".bin" / "rollup").exists(), reason="rollup not installed")
def test_build_rollup_exits_zero():
    proc = subprocess.run(
        [str(REPO / "node_modules" / ".bin" / "rollup"), "-c"],
        cwd=str(REPO), capture_output=True, text=True, timeout=60,
    )
    assert proc.returncode == 0, proc.stderr


@pytest.mark.skipif(not (REPO / "node_modules" / ".bin" / "tsc").exists(), reason="tsc not installed")
def test_build_tsc_no_new_errors():
    proc = subprocess.run(
        [str(REPO / "node_modules" / ".bin" / "tsc"), "--noEmit", "-p", "."],
        cwd=str(REPO), capture_output=True, text=True, timeout=60,
    )
    # Surface ALL tsc errors — no skip filter. If this fails, fix the underlying
    # code (don't filter the error away).
    assert proc.returncode == 0, (
        f"tsc returned {proc.returncode}\nstderr:\n{proc.stderr}\nstdout:\n{proc.stdout}"
    )