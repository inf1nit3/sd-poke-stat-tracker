"""Round-5 edge-case tests for battle_analyzer.compute_battle_analysis."""
from battle_analyzer import compute_battle_analysis


def test_hp_percent_guards():
    # max_hp 0 / None and hp None must not crash or divide by zero.
    for enemy in (
        {"species": "X", "hp": 10, "max_hp": 0},
        {"species": "X", "hp": 10, "max_hp": None},
        {"species": "X", "hp": None, "max_hp": 10},
        {"species": "X"},
    ):
        res = compute_battle_analysis([enemy], [], [])
        assert res["enemy"]["hp_percent"] is None


def test_hp_percent_normal():
    res = compute_battle_analysis(
        [{"species": "X", "hp": 25, "max_hp": 100}], [], []
    )
    assert res["enemy"]["hp_percent"] == 25.0


def test_first_enemy_wins():
    enemies = [
        {"species": "First", "type1": "Water", "hp": 1, "max_hp": 2},
        {"species": "Second", "type1": "Fire", "hp": 5, "max_hp": 6},
    ]
    res = compute_battle_analysis(enemies, [], [])
    assert res["enemy"]["name"] == "First"
    assert res["enemy"]["types"] == ["Water"]


def test_players_fallback_to_party():
    party = [{"species": "PartyMon", "type1": "Grass", "moves": ["Vine Whip"]}]
    res = compute_battle_analysis(
        [{"species": "Foe", "type1": "Water", "hp": 1, "max_hp": 2}],
        [],  # no active battler on our side
        party,
    )
    # Vine Whip (Grass) vs Water -> super effective best move.
    assert res["best_move"] == "Vine Whip"
    assert any(m["type"] == "Grass" for m in res["moves"])


def test_non_string_moves_skipped_and_capped():
    player = {"species": "P", "type1": "Normal",
              "moves": ["Tackle", 123, None, {"id": 7}, "Scratch", "Pound", "Growl"]}
    res = compute_battle_analysis([], [player], [])
    # 123/None/dict skipped; 4 strings max.
    assert [m["name"] for m in res["moves"]] == ["Tackle", "Scratch", "Pound", "Growl"]


def test_enemy_without_types_gives_neutral_labels():
    res = compute_battle_analysis(
        [{"species": "MissingNo", "hp": 1, "max_hp": 1}],
        [{"species": "P", "type1": "Normal", "moves": ["Tackle"]}],
        [],
    )
    assert res["enemy"]["types"] == []
    assert res["moves"][0]["type"] == "Normal"
    assert res["moves"][0]["effectiveness_label"] == "neutral"


def test_best_move_tie_prefers_first():
    # Two same-type moves: both 2x, first one must stay best_move.
    res = compute_battle_analysis(
        [{"species": "Foe", "type1": "Water", "hp": 1, "max_hp": 2}],
        [{"species": "P", "type1": "Electric", "moves": ["Thunderbolt", "Thunder"]}],
        [],
    )
    assert res["best_move"] == "Thunderbolt"


def test_coach_suggestion_threshold():
    enemies = [{"species": "Foe", "type1": "Water", "hp": 1, "max_hp": 2}]
    # Electric party member: 2x -> suggested.
    res = compute_battle_analysis(enemies, [], [
        {"species": "Pikachu", "type1": "Electric"},
    ])
    assert res["coach_suggestion"] is not None
    assert res["coach_suggestion"]["suggested_pokemon"] == "Pikachu"
    assert "2" in res["coach_suggestion"]["reason"]

    # Neutral-only party: no suggestion.
    res = compute_battle_analysis(enemies, [], [
        {"species": "Rattata", "type1": "Normal"},
    ])
    assert res["coach_suggestion"] is None

    # Party member without types: skipped entirely.
    res = compute_battle_analysis(enemies, [], [{"species": "Mystery"}])
    assert res["coach_suggestion"] is None


def test_dual_type_coach_uses_best_multiplier():
    res = compute_battle_analysis(
        [{"species": "Foe", "type1": "Water", "type2": "Flying", "hp": 1, "max_hp": 2}],
        [],
        [{"species": "Zapdos", "type1": "Electric", "type2": "Flying"}],
    )
    assert res["coach_suggestion"] is not None  # Electric vs Water/Flying = 4x


def test_empty_inputs():
    res = compute_battle_analysis([], [], [])
    assert res["enemy"]["name"] == "Unknown"
    assert res["moves"] == []
    assert res["best_move"] == ""
    assert res["coach_suggestion"] is None
    assert res["enemy"]["stages"] == [0, 0, 0, 0, 0]
