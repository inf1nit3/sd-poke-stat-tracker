"""Round-14 endpoint tests: rolling backups, nuzlocke log, save export,
PC boxes endpoint (cache), and per-game PBS profiles.

Reuses the ``plugin`` fixture pattern from test_main_endpoints.py.
"""

import asyncio
import json
import time
from pathlib import Path

import pytest
from nuzlockelog import NuzlockeLog
from rubymarshal.classes import RubyObject
from rubymarshal.writer import writes
from savebackup import SaveBackupManager

import main


@pytest.fixture()
def plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SETTINGS_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")
    p = main.Plugin()
    p._initialized = True
    # Fresh feature state inside tmp (Plugin() uses the module SETTINGS_DIR
    # at construction time, which we just monkeypatched — rebind to be safe).
    p._backups = SaveBackupManager(tmp_path / "backups")
    p._nuzlocke = NuzlockeLog(tmp_path / "nuzlocke_log.jsonl")
    return p


def _party(*specs):
    out = []
    for species, fainted in specs:
        out.append({"species": species, "level": 10, "is_fainted": fainted})
    return out


# --- _post_save_update hooks ---------------------------------------------------

def test_post_save_update_creates_backup_and_logs_faint(plugin):
    save_file = plugin._backups.backup_dir.parent / "Game.rxdata"
    save_file.parent.mkdir(parents=True, exist_ok=True)
    save_file.write_bytes(b"savedata")
    out = {"party": _party(("PIKACHU", False)), "location_name": "Route 1"}
    plugin._post_save_update(out, source="disk", location="Route 1", file_path=save_file)
    # Backup created
    backups = plugin._backups.list()
    assert len(backups) == 1
    assert backups[0]["size"] == 8
    # First sighting seeds the snapshot — no events yet
    assert plugin._nuzlocke.events() == []

    # Game saves again, Pikachu fainted
    out2 = {"party": _party(("PIKACHU", True)), "location_name": "Route 1"}
    plugin._post_save_update(out2, source="disk", location="Route 1", file_path=save_file)
    events = plugin._nuzlocke.events()
    assert len(events) == 1
    assert events[0]["kind"] == "faint"
    assert events[0]["species"] == "PIKACHU"
    assert events[0]["location"] == "Route 1"
    assert len(plugin._backups.list()) == 2


def test_post_save_update_disabled_by_settings(plugin):
    save_file = plugin._backups.backup_dir.parent / "Game.rxdata"
    save_file.parent.mkdir(parents=True, exist_ok=True)
    save_file.write_bytes(b"x")
    plugin._settings["backups_enabled"] = False
    plugin._settings["nuzlocke_enabled"] = False
    plugin._post_save_update(
        {"party": _party(("MEW", False))}, source="disk", location="", file_path=save_file
    )
    assert plugin._backups.list() == []
    assert plugin._nuzlocke.events() == []


def test_post_save_update_stream_source_skips_backup(plugin):
    # Stream/memory payloads have no file — only nuzlocke diff runs.
    plugin._post_save_update(
        {"party": _party(("GEODUDE", False))}, source="stream", location="Cave"
    )
    assert plugin._backups.list() == []
    plugin._post_save_update(
        {"party": _party(("GEODUDE", True))}, source="stream", location="Cave"
    )
    assert [e["kind"] for e in plugin._nuzlocke.events()] == ["faint"]


# --- backups endpoints -----------------------------------------------------------

def test_get_and_restore_backup_endpoint(plugin):
    save_file = plugin._backups.backup_dir.parent / "Game.rxdata"
    save_file.parent.mkdir(parents=True, exist_ok=True)
    save_file.write_bytes(b"current-state")
    plugin._settings["last_save_path"] = str(save_file)
    assert asyncio.run(plugin.get_save_backups())["backups"] == []
    plugin._post_save_update({"party": []}, source="disk", location="", file_path=save_file)
    listed = asyncio.run(plugin.get_save_backups())["backups"]
    assert len(listed) == 1

    # Change the live save, then restore the backup over it.
    save_file.write_bytes(b"corrupted!!")
    plugin._save_cache = {"party": []}  # should be invalidated
    out = asyncio.run(plugin.restore_save_backup(listed[0]["name"]))
    assert out["ok"] is True
    assert save_file.read_bytes() == b"current-state"
    assert plugin._save_cache is None


def test_restore_backup_rejects_traversal(plugin):
    out = asyncio.run(plugin.restore_save_backup("../evil.rxdata"))
    assert out["ok"] is False


def test_restore_backup_without_active_save(plugin):
    plugin._backups.backup_dir.mkdir(parents=True, exist_ok=True)
    (plugin._backups.backup_dir / "Game.20260101-000000.rxdata").write_bytes(b"x")
    out = asyncio.run(plugin.restore_save_backup("Game.20260101-000000.rxdata"))
    assert out == {"ok": False, "error": "no_active_save"}


# --- nuzlocke endpoints ----------------------------------------------------------

def test_nuzlocke_log_endpoints(plugin):
    plugin._nuzlocke.diff_and_record(_party(("SNORLAX", False)), location="Route 7")
    plugin._nuzlocke.diff_and_record(_party(("SNORLAX", True)), location="Route 7")
    res = asyncio.run(plugin.get_nuzlocke_log())
    assert len(res["events"]) == 1
    assert res["path"].endswith("nuzlocke_log.jsonl")
    assert asyncio.run(plugin.clear_nuzlocke_log()) == {"ok": True}
    assert asyncio.run(plugin.get_nuzlocke_log())["events"] == []
    assert not plugin._nuzlocke.log_path.exists()


# --- sprites endpoint ------------------------------------------------------------

def test_sprite_endpoint_found_and_cached(plugin, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SPRITES_DIR", tmp_path / "sprites")
    (tmp_path / "sprites").mkdir()
    (tmp_path / "sprites" / "PIKACHU.png").write_bytes(b"\x89PNG-fake")

    out = asyncio.run(plugin.get_pokemon_sprite("pikachu"))
    assert out["found"] is True
    assert out["data_url"].startswith("data:image/png;base64,")
    import base64
    assert base64.b64decode(out["data_url"].split(",", 1)[1]) == b"\x89PNG-fake"

    # Cached: delete the file, still served from memory.
    (tmp_path / "sprites" / "PIKACHU.png").unlink()
    out2 = asyncio.run(plugin.get_pokemon_sprite("PIKACHU"))
    assert out2["found"] is True


def test_sprite_endpoint_missing_and_oversize(plugin, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SPRITES_DIR", tmp_path / "sprites")
    (tmp_path / "sprites").mkdir()
    # Unknown species -> not found (no error).
    out = asyncio.run(plugin.get_pokemon_sprite("MEW"))
    assert out == {"found": False, "species": "MEW"}
    # Oversize file (>512 KB) is ignored.
    big = tmp_path / "sprites" / "SNORLAX.png"
    big.write_bytes(b"x" * (512 * 1024 + 1))
    out2 = asyncio.run(plugin.get_pokemon_sprite("SNORLAX"))
    assert out2["found"] is False


def test_sprite_endpoint_sanitizes_species(plugin, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SPRITES_DIR", tmp_path / "sprites")
    (tmp_path / "sprites").mkdir()
    # Odd characters are stripped; traversal via species can't escape the dir.
    out = asyncio.run(plugin.get_pokemon_sprite("../EVIL!MON"))
    assert out["found"] is False
    assert out["species"] == "EVILMON"


# --- export ----------------------------------------------------------------------

def test_export_save_summary(plugin, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SETTINGS_DIR", tmp_path)
    plugin._save_cache = {
        "trainer_name": "Red/Blue",
        "party": [{"species": "PIKACHU"}],
        "money": 100,
    }
    out = asyncio.run(plugin.export_save_summary())
    assert out["ok"] is True
    written = out["path"]
    data = json.loads(Path(written).read_text(encoding="utf-8"))
    assert data["trainer_name"] == "Red/Blue"
    assert "/save-" in written


def test_export_save_summary_without_data(plugin):
    plugin._save_cache = None
    assert asyncio.run(plugin.export_save_summary()) == {"ok": False, "error": "no_save_data"}


# --- PC boxes endpoint -----------------------------------------------------------

def _box_blob():
    mon = RubyObject(
        "PokeBattle_Pokemon",
        {"@species": "MEW", "@level": 50, "@hp": 100, "@totalhp": 100, "@status": 0},
    )
    box = RubyObject("PokemonBox", {"@name": "Box 1", "@mon": [mon, None]})
    return writes({"$PokemonStorage": RubyObject("PokemonStorage", {"@boxes": [box]})})


def test_get_boxes_endpoint_and_cache(plugin, tmp_path, monkeypatch):
    save_file = tmp_path / "Game.rxdata"
    save_file.write_bytes(_box_blob())
    plugin._settings["last_save_path"] = str(save_file)
    calls = []
    real = main.parse_save_boxes

    def counting(path):
        calls.append(path)
        return real(path)

    monkeypatch.setattr(main, "parse_save_boxes", counting)
    out = asyncio.run(plugin.get_boxes())
    assert out["box_count"] == 1
    assert out["boxes"][0]["name"] == "Box 1"
    assert out["boxes"][0]["mons"][0]["species"] == "MEW"
    assert out["boxes"][0]["mons"][1] is None

    # Cached: same mtime -> no second parse.
    asyncio.run(plugin.get_boxes())
    assert calls == [str(save_file)]

    # Save again (newer mtime) -> reparse.
    time.sleep(0.02)
    save_file.write_bytes(_box_blob())
    asyncio.run(plugin.get_boxes())
    assert len(calls) == 2


def test_get_boxes_without_save(plugin):
    plugin._settings["last_save_path"] = None
    out = asyncio.run(plugin.get_boxes())
    assert out == {"boxes": [], "box_count": 0, "path": None}


# --- PBS profiles ----------------------------------------------------------------

def test_pbs_profile_remembered_and_used(plugin, monkeypatch):
    proc = {"pid": 123, "cmdline": "/home/deck/games/Empire 1.0/Game.exe"}
    monkeypatch.setattr(main, "find_game_processes", lambda: [proc])
    plugin._extract_game_name = lambda p: "Empire" if p else None

    calls = []

    def fake_load(self, path):
        calls.append(path)
        return 42

    monkeypatch.setattr(main.MovesDB, "load_pbs", fake_load)
    out = asyncio.run(plugin.load_pbs_moves("/games/PBS/moves.txt"))
    assert out["loaded"] is True
    assert calls == ["/games/PBS/moves.txt"]
    assert plugin._settings["pbs_profiles"] == {"Empire": "/games/PBS/moves.txt"}

    # auto_load_pbs prefers the profile
    out2 = asyncio.run(plugin.auto_load_pbs())
    assert out2["profile_used"] is True
    assert out2["source"] == "/games/PBS/moves.txt"
    assert calls == ["/games/PBS/moves.txt"] * 2


def test_pbs_profile_falls_back_to_discovery(plugin, monkeypatch):
    plugin._settings["pbs_profiles"] = {"Other": "/x/moves.txt"}
    monkeypatch.setattr(main, "find_game_processes", list)
    plugin._extract_game_name = lambda p: None
    monkeypatch.setattr(
        main.MovesDB, "auto_load_pbs", lambda self, save_path=None: "/found/moves.txt"
    )
    out = asyncio.run(plugin.auto_load_pbs())
    assert out["loaded"] is True
    assert out["profile_used"] is False
