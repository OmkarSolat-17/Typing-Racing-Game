import { describe, expect, it } from "vitest";
import { avgWordLength, buildTrack, POOLS, shuffle, trackChars } from "../src/game/words";
import type { Difficulty } from "../src/game/types";

/** Deterministic source: a pool bug must be reproducible, not "sometimes". */
const rng = (seed = 11) => {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 0x1_00_00_00_00;
  };
};

const ids: Difficulty[] = ["easy", "medium", "hard", "code"];

describe("pools", () => {
  it("are big enough that a race never sees the whole vocabulary", () => {
    for (const id of ids) {
      const pool = POOLS[id];
      expect(pool.length, id).toBeGreaterThanOrEqual(80);
    }
    // Sprint asks for 25 × 1.35 = 34 words: the smallest pool must still be several times that.
    expect(POOLS.medium.length).toBeGreaterThan(34);
  });

  it("hold no duplicates and no empty tokens (the old MEDIUM pool was 126 tokens for 45 words)", () => {
    for (const id of ids) {
      const pool = POOLS[id];
      expect(new Set(pool).size, id).toBe(pool.length);
      for (const w of pool) {
        expect(w.length, `${id}:${w}`).toBeGreaterThan(0);
        expect(w.trim(), `${id}:${w}`).toBe(w);
        expect(w.includes("  "), `${id}:${w}`).toBe(false);
      }
    }
  });

  it("stay renderable in one lane: no 60-character monster", () => {
    for (const id of ids) {
      for (const w of POOLS[id]) expect(w.length, `${id}:${w}`).toBeLessThanOrEqual(24);
    }
  });

  it("get progressively harder", () => {
    expect(avgWordLength("easy")).toBeLessThan(avgWordLength("medium"));
    expect(avgWordLength("medium")).toBeLessThan(avgWordLength("hard"));
    expect(avgWordLength("hard")).toBeGreaterThan(9);
  });

  /** The audit's note: 21 tokens of which five were a bare `{`. Filler, not practice. */
  it("teaches code, not braces", () => {
    const code = POOLS.code;
    expect(code.filter((w) => w === "{" || w === "}").length).toBe(0);
    expect(code.filter((w) => w.length <= 2).length).toBe(0);
    // Real snippets carry spaces, so the pool exercises the space bar too.
    expect(code.some((w) => w.includes(" "))).toBe(true);
    expect(code.some((w) => /[=;()<>[\]{}]/.test(w))).toBe(true);
    // …and no single shape may dominate the pool.
    const firstChar = new Map<string, number>();
    for (const w of code) firstChar.set(w[0] as string, (firstChar.get(w[0] as string) ?? 0) + 1);
    expect(Math.max(...firstChar.values())).toBeLessThan(code.length / 5);
  });
});

describe("shuffle", () => {
  it("is a permutation, not a filter", () => {
    const src = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const out = shuffle(src, rng());
    expect([...out].sort()).toEqual([...src].sort());
    expect(out).not.toEqual(src); // with this seed, order must actually change
  });

  it("is reproducible for a fixed source of randomness", () => {
    const src = ["a", "b", "c", "d", "e", "f"];
    expect(shuffle(src, rng(4))).toEqual(shuffle(src, rng(4)));
    expect(shuffle(src, rng(4))).not.toEqual(shuffle(src, rng(5)));
  });

  it("never mutates the pool it was given", () => {
    const pool = POOLS.easy;
    const before = pool.slice();
    shuffle(pool, rng());
    buildTrack("easy", 40, rng());
    expect(pool).toEqual(before);
  });
});

describe("buildTrack", () => {
  it("returns exactly the requested length and only pool words", () => {
    for (const id of ids) {
      const track = buildTrack(id, 37, rng(3));
      expect(track).toHaveLength(37);
      for (const w of track) expect(POOLS[id]).toContain(w);
    }
  });

  it("does not repeat a word back to back, even with a small pool", () => {
    for (const id of ids) {
      const track = buildTrack(id, 200, rng(9));
      let repeats = 0;
      for (let i = 1; i < track.length; i++) if (track[i] === track[i - 1]) repeats++;
      expect(repeats / track.length, id).toBeLessThan(0.15);
    }
  });

  it("spreads across the pool instead of cycling the head of it", () => {
    const track = buildTrack("medium", 60, rng(2));
    const unique = new Set(track).size;
    expect(unique).toBeGreaterThan(30);
  });

  it("sizes a track by characters so distance and time agree", () => {
    const track = buildTrack("easy", 25, rng(6));
    expect(trackChars(track)).toBe(track.reduce((n, w) => n + w.length, 0));
    expect(trackChars([])).toBe(0);
  });

  it("is deterministic under a seeded source, so a bug can be replayed", () => {
    expect(buildTrack("code", 30, rng(8))).toEqual(buildTrack("code", 30, rng(8)));
  });
});
