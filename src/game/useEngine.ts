/**
 * React adapter around the pure rules in `rules.ts`.
 *
 * It owns exactly three things:
 *  • one mutable `RunState` per race, held in a ref and sampled for rendering;
 *  • the frame loop and the countdown timers — every timer tracked, every timer cancelled;
 *  • the pause discipline: hiding the tab pauses the race, so the wall clock can never
 *    eat a minute you spent in another window.
 *
 * No scoring, rivals, records or persistence happen here. That is `rules.ts` and
 * `career.ts`, both unit-tested without a DOM.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COUNTDOWN, PUBLISH_INTERVAL_MS } from "./config";
import { now, stamp } from "./clock";
import {
  advance,
  backspace as rulesBackspace,
  beginPlaying,
  createRun,
  keyDown,
  pauseRun,
  prepareRun,
  resumeRun,
  setCountdown,
  skipWord,
  snapshot,
  toRecord,
  type GameEvent,
  type RunState,
  type Snapshot,
} from "./rules";
import type { Difficulty, EndReason, Mode, RunRecord } from "./types";

export type { GameEvent, RunState, Snapshot } from "./rules";
export type { Status } from "./types";

export interface Engine {
  snap: Snapshot;
  /** Live state for the rAF-driven lane renderer. Treat as read-only outside the hook. */
  stateRef: React.RefObject<RunState>;
  start: () => void;
  press: (char: string) => void;
  backspace: () => void;
  skip: () => void;
  pause: () => void;
  resume: () => void;
  togglePause: () => void;
  /** Leave mid-race. Returns the DNF record so the career still knows you quit. */
  abandon: () => RunRecord | null;
}

interface Config {
  mode: Mode;
  difficulty: Difficulty;
  onEvent: (e: GameEvent) => void;
  /** Injectable for deterministic tests; defaults to `Math.random`. */
  random?: () => number;
}

/** `useRef` with a lazy initial value, without the `null as unknown as T` trick. */
function useOwnRef<T>(init: () => T): React.RefObject<T> {
  const ref = useRef<T | null>(null);
  if (ref.current === null) ref.current = init();
  return ref as React.RefObject<T>;
}

export function useEngine({ mode, difficulty, onEvent, random }: Config): Engine {
  const stateRef = useOwnRef<RunState>(() => createRun(mode, difficulty));
  const [snap, setSnap] = useState<Snapshot>(() => snapshot(stateRef.current));

  const timersRef = useRef<number[]>([]);
  const rafRef = useRef(0);
  const lastPublishRef = useRef(0);
  const resultRef = useRef<RunRecord | null>(null);

  // Callback identity is refreshed from an effect — refs are never written during render.
  const handlersRef = useRef({ onEvent, random });
  useEffect(() => {
    handlersRef.current = { onEvent, random };
  }, [onEvent, random]);

  const emit = useCallback((events: GameEvent[]) => {
    for (const e of events) handlersRef.current.onEvent(e);
  }, []);

  const publish = useCallback(() => {
    lastPublishRef.current = now();
    setSnap(snapshot(stateRef.current));
  }, [stateRef]);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  }, []);

  const defer = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  /** One-way door: the first call for a race wins, so a frame and a keypress can't both end it. */
  const settle = useCallback(
    (reason: EndReason): RunRecord | null => {
      const s = stateRef.current;
      if (s.status === "finished") return resultRef.current;
      s.status = "finished";
      s.endReason = reason;
      s.pausedAt = 0;
      clearTimers();
      const record = toRecord(s, stamp());
      resultRef.current = record;
      publish();
      handlersRef.current.onEvent({ type: "end", reason, result: record });
      return record;
    },
    [clearTimers, publish, stateRef],
  );

  const start = useCallback(() => {
    clearTimers();
    resultRef.current = null;
    lastPublishRef.current = 0;
    const s = stateRef.current;
    prepareRun(s, mode, difficulty, handlersRef.current.random);
    publish();

    for (let i = 0; i < COUNTDOWN.from; i++) {
      const n = COUNTDOWN.from - i;
      defer(() => {
        setCountdown(s, n);
        publish();
        handlersRef.current.onEvent({ type: "countdown", n });
      }, i * COUNTDOWN.stepMs);
    }
    defer(() => {
      beginPlaying(s, now());
      publish();
      handlersRef.current.onEvent({ type: "go" });
    }, COUNTDOWN.goMs);
  }, [clearTimers, defer, difficulty, mode, publish, stateRef]);

  /* A mid-session config change must not leave a race armed with the wrong track. */
  useEffect(() => {
    const s = stateRef.current;
    if (s.status === "idle" && (s.mode !== mode || s.difficulty !== difficulty)) {
      Object.assign(s, createRun(mode, difficulty));
      publish();
    }
  }, [difficulty, mode, publish, stateRef]);

  /* ---------------------------------------------------------------- frame loop */
  useEffect(() => {
    let last = now();
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const at = now();
      const dtMs = at - last;
      last = at;

      const s = stateRef.current;
      if (s.status !== "playing") return;

      const out = advance(s, at, dtMs);
      emit(out.events);
      if (out.ended) {
        settle(out.ended);
        return;
      }
      // 10 Hz ceiling on renders while nothing is being typed (clock, boost tank, rivals).
      if (at - lastPublishRef.current >= PUBLISH_INTERVAL_MS) {
        lastPublishRef.current = at;
        setSnap(snapshot(s));
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [emit, settle, stateRef]);

  /* ------------------------------------------------- backgrounded tab: pause, don't decay */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      const s = stateRef.current;
      if (pauseRun(s, now())) {
        publish();
        handlersRef.current.onEvent({ type: "paused" });
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [publish, stateRef]);

  useEffect(
    () => () => {
      clearTimers();
      cancelAnimationFrame(rafRef.current);
    },
    [clearTimers],
  );

  /* ---------------------------------------------------------------- input */
  const press = useCallback(
    (char: string) => {
      const s = stateRef.current;
      const was = s.status;
      const out = keyDown(s, char);
      if (!out.dirty) return;
      emit(out.events);
      if (out.ended) settle(out.ended);
      else if (was === "playing") publish();
    },
    [emit, publish, settle, stateRef],
  );

  const backspace = useCallback(() => {
    if (!rulesBackspace(stateRef.current)) return;
    publish();
  }, [publish, stateRef]);

  const skip = useCallback(() => {
    const s = stateRef.current;
    const out = skipWord(s);
    if (!out.dirty) return;
    emit(out.events);
    if (out.ended) settle(out.ended);
    else publish();
  }, [emit, publish, settle, stateRef]);

  const pause = useCallback(() => {
    if (pauseRun(stateRef.current, now())) {
      publish();
      handlersRef.current.onEvent({ type: "paused" });
    }
  }, [publish, stateRef]);

  const resume = useCallback(() => {
    if (resumeRun(stateRef.current, now())) {
      publish();
      handlersRef.current.onEvent({ type: "resumed" });
    }
  }, [publish, stateRef]);

  const togglePause = useCallback(() => {
    const s = stateRef.current;
    if (s.status === "playing") pause();
    else if (s.status === "paused") resume();
  }, [pause, resume, stateRef]);

  const abandon = useCallback((): RunRecord | null => {
    const s = stateRef.current;
    if (s.status === "idle" || s.status === "countdown") return null;
    if (s.status === "finished") return resultRef.current;
    return settle("abandon");
  }, [settle, stateRef]);

  return { snap, stateRef, start, press, backspace, skip, pause, resume, togglePause, abandon };
}
