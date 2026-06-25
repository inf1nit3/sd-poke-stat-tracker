"""Pokémon Essentials .rxdata save-file parser.

Reads RPG Maker XP / RGSS2 save files (Ruby Marshal v4.8) via the
``rubymarshal`` package and extracts a normalized ``SaveData``
representation. Designed to be tolerant of format drift between
Essentials v16 and v21.

The parser is *read-only* and never modifies the file.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

from rubymarshal.classes import RubyObject, Symbol
from rubymarshal.reader import loads as marshal_loads

log = logging.getLogger("pokemon-overlay.saveparser")

MARSHAL_VERSION = b"\x04\x08"

STATUS_NAMES: dict[int, str] = {
    0: "OK",
    1: "PSN",
    2: "PAR",
    3: "BRN",
    4: "SLP",
    5: "FRZ",
    6: "FNT",
}

GENDER_NAMES: dict[int, str] = {
    0: "M",
    1: "F",
    2: "—",
}


@dataclass
class PokemonSummary:
    species: str
    nickname: Optional[str]
    level: int
    hp: int
    max_hp: int
    status: int
    status_name: str
    type1: Optional[str]
    type2: Optional[str]
    moves: list[str] = field(default_factory=list)
    ability: Optional[str] = None
    item: Optional[str] = None
    gender: int = 0
    gender_name: str = "?"
    shiny: bool = False
    nature: Optional[str] = None
    attack: Optional[int] = None
    defense: Optional[int] = None
    spatk: Optional[int] = None
    spdef: Optional[int] = None
    speed: Optional[int] = None
    iv_hp: Optional[int] = None
    iv_attack: Optional[int] = None
    iv_defense: Optional[int] = None
    iv_spatk: Optional[int] = None
    iv_spdef: Optional[int] = None
    iv_speed: Optional[int] = None
    ev_hp: Optional[int] = None
    ev_attack: Optional[int] = None
    ev_defense: Optional[int] = None
    ev_spatk: Optional[int] = None
    ev_spdef: Optional[int] = None
    ev_speed: Optional[int] = None
    happiness: Optional[int] = None

    @property
    def hp_percent(self) -> float:
        if self.max_hp <= 0:
            return 0.0
        return max(0.0, min(1.0, self.hp / self.max_hp))

    @property
    def is_fainted(self) -> bool:
        return self.hp <= 0 or self.status == 6

    @property
    def iv_total(self) -> Optional[int]:
        if any(v is None for v in (self.iv_hp, self.iv_attack, self.iv_defense, self.iv_spatk, self.iv_spdef, self.iv_speed)):
            return None
        return sum(
            v for v in (
                self.iv_hp, self.iv_attack, self.iv_defense,
                self.iv_spatk, self.iv_spdef, self.iv_speed,
            ) if v is not None
        )

    @property
    def ev_total(self) -> Optional[int]:
        if any(v is None for v in (self.ev_hp, self.ev_attack, self.ev_defense, self.ev_spatk, self.ev_spdef, self.ev_speed)):
            return None
        return sum(
            v for v in (
                self.ev_hp, self.ev_attack, self.ev_defense,
                self.ev_spatk, self.ev_spdef, self.ev_speed,
            ) if v is not None
        )

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["hp_percent"] = self.hp_percent
        d["is_fainted"] = self.is_fainted
        d["iv_total"] = self.iv_total
        d["ev_total"] = self.ev_total
        d["has_ivs"] = self.iv_hp is not None
        d["has_evs"] = self.ev_hp is not None
        d["has_happiness"] = self.happiness is not None
        d["has_ability"] = self.ability is not None
        d["has_item"] = self.item is not None
        d["has_nature"] = self.nature is not None
        d["has_stats"] = any(
            v is not None
            for v in (self.attack, self.defense, self.spatk, self.spdef, self.speed)
        )
        d["has_moves"] = len(self.moves) > 0
        d["has_type2"] = self.type2 is not None
        d["has_gender_data"] = self.gender_name != "?"
        return d


@dataclass
class SaveData:
    version: str
    essentials_version: Optional[str]
    trainer_name: str
    party: list[PokemonSummary]
    money: int
    badges: int
    location_name: str
    map_id: Optional[int]
    x: Optional[int]
    y: Optional[int]
    play_time_seconds: int
    parsed_at: float
    source_path: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "essentials_version": self.essentials_version,
            "trainer_name": self.trainer_name,
            "party": [p.to_dict() for p in self.party],
            "party_count": len(self.party),
            "money": self.money,
            "badges": self.badges,
            "location_name": self.location_name,
            "map_id": self.map_id,
            "x": self.x,
            "y": self.y,
            "play_time_seconds": self.play_time_seconds,
            "parsed_at": self.parsed_at,
            "source_path": self.source_path,
            "features": self._compute_features(),
        }

    def _compute_features(self) -> dict[str, bool]:
        """Aggregate which data the save actually contains.

        The UI uses this to hide sections that would otherwise be empty
        placeholders, e.g. a v16 save without IVs or a v17 save with no
        item held.
        """
        version_supports_shiny = self.version in ("v17+", "v18+", "v21+")
        version_supports_nature = version_supports_shiny or self.version == "v17"
        version_supports_ivs = version_supports_nature

        features: dict[str, bool] = {
            "ivs": False,
            "evs": False,
            "happiness": False,
            "stats": False,
            "moves": False,
            "natures": False,
            "abilities": False,
            "items": False,
            "type2": False,
            "shiny": version_supports_shiny,
            "gender": False,
        }
        for p in self.party:
            if p.iv_hp is not None:
                features["ivs"] = True
            if p.ev_hp is not None:
                features["evs"] = True
            if p.happiness is not None:
                features["happiness"] = True
            if any(
                v is not None
                for v in (p.attack, p.defense, p.spatk, p.spdef, p.speed)
            ):
                features["stats"] = True
            if p.moves:
                features["moves"] = True
            if p.nature is not None:
                features["natures"] = True
            if p.ability is not None:
                features["abilities"] = True
            if p.item is not None:
                features["items"] = True
            if p.type2 is not None:
                features["type2"] = True
            if p.gender_name != "?":
                features["gender"] = True
        return features


class SaveParseError(Exception):
    """Raised when a save file cannot be parsed."""


def _symbol_name(value: Any) -> Optional[str]:
    """Extract the name from a Ruby Symbol. Returns plain ``str`` or ``None``."""
    if value is None:
        return None
    if isinstance(value, Symbol):
        n = getattr(value, "name", None)
        return str(n) if n is not None else None
    if isinstance(value, str):
        return str(value)
    return str(value)


def _plain_str(value: Any) -> Optional[str]:
    """Force a value to a plain ``str`` (or ``None``). Avoids subclasses like RubyString
    that have ``__getattr__`` overrides which break ``dataclasses.asdict``/``deepcopy``."""
    if value is None:
        return None
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("latin-1", errors="replace")
    if isinstance(value, Symbol):
        n = getattr(value, "name", None)
        return str(n) if n is not None else None
    return str(value)


def _attr(obj: Any, *names: str) -> Any:
    """Look up an instance variable on a RubyObject or dict.

    Pokémon Essentials v21 forks (e.g. Pokémon Vanguard) store attributes
    under ``@@``-prefixed class-variable keys rather than ``@``-prefixed
    instance-variable keys, and Symbol keys don't compare equal to
    plain strings. We therefore try each candidate name in both string
    and Symbol forms, and accept the ``@@`` variant when ``@`` is
    requested.
    """
    if obj is None:
        return None
    if isinstance(obj, RubyObject):
        attrs = obj.attributes or {}
    elif isinstance(obj, dict):
        attrs = obj
    else:
        return None

    expanded: list[str] = []
    for n in names:
        expanded.append(n)
        if n.startswith("@") and not n.startswith("@@"):
            expanded.append("@@" + n[1:])

    for name in expanded:
        if name in attrs:
            return attrs[name]
        sym = Symbol(name)
        if sym in attrs:
            return attrs[sym]
    return None


def _top_key(parsed: Any, *names: str) -> Any:
    """Look up a top-level key in a parsed save hash, trying both
    string and Symbol keys (covers vanilla ``$Trainer`` style and
    Vanguard ``player`` style).
    """
    if not isinstance(parsed, dict):
        return None
    for name in names:
        if name in parsed:
            return parsed[name]
        sym = Symbol(name)
        if sym in parsed:
            return parsed[sym]
    return None


# ---------------------------------------------------------------------------
# Species → types lookup via the game's PBS/pokemon.txt
# ---------------------------------------------------------------------------
#
# Pokémon Essentials v21+ (and forks like Pokémon Vanguard) no longer
# store ``@type1`` / ``@type2`` on individual Pokémon objects — the
# types live only in the species PBS file. We parse that file once and
# cache the (type1, type2) mapping.
#
# PBS sections can contain multiple forms (a single ``[N]`` block may
# hold a base form followed by ``Name = AltForm`` lines or
# ``InternalName = ALTFOM`` sub-blocks). Each form inherits the type
# information from the enclosing section unless it overrides it.

_SPECIES_TYPES_CACHE: dict[str, tuple[Optional[str], Optional[str]]] | None = None
_SPECIES_TYPES_SOURCE: Optional[Path] = None
_SPECIES_TYPES_LOCK = False


def _read_pbs_multiform(path: Path) -> dict[str, dict[str, str]]:
    """Parse ``PBS/pokemon.txt`` and return ``{internal_name: {attrs}}``.

    Handles multi-form sections by splitting on each ``Name =`` or
    ``InternalName =`` line that introduces a new form within a ``[N]``
    block. Sub-form ``InternalName =`` lines inherit all preceding
    attributes from the enclosing section.
    """
    import re

    out: dict[str, dict[str, str]] = {}
    section_attrs: dict[str, str] = {}
    current_form: Optional[dict[str, str]] = None
    current_internal: Optional[str] = None
    in_section = False

    def flush() -> None:
        nonlocal current_form, current_internal
        if current_internal and current_form is not None:
            out[current_internal] = current_form
        current_form = None
        current_internal = None

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        log.warning(f"Cannot read PBS file {path}: {exc}")
        return out

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        if stripped.startswith("[") and stripped.endswith("]"):
            flush()
            section_attrs = {}
            in_section = True
            continue

        if not in_section or "=" not in stripped:
            continue

        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip()

        if key == "Name":
            # New form within the section. Flush previous form, start fresh
            # form that inherits the section's attributes.
            flush()
            section_attrs["Name"] = value
            current_form = dict(section_attrs)
            # We do NOT set current_internal here — InternalName may follow.
            continue

        if key == "InternalName":
            # Either a top-level internal name for the section's main form,
            # or a sub-form (Vanguard "form" entry). Flush prior sub-form
            # first.
            if current_internal and current_form is not None:
                out[current_internal] = current_form
            current_internal = value
            if current_form is None:
                # First InternalName in this section: main form.
                current_form = dict(section_attrs)
            current_form["InternalName"] = value
            out.setdefault(value, current_form)
            continue

        # Any other attribute belongs to the current form (or the section
        # attributes shared by all forms in this [N]).
        if current_form is not None:
            current_form[key] = value
        section_attrs[key] = value

    flush()
    return out


def _load_species_types_from_pbs(save_path: Optional[Path]) -> dict[str, tuple[Optional[str], Optional[str]]]:
    """Discover ``pokemon.txt`` near ``save_path`` and build the cache.

    Returns ``{INTERNAL_NAME: (Type1, Type2)}``. Missing types are
    returned as ``None``. Returns an empty dict if no PBS file is found.
    """
    mapping: dict[str, tuple[Optional[str], Optional[str]]] = {}

    pbs_path: Optional[Path] = None
    candidates: list[Path] = []

    if save_path is not None:
        p = Path(save_path)
        # Look in the Wine prefix / native install under common PBS paths
        for parent in [p.parent, *p.parents]:
            candidates.append(parent / "PBS" / "pokemon.txt")
            candidates.append(parent / "Data" / "pokemon.txt")
            candidates.append(parent / "data" / "pokemon.txt")
            candidates.append(parent / "pokemon.txt")
            # Walk up to the Wine prefix root and try common sub-paths.
            if "AppData" in parent.parts:
                try:
                    wine_root_idx = parent.parts.index("drive_c") + 1
                    wine_root = Path(*parent.parts[:wine_root_idx])
                    candidates.append(wine_root / "users" / "steamuser" / "Documents" / "Pokemon Vanguard" / "PBS" / "pokemon.txt")
                    candidates.append(wine_root / "Program Files" / "Pokemon Vanguard" / "PBS" / "pokemon.txt")
                except (ValueError, IndexError):
                    pass

    try:
        from pbsfinder import find_pbs_files
        found = find_pbs_files(save_path=save_path)
        if "pokemon" in found:
            candidates.insert(0, found["pokemon"])
    except Exception as exc:
        log.debug(f"pbsfinder not available or failed: {exc}")

    # Native Linux installs: search common Downloads/game folders. This is
    # a slow rglob but only runs once per process (results are cached).
    for native_root in (
        Path("/home/deck/Downloads"),
        Path.home() / "Downloads",
        Path("/home/deck/Desktop"),
    ):
        if not native_root.is_dir():
            continue
        try:
            for cand in native_root.rglob("PBS/pokemon.txt"):
                if cand.is_file() and os.access(cand, os.R_OK):
                    candidates.append(cand)
                    break  # first match per root is good enough
        except OSError:
            continue

    seen: set[Path] = set()
    for cand in candidates:
        if cand in seen:
            continue
        seen.add(cand)
        if cand.is_file() and os.access(cand, os.R_OK):
            pbs_path = cand
            break

    if pbs_path is None:
        log.info("No PBS/pokemon.txt found for species-type lookup")
        return mapping

    sections = _read_pbs_multiform(pbs_path)
    for internal_name, attrs in sections.items():
        t1 = attrs.get("Type1") or attrs.get("type1")
        t2 = attrs.get("Type2") or attrs.get("type2")
        # Normalize: skip if values are the literal string "Type1"
        if t1 and not t1.startswith("Type"):
            t1 = t1.title()
        else:
            t1 = None
        if t2 and not t2.startswith("Type"):
            t2 = t2.title()
        else:
            t2 = None
        mapping[internal_name.upper()] = (t1, t2)

    log.info(
        f"Loaded types for {len(mapping)} species from PBS: {pbs_path}"
    )
    return mapping


def _get_species_types(
    species: str,
    save_path: Optional[Path] = None,
) -> tuple[Optional[str], Optional[str]]:
    """Return ``(type1, type2)`` for a species constant like ``CROCONAWT``.

    Caches the entire PBS mapping for the lifetime of the process.
    """
    global _SPECIES_TYPES_CACHE, _SPECIES_TYPES_SOURCE, _SPECIES_TYPES_LOCK
    if not species:
        return (None, None)
    if _SPECIES_TYPES_CACHE is None and not _SPECIES_TYPES_LOCK:
        _SPECIES_TYPES_LOCK = True
        try:
            _SPECIES_TYPES_CACHE = _load_species_types_from_pbs(save_path)
            _SPECIES_TYPES_SOURCE = save_path
        finally:
            _SPECIES_TYPES_LOCK = False
    if _SPECIES_TYPES_CACHE is None:
        return (None, None)
    return _SPECIES_TYPES_CACHE.get(species.upper(), (None, None))


def reset_species_cache() -> None:
    """Clear the cached species→types mapping (test helper)."""
    global _SPECIES_TYPES_CACHE, _SPECIES_TYPES_SOURCE
    _SPECIES_TYPES_CACHE = None
    _SPECIES_TYPES_SOURCE = None


def _parse_pokemon(obj: Any, save_path: Optional[Path] = None) -> Optional[PokemonSummary]:
    if not isinstance(obj, RubyObject):
        return None
    attrs = obj.attributes or {}

    species = _symbol_name(_attr(obj, "@species", "species"))
    if not species:
        return None

    moves_raw = _attr(obj, "@moves", "moves") or []
    moves: list[str] = []
    if isinstance(moves_raw, (list, tuple)):
        for m in moves_raw:
            n: Any = None
            if isinstance(m, RubyObject):
                # v21+ stores moves as Pokemon::Move objects with @id.
                # v17 stored them as Symbols or strings directly.
                n = _attr(m, "@id", "id")
            n = _symbol_name(n)
            if n:
                moves.append(n)

    def _int(value: Any, default: int = 0) -> int:
        if value is None:
            return default
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    status = _int(_attr(obj, "@status", "status"), 0)
    shiny_raw = _attr(obj, "@shiny", "shiny")

    # Types: try per-instance first (v17), fall back to PBS lookup (v21+).
    type1 = _symbol_name(_attr(obj, "@type1", "type1"))
    type2 = _symbol_name(_attr(obj, "@type2", "type2"))
    if not type1 and not type2:
        pbs_type1, pbs_type2 = _get_species_types(species, save_path=save_path)
        type1 = pbs_type1
        type2 = pbs_type2

    return PokemonSummary(
        species=species,
        nickname=_plain_str(_attr(obj, "@name", "name")),
        level=_int(_attr(obj, "@level", "level"), 1),
        hp=_int(_attr(obj, "@hp", "hp"), 0),
        max_hp=_int(_attr(obj, "@totalhp", "@totalHP", "totalhp", "totalHP"), 1),
        status=status,
        status_name=STATUS_NAMES.get(status, "?"),
        type1=type1,
        type2=type2,
        moves=moves[:4],
        ability=_symbol_name(_attr(obj, "@ability", "ability")),
        item=_symbol_name(_attr(obj, "@item", "item")),
        gender=_int(_attr(obj, "@gender", "gender"), 0),
        gender_name=GENDER_NAMES.get(_int(_attr(obj, "@gender", "gender"), 0), "?"),
        shiny=bool(shiny_raw) if shiny_raw is not None else False,
        nature=_symbol_name(_attr(obj, "@nature", "nature")),
        attack=_int(_attr(obj, "@attack", "attack"), 0) or None,
        defense=_int(_attr(obj, "@defense", "defense"), 0) or None,
        spatk=_int(_attr(obj, "@spatk", "@spatk", "spatk", "specialattack"), 0) or None,
        spdef=_int(_attr(obj, "@spdef", "spdef", "specialdefense"), 0) or None,
        speed=_int(_attr(obj, "@speed", "speed"), 0) or None,
        **_parse_iv_ev_happiness(obj),
    )


_STAT_KEYS_IV_EV: list[tuple[str, tuple[str, ...]]] = [
    ("hp", ("HP", "hp", 0)),
    ("attack", ("ATTACK", "ATK", "attack", 1)),
    ("defense", ("DEFENSE", "DEF", "defense", 2)),
    ("spatk", ("SPECIALATTACK", "SPATK", "SPATTACK", "spatk", 3)),
    ("spdef", ("SPECIALDEFENSE", "SPDEF", "SPDEFENSE", "spdef", 4)),
    ("speed", ("SPEED", "SPEEDSTAT", "speed", 5)),
]


def _stat_to_str(stat: Any) -> str:
    if isinstance(stat, str):
        return stat
    if isinstance(stat, Symbol):
        n = getattr(stat, "name", None)
        return str(n) if n else ""
    return str(stat) if stat is not None else ""


def _parse_iv_ev_happiness(obj: Any) -> dict[str, Optional[int]]:
    """Extract IV, EV, happiness from a Pokemon object.

    Accepts both hash format ``{HP: 31, ATK: 31, ...}`` and array format
    ``[31, 31, 31, 31, 31, 31]`` (HP, ATK, DEF, SPA, SPD, SPE order).
    Missing values come through as ``None``.
    """
    out: dict[str, Optional[int]] = {
        "iv_hp": None, "iv_attack": None, "iv_defense": None,
        "iv_spatk": None, "iv_spdef": None, "iv_speed": None,
        "ev_hp": None, "ev_attack": None, "ev_defense": None,
        "ev_spatk": None, "ev_spdef": None, "ev_speed": None,
        "happiness": None,
    }

    for ivar, prefix in (("@iv", "iv_"), ("@ev", "ev_")):
        raw = _attr(obj, ivar, ivar.lstrip("@"))
        if raw is None:
            continue
        if isinstance(raw, dict):
            lookup: dict[str, int] = {}
            for k, v in raw.items():
                key = _stat_to_str(k).upper()
                try:
                    val = int(v)
                except (TypeError, ValueError):
                    continue
                lookup[key] = val
            for stat_name, candidates in _STAT_KEYS_IV_EV:
                target_key = prefix + stat_name
                for cand in candidates:
                    if cand in lookup:
                        out[target_key] = lookup[cand]
                        break
        elif isinstance(raw, (list, tuple)):
            for i, v in enumerate(raw):
                if i >= 6:
                    break
                try:
                    val = int(v)
                except (TypeError, ValueError):
                    continue
                stat_name = _STAT_KEYS_IV_EV[i][0]
                out[prefix + stat_name] = val

    h_raw = _attr(obj, "@happiness", "happiness")
    if h_raw is not None:
        try:
            out["happiness"] = int(h_raw)
        except (TypeError, ValueError):
            pass

    return out


def _detect_version(parsed: dict[str, Any]) -> str:
    """Best-effort Essentials version guess based on field presence."""
    trainer = parsed.get("$Trainer")
    if not isinstance(trainer, RubyObject):
        return "unknown"
    party = trainer.attributes.get("@party", []) if trainer.attributes else []
    if not party or not isinstance(party[0], RubyObject):
        return "unknown"
    sample_attrs = party[0].attributes or {}
    if "@dynamax" in sample_attrs or "@gigantamax" in sample_attrs:
        return "v21+"
    if "@tera_type" in sample_attrs:
        return "v21+"
    if "@happiness" in sample_attrs and "@ev" in sample_attrs:
        return "v18+"
    if "@shiny" in sample_attrs and "@nature" in sample_attrs:
        return "v17+"
    if "@level" in sample_attrs:
        return "v16+"
    return "unknown"


def parse_save_file(path: str | Path) -> SaveData:
    """Parse a Pokémon Essentials ``Game.rxdata`` save file.

    Raises ``SaveParseError`` for any structural problem. The error
    message is safe to expose to the user.
    """
    p = Path(path)
    if not p.is_file():
        raise SaveParseError(f"Save file not found: {p}")
    try:
        with p.open("rb") as fh:
            raw = fh.read()
    except OSError as exc:
        raise SaveParseError(f"Cannot read save file: {exc}") from exc

    return _parse_and_extract(raw, save_path=p, source=str(p))


def parse_save_blob(
    raw: bytes,
    source: str = "<memory>",
    save_path: Optional[Path] = None,
) -> SaveData:
    """Parse a save blob from raw bytes.

    Used by ``LiveMemoryReader`` which reads the save from the
    running game process's heap rather than from a file. The
    ``source`` argument is purely informational and surfaces in
    error messages / debug logs.

    ``save_path`` is used for PBS lookup (so per-species types
    can be resolved). For memory reads, pass the on-disk save path
    so the PBS loader can find ``pokemon.txt`` next to it.
    """
    return _parse_and_extract(raw, save_path=save_path, source=source)


def _parse_and_extract(
    raw: bytes,
    save_path: Optional[Path],
    source: str,
) -> SaveData:
    if len(raw) < 2 or raw[:2] != MARSHAL_VERSION:
        raise SaveParseError(
            f"Not a Ruby Marshal v4.8 file "
            f"(header={raw[:2].hex() if raw else 'empty'}, source={source})"
        )

    try:
        parsed = marshal_loads(raw)
    except Exception as exc:
        raise SaveParseError(f"Marshal parse failed: {exc}") from exc

    if not isinstance(parsed, dict):
        raise SaveParseError("Top-level structure is not a hash")

    trainer = _top_key(parsed, "$Trainer", "player", "Trainer")
    trainer_name = ""
    party_objs: list[Any] = []
    money = 0
    badges = 0

    if isinstance(trainer, RubyObject):
        raw_name = _attr(trainer, "@name", "name")
        if isinstance(raw_name, str):
            trainer_name = raw_name
        elif raw_name is not None:
            trainer_name = str(raw_name)
        party_raw = _attr(trainer, "@party", "party")
        if isinstance(party_raw, list):
            party_objs = party_raw
        money_raw = _attr(trainer, "@money", "money")
        try:
            money = int(money_raw or 0)
        except (TypeError, ValueError):
            money = 0
        badges_raw = _attr(trainer, "@badges", "badges")
        if isinstance(badges_raw, list):
            badges = len([b for b in badges_raw if b])
        elif badges_raw is not None:
            try:
                badges = int(badges_raw)
            except (TypeError, ValueError):
                badges = 0

    party: list[PokemonSummary] = []
    for p_obj in party_objs:
        if not isinstance(p_obj, RubyObject):
            continue
        try:
            summary = _parse_pokemon(p_obj, save_path=save_path)
        except Exception as exc:
            log.warning(f"Skipping malformed party member: {exc}")
            summary = None
        if summary is not None:
            party.append(summary)

    game_map = _top_key(parsed, "$game_map", "map_factory", "map_metadata", "game_map")
    location_name = ""
    map_id: Optional[int] = None
    if isinstance(game_map, RubyObject):
        attrs = game_map.attributes or {}
        location_name = str(_attr(game_map, "@map_name", "display_name", "name", "@name") or "")
        raw_mid = _attr(game_map, "@map_id", "map_id")
        if raw_mid is not None:
            try:
                map_id = int(raw_mid)
            except (TypeError, ValueError):
                map_id = None
    elif isinstance(game_map, dict):
        location_name = str(game_map.get("display_name", "") or "")
        raw_mid = game_map.get("map_id")
        if raw_mid is not None:
            try:
                map_id = int(raw_mid)
            except (TypeError, ValueError):
                map_id = None

    game_player = _top_key(parsed, "$game_player", "game_player")
    x: Optional[int] = None
    y: Optional[int] = None
    if isinstance(game_player, RubyObject):
        for attr, target in (("@x", "x"), ("@y", "y"), ("@real_x", "real_x"), ("@real_y", "real_y")):
            raw = _attr(game_player, attr, target)
            if raw is None:
                continue
            try:
                if attr in ("@x", "@real_x"):
                    x = int(raw)
                else:
                    y = int(raw)
            except (TypeError, ValueError):
                pass
    elif isinstance(game_player, dict):
        for key, target in (("x", "x"), ("y", "y")):
            raw = game_player.get(target)
            if raw is None:
                continue
            try:
                if key == "x":
                    x = int(raw)
                else:
                    y = int(raw)
            except (TypeError, ValueError):
                pass

    pg = _top_key(parsed, "$PokemonGlobal", "PokemonGlobal", "global_metadata", "stats")
    play_time = 0
    if isinstance(pg, RubyObject):
        raw_pt = _attr(pg, "@play_time", "play_time")
        try:
            play_time = int(raw_pt or 0)
        except (TypeError, ValueError):
            play_time = 0
    elif isinstance(pg, dict):
        try:
            play_time = int(pg.get("play_time", 0) or 0)
        except (TypeError, ValueError):
            play_time = 0

    return SaveData(
        version=_detect_version(parsed),
        essentials_version=None,
        trainer_name=trainer_name,
        party=party,
        money=money,
        badges=badges,
        location_name=location_name,
        map_id=map_id,
        x=x,
        y=y,
        play_time_seconds=play_time,
        parsed_at=time.time(),
        source_path=source,
    )
