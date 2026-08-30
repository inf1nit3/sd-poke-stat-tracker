"""Round-2 tests for the live pipeline: stream dispatch normalization,
memory-reader region handling.

No sockets are opened — LiveStreamServer._dispatch is exercised
directly, and process-memory reads are monkeypatched.
"""

import livewatch
from livewatch import LiveMemoryReader, LiveStreamServer


def _make_server(on_state):
    return LiveStreamServer(on_state=on_state)


def test_dispatch_normalizes_party_payload():
    captured = []
    server = _make_server(captured.append)
    server._dispatch({
        "kind": "live_state",
        "trainer": "Red",
        "money": 3000,
        "badges": 2,
        "map_name": "Pallet Town",
        "map_id": 3,
        "x": 10,
        "y": 12,
        "play_time": 3600,
        "at": 1234.5,
        "in_menu": False,
        "in_battle": False,
        "party": [{"species": "PIKACHU", "level": 25, "hp": 60, "max_hp": 70,
                   "status": 0, "moves": ["THUNDERBOLT"], "type1": "Electric"}],
        "battle_enemies": [],
        "battle_player": [],
    })
    assert len(captured) == 1
    state = captured[0]
    assert state["trainer_name"] == "Red"
    assert state["party_count"] == 1
    assert state["party"][0]["species"] == "PIKACHU"
    assert state["screen_state"] == "overworld"
    assert state["battle_analysis"] is None
    assert server.status["total_frames"] == 1


def test_dispatch_computes_battle_analysis():
    captured = []
    server = _make_server(captured.append)
    server._dispatch({
        "kind": "live_state",
        "in_battle": True,
        "party": [{"species": "SQUIRTLE", "level": 20, "hp": 50, "max_hp": 55,
                   "status": 0, "moves": ["SURF"], "type1": "Water"}],
        "battle_enemies": [{
            "species": "CHARMANDER", "type1": "Fire", "hp": 20, "max_hp": 40,
            "stages": {"ATTACK": 2, "SPEED": 1}, "moves": [],
        }],
        "battle_player": [{"species": "SQUIRTLE", "type1": "Water",
                           "hp": 50, "max_hp": 55, "moves": ["Surf"]}],
    })
    assert len(captured) == 1
    state = captured[0]
    assert state["in_battle"] is True
    assert state["screen_state"] == "battle_active"
    analysis = state["battle_analysis"]
    assert analysis is not None
    assert analysis["enemy"]["name"] == "CHARMANDER"
    # Hash stages must arrive as the normalized 5-element list.
    assert analysis["enemy"]["stages"] == [2, 0, 0, 0, 1]


def test_dispatch_ignores_unknown_kind_and_non_dict():
    captured = []
    server = _make_server(captured.append)
    server._dispatch({"kind": "other"})
    server._dispatch([1, 2, 3])
    server._dispatch("junk")
    assert captured == []
    assert server.status["total_frames"] == 0


# --- memory reader ----------------------------------------------------------

def test_read_blob_at_caps_at_region_end(monkeypatch):
    reads = []

    def fake_read(pid, addr, size):
        reads.append((addr, size))
        return b"\x04\x08" + b"\x00" * (size - 2)

    monkeypatch.setattr(livewatch, "read_process_memory", fake_read)
    reader = LiveMemoryReader(pid=4242, on_update=lambda p: None)
    # Blob header at 0xF00 inside region 0x1000-0x2000: only 0x100 bytes
    # remain, so the read must be capped there instead of failing by
    # crossing into unmapped space.
    blob = reader._read_blob_at("0x1000", 0xF00, "0x2000")
    assert blob is not None
    assert reads == [(0x1F00, 0x100)]


def test_read_blob_at_rejects_header_past_region_end(monkeypatch):
    monkeypatch.setattr(
        livewatch, "read_process_memory",
        lambda pid, addr, size: (_ for _ in ()).throw(AssertionError("must not read")),
    )
    reader = LiveMemoryReader(pid=4242, on_update=lambda p: None)
    assert reader._read_blob_at("0x1000", 0x2000, "0x2000") is None


def test_scan_region_finds_header_at_chunk_boundary(monkeypatch):
    # 16-byte region with the 2-byte Marshal header split across the
    # chunk boundary (byte 7 in the first chunk, byte 8 in the second).
    region_bytes = bytearray(16)
    region_bytes[7] = 0x04
    region_bytes[8] = 0x08
    reads = []

    def fake_read(pid, addr, size):
        reads.append(addr)
        start = addr - 0x1000
        return bytes(region_bytes[start:start + size])

    monkeypatch.setattr(livewatch, "read_process_memory", fake_read)
    monkeypatch.setattr(livewatch, "_SCAN_CHUNK_BYTES", 8)
    reader = LiveMemoryReader(pid=4242, on_update=lambda p: None)
    region = {"start": "0x1000", "end": "0x1010", "size": "16", "path": "[anon]"}
    # parse_fn rejects every candidate; the point is that the header at
    # the boundary is *found* (a read starting at offset 7 must occur).
    result = reader._scan_region(region, lambda blob: None)
    assert result is None
    assert any(addr == 0x1007 for addr in reads), (
        f"no boundary-overlap read at 0x1007; reads={reads}"
    )


def test_fast_path_emits_and_caches_region_end(monkeypatch):
    updates: list = []
    reader = LiveMemoryReader(pid=4242, on_update=updates.append)
    reader._known_offset = ("0x1000", 0x10, "0x2010")
    parsed = {"player": {"name": "Red"}}

    def fake_read(pid, addr, size):
        return b"\x04\x08" + b"\x00" * (size - 2)

    monkeypatch.setattr(livewatch, "read_process_memory", fake_read)
    monkeypatch.setattr(livewatch, "_pid_alive", lambda pid: True)
    # _tick checks candidate regions before consulting the fast path;
    # there is no /proc on macOS, so supply the region explicitly.
    monkeypatch.setattr(
        livewatch, "_candidate_regions",
        lambda pid: [{"start": "0x1000", "end": "0x2010", "size": "4096",
                      "path": "[anon]"}],
    )

    reader._tick(lambda blob: parsed)
    assert len(updates) == 1
    assert updates[0]["_live_source"] == "memory"
    assert reader._known_offset == ("0x1000", 0x10, "0x2010")
