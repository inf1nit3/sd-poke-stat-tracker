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
              fontSize: "14px",
              padding: "12px",
              backgroundColor: "rgba(224, 164, 88, 0.1)",
              borderRadius: "6px",
              lineHeight: "1.4",
            }}
          >
            Plugin data isn't loaded yet. The Decky Loader may be reloading the plugin in the background.
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable
            onActivate={() => retryRefreshStatic()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "12px",
              marginTop: "12px",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: "14px", color: "#fff", fontWeight: 500 }}>Reload Data</span>
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
              gap: "6px",
              padding: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              borderRadius: "8px",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: "bold", color: "#fff" }}>
              {String(info.name)}{" "}
              <span style={{ color: "rgba(255, 255, 255, 0.5)", fontWeight: "normal", fontSize: "14px" }}>
                v{String(info.version)}
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.7)", lineHeight: "1.5" }}>
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
              fontSize: "13px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              padding: "12px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              borderRadius: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <StatusDot ok={info.initialized} />
              <span style={{ color: "#fff" }}>{info.initialized ? "Backend ready" : "Backend not initialized"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <StatusDot ok={info.type_chart_loaded} />
              <span style={{ color: "#fff" }}>
                {info.type_chart_loaded ? `Type chart loaded (${info.type_chart_types} types)` : "Type chart not loaded"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <StatusDot ok={movesDb?.loaded ?? false} />
              <span style={{ color: "#fff" }}>
                {movesDb?.loaded
                  ? movesDb.pbs_source
                    ? `Moves DB: ${movesDb.merged_count} (PBS loaded)`
                    : `Moves DB: ${movesDb.static_count} static only`
                  : "Moves DB not loaded"}
              </span>
            </div>
            {live && (
              <>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <StatusDot ok={live.game_running} />
                  <span style={{ color: "#fff" }}>
                    {live.game_running
                      ? `Game running: ${live.detected_game_name || String(live.active_process?.name ?? "unknown")} (pid ${String(live.active_process?.pid ?? "?")})`
                      : "No game process detected"}
                  </span>
                </div>
                {live.game_running && live.stream_status && (
                  <div style={{ marginTop: "6px", paddingTop: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.1)", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "bold" }}>
                      Live Injection Status
                    </div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <StatusDot ok={live.stream_status.listening} />
                      <span style={{ color: "#fff" }}>
                        {live.stream_status.listening ? "Stream server listening (127.0.0.1:9988)" : "Stream server not started"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <StatusDot ok={live.stream_status.connected} />
                      <span style={{ color: "#fff" }}>
                        {live.stream_status.connected
                          ? `Game mod connected${live.stream_status.last_data_trainer ? ` (Trainer: ${live.stream_status.last_data_trainer})` : ""}`
                          : "Game mod not connected"}
                      </span>
                    </div>
                    {live.stream_status.total_frames > 0 ? (
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <StatusDot ok={true} />
                        <span style={{ color: "#fff" }}>
                          {`Injection active — ${live.stream_status.total_frames} frames` +
                            (live.stream_status.last_data_at ? ` · last ${timeAgo(live.stream_status.last_data_at)}` : "")}
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <StatusDot ok={false} />
                        <span style={{ color: "#fff" }}>
                          {live.stream_status.listening ? "Waiting for game mod data…" : "Injection not started"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", marginTop: live.game_running && live.stream_status ? "6px" : "0" }}>
                  <StatusDot ok={live.watcher_active} />
                  <span style={{ color: "#fff" }}>
                    {live.watcher_active
                      ? `Save watcher active${live.last_live_event?.at ? ` · last event ${timeAgo(live.last_live_event.at)}` : ""}`
                      : "Save watcher inactive"}
                  </span>
                </div>
                {settings?.live_memory_enabled && (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <StatusDot ok={live.live_source === "memory"} />
                    <span style={{ color: "#fff" }}>
                      {live.live_source === "memory"
                        ? `Live memory reading active (pid ${live.active_process?.pid ?? "?"})`
                        : `Live memory idle · ${live.memory_failure_log?.length ? `last: ${live.memory_failure_log[live.memory_failure_log.length - 1]}` : "disk fallback"}`}
                    </span>
                  </div>
                )}
              </>
            )}
            {saveData && !saveData.error && saveData.features && (
              <div style={{ marginTop: "6px", paddingTop: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
                <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "bold", marginBottom: "8px" }}>
                  Save features ({saveData.version})
                </div>
                <CapabilitiesSummary features={saveData.features} />
              </div>
            )}
          </Focusable>
        </PanelSectionRow>
        
        {party && (
          <PanelSectionRow>
            <Focusable
              style={{
                marginTop: "8px",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                padding: "12px 16px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "bold",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <span style={{ color: "rgba(255, 255, 255, 0.8)" }}>Fainted Pokémon (Nuzlocke):</span>
              <span style={{ 
                color: faintedCount > 0 ? "#e05858" : "#5eba7d",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                padding: "4px 10px",
                borderRadius: "12px",
                fontSize: "13px"
              }}>
                {faintedCount}
              </span>
            </Focusable>
          </PanelSectionRow>
        )}
      </PanelSection>
    </>
  );
}
