/**
 * The React adapter, under fake timers.
 *
 * Every test here maps to an audit finding: a hand-off timer that outlived the component, a
 * hidden tab eating the clock, input accepted during the countdown, and a paused race that
 * charged the player for the pause.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEngine } from "../src/game/useEngine";
import { COUNTDOWN } from "../src/game/config";
import { advance, type GameEvent, type RunState } from "../src/game/rules";
import type { RunRecord } from "../src/game/types";

function mount(onEvent: (e: GameEvent) => void = () => {}) {
  return renderHook(() => useEngine({ mode: "sprint", difficulty: "hard", onEvent }));
}

/** Drive the frame loop the way a browser would: one animation frame per ~16 ms. */
function frames(ms: number): void {
  for (let t = 0; t < ms; t += 16) {
    act(() => {
      vi.advanceTimersByTime(16);
    });
  }
}

/** `document.visibilityState` is a getter in jsdom, so it has to be redefined, not assigned. */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
}

const go = () => {
  act(() => {
    vi.advanceTimersByTime(COUNTDOWN.goMs + 1);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setHidden(false);
});

describe("race lifecycle", () => {
  it("holds on the countdown, then starts playing on GO", () => {
    const seen: GameEvent[] = [];
    const { result } = mount((e) => seen.push(e));
    act(() => result.current.start());
    expect(result.current.snap.status).toBe("countdown");
    expect(result.current.snap.score).toBe(0);

    go();
    expect(result.current.snap.status).toBe("playing");
    expect(seen.filter((e) => e.type === "countdown")).toHaveLength(COUNTDOWN.from);
    expect(seen.some((e) => e.type === "go")).toBe(true);
  });

  it("rejects input before the lights go out, so the track cannot be pre-typed", () => {
    const { result } = mount();
    act(() => result.current.start());
    const word = result.current.snap.word;
    act(() => result.current.press(word[0] as string));
    expect(result.current.snap.typed).toBe("");
    expect(result.current.snap.idx).toBe(0);
    expect(result.current.snap.score).toBe(0);
  });

  it("restarts cleanly: a second race is a fresh track, not a continuation", () => {
    const { result } = mount();
    act(() => result.current.start());
    go();
    act(() => {
      for (const ch of result.current.snap.word) result.current.press(ch);
    });
    expect(result.current.snap.score).toBeGreaterThan(0);

    act(() => result.current.start());
    expect(result.current.snap.status).toBe("countdown");
    expect(result.current.snap.score).toBe(0);
    expect(result.current.snap.idx).toBe(0);
    expect(result.current.snap.typed).toBe("");
    expect(result.current.snap.series).toEqual([]);
  });

  it("settles exactly once, and the record says why", () => {
    const seen: GameEvent[] = [];
    const { result } = mount((e) => seen.push(e));
    act(() => result.current.start());
    go();
    for (let i = 0; i < 200 && result.current.snap.status === "playing"; i++) {
      const word = result.current.snap.word;
      act(() => {
        for (const ch of word) result.current.press(ch);
      });
    }
    expect(result.current.snap.status).toBe("finished");
    const ends = seen.filter((e) => e.type === "end");
    expect(ends).toHaveLength(1);
    const rec = (ends[0] as unknown as { result: RunRecord }).result;
    expect(rec.endReason).toBe("track");
    expect(rec.finished).toBe(true);
    expect(rec.valid).toBe(true);
    expect(rec.place).toBeGreaterThan(0);
  });

  it("hands back a DNF record when the player quits, and none before the race starts", () => {
    const { result } = mount();
    expect(result.current.abandon()).toBeNull(); // idle
    act(() => result.current.start());
    expect(result.current.abandon()).toBeNull(); // a countdown is not a race
    go();
    const rec = result.current.abandon();
    expect(rec?.endReason).toBe("abandon");
    expect(rec?.finished).toBe(false);
    expect(rec?.valid).toBe(false);
    // Abandoning twice must not produce a second record.
    expect(result.current.abandon()).toBe(rec);
  });
});

describe("pause discipline", () => {
  it("auto-pauses when the tab is hidden and never resumes itself", () => {
    const seen: GameEvent[] = [];
    const { result } = mount((e) => seen.push(e));
    act(() => result.current.start());
    go();
    const before = result.current.snap.elapsed;

    setHidden(true);
    // Wrapped in `act` because the handler publishes through React state.
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.snap.status).toBe("paused");
    expect(seen.some((e) => e.type === "paused")).toBe(true);

    // 40 seconds spent in another tab: the clock must not eat the race.
    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(result.current.snap.status).toBe("paused");
    expect(result.current.snap.elapsed).toBe(before);

    setHidden(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.snap.status).toBe("paused"); // no auto-resume: the player decides
    act(() => result.current.resume());
    expect(result.current.snap.status).toBe("playing");
    expect(result.current.snap.elapsed).toBe(before);
  });

  it("keeps pause/resume neutral for the measured speed", () => {
    const { result } = mount();
    act(() => result.current.start());
    go();
    act(() => {
      for (const ch of result.current.snap.word) result.current.press(ch);
    });
    frames(1000);
    const wpmBefore = result.current.snap.wpm;
    const elapsedBefore = result.current.snap.elapsed;

    act(() => result.current.pause());
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    act(() => result.current.resume());
    frames(700);

    // The pause must not dilute the average…
    expect(result.current.snap.wpm).toBeLessThanOrEqual(wpmBefore + 5);
    // …and 15 idle seconds must not have been charged to the race.
    expect(result.current.snap.elapsed).toBeLessThan(elapsedBefore + 2_000);
  });

  it("togglePause only ever moves between playing and paused", () => {
    const { result } = mount();
    act(() => result.current.togglePause());
    expect(result.current.snap.status).toBe("idle");
    act(() => result.current.start());
    act(() => result.current.togglePause());
    expect(result.current.snap.status).toBe("countdown");
    go();
    act(() => result.current.togglePause());
    expect(result.current.snap.status).toBe("paused");
    act(() => result.current.togglePause());
    expect(result.current.snap.status).toBe("playing");
  });

  it("does not decay the boost tank while paused", () => {
    const view = renderHook(() => useEngine({ mode: "overdrive", difficulty: "easy", onEvent: () => {} }));
    act(() => view.result.current.start());
    go();
    frames(500);
    // Read the live state, not the published snapshot: the 10 Hz ceiling lags by design.
    const st = view.result.current.stateRef.current;
    act(() => view.result.current.pause());
    const at = st.energy;
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(st.energy).toBe(at);
  });
});

describe("teardown", () => {
  it("cancels the countdown so nothing publishes to an unmounted tree", () => {
    const seen: GameEvent[] = [];
    const { result, unmount } = mount((e) => seen.push(e));
    act(() => result.current.start());
    unmount();
    const at = seen.length;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(seen).toHaveLength(at);
    expect(result.current.snap.status).toBe("countdown");
  });

  it("cancels its animation frame on teardown", () => {
    const spy = vi.spyOn(globalThis, "cancelAnimationFrame");
    const { result, unmount } = mount();
    act(() => result.current.start());
    go();
    unmount();
    expect(spy).toHaveBeenCalled();
    // And the loop is really gone: no further frames reach the rules.
    const s: RunState = result.current.stateRef.current;
    const dist = s.dist;
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(s.dist).toBe(dist);
    spy.mockRestore();
  });
});

describe("frame clamping", () => {
  it("absorbs a giant synthetic dt without moving the field", () => {
    const { result } = mount();
    act(() => result.current.start());
    go();
    const s = result.current.stateRef.current;
    const before = s.rivals.map((r) => r.dist);
    act(() => {
      advance(s, s.startedAt + 60_000, 60_000);
    });
    const gained = s.rivals.map((r, i) => r.dist - (before[i] as number));
    for (const g of gained) {
      // One clamped 50 ms frame at ~50 WPM is a third of a character — not a 60-second teleport.
      expect(g).toBeGreaterThan(0);
      expect(g).toBeLessThan(0.4);
    }
    expect(s.energy).toBeGreaterThan(0);
  });
});
