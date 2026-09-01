import { useMemo, useState, type CSSProperties } from "react";
import { MoveLookupTouchMenu } from "./MoveLookupTouchMenu";
import { NuzlockeLogTouchMenu } from "./NuzlockeLogTouchMenu";
import { PartyTouchMenu } from "./PartyTouchMenu";
import { TypeLookupTouchMenu } from "./TypeLookupTouchMenu";
import { useStore } from "../store";
import { DEFAULT_PALETTE, paletteToCssVars } from "../theme";

function CoachModeWidget() {
  const analysis = useStore((s) => s.liveState?.battle_analysis);
  const coach_suggestion = analysis?.coach_suggestion;
  
  if (!coach_suggestion) return null;
  
  return (
    <div style={{
      padding: "8px",
      backgroundColor: "var(--theme-warning-bg, rgba(255, 204, 0, 0.15))",
      border: "1px solid var(--theme-warning-border, rgba(255, 204, 0, 0.5))",
      borderRadius: "4px",
      marginBottom: "8px",
    }}>
      <div style={{ color: "var(--theme-warning, #ffcc00)", fontWeight: "bold", fontSize: "12px", marginBottom: "2px" }}>
        COACH SUGGESTION
      </div>
      <div style={{ fontSize: "13px", color: "var(--theme-text, #fff)" }}>
        Switch to <strong>{coach_suggestion.suggested_pokemon}</strong>
      </div>
      <div style={{ fontSize: "11px", color: "var(--theme-text-secondary, #ddd)", marginTop: "2px" }}>
        {coach_suggestion.reason}
      </div>
    </div>
  );
}

function NuzlockeCounterWidget() {
  const party = useStore((s) => s.saveData?.party);
  if (!party) return null;
  const faintedCount = party.filter((p) => p.is_fainted).length;
  
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px",
      backgroundColor: "rgba(0,0,0,0.3)",
      borderRadius: "4px",
      marginBottom: "8px",
      fontSize: "12px",
      fontWeight: "bold",
    }}>
      <span style={{ color: "var(--theme-text-secondary, #ddd)" }}>Fainted (Nuzlocke):</span>
      <span style={{ color: faintedCount > 0 ? "var(--theme-danger, #e05858)" : "var(--theme-accent, #5eba7d)" }}>{faintedCount}</span>
    </div>
  );
}

type Tab = "party" | "types" | "moves" | "log";

const TABS: { id: Tab; label: string }[] = [
  { id: "party", label: "Party" },
  { id: "types", label: "Type Lookup" },
  { id: "moves", label: "Move Lookup" },
  { id: "log", label: "Log" },
];

export function TouchMenuContent() {
  const [tab, setTab] = useState<Tab>("party");
  const theme = useStore((s) => s.theme);
  // Touch menus render outside the QAM plugin panel, so the CSS vars
  // set on PluginContent's root do not reach them — apply them here too.
  const palette = theme?.palette ?? DEFAULT_PALETTE;
  const themeStyle = useMemo<CSSProperties>(
    () => paletteToCssVars(palette) as CSSProperties,
    [palette]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "10px 12px 14px 12px",
        minWidth: 360,
        maxWidth: 720,
        ...themeStyle,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          paddingBottom: 4,
          borderBottom: "1px solid var(--theme-border, #2a2a2a)",
        }}
      >
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </TabButton>
        ))}
      </div>

      <CoachModeWidget />
      <NuzlockeCounterWidget />

      {tab === "party" && <PartyTouchMenu />}
      {tab === "types" && <TypeLookupTouchMenu />}
      {tab === "moves" && <MoveLookupTouchMenu />}
      {tab === "log" && <NuzlockeLogTouchMenu />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 10px",
        background: active ? "var(--theme-accent-bg, rgba(94,186,125,0.15))" : "var(--theme-bg-secondary, rgba(255,255,255,0.04))",
        color: active ? "var(--theme-accent, #5eba7d)" : "var(--theme-text-secondary, #aaa)",
        border: active ? "1px solid var(--theme-accent, #5eba7d)" : "1px solid transparent",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {children}
    </button>
  );
}
