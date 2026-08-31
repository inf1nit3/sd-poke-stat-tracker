"""Shared Steam path discovery used by both save-path resolution and PBS file finding.

Centralizes the logic for locating Steam library folders on Linux / Steam Deck,
including native installs and Flatpak. Prevents the two modules from drifting
out of sync when new paths need to be supported.
"""

from __future__ import annotations

import re
from pathlib import Path


def _parse_library_folders_vdf(vdf_path: Path) -> list[Path]:
    """Extract library paths from Steam's ``libraryfolders.vdf``.

    Handles the modern format (``"path"`` keys inside numbered blocks)
    and the legacy format (numeric keys mapping directly to paths).
    Best effort: malformed lines are skipped, not fatal.
    """
    out: list[Path] = []
    try:
        text = vdf_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return out
    # Modern format: "path"    "/run/media/mmcblk0p1/SteamLibrary"
    for m in re.finditer(r'"path"\s+"([^"]+)"', text):
        out.append(Path(m.group(1).replace("\\\\", "\\")))
    # Legacy format: "1"    "/mnt/games/SteamLibrary"
    for m in re.finditer(r'"(\d+)"\s+"([^"]+)"', text):
        value = m.group(2)
        if value.startswith("/"):
            out.append(Path(value.replace("\\\\", "\\")))
    return out


def candidate_steam_roots() -> list[Path]:
    """Return all existing Steam ``steamapps`` directories on this system.

    Includes additional libraries recorded in ``libraryfolders.vdf``
    (SD card, second drive, ...) — without them, games installed outside
    the default library locations are invisible to every downstream scan.
    """
    home = Path.home()
    roots = [
        home / ".steam" / "steam" / "steamapps",
        home / ".local" / "share" / "Steam" / "steamapps",
    ]
    flatpak = home / ".var" / "app" / "com.valvesoftware.Steam" / "data" / "Steam" / "steamapps"
    if flatpak.is_dir():
        roots.append(flatpak)

    out: list[Path] = []
    seen: set[Path] = set()
    for root in roots:
        if not root.is_dir():
            continue
        key = root.resolve()
        if key not in seen:
            seen.add(key)
            out.append(root)
        vdf = root / "libraryfolders.vdf"
        if not vdf.is_file():
            continue
        for lib in _parse_library_folders_vdf(vdf):
            steamapps = lib / "steamapps"
            if not steamapps.is_dir():
                continue
            key = steamapps.resolve()
            if key not in seen:
                seen.add(key)
                out.append(steamapps)
    return out

def candidate_non_steam_roots() -> list[Path]:
    """Return common Wine prefix roots for non-Steam launchers (Heroic, Lutris, Bottles)."""
    home = Path.home()
    roots = [
        # Heroic Games Launcher prefixes
        home / "Games" / "Heroic" / "Prefixes",
        home / ".var" / "app" / "com.heroicgameslauncher.hgl" / "config" / "heroic" / "tools" / "proton",
        # Lutris default prefixes
        home / "Games",
        home / ".wine",
        # Bottles default prefixes
        home / ".var" / "app" / "com.usebottles.bottles" / "data" / "bottles" / "bottles",
        home / ".local" / "share" / "bottles" / "bottles",
    ]
    return [r for r in roots if r.is_dir()]


def wine_prefix_search_roots(compat_root: Path) -> list[Path]:
    """Return likely document/program directories inside a Wine prefix."""
    pfx_root = compat_root / "pfx" / "drive_c"
    if not pfx_root.is_dir():
        return []
    return [
        pfx_root / "users" / "steamuser" / "Documents",
        pfx_root / "users" / "steamuser" / "My Documents",
        pfx_root / "users" / "steamuser" / "AppData" / "Roaming",
        pfx_root / "users" / "steamuser" / "AppData" / "Local",
        pfx_root / "users" / "steamuser" / "Saved Games",
        pfx_root / "users" / "steamuser",
        # Default Wine user 'deck' or generic user
        pfx_root / "users" / "deck" / "Documents",
        pfx_root / "users" / "deck" / "Saved Games",
        pfx_root / "users" / "deck" / "AppData" / "Roaming",
        pfx_root / "users" / "crossover" / "Documents", # for Bottles sometimes
        pfx_root / "users" / "Public" / "Documents",
        pfx_root / "Program Files",
        pfx_root,
    ]
