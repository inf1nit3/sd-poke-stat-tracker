"""Round-9 saveparser edge sweep.

Pins the parser's behavior at the edges: corrupt headers, wrong shapes,
coercion of garbage values, oversized parties, and unicode payloads.
Every case must either parse cleanly or raise SaveParseError — never a
raw TypeError/AttributeError leaking out of parse.
"""
import pytest
from rubymarshal.classes import RubyObject, Symbol
from rubymarshal.writer import writes
from saveparser import SaveParseError, _parse_and_extract, parse_save_file


def _pkm(
    species="PIKACHU",
    level=25,
    hp=60,
    max_hp=70,
    status=0,
    moves=None,
    **extra,
) -> RubyObject:
    attrs = {
        "@species": Symbol(species),
        "@level": level,
        "@hp": hp,
        "@totalhp": max_hp,
        "@status": status,
        "@moves": [Symbol(m) for m in (moves or ["TACKLE"])],
    }
    attrs.update(extra)
    return RubyObject("PokeBattle_Pokemon", attrs)


def _blob(trainer_attrs: dict, **top) -> bytes:
    top_key = {"$Trainer": RubyObject("PokeBattle_Trainer", trainer_attrs)}
    top_key.update(top)
    return writes(top_key)


def _parse(blob: bytes, save_path=None):
    return _parse_and_extract(blob, save_path, "test")


# --- structural failures ------------------------------------------------------------

def test_empty_bytes_raises_save_parse_error():
    with pytest.raises(SaveParseError):
        _parse(b"")


def test_wrong_marshal_header_raises_save_parse_error():
    with pytest.raises(SaveParseError, match="Not a Ruby Marshal"):
        _parse(b"\x00\x10whatever")


def test_top_level_array_raises_save_parse_error():
    with pytest.raises(SaveParseError, match="not a hash"):
        _parse(writes([1, 2, 3]))


def test_missing_file_raises_save_parse_error(tmp_path):
    with pytest.raises(SaveParseError, match="not found"):
        parse_save_file(tmp_path / "nope.rxdata")


def test_truncated_marshal_raises_save_parse_error():
    # Valid header, garbage body.
    with pytest.raises(SaveParseError, match="Marshal parse failed"):
        _parse(b"\x04\x08\x99\x88broken")


# --- party shape edges ---------------------------------------------------------------

def test_party_nil_yields_empty_party():
    data = _parse(_blob({"@name": "Red", "@party": None}))
    assert data.party == []


def test_party_with_plain_dict_entries_skips_them():
    data = _parse(_blob({
        "@name": "Red",
        "@party": [
            {"species": "not a RubyObject"},
            _pkm("MEW"),
        ],
    }))
    assert len(data.party) == 1
    assert data.party[0].species == "MEW"


def test_party_larger_than_six_is_kept_whole():
    """The game caps party size at 6, but a hand-edited or glitched save
    must not crash the parser — all valid members are reported."""
    data = _parse(_blob({
        "@name": "Red",
        "@party": [_pkm(f"MON{i}") for i in range(8)],
    }))
    assert len(data.party) == 8


def test_party_entry_exception_is_skipped():
    # Marshal-safe junk: numeric fields as non-numeric strings (rubymarshal
    # wraps every string as RubyString, so int() fails and the default is
    # used) and moves as a bare string (the isinstance(list/tuple) guard
    # rejects it instead of iterating characters).
    weird = RubyObject("PokeBattle_Pokemon", {
        "@species": Symbol("DITTO"),
        "@level": "garbage",
        "@hp": "garbage",
        "@totalhp": "garbage",
        "@status": "garbage",
        "@moves": "garbage",
    })
    data = _parse(_blob({"@name": "Red", "@party": [_pkm("MEW"), weird]}))
    assert len(data.party) == 2  # both survive; weird one uses defaults
    assert data.party[1].level == 1
    assert data.party[1].hp == 0
    assert data.party[1].moves == []


# --- value coercion edges ------------------------------------------------------------

def test_numeric_fields_floats_truncate_strings_fall_back():
    """Floats truncate via int(); strings cannot be coerced (rubymarshal
    wraps them as RubyString) and fall back to the documented defaults.
    Real saves store numerics as Fixnums, so this only affects
    hand-edited saves — the contract is 'default, never crash'."""
    data = _parse(_blob({
        "@name": "Red",
        "@party": [
            _pkm(hp="55", max_hp="77", level=25.9),
            _pkm("MEW", hp=55, max_hp=77),
        ],
    }))
    assert data.party[0].hp == 0
    assert data.party[0].max_hp == 1
    assert data.party[0].level == 25  # float truncates
    assert data.party[1].hp == 55
    assert data.party[1].max_hp == 77


def test_hp_clamped_into_zero_one():
    data = _parse(_blob({
        "@name": "Red",
        "@party": [_pkm(hp=200, max_hp=70), _pkm("MEW", hp=0, max_hp=0)],
    }))
    assert data.party[0].hp_percent == 1.0
    assert data.party[1].hp_percent == 0.0  # max_hp <= 0 guard, no crash


def test_negative_money_is_preserved():
    data = _parse(_blob({"@name": "Red", "@money": -500, "@party": []}))
    assert data.money == -500


def test_badges_string_cannot_be_coerced_becomes_zero():
    data = _parse(_blob({"@name": "Red", "@badges": "5", "@party": []}))
    assert data.badges == 0  # RubyString int() fails -> documented default


def test_species_plain_string_accepted():
    # Symbol path is covered elsewhere; here the raw-str variant that
    # arrives via marshal as a RubyString.
    weird = RubyObject("PokeBattle_Pokemon", {
        "@species": "RAWSTR",  # plain str, not Symbol
        "@level": 3,
    })
    data = _parse(_blob({"@name": "Red", "@party": [weird]}))
    assert data.party[0].species == "RAWSTR"


def test_moves_nil_gives_empty_move_list():
    weird = RubyObject("PokeBattle_Pokemon", {
        "@species": Symbol("MEW"),
        "@moves": None,
    })
    data = _parse(_blob({"@name": "Red", "@party": [weird]}))
    assert data.party[0].moves == []
    d = data.party[0].to_dict()
    assert d["has_moves"] is False


def test_iv_array_format_parsed_by_position():
    weird = RubyObject("PokeBattle_Pokemon", {
        "@species": Symbol("MEW"),
        "@iv": [31, 30, 29, 28, 27, 26],
    })
    data = _parse(_blob({"@name": "Red", "@party": [weird]}))
    mon = data.party[0]
    assert (mon.iv_hp, mon.iv_attack, mon.iv_defense) == (31, 30, 29)
    assert (mon.iv_spatk, mon.iv_spdef, mon.iv_speed) == (28, 27, 26)
    assert mon.iv_total == 171


def test_iv_garbage_types_become_none():
    weird = RubyObject("PokeBattle_Pokemon", {
        "@species": Symbol("MEW"),
        "@iv": {"HP": "not-a-number"},
    })
    data = _parse(_blob({"@name": "Red", "@party": [weird]}))
    assert data.party[0].iv_hp is None
    assert data.party[0].iv_total is None


# --- location / player edges ----------------------------------------------------------

def test_map_id_coercion():
    data = _parse(_blob(
        {"@name": "Red", "@party": []},
        **{"$game_map": RubyObject("Game_Map", {"@map_id": 7})},
    ))
    assert data.map_id == 7

    # String map ids cannot be coerced (RubyString) -> documented None.
    data2 = _parse(_blob(
        {"@name": "Red", "@party": []},
        **{"$game_map": RubyObject("Game_Map", {"@map_id": "7"})},
    ))
    assert data2.map_id is None

    data3 = _parse(_blob(
        {"@name": "Red", "@party": []},
        **{"$game_map": RubyObject("Game_Map", {"@map_id": "abc"})},
    ))
    assert data3.map_id is None


def test_unicode_survives_roundtrip():
    data = _parse(_blob({
        "@name": "Rosélia-Fan Ü",
        "@party": [_pkm("FLABÉBÉ")],
    }))
    assert data.trainer_name == "Rosélia-Fan Ü"
    assert data.party[0].species == "FLABÉBÉ"
