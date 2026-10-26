/**
 * The race rules. Pure: no React, no DOM, no `Date.now()` inside the maths.
 *
 * Everything a race *is* lives here — track construction, keystroke adjudication,
 * scoring, boost, rival simulation, end conditions, and the record that a run leaves
 * behind. Two invariants drive the design:
 *
 *  1. **Every credit is reversible.** A character that awards progress, score, combo or
 *     boost can be taken back by backspace, because the per-character credit is recorded
 *     on the state (`typedScores`) at the moment it is earned. (An untracked `backspace`
 *     used to make score/WPM/distance infinitely farmable on a single 4-letter word.)
 *  2. **A result is never implied.** `finished` and `valid` are derived from `endReason`
 *     plus what was actually typed, so walking off the track with TAB can no longer be a
 *     100%-accuracy victory.
 *
 * Functions mutate `RunState` in place (it is a per-race object owned by one hook and is
 * sampled at 10 Hz) and return the events a view layer should react to.
 */
import {
  COUNTDOWN,
  ENERGY,
  MIN_VALID_CHARS,
  RIVALS,
  RIVAL_NAMES,
  SCORE,
  SERIES,
  getDifficulty,
  getMode,
} from "./config";
import { uid } from "./clock";
import { accuracy, clampWpm, multFrom, progressOf, tierProgress, wpm } from "./metrics";
import { buildTrack, shuffle, trackChars } from "./words";
import type { Difficulty, EndReason, Mode, RivalState, RunRecord, Status } from "./types";

export type GameEvent =
  | { type: "countdown"; n: number }
  | { type: "go" }
  | { type: "key"; char: string; ok: boolean; combo: number }
  | { type: "word"; word: string; perfect: boolean; mult: number; idx: number; points: number }
  | { type: "skip"; word: string }
  | { type: "error"; char: string; expected: string }
  | { type: "overtake"; up: boolean; rival: string }
  | { type: "warn"; energy: number }
  | { type: "extend"; words: number }
  | { type: "paused" }
  | { type: "resumed" }
  | { type: "end"; reason: EndReason; result: RunRecord };

export interface Outcome {
  events: GameEvent[];
  /** Set when the rules ended the race. */
  ended: EndReason | null;
  /** True when the state changed and the view should re-publish. */
  dirty: boolean;
}

export interface RunState {
  status: Status;
  mode: Mode;
  difficulty: Difficulty;

  words: string[];
  /** Characters in the whole track. */
  totalChars: number;
  /** Denominator for the progress bar / car positions (one lap in timed modes). */
  lapChars: number;

  idx: number;
  typed: string;
  /** Score credited for each character of `typed` — replayed in reverse on backspace. */
  typedScores: number[];
  wordErrors: number;
  skips: number;
  /** Per-word flawless result, for the context lane's red/green history. */
  perfect: boolean[];

  correctChars: number;
  incorrectChars: number;
  dist: number;
  score: number;
  combo: number;
  maxCombo: number;
  mult: number;
  perfectWords: number;
  energy: number;

  startedAt: number;
  pausedAt: number;
  pausedTotal: number;
  elapsed: number;
  /** Milliseconds left, or `Infinity` for untimed modes. */
  timeLeft: number;
  countdown: number;

  rivals: RivalState[];
  place: number;
  lastWarnAt: number;
  lastSampleAt: number;
  series: number[];

  keyMisses: Record<string, number>;
  endReason: EndReason | null;
}

/** Live graph window in the snapshot: enough for the sparkline, small enough not to churn React. */
const LIVE_WINDOW = 60;
/** A frame longer than this is a stall (backgrounded tab), not slow typing. */
const MAX_FRAME_MS = 50;

const NOOP: Outcome = { events: [], ended: null, dirty: false };

const outcome = (
  events: GameEvent[] = [],
  ended: EndReason | null = null,
  dirty = events.length > 0 || ended !== null,
): Outcome => ({
  events,
  ended,
  dirty,
});

export function createRun(mode: Mode, difficulty: Difficulty): RunState {
  const def = getMode(mode);
  return {
    status: "idle",
    mode,
    difficulty,
    words: [],
    totalChars: 0,
    lapChars: 0,
    idx: 0,
    typed: "",
    typedScores: [],
    wordErrors: 0,
    perfect: [],
    skips: 0,
    correctChars: 0,
    incorrectChars: 0,
    dist: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    mult: 1,
    perfectWords: 0,
    energy: def.energy ? ENERGY.start : ENERGY.max,
    startedAt: 0,
    pausedAt: 0,
    pausedTotal: 0,
    elapsed: 0,
    timeLeft: def.seconds ? def.seconds * 1000 : Number.POSITIVE_INFINITY,
    countdown: COUNTDOWN.from,
    rivals: [],
    place: 1,
    lastWarnAt: 0,
    lastSampleAt: 0,
    series: [],
    keyMisses: {},
    endReason: null,
  };
}

/** Word count for a track: the mode's promise, scaled so every difficulty lasts about as long. */
export function trackSize(mode: Mode, difficulty: Difficulty): number {
  const def = getMode(mode);
  const cfg = getDifficulty(difficulty);
  return Math.max(8, Math.round(def.words * cfg.trackFactor));
}

/** Arm a fresh race: build the track and the rival grid, then hold on the countdown. */
export function prepareRun(
  state: RunState,
  mode: Mode,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): RunState {
  const fresh = createRun(mode, difficulty);
  const def = getMode(fresh.mode);
  const words = buildTrack(fresh.difficulty, trackSize(fresh.mode, fresh.difficulty), rng);
  fresh.words = words;
  fresh.totalChars = trackChars(words);
  fresh.lapChars = Math.max(1, Math.round(fresh.totalChars * def.lapFraction));
  fresh.status = "countdown";
  fresh.countdown = COUNTDOWN.from;
  fresh.rivals = def.rivals ? makeRivals(fresh.difficulty, RIVALS.count, rng) : [];
  Object.assign(state, fresh);
  return state;
}

export function beginPlaying(state: RunState, at: number): void {
  state.status = "playing";
  state.countdown = 0;
  state.startedAt = at;
  state.pausedAt = 0;
  state.pausedTotal = 0;
  state.elapsed = 0;
  state.lastSampleAt = 0;
}

export function setCountdown(state: RunState, n: number): void {
  state.countdown = n;
}

export function makeRivals(difficulty: Difficulty, count: number, rand: () => number = Math.random): RivalState[] {
  const cfg = getDifficulty(difficulty);
  const [lo, hi] = cfg.rivalWpm;
  const names = shuffle(RIVAL_NAMES, rand).slice(0, Math.min(count, RIVAL_NAMES.length));
  return names.map((n, i) => {
    // Spread the field across the band so you always have somebody to chase.
    const slot = (i + 0.35 + rand() * 0.3) / Math.max(1, count);
    const base = Math.max(RIVALS.minWpmFloor, lo + (hi - lo) * slot);
    return {
      name: n.name,
      color: n.color,
      base,
      wpm: base,
      drift: 0.06 + rand() * 0.09,
      phase: rand() * Math.PI * 2,
      dist: 0,
      progress: 0,
      finished: false,
      finishAt: 0,
    };
  });
}

const active = (s: RunState): boolean => s.status === "playing" && s.idx < s.words.length;

export const currentWord = (s: RunState): string => s.words[s.idx] ?? "";

/**
 * The pending slice of the current word.
 *
 * A physical key usually delivers one UTF-16 code unit, but IME commits and dead-key
 * sequences can hand over several characters at once — so the expected slice is as long as
 * what arrived instead of always one character, which keeps such input matchable instead of
 * permanently stuck on half a surrogate pair.
 */
export const expectedText = (s: RunState, incoming = 1): string => {
  const word = currentWord(s);
  const from = s.typed.length;
  if (from >= word.length) return "";
  return word.slice(from, from + Math.max(1, incoming));
};

export const expectedChar = (s: RunState): string => expectedText(s, 1);

/* ------------------------------------------------------------------ keystrokes */

export function keyDown(s: RunState, char: string): Outcome {
  if (!active(s) || char.length === 0) return NOOP;
  const def = getMode(s.mode);
  const word = currentWord(s);
  const expect = expectedText(s, char.length);
  const events: GameEvent[] = [];

  if (char === expect) {
    // One ledger entry per credited code unit, so backspace can refund exactly what it erases.
    const gain = SCORE.perChar * s.mult;
    s.typed += char;
    for (let i = 0; i < char.length; i++) s.typedScores.push(gain);
    s.correctChars += char.length;
    s.dist += char.length;
    s.score += gain * char.length;
    if (def.energy) s.energy = Math.min(ENERGY.max, s.energy + ENERGY.gainChar);
    events.push({ type: "key", char, ok: true, combo: s.combo });

    if (s.typed.length === word.length) {
      const perfect = s.wordErrors === 0;
      if (perfect) {
        s.combo += 1;
        s.perfectWords += 1;
        s.maxCombo = Math.max(s.maxCombo, s.combo);
      } else {
        s.combo = 0;
      }
      s.mult = multFrom(s.combo);
      const points = (SCORE.perWord + word.length * SCORE.perWordLength) * s.mult + (perfect ? SCORE.perfectBonus : 0);
      s.score += points;
      if (def.energy) s.energy = Math.min(ENERGY.max, s.energy + ENERGY.gainWord);

      const doneIdx = s.idx;
      s.idx += 1;
      s.typed = "";
      s.typedScores = [];
      s.wordErrors = 0;
      s.perfect[doneIdx] = perfect;
      events.push({ type: "word", word, perfect, mult: s.mult, idx: doneIdx, points });

      if (s.idx >= s.words.length) {
        // A timed race is bounded by its clock, not by the track: hand out more road
        // instead of ending the minute early and wasting the remaining seconds.
        if (def.seconds && s.timeLeft > 1000) {
          const extra = buildTrack(s.difficulty, trackSize(s.mode, s.difficulty));
          s.words = s.words.concat(extra);
          s.totalChars += trackChars(extra);
          events.push({ type: "extend", words: extra.length });
        } else {
          return { events, ended: "track", dirty: true };
        }
      }
    }
    return { events, ended: null, dirty: true };
  }

  s.incorrectChars += 1;
  s.wordErrors += 1;
  s.combo = 0;
  s.mult = 1;
  s.score = Math.max(0, s.score - SCORE.errorPenalty);
  if (def.energy) s.energy = Math.max(0, s.energy - ENERGY.loseError);
  if (expect) s.keyMisses[expect] = (s.keyMisses[expect] ?? 0) + 1;
  events.push({ type: "error", char, expected: expect });

  if (def.energy && s.energy <= 0) {
    return { events, ended: "crash", dirty: true };
  }
  return { events, ended: null, dirty: true };
}

/**
 * Rolls back the character's cost *and* its reward.
 * `wordErrors` is intentionally sticky: you cannot un-make a mistake by erasing the
 * characters around it, so the word stays "flawed" even once it is corrected.
 */
export function backspace(s: RunState): boolean {
  if (s.status !== "playing" || s.typed.length === 0) return false;
  s.typed = s.typed.slice(0, -1);
  const refunded = s.typedScores.pop() ?? 0;
  s.correctChars = Math.max(0, s.correctChars - 1);
  s.dist = Math.max(0, s.dist - 1);
  s.score = Math.max(0, s.score - refunded);
  return true;
}

export function skipWord(s: RunState): Outcome {
  if (s.status !== "playing" || s.idx >= s.words.length) return NOOP;
  const word = currentWord(s);
  s.idx += 1;
  s.typed = "";
  s.typedScores = [];
  s.wordErrors = 0;
  s.perfect[s.idx - 1] = false;
  s.skips += 1;
  s.combo = 0;
  s.mult = 1;
  s.score = Math.max(0, s.score - SCORE.skipPenalty);
  if (s.idx >= s.words.length) {
    const def = getMode(s.mode);
    if (!(def.seconds && s.timeLeft > 1000)) return { events: [{ type: "skip", word }], ended: "track", dirty: true };
  }
  return outcome([{ type: "skip", word }]);
}

/* ------------------------------------------------------------------ time */

/**
 * Pause/resume are clock-neutral: `pausedTotal` absorbs the gap, so the seconds you spent
 * in the menu (or with the tab hidden) are never charged against the race.
 */
export function pauseRun(s: RunState, at: number): boolean {
  if (s.status !== "playing") return false;
  s.status = "paused";
  s.pausedAt = at;
  return true;
}

export function resumeRun(s: RunState, at: number): boolean {
  if (s.status !== "paused") return false;
  s.status = "playing";
  s.pausedTotal += Math.max(0, at - s.pausedAt);
  s.pausedAt = 0;
  return true;
}

/**
 * One animation frame of simulation.
 *
 * `at` is a monotonic timestamp (see `clock.ts`). The wall clock drives your remaining
 * time, and `dtMs` — clamped at both ends by `frameDelta` — drives the rivals, so a
 * backgrounded tab can never push a rival through the track or drag one backwards.
 */
export function advance(s: RunState, at: number, dtMs: number): Outcome {
  if (s.status !== "playing") return NOOP;
  const def = getMode(s.mode);
  const cfg = getDifficulty(s.difficulty);
  const events: GameEvent[] = [];

  s.elapsed = Math.max(0, at - s.startedAt - s.pausedTotal);

  if (def.seconds) {
    s.timeLeft = Math.max(0, def.seconds * 1000 - s.elapsed);
    if (s.timeLeft <= 0) return { events, ended: "clock", dirty: true };
  }

  // Clamped at both ends: a throttled tab must not launch the field, and a
  // non-monotonic timestamp must not drive rivals backwards.
  const dt = Math.min(MAX_FRAME_MS, Math.max(0, dtMs)) / 1000;
  const t = s.elapsed / 1000;
  for (const r of s.rivals) {
    if (r.finished) continue;
    const kick = r.progress > RIVALS.kickAtProgress ? RIVALS.kick : 1;
    r.wpm = Math.max(0, r.base * (1 + Math.sin(t * (0.7 + r.drift * 6) + r.phase) * r.drift) * kick);
    r.dist += (r.wpm * 5 * dt) / 60;
    r.progress = Math.min(1.25, progressOf(r.dist, s.lapChars));
    if (r.progress >= 1) {
      r.finished = true;
      r.finishAt = s.elapsed;
    }
  }

  const ahead = s.rivals.filter((r) => r.dist > s.dist);
  const place = ahead.length + 1;
  if (place !== s.place) {
    events.push({ type: "overtake", up: place < s.place, rival: ahead[0]?.name ?? "" });
    s.place = place;
  }

  if (def.energy) {
    s.energy = Math.max(0, s.energy - cfg.drain * dt);
    if (s.energy <= ENERGY.lowAt && at - s.lastWarnAt > ENERGY.warnEveryMs) {
      s.lastWarnAt = at;
      events.push({ type: "warn", energy: s.energy });
    }
    if (s.energy <= 0) return { events, ended: "crash", dirty: true };
  }

  if (s.elapsed - s.lastSampleAt > SERIES.sampleEveryMs) {
    s.lastSampleAt = s.elapsed;
    s.series.push(wpm(s.dist, s.elapsed));
    if (s.series.length > SERIES.liveMax) s.series.splice(0, s.series.length - SERIES.liveMax);
  }

  return { events, ended: null, dirty: events.length > 0 };
}

/* ------------------------------------------------------------------ result */

export const finishedReason = (reason: EndReason): boolean => reason === "track" || reason === "clock";

/** Fold the run into a persisted record. Pure, so it can be tested without a race. */
export function toRecord(s: RunState, at: number): RunRecord {
  const def = getMode(s.mode);
  const reason: EndReason = s.endReason ?? "abandon";
  const finished = finishedReason(reason);
  const minutes = s.elapsed > 0 ? s.elapsed / 60000 : 0;
  const vpm = minutes > 0 ? s.dist / 5 / minutes : 0;
  const wpmValue = clampWpm(Math.round(vpm));
  const rawValue = clampWpm(Math.round((s.correctChars + s.incorrectChars) / 5 / (minutes || 1 / 60000)));
  const acc = accuracy(s.correctChars, s.incorrectChars);
  const field = def.rivals ? RIVALS.count + 1 : 0;
  const valid = finished && s.skips === 0 && s.correctChars >= MIN_VALID_CHARS;

  let score = s.score;
  // A finish is only worth its bonuses when the race was genuinely typed. Skipping to the
  // line used to collect the podium, accuracy and leftover-time bonuses for free.
  if (finished && valid) {
    score += SCORE.placeBonus[Math.min(SCORE.placeBonus.length - 1, Math.max(0, s.place - 1))] ?? 0;
    score += Math.round(acc * 10);
    if (def.seconds) score += Math.round((s.timeLeft / 1000) * SCORE.timeBonus);
    if (def.energy) score += Math.round(s.energy * SCORE.energyBonus);
  }

  return {
    id: uid(at),
    mode: s.mode,
    difficulty: s.difficulty,
    wpm: wpmValue,
    rawWpm: rawValue,
    accuracy: acc,
    score: Math.max(0, Math.round(score)),
    correctChars: s.correctChars,
    incorrectChars: s.incorrectChars,
    words: s.idx - s.skips,
    skips: s.skips,
    perfectWords: s.perfectWords,
    maxCombo: s.maxCombo,
    /** A position is a prize: an ineligible run never gets one, so the log cannot be farmed. */
    place: finished && def.rivals && valid ? s.place : 0,
    field,
    durationMs: Math.round(s.elapsed),
    endReason: reason,
    finished,
    valid,
    date: at,
    series: s.series.slice(-SERIES.storedMax),
    keyMisses: { ...s.keyMisses },
  };
}

/** Snapshot for the 10 Hz React render. Deliberately derived, never stored. */
export interface Snapshot {
  status: Status;
  words: string[];
  idx: number;
  typed: string;
  word: string;
  expected: string;
  score: number;
  combo: number;
  mult: number;
  tier: number;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  correctChars: number;
  incorrectChars: number;
  elapsed: number;
  timeLeft: number;
  energy: number;
  progress: number;
  lap: number;
  countdown: number;
  place: number;
  field: number;
  series: number[];
  perfectWords: number;
  maxCombo: number;
  wordErrors: number;
  skips: number;
  /** Per-word flawless result, for the context lane's red/green history. */
  perfect: boolean[];
  totalWords: number;
  /** Static identity of the field only — car positions are driven outside React. */
  rivals: { name: string; color: string }[];
}

export function snapshot(s: RunState): Snapshot {
  const def = getMode(s.mode);
  return {
    status: s.status,
    words: s.words,
    idx: s.idx,
    typed: s.typed,
    word: currentWord(s),
    expected: expectedChar(s),
    score: s.score,
    combo: s.combo,
    mult: s.mult,
    tier: tierProgress(s.combo),
    wpm: wpm(s.dist, s.elapsed),
    rawWpm: wpm(s.correctChars + s.incorrectChars, s.elapsed),
    accuracy: accuracy(s.correctChars, s.incorrectChars),
    correctChars: s.correctChars,
    incorrectChars: s.incorrectChars,
    elapsed: s.elapsed,
    timeLeft: s.timeLeft,
    energy: s.energy,
    progress: Math.min(1, progressOf(s.dist, s.lapChars)),
    lap: def.seconds ? Math.max(1, Math.floor(progressOf(s.dist, s.lapChars)) + 1) : 1,
    countdown: s.countdown,
    place: s.place,
    field: def.rivals ? RIVALS.count + 1 : 0,
    series: s.series.slice(-LIVE_WINDOW),
    perfectWords: s.perfectWords,
    maxCombo: s.maxCombo,
    wordErrors: s.wordErrors,
    skips: s.skips,
    perfect: s.perfect,
    totalWords: s.words.length,
    rivals: s.rivals.map((r) => ({ name: r.name, color: r.color })),
  };
}
