"""Moves database: static Gen 1-6 starter set, plus live PBS overrides.

The static database (data/moves.json) covers the common Gen 1-6 moves.
For fan games with custom moves, the game's own PBS file is the
canonical source and overrides any conflicting static entries.

Lookup priority (highest first):
1. PBS move (from the game's PBS/moves.txt)
2. Static move (from data/moves.json)
3. Heuristic name-based type guess
4. None (caller decides how to render "unknown")
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from pbsparser import normalize_name, parse_moves_pbs
from pbsfinder import find_pbs_files

PLUGIN_DIR: Path = Path(__file__).resolve().parent
MOVES_PATH: Path = PLUGIN_DIR / "data" / "moves.json"

log = logging.getLogger("pokemon-overlay.moves")

# Common substrings → type, used as a fallback when a move is not in the DB.
# Ordered most-specific first; first match wins.
TYPE_HEURISTICS: list[tuple[str, str]] = [
    ("THUNDER", "Electric"),
    ("BOLT", "Electric"),
    ("ZAP", "Electric"),
    ("SPARK", "Electric"),
    ("VOLT", "Electric"),
    ("CHARGE", "Electric"),
    ("FLAME", "Fire"),
    ("FIRE", "Fire"),
    ("BLAZE", "Fire"),
    ("EMBER", "Fire"),
    ("BURN", "Fire"),
    ("HEAT", "Fire"),
    ("LAVA", "Fire"),
    ("SACRED", "Fire"),
    ("WILLOW", "Fire"),
    ("INFERNO", "Fire"),
    ("SUNNY", "Fire"),
    ("WATER", "Water"),
    ("SURF", "Water"),
    ("HYDRO", "Water"),
    ("AQUA", "Water"),
    ("BUBBLE", "Water"),
    ("RAIN", "Water"),
    ("WHIRL", "Water"),
    ("CRAB", "Water"),
    ("LEAF", "Grass"),
    ("VINE", "Grass"),
    ("ROOT", "Grass"),
    ("SEED", "Grass"),
    ("SPORE", "Grass"),
    ("POLLEN", "Grass"),
    ("PETAL", "Grass"),
    ("GIGA", "Grass"),
    ("ICE", "Ice"),
    ("FROST", "Ice"),
    ("BLIZZARD", "Ice"),
    ("PUNCH", "Fighting"),
    ("KICK", "Fighting"),
    ("CHOP", "Fighting"),
    ("FIGHT", "Fighting"),
    ("KARATE", "Fighting"),
    ("CROSS", "Fighting"),
    ("LOWKICK", "Fighting"),
    ("LOWSWEEP", "Fighting"),
    ("JAB", "Fighting"),
    ("AURA", "Fighting"),
    ("FOCUS", "Fighting"),
    ("BULK", "Fighting"),
    ("CLOSECOMBAT", "Fighting"),
    ("REVENGE", "Fighting"),
    ("DRAINPUNCH", "Fighting"),
    ("SLUDGE", "Poison"),
    ("POISON", "Poison"),
    ("TOXIC", "Poison"),
    ("ACID", "Poison"),
    ("GUNK", "Poison"),
    ("EARTH", "Ground"),
    ("SAND", "Ground"),
    ("MUD", "Ground"),
    ("DIG", "Ground"),
    ("BONE", "Ground"),
    ("MAGNITUDE", "Ground"),
    ("FLY", "Flying"),
    ("AERIAL", "Flying"),
    ("WING", "Flying"),
    ("AIR", "Flying"),
    ("PECK", "Flying"),
    ("DRILL", "Flying"),
    ("BRAVE", "Flying"),
    ("HURRIC", "Flying"),
    ("ACROBAT", "Flying"),
    ("PSYCHIC", "Psychic"),
    ("PSY", "Psychic"),
    ("CONFUSION", "Psychic"),
    ("HYPNO", "Psychic"),
    ("DREAM", "Psychic"),
    ("ZEN", "Psychic"),
    ("CALM", "Psychic"),
    ("FUTURE", "Psychic"),
    ("TRICK", "Psychic"),
    ("STORE", "Psychic"),
    ("BUG", "Bug"),
    ("TWINE", "Bug"),
    ("MEGAHORN", "Bug"),
    ("PIN", "Bug"),
    ("UTURN", "Bug"),
    ("XSCISSOR", "Bug"),
    ("ROCK", "Rock"),
    ("STONE", "Rock"),
    ("SANDSTORM", "Rock"),
    ("ROCKPOLISH", "Rock"),
    ("ROCKSLIDE", "Rock"),
    ("ROCKTHROW", "Rock"),
    ("SHADOW", "Ghost"),
    ("HEX", "Ghost"),
    ("NIGHT", "Ghost"),
    ("PHANTOM", "Ghost"),
    ("ASTRONISH", "Ghost"),
    ("DESTINY", "Ghost"),
    ("DRAGON", "Dragon"),
    ("OUTRAGE", "Dragon"),
    ("TWISTER", "Dragon"),
    ("DRACOMETEOR", "Dragon"),
    ("ROAR", "Dragon"),
    ("BITE", "Dark"),
    ("CRUNCH", "Dark"),
    ("DARK", "Dark"),
    ("KNOCK", "Dark"),
    ("FOUL", "Dark"),
    ("SUCKER", "Dark"),
    ("THIEF", "Dark"),
    ("PAYBACK", "Dark"),
    ("PURSUIT", "Dark"),
    ("NASTY", "Dark"),
    ("IRON", "Steel"),
    ("METAL", "Steel"),
    ("STEEL", "Steel"),
    ("BULLET", "Steel"),
    ("GYRO", "Steel"),
    ("FLASH", "Steel"),
    ("FAIRY", "Fairy"),
    ("MOON", "Fairy"),
    ("DAZZLE", "Fairy"),
    ("PLAY", "Fairy"),
    ("CHARM", "Fairy"),
    ("SPIRIT", "Fairy"),
]


def _normalize_key(name: str) -> str:
    """Normalize a move name for matching (uppercase, alphanum only)."""
    return normalize_name(name)


class MovesDB:
    """Merged moves database: static (JSON) + PBS (game data) + heuristic fallback."""

    def __init__(
        self,
        static_path: Path = MOVES_PATH,
    ) -> None:
        self._static_path = static_path
        self._static: dict[str, dict[str, Any]] = {}
        self._pbs: dict[str, dict[str, Any]] = {}
        self._pbs_source: Optional[Path] = None
        self._loaded: bool = False
        self.reload_static()
        self._loaded = bool(self._static)

    def reload_static(self) -> None:
        self._static = {}
        if not self._static_path.is_file():
            log.warning(f"moves.json missing at {self._static_path}")
            return
        try:
            with self._static_path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (json.JSONDecodeError, OSError) as exc:
            log.error(f"Could not read moves.json: {exc}")
            return
        if not isinstance(data, dict):
            return
        moves = data.get("moves")
        if not isinstance(moves, dict):
            return
        cleaned: dict[str, dict[str, Any]] = {}
        for name, info in moves.items():
            if not isinstance(name, str) or not isinstance(info, dict):
                continue
            t = info.get("type")
            if not isinstance(t, str) or not t:
                continue
            cleaned[_normalize_key(name)] = {
                "type": t,
                "category": str(info.get("category", "?")),
                "power": int(info.get("power", 0) or 0),
                "accuracy": int(info.get("accuracy", 0) or 0),
                "pp": int(info.get("pp", 0) or 0),
                "source": "static",
            }
        self._static = cleaned
        log.info(f"Loaded static moves: {len(self._static)} moves")

    def load_pbs(self, pbs_path: str | Path) -> int:
        """Load moves from a PBS/moves.txt file. Returns count loaded."""
        try:
            pbs_data = parse_moves_pbs(pbs_path)
        except (FileNotFoundError, OSError) as exc:
            log.error(f"Could not load PBS moves: {exc}")
            return 0
        self._pbs = pbs_data
        self._pbs_source = Path(pbs_path)
        self._loaded = True
        log.info(
            f"Loaded {len(self._pbs)} moves from PBS ({self._pbs_source}), "
            f"static fallback: {len(self._static)}"
        )
        return len(self._pbs)

    def auto_load_pbs(self, save_path: Optional[Path | str] = None) -> Optional[Path]:
        """Try to find and load a PBS file automatically. Returns path if loaded."""
        found = find_pbs_files(save_path=save_path)
        moves_path = found.get("moves")
        if moves_path is None:
            return None
        if self.load_pbs(moves_path) > 0:
            return moves_path
        return None

    @property
    def loaded(self) -> bool:
        return self._loaded or bool(self._static)

    @property
    def pbs_source(self) -> Optional[Path]:
        return self._pbs_source

    def clear_pbs(self) -> None:
        """Clear PBS overlay data, reverting to static moves only."""
        self._pbs = {}
        self._pbs_source = None
        log.info("PBS moves cleared, using static database only")

    def get(self, name: str) -> Optional[dict[str, Any]]:
        """Look up a move by name. Returns a dict or None."""
        if not name:
            return None
        key = _normalize_key(name)
        if key in self._pbs:
            out = dict(self._pbs[key])
            out["source"] = "pbs"
            return out
        if key in self._static:
            out = dict(self._static[key])
            out["source"] = "static"
            return out
        guessed = self._guess_type(name)
        if guessed is None:
            return None
        return {
            "type": guessed,
            "category": "?",
            "power": 0,
            "accuracy": 0,
            "pp": 0,
            "source": "heuristic",
            "guessed": True,
        }

    def get_type(self, name: str) -> Optional[str]:
        info = self.get(name)
        return info["type"] if info else None

    def _guess_type(self, name: str) -> Optional[str]:
        upper = (name or "").upper()
        for substring, t in TYPE_HEURISTICS:
            if substring in upper:
                return t
        return None

    def lookup_many(self, names: list[str]) -> dict[str, Optional[dict[str, Any]]]:
        """Batch lookup; useful for an entire party."""
        return {n: self.get(n) for n in names if n}

    def to_api(self) -> dict[str, Any]:
        """Return the merged database for the frontend."""
        merged: dict[str, dict[str, Any]] = {}
        for k, v in self._static.items():
            merged[k] = dict(v)
            merged[k]["source"] = "static"
        for k, v in self._pbs.items():
            merged[k] = dict(v)
            merged[k]["source"] = "pbs"
        return {
            "loaded": self.loaded,
            "pbs_source": str(self._pbs_source) if self._pbs_source else None,
            "static_count": len(self._static),
            "pbs_count": len(self._pbs),
            "merged_count": len(merged),
            "moves": merged,
        }
