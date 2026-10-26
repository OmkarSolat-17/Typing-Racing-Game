/**
 * Career arithmetic and badge rules — the layer that turns a finished race into a permanent
 * record. Both used to be reachable only by playing 20 races.
 */
import { describe, expect, it } from "vitest";
import { BADGES, badgeById, badgeName, newBadgesFor } from "../src/game/badges";
import { emptyStats, emptyTotals, leaderboard, recordRun } from "../src/game/career";
import { RUN_HISTORY_LIMIT } from "../src/game/config";
import type { RunRecord, Stats } from "../src/game/types";

const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: Math.random().toString(36).slice(2),
  mode: "sprint",
  difficulty: "medium",
  wpm: 60,
  rawWpm: 64,
  accuracy: 96,
  score: 4000,
  correctChars: 160,
  incorrectChars: 6,
  words: 25,
  skips: 0,
  perfectWords: 20,
  maxCombo: 12,
  place: 1,
  field: 3,
  durationMs: 24_000,
  endReason: "track",
  finished: true,
  valid: true,
  date: 1_700_000_000_000,
  series: [50, 60],
  keyMisses: { q: 1 },
  ...over,
});

const withRuns = (...runs: RunRecord[]): Stats => ({ ...emptyStats(), runs });

describe("badges", () => {
  it("every badge has a name, a description and a colour the UI can render", () => {
    const ids = new Set<string>();
    for (const b of BADGES) {
      expect(b.id.length).toBeGreaterThan(2);
      expect(b.name.length).toBeGreaterThan(2);
      expect(b.desc.length).toBeGreaterThan(4);
      expect(b.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(typeof b.test(emptyStats())).toBe("boolean");
      expect(ids.has(b.id)).toBe(false);
      ids.add(b.id);
    }
  });

  it("grants the first finish and nothing else, with no phantom unlocks", () => {
    const prev = emptyStats();
    const { stats, newBadges } = recordRun(prev, run());
    expect(newBadges).toContain("first-lap");
    expect(stats.badges).toEqual(newBadges);
    // A second ordinary finish must not re-announce it.
    expect(newBadgesFor(stats, recordRun(stats, run()).stats).includes("first-lap")).toBe(false);
  });

  it("never grants a finish that was not really raced", () => {
    // The audit's exploit: a run made of Tab presses used to satisfy `first-lap` and `perfect`.
    const skipped = run({
      finished: true,
      valid: false,
      skips: 25,
      correctChars: 0,
      wpm: 0,
      accuracy: 100,
      score: 1400,
      maxCombo: 0,
      perfectWords: 0,
    });
    const { newBadges } = recordRun(emptyStats(), skipped);
    expect(newBadges).toEqual([]);
    expect(leaderboard({ ...emptyStats(), runs: [skipped] })).toHaveLength(0);
  });

  it("unlocks speed tiers exactly at their thresholds", () => {
    // Speed tiers read the lifetime total, so the race has to go through `recordRun`.
    const fast = recordRun(emptyStats(), run({ wpm: 91 })).stats;
    const earned = BADGES.filter((b) => b.test(fast)).map((b) => b.id);
    expect(earned).toContain("wpm90");
    expect(earned).toContain("first-lap");
    const slow = recordRun(emptyStats(), run({ wpm: 89 })).stats;
    expect(BADGES.filter((b) => b.test(slow)).map((b) => b.id)).not.toContain("wpm90");
    expect(BADGES.filter((b) => b.test(slow)).map((b) => b.id)).toContain("wpm70");
  });

  it("requires every mode to be finished for the Full Grid badge", () => {
    const partial = withRuns(run({ mode: "sprint" }), run({ mode: "time" }));
    expect(badgeById("allmodes")?.test(partial)).toBe(false);
    const full = withRuns(
      run({ mode: "sprint" }),
      run({ mode: "time" }),
      run({ mode: "overdrive" }),
      run({ mode: "zen" }),
    );
    expect(badgeById("allmodes")?.test(full)).toBe(true);
  });

  it("names an unknown badge instead of rendering a raw id", () => {
    expect(badgeName("wpm50")).toBe("Speed Demon");
    expect(badgeName("made-up")).toBe("Unknown Badge");
    expect(badgeById("made-up")).toBeUndefined();
  });
});

describe("career totals", () => {
  it("folds one run into every lifetime counter", () => {
    const { stats } = recordRun(
      emptyStats(),
      run({ correctChars: 100, incorrectChars: 10, words: 20, perfectWords: 15, maxCombo: 9, durationMs: 30_000 }),
    );
    const t = stats.totals;
    expect(t.races).toBe(1);
    expect(t.finishedRaces).toBe(1);
    expect(t.keystrokes).toBe(110);
    expect(t.words).toBe(20);
    expect(t.perfectWords).toBe(15);
    expect(t.ms).toBe(30_000);
    expect(t.bestWpm).toBe(60);
    expect(t.bestScore).toBe(4000);
    expect(t.maxCombo).toBe(9);
    expect(t.firstPlaces).toBe(1);
    expect(stats.keyMisses).toEqual({ q: 1 });
    expect(stats.best.sprint).toEqual({ wpm: 60, score: 4000, accuracy: 96 });
  });

  it("keeps history for a DNF without letting it touch the records", () => {
    const dnf = run({ finished: false, valid: false, endReason: "abandon", place: 0, wpm: 200, score: 99_999 });
    const { stats } = recordRun(emptyStats(), dnf);
    expect(stats.totals.races).toBe(1);
    expect(stats.totals.finishedRaces).toBe(0);
    expect(stats.totals.bestWpm).toBe(0);
    expect(stats.totals.bestScore).toBe(0);
    expect(stats.best.sprint).toBeNull();
    expect(stats.runs).toHaveLength(1);
  });

  it("never lowers a personal best", () => {
    let stats = recordRun(emptyStats(), run({ wpm: 70, score: 5000 })).stats;
    stats = recordRun(stats, run({ wpm: 40, score: 900 })).stats;
    expect(stats.best.sprint).toEqual({ wpm: 70, score: 5000, accuracy: 96 });
    stats = recordRun(stats, run({ wpm: 71, score: 100 })).stats;
    expect(stats.best.sprint?.wpm).toBe(71);
  });

  it("truncates the detail window but still counts every race", () => {
    let stats: Stats = emptyStats();
    for (let i = 0; i < RUN_HISTORY_LIMIT + 25; i++) {
      stats = recordRun(stats, run({ wpm: 30 + (i % 40), score: 1000 + i })).stats;
    }
    expect(stats.runs).toHaveLength(RUN_HISTORY_LIMIT);
    expect(stats.totals.races).toBe(RUN_HISTORY_LIMIT + 25);
    // Newest first, so the career log reads like a form guide.
    expect(stats.runs[0]?.score).toBe(1000 + RUN_HISTORY_LIMIT + 24);
  });

  it("ranks only eligible runs, and breaks ties on score then recency", () => {
    const a = run({ id: "a", score: 5000, wpm: 60, date: 10 });
    const b = run({ id: "b", score: 6000, wpm: 55, date: 20 });
    const c = run({ id: "c", score: 9999, wpm: 99, valid: false });
    const stats = withRuns(a, b, c);
    expect(leaderboard(stats).map((r) => r.id)).toEqual(["b", "a"]);
    expect(leaderboard(stats, "zen")).toHaveLength(0);
    expect(leaderboard(withRuns(run({ mode: "zen" })), "zen", 1)).toHaveLength(1);
  });

  it("starts from a zeroed board that renders without guards", () => {
    const t = emptyTotals();
    expect(Object.values(t).every((v) => v === 0)).toBe(true);
    expect(leaderboard(emptyStats())).toEqual([]);
    expect(newBadgesFor(emptyStats(), emptyStats())).toEqual([]);
  });
});
