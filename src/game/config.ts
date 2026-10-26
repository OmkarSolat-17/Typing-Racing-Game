/**
 * Every tunable number in the game, in one place.
 *
 * Rule of thumb for this file: if a value changes how a race *plays*, it belongs here —
 * not inside a hook, a component, or a CSS class.
 */
import type { Difficulty, DifficultyDef, Mode, ModeDef, Settings } from "./types";

export const PALETTE = {
  ink: "#080b18",
  inkDeep: "#05070f",
  panel: "#141b34",
  line: "#2c3866",
  cream: "#f3efe4",
  mute: "#8b96c4",
  amber: "#ffb020",
  coral: "#ff5a7a",
  mint: "#35e0a1",
  sky: "#4cc9ff",
  grape: "#a78bfa",
} as const;

/** Shorthand for the accents the game hands to canvas/SVG APIs (they need literals, not classes). */
export const ACCENT = {
  sprint: PALETTE.amber,
  time: PALETTE.sky,
  overdrive: PALETTE.coral,
  zen: PALETTE.mint,
} as const;

/**
 * Declared as a fixed-size tuple because `getMode`/`getDifficulty` fall back to `MODES[0]` and
 * `DIFFICULTIES[1]`. Under `noUncheckedIndexedAccess` an array type would make those fallbacks
 * `undefined`, so the shape of the table is stated in the type instead of asserted at each use.
 */
export const MODES: [ModeDef, ModeDef, ModeDef, ModeDef] = [
  {
    id: "sprint",
    name: "SPRINT 25",
    tag: "PURE SPEED",
    blurb: "25 words. Two rivals. No mercy — post your fastest lap ever.",
    accent: ACCENT.sprint,
    words: 25,
    seconds: null,
    rivals: true,
    energy: false,
    lapFraction: 1,
  },
  {
    id: "time",
    name: "TIME ATTACK",
    tag: "60 SECONDS",
    blurb: "One minute on the clock. Bank as much distance and score as you can.",
    accent: ACCENT.time,
    words: 45,
    seconds: 60,
    rivals: true,
    energy: false,
    // The clock, not the track, decides the result — so the bar is one lap.
    lapFraction: 0.34,
  },
  {
    id: "overdrive",
    name: "OVERDRIVE",
    tag: "SURVIVAL",
    blurb: "Boost tanks drain fast. Clean typing refuels them, typos torch them.",
    accent: ACCENT.overdrive,
    words: 30,
    seconds: null,
    rivals: true,
    energy: true,
    lapFraction: 1,
  },
  {
    id: "zen",
    name: "ZEN LANE",
    tag: "PRACTICE",
    blurb: "No timer, no rivals. Finger guide on, long stretch of steady typing.",
    accent: ACCENT.zen,
    words: 50,
    seconds: null,
    rivals: false,
    energy: false,
    lapFraction: 1,
  },
];

export const DIFFICULTIES: [DifficultyDef, DifficultyDef, DifficultyDef, DifficultyDef] = [
  { id: "easy", name: "ROOKIE", hint: "short common words", rivalWpm: [24, 34], trackFactor: 1.35, drain: 4.2 },
  { id: "medium", name: "RACER", hint: "everyday vocabulary", rivalWpm: [38, 50], trackFactor: 1, drain: 5.4 },
  { id: "hard", name: "VETERAN", hint: "long + tricky words", rivalWpm: [52, 68], trackFactor: 0.75, drain: 6.6 },
  { id: "code", name: "SYNTAX", hint: "code & punctuation", rivalWpm: [40, 56], trackFactor: 0.8, drain: 6 },
];

const modeIndex = new Map<string, ModeDef>(MODES.map((m) => [m.id, m]));
const difficultyIndex = new Map<string, DifficultyDef>(DIFFICULTIES.map((d) => [d.id, d]));

/**
 * Total lookups. Persisted data (`mode`, `difficulty`) crosses a trust boundary, so
 * nothing may assume it resolves — a bad id must degrade, not white-screen.
 */
export const lookupMode = (id: unknown): ModeDef | undefined =>
  typeof id === "string" ? modeIndex.get(id) : undefined;

export const lookupDifficulty = (id: unknown): DifficultyDef | undefined =>
  typeof id === "string" ? difficultyIndex.get(id) : undefined;

export const getMode = (id: Mode): ModeDef => lookupMode(id) ?? MODES[0];
export const getDifficulty = (id: Difficulty): DifficultyDef => lookupDifficulty(id) ?? DIFFICULTIES[1];

/** Safe default for data we cannot trust. */
export const DEFAULT_MODE: Mode = "sprint";
export const DEFAULT_DIFFICULTY: Difficulty = "medium";

/* ---------------- race lifecycle timing ---------------- */

/** Ceiling on React re-renders while racing; input always publishes immediately. */
export const PUBLISH_INTERVAL_MS = 100;

export const COUNTDOWN = {
  /** Delay before each of 3 · 2 · 1. */
  stepMs: 520,
  /** Delay before "GO" (also when the clock starts). */
  goMs: 1560,
  from: 3,
} as const;

/** Below this, a WPM readout is noise from a partial sample. */
export const WPM_WARMUP_MS = 600;
/** Beyond human range; guards charts and stored records against runaway samples. */
export const MAX_WPM = 260;
/** A standard typing-test word. */
export const CHARS_PER_WORD = 5;

/* ---------------- overdrive ---------------- */

export const ENERGY = {
  /** You start the survival mode already behind — that is the point of it. */
  start: 58,
  max: 100,
  /** Per correct character / per completed word. */
  gainChar: 1.9,
  gainWord: 3,
  loseError: 7,
  lowAt: 22,
  warnEveryMs: 1600,
} as const;

/* ---------------- scoring ---------------- */

export const SCORE = {
  perChar: 10,
  perWord: 50,
  perWordLength: 10,
  perfectBonus: 25,
  errorPenalty: 15,
  skipPenalty: 40,
  placeBonus: [1500, 800, 400, 150] as const,
  /** Per remaining second (timed modes) and per leftover boost point. */
  timeBonus: 25,
  energyBonus: 12,
} as const;

/** combo words needed per multiplier tier, and the ceiling. */
export const COMBO = { step: 4, maxMult: 5 } as const;

/* ---------------- rivals ---------------- */

export const RIVALS = {
  count: 2,
  /** Below this share of the track, a rival has no finishing kick. */
  kickAtProgress: 0.82,
  kick: 1.12,
  /** Deliberately uneven so nobody ever sees a `0 wpm` rival. */
  minWpmFloor: 8,
} as const;

export const RIVAL_NAMES: { name: string; color: string }[] = [
  { name: "VYPER", color: PALETTE.coral },
  { name: "GLITCH", color: PALETTE.grape },
  { name: "NOVA", color: PALETTE.sky },
  { name: "TURBO", color: PALETTE.mint },
];

/** Placed last so `RIVAL_NAMES` colours stay distinguishable from the YOU lane. */
export const RIVAL_COLOR_FALLBACK = PALETTE.grape;

/* ---------------- records & persistence ---------------- */

export const SERIES = {
  sampleEveryMs: 450,
  /** Retained in the live graph. */
  liveMax: 240,
  /** Retained per stored record (localStorage is ~5 MB and synchronous). */
  storedMax: 120,
};

/** Detail window for run history. Career *totals* are never truncated. */
export const RUN_HISTORY_LIMIT = 60;
/** A record this short is a stray keypress, not a race. */
export const MIN_VALID_CHARS = 8;

export const STATS_KEY = "keyrush.stats.v3";
export const SET_KEY = "keyrush.settings.v3";
/** Read once, then deleted, so a downgrade can never resurrect it. */
export const LEGACY_STATS_KEYS = ["keyrush.stats.v2"] as const;
export const LEGACY_SET_KEYS = ["keyrush.settings.v2"] as const;

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  fingerGuide: true,
  difficulty: DEFAULT_DIFFICULTY,
  screenShake: true,
  showKeyboard: false,
};

/** UI hand-off delays, kept together so the exit choreography is tunable in one place. */
export const HANDOFF = {
  resultDelayMs: 1250,
  bannerMs: 1050,
  keyFlashMs: 130,
  touchFlashMs: 110,
  demoTakeoverMs: 3200,
  demoTickMs: 105,
} as const;

export const TIPS = [
  "HOME ROW IS HOME BASE · ASDF JKL;",
  "EYES ON THE SCREEN, NOT THE KEYS",
  "SLOW IS SMOOTH · SMOOTH IS FAST",
  "FOUR FLAWLESS WORDS = COMBO x2",
  "TAB SKIPS A WORD YOU CAN'T SPELL",
  "ZEN LANE HAS NO TIMER — LEARN NEW KEYS THERE",
  "OVERDRIVE: EVERY CLEAN LETTER REFUELS YOU",
  "BACKSPACE ERASES POINTS TOO — NO FREE WORDS",
];
