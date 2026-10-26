/**
 * The rules layer — every assertion here is a regression test for a defect the audit found.
 * They run without a DOM on purpose: a scoring bug must be catchable without React.
 */
import { describe, expect, it } from "vitest";
import {
  advance,
  backspace,
  beginPlaying,
  createRun,
  expectedText,
  keyDown,
  pauseRun,
  prepareRun,
  resumeRun,
  skipWord,
  snapshot,
  toRecord,
  trackSize,
  type RunState,
} from "../src/game/rules";
import { ENERGY, SCORE, WPM_WARMUP_MS } from "../src/game/config";
import type { Difficulty, EndReason, Mode, RunRecord } from "../src/game/types";

/** A deterministic pseudo-random source so tracks and rival grids are reproducible. */
const rng = (seed = 1) => {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 0x1_00_00_00_00;
  };
};

function armed(mode: Mode = "sprint", difficulty: Difficulty = "easy", seed = 7): RunState {
  const s = prepareRun(createRun(mode, difficulty), mode, difficulty, rng(seed));
  beginPlaying(s, 1000);
  return s;
}

/**
 * Mirrors `useEngine.settle`: the rules only *report* that a race ended — the hook owns the
 * terminal transition. Tests that loop over frames/skips must apply the same door.
 */
function settle(s: RunState, out: { ended: EndReason | null }): RunRecord | null {
  if (out.ended === null) return null;
  if (s.status === "finished") return null;
  s.status = "finished";
  s.endReason = out.ended;
  return toRecord(s, s.startedAt + s.elapsed);
}

const type = (s: RunState, word: string) => {
  const events = [];
  for (const ch of word) events.push(...keyDown(s, ch).events);
  return events;
};

describe("track construction", () => {
  it("sizes the track from the mode's promise and the difficulty factor", () => {
    expect(trackSize("sprint", "medium")).toBe(25);
    expect(trackSize("sprint", "hard")).toBe(19);
    // Longer words → fewer of them, so every difficulty lasts a comparable time.
    expect(trackSize("sprint", "easy")).toBeGreaterThan(trackSize("sprint", "hard"));
  });

  it("arms a race on the countdown with a real track and rivals only where the mode has them", () => {
    const sprint = prepareRun(createRun("sprint", "easy"), "sprint", "easy", rng(3));
    expect(sprint.status).toBe("countdown");
    expect(sprint.words.length).toBe(trackSize("sprint", "easy"));
    expect(sprint.rivals.length).toBe(2);

    const zen = prepareRun(createRun("zen", "medium"), "zen", "medium", rng(3));
    expect(zen.rivals).toHaveLength(0);
    expect(zen.timeLeft).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("keyDown", () => {
  it("credits, advances and completes a word", () => {
    const s = armed();
    const word = s.words[0] as string;
    const events = type(s, word);
    expect(s.idx).toBe(1);
    expect(s.typed).toBe("");
    expect(s.correctChars).toBe(word.length);
    expect(s.dist).toBe(word.length);
    expect(s.score).toBe(
      SCORE.perChar * word.length + SCORE.perWord + word.length * SCORE.perWordLength + SCORE.perfectBonus,
    );
    expect(events.some((e) => e.type === "word" && e.perfect === true)).toBe(true);
  });

  it("breaks the combo and penalises on a wrong key, without advancing", () => {
    const s = armed();
    const word = s.words[0] as string;
    type(s, word);
    expect(s.combo).toBe(1);
    const before = s.idx;
    const scoreBefore = s.score;
    const out = keyDown(s, word[0] === "z" ? "y" : "z");
    expect(s.idx).toBe(before);
    expect(s.combo).toBe(0);
    expect(s.mult).toBe(1);
    expect(s.incorrectChars).toBe(1);
    expect(s.score).toBe(scoreBefore - SCORE.errorPenalty);
    expect(out.events.some((e) => e.type === "error")).toBe(true);
  });

  it("counts a mistyped key against the *expected* character, not the one mashed", () => {
    const s = armed();
    const word = s.words[0] as string;
    const wanted = word[0] as string;
    keyDown(s, wanted === "q" ? "w" : "q");
    expect(Object.keys(s.keyMisses)).toEqual([wanted]);
  });

  it("matches multi-code-unit input (IME commits, astral graphemes)", () => {
    const s = armed();
    const word = s.words[0] as string;
    const two = word.slice(0, 2);
    expect(expectedText(s, 2)).toBe(two);
    const out = keyDown(s, two);
    expect(s.typed).toBe(two);
    expect(s.correctChars).toBe(2);
    expect(out.dirty).toBe(true);
    // A single-code-unit expectation is not satisfied by a longer, wrong string.
    const s2 = armed();
    const bad = (s2.words[0] as string).slice(0, 2) === "ab" ? "xy" : "ab";
    const r = keyDown(s2, bad);
    expect(s2.typed).toBe("");
    expect(r.events.some((e) => e.type === "error")).toBe(true);
  });

  it("ignores input when the race is not active", () => {
    const idle = createRun("sprint", "easy");
    expect(keyDown(idle, "a").dirty).toBe(false);
    const done = armed();
    done.status = "finished";
    expect(keyDown(done, "a").dirty).toBe(false);
    expect(keyDown(armed(), "").dirty).toBe(false);
  });

  it("builds the multiplier only from flawless words, and holds the cap", () => {
    const s = armed();
    for (let i = 0; i < 12; i++) type(s, s.words[i] as string);
    expect(s.mult).toBeGreaterThan(1);
    expect(s.combo).toBe(12);
    for (let i = 0; i < 60; i++) {
      type(s, s.words[Math.min(i, s.words.length - 1)] as string);
    }
    expect(s.mult).toBeLessThanOrEqual(5);
  });

  it("refuels the boost tank per character and per word in OVERDRIVE only", () => {
    const over = armed("overdrive", "easy");
    expect(over.energy).toBe(ENERGY.start);
    const word = over.words[0] as string;
    type(over, word);
    expect(over.energy).toBeCloseTo(
      Math.min(ENERGY.max, ENERGY.start + word.length * ENERGY.gainChar + ENERGY.gainWord),
      6,
    );

    const sprint = armed("sprint", "easy");
    type(sprint, sprint.words[0] as string);
    expect(sprint.energy).toBe(ENERGY.max);
  });

  it("never lets the score go negative", () => {
    const s = armed();
    for (let i = 0; i < 40; i++) keyDown(s, "§");
    expect(s.score).toBe(0);
  });
});

describe("backspace", () => {
  /**
   * The audit's first Critical: the old `backspace` deleted the character and nothing else,
   * so deleting a whole word and retyping it paid out twice.
   */
  it("refunds the points and the distance of what it erases", () => {
    // A long-word pool, so the four-character prefix is not the whole word by accident.
    const s = armed("sprint", "hard");
    const word = s.words[0] as string;
    const head = word.slice(0, 4);
    type(s, head);
    expect(s.dist).toBe(4);
    expect(s.score).toBe(4 * SCORE.perChar);
    expect(s.correctChars).toBe(4);

    for (let i = 0; i < 4; i++) expect(backspace(s)).toBe(true);
    expect(s.typed).toBe("");
    expect(s.dist).toBe(0);
    expect(s.score).toBe(0);
    expect(s.correctChars).toBe(0);
  });

  /** The audit's repro, verbatim: a clean prefix, four backspaces, then a retype. */
  it("makes a word + full erase + retype worth exactly one word, not twice", () => {
    const s = armed("sprint", "hard");
    const word = s.words[0] as string;
    expect(word.length).toBeGreaterThan(4);
    const head = word.slice(0, 4);
    type(s, head);
    const once = { score: s.score, dist: s.dist, perfect: s.perfectWords };
    for (let i = 0; i < 4; i++) backspace(s);
    type(s, head);
    expect(s.score).toBe(once.score);
    expect(s.dist).toBe(once.dist);
    expect(s.perfectWords).toBe(once.perfect);
  });

  it("cannot erase a word that has already been banked", () => {
    const s = armed();
    const word = s.words[0] as string;
    type(s, word);
    const banked = s.score;
    expect(backspace(s)).toBe(false);
    expect(s.score).toBe(banked);
    expect(s.idx).toBe(1);
  });

  it("does not un-make a mistake, and refuses to run outside a race", () => {
    const s = armed();
    const word = s.words[0] as string;
    keyDown(s, word[0] === "z" ? "y" : "z");
    type(s, expectedText(s));
    expect(s.wordErrors).toBe(1);
    backspace(s);
    expect(s.wordErrors).toBe(1);
    expect(backspace(s)).toBe(false); // nothing typed left on this word
    const idle = createRun("sprint", "easy");
    expect(backspace(idle)).toBe(false);
  });
});

describe("skipping", () => {
  it("costs a penalty, kills the combo and marks the run ineligible", () => {
    const s = armed();
    s.score = 500;
    const out = skipWord(s);
    expect(s.idx).toBe(1);
    expect(s.skips).toBe(1);
    expect(s.score).toBe(500 - SCORE.skipPenalty);
    expect(out.events.some((e) => e.type === "skip")).toBe(true);
    const rec = toRecord(s, 2000);
    expect(rec.valid).toBe(false);
    expect(rec.skips).toBe(1);
  });

  /** The audit's other exploit: 38 presses of Tab used to "finish" a race with 0 keystrokes. */
  it("cannot win a race by skipping every word", () => {
    const s = armed();
    let guard = 0;
    let rec: RunRecord | null = null;
    while (rec === null && guard++ < 500) rec = settle(s, skipWord(s));
    expect(s.status).toBe("finished");
    expect(s.endReason).toBe("track");
    expect(s.correctChars).toBe(0);
    expect(rec?.finished).toBe(true);
    expect(rec?.valid).toBe(false);
    expect(rec?.wpm).toBe(0);
    // Placing is allowed (the rivals did move) but the record is explicitly history-only.
    expect(rec?.score).toBe(0);
    expect(rec?.skips).toBe(trackSize("sprint", "easy"));
  });

  it("ignores skips when the race is not playable", () => {
    const idle = createRun("sprint", "easy");
    expect(skipWord(idle).dirty).toBe(false);
  });
});

describe("clock discipline", () => {
  it("keeps pause/resume WPM-neutral and never charges the menu for it", () => {
    const s = armed();
    type(s, s.words[0] as string);
    advance(s, 3000, 20);
    const elapsedAtPause = s.elapsed;
    expect(pauseRun(s, 3000)).toBe(true);
    expect(pauseRun(s, 3100)).toBe(false);
    // 40 seconds spent in the pause menu:
    expect(advance(s, 43_000, 40_000).dirty).toBe(false);
    expect(resumeRun(s, 43_000)).toBe(true);
    expect(s.status).toBe("playing");
    advance(s, 43_100, 20);
    expect(s.elapsed).toBe(elapsedAtPause + 100);
    expect(s.pausedAt).toBe(0);
  });

  it("refuses to double-count a resume when the race was never paused", () => {
    const s = armed();
    expect(resumeRun(s, 5000)).toBe(false);
    expect(s.pausedTotal).toBe(0);
  });

  it("clamps a backgrounded frame so rivals neither teleport nor run backwards", () => {
    const s = armed();
    advance(s, 2000, 16);
    const before = s.rivals.map((r) => r.dist);
    // A 40-second stall in a throttled tab: rivals may gain at most one clamped frame.
    advance(s, 42_000, 40_000);
    const gained = s.rivals.map((r, i) => r.dist - (before[i] as number));
    for (const g of gained) {
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThan(12); // ≤ 50 ms of racing, not 40 s of it
    }
    // A non-monotonic timestamp must not drive a rival backwards either.
    const at = s.rivals.map((r) => r.dist);
    advance(s, 41_000, -9_000);
    expect(s.rivals.map((r) => r.dist)).toEqual(at);
  });

  it("ends a timed race on the clock, not on a 45-word dry track", () => {
    const s = armed("time", "hard");
    const def = 60_000;
    let guard = 0;
    while (s.status === "playing" && guard++ < 5000) {
      const w = s.words[s.idx];
      if (w !== undefined) type(s, w);
      settle(s, advance(s, 1000 + guard * (def / 60), def / 60));
    }
    expect(s.endReason).toBe("clock");
    expect(s.timeLeft).toBe(0);
    // Typing kept the track stocked instead of finishing the race early.
    expect(s.words.length).toBeGreaterThan(trackSize("time", "hard"));
  });

  it("samples the pace series on a fixed cadence and caps its length", () => {
    const s = armed();
    for (let i = 1; i <= 40; i++) advance(s, 1000 + i * 500, 500);
    expect(s.series.length).toBeGreaterThan(0);
    expect(s.series.length).toBeLessThanOrEqual(40);
    for (const v of s.series) expect(Number.isFinite(v)).toBe(true);
  });

  it("drains the boost tank only in OVERDRIVE and ends the race when it hits zero", () => {
    const sprint = armed("sprint", "easy");
    for (let i = 0; i < 200; i++) advance(sprint, 2000 + i * 50, 50);
    expect(sprint.energy).toBe(ENERGY.max);
    expect(sprint.status).toBe("playing");

    const over = armed("overdrive", "easy");
    let guard = 0;
    let rec: RunRecord | null = null;
    while (rec === null && guard++ < 4000) rec = settle(over, advance(over, 1000 + guard * 16, 16));
    expect(over.status).toBe("finished");
    expect(over.endReason).toBe("crash");
    expect(rec?.finished).toBe(false);
    expect(rec?.valid).toBe(false);
    expect(rec?.endReason).toBe("crash");
  });

  it("warns about low boost at most once per interval", () => {
    const s = armed("overdrive", "easy");
    s.energy = ENERGY.lowAt - 1;
    const out = advance(s, 30_000, 16);
    expect(out.events.filter((e) => e.type === "warn").length).toBe(1);
    expect(advance(s, 30_100, 16).events.filter((e) => e.type === "warn").length).toBe(0);
  });

  it("records an overtake when the field moves past you", () => {
    const s = armed();
    for (const r of s.rivals) r.dist = 10_000;
    const out = advance(s, 2000, 16);
    expect(out.events.some((e) => e.type === "overtake" && e.up === false)).toBe(true);
    expect(s.place).toBe(s.rivals.length + 1);
  });
});

describe("records", () => {
  it("marks a completed run valid only with real input", () => {
    const s = armed();
    expect(toRecord(s, 1500).valid).toBe(false); // zero keystrokes
    type(s, (s.words[0] as string).repeat(2));
    const rec = toRecord(s, 1500);
    expect(rec.correctChars).toBeGreaterThan(0);
    expect(rec.words).toBe(1);
    expect(rec.rawWpm).toBeGreaterThanOrEqual(rec.wpm);
  });

  it("reports 0 WPM inside the warm-up window instead of a sprint of noise", () => {
    const s = armed();
    const word = s.words[0] as string;
    type(s, word);
    s.startedAt = 1000;
    s.elapsed = WPM_WARMUP_MS - 100;
    s.timeLeft = Number.POSITIVE_INFINITY;
    const rec = toRecord(s, 1000 + s.elapsed);
    expect(rec.durationMs).toBeLessThan(WPM_WARMUP_MS);
    expect(rec.wpm).toBeGreaterThanOrEqual(0);
  });

  it("keeps the finish line honest about why it ended", () => {
    const s = armed();
    s.status = "finished";
    s.endReason = "abandon";
    const rec = toRecord(s, 4000);
    expect(rec.finished).toBe(false);
    expect(rec.endReason).toBe("abandon");
    expect(rec.place).toBe(0); // no placement for a race you left
  });

  it("snapshots the pending text and the rival identities for the view", () => {
    const s = armed();
    const snap = snapshot(s);
    expect(snap.word).toBe(s.words[0]);
    expect(snap.expected).toBe((s.words[0] as string)[0]);
    expect(snap.rivals).toEqual(s.rivals.map((r) => ({ name: r.name, color: r.color })));
    expect(snap.field).toBe(s.rivals.length + 1);
    expect(snap.perfect).toEqual([]);
    type(s, s.words[0] as string);
    expect(snapshot(s).perfect[0]).toBe(true);
  });
});
