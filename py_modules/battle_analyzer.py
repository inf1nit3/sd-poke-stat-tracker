from typing import Any

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

def compute_battle_analysis(
    enemies: list[dict[str, Any]],
    players: list[dict[str, Any]],
    party: list[dict[str, Any]],
) -> dict[str, Any]:
    enemy = enemies[0] if enemies else {}
    enemy_types = [t for t in (enemy.get("type1"), enemy.get("type2")) if t]
    if not enemy_types and enemy.get("types"):
        enemy_types = list(enemy["types"])

    player_pokemon = players[0] if players else (party[0] if party else {})
    player_moves_raw = player_pokemon.get("moves") or []

    moves_list: list[dict[str, Any]] = []
    best_move = ""
    best_mult = 0.0
    for m in player_moves_raw[:4]:
        if not isinstance(m, str):
            continue
        m_upper = m.upper()
        move_type = None
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

    coach_suggestion = None
    if enemy_types and party:
        best_pokemon = None
        best_score = -1.0
        for p in party:
            p_types = [t for t in (p.get("type1"), p.get("type2")) if t]
            if not p_types:
                continue
            score = max(_eff_multiplier(pt, enemy_types) for pt in p_types)
            if score > best_score:
                best_score = score
                best_pokemon = p.get("species") or "?"
        if best_pokemon and best_score >= 2.0:
            coach_suggestion = {
                "suggested_pokemon": best_pokemon,
                "reason": f"Super-effective ({best_score}×) vs {enemy.get('species', 'enemy')}",
            }

    # Extract stages from the battler payload
    stages = enemy.get("stages") or [0, 0, 0, 0, 0, 0, 0]

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
            "stages": stages,
        },
        "moves": moves_list,
        "best_move": best_move,
        "coach_suggestion": coach_suggestion,
    }
