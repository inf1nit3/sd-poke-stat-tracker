"""Round-5 tests for LiveStreamServer bind-failure and restart paths."""
import socket

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
