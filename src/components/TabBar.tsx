import { Focusable } from "@decky/ui";

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
        backgroundColor: "rgba(0, 0, 0, 0.2)",
        borderRadius: "8px",
        padding: "4px",
        marginBottom: "12px",
        marginTop: "8px",
        gap: "4px",
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Focusable
            key={tab.id}
            onOKActionDescription={tab.label}
            onOKButton={() => !tab.disabled && onChange(tab.id)}
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "8px 0",
              background: active ? "rgba(255, 255, 255, 0.15)" : "transparent",
              color: tab.disabled ? "rgba(255, 255, 255, 0.3)" : active ? "#fff" : "rgba(255, 255, 255, 0.7)",
              borderRadius: "6px",
              cursor: tab.disabled ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontWeight: active ? 600 : 500,
              transition: "all 150ms ease",
              outline: "none",
              boxShadow: active ? "0 2px 4px rgba(0,0,0,0.2)" : "none",
            }}
          >
            {tab.label}
          </Focusable>
        );
      })}
    </Focusable>
  );
}

