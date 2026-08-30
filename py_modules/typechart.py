"""Type chart lookups backed by data/type_chart.json (Gen 6 values).

Provides:
- get_type_chart(): full chart (types, colors, multipliers)
- get_matchup(attacker, defender_types): single attack vs. possibly dual-typed defender
- get_defense_summary(defender_types): all attacking types summarised by effectiveness
- get_offense_summary(attacker): what this attacking type is good/bad/immune against
"""

from __future__ import annotations

import json
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

    def get_type_chart(self, generation_override: int | None = None) -> dict[str, Any]:
        """Return the full type chart for the frontend."""
        gen = generation_override if generation_override else self._generation
        
        mults = {atk: dict(row) for atk, row in self._multipliers.items()}
        
        # Patch Gen 5 differences
        if gen <= 5:
            if "Dark" in mults and "Steel" in mults["Dark"]:
                mults["Dark"]["Steel"] = 0.5
            if "Ghost" in mults and "Steel" in mults["Ghost"]:
                mults["Ghost"]["Steel"] = 0.5

        return {
            "types": list(self._types),
            "colors": dict(self._colors),
            "multipliers": mults,
            "generation": gen,
            "loaded": self._loaded,
        }

    def _validate_type(self, type_name: str) -> str | None:
        if not isinstance(type_name, str):
            return None
        # Membership in the type list is sufficient: a type that only
        # appears as a defender column (no attacker row of its own in a
        # partial chart) is still a valid lookup target.
        if type_name in self._types:
            return type_name
        return None

    def get_matchup(
        self, attacker: str, defender_types: list[str], generation_override: int | None = None
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
            
        gen = generation_override if generation_override else self._generation
        
        mult = 1.0
        breakdown: list[dict[str, Any]] = []
        for dfnd in cleaned_defenders:
            m = self._multipliers.get(atk, {}).get(dfnd, 1.0)
            if gen <= 5 and dfnd == "Steel" and atk in ("Dark", "Ghost"):
                m = 0.5
            mult *= m
            breakdown.append({"defender": dfnd, "multiplier": m})
        return {
            "attacker": atk,
            "defenders": cleaned_defenders,
            "multiplier": mult,
            "breakdown": breakdown,
        }

    def get_defense_summary(
        self, defender_types: list[str], generation_override: int | None = None
    ) -> dict[str, Any]:
        """Calculate multipliers for all possible attacking types against defender(s)."""
        cleaned_defenders: list[str] = []
        for d in defender_types or []:
            v = self._validate_type(d if isinstance(d, str) else "")
            if v is not None:
                cleaned_defenders.append(v)
        cleaned_defenders = cleaned_defenders[:2]
        if not cleaned_defenders:
            return {"error": "at least one valid defender type required"}
            
        gen = generation_override if generation_override else self._generation
        
        summary: dict[str, list[str]] = {
            "quadruple": [],
            "double": [],
            "neutral": [],
            "half": [],
            "quarter": [],
            "immune": [],
        }
        for atk in self._types:
            m = 1.0
            for dfnd in cleaned_defenders:
                val = self._multipliers.get(atk, {}).get(dfnd, 1.0)
                if gen <= 5 and dfnd == "Steel" and atk in ("Dark", "Ghost"):
                    val = 0.5
                m *= val
            if m >= 4.0:
                summary["quadruple"].append(atk)
            elif m >= 2.0:
                summary["double"].append(atk)
            elif m == 1.0:
                summary["neutral"].append(atk)
            elif m > 0.25:
                summary["half"].append(atk)
            elif m > 0.0:
                summary["quarter"].append(atk)
            else:
                summary["immune"].append(atk)
        return {
            "defenders": cleaned_defenders,
            "summary": summary,
        }

    def get_offense_summary(self, attacker: str, generation_override: int | None = None) -> dict[str, Any]:
        """Summarise what this attacking type is effective/weak against."""
        atk = self._validate_type(attacker)
        if atk is None:
            return {"error": f"unknown attacker type: {attacker!r}"}
            
        gen = generation_override if generation_override else self._generation
        
        summary: dict[str, list[str]] = {
            "double": [],
            "neutral": [],
            "half": [],
            "immune": [],
        }
        row = self._multipliers.get(atk, {})
        for dfnd in self._types:
            m = row.get(dfnd, 1.0)
            if gen <= 5 and dfnd == "Steel" and atk in ("Dark", "Ghost"):
                m = 0.5
            if m >= 2.0:
                summary["double"].append(dfnd)
            elif m == 1.0:
                summary["neutral"].append(dfnd)
            elif m > 0.0:
                summary["half"].append(dfnd)
            else:
                summary["immune"].append(dfnd)
        return {
            "attacker": atk,
            "summary": summary,
        }
