"""Nuzlocke event log.

Diff-based tracker for faint transitions and party composition changes,
persisted as JSON Lines. The first observation after plugin start only
seeds the snapshot (no events) so restarting the plugin never spam-logs
an already-fainted party.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from threading import Lock
from typing import Any


class NuzlockeLog:
    """Append-only event log backed by a JSONL file."""

    MAX_EVENTS = 500

    def __init__(self, log_path: Path) -> None:
        self.log_path = Path(log_path)
        self._lock = Lock()
        self._events: list[dict[str, Any]] = []
        self._last_snapshot: list[dict[str, Any]] | None = None
        self._load()

    def _load(self) -> None:
        try:
            if not self.log_path.is_file():
                return
            with self.log_path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        self._events.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        except OSError:
            return
        self._events = self._events[-self.MAX_EVENTS :]

    def _persist(self, events: list[dict[str, Any]]) -> None:
        try:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            with self.log_path.open("a", encoding="utf-8") as fh:
                for ev in events:
                    fh.write(json.dumps(ev, ensure_ascii=False) + "\n")
        except OSError:
            pass

    @staticmethod
    def _snapshot(party: list[dict[str, Any]]) -> list[dict[str, Any]]:
        snap: list[dict[str, Any]] = []
        for p in party:
            if not isinstance(p, dict):
                continue
            hp = p.get("hp")
            max_hp = p.get("max_hp")
            fainted = (
                bool(p.get("is_fainted"))
                or str(p.get("status_name") or "").upper() == "FNT"
                or (
                    isinstance(hp, int)
                    and isinstance(max_hp, int)
                    and max_hp > 0
                    and hp <= 0
                )
            )
            snap.append(
                {
                    "species": str(p.get("species") or ""),
                    "level": p.get("level") if isinstance(p.get("level"), int) else 0,
                    "fainted": fainted,
                }
            )
        return snap

    def diff_and_record(
        self,
        party: list[dict[str, Any]],
        location: str = "",
        ts: float | None = None,
    ) -> list[dict[str, Any]]:
        """Compare ``party`` against the previous snapshot and append
        events for new faints and newly-joined species. Returns the new
        events (empty when nothing changed or this is the first call).
        """
        now = ts if ts is not None else time.time()
        cur = self._snapshot(party)
        with self._lock:
            events: list[dict[str, Any]] = []
            if self._last_snapshot is not None:
                for i, mon in enumerate(cur):
                    was = self._last_snapshot[i] if i < len(self._last_snapshot) else None
                    if mon["fainted"] and not (was and was["fainted"]):
                        events.append(
                            {
                                "kind": "faint",
                                "species": mon["species"],
                                "level": mon["level"],
                                "location": location,
                                "at": now,
                            }
                        )
                prev_species = {m["species"] for m in self._last_snapshot}
                faint_seen = {e["species"] for e in events}
                for mon in cur:
                    if (
                        mon["species"]
                        and mon["species"] not in prev_species
                        and mon["species"] not in faint_seen
                    ):
                        events.append(
                            {
                                "kind": "joined",
                                "species": mon["species"],
                                "level": mon["level"],
                                "location": location,
                                "at": now,
                            }
                        )
            self._last_snapshot = cur
            if events:
                self._events.extend(events)
                self._events = self._events[-self.MAX_EVENTS :]
                self._persist(events)
            return events

    def events(self) -> list[dict[str, Any]]:
        """All recorded events, oldest first."""
        with self._lock:
            return list(self._events)

    def clear(self) -> None:
        with self._lock:
            self._events = []
            self._last_snapshot = None
        try:
            self.log_path.unlink(missing_ok=True)
        except OSError:
            pass
