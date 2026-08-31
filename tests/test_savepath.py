"""Round-6 regression tests for savepath.py filesystem robustness.

Covers the TOCTOU crashes in the mtime sort keys (a save vanishing
between the directory scan and the stat call) and the permission-error
handling in the wine-prefix scan.
"""
import os
from pathlib import Path

import pytest
import savepath
from savepath import (
    _dedupe_by_mtime,
    _find_via_open_files,
    _scan_wine_prefixes,
    find_save_file,
)


@pytest.fixture(autouse=True)
def _reset_process_cache():
    """_find_via_open_files keeps a module-global pid/path cache; tests
    must not leak entries into each other."""
    old = (savepath._cached_save_pid, savepath._cached_save_path)
    savepath._cached_save_pid = None
    savepath._cached_save_path = None
    yield
    savepath._cached_save_pid, savepath._cached_save_path = old


def _write_save(directory: Path, name: str = "Game.rxdata") -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    p = directory / name
    p.write_bytes(b"save")
    return p


# --- _dedupe_by_mtime ---------------------------------------------------------

def test_dedupe_drops_files_that_vanished_before_sort(tmp_path):
    """Regression (round 6): stat() in the sort key crashed with
    FileNotFoundError when a save was deleted between scan and sort."""
    live = _write_save(tmp_path / "a")
    dead = _write_save(tmp_path / "b")
    dead.unlink()
    out = _dedupe_by_mtime([dead, live])
    assert out == [live]


def test_dedupe_orders_by_mtime_descending(tmp_path):
    import time

    old = _write_save(tmp_path / "old")
    new = _write_save(tmp_path / "new")
    past = time.time() - 3600
    os.utime(old, (past, past))
    assert _dedupe_by_mtime([old, new]) == [new, old]


def test_dedupe_resolves_duplicate_paths(tmp_path):
    real = _write_save(tmp_path / "game")
    link = tmp_path / "link.rxdata"
    try:
        link.symlink_to(real)
    except OSError:
        pytest.skip("symlinks unavailable")
    assert _dedupe_by_mtime([real, link]) == [real]


# --- _find_via_open_files -------------------------------------------------------

class _FakeFile:
    def __init__(self, path: str) -> None:
        self.path = path


class _FakeProc:
    def __init__(self, pid: int, open_paths: list[str]) -> None:
        self.pid = pid

        def open_files():
            return [_FakeFile(p) for p in open_paths]

        self.open_files = open_files

    def name(self):
        return "somegame.exe"

    def cmdline(self):
        return []


def test_find_via_open_files_survives_vanished_candidate(monkeypatch):
    """Regression (round 6): a candidate whose file is gone before the
    sort stat crashed find_save_file; now the candidate is dropped."""
    monkeypatch.setattr(
        savepath.psutil, "process_iter", lambda: [_FakeProc(111, ["/gone/Game.rxdata"])]
    )
    monkeypatch.setattr(savepath, "_is_readable", lambda p: True)
    assert _find_via_open_files() is None


def test_find_via_open_files_returns_newest_and_caches(monkeypatch, tmp_path):
    import time

    old = _write_save(tmp_path / "p1")
    new = _write_save(tmp_path / "p2")
    past = time.time() - 3600
    os.utime(old, (past, past))
    procs = [_FakeProc(1, [str(old)]), _FakeProc(2, [str(new)])]
    monkeypatch.setattr(savepath.psutil, "process_iter", lambda: procs)
    out = _find_via_open_files()
    assert out == new
    assert savepath._cached_save_pid == 2
    assert savepath._cached_save_path == new


# --- _scan_wine_prefixes ---------------------------------------------------------

def test_scan_wine_prefixes_skips_unreadable_compatdata_child(tmp_path, monkeypatch):
    if os.geteuid() == 0:
        pytest.skip("permission tests meaningless as root")
    steamapps = tmp_path / "steamapps"
    compat = steamapps / "compatdata"
    good = _write_save(
        compat / "123" / "pfx" / "drive_c" / "users" / "steamuser" / "Documents"
    )
    bad = compat / "456"
    bad.mkdir()
    bad.chmod(0o000)
    monkeypatch.setattr(savepath, "candidate_steam_roots", lambda: [steamapps])
    try:
        out = _scan_wine_prefixes()
    finally:
        bad.chmod(0o755)
    assert good in out


def test_scan_wine_prefixes_skips_unreadable_compatdata_root(tmp_path, monkeypatch):
    if os.geteuid() == 0:
        pytest.skip("permission tests meaningless as root")
    steamapps = tmp_path / "steamapps"
    compat = steamapps / "compatdata"
    compat.mkdir(parents=True)
    compat.chmod(0o000)
    monkeypatch.setattr(savepath, "candidate_steam_roots", lambda: [steamapps])
    try:
        assert _scan_wine_prefixes() == []
    finally:
        compat.chmod(0o755)


def test_scan_wine_prefixes_empty_steamapps(tmp_path, monkeypatch):
    monkeypatch.setattr(
        savepath, "candidate_steam_roots", lambda: [tmp_path / "nowhere"]
    )
    monkeypatch.setattr(savepath, "candidate_non_steam_roots", list)
    assert _scan_wine_prefixes() == []


# --- find_save_file --------------------------------------------------------------

def test_find_save_file_readable_override_wins(tmp_path, monkeypatch):
    override = _write_save(tmp_path / "custom")
    monkeypatch.setattr(
        savepath, "_find_via_open_files", lambda: pytest.fail("must not scan")
    )
    assert find_save_file(str(override)) == override


def test_find_save_file_unreadable_override_falls_back_to_scan(tmp_path, monkeypatch):
    scanned = _write_save(tmp_path / "scanned")
    monkeypatch.setattr(savepath, "_find_via_open_files", lambda: None)
    monkeypatch.setattr(savepath, "_scan_wine_prefixes", lambda: [scanned])
    monkeypatch.setattr(savepath, "_scan_native_library", list)
    assert find_save_file(str(tmp_path / "missing.rxdata")) == scanned


def test_find_save_file_nothing_found(tmp_path, monkeypatch):
    monkeypatch.setattr(savepath, "_find_via_open_files", lambda: None)
    monkeypatch.setattr(savepath, "_scan_wine_prefixes", list)
    monkeypatch.setattr(savepath, "_scan_native_library", list)
    assert find_save_file() is None
