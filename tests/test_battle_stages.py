"""Regression tests for battler stage normalization (round 2).

The game mod forwards ``battler.stages`` verbatim: Essentials v18 and
earlier use an 8-element Array, v19+/v20 use a Hash. Both must land as
``[Atk, Def, SpA, SpD, Spe]`` for the frontend's STAT_NAMES badges.
"""
from battle_analyzer import _normalize_stages, compute_battle_analysis


def test_v18_array_order():
    # v18: [HP, ATK, DEF, SPEED, SPATK, SPDEF, ACCURACY, EVASION]
    stages = _normalize_stages([0, 2, -1, 0, 1, 0, 0, 0])
    assert stages == [2, -1, 1, 0, 0]


def test_v19_hash_named_keys():
    # v19+/v20 Hash serialized by the mod's custom to_json (string keys).
    stages = _normalize_stages({"ATTACK": 2, "SPECIAL_DEFENSE": -2, "SPEED": 1})
    assert stages == [2, 0, 0, -2, 1]


def test_v19_hash_all_keys():
    stages = _normalize_stages({
        "ATTACK": 1, "DEFENSE": 2, "SPEED": 3,
        "SPECIAL_ATTACK": 4, "SPECIAL_DEFENSE": 5,
    })
    assert stages == [1, 2, 4, 5, 3]


def test_hash_alternate_spellings():
    # Forks use DEF/SPATK/SPDEF shorthand; underscore variants must also match.
    assert _normalize_stages({"def": 1, "spatk": 2, "spdef": 3}) == [0, 1, 2, 3, 0]
    # special_attack maps to SpA (index 2).
    assert _normalize_stages({"special_attack": 2}) == [0, 0, 2, 0, 0]


def test_garbage_and_missing():
    assert _normalize_stages(None) == [0, 0, 0, 0, 0]
    assert _normalize_stages("nope") == [0, 0, 0, 0, 0]
    assert _normalize_stages({"ATTACK": "x"}) == [0, 0, 0, 0, 0]


def test_short_array_passthrough():
    assert _normalize_stages([1, 2]) == [1, 2, 0, 0, 0]
    assert _normalize_stages([]) == [0, 0, 0, 0, 0]


def test_compute_battle_analysis_with_hash_stages():
    enemies = [{
        "species": "Charizard", "type1": "Fire", "type2": "Flying",
        "hp": 50, "max_hp": 100,
        "stages": {"ATTACK": 2, "DEFENSE": -1},
        "moves": [],
    }]
    players = [{"species": "Squirtle", "type1": "Water", "moves": ["Tackle"]}]
    party = [{"species": "Bulbasaur", "type1": "Grass", "moves": ["Vine Whip"]}]

    result = compute_battle_analysis(enemies, players, party)
    assert result is not None
    assert result["enemy"]["stages"] == [2, -1, 0, 0, 0]
    assert result["enemy"]["name"] == "Charizard"
    assert result["enemy"]["types"] == ["Fire", "Flying"]
    assert result["best_move"]
