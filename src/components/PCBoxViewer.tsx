import { ButtonItem, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { useCallback, useEffect, useState } from "react";
import { api, BoxesResult, PokemonSummary } from "../api";

/**
 * PC storage box viewer (round 14). Parses $PokemonStorage from the active
 * save and renders each box as a compact 6-column grid. Best-effort: a save
 * without a recognizable storage structure renders nothing at all.
 */

const BOX_COLS = 6;

function speciesOf(mon: PokemonSummary | null | undefined): string {
  return mon?.species ?? "";
}

export function PCBoxViewer() {
  const [result, setResult] = useState<BoxesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBoxes();
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <PanelSection title="PC Boxes">
        <PanelSectionRow>
          <div style={{ color: "var(--theme-danger, #e87b7b)", fontSize: 12, padding: "4px 0" }}>
            {error}
          </div>
        </PanelSectionRow>
        <ButtonItem layout="below" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Try again"}
        </ButtonItem>
      </PanelSection>
    );
  }

  const boxes = result?.boxes ?? [];
  // First load still running.
  if (loading && !result) {
    return (
      <PanelSection title="PC Boxes">
        <PanelSectionRow>
          <div style={{ fontSize: 12, color: "var(--theme-text-muted, #969696)", padding: "4px 0" }}>
            Loading boxes…
          </div>
        </PanelSectionRow>
      </PanelSection>
    );
  }
  // No storage structure found — stay invisible instead of showing an
  // empty panel (many fan games store boxes elsewhere).
  if (boxes.length === 0) {
    return (
      <PanelSection title="PC Boxes">
        <PanelSectionRow>
          <div style={{ fontSize: 12, color: "var(--theme-text-muted, #969696)", padding: "4px 0" }}>
            No PC boxes found in this save.
          </div>
        </PanelSectionRow>
        <ButtonItem layout="below" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh boxes"}
        </ButtonItem>
      </PanelSection>
    );
  }

  return (
    <PanelSection title="PC Boxes">
      {boxes.map((box, bi) => {
        const mons = box.mons ?? [];
        const filled = mons.filter((m) => m && speciesOf(m)).length;
        return (
          <PanelSectionRow key={`box-${bi}`}>
            <Focusable onActivate={() => {}} style={{ width: "100%" }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--theme-text-muted, #969696)",
                  marginBottom: 4,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{box.name || `Box ${bi + 1}`}</span>
                <span>{filled} Pokémon</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${BOX_COLS}, 1fr)`,
                  gap: 3,
                }}
              >
                {mons.map((mon, mi) => (
                  <div
                    key={`box-${bi}-slot-${mi}`}
                    title={mon ? `${mon.species} Lv.${mon.level}` : "empty"}
                    style={{
                      fontSize: 8,
                      padding: "3px 1px",
                      textAlign: "center",
                      borderRadius: 3,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      background: mon
                        ? "var(--theme-bg-tertiary, rgba(255,255,255,0.05))"
                        : "transparent",
                      border: `1px solid ${mon ? "var(--theme-border, #333)" : "transparent"}`,
                      color: mon
                        ? "var(--theme-text-secondary, #ddd)"
                        : "var(--theme-text-faint, #444)",
                    }}
                  >
                    {mon ? speciesOf(mon) : "·"}
                  </div>
                ))}
              </div>
            </Focusable>
          </PanelSectionRow>
        );
      })}
      <ButtonItem layout="below" onClick={load} disabled={loading}>
        {loading ? "Loading…" : "Refresh boxes"}
      </ButtonItem>
    </PanelSection>
  );
}
