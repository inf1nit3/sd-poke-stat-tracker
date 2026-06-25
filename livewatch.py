"""Live save-file watcher and game-process detection.

This module provides two capabilities that complement the on-disk save
parser:

1. **Process detection** — find the running Pokémon Essentials game
   process (or its Wine/Proton wrapper) so the frontend can show
   "game is running" indicators.
2. **Inotify save watcher** — react to save-file modifications within
   ~50ms, instead of waiting for the polling interval. This is the
   "live" piece for the in-game experience.

**What this module does NOT do** (yet): read live Pokémon object data
from the game's process memory. Direct memory reading of Wine/Proton
processes is possible but fragile (ASLR, address layout changes per
launch, Wine's virtual address translation). A future phase could add
pattern-based memory scanning using the last-known save as a fingerprint.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path
from typing import Callable, Optional

import psutil

log = logging.getLogger("pokemon-overlay.livewatch")

LIKELY_GAME_PROCESS_HINTS: tuple[str, ...] = (
    "rgss",
    "ruby",
    "essentials",
    "rpg",
)

# Terms that indicate a Pokémon fan game process.
# NOTE: "poke" and "pokemon" are NOT included here because they match
# our own plugin process (sd-poke-stat-tracker). We only match on
# terms that would appear in an actual game's process cmdline.
POKEMON_TERMS: tuple[str, ...] = (
    "essentials",
    "fan game",
    "rgss",
    "rpg maker",
)

# Paths that indicate the process is our plugin or Decky itself,
# not a game. Used to exclude false positives.
EXCLUDE_PATH_HINTS: tuple[str, ...] = (
    "sd-poke-stat-tracker",
    "homebrew",
    "decky",
    "plugin_loader",
    "pluginloader",
)


def find_game_processes() -> list[dict[str, object]]:
    """Return a list of likely game processes.

    Each entry has ``pid``, ``name``, ``cmdline``, ``cmdline_str``,
    ``exe``, and ``create_time`` fields. Empty list if nothing matches.
    """
    out: list[dict[str, object]] = []
    for proc in psutil.process_iter(
        ["pid", "name", "exe", "cmdline", "create_time"]
    ):
        try:
            info = proc.info
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        name = (info.get("name") or "").lower()
        cmdline = info.get("cmdline") or []
        cmdline_str = " ".join(cmdline).lower()
        is_likely = any(h in name for h in LIKELY_GAME_PROCESS_HINTS) or any(
            h in cmdline_str for h in LIKELY_GAME_PROCESS_HINTS
        )
        is_pokemon = any(t in cmdline_str for t in POKEMON_TERMS)
        if not (is_likely or is_pokemon):
            continue
        # Exclude our own plugin process and Decky internals
        if any(ex in cmdline_str for ex in EXCLUDE_PATH_HINTS):
            continue
        out.append(
            {
                "pid": info.get("pid"),
                "name": info.get("name"),
                "exe": info.get("exe"),
                "cmdline": list(cmdline),
                "cmdline_str": cmdline_str,
                "create_time": info.get("create_time"),
            }
        )
    out.sort(key=lambda p: int(p.get("create_time") or 0), reverse=True)
    return out


def get_process_memory_map(pid: int) -> list[dict[str, str]]:
    """Return a list of memory regions for the given process (best effort).

    Each entry has ``path`` (region name or ``[anon]``/``[heap]``),
    ``start``, ``end``, ``perms``. Requires same user or root.
    """
    out: list[dict[str, str]] = []
    try:
        with open(f"/proc/{pid}/maps", "r") as fh:
            for line in fh:
                parts = line.split()
                if len(parts) < 5:
                    continue
                addrs, perms = parts[0], parts[1]
                try:
                    start_s, end_s = addrs.split("-")
                    start = int(start_s, 16)
                    end = int(end_s, 16)
                except ValueError:
                    continue
                path = parts[5] if len(parts) >= 6 else ""
                if not path or path == "":
                    path = "[anon]"
                out.append(
                    {
                        "path": path,
                        "start": f"0x{start:x}",
                        "end": f"0x{end:x}",
                        "perms": perms,
                    }
                )
    except (OSError, ProcessLookupError) as exc:
        log.debug(f"Could not read /proc/{pid}/maps: {exc}")
    return out


def find_process_by_save_path(save_path: str | Path) -> Optional[dict[str, object]]:
    """Find the process that has ``save_path`` open."""
    target = str(Path(save_path).resolve())
    for proc in psutil.process_iter(["pid"]):
        try:
            files = proc.open_files()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
        for f in files:
            try:
                real = str(Path(f.path).resolve())
            except OSError:
                real = f.path
            if real == target:
                try:
                    info = proc.as_dict(
                        attrs=["pid", "name", "exe", "cmdline", "create_time"]
                    )
                    info["cmdline_str"] = " ".join(info.get("cmdline") or [])
                    return info
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    return {"pid": proc.pid, "name": None, "exe": None,
                            "cmdline": [], "cmdline_str": ""}
    return None


def read_process_memory(pid: int, address: int, size: int) -> Optional[bytes]:
    """Read raw memory at ``address`` from process ``pid``.

    Requires same-user or root access. Returns ``None`` on failure.
    """
    if size <= 0 or size > 16 * 1024 * 1024:
        return None
    try:
        with open(f"/proc/{pid}/mem", "rb") as fh:
            fh.seek(address)
            return fh.read(size)
    except (OSError, ProcessLookupError, OverflowError, ValueError) as exc:
        log.debug(f"read_process_memory({pid}, 0x{address:x}, {size}) failed: {exc}")
        return None


class SaveFileWatcher:
    """Polling-based save-file watcher (fallback for systems without inotify).

    Polls the save file's mtime every ``interval`` seconds and invokes
    ``on_change`` when the mtime or size changes. Cross-platform and
    has no native dependencies beyond ``psutil``/``pathlib``.

    For Steam Deck we deliberately avoid ``inotify`` because Proton's
    Wine filesystem layer can swallow inotify events. Polling at 1s
    gives near-real-time updates with negligible CPU.
    """

    def __init__(
        self,
        path_provider: Callable[[], Optional[Path]],
        on_change: Callable[[Path], None],
        interval: float = 1.0,
    ) -> None:
        self._path_provider = path_provider
        self._on_change = on_change
        self._interval = max(0.2, interval)
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._last_mtime: float = 0.0
        self._last_size: int = 0
        self._last_path: Optional[Path] = None
        self._lock = threading.Lock()

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="SaveFileWatcher", daemon=True
        )
        self._thread.start()
        log.info(f"Save watcher started, interval={self._interval}s")

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        log.info("Save watcher stopped")

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self._check()
            except Exception as exc:
                log.error(f"Save watcher iteration failed: {exc}", exc_info=True)
            self._stop.wait(self._interval)

    def _check(self) -> None:
        with self._lock:
            path = self._path_provider()
            if path is None or not path.is_file():
                self._last_path = None
                self._last_mtime = 0.0
                self._last_size = 0
                return
            try:
                stat = path.stat()
            except OSError:
                return
            mtime = stat.st_mtime
            size = stat.st_size
            path_changed = self._last_path != path
            content_changed = (
                path_changed
                or mtime != self._last_mtime
                or size != self._last_size
            )
            self._last_path = path
            self._last_mtime = mtime
            self._last_size = size
        if content_changed and mtime > 0:
            try:
                self._on_change(path)
            except Exception as exc:
                log.error(f"on_change callback failed: {exc}", exc_info=True)

    def notify_save_loaded(self, path: Path) -> None:
        """Tell the watcher about a save that was just parsed, so it
        doesn't immediately re-trigger."""
        with self._lock:
            self._last_path = path
            try:
                stat = path.stat()
                self._last_mtime = stat.st_mtime
                self._last_size = stat.st_size
            except OSError:
                self._last_mtime = 0.0
                self._last_size = 0
