import { useSyncExternalStore } from "react";
import {
  api,
  MovesDatabase,
  PluginInfo,
  PluginSettings,
  SaveData,
  Theme,
  TypeChartData,
} from "./api";

export interface StoreState {
  info: PluginInfo | null;
  typeChart: TypeChartData | null;
  saveData: SaveData | null;
  settings: PluginSettings | null;
  movesDatabase: MovesDatabase | null;
  theme: Theme | null;
}

const initialState: StoreState = {
  info: null,
  typeChart: null,
  saveData: null,
  settings: null,
  movesDatabase: null,
  theme: null,
};

let state: StoreState = initialState;
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentIntervalSeconds = 0;

function notify() {
  for (const l of listeners) l();
}

function setState(next: StoreState) {
  state = next;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return initialState;
}

export function useStore<T>(selector: (s: StoreState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getServerSnapshot())
  );
}

export async function refreshStatic() {
  try {
    const [info, typeChart, settings, movesDatabase, themes] = await Promise.all([
      api.getPluginInfo(),
      api.getTypeChart(),
      api.getSettings(),
      api.getMovesDatabase(),
      api.getThemes(),
    ]);
    setState({
      ...state,
      info,
      typeChart,
      settings,
      movesDatabase,
      theme: themes.active,
    });
  } catch (e) {
    console.error("[store] refreshStatic failed", e);
  }
}

export async function refreshTheme() {
  try {
    const themes = await api.getThemes();
    setState({ ...state, theme: themes.active });
  } catch (e) {
    console.error("[store] refreshTheme failed", e);
  }
}

export async function refreshSave(force = true) {
  try {
    const saveData = await api.getSaveData(force);
    setState({ ...state, saveData });
  } catch (e) {
    console.error("[store] refreshSave failed", e);
  }
}

export async function refreshMoves() {
  try {
    const movesDatabase = await api.getMovesDatabase();
    setState({ ...state, movesDatabase });
  } catch (e) {
    console.error("[store] refreshMoves failed", e);
  }
}

export async function applySettingsPatch(patch: Partial<PluginSettings>) {
  try {
    const settings = await api.updateSettings(patch);
    setState({ ...state, settings });
    if ("theme" in patch) {
      await refreshTheme();
    }
    return settings;
  } catch (e) {
    console.error("[store] applySettingsPatch failed", e);
    throw e;
  }
}

export function startPolling(intervalSeconds: number) {
  stopPolling();
  const safeInterval = Math.max(5, intervalSeconds);
  if (safeInterval === currentIntervalSeconds) return;
  currentIntervalSeconds = safeInterval;
  refreshSave(true);
  pollTimer = setInterval(() => {
    refreshSave(true);
  }, safeInterval * 1000);
  console.log(`[store] polling started, every ${safeInterval}s`);
}

export function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
    currentIntervalSeconds = 0;
    console.log("[store] polling stopped");
  }
}

export function getState(): StoreState {
  return state;
}
