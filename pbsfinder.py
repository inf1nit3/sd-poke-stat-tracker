"""Locate Pokémon Essentials PBS files (moves.txt, pokemon.txt, types.txt).

PBS files are part of the game installation, not the save. For games run
through Proton/Wine on Steam Deck they live in one of:
1. Native Steam install: ``~/.steam/steam/steamapps/common/<GAME>/PBS/``
2. Wine prefix Documents: ``<wine>/drive_c/users/steamuser/Documents/<GAME>/PBS/``
3. Wine prefix common:   ``<wine>/drive_c/.../<GAME>/PBS/``

The function ``find_pbs_files()`` returns a dict of ``{file_type: path}``
for the most likely location of each PBS file. ``file_type`` is one of
``moves``, ``pokemon``, ``types``, ``items``, ``abilities``.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

log = logging.getLogger("pokemon-overlay.pbsfinder")

PBS_FILENAMES: dict[str, tuple[str, ...]] = {
    "moves": ("moves.txt",),
    "pokemon": ("pokemon.txt",),
    "types": ("types.txt",),
    "items": ("items.txt",),
    "abilities": ("abilities.txt",),
}

GAME_FOLDER_HINTS: tuple[str, ...] = (
    "PBS",
    "Data",
    "data",
)

CANDIDATE_STEAM_ROOTS_ATTR: str = "_candidate_steam_roots"


def _candidate_steam_roots() -> list[Path]:
    """Same as savepath._candidate_steam_roots but duplicated to avoid coupling."""
    home = Path.home()
    roots = [
        home / ".steam" / "steam" / "steamapps",
        home / ".local" / "share" / "Steam" / "steamapps",
    ]
    flatpak = home / ".var" / "app" / "com.valvesoftware.Steam" / "data" / "Steam" / "steamapps"
    if flatpak.is_dir():
        roots.append(flatpak)
    return [r for r in roots if r.is_dir()]


def _wine_prefix_search_roots(compat_root: Path) -> list[Path]:
    pfx_root = compat_root / "pfx" / "drive_c"
    if not pfx_root.is_dir():
        return []
    return [
        pfx_root / "users" / "steamuser" / "Documents",
        pfx_root / "users" / "steamuser" / "My Documents",
        pfx_root / "Program Files (x86)" / "Steam" / "steamapps" / "common",
    ]


def _walk_for_pbs(root: Path) -> dict[str, Path]:
    """Walk a directory and return any PBS files found."""
    found: dict[str, Path] = {}
    if not root.is_dir():
        return found
    for file_type, names in PBS_FILENAMES.items():
        if file_type in found:
            continue
        for name in names:
            try:
                matches = list(root.rglob(name))
            except OSError:
                continue
            for m in matches:
                if m.is_file() and os.access(m, os.R_OK):
                    found[file_type] = m
                    break
    return found


def find_pbs_files(
    save_path: Optional[Path | str] = None,
    hint: Optional[str] = None,
) -> dict[str, Path]:
    """Locate PBS files, preferring the location closest to the save file.

    Returns a dict like ``{"moves": Path("/.../PBS/moves.txt"), ...}``.
    Missing entries simply aren't in the dict.
    """
    candidates: list[Path] = []

    if save_path is not None:
        p = Path(save_path)
        for parent in [p.parent, *p.parents]:
            if not parent or parent == parent.parent:
                break
            for hint_dir in GAME_FOLDER_HINTS:
                candidate = parent / hint_dir
                if candidate.is_dir():
                    candidates.append(candidate)
            if candidates:
                break

    if hint:
        candidates.append(Path(os.path.expanduser(hint)))

    for steamapps in _candidate_steam_roots():
        common = steamapps / "common"
        if common.is_dir():
            for game_dir in common.iterdir():
                if not game_dir.is_dir():
                    continue
                for hint_dir in GAME_FOLDER_HINTS:
                    c = game_dir / hint_dir
                    if c.is_dir():
                        candidates.append(c)
        compat = steamapps / "compatdata"
        if compat.is_dir():
            for appdir in compat.iterdir():
                if not appdir.is_dir():
                    continue
                for search_root in _wine_prefix_search_roots(appdir):
                    if not search_root.is_dir():
                        continue
                    for game_dir in search_root.iterdir():
                        if not game_dir.is_dir():
                            continue
                        for hint_dir in GAME_FOLDER_HINTS:
                            c = game_dir / hint_dir
                            if c.is_dir():
                                candidates.append(c)

    found: dict[str, Path] = {}
    for c in candidates:
        if not c.is_dir():
            continue
        result = _walk_for_pbs(c)
        for file_type, path in result.items():
            if file_type not in found:
                found[file_type] = path
        if all(ft in found for ft in PBS_FILENAMES):
            break
    if found:
        log.info(f"Found PBS files: {found}")
    else:
        log.info("No PBS files found")
    return found
