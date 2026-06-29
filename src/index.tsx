import { definePlugin, toaster } from "@decky/api";
import { Focusable, ScrollPanel, PanelSection, PanelSectionRow } from "@decky/ui";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PokeballIcon } from "./components/PokeballIcon";
import { TabBar, TabDef } from "./components/TabBar";
import {
  subscribe,
  getState,
  refreshStatic,
  startPolling,
  stopPolling,
  useStore,
} from "./store";

let lastEnemyName: string | undefined = undefined;
let lastCoach: string | undefined = undefined;
let lastBoostWarned = false;
let unsubscribeToasts: (() => void) | null = null;

function initGlobalToasts() {
  unsubscribeToasts = subscribe(() => {
    const s = getState();
    const inBattle = !!s.liveState?.battle_analysis;
    const enemyName = s.liveState?.battle_analysis?.enemy?.name;
    const coachSuggestion = s.liveState?.battle_analysis?.coach_suggestion?.suggested_pokemon;
    const stages = s.liveState?.battle_analysis?.enemy?.stages;
    const enemyHasBoosts = !!stages && stages.some((v: number) => v > 0);

    // 1. Battle Start / Enemy Switch
    if (inBattle && enemyName && enemyName !== lastEnemyName) {
      const types = s.liveState?.battle_analysis?.enemy?.types;
      const typeStr = types?.join("/") || "Unknown";
      toaster.toast({ title: "Battle Update", body: `Enemy sent out ${enemyName} (Type: ${typeStr})` });
    }
    lastEnemyName = enemyName;

    // 2. Coach Suggestion
    if (inBattle && coachSuggestion && coachSuggestion !== lastCoach) {
      const reason = s.liveState?.battle_analysis?.coach_suggestion?.reason || "";
      toaster.toast({ title: "Coach Suggestion", body: `Switch to ${coachSuggestion}! ${reason}` });
    }
    lastCoach = coachSuggestion;

    // 3. Stat Warning
    if (inBattle && enemyHasBoosts && !lastBoostWarned) {
      toaster.toast({ title: "Stat Warning", body: "Enemy stats are boosted! Be careful!" });
      lastBoostWarned = true;
    } else if (!enemyHasBoosts) {
      lastBoostWarned = false;
    }
  });
}
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
  initGlobalToasts();

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
      if (unsubscribeToasts) unsubscribeToasts();
      console.log("[pokemon-overlay] dismounted");
    },
  };
});
