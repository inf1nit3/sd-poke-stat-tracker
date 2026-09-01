import type { BattleAnalysis, PokemonSummary, SaveData } from "./api";

/**
 * Toast rules shared between the QAM overlay and tests. The deduper keeps
 * the previous snapshot and emits events only for transitions, so a static
 * state (e.g. an already-fainted party at plugin start) never spams toasts.
 */

export interface ToastEvent {
  title: string;
  body: string;
}

export interface ToastStateInput {
  battle_analysis?: BattleAnalysis | null;
  /** Newest party snapshot — stream cache or parsed disk save. */
  party: PokemonSummary[] | null | undefined;
}

interface PrevSnapshot {
  enemyName?: string;
  coach?: string;
  boostWarned: boolean;
  party: { species: string; level: number; fainted: boolean }[];
  shinySeen: Set<string>;
}

export const EMPTY_SNAPSHOT: PrevSnapshot = {
  boostWarned: false,
  party: [],
  shinySeen: new Set<string>(),
};

function partySnapshot(party: PokemonSummary[] | null | undefined) {
  return (party ?? []).map((p) => ({
    species: p.species ?? "",
    level: p.level ?? 0,
    fainted: !!p.is_fainted,
  }));
}

export class ToastDeduper {
  private prev: PrevSnapshot;

  constructor(initial?: Partial<PrevSnapshot>) {
    this.prev = { ...EMPTY_SNAPSHOT, ...initial };
  }

  /** Feed the newest state; returns the toasts to show now. */
  update(input: ToastStateInput): ToastEvent[] {
    const events: ToastEvent[] = [];
    const analysis = input.battle_analysis ?? null;
    const inBattle = !!analysis;
    const enemyName = analysis?.enemy?.name;
    const coach = analysis?.coach_suggestion?.suggested_pokemon;
    const stages = analysis?.enemy?.stages;
    const enemyHasBoosts = !!stages && stages.some((v: number) => v > 0);

    // 1. Battle start / enemy switch (existing behavior).
    if (inBattle && enemyName && enemyName !== this.prev.enemyName) {
      const types = analysis?.enemy?.types ?? analysis?.enemy?.type;
      events.push({
        title: "Battle Update",
        body: `Enemy sent out ${enemyName} (Type: ${types?.join("/") || "Unknown"})`,
      });
    }
    this.prev.enemyName = enemyName;

    // 2. Coach suggestion.
    if (inBattle && coach && coach !== this.prev.coach) {
      const reason = analysis?.coach_suggestion?.reason || "";
      events.push({
        title: "Coach Suggestion",
        body: `Switch to ${coach}! ${reason}`,
      });
    }
    this.prev.coach = coach;

    // 3. Enemy stat boost warning.
    if (inBattle && enemyHasBoosts && !this.prev.boostWarned) {
      events.push({
        title: "Stat Warning",
        body: "Enemy stats are boosted! Be careful!",
      });
      this.prev.boostWarned = true;
    } else if (!enemyHasBoosts) {
      this.prev.boostWarned = false;
    }

    // 4. Faint transitions (healthy -> fainted per party slot).
    const cur = partySnapshot(input.party);
    cur.forEach((mon, i) => {
      const was = this.prev.party[i];
      if (mon.fainted && was && !was.fainted && mon.species) {
        events.push({
          title: "Pokémon Fainted",
          body: `${mon.species} (Lv.${mon.level}) has fainted!`,
        });
      }
    });

    // 5. Shiny appearance — once per species until it leaves the party.
    const shinySpecies = (input.party ?? [])
      .filter((p) => p.shiny && p.species)
      .map((p) => p.species as string);
    for (const species of shinySpecies) {
      if (!this.prev.shinySeen.has(species)) {
        events.push({
          title: "✦ Shiny Found!",
          body: `${species} is shiny!`,
        });
      }
    }
    // Species no longer shiny in the party can re-trigger later.
    const curShiny = new Set(shinySpecies);
    for (const seen of this.prev.shinySeen) {
      if (!curShiny.has(seen)) this.prev.shinySeen.delete(seen);
    }
    for (const s of curShiny) this.prev.shinySeen.add(s);

    this.prev.party = cur;
    return events;
  }
}

/** Convenience: newest available party from store state. */
export function newestParty(saveData: SaveData | null, liveSaveData: SaveData | null): PokemonSummary[] | null {
  return liveSaveData?.party ?? saveData?.party ?? null;
}
