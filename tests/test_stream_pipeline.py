"""Round-10: full stream pipeline integration test.

Wires a real LiveStreamServer (ephemeral port, real sockets) to a real
Plugin instance and drives frames through the whole chain:
  game-mod JSON line -> _client_loop -> _dispatch -> Plugin._on_stream_state
  -> save cache -> get_live_state / get_live_save_data.

Also pins the malformed-input contract: garbage lines, non-dict JSON and
unknown payload kinds are skipped without killing the connection, and a
clean disconnect demotes the live source (round-8 regression, end to end).
"""
import json
import socket
import time

import pytest
from livewatch import LiveStreamServer

import main


@pytest.fixture()
def stream_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SETTINGS_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")
    p = main.Plugin()
    p._initialized = True
    server = LiveStreamServer(
        on_state=p._on_stream_state, on_disconnect=p._on_stream_disconnect
    )
    assert server.start() is True
    p._stream_server = server
    p._live_source = "stream"
    yield p, server
    server.stop()


def _connect(server: LiveStreamServer) -> socket.socket:
    port = server._server.getsockname()[1]
    client = socket.create_connection(("127.0.0.1", port), timeout=5)
    client.settimeout(5)
    return client


def _wait_for(predicate, timeout=5.0, message="condition not met"):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(message)


def _frame(**overrides) -> bytes:
    payload = {
        "kind": "live_state",
        "trainer": "Blue",
        "money": 3000,
        "badges": 4,
        "map_name": "Route 7",
        "map_id": 42,
        "x": 10,
        "y": 20,
        "play_time": 3661,
        "in_battle": False,
        "in_menu": False,
        "at": time.time(),
        "party": [
            {
                "species": "PIKACHU",
                "level": 25,
                "hp": 45,
                "max_hp": 60,
                "status": 1,
                "moves": ["THUNDERBOLT"],
                "type1": "Electric",
            }
        ],
        "battle_enemies": [],
        "battle_player": [],
    }
    payload.update(overrides)
    return (json.dumps(payload) + "\n").encode("utf-8")


def _send(client: socket.socket, blob: bytes) -> None:
    client.sendall(blob)


def test_valid_frame_flows_through_to_plugin_state(stream_plugin):
    plugin, server = stream_plugin
    client = _connect(server)
    try:
        _wait_for(lambda: server.is_connected)
        _send(client, _frame())
        _wait_for(
            lambda: plugin._save_cache is not None
            and plugin._save_cache.get("trainer_name") == "Blue",
            message="frame never reached the plugin state",
        )
        cache = plugin._save_cache
        assert cache["party_count"] == 1
        assert cache["party"][0]["species"] == "PIKACHU"
        # Status int is translated to a name like saveparser does.
        assert cache["party"][0]["status_name"] == "PSN"
        assert cache["location_name"] == "Route 7"
        assert cache["play_time_seconds"] == 3661
        assert cache["screen_state"] == "overworld"
        assert cache["battle_analysis"] is None
        assert plugin._live_source == "stream"
        assert plugin._save_cache_at_wall > 0
        status = server.status
        assert status["total_frames"] == 1
        assert status["last_data_trainer"] == "Blue"
    finally:
        client.close()


def test_battle_frame_computes_battle_analysis(stream_plugin):
    plugin, server = stream_plugin
    client = _connect(server)
    try:
        _wait_for(lambda: server.is_connected)
        _send(
            client,
            _frame(
                in_battle=True,
                party=[{"species": "PIKACHU", "level": 25, "hp": 45, "max_hp": 60}],
                battle_enemies=[
                    {"species": "SQUIRTLE", "level": 20, "hp": 40, "max_hp": 50, "type1": "Water"}
                ],
                battle_player=[
                    {"species": "PIKACHU", "level": 25, "hp": 45, "max_hp": 60, "moves": ["THUNDERBOLT"]}
                ],
            ),
        )
        _wait_for(
            lambda: plugin._save_cache is not None
            and plugin._save_cache.get("battle_analysis") is not None,
            message="battle analysis never computed",
        )
        analysis = plugin._save_cache["battle_analysis"]
        assert analysis["enemy"]["name"] == "SQUIRTLE"
        assert plugin._save_cache["screen_state"] == "battle_active"
    finally:
        client.close()


def test_malformed_frames_are_skipped_connection_stays_alive(stream_plugin):
    """Garbage must not kill the connection nor count as a frame."""
    plugin, server = stream_plugin
    client = _connect(server)
    try:
        _wait_for(lambda: server.is_connected)
        # Non-JSON line
        _send(client, b"this is not json\n")
        # Valid JSON, but a top-level array
        _send(client, b"[1, 2, 3]\n")
        # Valid JSON dict, but the wrong kind
        _send(client, b'{"kind": "something_else"}\n')
        time.sleep(0.3)
        assert server.status["total_frames"] == 0
        assert server.is_connected is True
        assert plugin._save_cache is None

        # The connection still works for real frames afterwards.
        _send(client, _frame())
        _wait_for(
            lambda: plugin._save_cache is not None
            and plugin._save_cache.get("trainer_name") == "Blue",
            message="valid frame after garbage never arrived",
        )
        assert server.status["total_frames"] == 1
    finally:
        client.close()


def test_party_filters_non_dict_entries(stream_plugin):
    plugin, server = stream_plugin
    client = _connect(server)
    try:
        _wait_for(lambda: server.is_connected)
        _send(
            client,
            _frame(
                party=[
                    "not-a-dict",
                    {"species": "MEW", "level": 50, "hp": 100, "max_hp": 100},
                    42,
                ]
            ),
        )
        _wait_for(
            lambda: plugin._save_cache is not None,
            message="frame never arrived",
        )
        party = plugin._save_cache["party"]
        assert len(party) == 1
        assert party[0]["species"] == "MEW"
        assert plugin._save_cache["party_count"] == 1
    finally:
        client.close()


def test_disconnect_demotes_live_source_end_to_end(stream_plugin):
    """Round-8 regression, end to end: clean client close fires the
    on_disconnect callback, which demotes the plugin's live source."""
    plugin, server = stream_plugin
    client = _connect(server)
    _wait_for(lambda: server.is_connected)
    _send(client, _frame())
    _wait_for(lambda: plugin._save_cache is not None)
    assert plugin._live_source == "stream"
    client.close()
    _wait_for(
        lambda: server.is_connected is False, message="disconnect not detected"
    )
    _wait_for(
        lambda: plugin._live_source == "disk",
        message="live source not demoted after disconnect",
    )
