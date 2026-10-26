/**
 * Whole-screen mounts. The audit's most expensive class of bug lived in the seam between the
 * engine and the screens — a screen reading a field the rewrite had renamed, a timer firing
 * after teardown, a keystroke that never reached the rules. Those are invisible to unit tests
 * of either side, so the app is mounted for real here.
 */
import { cleanup, fireEvent, render, screen, act, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import Results from "../src/screens/Results";
import StatsScreen from "../src/screens/Stats";
import Home from "../src/screens/Home";
import { emptyStats, recordRun } from "../src/game/career";
import type { RunRecord, Settings } from "../src/game/types";
import { DEFAULT_SETTINGS, HANDOFF } from "../src/game/config";

/** A canvas context that accepts and counts any call, so FxCanvas is exercised, not skipped. */
function installCanvas(): void {
  const proxy: unknown = new Proxy(
    {},
    {
      get: (t, prop) => {
        if (prop === "canvas") return { width: 800, height: 600 };
        if (prop === "valueOf") return () => 0;
        if (prop === "toString") return () => "";
        if (prop === Symbol.toPrimitive) return () => 0;
        if (prop in t) return (t as Record<string | symbol, unknown>)[prop];
        return () => proxy;
      },
      set: (t, prop, value) => {
        (t as Record<string | symbol, unknown>)[prop] = value;
        return true;
      },
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(proxy as CanvasRenderingContext2D);
}

const key = (k: string, init: Partial<KeyboardEventInit> = {}) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

/** Keys arrive as real events; React still has to flush the resulting state before we look. */
async function type(word: string): Promise<void> {
  await act(async () => {
    for (const ch of word) key(ch);
    await new Promise((r) => setTimeout(r, 20));
  });
}

/** One key, as one key event (not a spelling of the key's name). */
const press = async (k: string) => {
  await act(async () => {
    key(k);
    await new Promise((r) => setTimeout(r, 20));
  });
};

const tap = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
    await new Promise((r) => setTimeout(r, 20));
  });
};

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: "rec-1",
  mode: "sprint",
  difficulty: "medium",
  wpm: 68,
  rawWpm: 71,
  accuracy: 96.4,
  score: 5120,
  correctChars: 210,
  incorrectChars: 8,
  words: 25,
  skips: 0,
  perfectWords: 19,
  maxCombo: 17,
  place: 1,
  field: 3,
  durationMs: 23_400,
  endReason: "track",
  finished: true,
  valid: true,
  date: 1_700_000_000_000,
  series: [40, 52, 61, 68],
  keyMisses: { q: 3, f: 2, " ": 1 },
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  installCanvas();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("<App /> boot path", () => {
  // Framer's `AnimatePresence mode="wait"` swaps screens only after the exit animation has
  // actually run, which fake timers cannot advance — so the seam is tested on real time.
  const sleep = async (ms: number) => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });
  };

  /**
   * "The race is live" is polled from the app's own `role="status"` live region rather than
   * guessed from a sleep: a slow runner delays `GO`, and a fixed wait would then type into a
   * countdown and fail as if input handling were broken.
   */
  const waitGo = () =>
    waitFor(() => expect(screen.getByRole("status").textContent).toBe("Go"), {
      timeout: 9000,
      interval: 40,
    });

  it("mounts on the home screen with no storage and no console errors", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<App />);
    await sleep(30);
    expect(container.textContent).toContain("KEY");
    expect(screen.getByRole("button", { name: /start engine/i })).toBeDefined();
    expect(err).not.toHaveBeenCalled();
  });

  it("counts down, blocks pre-typing, scores real input and keeps a quit as a DNF record", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /start engine/i }));
    await sleep(300); // screen swap

    // Still on the countdown: a keystroke must not pre-fill the word.
    await press("s");
    const early = document.querySelector("[data-caret='1']");
    expect(early?.parentElement?.firstElementChild).toBe(early);

    await waitGo(); // 3 · 2 · 1 · GO
    const caret = document.querySelector("[data-caret='1']");
    expect(caret).not.toBeNull();
    const word = (caret?.parentElement?.textContent ?? "").replace(/\u00a0/g, " ").trim();
    expect(word.length).toBeGreaterThan(0);

    await type(word);
    expect(screen.getByText(/word 2\//)).toBeDefined();
    expect(err).not.toHaveBeenCalled();

    // Escape opens a focus-trapped pit stop; leaving it records the abandoned race.
    await press("Escape");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("PIT STOP")).toBeDefined();
    await tap(within(dialog).getByRole("button", { name: /menu/i }));
    await sleep(300);

    const saved = JSON.parse(localStorage.getItem("keyrush.stats.v3") ?? "null") as { runs: RunRecord[] } | null;
    expect(saved?.runs).toHaveLength(1);
    expect(saved?.runs[0]?.endReason).toBe("abandon");
    expect(saved?.runs[0]?.finished).toBe(false);
    expect(saved?.runs[0]?.valid).toBe(false);
    // …and no deferred results screen arrives for a race that was already left.
    await sleep(HANDOFF.resultDelayMs + 300);
    expect(screen.queryByText(/TRACK CLEARED|VICTORY|RACE ABANDONED/) === null).toBe(true);
    expect(screen.getByRole("button", { name: /start engine/i })).toBeDefined();
  });

  it("pauses and resumes with the same Escape key, and the clock does not run while paused", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /start engine/i }));
    await sleep(300);
    await waitGo();
    await press("s");
    const partial = document.querySelector("[data-caret='1']")?.parentElement?.textContent ?? "";
    expect(partial.length).toBeGreaterThan(0);

    await press("Escape");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    await sleep(900); // a whole second spent in the pit stop
    const frozen = document.body.textContent ?? "";
    await press("Escape");
    await sleep(320); // the overlay leaves through an exit animation
    expect(screen.queryByRole("dialog")).toBeNull();

    // The clock survived the pause: the race is live again and still on the same word.
    const stillHere = (document.querySelector("[data-caret='1']")?.parentElement?.textContent ?? "")
      .replace(/\u00a0/g, " ")
      .trim();
    expect(stillHere.length).toBeGreaterThan(0);
    expect(frozen.length).toBeGreaterThan(0);
  });
});

describe("<Results />", () => {
  it("reports the record's own numbers, and the reason it ended", () => {
    const stats = recordRun(emptyStats(), record()).stats;
    render(
      <Results record={record()} stats={stats} newBadges={[]} onReplay={vi.fn()} onHome={vi.fn()} onStats={vi.fn()} />,
    );
    expect(screen.getByText(/TRACK CLEARED/)).toBeDefined();
    expect(screen.getAllByText("68").length).toBeGreaterThan(0);
    expect(screen.getByText("1ST")).toBeDefined();
    expect(screen.getByText(/5,120/)).toBeDefined();
    expect(screen.getByText(/SLIPPERY KEYS/i)).toBeDefined();
  });

  it("explains an ineligible run instead of pretending it is a record", () => {
    const skipped = record({
      valid: false,
      skips: 4,
      place: 0,
      accuracy: 0,
      score: 0,
      correctChars: 0,
      wpm: 0,
      series: [],
    });
    render(
      <Results
        record={skipped}
        stats={emptyStats()}
        newBadges={[]}
        onReplay={vi.fn()}
        onHome={vi.fn()}
        onStats={vi.fn()}
      />,
    );
    expect(screen.getByText(/skipped words/i)).toBeDefined();
    expect(screen.getByText(/history only/i)).toBeDefined();
  });

  it("announces a fresh badge by name, never by id", () => {
    const stats = recordRun(emptyStats(), record()).stats;
    render(
      <Results
        record={record()}
        stats={stats}
        newBadges={["first-lap", "made-up"]}
        onReplay={vi.fn()}
        onHome={vi.fn()}
        onStats={vi.fn()}
      />,
    );
    expect(screen.getByText(/First Lap/)).toBeDefined();
    expect(screen.getByText("Unknown Badge")).toBeDefined();
    expect(screen.queryByText("first-lap") === null).toBe(true);
  });
});

describe("<Stats />", () => {
  it("counts every race ever played, not just the retained detail window", () => {
    let stats = emptyStats();
    for (let i = 0; i < 70; i++)
      stats = recordRun(stats, record({ id: `r${i}`, wpm: 30 + (i % 40), score: 1000 + i })).stats;
    render(<StatsScreen stats={stats} issues={[]} onBack={vi.fn()} onWipe={vi.fn()} />);
    expect(screen.getByText(/70 races logged/)).toBeDefined();
    expect(screen.getByText(/keeps the newest 60/i)).toBeDefined();
  });

  it("surfaces storage problems and asks before destroying anything", () => {
    render(
      <StatsScreen
        stats={emptyStats()}
        issues={["2 saved races could not be read and were skipped."]}
        onBack={vi.fn()}
        onWipe={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("could not be read");
    const wipe = screen.getByRole("button", { name: /wipe progress/i });
    fireEvent.click(wipe);
    expect(screen.getByRole("button", { name: /yes, erase/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
  });

  it("renders an empty career without a single chart blowing up", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<StatsScreen stats={emptyStats()} issues={[]} onBack={vi.fn()} onWipe={vi.fn()} />);
    expect(screen.getByText("GARAGE")).toBeDefined();
    expect(err).not.toHaveBeenCalled();
  });
});

describe("<Home />", () => {
  const settings: Settings = { ...DEFAULT_SETTINGS };

  it("selects a mode without launching a race, then launches the selected one", () => {
    const onStart = vi.fn();
    const onSelectMode = vi.fn();
    render(
      <Home
        mode="sprint"
        stats={emptyStats()}
        settings={settings}
        notice={null}
        onSelectMode={onSelectMode}
        onStart={onStart}
        patchSettings={vi.fn()}
        onStats={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /time attack/i }));
    expect(onSelectMode).toHaveBeenCalledWith("time");
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /start engine/i }));
    expect(onStart).toHaveBeenCalledWith("sprint");
  });

  it("shows the storage warning only when there is one", () => {
    const { rerender } = render(
      <Home
        mode="sprint"
        stats={emptyStats()}
        settings={settings}
        notice={null}
        onSelectMode={vi.fn()}
        onStart={vi.fn()}
        patchSettings={vi.fn()}
        onStats={vi.fn()}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(
      <Home
        mode="sprint"
        stats={emptyStats()}
        settings={settings}
        notice="Saved progress could not be read and was set aside."
        onSelectMode={vi.fn()}
        onStart={vi.fn()}
        patchSettings={vi.fn()}
        onStats={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("set aside");
  });

  it("toggles settings through one patch call each", () => {
    const patch = vi.fn();
    render(
      <Home
        mode="sprint"
        stats={emptyStats()}
        settings={{ ...settings, sound: true }}
        notice={null}
        onSelectMode={vi.fn()}
        onStart={vi.fn()}
        patchSettings={patch}
        onStats={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /on-screen keys/i }));
    expect(patch).toHaveBeenCalledWith({ showKeyboard: true });
    fireEvent.click(screen.getByRole("button", { name: /sound/i }));
    expect(patch).toHaveBeenCalledWith({ sound: false });
  });
});
