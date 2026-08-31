"""Round-9 tests for steampaths.py, focused on libraryfolders.vdf support.

Regression (round 9): candidate_steam_roots() only knew the three default
library locations. Games installed to a second library — on the Steam Deck
typically the SD card (/run/media/*/SteamLibrary) — were never scanned, so
save resolution and PBS discovery found nothing there.
"""
from pathlib import Path

import pytest
from steampaths import _parse_library_folders_vdf, candidate_steam_roots


@pytest.fixture()
def fake_home(tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    return home


def _write_vdf(steamapps: Path, content: str) -> Path:
    steamapps.mkdir(parents=True, exist_ok=True)
    vdf = steamapps / "libraryfolders.vdf"
    vdf.write_text(content, encoding="utf-8")
    return vdf


MODERN_VDF = """
"libraryfolders"
{
	"0"
	{
		"path"		"/home/deck/.steam/steam"
		"label"		""
		"contentid"		"1234567890"
		"totalsize"		"24418937984"
	}
	"1"
	{
		"path"		"/run/media/mmcblk0p1/SteamLibrary"
		"label"		"SD Card"
		"contentid"		"9876543210"
	}
}
"""

LEGACY_VDF = """
"LibraryFolders"
{
	"1"		"/home/deck/.steam/steam"
	"2"		"/mnt/games/SteamLibrary"
}
"""


# --- _parse_library_folders_vdf --------------------------------------------------

def test_parse_vdf_modern_format(tmp_path):
    vdf = tmp_path / "libraryfolders.vdf"
    vdf.write_text(MODERN_VDF, encoding="utf-8")
    out = _parse_library_folders_vdf(vdf)
    assert Path("/home/deck/.steam/steam") in out
    assert Path("/run/media/mmcblk0p1/SteamLibrary") in out
    assert len(out) == 2


def test_parse_vdf_legacy_format(tmp_path):
    vdf = tmp_path / "libraryfolders.vdf"
    vdf.write_text(LEGACY_VDF, encoding="utf-8")
    out = _parse_library_folders_vdf(vdf)
    assert Path("/home/deck/.steam/steam") in out
    assert Path("/mnt/games/SteamLibrary") in out


def test_parse_vdf_ignores_non_path_numeric_keys(tmp_path):
    vdf = tmp_path / "libraryfolders.vdf"
    vdf.write_text(
        '"libraryfolders"\n{\n\t"0"\n\t{\n'
        '\t\t"path"\t\t"/games/lib"\n'
        '\t\t"buildid"\t\t"1234"\n'
        '\t\t"last_update"\t\t"1700000000"\n'
        "\t}\n}\n",
        encoding="utf-8",
    )
    out = _parse_library_folders_vdf(vdf)
    assert out == [Path("/games/lib")]


def test_parse_vdf_missing_file(tmp_path):
    assert _parse_library_folders_vdf(tmp_path / "nope.vdf") == []


def test_parse_vdf_garbage_is_tolerated(tmp_path):
    vdf = tmp_path / "libraryfolders.vdf"
    vdf.write_text("\x00not a vdf at all {{{", encoding="utf-8")
    assert _parse_library_folders_vdf(vdf) == []


def test_parse_vdf_unescapes_windows_paths(tmp_path):
    vdf = tmp_path / "libraryfolders.vdf"
    vdf.write_text('"path"\t\t"C:\\\\Games\\\\SteamLibrary"', encoding="utf-8")
    assert _parse_library_folders_vdf(vdf) == [Path("C:\\Games\\SteamLibrary")]


# --- candidate_steam_roots ---------------------------------------------------------

def test_candidate_roots_include_vdf_libraries(fake_home):
    default = fake_home / ".steam" / "steam" / "steamapps"
    default.mkdir(parents=True)
    sd = fake_home.parent / "SDCard" / "SteamLibrary"
    (sd / "steamapps").mkdir(parents=True)
    _write_vdf(
        default,
        f'"libraryfolders"\n{{\n\t"0"\n\t{{\n\t\t"path"\t\t"{default.parent}"\n\t}}\n'
        f'\t"1"\n\t{{\n\t\t"path"\t\t"{sd}"\n\t}}\n}}\n',
    )
    out = candidate_steam_roots()
    assert default in out
    assert sd / "steamapps" in out
    # The default library listed in the VDF must not be duplicated.
    assert out.count(default) == 1


def test_candidate_roots_skip_nonexistent_vdf_libraries(fake_home):
    default = fake_home / ".steam" / "steam" / "steamapps"
    default.mkdir(parents=True)
    _write_vdf(
        default,
        '"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"/unmounted/sdcard"\n\t}\n}\n',
    )
    out = candidate_steam_roots()
    assert out == [default]


def test_candidate_roots_without_steam_install(fake_home):
    assert candidate_steam_roots() == []


def test_candidate_roots_dedupe_symlinked_default(fake_home):
    """~/.steam/steam is often a symlink to ~/.local/share/Steam."""
    real = fake_home / ".local" / "share" / "Steam" / "steamapps"
    real.mkdir(parents=True)
    link = fake_home / ".steam" / "steam"
    link.mkdir(parents=True)
    try:
        (link / "steamapps").symlink_to(real)
    except OSError:
        pytest.skip("symlinks unavailable")
    out = candidate_steam_roots()
    assert len(out) == 1
    assert out[0].resolve() == real.resolve()
