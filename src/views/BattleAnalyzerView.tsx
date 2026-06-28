import { Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { useStore } from "../store";
import { TypeBadge } from "../components/TypeBadge";

function EffectivenessBadge({ label }: { label?: string }) {
  if (!label) return null;
  let bgColor = "#555";
  let textColor = "#fff";

  if (label.includes("super_effective")) {
    bgColor = "#5eba7d"; // Green
    textColor = "#000";
  } else if (label.includes("not_very_effective")) {
    bgColor = "#e05858"; // Red
  } else if (label.includes("immune")) {
    bgColor = "#888"; // Gray
  } else if (label.includes("neutral")) {
    bgColor = "#56b4e9"; // Blue-ish
  }

  return (
    <span
      style={{
        backgroundColor: bgColor,
        color: textColor,
        padding: "2px 6px",
        borderRadius: "4px",
        fontSize: "10px",
        marginLeft: "8px",
        fontWeight: "bold",
        textTransform: "uppercase",
      }}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

const STAT_NAMES = ["Atk", "Def", "SpA", "SpD", "Spe"];

function StatBadges({ stages }: { stages?: number[] }) {
  if (!stages || !stages.length) return null;
  return (
    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
      {stages.map((stage, i) => {
        if (stage === 0 || i >= STAT_NAMES.length) return null;
        const color = stage > 0 ? "#5eba7d" : "#e05858";
        const sign = stage > 0 ? "+" : "";
        return (
          <span key={i} style={{ backgroundColor: color, color: "#fff", padding: "2px 4px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>
            {STAT_NAMES[i]} {sign}{stage}
          </span>
        );
      })}
    </div>
  );
}

export function BattleAnalyzerView() {
  const analysis = useStore(
    (s) => s.liveState?.battle_analysis,
    (a, b) => JSON.stringify(a) === JSON.stringify(b)
  );

  if (!analysis) {
    return null;
  }

  const { enemy, moves, best_move, coach_suggestion } = analysis;

  return (
    <>
      <PanelSection title="Battle Analyzer">
        {coach_suggestion && (
          <PanelSectionRow>
            <Focusable
              style={{
                padding: "10px",
                backgroundColor: "rgba(255, 204, 0, 0.2)",
                border: "1px solid #ffcc00",
                borderRadius: "4px",
                marginBottom: "8px",
              }}
            >
              <div style={{ color: "#ffcc00", fontWeight: "bold", fontSize: "14px", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>💡 COACH SUGGESTION</span>
              </div>
              <div style={{ fontSize: "14px" }}>
                Switch to <strong>{coach_suggestion.suggested_pokemon}</strong>
              </div>
              <div style={{ fontSize: "12px", color: "#ddd", marginTop: "2px" }}>
                Reason: {coach_suggestion.reason}
              </div>
            </Focusable>
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <Focusable
            style={{
              padding: "8px",
              backgroundColor: "rgba(0, 0, 0, 0.2)",
              borderRadius: "4px",
              marginBottom: "8px",
            }}
          >
            <div style={{ fontSize: "14px", fontWeight: "bold" }}>
              Enemy: {enemy.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <div style={{ flex: 1, height: "12px", backgroundColor: "#333", borderRadius: "6px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${enemy.totalhp && enemy.hp !== undefined ? Math.round((enemy.hp / enemy.totalhp) * 100) : 100}%`,
                    backgroundColor: (enemy.totalhp && enemy.hp !== undefined ? Math.round((enemy.hp / enemy.totalhp) * 100) : 100) > 50 ? "#5eba7d" : (enemy.totalhp && enemy.hp !== undefined ? Math.round((enemy.hp / enemy.totalhp) * 100) : 100) > 20 ? "#e0b058" : "#e05858",
                    transition: "width 0.3s ease-in-out, background-color 0.3s ease-in-out"
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {(enemy.types || []).map((t: string) => (
                  <TypeBadge key={t} type={t} size="sm" />
                ))}
              </div>
            </div>
            <StatBadges stages={enemy.stages} />
          </Focusable>
        </PanelSectionRow>

        {moves.map((move: any, index: number) => {
          const isBest = move.id === best_move;
          return (
            <PanelSectionRow key={index}>
              <Focusable
                style={{
                  padding: "8px",
                  backgroundColor: isBest
                    ? "rgba(94, 186, 125, 0.2)"
                    : "rgba(255, 255, 255, 0.05)",
                  borderRadius: "4px",
                  border: isBest ? "1px solid #5eba7d" : "1px solid transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: isBest ? "bold" : "normal" }}>
                    {move.id}
                    {isBest && (
                      <span
                        style={{
                          marginLeft: "8px",
                          fontSize: "10px",
                          color: "#5eba7d",
                          fontWeight: "bold",
                        }}
                      >
                        ⭐ BEST
                      </span>
                    )}
                  </div>
                  {move.type && (
                    <div style={{ fontSize: "12px", color: "#aaa", display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                      <TypeBadge type={move.type} size="sm" />
                      {move.basePower ? <span>Power: {move.basePower}</span> : null}
                    </div>
                  )}
                </div>
                <EffectivenessBadge label={move.effectiveness} />
              </Focusable>
            </PanelSectionRow>
          );
        })}
      </PanelSection>
    </>
  );
}
