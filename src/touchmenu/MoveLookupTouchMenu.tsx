import { useEffect, useMemo, useState } from "react";
import { api, MoveInfo, OffenseSummary } from "../api";
import { TypeBadge } from "../components/TypeBadge";
import { useStore } from "../store";
import { normalizeKey } from "../utils/normalize";

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

export function MoveLookupTouchMenu() {
  const saveData = useStore((s) => s.saveData);
  const movesDb = useStore((s) => s.movesDatabase);
  const [selectedMove, setSelectedMove] = useState<string | null>(null);
  const [moveInfo, setMoveInfo] = useState<MoveInfo | null>(null);
  const [offense, setOffense] = useState<OffenseSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedMove) {
      setMoveInfo(null);
      setOffense(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setOffense(null);
    api
      .getMoveInfo(selectedMove)
      .then((info) => {
        if (cancelled) return;
        setMoveInfo(info);
        if (info && info.type) {
          return api.getOffenseSummary(info.type).then((off) => {
            if (!cancelled) setOffense(off);
          });
        }
        return null;
      })
      .catch((e: Error) => console.error("[move-lookup]", e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedMove]);

  if (!saveData || saveData.error) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: "#888",
          fontSize: 13,
        }}
      >
        Load a save first to see party moves.
      </div>
    );
  }

  const party = saveData.party || [];
  const partyMoves = useMemo(
    () => {
      const out: { move: string; owner: string }[] = [];
      for (const p of party) {
        for (const m of p.moves) {
          if (m) out.push({ move: m, owner: p.nickname || p.species });
        }
      }
      return out;
    },
    [party]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          paddingBottom: 4,
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        <span style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>
          PARTY MOVES:
        </span>
        {partyMoves.map((pm, i) => {
          const info = movesDb?.moves?.[normalizeKey(pm.move)];
          const type = info?.type;
          return (
            <button
              key={`${pm.owner}-${pm.move}-${i}`}
              onClick={() => setSelectedMove(pm.move)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                background:
                  selectedMove === pm.move
                    ? "rgba(94,186,125,0.2)"
                    : "rgba(255,255,255,0.05)",
                color: "#ddd",
                border:
                  selectedMove === pm.move
                    ? "1px solid #5eba7d"
                    : "1px solid transparent",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {type && <TypeBadge type={type} size="sm" />}
              <span>{pm.move}</span>
            </button>
          );
        })}
      </div>

      {!selectedMove && (
        <div
          style={{
            padding: 20,
            textAlign: "center",
            color: "#888",
            fontSize: 12,
            fontStyle: "italic",
          }}
        >
          Tap a move to see its type and effectiveness
        </div>
      )}

      {selectedMove && loading && (
        <div style={{ padding: 16, textAlign: "center", color: "#aaa" }}>
          Loading…
        </div>
      )}

      {selectedMove && !loading && (
        <MoveDetail move={selectedMove} info={moveInfo} offense={offense} />
      )}

      {movesDb && (
        <div
          style={{
            fontSize: 10,
            color: "#555",
            textAlign: "right",
            marginTop: 2,
          }}
        >
          {movesDb.merged_count} moves available
          {movesDb.pbs_source && (
            <>
              {" "}· PBS: {movesDb.pbs_source.split("/").slice(-2).join("/")}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MoveDetail({
  move,
  info,
  offense,
}: {
  move: string;
  info: MoveInfo | null;
  offense: OffenseSummary | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        background: "rgba(255,255,255,0.04)",
        borderRadius: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#fff",
            textTransform: "uppercase",
          }}
        >
          {info?.name || move}
        </span>
        {info?.type && <TypeBadge type={info.type} size="md" />}
        <div style={{ flex: 1 }} />
        {info?.source && (
          <span
            style={{
              fontSize: 9,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {info.source}
            {info.guessed && " (heuristic)"}
          </span>
        )}
      </div>

      {info && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            fontSize: 11,
            color: "#ccc",
          }}
        >
          <Detail label="Category" value={info.category} />
          <Detail label="Power" value={info.power ? String(info.power) : "—"} />
          <Detail label="Accuracy" value={info.accuracy ? `${info.accuracy}%` : "—"} />
        </div>
      )}

      {info?.description && (
        <div
          style={{
            fontSize: 11,
            color: "#888",
            fontStyle: "italic",
            lineHeight: 1.4,
          }}
        >
          {info.description}
        </div>
      )}

      {offense?.summary && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {BUCKETS.map((bucket) => {
            const types = offense.summary?.[bucket.key] ?? [];
            if (types.length === 0) return null;
            return (
              <div
                key={bucket.key}
                style={{
                  padding: "5px 7px",
                  background: "rgba(255,255,255,0.02)",
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
                    marginBottom: 3,
                  }}
                >
                  {bucket.label} ({types.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {types.map((t) => (
                    <TypeBadge key={t} type={t} size="sm" />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          fontSize: 9,
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
