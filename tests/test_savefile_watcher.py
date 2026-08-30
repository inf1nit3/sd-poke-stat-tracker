"""Round-3 tests for SaveFileWatcher (py_modules/livewatch.py).

_check() is exercised directly (no polling thread) for deterministic
mtime/size semantics; start()/stop() smoke-test the thread lifecycle.
"""
import os
import time
from pathlib import Path

from livewatch import SaveFileWatcher


def _make_watcher(tmp_path: Path):
    save = tmp_path / "Game.rxdata"
    calls: list[Path] = []
    watcher = SaveFileWatcher(
        path_provider=lambda: save if save.exists() else None,
        on_change=calls.append,
    )
    return save, calls, watcher


def test_new_file_triggers_once(tmp_path):
    save, calls, watcher = _make_watcher(tmp_path)
    save.write_bytes(b"\x04\x08")
    assert watcher._check() is True
    assert calls == [save]


def test_unchanged_file_does_not_retrigger(tmp_path):
    save, calls, watcher = _make_watcher(tmp_path)
    save.write_bytes(b"\x04\x08")
    watcher._check()
    assert watcher._check() is True
    assert watcher._check() is True
    assert calls == [save]  # still exactly one


def test_mtime_change_retriggers(tmp_path):
    save, calls, watcher = _make_watcher(tmp_path)
    save.write_bytes(b"\x04\x08")
    watcher._check()
    st = save.stat()
    os.utime(save, (st.st_atime, st.st_mtime + 10))
    assert watcher._check() is True
    assert calls == [save, save]


def test_size_change_retriggers(tmp_path):
    save, calls, watcher = _make_watcher(tmp_path)
    save.write_bytes(b"\x04\x08")
    watcher._check()
    # Keep mtime but change size: size alone must count as a change.
    st = save.stat()
    save.write_bytes(b"\x04\x08 more")
    os.utime(save, (st.st_atime, st.st_mtime))
    watcher._check()
    assert calls == [save, save]


def test_notify_save_loaded_suppresses_retrigger(tmp_path):
    save, calls, watcher = _make_watcher(tmp_path)
    save.write_bytes(b"\x04\x08")
    watcher.notify_save_loaded(save)
    # Same mtime/size as just-registered: no re-trigger.
    assert watcher._check() is True
    assert calls == []


def test_missing_path_returns_false(tmp_path):
    _save, calls, watcher = _make_watcher(tmp_path)
    assert watcher._check() is False
    assert calls == []


def test_vanished_file_no_crash_then_rediscovery(tmp_path):
    save, calls, watcher = _make_watcher(tmp_path)
    save.write_bytes(b"\x04\x08")
    watcher._check()
    save.unlink()
    assert watcher._check() is False
    save.write_bytes(b"\x04\x08 v2")
    assert watcher._check() is True
    assert calls == [save, save]


def test_on_change_exception_does_not_kill_watcher(tmp_path):
    save = tmp_path / "Game.rxdata"
    save.write_bytes(b"\x04\x08")
    boom_calls: list[Path] = []

    def boom(path: Path) -> None:
        boom_calls.append(path)
        raise RuntimeError("callback exploded")

    watcher = SaveFileWatcher(path_provider=lambda: save, on_change=boom)
    assert watcher._check() is True
    assert watcher._check() is True  # state was updated despite the raise
    assert boom_calls == [save]


def test_start_stop_thread_lifecycle(tmp_path):
    save, calls, _watcher = _make_watcher(tmp_path)
    save.write_bytes(b"\x04\x08")  # the provider only yields an existing file
    fast = SaveFileWatcher(
        path_provider=lambda: save if save.exists() else None,
        on_change=calls.append,
        interval=0.2,
    )
    fast.start()
    assert fast._thread is not None and fast._thread.is_alive()
    time.sleep(0.5)  # >= one poll cycle
    fast.stop()
    # stop() joins and clears the thread handle.
    assert fast._thread is None
    # start() after stop() works again.
    fast.start()
    time.sleep(0.05)
    fast.stop()
    assert calls, "watcher never fired after restart"
    # start() twice: the second call is a no-op while alive.
    t = SaveFileWatcher(path_provider=lambda: save, on_change=calls.append)
    t.start()
    first_thread = t._thread
    t.start()
    assert t._thread is first_thread
    t.stop()
