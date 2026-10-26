import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, ChevronRight, Fingerprint, Gauge, Keyboard, Play, Volume2, VolumeX, Zap } from "lucide-react";
import type { Mode, Settings, Stats } from "../game/types";
import { DIFFICULTIES, MODES } from "../game/types";
import { buildTrack } from "../game/words";
import { leaderboard } from "../game/storage";
import { WordTrack } from "../components/WordTrack";
import { TouchKeyboard } from "../components/TouchKeyboard";
import { sfx } from "../game/audio";
import type { FxHandle } from "../components/FxCanvas";

interface Props {
  stats: Stats;
  settings: Settings;
  setSettings: (s: Settings) => void;
  fx: React.RefObject<FxHandle | null>;
  onStart: (mode: Mode) => void;
  onStats: () => void;
}

const TIPS = [
  "HOME ROW IS HOME BASE · ASDF JKL;",
  "EYES ON THE SCREEN, NOT THE KEYS",
  "SLOW IS SMOOTH · SMOOTH IS FAST",
  "FOUR FLAWLESS WORDS = COMBO x2",
  "TAB SKIPS A WORD YOU CAN'T SPELL",
  "ZEN LANE HAS NO TIMER — LEARN NEW KEYS THERE",
  "OVERDRIVE: EVERY CLEAN LETTER REFUELS YOU",
];

export default function Home({ stats, settings, setSettings, fx, onStart, onStats }: Props) {
  const [mode, setMode] = useState<Mode>("sprint");
  const def = MODES.find((m) => m.id === mode)!;

  /* ---------- attract-mode demo (also fully playable) ---------- */
  const demoWords = useMemo(() => buildTrack("easy", 12), []);
  const d = useRef({ idx: 0, typed: "", perfect: [] as boolean[], hold: 0, advance: false, errs: 0 });
  const lastUser = useRef(0);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [flash, setFlash] = useState<{ k: string; n: number; ok: boolean } | null>(null);
  const [autoPilot, setAutoPilot] = useState(true);

  const demoPress = (ch: string, byUser: boolean) => {
    const s = d.current;
    const w = demoWords[s.idx] ?? "";
    if (byUser) {
      lastUser.current = performance.now();
      setAutoPilot(false);
    }
    if (ch === w[s.typed.length]) {
      s.typed += ch;
      setFlash({ k: ch, n: performance.now(), ok: true });
      if (s.typed.length === w.length) {
        s.advance = true;
        s.hold = byUser ? 2 : 4;
        s.perfect[s.idx] = s.errs === 0;
        s.errs = 0;
      }
    } else {
      s.errs++;
      setFlash({ k: ch, n: performance.now(), ok: false });
      if (byUser) fx.current?.burst(window.innerWidth / 2, window.innerHeight * 0.5, "#ff5a7a", 10, 0.9);
    }
    force();
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = d.current;
      if (!autoPilot && performance.now() - lastUser.current < 3200) return;
      if (!autoPilot && performance.now() - lastUser.current >= 3200) setAutoPilot(true);
      if (s.hold > 0) {
        s.hold--;
        if (s.hold === 0 && s.advance) {
          s.advance = false;
          s.idx = (s.idx + 1) % demoWords.length;
          s.typed = "";
        }
        force();
        return;
      }
      const w = demoWords[s.idx] ?? "";
      if (w) demoPress(w[s.typed.length], false);
    }, 105);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPilot, demoWords]);

  /* ---------- global shortcuts ---------- */
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        onStart(mode);
        return;
      }
      const n = Number(ev.key);
      if (n >= 1 && n <= MODES.length) {
        ev.preventDefault();
        setMode(MODES[n - 1].id);
        sfx.ui(true);
        return;
      }
      if (ev.key === "Backspace") {
        ev.preventDefault();
        d.current.typed = d.current.typed.slice(0, -1);
        lastUser.current = performance.now();
        setAutoPilot(false);
        force();
        return;
      }
      if (ev.key.length === 1 && !ev.repeat && ev.key !== " ") {
        ev.preventDefault();
        demoPress(ev.key, true);
      }
    };
    window.addEventListener("keydown", down, { passive: false });
    return () => window.removeEventListener("keydown", down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, onStart, onStats]);

  const board = useMemo(() => leaderboard(stats), [stats]);
  const nextKey = demoWords[d.current.idx]?.[d.current.typed.length] ?? "";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full w-full overflow-y-auto overscroll-contain">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-3 pt-3 pb-2 sm:px-5 sm:pt-5">
        {/* ---- header ---- */}
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex items-end gap-2">
            <motion.div
              initial={{ rotate: -8, scale: 0.8, opacity: 0 }}
              animate={{ rotate: -2.5, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 16 }}
              className="font-display text-[clamp(2rem,6.5vw,3.4rem)] leading-[0.85] tracking-tight"
            >
              <span className="text-cream">KEY</span>
              <span className="text-amber">RUSH</span>
            </motion.div>
            <div className="mb-1 hidden sm:block">
              <div className="label-xs text-mute">Arcade typing racer</div>
              <div className="label-xs text-coral">Touch + keyboard</div>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-xl border border-line bg-panel px-1.5 py-1">
              <Gauge size={13} className="ml-1 text-mute" />
              {DIFFICULTIES.map((dl) => (
                <button
                  key={dl.id}
                  onClick={() => {
                    setSettings({ ...settings, difficulty: dl.id });
                    sfx.ui();
                  }}
                  title={dl.hint}
                  className={`label-xs rounded-lg px-2 py-1.5 transition-all ${
                    settings.difficulty === dl.id ? "text-ink" : "text-mute hover:text-cream"
                  }`}
                  style={settings.difficulty === dl.id ? { background: "#ffb020" } : undefined}
                >
                  {dl.name}
                </button>
              ))}
            </div>
            <IconToggle
              on={settings.fingerGuide}
              onClick={() => setSettings({ ...settings, fingerGuide: !settings.fingerGuide })}
              title="Finger guide (colour-coded keys)"
            >
              <Fingerprint size={15} />
            </IconToggle>
            <IconToggle
              on={settings.showKeyboard}
              onClick={() => setSettings({ ...settings, showKeyboard: !settings.showKeyboard })}
              title="On-screen keyboard"
            >
              <Keyboard size={15} />
            </IconToggle>
            <IconToggle
              on={settings.sound}
              onClick={() => {
                sfx.unlock();
                setSettings({ ...settings, sound: !settings.sound });
                sfx.muted = settings.sound;
                sfx.ui();
              }}
              title="Sound"
            >
              {settings.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </IconToggle>
            <button
              onClick={onStats}
              className="btn-3d flex items-center gap-1.5 rounded-xl border border-line bg-panel-2 px-3 py-2 font-display text-[11px] text-cream transition-colors hover:border-sky hover:text-sky"
            >
              <BarChart3 size={14} /> CAREER
            </button>
          </div>
        </header>

        {/* ---- main split ---- */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
          {/* modes */}
          <section className="order-2 flex flex-col gap-2 lg:order-1">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-xl text-cream">PICK YOUR RACE</h2>
              <span className="label-xs text-mute">keys 1-4</span>
            </div>
            {MODES.map((m, i) => {
              const best = stats.best[m.id];
              const active = m.id === mode;
              return (
                <motion.button
                  key={m.id}
                  onClick={(e) => {
                    sfx.ui(active);
                    if (active) {
                      const r = e.currentTarget.getBoundingClientRect();
                      fx.current?.burst(r.left + r.width / 2, r.top + r.height / 2, m.accent, 18, 1.1);
                      onStart(m.id);
                    } else setMode(m.id);
                  }}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.985 }}
                  className="panel group relative overflow-hidden rounded-xl px-3 py-2.5 text-left"
                  style={{
                    borderColor: active ? m.accent : undefined,
                    boxShadow: active ? `0 0 0 1px ${m.accent}, 0 16px 34px -22px ${m.accent}` : undefined,
                  }}
                >
                  <span className="absolute inset-y-0 left-0 w-[5px]" style={{ background: active ? m.accent : "#2c3866" }} />
                  <div className="flex items-center gap-3 pl-2">
                    <span
                      className="font-display text-2xl leading-none sm:text-3xl"
                      style={{ color: active ? m.accent : "#2c3866" }}
                    >
                      0{i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-base leading-none text-cream sm:text-lg">{m.name}</span>
                        <span
                          className="label-xs rounded px-1.5 py-0.5"
                          style={{ color: m.accent, background: `${m.accent}1f` }}
                        >
                          {m.tag}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-mute">{m.blurb}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="label-xs text-mute">best</div>
                      <div className="font-display text-lg leading-none" style={{ color: best ? m.accent : "#2c3866" }}>
                        {best ? best.wpm : "—"}
                      </div>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-mute transition-transform group-hover:translate-x-1" style={{ color: active ? m.accent : undefined }} />
                  </div>
                </motion.button>
              );
            })}

            <motion.button
              onClick={() => onStart(mode)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="btn-3d mt-1 flex items-center justify-center gap-3 rounded-2xl px-6 py-4 font-display text-lg text-ink sm:text-2xl"
              style={{ background: def.accent }}
            >
              <Play size={22} fill="currentColor" /> START {def.name}
              <span className="rounded border border-ink/25 px-1.5 py-0.5 font-mono text-[10px] opacity-70">ENTER</span>
            </motion.button>

            <div className="grid grid-cols-4 gap-2">
              {[
                ["BEST WPM", String(stats.totals.bestWpm), "#ffb020"],
                ["RACES", String(stats.runs.length), "#4cc9ff"],
                ["WORDS", String(stats.totals.words), "#35e0a1"],
                ["WINS", String(stats.totals.firstPlaces), "#ff5a7a"],
              ].map(([k, v, c]) => (
                <div key={k} className="panel rounded-lg px-2 py-1.5 text-center">
                  <div className="label-xs text-mute">{k}</div>
                  <div className="font-display text-base leading-tight sm:text-lg" style={{ color: c }}>
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* attract panel */}
          <section className="order-1 flex flex-col gap-2 lg:order-2">
            <div className="panel relative overflow-hidden rounded-2xl">
              <div className="pointer-events-none absolute inset-0 opacity-70">
                <div className="road-stripes road-stripes-slow absolute inset-x-0 top-0 h-full" />
              </div>
              <div className="relative flex items-center justify-between border-b border-line px-3 py-2">
                <span className="label-xs flex items-center gap-1.5 text-amber">
                  <Zap size={12} /> {autoPilot ? "ATTRACT MODE — TYPE ALONG!" : "YOU'RE DRIVING"}
                </span>
                <span className="label-xs text-mute">warm-up lane · no score</span>
              </div>
              <div className="relative px-2 py-2">
                <WordTrack
                  words={demoWords}
                  idx={d.current.idx}
                  typed={d.current.typed}
                  accent="#4cc9ff"
                  perfect={d.current.perfect}
                />
              </div>
              <div className="relative border-t border-line bg-ink/40 px-2 py-2">
                <TouchKeyboard
                  nextKey={nextKey}
                  word={demoWords[d.current.idx]}
                  flash={flash}
                  guide={settings.fingerGuide}
                  onPress={(ch) => demoPress(ch, true)}
                  onBack={() => {
                    d.current.typed = d.current.typed.slice(0, -1);
                    lastUser.current = performance.now();
                    setAutoPilot(false);
                    force();
                  }}
                  onSkip={() => {
                    d.current.idx = (d.current.idx + 1) % demoWords.length;
                    d.current.typed = "";
                    force();
                  }}
                  compact
                />
              </div>
            </div>

            <div className="panel rounded-2xl px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="label-xs text-mute">Hall of fame · top scores</span>
                <button onClick={onStats} className="label-xs text-sky hover:underline">
                  ALL STATS →
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                {board.length === 0 && (
                  <p className="py-3 text-center font-mono text-[11px] text-mute">
                    Empty grid. Set the first record.
                  </p>
                )}
                {board.map((r, i) => {
                  const m = MODES.find((x) => x.id === r.mode)!;
                  return (
                    <div key={r.id} className="flex items-center gap-2 rounded-lg border border-line/60 bg-ink-2/50 px-2 py-1.5">
                      <span className="font-display text-xs" style={{ color: i === 0 ? "#ffb020" : i === 1 ? "#4cc9ff" : "#8b96c4" }}>
                        {i + 1}
                      </span>
                      <span className="h-2 w-2 rounded-full" style={{ background: m.accent }} />
                      <span className="font-mono text-[11px] text-cream">
                        {r.wpm} wpm · {r.accuracy}%
                      </span>
                      <span className="label-xs ml-auto text-mute">{m.tag}</span>
                      <span className="font-display text-xs text-cream">{r.score.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ---- ticker ---- */}
      <div className="sticky bottom-0 mt-1 overflow-hidden border-y border-line bg-ink/85 py-1.5 backdrop-blur">
        <div className="marquee-track gap-8">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex shrink-0 gap-8">
              {TIPS.map((t) => (
                <span key={t} className="label-xs whitespace-nowrap text-mute">
                  <span className="text-amber">▸</span> {t}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function IconToggle({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className="btn-3d grid h-[38px] w-[38px] place-items-center rounded-xl border transition-colors"
      style={{
        borderColor: on ? "#35e0a1" : "#2c3866",
        color: on ? "#35e0a1" : "#8b96c4",
        background: on ? "rgba(53,224,161,.12)" : "rgba(20,27,52,.9)",
      }}
    >
      {children}
    </button>
  );
}
