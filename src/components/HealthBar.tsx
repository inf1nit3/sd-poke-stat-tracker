import { CSSProperties } from "react";

interface HealthBarProps {
  hp: number;
  maxHp: number;
  statusName?: string;
  width?: number | string;
  showLabel?: boolean;
}

function colorForPercent(pct: number): string {
  if (pct >= 0.5) return "#5eba7d";
  if (pct >= 0.25) return "#e0a458";
  return "#e87b7b";
}

function statusToBar(statusName?: string): { color: string; overlay?: string } {
  if (!statusName || statusName === "OK") return { color: "" };
  const colors: Record<string, string> = {
    PSN: "#a33ea1",
    PAR: "#e0a458",
    BRN: "#c22e28",
    SLP: "#969696",
    FRZ: "#96d9d6",
    FNT: "#444",
  };
  return { color: colors[statusName] || "#888" };
}

export function HealthBar({
  hp,
  maxHp,
  statusName,
  width = "100%",
  showLabel = true,
}: HealthBarProps) {
  const safeMax = maxHp > 0 ? maxHp : 1;
  const pct = Math.max(0, Math.min(1, hp / safeMax));
  const fillColor = colorForPercent(pct);
  const status = statusToBar(statusName);

  const wrapperStyle: CSSProperties = {
    position: "relative",
    width,
    height: 8,
    background: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.1)",
  };

  const fillStyle: CSSProperties = {
    width: `${pct * 100}%`,
    height: "100%",
    background: fillColor,
    transition: "width 800ms cubic-bezier(0.25, 1, 0.5, 1), background-color 800ms ease",
  };

  const statusOverlayStyle: CSSProperties | undefined = status.color
    ? {
        position: "absolute",
        top: 0,
        left: 0,
        width: `${pct * 100}%`,
        height: "100%",
        background: `repeating-linear-gradient(45deg, ${status.color}, ${status.color} 4px, transparent 4px, transparent 8px)`,
        opacity: 0.7,
        pointerEvents: "none",
      }
    : undefined;

  if (statusOverlayStyle) {
    statusOverlayStyle.transition = "width 800ms cubic-bezier(0.25, 1, 0.5, 1)";
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
      <div style={wrapperStyle}>
        <div style={fillStyle} />
        {statusOverlayStyle && <div style={statusOverlayStyle} />}
      </div>
      {showLabel && (
        <div
          style={{
            fontSize: 11,
            color: "#bbb",
            minWidth: 56,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {hp}/{maxHp}
        </div>
      )}
    </div>
  );
}
