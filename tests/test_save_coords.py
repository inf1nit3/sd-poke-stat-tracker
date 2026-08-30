"""Regression tests for player coordinate extraction (round 2).

``@real_x``/``@real_y`` are smooth-scroll coordinates (``@x * 128``).
A round-1 bug let them overwrite the correct ``@x``/``@y`` tile
coordinates; these tests pin down the precedence.
"""
from rubymarshal.classes import RubyObject
from rubymarshal.writer import writes
from saveparser import _parse_and_extract


def _blob(player_attrs: dict) -> bytes:
    top = {"$game_player": RubyObject("Game_Player", player_attrs)}
    return writes(top)


def test_tile_coords_win_over_smooth_scroll():
    data = _parse_and_extract(
        _blob({"@x": 5, "@y": 7, "@real_x": 640, "@real_y": 896}),
        None,
        "test",
    )
    assert data.x == 5
    assert data.y == 7


def test_smooth_scroll_used_as_fallback_only():
    # Older saves may lack @x/@y — then @real_x/@real_y are the only hint.
    data = _parse_and_extract(
        _blob({"@real_x": 640, "@real_y": 896}),
        None,
        "test",
    )
    assert data.x == 640
    assert data.y == 896


def test_no_player_object_defaults():
    data = _parse_and_extract(_blob({}), None, "test")
    assert data.x is None
    assert data.y is None


def test_non_numeric_coords_ignored():
    data = _parse_and_extract(
        _blob({"@x": "garbage", "@real_x": 640, "@y": 3}),
        None,
        "test",
    )
    # "garbage" can't coerce; @real_x is the fallback for x.
    assert data.x == 640
    assert data.y == 3
