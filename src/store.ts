import { useSyncExternalStore, useRef, useCallback } from "react";
import {
  api,
  LiveState,
  MovesDatabase,
  PluginInfo,
  PluginSettings,
  SaveData,
  Theme,
  TypeChartData,
  PokemonSummary,
} from "./api";

export interface StoreState {
  info: PluginInfo | null;
  typeChart: TypeChartData | null;
  saveData: SaveData | null;
  settings: PluginSettings | null;
  movesDatabase: MovesDatabase | null;
  theme: Theme | null;
  liveState: LiveState | null;
}

const initialState: StoreState = {
  info: null,
  typeChart: null,
  saveData: null,
  settings: null,
  movesDatabase: null,
  theme: null,
  liveState: null,
};

let state: StoreState = initialState;
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollGeneration = 0;
// Set while a forced (explicit) save refresh is in flight. Poll ticks skip
// their saveData write during that window so a stale backend-cache response
// that resolves late can't clobber the fresh parse.
let saveRefreshInFlight = false;

function notify() {
  for (const l of listeners) l();
}

/**
 * Functional state updater that always reads the *current* module-level
 * state before merging, preventing stale-closure race conditions when
 * multiple async operations resolve concurrently.
 */
function updateState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  notify();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStore<T>(
  selector: (s: StoreState) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const eqRef = useRef(equalityFn);
  eqRef.current = equalityFn;

  const cache = useRef<{ state: StoreState; selection: T; selector: (s: StoreState) => T } | null>(null);

  const getSelection = useCallback(() => {
    const currentState = getState();
    const currentSelector = selectorRef.current;

    // If the state hasn't changed and the selector function hasn't changed, return the cached selection.
    if (cache.current && cache.current.state === currentState && cache.current.selector === currentSelector) {
      return cache.current.selection;
    }

    const newSelection = currentSelector(currentState);

    // If the state changed but the selected value is identical (or custom equality passes),
    // update the cached state but return the old selection reference 
    // so React bails out of re-rendering.
    const isEq = cache.current && (eqRef.current 
      ? eqRef.current(cache.current.selection, newSelection)
      : Object.is(cache.current.selection, newSelection));

    if (cache.current && isEq) {
      cache.current.state = currentState;
      cache.current.selector = currentSelector;
      return cache.current.selection;
    }

    cache.current = { state: currentState, selection: newSelection, selector: currentSelector };
    return newSelection;
  }, []);

  const getServerSelection = useCallback(() => {
    return selectorRef.current(initialState);
  }, []);

  return useSyncExternalStore(subscribe, getSelection, getServerSelection);
}

export async function refreshStatic() {
  // Retry up to 3 times with exponential backoff. The Decky Loader's plugin
  // reload cycle can transiently make the backend unreachable right when
  // the frontend mounts — a single try then permanently shows "Loading..."
  // for the user. Retries make the plugin robust against that boot-loop.
  const maxAttempts = 3;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const [info, typeChart, settings, movesDatabase, themes] = await Promise.all([
        api.getPluginInfo(),
        api.getTypeChart(),
        api.getSettings(),
        api.getMovesDatabase(),
        api.getThemes(),
      ]);
      updateState({
        info,
        typeChart,
        settings,
        movesDatabase,
        theme: themes.active,
      });
      return;
    } catch (e) {
      lastError = e;
      console.warn(
        `[store] refreshStatic attempt ${attempt}/${maxAttempts} failed:`,
        e
      );
      if (attempt < maxAttempts) {
        // Exponential backoff: 500ms, 1500ms
        const delay = 500 * Math.pow(3, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  console.error("[store] refreshStatic failed after all retries:", lastError);
}

// Public alias — used by views that want to manually retry after the
// initial load failed. Same logic, callable on demand.
export async function retryRefreshStatic() {
  await refreshStatic();
}

export async function refreshTheme() {
  try {
    const themes = await api.getThemes();
    updateState({ theme: themes.active });
  } catch (e) {
    console.error("[store] refreshTheme failed", e);
  }
}

export async function refreshSave(force = false) {
  saveRefreshInFlight = true;
  try {
    const saveData = await api.getSaveData(force);
    updateState({ saveData });
  } catch (e) {
    console.error("[store] refreshSave failed", e);
  } finally {
    saveRefreshInFlight = false;
  }
}

export async function refreshMoves() {
  try {
    const movesDatabase = await api.getMovesDatabase();
    updateState({ movesDatabase });
  } catch (e) {
    console.error("[store] refreshMoves failed", e);
  }
}

export async function refreshLiveState(
  expectedGen?: number
): Promise<LiveState | null> {
  try {
    const liveState = await api.getLiveState();
    // Guard used by startPolling: a late answer from a previous
    // start/stop cycle must not clobber the new cycle's data.
    if (expectedGen !== undefined && pollGeneration !== expectedGen) return null;
    updateState({ liveState });
    return liveState;
  } catch (e) {
    console.error("[store] refreshLiveState failed", e);
    return null;
  }
}

export async function applySettingsPatch(patch: Partial<PluginSettings>) {
  try {
    const settings = await api.updateSettings(patch);
    updateState({ settings });
    if ("theme" in patch) {
      await refreshTheme();
    }
    return settings;
  } catch (e) {
    console.error("[store] applySettingsPatch failed", e);
    throw e;
  }
}

export function startPolling() {
  stopPolling();
  pollGeneration++;
  const currentGen = pollGeneration;
  // Backend SaveFileWatcher (mtime poll) fires within ~0.3s of any save, so
  // a fast 1.5s frontend poll is the right cadence while the game is
  // actively playing. If we haven't seen a live event in a while, back off
  // to save battery on the Steam Deck.
  const fastMs = 1500;
  const slowMs = 5000;
  const maxBackoffMs = 60000;

  // Initial fetch — capture the generation so stale answers from a
  // previous start/stop cycle can't clobber newer tick data.
  refreshLiveState(currentGen);
  api.getLiveSaveData().then((saveData) => {
    if (pollGeneration !== currentGen) return;
    if (saveData && !saveRefreshInFlight) updateState({ saveData });
  }).catch(() => {});
  
  let consecutiveIdle = 0;
  let errorCount = 0;
  
  const tick = async () => {
    if (pollGeneration !== currentGen) return;
    try {
      const [saveData, live] = await Promise.all([
        api.getLiveSaveData(),
        api.getLiveState(),
      ]);
      if (pollGeneration !== currentGen) return;
      
      if (saveData && !saveRefreshInFlight) updateState({ saveData });
      if (live) updateState({ liveState: live });
      
      errorCount = 0;
      
      const lastAt = live?.last_live_event?.at ?? 0;
      const now = Date.now() / 1000;
      const sinceLast = now - lastAt;
      
      // If no game is running, drop to a very slow polling rate (30s) to save battery.
      if (!live?.game_running) {
        consecutiveIdle = 99; // force slow poll
      } else if (lastAt > 0 && sinceLast < 10) {
        consecutiveIdle = 0;
      } else {
        consecutiveIdle += 1;
      }
      
      const next = !live?.game_running ? 30000 : (consecutiveIdle > 4 ? slowMs : fastMs);
      pollTimer = setTimeout(tick, next);
    } catch (e) {
      console.error("[store] polling tick failed", e);
      if (pollGeneration !== currentGen) return;
      errorCount++;
      const backoff = Math.min(maxBackoffMs, fastMs * Math.pow(2, errorCount));
      console.log(`[store] backoff applied, next poll in ${backoff}ms`);
      pollTimer = setTimeout(tick, backoff);
    }
  };
  pollTimer = setTimeout(tick, fastMs);
  console.log(`[store] live frontend polling started`);
}

export function stopPolling() {
  pollGeneration++;
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
    console.log("[store] polling stopped");
  }
}

export function getState(): StoreState {
  return state;
}

/**
 * Cheap equality function for SaveData — compares only the fields that
 * uniquely identify a save state. Avoids JSON.stringify on every poll.
 */
export function saveDataEqual(a: SaveData | null, b: SaveData | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.parsed_at === b.parsed_at &&
    a.source_path === b.source_path &&
    a.party_count === b.party_count &&
    a.trainer_name === b.trainer_name &&
    a.error === b.error &&
    a.money === b.money &&
    partyEqual(a.party, b.party)
  );
}

/**
 * Cheap equality for the party array — compares by length + each member's
 * hp + status + species (the fields that change in-battle).
 */
export function partyEqual(a: PokemonSummary[] | undefined, b: PokemonSummary[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.hp !== y.hp || x.status !== y.status || x.species !== y.species || x.level !== y.level) {
      return false;
    }
  }
  return true;
}
