/**
 * The procedural synth. It runs on a real `AudioContext` in the browser and on a scripted
 * fake here — the point is not the waveform, it is that audio can never take the game down:
 * a missing API, a constructor that throws, or a rejected `resume()` must all stay silent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as AudioModule from "../src/game/audio";

/** The module under test, re-imported per test so the singleton `sfx` starts clean. */
type SfxModule = typeof AudioModule;

let log: string[] = [];

class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  sampleRate = 48_000;
  destination = { connect: () => {} };

  constructor() {
    log.push("construct");
  }

  createGain() {
    log.push("gain");
    return node("gain");
  }
  createOscillator() {
    log.push("osc");
    return node("osc");
  }
  createBufferSource() {
    log.push("bufsrc");
    return node("bufsrc");
  }
  createBiquadFilter() {
    log.push("filter");
    return node("filter");
  }
  createBuffer(ch: number, len: number) {
    log.push(`buffer:${ch}x${len}`);
    return { getChannelData: () => new Float32Array(len) };
  }
  resume(): Promise<void> {
    log.push("resume");
    this.state = "running";
    return Promise.resolve();
  }
}

const node = (name: string) => ({
  type: "square" as OscillatorType,
  buffer: null as unknown,
  frequency: {
    value: 0,
    setValueAtTime: (v: number) => log.push(`${name}.freq:${Math.round(v)}`),
    exponentialRampToValueAtTime: (v: number) => log.push(`${name}.slide:${Math.round(v)}`),
  },
  gain: {
    value: 0,
    setValueAtTime: (v: number) => log.push(`${name}.gain:${v}`),
    exponentialRampToValueAtTime: (v: number) => log.push(`${name}.env:${Math.round(v * 1000) / 1000}`),
  },
  connect: () => log.push(`${name}.connect`),
  start: (t?: number) => log.push(`${name}.start:${t ?? 0}`),
  stop: (t?: number) => log.push(`${name}.stop:${t ?? 0}`),
  onended: null,
});

const install = (ctor: unknown) => {
  vi.stubGlobal("AudioContext", ctor);
};

/**
 * `sfx` is a module singleton with a cached context, so each test needs a fresh import.
 * `ctor === null` means "this browser has no WebAudio at all".
 */
async function load(ctor: unknown = FakeAudioContext): Promise<SfxModule> {
  vi.resetModules();
  install(ctor);
  log = [];
  const fresh: SfxModule = await import("../src/game/audio");
  fresh.sfx.muted = false;
  return fresh;
}

const freqs = () => log.filter((l) => l.startsWith("osc.freq")).map((l) => Number(l.split(":")[1]));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("graceful degradation", () => {
  it("does nothing at all when the browser has no WebAudio", async () => {
    // jsdom ships an `AudioContext` of its own, so the property has to be taken away.
    const own = Object.getOwnPropertyDescriptor(window, "AudioContext");
    Object.defineProperty(window, "AudioContext", { configurable: true, writable: true, value: undefined });
    const { sfx } = await load(null);
    try {
      expect(sfx.unlock()).toBe(false);
      for (const call of [
        () => sfx.key(3),
        () => sfx.error(),
        () => sfx.word(2),
        () => sfx.finish(1),
        () => sfx.crash(),
        () => sfx.tick(2),
        () => sfx.go(),
      ]) {
        expect(call()).toBeUndefined();
      }
      expect(log).toEqual([]);
    } finally {
      if (own) Object.defineProperty(window, "AudioContext", own);
    }
  });

  it("survives a context that refuses to be created", async () => {
    class Broken {
      constructor() {
        throw new Error("audio device busy");
      }
    }
    const { sfx } = await load(Broken);
    expect(sfx.unlock()).toBe(false);
    expect(() => sfx.key(1)).not.toThrow();
    expect(() => sfx.error()).not.toThrow();
  });

  it("retries a suspended context and swallows a rejected resume()", async () => {
    const Suspended = class extends FakeAudioContext {
      constructor() {
        super();
        this.state = "suspended";
        // The autoplay policy can reject at any time; the synth must not create a promise
        // nobody is holding.
        this.resume = () => {
          log.push("resume-blocked");
          return Promise.reject(new Error("autoplay blocked"));
        };
      }
    };
    const { sfx } = await load(Suspended);
    expect(sfx.unlock()).toBe(true);
    await vi.advanceTimersByTimeAsync(5);
    expect(log).toContain("resume-blocked");
  });

  it("short-circuits before touching the context while muted", async () => {
    const { sfx } = await load();
    expect(sfx.unlock()).toBe(true);
    sfx.muted = true;
    log = [];
    sfx.key(5);
    sfx.error();
    sfx.word(3);
    expect(log).toEqual([]);
  });
});

describe("synthesis", () => {
  it("climbs a pentatonic ladder with the combo and stays inside a sane band", async () => {
    const { sfx } = await load();
    sfx.unlock();
    log = [];
    sfx.key(0);
    expect(freqs()[0]).toBe(392);
    log = [];
    sfx.key(4);
    expect(freqs()[0] as number).toBeGreaterThan(392);
    log = [];
    sfx.key(999);
    expect(freqs()[0]).toBeLessThanOrEqual(2000);
  });

  it("resets the ladder after a mistake, so a broken streak starts over audibly", async () => {
    const { sfx } = await load();
    sfx.unlock();
    sfx.key(9);
    log = [];
    sfx.error();
    expect(log).toContain("bufsrc"); // the noise burst
    expect(freqs()).toContain(150);
    log = [];
    sfx.key(0);
    expect(freqs()[0]).toBe(392);
  });

  it("ends the countdown on a distinct high ping", async () => {
    const { sfx } = await load();
    sfx.unlock();
    const at = (n: number) => {
      log = [];
      sfx.tick(n);
      return freqs()[0];
    };
    expect(at(3)).toBe(520);
    expect(at(2)).toBe(520);
    expect(at(0)).toBe(880);
  });

  it("gives a win a longer fanfare than a mid-field finish", async () => {
    const { sfx } = await load();
    sfx.unlock();
    log = [];
    sfx.finish(1);
    const win = freqs().length;
    log = [];
    sfx.finish(4);
    const other = freqs().length;
    expect(win).toBeGreaterThan(other);
  });

  it("keeps every other cue wired to a sound", async () => {
    const { sfx } = await load();
    sfx.unlock();
    const cues: [string, () => void][] = [
      ["skip", () => sfx.skip()],
      ["warn", () => sfx.warn()],
      ["overtake up", () => sfx.overtake(true)],
      ["overtake down", () => sfx.overtake(false)],
      ["ui", () => sfx.ui()],
      ["ui hover", () => sfx.ui(true)],
      ["badge", () => sfx.badge()],
      ["crash", () => sfx.crash()],
      ["go", () => sfx.go()],
      ["paused", () => sfx.paused()],
      ["resumed", () => sfx.resumed()],
      ["word", () => sfx.word(2)],
    ];
    for (const [name, call] of cues) {
      log = [];
      call();
      expect(log.length, name).toBeGreaterThan(0);
    }
  });
});
