/**
 * Round-5: first-ever execution of the frontend polling/backoff logic.
 * Runs src/store.ts in node with a scripted @decky/api mock and fake
 * timers — no DOM, no Steam runtime.
 *
 * Call accounting: startPolling() immediately fires refreshLiveState()
 * (one get_live_state call) plus a get_live_save_data initial fetch,
 * before the first scheduled tick at 1500ms.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockModule = typeof import("./mocks/decky-api");
type StoreModule = typeof import("../../src/store");

let mock: MockModule;
let store: StoreModule;

const nowSec = () => Date.now() / 1000;
const liveCalls = () => mock.callLog.filter((c) => c.method === "get_live_state").length;

function freshLive(overrides: Record<string, unknown> = {}) {
  return {
    trainer_name: "Red",
    game_running: true,
    last_live_event: { at: nowSec(), kind: "stream" },
    party: [],
    battle_analysis: null,
    stream_status: { listening: true, connected: true },
    ...overrides,
  } as Record<string, unknown>;
}

/** A promise + its resolvers, for deferred backend answers. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  mock = await import("./mocks/decky-api");
  store = await import("../../src/store");
});

afterEach(() => {
  store.stopPolling();
  vi.useRealTimers();
});

describe("store polling cadence", () => {
  it("ticks every 1.5s while the game runs with fresh events", async () => {
    mock.mockCall((method) => {
      if (method === "get_live_save_data") return { parsed_at: "t" };
      if (method === "get_live_state") return freshLive();
      throw new Error(`unexpected ${method}`);
    });
    store.startPolling();
    await vi.advanceTimersByTimeAsync(0); // flush the initial refreshLiveState
    expect(liveCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(liveCalls()).toBe(2);
    await vi.advanceTimersByTimeAsync(4500);
    expect(liveCalls()).toBe(5);
  });

  it("backs off to 5s after 5 idle ticks", async () => {
    // Event exists but is stale (>10s old) -> consecutiveIdle climbs.
    mock.mockCall((method) => {
      if (method === "get_live_save_data") return { parsed_at: "t" };
      if (method === "get_live_state")
        return freshLive({ last_live_event: { at: nowSec() - 120 } });
      throw new Error(`unexpected ${method}`);
    });
    store.startPolling();
    await vi.advanceTimersByTimeAsync(0);
    expect(liveCalls()).toBe(1); // initial
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1500);
    expect(liveCalls()).toBe(6); // initial + 5 idle ticks
    // The 5th tick scheduled the next one at 5s, not 1.5s.
    await vi.advanceTimersByTimeAsync(1500 * 3);
    expect(liveCalls()).toBe(6);
    await vi.advanceTimersByTimeAsync(500);
    expect(liveCalls()).toBe(7);
  });

  it("polls every 30s when no game is running", async () => {
    mock.mockCall((method) => {
      if (method === "get_live_save_data") return { parsed_at: "t" };
      if (method === "get_live_state") return freshLive({ game_running: false });
      throw new Error(`unexpected ${method}`);
    });
    store.startPolling();
    await vi.advanceTimersByTimeAsync(1500); // initial + first tick
    expect(liveCalls()).toBe(2);
    // First tick (t=1500) scheduled the next one for t=31500.
    await vi.advanceTimersByTimeAsync(28500);
    expect(liveCalls()).toBe(2); // nothing in between
    await vi.advanceTimersByTimeAsync(1500);
    expect(liveCalls()).toBe(3);
  });

  it("applies exponential error backoff (3s, 6s) and recovers to fast", async () => {
    let fail = true;
    mock.mockCall((method) => {
      if (method === "get_live_state" && fail) throw new Error("backend down");
      if (method === "get_live_state") return freshLive();
      return { parsed_at: "t" };
    });
    store.startPolling();
    await vi.advanceTimersByTimeAsync(1500); // initial(fail) + tick#1(fail)
    expect(liveCalls()).toBe(2);
    // Backoff #1 = 3s.
    await vi.advanceTimersByTimeAsync(2999);
    expect(liveCalls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(liveCalls()).toBe(3); // tick#2 (fail) -> backoff 6s
    await vi.advanceTimersByTimeAsync(6000);
    expect(liveCalls()).toBe(4); // tick#3 (fail) -> backoff 12s
    // Recovery: next successful tick resets to the 1.5s cadence.
    fail = false;
    await vi.advanceTimersByTimeAsync(12000);
    const afterRecovery = liveCalls();
    expect(afterRecovery).toBe(5);
    await vi.advanceTimersByTimeAsync(1500);
    expect(liveCalls()).toBe(6);
  });

  it("stops completely on stopPolling (in-flight ticks write nothing)", async () => {
    const slow = deferred<Record<string, unknown>>();
    mock.mockCall((method) => {
      if (method === "get_live_state") return slow.promise;
      return { parsed_at: "t" };
    });
    store.startPolling();
    await vi.advanceTimersByTimeAsync(1500); // initial + tick, both hanging
    expect(liveCalls()).toBe(2);
    store.stopPolling();
    slow.resolve(freshLive());
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    // Neither the initial fetch nor the in-flight tick may write state.
    expect(store.getState().liveState).toBeNull();
    expect(mock.callLog.filter((c) => c.method === "get_live_state")).toHaveLength(2);
    // And no further ticks are scheduled.
    await vi.advanceTimersByTimeAsync(60000);
    expect(liveCalls()).toBe(2);
  });
});

describe("store state writes", () => {
  it("stale initial fetch from a previous cycle does not clobber (B2)", async () => {
    const oldCycle = deferred<Record<string, unknown>>();
    let cycle = 0;
    mock.mockCall((method) => {
      if (method === "get_live_save_data")
        return cycle === 0 ? oldCycle.promise : { parsed_at: "new" };
      if (method === "get_live_state") return freshLive();
      throw new Error(`unexpected ${method}`);
    });

    store.startPolling(); // cycle 0: initial fetch hangs
    store.stopPolling();
    cycle = 1;
    store.startPolling(); // cycle 1: initial fetch resolves immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().saveData).toEqual({ parsed_at: "new" });

    // The hung cycle-0 fetch finally answers with stale data...
    oldCycle.resolve({ parsed_at: "STALE" });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    // ...and must not have been written.
    expect(store.getState().saveData).toEqual({ parsed_at: "new" });
  });

  it("poll ticks skip saveData while refreshSave is in flight", async () => {
    const forced = deferred<Record<string, unknown>>();
    let saveCalls = 0;
    mock.mockCall((method) => {
      if (method === "get_save_data") return forced.promise;
      if (method === "get_live_save_data") {
        saveCalls++;
        return { parsed_at: `call${saveCalls}` };
      }
      if (method === "get_live_state") return freshLive();
      throw new Error(`unexpected ${method}`);
    });

    store.startPolling();
    await vi.advanceTimersByTimeAsync(1500);
    // initial fetch (call1) + first tick (call2)
    expect(store.getState().saveData).toEqual({ parsed_at: "call2" });

    const refreshPromise = store.refreshSave(true); // hangs on get_save_data
    await vi.advanceTimersByTimeAsync(1500); // tick delivers call3
    // Must NOT overwrite state while the forced refresh is in flight.
    expect(store.getState().saveData).toEqual({ parsed_at: "call2" });

    forced.resolve({ parsed_at: "FORCED" });
    await refreshPromise;
    expect(store.getState().saveData).toEqual({ parsed_at: "FORCED" });
    // Flag reset: the next tick writes again.
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.getState().saveData).toEqual({ parsed_at: "call4" });
  });

  it("refreshStatic retries with 500/1500ms backoff then succeeds", async () => {
    let attempts = 0;
    mock.mockCall((method) => {
      if (method === "get_plugin_info") {
        attempts++;
        if (attempts < 3) throw new Error("boot-loop");
        return { version: "0.1.0" };
      }
      if (method === "get_settings") return { theme: "default" };
      if (method === "get_type_chart") return { types: [] };
      if (method === "get_moves_database") return { merged_count: 0 };
      if (method === "get_themes") return { themes: [], active: { id: "default" } };
      throw new Error(`unexpected ${method}`);
    });

    const done = store.refreshStatic();
    await vi.advanceTimersByTimeAsync(500); // backoff 1
    await vi.advanceTimersByTimeAsync(1500); // backoff 2
    await done;
    expect(attempts).toBe(3);
    expect(store.getState().info).toEqual({ version: "0.1.0" });
    expect(store.getState().theme).toEqual({ id: "default" });
  });

  it("refreshStatic swallows total failure", async () => {
    mock.mockCall(() => {
      throw new Error("backend never comes up");
    });
    const done = store.refreshStatic();
    await vi.advanceTimersByTimeAsync(500 + 1500);
    await expect(done).resolves.toBeUndefined(); // no throw
    expect(store.getState().info).toBeNull();
  });

  it("applySettingsPatch refreshes the theme when theme is patched", async () => {
    mock.mockCall((method) => {
      if (method === "update_settings") return { theme: "dark" };
      if (method === "get_themes")
        return { themes: [{ id: "dark" }], active: { id: "dark" } };
      throw new Error(`unexpected ${method}`);
    });
    const out = await store.applySettingsPatch({ theme: "dark" });
    expect(out.theme).toBe("dark");
    const methods = mock.callLog.map((c) => c.method);
    expect(methods).toContain("get_themes");
    expect(store.getState().theme).toEqual({ id: "dark" });
  });

  it("applySettingsPatch rethrows backend errors", async () => {
    mock.mockCall(() => {
      throw new Error("nope");
    });
    await expect(store.applySettingsPatch({ theme: "x" })).rejects.toThrow();
    expect(store.getState().settings).toBeNull();
  });
});

describe("store primitives", () => {
  it("subscribe/unsubscribe and updateState fan-out", async () => {
    const seen: number[] = [];
    const unsub = store.subscribe(() => seen.push(1));
    unsub();
    mock.mockCall((method) => {
      if (method === "get_live_state") return freshLive();
      throw new Error(`unexpected ${method}`);
    });
    await store.refreshLiveState();
    expect(seen).toEqual([]); // listener was removed before the write
    expect(store.getState().liveState).not.toBeNull();
  });

  it("saveDataEqual compares identity fields only", () => {
    const base = {
      parsed_at: "t1", source_path: "/a", party_count: 1,
      trainer_name: "Red", error: undefined as string | undefined,
      money: 100,
      party: [{ species: "Pika", hp: 10, status: 0, level: 5 }],
    } as never;
    expect(store.saveDataEqual(base, base)).toBe(true);
    expect(store.saveDataEqual(base, null)).toBe(false);
    expect(store.saveDataEqual(null, null)).toBe(true);
    const changedHp = {
      ...base,
      party: [{ species: "Pika", hp: 5, status: 0, level: 5 }],
    } as never;
    expect(store.saveDataEqual(base, changedHp)).toBe(false);
    // parsed_at change alone matters.
    const nextParse = { ...base, parsed_at: "t2" } as never;
    expect(store.saveDataEqual(base, nextParse)).toBe(false);
  });

  it("partyEqual length and member checks", () => {
    const a = [{ species: "A", hp: 1, status: 0, level: 2 }];
    const b = [{ species: "A", hp: 1, status: 0, level: 2 }];
    expect(store.partyEqual(a, b)).toBe(true);
    expect(store.partyEqual(undefined, undefined)).toBe(true);
    expect(store.partyEqual(a, undefined)).toBe(false);
    expect(store.partyEqual(a, [])).toBe(false);
    expect(store.partyEqual(a, [{ ...a[0], hp: 9 }])).toBe(false);
    expect(store.partyEqual(a, [{ ...a[0], species: "B" }])).toBe(false);
    expect(store.partyEqual(a, [{ ...a[0], level: 9 }])).toBe(false);
  });
});
