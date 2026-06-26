"""Parser for Pokémon Essentials PBS (Plain-text Black-list Script) files.

PBS files use an INI-like section format:

    [0]
    Name = Tackle
    Type = NORMAL
    Category = Physical
    Power = 40
    Accuracy = 100
    PP = 35

    [1]
    Name = Scratch
    ...

Lines starting with ``#`` are comments. Section IDs are integers but are
not semantically meaningful (they're just lookup keys). The ``Name`` field
is the canonical human-readable identifier (e.g. ``"Thunder Punch"``)
and is normalized to uppercase-with-no-special-chars for matching against
move constants in save files.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Optional

log = logging.getLogger("pokemon-overlay.pbsparser")

# Normalize a human-readable name to its symbol form, e.g.:
#   "Thunder Punch"  → "THUNDERPUNCH"
#   "Mr. Mime"       → "MRMIME"
#   "Farfetch'd"     → "FARFETCHD"
_NON_ALNUM = re.compile(r"[^A-Z0-9]+")


def normalize_name(name: str) -> str:
    """Normalize a PBS display name to its constant symbol form."""
    if not name:
        return ""
    upper = name.upper()
    cleaned = _NON_ALNUM.sub("", upper)
    return cleaned


def parse_pbs_file(path: str | Path) -> list[dict[str, str]]:
    """Parse a PBS file into a list of sections (each a dict of key→raw value)."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"PBS file not found: {p}")
    with p.open("r", encoding="utf-8", errors="replace") as fh:
        return parse_pbs_text(fh.read())


def parse_pbs_text(text: str) -> list[dict[str, str]]:
    """Parse PBS text content into sections."""
    sections: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("[") and stripped.endswith("]"):
            if current is not None:
                sections.append(current)
            section_id = stripped[1:-1].strip()
            current = {"__id__": section_id}
            continue
        if "=" not in stripped:
            continue
        if current is None:
            continue
        key, _, value = stripped.partition("=")
        current[key.strip()] = value.strip()
    if current is not None:
        sections.append(current)
    return sections


def parse_moves_pbs(path: str | Path) -> dict[str, dict[str, Any]]:
    """Parse ``PBS/moves.txt`` and return ``{normalized_name: move_info}``."""
    sections = parse_pbs_file(path)
    out: dict[str, dict[str, Any]] = {}
    for sec in sections:
        name = sec.get("Name", "")
        norm = normalize_name(name)
        if not norm:
            continue
        try:
            power = int(sec.get("Power", "0") or "0")
        except ValueError:
            power = 0
        try:
            accuracy = int(sec.get("Accuracy", "0") or "0")
        except ValueError:
            accuracy = 0
        try:
            pp = int(sec.get("PP", "0") or "0")
        except ValueError:
            pp = 0
        out[norm] = {
            "name": name,
            "normalized": norm,
            "type": sec.get("Type", "").title(),
            "category": sec.get("Category", "?"),
            "power": power,
            "accuracy": accuracy,
            "pp": pp,
            "description": sec.get("Description", ""),
            "function_code": sec.get("FunctionCode", ""),
            "target": sec.get("Target", ""),
            "source": "pbs",
        }
    log.info(f"Parsed {len(out)} moves from PBS file: {path}")
    return out


def parse_pokemon_pbs(path: str | Path) -> dict[str, dict[str, Any]]:
    """Parse ``PBS/pokemon.txt`` and return ``{normalized_name: species_info}``."""
    sections = parse_pbs_file(path)
    out: dict[str, dict[str, Any]] = {}
    for sec in sections:
        name = sec.get("Name", "")
        norm = normalize_name(name)
        if not norm:
            continue
        try:
            base_stats = [int(x) for x in sec.get("BaseStats", "").split(",") if x.strip()]
        except ValueError:
            base_stats = []
        try:
            ev_yield = [int(x) for x in sec.get("EffortPoints", "").split(",") if x.strip()]
        except ValueError:
            ev_yield = []
        type1 = sec.get("Type1", "")
        type2 = sec.get("Type2", "")
        abilities = [
            normalize_name(a)
            for a in sec.get("Abilities", "").split(",")
            if a.strip()
        ]
        hidden_ability = sec.get("HiddenAbility", "")
        if hidden_ability:
            abilities.append(normalize_name(hidden_ability))
        moves = sec.get("Moves", "")
        move_ids: list[int] = []
        for m in moves.split(","):
            m = m.strip()
            if not m:
                continue
            try:
                move_ids.append(int(m))
            except ValueError:
                pass
        out[norm] = {
            "name": name,
            "normalized": norm,
            "type1": type1.title() if type1 else None,
            "type2": type2.title() if type2 else None,
            "base_stats": base_stats,
            "ev_yield": ev_yield,
            "growth_rate": sec.get("GrowthRate", ""),
            "base_experience": int(sec.get("BaseExperience", "0") or "0"),
            "happiness": int(sec.get("Happiness", "70") or "70"),
            "rareness": int(sec.get("Rareness", "0") or "0"),
            "abilities": abilities,
            "move_ids": move_ids,
            "egg_moves": sec.get("EggMoves", ""),
            "source": "pbs",
        }
    log.info(f"Parsed {len(out)} species from PBS file: {path}")
    return out


def parse_types_pbs(path: str | Path) -> dict[str, dict[str, Any]]:
    """Parse ``PBS/types.txt`` for type data (weaknesses, resistances, immunities)."""
    sections = parse_pbs_file(path)
    out: dict[str, dict[str, Any]] = {}
    for sec in sections:
        name = sec.get("Name", "")
        norm = normalize_name(name)
        if not norm:
            continue
        out[norm] = {
            "name": name,
            "normalized": norm,
            "is_special": sec.get("IsSpecial", "false").lower() == "true",
            "weaknesses": sec.get("Weaknesses", ""),
            "resistances": sec.get("Resistances", ""),
            "immunities": sec.get("Immunities", ""),
            "source": "pbs",
        }
    return out
