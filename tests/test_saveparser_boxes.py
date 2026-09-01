"""Round-14 feature tests: PC box extraction + Hidden Power type.

Boxes: real Ruby Marshal blobs with a ``$PokemonStorage`` structure
(same technique as test_party_extraction.py). Hidden Power: the gen 3+
IV formula, both unit-level and through PokemonSummary.to_dict.
"""

import pytest
from rubymarshal.classes import RubyObject, Symbol
from rubymarshal.writer import writes
from saveparser import (
    PokemonSummary,
    SaveParseError,
    _hidden_power_type,
    parse_boxes_blob,
)


def _pkm(species: str, level: int = 25) -> RubyObject:
    return RubyObject(
        "PokeBattle_Pokemon",
        {
            "@species": Symbol(species),
            "@level": level,
            "@hp": 60,
            "@totalhp": 70,
            "@status": 0,
            "@moves": [Symbol("TACKLE")],
        },
    )


def _storage_blob(boxes: list[RubyObject]) -> bytes:
    return writes(
        {
            "$PokemonStorage": RubyObject(
                "PokemonStorage", {"@boxes": boxes}
            )
        }
    )


def _box(name: str, mons: list) -> RubyObject:
    return RubyObject("PokemonBox", {"@name": name, "@mon": mons})


def test_boxes_roundtrip_two_boxes():
    blob = _storage_blob(
        [
            _box("Box 1", [None, _pkm("PIKACHU", 25), _pkm("GEODUDE", 12)]),
            _box("Box 2", [_pkm("CHARIZARD", 36)]),
        ]
    )
    out = parse_boxes_blob(blob)
    assert out["box_count"] == 2
    b1, b2 = out["boxes"]
    assert b1["name"] == "Box 1"
    assert b1["mons"][0] is None
    assert b1["mons"][1]["species"] == "PIKACHU"
    assert b1["mons"][1]["level"] == 25
    assert b2["mons"][0]["species"] == "CHARIZARD"


def test_boxes_without_storage_returns_empty():
    # Any other save: no $PokemonStorage -> graceful empty result.
    out = parse_boxes_blob(writes({"$Trainer": RubyObject("PokeBattle_Trainer", {"@name": "Red"})}))
    assert out == {"boxes": [], "box_count": 0}


def test_boxes_bad_marshal_header_raises():
    with pytest.raises(SaveParseError, match="Not a Ruby Marshal"):
        parse_boxes_blob(b"XXnotmarshal")


def test_boxes_non_object_storage_returns_empty():
    out = parse_boxes_blob(writes({"$PokemonStorage": 42}))
    assert out == {"boxes": [], "box_count": 0}


def test_boxes_non_list_boxes_attr_returns_empty():
    out = parse_boxes_blob(
        _storage_blob_writer(RubyObject("PokemonStorage", {"@boxes": "oops"}))
    )
    assert out == {"boxes": [], "box_count": 0}


def _storage_blob_writer(storage) -> bytes:
    return writes({"$PokemonStorage": storage})


def test_boxes_corrupt_mon_becomes_none():
    # A mon with garbage attrs must not kill the whole box parse.
    bad = RubyObject("PokeBattle_Pokemon", {"@level": "not_an_int", "@species": 17})
    box = _box("Box X", [_pkm("MEW"), bad, None])
    out = parse_boxes_blob(_storage_blob([box]))
    mons = out["boxes"][0]["mons"]
    assert mons[0]["species"] == "MEW"
    assert mons[1] is None or mons[1].get("species")  # never a crash
    assert mons[2] is None


# --- hidden power -------------------------------------------------------------

def test_hidden_power_known_vectors():
    # 31 everywhere -> all low bits 1 -> index 63 -> Dark.
    assert _hidden_power_type(31, 31, 31, 31, 31, 31) == "Dark"
    # 30 everywhere -> all low bits 0 -> index 0 -> Fighting.
    assert _hidden_power_type(30, 30, 30, 30, 30, 30) == "Fighting"
    # Middle vector: hp=31(1),atk=30(0),def=31(1),spa=30(0),spd=31(1),spe=30(0)
    # raw = 1+0+4+0+16+0 = 21 -> 21*15//63 = 5 -> Bug.
    assert _hidden_power_type(31, 30, 31, 30, 31, 30) == "Bug"


def test_hidden_power_none_or_out_of_range():
    assert _hidden_power_type(None, 31, 31, 31, 31, 31) is None
    assert _hidden_power_type(32, 31, 31, 31, 31, 31) is None
    assert _hidden_power_type(-1, 31, 31, 31, 31, 31) is None


def test_hidden_power_through_to_dict():
    mon = PokemonSummary(
        species="PIKACHU", nickname=None, level=25, hp=60, max_hp=60,
        status=0, status_name="OK", type1="Electric", type2=None,
        moves=[], ability=None, item=None, gender=0, gender_name="M",
        shiny=False, nature="Timid", attack=100, defense=90, spatk=110,
        spdef=100, speed=120, iv_hp=31, iv_attack=30, iv_defense=31,
        iv_spatk=30, iv_spdef=31, iv_speed=30,
        ev_hp=0, ev_attack=0, ev_defense=0, ev_spatk=0, ev_spdef=0,
        ev_speed=0, happiness=100,
    )
    d = mon.to_dict()
    assert d["hidden_power"] == "Bug"

    # Missing IVs -> no hidden power value, key still present.
    mon.iv_attack = None
    d2 = mon.to_dict()
    assert d2["hidden_power"] is None
