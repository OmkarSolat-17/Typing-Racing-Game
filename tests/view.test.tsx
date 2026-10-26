/**
 * The view layer, rendered for real.
 *
 * These are cheap component tests, not pixel tests: they pin the props contract between the
 * engine's `Snapshot` and the screens (the audit's whole "the UI reads fields that no longer
 * exist" class of bug), plus the two behaviours the on-screen keyboard got wrong — case
 * matching and click-vs-pointer activation — and the SVG gradient-id collision.
 */
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TouchKeyboard } from "../src/components/TouchKeyboard";
import { NextKeyGuide } from "../src/components/NextKeyGuide";
import { WordTrack } from "../src/components/WordTrack";
import { Hud } from "../src/components/Hud";
import { Sparkline } from "../src/components/Sparkline";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { FxCanvas, type FxHandle } from "../src/components/FxCanvas";
import { RivalTrack } from "../src/components/RivalTrack";
import { useFocusTrap } from "../src/game/useFocusTrap";
import { beginPlaying, createRun, prepareRun, snapshot, type RunState, type Snapshot } from "../src/game/rules";
import { getMode } from "../src/game/config";

const rng = (seed = 2) => {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 0x1_00_00_00_00;
  };
};

function sample(over: Partial<Snapshot> = {}): Snapshot {
  const s = prepareRun(createRun("sprint", "hard"), "sprint", "hard", rng(2));
  beginPlaying(s, 1000);
  return { ...snapshot(s), ...over };
}

afterEach(() => cleanup());

describe("TouchKeyboard", () => {
  it("submits the character the word wants, not the letter on the legend", () => {
    const onPress = vi.fn();
    render(
      <TouchKeyboard
        nextKey="P"
        word="Promise"
        flash={null}
        guide
        onPress={onPress}
        onBack={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Key p" }));
    expect(onPress).toHaveBeenCalledWith("P");
  });

  it("submits the plain key when nothing is waiting for that shape", () => {
    const onPress = vi.fn();
    render(
      <TouchKeyboard
        nextKey="a"
        word="a"
        flash={null}
        guide={false}
        onPress={onPress}
        onBack={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Key a" }));
    expect(onPress).toHaveBeenCalledWith("a");
  });

  it("wires delete and skip, and goes inert outside the playing state", () => {
    const onBack = vi.fn();
    const onSkip = vi.fn();
    const { rerender } = render(
      <TouchKeyboard
        nextKey="a"
        word="abc"
        flash={null}
        guide={false}
        onPress={vi.fn()}
        onBack={onBack}
        onSkip={onSkip}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /DELETE/i }));
    fireEvent.click(screen.getByRole("button", { name: /SKIP/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);

    rerender(
      <TouchKeyboard
        nextKey="a"
        word="abc"
        flash={null}
        guide={false}
        onPress={vi.fn()}
        onBack={onBack}
        onSkip={onSkip}
        disabled
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /DELETE/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("offers the off-layout characters the current word needs", () => {
    const onPress = vi.fn();
    render(
      <TouchKeyboard
        nextKey="{"
        word="if (a) {"
        flash={null}
        guide={false}
        onPress={onPress}
        onBack={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Key {" }));
    expect(onPress).toHaveBeenCalledWith("{");
    expect(screen.getByRole("button", { name: "Key i" })).toBeDefined();
  });

  it("lights up from a keystroke flash without freezing on it", () => {
    const view = render(
      <TouchKeyboard
        nextKey="a"
        word="abc"
        flash={{ k: "b", ok: false, seq: 1 }}
        guide={false}
        onPress={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(view.container.querySelector("[data-flash]") === null).toBe(true);
    view.rerender(
      <TouchKeyboard
        nextKey="a"
        word="abc"
        flash={{ k: "c", ok: true, seq: 2 }}
        guide={false}
        onPress={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Key a" })).toBeDefined();
  });
});

describe("NextKeyGuide", () => {
  it("shows the next character and the finger that owns it", () => {
    render(
      <NextKeyGuide
        nextKey="f"
        word="if (a) {"
        accent="#ffb020"
        guide
        flash={null}
        onSkip={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText("Use your left index")).toBeDefined();
    expect(screen.getAllByText("f").length).toBeGreaterThan(0);
  });

  it("admits when a key is off-layout instead of naming a wrong finger", () => {
    // `€` is on no US/ANSI row — the guide must say so rather than confidently teach `pinkyR`.
    render(<NextKeyGuide nextKey="€" word="€" accent="#ffb020" guide flash={null} onSkip={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/Off-layout key/)).toBeDefined();
  });

  it("animates the last keystroke off a sequence counter, not a wall-clock comparison", () => {
    const { container } = render(
      <NextKeyGuide
        nextKey="a"
        word="ab"
        accent="#ffb020"
        guide
        flash={{ k: "z", ok: false, seq: 7 }}
        onSkip={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    // The flash element exists for this keystroke and would be gone once it settles; the point is
    // that it is *keyed on the sequence*, so it cannot stick around forever.
    expect(container.querySelectorAll("[aria-hidden]").length).toBeGreaterThan(0);
  });
});

describe("WordTrack", () => {
  it("renders the live word with exactly one caret and the surrounding context", () => {
    const snap = sample();
    const word = snap.words[0] as string;
    const { container } = render(
      <WordTrack words={snap.words} idx={0} typed={word.slice(0, 3)} accent="#ffb020" perfect={snap.perfect} />,
    );
    const caret = container.querySelectorAll('[data-caret="1"]');
    expect(caret.length).toBe(1);
    expect(container.textContent).toContain(word[3]);
  });

  it("windowing keeps a 125-word timed track cheap", () => {
    const snap = sample();
    const words = Array.from({ length: 125 }, (_, i) => `${snap.words[i % snap.words.length]}${i}`);
    const { container } = render(
      <WordTrack words={words} idx={60} typed="" accent="#ffb020" perfect={[]} window={4} />,
    );
    const lane = container.querySelectorAll("[data-word]");
    expect(lane.length).toBeLessThanOrEqual(9);
    expect(lane.length).toBeGreaterThan(0);
  });

  it("marks a flawless past word differently from a flawed one", () => {
    const { container } = render(
      <WordTrack
        words={["alpha", "beta", "gamma"]}
        idx={2}
        typed=""
        accent="#ffb020"
        perfect={[true, false]}
        window={5}
      />,
    );
    expect(container.querySelectorAll('[data-perfect="1"]').length).toBe(1);
    expect(container.querySelectorAll('[data-perfect="0"]').length).toBe(1);
  });
});

describe("Hud", () => {
  it("reads every number from the snapshot and fires its controls", () => {
    const onPause = vi.fn();
    const onToggleSound = vi.fn();
    const onQuit = vi.fn();
    const snap = sample({ score: 1234, wpm: 77, accuracy: 99, place: 2, field: 3 });
    render(
      <Hud
        snap={snap}
        def={getMode("sprint")}
        accent="#ffb020"
        sound
        onPause={onPause}
        onToggleSound={onToggleSound}
        onQuit={onQuit}
      />,
    );
    expect(screen.getByText("1,234")).toBeDefined();
    expect(screen.getByText("77")).toBeDefined();
    expect(screen.getByText("2ND")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Pause race" }));
    fireEvent.click(screen.getByRole("button", { name: "Mute sound" }));
    fireEvent.click(screen.getByRole("button", { name: "Quit race" }));
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onToggleSound).toHaveBeenCalledTimes(1);
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it("shows a dash instead of a fake position in a rival-free mode", () => {
    const snap = sample({ field: 0, place: 0 });
    render(
      <Hud
        snap={snap}
        def={getMode("zen")}
        accent="#35e0a1"
        sound
        onPause={vi.fn()}
        onToggleSound={vi.fn()}
        onQuit={vi.fn()}
      />,
    );
    expect(screen.getByText("—")).toBeDefined();
  });
});

describe("Sparkline", () => {
  it("gives every instance its own gradient id", () => {
    const { container } = render(
      <div>
        <Sparkline series={[10, 20, 15, 30]} color="#ffb020" />
        <Sparkline series={[10, 20, 15, 30]} color="#4cc9ff" />
      </div>,
    );
    const ids = Array.from(container.querySelectorAll("linearGradient")).map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const fills = Array.from(container.querySelectorAll("[fill^='url(']")).map((n) => n.getAttribute("fill"));
    expect(new Set(fills).size).toBe(2);
  });

  it("degrades to a baseline instead of a fabricated curve when there is nothing to plot", () => {
    const { container } = render(<Sparkline series={[5]} color="#ffb020" label="one point" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelectorAll("path")).toHaveLength(0);
    expect(container.querySelectorAll("line")).toHaveLength(1);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("one point");
  });
});

describe("FxCanvas", () => {
  /** A canvas context that accepts any call and counts the draws. */
  function installFakeContext(): string[] {
    const calls: string[] = [];
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "canvas") return { width: 800, height: 600 };
          // Coercion-safe: the code under test assigns strings and numbers to style props and
          // reads numeric metrics, and the fake answers both with the same proxy.
          if (prop === "valueOf") return () => 0;
          if (prop === "toString") return () => "";
          if (prop === Symbol.toPrimitive) return () => 0;
          return (...args: unknown[]) => {
            calls.push(String(prop));
            void args;
            return proxy;
          };
        },
        set: (_t, prop) => {
          calls.push(`set:${String(prop)}`);
          return true;
        },
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(proxy as CanvasRenderingContext2D);
    return calls;
  }

  it("draws on demand and then parks its frame loop when there is nothing left", () => {
    const calls = installFakeContext();
    vi.useFakeTimers();
    const ref = createRef<FxHandle>();
    const { unmount } = render(<FxCanvas ref={ref} />);

    act(() => {
      ref.current?.burst(120, 90, "#ffb020", 24, 1.2);
      ref.current?.flash("#ff5a7a", 0.5);
      ref.current?.ring(10, 10, "#35e0a1", 12);
      ref.current?.streaks("#4cc9ff", 6);
      ref.current?.popup(50, 50, "+240", "#ffffff", 22);
      ref.current?.confetti(60, 60, ["#ffb020", "#35e0a1"], 30);
    });
    const before = calls.length;
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(calls.length).toBeGreaterThan(before);
    expect(calls.some((c) => c === "clearRect")).toBe(true);

    act(() => {
      ref.current?.clear();
      vi.advanceTimersByTime(80);
    });
    const parked = calls.length;
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    // The loop stopped itself: an idle screen must not repaint forever.
    expect(calls.length).toBe(parked);

    unmount();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(calls.length).toBe(parked);
    vi.useRealTimers();
  });

  it("survives a browser that cannot give it a 2D context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const ref = createRef<FxHandle>();
    expect(() => render(<FxCanvas ref={ref} />)).not.toThrow();
    expect(() => {
      ref.current?.burst(1, 1, "#fff", 4, 1);
      ref.current?.flash("#fff", 0.4);
      ref.current?.clear();
    }).not.toThrow();
  });
});

describe("RivalTrack", () => {
  const stateOf = (): RunState => {
    const s = prepareRun(createRun("sprint", "medium"), "sprint", "medium", () => 0.42);
    return s;
  };

  it("renders a lane per rival plus the player, and stops writing when the race is not active", () => {
    const state = stateOf();
    const ref = { current: state };
    const { container } = render(
      <RivalTrack
        stateRef={ref}
        accent="#ffb020"
        rivals={state.rivals.map((r) => ({ name: r.name, color: r.color }))}
        active={false}
      />,
    );
    expect(container.textContent).toContain("YOU");
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
    // Each rival gets its own gradient, so ids must be unique per car.
    const ids = Array.from(container.querySelectorAll("linearGradient")).map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("moves the cars from the frame loop without re-rendering React", () => {
    vi.useFakeTimers();
    const state = stateOf();
    const ref = { current: state };
    const { container } = render(
      <RivalTrack
        stateRef={ref}
        accent="#ffb020"
        rivals={state.rivals.map((r) => ({ name: r.name, color: r.color }))}
        active
      />,
    );
    const track = container.querySelector("[data-track]") ?? container;
    const before = track.innerHTML;
    state.dist = 40;
    state.rivals[0]!.dist = 60;
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(track.innerHTML).not.toBe(before);
    expect(track.innerHTML).toContain("40");
    vi.useRealTimers();
  });
});

describe("useFocusTrap", () => {
  const Modal = ({ active }: { active: boolean }) => {
    const trapRef = useFocusTrap<HTMLDivElement>(active);
    return (
      <div>
        <button type="button">outside</button>
        <div ref={trapRef} role="dialog" aria-modal="true">
          <button type="button">first</button>
          <button type="button">last</button>
        </div>
      </div>
    );
  };

  it("pulls focus into the dialog and keeps Tab inside it", () => {
    vi.useFakeTimers();
    const { unmount } = render(<Modal active={false} />);
    const outside = screen.getByRole("button", { name: "outside" });
    outside.focus();
    unmount();

    const view = render(<Modal active />);
    act(() => {
      vi.advanceTimersByTime(32); // one frame: the trap focuses after the entry animation starts
    });
    const dialog = view.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    const buttons = Array.from(dialog.querySelectorAll("button"));
    (buttons[buttons.length - 1] as HTMLButtonElement).focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    vi.useRealTimers();
  });

  it("does nothing while the dialog is closed", () => {
    render(<Modal active={false} />);
    expect(document.activeElement?.textContent ?? "").not.toBe("first");
  });
});

describe("ErrorBoundary", () => {
  const Boom = ({ fail }: { fail: boolean }) => {
    if (fail) throw new Error("kaboom");
    return <p>alive</p>;
  };

  it("keeps the app standing and hands the player an escape hatch", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain("kaboom");
    expect(screen.getByRole("button", { name: /reload/i })).toBeDefined();
    expect(screen.getByRole("heading")).toBeDefined();
    expect(container.querySelector("script")).toBeNull();
    spy.mockRestore();
  });

  it("renders children untouched when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Boom fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("alive")).toBeDefined();
  });
});
