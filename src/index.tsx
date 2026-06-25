import { definePlugin } from "@decky/api";
import { Focusable, PanelSection, ScrollPanel } from "@decky/ui";
import { CSSProperties, useEffect, useMemo, useState } from "react";
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

type TabId = "status" | "typechart" | "party" | "settings";

const TABS: TabDef[] = [
  { id: "status", label: "Status" },
  { id: "typechart", label: "Type Chart" },
  { id: "party", label: "Party" },
  { id: "settings", label: "Settings" },
];

function PluginContent() {
  const [active, setActive] = useState<TabId>("status");
  const settings = useStore((s) => s.settings);
  const theme = useStore((s) => s.theme);
  const interval = settings?.scan_interval_seconds ?? 30;

  useEffect(() => {
    refreshStatic();
  }, []);

  useEffect(() => {
    startPolling(interval);
    return () => stopPolling();
  }, [interval]);

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
      <ScrollPanel focusable={false} style={{ flex: 1, maxHeight: "100%" }}>
        <PanelSection>
          {active === "status" && <HomeView />}
          {active === "typechart" && <TypeChartView />}
          {active === "party" && <PartyView />}
          {active === "settings" && <SettingsView />}
        </PanelSection>
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
    content: <PluginContent />,
    icon: <PokeballIcon />,
    onDismount() {
      unregisterTouchMenu();
      stopPolling();
      console.log("[pokemon-overlay] dismounted");
    },
  };
});
