import { PokemonSummary, SaveFeatures } from "../api";
import { HealthBar } from "./HealthBar";
import { TypeBadge } from "./TypeBadge";

const STATUS_COLORS: Record<string, string> = {
  OK: "#5eba7d",
  PSN: "#a33ea1",
  PAR: "#e0a458",
  BRN: "#c22e28",
  SLP: "#969696",
  FRZ: "#96d9d6",
  FNT: "#888",
};

const GENDER_SYMBOLS: Record<string, string> = {
  M: "♂",
  F: "♀",
  "—": "○",
};

interface PokemonCardProps {
  pokemon: PokemonSummary;
  features?: SaveFeatures | null;
  forced?: DisplayOptions;
}

export interface DisplayOptions {
  stats: boolean;
  ivs: boolean;
  evs: boolean;
  nature: boolean;
  ability: boolean;
  item: boolean;
  happiness: boolean;
  gender: boolean;
  moves: boolean;
  type2: boolean;
}

export const DEFAULT_DISPLAY: DisplayOptions = {
  stats: true,
  ivs: true,
  evs: true,
  nature: true,
  ability: true,
  item: true,
  happiness: true,
  gender: true,
  moves: true,
  type2: true,
};

function statColor(v: number, max: number): string {
  const pct = v / max;
  if (pct >= 0.9) return "#5eba7d";
  if (pct >= 0.5) return "#e0a458";
  if (pct >= 0.25) return "#e87b7b";
  return "#777";
}

function resolveDisplay(
  p: PokemonSummary,
  features: SaveFeatures | null | undefined,
  forced: DisplayOptions | undefined
): DisplayOptions {
  const f = features;
  return {
    stats:
      (forced?.stats ?? true) &&
      (p.has_stats || (f?.stats ?? false)),
    ivs:
      (forced?.ivs ?? true) && (p.has_ivs || (f?.ivs ?? false)),
    evs:
      (forced?.evs ?? true) &&
      (p.has_evs || (f?.evs ?? false)) &&
      (p.has_ivs || (f?.ivs ?? false)),
    nature:
      (forced?.nature ?? true) && (p.has_nature || (f?.natures ?? false)),
    ability:
      (forced?.ability ?? true) && (p.has_ability || (f?.abilities ?? false)),
    item:
      (forced?.item ?? true) && (p.has_item || (f?.items ?? false)),
    happiness:
      (forced?.happiness ?? true) &&
      (p.has_happiness || (f?.happiness ?? false)),
    gender:
      (forced?.gender ?? true) &&
      (p.has_gender_data || (f?.gender ?? false)),
    moves:
      (forced?.moves ?? true) && (p.has_moves || (f?.moves ?? false)),
    type2:
      (forced?.type2 ?? true) && (p.has_type2 ?? false),
  };
}

export function PokemonCard({ pokemon: p, features, forced }: PokemonCardProps) {
  const display = resolveDisplay(p, features, forced);
  const displayName = p.nickname || p.species;
  const statusColor = STATUS_COLORS[p.status_name] ?? "#888";
  const fainted = p.is_fainted;

  const compactInfo: Array<{ label: string; value: string; color?: string }> = [];
  if (display.ability && p.ability) {
    compactInfo.push({ label: "Ability", value: p.ability });
  }
  if (display.item && p.item) {
    compactInfo.push({ label: "Item", value: p.item });
  }
  if (display.nature && p.nature) {
    compactInfo.push({ label: "Nature", value: p.nature });
  }
  if (display.happiness && p.happiness != null) {
    compactInfo.push({ label: "♥", value: String(p.happiness) });
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 10,
        background: "rgba(255,255,255,0.03)",
        borderRadius: 6,
        borderLeft: `3px solid ${statusColor}`,
        opacity: fainted ? 0.6 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {p.shiny && (
          <span
            style={{
              color: "#f7d02c",
              fontSize: 14,
              textShadow: "0 0 4px rgba(247, 208, 44, 0.5)",
            }}
            title="Shiny"
          >
            ★
          </span>
        )}
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {displayName}
        </span>
        <span style={{ fontSize: 11, color: "#888" }}>Lv.{p.level}</span>
        {display.gender && (
          <span
            style={{
              fontSize: 12,
              color:
                p.gender_name === "F"
                  ? "#e87ba3"
                  : p.gender_name === "M"
                  ? "#7ba3e8"
                  : "#888",
              fontWeight: 700,
              marginLeft: "auto",
            }}
            title={
              p.gender_name === "—"
                ? "Genderless"
                : p.gender_name === "M"
                ? "Male"
                : "Female"
            }
          >
            {GENDER_SYMBOLS[p.gender_name] ?? "?"}
          </span>
        )}
      </div>

      {p.nickname && p.nickname !== p.species && (
        <div
          style={{
            fontSize: 11,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {p.species}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {p.type1 && <TypeBadge type={p.type1} size="sm" />}
        {display.type2 && p.has_type2 && p.type2 && (
          <TypeBadge type={p.type2} size="sm" />
        )}
      </div>

      <HealthBar hp={p.hp} maxHp={p.max_hp} statusName={p.status_name} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 11,
          color: "#aaa",
          flexWrap: "wrap",
        }}
      >
        <span>
          <span style={{ color: statusColor, fontWeight: 600 }}>{p.status_name}</span>
        </span>
        {compactInfo.map((c) => (
          <span key={c.label}>
            <span style={{ color: "#777" }}>{c.label}:</span> {c.value}
          </span>
        ))}
      </div>

      {display.moves && p.moves.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
            marginTop: 2,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => {
            const move = p.moves[i];
            return (
              <div
                key={i}
                style={{
                  fontSize: 11,
                  padding: "3px 6px",
                  background: move ? "rgba(255,255,255,0.05)" : "transparent",
                  borderRadius: 3,
                  color: move ? "#ddd" : "#555",
                  fontStyle: move ? "normal" : "italic",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {move ?? "—"}
              </div>
            );
          })}
        </div>
      )}

      {display.stats && p.has_stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
            gap: 4,
            padding: "6px 0",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            fontSize: 10,
          }}
        >
          <StatBox label="ATK" value={p.attack} />
          <StatBox label="DEF" value={p.defense} />
          <StatBox label="SpA" value={p.spatk} />
          <StatBox label="SpD" value={p.spdef} />
          <StatBox label="SPE" value={p.speed} />
        </div>
      )}

      {display.ivs && p.has_ivs && p.iv_total != null && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "6px 0",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            fontSize: 10,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
              gap: 4,
            }}
          >
            <IVStat label="HP" value={p.iv_hp} />
            <IVStat label="ATK" value={p.iv_attack} />
            <IVStat label="DEF" value={p.iv_defense} />
            <IVStat label="SpA" value={p.iv_spatk} />
            <IVStat label="SpD" value={p.iv_spdef} />
            <IVStat label="SPE" value={p.iv_speed} />
          </div>
          {display.evs && p.has_evs && p.ev_total != null && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                gap: 4,
                color: "#666",
              }}
            >
              <EVStat label="HP" value={p.ev_hp} />
              <EVStat label="ATK" value={p.ev_attack} />
              <EVStat label="DEF" value={p.ev_defense} />
              <EVStat label="SpA" value={p.ev_spatk} />
              <EVStat label="SpD" value={p.ev_spdef} />
              <EVStat label="SPE" value={p.ev_speed} />
            </div>
          )}
          <div
            style={{
              fontSize: 10,
              color: "#888",
              display: "flex",
              gap: 8,
              marginTop: 2,
            }}
          >
            <span>
              IV: {p.iv_total}/186{" "}
              <span style={{ color: statColor(p.iv_total, 186) }}>●</span>
            </span>
            {display.evs && p.has_evs && p.ev_total != null && (
              <span>
                EV: {p.ev_total}/510{" "}
                <span style={{ color: statColor(p.ev_total, 510) }}>●</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number | null }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "#777",
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#ddd",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function IVStat({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
      }}
      title={value == null ? "?" : `${value}/31`}
    >
      <div
        style={{
          fontSize: 9,
          color: "#5eba7d",
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 11,
          color: value == null ? "#555" : statColor(value, 31),
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function EVStat({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
      }}
      title={value == null ? "?" : `${value} EVs`}
    >
      <div
        style={{
          fontSize: 9,
          color: "#7ba3e8",
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 10,
          color: value == null ? "#555" : "#aaa",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

export function CapabilitiesSummary({ features }: { features: SaveFeatures | null | undefined }) {
  if (!features) return null;
  const items: Array<[string, string]> = [];
  if (features.ivs) items.push(["IVs", "Available"]);
  if (features.evs) items.push(["EVs", "Available"]);
  if (features.happiness) items.push(["Friendship", "Available"]);
  if (features.shiny) items.push(["Shiny", "Supported"]);
  if (features.stats) items.push(["Stats", "Available"]);
  if (features.natures) items.push(["Natures", "Available"]);
  if (features.abilities) items.push(["Abilities", "Available"]);
  if (features.items) items.push(["Held items", "Available"]);
  if (features.type2) items.push(["Dual-types", "Available"]);
  if (features.moves) items.push(["Moves", "Available"]);
  if (items.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        fontSize: 10,
        color: "#888",
      }}
    >
      {items.map(([label, _value]) => (
        <span
          key={label}
          style={{
            background: "rgba(94,186,125,0.1)",
            color: "#5eba7d",
            padding: "2px 6px",
            borderRadius: 3,
            border: "1px solid rgba(94,186,125,0.2)",
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
