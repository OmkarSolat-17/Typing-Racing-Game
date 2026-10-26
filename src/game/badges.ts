/**
 * Achievements. Pure predicates over persisted stats, so they are testable and so the
 * unlock rules can never drift between the Results screen and the career screen.
 */
import { MODES } from "./config";
import type { Stats } from "./types";

export interface Badge {
  id: string;
  name: string;
  desc: string;
  color: string;
  test: (s: Stats) => boolean;
}

/** A race that counts: completed, with real keystrokes behind it. */
const real = (r: Stats["runs"][number]) => r.finished && r.valid;

export const BADGES: Badge[] = [
  { id: "first-lap", name: "First Lap", desc: "Finish a race", color: "#4cc9ff", test: (s) => s.runs.some(real) },
  { id: "wpm30", name: "Cruising", desc: "Reach 30 WPM", color: "#35e0a1", test: (s) => s.totals.bestWpm >= 30 },
  { id: "wpm50", name: "Speed Demon", desc: "Reach 50 WPM", color: "#ffb020", test: (s) => s.totals.bestWpm >= 50 },
  { id: "wpm70", name: "Velocity", desc: "Reach 70 WPM", color: "#ff5a7a", test: (s) => s.totals.bestWpm >= 70 },
  { id: "wpm90", name: "Lightspeed", desc: "Reach 90 WPM", color: "#a78bfa", test: (s) => s.totals.bestWpm >= 90 },
  {
    id: "combo10",
    name: "Combo Kid",
    desc: "10-word flawless streak",
    color: "#ffb020",
    test: (s) => s.totals.maxCombo >= 10,
  },
  {
    id: "combo25",
    name: "Untouchable",
    desc: "25-word flawless streak",
    color: "#ff5a7a",
    test: (s) => s.totals.maxCombo >= 25,
  },
  {
    id: "mult5",
    name: "Redline",
    desc: "Hold the x5 multiplier",
    color: "#ff5a7a",
    test: (s) => s.totals.maxCombo >= 16,
  },
  {
    id: "perfect",
    name: "Clean Sheet",
    desc: "Finish a race at 100% accuracy, no skips",
    color: "#35e0a1",
    test: (s) => s.runs.some((r) => real(r) && r.accuracy === 100 && r.correctChars > 0),
  },
  {
    id: "gold5",
    name: "Podium Regular",
    desc: "Win 5 races",
    color: "#ffb020",
    test: (s) => s.totals.firstPlaces >= 5,
  },
  { id: "words500", name: "Word Smith", desc: "Type 500 words", color: "#4cc9ff", test: (s) => s.totals.words >= 500 },
  {
    id: "words2000",
    name: "Lexicon Legend",
    desc: "Type 2000 words",
    color: "#a78bfa",
    test: (s) => s.totals.words >= 2000,
  },
  {
    id: "keys5k",
    name: "Key Smasher",
    desc: "5000 keystrokes",
    color: "#4cc9ff",
    test: (s) => s.totals.keystrokes >= 5000,
  },
  {
    id: "marathon",
    name: "Marathon",
    desc: "1 hour on the track",
    color: "#35e0a1",
    test: (s) => s.totals.ms >= 3_600_000,
  },
  {
    id: "runs20",
    name: "Regular Racer",
    desc: "20 races started",
    color: "#8b96c4",
    test: (s) => s.totals.races >= 20,
  },
  {
    id: "nightowl",
    name: "Night Owl",
    desc: "Race after midnight",
    color: "#a78bfa",
    test: (s) => s.totals.nightRuns >= 1,
  },
  {
    id: "syntax",
    name: "Syntax Surgeon",
    desc: "Finish a SYNTAX race",
    color: "#4cc9ff",
    test: (s) => s.runs.some((r) => real(r) && r.difficulty === "code"),
  },
  {
    id: "veteran",
    name: "Iron Fingers",
    desc: "Finish a VETERAN race",
    color: "#ff5a7a",
    test: (s) => s.runs.some((r) => real(r) && r.difficulty === "hard"),
  },
  {
    id: "boost-master",
    name: "Boost Master",
    desc: "Win an OVERDRIVE race",
    color: "#ff5a7a",
    test: (s) => s.runs.some((r) => real(r) && r.mode === "overdrive" && r.place === 1),
  },
  {
    id: "allmodes",
    name: "Full Grid",
    desc: "Finish every game mode",
    color: "#ffb020",
    test: (s) => MODES.every((m) => s.runs.some((r) => real(r) && r.mode === m.id)),
  },
];

const byId = new Map<string, Badge>(BADGES.map((b) => [b.id, b]));

/** Never render a raw badge id: `BADGES` owns the name, description and colour. */
export const badgeById = (id: string): Badge | undefined => byId.get(id);

export const badgeName = (id: string): string => badgeById(id)?.name ?? "Unknown Badge";

/** Badges earned by `next` that `prev` did not already have. */
export function newBadgesFor(prev: Stats, next: Stats): string[] {
  const had = new Set(prev.badges);
  return BADGES.filter((b) => !had.has(b.id) && b.test(next)).map((b) => b.id);
}
