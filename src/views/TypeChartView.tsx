import { Dropdown, PanelSection, PanelSectionRow, Spinner } from "../decky-frontend-lib-shim";
import { useEffect, useMemo, useState } from "react";
import { api, DefenseSummary, OffenseSummary } from "../api";
import { useStore } from "../store";
import { DefenseGrid, OffenseGrid } from "../components/TypeChartGrid";

type Mode = "defense" | "offense";

const NO_TYPE = "(none)";

export function TypeChartView() {
  const chart = useStore((s) => s.typeChart);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("defense");
  const [attacker, setAttacker] = useState<string>("Fire");
  const [def1, setDef1] = useState<string>("Fire");
  const [def2, setDef2] = useState<string>(NO_TYPE);
  const [defense, setDefense] = useState<DefenseSummary | null>(null);
  const [offense, setOffense] = useState<OffenseSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const types = chart?.types ?? [];
  const typeOptions = useMemo(
    () => [
      { data: NO_TYPE, label: NO_TYPE },
      ...types.map((t) => ({ data: t, label: t })),
    ],
    [types]
  );
  const attackerOptions = useMemo(
    () => types.map((t) => ({ data: t, label: t })),
    [types]
  );

  const defenderPair = useMemo(
    () => (def2 === NO_TYPE ? [def1] : [def1, def2]),
    [def1, def2]
  );

  useEffect(() => {
    if (!chart) return;
    setLoading(true);
    setError(null);
    const promise =
      mode === "defense"
        ? api.getDefenseSummary(defenderPair)
        : api.getOffenseSummary(attacker);
    promise
      .then((res) => {
        if ("error" in res && res.error) {
          setError(res.error);
          setDefense(null);
          setOffense(null);
        } else {
          if (mode === "defense") {
            setDefense(res as DefenseSummary);
            setOffense(null);
          } else {
            setOffense(res as OffenseSummary);
            setDefense(null);
          }
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [chart, mode, attacker, defenderPair]);

  if (!chart) {
    return (
      <PanelSection title="Type Chart">
        <PanelSectionRow>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 0",
            }}
          >
            <Spinner />
            <span style={{ fontSize: 13, color: "#969696" }}>
              Loading type chart…
            </span>
          </div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <>
      <PanelSection title="Mode">
        <PanelSectionRow>
          <div style={{ display: "flex", gap: "8px", padding: "4px 0" }}>
            <ModeButton
              label="Defender"
              active={mode === "defense"}
              onClick={() => setMode("defense")}
            />
            <ModeButton
              label="Attacker"
              active={mode === "offense"}
              onClick={() => setMode("offense")}
            />
          </div>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title={mode === "defense" ? "Defender types" : "Attacker type"}>
        {mode === "defense" ? (
          <>
            <PanelSectionRow>
              <Dropdown
                menuLabel="Type 1"
                selectedOption={def1}
                onChange={(opt) => setDef1(opt.data)}
                options={attackerOptions}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <Dropdown
                menuLabel="Type 2"
                selectedOption={def2}
                onChange={(opt) => setDef2(opt.data)}
                options={typeOptions}
              />
            </PanelSectionRow>
          </>
        ) : (
          <PanelSectionRow>
            <Dropdown
              menuLabel="Attacker"
              selectedOption={attacker}
              onChange={(opt) => setAttacker(opt.data)}
              options={attackerOptions}
            />
          </PanelSectionRow>
        )}
      </PanelSection>

      {loading && (
        <PanelSection>
          <PanelSectionRow>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px 0",
              }}
            >
              <Spinner />
              <span style={{ fontSize: "12px", color: "#969696" }}>Updating…</span>
            </div>
          </PanelSectionRow>
        </PanelSection>
      )}

      {error && (
        <PanelSection>
          <PanelSectionRow>
            <div style={{ color: "#e87b7b", fontSize: "12px" }}>{error}</div>
          </PanelSectionRow>
        </PanelSection>
      )}

      {mode === "defense" && defense && defense.summary && (
        <PanelSection title="What hits this Pokémon?">
          <PanelSectionRow>
            <DefenseGrid
              defenders={defense.defenders ?? []}
              summary={defense.summary}
            />
          </PanelSectionRow>
        </PanelSection>
      )}

      {mode === "offense" && offense && offense.summary && (
        <PanelSection title="What does it hit?">
          <PanelSectionRow>
            <OffenseGrid
              attacker={offense.attacker ?? attacker}
              summary={offense.summary}
            />
          </PanelSectionRow>
        </PanelSection>
      )}

      <PanelSection title="Reference">
        <PanelSectionRow>
          <div
            style={{
              fontSize: "11px",
              color: "#777",
              lineHeight: "1.5",
            }}
          >
            Gen {chart.generation} type chart. STAB (Same-Type Attack Bonus) is
            applied by the game engine, not by this calculator. Values are the
            standard multipliers for a single-typed attack.
          </div>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}

function ModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 12px",
        background: active ? "rgba(94,186,125,0.15)" : "rgba(255,255,255,0.04)",
        color: active ? "#5eba7d" : "#969696",
        border: active ? "1px solid #5eba7d" : "1px solid transparent",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: active ? 600 : 500,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}
    >
      {label}
    </button>
  );
}
