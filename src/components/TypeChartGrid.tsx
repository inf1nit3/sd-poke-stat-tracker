import { TypeBadge } from "./TypeBadge";

type Effectiveness = "quadruple" | "double" | "neutral" | "half" | "quarter" | "immune";

const BUCKET_LABELS: Record<Effectiveness, string> = {
  quadruple: "4× damage",
  double: "2× damage",
  neutral: "Normal",
  half: "½× damage",
  quarter: "¼× damage",
  immune: "No effect",
};

const BUCKET_ORDER: Effectiveness[] = [
  "quadruple",
  "double",
  "neutral",
  "half",
  "quarter",
  "immune",
];

const BUCKET_COLORS: Record<Effectiveness, string> = {
  quadruple: "#ff4d4d",
  double: "#ff8a3d",
  neutral: "#888",
  half: "#5eba7d",
  quarter: "#2f8a55",
  immune: "#444",
};

interface DefenseGridProps {
  defenders: string[];
  summary: Record<Effectiveness, string[]>;
}

export function DefenseGrid({ defenders, summary }: DefenseGridProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "12px", color: "#969696" }}>
        Defender:{" "}
        {defenders.map((d, i) => (
          <span key={d} style={{ marginRight: "4px" }}>
            <TypeBadge type={d} size="sm" />
            {i < defenders.length - 1 ? " /" : ""}
          </span>
        ))}
      </div>

      {BUCKET_ORDER.filter((b) => (summary[b] || []).length > 0).map((bucket) => {
        const types = summary[bucket] || [];
        return (
          <div
            key={bucket}
            style={{
              padding: "6px 8px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: "4px",
              borderLeft: `3px solid ${BUCKET_COLORS[bucket]}`,
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: BUCKET_COLORS[bucket],
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "4px",
              }}
            >
              {BUCKET_LABELS[bucket]} ({types.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {types.map((t) => (
                <TypeBadge key={t} type={t} size="sm" />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface OffenseGridProps {
  attacker: string;
  summary: Record<string, string[]>;
}

const OFFENSE_BUCKETS = [
  { key: "super_effective", label: "Super effective", color: "#ff8a3d" },
  { key: "not_very_effective", label: "Not very effective", color: "#5eba7d" },
  { key: "no_effect", label: "No effect", color: "#444" },
  { key: "neutral", label: "Normal damage", color: "#888" },
] as const;

export function OffenseGrid({ attacker, summary }: OffenseGridProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "12px", color: "#969696" }}>
        Attacker: <TypeBadge type={attacker} size="sm" />
      </div>

      {OFFENSE_BUCKETS.filter((b) => (summary[b.key] || []).length > 0).map((bucket) => {
        const types = summary[bucket.key] || [];
        return (
          <div
            key={bucket.key}
            style={{
              padding: "6px 8px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: "4px",
              borderLeft: `3px solid ${bucket.color}`,
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: bucket.color,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "4px",
              }}
            >
              {bucket.label} ({types.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {types.map((t) => (
                <TypeBadge key={t} type={t} size="sm" />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
