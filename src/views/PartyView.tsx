import { ButtonItem, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { useCallback, useState } from "react";
import { SaveData } from "../api";
import {
  CapabilitiesSummary,
  DEFAULT_DISPLAY,
  DisplayOptions,
  PokemonCard,
} from "../components/PokemonCard";
import { refreshSave, retryRefreshStatic, useStore, saveDataEqual } from "../store";

function formatMoney(n: number): string {
  return `₽${n.toLocaleString("en-US")}`;
}

function formatPlayTime(seconds: number): string {
  if (!seconds || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function timeAgo(epochSeconds: number): string {
  if (!epochSeconds) return "never";
  const delta = Date.now() / 1000 - epochSeconds;
  if (delta < 5) return "just now";
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

const MAX_PARTY_SLOTS = 6;

export function PartyView() {
  const data = useStore((s) => s.saveData, saveDataEqual);
  const settings = useStore((s) => s.settings);
  const [reloading, setReloading] = useState(false);

  const reload = useCallback(async () => {
    setReloading(true);
    try {
      await refreshSave(true);
    } finally {
      setReloading(false);
    }
  }, []);

  if (!data) {
    return (
      <PanelSection title="Party">
        <PanelSectionRow>
          <Focusable
            onActivate={() => {}}
            style={{
              color: "#e0a458",
              fontSize: 12,
              padding: "4px 0",
            }}
          >
            Save data isn't loaded yet. The Decky Loader may be
            reloading the plugin in the background.
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => {
              retryRefreshStatic();
            }}
          >
            Reload
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  if (data.error === "no_save_file_found") {
    return (
      <PanelSection title="Party">
        <PanelSectionRow>
          <Focusable onActivate={() => {}} style={{ fontSize: 13, color: "#969696", lineHeight: 1.5 }}>
            No save file found. Start the game and save once, or set a
            manual path in <strong>Settings</strong>.
          </Focusable>
        </PanelSectionRow>
        <ButtonItem layout="below" onClick={reload} disabled={reloading}>
          {reloading ? "Scanning…" : "Scan again"}
        </ButtonItem>
      </PanelSection>
    );
  }

  if (data.error === "parse_failed") {
    return (
      <PanelSection title="Party">
        <PanelSectionRow>
          <Focusable onActivate={() => {}}>
            <div style={{ color: "#e87b7b", fontSize: 13 }}>
              Parse error: {data.message}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#777",
                marginTop: 6,
                wordBreak: "break-all",
              }}
            >
              {data.path}
            </div>
          </Focusable>
        </PanelSectionRow>
        <ButtonItem layout="below" onClick={reload} disabled={reloading}>
          Try again
        </ButtonItem>
      </PanelSection>
    );
  }

  const compactMode = settings?.compact_mode ?? true;
  return (
    <PartyContent
      data={data}
      reloading={reloading}
      onReload={reload}
      autoRefreshSeconds={settings?.scan_interval_seconds ?? 30}
      forced={compactMode ? undefined : DEFAULT_DISPLAY}
    />
  );
}

function PartyContent({
  data,
  reloading,
  onReload,
  autoRefreshSeconds,
  forced,
}: {
  data: SaveData;
  reloading: boolean;
  onReload: () => void;
  autoRefreshSeconds: number;
  forced: DisplayOptions | undefined;
}) {
  const party = data.party || [];
  const slots = Array.from({ length: MAX_PARTY_SLOTS }).map(
    (_, i) => party[i] || null
  );

  return (
    <>
      <PanelSection title={data.trainer_name || "Trainer"}>
        <PanelSectionRow>
          <Focusable
            onActivate={() => {}}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              fontSize: 12,
            }}
          >
            <Stat label="Money" value={formatMoney(data.money)} />
            <Stat label="Badges" value={String(data.badges)} />
            <Stat
              label="Location"
              value={data.location_name || `Map #${data.map_id ?? "?"}`}
            />
            <Stat label="Position" value={`${data.x ?? "?"}, ${data.y ?? "?"}`} />
            <Stat label="Play time" value={formatPlayTime(data.play_time_seconds)} />
            <Stat label="Version" value={data.version} />
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable onActivate={() => {}} style={{ fontSize: 11, color: "#777" }}>
            Updated {timeAgo(data.parsed_at)} · auto-refresh every{" "}
            {Math.max(5, autoRefreshSeconds)}s
          </Focusable>
        </PanelSectionRow>
        <ButtonItem layout="below" onClick={onReload} disabled={reloading}>
          {reloading ? "Reloading…" : "Reload from disk"}
        </ButtonItem>
      </PanelSection>

      {data.features && (
        <PanelSection title="Detected features">
          <PanelSectionRow>
            <Focusable onActivate={() => {}}>
              <CapabilitiesSummary features={data.features} />
            </Focusable>
          </PanelSectionRow>
        </PanelSection>
      )}

      <PanelSection title={`Party (${party.length}/${MAX_PARTY_SLOTS})`}>
        {slots.map((p, i) =>
          p ? (
            <PanelSectionRow key={`slot-${i}`}>
              <PokemonCard
                pokemon={p}
                features={data.features}
                forced={forced}
              />
            </PanelSectionRow>
          ) : (
            <PanelSectionRow key={`slot-${i}`}>
              <Focusable
                onActivate={() => {}}
                style={{
                  padding: 10,
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 6,
                  border: "1px dashed #333",
                  textAlign: "center",
                  fontSize: 11,
                  color: "#555",
                  fontStyle: "italic",
                }}
              >
                Slot {i + 1} — empty
              </Focusable>
            </PanelSectionRow>
          )
        )}
      </PanelSection>

      <PanelSection title="Source">
        <PanelSectionRow>
          <Focusable
            onActivate={() => {}}
            style={{
              fontSize: 10,
              color: "#666",
              wordBreak: "break-all",
              lineHeight: 1.4,
            }}
          >
            {data.source_path}
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          fontSize: 10,
          color: "#777",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, color: "#ddd" }}>{value}</div>
    </div>
  );
}
