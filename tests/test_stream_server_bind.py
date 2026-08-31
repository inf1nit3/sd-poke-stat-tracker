"""Round-5 tests for LiveStreamServer bind-failure and restart paths,
plus the round-8 client-replacement disconnect test (real sockets)."""
import socket
import time

from livewatch import LiveStreamServer


def test_start_on_occupied_port_returns_false():
    blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    blocker.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    blocker.bind(("127.0.0.1", 0))
    blocker.listen(1)
    port = blocker.getsockname()[1]

    captured = []
    srv = LiveStreamServer(on_state=captured.append, host="127.0.0.1", port=port)
    try:
        assert srv.start() is False
        assert srv._server is None
        assert srv.status["listening"] is False
        assert srv._accept_thread is None
    finally:
        srv.stop()
        blocker.close()


def test_restart_after_bind_failure_succeeds():
    blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    blocker.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    blocker.bind(("127.0.0.1", 0))
    blocker.listen(1)
    port = blocker.getsockname()[1]

    captured = []
    srv = LiveStreamServer(on_state=captured.append, host="127.0.0.1", port=port)
    try:
        assert srv.start() is False
    finally:
        blocker.close()

    # Same instance recovers once the port is free (main._start_stream_server
    # only keeps the reference when start() returns True, so this path
    # must stay clean).
    srv2 = LiveStreamServer(on_state=captured.append, host="127.0.0.1", port=0)
    try:
        assert srv2.start() is True
        assert srv2.status["listening"] is True
    finally:
        srv.stop()
        srv2.stop()


def test_stop_before_start_is_safe():
    captured = []
    srv = LiveStreamServer(on_state=captured.append, host="127.0.0.1", port=0)
    srv.stop()  # never started: must not raise
    assert srv.status["listening"] is False


# --- round 8: client replacement must not fire spurious on_disconnect ----

def _connect(srv, timeout=5.0):
    # The server binds port=0 (ephemeral); resolve the real port.
    port = srv._server.getsockname()[1]
    client = socket.create_connection(("127.0.0.1", port), timeout=timeout)
    client.settimeout(timeout)
    return client


def _wait_for(predicate, timeout=5.0, message="condition not met"):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(message)


def test_replaced_client_does_not_fire_on_disconnect():
    """Regression (round 8): when a second client replaces the first
    (game restart / reconnect), the old client's teardown must not call
    on_disconnect — the plugin would wrongly demote its live source
    while the new client is still streaming."""
    disconnects = []
    captured = []
    srv = LiveStreamServer(
        on_state=captured.append, on_disconnect=lambda: disconnects.append(1),
        host="127.0.0.1", port=0,
    )
    assert srv.start() is True
    port = srv._port
    try:
        client_a = _connect(srv)
        _wait_for(lambda: srv.is_connected, message="client A never connected")
        client_b = _connect(srv)
        # B replaces A; the accept loop closes A. A's teardown runs while
        # B owns the slot (or before) — no disconnect may be reported.
        _wait_for(
            lambda: srv._client is not None and srv._client is not client_a,
            message="client B never registered",
        )
        time.sleep(0.3)  # give A's thread time to run its finally
        assert disconnects == []
        assert srv.is_connected is True

        # Clean close of the CURRENT client does fire exactly once.
        client_b.close()
        _wait_for(
            lambda: srv.is_connected is False and len(disconnects) == 1,
            message="clean disconnect not reported",
        )
    finally:
        srv.stop()
        for sock in (locals().get("client_a"), locals().get("client_b")):
            try:
                sock.close()
            except OSError:
                pass


def test_clean_disconnect_fires_on_disconnect_once():
    captured = []
    disconnects = []
    srv = LiveStreamServer(
        on_state=captured.append, on_disconnect=lambda: disconnects.append(1),
        host="127.0.0.1", port=0,
    )
    assert srv.start() is True
    try:
        client = _connect(srv)
        _wait_for(lambda: srv.is_connected, message="client never connected")
        client.close()
        _wait_for(
            lambda: srv.is_connected is False and len(disconnects) == 1,
            message="clean disconnect not reported",
        )
        time.sleep(0.2)
        assert disconnects == [1]
    finally:
        srv.stop()
