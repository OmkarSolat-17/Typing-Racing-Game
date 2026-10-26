/**
 * Career arithmetic: folding a finished run into lifetime totals.
 *
 * Kept separate from `storage.ts` (which only knows how to read and write bytes) and from
 * `rules.ts` (which only knows how a race plays).
 */
import { RUN_HISTORY_LIMIT } from "./config";
import { newBadgesFor } from "./badges";
import { isNightHour } from "./clock";
import type { Mode, RunRecord, Stats, Totals } from "./types";

export const emptyTotals = (): Totals => ({
  races: 0,
  finishedRaces: 0,
  keystrokes: 0,
  correctChars: 0,
  incorrectChars: 0,
  words: 0,
  perfectWords: 0,
  ms: 0,
  bestWpm: 0,
  bestScore: 0,
  maxCombo: 0,
  nightRuns: 0,
  firstPlaces: 0,
});

export const emptyStats = (): Stats => ({
  runs: [],
  totals: emptyTotals(),
  keyMisses: {},
  best: { sprint: null, time: null, overdrive: null, zen: null },
  badges: [],
});

const sum = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const n = Number.isFinite(v) ? v : 0;
    if (n > 0) out[k] = (out[k] ?? 0) + n;
  }
  return out;
};

/**
 * Fold one run into the career.
 *
 * `totals.races` counts every recorded run so the career screen can never under-report
 * after the *detail* window (`RUN_HISTORY_LIMIT`) starts truncating.
 */
export function recordRun(prev: Stats, run: RunRecord): { stats: Stats; newBadges: string[] } {
  const totals: Totals = {
    races: prev.totals.races + 1,
    finishedRaces: prev.totals.finishedRaces + (run.finished ? 1 : 0),
    keystrokes: prev.totals.keystrokes + run.correctChars + run.incorrectChars,
    correctChars: prev.totals.correctChars + run.correctChars,
    incorrectChars: prev.totals.incorrectChars + run.incorrectChars,
    words: prev.totals.words + Math.max(0, run.words),
    perfectWords: prev.totals.perfectWords + Math.max(0, run.perfectWords),
    ms: prev.totals.ms + Math.max(0, run.durationMs),
    bestWpm: Math.max(prev.totals.bestWpm, run.valid ? run.wpm : 0),
    bestScore: Math.max(prev.totals.bestScore, run.valid ? run.score : 0),
    maxCombo: Math.max(prev.totals.maxCombo, run.maxCombo),
    nightRuns: prev.totals.nightRuns + (isNightHour(run.date) ? 1 : 0),
    firstPlaces: prev.totals.firstPlaces + (run.finished && run.valid && run.place === 1 ? 1 : 0),
  };

  const best = { ...prev.best };
  if (run.valid) {
    const cur = best[run.mode];
    if (!cur || run.wpm > cur.wpm || (run.wpm === cur.wpm && run.score > cur.score)) {
      best[run.mode] = { wpm: run.wpm, score: run.score, accuracy: run.accuracy };
    }
  }

  const stats: Stats = {
    runs: [run, ...prev.runs].slice(0, RUN_HISTORY_LIMIT),
    totals,
    keyMisses: sum(prev.keyMisses, run.keyMisses),
    best,
    badges: prev.badges,
  };

  const newBadges = newBadgesFor(prev, stats);
  if (newBadges.length > 0) stats.badges = [...prev.badges, ...newBadges];

  return { stats, newBadges };
}

/** Top runs for a mode (or across all modes). Only eligible runs are ranked. */
export function leaderboard(stats: Stats, mode?: Mode, limit = 5): RunRecord[] {
  const pool = stats.runs.filter((r) => r.valid && (!mode || r.mode === mode));
  return pool
    .slice()
    .sort((a, b) => b.score - a.score || b.wpm - a.wpm || b.date - a.date)
    .slice(0, limit);
}
