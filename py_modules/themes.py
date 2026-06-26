"""Theme palette loader and accessor.

Reads ``data/themes.json`` and exposes the active theme's palette so
the frontend can render with a consistent look. The user picks the
active theme in Settings; the choice is persisted via
``PluginSettings.theme`` and re-loaded on startup.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

PLUGIN_DIR: Path = Path(__file__).resolve().parent
THEMES_PATH: Path = PLUGIN_DIR / "data" / "themes.json"

log = logging.getLogger("pokemon-overlay.themes")

DEFAULT_PALETTE: dict[str, str] = {
    "bg": "#0e0e0e",
    "bgSecondary": "rgba(255,255,255,0.04)",
    "bgTertiary": "rgba(255,255,255,0.02)",
    "border": "rgba(255,255,255,0.08)",
    "text": "#fff",
    "textSecondary": "#ccc",
    "textMuted": "#888",
    "textFaint": "#555",
    "accent": "#5eba7d",
    "accentBg": "rgba(94,186,125,0.15)",
    "shiny": "#f7d02c",
    "female": "#e87ba3",
    "male": "#7ba3e8",
    "genderless": "#888",
    "hpGood": "#5eba7d",
    "hpWarn": "#e0a458",
    "hpBad": "#e87b7b",
    "statusOK": "#5eba7d",
    "statusPSN": "#a33ea1",
    "statusPAR": "#e0a458",
    "statusBRN": "#c22e28",
    "statusSLP": "#969696",
    "statusFRZ": "#96d9d6",
    "statusFNT": "#888",
    "typeBadgeText": "#fff",
    "badgeShadow": "0 1px 2px rgba(0,0,0,0.5)",
}


class ThemeManager:
    def __init__(self, path: Path = THEMES_PATH) -> None:
        self._path = path
        self._themes: dict[str, dict[str, Any]] = {}
        self._default_id: str = "default"
        self.reload()

    def reload(self) -> None:
        self._themes = {}
        self._default_id = "default"
        if not self._path.is_file():
            log.warning(f"themes.json missing at {self._path}")
            self._themes["default"] = {
                "name": "Default",
                "description": "Built-in fallback",
                "palette": dict(DEFAULT_PALETTE),
            }
            return
        try:
            with self._path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (json.JSONDecodeError, OSError) as exc:
            log.error(f"Could not read themes.json: {exc}")
            self._themes["default"] = {
                "name": "Default",
                "description": "Built-in fallback",
                "palette": dict(DEFAULT_PALETTE),
            }
            return
        if not isinstance(data, dict):
            return
        themes = data.get("themes")
        if not isinstance(themes, dict):
            return
        for tid, tdef in themes.items():
            if not isinstance(tid, str) or not isinstance(tdef, dict):
                continue
            palette = tdef.get("palette")
            if not isinstance(palette, dict):
                continue
            self._themes[tid] = {
                "name": str(tdef.get("name", tid)),
                "description": str(tdef.get("description", "")),
                "palette": {str(k): str(v) for k, v in palette.items()},
            }
        if "default" in self._themes:
            self._default_id = "default"
        elif self._themes:
            self._default_id = next(iter(self._themes))
        log.info(
            f"Loaded {len(self._themes)} themes (default: {self._default_id})"
        )

    def get(self, theme_id: Optional[str] = None) -> dict[str, Any]:
        tid = theme_id or self._default_id
        if tid in self._themes:
            t = dict(self._themes[tid])
            t["id"] = tid
            return t
        if self._default_id in self._themes:
            t = dict(self._themes[self._default_id])
            t["id"] = self._default_id
            return t
        return {
            "id": "default",
            "name": "Default",
            "description": "Built-in fallback",
            "palette": dict(DEFAULT_PALETTE),
        }

    def list_themes(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for tid, tdef in self._themes.items():
            out.append(
                {
                    "id": tid,
                    "name": tdef.get("name", tid),
                    "description": tdef.get("description", ""),
                }
            )
        return out

    def to_api(self, active_id: Optional[str] = None) -> dict[str, Any]:
        return {
            "themes": self.list_themes(),
            "active": self.get(active_id),
        }
