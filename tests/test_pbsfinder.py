"""Round-6 tests for pbsfinder.py permission robustness and search order.

The steam-root scans used to call iterdir() unprotected: one unreadable
directory (permissions, stale mount) aborted the entire PBS discovery.
"""
import os
from pathlib import Path

import pbsfinder
import pytest
from pbsfinder import find_pbs_files


def _make_pbs(base: Path) -> Path:
    pbs = base / "PBS"
    pbs.mkdir(parents=True)
    (pbs / "moves.txt").write_text("[TACKLE]\nName = Tackle\n", encoding="utf-8")
    (pbs / "pokemon.txt").write_text("[BULBASAUR]\nName = Bulbasaur\n", encoding="utf-8")
    (pbs / "types.txt").write_text("[NORMAL]\nName = Normal\n", encoding="utf-8")
    return pbs


def test_save_relative_pbs_is_found(tmp_path):
    game_dir = tmp_path / "MyGame"
    _make_pbs(game_dir)
    save = game_dir / "user" / "Game.rxdata"
    save.parent.mkdir(parents=True)
    save.write_bytes(b"x")
    out = find_pbs_files(save)
    assert set(out) == {"moves", "pokemon", "types"}
    assert out["moves"].parent == game_dir / "PBS"


def test_hint_parameter_is_used(tmp_path):
    pbs = _make_pbs(tmp_path / "external")
    out = find_pbs_files(None, hint=str(pbs))
    assert out["moves"].parent == pbs


def test_steam_root_without_common_or_compat_is_harmless(tmp_path, monkeypatch):
    monkeypatch.setattr(pbsfinder, "candidate_steam_roots", lambda: [tmp_path])
    assert find_pbs_files() == {}


def test_scan_survives_unreadable_common_child(tmp_path, monkeypatch):
    """Regression (round 6): iterdir() on an unreadable common/ child
    crashed the whole scan instead of skipping that game dir."""
    if os.geteuid() == 0:
        pytest.skip("permission tests meaningless as root")
    steamapps = tmp_path / "steamapps"
    good = _make_pbs(steamapps / "common" / "GoodGame")
    bad = steamapps / "common" / "BadGame"
    bad.mkdir(parents=True)
    bad.chmod(0o000)
    monkeypatch.setattr(pbsfinder, "candidate_steam_roots", lambda: [steamapps])
    try:
        out = find_pbs_files()
    finally:
        bad.chmod(0o755)
    assert out["moves"] == good / "moves.txt"


def test_scan_survives_unreadable_compatdata_child(tmp_path, monkeypatch):
    if os.geteuid() == 0:
        pytest.skip("permission tests meaningless as root")
    steamapps = tmp_path / "steamapps"
    compat = steamapps / "compatdata"
    good_pbs = _make_pbs(
        compat / "123" / "pfx" / "drive_c" / "users" / "steamuser" / "Documents" / "WineGame"
    )
    bad = compat / "456"
    bad.mkdir(parents=True)
    bad.chmod(0o000)
    monkeypatch.setattr(pbsfinder, "candidate_steam_roots", lambda: [steamapps])
    try:
        out = find_pbs_files()
    finally:
        bad.chmod(0o755)
    assert out["moves"] == good_pbs / "moves.txt"


def test_first_candidate_wins_for_overlapping_files(tmp_path, monkeypatch):
    steamapps = tmp_path / "steamapps"
    native = _make_pbs(steamapps / "common" / "NativeGame")
    wine = _make_pbs(
        steamapps / "compatdata" / "123" / "pfx" / "drive_c" / "users" / "steamuser" / "Documents" / "WineGame"
    )
    monkeypatch.setattr(pbsfinder, "candidate_steam_roots", lambda: [steamapps])
    out = find_pbs_files()
    # Native candidates are collected before compatdata ones.
    assert out["moves"] == native / "moves.txt"
    assert wine.exists()
