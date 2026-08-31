// @vitest-environment jsdom
/**
 * Round-12: view component tests (HomeView, BattleAnalyzerView,
 * TypeChartView). State is injected through the real store's refresh
 * functions with a mocked api module. Assertions target text/structure;
 * colors stay flexible (theme vars).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  BattleAnalysis,
  LiveState,
  PluginInfo,
  SaveData,
  SaveFeatures,
} from "../../../src/api";

vi.mock("../../../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/api")>();
  return {
    ...actual,
    api: {
      getSaveData: vi.fn(async () => null),
      getMoveInfo: vi.fn(async () => null),
      getOffenseSummary: vi.fn(async () => null),
      getDefenseSummary: vi.fn(async () => null),
      getMatchup: vi.fn(async () => null),
      getPluginInfo: vi.fn(async () => null),
      getTypeChart: vi.fn(async () => null),
      getSettings: vi.fn(async () => null),
      getMovesDatabase: vi.fn(async () => null),
      getThemes: vi.fn(async () => ({ themes: [], active: null })),
      getLiveState: vi.fn(async () => null),
      updateSettings: vi.fn(async () => null),
    },
  };
});

import { api } from "../../../src/api";
import * as store from "../../../src/store";
import { BattleAnalyzerView } from "../../../src/views/BattleAnalyzerView";
import { HomeView } from "../../../src/views/HomeView";
import { TypeChartView } from "../../../src/views/TypeChartView";

const mockedApi = api as unknown as Record<
  string,
  ReturnType<typeof vi.fn> & { mockResolvedValue: (v: unknown) => void }
>;

const ALL_FEATURES: SaveFeatures = {
  ivs: true, evs: true, happiness: true, stats: true, moves: true,
  natures: true, abilities: true, items: true, type2: true, shiny: true, gender: true,
};

function pluginInfo(overrides: Partial<PluginInfo> = {}): PluginInfo {
  return {
    name: "PokeStat Tracker",
    version: "1.2.3",
    description: "Tracks party stats.",
    initialized: true,
    type_chart_loaded: true,
    type_chart_types: 18,
    ...overrides,
  };
}

function saveData(): SaveData {
  return {
    version: "1",
    essentials_version: "19.1",
    trainer_name: "Red",
    party: [
      { species: "PIKACHU", is_fainted: true },
      { species: "SNORLAX", is_fainted: false },
      { species: "GEODUDE", is_fainted: true },
    ],
    party_count: 3,
    money: 3000,
    badges: 2,
    location_name: "Viridian Forest",
    map_id: 12,
    x: 0,
    y: 0,
    play_time_seconds: 100,
    parsed_at: 1,
    source_path: "/saves/Game.rxdata",
    features: ALL_FEATURES,
  } as unknown as SaveData;
}

function liveState(overrides: Partial<LiveState> = {}): LiveState {
  return {
    game_running: true,
    detected_game_name: "Pokemon Empire",
    processes: [],
    active_process: { pid: 4242, name: "Game.exe" } as LiveState["active_process"],
    watcher_active: true,
    live_source: "stream",
    memory_reader_active: false,
    memory_pid: null,
    memory_failure_log: [],
    last_live_event: { at: Math.floor(Date.now() / 1000) - 30 },
    stream_status: {
      listening: true,
      connected: true,
      last_data_at: Math.floor(Date.now() / 1000) - 10,
      last_data_trainer: "Red",
      total_frames: 1234,
    },
    in_battle: false,
    in_menu: false,
    party: [],
    ...overrides,
  } as unknown as LiveState;
}

async function setStore(patch: {
  info?: PluginInfo | null;
  saveData?: SaveData | null;
  movesLoaded?: boolean;
  liveState?: LiveState | null;
  settings?: Record<string, unknown> | null;
}) {
  if (patch.info !== undefined) {
    mockedApi.getPluginInfo.mockResolvedValue(patch.info);
    mockedApi.getTypeChart.mockResolvedValue(patch.info?.type_chart_loaded
      ? { types: ["Fire", "Water"], colors: {}, multipliers: {}, generation: 6, loaded: true }
      : null);
    mockedApi.getSettings.mockResolvedValue(patch.settings ?? null);
    mockedApi.getMovesDatabase.mockResolvedValue(
      patch.movesLoaded
        ? { loaded: true, pbs_source: "/PBS/moves.txt", static_count: 1, pbs_count: 1, merged_count: 7, moves: {} }
        : { loaded: false, pbs_source: null, static_count: 0, pbs_count: 0, merged_count: 0, moves: {} }
    );
    mockedApi.getThemes.mockResolvedValue({ themes: [], active: null });
    mockedApi.getSaveData.mockResolvedValue(patch.saveData ?? null);
    await store.refreshStatic();
    if (patch.saveData !== undefined) {
      await store.refreshSave();
    }
  }
  if (patch.saveData !== undefined && patch.info === undefined) {
    mockedApi.getSaveData.mockResolvedValue(patch.saveData);
    await store.refreshSave();
  }
  if (patch.liveState !== undefined) {
    mockedApi.getLiveState.mockResolvedValue(patch.liveState);
    await store.refreshLiveState();
  }
}

afterEach(cleanup);

describe("HomeView", () => {
  it("shows the not-loaded fallback with a reload action", async () => {
    await setStore({ info: null });
    render(<HomeView />);
    expect(screen.getByText(/Plugin data isn't loaded yet/)).toBeInTheDocument();
    expect(screen.getByText("Reload Data")).toBeInTheDocument();
  });

  it("renders about, backend status and moves-db lines", async () => {
    await setStore({ info: pluginInfo(), movesLoaded: true });
    render(<HomeView />);
    expect(screen.getByText("PokeStat Tracker")).toBeInTheDocument();
    expect(screen.getByText("v1.2.3")).toBeInTheDocument();
    expect(screen.getByText("Tracks party stats.")).toBeInTheDocument();
    expect(screen.getByText("Backend ready")).toBeInTheDocument();
    expect(screen.getByText("Type chart loaded (18 types)")).toBeInTheDocument();
    expect(screen.getByText("Moves DB: 7 (PBS loaded)")).toBeInTheDocument();
  });

  it("flags a not-initialized backend", async () => {
    await setStore({ info: pluginInfo({ initialized: false, type_chart_loaded: false }) });
    render(<HomeView />);
    expect(screen.getByText("Backend not initialized")).toBeInTheDocument();
    expect(screen.getByText("Type chart not loaded")).toBeInTheDocument();
  });

  it("shows live injection status when the stream is connected", async () => {
    await setStore({ info: pluginInfo(), liveState: liveState() });
    render(<HomeView />);
    expect(screen.getByText("Game running: Pokemon Empire (pid 4242)")).toBeInTheDocument();
    expect(screen.getByText("Stream server listening (127.0.0.1:9988)")).toBeInTheDocument();
    expect(screen.getByText("Game mod connected (Trainer: Red)")).toBeInTheDocument();
    expect(screen.getByText(/Injection active — 1234 frames/)).toBeInTheDocument();
    expect(screen.getByText(/Save watcher active/)).toBeInTheDocument();
  });

  it("falls back to the process name when the game name is unknown", async () => {
    await setStore({
      info: pluginInfo(),
      liveState: liveState({ detected_game_name: null }),
    });
    render(<HomeView />);
    expect(screen.getByText("Game running: Game.exe (pid 4242)")).toBeInTheDocument();
  });

  it("counts fainted party members for the nuzlocke counter", async () => {
    await setStore({ info: pluginInfo(), saveData: saveData() });
    render(<HomeView />);
    expect(screen.getByText("Fainted Pokémon (Nuzlocke):")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("BattleAnalyzerView", () => {
  const analysis: BattleAnalysis = {
    enemy: {
      name: "ONIX",
      hp: 30,
      totalhp: 100,
      types: ["Rock", "Ground"],
      stages: [2, 0, -1, 0, 0],
    },
    moves: [
      { name: "THUNDERBOLT", type: "Electric", power: 90, effectiveness_label: "super_effective" },
      { name: "QUICK ATTACK", type: "Normal", effectiveness_label: "neutral" },
    ],
    best_move: "THUNDERBOLT",
    coach_suggestion: {
      suggested_pokemon: "PIKACHU",
      reason: "Super-effective (2.0×) vs ONIX",
    },
  };

  it("renders nothing without an analysis", () => {
    const { container } = render(<BattleAnalyzerView />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders enemy, types, stage badges and coach suggestion", async () => {
    await setStore({ liveState: liveState({ battle_analysis: analysis }) as LiveState });
    render(<BattleAnalyzerView />);
    expect(screen.getByText(/Battle Analyzer/)).toBeInTheDocument();
    expect(screen.getByText("Enemy: ONIX")).toBeInTheDocument();
    expect(screen.getByText("COACH SUGGESTION")).toBeInTheDocument();
    expect(screen.getByText("PIKACHU", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Reason: Super-effective (2.0×) vs ONIX")).toBeInTheDocument();
    // stat stage badges: +2 Atk, -1 SpA (zero stages hidden)
    expect(screen.getByText("Atk +2")).toBeInTheDocument();
    expect(screen.getByText("SpA -1")).toBeInTheDocument();
    expect(screen.queryByText("Def +0")).not.toBeInTheDocument();
  });

  it("marks the best move and shows effectiveness labels", async () => {
    await setStore({ liveState: liveState({ battle_analysis: analysis }) as LiveState });
    render(<BattleAnalyzerView />);
    expect(screen.getByText("THUNDERBOLT")).toBeInTheDocument();
    expect(screen.getByText("BEST")).toBeInTheDocument();
    expect(screen.getByText("Power: 90")).toBeInTheDocument();
    // underscores become spaces in the badge
    expect(screen.getByText("super effective")).toBeInTheDocument();
    expect(screen.getByText("neutral")).toBeInTheDocument();
  });
});

describe("TypeChartView", () => {
  const chart = {
    types: ["Fire", "Water", "Grass"],
    colors: {},
    multipliers: {},
    generation: 6,
    loaded: true,
  };

  it("shows the not-loaded fallback with a reload button", async () => {
    await setStore({ info: pluginInfo({ type_chart_loaded: false, type_chart_types: 0 }) });
    render(<TypeChartView />);
    expect(screen.getByText(/Type chart data isn't loaded yet/)).toBeInTheDocument();
    expect(screen.getByText("Reload")).toBeInTheDocument();
  });

  it("fetches the defense summary for the default defender pair", async () => {
    mockedApi.getDefenseSummary.mockResolvedValue({
      defenders: ["Fire"],
      summary: { super_effective: ["Water"], neutral: [] },
    });
    mockedApi.getPluginInfo.mockResolvedValue(pluginInfo());
    mockedApi.getTypeChart.mockResolvedValue(chart);
    mockedApi.getSettings.mockResolvedValue(null);
    mockedApi.getMovesDatabase.mockResolvedValue(null);
    mockedApi.getThemes.mockResolvedValue({ themes: [], active: null });
    await store.refreshStatic();

    render(<TypeChartView />);
    expect(mockedApi.getDefenseSummary).toHaveBeenCalledWith(["Fire"]);
    await waitFor(() =>
      expect(screen.getByText("What hits this Pokémon?")).toBeInTheDocument()
    );
    expect(screen.getByText(/Defender:/)).toBeInTheDocument();
  });

  it("switches to offense mode and fetches the attacker summary", async () => {
    mockedApi.getDefenseSummary.mockResolvedValue({
      defenders: ["Fire"], summary: { super_effective: [] },
    });
    mockedApi.getOffenseSummary.mockResolvedValue({
      attacker: "Fire",
      summary: { super_effective: ["Grass"], not_very_effective: [], no_effect: [], neutral: [] },
    });
    mockedApi.getPluginInfo.mockResolvedValue(pluginInfo());
    mockedApi.getTypeChart.mockResolvedValue(chart);
    mockedApi.getSettings.mockResolvedValue(null);
    mockedApi.getMovesDatabase.mockResolvedValue(null);
    mockedApi.getThemes.mockResolvedValue({ themes: [], active: null });
    await store.refreshStatic();

    render(<TypeChartView />);
    fireEvent.click(screen.getByRole("button", { name: /Mode: Defender/ }));
    expect(screen.getByText("Attacker type")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockedApi.getOffenseSummary).toHaveBeenCalledWith("Fire")
    );
    await waitFor(() =>
      expect(screen.getByText("What does it hit?")).toBeInTheDocument()
    );
  });

  it("shows backend errors instead of a grid", async () => {
    mockedApi.getDefenseSummary.mockResolvedValue({ error: "unknown defender" });
    mockedApi.getPluginInfo.mockResolvedValue(pluginInfo());
    mockedApi.getTypeChart.mockResolvedValue(chart);
    mockedApi.getSettings.mockResolvedValue(null);
    mockedApi.getMovesDatabase.mockResolvedValue(null);
    mockedApi.getThemes.mockResolvedValue({ themes: [], active: null });
    await store.refreshStatic();

    render(<TypeChartView />);
    await waitFor(() => expect(screen.getByText("unknown defender")).toBeInTheDocument());
    expect(screen.queryByText("What hits this Pokémon?")).not.toBeInTheDocument();
  });
});
