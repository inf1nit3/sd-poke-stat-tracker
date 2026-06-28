import { definePlugin, toaster } from "@decky/api";
import { Focusable, ScrollPanel, PanelSection, PanelSectionRow } from "@decky/ui";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PokeballIcon } from "./components/PokeballIcon";
import { TabBar, TabDef } from "./components/TabBar";
import {
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
  const derivedLiveState = useStore((s) => {
    const ls = s.liveState;
    return {
      inBattle: !!(ls?.battle_analysis && (ls.in_menu === false || ls.screen_state === "battle_active")),
      showRestartBanner: ls?.mod_needs_restart === true && ls?.live_source !== "stream",
    };
  }, (a, b) => a.inBattle === b.inBattle && a.showRestartBanner === b.showRestartBanner);

  const { inBattle, showRestartBanner } = derivedLiveState;

  // --- Advanced Toasts ---
  const enemyData = useStore((s) => s.liveState?.battle_analysis?.enemy, (a, b) => a?.name === b?.name);
  const coachSuggestion = useStore((s) => s.liveState?.battle_analysis?.coach_suggestion, (a, b) => a?.suggested_pokemon === b?.suggested_pokemon);
  const enemyStages = useStore((s) => s.liveState?.battle_analysis?.enemy?.stages, (a, b) => JSON.stringify(a) === JSON.stringify(b));

  // 1. Battle Start / Enemy Switch
  useEffect(() => {
    if (inBattle && enemyData?.name) {
      const typeStr = enemyData.types?.join("/") || "Unknown";
      toaster.toast({ title: "Battle Update", body: `Enemy sent out ${enemyData.name} (Type: ${typeStr})` });
    }
  }, [enemyData?.name, inBattle]);

  // 2. Coach Suggestion
  useEffect(() => {
    if (inBattle && coachSuggestion?.suggested_pokemon) {
      toaster.toast({ title: "💡 Coach Suggestion", body: `Switch to ${coachSuggestion.suggested_pokemon}! ${coachSuggestion.reason}` });
    }
  }, [coachSuggestion?.suggested_pokemon, inBattle]);

  // 3. Stat Warning
  useEffect(() => {
    if (inBattle && enemyStages) {
      const hasBoosts = enemyStages.some((s: number) => s > 0);
      if (hasBoosts) {
        toaster.toast({ title: "⚠️ Stat Warning", body: "Enemy stats are boosted! Be careful!" });
      }
    }
  }, [enemyStages, inBattle]);
  // -----------------------

  useEffect(() => {
    refreshStatic();
  }, []);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, []);

  useEffect(() => {
    registerTouchMenu();
    return () => unregisterTouchMenu();
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
                  backgroundColor: "#e05858", // Red-ish for alert
                  color: "#fff",
                  padding: "12px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  lineHeight: "1.4",
                  fontWeight: "bold",
                  marginBottom: "8px"
                }}
              >
                Der Live-Tracker Mod wurde gerade automatisch installiert! Bitte starte dein Pokémon-Spiel einmal neu, um den Battle Analyzer zu aktivieren.
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
