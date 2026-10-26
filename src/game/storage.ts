/**
 * The persistence boundary.
 *
 * Everything that comes back out of `localStorage` is **untrusted input**: another tab,
 * a browser extension, a future schema change or a hand-edit can put anything in it. So
 * nothing is cast here — every field is validated and repaired, unusable records are
 * dropped rather than propagated (a single bad run used to white-screen the career
 * screen forever), an unreadable payload is quarantined instead of re-served on every
 * boot, and a failed write is reported to the UI instead of swallowed.
 */
import {
  DEFAULT_SETTINGS,
  LEGACY_SET_KEYS,
  LEGACY_STATS_KEYS,
  RUN_HISTORY_LIMIT,
  SET_KEY,
  STATS_KEY,
  lookupDifficulty,
  lookupMode,
} from "./config";
import { emptyStats, emptyTotals } from "./career";
import type { EndReason, Mode, RunRecord, Settings, Stats } from "./types";

export type IssueKind = "corrupt" | "partial" | "unavailable" | "quota";

export interface StorageIssue {
  kind: IssueKind;
  message: string;
}

export interface LoadResult<T> {
  value: T;
  issues: StorageIssue[];
  /** False when storage exists but could not be read at all. */
  available: boolean;
}

export interface SaveResult {
  ok: boolean;
  issues: StorageIssue[];
}

const END_REASONS: readonly EndReason[] = ["track", "clock", "crash", "abandon"] as const;
/** Ceiling for a stored WPM sample; anything above this is a corrupted number, not a race. */
const MAX_SERIES_VALUE = 500;

const store = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Safari with cookies blocked throws on the *getter*, not just on read.
    return null;
  }
};

const readRaw = (key: string): { raw: string | null; issue?: StorageIssue } => {
  const db = store();
  if (!db)
    return {
      raw: null,
      issue: { kind: "unavailable", message: "Local storage is unavailable in this browser session." },
    };
  try {
    return { raw: db.getItem(key) };
  } catch (e) {
    return { raw: null, issue: { kind: "unavailable", message: `Could not read saved data (${describe(e)}).` } };
  }
};

const describe = (e: unknown): string => (e instanceof Error ? e.name : typeof e === "string" ? e : "unknown error");

/** Move an unreadable payload aside so the next boot starts clean, and keep it for recovery. */
const quarantine = (key: string): boolean => {
  const db = store();
  if (!db) return false;
  try {
    const raw = db.getItem(key);
    if (raw === null) return false;
    db.setItem(`${key}.corrupt`, raw);
    db.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const writeRaw = (key: string, value: string): StorageIssue | null => {
  const db = store();
  if (!db) return { kind: "unavailable", message: "Local storage is unavailable — this session will not be saved." };
  try {
    db.setItem(key, value);
    return null;
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
    return {
      kind: quota ? "quota" : "unavailable",
      message: quota
        ? "Saved data is full — older races will not be recorded until you wipe the garage."
        : `Saving failed (${describe(e)}) — this race exists only in this tab.`,
    };
  }
};

/* ------------------------------------------------------------------ validators */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const numOf = (v: unknown, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const boolOf = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

/**
 * A stored pace series. Values are clamped into the legal WPM band, because this array is
 * what the charts scale against — one `1e9` sample used to flatten every other point to zero.
 */
const intArrayOf = (v: unknown, maxLen: number, cap = MAX_SERIES_VALUE): number[] =>
  Array.isArray(v)
    ? v
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0)
        .slice(0, maxLen)
        .map((n) => Math.min(cap, Math.round(n)))
    : [];

const countMapOf = (v: unknown): Record<string, number> => {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) {
    if (typeof k === "string" && k.length <= 4 && typeof n === "number" && Number.isFinite(n) && n > 0) {
      out[k] = Math.min(1_000_000, Math.round(n));
    }
  }
  return out;
};

/**
 * One stored run. Returns `null` for anything that cannot be trusted: the callers drop it
 * rather than rendering a half-object (which is what used to crash the career screen).
 */
function parseRun(input: unknown): RunRecord | null {
  if (!isRecord(input)) return null;
  const mode = lookupMode(input.mode)?.id;
  const difficulty = lookupDifficulty(input.difficulty)?.id;
  if (!mode || !difficulty) return null;

  const correctChars = Math.floor(numOf(input.correctChars));
  const incorrectChars = Math.floor(numOf(input.incorrectChars));
  if (correctChars + incorrectChars <= 0) return null;

  const endReason = (END_REASONS as readonly string[]).includes(String(input.endReason))
    ? (input.endReason as EndReason)
    : // pre-v3 records only carried a boolean; map it onto the new vocabulary
      boolOf(input.finished, false)
      ? "track"
      : "abandon";
  const finished = endReason === "track" || endReason === "clock";
  const skips = Math.floor(numOf(input.skips));
  const accuracy = numOf(input.accuracy, 0, 0, 100);
  const wpmValue = Math.floor(numOf(input.wpm, 0, 0, 500));
  const date = Math.floor(numOf(input.date, 0, 1));
  if (date <= 0) return null;

  return {
    id:
      typeof input.id === "string" && input.id.length > 0 && input.id.length <= 64
        ? input.id
        : `${date.toString(36)}-restored`,
    mode,
    difficulty,
    wpm: wpmValue,
    rawWpm: Math.floor(numOf(input.rawWpm, wpmValue, 0, 500)),
    accuracy: Math.round(accuracy * 10) / 10,
    score: Math.floor(numOf(input.score, 0, 0, 10_000_000)),
    correctChars,
    incorrectChars,
    words: Math.floor(numOf(input.words, 0, 0, 100_000)),
    skips,
    perfectWords: Math.floor(numOf(input.perfectWords, 0, 0, 100_000)),
    maxCombo: Math.floor(numOf(input.maxCombo, 0, 0, 100_000)),
    place: Math.floor(numOf(input.place, 0, 0, 9)),
    field: Math.floor(numOf(input.field, finished ? 3 : 0, 0, 9)),
    durationMs: Math.floor(numOf(input.durationMs, 0, 0, 1000 * 60 * 60 * 6)),
    endReason,
    finished,
    valid: boolOf(input.valid, finished && skips === 0 && correctChars > 0),
    date,
    series: intArrayOf(input.series, 240),
    keyMisses: countMapOf(input.keyMisses),
  };
}

function parseStats(input: unknown): { stats: Stats; dropped: number } {
  const base = emptyStats();
  if (!isRecord(input)) return { stats: base, dropped: 0 };

  const rawRuns = Array.isArray(input.runs) ? input.runs : [];
  const runs: RunRecord[] = [];
  let dropped = 0;
  for (const r of rawRuns) {
    const parsed = parseRun(r);
    if (parsed) runs.push(parsed);
    else dropped++;
  }

  const totalsInput = isRecord(input.totals) ? input.totals : {};
  const t = emptyTotals();
  const totals = {
    races: Math.floor(numOf(totalsInput.races, runs.length)),
    finishedRaces: Math.floor(numOf(totalsInput.finishedRaces, runs.filter((r) => r.finished).length)),
    keystrokes: Math.floor(numOf(totalsInput.keystrokes, t.keystrokes)),
    correctChars: Math.floor(numOf(totalsInput.correctChars, t.correctChars)),
    incorrectChars: Math.floor(numOf(totalsInput.incorrectChars, t.incorrectChars)),
    words: Math.floor(numOf(totalsInput.words, t.words)),
    perfectWords: Math.floor(numOf(totalsInput.perfectWords, t.perfectWords)),
    ms: Math.floor(numOf(totalsInput.ms, t.ms)),
    bestWpm: Math.floor(numOf(totalsInput.bestWpm, t.bestWpm, 0, 500)),
    bestScore: Math.floor(numOf(totalsInput.bestScore, t.bestScore)),
    maxCombo: Math.floor(numOf(totalsInput.maxCombo, t.maxCombo)),
    nightRuns: Math.floor(numOf(totalsInput.nightRuns, t.nightRuns)),
    firstPlaces: Math.floor(numOf(totalsInput.firstPlaces, t.firstPlaces)),
  };

  const bestInput = isRecord(input.best) ? input.best : {};
  const best = { ...base.best };
  for (const key of Object.keys(best) as Mode[]) {
    const b = bestInput[key];
    if (isRecord(b)) {
      best[key] = {
        wpm: Math.floor(numOf(b.wpm, 0, 0, 500)),
        score: Math.floor(numOf(b.score, 0)),
        accuracy: numOf(b.accuracy, 0, 0, 100),
      };
    }
  }

  const badges = Array.isArray(input.badges)
    ? [...new Set(input.badges.filter((b): b is string => typeof b === "string" && b.length <= 48))].slice(0, 64)
    : [];

  return {
    stats: {
      runs: runs.slice(0, RUN_HISTORY_LIMIT),
      totals: { ...totals, races: Math.max(totals.races, runs.length) },
      keyMisses: countMapOf(input.keyMisses),
      best,
      badges,
    },
    dropped,
  };
}

function parseSettings(input: unknown): Settings {
  const fallback = { ...DEFAULT_SETTINGS, showKeyboard: prefersCoarsePointer() };
  if (!isRecord(input)) return fallback;
  return {
    sound: boolOf(input.sound, fallback.sound),
    fingerGuide: boolOf(input.fingerGuide, fallback.fingerGuide),
    difficulty: lookupDifficulty(input.difficulty)?.id ?? fallback.difficulty,
    screenShake: boolOf(input.screenShake, fallback.screenShake),
    showKeyboard: boolOf(input.showKeyboard, fallback.showKeyboard),
  };
}

export const prefersCoarsePointer = (): boolean => {
  try {
    if (typeof window === "undefined") return false;
    return Boolean(window.matchMedia?.("(pointer: coarse)").matches) || "ontouchstart" in window;
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ public API */

/** Load career stats, repairing or discarding anything that fails validation. */
export function loadStats(): LoadResult<Stats> {
  for (const key of [STATS_KEY, ...LEGACY_STATS_KEYS]) {
    const { raw, issue } = readRaw(key);
    if (issue) return { value: emptyStats(), issues: [issue], available: false };
    if (raw === null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const moved = quarantine(key);
      return {
        value: emptyStats(),
        issues: [
          {
            kind: "corrupt",
            message: moved
              ? "Saved progress could not be read and was set aside so the game could start. It is still recoverable from this browser's storage."
              : "Saved progress could not be read, so it was reset.",
          },
        ],
        available: true,
      };
    }
    const { stats, dropped } = parseStats(parsed);
    // One-time migration: adopt the legacy payload, then drop it so a downgrade can't revive it.
    if (key !== STATS_KEY) {
      writeRaw(STATS_KEY, raw);
      try {
        store()?.removeItem(key);
      } catch {
        /* best effort */
      }
    }
    return {
      value: stats,
      issues:
        dropped > 0
          ? [
              {
                kind: "partial",
                message: `${dropped} saved ${dropped === 1 ? "race" : "races"} could not be read and were skipped.`,
              },
            ]
          : [],
      available: true,
    };
  }
  return { value: emptyStats(), issues: [], available: true };
}

export function saveStats(stats: Stats): SaveResult {
  const issue = writeRaw(STATS_KEY, JSON.stringify(stats));
  return { ok: !issue, issues: issue ? [issue] : [] };
}

export function loadSettings(): LoadResult<Settings> {
  for (const key of [SET_KEY, ...LEGACY_SET_KEYS]) {
    const { raw, issue } = readRaw(key);
    if (issue)
      return {
        value: { ...DEFAULT_SETTINGS, showKeyboard: prefersCoarsePointer() },
        issues: [issue],
        available: false,
      };
    if (raw === null) continue;
    try {
      const value = parseSettings(JSON.parse(raw));
      if (key !== SET_KEY) {
        writeRaw(SET_KEY, JSON.stringify(value));
        try {
          store()?.removeItem(key);
        } catch {
          /* best effort */
        }
      }
      return { value, issues: [], available: true };
    } catch {
      quarantine(key);
      return {
        value: { ...DEFAULT_SETTINGS, showKeyboard: prefersCoarsePointer() },
        issues: [{ kind: "corrupt", message: "Saved settings were unreadable, so defaults were restored." }],
        available: true,
      };
    }
  }
  return { value: { ...DEFAULT_SETTINGS, showKeyboard: prefersCoarsePointer() }, issues: [], available: true };
}

export function saveSettings(settings: Settings): SaveResult {
  const issue = writeRaw(SET_KEY, JSON.stringify(settings));
  return { ok: !issue, issues: issue ? [issue] : [] };
}

/** Used by the "wipe" action and by the error boundary's escape hatch. */
export function clearAll(): SaveResult {
  const issues: StorageIssue[] = [];
  const db = store();
  if (!db) return { ok: false, issues: [{ kind: "unavailable", message: "Local storage is unavailable." }] };
  for (const key of [STATS_KEY, SET_KEY, ...LEGACY_STATS_KEYS, ...LEGACY_SET_KEYS]) {
    try {
      db.removeItem(key);
    } catch (e) {
      issues.push({ kind: "unavailable", message: `Could not clear ${key} (${describe(e)}).` });
    }
  }
  try {
    for (let i = db.length - 1; i >= 0; i--) {
      const k = db.key(i);
      if (k && (k.startsWith("keyrush.") || k === `${STATS_KEY}.corrupt`)) db.removeItem(k);
    }
  } catch {
    /* ignore */
  }
  return { ok: issues.length === 0, issues };
}

/** Cross-tab coherence: another tab finished a race → re-read rather than clobber it. */
export function subscribeToStorage(onChange: (key: "stats" | "settings") => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === null) return; // explicit clear()
    if (e.key === STATS_KEY || LEGACY_STATS_KEYS.includes(e.key as (typeof LEGACY_STATS_KEYS)[number]))
      onChange("stats");
    else if (e.key === SET_KEY) onChange("settings");
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
