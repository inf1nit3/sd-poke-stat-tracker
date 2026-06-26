"""Shared Steam path discovery used by both save-path resolution and PBS file finding.

Centralizes the logic for locating Steam library folders on Linux / Steam Deck,
including native installs and Flatpak. Prevents the two modules from drifting
out of sync when new paths need to be supported.
"""

from __future__ import annotations

from pathlib import Path


def candidate_steam_roots() -> list[Path]:
    """Return all existing Steam ``steamapps`` directories on this system."""
    home = Path.home()
    roots = [
        home / ".steam" / "steam" / "steamapps",
        home / ".local" / "share" / "Steam" / "steamapps",
    ]
    flatpak = home / ".var" / "app" / "com.valvesoftware.Steam" / "data" / "Steam" / "steamapps"
    if flatpak.is_dir():
        roots.append(flatpak)
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
        pfx_root / "Program Files",
        pfx_root,
    ]
