"""Round-3 integration tests for LiveStreamServer (py_modules/livewatch.py).

Real sockets on 127.0.0.1 with an ephemeral port (port=0). Covers TCP
fragmentation, multi-frame segments, oversized lines, bad JSON,
single-client replacement and clean shutdown.
"""
import json
import socket
import threading
import time

import pytest
from livewatch import LiveStreamServer


def _frame(payload: dict) -> bytes:
    return (json.dumps(payload) + "\n").encode("utf-8")


def _wait_until(pred, timeout: float = 3.0, what: str = "condition") -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if pred():
            return
        time.sleep(0.01)
    raise AssertionError(f"timed out waiting for {what}")


@pytest.fixture()
def server():
    captured: list[dict] = []
    srv = LiveStreamServer(on_state=captured.append, host="127.0.0.1", port=0)
    assert srv.start() is True
    port = srv._server.getsockname()[1]
    yield srv, port, captured
    srv.stop()


def test_fragmented_frame_arrives_once(server):
    srv, port, captured = server
    with socket.create_connection(("127.0.0.1", port), timeout=3) as client:
        payload = {
            "kind": "live_state", "trainer": "Red", "money": 3000,
            "in_battle": False, "party": [], "battle_enemies": [],
            "battle_player": [],
        }
        frame = _frame(payload)
        # Simulate TCP fragmentation: deliver in 3 pieces with pauses.
        client.sendall(frame[:10])
        time.sleep(0.05)
        client.sendall(frame[10:60])
        time.sleep(0.05)
        client.sendall(frame[60:])
        _wait_until(lambda: len(captured) == 1, what="one dispatch")
        assert captured[0]["trainer_name"] == "Red"
        assert srv.status["total_frames"] == 1


def test_two_frames_in_one_segment(server):
    srv, port, captured = server
    with socket.create_connection(("127.0.0.1", port), timeout=3) as client:
        client.sendall(
            _frame({"kind": "live_state", "trainer": "A", "party": [],
                    "battle_enemies": [], "battle_player": []})
            + _frame({"kind": "live_state", "trainer": "B", "party": [],
                      "battle_enemies": [], "battle_player": []})
        )
        _wait_until(lambda: len(captured) == 2, what="two dispatches")
        assert [c["trainer_name"] for c in captured] == ["A", "B"]
        assert srv.status["total_frames"] == 2


def test_bad_json_skipped_not_fatal(server):
    _srv, port, captured = server
    with socket.create_connection(("127.0.0.1", port), timeout=3) as client:
        good = {
            "kind": "live_state", "trainer": "Red", "party": [],
            "battle_enemies": [], "battle_player": [],
        }
        client.sendall(b"definitely not json\n")
        client.sendall(b'{broken json\n')
        client.sendall(_frame(good))
        _wait_until(lambda: len(captured) == 1, what="dispatch after bad frames")
        assert captured[0]["trainer_name"] == "Red"


def test_non_live_state_kind_ignored(server):
    srv, port, captured = server
    with socket.create_connection(("127.0.0.1", port), timeout=3) as client:
        client.sendall(_frame({"kind": "ping"}))
        client.sendall(_frame({"other": "shape"}))
        client.sendall(b'[1, 2, 3]\n')
        time.sleep(0.15)
        assert captured == []
        assert srv.status["total_frames"] == 0


def test_oversized_line_dropped_connection_survives(server):
    _srv, port, captured = server
    with socket.create_connection(("127.0.0.1", port), timeout=3) as client:
        # > 256 KB without the parser keeping it: one giant line then a
        # valid frame. The giant line is discarded, the valid one arrives.
        junk = b"x" * (256 * 1024 + 4096)
        client.sendall(junk + b"\n")
        client.sendall(_frame({
            "kind": "live_state", "trainer": "After", "party": [],
            "battle_enemies": [], "battle_player": [],
        }))
        _wait_until(lambda: len(captured) == 1, what="frame after oversized line")
        assert captured[0]["trainer_name"] == "After"


def test_second_client_replaces_first(server):
    srv, port, captured = server
    first = socket.create_connection(("127.0.0.1", port), timeout=3)
    _wait_until(lambda: srv.is_connected, what="first client connected")

    second = socket.create_connection(("127.0.0.1", port), timeout=3)
    _wait_until(lambda: srv.status["connected"] is True and srv._client is not None,
                what="second client connected")
    # The first socket must be closed by the server.
    first.settimeout(3.0)
    closed = first.recv(64)
    assert closed == b"", "first client should see EOF after replacement"
    first.close()

    second.sendall(_frame({
        "kind": "live_state", "trainer": "Second", "party": [],
        "battle_enemies": [], "battle_player": [],
    }))
    _wait_until(lambda: len(captured) == 1, what="dispatch from second client")
    assert captured[0]["trainer_name"] == "Second"
    second.close()


def test_on_disconnect_fires(server):
    srv, port, _ = server
    fired = threading.Event()
    srv._on_disconnect = fired.set
    client = socket.create_connection(("127.0.0.1", port), timeout=3)
    _wait_until(lambda: srv.is_connected, what="client connected")
    client.close()
    _wait_until(lambda: fired.is_set(), what="on_disconnect callback")
    _wait_until(lambda: srv.status["connected"] is False, what="status reconnects to false")


def test_stop_shuts_down_cleanly(server):
    srv, port, _ = server
    client = socket.create_connection(("127.0.0.1", port), timeout=3)
    _wait_until(lambda: srv.is_connected, what="client connected")
    srv.stop()
    # Threads joined -> stop() returned; server socket is gone.
    assert srv._server is None
    assert srv._accept_thread is None
    client.close()
    # stop() is idempotent.
    srv.stop()
