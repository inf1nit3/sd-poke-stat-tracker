import { PanelSection, PanelSectionRow, Spinner } from "../decky-frontend-lib-shim";
import { useEffect, useState } from "react";
import { api, LiveState } from "../api";
import { CapabilitiesSummary } from "../components/PokemonCard";
import { useStore } from "../store";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        marginRight: 8,
        backgroundColor: ok ? "#5eba7d" : "#e0a458",
        boxShadow: ok
          ? "0 0 4px rgba(94, 186, 125, 0.6)"
          : "0 0 4px rgba(224, 164, 88, 0.6)",
      }}
    />
  );
}

function timeAgo(epoch: number): string {
  if (!epoch) return "never";
  const delta = Date.now() / 1000 - epoch;
  if (delta < 5) return "just now";
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

export function HomeView() {
  const info = useStore((s) => s.info);
  const saveData = useStore((s) => s.saveData);
  const movesDb = useStore((s) => s.movesDatabase);
  const [live, setLive] = useState<LiveState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await api.getLiveState();
        if (!cancelled) setLive(s);
      } catch (e) {
        console.error("[home] live state", e);
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!info) {
    return (
      <PanelSection title="Pokémon Essentials Overlay">
        <PanelSectionRow>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 0",
            }}
          >
            <Spinner />
            <span style={{ fontSize: 13, color: "#969696" }}>Loading…</span>
          </div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <>
      <PanelSection title="About">
        <PanelSectionRow>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "4px 0",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {info.name}{" "}
              <span style={{ color: "#969696", fontWeight: 400 }}>
                v{info.version}
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#969696",
                lineHeight: 1.4,
              }}
            >
              {info.description}
            </div>
          </div>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Status">
        <PanelSectionRow>
          <div
            style={{
              fontSize: 12,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "4px 0",
            }}
          >
            <div>
              <StatusDot ok={info.initialized} />
              {info.initialized ? "Backend ready" : "Backend not initialized"}
            </div>
            <div>
              <StatusDot ok={info.type_chart_loaded} />
              {info.type_chart_loaded
                ? `Type chart loaded (${info.type_chart_types} types)`
                : "Type chart not loaded"}
            </div>
            <div>
              <StatusDot ok={movesDb?.loaded ?? false} />
              {movesDb?.loaded
                ? movesDb.pbs_source
                  ? `Moves DB: ${movesDb.merged_count} (PBS loaded)`
                  : `Moves DB: ${movesDb.static_count} static only`
                : "Moves DB not loaded"}
            </div>
            {live && (
              <>
                <div>
                  <StatusDot ok={live.game_running} />
                  {live.game_running
                    ? `Game running: ${live.active_process?.name ?? "unknown"} (pid ${live.active_process?.pid ?? "?"})`
                    : "No game process detected"}
                </div>
                <div>
                  <StatusDot ok={live.watcher_active} />
                  {live.watcher_active
                    ? `Save watcher active${
                        live.last_live_event?.at
                          ? ` · last event ${timeAgo(live.last_live_event.at)}`
                          : ""
                      }`
                    : "Save watcher inactive"}
                </div>
              </>
            )}
            {saveData && !saveData.error && saveData.features && (
              <div
                style={{
                  marginTop: 4,
                  paddingTop: 6,
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "#777",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    marginBottom: 4,
                  }}
                >
                  Save features ({saveData.version})
                </div>
                <CapabilitiesSummary features={saveData.features} />
              </div>
            )}
          </div>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Roadmap">
        <PanelSectionRow>
          <div
            style={{
              fontSize: 12,
              color: "#969696",
              lineHeight: 1.6,
            }}
          >
            <div>
              <span style={{ color: "#5eba7d" }}>●</span> Phase 1 — Foundation
            </div>
            <div>
              <span style={{ color: "#5eba7d" }}>●</span> Phase 2 — Interactive
              type chart
            </div>
            <div>
              <span style={{ color: "#5eba7d" }}>●</span> Phase 3 — Save-file
              parser &amp; party status
            </div>
            <div>
              <span style={{ color: "#5eba7d" }}>●</span> Phase 4 — In-game
              TouchMenu overlay
            </div>
            <div>
              <span style={{ color: "#5eba7d" }}>●</span> Phase 5 — Live PBS,
              IV/EV, dynamic UI, themes, watcher
            </div>
          </div>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}
