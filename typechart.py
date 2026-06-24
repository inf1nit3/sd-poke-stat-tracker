"""Type chart lookups backed by data/type_chart.json (Gen 6 values).

Provides:
- get_type_chart(): full chart (types, colors, multipliers)
- get_matchup(attacker, defender_types): single attack vs. possibly dual-typed defender
- get_defense_summary(defender_types): all attacking types summarised by effectiveness
- get_offense_summary(attacker): what this attacking type is good/bad/immune against
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

PLUGIN_DIR: Path = Path(__file__).resolve().parent
TYPE_CHART_PATH: Path = PLUGIN_DIR / "data" / "type_chart.json"

VALID_MULTIPLIERS = {0.0, 0.25, 0.5, 1.0, 2.0, 4.0}


class TypeChart:
    """In-memory type chart with lookup helpers.

    The chart is loaded once from disk and cached. If the file is missing
    or malformed, all lookups return empty / neutral results so the rest
    of the plugin keeps working.
    """

    def __init__(self, path: Path = TYPE_CHART_PATH) -> None:
        self._path = path
        self._types: list[str] = []
        self._colors: dict[str, str] = {}
        self._multipliers: dict[str, dict[str, float]] = {}
        self._generation: int = 0
        self._loaded: bool = False
        self.reload()

    def reload(self) -> None:
        if not self._path.is_file():
            self._loaded = False
            return
        try:
            with self._path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (json.JSONDecodeError, OSError):
            self._loaded = False
            return
        if not isinstance(data, dict):
            self._loaded = False
            return
        types = data.get("types")
        colors = data.get("colors")
        mults = data.get("multipliers")
        if not (
            isinstance(types, list)
            and all(isinstance(t, str) for t in types)
            and isinstance(colors, dict)
            and isinstance(mults, dict)
        ):
            self._loaded = False
            return
        self._types = list(types)
        self._colors = {k: str(v) for k, v in colors.items() if isinstance(k, str)}
        self._multipliers = {}
        for atk, row in mults.items():
            if not isinstance(atk, str) or not isinstance(row, dict):
                continue
            cleaned: dict[str, float] = {}
            for dfnd, val in row.items():
                if not isinstance(dfnd, str):
                    continue
                try:
                    f = float(val)
                except (TypeError, ValueError):
                    continue
                if f in VALID_MULTIPLIERS:
                    cleaned[dfnd] = f
            self._multipliers[atk] = cleaned
        try:
            self._generation = int(data.get("generation", 0))
        except (TypeError, ValueError):
            self._generation = 0
        self._loaded = True

    @property
    def loaded(self) -> bool:
        return self._loaded

    @property
    def generation(self) -> int:
        return self._generation

    def get_type_chart(self) -> dict[str, Any]:
        """Return the full type chart for the frontend."""
        return {
            "types": list(self._types),
            "colors": dict(self._colors),
            "multipliers": {
                atk: dict(row) for atk, row in self._multipliers.items()
            },
            "generation": self._generation,
            "loaded": self._loaded,
        }

    def _validate_type(self, type_name: str) -> str | None:
        if not isinstance(type_name, str):
            return None
        if type_name in self._multipliers and type_name in self._types:
            return type_name
        return None

    def get_matchup(
        self, attacker: str, defender_types: list[str]
    ) -> dict[str, Any]:
        """Multiplier for a single attack against a 1- or 2-type defender."""
        atk = self._validate_type(attacker)
        if atk is None:
            return {"error": f"unknown attacker type: {attacker!r}"}
        cleaned_defenders: list[str] = []
        for d in defender_types or []:
            v = self._validate_type(d if isinstance(d, str) else "")
            if v is not None:
                cleaned_defenders.append(v)
        cleaned_defenders = cleaned_defenders[:2]
        if not cleaned_defenders:
            return {"error": "at least one valid defender type required"}
        mult = 1.0
        breakdown: list[dict[str, Any]] = []
        for dfnd in cleaned_defenders:
            m = self._multipliers.get(atk, {}).get(dfnd, 1.0)
            mult *= m
            breakdown.append({"defender": dfnd, "multiplier": m})
        return {
            "attacker": atk,
            "defenders": cleaned_defenders,
            "multiplier": mult,
            "breakdown": breakdown,
        }

    def get_defense_summary(self, defender_types: list[str]) -> dict[str, Any]:
        """For a (possibly dual-typed) defender, which types hit for which multipliers?"""
        cleaned: list[str] = []
        for d in defender_types or []:
            v = self._validate_type(d if isinstance(d, str) else "")
            if v is not None:
                cleaned.append(v)
        cleaned = cleaned[:2]
        if not cleaned:
            return {"error": "at least one valid defender type required"}
        buckets: dict[str, list[str]] = {
            "quadruple": [],
            "double": [],
            "neutral": [],
            "half": [],
            "quarter": [],
            "immune": [],
        }
        for atk in self._types:
            mult = 1.0
            for dfnd in cleaned:
                mult *= self._multipliers.get(atk, {}).get(dfnd, 1.0)
            if mult == 4.0:
                buckets["quadruple"].append(atk)
            elif mult == 2.0:
                buckets["double"].append(atk)
            elif mult == 1.0:
                buckets["neutral"].append(atk)
            elif mult == 0.5:
                buckets["half"].append(atk)
            elif mult == 0.25:
                buckets["quarter"].append(atk)
            elif mult == 0.0:
                buckets["immune"].append(atk)
        return {
            "defenders": cleaned,
            "summary": buckets,
        }

    def get_offense_summary(self, attacker: str) -> dict[str, Any]:
        """For a single attacking type, which defender types does it hit super/resist/immune?"""
        atk = self._validate_type(attacker)
        if atk is None:
            return {"error": f"unknown attacker type: {attacker!r}"}
        buckets: dict[str, list[str]] = {
            "super_effective": [],
            "not_very_effective": [],
            "no_effect": [],
            "neutral": [],
        }
        for dfnd in self._types:
            m = self._multipliers.get(atk, {}).get(dfnd, 1.0)
            if m == 2.0:
                buckets["super_effective"].append(dfnd)
            elif m == 0.5:
                buckets["not_very_effective"].append(dfnd)
            elif m == 0.0:
                buckets["no_effect"].append(dfnd)
            else:
                buckets["neutral"].append(dfnd)
        return {
            "attacker": atk,
            "summary": buckets,
        }
