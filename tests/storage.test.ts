/**
 * The persistence boundary — the file that used to `JSON.parse` straight into a cast.
 * These tests are written from the attacker's side of the door: everything in
 * `localStorage` is untrusted input.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SET_KEY, STATS_KEY } from "../src/game/config";
import { emptyStats } from "../src/game/career";
import {
  clearAll,
  loadSettings,
  loadStats,
  prefersCoarsePointer,
  saveSettings,
  saveStats,
  subscribeToStorage,
} from "../src/game/storage";
import type { RunRecord } from "../src/game/types";

const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: "r1",
  mode: "sprint",
  difficulty: "medium",
  wpm: 62,
  rawWpm: 66,
  accuracy: 97.4,
  score: 4200,
  correctChars: 180,
  incorrectChars: 5,
  words: 25,
  skips: 0,
  perfectWords: 18,
  maxCombo: 14,
  place: 1,
  field: 3,
  durationMs: 25_000,
  endReason: "track",
  finished: true,
  valid: true,
  date: 1_700_000_000_000,
  series: [40, 55, 62],
  keyMisses: { q: 2, " ": 1 },
  ...over,
});

const put = (key: string, value: unknown) =>
  localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("round trip", () => {
  it("writes and reads back a career without losing a field", () => {
    const stats = {
      ...emptyStats(),
      runs: [run(), run({ id: "r2", mode: "time", wpm: 48, valid: true })],
      totals: {
        ...emptyStats().totals,
        races: 2,
        finishedRaces: 2,
        keystrokes: 185,
        bestWpm: 62,
        bestScore: 4200,
        maxCombo: 14,
      },
      keyMisses: { q: 2 },
      best: { ...emptyStats().best, sprint: { wpm: 62, score: 4200, accuracy: 97.4 } },
      badges: ["first-lap"],
    };
    expect(saveStats(stats).ok).toBe(true);
    const loaded = loadStats();
    expect(loaded.issues).toHaveLength(0);
    expect(loaded.available).toBe(true);
    expect(loaded.value.runs).toHaveLength(2);
    expect(loaded.value.runs[0]?.wpm).toBe(62);
    expect(loaded.value.runs[0]?.accuracy).toBe(97.4);
    expect(loaded.value.totals.races).toBe(2);
    expect(loaded.value.best.sprint).toEqual({ wpm: 62, score: 4200, accuracy: 97.4 });
    expect(loaded.value.badges).toEqual(["first-lap"]);
  });

  it("round-trips settings and repairs an unknown difficulty", () => {
    put(SET_KEY, { sound: false, fingerGuide: true, difficulty: "nightmare", screenShake: false, showKeyboard: true });
    const { value } = loadSettings();
    expect(value.sound).toBe(false);
    expect(value.showKeyboard).toBe(true);
    expect(value.difficulty).toBe("medium"); // DEFAULT_DIFFICULTY — never the bogus id
    expect(saveSettings(value).ok).toBe(true);
    expect(loadSettings().value.sound).toBe(false);
  });
});

describe("untrusted payloads", () => {
  it("quarantines an unparsable career file instead of crashing on every boot", () => {
    put(STATS_KEY, "{ this is not json");
    const loaded = loadStats();
    expect(loaded.value).toEqual(emptyStats());
    expect(loaded.issues.map((i) => i.kind)).toEqual(["corrupt"]);
    // The payload is preserved for recovery, and the live key is cleared so the next boot is clean.
    expect(localStorage.getItem(`${STATS_KEY}.corrupt`)).toContain("not json");
    expect(localStorage.getItem(STATS_KEY)).toBeNull();
    expect(loadStats().issues).toHaveLength(0);
  });

  it("drops unusable runs and reports how many, keeping the good ones", () => {
    put(STATS_KEY, {
      runs: [
        run(),
        null,
        42,
        { mode: "sprint" },
        { ...run({ id: "no-date" }), date: undefined },
        { ...run({ id: "ghost" }), mode: "hyper" },
      ],
      totals: { races: 99 },
      best: { sprint: "yes" },
      badges: ["ok", 7, "x".repeat(200)],
      keyMisses: { a: 3, b: -9, c: "many", longkeyname: 1 },
    });
    const { value, issues } = loadStats();
    expect(value.runs.map((r) => r.id)).toEqual(["r1"]);
    expect(issues.map((i) => i.kind)).toEqual(["partial"]);
    expect(issues[0]?.message).toMatch(/5 saved races could not be read/);
    expect(value.badges).toEqual(["ok"]);
    expect(value.keyMisses).toEqual({ a: 3 });
    expect(value.best.sprint).toBeNull();
    // Totals are never trusted past the surviving detail: `races` is at least the run count.
    expect(value.totals.races).toBeGreaterThanOrEqual(1);
  });

  it("refuses a run with no keystrokes and back-fills a legacy `finished` boolean", () => {
    put(STATS_KEY, {
      runs: [
        run({ correctChars: 0, incorrectChars: 0 }),
        { ...run({ id: "old" }), endReason: undefined, finished: true },
      ],
    });
    const { value } = loadStats();
    expect(value.runs.map((r) => r.id)).toEqual(["old"]);
    expect(value.runs[0]?.endReason).toBe("track");
    expect(value.runs[0]?.finished).toBe(true);
  });

  it("clamps hostile numbers so a chart cannot be drawn off a billion-WPM record", () => {
    put(STATS_KEY, {
      runs: [
        run({
          wpm: 9_999_999,
          score: -50_000,
          accuracy: 4000,
          durationMs: 1e15,
          place: 77,
          series: [1, -3, Number.NaN, 9, 1e9],
        }),
      ],
    });
    const r = loadStats().value.runs[0] as RunRecord;
    expect(r.wpm).toBeLessThanOrEqual(500);
    expect(r.score).toBe(0);
    expect(r.accuracy).toBeLessThanOrEqual(100);
    expect(r.place).toBeLessThanOrEqual(9);
    expect(r.durationMs).toBeLessThanOrEqual(1000 * 60 * 60 * 6);
    expect(r.series).toEqual([1, 9, 500]);
  });

  it("adopts a legacy v2 file once, then deletes it so a downgrade cannot revive it", () => {
    put("keyrush.stats.v2", { runs: [run({ id: "ancient" })] });
    const { value } = loadStats();
    expect(value.runs.map((r) => r.id)).toEqual(["ancient"]);
    expect(localStorage.getItem(STATS_KEY)).not.toBeNull();
    expect(localStorage.getItem("keyrush.stats.v2")).toBeNull();
  });
});

describe("failure modes", () => {
  it("reports a quota failure as `quota` and tells the caller the write was lost", () => {
    const err = new DOMException("full", "QuotaExceededError");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw err;
    });
    const res = saveStats({ ...emptyStats(), runs: [run()] });
    expect(res.ok).toBe(false);
    expect(res.issues[0]?.kind).toBe("quota");
    expect(res.issues[0]?.message).toMatch(/full/i);
  });

  it("degrades to defaults when the storage getter itself throws", () => {
    vi.stubGlobal(
      "localStorage",
      Object.defineProperty({}, "getItem", {
        get() {
          throw new Error("SecurityError");
        },
      }),
    );
    const stats = loadStats();
    expect(stats.available).toBe(false);
    expect(stats.value).toEqual(emptyStats());
    expect(stats.issues.map((i) => i.kind)).toEqual(["unavailable"]);
    expect(loadSettings().available).toBe(false);
    expect(saveStats(emptyStats()).ok).toBe(false);
    vi.unstubAllGlobals();
  });

  it("clears every key, including the quarantine and the legacy ones", () => {
    put(STATS_KEY, { runs: [run()] });
    put(SET_KEY, { sound: true });
    put("keyrush.settings.v2", {});
    put(`${STATS_KEY}.corrupt`, "junk");
    put("unrelated.key", "keep me");
    expect(clearAll().ok).toBe(true);
    expect(localStorage.getItem(STATS_KEY)).toBeNull();
    expect(localStorage.getItem(SET_KEY)).toBeNull();
    expect(localStorage.getItem("keyrush.settings.v2")).toBeNull();
    expect(localStorage.getItem(`${STATS_KEY}.corrupt`)).toBeNull();
    expect(localStorage.getItem("unrelated.key")).toBe("keep me");
  });
});

describe("cross-tab coherence", () => {
  it("notifies on the keys it owns and nothing else", () => {
    const seen: string[] = [];
    const off = subscribeToStorage((key) => seen.push(key));
    const fire = (key: string | null) => window.dispatchEvent(new StorageEvent("storage", { key }));
    fire(STATS_KEY);
    fire(SET_KEY);
    fire("unrelated");
    fire(null); // a bare clear() must not be mistaken for a write
    expect(seen).toEqual(["stats", "settings"]);
    off();
    fire(STATS_KEY);
    expect(seen).toHaveLength(2);
  });
});

describe("device hints", () => {
  it("asks the pointer query it documents, and survives a missing or hostile matchMedia", () => {
    const queries: string[] = [];
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => {
        queries.push(q);
        return {
          matches: true,
          media: q,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent: false,
        };
      }),
    );
    expect(prefersCoarsePointer()).toBe(true);
    expect(queries).toContain("(pointer: coarse)");

    vi.stubGlobal("matchMedia", undefined);
    expect(typeof prefersCoarsePointer()).toBe("boolean");

    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => {
        throw new Error("nope");
      }),
    );
    expect(typeof prefersCoarsePointer()).toBe("boolean");
    vi.unstubAllGlobals();
  });
});
