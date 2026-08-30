"""Round-3 tests for saveparser party/trainer extraction.

Builds real Ruby Marshal blobs via rubymarshal.writer.writes with
RubyObject structures (same technique as test_save_coords.py), so the
full _parse_and_extract path is covered.
"""
from pathlib import Path

from rubymarshal.classes import RubyObject, Symbol
from rubymarshal.writer import writes
from saveparser import _parse_and_extract


def _pkm(
    species: str,
    level: int = 25,
    hp: int = 60,
    max_hp: int = 70,
    status: int = 0,
    moves: list[str] | None = None,
    **extra,
) -> RubyObject:
    attrs = {
        "@species": Symbol(species),
        "@level": level,
        "@hp": hp,
        "@totalhp": max_hp,
        "@status": status,
        "@moves": [Symbol(m) for m in (moves or [])],
    }
    attrs.update(extra)
    return RubyObject("PokeBattle_Pokemon", attrs)


def _blob(trainer_attrs: dict, **top) -> bytes:
    top_key = {"$Trainer": RubyObject("PokeBattle_Trainer", trainer_attrs)}
    top_key.update(top)
    return writes(top_key)


def test_party_and_trainer_basics():
    data = _parse_and_extract(
        _blob({
            "@name": "Red",
            "@money": 3000,
            "@badges": 8,
            "@party": [_pkm("PIKACHU"), _pkm("CHARIZARD", level=36, hp=100, max_hp=120)],
        }),
        None,
        "test",
    )
    assert data.trainer_name == "Red"
    assert data.money == 3000
    assert data.badges == 8
    assert len(data.party) == 2
    assert data.party[0].species == "PIKACHU"
    assert data.party[0].level == 25
    assert data.party[0].hp == 60
    assert data.party[0].max_hp == 70
    assert data.party[1].species == "CHARIZARD"


def test_status_mapping():
    data = _parse_and_extract(
        _blob({"@name": "Red", "@party": [_pkm("PIKACHU", status=4)]}),
        None,
        "test",
    )
    assert data.party[0].status_name == "SLP"  # STATUS_NAMES[4]


def test_moves_symbols_and_cap_at_four():
    moves = ["THUNDERBOLT", "IRONTAIL", "QUICKATTACK", "VOLTTACKLE", "EXTRAMOVE"]
    data = _parse_and_extract(
        _blob({"@name": "Red", "@party": [_pkm("PIKACHU", moves=moves)]}),
        None,
        "test",
    )
    assert data.party[0].moves == moves[:4]


def test_iv_hash_format():
    pkm = _pkm("PIKACHU", **{"@iv": {"HP": 31, "ATTACK": 30, "SPEED": "x"}})
    data = _parse_and_extract(_blob({"@name": "Red", "@party": [pkm]}), None, "test")
    member = data.party[0]
    assert member.iv_hp == 31
    assert member.iv_attack == 30
    assert member.iv_speed is None  # "x" is not an int -> None
    assert member.iv_defense is None  # absent -> None


def test_non_pokemon_party_entries_skipped():
    data = _parse_and_extract(
        _blob({
            "@name": "Red",
            "@party": [
                "junk string",
                12345,
                _pkm("PIKACHU"),
                RubyObject("Bag", {"@items": []}),  # RubyObject without @species
            ],
        }),
        None,
        "test",
    )
    assert len(data.party) == 1
    assert data.party[0].species == "PIKACHU"


def test_badges_list_counts_truthy():
    data = _parse_and_extract(
        _blob({
            "@name": "Red",
            "@badges": [True, True, False, True],
            "@party": [],
        }),
        None,
        "test",
    )
    assert data.badges == 3


def test_badges_garbage_becomes_zero():
    data = _parse_and_extract(
        _blob({"@name": "Red", "@badges": "many", "@party": []}),
        None,
        "test",
    )
    assert data.badges == 0


def test_money_garbage_becomes_zero():
    data = _parse_and_extract(
        _blob({"@name": "Red", "@money": "rich", "@party": []}),
        None,
        "test",
    )
    assert data.money == 0


def test_missing_trainer_yields_empty_defaults():
    data = _parse_and_extract(writes({"$game_map": RubyObject("Game_Map", {})}), None, "test")
    assert data.trainer_name == ""
    assert data.party == []
    assert data.money == 0
    assert data.badges == 0


def test_party_moves_int_ids_v19_style():
    # v19+ can store moves as integer IDs; they pass through as strings.
    pkm = RubyObject("PokeBattle_Pokemon", {
        "@species": Symbol("PIKACHU"),
        "@level": 25,
        "@hp": 60,
        "@totalhp": 70,
        "@status": 0,
        "@moves": [17, 85, "THUNDERBOLT"],
    })
    data = _parse_and_extract(_blob({"@name": "Red", "@party": [pkm]}), None, "test")
    assert data.party[0].moves == ["17", "85", "THUNDERBOLT"]


def test_types_from_instance_attrs(tmp_path: Path):
    pkm = _pkm("PIKACHU", **{"@type1": Symbol("ELECTRIC"), "@type2": None})
    data = _parse_and_extract(_blob({"@name": "Red", "@party": [pkm]}), None, "test")
    assert data.party[0].type1 == "ELECTRIC"
