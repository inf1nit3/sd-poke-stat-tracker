/**
 * Team-wide defense analysis computed entirely from the type chart
 * multipliers the backend already ships (get_type_chart). For each
 * attacking type we compute the product of its effectiveness against
 * every party member's types — combined >= 2 means at least a shared
 * 2x weakness across members.
 */

export interface TeamMemberTypes {
  name: string;
  types: Array<string | null | undefined>;
}

export interface TeamDefenseRow {
  attack: string;
  /** Product over all members: combined effectiveness vs the team. */
  combined: number;
  /** Members taking >1x from this attacking type. */
  weakMembers: string[];
  /** Members taking <1x (resistant or immune). */
  resistMembers: string[];
}

export interface TeamDefenseResult {
  rows: TeamDefenseRow[];
  /** Attacking types >=2 members are weak to, sorted by severity. */
  sharedWeaknesses: TeamDefenseRow[];
  /** Attacking types no team member is weak to. */
  safeTypes: string[];
}

export function computeTeamDefense(
  members: TeamMemberTypes[],
  multipliers: Record<string, Record<string, number>>
): TeamDefenseResult {
  const rows: TeamDefenseRow[] = [];
  for (const attack of Object.keys(multipliers)) {
    const atkRow = multipliers[attack] ?? {};
    const weakMembers: string[] = [];
    const resistMembers: string[] = [];
    let combined = 1;
    for (const member of members) {
      let product = 1;
      for (const t of member.types) {
        if (!t) continue;
        product *= atkRow[t] ?? 1;
      }
      combined *= product;
      if (product > 1) weakMembers.push(member.name);
      else if (product < 1) resistMembers.push(member.name);
    }
    rows.push({ attack, combined, weakMembers, resistMembers });
  }
  const sharedWeaknesses = rows
    .filter((r) => r.weakMembers.length >= 2)
    .sort(
      (a, b) =>
        b.weakMembers.length - a.weakMembers.length || b.combined - a.combined
    );
  const safeTypes = rows
    .filter((r) => r.weakMembers.length === 0)
    .map((r) => r.attack);
  return { rows, sharedWeaknesses, safeTypes };
}
