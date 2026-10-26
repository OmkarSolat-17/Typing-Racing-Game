import { useCallback, useEffect, useRef, useState } from "react";
import type { Difficulty, Mode, RivalState, RunRecord } from "./types";
import { DIFFICULTIES, MODES } from "./types";
import { buildTrack, RIVAL_NAMES, TOTAL_CHARS } from "./words";

export type Status = "idle" | "countdown" | "playing" | "paused" | "finished";

export type GameEvent =
  | { type: "countdown"; n: number }
  | { type: "go" }
  | { type: "key"; char: string; ok: boolean; combo: number }
  | { type: "word"; word: string; perfect: boolean; mult: number; idx: number }
  | { type: "skip"; word: string }
  | { type: "error"; char: string }
  | { type: "overtake"; up: boolean; rival: string }
  | { type: "warn"; energy: number }
  | { type: "finish"; result: RunRecord };

export interface Snap {
  status: Status;
  words: string[];
  idx: number;
  typed: string;
  score: number;
  combo: number;
  mult: number;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  correctChars: number;
  incorrectChars: number;
  elapsed: number;
  timeLeft: number;
  energy: number;
  progress: number;
  countdown: number;
  place: number;
  series: number[];
  perfectWords: number;
  maxCombo: number;
  wordErrors: number;
}

interface Internal {
  status: Status;
  words: string[];
  totalChars: number;
  idx: number;
  typed: string;
  wordErrors: number;
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
  pauseStart: number;
  pausedTotal: number;
  elapsed: number;
  timeLeft: number;
  rivals: RivalState[];
  series: number[];
  pubSeries: number[];
  lastSample: number;
  lastPublish: number;
  lastWarn: number;
  place: number;
  keyMisses: Record<string, number>;
  countdown: number;
  finished: boolean;
}

const DRAIN: Record<Difficulty, number> = { easy: 4.2, medium: 5.4, hard: 6.6, code: 6 };

export function multFrom(combo: number) {
  return Math.min(5, 1 + Math.floor(combo / 4));
}

function makeRivals(difficulty: Difficulty, count: number): RivalState[] {
  const cfg = DIFFICULTIES.find((d) => d.id === difficulty)!;
  const [lo, hi] = cfg.rivalWpm;
  const names = [...RIVAL_NAMES].sort(() => Math.random() - 0.5).slice(0, count);
  return names.map((n, i) => {
    const base = lo + ((hi - lo) * (i + 0.35 + Math.random() * 0.3)) / count;
    return {
      name: n.name,
      color: n.color,
      base,
      wpm: base,
      drift: 0.06 + Math.random() * 0.09,
      dist: 0,
      progress: 0,
      finished: false,
      finishAt: 0,
    };
  });
}

export function useEngine(config: { mode: Mode; difficulty: Difficulty; onEvent: (e: GameEvent) => void }) {
  const { mode, difficulty } = config;
  const def = MODES.find((m) => m.id === mode)!;
  const onEventRef = useRef(config.onEvent);
  onEventRef.current = config.onEvent;

  const S = useRef<Internal>(null as unknown as Internal);
  if (!S.current) {
    S.current = {
      status: "idle",
      words: [],
      totalChars: 0,
      idx: 0,
      typed: "",
      wordErrors: 0,
      correctChars: 0,
      incorrectChars: 0,
      dist: 0,
      score: 0,
      combo: 0,
      maxCombo: 0,
      mult: 1,
      perfectWords: 0,
      energy: 100,
      startedAt: 0,
      pauseStart: 0,
      pausedTotal: 0,
      elapsed: 0,
      timeLeft: def.seconds ? def.seconds * 1000 : Infinity,
      rivals: [],
      series: [],
      pubSeries: [],
      lastSample: 0,
      lastPublish: 0,
      lastWarn: 0,
      place: 1,
      keyMisses: {},
      countdown: 3,
      finished: false,
    };
  }

  const [snap, setSnap] = useState<Snap>(() => snapshot(S.current, def));
  const timers = useRef<number[]>([]);
  const raf = useRef(0);

  const publish = useCallback(() => setSnap(snapshot(S.current, def)), [def]);

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  const buildResult = useCallback(
    (finished: boolean): RunRecord => {
      const s = S.current;
      const mins = Math.max(1 / 60000, s.elapsed / 60000);
      const wpm = Math.round(s.dist / 5 / mins);
      const rawWpm = Math.round((s.correctChars + s.incorrectChars) / 5 / mins);
      const total = s.correctChars + s.incorrectChars;
      const accuracy = total ? Math.round((s.correctChars / total) * 1000) / 10 : 100;
      let score = s.score;
      if (finished) {
        score += s.place === 1 ? 1500 : s.place === 2 ? 800 : s.place === 3 ? 400 : 150;
        score += Math.round(accuracy * 10);
        if (def.seconds) score += Math.round((s.timeLeft / 1000) * 25);
        if (def.energy) score += Math.round(s.energy * 12);
      }
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        mode,
        difficulty,
        wpm,
        rawWpm,
        accuracy,
        score,
        correctChars: s.correctChars,
        incorrectChars: s.incorrectChars,
        words: s.idx,
        perfectWords: s.perfectWords,
        maxCombo: s.maxCombo,
        place: finished ? s.place : 0,
        durationMs: Math.round(s.elapsed),
        finished,
        newBadge: null,
        date: Date.now(),
        series: s.series.slice(),
        keyMisses: { ...s.keyMisses },
      };
    },
    [def, difficulty, mode]
  );

  const finish = useCallback(
    (finished: boolean, crashed = false) => {
      const s = S.current;
      if (s.status === "finished") return;
      s.status = "finished";
      s.finished = finished;
      clearTimers();
      void crashed;
      const result = buildResult(finished);
      publish();
      onEventRef.current({ type: "finish", result });
    },
    [buildResult, publish]
  );

  const start = useCallback(() => {
    clearTimers();
    const words = buildTrack(difficulty, def.words);
    const s = S.current;
    s.status = "countdown";
    s.words = words;
    s.totalChars = TOTAL_CHARS(words);
    s.idx = 0;
    s.typed = "";
    s.wordErrors = 0;
    s.correctChars = 0;
    s.incorrectChars = 0;
    s.dist = 0;
    s.score = 0;
    s.combo = 0;
    s.maxCombo = 0;
    s.mult = 1;
    s.perfectWords = 0;
    s.energy = def.energy ? 58 : 100;
    s.startedAt = 0;
    s.pauseStart = 0;
    s.pausedTotal = 0;
    s.elapsed = 0;
    s.timeLeft = def.seconds ? def.seconds * 1000 : Infinity;
    s.rivals = def.rivals ? makeRivals(difficulty, 2) : [];
    s.series = [];
    s.pubSeries = [];
    s.lastSample = 0;
    s.lastPublish = 0;
    s.lastWarn = 0;
    s.place = 1;
    s.keyMisses = {};
    s.countdown = 3;
    s.finished = false;
    publish();

    [3, 2, 1].forEach((n, i) => {
      timers.current.push(
        window.setTimeout(() => {
          s.countdown = n;
          publish();
          onEventRef.current({ type: "countdown", n });
        }, i * 520)
      );
    });
    timers.current.push(
      window.setTimeout(() => {
        s.status = "playing";
        s.startedAt = performance.now();
        s.countdown = 0;
        publish();
        onEventRef.current({ type: "go" });
      }, 1560)
    );
  }, [def, difficulty, publish]);

  const togglePause = useCallback(() => {
    const s = S.current;
    if (s.status === "playing") {
      s.status = "paused";
      s.pauseStart = performance.now();
    } else if (s.status === "paused") {
      s.status = "playing";
      s.pausedTotal += performance.now() - s.pauseStart;
    } else return;
    publish();
  }, [publish]);

  /** main race loop */
  useEffect(() => {
    let last = performance.now();
    const loop = (now: number) => {
      raf.current = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = S.current;

      if (s.status === "playing") {
        s.elapsed = now - s.startedAt - s.pausedTotal;

        // rivals
        const t = s.elapsed / 1000;
        for (const r of s.rivals) {
          if (r.finished) continue;
          const kick = r.progress > 0.82 ? 1.12 : 1;
          r.wpm = r.base * (1 + Math.sin(t * (0.7 + r.drift * 6) + r.drift * 40) * r.drift) * kick;
          r.dist += (r.wpm * 5 * dt) / 60;
          r.progress = Math.min(1.25, r.dist / s.totalChars);
          if (r.progress >= 1) {
            r.finished = true;
            r.finishAt = s.elapsed;
          }
        }

        // placement
        const ahead = s.rivals.filter((r) => r.dist > s.dist).length;
        const newPlace = ahead + 1;
        if (newPlace !== s.place) {
          onEventRef.current({
            type: "overtake",
            up: newPlace < s.place,
            rival: s.rivals.find((r) => r.dist > s.dist)?.name ?? "",
          });
          s.place = newPlace;
          publish();
        }

        // time attack clock
        if (def.seconds) {
          s.timeLeft = Math.max(0, def.seconds * 1000 - s.elapsed);
          if (s.timeLeft <= 0) return finish(true);
        }

        // overdrive boost tank
        if (def.energy) {
          s.energy = Math.max(0, s.energy - DRAIN[difficulty] * dt);
          if (s.energy <= 22 && now - s.lastWarn > 1600) {
            s.lastWarn = now;
            onEventRef.current({ type: "warn", energy: s.energy });
          }
          if (s.energy <= 0) return finish(false, true);
        }

        // wpm sampling for the live graph (kept on a stable array reference)
        if (s.elapsed - s.lastSample > 450) {
          s.lastSample = s.elapsed;
          const mins = Math.max(1 / 60000, s.elapsed / 60000);
          s.series.push(Math.round(s.dist / 5 / mins));
          if (s.series.length > 240) s.series.shift();
          s.pubSeries = s.series.slice(-60);
        }
        // 10 Hz snapshot for the clock / boost tank readouts
        if (now - s.lastPublish > 100) {
          s.lastPublish = now;
          publish();
        }
      }
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [def, difficulty, finish, publish]);

  useEffect(() => () => clearTimers(), []);

  const press = useCallback(
    (char: string) => {
      const s = S.current;
      if (s.status !== "playing" || s.idx >= s.words.length) return;
      const word = s.words[s.idx];
      const expect = word[s.typed.length];
      if (char === expect) {
        s.typed += char;
        s.correctChars++;
        s.dist++;
        s.score += 10 * s.mult;
        s.energy = Math.min(100, s.energy + (def.energy ? 1.9 : 0));
        onEventRef.current({ type: "key", char, ok: true, combo: s.combo });

        if (s.typed.length === word.length) {
          const perfect = s.wordErrors === 0;
          if (perfect) {
            s.combo++;
            s.perfectWords++;
            s.maxCombo = Math.max(s.maxCombo, s.combo);
          } else {
            s.combo = 0;
          }
          s.mult = multFrom(s.combo);
          s.score += (50 + word.length * 10) * s.mult + (perfect ? 25 : 0);
          s.energy = Math.min(100, s.energy + (def.energy ? 3 : 0));
          const doneIdx = s.idx;
          s.idx++;
          s.typed = "";
          s.wordErrors = 0;
          onEventRef.current({ type: "word", word, perfect, mult: s.mult, idx: doneIdx });
          if (s.idx >= s.words.length) {
            publish();
            return finish(true);
          }
        }
      } else {
        s.incorrectChars++;
        s.wordErrors++;
        s.combo = 0;
        s.mult = 1;
        s.score = Math.max(0, s.score - 15);
        s.energy = Math.max(0, s.energy - (def.energy ? 7 : 0));
        if (expect) s.keyMisses[expect] = (s.keyMisses[expect] || 0) + 1;
        onEventRef.current({ type: "error", char });
        if (def.energy && s.energy <= 0) {
          publish();
          return finish(false, true);
        }
      }
      publish();
    },
    [def, finish, publish]
  );

  const backspace = useCallback(() => {
    const s = S.current;
    if (s.status !== "playing" || !s.typed) return;
    s.typed = s.typed.slice(0, -1);
    publish();
  }, [publish]);

  /** leave mid-race: hand back a DNF result so career stats still count it */
  const abandon = useCallback((): RunRecord | null => {
    const s = S.current;
    if (s.status === "finished" || s.status === "idle") return null;
    if (s.status === "playing") s.elapsed = performance.now() - s.startedAt - s.pausedTotal;
    s.status = "finished";
    clearTimers();
    return buildResult(false);
  }, [buildResult]);

  const skip = useCallback(() => {
    const s = S.current;
    if (s.status !== "playing" || s.idx >= s.words.length) return;
    const word = s.words[s.idx];
    s.idx++;
    s.typed = "";
    s.wordErrors = 0;
    s.combo = 0;
    s.mult = 1;
    s.score = Math.max(0, s.score - 40);
    onEventRef.current({ type: "skip", word });
    if (s.idx >= s.words.length) {
      publish();
      return finish(true);
    }
    publish();
  }, [finish, publish]);

  return { snap, stateRef: S, start, press, backspace, skip, abandon, togglePause, def };
}

function snapshot(s: Internal, def: (typeof MODES)[number]): Snap {
  const total = s.correctChars + s.incorrectChars;
  const mins = Math.max(1 / 60000, s.elapsed / 60000);
  return {
    status: s.status,
    words: s.words,
    idx: s.idx,
    typed: s.typed,
    score: s.score,
    combo: s.combo,
    mult: s.mult,
    wpm: s.elapsed > 400 ? Math.round(s.dist / 5 / mins) : 0,
    rawWpm: s.elapsed > 400 ? Math.round(total / 5 / mins) : 0,
    accuracy: total ? Math.round((s.correctChars / total) * 1000) / 10 : 100,
    correctChars: s.correctChars,
    incorrectChars: s.incorrectChars,
    elapsed: s.elapsed,
    timeLeft: s.timeLeft,
    energy: s.energy,
    progress: s.totalChars ? Math.min(1, s.dist / s.totalChars) : 0,
    countdown: s.countdown,
    place: s.place,
    series: s.pubSeries,
    perfectWords: s.perfectWords,
    maxCombo: s.maxCombo,
    wordErrors: s.wordErrors,
    // keep def referenced for mode-specific snapshots
    ...(def ? {} : {}),
  };
}
