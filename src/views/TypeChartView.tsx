import { ButtonItem, Dropdown, Focusable, PanelSection, PanelSectionRow, Spinner } from "@decky/ui";
import { useEffect, useMemo, useState } from "react";
import { api, DefenseSummary, OffenseSummary } from "../api";
import { useStore, retryRefreshStatic } from "../store";
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
              color: "#e0a458",
              fontSize: 12,
              padding: "8px 0",
            }}
          >
            Type chart data isn't loaded yet. The Decky Loader may be
            reloading the plugin in the background.
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => {
              retryRefreshStatic();
            }}
          >
            Reload
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <>
      <PanelSection title="Mode">
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => setMode(mode === "defense" ? "offense" : "defense")}
          >
            Mode: {mode === "defense" ? "Defender" : "Attacker"} (click to switch)
          </ButtonItem>
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
                rgOptions={attackerOptions}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <Dropdown
                menuLabel="Type 2"
                selectedOption={def2}
                onChange={(opt) => setDef2(opt.data)}
                rgOptions={typeOptions}
              />
            </PanelSectionRow>
          </>
        ) : (
          <PanelSectionRow>
            <Dropdown
              menuLabel="Attacker"
              selectedOption={attacker}
              onChange={(opt) => setAttacker(opt.data)}
              rgOptions={attackerOptions}
            />
          </PanelSectionRow>
        )}
      </PanelSection>

      {loading && (
        <PanelSection>
          <PanelSectionRow>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <Spinner />
              <span style={{ fontSize: 12, color: "#969696" }}>Updating…</span>
            </div>
          </PanelSectionRow>
        </PanelSection>
      )}

      {error && (
        <PanelSection>
          <PanelSectionRow>
            <div style={{ color: "#e87b7b", fontSize: 12, padding: "4px 0" }}>{error}</div>
          </PanelSectionRow>
        </PanelSection>
      )}

      {mode === "defense" && defense && defense.summary && (
        <PanelSection title="What hits this Pokémon?">
          <PanelSectionRow>
            <DefenseGrid defenders={defense.defenders ?? []} summary={defense.summary} />
          </PanelSectionRow>
        </PanelSection>
      )}

      {mode === "offense" && offense && offense.summary && (
        <PanelSection title="What does it hit?">
          <PanelSectionRow>
            <OffenseGrid attacker={offense.attacker ?? attacker} summary={offense.summary} />
          </PanelSectionRow>
        </PanelSection>
      )}
    </>
  );
}
