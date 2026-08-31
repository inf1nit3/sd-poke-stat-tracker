// @vitest-environment jsdom
/**
 * Round-11: touch menu component tests (PartyTouchMenu, TypeLookupTouchMenu,
 * MoveLookupTouchMenu, TouchMenuContent). State is injected through the real
 * store's refresh functions with a mocked api module, mirroring how the
 * store tests drive state. Assertions target text/structure, not colors.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  MoveInfo,
  MovesDatabase,
  OffenseSummary,
  PokemonSummary,
  SaveData,
  SaveFeatures,
  TypeChartData,
} from "../../../src/api";

vi.mock("../../../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/api")>();
  return {
    ...actual,
    api: {
      getSaveData: vi.fn(async () => null),
      getMoveInfo: vi.fn(async () => null),
      getOffenseSummary: vi.fn(async () => null),
      getPluginInfo: vi.fn(async () => ({ version: "0" })),
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
import { MoveLookupTouchMenu } from "../../../src/touchmenu/MoveLookupTouchMenu";
import { PartyTouchMenu } from "../../../src/touchmenu/PartyTouchMenu";
import { TouchMenuContent } from "../../../src/touchmenu/TouchMenuContent";
import { TypeLookupTouchMenu } from "../../../src/touchmenu/TypeLookupTouchMenu";

const mockedApi = api as unknown as Record<
  string,
  ReturnType<typeof vi.fn> & { mockResolvedValue: (v: unknown) => void; mockResolvedValueOnce: (v: unknown) => void }
>;

const ALL_FEATURES: SaveFeatures = {
  ivs: true, evs: true, happiness: true, stats: true, moves: true,
  natures: true, abilities: true, items: true, type2: true, shiny: true, gender: true,
};

function summary(overrides: Partial<PokemonSummary> = {}): PokemonSummary {
  return {
    species: "PIKACHU",
    nickname: null,
    level: 25,
    hp: 45,
    max_hp: 60,
    status: 0,
    status_name: "OK",
    type1: "Electric",
    type2: null,
    moves: [],
    ability: null,
    item: null,
    gender: 1,
    gender_name: "M",
    shiny: false,
    nature: null,
    attack: null,
    defense: null,
    spatk: null,
    spdef: null,
    speed: 90,
    iv_hp: null,
    iv_attack: null,
    iv_defense: null,
    iv_spatk: null,
    iv_spdef: null,
    iv_speed: null,
    iv_total: null,
    ev_hp: null,
    ev_attack: null,
    ev_defense: null,
    ev_spatk: null,
    ev_spdef: null,
    ev_speed: null,
    has_gender_data: false,
    is_egg: false,
    is_fainted: false,
    happiness: null,
    pokeball: null,
    has_stats: true,
    has_type2: false,
    has_moves: true,
    ...overrides,
  } as PokemonSummary;
}

function saveData(party: PokemonSummary[], overrides: Partial<SaveData> = {}): SaveData {
  return {
    version: "1",
    essentials_version: "19.1",
    trainer_name: "Red",
    party,
    party_count: party.length,
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
    ...overrides,
  } as SaveData;
}

function typeChart(): TypeChartData {
  return {
    types: ["Fire", "Water", "Grass"],
    colors: {},
    multipliers: {},
    generation: 6,
    loaded: true,
  };
}

function movesDb(overrides: Partial<MovesDatabase> = {}): MovesDatabase {
  return {
    loaded: true,
    pbs_source: "/home/deck/Games/PBS/moves.txt",
    static_count: 1,
    pbs_count: 1,
    merged_count: 7,
    moves: { THUNDERBOLT: { name: "Thunderbolt", type: "Electric" } as MoveInfo },
    ...overrides,
  };
}

function offense(summary: Partial<OffenseSummary["summary"]>): OffenseSummary {
  return {
    attacker: "Electric",
    summary: {
      super_effective: summary.super_effective ?? [],
      not_very_effective: summary.not_very_effective ?? [],
      no_effect: summary.no_effect ?? [],
      neutral: summary.neutral ?? [],
    },
  };
}

async function setStore(patch: {
  saveData?: SaveData | null;
  typeChart?: TypeChartData | null;
  movesDatabase?: MovesDatabase | null;
  liveState?: store.StoreState["liveState"];
}) {
  if (patch.saveData !== undefined) {
    mockedApi.getSaveData.mockResolvedValue(patch.saveData);
    await store.refreshSave();
  }
  if (patch.movesDatabase !== undefined) {
    mockedApi.getMovesDatabase.mockResolvedValue(patch.movesDatabase);
    await store.refreshMoves();
  }
  if (patch.typeChart !== undefined) {
    mockedApi.getPluginInfo.mockResolvedValue({ version: "0" });
    mockedApi.getTypeChart.mockResolvedValue(patch.typeChart);
    mockedApi.getSettings.mockResolvedValue(null);
    mockedApi.getMovesDatabase.mockResolvedValue(null);
    mockedApi.getThemes.mockResolvedValue({ themes: [], active: null });
    await store.refreshStatic();
  }
  if (patch.liveState !== undefined) {
    mockedApi.getLiveState.mockResolvedValue(patch.liveState);
    await store.refreshLiveState();
  }
}

beforeEach(() => {
  mockedApi.getMoveInfo.mockResolvedValue(null);
  mockedApi.getOffenseSummary.mockResolvedValue(null);
});

afterEach(cleanup);

describe("PartyTouchMenu", () => {
  it("shows the settings hint when no save file was found", async () => {
    await setStore({
      saveData: saveData([], { error: "no_save_file_found" }),
    });
    render(<PartyTouchMenu />);
    expect(screen.getByText(/No save file found\./)).toBeInTheDocument();
    expect(screen.getByText(/Settings/)).toBeInTheDocument();
  });

  it("shows the parse error message", async () => {
    await setStore({
      saveData: saveData([], { error: "parse_failed", message: "Marshal parse failed: bad token" }),
    });
    render(<PartyTouchMenu />);
    expect(screen.getByText(/Parse error:/)).toBeInTheDocument();
    expect(screen.getByText(/bad token/)).toBeInTheDocument();
  });

  it("renders header, party rows and empty slots", async () => {
    await setStore({
      saveData: saveData([summary({ species: "PIKACHU", moves: ["THUNDERBOLT"] }), summary({ species: "RATTATA" })]),
      movesDatabase: movesDb(),
    });
    render(<PartyTouchMenu />);
    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByText("Party 2/6")).toBeInTheDocument();
    expect(screen.getByText("₽3,000")).toBeInTheDocument();
    expect(screen.getByText(/Viridian Forest/)).toBeInTheDocument();
    expect(screen.getByText("PBS ✓")).toBeInTheDocument();
    expect(screen.getByText("Slot 3 — empty")).toBeInTheDocument();
    expect(screen.getByText("Slot 6 — empty")).toBeInTheDocument();
    expect(screen.getByText("THUNDERBOLT")).toBeInTheDocument();
  });

  it("hides money when the save has no items feature", async () => {
    await setStore({
      saveData: saveData([summary()], { features: { ...ALL_FEATURES, items: false } }),
    });
    render(<PartyTouchMenu />);
    expect(screen.queryByText("₽3,000")).not.toBeInTheDocument();
    expect(screen.getByText("Party 1/6")).toBeInTheDocument();
  });
});

describe("TypeLookupTouchMenu", () => {
  it("shows a loading placeholder without a type chart", () => {
    render(<TypeLookupTouchMenu />);
    expect(screen.getByText("Loading type chart…")).toBeInTheDocument();
  });

  it("loads the summary for the default attacker and skips empty buckets", async () => {
    await setStore({ typeChart: typeChart() });
    mockedApi.getOffenseSummary.mockResolvedValue(
      offense({ super_effective: ["Water"], no_effect: ["Ground"] })
    );
    render(<TypeLookupTouchMenu />);
    expect(screen.getByText("Attacker:")).toBeInTheDocument();
    expect(screen.getByText("Fire", { selector: "option" })).toBeInTheDocument();
    expect(mockedApi.getOffenseSummary).toHaveBeenCalledWith("Fire");
    await waitFor(() => expect(screen.getByText(/Super effective/)).toBeInTheDocument());
    expect(screen.getByText("Water", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Ground")).toBeInTheDocument();
    // not_very_effective bucket is empty and must not be rendered
    expect(screen.queryByText(/Not very effective/)).not.toBeInTheDocument();
    expect(screen.getByText("Generation 6 type chart")).toBeInTheDocument();
  });

  it("renders the backend error instead of buckets", async () => {
    await setStore({ typeChart: typeChart() });
    mockedApi.getOffenseSummary.mockResolvedValue({ error: "unknown attacker" });
    render(<TypeLookupTouchMenu />);
    await waitFor(() => expect(screen.getByText("unknown attacker")).toBeInTheDocument());
    expect(screen.queryByText(/Super effective/)).not.toBeInTheDocument();
  });
});

describe("MoveLookupTouchMenu", () => {
  it("asks for a save first", async () => {
    // Store is a module singleton across tests — clear leftovers.
    await setStore({ saveData: null });
    render(<MoveLookupTouchMenu />);
    expect(screen.getByText("Load a save first to see party moves.")).toBeInTheDocument();
  });

  it("lists party moves and loads details on tap", async () => {
    await setStore({
      saveData: saveData([summary({ moves: ["THUNDERBOLT"] })]),
      movesDatabase: movesDb(),
    });
    mockedApi.getMoveInfo.mockResolvedValue({
      name: "Thunderbolt",
      type: "Electric",
      category: "Special",
      power: 90,
      accuracy: 100,
      description: "A strong electric blast.",
      source: "static",
    } as MoveInfo);
    mockedApi.getOffenseSummary.mockResolvedValue(offense({ super_effective: ["Water"] }));

    render(<MoveLookupTouchMenu />);
    const button = await screen.findByRole("button", { name: /THUNDERBOLT/ });
    const footer = screen.getByText(/moves available/);
    expect(footer.textContent).toContain("PBS/moves.txt");

    fireEvent.click(button);
    expect(mockedApi.getMoveInfo).toHaveBeenCalledWith("THUNDERBOLT");
    expect(await screen.findByText("Thunderbolt")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("A strong electric blast.")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockedApi.getOffenseSummary).toHaveBeenCalledWith("Electric")
    );
    expect(screen.getByText("Water")).toBeInTheDocument();
  });

  it("falls back to the raw move name when the lookup misses", async () => {
    await setStore({ saveData: saveData([summary({ moves: ["CUSTOM_MOVE"] })]) });
    render(<MoveLookupTouchMenu />);
    fireEvent.click(await screen.findByRole("button", { name: /CUSTOM_MOVE/ }));
    await waitFor(() => expect(mockedApi.getMoveInfo).toHaveBeenCalledWith("CUSTOM_MOVE"));
    // loading indicator clears, detail shows the raw name fallback
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    // move name appears in the tap list AND in the detail fallback
    expect(screen.getAllByText("CUSTOM_MOVE").length).toBeGreaterThan(1);
  });
});

describe("TouchMenuContent", () => {
  it("switches between tabs", async () => {
    await setStore({ saveData: null, typeChart: typeChart() });
    render(<TouchMenuContent />);
    expect(screen.getByText("Party")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Type Lookup" }));
    expect(screen.getByText("Attacker:")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move Lookup" }));
    expect(screen.getByText("Load a save first to see party moves.")).toBeInTheDocument();
  });

  it("renders the nuzlocke counter and coach suggestion from store state", async () => {
    await setStore({
      saveData: saveData([summary({ is_fainted: true }), summary()]),
      liveState: {
        game_running: true,
        detected_game_name: null,
        processes: [],
        active_process: null,
        watcher_active: false,
        live_source: "disk",
        memory_reader_active: false,
        memory_pid: null,
        memory_failure_log: [],
        last_live_event: {},
        in_battle: false,
        in_menu: false,
        party: [],
        battle_analysis: {
          coach_suggestion: {
            suggested_pokemon: "PIKACHU",
            reason: "Electric is super effective",
          },
        },
      } as unknown as store.StoreState["liveState"],
    });
    render(<TouchMenuContent />);
    expect(screen.getByText("Fainted (Nuzlocke):")).toBeInTheDocument();
    expect(screen.getByText("COACH SUGGESTION")).toBeInTheDocument();
    expect(screen.getByText("PIKACHU", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Electric is super effective")).toBeInTheDocument();
  });
});
