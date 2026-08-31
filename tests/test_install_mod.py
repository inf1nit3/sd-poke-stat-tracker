"""Round-4 tests for the game-mod auto-installer (scripts/install_game_mod.py).

Uses tmp copies of the game-mod source so the "stale deployment"
update path can be exercised without touching the repo's real
game-mod/ files.
"""
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import install_game_mod as igm


@pytest.fixture()
def mod_src(tmp_path: Path, monkeypatch) -> Path:
    """A fake game-mod source dir with meta.txt and stream.rb."""
    src = tmp_path / "game-mod"
    src.mkdir()
    (src / "meta.txt").write_text("Name = PokeStatStream\nVersion = 0.1.0\n")
    (src / "stream.rb").write_text("# stream v1\n")
    monkeypatch.setattr(igm, "GAME_MOD_SRC", src)
    monkeypatch.setattr(igm, "META_SRC", src / "meta.txt")
    return src


@pytest.fixture()
def game_dir(tmp_path: Path) -> Path:
    g = tmp_path / "My Game"
    (g / "Plugins").mkdir(parents=True)
    return g


def test_fresh_install_copies_all_files(mod_src, game_dir):
    result = igm.install(game_dir)
    assert result == "fresh"
    plugin_dir = game_dir / "Plugins" / igm.PLUGIN_NAME
    assert (plugin_dir / "meta.txt").read_text() == (mod_src / "meta.txt").read_text()
    assert (plugin_dir / "stream.rb").read_text() == "# stream v1\n"


def test_unchanged_second_run_keeps_files(mod_src, game_dir):
    igm.install(game_dir)
    plugin_dir = game_dir / "Plugins" / igm.PLUGIN_NAME
    before = (plugin_dir / "stream.rb").stat().st_mtime_ns
    assert igm.install(game_dir) == "unchanged"
    # Not rewritten: byte-identical target keeps its inode/mtime.
    assert (plugin_dir / "stream.rb").stat().st_mtime_ns == before


def test_stale_source_gets_refreshed(mod_src, game_dir):
    igm.install(game_dir)
    plugin_dir = game_dir / "Plugins" / igm.PLUGIN_NAME
    # Plugin update ships a new stream.rb (same size, different content).
    (mod_src / "stream.rb").write_text("# stream v2 FIXED\n")
    assert igm.install(game_dir) == "updated"
    assert (plugin_dir / "stream.rb").read_text() == "# stream v2 FIXED\n"


def test_same_size_different_content_detected(mod_src, game_dir):
    # Size-only comparison would miss this; content must be compared.
    igm.install(game_dir)
    (mod_src / "stream.rb").write_text("#XXXXXXXXXXXXXXX\n")  # same length
    assert igm.install(game_dir) == "updated"


def test_orphan_file_from_older_version_removed(mod_src, game_dir):
    igm.install(game_dir)
    plugin_dir = game_dir / "Plugins" / igm.PLUGIN_NAME
    (plugin_dir / "old_helper.rb").write_text("# no longer shipped\n")
    assert igm.install(game_dir) == "updated"
    assert not (plugin_dir / "old_helper.rb").exists()


def test_new_source_file_deployed(mod_src, game_dir):
    igm.install(game_dir)
    (mod_src / "extra.rb").write_text("# new helper\n")
    assert igm.install(game_dir) == "updated"
    plugin_dir = game_dir / "Plugins" / igm.PLUGIN_NAME
    assert (plugin_dir / "extra.rb").read_text() == "# new helper\n"


def test_force_reinstalls(mod_src, game_dir):
    igm.install(game_dir)
    plugin_dir = game_dir / "Plugins" / igm.PLUGIN_NAME
    (plugin_dir / "stream.rb").write_text("corrupted\n")
    assert igm.install(game_dir, force=True) == "fresh"
    assert (plugin_dir / "stream.rb").read_text() == "# stream v1\n"


def test_legacy_plugin_removed(mod_src, game_dir):
    legacy = game_dir / "Plugins" / "PokeStatStreamer"
    legacy.mkdir()
    (legacy / "stream.rb").write_text("# legacy\n")
    igm.install(game_dir)
    assert not legacy.exists()


def test_unrelated_plugin_untouched(mod_src, game_dir):
    other = game_dir / "Plugins" / "FollowMe"
    other.mkdir()
    (other / "follow.rb").write_text("# user plugin\n")
    igm.install(game_dir)
    assert (other / "follow.rb").exists()


def test_missing_source_returns_none(monkeypatch, game_dir, tmp_path):
    monkeypatch.setattr(igm, "GAME_MOD_SRC", tmp_path / "does_not_exist")
    assert igm.install(game_dir) is None


def test_force_with_missing_sources_keeps_existing_install(monkeypatch, mod_src, game_dir, tmp_path):
    # Regression (round 12): force-reinstall wiped the target BEFORE the
    # source dirs were validated — a broken repo destroyed the working
    # install and then errored out. Validation must come first.
    igm.install(game_dir)
    plugin_dir = game_dir / "Plugins" / igm.PLUGIN_NAME
    assert (plugin_dir / "stream.rb").is_file()
    monkeypatch.setattr(igm, "GAME_MOD_SRC", tmp_path / "does_not_exist")
    assert igm.install(game_dir, force=True) is None
    assert (plugin_dir / "stream.rb").is_file()


def test_force_with_missing_meta_keeps_existing_install(monkeypatch, mod_src, game_dir, tmp_path):
    igm.install(game_dir)
    plugin_dir = game_dir / "Plugins" / igm.PLUGIN_NAME
    monkeypatch.setattr(igm, "META_SRC", tmp_path / "no_meta.txt")
    assert igm.install(game_dir, force=True) is None
    assert (plugin_dir / "meta.txt").is_file()


def test_hidden_files_not_deployed(mod_src, game_dir):
    (mod_src / ".DS_Store").write_bytes(b"junk")
    igm.install(game_dir)
    plugin_dir = game_dir / "Plugins" / igm.PLUGIN_NAME
    assert not (plugin_dir / ".DS_Store").exists()
