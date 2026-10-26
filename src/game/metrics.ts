/**
 * Every derived number in the game, defined exactly once.
 *
 * These are pure and take milliseconds in, so they can be unit-tested without React,
 * a DOM, or a fake timer: `useEngine`, `RivalTrack`, `Hud`, `Results` and `Stats` all
 * render values that come out of this file.
 */
import { CHARS_PER_WORD, COMBO, MAX_WPM, WPM_WARMUP_MS } from "./config";

const finite = (n: number): number => (Number.isFinite(n) ? n : 0);
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Standard typing-test distance: 5 characters == 1 word. */
export const charsToWords = (chars: number): number => finite(chars) / CHARS_PER_WORD;

const ratePerMinute = (chars: number, elapsedMs: number): number => {
  const ms = finite(elapsedMs);
  if (ms <= 0) return 0;
  return (chars / CHARS_PER_WORD) * (60_000 / ms);
};

/**
 * Live WPM. Returns 0 inside the warm-up window instead of extrapolating one keystroke
 * across a whole minute. Clamped to `MAX_WPM` so a runaway sample can never poison a record.
 */
export const wpm = (distanceChars: number, elapsedMs: number, warmupMs = WPM_WARMUP_MS): number => {
  if (elapsedMs < warmupMs) return 0;
  return clampWpm(Math.round(ratePerMinute(distanceChars, elapsedMs)));
};

export const rawWpm = (
  correctChars: number,
  incorrectChars: number,
  elapsedMs: number,
  warmupMs = WPM_WARMUP_MS,
): number => wpm(finite(correctChars) + finite(incorrectChars), elapsedMs, warmupMs);

export const clampWpm = (v: number): number => Math.max(0, Math.min(MAX_WPM, finite(v)));

/**
 * Accuracy, rounded to one decimal.
 * Deliberately **0** when nothing was typed: a run with no input has not earned 100%.
 */
export const accuracy = (correctChars: number, incorrectChars: number): number => {
  const c = Math.max(0, finite(correctChars));
  const total = c + Math.max(0, finite(incorrectChars));
  if (total <= 0) return 0;
  return round1((c / total) * 100);
};

/** Combo → multiplier. The single source of truth for the tier rule. */
export const multFrom = (combo: number): number =>
  Math.max(1, Math.min(COMBO.maxMult, 1 + Math.floor(Math.max(0, finite(combo)) / COMBO.step)));

/** How far into the current multiplier tier (0..1) — used by the HUD pips. */
export const tierProgress = (combo: number): number => {
  const c = Math.max(0, finite(combo));
  if (multFrom(c) >= COMBO.maxMult) return 1;
  return (c % COMBO.step) / COMBO.step;
};

/** Distance travelled as a fraction of one lap. */
export const progressOf = (distanceChars: number, lapChars: number): number => {
  const lap = Math.max(1, finite(lapChars));
  return Math.max(0, finite(distanceChars) / lap);
};

export const lapsOf = (distanceChars: number, lapChars: number): number =>
  1 + Math.floor(progressOf(distanceChars, lapChars));

/**
 * `1ST / 2ND / 3RD`. Place 0 (no rivals, or a DNF) renders as a dash.
 *
 * The suffix is keyed on the last digit with the teens excused — a lookup indexed by the
 * raw place used to be right up to 19th and then print "21TH". The HUD reads the position
 * and the results board reads the record, so both now call this one function.
 */
export const ordinalSuffix = (place: number): string => {
  const p = Math.max(0, Math.round(finite(place)));
  if (p % 100 >= 11 && p % 100 <= 13) return "TH";
  return ["TH", "ST", "ND", "RD"][p % 10] ?? "TH";
};

export const placeLabel = (place: number): string => {
  const p = Math.max(0, Math.round(finite(place)));
  return p <= 0 ? "—" : `${p}${ordinalSuffix(p)}`;
};

export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(finite(ms) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
};

export const formatClock = (msRemaining: number): string => {
  const left = Math.max(0, finite(msRemaining));
  return left < 10_000 ? (left / 1000).toFixed(1) : String(Math.ceil(left / 1000));
};

export const formatNumber = (n: number): string => finite(n).toLocaleString();

export const formatPercent = (pct: number): string => {
  const v = finite(pct);
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`;
};
