import { definePlugin, toaster } from "@decky/api";
import { Focusable, ScrollPanel, PanelSection, PanelSectionRow } from "@decky/ui";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PokeballIcon } from "./components/PokeballIcon";
import { TabBar, TabDef } from "./components/TabBar";
import {
  getState,
  refreshStatic,
  startPolling,
  stopPolling,
  useStore,
} from "./store";
import { DEFAULT_PALETTE, paletteToCssVars } from "./theme";
import { registerTouchMenu, unregisterTouchMenu } from "./touchmenu";
import { HomeView } from "./views/HomeView";
import { PartyView } from "./views/PartyView";
import { SettingsView } from "./views/SettingsView";
import { TypeChartView } from "./views/TypeChartView";
import { BattleAnalyzerView } from "./views/BattleAnalyzerView";

type TabId = "status" | "typechart" | "party" | "settings";

const TABS: TabDef[] = [
  { id: "status", label: "Status" },
  { id: "typechart", label: "Type Chart" },
  { id: "party", label: "Party" },
  { id: "settings", label: "Settings" },
];

function PluginContent() {
  const [active, setActive] = useState<TabId>("status");
  const theme = useStore((s) => s.theme);
  const touchmenuEnabled = useStore((s) => s.settings?.touchmenu_enabled ?? true);
  const inBattle = useStore((s) => !!s.liveState?.battle_analysis);
  const showRestartBanner = useStore(
    (s) => !!s.liveState?.mod_needs_restart && s.liveState?.live_source !== "stream"
  );

  // Drive TouchMenu registration from the setting (not just plugin load).
  useEffect(() => {
    if (touchmenuEnabled) {
      registerTouchMenu();
    } else {
      unregisterTouchMenu();
    }
  }, [touchmenuEnabled]);

  // --- Advanced Toasts (only fire on actual state transitions, not every poll) ---
  const enemyName = useStore((s) => s.liveState?.battle_analysis?.enemy?.name);
  const coachSuggestion = useStore((s) => s.liveState?.battle_analysis?.coach_suggestion?.suggested_pokemon);
  const enemyHasBoosts = useStore((s) => {
    const stages = s.liveState?.battle_analysis?.enemy?.stages;
    return !!stages && stages.some((v: number) => v > 0);
  });
  const lastEnemyName = useRef<string | undefined>(undefined);
  const lastCoach = useRef<string | undefined>(undefined);
  const lastBoostWarned = useRef(false);

  // 1. Battle Start / Enemy Switch — only toast when the enemy name actually changes.
  useEffect(() => {
    if (inBattle && enemyName && enemyName !== lastEnemyName.current) {
      const types = getState().liveState?.battle_analysis?.enemy?.types;
      const typeStr = types?.join("/") || "Unknown";
      toaster.toast({ title: "Battle Update", body: `Enemy sent out ${enemyName} (Type: ${typeStr})` });
    }
    lastEnemyName.current = enemyName;
  }, [enemyName, inBattle]);

  // 2. Coach Suggestion — only toast when the suggestion changes.
  useEffect(() => {
    if (inBattle && coachSuggestion && coachSuggestion !== lastCoach.current) {
      const reason = getState().liveState?.battle_analysis?.coach_suggestion?.reason || "";
      toaster.toast({ title: "Coach Suggestion", body: `Switch to ${coachSuggestion}! ${reason}` });
    }
    lastCoach.current = coachSuggestion;
  }, [coachSuggestion, inBattle]);

  // 3. Stat Warning — only toast once per boost transition.
  useEffect(() => {
    if (inBattle && enemyHasBoosts && !lastBoostWarned.current) {
      toaster.toast({ title: "Stat Warning", body: "Enemy stats are boosted! Be careful!" });
      lastBoostWarned.current = true;
    } else if (!enemyHasBoosts) {
      lastBoostWarned.current = false;
    }
  }, [enemyHasBoosts, inBattle]);
  // -------------------------------------------------------------------------------

  useEffect(() => {
    refreshStatic();
  }, []);

  const palette = theme?.palette ?? DEFAULT_PALETTE;
  const themeStyle = useMemo<CSSProperties>(
    () => paletteToCssVars(palette) as CSSProperties,
    [palette]
  );

  return (
    <Focusable style={{ display: "flex", flexDirection: "column", ...themeStyle }}>
      <TabBar
        tabs={TABS}
        activeId={active}
        onChange={(id) => setActive(id as TabId)}
      />
      <ScrollPanel>
        {showRestartBanner && (
          <PanelSection>
            <PanelSectionRow>
              <div
                style={{
                  backgroundColor: "#e05858",
                  color: "#fff",
                  padding: "12px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  lineHeight: "1.4",
                  fontWeight: "bold",
                  marginBottom: "8px"
                }}
              >
                The live-tracker mod was just auto-installed. Please restart your Pokémon game once to activate the Battle Analyzer.
              </div>
            </PanelSectionRow>
          </PanelSection>
        )}
        {active === "status" && (inBattle ? <BattleAnalyzerView /> : <HomeView />)}
        {active === "typechart" && <TypeChartView />}
        {active === "party" && <PartyView />}
        {active === "settings" && <SettingsView />}
      </ScrollPanel>
    </Focusable>
  );
}

export default definePlugin(() => {
  // Start polling + register touch menu at plugin-load time (not when QAM
  // panel opens). This ensures the in-game touch menu works even if the
  // user never opens the Quick Access Menu, and live data stays fresh.
  refreshStatic();
  startPolling();
  registerTouchMenu();

  return {
    name: "Pokémon Essentials Overlay",
    titleView: (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          paddingLeft: "4px",
        }}
      >
        <PokeballIcon size={18} />
        <span>Pokémon Essentials Overlay</span>
      </div>
    ),
    content: (
      <ErrorBoundary>
        <PluginContent />
      </ErrorBoundary>
    ),
    icon: <PokeballIcon />,
    onDismount() {
      unregisterTouchMenu();
      stopPolling();
      console.log("[pokemon-overlay] dismounted");
    },
  };
});
