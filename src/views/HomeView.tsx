import { Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { CapabilitiesSummary } from "../components/PokemonCard";
import { useStore, retryRefreshStatic, partyEqual } from "../store";

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
  const settings = useStore((s) => s.settings);
  const live = useStore((s) => s.liveState);
  const party = useStore((s) => s.saveData?.party, partyEqual);
  const faintedCount = party?.filter((p) => p.is_fainted).length ?? 0;

  if (!info) {
    return (
      <PanelSection title="Pokémon Essentials Overlay">
        <PanelSectionRow>
          <Focusable
            onActivate={() => {}}
            style={{
              color: "#e0a458",
              fontSize: 12,
              padding: "8px 0",
            }}
          >
            Plugin data isn't loaded yet. The Decky Loader may be
            reloading the plugin in the background.
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable
            onActivate={() => {}}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0",
            }}
          >
            <span style={{ fontSize: 13, color: "#969696" }}>Loading…</span>
            <span
              style={{
                fontSize: 11,
                color: "#56b4e9",
                cursor: "pointer",
                textDecoration: "underline",
              }}
              onClick={() => {
                retryRefreshStatic();
              }}
            >
              Reload
            </span>
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <>
      <PanelSection title="About">
        <PanelSectionRow>
          <Focusable
            onActivate={() => {}}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "4px 0",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {String(info.name)}{" "}
              <span style={{ color: "#969696", fontWeight: 400 }}>
                v{String(info.version)}
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#969696",
                lineHeight: 1.4,
              }}
            >
              {String(info.description)}
            </div>
          </Focusable>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Status">
        <PanelSectionRow>
          <Focusable
            onActivate={() => {}}
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
                    ? `Game running: ${String(live.active_process?.name ?? "unknown")} (pid ${String(live.active_process?.pid ?? "?")})`
                    : "No game process detected"}
                </div>
                {live.active_process?.is_emulator && (
                  <div
                    style={{
                      marginTop: 8,
                      backgroundColor: "#e0a458",
                      color: "#1a1a1a",
                      padding: "8px 12px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}
                  >
                    Live data reading is not currently supported for this engine.
                  </div>
                )}
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
                {settings?.live_memory_enabled && (
                  <div>
                    <StatusDot ok={live.live_source === "memory"} />
                    {live.live_source === "memory"
                      ? `Live memory reading active (pid ${live.active_process?.pid ?? "?"})`
                      : `Live memory idle · ${live.memory_failure_log?.length ? `last: ${live.memory_failure_log[live.memory_failure_log.length - 1]}` : "disk fallback"}`}
                  </div>
                )}
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
            {party && (
              <div
                style={{
                  marginTop: 8,
                  backgroundColor: "rgba(0,0,0,0.2)",
                  color: "#ddd",
                  padding: "8px 12px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  fontWeight: "bold",
                  display: "flex",
                  justifyContent: "space-between"
                }}
              >
                <span>Fainted Pokémon (Nuzlocke):</span>
                <span style={{ color: faintedCount > 0 ? "#e05858" : "#5eba7d" }}>{faintedCount}</span>
              </div>
            )}
          </Focusable>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Roadmap">
        <PanelSectionRow>
          <Focusable
            onActivate={() => {}}
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
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}
