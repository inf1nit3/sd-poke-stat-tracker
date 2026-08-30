"""Round-3 tests for main.Plugin.get_live_state shape and stream decoupling.

Anchors the round-1 battle_analysis passthrough and the round-2 fix
that keeps the stream server alive when the memory reader stops.
"""
import asyncio
import threading
from types import SimpleNamespace

import pytest

import main


@pytest.fixture()
def plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SETTINGS_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")
    p = main.Plugin()
    return p


def test_live_state_surfaces_cache_fields(plugin):
    analysis = {"enemy": {"name": "Charizard"}, "best_move": "Tackle"}
    plugin._save_cache = {
        "party": [{"species": "Pikachu"}],
        "in_menu": True,
        "in_battle": False,
        "screen_state": "menu",
        "battle_analysis": analysis,
    }
    plugin._save_cache_path = "/tmp/Game.rxdata"
    stream = SimpleNamespace(status={
        "listening": True, "connected": True, "last_data_at": 42.0,
        "last_data_trainer": "Red", "total_frames": 7,
    })
    plugin._stream_server = stream

    state = asyncio.run(plugin.get_live_state())
    assert state["battle_analysis"] == analysis
    assert state["in_menu"] is True
    assert state["in_battle"] is False
    assert state["screen_state"] == "menu"
    assert state["last_save_path"] == "/tmp/Game.rxdata"
    assert state["stream_status"]["connected"] is True
    assert state["stream_status"]["total_frames"] == 7


def test_live_state_without_stream_server(plugin):
    plugin._save_cache = {"party": []}
    plugin._stream_server = None
    state = asyncio.run(plugin.get_live_state())
    # Neutral stream status instead of a None-deref.
    assert state["stream_status"] == {
        "listening": False, "connected": False, "last_data_at": 0.0,
        "last_data_trainer": None, "total_frames": 0,
    }
    assert state["battle_analysis"] is None


def test_live_state_with_non_dict_cache(plugin):
    plugin._save_cache = None
    state = asyncio.run(plugin.get_live_state())
    assert state["in_menu"] is False
    assert state["in_battle"] is False
    assert state["screen_state"] is None
    assert state["battle_analysis"] is None


def test_stop_memory_reader_keeps_stream_server(plugin):
    stream = SimpleNamespace(status={"listening": True})
    plugin._stream_server = stream
    plugin._memory_reader = None
    plugin._stop_memory_reader()
    assert plugin._stream_server is stream


def test_stop_memory_reader_signals_self_thread(plugin):
    # A reader running on the *current* thread must be signalled via
    # _stop.set() instead of stop() (self-join deadlock).
    reader = SimpleNamespace(
        _thread=threading.current_thread(),
        _stop=threading.Event(),
        stop=lambda: pytest.fail("stop() called from its own thread"),
    )
    plugin._memory_reader = reader
    plugin._stop_memory_reader()
    assert reader._stop.is_set()
    assert plugin._memory_reader is None


def test_stop_memory_reader_joins_other_thread(plugin):
    # Use a real LiveMemoryReader to verify stop() is invoked.
    from livewatch import LiveMemoryReader

    real = LiveMemoryReader(pid=1, on_update=lambda p: None)
    calls = []
    real.stop = lambda: calls.append(True)
    plugin._memory_reader = real
    plugin._stop_memory_reader()
    assert calls == [True]
    assert plugin._memory_reader is None
