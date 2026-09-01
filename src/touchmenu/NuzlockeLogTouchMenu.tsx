import { ButtonItem, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { useCallback, useEffect, useState } from "react";
import { api, NuzlockeEvent } from "../api";

/**
 * Touch-menu view of the nuzlocke event log: faints and newly-joined
 * party members, newest first. The log itself lives in the backend
 * (nuzlocke_log.jsonl) and survives plugin restarts.
 */

function fmtEvent(ev: NuzlockeEvent): string {
  const time = new Date(ev.at * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const where = ev.location ? ` @ ${ev.location}` : "";
  return `${time} — ${ev.species} (Lv.${ev.level})${where}`;
}

export function NuzlockeLogTouchMenu() {
  const [events, setEvents] = useState<NuzlockeEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getNuzlockeLog();
      setEvents(res.events);
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
      <PanelSection title="Nuzlocke Log">
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

  if (events === null) {
    return (
      <PanelSection title="Nuzlocke Log">
        <PanelSectionRow>
          <div style={{ fontSize: 12, color: "var(--theme-text-muted, #969696)", padding: "4px 0" }}>
            Loading log…
          </div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  const ordered = [...events].reverse();

  return (
    <PanelSection title={`Nuzlocke Log (${events.length})`}>
      {ordered.length === 0 && (
        <PanelSectionRow>
          <Focusable onActivate={() => {}} style={{ fontSize: 12, color: "var(--theme-text-muted, #969696)" }}>
            No events yet. Faints and new party members are recorded automatically when the game saves.
          </Focusable>
        </PanelSectionRow>
      )}
      {ordered.map((ev, i) => (
        <PanelSectionRow key={`ev-${i}`}>
          <Focusable
            onActivate={() => {}}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: "6px 0",
              borderBottom: "1px solid var(--theme-border, #333)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color:
                  ev.kind === "faint"
                    ? "var(--theme-danger, #e87b7b)"
                    : "var(--theme-accent, #5eba7d)",
              }}
            >
              {ev.kind === "faint" ? "✝ Fainted" : "+ Caught/Evolved"}: {ev.species}
            </div>
            <div style={{ fontSize: 10, color: "var(--theme-text-faint, #777)" }}>
              {fmtEvent(ev)}
            </div>
          </Focusable>
        </PanelSectionRow>
      ))}
      <ButtonItem layout="below" onClick={load} disabled={loading}>
        {loading ? "Loading…" : "Refresh log"}
      </ButtonItem>
    </PanelSection>
  );
}
