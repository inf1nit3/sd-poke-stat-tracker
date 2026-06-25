const manifest = {"name":"SD Poké Stat Tracker"};
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
const definePlugin = (fn) => {
    return (...args) => {
        return fn(...args);
    };
};

function PokeballIcon({ size = 18, style }) {
    const s = size;
    return (SP_JSX.jsxs("svg", { width: s, height: s, viewBox: "0 0 24 24", style: style, xmlns: "http://www.w3.org/2000/svg", "aria-label": "Pokeball", children: [SP_JSX.jsx("circle", { cx: "12", cy: "12", r: "11", fill: "#fff", stroke: "#222", strokeWidth: "1.5" }), SP_JSX.jsx("path", { d: "M 1 12 A 11 11 0 0 1 23 12 Z", fill: "#dc2626", stroke: "#222", strokeWidth: "1.5" }), SP_JSX.jsx("line", { x1: "1", y1: "12", x2: "23", y2: "12", stroke: "#222", strokeWidth: "1.5" }), SP_JSX.jsx("circle", { cx: "12", cy: "12", r: "4", fill: "#fff", stroke: "#222", strokeWidth: "1.5" }), SP_JSX.jsx("circle", { cx: "12", cy: "12", r: "1.5", fill: "#222" })] }));
}

function TabBar({ tabs, activeId, onChange }) {
    return (SP_JSX.jsx(DFL.Focusable, { focusWithinClassName: "gp-tabs-active", style: {
            display: "flex",
            flexDirection: "row",
            gap: "4px",
            padding: "8px 0 6px 0",
            borderBottom: "1px solid #2a2a2a",
            marginBottom: "4px",
        }, children: tabs.map((tab) => {
            const active = tab.id === activeId;
            return (SP_JSX.jsx(DFL.Focusable, { onOKActionDescription: tab.label, onOKButton: () => !tab.disabled && onChange(tab.id), style: {
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
function getSnapshot() {
    return state;
}
function getServerSnapshot() {
    return initialState;
}
function useStore(selector) {
    return SP_REACT.useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getServerSnapshot()));
}
async function refreshStatic() {
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
    }
    catch (e) {
        console.error("[store] refreshStatic failed", e);
    }
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
    }
    catch (e) {
        console.error("[store] refreshLiveState failed", e);
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
function startPolling(intervalSeconds) {
    stopPolling();
    refreshSave(false);
    refreshLiveState();
    pollTimer = setInterval(() => {
        refreshSave(false);
        refreshLiveState();
    }, 1500);
    console.log(`[store] live frontend polling started, every 1.5s`);
}
function stopPolling() {
    if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
        console.log("[store] polling stopped");
    }
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
    return (SP_JSX.jsx("span", { style: {
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
    const [selectedMove, setSelectedMove] = SP_REACT.useState(null);
    const [moveInfo, setMoveInfo] = SP_REACT.useState(null);
    const [offense, setOffense] = SP_REACT.useState(null);
    const [loading, setLoading] = SP_REACT.useState(false);
    SP_REACT.useEffect(() => {
        if (!selectedMove) {
            setMoveInfo(null);
            setOffense(null);
            return;
        }
        setLoading(true);
        setOffense(null);
        api
            .getMoveInfo(selectedMove)
            .then((info) => {
            setMoveInfo(info);
            if (info && info.type) {
                return api.getOffenseSummary(info.type).then(setOffense);
            }
            return null;
        })
            .catch((e) => console.error("[move-lookup]", e))
            .finally(() => setLoading(false));
    }, [selectedMove]);
    if (!saveData || saveData.error) {
        return (SP_JSX.jsx("div", { style: {
                padding: 24,
                textAlign: "center",
                color: "#888",
                fontSize: 13,
            }, children: "Load a save first to see party moves." }));
    }
    const party = saveData.party || [];
    const partyMoves = [];
    for (const p of party) {
        for (const m of p.moves) {
            if (m)
                partyMoves.push({ move: m, owner: p.nickname || p.species });
        }
    }
    return (SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    paddingBottom: 4,
                    borderBottom: "1px solid #2a2a2a",
                }, children: [SP_JSX.jsx("span", { style: { fontSize: 11, color: "#888", fontWeight: 600 }, children: "PARTY MOVES:" }), partyMoves.map((pm, i) => {
                        const info = movesDb?.moves?.[normalizeKey$1(pm.move)];
                        const type = info?.type;
                        return (SP_JSX.jsxs("button", { onClick: () => setSelectedMove(pm.move), style: {
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
                            }, children: [type && SP_JSX.jsx(TypeBadge, { type: type, size: "sm" }), SP_JSX.jsx("span", { children: pm.move })] }, `${pm.owner}-${pm.move}-${i}`));
                    })] }), !selectedMove && (SP_JSX.jsx("div", { style: {
                    padding: 20,
                    textAlign: "center",
                    color: "#888",
                    fontSize: 12,
                    fontStyle: "italic",
                }, children: "Tap a move to see its type and effectiveness" })), selectedMove && loading && (SP_JSX.jsx("div", { style: { padding: 16, textAlign: "center", color: "#aaa" }, children: "Loading\u2026" })), selectedMove && !loading && (SP_JSX.jsx(MoveDetail, { move: selectedMove, info: moveInfo, offense: offense })), movesDb && (SP_JSX.jsxs("div", { style: {
                    fontSize: 10,
                    color: "#555",
                    textAlign: "right",
                    marginTop: 2,
                }, children: [movesDb.merged_count, " moves available", movesDb.pbs_source && (SP_JSX.jsxs(SP_JSX.Fragment, { children: [" ", "\u00B7 PBS: ", movesDb.pbs_source.split("/").slice(-2).join("/")] }))] }))] }));
}
function MoveDetail({ move, info, offense, }) {
    return (SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 10,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 6,
        }, children: [SP_JSX.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [SP_JSX.jsx("span", { style: {
                            fontSize: 16,
                            fontWeight: 600,
                            color: "#fff",
                            textTransform: "uppercase",
                        }, children: info?.name || move }), info?.type && SP_JSX.jsx(TypeBadge, { type: info.type, size: "md" }), SP_JSX.jsx("div", { style: { flex: 1 } }), info?.source && (SP_JSX.jsxs("span", { style: {
                            fontSize: 9,
                            color: "#666",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                        }, children: [info.source, info.guessed && " (heuristic)"] }))] }), info && (SP_JSX.jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                    fontSize: 11,
                    color: "#ccc",
                }, children: [SP_JSX.jsx(Detail, { label: "Category", value: info.category }), SP_JSX.jsx(Detail, { label: "Power", value: info.power ? String(info.power) : "—" }), SP_JSX.jsx(Detail, { label: "Accuracy", value: info.accuracy ? `${info.accuracy}%` : "—" })] })), info?.description && (SP_JSX.jsx("div", { style: {
                    fontSize: 11,
                    color: "#888",
                    fontStyle: "italic",
                    lineHeight: 1.4,
                }, children: info.description })), offense?.summary && (SP_JSX.jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: BUCKETS$1.map((bucket) => {
                    const types = offense.summary?.[bucket.key] ?? [];
                    if (types.length === 0)
                        return null;
                    return (SP_JSX.jsxs("div", { style: {
                            padding: "5px 7px",
                            background: "rgba(255,255,255,0.02)",
                            borderRadius: 4,
                            borderLeft: `3px solid ${bucket.color}`,
                        }, children: [SP_JSX.jsxs("div", { style: {
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: bucket.color,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.4,
                                    marginBottom: 3,
                                }, children: [bucket.label, " (", types.length, ")"] }), SP_JSX.jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 3 }, children: types.map((t) => (SP_JSX.jsx(TypeBadge, { type: t, size: "sm" }, t))) })] }, bucket.key));
                }) }))] }));
}
function Detail({ label, value }) {
    return (SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [SP_JSX.jsx("div", { style: {
                    fontSize: 9,
                    color: "#777",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                }, children: label }), SP_JSX.jsx("div", { style: { fontSize: 12, color: "#ddd" }, children: value })] }));
}
function normalizeKey$1(name) {
    return (name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
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
        transition: "width 200ms ease-out",
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
    return (SP_JSX.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, width: "100%" }, children: [SP_JSX.jsxs("div", { style: wrapperStyle, children: [SP_JSX.jsx("div", { style: fillStyle }), statusOverlayStyle && SP_JSX.jsx("div", { style: statusOverlayStyle })] }), showLabel && (SP_JSX.jsxs("div", { style: {
                    fontSize: 11,
                    color: "#bbb",
                    minWidth: 56,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                }, children: [hp, "/", maxHp] }))] }));
}

function normalizeKey(name) {
    return (name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
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
    const saveData = useStore((s) => s.saveData);
    const movesDb = useStore((s) => s.movesDatabase);
    if (!saveData) {
        return SP_JSX.jsx(EmptyState, { children: "Loading save data\u2026" });
    }
    if (saveData.error === "no_save_file_found") {
        return (SP_JSX.jsxs(EmptyState, { children: ["No save file found.", SP_JSX.jsx("br", {}), "Configure a path in ", SP_JSX.jsx("strong", { children: "Settings" }), "."] }));
    }
    if (saveData.error === "parse_failed") {
        return (SP_JSX.jsxs(EmptyState, { children: ["Parse error: ", saveData.message ?? "unknown"] }));
    }
    const party = saveData.party || [];
    const slots = Array.from({ length: MAX_SLOTS }).map((_, i) => party[i] || null);
    const features = saveData.features;
    return (SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [SP_JSX.jsx(Header, { trainer: saveData.trainer_name, count: party.length, max: MAX_SLOTS, money: features?.items ? saveData.money : 0, badges: saveData.badges, location: saveData.location_name || (saveData.map_id != null ? `Map #${saveData.map_id}` : ""), pbsSource: movesDb?.pbs_source ?? null, features: features }), slots.map((p, i) => p ? (SP_JSX.jsx(PartyRow, { pokemon: p, movesDb: movesDb, features: features }, `slot-${i}`)) : (SP_JSX.jsx(EmptySlot, { index: i }, `slot-${i}`)))] }));
}
function Header({ trainer, count, max, money, badges, location, pbsSource, features, }) {
    return (SP_JSX.jsxs("div", { style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "4px 8px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 4,
            fontSize: 12,
            color: "#ccc",
            flexWrap: "wrap",
        }, children: [SP_JSX.jsx("span", { style: { fontWeight: 600, color: "#fff" }, children: trainer || "Trainer" }), SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), SP_JSX.jsxs("span", { children: ["Party ", count, "/", max] }), features?.items && money > 0 && (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), SP_JSX.jsxs("span", { children: ["\u20BD", money.toLocaleString("en-US")] })] })), badges > 0 && (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), SP_JSX.jsxs("span", { style: { color: "#f7d02c" }, children: [badges, " \uD83C\uDFC6"] })] })), location && (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), SP_JSX.jsx("span", { style: { color: "#888" }, children: location })] })), pbsSource && (SP_JSX.jsx("span", { style: {
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
    return (SP_JSX.jsxs("div", { style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 5,
            borderLeft: `3px solid ${statusColor}`,
            opacity: p.is_fainted ? 0.55 : 1,
        }, children: [SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    minWidth: 24,
                    gap: 1,
                }, children: [p.shiny && (SP_JSX.jsx("span", { style: { color: "#f7d02c", fontSize: 11, lineHeight: 1 }, children: "\u2605" })), showGender && (SP_JSX.jsx("span", { style: {
                            color: p.gender_name === "F"
                                ? "#e87ba3"
                                : p.gender_name === "M"
                                    ? "#7ba3e8"
                                    : "#888",
                            fontSize: 12,
                            fontWeight: 700,
                            lineHeight: 1,
                        }, children: GENDER_SYMBOLS$1[p.gender_name] ?? "?" }))] }), SP_JSX.jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [SP_JSX.jsxs("div", { style: {
                            display: "flex",
                            alignItems: "baseline",
                            gap: 8,
                            marginBottom: 4,
                            flexWrap: "wrap",
                        }, children: [SP_JSX.jsx("span", { style: {
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "#fff",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: 180,
                                }, children: p.nickname || p.species }), SP_JSX.jsxs("span", { style: { fontSize: 10, color: "#888" }, children: ["Lv.", p.level] }), p.nature && (SP_JSX.jsx("span", { style: { fontSize: 9, color: "#888" }, children: p.nature })), SP_JSX.jsx("div", { style: { flex: 1 } }), SP_JSX.jsxs("div", { style: { display: "flex", gap: 3 }, children: [p.type1 && SP_JSX.jsx(TypeBadge, { type: p.type1, size: "sm" }), showType2 && SP_JSX.jsx(TypeBadge, { type: p.type2, size: "sm" })] })] }), SP_JSX.jsx(HealthBar, { hp: p.hp, maxHp: p.max_hp, statusName: p.status_name, showLabel: false }), SP_JSX.jsxs("div", { style: {
                            display: "flex",
                            gap: 8,
                            fontSize: 10,
                            color: "#888",
                            marginTop: 3,
                            alignItems: "center",
                            flexWrap: "wrap",
                        }, children: [SP_JSX.jsxs("span", { children: [p.hp, "/", p.max_hp] }), SP_JSX.jsx("span", { style: { color: statusColor, fontWeight: 600 }, children: p.status_name }), p.ability && (SP_JSX.jsxs("span", { children: [SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), " ", p.ability] })), p.item && (SP_JSX.jsxs("span", { children: [SP_JSX.jsx("span", { style: { color: "#666" }, children: "\u00B7" }), " ", p.item] })), features?.happiness && p.happiness != null && (SP_JSX.jsxs("span", { style: { color: "#e87ba3" }, children: ["\u2665", p.happiness] })), showStats && p.speed != null && (SP_JSX.jsxs("span", { style: { color: "#666" }, children: ["SPE:", p.speed] }))] }), showMoves && (SP_JSX.jsx("div", { style: {
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 4,
                            marginTop: 5,
                        }, children: p.moves.map((m, i) => {
                            const type = movesDb?.moves?.[normalizeKey(m)]?.type;
                            return (SP_JSX.jsxs("span", { style: {
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                    padding: "1px 5px",
                                    background: "rgba(255,255,255,0.05)",
                                    borderRadius: 3,
                                    fontSize: 10,
                                    color: "#ccc",
                                }, children: [type && SP_JSX.jsx(TypeBadge, { type: type, size: "sm" }), m] }, i));
                        }) }))] })] }));
}
function EmptySlot({ index }) {
    return (SP_JSX.jsxs("div", { style: {
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
    return (SP_JSX.jsx("div", { style: {
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
    const [attacker, setAttacker] = SP_REACT.useState("Fire");
    const [summary, setSummary] = SP_REACT.useState(null);
    const [error, setError] = SP_REACT.useState(null);
    SP_REACT.useEffect(() => {
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
        return (SP_JSX.jsx("div", { style: {
                padding: 24,
                textAlign: "center",
                color: "#888",
                fontSize: 13,
            }, children: "Loading type chart\u2026" }));
    }
    return (SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "#aaa",
                }, children: [SP_JSX.jsx("span", { children: "Attacker:" }), SP_JSX.jsx("select", { value: attacker, onChange: (e) => setAttacker(e.target.value), style: {
                            flex: 1,
                            padding: "6px 8px",
                            background: "#1a1a1a",
                            color: "#fff",
                            border: "1px solid #444",
                            borderRadius: 4,
                            fontSize: 13,
                            outline: "none",
                        }, children: typeChart.types.map((t) => (SP_JSX.jsx("option", { value: t, children: t }, t))) }), SP_JSX.jsx(TypeBadge, { type: attacker, size: "md" })] }), error && (SP_JSX.jsx("div", { style: { color: "#e87b7b", fontSize: 12, padding: "4px 0" }, children: error })), summary?.summary && (SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [BUCKETS.map((bucket) => {
                        const types = summary.summary?.[bucket.key] ?? [];
                        if (types.length === 0)
                            return null;
                        return (SP_JSX.jsxs("div", { style: {
                                padding: "6px 8px",
                                background: "rgba(255,255,255,0.03)",
                                borderRadius: 4,
                                borderLeft: `3px solid ${bucket.color}`,
                            }, children: [SP_JSX.jsxs("div", { style: {
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: bucket.color,
                                        textTransform: "uppercase",
                                        letterSpacing: 0.4,
                                        marginBottom: 4,
                                    }, children: [bucket.label, " (", types.length, ")"] }), SP_JSX.jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 }, children: types.map((t) => (SP_JSX.jsx(TypeBadge, { type: t, size: "sm" }, t))) })] }, bucket.key));
                    }), SP_JSX.jsxs("div", { style: {
                            fontSize: 10,
                            color: "#555",
                            textAlign: "right",
                            marginTop: 2,
                        }, children: ["Generation ", typeChart.generation, " type chart"] })] }))] }));
}

const TABS$1 = [
    { id: "party", label: "Party" },
    { id: "types", label: "Type Lookup" },
    { id: "moves", label: "Move Lookup" },
];
function TouchMenuContent() {
    const [tab, setTab] = SP_REACT.useState("party");
    return (SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "10px 12px 14px 12px",
            minWidth: 360,
            maxWidth: 720,
        }, children: [SP_JSX.jsx("div", { style: {
                    display: "flex",
                    gap: 6,
                    paddingBottom: 4,
                    borderBottom: "1px solid #2a2a2a",
                }, children: TABS$1.map((t) => (SP_JSX.jsx(TabButton, { active: tab === t.id, onClick: () => setTab(t.id), children: t.label }, t.id))) }), tab === "party" && SP_JSX.jsx(PartyTouchMenu, {}), tab === "types" && SP_JSX.jsx(TypeLookupTouchMenu, {}), tab === "moves" && SP_JSX.jsx(MoveLookupTouchMenu, {})] }));
}
function TabButton({ active, onClick, children, }) {
    return (SP_JSX.jsx("button", { onClick: onClick, style: {
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

let unpatch = null;
function registerTouchMenu() {
    if (unpatch)
        return;
    if (typeof DFL.PatchTouchMenu !== "function") {
        console.warn("[pokemon-overlay] PatchTouchMenu not available in this Decky version, skipping touch menu");
        return;
    }
    try {
        unpatch = DFL.PatchTouchMenu({
            menuLabel: "Pokémon Essentials",
            icon: SP_JSX.jsx(PokeballIcon, {}),
            content: SP_JSX.jsx(TouchMenuContent, {}),
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
    return (SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 10,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 6,
            borderLeft: `3px solid ${statusColor}`,
            opacity: fainted ? 0.6 : 1,
        }, children: [SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                }, children: [p.shiny && (SP_JSX.jsx("span", { style: {
                            color: "#f7d02c",
                            fontSize: 14,
                            textShadow: "0 0 4px rgba(247, 208, 44, 0.5)",
                        }, title: "Shiny", children: "\u2605" })), SP_JSX.jsx("span", { style: {
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#fff",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }, children: displayName }), SP_JSX.jsxs("span", { style: { fontSize: 11, color: "#888" }, children: ["Lv.", p.level] }), display.gender && (SP_JSX.jsx("span", { style: {
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
                                : "Female", children: GENDER_SYMBOLS[p.gender_name] ?? "?" }))] }), p.nickname && p.nickname !== p.species && (SP_JSX.jsx("div", { style: {
                    fontSize: 11,
                    color: "#888",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                }, children: p.species })), SP_JSX.jsxs("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" }, children: [p.type1 && SP_JSX.jsx(TypeBadge, { type: p.type1, size: "sm" }), display.type2 && p.has_type2 && p.type2 && (SP_JSX.jsx(TypeBadge, { type: p.type2, size: "sm" }))] }), SP_JSX.jsx(HealthBar, { hp: p.hp, maxHp: p.max_hp, statusName: p.status_name }), SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 11,
                    color: "#aaa",
                    flexWrap: "wrap",
                }, children: [SP_JSX.jsx("span", { children: SP_JSX.jsx("span", { style: { color: statusColor, fontWeight: 600 }, children: p.status_name }) }), compactInfo.map((c) => (SP_JSX.jsxs("span", { children: [SP_JSX.jsxs("span", { style: { color: "#777" }, children: [c.label, ":"] }), " ", c.value] }, c.label)))] }), display.moves && p.moves.length > 0 && (SP_JSX.jsx("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 4,
                    marginTop: 2,
                }, children: Array.from({ length: 4 }).map((_, i) => {
                    const move = p.moves[i];
                    return (SP_JSX.jsx("div", { style: {
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
                }) })), display.stats && p.has_stats && (SP_JSX.jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                    gap: 4,
                    padding: "6px 0",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    fontSize: 10,
                }, children: [SP_JSX.jsx(StatBox, { label: "ATK", value: p.attack }), SP_JSX.jsx(StatBox, { label: "DEF", value: p.defense }), SP_JSX.jsx(StatBox, { label: "SpA", value: p.spatk }), SP_JSX.jsx(StatBox, { label: "SpD", value: p.spdef }), SP_JSX.jsx(StatBox, { label: "SPE", value: p.speed })] })), display.ivs && p.has_ivs && p.iv_total != null && (SP_JSX.jsxs("div", { style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "6px 0",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    fontSize: 10,
                }, children: [SP_JSX.jsxs("div", { style: {
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                            gap: 4,
                        }, children: [SP_JSX.jsx(IVStat, { label: "HP", value: p.iv_hp }), SP_JSX.jsx(IVStat, { label: "ATK", value: p.iv_attack }), SP_JSX.jsx(IVStat, { label: "DEF", value: p.iv_defense }), SP_JSX.jsx(IVStat, { label: "SpA", value: p.iv_spatk }), SP_JSX.jsx(IVStat, { label: "SpD", value: p.iv_spdef }), SP_JSX.jsx(IVStat, { label: "SPE", value: p.iv_speed })] }), display.evs && p.has_evs && p.ev_total != null && (SP_JSX.jsxs("div", { style: {
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                            gap: 4,
                            color: "#666",
                        }, children: [SP_JSX.jsx(EVStat, { label: "HP", value: p.ev_hp }), SP_JSX.jsx(EVStat, { label: "ATK", value: p.ev_attack }), SP_JSX.jsx(EVStat, { label: "DEF", value: p.ev_defense }), SP_JSX.jsx(EVStat, { label: "SpA", value: p.ev_spatk }), SP_JSX.jsx(EVStat, { label: "SpD", value: p.ev_spdef }), SP_JSX.jsx(EVStat, { label: "SPE", value: p.ev_speed })] })), SP_JSX.jsxs("div", { style: {
                            fontSize: 10,
                            color: "#888",
                            display: "flex",
                            gap: 8,
                            marginTop: 2,
                        }, children: [SP_JSX.jsxs("span", { children: ["IV: ", p.iv_total, "/186", " ", SP_JSX.jsx("span", { style: { color: statColor(p.iv_total, 186) }, children: "\u25CF" })] }), display.evs && p.has_evs && p.ev_total != null && (SP_JSX.jsxs("span", { children: ["EV: ", p.ev_total, "/510", " ", SP_JSX.jsx("span", { style: { color: statColor(p.ev_total, 510) }, children: "\u25CF" })] }))] })] }))] }));
}
function StatBox({ label, value }) {
    return (SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
        }, children: [SP_JSX.jsx("div", { style: {
                    fontSize: 9,
                    color: "#777",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                }, children: label }), SP_JSX.jsx("div", { style: {
                    fontSize: 12,
                    color: "#ddd",
                    fontVariantNumeric: "tabular-nums",
                }, children: value ?? "—" })] }));
}
function IVStat({ label, value, }) {
    return (SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
        }, title: value == null ? "?" : `${value}/31`, children: [SP_JSX.jsx("div", { style: {
                    fontSize: 9,
                    color: "#5eba7d",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                }, children: label }), SP_JSX.jsx("div", { style: {
                    fontSize: 11,
                    color: value == null ? "#555" : statColor(value, 31),
                    fontVariantNumeric: "tabular-nums",
                }, children: value ?? "—" })] }));
}
function EVStat({ label, value, }) {
    return (SP_JSX.jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
        }, title: value == null ? "?" : `${value} EVs`, children: [SP_JSX.jsx("div", { style: {
                    fontSize: 9,
                    color: "#7ba3e8",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                }, children: label }), SP_JSX.jsx("div", { style: {
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
    return (SP_JSX.jsx("div", { style: {
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            fontSize: 10,
            color: "#888",
        }, children: items.map(([label, value]) => (SP_JSX.jsx("span", { style: {
                background: "rgba(94,186,125,0.1)",
                color: "#5eba7d",
                padding: "2px 6px",
                borderRadius: 3,
                border: "1px solid rgba(94,186,125,0.2)",
            }, children: label }, label))) }));
}

function StatusDot({ ok }) {
    return (SP_JSX.jsx("span", { style: {
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
    const live = useStore((s) => s.liveState);
    if (!info) {
        return (SP_JSX.jsx(DFL.PanelSection, { title: "Pok\u00E9mon Essentials Overlay", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 0",
                    }, children: SP_JSX.jsx("span", { style: { fontSize: 13, color: "#969696" }, children: "Loading\u2026" }) }) }) }));
    }
    return (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsx(DFL.PanelSection, { title: "About", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            padding: "4px 0",
                        }, children: [SP_JSX.jsxs("div", { style: { fontSize: 14, fontWeight: 600 }, children: [String(info.name), " ", SP_JSX.jsxs("span", { style: { color: "#969696", fontWeight: 400 }, children: ["v", String(info.version)] })] }), SP_JSX.jsx("div", { style: {
                                    fontSize: 12,
                                    color: "#969696",
                                    lineHeight: 1.4,
                                }, children: String(info.description) })] }) }) }), SP_JSX.jsx(DFL.PanelSection, { title: "Status", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: {
                            fontSize: 12,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            padding: "4px 0",
                        }, children: [SP_JSX.jsxs("div", { children: [SP_JSX.jsx(StatusDot, { ok: info.initialized }), info.initialized ? "Backend ready" : "Backend not initialized"] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsx(StatusDot, { ok: info.type_chart_loaded }), info.type_chart_loaded
                                        ? `Type chart loaded (${info.type_chart_types} types)`
                                        : "Type chart not loaded"] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsx(StatusDot, { ok: movesDb?.loaded ?? false }), movesDb?.loaded
                                        ? movesDb.pbs_source
                                            ? `Moves DB: ${movesDb.merged_count} (PBS loaded)`
                                            : `Moves DB: ${movesDb.static_count} static only`
                                        : "Moves DB not loaded"] }), live && (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsxs("div", { children: [SP_JSX.jsx(StatusDot, { ok: live.game_running }), live.game_running
                                                ? `Game running: ${String(live.active_process?.name ?? "unknown")} (pid ${String(live.active_process?.pid ?? "?")})`
                                                : "No game process detected"] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsx(StatusDot, { ok: live.watcher_active }), live.watcher_active
                                                ? `Save watcher active${live.last_live_event?.at
                                                    ? ` · last event ${timeAgo$1(live.last_live_event.at)}`
                                                    : ""}`
                                                : "Save watcher inactive"] })] })), saveData && !saveData.error && saveData.features && (SP_JSX.jsxs("div", { style: {
                                    marginTop: 4,
                                    paddingTop: 6,
                                    borderTop: "1px solid rgba(255,255,255,0.05)",
                                }, children: [SP_JSX.jsxs("div", { style: {
                                            fontSize: 10,
                                            color: "#777",
                                            textTransform: "uppercase",
                                            letterSpacing: 0.4,
                                            marginBottom: 4,
                                        }, children: ["Save features (", saveData.version, ")"] }), SP_JSX.jsx(CapabilitiesSummary, { features: saveData.features })] }))] }) }) }), SP_JSX.jsx(DFL.PanelSection, { title: "Roadmap", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: {
                            fontSize: 12,
                            color: "#969696",
                            lineHeight: 1.6,
                        }, children: [SP_JSX.jsxs("div", { children: [SP_JSX.jsx("span", { style: { color: "#5eba7d" }, children: "\u25CF" }), " Phase 1 \u2014 Foundation"] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsx("span", { style: { color: "#5eba7d" }, children: "\u25CF" }), " Phase 2 \u2014 Interactive type chart"] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsx("span", { style: { color: "#5eba7d" }, children: "\u25CF" }), " Phase 3 \u2014 Save-file parser & party status"] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsx("span", { style: { color: "#5eba7d" }, children: "\u25CF" }), " Phase 4 \u2014 In-game TouchMenu overlay"] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsx("span", { style: { color: "#5eba7d" }, children: "\u25CF" }), " Phase 5 \u2014 Live PBS, IV/EV, dynamic UI, themes, watcher"] })] }) }) })] }));
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
    const data = useStore((s) => s.saveData);
    const settings = useStore((s) => s.settings);
    const [reloading, setReloading] = SP_REACT.useState(false);
    const reload = SP_REACT.useCallback(async () => {
        setReloading(true);
        try {
            await refreshSave(true);
        }
        finally {
            setReloading(false);
        }
    }, []);
    if (!data) {
        return (SP_JSX.jsx(DFL.PanelSection, { title: "Party", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "12px 0",
                    }, children: [SP_JSX.jsx(DFL.Spinner, {}), SP_JSX.jsx("span", { style: { fontSize: 13, color: "#969696" }, children: "Loading save data\u2026" })] }) }) }));
    }
    if (data.error === "no_save_file_found") {
        return (SP_JSX.jsxs(DFL.PanelSection, { title: "Party", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: { fontSize: 13, color: "#969696", lineHeight: 1.5 }, children: ["No save file found. Start the game and save once, or set a manual path in ", SP_JSX.jsx("strong", { children: "Settings" }), "."] }) }), SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: reload, disabled: reloading, children: reloading ? "Scanning…" : "Scan again" })] }));
    }
    if (data.error === "parse_failed") {
        return (SP_JSX.jsxs(DFL.PanelSection, { title: "Party", children: [SP_JSX.jsxs(DFL.PanelSectionRow, { children: [SP_JSX.jsxs("div", { style: { color: "#e87b7b", fontSize: 13 }, children: ["Parse error: ", data.message] }), SP_JSX.jsx("div", { style: {
                                fontSize: 11,
                                color: "#777",
                                marginTop: 6,
                                wordBreak: "break-all",
                            }, children: data.path })] }), SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: reload, disabled: reloading, children: "Try again" })] }));
    }
    const compactMode = settings?.compact_mode ?? true;
    return (SP_JSX.jsx(PartyContent, { data: data, reloading: reloading, onReload: reload, autoRefreshSeconds: settings?.scan_interval_seconds ?? 30, forced: compactMode ? undefined : DEFAULT_DISPLAY }));
}
function PartyContent({ data, reloading, onReload, autoRefreshSeconds, forced, }) {
    const party = data.party || [];
    const slots = Array.from({ length: MAX_PARTY_SLOTS }).map((_, i) => party[i] || null);
    return (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsxs(DFL.PanelSection, { title: data.trainer_name || "Trainer", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: {
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 4,
                                fontSize: 12,
                            }, children: [SP_JSX.jsx(Stat, { label: "Money", value: formatMoney(data.money) }), SP_JSX.jsx(Stat, { label: "Badges", value: String(data.badges) }), SP_JSX.jsx(Stat, { label: "Location", value: data.location_name || `Map #${data.map_id ?? "?"}` }), SP_JSX.jsx(Stat, { label: "Position", value: `${data.x ?? "?"}, ${data.y ?? "?"}` }), SP_JSX.jsx(Stat, { label: "Play time", value: formatPlayTime(data.play_time_seconds) }), SP_JSX.jsx(Stat, { label: "Version", value: data.version })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: { fontSize: 11, color: "#777" }, children: ["Updated ", timeAgo(data.parsed_at), " \u00B7 auto-refresh every", " ", Math.max(5, autoRefreshSeconds), "s"] }) }), SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: onReload, disabled: reloading, children: reloading ? "Reloading…" : "Reload from disk" })] }), data.features && (SP_JSX.jsx(DFL.PanelSection, { title: "Detected features", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(CapabilitiesSummary, { features: data.features }) }) })), SP_JSX.jsx(DFL.PanelSection, { title: `Party (${party.length}/${MAX_PARTY_SLOTS})`, children: slots.map((p, i) => p ? (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(PokemonCard, { pokemon: p, features: data.features, forced: forced }) }, `slot-${i}`)) : (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: {
                            padding: 10,
                            background: "rgba(255,255,255,0.02)",
                            borderRadius: 6,
                            border: "1px dashed #333",
                            textAlign: "center",
                            fontSize: 11,
                            color: "#555",
                            fontStyle: "italic",
                        }, children: ["Slot ", i + 1, " \u2014 empty"] }) }, `slot-${i}`))) }), SP_JSX.jsx(DFL.PanelSection, { title: "Source", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: {
                            fontSize: 10,
                            color: "#666",
                            wordBreak: "break-all",
                            lineHeight: 1.4,
                        }, children: data.source_path }) }) })] }));
}
function Stat({ label, value }) {
    return (SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [SP_JSX.jsx("div", { style: {
                    fontSize: 10,
                    color: "#777",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                }, children: label }), SP_JSX.jsx("div", { style: { fontSize: 12, color: "#ddd" }, children: value })] }));
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
    const [resolved, setResolved] = SP_REACT.useState(null);
    const [candidates, setCandidates] = SP_REACT.useState([]);
    const [overrideInput, setOverrideInput] = SP_REACT.useState("");
    const [pbsInput, setPbsInput] = SP_REACT.useState("");
    const [busy, setBusy] = SP_REACT.useState(false);
    const [pbsBusy, setPbsBusy] = SP_REACT.useState(false);
    const [statusMsg, setStatusMsg] = SP_REACT.useState(null);
    const [statusError, setStatusError] = SP_REACT.useState(null);
    const [themes, setThemes] = SP_REACT.useState([]);
    const refresh = SP_REACT.useCallback(async () => {
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
    SP_REACT.useEffect(() => {
        refresh();
    }, [refresh]);
    SP_REACT.useEffect(() => {
        api
            .getThemes()
            .then((r) => setThemes(r.themes))
            .catch((e) => console.error("themes", e));
    }, [theme?.id]);
    SP_REACT.useEffect(() => {
        if (settings)
            setOverrideInput(settings.save_path_override ?? "");
    }, [settings?.save_path_override]);
    SP_REACT.useEffect(() => {
        if (movesDb)
            setPbsInput(movesDb.pbs_source ?? "");
    }, [movesDb?.pbs_source]);
    const reloadPbsAuto = SP_REACT.useCallback(async () => {
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
    const applyPbsPath = SP_REACT.useCallback(async () => {
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
    const clearPbs = SP_REACT.useCallback(async () => {
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
    const applyOverride = SP_REACT.useCallback(async () => {
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
    const clearOverride = SP_REACT.useCallback(async () => {
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
    const useCandidate = SP_REACT.useCallback(async (path) => {
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
    const setAutoScan = SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ auto_scan_enabled: v });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    const setTouchmenu = SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ touchmenu_enabled: v });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    const setScanInterval = SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ scan_interval_seconds: Math.max(5, v) });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    const setCompactMode = SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ compact_mode: v });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    const setTheme = SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ theme: v });
            await refreshTheme();
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    const setWatcherEnabled = SP_REACT.useCallback(async (v) => {
        try {
            await applySettingsPatch({ watcher_enabled: v });
            setStatusMsg(v ? "Live save watcher enabled." : "Live save watcher disabled.");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusError(msg);
        }
    }, []);
    if (!settings) {
        return (SP_JSX.jsx(DFL.PanelSection, { title: "Settings", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: { fontSize: 12, color: "#969696" }, children: "Loading\u2026" }) }) }));
    }
    return (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsxs(DFL.PanelSection, { title: "Save resolution", children: [SP_JSX.jsxs(DFL.PanelSectionRow, { children: [SP_JSX.jsx("div", { style: { fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4, padding: "4px 0" }, children: "Active save" }), SP_JSX.jsx("div", { style: { fontSize: 12, color: resolved?.path ? "#5eba7d" : "#e0a458", wordBreak: "break-all", padding: "4px 0" }, children: resolved?.path || "— no save found —" }), resolved?.using_override && (SP_JSX.jsx("div", { style: { fontSize: 10, color: "#777", padding: "2px 0" }, children: "(using manual override)" }))] }), SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: refresh, disabled: busy, children: busy ? "Scanning…" : "Rescan saves" })] }), SP_JSX.jsxs(DFL.PanelSection, { title: "Manual override", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: { fontSize: 11, color: "#888", lineHeight: 1.4, padding: "4px 0 8px 0" }, children: "If auto-detection fails, paste the full path to a save file here. Leave blank to use auto-detection." }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.TextField, { label: "Path to save file", value: overrideInput, onChange: (e) => setOverrideInput(e.target.value) }) }), SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: applyOverride, disabled: busy, children: "Apply override" }), settings.save_path_override && (SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: clearOverride, disabled: busy, children: "Clear override" }))] }), SP_JSX.jsx(DFL.PanelSection, { title: "Auto-detect options", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Toggle, { value: settings.auto_scan_enabled, onChange: setAutoScan, children: "Auto-scan running processes and Wine prefixes" }) }) }), SP_JSX.jsx(DFL.PanelSection, { title: "Display", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Toggle, { value: settings.compact_mode, onChange: setCompactMode, children: "Compact mode (auto-hide empty sections)" }) }) }), SP_JSX.jsxs(DFL.PanelSection, { title: "Theme", children: [SP_JSX.jsxs(DFL.PanelSectionRow, { children: [SP_JSX.jsx("div", { style: { fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4, padding: "4px 0" }, children: "Active theme" }), SP_JSX.jsx("div", { style: { fontSize: 12, color: theme ? theme.palette.accent : "#888", padding: "4px 0" }, children: theme ? theme.name : "Loading…" })] }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Dropdown, { menuLabel: "Theme", selectedOption: settings.theme || "default", onChange: (opt) => setTheme(opt.data), options: themes.map((t) => ({ data: t.id, label: t.name })), disabled: themes.length === 0 }) })] }), SP_JSX.jsxs(DFL.PanelSection, { title: "PBS moves database", children: [SP_JSX.jsxs(DFL.PanelSectionRow, { children: [SP_JSX.jsx("div", { style: { fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4, padding: "4px 0" }, children: "Active PBS source" }), SP_JSX.jsx("div", { style: { fontSize: 11, color: movesDb?.pbs_source ? "#5eba7d" : "#888", wordBreak: "break-all", padding: "4px 0" }, children: movesDb?.pbs_source ? shortenPath(movesDb.pbs_source, 80) : "— not loaded (using static DB) —" }), SP_JSX.jsx("div", { style: { fontSize: 10, color: "#777", padding: "2px 0" }, children: movesDb ? `${movesDb.merged_count} moves total · ${movesDb.static_count} static · ${movesDb.pbs_count} from game PBS` : "Loading…" })] }), SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: reloadPbsAuto, disabled: pbsBusy, children: pbsBusy ? "Scanning…" : "Auto-discover PBS" }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.TextField, { label: "Manual PBS path (moves.txt)", value: pbsInput, onChange: (e) => setPbsInput(e.target.value) }) }), SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: applyPbsPath, disabled: pbsBusy || !pbsInput.trim(), children: "Load PBS from path" }), movesDb?.pbs_source && (SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: clearPbs, disabled: pbsBusy, children: "Clear PBS (use static only)" }))] }), SP_JSX.jsx(DFL.PanelSection, { title: "TouchMenu overlay", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Toggle, { value: settings.touchmenu_enabled, onChange: setTouchmenu, children: "Enable in-game touch menu" }) }) }), SP_JSX.jsxs(DFL.PanelSection, { title: "Polling", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: { fontSize: 11, color: "#888", marginBottom: 4, padding: "4px 0" }, children: ["Backend live watcher checks the disk every", " ", SP_JSX.jsx("strong", { style: { color: "#ccc" }, children: Math.max(5, settings.scan_interval_seconds) }), " ", "units. The UI will always update instantly when changes occur."] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.TextField, { label: "Interval (seconds)", value: String(settings.scan_interval_seconds), onChange: (e) => {
                                const n = parseInt(e.target.value, 10);
                                if (!isNaN(n))
                                    setScanInterval(n);
                            } }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Toggle, { value: settings.watcher_enabled ?? true, onChange: setWatcherEnabled, children: "Live save watcher (sub-second updates)" }) })] }), candidates.length > 0 && (SP_JSX.jsx(DFL.PanelSection, { title: `Discovered saves (${candidates.length})`, children: candidates.map((c) => (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 4, padding: "4px 0" }, children: [SP_JSX.jsx("div", { style: { fontSize: 11, color: "#ddd", wordBreak: "break-all" }, children: c.path }), SP_JSX.jsxs("div", { style: { fontSize: 10, color: "#777" }, children: [fmtSize(c.size), " \u00B7 modified ", fmtTime(c.modified)] }), SP_JSX.jsx(DFL.ButtonItem, { layout: "inline", onClick: () => useCandidate(c.path), children: "Use this save" })] }) }, c.path))) })), (statusMsg || statusError) && (SP_JSX.jsx(DFL.PanelSection, { title: "Status", children: SP_JSX.jsxs(DFL.PanelSectionRow, { children: [statusMsg && SP_JSX.jsx("div", { style: { fontSize: 12, color: "#5eba7d", padding: "4px 0" }, children: statusMsg }), statusError && SP_JSX.jsx("div", { style: { fontSize: 12, color: "#e87b7b", padding: "4px 0" }, children: statusError })] }) }))] }));
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
    return (SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [SP_JSX.jsxs("div", { style: { fontSize: "12px", color: "#969696" }, children: ["Defender:", " ", defenders.map((d, i) => (SP_JSX.jsxs("span", { style: { marginRight: "4px" }, children: [SP_JSX.jsx(TypeBadge, { type: d, size: "sm" }), i < defenders.length - 1 ? " /" : ""] }, d)))] }), BUCKET_ORDER.filter((b) => (summary[b] || []).length > 0).map((bucket) => {
                const types = summary[bucket] || [];
                return (SP_JSX.jsxs("div", { style: {
                        padding: "6px 8px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "4px",
                        borderLeft: `3px solid ${BUCKET_COLORS[bucket]}`,
                    }, children: [SP_JSX.jsxs("div", { style: {
                                fontSize: "11px",
                                fontWeight: 600,
                                color: BUCKET_COLORS[bucket],
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                marginBottom: "4px",
                            }, children: [BUCKET_LABELS[bucket], " (", types.length, ")"] }), SP_JSX.jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" }, children: types.map((t) => (SP_JSX.jsx(TypeBadge, { type: t, size: "sm" }, t))) })] }, bucket));
            })] }));
}
const OFFENSE_BUCKETS = [
    { key: "super_effective", label: "Super effective", color: "#ff8a3d" },
    { key: "not_very_effective", label: "Not very effective", color: "#5eba7d" },
    { key: "no_effect", label: "No effect", color: "#444" },
    { key: "neutral", label: "Normal damage", color: "#888" },
];
function OffenseGrid({ attacker, summary }) {
    return (SP_JSX.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [SP_JSX.jsxs("div", { style: { fontSize: "12px", color: "#969696" }, children: ["Attacker: ", SP_JSX.jsx(TypeBadge, { type: attacker, size: "sm" })] }), OFFENSE_BUCKETS.filter((b) => (summary[b.key] || []).length > 0).map((bucket) => {
                const types = summary[bucket.key] || [];
                return (SP_JSX.jsxs("div", { style: {
                        padding: "6px 8px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "4px",
                        borderLeft: `3px solid ${bucket.color}`,
                    }, children: [SP_JSX.jsxs("div", { style: {
                                fontSize: "11px",
                                fontWeight: 600,
                                color: bucket.color,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                marginBottom: "4px",
                            }, children: [bucket.label, " (", types.length, ")"] }), SP_JSX.jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" }, children: types.map((t) => (SP_JSX.jsx(TypeBadge, { type: t, size: "sm" }, t))) })] }, bucket.key));
            })] }));
}

const NO_TYPE = "(none)";
function TypeChartView() {
    const chart = useStore((s) => s.typeChart);
    const [error, setError] = SP_REACT.useState(null);
    const [mode, setMode] = SP_REACT.useState("defense");
    const [attacker, setAttacker] = SP_REACT.useState("Fire");
    const [def1, setDef1] = SP_REACT.useState("Fire");
    const [def2, setDef2] = SP_REACT.useState(NO_TYPE);
    const [defense, setDefense] = SP_REACT.useState(null);
    const [offense, setOffense] = SP_REACT.useState(null);
    const [loading, setLoading] = SP_REACT.useState(false);
    const types = chart?.types ?? [];
    const typeOptions = SP_REACT.useMemo(() => [
        { data: NO_TYPE, label: NO_TYPE },
        ...types.map((t) => ({ data: t, label: t })),
    ], [types]);
    const attackerOptions = SP_REACT.useMemo(() => types.map((t) => ({ data: t, label: t })), [types]);
    const defenderPair = SP_REACT.useMemo(() => (def2 === NO_TYPE ? [def1] : [def1, def2]), [def1, def2]);
    SP_REACT.useEffect(() => {
        if (!chart)
            return;
        setLoading(true);
        setError(null);
        const promise = mode === "defense"
            ? api.getDefenseSummary(defenderPair)
            : api.getOffenseSummary(attacker);
        promise
            .then((res) => {
            if ("error" in res && res.error) {
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
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [chart, mode, attacker, defenderPair]);
    if (!chart) {
        return (SP_JSX.jsx(DFL.PanelSection, { title: "Type Chart", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }, children: [SP_JSX.jsx(DFL.Spinner, {}), SP_JSX.jsx("span", { style: { fontSize: 13, color: "#969696" }, children: "Loading type chart\u2026" })] }) }) }));
    }
    return (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsx(DFL.PanelSection, { title: "Mode", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs(DFL.ButtonItem, { layout: "below", onClick: () => setMode(mode === "defense" ? "offense" : "defense"), children: ["Mode: ", mode === "defense" ? "Defender" : "Attacker", " (click to switch)"] }) }) }), SP_JSX.jsx(DFL.PanelSection, { title: mode === "defense" ? "Defender types" : "Attacker type", children: mode === "defense" ? (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Dropdown, { menuLabel: "Type 1", selectedOption: def1, onChange: (opt) => setDef1(opt.data), options: attackerOptions }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Dropdown, { menuLabel: "Type 2", selectedOption: def2, onChange: (opt) => setDef2(opt.data), options: typeOptions }) })] })) : (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Dropdown, { menuLabel: "Attacker", selectedOption: attacker, onChange: (opt) => setAttacker(opt.data), options: attackerOptions }) })) }), loading && (SP_JSX.jsx(DFL.PanelSection, { children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }, children: [SP_JSX.jsx(DFL.Spinner, {}), SP_JSX.jsx("span", { style: { fontSize: 12, color: "#969696" }, children: "Updating\u2026" })] }) }) })), error && (SP_JSX.jsx(DFL.PanelSection, { children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: { color: "#e87b7b", fontSize: 12, padding: "4px 0" }, children: error }) }) })), mode === "defense" && defense && defense.summary && (SP_JSX.jsx(DFL.PanelSection, { title: "What hits this Pok\u00E9mon?", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DefenseGrid, { defenders: defense.defenders ?? [], summary: defense.summary }) }) })), mode === "offense" && offense && offense.summary && (SP_JSX.jsx(DFL.PanelSection, { title: "What does it hit?", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(OffenseGrid, { attacker: offense.attacker ?? attacker, summary: offense.summary }) }) }))] }));
}

const TABS = [
    { id: "status", label: "Status" },
    { id: "typechart", label: "Type Chart" },
    { id: "party", label: "Party" },
    { id: "settings", label: "Settings" },
];
function PluginContent() {
    const [active, setActive] = SP_REACT.useState("status");
    const settings = useStore((s) => s.settings);
    const theme = useStore((s) => s.theme);
    const interval = settings?.scan_interval_seconds ?? 30;
    SP_REACT.useEffect(() => {
        refreshStatic();
    }, []);
    SP_REACT.useEffect(() => {
        startPolling();
        return () => stopPolling();
    }, [interval]);
    SP_REACT.useEffect(() => {
        registerTouchMenu();
        return () => unregisterTouchMenu();
    }, []);
    const palette = theme?.palette ?? DEFAULT_PALETTE;
    const themeStyle = SP_REACT.useMemo(() => paletteToCssVars(palette), [palette]);
    return (SP_JSX.jsxs(DFL.Focusable, { style: { display: "flex", flexDirection: "column", ...themeStyle }, children: [SP_JSX.jsx(TabBar, { tabs: TABS, activeId: active, onChange: (id) => setActive(id) }), SP_JSX.jsx(DFL.ScrollPanel, { focusable: false, style: { flex: 1, maxHeight: "100%" }, children: SP_JSX.jsxs(DFL.PanelSection, { children: [active === "status" && SP_JSX.jsx(HomeView, {}), active === "typechart" && SP_JSX.jsx(TypeChartView, {}), active === "party" && SP_JSX.jsx(PartyView, {}), active === "settings" && SP_JSX.jsx(SettingsView, {})] }) })] }));
}
var index = definePlugin(() => {
    return {
        name: "Pokémon Essentials Overlay",
        titleView: (SP_JSX.jsxs("div", { style: {
                display: "flex",
                alignItems: "center",
                gap: "6px",
                paddingLeft: "4px",
            }, children: [SP_JSX.jsx(PokeballIcon, { size: 18 }), SP_JSX.jsx("span", { children: "Pok\u00E9mon Essentials Overlay" })] })),
        content: SP_JSX.jsx(PluginContent, {}),
        icon: SP_JSX.jsx(PokeballIcon, {}),
        onDismount() {
            unregisterTouchMenu();
            stopPolling();
            console.log("[pokemon-overlay] dismounted");
        },
    };
});

export { index as default };
//# sourceMappingURL=index.js.map
