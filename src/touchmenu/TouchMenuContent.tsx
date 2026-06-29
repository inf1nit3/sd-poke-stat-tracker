import { useState } from "react";
import { MoveLookupTouchMenu } from "./MoveLookupTouchMenu";
import { PartyTouchMenu } from "./PartyTouchMenu";
import { TypeLookupTouchMenu } from "./TypeLookupTouchMenu";
import { useStore } from "../store";

function CoachModeWidget() {
  const analysis = useStore((s) => s.liveState?.battle_analysis);
  const coach_suggestion = analysis?.coach_suggestion;
  
  if (!coach_suggestion) return null;
  
  return (
    <div style={{
      padding: "8px",
      backgroundColor: "rgba(255, 204, 0, 0.15)",
      border: "1px solid rgba(255, 204, 0, 0.5)",
      borderRadius: "4px",
      marginBottom: "8px",
    }}>
      <div style={{ color: "#ffcc00", fontWeight: "bold", fontSize: "12px", marginBottom: "2px" }}>
        COACH SUGGESTION
      </div>
      <div style={{ fontSize: "13px", color: "#fff" }}>
        Switch to <strong>{coach_suggestion.suggested_pokemon}</strong>
      </div>
      <div style={{ fontSize: "11px", color: "#ddd", marginTop: "2px" }}>
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
      <span style={{ color: "#ddd" }}>Fainted (Nuzlocke):</span>
      <span style={{ color: faintedCount > 0 ? "#e05858" : "#5eba7d" }}>{faintedCount}</span>
    </div>
  );
}

type Tab = "party" | "types" | "moves";

const TABS: { id: Tab; label: string }[] = [
  { id: "party", label: "Party" },
  { id: "types", label: "Type Lookup" },
  { id: "moves", label: "Move Lookup" },
];

export function TouchMenuContent() {
  const [tab, setTab] = useState<Tab>("party");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "10px 12px 14px 12px",
        minWidth: 360,
        maxWidth: 720,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          paddingBottom: 4,
          borderBottom: "1px solid #2a2a2a",
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
        background: active ? "rgba(94,186,125,0.15)" : "rgba(255,255,255,0.04)",
        color: active ? "#5eba7d" : "#aaa",
        border: active ? "1px solid #5eba7d" : "1px solid transparent",
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
