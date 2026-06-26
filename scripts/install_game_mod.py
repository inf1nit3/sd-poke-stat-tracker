#!/usr/bin/env python3
"""Install the PokeStatStream game mod into the Pokémon game directory.

Pokémon Essentials scans the ``Plugins/`` folder on every game start
and compiles any folder with a ``meta.txt`` into PluginScripts.rxdata.
The user only needs to:
  1. Run this script (idempotent — safe to re-run)
  2. Restart the Pokémon game

The plugin then hooks ``Scene_Map#update`` and forwards player/party
state over TCP to the Decky plugin's stream server on 127.0.0.1:9988.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLUGIN_NAME = "PokeStatStream"
META_SRC = HERE.parent / "game-mod" / "meta.txt"
STREAM_SRC = HERE.parent / "game-mod" / "stream.rb"

# Fallback candidates checked when --game-dir is not passed.
# These cover the most common fan-game installs but are intentionally a
# shortlist — the generic rglob-based search below catches anything else.
_HARDCODED_CANDIDATES: tuple[Path, ...] = (
    Path.home() / "Downloads" / "Vanguard 4.0.3",
    Path.home() / "Downloads" / "Pokemon Empire",
    Path.home() / "Downloads" / "Godra Remastered V 0.3.7",
)

# Roots we rglob for Game.exe / Plugins/. Limited to typical Steam Deck /
# desktop download locations to keep startup cheap.
_SEARCH_ROOTS: tuple[Path, ...] = (
    Path.home() / "Downloads",
    Path.home() / "Games",
    Path.home() / "Desktop",
    Path("/run/media"),
)


def _looks_like_game_dir(d: Path) -> bool:
    """True if ``d`` has both Game.exe and a Plugins/ folder."""
    try:
        return (d / "Game.exe").is_file() and (d / "Plugins").is_dir()
    except OSError:
        return False


def find_game_dir() -> Path | None:
    """Look for a Pokémon Essentials game in common locations.

    Order:
      1. Hardcoded candidates (instant).
      2. rglob each search root for any Game.exe, verify Plugins/ exists.
    """
    for c in _HARDCODED_CANDIDATES:
        if _looks_like_game_dir(c):
            return c
    seen: set[Path] = set()
    for root in _SEARCH_ROOTS:
        if not root.is_dir():
            continue
        try:
            for exe in root.rglob("Game.exe"):
                parent = exe.parent
                if parent in seen:
                    continue
                seen.add(parent)
                if _looks_like_game_dir(parent):
                    return parent
        except OSError:
            continue
    return None


def install(game_dir: Path, *, force: bool = False) -> bool:
    plugin_dir = game_dir / "Plugins" / PLUGIN_NAME
    if plugin_dir.is_dir():
        if not force:
            print(f"Already installed at {plugin_dir}. Use --force to reinstall.")
            return True
        shutil.rmtree(plugin_dir)
    plugin_dir.mkdir(parents=True, exist_ok=True)
    if not META_SRC.is_file():
        print(f"ERROR: missing {META_SRC}")
        return False
    if not STREAM_SRC.is_file():
        print(f"ERROR: missing {STREAM_SRC}")
        return False
    shutil.copy(META_SRC, plugin_dir / "meta.txt")
    shutil.copy(STREAM_SRC, plugin_dir / "stream.rb")
    print(f"Installed PokeStatStream plugin to {plugin_dir}")
    print("Next step: restart the Pokémon game so the PluginManager")
    print("compiles the new plugin into PluginScripts.rxdata.")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--game-dir",
        type=Path,
        help="Path to the Pokémon game directory (e.g. ~/Downloads/Vanguard 4.0.3)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reinstall even if already present",
    )
    args = parser.parse_args()
    game_dir = args.game_dir or find_game_dir()
    if game_dir is None:
        print(
            "ERROR: no game directory found. Pass --game-dir explicitly.\n"
            "Looked in: " + ", ".join(str(p) for p in [
                Path.home() / "Downloads" / "Vanguard 4.0.3",
                Path.home() / "Downloads" / "Pokemon Empire",
                Path.home() / "Downloads" / "Godra Remastered V 0.3.7",
            ])
        )
        return 1
    if not (game_dir / "Plugins").is_dir():
        print(f"ERROR: {game_dir} does not look like a Pokémon game (no Plugins/)")
        return 1
    return 0 if install(game_dir, force=args.force) else 2


if __name__ == "__main__":
    sys.exit(main())