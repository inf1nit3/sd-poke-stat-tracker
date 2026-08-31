// @vitest-environment jsdom
/**
 * Round-13: SettingsView tests. The api mock keeps small mutable state
 * objects so updateSettings/findSavePath round-trip like the backend.
 * Covers the not-loaded fallback, override flows, candidate selection,
 * toggles, type-chart/theme dropdowns, scan-interval debouncing with
 * clamping, and the three PBS actions.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  MovesDatabase,
  PluginSettings,
  SaveFileCandidate,
  SavePathResult,
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
      getPluginInfo: vi.fn(async () => ({ version: "0" })),
      getTypeChart: vi.fn(async () => null),
      getSettings: vi.fn(async () => null),
      getMovesDatabase: vi.fn(async () => null),
      getThemes: vi.fn(async () => ({ themes: [], active: null })),
      getLiveState: vi.fn(async () => null),
      updateSettings: vi.fn(async () => null),
      findSavePath: vi.fn(async () => null),
      listSaveFiles: vi.fn(async () => []),
      autoLoadPbs: vi.fn(async () => null),
      loadPbsMoves: vi.fn(async () => null),
      clearPbs: vi.fn(async () => null),
    },
  };
});

import { api } from "../../../src/api";
import * as store from "../../../src/store";
import { SettingsView } from "../../../src/views/SettingsView";

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const THEMES = [
  { id: "default", name: "Default", description: "" },
  { id: "solarized", name: "Solarized Light", description: "" },
];

let settingsState: PluginSettings | null;
let resolvedState: SavePathResult;
let candidatesState: SaveFileCandidate[];
let movesDbState: MovesDatabase;

function baseSettings(): PluginSettings {
  return {
    save_path_override: null,
    auto_scan_enabled: true,
    touchmenu_position: { x: 100, y: 100 },
    scan_interval_seconds: 3,
    touchmenu_enabled: true,
    last_save_path: null,
    theme: "default",
    compact_mode: false,
    watcher_enabled: true,
    live_memory_enabled: false,
  };
}

function movesDb(overrides: Partial<MovesDatabase> = {}): MovesDatabase {
  return {
    loaded: true,
    pbs_source: "/home/deck/games/PBS/moves.txt",
    static_count: 265,
    pbs_count: 12,
    merged_count: 270,
    moves: {},
    ...overrides,
  } as MovesDatabase;
}

async function refreshStore() {
  await store.refreshStatic();
  if (settingsState) await store.refreshMoves();
}

/** Renders and waits for the mount effect's findSavePath/listSaveFiles
 * round-trip so buttons are enabled and resolved data is visible. */
async function renderSettings() {
  render(<SettingsView />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Rescan saves|Scanning…/ })).toBeEnabled()
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  settingsState = baseSettings();
  resolvedState = { path: "/home/deck/saves/Game.rxdata", using_override: false };
  candidatesState = [];
  movesDbState = movesDb();

  mockedApi.getSettings.mockImplementation(async () => settingsState);
  mockedApi.updateSettings.mockImplementation(async (patch: Partial<PluginSettings>) => {
    settingsState = { ...(settingsState as PluginSettings), ...patch };
    return settingsState;
  });
  mockedApi.findSavePath.mockImplementation(async () => resolvedState);
  mockedApi.listSaveFiles.mockImplementation(async () => candidatesState);
  mockedApi.getMovesDatabase.mockImplementation(async () => movesDbState);
  mockedApi.getThemes.mockResolvedValue({ themes: THEMES, active: null });
  mockedApi.getTypeChart.mockResolvedValue(null);
  mockedApi.getPluginInfo.mockResolvedValue({ version: "0" });
});

afterEach(cleanup);

describe("SettingsView", () => {
  it("shows the not-loaded fallback and recovers via Reload", async () => {
    settingsState = null;
    render(<SettingsView />);
    expect(screen.getByText(/Settings aren't loaded yet/)).toBeInTheDocument();

    settingsState = baseSettings();
    fireEvent.click(screen.getByText("Reload"));
    expect(await screen.findByText("Save resolution")).toBeInTheDocument();
    expect(await screen.findByText("/home/deck/saves/Game.rxdata")).toBeInTheDocument();
  });

  it("renders active save, override marker and PBS stats", async () => {
    resolvedState = { path: "/home/deck/saves/Game.rxdata", using_override: true };
    await refreshStore();
    await renderSettings();
    expect(screen.getByText("/home/deck/saves/Game.rxdata")).toBeInTheDocument();
    expect(screen.getByText("(using manual override)")).toBeInTheDocument();
    expect(screen.getByText("270 moves total · 265 static · 12 from game PBS")).toBeInTheDocument();
    // override input initialized once from settings
    expect(screen.getByLabelText("Path to save file")).toHaveValue("");
    expect(screen.getByLabelText("Manual PBS path (moves.txt)")).toHaveValue(
      "/home/deck/games/PBS/moves.txt"
    );
  });

  it("shows the no-save placeholder", async () => {
    resolvedState = { path: null, using_override: false };
    await refreshStore();
    render(<SettingsView />);
    expect(screen.getByText("— no save found —")).toBeInTheDocument();
  });

  it("applies a typed override and refreshes the resolved path", async () => {
    await refreshStore();
    await renderSettings();
    const input = screen.getByLabelText("Path to save file");
    fireEvent.change(input, { target: { value: "/custom/path/Game.rxdata" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply override" }));

    await waitFor(() =>
      expect(mockedApi.updateSettings).toHaveBeenCalledWith({
        save_path_override: "/custom/path/Game.rxdata",
      })
    );
    expect(await screen.findByText("Override saved.")).toBeInTheDocument();
    expect(mockedApi.findSavePath).toHaveBeenCalledTimes(2); // mount + apply
  });

  it("clears the override with an empty input (patch sends null)", async () => {
    settingsState = { ...baseSettings(), save_path_override: "/old/path" };
    await refreshStore();
    await renderSettings();
    expect(screen.getByRole("button", { name: "Clear override" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Path to save file"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply override" }));
    await waitFor(() =>
      expect(mockedApi.updateSettings).toHaveBeenCalledWith({ save_path_override: null })
    );
    expect(await screen.findByText("Override cleared.")).toBeInTheDocument();
  });

  it("uses a discovered candidate as override", async () => {
    candidatesState = [
      { path: "/home/deck/saves/Game.rxdata", size: 512, modified: 1700000000 },
      { path: "/run/media/mmc/saves/Game.rxdata", size: 2048, modified: 1700001000 },
    ];
    await refreshStore();
    await renderSettings();
    expect(screen.getByText("Discovered saves (2)")).toBeInTheDocument();
    // size and date share one text node — match by regex
    expect(screen.getByText(/512 B/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Use this save" })[1]);
    await waitFor(() =>
      expect(mockedApi.updateSettings).toHaveBeenCalledWith({
        save_path_override: "/run/media/mmc/saves/Game.rxdata",
      })
    );
    expect(await screen.findByText("Override set: /run/media/mmc/saves/Game.rxdata")).toBeInTheDocument();
    expect(screen.getByLabelText("Path to save file")).toHaveValue("/run/media/mmc/saves/Game.rxdata");
  });

  it("toggles auto-scan through the settings patch", async () => {
    await refreshStore();
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("switch", { name: /Auto-scan running processes/ }));
    await waitFor(() =>
      expect(mockedApi.updateSettings).toHaveBeenCalledWith({ auto_scan_enabled: false })
    );
  });

  it("switches the type chart generation via dropdown", async () => {
    await refreshStore();
    render(<SettingsView />);
    fireEvent.click(
      screen.getByRole("button", { name: /Gen 2-5 \(Classic/ })
    );
    await waitFor(() =>
      expect(mockedApi.updateSettings).toHaveBeenCalledWith({ type_chart_gen: 5 })
    );
    expect(await screen.findByText("Type chart set to Gen 5 (Classic).")).toBeInTheDocument();
  });

  it("changes the theme and refreshes the theme list", async () => {
    await refreshStore();
    const themesCallsBefore = mockedApi.getThemes.mock.calls.length;
    await renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "Solarized Light" }));
    await waitFor(() =>
      expect(mockedApi.updateSettings).toHaveBeenCalledWith({ theme: "solarized" })
    );
    await waitFor(() =>
      expect(mockedApi.getThemes.mock.calls.length).toBeGreaterThan(themesCallsBefore)
    );
  });

  it("debounces the scan interval and clamps to the 5s minimum", async () => {
    await refreshStore();
    render(<SettingsView />);
    const input = screen.getByLabelText("Interval (seconds)");
    expect(input).toHaveValue("3");

    fireEvent.change(input, { target: { value: "0" } });
    // not applied immediately
    expect(mockedApi.updateSettings).not.toHaveBeenCalledWith({
      scan_interval_seconds: 5,
    });
    await waitFor(
      () =>
        expect(mockedApi.updateSettings).toHaveBeenCalledWith({
          scan_interval_seconds: 5,
        }),
      { timeout: 2000 }
    );
  });

  it("ignores non-numeric scan interval input", async () => {
    await refreshStore();
    render(<SettingsView />);
    fireEvent.change(screen.getByLabelText("Interval (seconds)"), {
      target: { value: "abc" },
    });
    await new Promise((r) => setTimeout(r, 700));
    const intervalCalls = mockedApi.updateSettings.mock.calls.filter(
      (c) => "scan_interval_seconds" in (c[0] as object)
    );
    expect(intervalCalls).toHaveLength(0);
  });

  it("auto-discovers PBS and reports the loaded count", async () => {
    mockedApi.autoLoadPbs.mockResolvedValue({
      loaded: true,
      source: "/home/deck/games/PBS/moves.txt",
      database: movesDb({ pbs_count: 5, merged_count: 270 }),
    });
    await refreshStore();
    await renderSettings();
    const dbCallsBefore = mockedApi.getMovesDatabase.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Auto-discover PBS" }));
    expect(await screen.findByText(/Auto-loaded 5 moves from PBS:/)).toBeInTheDocument();
    expect(mockedApi.getMovesDatabase.mock.calls.length).toBeGreaterThan(dbCallsBefore);
  });

  it("reports when auto-discovery finds no PBS", async () => {
    mockedApi.autoLoadPbs.mockResolvedValue({
      loaded: false,
      source: null,
      database: movesDb({ loaded: false, pbs_source: null, pbs_count: 0 }),
    });
    await refreshStore();
    await renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Auto-discover PBS" }));
    expect(
      await screen.findByText("No PBS/moves.txt found in common locations.")
    ).toBeInTheDocument();
  });

  it("loads PBS from a manual path", async () => {
    await refreshStore();
    await renderSettings();
    const loadBtn = screen.getByRole("button", { name: "Load PBS from path" });
    // input starts prefilled from the loaded PBS source — clear it first
    fireEvent.change(screen.getByLabelText("Manual PBS path (moves.txt)"), {
      target: { value: "" },
    });
    expect(loadBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Manual PBS path (moves.txt)"), {
      target: { value: "/other/game/PBS/moves.txt" },
    });
    const btn = screen.getByRole("button", { name: "Load PBS from path" });
    expect(btn).toBeEnabled();
    mockedApi.loadPbsMoves.mockResolvedValue({
      loaded: true,
      count: 3,
      source: "/other/game/PBS/moves.txt",
      database: movesDb(),
    });
    fireEvent.click(btn);
    expect(await screen.findByText("Loaded 3 moves from PBS file.")).toBeInTheDocument();
    expect(mockedApi.loadPbsMoves).toHaveBeenCalledWith("/other/game/PBS/moves.txt");
  });

  it("clears the PBS override", async () => {
    await refreshStore();
    await renderSettings();
    mockedApi.clearPbs.mockResolvedValue({ database: movesDb({ pbs_source: null, pbs_count: 0 }) });
    fireEvent.click(screen.getByRole("button", { name: "Clear PBS (use static only)" }));
    expect(
      await screen.findByText("PBS override cleared. Static moves database only.")
    ).toBeInTheDocument();
  });

  it("shows a backend error from the initial resolution as status", async () => {
    mockedApi.findSavePath.mockRejectedValue(new Error("[find_save_path] backend exploded"));
    render(<SettingsView />);
    expect(await screen.findByText("[find_save_path] backend exploded")).toBeInTheDocument();
  });
});
