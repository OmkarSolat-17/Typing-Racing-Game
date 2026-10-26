/** The constructor pair as browsers actually ship it (Safari still needs the prefixed alias). */
type AudioCtors = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

/**
 * Tiny procedural synth — no audio assets, ~0 latency, and it degrades silently when the
 * engine is unavailable (no WebAudio, autoplay policy, or a suspended context).
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.ctx === null) {
      const w = window as unknown as AudioCtors;
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (Ctor === undefined) return null;
      try {
        const ctx = new Ctor();
        const master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        this.ctx = ctx;
        this.master = master;
      } catch {
        // A blocked or exhausted audio device must never take the game down with it.
        this.ctx = null;
        this.master = null;
        return null;
      }
    }
    const ctx = this.ctx;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {
        /* autoplay policy not satisfied yet; the next gesture will retry */
      });
    }
    return ctx;
  }

  /** Call from a real user gesture; returns whether audio is live. */
  unlock(): boolean {
    return this.ensure() !== null;
  }

  private tone(freq: number, dur: number, type: OscillatorType = "square", gain = 0.18, slideTo?: number, delay = 0) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, gain = 0.12, hp = 800) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  /** pentatonic ladder so any streak sounds musical */
  private scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
  private step = 0;

  key(combo: number) {
    this.step = Math.min(this.scale.length - 1, Math.max(0, combo) % this.scale.length);
    const f = 392 * Math.pow(2, (this.scale[this.step] ?? 0) / 12);
    this.tone(f, 0.06, "square", 0.09);
    this.tone(f * 2, 0.04, "sine", 0.045);
  }

  resetScale() {
    this.step = 0;
  }

  word(mult: number) {
    const base = 523 + mult * 60;
    this.tone(base, 0.09, "triangle", 0.16);
    this.tone(base * 1.5, 0.09, "triangle", 0.11, undefined, 0.05);
    this.tone(base * 2, 0.14, "sine", 0.1, undefined, 0.1);
    this.noise(0.12, 0.05, 1600);
  }

  error() {
    this.tone(150, 0.16, "sawtooth", 0.14, 70);
    this.noise(0.1, 0.1, 400);
    // A broken combo also breaks the melodic ladder, so the streak starts over.
    this.resetScale();
  }

  paused() {
    this.tone(420, 0.14, "sine", 0.1, 280);
  }

  resumed() {
    this.tone(300, 0.12, "sine", 0.1, 470);
  }

  skip() {
    this.tone(300, 0.12, "sine", 0.1, 140);
  }

  tick(n: number) {
    this.tone(n === 0 ? 880 : 520, 0.1, "square", 0.14);
  }

  go() {
    [0, 4, 7, 12].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.22, "square", 0.14, undefined, i * 0.055));
    this.noise(0.4, 0.08, 200);
  }

  overtake(up: boolean) {
    this.tone(up ? 440 : 660, 0.22, "sawtooth", 0.1, up ? 990 : 220);
    this.noise(0.25, 0.06, 900);
  }

  warn() {
    this.tone(220, 0.1, "square", 0.1);
  }

  finish(place: number) {
    if (place === 1) {
      [0, 4, 7, 12, 16, 19].forEach((s, i) =>
        this.tone(523 * Math.pow(2, s / 12), 0.3, "triangle", 0.16, undefined, i * 0.09),
      );
    } else {
      [0, 5, 7].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.3, "triangle", 0.14, undefined, i * 0.11));
    }
    this.noise(0.5, 0.06, 300);
  }

  crash() {
    this.tone(200, 0.7, "sawtooth", 0.2, 45);
    this.noise(0.7, 0.18, 120);
  }

  ui(hover = false) {
    this.tone(hover ? 760 : 520, 0.05, "sine", 0.07);
  }

  badge() {
    [0, 7, 12, 19].forEach((s, i) => this.tone(659 * Math.pow(2, s / 12), 0.25, "sine", 0.12, undefined, i * 0.07));
  }
}

export const sfx = new Sfx();
