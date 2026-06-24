import { Focusable } from "../decky-frontend-lib-shim";

export interface TabDef {
  id: string;
  label: string;
  disabled?: boolean;
}

interface TabBarProps {
  tabs: TabDef[];
  activeId: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, activeId, onChange }: TabBarProps) {
  return (
    <Focusable
      focusWithinClassName="gp-tabs-active"
      style={{
        display: "flex",
        flexDirection: "row",
        gap: "4px",
        padding: "8px 0 6px 0",
        borderBottom: "1px solid #2a2a2a",
        marginBottom: "4px",
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Focusable
            key={tab.id}
            onClick={() => !tab.disabled && onChange(tab.id)}
            style={{
              padding: "6px 10px",
              background: active ? "rgba(255,255,255,0.08)" : "transparent",
              color: tab.disabled ? "#555" : active ? "#fff" : "#969696",
              borderRadius: "4px",
              cursor: tab.disabled ? "not-allowed" : "pointer",
              fontSize: "12px",
              fontWeight: active ? 600 : 500,
              borderBottom: active ? "2px solid #5eba7d" : "2px solid transparent",
              transition: "color 120ms, background 120ms",
              outline: "none",
            }}
          >
            {tab.label}
          </Focusable>
        );
      })}
    </Focusable>
  );
}
