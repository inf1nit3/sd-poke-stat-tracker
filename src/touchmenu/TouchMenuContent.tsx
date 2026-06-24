import { useState } from "react";
import { MoveLookupTouchMenu } from "./MoveLookupTouchMenu";
import { PartyTouchMenu } from "./PartyTouchMenu";
import { TypeLookupTouchMenu } from "./TypeLookupTouchMenu";

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
