import { CSSProperties } from "react";

export const TYPE_COLORS: Record<string, string> = {
  Normal: "#A8A77A",
  Fire: "#EE8130",
  Water: "#6390F0",
  Electric: "#F7D02C",
  Grass: "#7AC74C",
  Ice: "#96D9D6",
  Fighting: "#C22E28",
  Poison: "#A33EA1",
  Ground: "#E2BF65",
  Flying: "#A98FF3",
  Psychic: "#F95587",
  Bug: "#A6B91A",
  Rock: "#B6A136",
  Ghost: "#735797",
  Dragon: "#6F35FC",
  Dark: "#705746",
  Steel: "#B7B7CE",
  Fairy: "#D685AD",
};

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, CSSProperties> = {
  sm: { padding: "2px 6px", fontSize: "10px" },
  md: { padding: "3px 8px", fontSize: "12px" },
  lg: { padding: "4px 12px", fontSize: "13px" },
};

interface TypeBadgeProps {
  type: string;
  size?: Size;
  style?: CSSProperties;
  dimmed?: boolean;
}

export function TypeBadge({ type, size = "md", style, dimmed = false }: TypeBadgeProps) {
  const color = TYPE_COLORS[type] ?? "#777";
  return (
    <span
      style={{
        display: "inline-block",
        background: color,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        borderRadius: "4px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.4px",
        whiteSpace: "nowrap",
        opacity: dimmed ? 0.45 : 1,
        ...SIZES[size],
        ...style,
      }}
    >
      {type}
    </span>
  );
}

export function isKnownType(type: string): boolean {
  return type in TYPE_COLORS;
}
