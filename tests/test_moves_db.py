"""Round-3 tests for the MovesDB (py_modules/moves.py).

Covers lookup priority (PBS > static > heuristic), PBS loading from
real INI-format files, and to_api() merge counts.
"""
import json
from pathlib import Path

import pytest
from moves import MovesDB

STATIC = {
    "moves": {
        "Tackle": {"type": "Normal", "category": "Physical", "power": 40, "accuracy": 100, "pp": 35},
        "Surf": {"type": "Water", "category": "Special", "power": 90, "accuracy": 100, "pp": 15},
    }
}

PBS_TEXT = """\
# Comment line is ignored
[FLAMETHROWER]
Name = Flamethrower
Type = FIRE
Category = Special
Power = 90
Accuracy = 100
PP = 15

[THUNDERPUNCH]
Name = Thunder Punch
Type = ELECTRIC
Category = Physical
Power = 75
Accuracy = 100
PP = 20
"""


@pytest.fixture()
def static_path(tmp_path: Path) -> Path:
    p = tmp_path / "moves.json"
    p.write_text(json.dumps(STATIC), encoding="utf-8")
    return p


@pytest.fixture()
def pbs_path(tmp_path: Path) -> Path:
    p = tmp_path / "moves.txt"
    p.write_text(PBS_TEXT, encoding="utf-8")
    return p


def test_static_lookup(static_path):
    db = MovesDB(static_path=static_path)
    info = db.get("Tackle")
    assert info is not None
    assert info["type"] == "Normal"
    assert info["source"] == "static"


def test_pbs_override_and_matching(static_path, pbs_path):
    db = MovesDB(static_path=static_path)
    assert db.load_pbs(pbs_path) == 2
    # "Thunder Punch" normalizes to THUNDERPUNCH and matches the PBS section.
    info = db.get("Thunder Punch")
    assert info["source"] == "pbs"
    assert info["type"] == "Electric"  # "ELECTRIC".title()
    assert info["power"] == 75


def test_pbs_beats_static_on_conflict(static_path, pbs_path):
    # PBS defines Surf too -> must win over the static entry.
    pbs = pbs_path.read_text(encoding="utf-8") + (
        "\n[SURF]\nName = Surf\nType = WATER\nCategory = Special\n"
        "Power = 999\nAccuracy = 100\nPP = 15\n"
    )
    pbs_path.write_text(pbs, encoding="utf-8")
    db = MovesDB(static_path=static_path)
    db.load_pbs(pbs_path)
    assert db.get("Surf")["power"] == 999
    assert db.get("Surf")["source"] == "pbs"


def test_heuristic_fallback(static_path):
    db = MovesDB(static_path=static_path)
    info = db.get("Thunderclap")
    assert info["type"] == "Electric"
    assert info["source"] == "heuristic"
    assert info["guessed"] is True


def test_unknown_move_returns_none(static_path):
    db = MovesDB(static_path=static_path)
    assert db.get("Zzzqxvwy") is None
    assert db.get("") is None


def test_lookup_many_skips_empty(static_path):
    db = MovesDB(static_path=static_path)
    out = db.lookup_many(["Tackle", "", "Surf"])
    assert list(out) == ["Tackle", "Surf"]


def test_load_pbs_missing_file(static_path, tmp_path):
    db = MovesDB(static_path=static_path)
    assert db.load_pbs(tmp_path / "nope.txt") == 0
    # Static data is untouched.
    assert db.get("Tackle")["source"] == "static"


def test_clear_pbs(static_path, pbs_path):
    db = MovesDB(static_path=static_path)
    db.load_pbs(pbs_path)
    assert db.pbs_source == pbs_path
    db.clear_pbs()
    assert db.pbs_source is None
    # Thunder Punch only existed in PBS: falls back to the heuristic.
    info = db.get("Thunder Punch")
    assert info["source"] == "heuristic"
    assert info["type"] == "Electric"
    # Static moves are unaffected.
    assert db.get("Surf")["source"] == "static"


def test_to_api_merge_counts(static_path, pbs_path):
    db = MovesDB(static_path=static_path)
    api = db.to_api()
    assert api["static_count"] == 2
    assert api["pbs_count"] == 0
    assert api["merged_count"] == 2
    db.load_pbs(pbs_path)
    api = db.to_api()
    assert api["pbs_count"] == 2
    assert api["merged_count"] == 4
    assert api["loaded"] is True


def test_invalid_static_json_still_works(tmp_path):
    p = tmp_path / "moves.json"
    p.write_text("{not json", encoding="utf-8")
    db = MovesDB(static_path=p)
    assert db.loaded is False
    # Heuristic path still answers instead of crashing.
    assert db.get("Thunderclap")["type"] == "Electric"


def test_non_dict_static_json(tmp_path):
    p = tmp_path / "moves.json"
    p.write_text("[1, 2]", encoding="utf-8")
    db = MovesDB(static_path=p)
    assert db.get("Tackle") is None


def test_static_entries_without_type_dropped(tmp_path):
    p = tmp_path / "moves.json"
    p.write_text(
        json.dumps({"moves": {"Bad": {"category": "?"}, "Good": {"type": "Fire"}}}),
        encoding="utf-8",
    )
    db = MovesDB(static_path=p)
    assert db.get("Good")["type"] == "Fire"
    assert db.get("Bad") is None
