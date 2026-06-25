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

from steampaths import candidate_steam_roots, wine_prefix_search_roots

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


def _find_via_open_files() -> Optional[Path]:
    """Inspect open file handles of running processes for a save file."""
    candidates: list[Path] = []
    for proc in psutil.process_iter():
        if not _looks_like_game(proc):
            continue
        try:
            files = proc.open_files()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
        for f in files:
            p = Path(f.path)
            if p.name in SAVENAMES and _is_readable(p):
                candidates.append(p)
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


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
    for steamapps in candidate_steam_roots():
        compat = steamapps / "compatdata"
        if not compat.is_dir():
            continue
        for appdir in compat.iterdir():
            if not appdir.is_dir():
                continue
            for search_root in wine_prefix_search_roots(appdir):
                if not search_root.is_dir():
                    continue
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
    out: list[Path] = []
    for p in paths:
        try:
            rp = p.resolve()
        except OSError:
            rp = p
        if rp in seen:
            continue
        seen.add(rp)
        out.append(p)
    out.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return out


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
