import { call } from "./decky-shim";

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  initialized: boolean;
  type_chart_loaded: boolean;
  type_chart_types: number;
}

export interface PluginSettings {
  save_path_override: string | null;
  auto_scan_enabled: boolean;
  touchmenu_position: { x: number; y: number };
  scan_interval_seconds: number;
  touchmenu_enabled: boolean;
  last_save_path: string | null;
  theme: string;
  compact_mode: boolean;
  [key: string]: unknown;
}

export interface TypeChartData {
  types: string[];
  colors: Record<string, string>;
  multipliers: Record<string, Record<string, number>>;
  generation: number;
  loaded: boolean;
}

export interface MatchupBreakdownEntry {
  defender: string;
  multiplier: number;
}

export interface MatchupResult {
  attacker?: string;
  defenders?: string[];
  multiplier?: number;
  breakdown?: MatchupBreakdownEntry[];
  error?: string;
}

export type Effectiveness = "quadruple" | "double" | "neutral" | "half" | "quarter" | "immune";

export interface DefenseSummary {
  defenders?: string[];
  summary?: Record<Effectiveness, string[]>;
  error?: string;
}

export interface OffenseSummary {
  attacker?: string;
  summary?: Record<"super_effective" | "not_very_effective" | "no_effect" | "neutral", string[]>;
  error?: string;
}

export interface PokemonSummary {
  species: string;
  nickname: string | null;
  level: number;
  hp: number;
  max_hp: number;
  status: number;
  status_name: string;
  type1: string | null;
  type2: string | null;
  moves: string[];
  ability: string | null;
  item: string | null;
  gender: number;
  gender_name: string;
  shiny: boolean;
  nature: string | null;
  attack: number | null;
  defense: number | null;
  spatk: number | null;
  spdef: number | null;
  speed: number | null;
  iv_hp: number | null;
  iv_attack: number | null;
  iv_defense: number | null;
  iv_spatk: number | null;
  iv_spdef: number | null;
  iv_speed: number | null;
  ev_hp: number | null;
  ev_attack: number | null;
  ev_defense: number | null;
  ev_spatk: number | null;
  ev_spdef: number | null;
  ev_speed: number | null;
  happiness: number | null;
  hp_percent: number;
  is_fainted: boolean;
  iv_total: number | null;
  ev_total: number | null;
  has_ivs: boolean;
  has_evs: boolean;
  has_happiness: boolean;
  has_ability: boolean;
  has_item: boolean;
  has_nature: boolean;
  has_stats: boolean;
  has_moves: boolean;
  has_type2: boolean;
  has_gender_data: boolean;
}

export interface SaveFeatures {
  ivs: boolean;
  evs: boolean;
  happiness: boolean;
  stats: boolean;
  moves: boolean;
  natures: boolean;
  abilities: boolean;
  items: boolean;
  type2: boolean;
  shiny: boolean;
  gender: boolean;
}

export interface SaveData {
  version: string;
  essentials_version: string | null;
  trainer_name: string;
  party: PokemonSummary[];
  party_count: number;
  money: number;
  badges: number;
  location_name: string;
  map_id: number | null;
  x: number | null;
  y: number | null;
  play_time_seconds: number;
  parsed_at: number;
  source_path: string;
  features: SaveFeatures;
  error?: string;
  message?: string;
  path?: string | null;
}

export interface SaveFileCandidate {
  path: string;
  size: number;
  modified: number;
}

export interface SavePathResult {
  path: string | null;
  using_override: boolean;
}

export interface MoveInfo {
  type: string;
  category: string;
  power: number;
  accuracy: number;
  pp: number;
  source: "static" | "pbs" | "heuristic";
  name?: string;
  normalized?: string;
  description?: string;
  guessed?: boolean;
}

export interface MovesDatabase {
  loaded: boolean;
  pbs_source: string | null;
  static_count: number;
  pbs_count: number;
  merged_count: number;
  moves: Record<string, MoveInfo>;
}

export interface PbsLoadResult {
  loaded: boolean;
  count: number;
  source: string;
  database: MovesDatabase;
}

export interface PbsAutoLoadResult {
  loaded: boolean;
  source: string | null;
  database: MovesDatabase;
}

export interface ThemeSummary {
  id: string;
  name: string;
  description: string;
}

export interface ThemePalette {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentBg: string;
  shiny: string;
  female: string;
  male: string;
  genderless: string;
  hpGood: string;
  hpWarn: string;
  hpBad: string;
  statusOK: string;
  statusPSN: string;
  statusPAR: string;
  statusBRN: string;
  statusSLP: string;
  statusFRZ: string;
  statusFNT: string;
  typeBadgeText: string;
  badgeShadow: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  palette: ThemePalette;
}

export interface ThemesResponse {
  themes: ThemeSummary[];
  active: Theme;
}

export interface GameProcess {
  pid: number | null;
  name: string | null;
  cmdline: string;
}

export interface LiveState {
  game_running: boolean;
  processes: GameProcess[];
  active_process: GameProcess | null;
  watcher_active: boolean;
  last_live_event: {
    kind?: string;
    path?: string;
    at?: number;
    trainer?: string;
  } | null;
  last_save_data: SaveData | null;
  last_save_path: string | null;
}

async function callOrThrow<T>(method: string, ...args: unknown[]): Promise<T> {
  try {
    return await call<T>(method, ...args);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`[${method}] ${reason}`);
  }
}

export const api = {
  getPluginInfo: () => callOrThrow<PluginInfo>("get_plugin_info"),
  getSettings: () => callOrThrow<PluginSettings>("get_settings"),
  updateSettings: (patch: Partial<PluginSettings>) =>
    callOrThrow<PluginSettings>("update_settings", patch),
  getTypeChart: () => callOrThrow<TypeChartData>("get_type_chart"),
  getMatchup: (attacker: string, defenderTypes: string[]) =>
    callOrThrow<MatchupResult>("get_matchup", attacker, defenderTypes),
  getDefenseSummary: (defenderTypes: string[]) =>
    callOrThrow<DefenseSummary>("get_defense_summary", defenderTypes),
  getOffenseSummary: (attacker: string) =>
    callOrThrow<OffenseSummary>("get_offense_summary", attacker),
  findSavePath: () => callOrThrow<SavePathResult>("find_save_path"),
  listSaveFiles: () => callOrThrow<SaveFileCandidate[]>("list_save_files"),
  getSaveData: (forceReload = false) =>
    callOrThrow<SaveData>("get_save_data", forceReload),
  getSaveDataFromPath: (path: string) =>
    callOrThrow<SaveData>("get_save_data_from_path", path),
  getMovesDatabase: () => callOrThrow<MovesDatabase>("get_moves_database"),
  getMoveInfo: (name: string) =>
    callOrThrow<MoveInfo | null>("get_move_info", name),
  lookupMoves: (names: string[]) =>
    callOrThrow<Record<string, MoveInfo | null>>("lookup_moves", names),
  findPbsFiles: (savePath?: string) =>
    callOrThrow<Record<string, string>>("find_pbs_files", savePath ?? null),
  loadPbsMoves: (path: string) =>
    callOrThrow<PbsLoadResult>("load_pbs_moves", path),
  autoLoadPbs: () => callOrThrow<PbsAutoLoadResult>("auto_load_pbs"),
  getThemes: () => callOrThrow<ThemesResponse>("get_themes"),
  getActiveTheme: () => callOrThrow<Theme>("get_active_theme"),
  getLiveState: () => callOrThrow<LiveState>("get_live_state"),
  getLiveSaveData: () => callOrThrow<SaveData | null>("get_live_save_data"),
  setWatcherEnabled: (enabled: boolean) =>
    callOrThrow<{ watcher_active: boolean }>("set_watcher_enabled", enabled),
  findProcessBySave: (savePath: string) =>
    callOrThrow<GameProcess | null>("find_process_by_save", savePath),
  getProcessMemoryRegions: (pid: number) =>
    callOrThrow<MemoryRegion[]>("get_process_memory_regions", pid),
};

export interface MemoryRegion {
  path: string;
  start: string;
  end: string;
  perms: string;
}
