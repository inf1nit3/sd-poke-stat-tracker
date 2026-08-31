"""Round-6 tests for themes.py, focused on reload() fallback behavior.

Regression (round 6): a themes.json with a valid-but-wrong shape (top-level
list, non-dict ``themes``, empty ``themes``) left the manager with ZERO
themes, while a missing or corrupt-JSON file correctly fell back to the
built-in default. All failure shapes now leave the default selectable.
"""
import json

import pytest
from themes import DEFAULT_PALETTE, ThemeManager


@pytest.fixture()
def manager(tmp_path):
    def make(content=None, *, raw=None):
        path = tmp_path / "themes.json"
        if raw is not None:
            path.write_text(raw, encoding="utf-8")
        elif content is not None:
            path.write_text(json.dumps(content), encoding="utf-8")
        return ThemeManager(path)

    return make


def _default_entry(mgr):
    return next(t for t in mgr.list_themes() if t["id"] == "default")


# --- failure shapes all keep the built-in default -------------------------------

def test_missing_file_falls_back_to_default(manager):
    mgr = manager()
    assert _default_entry(mgr)["name"] == "Default"
    assert mgr.get()["palette"] == DEFAULT_PALETTE


def test_corrupt_json_falls_back_to_default(manager):
    mgr = manager(raw="{not json")
    assert _default_entry(mgr)["name"] == "Default"


def test_wrong_top_level_shape_falls_back_to_default(manager):
    """Regression: a JSON array used to leave zero themes."""
    mgr = manager(raw="[]")
    assert _default_entry(mgr)["name"] == "Default"
    assert mgr.get()["id"] == "default"


def test_wrong_themes_shape_falls_back_to_default(manager):
    mgr = manager({"themes": "nope"})
    assert _default_entry(mgr)["name"] == "Default"


def test_empty_themes_dict_falls_back_to_default(manager):
    mgr = manager({"themes": {}})
    assert _default_entry(mgr)["name"] == "Default"


# --- valid shapes -----------------------------------------------------------------

def test_valid_default_theme_wins(manager):
    mgr = manager(
        {
            "themes": {
                "default": {
                    "name": "Custom Default",
                    "palette": {"accent": "#123456"},
                }
            }
        }
    )
    assert mgr.get()["id"] == "default"
    assert mgr.get()["name"] == "Custom Default"
    assert mgr.get()["palette"]["accent"] == "#123456"


def test_valid_without_default_uses_first_theme(manager):
    mgr = manager(
        {
            "themes": {
                "dark": {"name": "Dark", "palette": {"accent": "#000"}},
                "light": {"name": "Light", "palette": {"accent": "#fff"}},
            }
        }
    )
    assert mgr.get()["id"] == "dark"
    # No built-in default is injected when the file provides real themes.
    assert [t["id"] for t in mgr.list_themes()] == ["dark", "light"]


def test_invalid_theme_entries_are_skipped(manager):
    mgr = manager(
        {
            "themes": {
                "not-a-dict": "oops",
                "no-palette": {"name": "NoPalette"},
                "bad-palette": {"palette": "nope"},
                "good": {"name": "Good", "palette": {"accent": "#fff"}},
            }
        }
    )
    assert [t["id"] for t in mgr.list_themes()] == ["good"]


def test_palette_values_are_coerced_to_strings(manager):
    mgr = manager({"themes": {"t": {"palette": {"accent": 123}}}})
    assert mgr.get()["palette"]["accent"] == "123"


# --- get() fallbacks ----------------------------------------------------------------

def test_get_unknown_id_falls_back_to_default(manager):
    mgr = manager({"themes": {"dark": {"name": "Dark", "palette": {"accent": "#000"}}}})
    out = mgr.get("does-not-exist")
    assert out["id"] == "dark"  # default id of this file, not a crash


def test_get_without_any_theme_uses_builtin_palette():
    mgr = ThemeManager.__new__(ThemeManager)
    mgr._themes = {}
    mgr._default_id = "default"
    out = mgr.get()
    assert out["id"] == "default"
    assert out["palette"] == DEFAULT_PALETTE
