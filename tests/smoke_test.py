#!/usr/bin/env python3
"""
Smoke test for the deckyplugin backend.

Single-use verification script — confirms all critical fixes work after
the development cycle. Run once with::

    python3 tests/smoke_test.py

Exits 0 on success, non-zero on any failure. Not a unit-test suite — just
end-to-end smoke checks against the live codebase.

Requires:
    pip install rubymarshal psutil
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import types
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SETTINGS = REPO / "data" / "settings.json"

passed = 0
failed = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    tag = "PASS" if ok else "FAIL"
    suffix = f" -- {detail}" if detail else ""
    print(f"  [{tag}] {name}{suffix}")
    if ok:
        passed += 1
    else:
        failed += 1


def header(text: str) -> None:
    print()
    print(f"[{text}]")


# --- Mock decky runtime before importing the plugin ---
_decky = types.ModuleType("decky")


class _Logger:
    def info(self, *a, **kw): pass
    def warning(self, *a, **kw): pass
    def error(self, *a, **kw): pass
    def debug(self, *a, **kw): pass


_decky.logger = _Logger()
sys.modules["decky"] = _decky

# Mock decky_plugin (Decky Loader injects this at runtime; not present in CI).
_decky_plugin = types.ModuleType("decky_plugin")
_decky_plugin.DECKY_PLUGIN_SETTINGS_DIR = str(REPO / "data")
_decky_plugin.DECKY_PLUGIN_RUNTIME_DIR = str(REPO / "data")
_decky_plugin.DECKY_PLUGIN_VERSION = "0.1.0-test"
# Some modules (e.g. auto_installer) access decky_plugin.logger at
# module top-level. Reuse the _Logger class defined above.
_decky_plugin.logger = _Logger()
sys.modules["decky_plugin"] = _decky_plugin

# Add repo root (for `import main` — that's the real plugin entry;
# pokemon-overlay-plugin/main.py is an outdated duplicate) and py_modules/
# for direct submodule imports.
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "py_modules"))


# Clean any leftover settings.json from earlier runs.
if SETTINGS.exists():
    SETTINGS.unlink()


# ---------------------------------------------------------------------------
# Fix #C1: live_memory_enabled default off (avoids CPU cost for dead feature)
# ---------------------------------------------------------------------------
header("C1: live_memory_enabled default False")
import main  # noqa: E402

p = main.Plugin()
asyncio.run(p._main())
check(
    "live_memory_enabled default is False",
    asyncio.run(p.get_settings())["live_memory_enabled"] is False,
)


# ---------------------------------------------------------------------------
# Fix #M2: settings.json schema coercion (works on _load_settings and
# update_settings alike — see also update_settings checks below).
# ---------------------------------------------------------------------------
header("M2: settings.json coercion")
SETTINGS.parent.mkdir(parents=True, exist_ok=True)
SETTINGS.write_text(
    json.dumps(
        {
            "scan_interval_seconds": "30",
            "watcher_enabled": "true",
            "touchmenu_position": {"x": "100", "y": 50},
            "compact_mode": 1,
            "live_memory_enabled": "false",
            "unknown_key": "drop me",
        }
    )
)
p2 = main.Plugin()
asyncio.run(p2._main())
s = asyncio.run(p2.get_settings())
check("scan_interval_seconds str->int 30", isinstance(s["scan_interval_seconds"], int) and s["scan_interval_seconds"] == 30)
check("watcher_enabled str 'true'->True", s["watcher_enabled"] is True)
check("touchmenu_position.x str->int", isinstance(s["touchmenu_position"]["x"], int) and s["touchmenu_position"]["x"] == 100)
check("compact_mode int 1->True", s["compact_mode"] is True)
check("live_memory_enabled str 'false'->False", s["live_memory_enabled"] is False)
check("unknown_key dropped", "unknown_key" not in s)
SETTINGS.write_text(json.dumps({"scan_interval_seconds": 99999}))
p3 = main.Plugin()
asyncio.run(p3._main())
check(
    "scan_interval_seconds clamped 99999->600",
    asyncio.run(p3.get_settings())["scan_interval_seconds"] == 600,
)
SETTINGS.unlink()


# ---------------------------------------------------------------------------
# Fix #M2b: same coercion through update_settings (live patches)
# ---------------------------------------------------------------------------
header("M2b: update_settings() coercion (live patches)")
p4 = main.Plugin()
asyncio.run(p4._main())
out = asyncio.run(p4.update_settings({"scan_interval_seconds": "45"}))
check("str '45' -> int 45", isinstance(out["scan_interval_seconds"], int) and out["scan_interval_seconds"] == 45)
out = asyncio.run(p4.update_settings({"watcher_enabled": 1}))
check("int 1 -> True watcher_enabled", out["watcher_enabled"] is True)
out = asyncio.run(p4.update_settings({"watcher_enabled": 0}))
check("int 0 -> False watcher_enabled", out["watcher_enabled"] is False)
out = asyncio.run(p4.update_settings({"compact_mode": "yes"}))
check("str 'yes' -> True compact_mode", out["compact_mode"] is True)
out = asyncio.run(p4.update_settings({"unknown_garbage": "x"}))
check("unknown_garbage dropped", "unknown_garbage" not in out)
on_disk = json.loads(SETTINGS.read_text())
check(
    "settings.json on disk has int scan_interval",
    isinstance(on_disk.get("scan_interval_seconds"), int),
)
SETTINGS.unlink()


# ---------------------------------------------------------------------------
# Fix #C3: EV feature detection in v18+ saves (was hidden when ev_hp=0)
# ---------------------------------------------------------------------------
header("C3: EV feature detection")
import saveparser  # noqa: E402

sd_v18 = saveparser.SaveData(
    version="v18+",
    essentials_version=None,
    trainer_name="ASH",
    party=[
        saveparser.PokemonSummary(
            species="PIKACHU",
            nickname=None,
            level=5,
            hp=20,
            max_hp=20,
            status=0,
            status_name="OK",
            type1="Electric",
            type2=None,
            moves=["THUNDERSHOCK"],
            ability=None,
            item=None,
            gender=0,
            gender_name="M",
            shiny=False,
            nature="HARDY",
            attack=None, defense=None, spatk=None, spdef=None, speed=None,
            iv_hp=31, iv_attack=31, iv_defense=31, iv_spatk=31, iv_spdef=31, iv_speed=31,
            ev_hp=0, ev_attack=0, ev_defense=0, ev_spatk=0, ev_spdef=0, ev_speed=0,
            happiness=70,
        )
    ],
    money=0, badges=0, location_name="PALLET",
    map_id=1, x=0, y=0, play_time_seconds=0, parsed_at=0.0, source_path="<test>",
)
f = sd_v18._compute_features()
check("v18+ ev_hp=0 -> has_evs=True (was bug)", f["evs"] is True)
check("v18+ happiness=70 -> has_happiness=True", f["happiness"] is True)

sd_v17 = saveparser.SaveData(
    version="v17+",
    essentials_version=None,
    trainer_name="ASH",
    party=[
        saveparser.PokemonSummary(
            species="PIKACHU", nickname=None, level=5, hp=20, max_hp=20,
            status=0, status_name="OK", type1="Electric", type2=None,
            moves=["THUNDERSHOCK"], ability=None, item=None, gender=0, gender_name="M",
            shiny=False, nature="HARDY",
            attack=None, defense=None, spatk=None, spdef=None, speed=None,
            iv_hp=31, iv_attack=31, iv_defense=31, iv_spatk=31, iv_spdef=31, iv_speed=31,
            ev_hp=None, ev_attack=None, ev_defense=None, ev_spatk=None, ev_spdef=None, ev_speed=None,
            happiness=None,
        )
    ],
    money=0, badges=0, location_name="", map_id=None, x=None, y=None,
    play_time_seconds=0, parsed_at=0.0, source_path="<test>",
)
f = sd_v17._compute_features()
check("v17 ev_hp=None -> has_evs=False", f["evs"] is False)


# ---------------------------------------------------------------------------
# Fix #M3: plugin self-match excluded from savepath
# ---------------------------------------------------------------------------
header("M3: plugin self-match excluded")
import savepath  # noqa: E402

check("_process_excluded defined", hasattr(savepath, "_process_excluded"))


class _FakeProc:
    """Ducktyped stand-in for psutil.Process — _process_excluded only calls .cmdline()."""
    def __init__(self, cmdline): self._cmdline = cmdline
    def cmdline(self): return self._cmdline


plugin_proc = _FakeProc(["python3", "main.py", "/home/deck/homebrew/plugins/sd-poke-stat-tracker/main.py"])
check("matches plugin cmdline", savepath._process_excluded(plugin_proc))  # type: ignore[arg-type]
game_proc = _FakeProc(["wine", "Game.exe"])
check("does NOT match game exe", not savepath._process_excluded(game_proc))  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Fix #M4: install_game_mod.py generic game-dir detection
# ---------------------------------------------------------------------------
header("M4: generic game-dir detection")
fake_home = tempfile.mkdtemp(prefix="smoke-test-home-")
try:
    fake_game = Path(fake_home) / "Downloads" / "Pokemon Test 1.0"
    fake_game.mkdir(parents=True)
    (fake_game / "Game.exe").write_text("fake")
    (fake_game / "Plugins").mkdir()
    env = os.environ.copy()
    env["HOME"] = fake_home

    proc = subprocess.run(
        [
            "python3",
            str(REPO / "scripts" / "install_game_mod.py"),
            "--game-dir",
            str(fake_game),
        ],
        capture_output=True, text=True, env=env,
    )
    check("--game-dir install exit 0", proc.returncode == 0, proc.stderr.strip()[:120])
    check(
        "stream.rb copied (explicit path)",
        (fake_game / "Plugins" / "PokeStatStream" / "stream.rb").exists(),
    )

    shutil.rmtree(fake_game / "Plugins" / "PokeStatStream")
    proc = subprocess.run(
        ["python3", str(REPO / "scripts" / "install_game_mod.py")],
        capture_output=True, text=True, env=env,
    )
    check(
        "rglob finds game dir without --game-dir",
        proc.returncode == 0 and "Installed" in proc.stdout,
    )
    check(
        "stream.rb copied (rglob fallback)",
        (fake_game / "Plugins" / "PokeStatStream" / "stream.rb").exists(),
    )
finally:
    shutil.rmtree(fake_home, ignore_errors=True)


# ---------------------------------------------------------------------------
# Fix #M5: stream.rb putrsor typo fixed, log_error helper added
# ---------------------------------------------------------------------------
header("M5: stream.rb typo fixed")
stream_rb = (REPO / "game-mod" / "stream.rb").read_text()
check("no putrsor typo", "putrsor" not in stream_rb)
check("has log_error method", "log_error" in stream_rb)
try:
    proc = subprocess.run(
        ["ruby", "-c", str(REPO / "game-mod" / "stream.rb")],
        capture_output=True, text=True,
    )
    check(
        "ruby -c syntax OK",
        proc.returncode == 0 and "Syntax OK" in proc.stdout,
        proc.stdout.strip()[:80],
    )
except FileNotFoundError:
    print("  [SKIP] ruby not installed (skipping syntax check)")


# ---------------------------------------------------------------------------
# Fix #C2: store.ts adaptive polling (frontend)
# ---------------------------------------------------------------------------
header("C2: store.ts adaptive polling")
store_ts = (REPO / "src" / "store.ts").read_text()
check(
    "old fixed-1500ms setInterval removed",
    "setInterval(() => {\n    refreshSave(false);\n    refreshLiveState();\n  }, 1500);"
    not in store_ts,
)
check("has fastMs/slowMs constants", "fastMs" in store_ts and "slowMs" in store_ts)
check("has consecutiveIdle adaptive logic", "consecutiveIdle" in store_ts)


# ---------------------------------------------------------------------------
# Fix #M1: SettingsView themes fetched once (not on every theme change)
# ---------------------------------------------------------------------------
header("M1: SettingsView themes once-only")
sv = (REPO / "src" / "views" / "SettingsView.tsx").read_text()
check("old [theme?.id] dep removed", "}, [theme?.id]);" not in sv)
check("themes fetch guarded by length check (themes already loaded -> skip)", "if (themes.length > 0) return;" in sv)


# ---------------------------------------------------------------------------
# Build sanity (frontend bundle, type check)
# ---------------------------------------------------------------------------
header("build: rollup + tsc")
try:
    proc = subprocess.run(
        ["./node_modules/.bin/rollup", "-c"],
        cwd=str(REPO), capture_output=True, text=True, timeout=60,
    )
    check("rollup exits 0", proc.returncode == 0, proc.stderr.strip()[:200] if proc.returncode != 0 else "")
except FileNotFoundError:
    print("  [SKIP] rollup not installed")
try:
    proc = subprocess.run(
        ["./node_modules/.bin/tsc", "--noEmit", "-p", "."],
        cwd=str(REPO), capture_output=True, text=True, timeout=60,
    )
    check(
        "tsc no errors",
        proc.returncode == 0,
        (proc.stderr + proc.stdout).strip()[:300] if proc.returncode != 0 else "",
    )
except FileNotFoundError:
    print("  [SKIP] tsc not installed")


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
asyncio.run(p._unload())
asyncio.run(p2._unload())
asyncio.run(p3._unload())
asyncio.run(p4._unload())

print()
print("=" * 70)
print(f"  RESULT: {passed} pass, {failed} fail")
print("=" * 70)

if __name__ == "__main__":
    sys.exit(0 if failed == 0 else 1)