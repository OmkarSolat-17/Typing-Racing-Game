import { describe, expect, it } from "vitest";
import {
  accuracy,
  charsToWords,
  clampWpm,
  formatClock,
  formatDuration,
  formatNumber,
  ordinalSuffix,
  formatPercent,
  lapsOf,
  multFrom,
  placeLabel,
  progressOf,
  rawWpm,
  tierProgress,
  wpm,
} from "../src/game/metrics";
import { COMBO, MAX_WPM, WPM_WARMUP_MS } from "../src/game/config";

describe("speed", () => {
  it("uses the standard five characters per word", () => {
    expect(charsToWords(5)).toBe(1);
    expect(charsToWords(50)).toBe(10);
    expect(charsToWords(0)).toBe(0);
  });

  it("is silent inside the warm-up window instead of inventing a 300 WPM spike", () => {
    expect(wpm(5, 10)).toBe(0);
    expect(wpm(5, WPM_WARMUP_MS - 1)).toBe(0);
    expect(wpm(60, 60_000)).toBe(12); // 60 chars in 60 s = 12 words/min
    expect(wpm(0, 60_000)).toBe(0);
  });

  it("clamps to a human ceiling so one runaway sample cannot own the charts", () => {
    expect(wpm(100_000, 1_000)).toBe(MAX_WPM);
    // …but the warm-up floor still wins over the clamp: nothing is measurable yet.
    expect(wpm(100_000, 50)).toBe(0);
    expect(clampWpm(-5)).toBe(0);
    expect(clampWpm(9999)).toBe(MAX_WPM);
    expect(Number.isFinite(wpm(10, 0))).toBe(true);
  });

  it("treats junk input as junk, not as Infinity or NaN", () => {
    expect(wpm(Number.NaN, 1000)).toBe(0);
    expect(wpm(10, Number.POSITIVE_INFINITY)).toBe(0);
    expect(rawWpm(5, 5, 60_000)).toBe(2);
  });
});

describe("accuracy", () => {
  it("is zero with no keystrokes, not 100% (which made an abandoned run look perfect)", () => {
    expect(accuracy(0, 0)).toBe(0);
    expect(accuracy(9, 1)).toBe(90);
    expect(accuracy(1, 9)).toBe(10);
    expect(accuracy(3, 0)).toBe(100);
    expect(Number.isFinite(accuracy(0, 0))).toBe(true);
  });
});

describe("combo multiplier", () => {
  it("steps every four flawless words and caps at the ceiling", () => {
    expect(multFrom(0)).toBe(1);
    expect(multFrom(COMBO.step - 1)).toBe(1);
    expect(multFrom(COMBO.step)).toBe(2);
    expect(multFrom(COMBO.step * 2)).toBe(3);
    expect(multFrom(1000)).toBe(COMBO.maxMult);
    expect(multFrom(-4)).toBe(1);
  });

  it("reports progress toward the next tier without ever blanking out", () => {
    expect(tierProgress(0)).toBeGreaterThanOrEqual(0);
    expect(tierProgress(COMBO.step)).toBeLessThanOrEqual(1);
    expect(tierProgress(9999)).toBeLessThanOrEqual(1);
  });
});

describe("progress", () => {
  it("counts laps from 1 and cannot divide by a zero-length lap", () => {
    expect(progressOf(0, 100)).toBe(0);
    expect(progressOf(50, 100)).toBe(0.5);
    expect(lapsOf(50, 100)).toBe(1);
    expect(lapsOf(250, 100)).toBe(3); // 0–1 lap is lap 1
    expect(Number.isFinite(progressOf(50, 0))).toBe(true);
    expect(lapsOf(10, 0)).toBeGreaterThan(0);
  });
});

describe("formatting", () => {
  it("shows one decimal only in the last ten seconds, and never a negative clock", () => {
    expect(formatClock(65_000)).toBe("65");
    expect(formatClock(10_500)).toBe("11");
    expect(formatClock(9_400)).toBe("9.4");
    expect(formatClock(-1000)).toBe("0.0");
    expect(formatClock(0)).toBe("0.0");
  });

  it("formats durations as h/m/s with padded units", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(9_900)).toBe("9s");
    expect(formatDuration(65_000)).toBe("1m 05s");
    expect(formatDuration(3_725_000)).toBe("1h 02m");
    expect(formatDuration(-5000)).toBe("0s");
  });

  it("places ordinals correctly, including the teens and the twenties", () => {
    expect(placeLabel(0)).toBe("—");
    expect(placeLabel(1)).toBe("1ST");
    expect(placeLabel(2)).toBe("2ND");
    expect(placeLabel(3)).toBe("3RD");
    expect(placeLabel(4)).toBe("4TH");
    expect(placeLabel(11)).toBe("11TH");
    expect(placeLabel(12)).toBe("12TH");
    expect(placeLabel(13)).toBe("13TH");
    expect(placeLabel(21)).toBe("21ST");
    expect(placeLabel(111)).toBe("111TH");
    expect(placeLabel(-3)).toBe("—");
    expect(ordinalSuffix(22)).toBe("ND");
  });

  it("prints numbers and percentages without NaN leaking to the HUD", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(Number.NaN)).toBe("0");
    expect(formatPercent(91.234)).toBe("91.2%");
    expect(formatPercent(Number.NaN)).toBe("0%");
  });
});
