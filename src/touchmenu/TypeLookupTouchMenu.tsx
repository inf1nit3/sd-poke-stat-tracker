import { useEffect, useState } from "react";
import { api, OffenseSummary } from "../api";
import { useStore } from "../store";
import { TypeBadge } from "../components/TypeBadge";

const BUCKETS = [
  {
    key: "super_effective" as const,
    label: "Super effective (2×)",
    color: "#ff8a3d",
  },
  {
    key: "not_very_effective" as const,
    label: "Not very effective (½×)",
    color: "#5eba7d",
  },
  {
    key: "no_effect" as const,
    label: "No effect (0×)",
    color: "#888",
  },
] as const;

export function TypeLookupTouchMenu() {
  const typeChart = useStore((s) => s.typeChart);
  const [attacker, setAttacker] = useState<string>("Fire");
  const [summary, setSummary] = useState<OffenseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attacker) return;
    setSummary(null);
    setError(null);
    api
      .getOffenseSummary(attacker)
      .then((s) => {
        if ("error" in s && s.error) {
          setError(s.error);
        } else {
          setSummary(s);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [attacker]);

  if (!typeChart) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: "#888",
          fontSize: 13,
        }}
      >
        Loading type chart…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "#aaa",
        }}
      >
        <span>Attacker:</span>
        <select
          value={attacker}
          onChange={(e) => setAttacker(e.target.value)}
          style={{
            flex: 1,
            padding: "6px 8px",
            background: "#1a1a1a",
            color: "#fff",
            border: "1px solid #444",
            borderRadius: 4,
            fontSize: 13,
            outline: "none",
          }}
        >
          {typeChart.types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <TypeBadge type={attacker} size="md" />
      </div>

      {error && (
        <div style={{ color: "#e87b7b", fontSize: 12, padding: "4px 0" }}>
          {error}
        </div>
      )}

      {summary?.summary && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {BUCKETS.map((bucket) => {
            const types = summary.summary?.[bucket.key] ?? [];
            if (types.length === 0) return null;
            return (
              <div
                key={bucket.key}
                style={{
                  padding: "6px 8px",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 4,
                  borderLeft: `3px solid ${bucket.color}`,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: bucket.color,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    marginBottom: 4,
                  }}
                >
                  {bucket.label} ({types.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {types.map((t) => (
                    <TypeBadge key={t} type={t} size="sm" />
                  ))}
                </div>
              </div>
            );
          })}
          <div
            style={{
              fontSize: 10,
              color: "#555",
              textAlign: "right",
              marginTop: 2,
            }}
          >
            Generation {typeChart.generation} type chart
          </div>
        </div>
      )}
    </div>
  );
}
