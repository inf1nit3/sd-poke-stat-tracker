// node_modules/.pnpm/@decky+api@1.1.3/node_modules/@decky/api/dist/index.js
const _manifest = {name: 'SD Poké Stat Tracker'};
var manifest = _manifest;
var API_VERSION = 2;
if (!manifest?.name) {
  throw new Error("[@decky/api]: Failed to find plugin manifest.");
}
var internalAPIConnection = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
if (!internalAPIConnection) {
  throw new Error("[@decky/api]: Failed to connect to the loader as as the loader API was not initialized. This is likely a bug in Decky Loader.");
}
var api;
try {
  api = internalAPIConnection.connect(API_VERSION, manifest.name);
} catch {
  api = internalAPIConnection.connect(1, manifest.name);
  console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version 1. Some features may not work.`);
}
if (api._version != API_VERSION) {
  console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version ${api._version}. Some features may not work.`);
}
var call = api.call;
var callable = api.callable;
var addEventListener = api.addEventListener;
var removeEventListener = api.removeEventListener;
var routerHook = api.routerHook;
var toaster = api.toaster;
var openFilePicker = api.openFilePicker;
var executeInTab = api.executeInTab;
var injectCssIntoTab = api.injectCssIntoTab;
var removeCssFromTab = api.removeCssFromTab;
var fetchNoCors = api.fetchNoCors;
var getExternalResourceURL = api.getExternalResourceURL;
var useQuickAccessVisible = api.useQuickAccessVisible;
var definePlugin = (fn) => {
  return (...args) => {
    return fn(...args);
  };
};

// src/index.tsx
const {Focusable as Focusable6, ScrollPanel, PanelSection as PanelSection7, PanelSectionRow as PanelSectionRow7 } = window.DFL;
const {useEffect as useEffect5, useMemo as useMemo3, useState as useState7 } = window.SP_REACT;

// src/components/ErrorBoundary.tsx
const {ButtonItem, PanelSection, PanelSectionRow } = window.DFL;
const {Component } = window.SP_REACT;

// src/store.ts
const {useSyncExternalStore, useRef, useCallback } = window.SP_REACT;

// src/api.ts
async function callOrThrow(method, ...args) {
  try {
    return await call(method, ...args);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`[${method}] ${reason}`);
  }
}
var api2 = {
  getPluginInfo: () => callOrThrow("get_plugin_info"),
  getSettings: () => callOrThrow("get_settings"),
  updateSettings: (patch) => callOrThrow("update_settings", patch),
  getTypeChart: () => callOrThrow("get_type_chart"),
  getMatchup: (attacker, defenderTypes) => callOrThrow("get_matchup", attacker, defenderTypes),
  getDefenseSummary: (defenderTypes) => callOrThrow("get_defense_summary", defenderTypes),
  getOffenseSummary: (attacker) => callOrThrow("get_offense_summary", attacker),
  findSavePath: () => callOrThrow("find_save_path"),
  listSaveFiles: () => callOrThrow("list_save_files"),
  getSaveData: (forceReload = false) => callOrThrow("get_save_data", forceReload),
  getSaveDataFromPath: (path) => callOrThrow("get_save_data_from_path", path),
  getMovesDatabase: () => callOrThrow("get_moves_database"),
  getMoveInfo: (name) => callOrThrow("get_move_info", name),
  lookupMoves: (names) => callOrThrow("lookup_moves", names),
  findPbsFiles: (savePath) => callOrThrow("find_pbs_files", savePath ?? null),
  loadPbsMoves: (path) => callOrThrow("load_pbs_moves", path),
  autoLoadPbs: () => callOrThrow("auto_load_pbs"),
  clearPbs: () => callOrThrow("clear_pbs"),
  getThemes: () => callOrThrow("get_themes"),
  getActiveTheme: () => callOrThrow("get_active_theme"),
  getLiveState: () => callOrThrow("get_live_state"),
  getLiveSaveData: () => callOrThrow("get_live_save_data"),
  setWatcherEnabled: (enabled) => callOrThrow("set_watcher_enabled", enabled),
  findProcessBySave: (savePath) => callOrThrow("find_process_by_save", savePath),
  getProcessMemoryRegions: (pid) => callOrThrow("get_process_memory_regions", pid)
};

// src/store.ts
var initialState = {
  info: null,
  typeChart: null,
  saveData: null,
  settings: null,
  movesDatabase: null,
  theme: null,
  liveState: null
};
var state = initialState;
var listeners = /* @__PURE__ */ new Set();
var pollTimer = null;
var pollGeneration = 0;
function notify() {
  for (const l of listeners) l();
}
function updateState(patch) {
  state = { ...state, ...patch };
  notify();
}
function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function useStore(selector, equalityFn) {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const eqRef = useRef(equalityFn);
  eqRef.current = equalityFn;
  const cache = useRef(null);
  const getSelection = useCallback(() => {
    const currentState = getState();
    const currentSelector = selectorRef.current;
    if (cache.current && cache.current.state === currentState && cache.current.selector === currentSelector) {
      return cache.current.selection;
    }
    const newSelection = currentSelector(currentState);
    const isEq = cache.current && (eqRef.current ? eqRef.current(cache.current.selection, newSelection) : Object.is(cache.current.selection, newSelection));
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
async function refreshStatic() {
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const [info, typeChart, settings, movesDatabase, themes] = await Promise.all([
        api2.getPluginInfo(),
        api2.getTypeChart(),
        api2.getSettings(),
        api2.getMovesDatabase(),
        api2.getThemes()
      ]);
      updateState({
        info,
        typeChart,
        settings,
        movesDatabase,
        theme: themes.active
      });
      return;
    } catch (e) {
      lastError = e;
      console.warn(
        `[store] refreshStatic attempt ${attempt}/${maxAttempts} failed:`,
        e
      );
      if (attempt < maxAttempts) {
        const delay = 500 * Math.pow(3, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  console.error("[store] refreshStatic failed after all retries:", lastError);
}
async function retryRefreshStatic() {
  await refreshStatic();
}
async function refreshTheme() {
  try {
    const themes = await api2.getThemes();
    updateState({ theme: themes.active });
  } catch (e) {
    console.error("[store] refreshTheme failed", e);
  }
}
async function refreshSave(force = false) {
  try {
    const saveData = await api2.getSaveData(force);
    updateState({ saveData });
  } catch (e) {
    console.error("[store] refreshSave failed", e);
  }
}
async function refreshMoves() {
  try {
    const movesDatabase = await api2.getMovesDatabase();
    updateState({ movesDatabase });
  } catch (e) {
    console.error("[store] refreshMoves failed", e);
  }
}
async function refreshLiveState() {
  try {
    const liveState = await api2.getLiveState();
    updateState({ liveState });
    return liveState;
  } catch (e) {
    console.error("[store] refreshLiveState failed", e);
    return null;
  }
}
async function applySettingsPatch(patch) {
  try {
    const settings = await api2.updateSettings(patch);
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
function startPolling() {
  stopPolling();
  pollGeneration++;
  const currentGen = pollGeneration;
  const fastMs = 1500;
  const slowMs = 5e3;
  const maxBackoffMs = 6e4;
  api2.getLiveSaveData().then((saveData) => {
    if (saveData) updateState({ saveData });
  }).catch(() => {
  });
  refreshLiveState();
  let consecutiveIdle = 0;
  let errorCount = 0;
  const tick = async () => {
    if (pollGeneration !== currentGen) return;
    try {
      const [saveData, live] = await Promise.all([
        api2.getLiveSaveData(),
        api2.getLiveState()
      ]);
      if (pollGeneration !== currentGen) return;
      if (saveData) updateState({ saveData });
      if (live) updateState({ liveState: live });
      errorCount = 0;
      const lastAt = live?.last_live_event?.at ?? 0;
      const now = Date.now() / 1e3;
      const sinceLast = now - lastAt;
      if (!live?.game_running) {
        consecutiveIdle = 99;
      } else if (lastAt > 0 && sinceLast < 10) {
        consecutiveIdle = 0;
      } else {
        consecutiveIdle += 1;
      }
      const next = !live?.game_running ? 3e4 : consecutiveIdle > 4 ? slowMs : fastMs;
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
function stopPolling() {
  pollGeneration++;
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
    console.log("[store] polling stopped");
  }
}
function getState() {
  return state;
}
function saveDataEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.parsed_at === b.parsed_at && a.source_path === b.source_path && a.party_count === b.party_count && a.trainer_name === b.trainer_name && a.error === b.error && a.money === b.money && partyEqual(a.party, b.party);
}
function partyEqual(a, b) {
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

// src/components/ErrorBoundary.tsx
const {jsx, jsxs } = window.SP_JSX;
var ErrorBoundary = class extends Component {
  constructor() {
    super(...arguments);
    this.state = { hasError: false, error: null };
    this.handleReload = () => {
      this.setState({ hasError: false, error: null });
      retryRefreshStatic();
    };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] view crashed:", error, info.componentStack);
  }
  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }
    const message = this.state.error.message || String(this.state.error);
    const stack = this.state.error.stack ?? "";
    return /* @__PURE__ */ jsxs(PanelSection, { title: "Something went wrong", children: [
      /* @__PURE__ */ jsx(PanelSectionRow, { children: /* @__PURE__ */ jsx("div", { style: { color: "#e87b7b", fontSize: 13, lineHeight: 1.4 }, children: message }) }),
      /* @__PURE__ */ jsx(PanelSectionRow, { children: /* @__PURE__ */ jsx(ButtonItem, { layout: "below", onClick: this.handleReload, children: "Reload" }) }),
      /* @__PURE__ */ jsx(PanelSectionRow, { children: /* @__PURE__ */ jsxs("details", { style: { fontSize: 11, color: "#888" }, children: [
        /* @__PURE__ */ jsx("summary", { style: { cursor: "pointer", color: "#aaa" }, children: "Stack trace" }),
        /* @__PURE__ */ jsx(
          "pre",
          {
            style: {
              marginTop: 6,
              padding: 8,
              background: "rgba(0,0,0,0.3)",
              borderRadius: 4,
              fontSize: 10,
              color: "#ccc",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 240,
              overflow: "auto"
            },
            children: stack
          }
        )
      ] }) })
    ] });
  }
};

// src/components/PokeballIcon.tsx
const {jsx as jsx2, jsxs as jsxs2 } = window.SP_JSX;
function PokeballIcon({ size = 18, style }) {
  return /* @__PURE__ */ jsxs2(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      style,
      xmlns: "http://www.w3.org/2000/svg",
      "aria-label": "Pokeball",
      children: [
        /* @__PURE__ */ jsx2("circle", { cx: "12", cy: "12", r: "11", fill: "#fff", stroke: "#222", strokeWidth: "1.5" }),
        /* @__PURE__ */ jsx2(
          "path",
          {
            d: "M 1 12 A 11 11 0 0 1 23 12 Z",
            fill: "#dc2626",
            stroke: "#222",
            strokeWidth: "1.5"
          }
        ),
        /* @__PURE__ */ jsx2("line", { x1: "1", y1: "12", x2: "23", y2: "12", stroke: "#222", strokeWidth: "1.5" }),
        /* @__PURE__ */ jsx2("circle", { cx: "12", cy: "12", r: "4", fill: "#fff", stroke: "#222", strokeWidth: "1.5" }),
        /* @__PURE__ */ jsx2("circle", { cx: "12", cy: "12", r: "1.5", fill: "#222" })
      ]
    }
  );
}

// src/components/TabBar.tsx
const {Focusable } = window.DFL;
const {jsx as jsx3 } = window.SP_JSX;
function TabBar({ tabs, activeId, onChange }) {
  return /* @__PURE__ */ jsx3(
    Focusable,
    {
      focusWithinClassName: "gp-tabs-active",
      style: {
        display: "flex",
        flexDirection: "row",
        gap: "4px",
        padding: "8px 0 6px 0",
        borderBottom: "1px solid #2a2a2a",
        marginBottom: "4px"
      },
      children: tabs.map((tab) => {
        const active = tab.id === activeId;
        return /* @__PURE__ */ jsx3(
          Focusable,
          {
            onOKActionDescription: tab.label,
            onOKButton: () => !tab.disabled && onChange(tab.id),
            style: {
              padding: "6px 10px",
              background: active ? "rgba(255,255,255,0.08)" : "transparent",
              color: tab.disabled ? "#555" : active ? "#fff" : "#969696",
              borderRadius: "4px",
              cursor: tab.disabled ? "not-allowed" : "pointer",
              fontSize: "12px",
              fontWeight: active ? 600 : 500,
              borderBottom: active ? "2px solid #5eba7d" : "2px solid transparent",
              transition: "color 120ms, background 120ms",
              outline: "none"
            },
            children: tab.label
          },
          tab.id
        );
      })
    }
  );
}

// src/theme.ts
var DEFAULT_PALETTE = {
  bg: "#0e0e0e",
  bgSecondary: "rgba(255,255,255,0.04)",
  bgTertiary: "rgba(255,255,255,0.02)",
  border: "rgba(255,255,255,0.08)",
  text: "#fff",
  textSecondary: "#ccc",
  textMuted: "#888",
  textFaint: "#555",
  accent: "#5eba7d",
  accentBg: "rgba(94,186,125,0.15)",
  shiny: "#f7d02c",
  female: "#e87ba3",
  male: "#7ba3e8",
  genderless: "#888",
  hpGood: "#5eba7d",
  hpWarn: "#e0a458",
  hpBad: "#e87b7b",
  statusOK: "#5eba7d",
  statusPSN: "#a33ea1",
  statusPAR: "#e0a458",
  statusBRN: "#c22e28",
  statusSLP: "#969696",
  statusFRZ: "#96d9d6",
  statusFNT: "#888",
  typeBadgeText: "#fff",
  badgeShadow: "0 1px 2px rgba(0,0,0,0.5)"
};
function paletteToCssVars(p) {
  const map = {};
  for (const [k, v] of Object.entries(p)) {
    const varName = "--theme-" + k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    map[varName] = String(v);
  }
  return map;
}

// src/touchmenu/index.tsx
const DeckyUI = window.DFL;

// src/touchmenu/TouchMenuContent.tsx
const {useState as useState3 } = window.SP_REACT;

// src/touchmenu/MoveLookupTouchMenu.tsx
const {useEffect, useMemo, useState } = window.SP_REACT;

// src/components/TypeBadge.tsx
const {jsx as jsx4 } = window.SP_JSX;
var TYPE_COLORS = {
  Normal: "#A8A77A",
  Fire: "#EE8130",
  Water: "#6390F0",
  Electric: "#F7D02C",
  Grass: "#7AC74C",
  Ice: "#96D9D6",
  Fighting: "#C22E28",
  Poison: "#A33EA1",
  Ground: "#E2BF65",
  Flying: "#A98FF3",
  Psychic: "#F95587",
  Bug: "#A6B91A",
  Rock: "#B6A136",
  Ghost: "#735797",
  Dragon: "#6F35FC",
  Dark: "#705746",
  Steel: "#B7B7CE",
  Fairy: "#D685AD"
};
var SIZES = {
  sm: { padding: "2px 6px", fontSize: "10px" },
  md: { padding: "3px 8px", fontSize: "12px" },
  lg: { padding: "4px 12px", fontSize: "13px" }
};
function TypeBadge({ type, size = "md", style, dimmed = false }) {
  const color = TYPE_COLORS[type] ?? "#777";
  return /* @__PURE__ */ jsx4(
    "span",
    {
      style: {
        display: "inline-block",
        background: color,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        borderRadius: "4px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.4px",
        whiteSpace: "nowrap",
        opacity: dimmed ? 0.45 : 1,
        ...SIZES[size],
        ...style
      },
      children: type
    }
  );
}

// src/utils/normalize.ts
function normalizeKey(name) {
  return (name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// src/touchmenu/MoveLookupTouchMenu.tsx
const {Fragment, jsx as jsx5, jsxs as jsxs3 } = window.SP_JSX;
var BUCKETS = [
  {
    key: "super_effective",
    label: "Super effective (2\xD7)",
    color: "#ff8a3d"
  },
  {
    key: "not_very_effective",
    label: "Not very effective (\xBD\xD7)",
    color: "#5eba7d"
  },
  {
    key: "no_effect",
    label: "No effect (0\xD7)",
    color: "#888"
  }
];
function MoveLookupTouchMenu() {
  const saveData = useStore((s) => s.saveData);
  const movesDb = useStore((s) => s.movesDatabase);
  const [selectedMove, setSelectedMove] = useState(null);
  const [moveInfo, setMoveInfo] = useState(null);
  const [offense, setOffense] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!selectedMove) {
      setMoveInfo(null);
      setOffense(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setOffense(null);
    api2.getMoveInfo(selectedMove).then((info) => {
      if (cancelled) return;
      setMoveInfo(info);
      if (info && info.type) {
        return api2.getOffenseSummary(info.type).then((off) => {
          if (!cancelled) setOffense(off);
        });
      }
      return null;
    }).catch((e) => console.error("[move-lookup]", e)).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedMove]);
  if (!saveData || saveData.error) {
    return /* @__PURE__ */ jsx5(
      "div",
      {
        style: {
          padding: 24,
          textAlign: "center",
          color: "#888",
          fontSize: 13
        },
        children: "Load a save first to see party moves."
      }
    );
  }
  const party = saveData.party || [];
  const partyMoves = useMemo(
    () => {
      const out = [];
      for (const p of party) {
        for (const m of p.moves) {
          if (m) out.push({ move: m, owner: p.nickname || p.species });
        }
      }
      return out;
    },
    [party]
  );
  return /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsxs3(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          paddingBottom: 4,
          borderBottom: "1px solid #2a2a2a"
        },
        children: [
          /* @__PURE__ */ jsx5("span", { style: { fontSize: 11, color: "#888", fontWeight: 600 }, children: "PARTY MOVES:" }),
          partyMoves.map((pm, i) => {
            const info = movesDb?.moves?.[normalizeKey(pm.move)];
            const type = info?.type;
            return /* @__PURE__ */ jsxs3(
              "button",
              {
                onClick: () => setSelectedMove(pm.move),
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  background: selectedMove === pm.move ? "rgba(94,186,125,0.2)" : "rgba(255,255,255,0.05)",
                  color: "#ddd",
                  border: selectedMove === pm.move ? "1px solid #5eba7d" : "1px solid transparent",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 500
                },
                children: [
                  type && /* @__PURE__ */ jsx5(TypeBadge, { type, size: "sm" }),
                  /* @__PURE__ */ jsx5("span", { children: pm.move })
                ]
              },
              `${pm.owner}-${pm.move}-${i}`
            );
          })
        ]
      }
    ),
    !selectedMove && /* @__PURE__ */ jsx5(
      "div",
      {
        style: {
          padding: 20,
          textAlign: "center",
          color: "#888",
          fontSize: 12,
          fontStyle: "italic"
        },
        children: "Tap a move to see its type and effectiveness"
      }
    ),
    selectedMove && loading && /* @__PURE__ */ jsx5("div", { style: { padding: 16, textAlign: "center", color: "#aaa" }, children: "Loading\u2026" }),
    selectedMove && !loading && /* @__PURE__ */ jsx5(MoveDetail, { move: selectedMove, info: moveInfo, offense }),
    movesDb && /* @__PURE__ */ jsxs3(
      "div",
      {
        style: {
          fontSize: 10,
          color: "#555",
          textAlign: "right",
          marginTop: 2
        },
        children: [
          movesDb.merged_count,
          " moves available",
          movesDb.pbs_source && /* @__PURE__ */ jsxs3(Fragment, { children: [
            " ",
            "\xB7 PBS: ",
            movesDb.pbs_source.split("/").slice(-2).join("/")
          ] })
        ]
      }
    )
  ] });
}
function MoveDetail({
  move,
  info,
  offense
}) {
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        background: "rgba(255,255,255,0.04)",
        borderRadius: 6
      },
      children: [
        /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ jsx5(
            "span",
            {
              style: {
                fontSize: 16,
                fontWeight: 600,
                color: "#fff",
                textTransform: "uppercase"
              },
              children: info?.name || move
            }
          ),
          info?.type && /* @__PURE__ */ jsx5(TypeBadge, { type: info.type, size: "md" }),
          /* @__PURE__ */ jsx5("div", { style: { flex: 1 } }),
          info?.source && /* @__PURE__ */ jsxs3(
            "span",
            {
              style: {
                fontSize: 9,
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: 0.5
              },
              children: [
                info.source,
                info.guessed && " (heuristic)"
              ]
            }
          )
        ] }),
        info && /* @__PURE__ */ jsxs3(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              fontSize: 11,
              color: "#ccc"
            },
            children: [
              /* @__PURE__ */ jsx5(Detail, { label: "Category", value: info.category }),
              /* @__PURE__ */ jsx5(Detail, { label: "Power", value: info.power ? String(info.power) : "\u2014" }),
              /* @__PURE__ */ jsx5(Detail, { label: "Accuracy", value: info.accuracy ? `${info.accuracy}%` : "\u2014" })
            ]
          }
        ),
        info?.description && /* @__PURE__ */ jsx5(
          "div",
          {
            style: {
              fontSize: 11,
              color: "#888",
              fontStyle: "italic",
              lineHeight: 1.4
            },
            children: info.description
          }
        ),
        offense?.summary && /* @__PURE__ */ jsx5("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: BUCKETS.map((bucket) => {
          const types = offense.summary?.[bucket.key] ?? [];
          if (types.length === 0) return null;
          return /* @__PURE__ */ jsxs3(
            "div",
            {
              style: {
                padding: "5px 7px",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 4,
                borderLeft: `3px solid ${bucket.color}`
              },
              children: [
                /* @__PURE__ */ jsxs3(
                  "div",
                  {
                    style: {
                      fontSize: 10,
                      fontWeight: 600,
                      color: bucket.color,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      marginBottom: 3
                    },
                    children: [
                      bucket.label,
                      " (",
                      types.length,
                      ")"
                    ]
                  }
                ),
                /* @__PURE__ */ jsx5("div", { style: { display: "flex", flexWrap: "wrap", gap: 3 }, children: types.map((t) => /* @__PURE__ */ jsx5(TypeBadge, { type: t, size: "sm" }, t)) })
              ]
            },
            bucket.key
          );
        }) })
      ]
    }
  );
}
function Detail({ label, value }) {
  return /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [
    /* @__PURE__ */ jsx5(
      "div",
      {
        style: {
          fontSize: 9,
          color: "#777",
          textTransform: "uppercase",
          letterSpacing: 0.4
        },
        children: label
      }
    ),
    /* @__PURE__ */ jsx5("div", { style: { fontSize: 12, color: "#ddd" }, children: value })
  ] });
}

// src/components/HealthBar.tsx
const {jsx as jsx6, jsxs as jsxs4 } = window.SP_JSX;
function colorForPercent(pct) {
  if (pct >= 0.5) return "#5eba7d";
  if (pct >= 0.25) return "#e0a458";
  return "#e87b7b";
}
function statusToBar(statusName) {
  if (!statusName || statusName === "OK") return { color: "" };
  const colors = {
    PSN: "#a33ea1",
    PAR: "#e0a458",
    BRN: "#c22e28",
    SLP: "#969696",
    FRZ: "#96d9d6",
    FNT: "#444"
  };
  return { color: colors[statusName] || "#888" };
}
function HealthBar({
  hp,
  maxHp,
  statusName,
  width = "100%",
  showLabel = true
}) {
  const safeMax = maxHp > 0 ? maxHp : 1;
  const pct = Math.max(0, Math.min(1, hp / safeMax));
  const fillColor = colorForPercent(pct);
  const status = statusToBar(statusName);
  const wrapperStyle = {
    position: "relative",
    width,
    height: 8,
    background: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.1)"
  };
  const fillStyle = {
    width: `${pct * 100}%`,
    height: "100%",
    background: fillColor,
    transition: "width 800ms cubic-bezier(0.25, 1, 0.5, 1), background-color 800ms ease"
  };
  const statusOverlayStyle = status.color ? {
    position: "absolute",
    top: 0,
    left: 0,
    width: `${pct * 100}%`,
    height: "100%",
    background: `repeating-linear-gradient(45deg, ${status.color}, ${status.color} 4px, transparent 4px, transparent 8px)`,
    opacity: 0.7,
    pointerEvents: "none"
  } : void 0;
  if (statusOverlayStyle) {
    statusOverlayStyle.transition = "width 800ms cubic-bezier(0.25, 1, 0.5, 1)";
  }
  return /* @__PURE__ */ jsxs4("div", { style: { display: "flex", alignItems: "center", gap: 6, width: "100%" }, children: [
    /* @__PURE__ */ jsxs4("div", { style: wrapperStyle, children: [
      /* @__PURE__ */ jsx6("div", { style: fillStyle }),
      statusOverlayStyle && /* @__PURE__ */ jsx6("div", { style: statusOverlayStyle })
    ] }),
    showLabel && /* @__PURE__ */ jsxs4(
      "div",
      {
        style: {
          fontSize: 11,
          color: "#bbb",
          minWidth: 56,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums"
        },
        children: [
          hp,
          "/",
          maxHp
        ]
      }
    )
  ] });
}

// src/touchmenu/PartyTouchMenu.tsx
const {Fragment as Fragment2, jsx as jsx7, jsxs as jsxs5 } = window.SP_JSX;
var STATUS_COLORS = {
  OK: "#5eba7d",
  PSN: "#a33ea1",
  PAR: "#e0a458",
  BRN: "#c22e28",
  SLP: "#969696",
  FRZ: "#96d9d6",
  FNT: "#888"
};
var GENDER_SYMBOLS = {
  M: "\u2642",
  F: "\u2640",
  "\u2014": "\u25CB"
};
var MAX_SLOTS = 6;
function PartyTouchMenu() {
  const saveData = useStore((s) => s.saveData, saveDataEqual);
  const movesDb = useStore(
    (s) => s.movesDatabase,
    (a, b) => {
      if (a === b) return true;
      if (!a || !b) return false;
      return a.merged_count === b.merged_count && a.pbs_source === b.pbs_source;
    }
  );
  if (!saveData) {
    return /* @__PURE__ */ jsx7(EmptyState, { children: "Loading save data\u2026" });
  }
  if (saveData.error === "no_save_file_found") {
    return /* @__PURE__ */ jsxs5(EmptyState, { children: [
      "No save file found.",
      /* @__PURE__ */ jsx7("br", {}),
      "Configure a path in ",
      /* @__PURE__ */ jsx7("strong", { children: "Settings" }),
      "."
    ] });
  }
  if (saveData.error === "parse_failed") {
    return /* @__PURE__ */ jsxs5(EmptyState, { children: [
      "Parse error: ",
      saveData.message ?? "unknown"
    ] });
  }
  const party = saveData.party || [];
  const slots = Array.from({ length: MAX_SLOTS }).map((_, i) => party[i] || null);
  const features = saveData.features;
  return /* @__PURE__ */ jsxs5("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
    /* @__PURE__ */ jsx7(
      Header,
      {
        trainer: saveData.trainer_name,
        count: party.length,
        max: MAX_SLOTS,
        money: features?.items ? saveData.money : 0,
        badges: saveData.badges,
        location: saveData.location_name || (saveData.map_id != null ? `Map #${saveData.map_id}` : ""),
        pbsSource: movesDb?.pbs_source ?? null,
        features
      }
    ),
    slots.map(
      (p, i) => p ? /* @__PURE__ */ jsx7(
        PartyRow,
        {
          pokemon: p,
          movesDb,
          features
        },
        `slot-${i}`
      ) : /* @__PURE__ */ jsx7(EmptySlot, { index: i }, `slot-${i}`)
    )
  ] });
}
function Header({
  trainer,
  count,
  max,
  money,
  badges,
  location,
  pbsSource,
  features
}) {
  return /* @__PURE__ */ jsxs5(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "4px 8px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 4,
        fontSize: 12,
        color: "#ccc",
        flexWrap: "wrap"
      },
      children: [
        /* @__PURE__ */ jsx7("span", { style: { fontWeight: 600, color: "#fff" }, children: trainer || "Trainer" }),
        /* @__PURE__ */ jsx7("span", { style: { color: "#666" }, children: "\xB7" }),
        /* @__PURE__ */ jsxs5("span", { children: [
          "Party ",
          count,
          "/",
          max
        ] }),
        features?.items && money > 0 && /* @__PURE__ */ jsxs5(Fragment2, { children: [
          /* @__PURE__ */ jsx7("span", { style: { color: "#666" }, children: "\xB7" }),
          /* @__PURE__ */ jsxs5("span", { children: [
            "\u20BD",
            money.toLocaleString("en-US")
          ] })
        ] }),
        badges > 0 && /* @__PURE__ */ jsxs5(Fragment2, { children: [
          /* @__PURE__ */ jsx7("span", { style: { color: "#666" }, children: "\xB7" }),
          /* @__PURE__ */ jsxs5("span", { style: { color: "#f7d02c" }, children: [
            badges,
            " \u{1F3C6}"
          ] })
        ] }),
        location && /* @__PURE__ */ jsxs5(Fragment2, { children: [
          /* @__PURE__ */ jsx7("span", { style: { color: "#666" }, children: "\xB7" }),
          /* @__PURE__ */ jsx7("span", { style: { color: "#888" }, children: location })
        ] }),
        pbsSource && /* @__PURE__ */ jsx7(
          "span",
          {
            style: {
              marginLeft: "auto",
              fontSize: 9,
              color: "#5eba7d",
              background: "rgba(94,186,125,0.1)",
              padding: "1px 4px",
              borderRadius: 2
            },
            title: pbsSource,
            children: "PBS \u2713"
          }
        )
      ]
    }
  );
}
function PartyRow({
  pokemon: p,
  movesDb,
  features
}) {
  const statusColor = STATUS_COLORS[p.status_name] ?? "#888";
  const showStats = p.has_stats;
  const showGender = p.has_gender_data;
  const showType2 = p.has_type2 && p.type2;
  const showMoves = p.has_moves && p.moves.length > 0;
  return /* @__PURE__ */ jsxs5(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 5,
        borderLeft: `3px solid ${statusColor}`,
        opacity: p.is_fainted ? 0.55 : 1
      },
      children: [
        /* @__PURE__ */ jsxs5(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              minWidth: 24,
              gap: 1
            },
            children: [
              p.shiny && /* @__PURE__ */ jsx7("span", { style: { color: "#f7d02c", fontSize: 11, lineHeight: 1 }, children: "\u2605" }),
              showGender && /* @__PURE__ */ jsx7(
                "span",
                {
                  style: {
                    color: p.gender_name === "F" ? "#e87ba3" : p.gender_name === "M" ? "#7ba3e8" : "#888",
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1
                  },
                  children: GENDER_SYMBOLS[p.gender_name] ?? "?"
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ jsxs5("div", { style: { flex: 1, minWidth: 0 }, children: [
          /* @__PURE__ */ jsxs5(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                marginBottom: 4,
                flexWrap: "wrap"
              },
              children: [
                /* @__PURE__ */ jsx7(
                  "span",
                  {
                    style: {
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 180
                    },
                    children: p.nickname || p.species
                  }
                ),
                /* @__PURE__ */ jsxs5("span", { style: { fontSize: 10, color: "#888" }, children: [
                  "Lv.",
                  p.level
                ] }),
                p.nature && /* @__PURE__ */ jsx7("span", { style: { fontSize: 9, color: "#888" }, children: p.nature }),
                /* @__PURE__ */ jsx7("div", { style: { flex: 1 } }),
                /* @__PURE__ */ jsxs5("div", { style: { display: "flex", gap: 3 }, children: [
                  p.type1 && /* @__PURE__ */ jsx7(TypeBadge, { type: p.type1, size: "sm" }),
                  showType2 && /* @__PURE__ */ jsx7(TypeBadge, { type: p.type2, size: "sm" })
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsx7(
            HealthBar,
            {
              hp: p.hp,
              maxHp: p.max_hp,
              statusName: p.status_name,
              showLabel: false
            }
          ),
          /* @__PURE__ */ jsxs5(
            "div",
            {
              style: {
                display: "flex",
                gap: 8,
                fontSize: 10,
                color: "#888",
                marginTop: 3,
                alignItems: "center",
                flexWrap: "wrap"
              },
              children: [
                /* @__PURE__ */ jsxs5("span", { children: [
                  p.hp,
                  "/",
                  p.max_hp
                ] }),
                /* @__PURE__ */ jsx7("span", { style: { color: statusColor, fontWeight: 600 }, children: p.status_name }),
                p.ability && /* @__PURE__ */ jsxs5("span", { children: [
                  /* @__PURE__ */ jsx7("span", { style: { color: "#666" }, children: "\xB7" }),
                  " ",
                  p.ability
                ] }),
                p.item && /* @__PURE__ */ jsxs5("span", { children: [
                  /* @__PURE__ */ jsx7("span", { style: { color: "#666" }, children: "\xB7" }),
                  " ",
                  p.item
                ] }),
                features?.happiness && p.happiness != null && /* @__PURE__ */ jsxs5("span", { style: { color: "#e87ba3" }, children: [
                  "\u2665",
                  p.happiness
                ] }),
                showStats && p.speed != null && /* @__PURE__ */ jsxs5("span", { style: { color: "#666" }, children: [
                  "SPE:",
                  p.speed
                ] })
              ]
            }
          ),
          showMoves && /* @__PURE__ */ jsx7(
            "div",
            {
              style: {
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                marginTop: 5
              },
              children: p.moves.map((m, i) => {
                const type = movesDb?.moves?.[normalizeKey(m)]?.type;
                return /* @__PURE__ */ jsxs5(
                  "span",
                  {
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "1px 5px",
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: 3,
                      fontSize: 10,
                      color: "#ccc"
                    },
                    children: [
                      type && /* @__PURE__ */ jsx7(TypeBadge, { type, size: "sm" }),
                      m
                    ]
                  },
                  i
                );
              })
            }
          )
        ] })
      ]
    }
  );
}
function EmptySlot({ index }) {
  return /* @__PURE__ */ jsxs5(
    "div",
    {
      style: {
        padding: 8,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 4,
        border: "1px dashed #333",
        textAlign: "center",
        fontSize: 11,
        color: "#555",
        fontStyle: "italic"
      },
      children: [
        "Slot ",
        index + 1,
        " \u2014 empty"
      ]
    }
  );
}
function EmptyState({ children }) {
  return /* @__PURE__ */ jsx7(
    "div",
    {
      style: {
        padding: 24,
        textAlign: "center",
        color: "#888",
        fontSize: 13,
        lineHeight: 1.5
      },
      children
    }
  );
}

// src/touchmenu/TypeLookupTouchMenu.tsx
const {useEffect as useEffect2, useState as useState2 } = window.SP_REACT;
const {jsx as jsx8, jsxs as jsxs6 } = window.SP_JSX;
var BUCKETS2 = [
  {
    key: "super_effective",
    label: "Super effective (2\xD7)",
    color: "#ff8a3d"
  },
  {
    key: "not_very_effective",
    label: "Not very effective (\xBD\xD7)",
    color: "#5eba7d"
  },
  {
    key: "no_effect",
    label: "No effect (0\xD7)",
    color: "#888"
  }
];
function TypeLookupTouchMenu() {
  const typeChart = useStore((s) => s.typeChart);
  const [attacker, setAttacker] = useState2("Fire");
  const [summary, setSummary] = useState2(null);
  const [error, setError] = useState2(null);
  useEffect2(() => {
    if (!attacker) return;
    setSummary(null);
    setError(null);
    api2.getOffenseSummary(attacker).then((s) => {
      if ("error" in s && s.error) {
        setError(s.error);
      } else {
        setSummary(s);
      }
    }).catch((e) => setError(e.message));
  }, [attacker]);
  if (!typeChart) {
    return /* @__PURE__ */ jsx8(
      "div",
      {
        style: {
          padding: 24,
          textAlign: "center",
          color: "#888",
          fontSize: 13
        },
        children: "Loading type chart\u2026"
      }
    );
  }
  return /* @__PURE__ */ jsxs6("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsxs6(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "#aaa"
        },
        children: [
          /* @__PURE__ */ jsx8("span", { children: "Attacker:" }),
          /* @__PURE__ */ jsx8(
            "select",
            {
              value: attacker,
              onChange: (e) => setAttacker(e.target.value),
              style: {
                flex: 1,
                padding: "6px 8px",
                background: "#1a1a1a",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: 4,
                fontSize: 13,
                outline: "none"
              },
              children: typeChart.types.map((t) => /* @__PURE__ */ jsx8("option", { value: t, children: t }, t))
            }
          ),
          /* @__PURE__ */ jsx8(TypeBadge, { type: attacker, size: "md" })
        ]
      }
    ),
    error && /* @__PURE__ */ jsx8("div", { style: { color: "#e87b7b", fontSize: 12, padding: "4px 0" }, children: error }),
    summary?.summary && /* @__PURE__ */ jsxs6("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
      BUCKETS2.map((bucket) => {
        const types = summary.summary?.[bucket.key] ?? [];
        if (types.length === 0) return null;
        return /* @__PURE__ */ jsxs6(
          "div",
          {
            style: {
              padding: "6px 8px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 4,
              borderLeft: `3px solid ${bucket.color}`
            },
            children: [
              /* @__PURE__ */ jsxs6(
                "div",
                {
                  style: {
                    fontSize: 10,
                    fontWeight: 600,
                    color: bucket.color,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    marginBottom: 4
                  },
                  children: [
                    bucket.label,
                    " (",
                    types.length,
                    ")"
                  ]
                }
              ),
              /* @__PURE__ */ jsx8("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 }, children: types.map((t) => /* @__PURE__ */ jsx8(TypeBadge, { type: t, size: "sm" }, t)) })
            ]
          },
          bucket.key
        );
      }),
      /* @__PURE__ */ jsxs6(
        "div",
        {
          style: {
            fontSize: 10,
            color: "#555",
            textAlign: "right",
            marginTop: 2
          },
          children: [
            "Generation ",
            typeChart.generation,
            " type chart"
          ]
        }
      )
    ] })
  ] });
}

// src/touchmenu/TouchMenuContent.tsx
const {jsx as jsx9, jsxs as jsxs7 } = window.SP_JSX;
function CoachModeWidget() {
  const analysis = useStore((s) => s.liveState?.battle_analysis);
  const coach_suggestion = analysis?.coach_suggestion;
  if (!coach_suggestion) return null;
  return /* @__PURE__ */ jsxs7("div", { style: {
    padding: "8px",
    backgroundColor: "rgba(255, 204, 0, 0.15)",
    border: "1px solid rgba(255, 204, 0, 0.5)",
    borderRadius: "4px",
    marginBottom: "8px"
  }, children: [
    /* @__PURE__ */ jsx9("div", { style: { color: "#ffcc00", fontWeight: "bold", fontSize: "12px", marginBottom: "2px" }, children: "COACH SUGGESTION" }),
    /* @__PURE__ */ jsxs7("div", { style: { fontSize: "13px", color: "#fff" }, children: [
      "Switch to ",
      /* @__PURE__ */ jsx9("strong", { children: coach_suggestion.suggested_pokemon })
    ] }),
    /* @__PURE__ */ jsx9("div", { style: { fontSize: "11px", color: "#ddd", marginTop: "2px" }, children: coach_suggestion.reason })
  ] });
}
function NuzlockeCounterWidget() {
  const party = useStore((s) => s.saveData?.party);
  if (!party) return null;
  const faintedCount = party.filter((p) => p.is_fainted).length;
  return /* @__PURE__ */ jsxs7("div", { style: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: "4px",
    marginBottom: "8px",
    fontSize: "12px",
    fontWeight: "bold"
  }, children: [
    /* @__PURE__ */ jsx9("span", { style: { color: "#ddd" }, children: "Fainted (Nuzlocke):" }),
    /* @__PURE__ */ jsx9("span", { style: { color: faintedCount > 0 ? "#e05858" : "#5eba7d" }, children: faintedCount })
  ] });
}
var TABS = [
  { id: "party", label: "Party" },
  { id: "types", label: "Type Lookup" },
  { id: "moves", label: "Move Lookup" }
];
function TouchMenuContent() {
  const [tab, setTab] = useState3("party");
  return /* @__PURE__ */ jsxs7(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "10px 12px 14px 12px",
        minWidth: 360,
        maxWidth: 720
      },
      children: [
        /* @__PURE__ */ jsx9(
          "div",
          {
            style: {
              display: "flex",
              gap: 6,
              paddingBottom: 4,
              borderBottom: "1px solid #2a2a2a"
            },
            children: TABS.map((t) => /* @__PURE__ */ jsx9(
              TabButton,
              {
                active: tab === t.id,
                onClick: () => setTab(t.id),
                children: t.label
              },
              t.id
            ))
          }
        ),
        /* @__PURE__ */ jsx9(CoachModeWidget, {}),
        /* @__PURE__ */ jsx9(NuzlockeCounterWidget, {}),
        tab === "party" && /* @__PURE__ */ jsx9(PartyTouchMenu, {}),
        tab === "types" && /* @__PURE__ */ jsx9(TypeLookupTouchMenu, {}),
        tab === "moves" && /* @__PURE__ */ jsx9(MoveLookupTouchMenu, {})
      ]
    }
  );
}
function TabButton({
  active,
  onClick,
  children
}) {
  return /* @__PURE__ */ jsx9(
    "button",
    {
      onClick,
      style: {
        flex: 1,
        padding: "6px 10px",
        background: active ? "rgba(94,186,125,0.15)" : "rgba(255,255,255,0.04)",
        color: active ? "#5eba7d" : "#aaa",
        border: active ? "1px solid #5eba7d" : "1px solid transparent",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        textTransform: "uppercase",
        letterSpacing: 0.4
      },
      children
    }
  );
}

// src/touchmenu/index.tsx
const {jsx as jsx10 } = window.SP_JSX;
var PatchTouchMenu2 = DeckyUI.PatchTouchMenu;
var unpatch = null;
function registerTouchMenu() {
  if (unpatch) return;
  if (typeof PatchTouchMenu2 !== "function") {
    console.warn("[pokemon-overlay] PatchTouchMenu not available in this Decky version, skipping touch menu");
    return;
  }
  try {
    unpatch = PatchTouchMenu2({
      menuLabel: "Pok\xE9mon Essentials",
      icon: /* @__PURE__ */ jsx10(PokeballIcon, {}),
      content: /* @__PURE__ */ jsx10(TouchMenuContent, {}),
      onMenuClose: () => {
        console.log("[pokemon-overlay] touch menu closed");
      }
    });
    console.log("[pokemon-overlay] touch menu registered");
  } catch (e) {
    console.warn("[pokemon-overlay] touch menu registration failed", e);
  }
}
function unregisterTouchMenu() {
  if (unpatch) {
    try {
      unpatch();
    } catch (e) {
      console.error("[pokemon-overlay] unpatch error", e);
    }
    unpatch = null;
    console.log("[pokemon-overlay] touch menu unregistered");
  }
}

// src/views/HomeView.tsx
const {Focusable as Focusable2, PanelSection as PanelSection2, PanelSectionRow as PanelSectionRow2 } = window.DFL;

// src/components/PokemonCard.tsx
const {jsx as jsx11, jsxs as jsxs8 } = window.SP_JSX;
var STATUS_COLORS2 = {
  OK: "#5eba7d",
  PSN: "#a33ea1",
  PAR: "#e0a458",
  BRN: "#c22e28",
  SLP: "#969696",
  FRZ: "#96d9d6",
  FNT: "#888"
};
var GENDER_SYMBOLS2 = {
  M: "\u2642",
  F: "\u2640",
  "\u2014": "\u25CB"
};
var DEFAULT_DISPLAY = {
  stats: true,
  ivs: true,
  evs: true,
  nature: true,
  ability: true,
  item: true,
  happiness: true,
  gender: true,
  moves: true,
  type2: true
};
function statColor(v, max) {
  const pct = v / max;
  if (pct >= 0.9) return "#5eba7d";
  if (pct >= 0.5) return "#e0a458";
  if (pct >= 0.25) return "#e87b7b";
  return "#777";
}
function resolveDisplay(p, features, forced) {
  const f = features;
  return {
    stats: (forced?.stats ?? true) && (p.has_stats || (f?.stats ?? false)),
    ivs: (forced?.ivs ?? true) && (p.has_ivs || (f?.ivs ?? false)),
    evs: (forced?.evs ?? true) && (p.has_evs || (f?.evs ?? false)) && (p.has_ivs || (f?.ivs ?? false)),
    nature: (forced?.nature ?? true) && (p.has_nature || (f?.natures ?? false)),
    ability: (forced?.ability ?? true) && (p.has_ability || (f?.abilities ?? false)),
    item: (forced?.item ?? true) && (p.has_item || (f?.items ?? false)),
    happiness: (forced?.happiness ?? true) && (p.has_happiness || (f?.happiness ?? false)),
    gender: (forced?.gender ?? true) && (p.has_gender_data || (f?.gender ?? false)),
    moves: (forced?.moves ?? true) && (p.has_moves || (f?.moves ?? false)),
    type2: (forced?.type2 ?? true) && (p.has_type2 ?? false)
  };
}
function PokemonCard({ pokemon: p, features, forced }) {
  const display = resolveDisplay(p, features, forced);
  const displayName = p.nickname || p.species;
  const statusColor = STATUS_COLORS2[p.status_name] ?? "#888";
  const fainted = p.is_fainted;
  const compactInfo = [];
  if (display.ability && p.ability) {
    compactInfo.push({ label: "Ability", value: p.ability });
  }
  if (display.item && p.item) {
    compactInfo.push({ label: "Item", value: p.item });
  }
  if (display.nature && p.nature) {
    compactInfo.push({ label: "Nature", value: p.nature });
  }
  if (display.happiness && p.happiness != null) {
    compactInfo.push({ label: "\u2665", value: String(p.happiness) });
  }
  return /* @__PURE__ */ jsxs8(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 10,
        background: "rgba(255,255,255,0.03)",
        borderRadius: 6,
        borderLeft: `3px solid ${statusColor}`,
        opacity: fainted ? 0.6 : 1
      },
      children: [
        /* @__PURE__ */ jsxs8(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8
            },
            children: [
              p.shiny && /* @__PURE__ */ jsx11(
                "span",
                {
                  style: {
                    color: "#f7d02c",
                    fontSize: 14,
                    textShadow: "0 0 4px rgba(247, 208, 44, 0.5)"
                  },
                  title: "Shiny",
                  children: "\u2605"
                }
              ),
              /* @__PURE__ */ jsx11(
                "span",
                {
                  style: {
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#fff",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  },
                  children: displayName
                }
              ),
              /* @__PURE__ */ jsxs8("span", { style: { fontSize: 11, color: "#888" }, children: [
                "Lv.",
                p.level
              ] }),
              display.gender && /* @__PURE__ */ jsx11(
                "span",
                {
                  style: {
                    fontSize: 12,
                    color: p.gender_name === "F" ? "#e87ba3" : p.gender_name === "M" ? "#7ba3e8" : "#888",
                    fontWeight: 700,
                    marginLeft: "auto"
                  },
                  title: p.gender_name === "\u2014" ? "Genderless" : p.gender_name === "M" ? "Male" : "Female",
                  children: GENDER_SYMBOLS2[p.gender_name] ?? "?"
                }
              )
            ]
          }
        ),
        p.nickname && p.nickname !== p.species && /* @__PURE__ */ jsx11(
          "div",
          {
            style: {
              fontSize: 11,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: 0.5
            },
            children: p.species
          }
        ),
        /* @__PURE__ */ jsxs8("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" }, children: [
          p.type1 && /* @__PURE__ */ jsx11(TypeBadge, { type: p.type1, size: "sm" }),
          display.type2 && p.has_type2 && p.type2 && /* @__PURE__ */ jsx11(TypeBadge, { type: p.type2, size: "sm" })
        ] }),
        /* @__PURE__ */ jsx11(HealthBar, { hp: p.hp, maxHp: p.max_hp, statusName: p.status_name }),
        /* @__PURE__ */ jsxs8(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 11,
              color: "#aaa",
              flexWrap: "wrap"
            },
            children: [
              /* @__PURE__ */ jsx11("span", { children: /* @__PURE__ */ jsx11("span", { style: { color: statusColor, fontWeight: 600 }, children: p.status_name }) }),
              compactInfo.map((c) => /* @__PURE__ */ jsxs8("span", { children: [
                /* @__PURE__ */ jsxs8("span", { style: { color: "#777" }, children: [
                  c.label,
                  ":"
                ] }),
                " ",
                c.value
              ] }, c.label))
            ]
          }
        ),
        display.moves && p.moves.length > 0 && /* @__PURE__ */ jsx11(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              marginTop: 2
            },
            children: Array.from({ length: 4 }).map((_, i) => {
              const move = p.moves[i];
              return /* @__PURE__ */ jsx11(
                "div",
                {
                  style: {
                    fontSize: 11,
                    padding: "3px 6px",
                    background: move ? "rgba(255,255,255,0.05)" : "transparent",
                    borderRadius: 3,
                    color: move ? "#ddd" : "#555",
                    fontStyle: move ? "normal" : "italic",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  },
                  children: move ?? "\u2014"
                },
                i
              );
            })
          }
        ),
        display.stats && p.has_stats && /* @__PURE__ */ jsxs8(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
              gap: 4,
              padding: "6px 0",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              fontSize: 10
            },
            children: [
              /* @__PURE__ */ jsx11(StatBox, { label: "ATK", value: p.attack }),
              /* @__PURE__ */ jsx11(StatBox, { label: "DEF", value: p.defense }),
              /* @__PURE__ */ jsx11(StatBox, { label: "SpA", value: p.spatk }),
              /* @__PURE__ */ jsx11(StatBox, { label: "SpD", value: p.spdef }),
              /* @__PURE__ */ jsx11(StatBox, { label: "SPE", value: p.speed })
            ]
          }
        ),
        display.ivs && p.has_ivs && p.iv_total != null && /* @__PURE__ */ jsxs8(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "6px 0",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              fontSize: 10
            },
            children: [
              /* @__PURE__ */ jsxs8(
                "div",
                {
                  style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                    gap: 4
                  },
                  children: [
                    /* @__PURE__ */ jsx11(IVStat, { label: "HP", value: p.iv_hp }),
                    /* @__PURE__ */ jsx11(IVStat, { label: "ATK", value: p.iv_attack }),
                    /* @__PURE__ */ jsx11(IVStat, { label: "DEF", value: p.iv_defense }),
                    /* @__PURE__ */ jsx11(IVStat, { label: "SpA", value: p.iv_spatk }),
                    /* @__PURE__ */ jsx11(IVStat, { label: "SpD", value: p.iv_spdef }),
                    /* @__PURE__ */ jsx11(IVStat, { label: "SPE", value: p.iv_speed })
                  ]
                }
              ),
              display.evs && p.has_evs && p.ev_total != null && /* @__PURE__ */ jsxs8(
                "div",
                {
                  style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                    gap: 4,
                    color: "#666"
                  },
                  children: [
                    /* @__PURE__ */ jsx11(EVStat, { label: "HP", value: p.ev_hp }),
                    /* @__PURE__ */ jsx11(EVStat, { label: "ATK", value: p.ev_attack }),
                    /* @__PURE__ */ jsx11(EVStat, { label: "DEF", value: p.ev_defense }),
                    /* @__PURE__ */ jsx11(EVStat, { label: "SpA", value: p.ev_spatk }),
                    /* @__PURE__ */ jsx11(EVStat, { label: "SpD", value: p.ev_spdef }),
                    /* @__PURE__ */ jsx11(EVStat, { label: "SPE", value: p.ev_speed })
                  ]
                }
              ),
              /* @__PURE__ */ jsxs8(
                "div",
                {
                  style: {
                    fontSize: 10,
                    color: "#888",
                    display: "flex",
                    gap: 8,
                    marginTop: 2
                  },
                  children: [
                    /* @__PURE__ */ jsxs8("span", { children: [
                      "IV: ",
                      p.iv_total,
                      "/186",
                      " ",
                      /* @__PURE__ */ jsx11("span", { style: { color: statColor(p.iv_total, 186) }, children: "\u25CF" })
                    ] }),
                    display.evs && p.has_evs && p.ev_total != null && /* @__PURE__ */ jsxs8("span", { children: [
                      "EV: ",
                      p.ev_total,
                      "/510",
                      " ",
                      /* @__PURE__ */ jsx11("span", { style: { color: statColor(p.ev_total, 510) }, children: "\u25CF" })
                    ] })
                  ]
                }
              )
            ]
          }
        )
      ]
    }
  );
}
function StatBox({ label, value }) {
  return /* @__PURE__ */ jsxs8(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1
      },
      children: [
        /* @__PURE__ */ jsx11(
          "div",
          {
            style: {
              fontSize: 9,
              color: "#777",
              textTransform: "uppercase",
              letterSpacing: 0.3
            },
            children: label
          }
        ),
        /* @__PURE__ */ jsx11(
          "div",
          {
            style: {
              fontSize: 12,
              color: "#ddd",
              fontVariantNumeric: "tabular-nums"
            },
            children: value ?? "\u2014"
          }
        )
      ]
    }
  );
}
function IVStat({
  label,
  value
}) {
  return /* @__PURE__ */ jsxs8(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1
      },
      title: value == null ? "?" : `${value}/31`,
      children: [
        /* @__PURE__ */ jsx11(
          "div",
          {
            style: {
              fontSize: 9,
              color: "#5eba7d",
              textTransform: "uppercase",
              letterSpacing: 0.3
            },
            children: label
          }
        ),
        /* @__PURE__ */ jsx11(
          "div",
          {
            style: {
              fontSize: 11,
              color: value == null ? "#555" : statColor(value, 31),
              fontVariantNumeric: "tabular-nums"
            },
            children: value ?? "\u2014"
          }
        )
      ]
    }
  );
}
function EVStat({
  label,
  value
}) {
  return /* @__PURE__ */ jsxs8(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1
      },
      title: value == null ? "?" : `${value} EVs`,
      children: [
        /* @__PURE__ */ jsx11(
          "div",
          {
            style: {
              fontSize: 9,
              color: "#7ba3e8",
              textTransform: "uppercase",
              letterSpacing: 0.3
            },
            children: label
          }
        ),
        /* @__PURE__ */ jsx11(
          "div",
          {
            style: {
              fontSize: 10,
              color: value == null ? "#555" : "#aaa",
              fontVariantNumeric: "tabular-nums"
            },
            children: value ?? "\u2014"
          }
        )
      ]
    }
  );
}
function CapabilitiesSummary({ features }) {
  if (!features) return null;
  const items = [];
  if (features.ivs) items.push(["IVs", "Available"]);
  if (features.evs) items.push(["EVs", "Available"]);
  if (features.happiness) items.push(["Friendship", "Available"]);
  if (features.shiny) items.push(["Shiny", "Supported"]);
  if (features.stats) items.push(["Stats", "Available"]);
  if (features.natures) items.push(["Natures", "Available"]);
  if (features.abilities) items.push(["Abilities", "Available"]);
  if (features.items) items.push(["Held items", "Available"]);
  if (features.type2) items.push(["Dual-types", "Available"]);
  if (features.moves) items.push(["Moves", "Available"]);
  if (items.length === 0) return null;
  return /* @__PURE__ */ jsx11(
    "div",
    {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        fontSize: 10,
        color: "#888"
      },
      children: items.map(([label, _value]) => /* @__PURE__ */ jsx11(
        "span",
        {
          style: {
            background: "rgba(94,186,125,0.1)",
            color: "#5eba7d",
            padding: "2px 6px",
            borderRadius: 3,
            border: "1px solid rgba(94,186,125,0.2)"
          },
          children: label
        },
        label
      ))
    }
  );
}

// src/views/HomeView.tsx
const {Fragment as Fragment3, jsx as jsx12, jsxs as jsxs9 } = window.SP_JSX;
function StatusDot({ ok }) {
  return /* @__PURE__ */ jsx12(
    "span",
    {
      style: {
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        marginRight: 8,
        backgroundColor: ok ? "#5eba7d" : "#e0a458",
        boxShadow: ok ? "0 0 4px rgba(94, 186, 125, 0.6)" : "0 0 4px rgba(224, 164, 88, 0.6)"
      }
    }
  );
}
function timeAgo(epoch) {
  if (!epoch) return "never";
  const delta = Date.now() / 1e3 - epoch;
  if (delta < 5) return "just now";
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}
function HomeView() {
  const info = useStore((s) => s.info);
  const saveData = useStore((s) => s.saveData);
  const movesDb = useStore((s) => s.movesDatabase);
  const settings = useStore((s) => s.settings);
  const live = useStore((s) => s.liveState);
  const party = useStore((s) => s.saveData?.party, partyEqual);
  const faintedCount = party?.filter((p) => p.is_fainted).length ?? 0;
  if (!info) {
    return /* @__PURE__ */ jsxs9(PanelSection2, { title: "Pok\xE9mon Essentials Overlay", children: [
      /* @__PURE__ */ jsx12(PanelSectionRow2, { children: /* @__PURE__ */ jsx12(
        Focusable2,
        {
          onActivate: () => {
          },
          style: {
            color: "#e0a458",
            fontSize: 12,
            padding: "8px 0"
          },
          children: "Plugin data isn't loaded yet. The Decky Loader may be reloading the plugin in the background."
        }
      ) }),
      /* @__PURE__ */ jsx12(PanelSectionRow2, { children: /* @__PURE__ */ jsxs9(
        Focusable2,
        {
          onActivate: () => {
          },
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 0"
          },
          children: [
            /* @__PURE__ */ jsx12("span", { style: { fontSize: 13, color: "#969696" }, children: "Loading\u2026" }),
            /* @__PURE__ */ jsx12(
              "span",
              {
                style: {
                  fontSize: 11,
                  color: "#56b4e9",
                  cursor: "pointer",
                  textDecoration: "underline"
                },
                onClick: () => {
                  retryRefreshStatic();
                },
                children: "Reload"
              }
            )
          ]
        }
      ) })
    ] });
  }
  return /* @__PURE__ */ jsxs9(Fragment3, { children: [
    /* @__PURE__ */ jsx12(PanelSection2, { title: "About", children: /* @__PURE__ */ jsx12(PanelSectionRow2, { children: /* @__PURE__ */ jsxs9(
      Focusable2,
      {
        onActivate: () => {
        },
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "4px 0"
        },
        children: [
          /* @__PURE__ */ jsxs9("div", { style: { fontSize: 14, fontWeight: 600 }, children: [
            String(info.name),
            " ",
            /* @__PURE__ */ jsxs9("span", { style: { color: "#969696", fontWeight: 400 }, children: [
              "v",
              String(info.version)
            ] })
          ] }),
          /* @__PURE__ */ jsx12(
            "div",
            {
              style: {
                fontSize: 12,
                color: "#969696",
                lineHeight: 1.4
              },
              children: String(info.description)
            }
          )
        ]
      }
    ) }) }),
    /* @__PURE__ */ jsx12(PanelSection2, { title: "Status", children: /* @__PURE__ */ jsx12(PanelSectionRow2, { children: /* @__PURE__ */ jsxs9(
      Focusable2,
      {
        onActivate: () => {
        },
        style: {
          fontSize: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "4px 0"
        },
        children: [
          /* @__PURE__ */ jsxs9("div", { children: [
            /* @__PURE__ */ jsx12(StatusDot, { ok: info.initialized }),
            info.initialized ? "Backend ready" : "Backend not initialized"
          ] }),
          /* @__PURE__ */ jsxs9("div", { children: [
            /* @__PURE__ */ jsx12(StatusDot, { ok: info.type_chart_loaded }),
            info.type_chart_loaded ? `Type chart loaded (${info.type_chart_types} types)` : "Type chart not loaded"
          ] }),
          /* @__PURE__ */ jsxs9("div", { children: [
            /* @__PURE__ */ jsx12(StatusDot, { ok: movesDb?.loaded ?? false }),
            movesDb?.loaded ? movesDb.pbs_source ? `Moves DB: ${movesDb.merged_count} (PBS loaded)` : `Moves DB: ${movesDb.static_count} static only` : "Moves DB not loaded"
          ] }),
          live && /* @__PURE__ */ jsxs9(Fragment3, { children: [
            /* @__PURE__ */ jsxs9("div", { children: [
              /* @__PURE__ */ jsx12(StatusDot, { ok: live.game_running }),
              live.game_running ? `Game running: ${live.detected_game_name || String(live.active_process?.name ?? "unknown")} (pid ${String(live.active_process?.pid ?? "?")})` : "No game process detected"
            ] }),
            live.game_running && live.stream_status && /* @__PURE__ */ jsxs9("div", { style: { marginTop: 4, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.05)" }, children: [
              /* @__PURE__ */ jsx12("div", { style: { fontSize: 10, color: "#777", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }, children: "Live Injection Status" }),
              /* @__PURE__ */ jsxs9("div", { children: [
                /* @__PURE__ */ jsx12(StatusDot, { ok: live.stream_status.listening }),
                live.stream_status.listening ? "Stream server listening on 127.0.0.1:9988" : "Stream server not started"
              ] }),
              /* @__PURE__ */ jsxs9("div", { children: [
                /* @__PURE__ */ jsx12(StatusDot, { ok: live.stream_status.connected }),
                live.stream_status.connected ? `Game mod connected${live.stream_status.last_data_trainer ? ` (trainer: ${live.stream_status.last_data_trainer})` : ""}` : "Game mod not connected"
              ] }),
              live.stream_status.total_frames > 0 ? /* @__PURE__ */ jsxs9("div", { children: [
                /* @__PURE__ */ jsx12(StatusDot, { ok: true }),
                `Injection active \u2014 ${live.stream_status.total_frames} frames received` + (live.stream_status.last_data_at ? ` \xB7 last ${timeAgo(live.stream_status.last_data_at)}` : "")
              ] }) : /* @__PURE__ */ jsxs9("div", { children: [
                /* @__PURE__ */ jsx12(StatusDot, { ok: false }),
                live.stream_status.listening ? "Waiting for game mod data\u2026" : "Injection not started"
              ] })
            ] }),
            /* @__PURE__ */ jsxs9("div", { children: [
              /* @__PURE__ */ jsx12(StatusDot, { ok: live.watcher_active }),
              live.watcher_active ? `Save watcher active${live.last_live_event?.at ? ` \xB7 last event ${timeAgo(live.last_live_event.at)}` : ""}` : "Save watcher inactive"
            ] }),
            settings?.live_memory_enabled && /* @__PURE__ */ jsxs9("div", { children: [
              /* @__PURE__ */ jsx12(StatusDot, { ok: live.live_source === "memory" }),
              live.live_source === "memory" ? `Live memory reading active (pid ${live.active_process?.pid ?? "?"})` : `Live memory idle \xB7 ${live.memory_failure_log?.length ? `last: ${live.memory_failure_log[live.memory_failure_log.length - 1]}` : "disk fallback"}`
            ] })
          ] }),
          saveData && !saveData.error && saveData.features && /* @__PURE__ */ jsxs9(
            "div",
            {
              style: {
                marginTop: 4,
                paddingTop: 6,
                borderTop: "1px solid rgba(255,255,255,0.05)"
              },
              children: [
                /* @__PURE__ */ jsxs9(
                  "div",
                  {
                    style: {
                      fontSize: 10,
                      color: "#777",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      marginBottom: 4
                    },
                    children: [
                      "Save features (",
                      saveData.version,
                      ")"
                    ]
                  }
                ),
                /* @__PURE__ */ jsx12(CapabilitiesSummary, { features: saveData.features })
              ]
            }
          ),
          party && /* @__PURE__ */ jsxs9(
            "div",
            {
              style: {
                marginTop: 8,
                backgroundColor: "rgba(0,0,0,0.2)",
                color: "#ddd",
                padding: "8px 12px",
                borderRadius: "4px",
                fontSize: "13px",
                fontWeight: "bold",
                display: "flex",
                justifyContent: "space-between"
              },
              children: [
                /* @__PURE__ */ jsx12("span", { children: "Fainted Pok\xE9mon (Nuzlocke):" }),
                /* @__PURE__ */ jsx12("span", { style: { color: faintedCount > 0 ? "#e05858" : "#5eba7d" }, children: faintedCount })
              ]
            }
          )
        ]
      }
    ) }) }),
    /* @__PURE__ */ jsx12(PanelSection2, { title: "Roadmap", children: /* @__PURE__ */ jsx12(PanelSectionRow2, { children: /* @__PURE__ */ jsxs9(
      Focusable2,
      {
        onActivate: () => {
        },
        style: {
          fontSize: 12,
          color: "#969696",
          lineHeight: 1.6
        },
        children: [
          /* @__PURE__ */ jsxs9("div", { children: [
            /* @__PURE__ */ jsx12("span", { style: { color: "#5eba7d" }, children: "\u25CF" }),
            " Phase 1 \u2014 Foundation"
          ] }),
          /* @__PURE__ */ jsxs9("div", { children: [
            /* @__PURE__ */ jsx12("span", { style: { color: "#5eba7d" }, children: "\u25CF" }),
            " Phase 2 \u2014 Interactive type chart"
          ] }),
          /* @__PURE__ */ jsxs9("div", { children: [
            /* @__PURE__ */ jsx12("span", { style: { color: "#5eba7d" }, children: "\u25CF" }),
            " Phase 3 \u2014 Save-file parser & party status"
          ] }),
          /* @__PURE__ */ jsxs9("div", { children: [
            /* @__PURE__ */ jsx12("span", { style: { color: "#5eba7d" }, children: "\u25CF" }),
            " Phase 4 \u2014 In-game TouchMenu overlay"
          ] }),
          /* @__PURE__ */ jsxs9("div", { children: [
            /* @__PURE__ */ jsx12("span", { style: { color: "#5eba7d" }, children: "\u25CF" }),
            " Phase 5 \u2014 Live PBS, IV/EV, dynamic UI, themes, watcher"
          ] })
        ]
      }
    ) }) })
  ] });
}

// src/views/PartyView.tsx
const {ButtonItem as ButtonItem2, Focusable as Focusable3, PanelSection as PanelSection3, PanelSectionRow as PanelSectionRow3 } = window.DFL;
const {useCallback as useCallback2, useState as useState4 } = window.SP_REACT;
const {Fragment as Fragment4, jsx as jsx13, jsxs as jsxs10 } = window.SP_JSX;
function formatMoney(n) {
  return `\u20BD${n.toLocaleString("en-US")}`;
}
function formatPlayTime(seconds) {
  if (!seconds || seconds < 0) return "\u2014";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
function timeAgo2(epochSeconds) {
  if (!epochSeconds) return "never";
  const delta = Date.now() / 1e3 - epochSeconds;
  if (delta < 5) return "just now";
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}
var MAX_PARTY_SLOTS = 6;
function PartyView() {
  const data = useStore((s) => s.saveData, saveDataEqual);
  const settings = useStore((s) => s.settings);
  const [reloading, setReloading] = useState4(false);
  const reload = useCallback2(async () => {
    setReloading(true);
    try {
      await refreshSave(true);
    } finally {
      setReloading(false);
    }
  }, []);
  if (!data) {
    return /* @__PURE__ */ jsxs10(PanelSection3, { title: "Party", children: [
      /* @__PURE__ */ jsx13(PanelSectionRow3, { children: /* @__PURE__ */ jsx13(
        Focusable3,
        {
          onActivate: () => {
          },
          style: {
            color: "#e0a458",
            fontSize: 12,
            padding: "4px 0"
          },
          children: "Save data isn't loaded yet. The Decky Loader may be reloading the plugin in the background."
        }
      ) }),
      /* @__PURE__ */ jsx13(PanelSectionRow3, { children: /* @__PURE__ */ jsx13(
        ButtonItem2,
        {
          layout: "below",
          onClick: () => {
            retryRefreshStatic();
          },
          children: "Reload"
        }
      ) })
    ] });
  }
  if (data.error === "no_save_file_found") {
    return /* @__PURE__ */ jsxs10(PanelSection3, { title: "Party", children: [
      /* @__PURE__ */ jsx13(PanelSectionRow3, { children: /* @__PURE__ */ jsxs10(Focusable3, { onActivate: () => {
      }, style: { fontSize: 13, color: "#969696", lineHeight: 1.5 }, children: [
        "No save file found. Start the game and save once, or set a manual path in ",
        /* @__PURE__ */ jsx13("strong", { children: "Settings" }),
        "."
      ] }) }),
      /* @__PURE__ */ jsx13(ButtonItem2, { layout: "below", onClick: reload, disabled: reloading, children: reloading ? "Scanning\u2026" : "Scan again" })
    ] });
  }
  if (data.error === "parse_failed") {
    return /* @__PURE__ */ jsxs10(PanelSection3, { title: "Party", children: [
      /* @__PURE__ */ jsx13(PanelSectionRow3, { children: /* @__PURE__ */ jsxs10(Focusable3, { onActivate: () => {
      }, children: [
        /* @__PURE__ */ jsxs10("div", { style: { color: "#e87b7b", fontSize: 13 }, children: [
          "Parse error: ",
          data.message
        ] }),
        /* @__PURE__ */ jsx13(
          "div",
          {
            style: {
              fontSize: 11,
              color: "#777",
              marginTop: 6,
              wordBreak: "break-all"
            },
            children: data.path
          }
        )
      ] }) }),
      /* @__PURE__ */ jsx13(ButtonItem2, { layout: "below", onClick: reload, disabled: reloading, children: "Try again" })
    ] });
  }
  const compactMode = settings?.compact_mode ?? true;
  return /* @__PURE__ */ jsx13(
    PartyContent,
    {
      data,
      reloading,
      onReload: reload,
      autoRefreshSeconds: settings?.scan_interval_seconds ?? 30,
      forced: compactMode ? void 0 : DEFAULT_DISPLAY
    }
  );
}
function PartyContent({
  data,
  reloading,
  onReload,
  autoRefreshSeconds,
  forced
}) {
  const party = data.party || [];
  const slots = Array.from({ length: MAX_PARTY_SLOTS }).map(
    (_, i) => party[i] || null
  );
  return /* @__PURE__ */ jsxs10(Fragment4, { children: [
    /* @__PURE__ */ jsxs10(PanelSection3, { title: data.trainer_name || "Trainer", children: [
      /* @__PURE__ */ jsx13(PanelSectionRow3, { children: /* @__PURE__ */ jsxs10(
        Focusable3,
        {
          onActivate: () => {
          },
          style: {
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
            fontSize: 12
          },
          children: [
            /* @__PURE__ */ jsx13(Stat, { label: "Money", value: formatMoney(data.money) }),
            /* @__PURE__ */ jsx13(Stat, { label: "Badges", value: String(data.badges) }),
            /* @__PURE__ */ jsx13(
              Stat,
              {
                label: "Location",
                value: data.location_name || `Map #${data.map_id ?? "?"}`
              }
            ),
            /* @__PURE__ */ jsx13(Stat, { label: "Position", value: `${data.x ?? "?"}, ${data.y ?? "?"}` }),
            /* @__PURE__ */ jsx13(Stat, { label: "Play time", value: formatPlayTime(data.play_time_seconds) }),
            /* @__PURE__ */ jsx13(Stat, { label: "Version", value: data.version })
          ]
        }
      ) }),
      /* @__PURE__ */ jsx13(PanelSectionRow3, { children: /* @__PURE__ */ jsxs10(Focusable3, { onActivate: () => {
      }, style: { fontSize: 11, color: "#777" }, children: [
        "Updated ",
        timeAgo2(data.parsed_at),
        " \xB7 auto-refresh every",
        " ",
        Math.max(5, autoRefreshSeconds),
        "s"
      ] }) }),
      /* @__PURE__ */ jsx13(ButtonItem2, { layout: "below", onClick: onReload, disabled: reloading, children: reloading ? "Reloading\u2026" : "Reload from disk" })
    ] }),
    data.features && /* @__PURE__ */ jsx13(PanelSection3, { title: "Detected features", children: /* @__PURE__ */ jsx13(PanelSectionRow3, { children: /* @__PURE__ */ jsx13(Focusable3, { onActivate: () => {
    }, children: /* @__PURE__ */ jsx13(CapabilitiesSummary, { features: data.features }) }) }) }),
    /* @__PURE__ */ jsx13(PanelSection3, { title: `Party (${party.length}/${MAX_PARTY_SLOTS})`, children: slots.map(
      (p, i) => p ? /* @__PURE__ */ jsx13(PanelSectionRow3, { children: /* @__PURE__ */ jsx13(
        PokemonCard,
        {
          pokemon: p,
          features: data.features,
          forced
        }
      ) }, `slot-${i}`) : /* @__PURE__ */ jsx13(PanelSectionRow3, { children: /* @__PURE__ */ jsxs10(
        Focusable3,
        {
          onActivate: () => {
          },
          style: {
            padding: 10,
            background: "rgba(255,255,255,0.02)",
            borderRadius: 6,
            border: "1px dashed #333",
            textAlign: "center",
            fontSize: 11,
            color: "#555",
            fontStyle: "italic"
          },
          children: [
            "Slot ",
            i + 1,
            " \u2014 empty"
          ]
        }
      ) }, `slot-${i}`)
    ) }),
    /* @__PURE__ */ jsx13(PanelSection3, { title: "Source", children: /* @__PURE__ */ jsx13(PanelSectionRow3, { children: /* @__PURE__ */ jsx13(
      Focusable3,
      {
        onActivate: () => {
        },
        style: {
          fontSize: 10,
          color: "#666",
          wordBreak: "break-all",
          lineHeight: 1.4
        },
        children: data.source_path
      }
    ) }) })
  ] });
}
function Stat({ label, value }) {
  return /* @__PURE__ */ jsxs10("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [
    /* @__PURE__ */ jsx13(
      "div",
      {
        style: {
          fontSize: 10,
          color: "#777",
          textTransform: "uppercase",
          letterSpacing: 0.4
        },
        children: label
      }
    ),
    /* @__PURE__ */ jsx13("div", { style: { fontSize: 12, color: "#ddd" }, children: value })
  ] });
}

// src/views/SettingsView.tsx
const {ButtonItem as ButtonItem3,
  Dropdown,
  Focusable as Focusable4,
  PanelSection as PanelSection4,
  PanelSectionRow as PanelSectionRow4,
  TextField,
  ToggleField
} = window.DFL;
const {useCallback as useCallback3, useEffect as useEffect3, useRef as useRef2, useState as useState5 } = window.SP_REACT;
const {Fragment as Fragment5, jsx as jsx14, jsxs as jsxs11 } = window.SP_JSX;
function fmtTime(epoch) {
  if (!epoch) return "\u2014";
  return new Date(epoch * 1e3).toLocaleString();
}
function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function shortenPath(p, max = 60) {
  if (p.length <= max) return p;
  const parts = p.split("/");
  if (parts.length <= 3) return "\u2026" + p.slice(-max + 1);
  return parts.slice(0, 2).join("/") + "/\u2026/" + parts.slice(-2).join("/");
}
function SettingsView() {
  const settings = useStore((s) => s.settings);
  const movesDb = useStore((s) => s.movesDatabase);
  const theme = useStore((s) => s.theme);
  const [resolved, setResolved] = useState5(null);
  const [candidates, setCandidates] = useState5([]);
  const [overrideInput, setOverrideInput] = useState5("");
  const [pbsInput, setPbsInput] = useState5("");
  const [scanIntervalInput, setScanIntervalInput] = useState5("");
  const [busy, setBusy] = useState5(false);
  const [pbsBusy, setPbsBusy] = useState5(false);
  const [statusMsg, setStatusMsg] = useState5(null);
  const [statusError, setStatusError] = useState5(null);
  const [themes, setThemes] = useState5([]);
  const refresh = useCallback3(async () => {
    setBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      const [r, c] = await Promise.all([api2.findSavePath(), api2.listSaveFiles()]);
      setResolved(r);
      setCandidates(c);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect3(() => {
    let cancelled = false;
    setBusy(true);
    Promise.all([api2.findSavePath(), api2.listSaveFiles()]).then(([r, c]) => {
      if (!cancelled) {
        setResolved(r);
        setCandidates(c);
      }
    }).catch((e) => {
      if (!cancelled) setStatusError(e.message);
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect3(() => {
    let cancelled = false;
    if (themes.length > 0) return;
    api2.getThemes().then((r) => {
      if (!cancelled) setThemes(r.themes);
    }).catch((e) => console.error("themes", e));
    return () => {
      cancelled = true;
    };
  }, []);
  const overrideInit = useRef2(false);
  const pbsInit = useRef2(false);
  const scanInit = useRef2(false);
  useEffect3(() => {
    if (settings && !overrideInit.current) {
      setOverrideInput(settings.save_path_override ?? "");
      overrideInit.current = true;
    }
  }, [settings]);
  useEffect3(() => {
    if (movesDb && !pbsInit.current) {
      setPbsInput(movesDb.pbs_source ?? "");
      pbsInit.current = true;
    }
  }, [movesDb]);
  useEffect3(() => {
    if (settings && !scanInit.current) {
      setScanIntervalInput(String(settings.scan_interval_seconds));
      scanInit.current = true;
    }
  }, [settings]);
  const reloadPbsAuto = useCallback3(async () => {
    setPbsBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      const r = await api2.autoLoadPbs();
      await refreshMoves();
      if (r.loaded) {
        setStatusMsg(
          `Auto-loaded ${r.database.pbs_count} moves from PBS: ${shortenPath(r.source ?? "")}`
        );
      } else {
        setStatusMsg("No PBS/moves.txt found in common locations.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setPbsBusy(false);
    }
  }, []);
  const applyPbsPath = useCallback3(async () => {
    if (!pbsInput.trim()) return;
    setPbsBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      const r = await api2.loadPbsMoves(pbsInput.trim());
      await refreshMoves();
      if (r.loaded) {
        setStatusMsg(`Loaded ${r.count} moves from PBS file.`);
      } else {
        setStatusError("Failed to load PBS file (file not readable or malformed).");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setPbsBusy(false);
    }
  }, [pbsInput]);
  const clearPbs = useCallback3(async () => {
    setPbsInput("");
    setPbsBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      await api2.clearPbs();
      await refreshMoves();
      setStatusMsg("PBS override cleared. Static moves database only.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setPbsBusy(false);
    }
  }, []);
  const applyOverride = useCallback3(async () => {
    setBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      const next = overrideInput.trim() === "" ? null : overrideInput.trim();
      await applySettingsPatch({ save_path_override: next });
      setStatusMsg(next ? "Override saved." : "Override cleared.");
      const r = await api2.findSavePath();
      setResolved(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBusy(false);
    }
  }, [overrideInput]);
  const clearOverride = useCallback3(async () => {
    setOverrideInput("");
    setBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      await applySettingsPatch({ save_path_override: null });
      setStatusMsg("Override cleared.");
      const r = await api2.findSavePath();
      setResolved(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBusy(false);
    }
  }, []);
  const useCandidate = useCallback3(async (path) => {
    setOverrideInput(path);
    setBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      await applySettingsPatch({ save_path_override: path });
      setStatusMsg(`Override set: ${path}`);
      const r = await api2.findSavePath();
      setResolved(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBusy(false);
    }
  }, []);
  const setAutoScan = useCallback3(async (v) => {
    try {
      await applySettingsPatch({ auto_scan_enabled: v });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);
  const setTouchmenu = useCallback3(async (v) => {
    try {
      await applySettingsPatch({ touchmenu_enabled: v });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);
  const scanDebounce = useRef2(null);
  const setScanInterval = useCallback3((v) => {
    const clamped = Math.max(5, v);
    if (scanDebounce.current) clearTimeout(scanDebounce.current);
    scanDebounce.current = setTimeout(() => {
      applySettingsPatch({ scan_interval_seconds: clamped }).catch(
        (e) => setStatusError(e.message)
      );
    }, 500);
  }, []);
  const setCompactMode = useCallback3(async (v) => {
    try {
      await applySettingsPatch({ compact_mode: v });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);
  const setTheme = useCallback3(async (v) => {
    try {
      await applySettingsPatch({ theme: v });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);
  const setWatcherEnabled = useCallback3(async (v) => {
    try {
      await applySettingsPatch({ watcher_enabled: v });
      setStatusMsg(v ? "Live save watcher enabled." : "Live save watcher disabled.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);
  const setLiveMemory = useCallback3(async (v) => {
    try {
      await applySettingsPatch({ live_memory_enabled: v });
      setStatusMsg(
        v ? "Live memory reading enabled. Updates come from game process memory; the disk watcher is kept as fallback." : "Live memory reading disabled. Updates come from the save file only."
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);
  if (!settings) {
    return /* @__PURE__ */ jsxs11(PanelSection4, { title: "Settings", children: [
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(
        Focusable4,
        {
          style: {
            color: "#e0a458",
            fontSize: 12,
            padding: "4px 0"
          },
          children: "Settings aren't loaded yet. The Decky Loader may be reloading the plugin in the background."
        }
      ) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsxs11(Focusable4, { style: { fontSize: 12, color: "#969696", padding: "4px 0" }, children: [
        "Loading\u2026",
        /* @__PURE__ */ jsx14(
          "span",
          {
            style: {
              fontSize: 11,
              color: "#56b4e9",
              cursor: "pointer",
              textDecoration: "underline",
              marginLeft: 8
            },
            onClick: () => {
              retryRefreshStatic();
            },
            children: "Reload"
          }
        )
      ] }) })
    ] });
  }
  return /* @__PURE__ */ jsxs11(Fragment5, { children: [
    /* @__PURE__ */ jsxs11(PanelSection4, { title: "Save resolution", children: [
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4 }, children: "Active save" }) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 12, color: resolved?.path ? "#5eba7d" : "#e0a458", wordBreak: "break-all" }, children: resolved?.path || "\u2014 no save found \u2014" }) }),
      resolved?.using_override && /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 10, color: "#777" }, children: "(using manual override)" }) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(ButtonItem3, { layout: "below", onClick: refresh, disabled: busy, children: busy ? "Scanning\u2026" : "Rescan saves" }) })
    ] }),
    /* @__PURE__ */ jsxs11(PanelSection4, { title: "Manual override", children: [
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 11, color: "#888", lineHeight: 1.4 }, children: "If auto-detection fails, paste the full path to a save file here. Leave blank to use auto-detection." }) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(
        TextField,
        {
          label: "Path to save file",
          value: overrideInput,
          onChange: (e) => setOverrideInput(e.target.value)
        }
      ) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(ButtonItem3, { layout: "below", onClick: applyOverride, disabled: busy, children: "Apply override" }) }),
      settings.save_path_override && /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(ButtonItem3, { layout: "below", onClick: clearOverride, disabled: busy, children: "Clear override" }) })
    ] }),
    /* @__PURE__ */ jsx14(PanelSection4, { title: "Auto-detect options", children: /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(
      ToggleField,
      {
        label: "Auto-scan running processes and Wine prefixes",
        checked: settings.auto_scan_enabled,
        onChange: setAutoScan
      }
    ) }) }),
    /* @__PURE__ */ jsx14(PanelSection4, { title: "Display", children: /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(
      ToggleField,
      {
        label: "Compact mode (auto-hide empty sections)",
        checked: settings.compact_mode,
        onChange: setCompactMode
      }
    ) }) }),
    /* @__PURE__ */ jsxs11(PanelSection4, { title: "Theme", children: [
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4 }, children: "Active theme" }) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 12, color: theme ? theme.palette.accent : "#888" }, children: theme ? theme.name : "Loading\u2026" }) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(
        Dropdown,
        {
          menuLabel: "Theme",
          selectedOption: settings.theme || "default",
          onChange: (opt) => setTheme(opt.data),
          rgOptions: themes.map((t) => ({ data: t.id, label: t.name })),
          disabled: themes.length === 0
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxs11(PanelSection4, { title: "PBS moves database", children: [
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4 }, children: "Active PBS source" }) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 11, color: movesDb?.pbs_source ? "#5eba7d" : "#888", wordBreak: "break-all" }, children: movesDb?.pbs_source ? shortenPath(movesDb.pbs_source, 80) : "\u2014 not loaded (using static DB) \u2014" }) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 10, color: "#777" }, children: movesDb ? `${movesDb.merged_count} moves total \xB7 ${movesDb.static_count} static \xB7 ${movesDb.pbs_count} from game PBS` : "Loading\u2026" }) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(ButtonItem3, { layout: "below", onClick: reloadPbsAuto, disabled: pbsBusy, children: pbsBusy ? "Scanning\u2026" : "Auto-discover PBS" }) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(
        TextField,
        {
          label: "Manual PBS path (moves.txt)",
          value: pbsInput,
          onChange: (e) => setPbsInput(e.target.value)
        }
      ) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(ButtonItem3, { layout: "below", onClick: applyPbsPath, disabled: pbsBusy || !pbsInput.trim(), children: "Load PBS from path" }) }),
      movesDb?.pbs_source && /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(ButtonItem3, { layout: "below", onClick: clearPbs, disabled: pbsBusy, children: "Clear PBS (use static only)" }) })
    ] }),
    /* @__PURE__ */ jsx14(PanelSection4, { title: "TouchMenu overlay", children: /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(
      ToggleField,
      {
        label: "Enable in-game touch menu",
        checked: settings.touchmenu_enabled,
        onChange: setTouchmenu
      }
    ) }) }),
    /* @__PURE__ */ jsxs11(PanelSection4, { title: "Live memory reading", children: [
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 11, color: "#888", lineHeight: 1.4 }, children: "When the game is running, read party state directly from the game's process memory. Updates arrive every ~1s without waiting for the game to save to disk. Opt-in: the disk watcher still runs as a fallback if memory reading fails." }) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(
        ToggleField,
        {
          label: "Read live data from game process memory",
          checked: Boolean(settings?.live_memory_enabled),
          onChange: setLiveMemory
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxs11(PanelSection4, { title: "Polling", children: [
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsxs11(Focusable4, { style: { fontSize: 11, color: "#888" }, children: [
        "Backend live watcher checks the disk every",
        " ",
        /* @__PURE__ */ jsx14("strong", { style: { color: "#ccc" }, children: Math.max(5, settings.scan_interval_seconds) }),
        " ",
        "units. The UI will always update instantly when changes occur."
      ] }) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(
        TextField,
        {
          label: "Interval (seconds)",
          value: scanIntervalInput,
          onChange: (e) => {
            const n = parseInt(e.target.value, 10);
            setScanIntervalInput(e.target.value);
            if (!isNaN(n)) setScanInterval(n);
          }
        }
      ) }),
      /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(
        ToggleField,
        {
          label: "Live save watcher (sub-second updates)",
          checked: settings.watcher_enabled ?? true,
          onChange: setWatcherEnabled
        }
      ) })
    ] }),
    candidates.length > 0 && /* @__PURE__ */ jsxs11(PanelSection4, { title: `Discovered saves (${candidates.length})`, children: [
      candidates.slice(0, 20).map((c) => /* @__PURE__ */ jsxs11(PanelSectionRow4, { children: [
        /* @__PURE__ */ jsxs11(Focusable4, { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
          /* @__PURE__ */ jsx14("div", { style: { fontSize: 11, color: "#ddd", wordBreak: "break-all" }, children: c.path }),
          /* @__PURE__ */ jsxs11("div", { style: { fontSize: 10, color: "#777" }, children: [
            fmtSize(c.size),
            " \xB7 modified ",
            fmtTime(c.modified)
          ] })
        ] }),
        /* @__PURE__ */ jsx14(ButtonItem3, { layout: "inline", onClick: () => useCandidate(c.path), children: "Use this save" })
      ] }, c.path)),
      candidates.length > 20 && /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsxs11(Focusable4, { style: { fontSize: 11, color: "#777", fontStyle: "italic" }, children: [
        "\u2026and ",
        candidates.length - 20,
        " more. Use override to select specific file."
      ] }) })
    ] }),
    (statusMsg || statusError) && /* @__PURE__ */ jsxs11(PanelSection4, { title: "Status", children: [
      statusMsg && /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 12, color: "#5eba7d" }, children: /* @__PURE__ */ jsx14("div", { children: statusMsg }) }) }),
      statusError && /* @__PURE__ */ jsx14(PanelSectionRow4, { children: /* @__PURE__ */ jsx14(Focusable4, { style: { fontSize: 12, color: "#e87b7b" }, children: /* @__PURE__ */ jsx14("div", { children: statusError }) }) })
    ] })
  ] });
}

// src/views/TypeChartView.tsx
const {ButtonItem as ButtonItem4, Dropdown as Dropdown2, PanelSection as PanelSection5, PanelSectionRow as PanelSectionRow5, Spinner } = window.DFL;
const {useEffect as useEffect4, useMemo as useMemo2, useState as useState6 } = window.SP_REACT;

// src/components/TypeChartGrid.tsx
const {jsx as jsx15, jsxs as jsxs12 } = window.SP_JSX;
var BUCKET_LABELS = {
  quadruple: "4\xD7 damage",
  double: "2\xD7 damage",
  neutral: "Normal",
  half: "\xBD\xD7 damage",
  quarter: "\xBC\xD7 damage",
  immune: "No effect"
};
var BUCKET_ORDER = [
  "quadruple",
  "double",
  "neutral",
  "half",
  "quarter",
  "immune"
];
var BUCKET_COLORS = {
  quadruple: "#ff4d4d",
  double: "#ff8a3d",
  neutral: "#888",
  half: "#5eba7d",
  quarter: "#2f8a55",
  immune: "#444"
};
function DefenseGrid({ defenders, summary }) {
  return /* @__PURE__ */ jsxs12("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [
    /* @__PURE__ */ jsxs12("div", { style: { fontSize: "12px", color: "#969696" }, children: [
      "Defender:",
      " ",
      defenders.map((d, i) => /* @__PURE__ */ jsxs12("span", { style: { marginRight: "4px" }, children: [
        /* @__PURE__ */ jsx15(TypeBadge, { type: d, size: "sm" }),
        i < defenders.length - 1 ? " /" : ""
      ] }, d))
    ] }),
    BUCKET_ORDER.filter((b) => (summary[b] || []).length > 0).map((bucket) => {
      const types = summary[bucket] || [];
      return /* @__PURE__ */ jsxs12(
        "div",
        {
          style: {
            padding: "6px 8px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: "4px",
            borderLeft: `3px solid ${BUCKET_COLORS[bucket]}`
          },
          children: [
            /* @__PURE__ */ jsxs12(
              "div",
              {
                style: {
                  fontSize: "11px",
                  fontWeight: 600,
                  color: BUCKET_COLORS[bucket],
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "4px"
                },
                children: [
                  BUCKET_LABELS[bucket],
                  " (",
                  types.length,
                  ")"
                ]
              }
            ),
            /* @__PURE__ */ jsx15("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" }, children: types.map((t) => /* @__PURE__ */ jsx15(TypeBadge, { type: t, size: "sm" }, t)) })
          ]
        },
        bucket
      );
    })
  ] });
}
var OFFENSE_BUCKETS = [
  { key: "super_effective", label: "Super effective", color: "#ff8a3d" },
  { key: "not_very_effective", label: "Not very effective", color: "#5eba7d" },
  { key: "no_effect", label: "No effect", color: "#444" },
  { key: "neutral", label: "Normal damage", color: "#888" }
];
function OffenseGrid({ attacker, summary }) {
  return /* @__PURE__ */ jsxs12("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [
    /* @__PURE__ */ jsxs12("div", { style: { fontSize: "12px", color: "#969696" }, children: [
      "Attacker: ",
      /* @__PURE__ */ jsx15(TypeBadge, { type: attacker, size: "sm" })
    ] }),
    OFFENSE_BUCKETS.filter((b) => (summary[b.key] || []).length > 0).map((bucket) => {
      const types = summary[bucket.key] || [];
      return /* @__PURE__ */ jsxs12(
        "div",
        {
          style: {
            padding: "6px 8px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: "4px",
            borderLeft: `3px solid ${bucket.color}`
          },
          children: [
            /* @__PURE__ */ jsxs12(
              "div",
              {
                style: {
                  fontSize: "11px",
                  fontWeight: 600,
                  color: bucket.color,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "4px"
                },
                children: [
                  bucket.label,
                  " (",
                  types.length,
                  ")"
                ]
              }
            ),
            /* @__PURE__ */ jsx15("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" }, children: types.map((t) => /* @__PURE__ */ jsx15(TypeBadge, { type: t, size: "sm" }, t)) })
          ]
        },
        bucket.key
      );
    })
  ] });
}

// src/views/TypeChartView.tsx
const {Fragment as Fragment6, jsx as jsx16, jsxs as jsxs13 } = window.SP_JSX;
var NO_TYPE = "(none)";
function TypeChartView() {
  const chart = useStore((s) => s.typeChart);
  const [error, setError] = useState6(null);
  const [mode, setMode] = useState6("defense");
  const [attacker, setAttacker] = useState6("Fire");
  const [def1, setDef1] = useState6("Fire");
  const [def2, setDef2] = useState6(NO_TYPE);
  const [defense, setDefense] = useState6(null);
  const [offense, setOffense] = useState6(null);
  const [loading, setLoading] = useState6(false);
  const types = chart?.types ?? [];
  const typeOptions = useMemo2(
    () => [
      { data: NO_TYPE, label: NO_TYPE },
      ...types.map((t) => ({ data: t, label: t }))
    ],
    [types]
  );
  const attackerOptions = useMemo2(
    () => types.map((t) => ({ data: t, label: t })),
    [types]
  );
  const defenderPair = useMemo2(
    () => def2 === NO_TYPE ? [def1] : [def1, def2],
    [def1, def2]
  );
  useEffect4(() => {
    if (!chart) return;
    if (!chart.types.includes(attacker)) setAttacker(chart.types[0] ?? "Fire");
    if (!chart.types.includes(def1)) setDef1(chart.types[0] ?? "Fire");
  }, [chart]);
  useEffect4(() => {
    if (!chart) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const promise = mode === "defense" ? api2.getDefenseSummary(defenderPair) : api2.getOffenseSummary(attacker);
    promise.then((res) => {
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setDefense(null);
        setOffense(null);
      } else {
        if (mode === "defense") {
          setDefense(res);
          setOffense(null);
        } else {
          setOffense(res);
          setDefense(null);
        }
      }
    }).catch((e) => {
      if (!cancelled) setError(e.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [chart, mode, attacker, defenderPair]);
  if (!chart) {
    return /* @__PURE__ */ jsxs13(PanelSection5, { title: "Type Chart", children: [
      /* @__PURE__ */ jsx16(PanelSectionRow5, { children: /* @__PURE__ */ jsx16(
        "div",
        {
          style: {
            color: "#e0a458",
            fontSize: 12,
            padding: "8px 0"
          },
          children: "Type chart data isn't loaded yet. The Decky Loader may be reloading the plugin in the background."
        }
      ) }),
      /* @__PURE__ */ jsx16(PanelSectionRow5, { children: /* @__PURE__ */ jsx16(
        ButtonItem4,
        {
          layout: "below",
          onClick: () => {
            retryRefreshStatic();
          },
          children: "Reload"
        }
      ) })
    ] });
  }
  return /* @__PURE__ */ jsxs13(Fragment6, { children: [
    /* @__PURE__ */ jsx16(PanelSection5, { title: "Mode", children: /* @__PURE__ */ jsx16(PanelSectionRow5, { children: /* @__PURE__ */ jsxs13(
      ButtonItem4,
      {
        layout: "below",
        onClick: () => setMode(mode === "defense" ? "offense" : "defense"),
        children: [
          "Mode: ",
          mode === "defense" ? "Defender" : "Attacker",
          " (click to switch)"
        ]
      }
    ) }) }),
    /* @__PURE__ */ jsx16(PanelSection5, { title: mode === "defense" ? "Defender types" : "Attacker type", children: mode === "defense" ? /* @__PURE__ */ jsxs13(Fragment6, { children: [
      /* @__PURE__ */ jsx16(PanelSectionRow5, { children: /* @__PURE__ */ jsx16(
        Dropdown2,
        {
          menuLabel: "Type 1",
          selectedOption: def1,
          onChange: (opt) => setDef1(opt.data),
          rgOptions: attackerOptions
        }
      ) }),
      /* @__PURE__ */ jsx16(PanelSectionRow5, { children: /* @__PURE__ */ jsx16(
        Dropdown2,
        {
          menuLabel: "Type 2",
          selectedOption: def2,
          onChange: (opt) => setDef2(opt.data),
          rgOptions: typeOptions
        }
      ) })
    ] }) : /* @__PURE__ */ jsx16(PanelSectionRow5, { children: /* @__PURE__ */ jsx16(
      Dropdown2,
      {
        menuLabel: "Attacker",
        selectedOption: attacker,
        onChange: (opt) => setAttacker(opt.data),
        rgOptions: attackerOptions
      }
    ) }) }),
    loading && /* @__PURE__ */ jsx16(PanelSection5, { children: /* @__PURE__ */ jsx16(PanelSectionRow5, { children: /* @__PURE__ */ jsxs13("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }, children: [
      /* @__PURE__ */ jsx16(Spinner, {}),
      /* @__PURE__ */ jsx16("span", { style: { fontSize: 12, color: "#969696" }, children: "Updating\u2026" })
    ] }) }) }),
    error && /* @__PURE__ */ jsx16(PanelSection5, { children: /* @__PURE__ */ jsx16(PanelSectionRow5, { children: /* @__PURE__ */ jsx16("div", { style: { color: "#e87b7b", fontSize: 12, padding: "4px 0" }, children: error }) }) }),
    mode === "defense" && defense && defense.summary && /* @__PURE__ */ jsx16(PanelSection5, { title: "What hits this Pok\xE9mon?", children: /* @__PURE__ */ jsx16(PanelSectionRow5, { children: /* @__PURE__ */ jsx16(DefenseGrid, { defenders: defense.defenders ?? [], summary: defense.summary }) }) }),
    mode === "offense" && offense && offense.summary && /* @__PURE__ */ jsx16(PanelSection5, { title: "What does it hit?", children: /* @__PURE__ */ jsx16(PanelSectionRow5, { children: /* @__PURE__ */ jsx16(OffenseGrid, { attacker: offense.attacker ?? attacker, summary: offense.summary }) }) })
  ] });
}

// src/views/BattleAnalyzerView.tsx
const {Focusable as Focusable5, PanelSection as PanelSection6, PanelSectionRow as PanelSectionRow6 } = window.DFL;
const {Fragment as Fragment7, jsx as jsx17, jsxs as jsxs14 } = window.SP_JSX;
function EffectivenessBadge({ label }) {
  if (!label) return null;
  let bgColor = "#555";
  let textColor = "#fff";
  if (label.includes("super_effective")) {
    bgColor = "#5eba7d";
    textColor = "#000";
  } else if (label.includes("not_very_effective")) {
    bgColor = "#e05858";
  } else if (label.includes("immune")) {
    bgColor = "#888";
  } else if (label.includes("neutral")) {
    bgColor = "#56b4e9";
  }
  return /* @__PURE__ */ jsx17(
    "span",
    {
      style: {
        backgroundColor: bgColor,
        color: textColor,
        padding: "2px 6px",
        borderRadius: "4px",
        fontSize: "10px",
        marginLeft: "8px",
        fontWeight: "bold",
        textTransform: "uppercase"
      },
      children: label.replace(/_/g, " ")
    }
  );
}
var STAT_NAMES = ["Atk", "Def", "SpA", "SpD", "Spe"];
function StatBadges({ stages }) {
  if (!stages || !stages.length) return null;
  return /* @__PURE__ */ jsx17("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }, children: stages.map((stage, i) => {
    if (stage === 0 || i >= STAT_NAMES.length) return null;
    const color = stage > 0 ? "#5eba7d" : "#e05858";
    const sign = stage > 0 ? "+" : "";
    return /* @__PURE__ */ jsxs14("span", { style: { backgroundColor: color, color: "#fff", padding: "2px 4px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }, children: [
      STAT_NAMES[i],
      " ",
      sign,
      stage
    ] }, i);
  }) });
}
function hpPercent(enemy) {
  if (enemy.totalhp != null && enemy.totalhp > 0 && enemy.hp != null) {
    return Math.round(enemy.hp / enemy.totalhp * 100);
  }
  return 0;
}
function BattleAnalyzerView() {
  const analysis = useStore((s) => s.liveState?.battle_analysis);
  if (!analysis || !analysis.enemy) {
    return null;
  }
  const { enemy, moves = [], best_move, coach_suggestion } = analysis;
  const pct = hpPercent(enemy);
  const enemyTypes = enemy.types || [];
  const enemyStages = enemy.stages;
  return /* @__PURE__ */ jsx17(Fragment7, { children: /* @__PURE__ */ jsxs14(PanelSection6, { title: "Battle Analyzer", children: [
    coach_suggestion && /* @__PURE__ */ jsx17(PanelSectionRow6, { children: /* @__PURE__ */ jsxs14(
      Focusable5,
      {
        style: {
          padding: "10px",
          backgroundColor: "rgba(255, 204, 0, 0.2)",
          border: "1px solid #ffcc00",
          borderRadius: "4px",
          marginBottom: "8px"
        },
        children: [
          /* @__PURE__ */ jsx17("div", { style: { color: "#ffcc00", fontWeight: "bold", fontSize: "14px", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }, children: /* @__PURE__ */ jsx17("span", { children: "COACH SUGGESTION" }) }),
          /* @__PURE__ */ jsxs14("div", { style: { fontSize: "14px" }, children: [
            "Switch to ",
            /* @__PURE__ */ jsx17("strong", { children: coach_suggestion.suggested_pokemon })
          ] }),
          /* @__PURE__ */ jsxs14("div", { style: { fontSize: "12px", color: "#ddd", marginTop: "2px" }, children: [
            "Reason: ",
            coach_suggestion.reason
          ] })
        ]
      }
    ) }),
    /* @__PURE__ */ jsx17(PanelSectionRow6, { children: /* @__PURE__ */ jsxs14(
      Focusable5,
      {
        style: {
          padding: "8px",
          backgroundColor: "rgba(0, 0, 0, 0.2)",
          borderRadius: "4px",
          marginBottom: "8px"
        },
        children: [
          /* @__PURE__ */ jsxs14("div", { style: { fontSize: "14px", fontWeight: "bold" }, children: [
            "Enemy: ",
            enemy.name
          ] }),
          /* @__PURE__ */ jsxs14("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }, children: [
            /* @__PURE__ */ jsx17("div", { style: { flex: 1, height: "12px", backgroundColor: "#333", borderRadius: "6px", overflow: "hidden" }, children: /* @__PURE__ */ jsx17(
              "div",
              {
                style: {
                  height: "100%",
                  width: `${pct}%`,
                  backgroundColor: pct > 50 ? "#5eba7d" : pct > 20 ? "#e0b058" : "#e05858",
                  transition: "width 0.3s ease-in-out, background-color 0.3s ease-in-out"
                }
              }
            ) }),
            /* @__PURE__ */ jsx17("div", { style: { display: "flex", gap: "4px" }, children: enemyTypes.map((t) => /* @__PURE__ */ jsx17(TypeBadge, { type: t, size: "sm" }, t)) })
          ] }),
          /* @__PURE__ */ jsx17(StatBadges, { stages: enemyStages })
        ]
      }
    ) }),
    moves.map((move, index) => {
      const isBest = move.name === best_move;
      return /* @__PURE__ */ jsx17(PanelSectionRow6, { children: /* @__PURE__ */ jsxs14(
        Focusable5,
        {
          style: {
            padding: "8px",
            backgroundColor: isBest ? "rgba(94, 186, 125, 0.2)" : "rgba(255, 255, 255, 0.05)",
            borderRadius: "4px",
            border: isBest ? "1px solid #5eba7d" : "1px solid transparent",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          },
          children: [
            /* @__PURE__ */ jsxs14("div", { children: [
              /* @__PURE__ */ jsxs14("div", { style: { fontSize: "14px", fontWeight: isBest ? "bold" : "normal" }, children: [
                move.name,
                isBest && /* @__PURE__ */ jsx17(
                  "span",
                  {
                    style: {
                      marginLeft: "8px",
                      fontSize: "10px",
                      color: "#5eba7d",
                      fontWeight: "bold"
                    },
                    children: "BEST"
                  }
                )
              ] }),
              move.type && /* @__PURE__ */ jsxs14("div", { style: { fontSize: "12px", color: "#aaa", display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }, children: [
                /* @__PURE__ */ jsx17(TypeBadge, { type: move.type, size: "sm" }),
                move.power ? /* @__PURE__ */ jsxs14("span", { children: [
                  "Power: ",
                  move.power
                ] }) : null
              ] })
            ] }),
            /* @__PURE__ */ jsx17(EffectivenessBadge, { label: move.effectiveness_label })
          ]
        }
      ) }, move.name || index);
    })
  ] }) });
}

// src/index.tsx
const {jsx as jsx18, jsxs as jsxs15 } = window.SP_JSX;
var lastEnemyName = void 0;
var lastCoach = void 0;
var lastBoostWarned = false;
var unsubscribeToasts = null;
function initGlobalToasts() {
  if (unsubscribeToasts) {
    unsubscribeToasts();
  }
  unsubscribeToasts = subscribe(() => {
    const s = getState();
    const inBattle = !!s.liveState?.battle_analysis;
    const enemyName = s.liveState?.battle_analysis?.enemy?.name;
    const coachSuggestion = s.liveState?.battle_analysis?.coach_suggestion?.suggested_pokemon;
    const stages = s.liveState?.battle_analysis?.enemy?.stages;
    const enemyHasBoosts = !!stages && stages.some((v) => v > 0);
    if (inBattle && enemyName && enemyName !== lastEnemyName) {
      const types = s.liveState?.battle_analysis?.enemy?.types;
      const typeStr = types?.join("/") || "Unknown";
      toaster.toast({ title: "Battle Update", body: `Enemy sent out ${enemyName} (Type: ${typeStr})` });
    }
    lastEnemyName = enemyName;
    if (inBattle && coachSuggestion && coachSuggestion !== lastCoach) {
      const reason = s.liveState?.battle_analysis?.coach_suggestion?.reason || "";
      toaster.toast({ title: "Coach Suggestion", body: `Switch to ${coachSuggestion}! ${reason}` });
    }
    lastCoach = coachSuggestion;
    if (inBattle && enemyHasBoosts && !lastBoostWarned) {
      toaster.toast({ title: "Stat Warning", body: "Enemy stats are boosted! Be careful!" });
      lastBoostWarned = true;
    } else if (!enemyHasBoosts) {
      lastBoostWarned = false;
    }
  });
}
var TABS2 = [
  { id: "status", label: "Status" },
  { id: "typechart", label: "Type Chart" },
  { id: "party", label: "Party" },
  { id: "settings", label: "Settings" }
];
function PluginContent() {
  const [active, setActive] = useState7("status");
  const theme = useStore((s) => s.theme);
  const touchmenuEnabled = useStore((s) => s.settings?.touchmenu_enabled ?? true);
  const inBattle = useStore((s) => !!s.liveState?.battle_analysis);
  const showRestartBanner = useStore(
    (s) => !!s.liveState?.mod_needs_restart && s.liveState?.live_source !== "stream"
  );
  useEffect5(() => {
    if (touchmenuEnabled) {
      registerTouchMenu();
    } else {
      unregisterTouchMenu();
    }
  }, [touchmenuEnabled]);
  useEffect5(() => {
    refreshStatic();
  }, []);
  const palette = theme?.palette ?? DEFAULT_PALETTE;
  const themeStyle = useMemo3(
    () => paletteToCssVars(palette),
    [palette]
  );
  return /* @__PURE__ */ jsxs15(Focusable6, { style: { display: "flex", flexDirection: "column", ...themeStyle }, children: [
    /* @__PURE__ */ jsx18(
      TabBar,
      {
        tabs: TABS2,
        activeId: active,
        onChange: (id) => setActive(id)
      }
    ),
    /* @__PURE__ */ jsxs15(ScrollPanel, { children: [
      showRestartBanner && /* @__PURE__ */ jsx18(PanelSection7, { children: /* @__PURE__ */ jsx18(PanelSectionRow7, { children: /* @__PURE__ */ jsx18(
        "div",
        {
          style: {
            backgroundColor: "#e05858",
            color: "#fff",
            padding: "12px",
            borderRadius: "4px",
            fontSize: "13px",
            lineHeight: "1.4",
            fontWeight: "bold",
            marginBottom: "8px"
          },
          children: "The live-tracker mod was just auto-installed. Please restart your Pok\xE9mon game once to activate the Battle Analyzer."
        }
      ) }) }),
      active === "status" && (inBattle ? /* @__PURE__ */ jsx18(BattleAnalyzerView, {}) : /* @__PURE__ */ jsx18(HomeView, {})),
      active === "typechart" && /* @__PURE__ */ jsx18(TypeChartView, {}),
      active === "party" && /* @__PURE__ */ jsx18(PartyView, {}),
      active === "settings" && /* @__PURE__ */ jsx18(SettingsView, {})
    ] })
  ] });
}
var index_default = definePlugin(() => {
  refreshStatic();
  startPolling();
  registerTouchMenu();
  initGlobalToasts();
  return {
    name: "Pok\xE9mon Essentials Overlay",
    titleView: /* @__PURE__ */ jsxs15(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          paddingLeft: "4px"
        },
        children: [
          /* @__PURE__ */ jsx18(PokeballIcon, { size: 18 }),
          /* @__PURE__ */ jsx18("span", { children: "Pok\xE9mon Essentials Overlay" })
        ]
      }
    ),
    content: /* @__PURE__ */ jsx18(ErrorBoundary, { children: /* @__PURE__ */ jsx18(PluginContent, {}) }),
    icon: /* @__PURE__ */ jsx18(PokeballIcon, {}),
    onDismount() {
      unregisterTouchMenu();
      stopPolling();
      if (unsubscribeToasts) unsubscribeToasts();
      console.log("[pokemon-overlay] dismounted");
    }
  };
});
export {
  index_default as default
};
