/**
 * KEYRUSH — shared domain types.
 *
 * This module is types-only on purpose: every tunable table lives in `config.ts`,
 * every rule lives in `rules.ts`, and every derived number lives in `metrics.ts`.
 */

export type Mode = "sprint" | "time" | "overdrive" | "zen";
export type Difficulty = "easy" | "medium" | "hard" | "code";

/** Explicit lifecycle of a race. The only legal moves are documented in `rules.ts`. */
export type Status = "idle" | "countdown" | "playing" | "paused" | "finished";

/** Why a run ended. `finished` is derived from this — never set independently. */
export type EndReason = "track" | "clock" | "crash" | "abandon";

export type Finger = "pinkyL" | "ringL" | "midL" | "idxL" | "idxR" | "midR" | "ringR" | "pinkyR" | "thumb" | "unknown";

export interface ModeDef {
  id: Mode;
  name: string;
  tag: string;
  blurb: string;
  accent: string;
  /** Baseline track size in words, before the difficulty's `trackFactor`. */
  words: number;
  /** Seconds on the clock. `null` = untimed. */
  seconds: number | null;
  rivals: boolean;
  /** Boost-tank survival rule. */
  energy: boolean;
  /** Fraction of the baseline track that counts as one "lap" for the progress bar. */
  lapFraction: number;
}

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  hint: string;
  /** Rival speed band, WPM. */
  rivalWpm: [number, number];
  /** Longer words → fewer of them, so every track is a comparable *duration*. */
  trackFactor: number;
  /** Boost-tank drain per second while playing. */
  drain: number;
}

export interface RivalState {
  name: string;
  color: string;
  /** Nominal speed for the whole race. */
  base: number;
  /** Instantaneous, sinusoidally modulated speed. */
  wpm: number;
  drift: number;
  phase: number;
  dist: number;
  progress: number;
  finished: boolean;
  finishAt: number;
}

/** One recorded run. Persisted (see `storage.ts`) — so it is validated on the way back in. */
export interface RunRecord {
  id: string;
  mode: Mode;
  difficulty: Difficulty;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  score: number;
  correctChars: number;
  incorrectChars: number;
  /** Words typed to completion (skips excluded). */
  words: number;
  /** Words passed without typing them. */
  skips: number;
  perfectWords: number;
  maxCombo: number;
  /** 1-based; 0 when the mode has no rivals or the run did not place. */
  place: number;
  /** Field size is 3 (you + 2 rivals). */
  field: number;
  durationMs: number;
  endReason: EndReason;
  /** A completed race. */
  finished: boolean;
  /** Eligible for `best`, badges and the leaderboard: real input, no skips. */
  valid: boolean;
  date: number;
  series: number[];
  keyMisses: Record<string, number>;
}

export interface Settings {
  sound: boolean;
  fingerGuide: boolean;
  difficulty: Difficulty;
  screenShake: boolean;
  showKeyboard: boolean;
}

export interface Totals {
  /** Every run ever recorded, including abandoned ones. */
  races: number;
  finishedRaces: number;
  keystrokes: number;
  correctChars: number;
  incorrectChars: number;
  words: number;
  perfectWords: number;
  ms: number;
  bestWpm: number;
  bestScore: number;
  maxCombo: number;
  nightRuns: number;
  firstPlaces: number;
}

export interface ModeBest {
  wpm: number;
  score: number;
  accuracy: number;
}

export interface Stats {
  runs: RunRecord[];
  totals: Totals;
  keyMisses: Record<string, number>;
  best: Record<Mode, ModeBest | null>;
  badges: string[];
}
