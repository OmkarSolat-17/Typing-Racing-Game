import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, Gauge, Hand, Keyboard, Trophy, Volume2, VolumeX } from "lucide-react";
import { DIFFICULTIES, getDifficulty, getMode, MODES, TIPS } from "../game/config";
import { FINGER_COLOR, FINGER_KEYS, FINGER_LABEL, FINGER_ORDER } from "../game/fingers";
import { leaderboard } from "../game/career";
import { sfx } from "../game/audio";
import { formatPercent } from "../game/metrics";
import type { Mode, Settings, Stats } from "../game/types";

const START_KEYS = new Set(["Enter", " ", "Spacebar"]);

interface Props {
  mode: Mode;
  stats: Stats;
  settings: Settings;
  /** A storage problem that the player is entitled to know about, in plain words. */
  notice: string | null;
  onSelectMode: (m: Mode) => void;
  onStart: (m: Mode) => void;
  patchSettings: (p: Partial<Settings>) => void;
  onStats: () => void;
}

const TOGGLES: { key: keyof Settings; label: string; icon: typeof Volume2 }[] = [
  { key: "sound", label: "SOUND", icon: Volume2 },
  { key: "fingerGuide", label: "FINGER GUIDE", icon: Hand },
  { key: "showKeyboard", label: "ON-SCREEN KEYS", icon: Keyboard },
  { key: "screenShake", label: "SCREEN SHAKE", icon: Gauge },
] as const;

/** A mode card *selects*; only START (or ⏎) launches. No accidental races. */
export default function Home({ mode, stats, settings, notice, onSelectMode, onStart, patchSettings, onStats }: Props) {
  const reduce = useReducedMotion();
  const [tip, setTip] = useState(0);
  const armedRef = useRef(false);
  const def = getMode(mode);
  const diff = getDifficulty(settings.difficulty);
  const best = stats.best[mode];

  useEffect(() => {
    const id = window.setInterval(() => setTip((t) => (t + 1) % TIPS.length), 5200);
    return () => window.clearInterval(id);
  }, []);

  // The on-screen keyboard is only a good idea on a touch device unless the player forced it.
  const marquee = useMemo(() => {
    const pool = [
      "KEYRUSH",
      ...MODES.map((m) => m.tag),
      ...DIFFICULTIES.map((d) => d.name),
      "COMBO",
      "PERFECT",
      "SPLIT",
      "LAP",
    ];
    return pool;
  }, []);

  const launch = useCallback(
    (m: Mode) => {
      if (armedRef.current) return;
      armedRef.current = true;
      // This gesture is what WebAudio is waiting for; without it the first race is silent.
      sfx.unlock();
      sfx.ui();
      onStart(m);
    },
    [onStart],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      const interactive = el !== null && /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
      if (interactive && el?.tagName !== "BODY") return;
      if (START_KEYS.has(e.key)) {
        e.preventDefault();
        launch(mode);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      armedRef.current = false;
    };
  }, [mode, launch]);

  const recent = leaderboard(stats, undefined, 5);

  return (
    <div className="screen-scroll relative h-full w-full overflow-y-auto">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-12 overflow-hidden border-b border-line/60"
        aria-hidden
      >
        <motion.div
          className="flex h-full w-max items-center gap-8 whitespace-nowrap px-6 font-display text-2xl tracking-[0.24em] text-cream/10"
          animate={reduce === true ? false : { x: ["0%", "-50%"] }}
          transition={{ duration: 30, ease: "linear", repeat: Infinity }}
        >
          {[...marquee, ...marquee].map((w, i) => (
            <span key={`${w}-${i}`}>{w}</span>
          ))}
        </motion.div>
      </div>

      <div className="relative z-10 mx-auto grid min-h-full w-full max-w-6xl grid-cols-1 gap-5 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col justify-center gap-6">
          <header>
            <p className="label-xs mb-3 text-amber">
              Arcade typing circuit ·{" "}
              {stats.totals.races > 0
                ? `${stats.totals.races} race${stats.totals.races > 1 ? "s" : ""} logged`
                : "no races yet"}
            </p>
            <h1 className="font-display text-[15vw] leading-[0.82] tracking-tight sm:text-[9.5rem] lg:text-[8rem]">
              <span className="block text-cream drop-shadow-[0_0_36px_rgba(255,184,0,0.2)]">KEY</span>
              <span className="-mt-[0.1em] block text-amber drop-shadow-[0_0_44px_rgba(255,90,122,0.45)]">RUSH</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-cream/70 sm:text-base">
              {def.blurb} {def.seconds !== null ? `A ${def.seconds}s clock. ` : ""}
              {def.rivals
                ? `You race a ${def.id === "zen" ? "quiet" : "live "}field. `
                : "No rivals — just you and the words. "}
              Every clean keystroke feeds your boost; every mistake costs points.
            </p>
            <motion.p
              key={tip}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="label-xs mt-3 text-mute"
            >
              TIP · {TIPS[tip]}
            </motion.p>
          </header>

          <div role="radiogroup" aria-label="Race mode" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MODES.map((m) => {
              const active = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    sfx.tick(1);
                    onSelectMode(m.id);
                  }}
                  className={`panel relative overflow-hidden rounded-xl p-3 text-left transition-all ${
                    active
                      ? "-translate-y-1 shadow-[0_20px_44px_-20px_rgba(0,0,0,0.75)]"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  style={{ borderColor: active ? m.accent : "var(--color-line)" }}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: m.accent }} aria-hidden />
                    <h2 className="font-display text-sm" style={{ color: active ? m.accent : undefined }}>
                      {m.name}
                    </h2>
                  </div>
                  <p className="label-xs font-mono leading-relaxed text-mute">{m.tag}</p>
                  <p className="mt-2 font-mono text-[10px] text-cream/50">
                    {m.words} words{m.seconds !== null ? ` · ${m.seconds}s` : " · untimed"}
                    {m.energy ? " · boost tank" : ""}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-cream/50">
                    PB {stats.best[m.id] ? `${stats.best[m.id]?.wpm} WPM` : "—"}
                    {stats.best[m.id] ? ` · ${stats.best[m.id]?.score.toLocaleString()} pts` : ""}
                  </p>
                  {active && (
                    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: m.accent }} aria-hidden />
                  )}
                </button>
              );
            })}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="font-display text-sm">TRACK DIFFICULTY</h2>
              <button
                type="button"
                onClick={onStats}
                className="label-xs flex items-center gap-1.5 text-mute transition-colors hover:text-cream"
              >
                <BarChart3 size={13} aria-hidden /> CAREER ({stats.totals.races})
              </button>
            </div>
            <div
              role="radiogroup"
              aria-label="Difficulty"
              className="flex flex-wrap items-stretch gap-1 rounded-xl border border-line bg-ink-2 p-1"
            >
              {DIFFICULTIES.map((d) => {
                const on = d.id === settings.difficulty;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      sfx.ui();
                      patchSettings({ difficulty: d.id });
                    }}
                    className={`flex-1 rounded-lg px-2 py-2 font-display text-[10px] transition-colors sm:text-xs ${
                      on
                        ? "bg-amber text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                        : "text-mute hover:text-cream"
                    }`}
                  >
                    {d.name}
                    <span
                      className={`ml-1.5 hidden font-mono text-[9px] sm:inline ${on ? "text-ink/60" : "text-mute/70"}`}
                    >
                      {d.hint}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="label-xs mt-2 text-mute">
              {diff.name}: rival field {diff.rivalWpm[0]}–{diff.rivalWpm[1]} WPM · {diff.hint}
              {def.energy ? ` · boost drain ${diff.drain}/s` : ""}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => launch(mode)}
              className="btn-3d flex items-center justify-center gap-3 rounded-xl bg-amber px-6 py-4 font-display text-2xl text-ink sm:text-3xl"
            >
              START ENGINE <span className="text-sm opacity-60">⏎</span>
            </button>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Game toggles">
              {TOGGLES.map(({ key, label, icon: Icon }) => {
                const on = settings[key] === true;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      sfx.ui();
                      patchSettings({ [key]: !on });
                    }}
                    className={`label-xs flex items-center gap-1.5 rounded-lg border px-2.5 py-2 transition-colors ${
                      on
                        ? "border-mint/60 bg-mint/12 text-mint"
                        : "border-line bg-panel-2/60 text-mute hover:text-cream"
                    }`}
                  >
                    {key === "sound" && !on ? <VolumeX size={13} aria-hidden /> : <Icon size={13} aria-hidden />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {notice !== null && (
            <p
              role="alert"
              className="rounded-lg border border-amber/50 bg-amber/10 p-3 text-[11px] leading-relaxed text-amber"
            >
              {notice}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <section className="panel rounded-xl p-4" aria-labelledby="fingormap-h">
            <div className="mb-3 flex items-center gap-2">
              <Hand size={16} className="text-cream/70" aria-hidden />
              <h2 id="fingormap-h" className="font-display text-sm">
                FINGER MAP
              </h2>
              <span className="label-xs ml-auto text-mute">{settings.fingerGuide ? "guide on" : "guide off"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FINGER_ORDER.map((f) => (
                <div key={f} className="rounded-lg border border-line/70 bg-ink-2/60 p-2">
                  <div className="label-xs mb-1.5 font-bold" style={{ color: FINGER_COLOR[f] }}>
                    {FINGER_LABEL[f]}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {FINGER_KEYS[f].map((k) => (
                      <span
                        key={k}
                        className="rounded-[4px] border px-1 py-[3px] font-mono text-[10px] font-bold leading-none text-cream"
                        style={{ borderColor: `${FINGER_COLOR[f]}66`, background: `${FINGER_COLOR[f]}1a` }}
                      >
                        {k === " " ? "SPACE" : k.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-mute">
              These are the same colours the on-screen keyboard and the career charts use — one table, one source of
              truth.
            </p>
          </section>

          <section className="panel rounded-xl p-4" aria-labelledby="form-h">
            <div className="mb-3 flex items-center gap-2">
              <Trophy size={16} className="text-amber/80" aria-hidden />
              <h2 id="form-h" className="font-display text-sm">
                BEST RUNS
              </h2>
            </div>
            {recent.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-mute">
                No eligible race yet. Finish one without skipping a word and it lands here — and starts your records.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {recent.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line/70 bg-ink-2/60 p-2">
                    <span className="font-display text-xs text-amber/90">#{i + 1}</span>
                    <span className="text-[10px] uppercase tracking-widest text-cream/70">
                      {getMode(r.mode).name} · {getDifficulty(r.difficulty).name}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-cream/60">
                      {r.wpm} WPM · {formatPercent(r.accuracy)} · {r.score.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {best !== null && best !== undefined && (
              <p className="label-xs mt-3 flex flex-wrap gap-x-2 text-mute">
                <span className="text-amber">PERSONAL BEST · {mode}</span>
                <span>{best.wpm} WPM</span>
                <span>{formatPercent(best.accuracy)}</span>
                <span>{best.score.toLocaleString()} pts</span>
              </p>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-mute">
              Results are stored only in this browser (localStorage) — nothing is uploaded, and the wipe control lives
              on the career screen.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
