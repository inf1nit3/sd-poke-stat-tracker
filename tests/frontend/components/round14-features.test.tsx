// @vitest-environment jsdom
/**
 * Round-14 feature component tests: PCBoxViewer, NuzlockeLogTouchMenu,
 * TypeChartView team mode, PokemonCard hidden-power chip + sprite.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PokemonSummary, SaveFeatures } from "../../../src/api";

vi.mock("../../../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/api")>();
  return {
    ...actual,
    api: {
      getSaveData: vi.fn(async () => null),
      getBoxes: vi.fn(async () => ({ boxes: [], box_count: 0 })),
      getNuzlockeLog: vi.fn(async () => ({ events: [], path: "/log" })),
      clearNuzlockeLog: vi.fn(async () => ({ ok: true })),
      getSaveBackups: vi.fn(async () => ({ backups: [], dir: "/tmp" })),
      restoreSaveBackup: vi.fn(async () => ({ ok: true })),
      exportSaveSummary: vi.fn(async () => ({ ok: true })),
      getPokemonSprite: vi.fn(async () => ({ found: false, species: "X" })),
      getPluginInfo: vi.fn(async () => null),
      getTypeChart: vi.fn(async () => null),
      getSettings: vi.fn(async () => null),
      getMovesDatabase: vi.fn(async () => null),
      getThemes: vi.fn(async () => ({ themes: [], active: null })),
      getDefenseSummary: vi.fn(async () => null),
      getOffenseSummary: vi.fn(async () => null),
      getLiveState: vi.fn(async () => null),
      updateSettings: vi.fn(async () => null),
    },
  };
});

import { api } from "../../../src/api";
import { PCBoxViewer } from "../../../src/components/PCBoxViewer";
import { PokemonCard } from "../../../src/components/PokemonCard";
import * as store from "../../../src/store";
import { NuzlockeLogTouchMenu } from "../../../src/touchmenu/NuzlockeLogTouchMenu";
import { TypeChartView } from "../../../src/views/TypeChartView";

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const ALL_FEATURES: SaveFeatures = {
  ivs: true, evs: true, happiness: true, stats: true, moves: true,
  natures: true, abilities: true, items: true, type2: true, shiny: true, gender: true,
};

function summary(overrides: Partial<PokemonSummary> = {}): PokemonSummary {
  return {
    species: "PIKACHU", nickname: null, level: 25, hp: 45, max_hp: 60,
    status: 0, status_name: "OK", type1: "Electric", type2: null,
    moves: [], ability: null, item: null, gender: 1, gender_name: "M",
    shiny: false, nature: null, attack: null, defense: null, spatk: null,
    spdef: null, speed: null, iv_hp: null, iv_attack: null, iv_defense: null,
    iv_spatk: null, iv_spdef: null, iv_speed: null, ev_hp: null, ev_attack: null,
    ev_defense: null, ev_spatk: null, ev_spdef: null, ev_speed: null,
    happiness: null, hidden_power: null,
    ...overrides,
  } as PokemonSummary;
}

afterEach(cleanup);

describe("PCBoxViewer", () => {
  it("renders boxes as grids with names and counts", async () => {
    mockedApi.getBoxes.mockResolvedValue({
      box_count: 1,
      boxes: [
        {
          name: "Box 1",
          mons: [
            summary({ species: "MEW", level: 50 }),
            null,
            summary({ species: "GEODUDE", level: 12 }),
          ],
        },
      ],
    });
    render(<PCBoxViewer />);
    expect(await screen.findByText("Box 1")).toBeInTheDocument();
    expect(screen.getByText("2 Pokémon")).toBeInTheDocument();
    expect(screen.getByTitle("MEW Lv.50")).toBeInTheDocument();
    expect(screen.getByTitle("GEODUDE Lv.12")).toBeInTheDocument();
    expect(screen.getByTitle("empty")).toBeInTheDocument();
  });

  it("renders a placeholder when the save has no storage", async () => {
    mockedApi.getBoxes.mockResolvedValue({ boxes: [], box_count: 0 });
    render(<PCBoxViewer />);
    expect(
      await screen.findByText("No PC boxes found in this save.")
    ).toBeInTheDocument();
  });

  it("renders backend errors with a retry", async () => {
    mockedApi.getBoxes.mockRejectedValue(new Error("[get_boxes] boom"));
    render(<PCBoxViewer />);
    expect(await screen.findByText("[get_boxes] boom")).toBeInTheDocument();
    mockedApi.getBoxes.mockResolvedValue({ boxes: [], box_count: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No PC boxes found in this save.")).toBeInTheDocument();
  });
});

describe("NuzlockeLogTouchMenu", () => {
  it("lists events newest first with kind colors", async () => {
    mockedApi.getNuzlockeLog.mockResolvedValue({
      path: "/log",
      events: [
        { kind: "joined", species: "PIDGEY", level: 4, location: "Route 1", at: 1700000000 },
        { kind: "faint", species: "PIKACHU", level: 25, location: "Route 2", at: 1700001000 },
      ],
    });
    render(<NuzlockeLogTouchMenu />);
    expect(await screen.findByText("Nuzlocke Log (2)")).toBeInTheDocument();
    const rows = screen.getAllByText(/Fainted|Caught\/Evolved/);
    expect(rows[0]).toHaveTextContent("PIKACHU"); // newest first
    expect(rows[1]).toHaveTextContent("PIDGEY");
    expect(screen.getAllByText(/Route 2/).length).toBeGreaterThan(0);
  });

  it("shows the empty hint", async () => {
    mockedApi.getNuzlockeLog.mockResolvedValue({ path: "/log", events: [] });
    render(<NuzlockeLogTouchMenu />);
    expect(await screen.findByText(/No events yet/)).toBeInTheDocument();
  });
});

describe("TypeChartView team mode", () => {
  const chart = {
    types: ["Fire", "Water", "Electric"],
    colors: {},
    multipliers: {
      Electric: { Water: 2, Flying: 2, Grass: 0.5, Fire: 1 },
      Fire: { Grass: 2, Water: 0.5, Fire: 0.5, Flying: 1 },
      Water: { Fire: 2, Water: 0.5, Grass: 0.5, Flying: 1 },
    },
    generation: 6,
    loaded: true,
  };

  async function setStore(party: Array<PokemonSummary>) {
    mockedApi.getPluginInfo.mockResolvedValue({
      name: "x", version: "0", description: "", initialized: true,
      type_chart_loaded: true, type_chart_types: 3,
    });
    mockedApi.getTypeChart.mockResolvedValue(chart);
    mockedApi.getSettings.mockResolvedValue(null);
    mockedApi.getMovesDatabase.mockResolvedValue(null);
    mockedApi.getThemes.mockResolvedValue({ themes: [], active: null });
    mockedApi.getSaveData.mockResolvedValue(
      party.length
        ? {
            trainer_name: "Red", party, party_count: party.length,
            money: 0, badges: 0, location_name: "", map_id: 0, x: 0, y: 0,
            play_time_seconds: 0, parsed_at: 0, source_path: "/s",
            features: ALL_FEATURES, version: "1", essentials_version: "19",
          }
        : null
    );
    await store.refreshStatic();
    await store.refreshSave();
  }

  it("cycling mode three times reaches the team analysis", async () => {
    await setStore([
      summary({ species: "PIKACHU", type1: "Electric" }),
      summary({ species: "PIDGEY", type1: "Normal", type2: "Flying" }),
      summary({ species: "CHARIZARD", type1: "Fire", type2: "Flying" }),
    ]);
    render(<TypeChartView />);
    const btn = screen.getByRole("button", { name: /Mode: Defender/ });
    fireEvent.click(btn); // -> offense
    fireEvent.click(screen.getByRole("button", { name: /Mode: Attacker/ })); // -> team
    expect(screen.getByRole("button", { name: /Mode: Team/ })).toBeInTheDocument();
    // Electric hits PIKACHU(0.5), PIDGEY(2), CHARIZARD(2): 2 members weak
    expect(await screen.findByText("Shared weaknesses")).toBeInTheDocument();
    expect(screen.getByText("2 members weak: PIDGEY, CHARIZARD")).toBeInTheDocument();
    expect(screen.getByText(/CHARIZARD: Fire \/ Flying/)).toBeInTheDocument();
  });

  it("shows the no-save hint in team mode", async () => {
    await setStore([]);
    render(<TypeChartView />);
    fireEvent.click(screen.getByRole("button", { name: /Mode: Defender/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mode: Attacker/ }));
    expect(
      await screen.findByText(/Load a save first/)
    ).toBeInTheDocument();
  });
});

describe("PokemonCard round-14 additions", () => {
  it("shows the hidden power chip when IVs are present", () => {
    render(
      <PokemonCard
        pokemon={summary({
          has_ivs: true,
          iv_total: 183,
          iv_hp: 31, iv_attack: 30, iv_defense: 31,
          iv_spatk: 30, iv_spdef: 31, iv_speed: 30,
          hidden_power: "Bug",
        })}
        features={ALL_FEATURES}
      />
    );
    expect(screen.getByText("Hidden Power: Bug")).toBeInTheDocument();
  });

  it("omits the hidden power chip without IVs", () => {
    render(<PokemonCard pokemon={summary({ hidden_power: null })} features={ALL_FEATURES} />);
    expect(screen.queryByText(/Hidden Power/)).not.toBeInTheDocument();
  });

  it("renders a user sprite when the backend has one", async () => {
    mockedApi.getPokemonSprite.mockResolvedValue({
      found: true,
      species: "PIKACHU",
      data_url: "data:image/png;base64,AAAA",
    });
    const { container } = render(
      <PokemonCard pokemon={summary()} features={ALL_FEATURES} />
    );
    await waitFor(() =>
      expect(container.querySelector("img[alt='PIKACHU']")).toBeInTheDocument()
    );
    expect(mockedApi.getPokemonSprite).toHaveBeenCalledWith("PIKACHU");
  });

  it("renders nothing extra when no sprite exists", async () => {
    mockedApi.getPokemonSprite.mockResolvedValue({ found: false, species: "PIKACHU" });
    const { container } = render(
      <PokemonCard pokemon={summary()} features={ALL_FEATURES} />
    );
    await waitFor(() => expect(mockedApi.getPokemonSprite).toHaveBeenCalled());
    expect(container.querySelector("img")).toBeNull();
  });
});
