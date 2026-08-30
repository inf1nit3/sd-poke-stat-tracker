"""Round-3 tests for pbsparser + pbsfinder (py_modules).

Anchors the INI-format Essentials PBS parsing (v18-v21 use
``[ID]``/``Key = Value`` sections) and the save-anchored PBS discovery.
"""
from pathlib import Path

import pbsfinder
import pytest
from pbsfinder import find_pbs_files
from pbsparser import (
    normalize_name,
    parse_moves_pbs,
    parse_pbs_file,
    parse_pbs_text,
    parse_pokemon_pbs,
    parse_types_pbs,
)

# --- normalize_name -----------------------------------------------------------

def test_normalize_name():
    assert normalize_name("Thunder Punch") == "THUNDERPUNCH"
    assert normalize_name("Mr. Mime") == "MRMIME"
    assert normalize_name("Farfetch'd") == "FARFETCHD"
    assert normalize_name("") == ""
    assert normalize_name("Nidoqueen") == "NIDOQUEEN"


# --- parse_pbs_text -----------------------------------------------------------

def test_parse_pbs_text_sections():
    text = (
        "# leading comment\n"
        "[1]\nName = Tackle\nType = NORMAL\n\n"
        "[2]\nName = Scratch\n"
    )
    sections = parse_pbs_text(text)
    assert [s["__id__"] for s in sections] == ["1", "2"]
    assert sections[0]["Name"] == "Tackle"
    assert sections[0]["Type"] == "NORMAL"
    assert sections[1]["Name"] == "Scratch"


def test_parse_pbs_text_skips_lines_without_equals():
    text = "[1]\nName = Tackle\njunkline\n=orphan\n"
    sections = parse_pbs_text(text)
    assert sections[0] == {"__id__": "1", "Name": "Tackle"}


def test_parse_pbs_text_empty_and_valueless():
    assert parse_pbs_text("") == []
    assert parse_pbs_text("# only a comment") == []
    # Key with empty value is kept (empty string).
    assert parse_pbs_text("[1]\nName =\n") == [{"__id__": "1", "Name": ""}]


def test_parse_pbs_file_missing(tmp_path):
    with pytest.raises(FileNotFoundError):
        parse_pbs_file(tmp_path / "nope.txt")


# --- parse_moves_pbs ----------------------------------------------------------

MOVES_PBS = """\
[0]
Name = Pound
Type = NORMAL
Category = Physical
Power = 40
Accuracy = 100
PP = 35

[1]
Name = Karate Chop
Type = FIGHTING
Category = Physical
Power = not_a_number
Accuracy =
PP =
"""


def test_parse_moves_pbs(tmp_path):
    p = tmp_path / "moves.txt"
    p.write_text(MOVES_PBS, encoding="utf-8")
    moves = parse_moves_pbs(p)
    assert set(moves) == {"POUND", "KARATECHOP"}
    pound = moves["POUND"]
    assert pound["name"] == "Pound"
    assert pound["type"] == "Normal"  # .title()
    assert pound["category"] == "Physical"
    assert pound["power"] == 40
    chop = moves["KARATECHOP"]
    # Non-numeric / empty values coerce to 0 instead of crashing.
    assert chop["power"] == 0
    assert chop["accuracy"] == 0
    assert chop["pp"] == 0


# --- parse_pokemon_pbs ----------------------------------------------------------

POKEMON_PBS = """\
[1]
Name = Bulbasaur
Type1 = GRASS
Type2 = POISON
BaseStats = 45,49,49,65,65,45
EffortPoints = 0,0,0,1,0,0
Abilities = Overgrow,Chlorophyll
HiddenAbility = Chlorophyll
BaseExperience = 64
Happiness = 70
"""


def test_parse_pokemon_pbs(tmp_path):
    p = tmp_path / "pokemon.txt"
    p.write_text(POKEMON_PBS, encoding="utf-8")
    species = parse_pokemon_pbs(p)
    assert set(species) == {"BULBASAUR"}
    b = species["BULBASAUR"]
    assert b["type1"] == "Grass"
    assert b["type2"] == "Poison"
    assert b["base_stats"] == [45, 49, 49, 65, 65, 45]
    assert b["ev_yield"] == [0, 0, 0, 1, 0, 0]
    assert b["abilities"] == ["OVERGROW", "CHLOROPHYLL", "CHLOROPHYLL"]
    assert b["base_experience"] == 64


# --- parse_types_pbs ----------------------------------------------------------

def test_parse_types_pbs(tmp_path):
    p = tmp_path / "types.txt"
    p.write_text(
        "[ELECTRIC]\nName = Electric\nIsSpecial = true\nWeaknesses = GROUND\n",
        encoding="utf-8",
    )
    types = parse_types_pbs(p)
    assert types["ELECTRIC"]["is_special"] is True
    assert types["ELECTRIC"]["weaknesses"] == "GROUND"


# --- pbsfinder ------------------------------------------------------------------

@pytest.fixture()
def no_steam_roots(monkeypatch):
    # Isolate from real Steam installs on this machine.
    monkeypatch.setattr(pbsfinder, "candidate_steam_roots", list)


def _make_game(root: Path, with_pbs: bool) -> Path:
    game = root / "My Game"
    (game / "PBS").mkdir(parents=True)
    if with_pbs:
        (game / "PBS" / "moves.txt").write_text(MOVES_PBS, encoding="utf-8")
    return game


def test_find_pbs_via_save_anchor(tmp_path, no_steam_roots):
    game = _make_game(tmp_path, with_pbs=True)
    save = game / "Saved Games" / "Game.rxdata"
    save.parent.mkdir(parents=True)
    save.write_bytes(b"\x04\x08")
    found = find_pbs_files(save_path=save)
    assert found["moves"] == game / "PBS" / "moves.txt"


def test_find_pbs_prefers_save_anchor_over_steam(tmp_path, monkeypatch):
    # A steam-root PBS exists too, but the save-anchored one must win.
    _make_game(tmp_path / "steam" / "steamapps" / "common", with_pbs=True)
    anchored = _make_game(tmp_path / "anchored", with_pbs=True)
    save = anchored / "Game.rxdata"
    save.write_bytes(b"\x04\x08")
    monkeypatch.setattr(
        pbsfinder, "candidate_steam_roots",
        lambda: [tmp_path / "steam" / "steamapps"],
    )
    found = find_pbs_files(save_path=save)
    assert found["moves"] == anchored / "PBS" / "moves.txt"


def test_find_pbs_via_steam_root(tmp_path, monkeypatch):
    game = _make_game(tmp_path / "steam" / "steamapps" / "common", with_pbs=True)
    monkeypatch.setattr(
        pbsfinder, "candidate_steam_roots",
        lambda: [tmp_path / "steam" / "steamapps"],
    )
    found = find_pbs_files()
    assert found["moves"] == game / "PBS" / "moves.txt"


def test_find_pbs_none_found(tmp_path, no_steam_roots):
    _make_game(tmp_path, with_pbs=False)
    save = tmp_path / "My Game" / "Game.rxdata"
    save.write_bytes(b"\x04\x08")
    assert find_pbs_files(save_path=save) == {}
