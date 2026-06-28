"""Live save-file watcher and game-process detection.

This module provides two capabilities that complement the on-disk save
parser:

1. **Process detection** — find the running Pokémon Essentials game
   process (or its Wine/Proton wrapper) so the frontend can show
   "game is running" indicators.
2. **Inotify save watcher** — react to save-file modifications within
   ~50ms, instead of waiting for the polling interval. This is the
   "live" piece for the in-game experience.

**What this module does NOT do** (yet): read live Pokémon object data
from the game's process memory. Direct memory reading of Wine/Proton
processes is possible but fragile (ASLR, address layout changes per
launch, Wine's virtual address translation). A future phase could add
pattern-based memory scanning using the last-known save as a fingerprint.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional

import psutil

log = logging.getLogger("pokemon-overlay.livewatch")

LIKELY_GAME_PROCESS_HINTS: tuple[str, ...] = (
    "rgss",
    "ruby",
    "essentials",
    "rpg",
    "vanguard",
    "reborn",
    "rejuvenation",
    "desolation",
    "uranium",
    "infinite",
    "insurgence",
)

# Terms that indicate a Pokémon fan game process.
POKEMON_TERMS: tuple[str, ...] = (
    "essentials",
    "fan game",
    "rgss",
    "rpg maker",
    "pokemon",
)

# Generic game executable names commonly used by RPG Maker / Pokémon Essentials games
GAME_EXE_NAMES: tuple[str, ...] = (
    "game.exe",
    "rgssad.exe",
    "rgss2ad.exe",
    "rgss3ad.exe",
)

# Paths that indicate the process is our plugin or Decky itself,
# not a game. Used to exclude false positives.
EXCLUDE_PATH_HINTS: tuple[str, ...] = (
    "sd-poke-stat-tracker",
    "homebrew",
    "decky",
    "plugin_loader",
    "pluginloader",
)


def find_game_processes() -> list[dict[str, object]]:
    """Return a list of likely game processes.

    Each entry has ``pid``, ``name``, ``cmdline``, ``cmdline_str``,
    ``exe``, and ``create_time`` fields. Empty list if nothing matches.
    """
    out: list[dict[str, object]] = []
    for proc in psutil.process_iter(
        ["pid", "name", "exe", "cmdline", "create_time"]
    ):
        try:
            info = proc.info
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        name = (info.get("name") or "").lower()
        cmdline = info.get("cmdline") or []
        cmdline_str = " ".join(cmdline).lower()
        is_likely = any(h in name for h in LIKELY_GAME_PROCESS_HINTS) or any(
            h in cmdline_str for h in LIKELY_GAME_PROCESS_HINTS
        )
        is_pokemon = any(t in cmdline_str for t in POKEMON_TERMS)
        # Also check for generic game exe names running under Proton/Wine
        is_game_exe = any(name == exe_name for exe_name in GAME_EXE_NAMES)
        if not (is_likely or is_pokemon or is_game_exe):
            continue
        # Exclude our own plugin process and Decky internals
        if any(ex in cmdline_str for ex in EXCLUDE_PATH_HINTS):
            continue
        out.append(
            {
                "pid": info.get("pid"),
                "name": info.get("name"),
                "exe": info.get("exe"),
                "cmdline": list(cmdline),
                "cmdline_str": cmdline_str,
                "create_time": info.get("create_time"),
            }
        )
    out.sort(key=lambda p: int(p.get("create_time") or 0), reverse=True)
    return out


def get_process_memory_map(pid: int) -> list[dict[str, str]]:
    """Return a list of memory regions for the given process (best effort).

    Each entry has ``path`` (region name or ``[anon]``/``[heap]``),
    ``start``, ``end``, ``perms``. Requires same user or root.
    """
    out: list[dict[str, str]] = []
    try:
        with open(f"/proc/{pid}/maps", "r") as fh:
            for line in fh:
                parts = line.split()
                if len(parts) < 5:
                    continue
                addrs, perms = parts[0], parts[1]
                try:
                    start_s, end_s = addrs.split("-")
                    start = int(start_s, 16)
                    end = int(end_s, 16)
                except ValueError:
                    continue
                path = parts[5] if len(parts) >= 6 else ""
                if not path or path == "":
                    path = "[anon]"
                out.append(
                    {
                        "path": path,
                        "start": f"0x{start:x}",
                        "end": f"0x{end:x}",
                        "perms": perms,
                    }
                )
    except (OSError, ProcessLookupError) as exc:
        log.debug(f"Could not read /proc/{pid}/maps: {exc}")
    return out


def find_process_by_save_path(save_path: str | Path) -> Optional[dict[str, object]]:
    """Find the process that has ``save_path`` open."""
    target = str(Path(save_path).resolve())
    for proc in psutil.process_iter(["pid"]):
        try:
            files = proc.open_files()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
        for f in files:
            try:
                real = str(Path(f.path).resolve())
            except OSError:
                real = f.path
            if real == target:
                try:
                    info = proc.as_dict(
                        attrs=["pid", "name", "exe", "cmdline", "create_time"]
                    )
                    info["cmdline_str"] = " ".join(info.get("cmdline") or [])
                    return info
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    return {"pid": proc.pid, "name": None, "exe": None,
                            "cmdline": [], "cmdline_str": ""}
    return None


def read_process_memory(pid: int, address: int, size: int) -> Optional[bytes]:
    """Read raw memory at ``address`` from process ``pid``.

    Requires same-user or root access. Returns ``None`` on failure.
    """
    if size <= 0 or size > 16 * 1024 * 1024:
        return None
    try:
        with open(f"/proc/{pid}/mem", "rb") as fh:
            fh.seek(address)
            return fh.read(size)
    except (OSError, ProcessLookupError, OverflowError, ValueError) as exc:
        log.debug(f"read_process_memory({pid}, 0x{address:x}, {size}) failed: {exc}")
        return None


class SaveFileWatcher:
    """Polling-based save-file watcher (fallback for systems without inotify).

    Polls the save file's mtime every ``interval`` seconds and invokes
    ``on_change`` when the mtime or size changes. Cross-platform and
    has no native dependencies beyond ``psutil``/``pathlib``.

    For Steam Deck we deliberately avoid ``inotify`` because Proton's
    Wine filesystem layer can swallow inotify events. Polling at 1s
    gives near-real-time updates with negligible CPU.
    """

    def __init__(
        self,
        path_provider: Callable[[], Optional[Path]],
        on_change: Callable[[Path], None],
        interval: float = 1.0,
    ) -> None:
        self._path_provider = path_provider
        self._on_change = on_change
        self._interval = max(0.2, interval)
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._last_mtime: float = 0.0
        self._last_size: int = 0
        self._last_path: Optional[Path] = None
        self._lock = threading.Lock()

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="SaveFileWatcher", daemon=True
        )
        self._thread.start()
        log.info(f"Save watcher started, interval={self._interval}s")

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        log.info("Save watcher stopped")

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self._check()
            except Exception as exc:
                log.error(f"Save watcher iteration failed: {exc}", exc_info=True)
            self._stop.wait(self._interval)

    def _check(self) -> None:
        with self._lock:
            path = self._path_provider()
            if path is None or not path.is_file():
                self._last_path = None
                self._last_mtime = 0.0
                self._last_size = 0
                return
            try:
                stat = path.stat()
            except OSError:
                return
            mtime = stat.st_mtime
            size = stat.st_size
            path_changed = self._last_path != path
            content_changed = (
                path_changed
                or mtime != self._last_mtime
                or size != self._last_size
            )
            self._last_path = path
            self._last_mtime = mtime
            self._last_size = size
        if content_changed and mtime > 0:
            try:
                self._on_change(path)
            except Exception as exc:
                log.error(f"on_change callback failed: {exc}", exc_info=True)

    def notify_save_loaded(self, path: Path) -> None:
        """Tell the watcher about a save that was just parsed, so it
        doesn't immediately re-trigger."""
        with self._lock:
            self._last_path = path
            try:
                stat = path.stat()
                self._last_mtime = stat.st_mtime
                self._last_size = stat.st_size
            except OSError:
                self._last_mtime = 0.0
                self._last_size = 0


# ---------------------------------------------------------------------------
# Phase 6: Game-mod TCP stream server
# ---------------------------------------------------------------------------
#
# The ``game-mod/stream.rb`` plugin (installed alongside the game in
# its ``Plugins/`` directory) hooks Scene_Map#update and forwards
# player/party state as JSON to ``127.0.0.1:9988`` every ~0.5s.
#
# This server accepts that stream, normalizes the payload into a
# SaveData-like dict, and hands it to the on_state callback. Much
# more reliable than scanning /proc/<pid>/mem because we get the
# data straight from the Ruby runtime.

import json as _json
import socket as _socket


_STREAM_HOST = "127.0.0.1"
_STREAM_PORT = 9988
_RECV_CHUNK = 65536
_MAX_LINE_BYTES = 256 * 1024


class LiveStreamServer:
    """TCP server that receives live state from the game mod plugin.

    Single-client: when the game connects, the previous client is
    closed. Stays running across game restarts — the Ruby side will
    reconnect on its own ``update`` frames.
    """

    def __init__(
        self,
        on_state: Callable[[dict[str, Any]], None],
        host: str = _STREAM_HOST,
        port: int = _STREAM_PORT,
        on_disconnect: Optional[Callable[[], None]] = None,
    ) -> None:
        self._on_state = on_state
        self._on_disconnect = on_disconnect
        self._host = host
        self._port = port
        self._server: Optional[_socket.socket] = None
        self._accept_thread: Optional[threading.Thread] = None
        self._client_thread: Optional[threading.Thread] = None
        self._client: Optional[_socket.socket] = None
        self._client_lock = threading.Lock()
        self._stop = threading.Event()

    @property
    def is_listening(self) -> bool:
        return self._server is not None

    def start(self) -> bool:
        """Bind the listener. Returns False on address-in-use."""
        if self._server is not None:
            return True
        try:
            sock = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
            sock.setsockopt(_socket.SOL_SOCKET, _socket.SO_REUSEADDR, 1)
            sock.bind((self._host, self._port))
            sock.listen(1)
            sock.settimeout(1.0)
            self._server = sock
        except OSError as exc:
            log.error(f"Live stream server: cannot bind {self._host}:{self._port}: {exc}")
            return False
        self._stop.clear()
        self._accept_thread = threading.Thread(
            target=self._accept_loop, name="LiveStreamAccept", daemon=True
        )
        self._accept_thread.start()
        log.info(f"Live stream server listening on {self._host}:{self._port}")
        return True

    def stop(self) -> None:
        self._stop.set()
        self._close_client()
        if self._server is not None:
            try:
                self._server.close()
            except OSError:
                pass
            self._server = None
        if self._accept_thread is not None:
            self._accept_thread.join(timeout=2.0)
            self._accept_thread = None
        log.info("Live stream server stopped")

    def _accept_loop(self) -> None:
        while not self._stop.is_set():
            if self._server is None:
                return
            try:
                client, addr = self._server.accept()
            except _socket.timeout:
                continue
            except OSError:
                return
            self._close_client()
            with self._client_lock:
                self._client = client
            log.info(f"Live stream client connected: {addr}")
            self._client_thread = threading.Thread(
                target=self._client_loop, args=(client,), daemon=True,
                name="LiveStreamClient",
            )
            self._client_thread.start()

    def _close_client(self) -> None:
        with self._client_lock:
            if self._client is not None:
                try:
                    self._client.shutdown(_socket.SHUT_RDWR)
                except OSError:
                    pass
                try:
                    self._client.close()
                except OSError:
                    pass
                self._client = None
        if self._client_thread is not None and self._client_thread is not threading.current_thread():
            self._client_thread.join(timeout=2.0)
            self._client_thread = None

    def _client_loop(self, client: _socket.socket) -> None:
        buf = b""
        try:
            while not self._stop.is_set():
                try:
                    data = client.recv(_RECV_CHUNK)
                except OSError:
                    return
                if not data:
                    return
                buf += data
                if len(buf) > _MAX_LINE_BYTES:
                    # Discard up to and including the next newline, retaining
                    # any valid data after the oversized frame.
                    idx = buf.find(b"\n")
                    buf = buf[idx + 1:] if idx >= 0 else b""
                    continue
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    if not line.strip():
                        continue
                    try:
                        payload = _json.loads(line)
                    except _json.JSONDecodeError:
                        continue
                    self._dispatch(payload)
        finally:
            log.info("Live stream client disconnected")
            if self._on_disconnect is not None:
                try:
                    self._on_disconnect()
                except Exception as exc:
                    log.error(f"on_disconnect callback failed: {exc}", exc_info=True)

    def _dispatch(self, payload: Any) -> None:
        """Normalize the JSON payload and call the on_state callback."""
        if not isinstance(payload, dict):
            return
        try:
            if payload.get("kind") != "live_state":
                return
            party = payload.get("party") or []
            battle_enemies = payload.get("battle_enemies") or []
            battle_player = payload.get("battle_player") or []
            in_battle = bool(payload.get("in_battle", False))
            in_menu = bool(payload.get("in_menu", False))

            normalized_party = [
                {
                    "species": p.get("species"),
                    "level": p.get("level"),
                    "hp": p.get("hp"),
                    "max_hp": p.get("max_hp"),
                    "status": p.get("status"),
                    "moves": p.get("moves") or [],
                    "type1": p.get("type1"),
                    "type2": p.get("type2"),
                    "nickname": None,
                    "ability": None,
                    "item": None,
                    "gender": 0,
                    "gender_name": "?",
                    "shiny": False,
                    "nature": None,
                    "attack": None,
                    "defense": None,
                    "spatk": None,
                    "spdef": None,
                    "speed": None,
                    "iv_hp": None, "iv_attack": None, "iv_defense": None,
                    "iv_spatk": None, "iv_spdef": None, "iv_speed": None,
                    "ev_hp": None, "ev_attack": None, "ev_defense": None,
                    "ev_spatk": None, "ev_spdef": None, "ev_speed": None,
                    "happiness": None,
                }
                for p in party if isinstance(p, dict)
            ]

            battle_analysis = None
            if in_battle and battle_enemies:
                battle_analysis = self._compute_battle_analysis(
                    battle_enemies, battle_player, normalized_party
                )

            normalized = {
                "trainer_name": payload.get("trainer") or "",
                "money": _safe_int(payload.get("money")),
                "badges": _safe_int(payload.get("badges")),
                "location_name": payload.get("map_name") or "",
                "map_id": payload.get("map_id"),
                "x": payload.get("x"),
                "y": payload.get("y"),
                "play_time_seconds": _safe_int(payload.get("play_time")),
                "party": normalized_party,
                "version": "live",
                "essentials_version": None,
                "party_count": len(normalized_party),
                "parsed_at": payload.get("at"),
                "source_path": f"<stream:{self._port}>",
                "in_menu": in_menu,
                "in_battle": in_battle,
                "screen_state": "battle_active" if in_battle else ("menu" if in_menu else "overworld"),
                "battle_analysis": battle_analysis,
                "features": {
                    "ivs": False, "evs": False, "happiness": False,
                    "stats": True, "moves": True, "natures": False,
                    "abilities": False, "items": False, "type2": True,
                    "shiny": False, "gender": False,
                },
                "_live_source": "stream",
            }
        except Exception as exc:
            log.error(f"Live stream _dispatch normalize failed: {exc}", exc_info=True)
            return
        try:
            self._on_state(normalized)
        except Exception as exc:
            log.error(f"Live stream on_state callback failed: {exc}", exc_info=True)

    @staticmethod
    def _compute_battle_analysis(
        enemies: list[dict[str, Any]],
        players: list[dict[str, Any]],
        party: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Build a battle_analysis payload for the frontend Battle Analyzer.

        Uses the enemy's types + the player party's known moves to compute
        a simple best-move suggestion and a coach suggestion (which party
        member has the best type matchup against the enemy).
        """
        # Type effectiveness chart (Gen 6, 18 types). Multiplier of 0 = immune.
        # This mirrors data/type_chart.json but is inlined here to avoid a
        # circular import with the plugin's TypeChart engine.
        _TYPE_CHART: dict[str, dict[str, float]] = {
            "Normal": {}, "Fire": {"Fire": 0.5, "Water": 0.5, "Grass": 2, "Ice": 2, "Bug": 2, "Rock": 0.5, "Steel": 2, "Dragon": 0.5},
            "Water": {"Fire": 2, "Water": 0.5, "Grass": 0.5, "Ground": 2, "Rock": 2, "Dragon": 0.5},
            "Electric": {"Water": 2, "Electric": 0.5, "Grass": 0.5, "Ground": 0, "Flying": 2, "Dragon": 0.5},
            "Grass": {"Fire": 0.5, "Water": 2, "Grass": 0.5, "Poison": 0.5, "Ground": 2, "Flying": 0.5, "Bug": 0.5, "Rock": 2, "Dragon": 0.5, "Steel": 0.5},
            "Ice": {"Fire": 0.5, "Water": 0.5, "Grass": 2, "Ice": 0.5, "Ground": 2, "Flying": 2, "Dragon": 2, "Steel": 0.5},
            "Fighting": {"Normal": 2, "Ice": 2, "Rock": 2, "Dark": 2, "Steel": 2, "Poison": 0.5, "Flying": 0.5, "Psychic": 0.5, "Bug": 0.5, "Ghost": 0, "Fairy": 0.5},
            "Poison": {"Grass": 2, "Poison": 0.5, "Ground": 0.5, "Rock": 0.5, "Ghost": 0.5, "Steel": 0, "Fairy": 2},
            "Ground": {"Fire": 2, "Electric": 2, "Grass": 0.5, "Poison": 2, "Flying": 0, "Bug": 0.5, "Rock": 2, "Steel": 2, "Dragon": 1},
            "Flying": {"Electric": 0.5, "Grass": 2, "Fighting": 2, "Bug": 2, "Rock": 0.5, "Steel": 0.5, "Dragon": 1},
            "Psychic": {"Fighting": 2, "Poison": 2, "Psychic": 0.5, "Dark": 0, "Steel": 0.5},
            "Bug": {"Fire": 0.5, "Grass": 2, "Fighting": 0.5, "Poison": 0.5, "Flying": 0.5, "Psychic": 2, "Ghost": 0.5, "Dark": 2, "Steel": 0.5, "Fairy": 0.5},
            "Rock": {"Fire": 2, "Ice": 2, "Fighting": 0.5, "Ground": 0.5, "Flying": 2, "Bug": 2, "Steel": 0.5},
            "Ghost": {"Normal": 0, "Psychic": 2, "Ghost": 2, "Dark": 0.5},
            "Dragon": {"Dragon": 2, "Steel": 0.5, "Fairy": 0},
            "Dark": {"Fighting": 0.5, "Psychic": 2, "Ghost": 2, "Dark": 0.5, "Fairy": 0.5},
            "Steel": {"Fire": 0.5, "Water": 0.5, "Electric": 0.5, "Ice": 2, "Rock": 2, "Steel": 0.5, "Fairy": 2},
            "Fairy": {"Fire": 0.5, "Fighting": 2, "Poison": 0.5, "Dragon": 2, "Dark": 2, "Steel": 0.5},
        }

        def _eff_multiplier(attack_type: str, defender_types: list[str]) -> float:
            chart = _TYPE_CHART.get(attack_type, {})
            mult = 1.0
            for dt in defender_types:
                mult *= chart.get(dt, 1.0)
            return mult

        def _eff_label(mult: float) -> str:
            if mult == 0:
                return "immune"
            if mult >= 2:
                return "super_effective"
            if mult < 1:
                return "not_very_effective"
            return "neutral"

        enemy = enemies[0] if enemies else {}
        enemy_types = [t for t in (enemy.get("type1"), enemy.get("type2")) if t]
        if not enemy_types and enemy.get("types"):
            enemy_types = list(enemy["types"])

        # Build move list from the first player battler.
        player_pokemon = players[0] if players else (party[0] if party else {})
        player_moves_raw = player_pokemon.get("moves") or []
        move_types: dict[str, str] = {}
        # Try to load move types from the moves DB (best effort).
        try:
            from moves import MovesDB
            _mdb = MovesDB.__new__(MovesDB)
            _mdb._static = {}
            _mdb._pbs = {}
            _mdb._pbs_source = None
            _mdb._loaded = False
        except Exception:
            _mdb = None

        moves_list: list[dict[str, Any]] = []
        best_move = ""
        best_mult = 0.0
        for m in player_moves_raw[:4]:
            if not isinstance(m, str):
                continue
            # Heuristic type guess from name substrings.
            m_upper = m.upper()
            move_type = None
            # Inline minimal heuristic — full MovesDB would require the plugin path.
            _HEUR = [
                ("THUNDER", "Electric"), ("BOLT", "Electric"), ("FIRE", "Fire"), ("FLAME", "Fire"),
                ("WATER", "Water"), ("SURF", "Water"), ("LEAF", "Grass"), ("ICE", "Ice"),
                ("PUNCH", "Fighting"), ("POISON", "Poison"), ("EARTH", "Ground"), ("FLY", "Flying"),
                ("PSYCHIC", "Psychic"), ("BUG", "Bug"), ("ROCK", "Rock"), ("SHADOW", "Ghost"),
                ("DRAGON", "Dragon"), ("BITE", "Dark"), ("IRON", "Steel"), ("FAIRY", "Fairy"),
            ]
            for sub, t in _HEUR:
                if sub in m_upper:
                    move_type = t
                    break
            if move_type is None:
                move_type = "Normal"
            mult = _eff_multiplier(move_type, enemy_types) if enemy_types else 1.0
            moves_list.append({
                "name": m,
                "type": move_type,
                "effectiveness_label": _eff_label(mult),
            })
            if mult > best_mult:
                best_mult = mult
                best_move = m

        # Coach suggestion: which party member has the best type matchup vs enemy?
        coach_suggestion = None
        if enemy_types and party:
            best_pokemon = None
            best_score = -1.0
            for p in party:
                p_types = [t for t in (p.get("type1"), p.get("type2")) if t]
                if not p_types:
                    continue
                # Score = max effectiveness of any party type vs enemy.
                score = max(_eff_multiplier(pt, enemy_types) for pt in p_types)
                if score > best_score:
                    best_score = score
                    best_pokemon = p.get("species") or "?"
            if best_pokemon and best_score >= 2.0:
                coach_suggestion = {
                    "suggested_pokemon": best_pokemon,
                    "reason": f"Super-effective ({best_score}×) vs {enemy.get('species', 'enemy')}",
                }

        return {
            "enemy": {
                "name": enemy.get("species") or "Unknown",
                "hp": enemy.get("hp"),
                "totalhp": enemy.get("max_hp"),
                "hp_percent": (
                    round((enemy.get("hp", 0) / enemy.get("max_hp", 1)) * 100, 1)
                    if enemy.get("max_hp") and enemy.get("max_hp", 0) > 0 and enemy.get("hp") is not None
                    else None
                ),
                "types": enemy_types,
                "stages": enemy.get("stages") or [0, 0, 0, 0, 0, 0, 0],
            },
            "moves": moves_list,
            "best_move": best_move,
            "coach_suggestion": coach_suggestion,
        }


# ---------------------------------------------------------------------------
# Phase 6: Live memory reading — experimental
# ---------------------------------------------------------------------------
#
# STATUS: Experimental. The current implementation scans ``/proc/<pid>/mem``
# for Marshal-format save blobs. In practice, RPG Maker XP / Pokémon
# Essentials does NOT keep the save as a Marshal dump in memory —
# Ruby stores game state as native heap objects (RVALUE structs),
# not as a serialized blob. Marshal.dump is only invoked when writing
# to disk. As a result, ``LiveMemoryReader`` scans will currently find
# zero valid blobs in a running Vanguard session.
#
# The infrastructure is wired up so a future improvement (Ruby heap
# walking, RVALUE struct parsing, or a Wine-side hook) can plug in
# without changing the rest of the plugin. The disk watcher remains
# the primary live data source — every Pokemon Center visit or
# post-battle save fires ``SaveFileWatcher`` and produces an update
# within ~0.5–2 seconds.
#
# The class is kept here (not deleted) because:
# 1. The settings toggle and UI are already in place
# 2. Plugin startup wires up the reader so the failure path is tested
# 3. Future work on Ruby heap introspection can drop in cleanly
#
# When enabled, the reader scans every ~3s instead of every ~1s to
# keep CPU usage negligible even though no useful data will be found.

import time as _time


# Marshal v4.8 header. We treat any occurrence of these two bytes in
# process memory as a candidate start-of-save and try to parse it.
_MARSHAL_HEADER = b"\x04\x08"

# Minimum heap region size worth scanning. Most false positives
# come from small per-thread stacks or allocator slabs that contain
# junk bytes. Real Ruby heap pages (and the save blob) live in
# multi-megabyte anonymous mappings.
_MIN_REGION_BYTES = 8 * 1024 * 1024

# Bytes to read after each Marshal header candidate. The save is
# typically 100 KB - 1 MB; we cap at 2 MB to bound parse cost on
# garbage matches.
_BLOB_CAP_BYTES = 2 * 1024 * 1024

# Hard cap on candidates tried per scan to keep worst-case bounded.
# Most candidates are garbage that triggers a full marshal parse —
# this limit prevents a single bad scan from blocking the thread.
_MAX_CANDIDATES_PER_SCAN = 4

# How many bytes to read from the process at a time. 1 MB balances
# syscall overhead against peak memory use.
_SCAN_CHUNK_BYTES = 1024 * 1024

# After this many consecutive failures we back off for _COOLDOWN_S
# seconds before retrying. Prevents tight loops when the game crashes
# or memory protection blocks reads.
_FAILURE_BACKOFF_THRESHOLD = 3
_COOLDOWN_S = 5.0

# How often we scan, in seconds. Long because the current
# implementation cannot find valid blobs — see module docstring.
_DEFAULT_INTERVAL = 3.0


def _pid_alive(pid: int) -> bool:
    """``True`` if a process with ``pid`` exists and we own it."""
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


def _safe_int(value: Any) -> int:
    """Coerce a value to int, returning 0 on any failure."""
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _candidate_regions(pid: int) -> list[dict[str, str]]:
    """Return large rw heap/anon regions of ``pid`` worth scanning.

    Wine processes expose private read-write mappings (``rw-p``) rather
    than the ``rw-`` shared mappings Linux uses for the main heap, so
    we accept both. Anonymous mmaps are where Ruby's GC-managed heap
    lives, so we ignore file-backed regions.
    """
    regions = get_process_memory_map(pid)
    out: list[dict[str, str]] = []
    for r in regions:
        perms = r.get("perms", "")
        if perms not in ("rw-", "rw-p"):
            continue
        path = r.get("path", "")
        # Wine uses [anon] for Ruby heap. Native Linux uses [heap].
        # Skip file-backed mappings (DLLs, theme data, etc.).
        if path not in ("[heap]", "[anon]"):
            continue
        try:
            start = int(r["start"], 16)
            end = int(r["end"], 16)
        except (KeyError, ValueError):
            continue
        size = end - start
        if size < _MIN_REGION_BYTES:
            continue
        out.append(
            {
                "start": r["start"],
                "end": r["end"],
                "path": path,
                "size": str(size),
            }
        )
    return out


def _find_save_file_safe(find_fn: Callable[[], Any]) -> Optional[Path]:
    """Wrapper that swallows errors from ``find_save_file``."""
    try:
        p = find_fn()
        return Path(p) if p else None
    except Exception:
        return None


def _looks_like_save(parsed: Any) -> bool:
    """Sanity-check a parsed save dict — must have a player/trainer."""
    if not isinstance(parsed, dict):
        return False
    for key in ("player", "$Trainer", "Trainer"):
        if key in parsed:
            return True
        try:
            from rubymarshal.classes import Symbol as _Sym
            if _Sym(key) in parsed:
                return True
        except Exception:
            pass
    return False


class LiveMemoryReader:
    """Polls a running game process and emits live save updates.

    Opt-in. Always runs alongside ``SaveFileWatcher`` — the disk
    watcher acts as fallback when this reader is disabled or failing.

    The reader caches the offset of the most recent successful scan
    so subsequent polls can re-check the same address first (where
    the game is most likely to have just written fresh data).
    """

    def __init__(
        self,
        pid: int,
        on_update: Callable[[dict[str, Any]], None],
        on_failure: Optional[Callable[[str], None]] = None,
        interval: float = _DEFAULT_INTERVAL,
    ) -> None:
        self._pid = pid
        self._on_update = on_update
        self._on_failure = on_failure or (lambda reason: None)
        self._interval = max(0.5, interval)
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._cooldown_until: float = 0.0
        self._consecutive_failures: int = 0
        # Cached (region_start, header_offset) of last successful scan.
        self._known_offset: Optional[tuple[str, int]] = None
        # CRC32 of the last blob we accepted, used to short-circuit
        # duplicate parses of the same byte range.
        self._last_blob_hash: int = 0

    def update_pid(self, new_pid: int) -> None:
        """Called when the game restarts so we rescan from scratch."""
        if new_pid == self._pid:
            return
        self._pid = new_pid
        self._known_offset = None
        self._last_blob_hash = 0
        self._consecutive_failures = 0
        self._cooldown_until = 0.0

    @property
    def pid(self) -> int:
        return self._pid

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="LiveMemoryReader", daemon=True
        )
        self._thread.start()
        log.info(
            f"Live memory reader started (EXPERIMENTAL, see livewatch.py "
            f"module docstring). pid={self._pid}, interval={self._interval}s"
        )

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        log.info("Live memory reader stopped")

    def _run(self) -> None:
        # Import lazily so the plugin can still load if saveparser
        # has issues — keeps the failure mode local to live reading.
        try:
            from saveparser import parse_save_blob as _parse
            from savepath import find_save_file as _find_save
        except Exception as exc:
            log.error(f"Live memory reader: cannot import parse_save_blob: {exc}")
            return

        # Track the on-disk save path for PBS lookup. The PBS file
        # lives next to the save (under AppData/Roaming/Pokemon*/PBS/),
        # so the disk save's parent dir is the best PBS seed. We
        # refresh the path on every tick in case the user switched
        # saves or the path was just discovered.
        def _parse_with_save(blob: bytes) -> Any:
            disk_path = _find_save_file_safe(_find_save)
            return _parse(blob, source=f"<memory:{self._pid}>", save_path=disk_path)

        while not self._stop.is_set():
            try:
                self._tick(_parse_with_save)
            except Exception as exc:
                log.error(f"Live memory reader iteration failed: {exc}", exc_info=True)
            self._stop.wait(self._interval)

    def _tick(self, parse_fn: Callable[[bytes], Any]) -> None:
        now = _time.time()
        if now < self._cooldown_until:
            return
        if not _pid_alive(self._pid):
            self._on_failure("process_gone")
            self._handle_failure()
            return

        regions = _candidate_regions(self._pid)
        if not regions:
            self._handle_failure("no_candidate_regions")
            return

        # Try the cached offset first (fast path).
        if self._known_offset is not None:
            region_start, header_offset = self._known_offset
            blob = self._read_blob_at(region_start, header_offset)
            if blob is not None:
                result = self._try_parse(blob, parse_fn)
                if result is not None:
                    self._emit(result, region_start=region_start, header_offset=header_offset)
                    return
            # Fast path failed — drop the cache and do a full scan.
            self._known_offset = None

        # Full scan: try each region in order of size (largest first
        # usually contains the game's main heap).
        regions.sort(key=lambda r: int(r["size"]), reverse=True)
        for region in regions:
            blob = self._scan_region(region, parse_fn)
            if blob is not None:
                return

        self._handle_failure("no_valid_candidate")

    def _handle_failure(self, reason: str = "") -> None:
        self._consecutive_failures += 1
        if self._consecutive_failures >= _FAILURE_BACKOFF_THRESHOLD:
            self._cooldown_until = _time.time() + _COOLDOWN_S
            self._consecutive_failures = 0
            log.debug(
                f"Live memory reader: {_FAILURE_BACKOFF_THRESHOLD} failures "
                f"(last={reason!r}), cooldown {_COOLDOWN_S}s"
            )

    def _scan_region(
        self, region: dict[str, str], parse_fn: Callable[[bytes], Any]
    ) -> Optional[bytes]:
        """Scan a single region. Returns the parsed save on success."""
        start = int(region["start"], 16)
        end = int(region["end"], 16)
        size = end - start
        pos = 0
        candidates_tried = 0
        # Read 1 MB at a time and search for the Marshal header.
        while pos < size:
            if self._stop.is_set():
                return None
            if candidates_tried >= _MAX_CANDIDATES_PER_SCAN:
                log.debug("Live memory: candidate budget exhausted for this scan")
                return None
            chunk_size = min(_SCAN_CHUNK_BYTES, size - pos)
            data = read_process_memory(self._pid, start + pos, chunk_size)
            if not data:
                # Advance by the requested chunk size (not len(data)) only
                # when data is falsy — we have nothing to scan.
                pos += chunk_size
                continue
            search_from = 0
            while True:
                idx = data.find(_MARSHAL_HEADER, search_from)
                if idx < 0:
                    break
                if candidates_tried >= _MAX_CANDIDATES_PER_SCAN:
                    return None
                blob_start = pos + idx
                cap = min(size - blob_start, _BLOB_CAP_BYTES)
                blob = read_process_memory(self._pid, start + blob_start, cap)
                if not blob:
                    search_from = idx + len(_MARSHAL_HEADER)
                    continue
                candidates_tried += 1
                result = self._try_parse(blob, parse_fn)
                if result is not None:
                    self._emit(
                        result,
                        blob=blob,
                        region_start=region["start"],
                        header_offset=blob_start,
                    )
                    return blob
                search_from = idx + len(_MARSHAL_HEADER)
            # Advance by actual bytes read to handle short reads correctly.
            pos += len(data)
        return None

    def _read_blob_at(self, region_start: str, header_offset: int) -> Optional[bytes]:
        try:
            base = int(region_start, 16)
        except ValueError:
            return None
        cap = min(2 * 1024 * 1024, _BLOB_CAP_BYTES)
        return read_process_memory(self._pid, base + header_offset, cap)

    def _try_parse(
        self, blob: bytes, parse_fn: Callable[[bytes], Any]
    ) -> Optional[Any]:
        # Skip duplicate scans (same bytes we've already accepted).
        # Hash only the first 4 KB to keep the comparison cheap —
        # if those bytes haven't changed, the save almost certainly
        # hasn't either.
        import zlib
        sample = bytes(blob[:4096])
        sample_hash = zlib.crc32(sample) & 0xFFFFFFFF
        if sample_hash == self._last_blob_hash:
            return None
        try:
            parsed = parse_fn(blob)
        except Exception:
            return None
        if not _looks_like_save(parsed):
            return None
        return parsed

    def _emit(
        self,
        result: Any,
        blob: bytes,
        region_start: str,
        header_offset: int,
    ) -> None:
        import zlib

        sample = bytes(blob[:4096])
        self._last_blob_hash = zlib.crc32(sample) & 0xFFFFFFFF
        self._consecutive_failures = 0
        self._known_offset = (region_start, header_offset)

        # Convert the parsed SaveData to a plain dict if it isn't already.
        if hasattr(result, "to_dict"):
            payload = result.to_dict()
        elif isinstance(result, dict):
            payload = result
        else:
            return

        payload["_live_source"] = "memory"
        try:
            self._on_update(payload)
        except Exception as exc:
            log.error(f"Live memory reader on_update callback failed: {exc}", exc_info=True)
