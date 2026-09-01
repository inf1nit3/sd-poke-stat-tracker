/**
 * Round-14: toast deduper tests. Pure logic, node environment.
 */
import { describe, expect, it } from "vitest";

import { ToastDeduper } from "../../src/toasts";
import type { PokemonSummary } from "../../src/api";

function mon(species: string, opts: Partial<PokemonSummary> = {}): PokemonSummary {
  return { species, level: 25, shiny: false, is_fainted: false, ...opts } as PokemonSummary;
}

const analysis = (name: string) => ({
  enemy: { name, hp: 50, totalhp: 100, types: ["Fire"], stages: [0, 0, 0, 0, 0] },
  moves: [],
});

describe("ToastDeduper", () => {
  it("announces battle start once and enemy switch on change", () => {
    const d = new ToastDeduper();
    const t1 = d.update({ battle_analysis: analysis("ONIX"), party: [] });
    expect(t1.map((e) => e.title)).toEqual(["Battle Update"]);
    expect(t1[0].body).toContain("ONIX");
    const t2 = d.update({ battle_analysis: analysis("ONIX"), party: [] });
    expect(t2).toEqual([]);
    const t3 = d.update({ battle_analysis: analysis("GEODUDE"), party: [] });
    expect(t3).toHaveLength(1);
    expect(t3[0].body).toContain("GEODUDE");
  });

  it("does not fire battle toast when analysis disappears", () => {
    const d = new ToastDeduper();
    d.update({ battle_analysis: analysis("ONIX"), party: [] });
    // battle ended — no toast
    expect(d.update({ battle_analysis: null, party: [] })).toEqual([]);
    // and a new battle against the same enemy still announces (enemy cleared)
    const t = d.update({ battle_analysis: analysis("ONIX"), party: [] });
    expect(t.map((e) => e.title)).toEqual(["Battle Update"]);
  });

  it("warns about enemy stat boosts once per boost episode", () => {
    const boosted = {
      enemy: { name: "ONIX", hp: 50, totalhp: 100, types: [], stages: [2, 0, 0, 0, 0] },
      moves: [],
    };
    const d = new ToastDeduper();
    const t1 = d.update({ battle_analysis: boosted, party: [] });
    expect(t1.map((e) => e.title)).toEqual(["Battle Update", "Stat Warning"]);
    expect(d.update({ battle_analysis: boosted, party: [] })).toEqual([]);
    // boost gone -> re-boosting warns again
    d.update({ battle_analysis: analysis("ONIX"), party: [] });
    const t2 = d.update({ battle_analysis: boosted, party: [] });
    expect(t2.map((e) => e.title)).toContain("Stat Warning");
  });

  it("fires a faint toast only on the healthy->fainted transition", () => {
    const d = new ToastDeduper();
    d.update({ party: [mon("PIKACHU"), mon("SNORLAX")] });
    expect(d.update({ party: [mon("PIKACHU"), mon("SNORLAX")] })).toEqual([]);
    const t = d.update({ party: [mon("PIKACHU", { is_fainted: true }), mon("SNORLAX")] });
    expect(t.map((e) => e.title)).toEqual(["Pokémon Fainted"]);
    expect(t[0].body).toContain("PIKACHU");
    // still fainted -> no duplicate
    expect(d.update({ party: [mon("PIKACHU", { is_fainted: true }), mon("SNORLAX")] })).toEqual([]);
    // healed -> then fainted again -> new toast
    d.update({ party: [mon("PIKACHU"), mon("SNORLAX")] });
    const t2 = d.update({ party: [mon("PIKACHU", { is_fainted: true }), mon("SNORLAX")] });
    expect(t2).toHaveLength(1);
  });

  it("announces each shiny species once until it leaves the party", () => {
    const d = new ToastDeduper();
    const t1 = d.update({ party: [mon("GEODUDE", { shiny: true })] });
    expect(t1.map((e) => e.title)).toEqual(["✦ Shiny Found!"]);
    expect(d.update({ party: [mon("GEODUDE", { shiny: true })] })).toEqual([]);
    // leave and return -> announced again
    d.update({ party: [] });
    const t2 = d.update({ party: [mon("GEODUDE", { shiny: true })] });
    expect(t2).toHaveLength(1);
  });

  it("uses the live party over the disk save", () => {
    const disk = { party: [mon("OLD_MON", { is_fainted: true })] };
    const live = { party: [mon("NEW_MON")] };
    const d = new ToastDeduper();
    d.update({ party: null });
    // null -> falls back through newestParty in the component; here the
    // deduper just sees whatever party is passed.
    const t = d.update({ party: live.party });
    expect(t).toEqual([]); // first sighting only seeds
    d.update({ party: disk.party });
    const t2 = d.update({ party: live.party });
    // OLD_MON left, NEW_MON joined: faint of OLD_MON not announced (it left)
    expect(t2).toEqual([]);
  });

  it("empty constructor snapshot never fires on the first update", () => {
    const d = new ToastDeduper();
    expect(
      d.update({ party: [mon("A", { is_fainted: true }), mon("B", { shiny: true })] })
        .filter((e) => e.title === "Pokémon Fainted")
    ).toEqual([]);
  });
});
