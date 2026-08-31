"""Save file path resolution for Pokémon Essentials.

Strategy (first hit wins):
1. User-configured override (settings.save_path_override)
2. Open file handles of any process matching likely game executables
3. Scan Steam compatdata Wine prefixes for ``Game.rxdata``
4. Scan native (Linux) Steam library locations

Designed for Steam Deck with Proton. Works on Desktop Mode too.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import psutil

from steampaths import candidate_steam_roots, candidate_non_steam_roots, wine_prefix_search_roots

log = logging.getLogger("pokemon-overlay.savepath")

SAVENAMES: tuple[str, ...] = (
    "Game.rxdata",
    "Save.rxdata",
    "Game.es3",
)

SAVE_EXTENSIONS: tuple[str, ...] = (
    ".rxdata",
    ".es3",
)

LIKELY_GAME_PROCESS_HINTS = (
    "rgss",
    "ruby",
    "essentials",
    "pokemon",
    "game",
    "rpg",
)


def _is_readable(path: Path) -> bool:
    try:
        return path.is_file() and os.access(path, os.R_OK)
    except OSError:
        return False


# Exclude paths that indicate the process is our plugin / Decky itself, not
# a game. Used to filter out false positives in both save-path resolution and
# live game-process detection.
EXCLUDE_PATH_HINTS: tuple[str, ...] = (
    "sd-poke-stat-tracker",
    "homebrew",
    "decky",
    "plugin_loader",
    "pluginloader",
)


def _process_excluded(proc: psutil.Process) -> bool:
    """True if this process is our plugin or Decky internals."""
    try:
        cmdline = " ".join(proc.cmdline() or []).lower()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False
    return any(ex in cmdline for ex in EXCLUDE_PATH_HINTS)


def _looks_like_game(proc: psutil.Process) -> bool:
    try:
        name = (proc.name() or "").lower()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False
    if any(h in name for h in LIKELY_GAME_PROCESS_HINTS):
        return True
    try:
        cmdline = " ".join(proc.cmdline() or []).lower()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False
    return any(h in cmdline for h in LIKELY_GAME_PROCESS_HINTS)

_cached_save_pid: Optional[int] = None
_cached_save_path: Optional[Path] = None

def _check_cached_process() -> Optional[Path]:
    global _cached_save_pid, _cached_save_path
    if _cached_save_pid is None or _cached_save_path is None:
        return None
    
    try:
        os.kill(_cached_save_pid, 0)
        proc = psutil.Process(_cached_save_pid)
        if _process_excluded(proc):
            return None
        files = proc.open_files()
        for f in files:
            p = Path(f.path)
            if p == _cached_save_path and _is_readable(p):
                return p
    except (OSError, psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        pass
    
    _cached_save_pid = None
    _cached_save_path = None
    return None

def _find_via_open_files() -> Optional[Path]:
    """Inspect open file handles of running processes for a save file."""
    cached = _check_cached_process()
    if cached:
        return cached

    candidates: list[tuple[Path, int]] = []
    for proc in psutil.process_iter():
        if _process_excluded(proc):
            continue
        if not _looks_like_game(proc):
            continue
        try:
            files = proc.open_files()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
        for f in files:
            p = Path(f.path)
            if p.name in SAVENAMES and _is_readable(p):
                candidates.append((p, proc.pid))
    if not candidates:
        return None
    # stat() can fail if the game closed/deleted the save between
    # open_files() and here — drop that candidate instead of crashing.
    scored: list[tuple[Path, int, float]] = []
    for p, pid in candidates:
        try:
            scored.append((p, pid, p.stat().st_mtime))
        except OSError:
            continue
    if not scored:
        return None
    scored.sort(key=lambda item: item[2], reverse=True)
    best_path, best_pid, _ = scored[0]
    
    global _cached_save_pid, _cached_save_path
    _cached_save_pid = best_pid
    _cached_save_path = best_path
    
    return best_path


# Steam path helpers imported from steampaths module (see Fix #6).


def _safe_walk_find(root: Path, names: tuple[str, ...]) -> list[Path]:
    out = []
    skip_dirs = {"SteamLinuxRuntime_sniper", "SteamLinuxRuntime_soldier", "SteamLinuxRuntime"}
    for dirpath, dirnames, filenames in os.walk(str(root)):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for f in filenames:
            # Match exact save names OR any file with a known save extension
            if f in names or any(f.endswith(ext) for ext in SAVE_EXTENSIONS):
                p = Path(dirpath) / f
                if _is_readable(p):
                    out.append(p)
    return out


def _scan_wine_prefixes() -> list[Path]:
    out: list[Path] = []

    # 1. Steam Compatdata
    for steamapps in candidate_steam_roots():
        compat = steamapps / "compatdata"
        if not compat.is_dir():
            continue
        try:
            appdirs = list(compat.iterdir())
        except OSError:
            # One unreadable steamapps dir must not kill the whole scan.
            continue
        for appdir in appdirs:
            if not appdir.is_dir():
                continue
            for search_root in wine_prefix_search_roots(appdir):
                if not search_root.is_dir():
                    continue
                out.extend(_safe_walk_find(search_root, SAVENAMES))

    # 2. Non-Steam Prefix Roots (Heroic, Lutris, Bottles)
    for pfx_base in candidate_non_steam_roots():
        # Heroic uses pfx directly or inside folders
        for search_root in wine_prefix_search_roots(pfx_base):
            if search_root.is_dir():
                out.extend(_safe_walk_find(search_root, SAVENAMES))

        # Bottles/Lutris prefixes often have 'pfx' inside game folders
        try:
            pfx_dirs = list(pfx_base.glob("*/pfx"))
        except OSError:
            continue
        for pfx_dir in pfx_dirs:
            for search_root in wine_prefix_search_roots(pfx_dir.parent):
                if search_root.is_dir():
                    out.extend(_safe_walk_find(search_root, SAVENAMES))

    return out


def _scan_native_library() -> list[Path]:
    out: list[Path] = []
    for steamapps in candidate_steam_roots():
        common = steamapps / "common"
        if not common.is_dir():
            continue
        out.extend(_safe_walk_find(common, SAVENAMES))
    return out


def _dedupe_by_mtime(paths: list[Path]) -> list[Path]:
    seen: set[Path] = set()
    out: list[tuple[Path, float]] = []
    for p in paths:
        try:
            rp = p.resolve()
        except Exception:
            rp = p
        if rp in seen:
            continue
        seen.add(rp)
        # stat() can fail if the file vanished between the directory scan
        # and here (games rewrite saves constantly) — drop it instead of
        # letting the sort key crash the whole resolution.
        try:
            mtime = p.stat().st_mtime
        except OSError:
            continue
        out.append((p, mtime))
    out.sort(key=lambda item: item[1], reverse=True)
    return [p for p, _ in out]


def find_save_file(override: Optional[str] = None) -> Optional[Path]:
    """Resolve the most likely save file. ``override`` short-circuits all other strategies."""
    if override:
        p = Path(os.path.expanduser(override))
        if _is_readable(p):
            log.info(f"Using override path: {p}")
            return p
        log.warning(f"Override path not readable: {p}")

    found = _find_via_open_files()
    if found:
        log.info(f"Found via open files: {found}")
        return found

    candidates = _dedupe_by_mtime(_scan_wine_prefixes() + _scan_native_library())

    if not candidates:
        log.info("No save file candidates found")
        return None
    log.info(f"Returning newest candidate: {candidates[0]}")
    return candidates[0]


def list_save_files() -> list[dict]:
    """List all discoverable save files with size/mtime metadata."""
    candidates = _dedupe_by_mtime(_scan_wine_prefixes() + _scan_native_library())
    out: list[dict] = []
    for c in candidates:
        try:
            st = c.stat()
            out.append(
                {
                    "path": str(c),
                    "size": st.st_size,
                    "modified": st.st_mtime,
                }
            )
        except OSError:
            continue
    return out
