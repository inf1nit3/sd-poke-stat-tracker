"""Round-3 tests for the TypeChart engine (py_modules/typechart.py).

Loads the real data/type_chart.json so the Gen 6 chart math is
anchored against shipped data, plus malformed-file fallback tests.
"""
from pathlib import Path

import pytest
from typechart import TypeChart

REPO_ROOT = Path(__file__).resolve().parent.parent
REAL_CHART = REPO_ROOT / "data" / "type_chart.json"


@pytest.fixture()
def chart() -> TypeChart:
    tc = TypeChart(REAL_CHART)
    assert tc.loaded, f"real chart failed to load from {REAL_CHART}"
    return tc


# --- matchup math -----------------------------------------------------------

def test_matchup_dual_four_times(chart):
    # Ice vs Grass/Flying = 2.0 * 2.0 = 4.0
    res = chart.get_matchup("Ice", ["Grass", "Flying"])
    assert "error" not in res
    assert res["multiplier"] == 4.0
    assert res["breakdown"] == [
        {"defender": "Grass", "multiplier": 2.0},
        {"defender": "Flying", "multiplier": 2.0},
    ]


def test_matchup_dual_quarter(chart):
    # Water vs Water/Fire would be 0.5*2=1; a real 0.25 case:
    # Fire vs Water/Steel? Fire vs Water=0.5, vs Steel=2 -> 1.
    # Grass vs Poison/Flying: 0.5 * 0.5 = 0.25
    res = chart.get_matchup("Grass", ["Poison", "Flying"])
    assert "error" not in res
    assert res["multiplier"] == 0.25


def test_matchup_immune(chart):
    res = chart.get_matchup("Ground", ["Flying"])
    assert "error" not in res
    assert res["multiplier"] == 0.0


def test_matchup_resisted(chart):
    res = chart.get_matchup("Water", ["Water"])
    assert "error" not in res
    assert res["multiplier"] == 0.5


def test_matchup_unknown_attacker(chart):
    res = chart.get_matchup("Sound", ["Water"])
    assert "error" in res


def test_matchup_invalid_defenders_only(chart):
    res = chart.get_matchup("Water", ["Bogus", None, 42])
    assert "error" in res


def test_matchup_more_than_two_defenders_capped(chart):
    # More than 2 defender types are cut; first two win.
    res = chart.get_matchup("Ice", ["Grass", "Flying", "Ground"])
    assert "error" not in res
    assert res["defenders"] == ["Grass", "Flying"]
    assert res["multiplier"] == 4.0


# --- defense summary ----------------------------------------------------------

def test_defense_summary_classification(chart):
    res = chart.get_defense_summary(["Fire", "Flying"])
    assert "error" not in res
    s = res["summary"]
    # Rock: 2 (vs Fire) * 2 (vs Flying) = 4x; Water: 2 * 1 = 2x
    assert "Rock" in s["quadruple"]
    assert "Water" in s["double"]
    # Electric: 1 * 2 (strong vs Flying) = 2x
    assert "Electric" in s["double"]
    # Fire: 0.5 (vs Fire) * 1 = 0.5; Fighting: 1 * 0.5 = 0.5;
    # Steel: 0.5 * 1 = 0.5; Fairy: 0.5 * 1 = 0.5
    assert "Fire" in s["half"] and "Fighting" in s["half"] and "Steel" in s["half"] and "Fairy" in s["half"]
    # Bug: 0.5 * 0.5 = 0.25
    assert "Bug" in s["quarter"]
    # Ground: 2 * 0 = 0
    assert "Ground" in s["immune"]
    # Normal: 1 * 1 = 1
    assert "Normal" in s["neutral"]
    # Every attacking type is classified exactly once.
    total = sum(len(v) for v in s.values())
    assert total == len(chart.get_type_chart()["types"])


def test_defense_summary_requires_valid_defender(chart):
    res = chart.get_defense_summary(["Bogus"])
    assert "error" in res


# --- offense summary ----------------------------------------------------------

def test_offense_summary_electric(chart):
    res = chart.get_offense_summary("Electric")
    assert "error" not in res
    s = res["summary"]
    assert "Water" in s["double"] and "Flying" in s["double"]
    assert "Ground" in s["immune"]
    assert "Electric" in s["half"]
    assert "Normal" in s["neutral"]


def test_offense_summary_unknown(chart):
    res = chart.get_offense_summary("Sound")
    assert "error" in res


# --- generation patch ---------------------------------------------------------

def test_gen5_steel_patch(chart):
    # Gen 6 chart: Dark vs Steel = 1.0. With generation_override=5 it
    # must come out as 0.5 (Steel resisted Dark/Ghost pre-Gen 6).
    assert chart.get_matchup("Dark", ["Steel"])["multiplier"] == 1.0
    assert chart.get_matchup("Dark", ["Steel"], generation_override=5)["multiplier"] == 0.5
    assert chart.get_matchup("Ghost", ["Steel"], generation_override=5)["multiplier"] == 0.5
    # Only Dark/Ghost are patched: Water vs Steel stays neutral.
    assert chart.get_matchup("Water", ["Steel"], generation_override=5)["multiplier"] == 1.0


# --- malformed file fallback --------------------------------------------------

def _write(tmp_path: Path, content: str) -> TypeChart:
    p = tmp_path / "type_chart.json"
    p.write_text(content, encoding="utf-8")
    return TypeChart(p)


def test_garbage_json_falls_back_to_unloaded(tmp_path):
    tc = _write(tmp_path, "{not json")
    assert tc.loaded is False
    # Neutral lookups instead of a crash.
    res = tc.get_matchup("Water", ["Fire"])
    assert "error" in res


def test_non_dict_json_unloaded(tmp_path):
    tc = _write(tmp_path, "[1, 2, 3]")
    assert tc.loaded is False


def test_invalid_multiplier_values_dropped(tmp_path):
    p = tmp_path / "type_chart.json"
    p.write_text(
        '{"types": ["Water", "Fire"], "colors": {}, '
        '"multipliers": {"Water": {"Fire": 3.0, "Bogus": "x"}}, "generation": 6}',
        encoding="utf-8",
    )
    tc = TypeChart(p)
    assert tc.loaded is True
    # 3.0 is not a valid multiplier -> dropped -> defaults to 1.0.
    assert tc.get_matchup("Water", ["Fire"])["multiplier"] == 1.0


def test_missing_file_unloaded(tmp_path):
    tc = TypeChart(tmp_path / "does_not_exist.json")
    assert tc.loaded is False
    assert tc.get_type_chart()["loaded"] is False
