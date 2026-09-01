/**
 * Round-14: team defense computation tests. Pure logic, node environment.
 * Chart semantics: MULTIPLIERS[attacker][defender] = effectiveness.
 */
import { describe, expect, it } from "vitest";

import { computeTeamDefense } from "../../src/utils/teamdefense";

const MULTIPLIERS: Record<string, Record<string, number>> = {
  Fire: { Grass: 2, Water: 0.5, Fire: 0.5, Rock: 1, Electric: 1 },
  Water: { Fire: 2, Rock: 2, Water: 0.5, Grass: 0.5, Electric: 1 },
  Grass: { Water: 2, Rock: 2, Fire: 0.5, Grass: 0.5, Flying: 0.5, Electric: 1 },
  Electric: { Water: 2, Flying: 2, Grass: 0.5, Electric: 0.5, Fire: 1, Rock: 1 },
  Rock: { Fire: 2, Flying: 2, Grass: 1, Electric: 1, Water: 1 },
};

describe("computeTeamDefense", () => {
  it("aggregates weaknesses and resistances across members", () => {
    const team = [
      { name: "CHARIZARD", types: ["Fire", "Flying"] },
      { name: "VENUSAUR", types: ["Grass", "Poison"] },
      { name: "BLASTOISE", types: ["Water"] },
    ];
    const res = computeTeamDefense(team, MULTIPLIERS);
    // Electric: CHARIZARD 1*2=2 (weak), VENUSAUR 0.5, BLASTOISE 2 (weak)
    const electric = res.rows.find((r) => r.attack === "Electric")!;
    expect(electric.weakMembers).toEqual(["CHARIZARD", "BLASTOISE"]);
    expect(electric.resistMembers).toEqual(["VENUSAUR"]);
    expect(electric.combined).toBeCloseTo(2 * 0.5 * 2);
    // Rock: only CHARIZARD is weak (Fire 2x * Flying 2x = 4x)
    const rock = res.rows.find((r) => r.attack === "Rock")!;
    expect(rock.weakMembers).toEqual(["CHARIZARD"]);
    expect(rock.combined).toBeCloseTo(4);
  });

  it("reports only attacks that hit two or more members as shared", () => {
    const team = [
      { name: "CHARIZARD", types: ["Fire", "Flying"] },
      { name: "VENUSAUR", types: ["Grass", "Poison"] },
      { name: "BLASTOISE", types: ["Water"] },
    ];
    const res = computeTeamDefense(team, MULTIPLIERS);
    expect(res.sharedWeaknesses.map((r) => r.attack)).toEqual(["Electric"]);
    // Rock (1 member), Water (1 member), Grass (BLASTOISE 2x), Fire (VENUSAUR
    // 2x) are excluded from shared.
    expect(res.safeTypes).toEqual([]);
  });

  it("counts immunities as resistance", () => {
    const res = computeTeamDefense(
      [{ name: "ROUFU", types: ["Electric"] }],
      { Ground: { Electric: 0 }, Electric: { Electric: 0.5 } }
    );
    expect(res.rows.find((r) => r.attack === "Ground")!.resistMembers).toEqual(["ROUFU"]);
    expect(res.safeTypes.sort()).toEqual(["Electric", "Ground"]);
  });

  it("handles empty teams and empty charts", () => {
    expect(computeTeamDefense([], MULTIPLIERS).sharedWeaknesses).toEqual([]);
    const res = computeTeamDefense([{ name: "X", types: ["Water"] }], {});
    expect(res.rows).toEqual([]);
  });
});
