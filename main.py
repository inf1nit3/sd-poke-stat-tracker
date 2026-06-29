"""Pokémon Essentials Overlay — Decky Plugin Backend.

Phase 1: Plugin lifecycle, settings persistence, plugin info.
Phase 2: Type chart lookups (types, colors, multipliers, summaries).
Phase 3: Save-file path resolution + .rxdata parser (party status).
Phase 5: Live PBS file loading for move types, custom moves.
Phase 6: Live memory reading from the running game process.
"""

from __future__ import annotations

import faulthandler
import json
import os
import signal
import sys
import threading
from pathlib import Path
from typing import Any, Callable, Optional

import decky

faulthandler.enable()
faulthandler.register(signal.SIGUSR1, file=open("/tmp/plugin_traceback.log", "w", buffering=1))

# Fix for Decky Loader: add plugin directory to sys.path so local imports
# work. Use INSERT (not append) so the plugin's modules shadow any older
# copies of livewatch/savepath/steampaths that may live in
# site-packages from a previous install of this plugin.
#
# IMPORTANT: This MUST run BEFORE the _marshal_compat import below, because
# _marshal_compat.py lives in py_modules/ and a bare `import` would fail
# with ImportError (silently swallowed) if py_modules isn't on sys.path yet.
PLUGIN_DIR: Path = Path(__file__).resolve().parent
sys.path.insert(0, str(PLUGIN_DIR / "py_modules"))

# Patch rubymarshal to handle TYPE_LINK forward references in Essentials .rxdata
# files. Must be loaded BEFORE any other module in the plugin imports
# rubymarshal, otherwise the unpatched ``loads`` will be cached in
# sys.modules and the patch won't apply.
#
# Why this matters: Vanguard and other fan-game forks use circular references
# (e.g. $Trainer.@party[i].@trainer -> $Trainer). The upstream rubymarshal
# reader raises ValueError when a TYPE_LINK points at an object whose slot
# is still None during unmarshalling. Our _marshal_compat module replaces
# the upstream ``loads`` with one that returns a ForwardRef proxy for
# unresolved links, then walks the tree post-parse to resolve them all.
try:
    import _marshal_compat  # noqa: F401  # applies the monkey-patch on import
except ImportError:
    # _marshal_compat is shipped alongside this module; if it's missing,
    # save-parser will fail with "invalid link destination" on any save
    # with circular references. We continue anyway because some synthetic
    # or older saves might still parse without the patch.
    pass

from livewatch import (
    LiveMemoryReader,
    LiveStreamServer,
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

import decky_plugin

DATA_DIR: Path = PLUGIN_DIR / "data"
TYPE_CHART_PATH: Path = DATA_DIR / "type_chart.json"
THEMES_PATH: Path = DATA_DIR / "themes.json"

# Use Decky Loader's dedicated settings directory for persistence
try:
    SETTINGS_DIR = Path(decky_plugin.DECKY_PLUGIN_SETTINGS_DIR)
except AttributeError:
    SETTINGS_DIR = Path(os.environ.get("DECKY_PLUGIN_SETTINGS_DIR", str(DATA_DIR)))

SETTINGS_PATH: Path = SETTINGS_DIR / "settings.json"

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
    # Live-memory reading is currently experimental (see livewatch.py
    # module docstring) — it scans /proc/<pid>/mem for Marshal headers
    # every ~3s but cannot find valid blobs in a running RPG Maker XP /
    # Pokémon Essentials session. Default OFF so users don't pay the CPU
    # cost without opt-in awareness.
    "live_memory_enabled": False,  # Phase 6: opt-in
}

# Type guards for settings.json loaded from disk. Without this a manually
# edited or older settings.json (e.g. with "30" instead of 30) can crash
# downstream code that does e.g. scan_interval_seconds / 10.
def _coerce_settings(raw: dict[str, Any]) -> dict[str, Any]:
    """Best-effort coerce a loaded settings dict to match DEFAULT_SETTINGS types.

    Drops unknown keys, fixes wrong-typed values, and clamps numerics to
    sane ranges. Returns the cleaned dict (does not mutate the input).
    """
    out: dict[str, Any] = {}
    for key, default in DEFAULT_SETTINGS.items():
        value = raw.get(key, default)
        out[key] = _coerce_setting_value(key, value, default)
    return out


def _coerce_setting_value(key: str, value: Any, default: Any) -> Any:
    """Coerce a single setting value to the type of its default."""
    if value is None:
        return None if default is None else default
    if isinstance(default, bool):
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            low = value.strip().lower()
            if low in ("true", "1", "yes", "on"):
                return True
            if low in ("false", "0", "no", "off"):
                return False
        return default
    if isinstance(default, int) and not isinstance(default, bool):
        try:
            n = int(value)
            if key == "scan_interval_seconds":
                n = max(5, min(600, n))
            return n
        except (TypeError, ValueError):
            return default
    if isinstance(default, float):
        try:
            return float(value)
        except (TypeError, ValueError):
            return default
    if isinstance(default, str):
        return str(value) if isinstance(value, str) else default
    if isinstance(default, dict) and isinstance(value, dict):
        # Merge dict-valued settings (touchmenu_position) with type coercion.
        merged = dict(default)
        for k, v in value.items():
            if k in default:
                merged[k] = _coerce_setting_value(f"{key}.{k}", v, default[k])
            else:
                merged[k] = v
        return merged
    return default

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
        self._moves_db: MovesDB = MovesDB(static_path=DATA_DIR / "moves.json")
        self._themes: ThemeManager = ThemeManager(THEMES_PATH)
        self._state_lock = threading.Lock()
        self._lifecycle_lock = threading.Lock()
        self._settings: dict[str, Any] = dict(DEFAULT_SETTINGS)
        self._initialized: bool = False
        self._shutting_down: bool = False
        self._save_cache: dict[str, Any] | None = None
        self._save_cache_path: str | None = None
        self._save_cache_at: float = 0.0
        self._watcher: Optional[SaveFileWatcher] = None
        self._watcher_callback_id: int = 0
        self._last_live_event: dict[str, Any] = {}
        # Cached resolved save path — refreshed only when settings change or
        # the watcher detects a new save, NOT on every poll tick (avoids
        # re-walking the entire Steam library every 0.3-2s).
        self._cached_save_path: Optional[Path] = None
        # Phase 6: live memory reading
        self._memory_reader: Optional[LiveMemoryReader] = None
        self._memory_pid: Optional[int] = None
        self._live_source: str = "disk"  # "memory" | "disk" | "stream"
        self._memory_failure_log: list[str] = []
        # Game-mod TCP stream (most reliable live source when the
        # game's Plugins/ folder has our stream.rb hook installed).
        self._stream_server: Optional[LiveStreamServer] = None

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
        with self._lifecycle_lock:
            self._shutting_down = True
        if self._watcher is not None:
            self._watcher.stop()
            self._watcher = None
        if self._memory_reader is not None:
            self._memory_reader.stop()
            self._memory_reader = None
        if self._stream_server is not None:
            self._stream_server.stop()
            self._stream_server = None
        with self._state_lock:
            self._settings = dict(DEFAULT_SETTINGS)
            self._save_cache = None
            self._save_cache_path = None
            self._save_cache_at = 0.0
            self._cached_save_path = None
            self._initialized = False

    def _load_settings(self) -> None:
        # _coerce_settings() returns a complete dict with every DEFAULT_SETTINGS
        # key populated (using defaults for missing/invalid entries), so we
        # don't need a separate setdefault loop afterwards.
        loaded: dict[str, Any] = {}
        if SETTINGS_PATH.is_file():
            try:
                with SETTINGS_PATH.open("r", encoding="utf-8") as fh:
                    loaded = json.load(fh)
            except (json.JSONDecodeError, OSError) as exc:
                log.warning(f"Could not read settings.json: {exc}")
        with self._state_lock:
            self._settings.update(_coerce_settings(loaded))

    def _save_settings(self) -> None:
        SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
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
        with self._state_lock:
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
        # Coerce types in the patch to match DEFAULT_SETTINGS — otherwise a
        # frontend bug sending scan_interval_seconds as a string would land
        # in self._settings and crash downstream arithmetic.
        with self._state_lock:
            coerced = _coerce_settings({**self._settings, **patch})
            self._settings.update({k: coerced[k] for k in patch.keys() if k in coerced})
            current_settings = dict(self._settings)
        # Persist outside the lock to avoid blocking I/O on the event loop.
        self._save_settings()
        if "save_path_override" in patch:
            with self._state_lock:
                self._save_cache = None
                self._save_cache_path = None
                self._cached_save_path = None
                self._last_live_event = {}
            self._stop_watcher()
            if self._settings.get("watcher_enabled", True):
                self._start_watcher()
        if "watcher_enabled" in patch:
            if coerced.get("watcher_enabled", True):
                self._start_watcher()
            else:
                self._stop_watcher()
        if "live_memory_enabled" in patch:
            if coerced.get("live_memory_enabled", False):
                self._start_memory_reader()
            else:
                self._stop_memory_reader()
        return current_settings

    async def find_save_path(self) -> dict[str, Any]:
        """Resolve the most likely save file path. Does not parse it."""
        import asyncio
        with self._state_lock:
            override = self._settings.get("save_path_override")
        path = await asyncio.to_thread(find_save_file, override if override else None)
        return {
            "path": str(path) if path else None,
            "using_override": bool(override) and path is not None,
        }

    async def list_save_files(self) -> list[dict[str, Any]]:
        """List all discoverable save files with metadata."""
        import asyncio
        return await asyncio.to_thread(list_save_files)

    async def get_save_data(self, force_reload: bool = False) -> dict[str, Any]:
        """Parse the active save file and return a normalized dict.

        Caches the result in memory. ``force_reload=True`` invalidates the cache
        and re-parses from disk.
        """
        import asyncio
        import time as _time

        with self._state_lock:
            override = self._settings.get("save_path_override")
        path = await asyncio.to_thread(find_save_file, override if override else None)
        if path is None:
            with self._state_lock:
                self._save_cache = None
                self._save_cache_path = None
            return {"error": "no_save_file_found", "path": None}

        path_str = str(path)
        with self._state_lock:
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
            data: SaveData = await asyncio.to_thread(parse_save_file, path)
        except SaveParseError as exc:
            log.warning(f"Save parse error: {exc}")
            out = {
                "error": "parse_failed",
                "message": str(exc),
                "path": path_str,
            }
            with self._state_lock:
                self._save_cache = out
                self._save_cache_path = path_str
                try:
                    self._save_cache_at = path.stat().st_mtime
                except OSError:
                    self._save_cache_at = _time.time()
            return out
        except Exception as exc:
            log.error(f"Unexpected save parse error: {exc}", exc_info=True)
            out = {
                "error": "parse_failed",
                "message": str(exc),
                "path": path_str,
            }
            with self._state_lock:
                self._save_cache = out
                self._save_cache_path = path_str
                try:
                    self._save_cache_at = path.stat().st_mtime
                except OSError:
                    self._save_cache_at = _time.time()
            return out

        out = data.to_dict()
        with self._state_lock:
            self._save_cache = out
            self._save_cache_path = path_str
            try:
                self._save_cache_at = path.stat().st_mtime
            except OSError:
                self._save_cache_at = _time.time()
            self._settings["last_save_path"] = path_str
        # Persist settings outside the lock to avoid blocking I/O on the event loop.
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
        import asyncio
        sp = Path(save_path) if save_path else None
        found = await asyncio.to_thread(lambda: find_pbs_files(save_path=sp))
        return {k: str(v) for k, v in found.items()}

    async def load_pbs_moves(self, path: str) -> dict[str, Any]:
        """Load a PBS/moves.txt file. Reloads the moves DB with PBS data."""
        import asyncio
        if not isinstance(path, str) or not path:
            raise TypeError("path must be a non-empty string")
        count = await asyncio.to_thread(self._moves_db.load_pbs, path)
        return {
            "loaded": count > 0,
            "count": count,
            "source": path,
            "database": self._moves_db.to_api(),
        }

    async def auto_load_pbs(self) -> dict[str, Any]:
        """Re-attempt PBS auto-discovery. Returns the loaded path or None."""
        import asyncio
        with self._state_lock:
            last_save = self._settings.get("last_save_path")
        sp = Path(last_save) if last_save else None
        loaded = await asyncio.to_thread(lambda: self._moves_db.auto_load_pbs(save_path=sp))
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
        with self._lifecycle_lock:
            if self._watcher is not None:
                return
            # Lower floor than before — 0.3s polling feels live without
            # burning CPU. Saves happen on every Pokemon Center visit,
            # battle end, and menu save, so 0.3s gives near-instant updates.
            interval = max(0.3, min(2.0, self._settings.get("scan_interval_seconds", 30) / 10))
            self._watcher = SaveFileWatcher(
                path_provider=self._resolve_active_save_cached,
                on_change=self._on_watcher_change,
                interval=interval,
            )
            self._watcher.start()

    def _stop_watcher(self) -> None:
        with self._lifecycle_lock:
            if self._watcher is not None:
                self._watcher.stop()
                self._watcher = None

    def _resolve_active_save_cached(self) -> Optional[Path]:
        """Return the cached save path, or resolve + cache it on first call.

        This avoids re-walking the entire Steam library on every watcher poll
        tick (0.3-2s). The cache is invalidated when settings change or when
        the watcher detects a path change.
        """
        with self._state_lock:
            if self._cached_save_path is not None:
                # Verify the cached path still exists.
                cached = self._cached_save_path
            else:
                cached = None
        if cached is not None and cached.is_file():
            return cached
        # Cache miss or file gone — re-resolve (this does the filesystem walk).
        override = self._settings.get("save_path_override")
        found = find_save_file(override if override else None)
        with self._state_lock:
            self._cached_save_path = found
        return found

    def _on_watcher_change(self, path: Path) -> None:
        import time as _time

        with self._state_lock:
            if self._save_cache is not None and self._save_cache_path == str(path):
                try:
                    if path.stat().st_mtime <= self._save_cache_at:
                        return
                except OSError:
                    pass
        try:
            data = parse_save_file(path)
        except SaveParseError as exc:
            log.warning(f"Live save parse failed: {exc}")
            with self._state_lock:
                self._save_cache = {"error": "parse_failed", "message": str(exc), "path": str(path)}
                self._save_cache_path = str(path)
                try:
                    self._save_cache_at = path.stat().st_mtime
                except OSError:
                    self._save_cache_at = _time.time()
            return
        except Exception as exc:
            log.error(f"Unexpected live save parse error: {exc}", exc_info=True)
            with self._state_lock:
                self._save_cache = {"error": "parse_failed", "message": str(exc), "path": str(path)}
                self._save_cache_path = str(path)
                try:
                    self._save_cache_at = path.stat().st_mtime
                except OSError:
                    self._save_cache_at = _time.time()
            return
        out = data.to_dict()
        last_save_changed = False
        with self._state_lock:
            self._save_cache = out
            self._save_cache_path = str(path)
            try:
                self._save_cache_at = path.stat().st_mtime
            except OSError:
                self._save_cache_at = _time.time()
            if self._settings.get("last_save_path") != str(path):
                self._settings["last_save_path"] = str(path)
                last_save_changed = True
            # Disk watcher takes priority demotion: if a stream was previously
            # active but is no longer sending, disk updates should resume.
            self._live_source = "disk"
            self._last_live_event = {
                "kind": "save_modified",
                "path": str(path),
                "at": _time.time(),
                "trainer": data.trainer_name,
            }
        # Only persist settings if last_save_path actually changed (avoids
        # hammering flash I/O on every autosave).
        if last_save_changed:
            self._save_settings()
        log.info(
            f"Live save change: {data.trainer_name} "
            f"({len(data.party)} Pokemon)"
        )

    # --- Phase 6: live memory reading ---------------------------------

    def _start_memory_reader(self) -> None:
        """Start the live-data stack: TCP stream server + memory reader.

        Falls back gracefully if no game is running: the disk watcher
        continues to provide data on save events. The stream server
        binds once and accepts connections from the game mod (which
        reconnects automatically after restart). The memory reader
        is best-effort and may find nothing — see livewatch.py.
        """
        with self._lifecycle_lock:
            if self._shutting_down:
                return
            # 1) TCP stream server — most reliable source when the
            #    game-mod is installed.
            if self._stream_server is None:
                self._stream_server = LiveStreamServer(
                    on_state=self._on_stream_state,
                    on_disconnect=self._on_stream_disconnect,
                )
                if not self._stream_server.start():
                    log.warning("Live stream server failed to bind, falling back to disk only")
                    self._stream_server = None
            # 2) Memory reader — experimental, usually finds nothing.
            if self._memory_reader is not None:
                return
            procs = find_game_processes()
            if not procs:
                log.info("Live memory reader: no game process found, "
                         "stream server + disk watcher remain active")
                return
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
                interval=3.0,
            )
            self._memory_reader.start()

    def _stop_memory_reader(self) -> None:
        with self._lifecycle_lock:
            if self._memory_reader is not None:
                # Avoid self-join: if we're on the reader's own thread, just
                # signal stop without joining.
                if self._memory_reader._thread is threading.current_thread():
                    self._memory_reader._stop.set()
                else:
                    self._memory_reader.stop()
                self._memory_reader = None
            self._memory_pid = None
            if self._stream_server is not None:
                self._stream_server.stop()
                self._stream_server = None

    def _on_memory_update(self, payload: dict[str, Any]) -> None:
        """A live memory scan produced a fresh save. Update the cache
        if it's newer than whatever the disk watcher last provided.
        """
        import time as _time
        now = _time.time()
        with self._state_lock:
            # Stream updates are fresher than memory updates.
            if self._live_source == "stream":
                return
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

    def _on_stream_state(self, payload: dict[str, Any]) -> None:
        """Game-mod TCP stream produced a fresh state update. Stream
        takes priority over memory and disk since it has the lowest
        latency.
        """
        import time as _time
        now = _time.time()
        with self._state_lock:
            self._save_cache = payload
            self._save_cache_path = f"<stream:9988>"
            self._save_cache_at = now
            self._live_source = "stream"
            self._last_live_event = {
                "kind": "stream_update",
                "at": now,
                "trainer": payload.get("trainer_name"),
                "party_count": payload.get("party_count", 0),
                "in_menu": payload.get("in_menu", False),
                "in_battle": payload.get("in_battle", False),
            }
        log.debug(
            f"Live stream update: trainer={payload.get('trainer_name')} "
            f"party={payload.get('party_count')} "
            f"menu={payload.get('in_menu')}"
        )

    def _on_stream_disconnect(self) -> None:
        """Stream client disconnected — demote live source back to disk."""
        with self._state_lock:
            if self._live_source == "stream":
                self._live_source = "disk"
        log.info("Live stream client disconnected, falling back to disk watcher")

    def _on_memory_failure(self, reason: str) -> None:
        """Memory reader couldn't produce data. Stay quiet — the disk
        watcher keeps working as fallback. Only log the first few.
        """
        with self._state_lock:
            self._memory_failure_log.append(reason)
            self._memory_failure_log = self._memory_failure_log[-5:]
        # If the game process disappeared, stop the reader. The disk
        # watcher will still pick up the last save.
        if reason == "process_gone":
            log.info("Live memory reader: game process gone, stopping")
            # Schedule stop+restart on a separate thread to avoid self-join
            # deadlock (this callback runs on the reader's own worker thread).
            threading.Thread(
                target=self._handle_memory_reader_process_gone,
                daemon=True,
                name="MemoryReaderRestart",
            ).start()
        else:
            log.debug(f"Live memory reader: {reason}")

    def _handle_memory_reader_process_gone(self) -> None:
        """Stop the memory reader and try to restart if the game reappears.

        Runs on a dedicated thread so we never join the reader's own worker
        thread (which would deadlock).
        """
        import time as _t
        self._stop_memory_reader()
        _t.sleep(2.0)
        if self._shutting_down:
            return
        if not self._settings.get("live_memory_enabled", False):
            return
        procs = find_game_processes()
        if procs:
            self._start_memory_reader()

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

    @staticmethod
    def _extract_game_name(proc: dict[str, Any] | None) -> str | None:
        """Extract a human-readable game name from the process cmdline."""
        if not proc:
            return None
        cmdline = proc.get("cmdline_str", "") or ""
        # Look for "Game.exe" in the cmdline and extract the parent directory name.
        # Patterns: ".../Vanguard 4.0.3/Game.exe" or "Z:\home\deck\Downloads\Vanguard 4.0.3\Game.exe"
        import re
        m = re.search(r'[\\/\\\\]([^\\/\\\\]+)[\\/\\\\]Game\.exe', cmdline, re.IGNORECASE)
        if m:
            return m.group(1)
        # Fallback: look for known Pokémon fan-game names in cmdline
        known = ("vanguard", "reborn", "rejuvenation", "desolation", "uranium",
                 "insurgence", "infinite", "empire", "godra")
        for name in known:
            if name in cmdline:
                return name.title()
        return None

    async def get_live_state(self) -> dict[str, Any]:
        """Return current game-process + watcher state.

        The frontend uses this to show "Game running" indicators and
        to surface the most recent live save change. Falls back to
        the most recent ``get_save_data`` result if no live event yet.
        """
        import asyncio
        processes = await asyncio.to_thread(find_game_processes)
        with self._state_lock:
            active_proc = processes[0] if processes else None
            watcher_active = self._watcher is not None
            memory_active = self._memory_reader is not None
            live_source = self._live_source
            memory_pid = self._memory_pid
            memory_failure_log = list(self._memory_failure_log)
            last_live_event = dict(self._last_live_event) if self._last_live_event else {}
            save_cache = self._save_cache
            save_cache_path = self._save_cache_path
        # Stream status from the LiveStreamServer
        stream_status = self._stream_server.status if self._stream_server else {
            "listening": False, "connected": False, "last_data_at": 0.0,
            "last_data_trainer": None, "total_frames": 0,
        }
        detected_game = self._extract_game_name(active_proc)
        return {
            "game_running": bool(processes),
            "detected_game_name": detected_game,
            "processes": [
                {
                    "pid": p.get("pid"),
                    "name": p.get("name"),
                    "cmdline": p.get("cmdline_str", ""),
                    "is_emulator": p.get("is_emulator", False),
                }
                for p in processes[:5]
            ],
            "active_process": active_proc,
            "watcher_active": watcher_active,
            "live_source": live_source,
            "memory_reader_active": memory_active,
            "memory_pid": memory_pid,
            "memory_failure_log": memory_failure_log,
            "last_live_event": last_live_event,
            "last_save_data": save_cache,
            "last_save_path": save_cache_path,
            "stream_status": stream_status,
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
        import asyncio
        info = await asyncio.to_thread(find_process_by_save_path, save_path)
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
        import asyncio
        if not isinstance(pid, int) or pid <= 0:
            raise TypeError("pid must be a positive integer")
        return await asyncio.to_thread(get_process_memory_map, pid)
