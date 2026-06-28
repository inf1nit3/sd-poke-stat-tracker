import type { MovesDatabase, PokemonSummary, SaveFeatures } from "../api";
import { HealthBar } from "../components/HealthBar";
import { TypeBadge } from "../components/TypeBadge";
import { normalizeKey } from "../utils/normalize";
import { useStore, saveDataEqual } from "../store";

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

const MAX_SLOTS = 6;

export function PartyTouchMenu() {
  const saveData = useStore((s) => s.saveData, saveDataEqual);
  const movesDb = useStore(
    (s) => s.movesDatabase,
    (a, b): boolean => {
      if (a === b) return true;
      if (!a || !b) return false;
      return a.merged_count === b.merged_count && a.pbs_source === b.pbs_source;
    }
  );

  if (!saveData) {
    return <EmptyState>Loading save data…</EmptyState>;
  }

  if (saveData.error === "no_save_file_found") {
    return (
      <EmptyState>
        No save file found.
        <br />
        Configure a path in <strong>Settings</strong>.
      </EmptyState>
    );
  }

  if (saveData.error === "parse_failed") {
    return (
      <EmptyState>
        Parse error: {saveData.message ?? "unknown"}
      </EmptyState>
    );
  }

  const party = saveData.party || [];
  const slots = Array.from({ length: MAX_SLOTS }).map((_, i) => party[i] || null);
  const features = saveData.features;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Header
        trainer={saveData.trainer_name}
        count={party.length}
        max={MAX_SLOTS}
        money={features?.items ? saveData.money : 0}
        badges={saveData.badges}
        location={saveData.location_name || (saveData.map_id != null ? `Map #${saveData.map_id}` : "")}
        pbsSource={movesDb?.pbs_source ?? null}
        features={features}
      />
      {slots.map((p, i) =>
        p ? (
          <PartyRow
            key={`slot-${i}`}
            pokemon={p}
            movesDb={movesDb}
            features={features}
          />
        ) : (
          <EmptySlot key={`slot-${i}`} index={i} />
        )
      )}
    </div>
  );
}

function Header({
  trainer,
  count,
  max,
  money,
  badges,
  location,
  pbsSource,
  features,
}: {
  trainer: string;
  count: number;
  max: number;
  money: number;
  badges: number;
  location: string;
  pbsSource: string | null;
  features: SaveFeatures | null | undefined;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "4px 8px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 4,
        fontSize: 12,
        color: "#ccc",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontWeight: 600, color: "#fff" }}>{trainer || "Trainer"}</span>
      <span style={{ color: "#666" }}>·</span>
      <span>Party {count}/{max}</span>
      {features?.items && money > 0 && (
        <>
          <span style={{ color: "#666" }}>·</span>
          <span>₽{money.toLocaleString("en-US")}</span>
        </>
      )}
      {badges > 0 && (
        <>
          <span style={{ color: "#666" }}>·</span>
          <span style={{ color: "#f7d02c" }}>{badges} 🏆</span>
        </>
      )}
      {location && (
        <>
          <span style={{ color: "#666" }}>·</span>
          <span style={{ color: "#888" }}>{location}</span>
        </>
      )}
      {pbsSource && (
        <span
          style={{
            marginLeft: "auto",
            fontSize: 9,
            color: "#5eba7d",
            background: "rgba(94,186,125,0.1)",
            padding: "1px 4px",
            borderRadius: 2,
          }}
          title={pbsSource}
        >
          PBS ✓
        </span>
      )}
    </div>
  );
}

function PartyRow({
  pokemon: p,
  movesDb,
  features,
}: {
  pokemon: PokemonSummary;
  movesDb: MovesDatabase | null;
  features: SaveFeatures | null | undefined;
}) {
  const statusColor = STATUS_COLORS[p.status_name] ?? "#888";
  const showStats = p.has_stats;
  const showGender = p.has_gender_data;
  const showType2 = p.has_type2 && p.type2;
  const showMoves = p.has_moves && p.moves.length > 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 5,
        borderLeft: `3px solid ${statusColor}`,
        opacity: p.is_fainted ? 0.55 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minWidth: 24,
          gap: 1,
        }}
      >
        {p.shiny && (
          <span style={{ color: "#f7d02c", fontSize: 11, lineHeight: 1 }}>★</span>
        )}
        {showGender && (
          <span
            style={{
              color:
                p.gender_name === "F"
                  ? "#e87ba3"
                  : p.gender_name === "M"
                  ? "#7ba3e8"
                  : "#888",
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {GENDER_SYMBOLS[p.gender_name] ?? "?"}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 180,
            }}
          >
            {p.nickname || p.species}
          </span>
          <span style={{ fontSize: 10, color: "#888" }}>Lv.{p.level}</span>
          {p.nature && (
            <span style={{ fontSize: 9, color: "#888" }}>{p.nature}</span>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 3 }}>
            {p.type1 && <TypeBadge type={p.type1} size="sm" />}
            {showType2 && <TypeBadge type={p.type2!} size="sm" />}
          </div>
        </div>
        <HealthBar
          hp={p.hp}
          maxHp={p.max_hp}
          statusName={p.status_name}
          showLabel={false}
        />
        <div
          style={{
            display: "flex",
            gap: 8,
            fontSize: 10,
            color: "#888",
            marginTop: 3,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span>
            {p.hp}/{p.max_hp}
          </span>
          <span style={{ color: statusColor, fontWeight: 600 }}>
            {p.status_name}
          </span>
          {p.ability && (
            <span>
              <span style={{ color: "#666" }}>·</span> {p.ability}
            </span>
          )}
          {p.item && (
            <span>
              <span style={{ color: "#666" }}>·</span> {p.item}
            </span>
          )}
          {features?.happiness && p.happiness != null && (
            <span style={{ color: "#e87ba3" }}>♥{p.happiness}</span>
          )}
          {showStats && p.speed != null && (
            <span style={{ color: "#666" }}>SPE:{p.speed}</span>
          )}
        </div>
        {showMoves && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginTop: 5,
            }}
          >
            {p.moves.map((m, i) => {
              const type = movesDb?.moves?.[normalizeKey(m)]?.type;
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    padding: "1px 5px",
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: 3,
                    fontSize: 10,
                    color: "#ccc",
                  }}
                >
                  {type && <TypeBadge type={type} size="sm" />}
                  {m}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptySlot({ index }: { index: number }) {
  return (
    <div
      style={{
        padding: 8,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 4,
        border: "1px dashed #333",
        textAlign: "center",
        fontSize: 11,
        color: "#555",
        fontStyle: "italic",
      }}
    >
      Slot {index + 1} — empty
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: "center",
        color: "#888",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}
