import type { Mode, RunRecord, Settings, Stats, Totals } from "./types";
import { MODES } from "./types";

const STATS_KEY = "keyrush.stats.v2";
const SET_KEY = "keyrush.settings.v2";

export const emptyTotals = (): Totals => ({
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

export function loadStats(): Stats {
  if (typeof localStorage === "undefined") return emptyStats();
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return emptyStats();
    const p = JSON.parse(raw) as Stats;
    return {
      runs: Array.isArray(p.runs) ? p.runs : [],
      totals: { ...emptyTotals(), ...(p.totals || {}) },
      keyMisses: p.keyMisses || {},
      best: { ...emptyStats().best, ...(p.best || {}) },
      badges: Array.isArray(p.badges) ? p.badges : [],
    };
  } catch {
    return emptyStats();
  }
}

export function saveStats(s: Stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

export function loadSettings(): Settings {
  const coarse =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window
      : false;
  const def: Settings = {
    sound: true,
    fingerGuide: true,
    difficulty: "medium",
    screenShake: true,
    showKeyboard: coarse,
  };
  if (typeof localStorage === "undefined") return def;
  try {
    const raw = localStorage.getItem(SET_KEY);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SET_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function resetStats() {
  saveStats(emptyStats());
}

export interface Badge {
  id: string;
  name: string;
  desc: string;
  color: string;
  test: (s: Stats) => boolean;
}

export const BADGES: Badge[] = [
  { id: "first-lap", name: "First Lap", desc: "Finish a race", color: "#4cc9ff", test: (s) => s.runs.some((r) => r.finished) },
  { id: "wpm30", name: "Cruising", desc: "Reach 30 WPM", color: "#35e0a1", test: (s) => s.totals.bestWpm >= 30 },
  { id: "wpm50", name: "Speed Demon", desc: "Reach 50 WPM", color: "#ffb020", test: (s) => s.totals.bestWpm >= 50 },
  { id: "wpm70", name: "Velocity", desc: "Reach 70 WPM", color: "#ff5a7a", test: (s) => s.totals.bestWpm >= 70 },
  { id: "wpm90", name: "Lightspeed", desc: "Reach 90 WPM", color: "#a78bfa", test: (s) => s.totals.bestWpm >= 90 },
  { id: "combo10", name: "Combo Kid", desc: "10-word flawless streak", color: "#ffb020", test: (s) => s.totals.maxCombo >= 10 },
  { id: "combo25", name: "Untouchable", desc: "25-word flawless streak", color: "#ff5a7a", test: (s) => s.totals.maxCombo >= 25 },
  { id: "mult5", name: "Redline", desc: "Hit the x5 multiplier", color: "#ff5a7a", test: (s) => s.runs.some((r) => r.maxCombo >= 25) },
  { id: "perfect", name: "Clean Sheet", desc: "Finish a race at 100% accuracy", color: "#35e0a1", test: (s) => s.runs.some((r) => r.finished && r.accuracy >= 99.99) },
  { id: "gold5", name: "Podium Regular", desc: "Win 5 races", color: "#ffb020", test: (s) => s.totals.firstPlaces >= 5 },
  { id: "words500", name: "Word Smith", desc: "Type 500 words", color: "#4cc9ff", test: (s) => s.totals.words >= 500 },
  { id: "words2000", name: "Lexicon Legend", desc: "Type 2000 words", color: "#a78bfa", test: (s) => s.totals.words >= 2000 },
  { id: "keys5k", name: "Key Smasher", desc: "5000 keystrokes", color: "#4cc9ff", test: (s) => s.totals.keystrokes >= 5000 },
  { id: "marathon", name: "Marathon", desc: "1 hour on the track", color: "#35e0a1", test: (s) => s.totals.ms >= 3_600_000 },
  { id: "runs20", name: "Regular Racer", desc: "20 races started", color: "#8b96c4", test: (s) => s.runs.length >= 20 },
  { id: "nightowl", name: "Night Owl", desc: "Race after midnight", color: "#a78bfa", test: (s) => s.totals.nightRuns >= 1 },
  { id: "syntax", name: "Syntax Surgeon", desc: "Finish a SYNTAX race", color: "#4cc9ff", test: (s) => s.runs.some((r) => r.difficulty === "code" && r.finished) },
  { id: "veteran", name: "Iron Fingers", desc: "Finish a VETERAN race", color: "#ff5a7a", test: (s) => s.runs.some((r) => r.difficulty === "hard" && r.finished) },
  { id: "overdrive-win", name: "Boost Master", desc: "Win an OVERDRIVE race", color: "#ff5a7a", test: (s) => s.runs.some((r) => r.mode === "overdrive" && r.place === 1 && r.finished) },
  { id: "allmodes", name: "Full Grid", desc: "Finish every game mode", color: "#ffb020", test: (s) => MODES.every((m) => s.runs.some((r) => r.mode === m.id && r.finished)) },
];

/** Fold a finished run into persistent stats. Returns { stats, newBadges }. */
export function recordRun(prev: Stats, run: RunRecord): { stats: Stats; newBadges: string[] } {
  const totals: Totals = {
    keystrokes: prev.totals.keystrokes + run.correctChars + run.incorrectChars,
    correctChars: prev.totals.correctChars + run.correctChars,
    incorrectChars: prev.totals.incorrectChars + run.incorrectChars,
    words: prev.totals.words + run.words,
    perfectWords: prev.totals.perfectWords + run.perfectWords,
    ms: prev.totals.ms + run.durationMs,
    bestWpm: Math.max(prev.totals.bestWpm, run.finished ? run.wpm : 0),
    bestScore: Math.max(prev.totals.bestScore, run.score),
    maxCombo: Math.max(prev.totals.maxCombo, run.maxCombo),
    nightRuns: prev.totals.nightRuns + (new Date(run.date).getHours() < 5 ? 1 : 0),
    firstPlaces: prev.totals.firstPlaces + (run.place === 1 && run.finished ? 1 : 0),
  };

  const keyMisses = { ...prev.keyMisses };
  for (const [k, v] of Object.entries(run.keyMisses)) keyMisses[k] = (keyMisses[k] || 0) + v;

  const best = { ...prev.best };
  const cur = best[run.mode];
  if (run.finished && (!cur || run.wpm > cur.wpm || (run.wpm === cur.wpm && run.score > cur.score))) {
    best[run.mode] = { wpm: run.wpm, score: run.score, accuracy: run.accuracy };
  }

  const stats: Stats = {
    runs: [run, ...prev.runs].slice(0, 60),
    totals,
    keyMisses,
    best,
    badges: prev.badges,
  };

  const newBadges = BADGES.filter((b) => !stats.badges.includes(b.id) && b.test(stats)).map((b) => b.id);
  stats.badges = [...stats.badges, ...newBadges];

  return { stats, newBadges };
}

/** Top-5 leaderboard for a mode (falls back to all modes). */
export function leaderboard(stats: Stats, mode?: Mode): RunRecord[] {
  const pool = mode ? stats.runs.filter((r) => r.mode === mode) : stats.runs;
  return pool.filter((r) => r.finished).sort((a, b) => b.score - a.score).slice(0, 5);
}

export const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
};
