export type Mode = "sprint" | "time" | "overdrive" | "zen";
export type Difficulty = "easy" | "medium" | "hard" | "code";

export interface ModeDef {
  id: Mode;
  name: string;
  tag: string;
  blurb: string;
  accent: string;
  words: number;
  seconds?: number;
  rivals: boolean;
  energy?: boolean;
}

export const MODES: ModeDef[] = [
  {
    id: "sprint",
    name: "SPRINT 25",
    tag: "PURE SPEED",
    blurb: "25 words. Two rivals. No mercy — post your fastest lap ever.",
    accent: "#ffb020",
    words: 25,
    rivals: true,
  },
  {
    id: "time",
    name: "TIME ATTACK",
    tag: "60 SECONDS",
    blurb: "One minute on the clock. Bank as much distance and score as you can.",
    accent: "#4cc9ff",
    words: 45,
    seconds: 60,
    rivals: true,
  },
  {
    id: "overdrive",
    name: "OVERDRIVE",
    tag: "SURVIVAL",
    blurb: "Boost tanks drain fast. Clean typing refuels them, typos torch them.",
    accent: "#ff5a7a",
    words: 30,
    rivals: true,
    energy: true,
  },
  {
    id: "zen",
    name: "ZEN LANE",
    tag: "PRACTICE",
    blurb: "No timer, no rivals. Finger guide on, long stretch of steady typing.",
    accent: "#35e0a1",
    words: 50,
    rivals: false,
  },
];

export const DIFFICULTIES: {
  id: Difficulty;
  name: string;
  hint: string;
  rivalWpm: [number, number];
}[] = [
  { id: "easy", name: "ROOKIE", hint: "short common words", rivalWpm: [24, 34] },
  { id: "medium", name: "RACER", hint: "everyday vocabulary", rivalWpm: [38, 50] },
  { id: "hard", name: "VETERAN", hint: "long + tricky words", rivalWpm: [52, 68] },
  { id: "code", name: "SYNTAX", hint: "code & punctuation", rivalWpm: [40, 56] },
];

export interface RivalState {
  name: string;
  color: string;
  wpm: number;
  base: number;
  drift: number;
  dist: number; // characters typed
  progress: number; // 0..1
  finished: boolean;
  finishAt: number;
}

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
  words: number;
  perfectWords: number;
  maxCombo: number;
  place: number;
  durationMs: number;
  finished: boolean;
  newBadge: string | null;
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

export interface Stats {
  runs: RunRecord[];
  totals: Totals;
  keyMisses: Record<string, number>;
  best: Record<Mode, { wpm: number; score: number; accuracy: number } | null>;
  badges: string[];
}
