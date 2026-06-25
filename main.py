"""Pokémon Essentials Overlay — Decky Plugin Backend.

Phase 1: Plugin lifecycle, settings persistence, plugin info.
Phase 2: Type chart lookups (types, colors, multipliers, summaries).
Phase 3: Save-file path resolution + .rxdata parser (party status).
Phase 5: Live PBS file loading for move types, custom moves.
Phase 6: Live memory reading from the running game process.
"""

from __future__ import annotations

# Patch rubymarshal to handle TYPE_LINK forward references.
# Must be loaded BEFORE any other module in the plugin imports
# rubymarshal, otherwise the unpatched ``loads`` will be cached
# in sys.modules and the patch won't apply.
try:
    from rubymarshal import _forward_ref_patch  # noqa: F401
except ImportError:
    pass

import json
import os
import sys
from pathlib import Path
from typing import Any, Callable, Optional

import decky

# Fix for Decky Loader: add plugin directory to sys.path so local imports work
PLUGIN_DIR: Path = Path(__file__).resolve().parent
sys.path.append(str(PLUGIN_DIR))

from livewatch import (
    LiveMemoryReader,
    SaveFileWatcher,
    find_game_processes,
    find_process_by_save_path,
    get_process_memory_map,
    read_process_memory,
)
from moves import MovesDB
from pbsfinder import find_pbs_files
from saveparser import SaveData, SaveParseError, parse_save_file
from savepath import find_save_file, list_save_files
from themes import ThemeManager
from typechart import TypeChart

PLUGIN_DIR: Path = Path(__file__).resolve().parent
DATA_DIR: Path = PLUGIN_DIR / "data"
TYPE_CHART_PATH: Path = DATA_DIR / "type_chart.json"
SETTINGS_PATH: Path = DATA_DIR / "settings.json"
THEMES_PATH: Path = DATA_DIR / "themes.json"

DEFAULT_SETTINGS: dict[str, Any] = {
    "save_path_override": None,
    "auto_scan_enabled": True,
    "touchmenu_position": {"x": 80, "y": 20},
    "scan_interval_seconds": 30,
    "touchmenu_enabled": True,
    "last_save_path": None,
    "theme": "default",
    "compact_mode": True,
    "watcher_enabled": True,
    "live_memory_enabled": False,  # Phase 6: opt-in
}

PLUGIN_INFO: dict[str, str] = {
    "name": "Pokémon Essentials Overlay",
    "version": "0.1.0",
    "description": "In-game overlay for Pokémon Essentials fan games on Steam Deck",
}

log = decky.logger


class Plugin:
    """Decky plugin entry point.

    Lifecycle methods ``_main`` and ``_unload`` are called by the loader.
    All other ``async def`` methods are callable from the frontend
    via the ``@decky/api`` ``call`` helper.
    """

    def __init__(self) -> None:
        self._type_chart_engine: TypeChart = TypeChart(TYPE_CHART_PATH)
        self._moves_db: MovesDB = MovesDB()
        self._themes: ThemeManager = ThemeManager(THEMES_PATH)
        self._settings: dict[str, Any] = dict(DEFAULT_SETTINGS)
        self._initialized: bool = False
        self._save_cache: dict[str, Any] | None = None
        self._save_cache_path: str | None = None
        self._save_cache_at: float = 0.0
        self._watcher: Optional[SaveFileWatcher] = None
        self._watcher_callback_id: int = 0
        self._last_live_event: dict[str, Any] = {}
        # Phase 6: live memory reading
        self._memory_reader: Optional[LiveMemoryReader] = None
        self._memory_pid: Optional[int] = None
        self._live_source: str = "disk"  # "memory" | "disk"
        self._memory_failure_log: list[str] = []

    async def _main(self) -> None:
        """Called once when the plugin is loaded."""
        log.info("=== Pokémon Essentials Overlay starting ===")
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            self._load_settings()
            self._load_type_chart()
            self._try_auto_load_pbs()
            if self._settings.get("watcher_enabled", True):
                self._start_watcher()
            if self._settings.get("live_memory_enabled", False):
                self._start_memory_reader()
            self._initialized = True
            log.info(
                f"Plugin ready "
                f"(type_chart={'yes' if self._type_chart_engine.loaded else 'no'}, "
                f"moves_db={'yes' if self._moves_db.loaded else 'no'}, "
                f"settings_keys={len(self._settings)}, "
                f"live_memory={'on' if self._settings.get('live_memory_enabled') else 'off'})"
            )
        except Exception as exc:
            log.error(f"Failed to initialize plugin: {exc}", exc_info=True)
            self._initialized = False

    async def _unload(self) -> None:
        """Called once when the plugin is unloaded."""
        log.info("=== Pokémon Essentials Overlay unloading ===")
        if self._watcher is not None:
            self._watcher.stop()
            self._watcher = None
        if self._memory_reader is not None:
            self._memory_reader.stop()
            self._memory_reader = None
        self._settings = dict(DEFAULT_SETTINGS)
        self._save_cache = None
        self._save_cache_path = None
        self._save_cache_at = 0.0
        self._initialized = False

    def _load_settings(self) -> None:
        if SETTINGS_PATH.is_file():
            try:
                with SETTINGS_PATH.open("r", encoding="utf-8") as fh:
                    loaded = json.load(fh)
                if isinstance(loaded, dict):
                    self._settings.update(loaded)
            except (json.JSONDecodeError, OSError) as exc:
                log.warning(f"Could not read settings.json: {exc}")
        for key, default in DEFAULT_SETTINGS.items():
            self._settings.setdefault(key, default)

    def _save_settings(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp_path = SETTINGS_PATH.with_suffix(".json.tmp")
        try:
            with tmp_path.open("w", encoding="utf-8") as fh:
                json.dump(self._settings, fh, indent=2, ensure_ascii=False)
            os.replace(tmp_path, SETTINGS_PATH)
        except OSError as exc:
            log.error(f"Could not persist settings: {exc}", exc_info=True)
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

    def _load_type_chart(self) -> None:
        self._type_chart_engine.reload()
        if self._type_chart_engine.loaded:
            log.info(
                f"Loaded type chart: {len(self._type_chart_engine._types)} types, "
                f"generation {self._type_chart_engine.generation}"
            )
        else:
            log.warning(f"type_chart.json missing or malformed at {TYPE_CHART_PATH}")

    def _try_auto_load_pbs(self) -> None:
        """Best-effort PBS file auto-load on startup. Failures are non-fatal."""
        try:
            last_save = self._settings.get("last_save_path")
            loaded = self._moves_db.auto_load_pbs(save_path=last_save)
            if loaded:
                log.info(f"Auto-loaded PBS moves from: {loaded}")
            else:
                log.info("No PBS moves.txt auto-discovered at startup")
        except Exception as exc:
            log.warning(f"PBS auto-load failed: {exc}")

    async def get_plugin_info(self) -> dict[str, Any]:
        """Return plugin metadata and current state for the frontend."""
        return {
            **PLUGIN_INFO,
            "initialized": self._initialized,
            "type_chart_loaded": self._type_chart_engine.loaded,
            "type_chart_types": (
                len(self._type_chart_engine._types)
                if self._type_chart_engine.loaded
                else 0
            ),
        }

    async def get_type_chart(self) -> dict[str, Any]:
        """Return the full type chart (types, colors, multipliers)."""
        return self._type_chart_engine.get_type_chart()

    async def get_matchup(
        self, attacker: str, defender_types: list[str]
    ) -> dict[str, Any]:
        """Return the STAB-aware multiplier for attacker vs. defender_types."""
        return self._type_chart_engine.get_matchup(attacker, defender_types)

    async def get_defense_summary(
        self, defender_types: list[str]
    ) -> dict[str, Any]:
        """Return all attacking types bucketed by effectiveness vs. defender_types."""
        return self._type_chart_engine.get_defense_summary(defender_types)

    async def get_offense_summary(self, attacker: str) -> dict[str, Any]:
        """Return what this attacking type is good/bad/immune against."""
        return self._type_chart_engine.get_offense_summary(attacker)

    async def get_settings(self) -> dict[str, Any]:
        """Return the current settings dict."""
        return dict(self._settings)

    async def update_settings(self, patch: dict[str, Any]) -> dict[str, Any]:
        """Merge patch into settings and persist to disk."""
        if not isinstance(patch, dict):
            raise TypeError("patch must be a dict")
        if "save_path_override" in patch and patch["save_path_override"] is not None:
            if not isinstance(patch["save_path_override"], str):
                raise TypeError("save_path_override must be a string or null")
        if "touchmenu_position" in patch:
            pos = patch["touchmenu_position"]
            if not (
                isinstance(pos, dict)
                and "x" in pos
                and "y" in pos
                and isinstance(pos["x"], (int, float))
                and isinstance(pos["y"], (int, float))
            ):
                raise TypeError("touchmenu_position must be { x: number, y: number }")
        self._settings.update(patch)
        self._save_settings()
        if "save_path_override" in patch:
            self._save_cache = None
            self._save_cache_path = None
            self._last_live_event = {}
            self._stop_watcher()
            if self._settings.get("watcher_enabled", True):
                self._start_watcher()
        if "watcher_enabled" in patch:
            if patch["watcher_enabled"]:
                self._start_watcher()
            else:
                self._stop_watcher()
        if "live_memory_enabled" in patch:
            if patch["live_memory_enabled"]:
                self._start_memory_reader()
            else:
                self._stop_memory_reader()
        return dict(self._settings)

    async def find_save_path(self) -> dict[str, Any]:
        """Resolve the most likely save file path. Does not parse it."""
        override = self._settings.get("save_path_override")
        path = find_save_file(override if override else None)
        return {
            "path": str(path) if path else None,
            "using_override": bool(override) and path is not None,
        }

    async def list_save_files(self) -> list[dict[str, Any]]:
        """List all discoverable save files with metadata."""
        return list_save_files()

    async def get_save_data(self, force_reload: bool = False) -> dict[str, Any]:
        """Parse the active save file and return a normalized dict.

        Caches the result in memory. ``force_reload=True`` invalidates the cache
        and re-parses from disk.
        """
        import time as _time

        override = self._settings.get("save_path_override")
        path = find_save_file(override if override else None)
        if path is None:
            self._save_cache = None
            self._save_cache_path = None
            return {"error": "no_save_file_found", "path": None}

        path_str = str(path)
        if (
            not force_reload
            and self._save_cache is not None
            and self._save_cache_path == path_str
        ):
            try:
                if path.stat().st_mtime <= self._save_cache_at:
                    return self._save_cache
            except OSError:
                pass

        try:
            data: SaveData = parse_save_file(path)
        except SaveParseError as exc:
            log.warning(f"Save parse error: {exc}")
            return {
                "error": "parse_failed",
                "message": str(exc),
                "path": path_str,
            }
        except Exception as exc:
            log.error(f"Unexpected save parse error: {exc}", exc_info=True)
            return {
                "error": "parse_failed",
                "message": str(exc),
                "path": path_str,
            }

        out = data.to_dict()
        self._save_cache = out
        self._save_cache_path = path_str
        try:
            self._save_cache_at = path.stat().st_mtime
        except OSError:
            self._save_cache_at = _time.time()
        self._settings["last_save_path"] = path_str
        self._save_settings()
        if self._watcher is not None:
            self._watcher.notify_save_loaded(path)
        return out

    async def get_save_data_from_path(self, path: str) -> dict[str, Any]:
        """Parse a specific save file (ignores cache and override)."""
        if not isinstance(path, str) or not path:
            raise TypeError("path must be a non-empty string")
        try:
            data = parse_save_file(path)
        except SaveParseError as exc:
            return {"error": "parse_failed", "message": str(exc), "path": path}
        return data.to_dict()

    async def get_moves_database(self) -> dict[str, Any]:
        """Return the merged moves database (static + PBS)."""
        return self._moves_db.to_api()

    async def get_move_info(self, name: str) -> dict[str, Any] | None:
        """Look up a single move. Returns dict or None if unknown."""
        if not isinstance(name, str):
            raise TypeError("name must be a string")
        info = self._moves_db.get(name)
        return dict(info) if info else None

    async def lookup_moves(self, names: list[str]) -> dict[str, Any]:
        """Batch lookup. Returns ``{name: info_or_null}``."""
        if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
            raise TypeError("names must be a list of strings")
        out: dict[str, Any] = {}
        for n in names:
            info = self._moves_db.get(n)
            out[n] = dict(info) if info else None
        return out

    async def find_pbs_files(self, save_path: str | None = None) -> dict[str, str]:
        """Locate PBS files. Returns ``{file_type: absolute_path}`` for found files."""
        sp = Path(save_path) if save_path else None
        found = find_pbs_files(save_path=sp)
        return {k: str(v) for k, v in found.items()}

    async def load_pbs_moves(self, path: str) -> dict[str, Any]:
        """Load a PBS/moves.txt file. Reloads the moves DB with PBS data."""
        if not isinstance(path, str) or not path:
            raise TypeError("path must be a non-empty string")
        count = self._moves_db.load_pbs(path)
        return {
            "loaded": count > 0,
            "count": count,
            "source": path,
            "database": self._moves_db.to_api(),
        }

    async def auto_load_pbs(self) -> dict[str, Any]:
        """Re-attempt PBS auto-discovery. Returns the loaded path or None."""
        last_save = self._settings.get("last_save_path")
        sp = Path(last_save) if last_save else None
        loaded = self._moves_db.auto_load_pbs(save_path=sp)
        return {
            "loaded": loaded is not None,
            "source": str(loaded) if loaded else None,
            "database": self._moves_db.to_api(),
        }

    async def clear_pbs(self) -> dict[str, Any]:
        """Clear PBS overlay and revert to static moves database only."""
        self._moves_db.clear_pbs()
        return {"database": self._moves_db.to_api()}

    async def get_themes(self) -> dict[str, Any]:
        """Return all available themes and the currently active one."""
        active = self._settings.get("theme")
        return self._themes.to_api(active_id=active if isinstance(active, str) else None)

    async def get_active_theme(self) -> dict[str, Any]:
        """Return only the active theme."""
        active = self._settings.get("theme")
        return self._themes.get(active if isinstance(active, str) else None)

    def _start_watcher(self) -> None:
        if self._watcher is not None:
            return
        # Lower floor than before — 0.3s polling feels live without
        # burning CPU. Saves happen on every Pokemon Center visit,
        # battle end, and menu save, so 0.3s gives near-instant updates.
        interval = max(0.3, min(2.0, self._settings.get("scan_interval_seconds", 30) / 10))
        self._watcher = SaveFileWatcher(
            path_provider=lambda: self._resolve_active_save(),
            on_change=self._on_watcher_change,
            interval=interval,
        )
        self._watcher.start()

    def _stop_watcher(self) -> None:
        if self._watcher is not None:
            self._watcher.stop()
            self._watcher = None

    def _resolve_active_save(self) -> Optional[Path]:
        override = self._settings.get("save_path_override")
        found = find_save_file(override if override else None)
        return found

    def _on_watcher_change(self, path: Path) -> None:
        import time as _time

        if self._save_cache is not None and self._save_cache_path == str(path):
            try:
                if path.stat().st_mtime <= self._save_cache_at:
                    return
            except OSError:
                pass
        try:
            data = parse_save_file(path)
            self._save_cache = data.to_dict()
            self._save_cache_path = str(path)
            try:
                self._save_cache_at = path.stat().st_mtime
            except OSError:
                self._save_cache_at = _time.time()
            self._settings["last_save_path"] = str(path)
            self._save_settings()
            self._last_live_event = {
                "kind": "save_modified",
                "path": str(path),
                "at": _time.time(),
                "trainer": data.trainer_name,
            }
            log.info(
                f"Live save change: {data.trainer_name} "
                f"({len(data.party)} Pokemon)"
            )
        except SaveParseError as exc:
            log.warning(f"Live save parse failed: {exc}")

    # --- Phase 6: live memory reading ---------------------------------

    def _start_memory_reader(self) -> None:
        """Start scanning the running game process's heap for live saves.

        Falls back gracefully if no game is running: the disk watcher
        continues to provide data on save events.
        """
        if self._memory_reader is not None:
            return
        procs = find_game_processes()
        if not procs:
            log.info("Live memory reader: no game process found, "
                     "disk watcher remains active")
            return
        # Filter out our own helper processes (already done by
        # find_game_processes via EXCLUDE_PATH_HINTS) but pick the
        # newest non-plugin process first.
        game_proc = procs[0]
        pid = int(game_proc.get("pid") or 0)
        if pid <= 0:
            log.warning("Live memory reader: game process has no pid")
            return
        self._memory_pid = pid
        self._memory_reader = LiveMemoryReader(
            pid=pid,
            on_update=self._on_memory_update,
            on_failure=self._on_memory_failure,
            interval=1.0,
        )
        self._memory_reader.start()

    def _stop_memory_reader(self) -> None:
        if self._memory_reader is not None:
            self._memory_reader.stop()
            self._memory_reader = None
        self._memory_pid = None

    def _on_memory_update(self, payload: dict[str, Any]) -> None:
        """A live memory scan produced a fresh save. Update the cache
        if it's newer than whatever the disk watcher last provided.
        """
        import time as _time
        now = _time.time()
        # Monotonic guard: disk-watcher entries carry the file's
        # mtime, memory entries carry wall-clock. We compare against
        # the most recent update timestamp we accepted.
        if now <= self._save_cache_at:
            return
        self._save_cache = payload
        self._save_cache_path = f"<memory:{self._memory_pid}>"
        self._save_cache_at = now
        self._live_source = "memory"
        self._last_live_event = {
            "kind": "memory_update",
            "pid": self._memory_pid,
            "at": now,
            "trainer": payload.get("trainer_name"),
            "party_count": len(payload.get("party", [])),
        }
        log.debug(
            f"Live memory update: trainer={payload.get('trainer_name')} "
            f"party={len(payload.get('party', []))}"
        )

    def _on_memory_failure(self, reason: str) -> None:
        """Memory reader couldn't produce data. Stay quiet — the disk
        watcher keeps working as fallback. Only log the first few.
        """
        self._memory_failure_log.append(reason)
        # Keep only the last 5 reasons to avoid unbounded growth.
        self._memory_failure_log = self._memory_failure_log[-5:]
        # If the game process disappeared, stop the reader. The disk
        # watcher will still pick up the last save.
        if reason == "process_gone" and self._memory_reader is not None:
            log.info("Live memory reader: game process gone, stopping")
            self._stop_memory_reader()
            # Try to restart in case the game was just restarted.
            self._restart_memory_reader_if_game_present()
        else:
            log.debug(f"Live memory reader: {reason}")

    def _restart_memory_reader_if_game_present(self) -> None:
        import threading
        def _check_and_start():
            import time as _t
            _t.sleep(2.0)
            if self._memory_reader is None and self._settings.get(
                "live_memory_enabled", False
            ):
                procs = find_game_processes()
                if procs:
                    self._start_memory_reader()
        threading.Thread(target=_check_and_start, daemon=True).start()

    def _refresh_memory_reader_pid(self) -> None:
        """Re-detect the game PID (handles restart) and update the reader."""
        if not self._settings.get("live_memory_enabled", False):
            return
        if self._memory_reader is None:
            self._start_memory_reader()
            return
        procs = find_game_processes()
        if not procs:
            return
        new_pid = int(procs[0].get("pid") or 0)
        if new_pid > 0 and new_pid != self._memory_pid:
            log.info(
                f"Live memory reader: PID changed "
                f"{self._memory_pid} → {new_pid}"
            )
            self._memory_reader.update_pid(new_pid)
            self._memory_pid = new_pid

    async def get_live_state(self) -> dict[str, Any]:
        """Return current game-process + watcher state.

        The frontend uses this to show "Game running" indicators and
        to surface the most recent live save change. Falls back to
        the most recent ``get_save_data`` result if no live event yet.
        """
        processes = find_game_processes()
        active_proc: Optional[dict[str, object]] = None
        if processes:
            active_proc = processes[0]
        watcher_active = self._watcher is not None
        memory_active = self._memory_reader is not None
        return {
            "game_running": bool(processes),
            "processes": [
                {
                    "pid": p.get("pid"),
                    "name": p.get("name"),
                    "cmdline": p.get("cmdline_str", ""),
                }
                for p in processes[:5]
            ],
            "active_process": active_proc,
            "watcher_active": watcher_active,
            "live_source": self._live_source,
            "memory_reader_active": memory_active,
            "memory_pid": self._memory_pid,
            "memory_failure_log": list(self._memory_failure_log),
            "last_live_event": self._last_live_event,
            "last_save_data": self._save_cache,
            "last_save_path": self._save_cache_path,
        }

    async def get_live_save_data(self) -> dict[str, Any] | None:
        """Return the most recent save data, preferring the watcher's
        in-memory cache so the user sees live updates without a polling
        cycle."""
        return self._save_cache

    async def set_watcher_enabled(self, enabled: bool) -> dict[str, Any]:
        """Enable or disable the inotify-style save watcher."""
        if enabled:
            self._start_watcher()
        else:
            self._stop_watcher()
        return {"watcher_active": self._watcher is not None}

    async def find_process_by_save(self, save_path: str) -> dict[str, Any] | None:
        """Find the process that has ``save_path`` open."""
        info = find_process_by_save_path(save_path)
        if info is None:
            return None
        return {
            "pid": info.get("pid"),
            "name": info.get("name"),
            "exe": info.get("exe"),
            "cmdline": info.get("cmdline_str", ""),
        }

    async def get_process_memory_regions(self, pid: int) -> list[dict[str, str]]:
        """Return the memory map for a process (best effort)."""
        if not isinstance(pid, int) or pid <= 0:
            raise TypeError("pid must be a positive integer")
        return get_process_memory_map(pid)
