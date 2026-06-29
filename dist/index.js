const manifest = {name: 'SD Poké Stat Tracker'};
const API_VERSION = 2;
const internalAPIConnection = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
if (!internalAPIConnection) {
    throw new Error('[@decky/api]: Failed to connect to the loader as as the loader API was not initialized. This is likely a bug in Decky Loader.');
}
let api$1;
try {
    api$1 = internalAPIConnection.connect(API_VERSION, manifest.name);
}
catch {
    api$1 = internalAPIConnection.connect(1, manifest.name);
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version 1. Some features may not work.`);
}
if (api$1._version != API_VERSION) {
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version ${api$1._version}. Some features may not work.`);
}
const call = api$1.call;
api$1.callable;
api$1.addEventListener;
api$1.removeEventListener;
api$1.routerHook;
const toaster = api$1.toaster;
api$1.openFilePicker;
api$1.executeInTab;
api$1.injectCssIntoTab;
api$1.removeCssFromTab;
api$1.fetchNoCors;
api$1.getExternalResourceURL;
api$1.useQuickAccessVisible;
const definePlugin = (fn) => {
    return (...args) => {
        return fn(...args);
    };
};

async function callOrThrow(method, ...args) {
    try {
        return await call(method, ...args);
    }
    catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`[${method}] ${reason}`);
    }
}
const api = {
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
    getProcessMemoryRegions: (pid) => callOrThrow("get_process_memory_regions", pid),
};

const initialState = {
    info: null,
    typeChart: null,
    saveData: null,
    settings: null,
    movesDatabase: null,
    theme: null,
    liveState: null,
};
let state = initialState;
const listeners = new Set();
let pollTimer = null;
function notify() {
    for (const l of listeners)
        l();
}
/**
 * Functional state updater that always reads the *current* module-level
 * state before merging, preventing stale-closure race conditions when
 * multiple async operations resolve concurrently.
 */
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
    const selectorRef = window.SP_REACT.useRef(selector);
    selectorRef.current = selector;
    const eqRef = window.SP_REACT.useRef(equalityFn);
    eqRef.current = equalityFn;
    const cache = window.SP_REACT.useRef(null);
    const getSelection = window.SP_REACT.useCallback(() => {
        const currentState = getState();
        const currentSelector = selectorRef.current;
        // If the state hasn't changed, return the cached selection.
        // (Assumes the selector is a pure function of state).
        if (cache.current && cache.current.state === currentState) {
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
            return cache.current.selection;
        }
        cache.current = { state: currentState, selection: newSelection };
        return newSelection;
    }, []);
    const getServerSelection = window.SP_REACT.useCallback(() => {
        return selectorRef.current(initialState);
    }, []);
    return window.SP_REACT.useSyncExternalStore(subscribe, getSelection, getServerSelection);
}
async function refreshStatic() {
    // Retry up to 3 times with exponential backoff. The Decky Loader's plugin
    // reload cycle can transiently make the backend unreachable right when
    // the frontend mounts — a single try then permanently shows "Loading..."
    // for the user. Retries make the plugin robust against that boot-loop.
    const maxAttempts = 3;
    let lastError = null;
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
        }
        catch (e) {
            lastError = e;
            console.warn(`[store] refreshStatic attempt ${attempt}/${maxAttempts} failed:`, e);
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
async function retryRefreshStatic() {
    await refreshStatic();
}
async function refreshTheme() {
    try {
        const themes = await api.getThemes();
        updateState({ theme: themes.active });
    }
    catch (e) {
        console.error("[store] refreshTheme failed", e);
    }
}
async function refreshSave(force = false) {
    try {
        const saveData = await api.getSaveData(force);
        updateState({ saveData });
    }
    catch (e) {
        console.error("[store] refreshSave failed", e);
    }
}
async function refreshMoves() {
    try {
        const movesDatabase = await api.getMovesDatabase();
        updateState({ movesDatabase });
    }
    catch (e) {
        console.error("[store] refreshMoves failed", e);
    }
}
async function refreshLiveState() {
    try {
        const liveState = await api.getLiveState();
        updateState({ liveState });
        return liveState;
    }
    catch (e) {
        console.error("[store] refreshLiveState failed", e);
        return null;
    }
}
async function applySettingsPatch(patch) {
    try {
        const settings = await api.updateSettings(patch);
        updateState({ settings });
        if ("theme" in patch) {
            await refreshTheme();
        }
        return settings;
    }
    catch (e) {
        console.error("[store] applySettingsPatch failed", e);
        throw e;
    }
}
function startPolling() {
    stopPolling();
    // Backend SaveFileWatcher (mtime poll) fires within ~0.3s of any save, so
    // a fast 1.5s frontend poll is the right cadence while the game is
    // actively playing. If we haven't seen a live event in a while, back off
    // to save battery on the Steam Deck.
    const fastMs = 1500;
    const slowMs = 5000;
    const maxBackoffMs = 60000;
    // Initial fetch
    api.getLiveSaveData().then((saveData) => { if (saveData)
        updateState({ saveData }); }).catch(() => { });
    refreshLiveState();
    let consecutiveIdle = 0;
    let errorCount = 0;
    const tick = async () => {
        try {
            const [saveData, live] = await Promise.all([
                api.getLiveSaveData(),
                api.getLiveState(),
            ]);
            if (saveData)
                updateState({ saveData });
            if (live)
                updateState({ liveState: live });
            errorCount = 0;
            const lastAt = live?.last_live_event?.at ?? 0;
            const now = Date.now() / 1000;
            const sinceLast = now - lastAt;
            if (lastAt > 0 && sinceLast < 10) {
                consecutiveIdle = 0;
            }
            else {
                consecutiveIdle += 1;
            }
            const next = consecutiveIdle > 4 ? slowMs : fastMs;
            if (pollTimer !== null) {
                clearTimeout(pollTimer);
                pollTimer = setTimeout(tick, next);
            }
        }
        catch (e) {
            console.error("[store] polling tick failed", e);
            errorCount++;
            const backoff = Math.min(maxBackoffMs, fastMs * Math.pow(2, errorCount));
            console.log(`[store] backoff applied, next poll in ${backoff}ms`);
            if (pollTimer !== null) {
                clearTimeout(pollTimer);
                pollTimer = setTimeout(tick, backoff);
            }
        }
    };
    pollTimer = setTimeout(tick, fastMs);
    console.log(`[store] live frontend polling started (adaptive 1.5s/5s)`);
}
function stopPolling() {
    if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
        console.log("[store] polling stopped");
    }
}
function getState() {
    return state;
}
/**
 * Cheap equality function for SaveData — compares only the fields that
 * uniquely identify a save state. Avoids JSON.stringify on every poll.
 */
function saveDataEqual(a, b) {
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    return (a.parsed_at === b.parsed_at &&
        a.source_path === b.source_path &&
        a.party_count === b.party_count &&
        a.trainer_name === b.trainer_name &&
        a.error === b.error &&
        a.money === b.money);
}
/**
 * Cheap equality for the party array — compares by length + each member's
 * hp + status + species (the fields that change in-battle).
 */
function partyEqual(a, b) {
    if (a === b)
        return true;
    if (!a || !b || a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i];
        if (x.hp !== y.hp || x.status !== y.status || x.species !== y.species || x.level !== y.level) {
            return false;
        }
    }
    return true;
}

class ErrorBoundary extends window.SP_REACT.Component {
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
        return (window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Something went wrong", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx("div", { style: { color: "#e87b7b", fontSize: 13, lineHeight: 1.4 }, children: message }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: this.handleReload, children: "Reload" }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs("details", { style: { fontSize: 11, color: "#888" }, children: [window.SP_JSX.jsx("summary", { style: { cursor: "pointer", color: "#aaa" }, children: "Stack trace" }), window.SP_JSX.jsx("pre", { style: {
                                    marginTop: 6,
                                    padding: 8,
                                    background: "rgba(0,0,0,0.3)",
                                    borderRadius: 4,
                                    fontSize: 10,
                                    color: "#ccc",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                    maxHeight: 240,
                                    overflow: "auto",
                                }, children: stack })] }) })] }));
    }
}

function PokeballIcon({ size = 18, style }) {
    return (window.SP_JSX.jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", style: style, xmlns: "http://www.w3.org/2000/svg", "aria-label": "Pokeball", children: [window.SP_JSX.jsx("circle", { cx: "12", cy: "12", r: "11", fill: "#fff", stroke: "#222", strokeWidth: "1.5" }), window.SP_JSX.jsx("path", { d: "M 1 12 A 11 11 0 0 1 23 12 Z", fill: "#dc2626", stroke: "#222", strokeWidth: "1.5" }), window.SP_JSX.jsx("line", { x1: "1", y1: "12", x2: "23", y2: "12", stroke: "#222", strokeWidth: "1.5" }), window.SP_JSX.jsx("circle", { cx: "12", cy: "12", r: "4", fill: "#fff", stroke: "#222", strokeWidth: "1.5" }), window.SP_JSX.jsx("circle", { cx: "12", cy: "12", r: "1.5", fill: "#222" })] }));
}

function TabBar({ tabs, activeId, onChange }) {
    return (window.SP_JSX.jsx(window.DFL.Focusable, { focusWithinClassName: "gp-tabs-active", style: {
            display: "flex",
            flexDirection: "row",
            gap: "4px",
            padding: "8px 0 6px 0",
            borderBottom: "1px solid #2a2a2a",
            marginBottom: "4px",
        }, children: tabs.map((tab) => {
            const active = tab.id === activeId;
            return (window.SP_JSX.jsx(window.DFL.Focusable, { onOKActionDescription: tab.label, onOKButton: () => !tab.disabled && onChange(tab.id), style: {
                    padding: "6px 10px",
                    background: active ? "rgba(255,255,255,0.08)" : "transparent",
                    color: tab.disabled ? "#555" : active ? "#fff" : "#969696",
                    borderRadius: "4px",
                    cursor: tab.disabled ? "not-allowed" : "pointer",
                    fontSize: "12px",
                    fontWeight: active ? 600 : 500,
                    borderBottom: active ? "2px solid #5eba7d" : "2px solid transparent",
                    transition: "color 120ms, background 120ms",
                    outline: "none",
                }, children: tab.label }, tab.id));
        }) }));
}

const DEFAULT_PALETTE = {
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
    badgeShadow: "0 1px 2px rgba(0,0,0,0.5)",
};
function paletteToCssVars(p) {
    const map = {};
    for (const [k, v] of Object.entries(p)) {
        const varName = "--theme-" + k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
        map[varName] = String(v);
    }
    return map;
}

const TYPE_COLORS = {
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
    Fairy: "#D685AD",
};
const SIZES = {
    sm: { padding: "2px 6px", fontSize: "10px" },
    md: { padding: "3px 8px", fontSize: "12px" },
    lg: { padding: "4px 12px", fontSize: "13px" },
};
function TypeBadge({ type, size = "md", style, dimmed = false }) {
    const color = TYPE_COLORS[type] ?? "#777";
    return (window.SP_JSX.jsx("span", { style: {
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
            ...style,
        }, children: type }));
}

function normalizeKey(name) {
    return (name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const BUCKETS$1 = [
    {
        key: "super_effective",
        label: "Super effective (2×)",
        color: "#ff8a3d",
    },
    {
        key: "not_very_effective",
        label: "Not very effective (½×)",
        color: "#5eba7d",
    },
    {
        key: "no_effect",
        label: "No effect (0×)",
        color: "#888",
    },
];
function MoveLookupTouchMenu() {
    const saveData = useStore((s) => s.saveData);
    const movesDb = useStore((s) => s.movesDatabase);
    const [selectedMove, setSelectedMove] = window.SP_REACT.useState(null);
    const [moveInfo, setMoveInfo] = window.SP_REACT.useState(null);
    const [offense, setOffense] = window.SP_REACT.useState(null);
    const [loading, setLoading] = window.SP_REACT.useState(false);
    window.SP_REACT.useEffect(() => {
        if (!selectedMove) {
            setMoveInfo(null);
            setOffense(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setOffense(null);
        api
            .getMoveInfo(selectedMove)
            .then((info) => {
            if (cancelled)
                return;
            setMoveInfo(info);
            if (info && info.type) {
                return api.getOffenseSummary(info.type).then((off) => {
                    if (!cancelled)
                        setOffense(off);
                });
            }
            return null;
        })
            .catch((e) => console.error("[move-lookup]", e))
            .finally(() => { if (!cancelled)
            setLoading(false); });
        return () => { cancelled = true; };
    }, [selectedMove]);
    if (!saveData || saveData.error) {
        return (window.SP_JSX.jsx("div", { style: {
                padding: 24,
                textAlign: "center",
                color: "#888",
                fontSize: 13,
            }, children: "Load a save first to see party moves." }));
    }
    const party = saveData.party || [];
    const partyMoves = window.SP_REACT.useMemo(() => {
        const out = [];
        for (const p of party) {
            for (const m of p.moves) {
                if (m)
                    out.push({ move: m, owner: p.nickname || p.species });
            }
        }
        return out;
    }, [party]);
    return (window.SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [window.SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    paddingBottom: 4,
                    borderBottom: "1px solid #2a2a2a",
                }, children: [window.SP_JSX.jsx("span", { style: { fontSize: 11, color: "#888", fontWeight: 600 }, children: "PARTY MOVES:" }), partyMoves.map((pm, i) => {
                        const info = movesDb?.moves?.[normalizeKey(pm.move)];
                        const type = info?.type;
                        return (window.SP_JSX.jsxs("button", { onClick: () => setSelectedMove(pm.move), style: {
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "4px 8px",
                                background: selectedMove === pm.move
                                    ? "rgba(94,186,125,0.2)"
                                    : "rgba(255,255,255,0.05)",
                                color: "#ddd",
                                border: selectedMove === pm.move
                                    ? "1px solid #5eba7d"
                                    : "1px solid transparent",
                                borderRadius: 4,
                                cursor: "pointer",
                                fontSize: 11,
                                fontWeight: 500,
                            }, children: [type && window.SP_JSX.jsx(TypeBadge, { type: type, size: "sm" }), window.SP_JSX.jsx("span", { children: pm.move })] }, `${pm.owner}-${pm.move}-${i}`));
                    })] }), !selectedMove && (window.SP_JSX.jsx("div", { style: {
                    padding: 20,
                    textAlign: "center",
                    color: "#888",
                    fontSize: 12,
                    fontStyle: "italic",
                }, children: "Tap a move to see its type and effectiveness" })), selectedMove && loading && (window.SP_JSX.jsx("div", { style: { padding: 16, textAlign: "center", color: "#aaa" }, children: "Loading\u2026" })), selectedMove && !loading && (window.SP_JSX.jsx(MoveDetail, { move: selectedMove, info: moveInfo, offense: offense })), movesDb && (window.SP_JSX.jsxs("div", { style: {
                    fontSize: 10,
                    color: "#555",
                    textAlign: "right",
                    marginTop: 2,
                }, children: [movesDb.merged_count, " moves available", movesDb.pbs_source && (window.SP_JSX.jsxs(window.SP_JSX.Fragment, { children: [" ", "\u00B7 PBS: ", movesDb.pbs_source.split("/").slice(-2).join("/")] }))] }))] }));
}
function MoveDetail({ move, info, offense, }) {
    return (window.SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 10,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 6,
        }, children: [window.SP_JSX.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [window.SP_JSX.jsx("span", { style: {
                            fontSize: 16,
                            fontWeight: 600,
                            color: "#fff",
                            textTransform: "uppercase",
                        }, children: info?.name || move }), info?.type && window.SP_JSX.jsx(TypeBadge, { type: info.type, size: "md" }), window.SP_JSX.jsx("div", { style: { flex: 1 } }), info?.source && (window.SP_JSX.jsxs("span", { style: {
                            fontSize: 9,
                            color: "#666",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                        }, children: [info.source, info.guessed && " (heuristic)"] }))] }), info && (window.SP_JSX.jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                    fontSize: 11,
                    color: "#ccc",
                }, children: [window.SP_JSX.jsx(Detail, { label: "Category", value: info.category }), window.SP_JSX.jsx(Detail, { label: "Power", value: info.power ? String(info.power) : "—" }), window.SP_JSX.jsx(Detail, { label: "Accuracy", value: info.accuracy ? `${info.accuracy}%` : "—" })] })), info?.description && (window.SP_JSX.jsx("div", { style: {
                    fontSize: 11,
                    color: "#888",
                    fontStyle: "italic",
                    lineHeight: 1.4,
                }, children: info.description })), offense?.summary && (window.SP_JSX.jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: BUCKETS$1.map((bucket) => {
                    const types = offense.summary?.[bucket.key] ?? [];
                    if (types.length === 0)
                        return null;
                    return (window.SP_JSX.jsxs("div", { style: {
                            padding: "5px 7px",
                            background: "rgba(255,255,255,0.02)",
                            borderRadius: 4,
                            borderLeft: `3px solid ${bucket.color}`,
                        }, children: [window.SP_JSX.jsxs("div", { style: {
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: bucket.color,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.4,
                                    marginBottom: 3,
                                }, children: [bucket.label, " (", types.length, ")"] }), window.SP_JSX.jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 3 }, children: types.map((t) => (window.SP_JSX.jsx(TypeBadge, { type: t, size: "sm" }, t))) })] }, bucket.key));
                }) }))] }));
}
function Detail({ label, value }) {
    return (window.SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [window.SP_JSX.jsx("div", { style: {
                    fontSize: 9,
                    color: "#777",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                }, children: label }), window.SP_JSX.jsx("div", { style: { fontSize: 12, color: "#ddd" }, children: value })] }));
}

function colorForPercent(pct) {
    if (pct >= 0.5)
        return "#5eba7d";
    if (pct >= 0.25)
        return "#e0a458";
    return "#e87b7b";
}
function statusToBar(statusName) {
    if (!statusName || statusName === "OK")
        return { color: "" };
    const colors = {
        PSN: "#a33ea1",
        PAR: "#e0a458",
        BRN: "#c22e28",
        SLP: "#969696",
        FRZ: "#96d9d6",
        FNT: "#444",
    };
    return { color: colors[statusName] || "#888" };
}
function HealthBar({ hp, maxHp, statusName, width = "100%", showLabel = true, }) {
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
        border: "1px solid rgba(255,255,255,0.1)",
    };
    const fillStyle = {
        width: `${pct * 100}%`,
        height: "100%",
        background: fillColor,
        transition: "width 800ms cubic-bezier(0.25, 1, 0.5, 1), background-color 800ms ease",
    };
    const statusOverlayStyle = status.color
        ? {
            position: "absolute",
            top: 0,
            left: 0,
            width: `${pct * 100}%`,
            height: "100%",
            background: `repeating-linear-gradient(45deg, ${status.color}, ${status.color} 4px, transparent 4px, transparent 8px)`,
            opacity: 0.7,
            pointerEvents: "none",
        }
        : undefined;
    if (statusOverlayStyle) {
        statusOverlayStyle.transition = "width 800ms cubic-bezier(0.25, 1, 0.5, 1)";
    }
    return (window.SP_JSX.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, width: "100%" }, children: [window.SP_JSX.jsxs("div", { style: wrapperStyle, children: [window.SP_JSX.jsx("div", { style: fillStyle }), statusOverlayStyle && window.SP_JSX.jsx("div", { style: statusOverlayStyle })] }), showLabel && (window.SP_JSX.jsxs("div", { style: {
                    fontSize: 11,
                    color: "#bbb",
                    minWidth: 56,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                }, children: [hp, "/", maxHp] }))] }));
}

const STATUS_COLORS$1 = {
    OK: "#5eba7d",
    PSN: "#a33ea1",
    PAR: "#e0a458",
    BRN: "#c22e28",
    SLP: "#969696",
    FRZ: "#96d9d6",
    FNT: "#888",
};
const GENDER_SYMBOLS$1 = {
    M: "♂",
    F: "♀",
    "—": "○",
};
const MAX_SLOTS = 6;
function PartyTouchMenu() {
    const saveData = useStore((s) => s.saveData, saveDataEqual);
    const movesDb = useStore((s) => s.movesDatabase, (a, b) => {
        if (a === b)
            return true;
        if (!a || !b)
            return false;
        return a.merged_count === b.merged_count && a.pbs_source === b.pbs_source;
    });
    if (!saveData) {
        return window.SP_JSX.jsx(EmptyState, { children: "Loading save data\u2026" });
    }
    if (saveData.error === "no_save_file_found") {
        return (window.SP_JSX.jsxs(EmptyState, { children: ["No save file found.", window.SP_JSX.jsx("br", {}), "Configure a path in ", window.SP_JSX.jsx("strong", { children: "Settings" }), "."] }));
    }
    if (saveData.error === "parse_failed") {
        return (window.SP_JSX.jsxs(EmptyState, { children: ["Parse error: ", saveData.message ?? "unknown"] }));
    }
    const party = saveData.party || [];
    const slots = Array.from({ length: MAX_SLOTS }).map((_, i) => party[i] || null);
    const features = saveData.features;
    return (window.SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [window.SP_JSX.jsx(Header, { trainer: saveData.trainer_name, count: party.length, max: MAX_SLOTS, money: features?.items ? saveData.money : 0, badges: saveData.badges, location: saveData.location_name || (saveData.map_id != null ? `Map #${saveData.map_id}` : ""), pbsSource: movesDb?.pbs_source ?? null, features: features }), slots.map((p, i) => p ? (window.SP_JSX.jsx(PartyRow, { pokemon: p, movesDb: movesDb, features: features }, `slot-${i}`)) : (window.SP_JSX.jsx(EmptySlot, { index: i }, `slot-${i}`)))] }));
}
function Header({ trainer, count, max, money, badges, location, pbsSource, features, }) {
    return (window.SP_JSX.jsxs("div", { style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "4px 8px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 4,
            fontSize: 12,
            color: "#ccc",
            flexWrap: "wrap",
        }, children: [window.SP_JSX.jsx("span", { style: { fontWeight: 600, color: "#fff" }, children: trainer || "Trainer" }), window.SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), window.SP_JSX.jsxs("span", { children: ["Party ", count, "/", max] }), features?.items && money > 0 && (window.SP_JSX.jsxs(window.SP_JSX.Fragment, { children: [window.SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), window.SP_JSX.jsxs("span", { children: ["\u20BD", money.toLocaleString("en-US")] })] })), badges > 0 && (window.SP_JSX.jsxs(window.SP_JSX.Fragment, { children: [window.SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), window.SP_JSX.jsxs("span", { style: { color: "#f7d02c" }, children: [badges, " \uD83C\uDFC6"] })] })), location && (window.SP_JSX.jsxs(window.SP_JSX.Fragment, { children: [window.SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), window.SP_JSX.jsx("span", { style: { color: "#888" }, children: location })] })), pbsSource && (window.SP_JSX.jsx("span", { style: {
                    marginLeft: "auto",
                    fontSize: 9,
                    color: "#5eba7d",
                    background: "rgba(94,186,125,0.1)",
                    padding: "1px 4px",
                    borderRadius: 2,
                }, title: pbsSource, children: "PBS \u2713" }))] }));
}
function PartyRow({ pokemon: p, movesDb, features, }) {
    const statusColor = STATUS_COLORS$1[p.status_name] ?? "#888";
    const showStats = p.has_stats;
    const showGender = p.has_gender_data;
    const showType2 = p.has_type2 && p.type2;
    const showMoves = p.has_moves && p.moves.length > 0;
    return (window.SP_JSX.jsxs("div", { style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 5,
            borderLeft: `3px solid ${statusColor}`,
            opacity: p.is_fainted ? 0.55 : 1,
        }, children: [window.SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    minWidth: 24,
                    gap: 1,
                }, children: [p.shiny && (window.SP_JSX.jsx("span", { style: { color: "#f7d02c", fontSize: 11, lineHeight: 1 }, children: "\u2605" })), showGender && (window.SP_JSX.jsx("span", { style: {
                            color: p.gender_name === "F"
                                ? "#e87ba3"
                                : p.gender_name === "M"
                                    ? "#7ba3e8"
                                    : "#888",
                            fontSize: 12,
                            fontWeight: 700,
                            lineHeight: 1,
                        }, children: GENDER_SYMBOLS$1[p.gender_name] ?? "?" }))] }), window.SP_JSX.jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [window.SP_JSX.jsxs("div", { style: {
                            display: "flex",
                            alignItems: "baseline",
                            gap: 8,
                            marginBottom: 4,
                            flexWrap: "wrap",
                        }, children: [window.SP_JSX.jsx("span", { style: {
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "#fff",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: 180,
                                }, children: p.nickname || p.species }), window.SP_JSX.jsxs("span", { style: { fontSize: 10, color: "#888" }, children: ["Lv.", p.level] }), p.nature && (window.SP_JSX.jsx("span", { style: { fontSize: 9, color: "#888" }, children: p.nature })), window.SP_JSX.jsx("div", { style: { flex: 1 } }), window.SP_JSX.jsxs("div", { style: { display: "flex", gap: 3 }, children: [p.type1 && window.SP_JSX.jsx(TypeBadge, { type: p.type1, size: "sm" }), showType2 && window.SP_JSX.jsx(TypeBadge, { type: p.type2, size: "sm" })] })] }), window.SP_JSX.jsx(HealthBar, { hp: p.hp, maxHp: p.max_hp, statusName: p.status_name, showLabel: false }), window.SP_JSX.jsxs("div", { style: {
                            display: "flex",
                            gap: 8,
                            fontSize: 10,
                            color: "#888",
                            marginTop: 3,
                            alignItems: "center",
                            flexWrap: "wrap",
                        }, children: [window.SP_JSX.jsxs("span", { children: [p.hp, "/", p.max_hp] }), window.SP_JSX.jsx("span", { style: { color: statusColor, fontWeight: 600 }, children: p.status_name }), p.ability && (window.SP_JSX.jsxs("span", { children: [window.SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), " ", p.ability] })), p.item && (window.SP_JSX.jsxs("span", { children: [window.SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), " ", p.item] })), features?.happiness && p.happiness != null && (window.SP_JSX.jsxs("span", { style: { color: "#e87ba3" }, children: ["\u2665", p.happiness] })), showStats && p.speed != null && (window.SP_JSX.jsxs("span", { style: { color: "#666" }, children: ["SPE:", p.speed] }))] }), showMoves && (window.SP_JSX.jsx("div", { style: {
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 4,
                            marginTop: 5,
                        }, children: p.moves.map((m, i) => {
                            const type = movesDb?.moves?.[normalizeKey(m)]?.type;
                            return (window.SP_JSX.jsxs("span", { style: {
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                    padding: "1px 5px",
                                    background: "rgba(255,255,255,0.05)",
                                    borderRadius: 3,
                                    fontSize: 10,
                                    color: "#ccc",
                                }, children: [type && window.SP_JSX.jsx(TypeBadge, { type: type, size: "sm" }), m] }, i));
                        }) }))] })] }));
}
function EmptySlot({ index }) {
    return (window.SP_JSX.jsxs("div", { style: {
            padding: 8,
            background: "rgba(255,255,255,0.02)",
            borderRadius: 4,
            border: "1px dashed #333",
            textAlign: "center",
            fontSize: 11,
            color: "#555",
            fontStyle: "italic",
        }, children: ["Slot ", index + 1, " \u2014 empty"] }));
}
function EmptyState({ children }) {
    return (window.SP_JSX.jsx("div", { style: {
            padding: 24,
            textAlign: "center",
            color: "#888",
            fontSize: 13,
            lineHeight: 1.5,
        }, children: children }));
}

const BUCKETS = [
    {
        key: "super_effective",
        label: "Super effective (2×)",
        color: "#ff8a3d",
    },
    {
        key: "not_very_effective",
        label: "Not very effective (½×)",
        color: "#5eba7d",
    },
    {
        key: "no_effect",
        label: "No effect (0×)",
        color: "#888",
    },
];
function TypeLookupTouchMenu() {
    const typeChart = useStore((s) => s.typeChart);
    const [attacker, setAttacker] = window.SP_REACT.useState("Fire");
    const [summary, setSummary] = window.SP_REACT.useState(null);
    const [error, setError] = window.SP_REACT.useState(null);
    window.SP_REACT.useEffect(() => {
        if (!attacker)
            return;
        setSummary(null);
        setError(null);
        api
            .getOffenseSummary(attacker)
            .then((s) => {
            if ("error" in s && s.error) {
                setError(s.error);
            }
            else {
                setSummary(s);
            }
        })
            .catch((e) => setError(e.message));
    }, [attacker]);
    if (!typeChart) {
        return (window.SP_JSX.jsx("div", { style: {
                padding: 24,
                textAlign: "center",
                color: "#888",
                fontSize: 13,
            }, children: "Loading type chart\u2026" }));
    }
    return (window.SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [window.SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "#aaa",
                }, children: [window.SP_JSX.jsx("span", { children: "Attacker:" }), window.SP_JSX.jsx("select", { value: attacker, onChange: (e) => setAttacker(e.target.value), style: {
                            flex: 1,
                            padding: "6px 8px",
                            background: "#1a1a1a",
                            color: "#fff",
                            border: "1px solid #444",
                            borderRadius: 4,
                            fontSize: 13,
                            outline: "none",
                        }, children: typeChart.types.map((t) => (window.SP_JSX.jsx("option", { value: t, children: t }, t))) }), window.SP_JSX.jsx(TypeBadge, { type: attacker, size: "md" })] }), error && (window.SP_JSX.jsx("div", { style: { color: "#e87b7b", fontSize: 12, padding: "4px 0" }, children: error })), summary?.summary && (window.SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [BUCKETS.map((bucket) => {
                        const types = summary.summary?.[bucket.key] ?? [];
                        if (types.length === 0)
                            return null;
                        return (window.SP_JSX.jsxs("div", { style: {
                                padding: "6px 8px",
                                background: "rgba(255,255,255,0.03)",
                                borderRadius: 4,
                                borderLeft: `3px solid ${bucket.color}`,
                            }, children: [window.SP_JSX.jsxs("div", { style: {
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: bucket.color,
                                        textTransform: "uppercase",
                                        letterSpacing: 0.4,
                                        marginBottom: 4,
                                    }, children: [bucket.label, " (", types.length, ")"] }), window.SP_JSX.jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 }, children: types.map((t) => (window.SP_JSX.jsx(TypeBadge, { type: t, size: "sm" }, t))) })] }, bucket.key));
                    }), window.SP_JSX.jsxs("div", { style: {
                            fontSize: 10,
                            color: "#555",
                            textAlign: "right",
                            marginTop: 2,
                        }, children: ["Generation ", typeChart.generation, " type chart"] })] }))] }));
}

function CoachModeWidget() {
    const analysis = useStore((s) => s.liveState?.battle_analysis);
    const coach_suggestion = analysis?.coach_suggestion;
    if (!coach_suggestion)
        return null;
    return (window.SP_JSX.jsxs("div", { style: {
            padding: "8px",
            backgroundColor: "rgba(255, 204, 0, 0.15)",
            border: "1px solid rgba(255, 204, 0, 0.5)",
            borderRadius: "4px",
            marginBottom: "8px",
        }, children: [window.SP_JSX.jsx("div", { style: { color: "#ffcc00", fontWeight: "bold", fontSize: "12px", marginBottom: "2px" }, children: "COACH SUGGESTION" }), window.SP_JSX.jsxs("div", { style: { fontSize: "13px", color: "#fff" }, children: ["Switch to ", window.SP_JSX.jsx("strong", { children: coach_suggestion.suggested_pokemon })] }), window.SP_JSX.jsx("div", { style: { fontSize: "11px", color: "#ddd", marginTop: "2px" }, children: coach_suggestion.reason })] }));
}
function NuzlockeCounterWidget() {
    const party = useStore((s) => s.saveData?.party);
    if (!party)
        return null;
    const faintedCount = party.filter((p) => p.is_fainted).length;
    return (window.SP_JSX.jsxs("div", { style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px",
            backgroundColor: "rgba(0,0,0,0.3)",
            borderRadius: "4px",
            marginBottom: "8px",
            fontSize: "12px",
            fontWeight: "bold",
        }, children: [window.SP_JSX.jsx("span", { style: { color: "#ddd" }, children: "Fainted (Nuzlocke):" }), window.SP_JSX.jsx("span", { style: { color: faintedCount > 0 ? "#e05858" : "#5eba7d" }, children: faintedCount })] }));
}
const TABS$1 = [
    { id: "party", label: "Party" },
    { id: "types", label: "Type Lookup" },
    { id: "moves", label: "Move Lookup" },
];
function TouchMenuContent() {
    const [tab, setTab] = window.SP_REACT.useState("party");
    return (window.SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "10px 12px 14px 12px",
            minWidth: 360,
            maxWidth: 720,
        }, children: [window.SP_JSX.jsx("div", { style: {
                    display: "flex",
                    gap: 6,
                    paddingBottom: 4,
                    borderBottom: "1px solid #2a2a2a",
                }, children: TABS$1.map((t) => (window.SP_JSX.jsx(TabButton, { active: tab === t.id, onClick: () => setTab(t.id), children: t.label }, t.id))) }), window.SP_JSX.jsx(CoachModeWidget, {}), window.SP_JSX.jsx(NuzlockeCounterWidget, {}), tab === "party" && window.SP_JSX.jsx(PartyTouchMenu, {}), tab === "types" && window.SP_JSX.jsx(TypeLookupTouchMenu, {}), tab === "moves" && window.SP_JSX.jsx(MoveLookupTouchMenu, {})] }));
}
function TabButton({ active, onClick, children, }) {
    return (window.SP_JSX.jsx("button", { onClick: onClick, style: {
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
            letterSpacing: 0.4,
        }, children: children }));
}

// PatchTouchMenu may not exist in all @decky/ui versions — access it
// dynamically and guard at runtime.
const PatchTouchMenu = window.DFL.PatchTouchMenu;
let unpatch = null;
function registerTouchMenu() {
    if (unpatch)
        return;
    if (typeof PatchTouchMenu !== "function") {
        console.warn("[pokemon-overlay] PatchTouchMenu not available in this Decky version, skipping touch menu");
        return;
    }
    try {
        unpatch = PatchTouchMenu({
            menuLabel: "Pokémon Essentials",
            icon: window.SP_JSX.jsx(PokeballIcon, {}),
            content: window.SP_JSX.jsx(TouchMenuContent, {}),
            onMenuClose: () => {
                console.log("[pokemon-overlay] touch menu closed");
            },
        });
        console.log("[pokemon-overlay] touch menu registered");
    }
    catch (e) {
        console.warn("[pokemon-overlay] touch menu registration failed", e);
    }
}
function unregisterTouchMenu() {
    if (unpatch) {
        try {
            unpatch();
        }
        catch (e) {
            console.error("[pokemon-overlay] unpatch error", e);
        }
        unpatch = null;
        console.log("[pokemon-overlay] touch menu unregistered");
    }
}

const STATUS_COLORS = {
    OK: "#5eba7d",
    PSN: "#a33ea1",
    PAR: "#e0a458",
    BRN: "#c22e28",
    SLP: "#969696",
    FRZ: "#96d9d6",
    FNT: "#888",
};
const GENDER_SYMBOLS = {
    M: "♂",
    F: "♀",
    "—": "○",
};
const DEFAULT_DISPLAY = {
    stats: true,
    ivs: true,
    evs: true,
    nature: true,
    ability: true,
    item: true,
    happiness: true,
    gender: true,
    moves: true,
    type2: true,
};
function statColor(v, max) {
    const pct = v / max;
    if (pct >= 0.9)
        return "#5eba7d";
    if (pct >= 0.5)
        return "#e0a458";
    if (pct >= 0.25)
        return "#e87b7b";
    return "#777";
}
function resolveDisplay(p, features, forced) {
    const f = features;
    return {
        stats: (forced?.stats ?? true) &&
            (p.has_stats || (f?.stats ?? false)),
        ivs: (forced?.ivs ?? true) && (p.has_ivs || (f?.ivs ?? false)),
        evs: (forced?.evs ?? true) &&
            (p.has_evs || (f?.evs ?? false)) &&
            (p.has_ivs || (f?.ivs ?? false)),
        nature: (forced?.nature ?? true) && (p.has_nature || (f?.natures ?? false)),
        ability: (forced?.ability ?? true) && (p.has_ability || (f?.abilities ?? false)),
        item: (forced?.item ?? true) && (p.has_item || (f?.items ?? false)),
        happiness: (forced?.happiness ?? true) &&
            (p.has_happiness || (f?.happiness ?? false)),
        gender: (forced?.gender ?? true) &&
            (p.has_gender_data || (f?.gender ?? false)),
        moves: (forced?.moves ?? true) && (p.has_moves || (f?.moves ?? false)),
        type2: (forced?.type2 ?? true) && (p.has_type2 ?? false),
    };
}
function PokemonCard({ pokemon: p, features, forced }) {
    const display = resolveDisplay(p, features, forced);
    const displayName = p.nickname || p.species;
    const statusColor = STATUS_COLORS[p.status_name] ?? "#888";
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
        compactInfo.push({ label: "♥", value: String(p.happiness) });
    }
    return (window.SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 10,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 6,
            borderLeft: `3px solid ${statusColor}`,
            opacity: fainted ? 0.6 : 1,
        }, children: [window.SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                }, children: [p.shiny && (window.SP_JSX.jsx("span", { style: {
                            color: "#f7d02c",
                            fontSize: 14,
                            textShadow: "0 0 4px rgba(247, 208, 44, 0.5)",
                        }, title: "Shiny", children: "\u2605" })), window.SP_JSX.jsx("span", { style: {
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#fff",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }, children: displayName }), window.SP_JSX.jsxs("span", { style: { fontSize: 11, color: "#888" }, children: ["Lv.", p.level] }), display.gender && (window.SP_JSX.jsx("span", { style: {
                            fontSize: 12,
                            color: p.gender_name === "F"
                                ? "#e87ba3"
                                : p.gender_name === "M"
                                    ? "#7ba3e8"
                                    : "#888",
                            fontWeight: 700,
                            marginLeft: "auto",
                        }, title: p.gender_name === "—"
                            ? "Genderless"
                            : p.gender_name === "M"
                                ? "Male"
                                : "Female", children: GENDER_SYMBOLS[p.gender_name] ?? "?" }))] }), p.nickname && p.nickname !== p.species && (window.SP_JSX.jsx("div", { style: {
                    fontSize: 11,
                    color: "#888",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                }, children: p.species })), window.SP_JSX.jsxs("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" }, children: [p.type1 && window.SP_JSX.jsx(TypeBadge, { type: p.type1, size: "sm" }), display.type2 && p.has_type2 && p.type2 && (window.SP_JSX.jsx(TypeBadge, { type: p.type2, size: "sm" }))] }), window.SP_JSX.jsx(HealthBar, { hp: p.hp, maxHp: p.max_hp, statusName: p.status_name }), window.SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 11,
                    color: "#aaa",
                    flexWrap: "wrap",
                }, children: [window.SP_JSX.jsx("span", { children: window.SP_JSX.jsx("span", { style: { color: statusColor, fontWeight: 600 }, children: p.status_name }) }), compactInfo.map((c) => (window.SP_JSX.jsxs("span", { children: [window.SP_JSX.jsxs("span", { style: { color: "#777" }, children: [c.label, ":"] }), " ", c.value] }, c.label)))] }), display.moves && p.moves.length > 0 && (window.SP_JSX.jsx("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 4,
                    marginTop: 2,
                }, children: Array.from({ length: 4 }).map((_, i) => {
                    const move = p.moves[i];
                    return (window.SP_JSX.jsx("div", { style: {
                            fontSize: 11,
                            padding: "3px 6px",
                            background: move ? "rgba(255,255,255,0.05)" : "transparent",
                            borderRadius: 3,
                            color: move ? "#ddd" : "#555",
                            fontStyle: move ? "normal" : "italic",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }, children: move ?? "—" }, i));
                }) })), display.stats && p.has_stats && (window.SP_JSX.jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                    gap: 4,
                    padding: "6px 0",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    fontSize: 10,
                }, children: [window.SP_JSX.jsx(StatBox, { label: "ATK", value: p.attack }), window.SP_JSX.jsx(StatBox, { label: "DEF", value: p.defense }), window.SP_JSX.jsx(StatBox, { label: "SpA", value: p.spatk }), window.SP_JSX.jsx(StatBox, { label: "SpD", value: p.spdef }), window.SP_JSX.jsx(StatBox, { label: "SPE", value: p.speed })] })), display.ivs && p.has_ivs && p.iv_total != null && (window.SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "6px 0",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    fontSize: 10,
                }, children: [window.SP_JSX.jsxs("div", { style: {
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                            gap: 4,
                        }, children: [window.SP_JSX.jsx(IVStat, { label: "HP", value: p.iv_hp }), window.SP_JSX.jsx(IVStat, { label: "ATK", value: p.iv_attack }), window.SP_JSX.jsx(IVStat, { label: "DEF", value: p.iv_defense }), window.SP_JSX.jsx(IVStat, { label: "SpA", value: p.iv_spatk }), window.SP_JSX.jsx(IVStat, { label: "SpD", value: p.iv_spdef }), window.SP_JSX.jsx(IVStat, { label: "SPE", value: p.iv_speed })] }), display.evs && p.has_evs && p.ev_total != null && (window.SP_JSX.jsxs("div", { style: {
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                            gap: 4,
                            color: "#666",
                        }, children: [window.SP_JSX.jsx(EVStat, { label: "HP", value: p.ev_hp }), window.SP_JSX.jsx(EVStat, { label: "ATK", value: p.ev_attack }), window.SP_JSX.jsx(EVStat, { label: "DEF", value: p.ev_defense }), window.SP_JSX.jsx(EVStat, { label: "SpA", value: p.ev_spatk }), window.SP_JSX.jsx(EVStat, { label: "SpD", value: p.ev_spdef }), window.SP_JSX.jsx(EVStat, { label: "SPE", value: p.ev_speed })] })), window.SP_JSX.jsxs("div", { style: {
                            fontSize: 10,
                            color: "#888",
                            display: "flex",
                            gap: 8,
                            marginTop: 2,
                        }, children: [window.SP_JSX.jsxs("span", { children: ["IV: ", p.iv_total, "/186", " ", window.SP_JSX.jsx("span", { style: { color: statColor(p.iv_total, 186) }, children: "\u25CF" })] }), display.evs && p.has_evs && p.ev_total != null && (window.SP_JSX.jsxs("span", { children: ["EV: ", p.ev_total, "/510", " ", window.SP_JSX.jsx("span", { style: { color: statColor(p.ev_total, 510) }, children: "\u25CF" })] }))] })] }))] }));
}
function StatBox({ label, value }) {
    return (window.SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
        }, children: [window.SP_JSX.jsx("div", { style: {
                    fontSize: 9,
                    color: "#777",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                }, children: label }), window.SP_JSX.jsx("div", { style: {
                    fontSize: 12,
                    color: "#ddd",
                    fontVariantNumeric: "tabular-nums",
                }, children: value ?? "—" })] }));
}
function IVStat({ label, value, }) {
    return (window.SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
        }, title: value == null ? "?" : `${value}/31`, children: [window.SP_JSX.jsx("div", { style: {
                    fontSize: 9,
                    color: "#5eba7d",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                }, children: label }), window.SP_JSX.jsx("div", { style: {
                    fontSize: 11,
                    color: value == null ? "#555" : statColor(value, 31),
                    fontVariantNumeric: "tabular-nums",
                }, children: value ?? "—" })] }));
}
function EVStat({ label, value, }) {
    return (window.SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
        }, title: value == null ? "?" : `${value} EVs`, children: [window.SP_JSX.jsx("div", { style: {
                    fontSize: 9,
                    color: "#7ba3e8",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                }, children: label }), window.SP_JSX.jsx("div", { style: {
                    fontSize: 10,
                    color: value == null ? "#555" : "#aaa",
                    fontVariantNumeric: "tabular-nums",
                }, children: value ?? "—" })] }));
}
function CapabilitiesSummary({ features }) {
    if (!features)
        return null;
    const items = [];
    if (features.ivs)
        items.push(["IVs", "Available"]);
    if (features.evs)
        items.push(["EVs", "Available"]);
    if (features.happiness)
        items.push(["Friendship", "Available"]);
    if (features.shiny)
        items.push(["Shiny", "Supported"]);
    if (features.stats)
        items.push(["Stats", "Available"]);
    if (features.natures)
        items.push(["Natures", "Available"]);
    if (features.abilities)
        items.push(["Abilities", "Available"]);
    if (features.items)
        items.push(["Held items", "Available"]);
    if (features.type2)
        items.push(["Dual-types", "Available"]);
    if (features.moves)
        items.push(["Moves", "Available"]);
    if (items.length === 0)
        return null;
    return (window.SP_JSX.jsx("div", { style: {
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            fontSize: 10,
            color: "#888",
        }, children: items.map(([label, _value]) => (window.SP_JSX.jsx("span", { style: {
                background: "rgba(94,186,125,0.1)",
                color: "#5eba7d",
                padding: "2px 6px",
                borderRadius: 3,
                border: "1px solid rgba(94,186,125,0.2)",
            }, children: label }, label))) }));
}

function StatusDot({ ok }) {
    return (window.SP_JSX.jsx("span", { style: {
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            marginRight: 8,
            backgroundColor: ok ? "#5eba7d" : "#e0a458",
            boxShadow: ok
                ? "0 0 4px rgba(94, 186, 125, 0.6)"
                : "0 0 4px rgba(224, 164, 88, 0.6)",
        } }));
}
function timeAgo$1(epoch) {
    if (!epoch)
        return "never";
    const delta = Date.now() / 1000 - epoch;
    if (delta < 5)
        return "just now";
    if (delta < 60)
        return `${Math.floor(delta)}s ago`;
    if (delta < 3600)
        return `${Math.floor(delta / 60)}m ago`;
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
        return (window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Pok\u00E9mon Essentials Overlay", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { onActivate: () => { }, style: {
                            color: "#e0a458",
                            fontSize: 12,
                            padding: "8px 0",
                        }, children: "Plugin data isn't loaded yet. The Decky Loader may be reloading the plugin in the background." }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { onActivate: () => { }, style: {
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "4px 0",
                        }, children: [window.SP_JSX.jsx("span", { style: { fontSize: 13, color: "#969696" }, children: "Loading\u2026" }), window.SP_JSX.jsx("span", { style: {
                                    fontSize: 11,
                                    color: "#56b4e9",
                                    cursor: "pointer",
                                    textDecoration: "underline",
                                }, onClick: () => {
                                    retryRefreshStatic();
                                }, children: "Reload" })] }) })] }));
    }
    return (window.SP_JSX.jsxs(window.SP_JSX.Fragment, { children: [window.SP_JSX.jsx(window.DFL.PanelSection, { title: "About", children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { onActivate: () => { }, style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            padding: "4px 0",
                        }, children: [window.SP_JSX.jsxs("div", { style: { fontSize: 14, fontWeight: 600 }, children: [String(info.name), " ", window.SP_JSX.jsxs("span", { style: { color: "#969696", fontWeight: 400 }, children: ["v", String(info.version)] })] }), window.SP_JSX.jsx("div", { style: {
                                    fontSize: 12,
                                    color: "#969696",
                                    lineHeight: 1.4,
                                }, children: String(info.description) })] }) }) }), window.SP_JSX.jsx(window.DFL.PanelSection, { title: "Status", children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { onActivate: () => { }, style: {
                            fontSize: 12,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            padding: "4px 0",
                        }, children: [window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx(StatusDot, { ok: info.initialized }), info.initialized ? "Backend ready" : "Backend not initialized"] }), window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx(StatusDot, { ok: info.type_chart_loaded }), info.type_chart_loaded
                                        ? `Type chart loaded (${info.type_chart_types} types)`
                                        : "Type chart not loaded"] }), window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx(StatusDot, { ok: movesDb?.loaded ?? false }), movesDb?.loaded
                                        ? movesDb.pbs_source
                                            ? `Moves DB: ${movesDb.merged_count} (PBS loaded)`
                                            : `Moves DB: ${movesDb.static_count} static only`
                                        : "Moves DB not loaded"] }), live && (window.SP_JSX.jsxs(window.SP_JSX.Fragment, { children: [window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx(StatusDot, { ok: live.game_running }), live.game_running
                                                ? `Game running: ${live.detected_game_name || String(live.active_process?.name ?? "unknown")} (pid ${String(live.active_process?.pid ?? "?")})`
                                                : "No game process detected"] }), live.game_running && live.stream_status && (window.SP_JSX.jsxs("div", { style: { marginTop: 4, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.05)" }, children: [window.SP_JSX.jsx("div", { style: { fontSize: 10, color: "#777", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }, children: "Live Injection Status" }), window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx(StatusDot, { ok: live.stream_status.listening }), live.stream_status.listening
                                                        ? "Stream server listening on 127.0.0.1:9988"
                                                        : "Stream server not started"] }), window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx(StatusDot, { ok: live.stream_status.connected }), live.stream_status.connected
                                                        ? `Game mod connected${live.stream_status.last_data_trainer ? ` (trainer: ${live.stream_status.last_data_trainer})` : ""}`
                                                        : "Game mod not connected"] }), live.stream_status.total_frames > 0 ? (window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx(StatusDot, { ok: true }), `Injection active — ${live.stream_status.total_frames} frames received` +
                                                        (live.stream_status.last_data_at
                                                            ? ` · last ${timeAgo$1(live.stream_status.last_data_at)}`
                                                            : "")] })) : (window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx(StatusDot, { ok: false }), live.stream_status.listening
                                                        ? "Waiting for game mod data…"
                                                        : "Injection not started"] }))] })), window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx(StatusDot, { ok: live.watcher_active }), live.watcher_active
                                                ? `Save watcher active${live.last_live_event?.at
                                                    ? ` · last event ${timeAgo$1(live.last_live_event.at)}`
                                                    : ""}`
                                                : "Save watcher inactive"] }), settings?.live_memory_enabled && (window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx(StatusDot, { ok: live.live_source === "memory" }), live.live_source === "memory"
                                                ? `Live memory reading active (pid ${live.active_process?.pid ?? "?"})`
                                                : `Live memory idle · ${live.memory_failure_log?.length ? `last: ${live.memory_failure_log[live.memory_failure_log.length - 1]}` : "disk fallback"}`] }))] })), saveData && !saveData.error && saveData.features && (window.SP_JSX.jsxs("div", { style: {
                                    marginTop: 4,
                                    paddingTop: 6,
                                    borderTop: "1px solid rgba(255,255,255,0.05)",
                                }, children: [window.SP_JSX.jsxs("div", { style: {
                                            fontSize: 10,
                                            color: "#777",
                                            textTransform: "uppercase",
                                            letterSpacing: 0.4,
                                            marginBottom: 4,
                                        }, children: ["Save features (", saveData.version, ")"] }), window.SP_JSX.jsx(CapabilitiesSummary, { features: saveData.features })] })), party && (window.SP_JSX.jsxs("div", { style: {
                                    marginTop: 8,
                                    backgroundColor: "rgba(0,0,0,0.2)",
                                    color: "#ddd",
                                    padding: "8px 12px",
                                    borderRadius: "4px",
                                    fontSize: "13px",
                                    fontWeight: "bold",
                                    display: "flex",
                                    justifyContent: "space-between"
                                }, children: [window.SP_JSX.jsx("span", { children: "Fainted Pok\u00E9mon (Nuzlocke):" }), window.SP_JSX.jsx("span", { style: { color: faintedCount > 0 ? "#e05858" : "#5eba7d" }, children: faintedCount })] }))] }) }) }), window.SP_JSX.jsx(window.DFL.PanelSection, { title: "Roadmap", children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { onActivate: () => { }, style: {
                            fontSize: 12,
                            color: "#969696",
                            lineHeight: 1.6,
                        }, children: [window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx("span", { style: { color: "#5eba7d" }, children: "\u25CF" }), " Phase 1 \u2014 Foundation"] }), window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx("span", { style: { color: "#5eba7d" }, children: "\u25CF" }), " Phase 2 \u2014 Interactive type chart"] }), window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx("span", { style: { color: "#5eba7d" }, children: "\u25CF" }), " Phase 3 \u2014 Save-file parser & party status"] }), window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx("span", { style: { color: "#5eba7d" }, children: "\u25CF" }), " Phase 4 \u2014 In-game TouchMenu overlay"] }), window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsx("span", { style: { color: "#5eba7d" }, children: "\u25CF" }), " Phase 5 \u2014 Live PBS, IV/EV, dynamic UI, themes, watcher"] })] }) }) })] }));
}

function formatMoney(n) {
    return `₽${n.toLocaleString("en-US")}`;
}
function formatPlayTime(seconds) {
    if (!seconds || seconds < 0)
        return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0)
        return `${h}h ${m}m`;
    if (m > 0)
        return `${m}m ${s}s`;
    return `${s}s`;
}
function timeAgo(epochSeconds) {
    if (!epochSeconds)
        return "never";
    const delta = Date.now() / 1000 - epochSeconds;
    if (delta < 5)
        return "just now";
    if (delta < 60)
        return `${Math.floor(delta)}s ago`;
    if (delta < 3600)
        return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86400)
        return `${Math.floor(delta / 3600)}h ago`;
    return `${Math.floor(delta / 86400)}d ago`;
}
const MAX_PARTY_SLOTS = 6;
function PartyView() {
    const data = useStore((s) => s.saveData, saveDataEqual);
    const settings = useStore((s) => s.settings);
    const [reloading, setReloading] = window.SP_REACT.useState(false);
    const reload = window.SP_REACT.useCallback(async () => {
        setReloading(true);
        try {
            await refreshSave(true);
        }
        finally {
            setReloading(false);
        }
    }, []);
    if (!data) {
        return (window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Party", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { onActivate: () => { }, style: {
                            color: "#e0a458",
                            fontSize: 12,
                            padding: "4px 0",
                        }, children: "Save data isn't loaded yet. The Decky Loader may be reloading the plugin in the background." }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: () => {
                            retryRefreshStatic();
                        }, children: "Reload" }) })] }));
    }
    if (data.error === "no_save_file_found") {
        return (window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Party", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { onActivate: () => { }, style: { fontSize: 13, color: "#969696", lineHeight: 1.5 }, children: ["No save file found. Start the game and save once, or set a manual path in ", window.SP_JSX.jsx("strong", { children: "Settings" }), "."] }) }), window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: reload, disabled: reloading, children: reloading ? "Scanning…" : "Scan again" })] }));
    }
    if (data.error === "parse_failed") {
        return (window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Party", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { onActivate: () => { }, children: [window.SP_JSX.jsxs("div", { style: { color: "#e87b7b", fontSize: 13 }, children: ["Parse error: ", data.message] }), window.SP_JSX.jsx("div", { style: {
                                    fontSize: 11,
                                    color: "#777",
                                    marginTop: 6,
                                    wordBreak: "break-all",
                                }, children: data.path })] }) }), window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: reload, disabled: reloading, children: "Try again" })] }));
    }
    const compactMode = settings?.compact_mode ?? true;
    return (window.SP_JSX.jsx(PartyContent, { data: data, reloading: reloading, onReload: reload, autoRefreshSeconds: settings?.scan_interval_seconds ?? 30, forced: compactMode ? undefined : DEFAULT_DISPLAY }));
}
function PartyContent({ data, reloading, onReload, autoRefreshSeconds, forced, }) {
    const party = data.party || [];
    const slots = Array.from({ length: MAX_PARTY_SLOTS }).map((_, i) => party[i] || null);
    return (window.SP_JSX.jsxs(window.SP_JSX.Fragment, { children: [window.SP_JSX.jsxs(window.DFL.PanelSection, { title: data.trainer_name || "Trainer", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { onActivate: () => { }, style: {
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 4,
                                fontSize: 12,
                            }, children: [window.SP_JSX.jsx(Stat, { label: "Money", value: formatMoney(data.money) }), window.SP_JSX.jsx(Stat, { label: "Badges", value: String(data.badges) }), window.SP_JSX.jsx(Stat, { label: "Location", value: data.location_name || `Map #${data.map_id ?? "?"}` }), window.SP_JSX.jsx(Stat, { label: "Position", value: `${data.x ?? "?"}, ${data.y ?? "?"}` }), window.SP_JSX.jsx(Stat, { label: "Play time", value: formatPlayTime(data.play_time_seconds) }), window.SP_JSX.jsx(Stat, { label: "Version", value: data.version })] }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { onActivate: () => { }, style: { fontSize: 11, color: "#777" }, children: ["Updated ", timeAgo(data.parsed_at), " \u00B7 auto-refresh every", " ", Math.max(5, autoRefreshSeconds), "s"] }) }), window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: onReload, disabled: reloading, children: reloading ? "Reloading…" : "Reload from disk" })] }), data.features && (window.SP_JSX.jsx(window.DFL.PanelSection, { title: "Detected features", children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { onActivate: () => { }, children: window.SP_JSX.jsx(CapabilitiesSummary, { features: data.features }) }) }) })), window.SP_JSX.jsx(window.DFL.PanelSection, { title: `Party (${party.length}/${MAX_PARTY_SLOTS})`, children: slots.map((p, i) => p ? (window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(PokemonCard, { pokemon: p, features: data.features, forced: forced }) }, `slot-${i}`)) : (window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { onActivate: () => { }, style: {
                            padding: 10,
                            background: "rgba(255,255,255,0.02)",
                            borderRadius: 6,
                            border: "1px dashed #333",
                            textAlign: "center",
                            fontSize: 11,
                            color: "#555",
                            fontStyle: "italic",
                        }, children: ["Slot ", i + 1, " \u2014 empty"] }) }, `slot-${i}`))) }), window.SP_JSX.jsx(window.DFL.PanelSection, { title: "Source", children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { onActivate: () => { }, style: {
                            fontSize: 10,
                            color: "#666",
                            wordBreak: "break-all",
                            lineHeight: 1.4,
                        }, children: data.source_path }) }) })] }));
}
function Stat({ label, value }) {
    return (window.SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [window.SP_JSX.jsx("div", { style: {
                    fontSize: 10,
                    color: "#777",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                }, children: label }), window.SP_JSX.jsx("div", { style: { fontSize: 12, color: "#ddd" }, children: value })] }));
}

function fmtTime(epoch) {
    if (!epoch)
        return "—";
    return new Date(epoch * 1000).toLocaleString();
}
function fmtSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function shortenPath(p, max = 60) {
    if (p.length <= max)
        return p;
    const parts = p.split("/");
    if (parts.length <= 3)
        return "…" + p.slice(-max + 1);
    return parts.slice(0, 2).join("/") + "/…/" + parts.slice(-2).join("/");
}
function SettingsView() {
    const settings = useStore((s) => s.settings);
    const movesDb = useStore((s) => s.movesDatabase);
    const theme = useStore((s) => s.theme);
    // themes list is fetched once via the API but cached locally so the
    // Dropdown doesn't unmount when the active theme changes.
    const [resolved, setResolved] = window.SP_REACT.useState(null);
    const [candidates, setCandidates] = window.SP_REACT.useState([]);
    const [overrideInput, setOverrideInput] = window.SP_REACT.useState("");
    const [pbsInput, setPbsInput] = window.SP_REACT.useState("");
    const [scanIntervalInput, setScanIntervalInput] = window.SP_REACT.useState("");
    const [busy, setBusy] = window.SP_REACT.useState(false);
    const [pbsBusy, setPbsBusy] = window.SP_REACT.useState(false);
    const [statusMsg, setStatusMsg] = window.SP_REACT.useState(null);
    const [statusError, setStatusError] = window.SP_REACT.useState(null);
    const [themes, setThemes] = window.SP_REACT.useState([]);
    const refresh = window.SP_REACT.useCallback(async () => {
        setBusy(true);
        setStatusMsg(null);
        setStatusError(null);
        try {
            const [r, c] = await Promise.all([api.findSavePath(), api.listSaveFiles()]);
            setResolved(r);
            setCandidates(c);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
        finally {
            setBusy(false);
        }
    }, []);
    window.SP_REACT.useEffect(() => {
        let cancelled = false;
        setBusy(true);
        Promise.all([api.findSavePath(), api.listSaveFiles()])
            .then(([r, c]) => { if (!cancelled) {
            setResolved(r);
            setCandidates(c);
        } })
            .catch((e) => { if (!cancelled)
            setStatusError(e.message); })
            .finally(() => { if (!cancelled)
            setBusy(false); });
        return () => { cancelled = true; };
    }, []);
    // Fetch the themes list once on mount.
    window.SP_REACT.useEffect(() => {
        let cancelled = false;
        if (themes.length > 0)
            return;
        api.getThemes()
            .then((r) => { if (!cancelled)
            setThemes(r.themes); })
            .catch((e) => console.error("themes", e));
        return () => { cancelled = true; };
    }, []);
    // Initialize input fields from settings/movesDb ONCE (not on every change
    // — that would clobber the user's in-progress typing).
    const overrideInit = window.SP_REACT.useRef(false);
    const pbsInit = window.SP_REACT.useRef(false);
    const scanInit = window.SP_REACT.useRef(false);
    window.SP_REACT.useEffect(() => {
        if (settings && !overrideInit.current) {
            setOverrideInput(settings.save_path_override ?? "");
            overrideInit.current = true;
        }
    }, [settings]);
    window.SP_REACT.useEffect(() => {
        if (movesDb && !pbsInit.current) {
            setPbsInput(movesDb.pbs_source ?? "");
            pbsInit.current = true;
        }
    }, [movesDb]);
    window.SP_REACT.useEffect(() => {
        if (settings && !scanInit.current) {
            setScanIntervalInput(String(settings.scan_interval_seconds));
            scanInit.current = true;
        }
    }, [settings]);
    const reloadPbsAuto = window.SP_REACT.useCallback(async () => {
        setPbsBusy(true);
        setStatusMsg(null);
        setStatusError(null);
        try {
            const r = await api.autoLoadPbs();
            await refreshMoves();
            if (r.loaded) {
                setStatusMsg(`Auto-loaded ${r.database.pbs_count} moves from PBS: ${shortenPath(r.source ?? "")}`);
            }
            else {
                setStatusMsg("No PBS/moves.txt found in common locations.");
            }
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
        finally {
            setPbsBusy(false);
        }
    }, []);
    const applyPbsPath = window.SP_REACT.useCallback(async () => {
        if (!pbsInput.trim())
            return;
        setPbsBusy(true);
        setStatusMsg(null);
        setStatusError(null);
        try {
            const r = await api.loadPbsMoves(pbsInput.trim());
            await refreshMoves();
            if (r.loaded) {
                setStatusMsg(`Loaded ${r.count} moves from PBS file.`);
            }
            else {
                setStatusError("Failed to load PBS file (file not readable or malformed).");
            }
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
        finally {
            setPbsBusy(false);
        }
    }, [pbsInput]);
    const clearPbs = window.SP_REACT.useCallback(async () => {
        setPbsInput("");
        setPbsBusy(true);
        setStatusMsg(null);
        setStatusError(null);
        try {
            await api.clearPbs();
            await refreshMoves();
            setStatusMsg("PBS override cleared. Static moves database only.");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
        finally {
            setPbsBusy(false);
        }
    }, []);
    const applyOverride = window.SP_REACT.useCallback(async () => {
        setBusy(true);
        setStatusMsg(null);
        setStatusError(null);
        try {
            const next = overrideInput.trim() === "" ? null : overrideInput.trim();
            await applySettingsPatch({ save_path_override: next });
            setStatusMsg(next ? "Override saved." : "Override cleared.");
            const r = await api.findSavePath();
            setResolved(r);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
        finally {
            setBusy(false);
        }
    }, [overrideInput]);
    const clearOverride = window.SP_REACT.useCallback(async () => {
        setOverrideInput("");
        setBusy(true);
        setStatusMsg(null);
        setStatusError(null);
        try {
            await applySettingsPatch({ save_path_override: null });
            setStatusMsg("Override cleared.");
            const r = await api.findSavePath();
            setResolved(r);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
        finally {
            setBusy(false);
        }
    }, []);
    const useCandidate = window.SP_REACT.useCallback(async (path) => {
        setOverrideInput(path);
        setBusy(true);
        setStatusMsg(null);
        setStatusError(null);
        try {
            await applySettingsPatch({ save_path_override: path });
            setStatusMsg(`Override set: ${path}`);
            const r = await api.findSavePath();
            setResolved(r);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
        finally {
            setBusy(false);
        }
    }, []);
    const setAutoScan = window.SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ auto_scan_enabled: v });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    const setTouchmenu = window.SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ touchmenu_enabled: v });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    const scanDebounce = window.SP_REACT.useRef(null);
    const setScanInterval = window.SP_REACT.useCallback((v) => {
        const clamped = Math.max(5, v);
        if (scanDebounce.current)
            clearTimeout(scanDebounce.current);
        scanDebounce.current = setTimeout(() => {
            applySettingsPatch({ scan_interval_seconds: clamped }).catch((e) => setStatusError(e.message));
        }, 500);
    }, []);
    const setCompactMode = window.SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ compact_mode: v });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    const setTheme = window.SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ theme: v });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    const setWatcherEnabled = window.SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ watcher_enabled: v });
            setStatusMsg(v ? "Live save watcher enabled." : "Live save watcher disabled.");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    const setLiveMemory = window.SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ live_memory_enabled: v });
            setStatusMsg(v
                ? "Live memory reading enabled. Updates come from game process memory; the disk watcher is kept as fallback."
                : "Live memory reading disabled. Updates come from the save file only.");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    if (!settings) {
        return (window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Settings", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: {
                            color: "#e0a458",
                            fontSize: 12,
                            padding: "4px 0",
                        }, children: "Settings aren't loaded yet. The Decky Loader may be reloading the plugin in the background." }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { style: { fontSize: 12, color: "#969696", padding: "4px 0" }, children: ["Loading\u2026", window.SP_JSX.jsx("span", { style: {
                                    fontSize: 11,
                                    color: "#56b4e9",
                                    cursor: "pointer",
                                    textDecoration: "underline",
                                    marginLeft: 8,
                                }, onClick: () => {
                                    retryRefreshStatic();
                                }, children: "Reload" })] }) })] }));
    }
    return (window.SP_JSX.jsxs(window.SP_JSX.Fragment, { children: [window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Save resolution", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4 }, children: "Active save" }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 12, color: resolved?.path ? "#5eba7d" : "#e0a458", wordBreak: "break-all" }, children: resolved?.path || "— no save found —" }) }), resolved?.using_override && (window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 10, color: "#777" }, children: "(using manual override)" }) })), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: refresh, disabled: busy, children: busy ? "Scanning…" : "Rescan saves" }) })] }), window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Manual override", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 11, color: "#888", lineHeight: 1.4 }, children: "If auto-detection fails, paste the full path to a save file here. Leave blank to use auto-detection." }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.TextField, { label: "Path to save file", value: overrideInput, onChange: (e) => setOverrideInput(e.target.value) }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: applyOverride, disabled: busy, children: "Apply override" }) }), settings.save_path_override && (window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: clearOverride, disabled: busy, children: "Clear override" }) }))] }), window.SP_JSX.jsx(window.DFL.PanelSection, { title: "Auto-detect options", children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ToggleField, { label: "Auto-scan running processes and Wine prefixes", checked: settings.auto_scan_enabled, onChange: setAutoScan }) }) }), window.SP_JSX.jsx(window.DFL.PanelSection, { title: "Display", children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ToggleField, { label: "Compact mode (auto-hide empty sections)", checked: settings.compact_mode, onChange: setCompactMode }) }) }), window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Theme", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4 }, children: "Active theme" }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 12, color: theme ? theme.palette.accent : "#888" }, children: theme ? theme.name : "Loading…" }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Dropdown, { menuLabel: "Theme", selectedOption: settings.theme || "default", onChange: (opt) => setTheme(opt.data), rgOptions: themes.map((t) => ({ data: t.id, label: t.name })), disabled: themes.length === 0 }) })] }), window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "PBS moves database", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4 }, children: "Active PBS source" }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 11, color: movesDb?.pbs_source ? "#5eba7d" : "#888", wordBreak: "break-all" }, children: movesDb?.pbs_source ? shortenPath(movesDb.pbs_source, 80) : "— not loaded (using static DB) —" }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 10, color: "#777" }, children: movesDb ? `${movesDb.merged_count} moves total · ${movesDb.static_count} static · ${movesDb.pbs_count} from game PBS` : "Loading…" }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: reloadPbsAuto, disabled: pbsBusy, children: pbsBusy ? "Scanning…" : "Auto-discover PBS" }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.TextField, { label: "Manual PBS path (moves.txt)", value: pbsInput, onChange: (e) => setPbsInput(e.target.value) }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: applyPbsPath, disabled: pbsBusy || !pbsInput.trim(), children: "Load PBS from path" }) }), movesDb?.pbs_source && (window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: clearPbs, disabled: pbsBusy, children: "Clear PBS (use static only)" }) }))] }), window.SP_JSX.jsx(window.DFL.PanelSection, { title: "TouchMenu overlay", children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ToggleField, { label: "Enable in-game touch menu", checked: settings.touchmenu_enabled, onChange: setTouchmenu }) }) }), window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Live memory reading", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 11, color: "#888", lineHeight: 1.4 }, children: "When the game is running, read party state directly from the game's process memory. Updates arrive every ~1s without waiting for the game to save to disk. Opt-in: the disk watcher still runs as a fallback if memory reading fails." }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ToggleField, { label: "Read live data from game process memory", checked: Boolean(settings?.live_memory_enabled), onChange: setLiveMemory }) })] }), window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Polling", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { style: { fontSize: 11, color: "#888" }, children: ["Backend live watcher checks the disk every", " ", window.SP_JSX.jsx("strong", { style: { color: "#ccc" }, children: Math.max(5, settings.scan_interval_seconds) }), " ", "units. The UI will always update instantly when changes occur."] }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.TextField, { label: "Interval (seconds)", value: scanIntervalInput, onChange: (e) => {
                                const n = parseInt(e.target.value, 10);
                                setScanIntervalInput(e.target.value);
                                if (!isNaN(n))
                                    setScanInterval(n);
                            } }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ToggleField, { label: "Live save watcher (sub-second updates)", checked: settings.watcher_enabled ?? true, onChange: setWatcherEnabled }) })] }), candidates.length > 0 && (window.SP_JSX.jsxs(window.DFL.PanelSection, { title: `Discovered saves (${candidates.length})`, children: [candidates.slice(0, 20).map((c) => (window.SP_JSX.jsxs(window.DFL.PanelSectionRow, { children: [window.SP_JSX.jsxs(window.DFL.Focusable, { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [window.SP_JSX.jsx("div", { style: { fontSize: 11, color: "#ddd", wordBreak: "break-all" }, children: c.path }), window.SP_JSX.jsxs("div", { style: { fontSize: 10, color: "#777" }, children: [fmtSize(c.size), " \u00B7 modified ", fmtTime(c.modified)] })] }), window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "inline", onClick: () => useCandidate(c.path), children: "Use this save" })] }, c.path))), candidates.length > 20 && (window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { style: { fontSize: 11, color: "#777", fontStyle: "italic" }, children: ["\u2026and ", candidates.length - 20, " more. Use override to select specific file."] }) }))] })), (statusMsg || statusError) && (window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Status", children: [statusMsg && (window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 12, color: "#5eba7d" }, children: window.SP_JSX.jsx("div", { children: statusMsg }) }) })), statusError && (window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Focusable, { style: { fontSize: 12, color: "#e87b7b" }, children: window.SP_JSX.jsx("div", { children: statusError }) }) }))] }))] }));
}

const BUCKET_LABELS = {
    quadruple: "4× damage",
    double: "2× damage",
    neutral: "Normal",
    half: "½× damage",
    quarter: "¼× damage",
    immune: "No effect",
};
const BUCKET_ORDER = [
    "quadruple",
    "double",
    "neutral",
    "half",
    "quarter",
    "immune",
];
const BUCKET_COLORS = {
    quadruple: "#ff4d4d",
    double: "#ff8a3d",
    neutral: "#888",
    half: "#5eba7d",
    quarter: "#2f8a55",
    immune: "#444",
};
function DefenseGrid({ defenders, summary }) {
    return (window.SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [window.SP_JSX.jsxs("div", { style: { fontSize: "12px", color: "#969696" }, children: ["Defender:", " ", defenders.map((d, i) => (window.SP_JSX.jsxs("span", { style: { marginRight: "4px" }, children: [window.SP_JSX.jsx(TypeBadge, { type: d, size: "sm" }), i < defenders.length - 1 ? " /" : ""] }, d)))] }), BUCKET_ORDER.filter((b) => (summary[b] || []).length > 0).map((bucket) => {
                const types = summary[bucket] || [];
                return (window.SP_JSX.jsxs("div", { style: {
                        padding: "6px 8px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "4px",
                        borderLeft: `3px solid ${BUCKET_COLORS[bucket]}`,
                    }, children: [window.SP_JSX.jsxs("div", { style: {
                                fontSize: "11px",
                                fontWeight: 600,
                                color: BUCKET_COLORS[bucket],
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                marginBottom: "4px",
                            }, children: [BUCKET_LABELS[bucket], " (", types.length, ")"] }), window.SP_JSX.jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" }, children: types.map((t) => (window.SP_JSX.jsx(TypeBadge, { type: t, size: "sm" }, t))) })] }, bucket));
            })] }));
}
const OFFENSE_BUCKETS = [
    { key: "super_effective", label: "Super effective", color: "#ff8a3d" },
    { key: "not_very_effective", label: "Not very effective", color: "#5eba7d" },
    { key: "no_effect", label: "No effect", color: "#444" },
    { key: "neutral", label: "Normal damage", color: "#888" },
];
function OffenseGrid({ attacker, summary }) {
    return (window.SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [window.SP_JSX.jsxs("div", { style: { fontSize: "12px", color: "#969696" }, children: ["Attacker: ", window.SP_JSX.jsx(TypeBadge, { type: attacker, size: "sm" })] }), OFFENSE_BUCKETS.filter((b) => (summary[b.key] || []).length > 0).map((bucket) => {
                const types = summary[bucket.key] || [];
                return (window.SP_JSX.jsxs("div", { style: {
                        padding: "6px 8px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "4px",
                        borderLeft: `3px solid ${bucket.color}`,
                    }, children: [window.SP_JSX.jsxs("div", { style: {
                                fontSize: "11px",
                                fontWeight: 600,
                                color: bucket.color,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                marginBottom: "4px",
                            }, children: [bucket.label, " (", types.length, ")"] }), window.SP_JSX.jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" }, children: types.map((t) => (window.SP_JSX.jsx(TypeBadge, { type: t, size: "sm" }, t))) })] }, bucket.key));
            })] }));
}

const NO_TYPE = "(none)";
function TypeChartView() {
    const chart = useStore((s) => s.typeChart);
    const [error, setError] = window.SP_REACT.useState(null);
    const [mode, setMode] = window.SP_REACT.useState("defense");
    const [attacker, setAttacker] = window.SP_REACT.useState("Fire");
    const [def1, setDef1] = window.SP_REACT.useState("Fire");
    const [def2, setDef2] = window.SP_REACT.useState(NO_TYPE);
    const [defense, setDefense] = window.SP_REACT.useState(null);
    const [offense, setOffense] = window.SP_REACT.useState(null);
    const [loading, setLoading] = window.SP_REACT.useState(false);
    const types = chart?.types ?? [];
    const typeOptions = window.SP_REACT.useMemo(() => [
        { data: NO_TYPE, label: NO_TYPE },
        ...types.map((t) => ({ data: t, label: t })),
    ], [types]);
    const attackerOptions = window.SP_REACT.useMemo(() => types.map((t) => ({ data: t, label: t })), [types]);
    const defenderPair = window.SP_REACT.useMemo(() => (def2 === NO_TYPE ? [def1] : [def1, def2]), [def1, def2]);
    window.SP_REACT.useEffect(() => {
        if (!chart)
            return;
        // Initialize defaults from the loaded chart (handles fan games without "Fire").
        if (!chart.types.includes(attacker))
            setAttacker(chart.types[0] ?? "Fire");
        if (!chart.types.includes(def1))
            setDef1(chart.types[0] ?? "Fire");
    }, [chart]); // eslint-disable-line react-hooks/exhaustive-deps
    window.SP_REACT.useEffect(() => {
        if (!chart)
            return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        const promise = mode === "defense"
            ? api.getDefenseSummary(defenderPair)
            : api.getOffenseSummary(attacker);
        promise
            .then((res) => {
            if (cancelled)
                return;
            if (res.error) {
                setError(res.error);
                setDefense(null);
                setOffense(null);
            }
            else {
                if (mode === "defense") {
                    setDefense(res);
                    setOffense(null);
                }
                else {
                    setOffense(res);
                    setDefense(null);
                }
            }
        })
            .catch((e) => { if (!cancelled)
            setError(e.message); })
            .finally(() => { if (!cancelled)
            setLoading(false); });
        return () => { cancelled = true; };
    }, [chart, mode, attacker, defenderPair]);
    if (!chart) {
        return (window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Type Chart", children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx("div", { style: {
                            color: "#e0a458",
                            fontSize: 12,
                            padding: "8px 0",
                        }, children: "Type chart data isn't loaded yet. The Decky Loader may be reloading the plugin in the background." }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.ButtonItem, { layout: "below", onClick: () => {
                            retryRefreshStatic();
                        }, children: "Reload" }) })] }));
    }
    return (window.SP_JSX.jsxs(window.SP_JSX.Fragment, { children: [window.SP_JSX.jsx(window.DFL.PanelSection, { title: "Mode", children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.ButtonItem, { layout: "below", onClick: () => setMode(mode === "defense" ? "offense" : "defense"), children: ["Mode: ", mode === "defense" ? "Defender" : "Attacker", " (click to switch)"] }) }) }), window.SP_JSX.jsx(window.DFL.PanelSection, { title: mode === "defense" ? "Defender types" : "Attacker type", children: mode === "defense" ? (window.SP_JSX.jsxs(window.SP_JSX.Fragment, { children: [window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Dropdown, { menuLabel: "Type 1", selectedOption: def1, onChange: (opt) => setDef1(opt.data), rgOptions: attackerOptions }) }), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Dropdown, { menuLabel: "Type 2", selectedOption: def2, onChange: (opt) => setDef2(opt.data), rgOptions: typeOptions }) })] })) : (window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(window.DFL.Dropdown, { menuLabel: "Attacker", selectedOption: attacker, onChange: (opt) => setAttacker(opt.data), rgOptions: attackerOptions }) })) }), loading && (window.SP_JSX.jsx(window.DFL.PanelSection, { children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }, children: [window.SP_JSX.jsx(window.DFL.Spinner, {}), window.SP_JSX.jsx("span", { style: { fontSize: 12, color: "#969696" }, children: "Updating\u2026" })] }) }) })), error && (window.SP_JSX.jsx(window.DFL.PanelSection, { children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx("div", { style: { color: "#e87b7b", fontSize: 12, padding: "4px 0" }, children: error }) }) })), mode === "defense" && defense && defense.summary && (window.SP_JSX.jsx(window.DFL.PanelSection, { title: "What hits this Pok\u00E9mon?", children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(DefenseGrid, { defenders: defense.defenders ?? [], summary: defense.summary }) }) })), mode === "offense" && offense && offense.summary && (window.SP_JSX.jsx(window.DFL.PanelSection, { title: "What does it hit?", children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx(OffenseGrid, { attacker: offense.attacker ?? attacker, summary: offense.summary }) }) }))] }));
}

function EffectivenessBadge({ label }) {
    if (!label)
        return null;
    let bgColor = "#555";
    let textColor = "#fff";
    if (label.includes("super_effective")) {
        bgColor = "#5eba7d";
        textColor = "#000";
    }
    else if (label.includes("not_very_effective")) {
        bgColor = "#e05858";
    }
    else if (label.includes("immune")) {
        bgColor = "#888";
    }
    else if (label.includes("neutral")) {
        bgColor = "#56b4e9";
    }
    return (window.SP_JSX.jsx("span", { style: {
            backgroundColor: bgColor,
            color: textColor,
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "10px",
            marginLeft: "8px",
            fontWeight: "bold",
            textTransform: "uppercase",
        }, children: label.replace(/_/g, " ") }));
}
const STAT_NAMES = ["Atk", "Def", "SpA", "SpD", "Spe"];
function StatBadges({ stages }) {
    if (!stages || !stages.length)
        return null;
    return (window.SP_JSX.jsx("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }, children: stages.map((stage, i) => {
            if (stage === 0 || i >= STAT_NAMES.length)
                return null;
            const color = stage > 0 ? "#5eba7d" : "#e05858";
            const sign = stage > 0 ? "+" : "";
            return (window.SP_JSX.jsxs("span", { style: { backgroundColor: color, color: "#fff", padding: "2px 4px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }, children: [STAT_NAMES[i], " ", sign, stage] }, i));
        }) }));
}
function hpPercent(enemy) {
    if (enemy.totalhp != null && enemy.totalhp > 0 && enemy.hp != null) {
        return Math.round((enemy.hp / enemy.totalhp) * 100);
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
    return (window.SP_JSX.jsx(window.SP_JSX.Fragment, { children: window.SP_JSX.jsxs(window.DFL.PanelSection, { title: "Battle Analyzer", children: [coach_suggestion && (window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { style: {
                            padding: "10px",
                            backgroundColor: "rgba(255, 204, 0, 0.2)",
                            border: "1px solid #ffcc00",
                            borderRadius: "4px",
                            marginBottom: "8px",
                        }, children: [window.SP_JSX.jsx("div", { style: { color: "#ffcc00", fontWeight: "bold", fontSize: "14px", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }, children: window.SP_JSX.jsx("span", { children: "COACH SUGGESTION" }) }), window.SP_JSX.jsxs("div", { style: { fontSize: "14px" }, children: ["Switch to ", window.SP_JSX.jsx("strong", { children: coach_suggestion.suggested_pokemon })] }), window.SP_JSX.jsxs("div", { style: { fontSize: "12px", color: "#ddd", marginTop: "2px" }, children: ["Reason: ", coach_suggestion.reason] })] }) })), window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { style: {
                            padding: "8px",
                            backgroundColor: "rgba(0, 0, 0, 0.2)",
                            borderRadius: "4px",
                            marginBottom: "8px",
                        }, children: [window.SP_JSX.jsxs("div", { style: { fontSize: "14px", fontWeight: "bold" }, children: ["Enemy: ", enemy.name] }), window.SP_JSX.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }, children: [window.SP_JSX.jsx("div", { style: { flex: 1, height: "12px", backgroundColor: "#333", borderRadius: "6px", overflow: "hidden" }, children: window.SP_JSX.jsx("div", { style: {
                                                height: "100%",
                                                width: `${pct}%`,
                                                backgroundColor: pct > 50 ? "#5eba7d" : pct > 20 ? "#e0b058" : "#e05858",
                                                transition: "width 0.3s ease-in-out, background-color 0.3s ease-in-out"
                                            } }) }), window.SP_JSX.jsx("div", { style: { display: "flex", gap: "4px" }, children: enemyTypes.map((t) => (window.SP_JSX.jsx(TypeBadge, { type: t, size: "sm" }, t))) })] }), window.SP_JSX.jsx(StatBadges, { stages: enemyStages })] }) }), moves.map((move, index) => {
                    const isBest = move.name === best_move;
                    return (window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsxs(window.DFL.Focusable, { style: {
                                padding: "8px",
                                backgroundColor: isBest
                                    ? "rgba(94, 186, 125, 0.2)"
                                    : "rgba(255, 255, 255, 0.05)",
                                borderRadius: "4px",
                                border: isBest ? "1px solid #5eba7d" : "1px solid transparent",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }, children: [window.SP_JSX.jsxs("div", { children: [window.SP_JSX.jsxs("div", { style: { fontSize: "14px", fontWeight: isBest ? "bold" : "normal" }, children: [move.name, isBest && (window.SP_JSX.jsx("span", { style: {
                                                        marginLeft: "8px",
                                                        fontSize: "10px",
                                                        color: "#5eba7d",
                                                        fontWeight: "bold",
                                                    }, children: "BEST" }))] }), move.type && (window.SP_JSX.jsxs("div", { style: { fontSize: "12px", color: "#aaa", display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }, children: [window.SP_JSX.jsx(TypeBadge, { type: move.type, size: "sm" }), move.power ? window.SP_JSX.jsxs("span", { children: ["Power: ", move.power] }) : null] }))] }), window.SP_JSX.jsx(EffectivenessBadge, { label: move.effectiveness_label })] }) }, move.name || index));
                })] }) }));
}

let lastEnemyName = undefined;
let lastCoach = undefined;
let lastBoostWarned = false;
let unsubscribeToasts = null;
function initGlobalToasts() {
    unsubscribeToasts = subscribe(() => {
        const s = getState();
        const inBattle = !!s.liveState?.battle_analysis;
        const enemyName = s.liveState?.battle_analysis?.enemy?.name;
        const coachSuggestion = s.liveState?.battle_analysis?.coach_suggestion?.suggested_pokemon;
        const stages = s.liveState?.battle_analysis?.enemy?.stages;
        const enemyHasBoosts = !!stages && stages.some((v) => v > 0);
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
        }
        else if (!enemyHasBoosts) {
            lastBoostWarned = false;
        }
    });
}
const TABS = [
    { id: "status", label: "Status" },
    { id: "typechart", label: "Type Chart" },
    { id: "party", label: "Party" },
    { id: "settings", label: "Settings" },
];
function PluginContent() {
    const [active, setActive] = window.SP_REACT.useState("status");
    const theme = useStore((s) => s.theme);
    const touchmenuEnabled = useStore((s) => s.settings?.touchmenu_enabled ?? true);
    const inBattle = useStore((s) => !!s.liveState?.battle_analysis);
    const showRestartBanner = useStore((s) => !!s.liveState?.mod_needs_restart && s.liveState?.live_source !== "stream");
    // Drive TouchMenu registration from the setting (not just plugin load).
    window.SP_REACT.useEffect(() => {
        if (touchmenuEnabled) {
            registerTouchMenu();
        }
        else {
            unregisterTouchMenu();
        }
    }, [touchmenuEnabled]);
    window.SP_REACT.useEffect(() => {
        refreshStatic();
    }, []);
    const palette = theme?.palette ?? DEFAULT_PALETTE;
    const themeStyle = window.SP_REACT.useMemo(() => paletteToCssVars(palette), [palette]);
    return (window.SP_JSX.jsxs(window.DFL.Focusable, { style: { display: "flex", flexDirection: "column", ...themeStyle }, children: [window.SP_JSX.jsx(TabBar, { tabs: TABS, activeId: active, onChange: (id) => setActive(id) }), window.SP_JSX.jsxs(window.DFL.ScrollPanel, { children: [showRestartBanner && (window.SP_JSX.jsx(window.DFL.PanelSection, { children: window.SP_JSX.jsx(window.DFL.PanelSectionRow, { children: window.SP_JSX.jsx("div", { style: {
                                    backgroundColor: "#e05858",
                                    color: "#fff",
                                    padding: "12px",
                                    borderRadius: "4px",
                                    fontSize: "13px",
                                    lineHeight: "1.4",
                                    fontWeight: "bold",
                                    marginBottom: "8px"
                                }, children: "The live-tracker mod was just auto-installed. Please restart your Pok\u00E9mon game once to activate the Battle Analyzer." }) }) })), active === "status" && (inBattle ? window.SP_JSX.jsx(BattleAnalyzerView, {}) : window.SP_JSX.jsx(HomeView, {})), active === "typechart" && window.SP_JSX.jsx(TypeChartView, {}), active === "party" && window.SP_JSX.jsx(PartyView, {}), active === "settings" && window.SP_JSX.jsx(SettingsView, {})] })] }));
}
var index = definePlugin(() => {
    // Start polling + register touch menu at plugin-load time (not when QAM
    // panel opens). This ensures the in-game touch menu works even if the
    // user never opens the Quick Access Menu, and live data stays fresh.
    refreshStatic();
    startPolling();
    registerTouchMenu();
    initGlobalToasts();
    return {
        name: "Pokémon Essentials Overlay",
        titleView: (window.SP_JSX.jsxs("div", { style: {
                display: "flex",
                alignItems: "center",
                gap: "6px",
                paddingLeft: "4px",
            }, children: [window.SP_JSX.jsx(PokeballIcon, { size: 18 }), window.SP_JSX.jsx("span", { children: "Pok\u00E9mon Essentials Overlay" })] })),
        content: (window.SP_JSX.jsx(ErrorBoundary, { children: window.SP_JSX.jsx(PluginContent, {}) })),
        icon: window.SP_JSX.jsx(PokeballIcon, {}),
        onDismount() {
            unregisterTouchMenu();
            stopPolling();
            if (unsubscribeToasts)
                unsubscribeToasts();
            console.log("[pokemon-overlay] dismounted");
        },
    };
});

export { index as default };
//# sourceMappingURL=index.js.map
