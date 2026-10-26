import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { Home, RotateCcw, Play as PlayIcon } from "lucide-react";
import { useEngine, type GameEvent } from "../game/useEngine";
import type { Difficulty, Mode, RunRecord, Settings } from "../game/types";
import { MODES } from "../game/types";
import { Hud } from "../components/Hud";
import { WordTrack } from "../components/WordTrack";
import { RivalTrack } from "../components/RivalTrack";
import { TouchKeyboard, fingerOf, FINGER_LABEL } from "../components/TouchKeyboard";
import { sfx } from "../game/audio";
import type { FxHandle } from "../components/FxCanvas";

interface Props {
  mode: Mode;
  difficulty: Difficulty;
  settings: Settings;
  fx: React.RefObject<FxHandle | null>;
  onFinish: (r: RunRecord) => void;
  onQuit: () => void;
  onToggleSound: () => void;
}

type EngineView = {
  words: string[];
  idx: number;
  typed: string;
  combo: number;
  dist: number;
};

export default function Play({ mode, difficulty, settings, fx, onFinish, onQuit, onToggleSound }: Props) {
  const [rivalNames, setRivalNames] = useState<string[]>([]);
  const def = MODES.find((m) => m.id === mode)!;
  const accent = def.accent;
  const focusRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineView | null>(null);
  const perfectMap = useRef<boolean[]>([]);
  const shakeCtrl = useAnimationControls();
  const [flashKey, setFlashKey] = useState<{ k: string; n: number; ok: boolean } | null>(null);
  const [banner, setBanner] = useState<{ text: string; color: string; n: number } | null>(null);
  const resultRef = useRef<RunRecord | null>(null);
  const finishedRef = useRef(false);

  /** bursts spawn exactly on the live caret (or the word box when it completes) */
  const caretPos = useCallback(() => {
    const host = focusRef.current;
    if (!host) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const caret = host.querySelector('[data-caret="1"]') as HTMLElement | null;
    const r = (caret ?? host).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, []);

  const shake = useCallback(
    (power = 1) => {
      if (!settings.screenShake) return;
      const d = 5 * power;
      void shakeCtrl.start({
        x: [0, -d, d * 0.8, -d * 0.6, d * 0.3, 0],
        y: [0, d * 0.5, -d * 0.5, d * 0.3, 0, 0],
        transition: { duration: 0.26, ease: "easeOut" },
      });
    },
    [settings.screenShake, shakeCtrl]
  );

  const onEvent = useCallback(
    (e: GameEvent) => {
      const s = engineRef.current;
      switch (e.type) {
        case "countdown":
          sfx.tick(e.n);
          fx.current?.ring(window.innerWidth / 2, window.innerHeight * 0.42, accent, 20);
          break;
        case "go":
          sfx.go();
          fx.current?.flash(accent, 0.28);
          fx.current?.streaks(accent, 14);
          shake(1.6);
          setBanner({ text: "GO!", color: accent, n: Date.now() });
          break;
        case "key": {
          const p = caretPos();
          if (e.ok) {
            sfx.key(e.combo);
            fx.current?.burst(p.x, p.y, "#35e0a1", 5, 0.6);
          }
          setFlashKey({ k: e.char, n: Date.now(), ok: e.ok });
          break;
        }
        case "error": {
          const p = caretPos();
          sfx.error();
          fx.current?.burst(p.x, p.y, "#ff5a7a", 16, 1.2);
          fx.current?.flash("#ff5a7a", 0.16);
          shake(1.5);
          setFlashKey({ k: e.char, n: Date.now(), ok: false });
          break;
        }
        case "word": {
          perfectMap.current[e.idx] = e.perfect;
          const p = caretPos();
          sfx.word(e.mult);
          const pts = (50 + e.word.length * 10) * e.mult + (e.perfect ? 25 : 0);
          fx.current?.burst(p.x, p.y, e.perfect ? accent : "#4cc9ff", 26 + e.mult * 6, 1.3 + e.mult * 0.12);
          fx.current?.ring(p.x, p.y, e.perfect ? "#35e0a1" : accent, 12);
          fx.current?.popup(p.x, p.y - 30, `+${pts}`, e.mult >= 3 ? "#ff5a7a" : accent, 20 + e.mult * 2);
          if (e.mult >= 3) fx.current?.streaks(accent, 6);
          if (e.perfect && s && s.combo > 0 && s.combo % 4 === 0) {
            setBanner({ text: `x${e.mult} COMBO`, color: "#ff5a7a", n: Date.now() });
            fx.current?.flash("#ff5a7a", 0.14);
            shake(1.1);
          } else {
            shake(0.55);
          }
          break;
        }
        case "skip":
          sfx.skip();
          setBanner({ text: "SKIPPED", color: "#8b96c4", n: Date.now() });
          break;
        case "overtake": {
          sfx.overtake(e.up);
          setBanner({
            text: e.up ? `YOU PASS ${e.rival}` : `${e.rival} PASSES YOU`,
            color: e.up ? "#35e0a1" : "#ff5a7a",
            n: Date.now(),
          });
          fx.current?.streaks(e.up ? "#35e0a1" : "#ff5a7a", 10);
          shake(e.up ? 0.8 : 1.2);
          break;
        }
        case "warn":
          sfx.warn();
          fx.current?.flash("#ff5a7a", 0.2);
          setBanner({ text: "BOOST LOW — TYPE!", color: "#ff5a7a", n: Date.now() });
          shake(1);
          break;
        case "finish": {
          resultRef.current = e.result;
          if (finishedRef.current) return;
          finishedRef.current = true;
          const cx = window.innerWidth / 2;
          const cy = window.innerHeight * 0.4;
          if (e.result.finished) {
            sfx.finish(e.result.place);
            fx.current?.flash(e.result.place === 1 ? "#ffb020" : "#4cc9ff", 0.35);
            fx.current?.confetti(cx, cy, ["#ffb020", "#ff5a7a", "#35e0a1", "#4cc9ff", "#f3efe4"], 90);
            fx.current?.ring(cx, cy, "#ffb020", 30);
            setBanner({
              text: e.result.place === 1 ? "VICTORY!" : e.result.place === 2 ? "2ND PLACE" : "3RD PLACE",
              color: e.result.place === 1 ? "#ffb020" : "#4cc9ff",
              n: Date.now(),
            });
          } else {
            sfx.crash();
            fx.current?.flash("#ff5a7a", 0.45);
            fx.current?.burst(cx, cy, "#ff5a7a", 60, 2.2);
            setBanner({ text: "BOOST DRAINED", color: "#ff5a7a", n: Date.now() });
          }
          shake(2.4);
          window.setTimeout(() => onFinish(resultRef.current!), 1250);
          break;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accent, caretPos, fx, onFinish, shake]
  );

  const engine = useEngine({ mode, difficulty, onEvent });
  const engRef = useRef(engine);
  engRef.current = engine;
  engineRef.current = engine.stateRef.current;

  const { snap } = engine;

  const launch = useCallback(() => {
    perfectMap.current = [];
    finishedRef.current = false;
    resultRef.current = null;
    setBanner(null);
    fx.current?.clear();
    engRef.current.start();
    setRivalNames(engRef.current.stateRef.current.rivals.map((r) => r.name));
  }, [fx]);

  useEffect(() => {
    sfx.muted = !settings.sound;
    launch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sfx.muted = !settings.sound;
  }, [settings.sound]);

  /* ---- physical keyboard: tight, no input element, no IME lag ---- */
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      const eng = engRef.current;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const st = eng.snap.status;
      // Escape only — never bind a printable letter to pause
      if (ev.key === "Escape") {
        ev.preventDefault();
        if (st === "playing" || st === "paused") eng.togglePause();
        return;
      }
      if (st !== "playing") return;
      if (ev.key === "Backspace") {
        ev.preventDefault();
        eng.backspace();
        return;
      }
      if (ev.key === "Tab" || ev.key === "ArrowDown") {
        ev.preventDefault();
        eng.skip();
        return;
      }
      // words auto-submit — a habit-space is silently swallowed, never punished
      if (ev.key === " ") {
        ev.preventDefault();
        return;
      }
      if (ev.key.length === 1 && !ev.repeat) {
        ev.preventDefault();
        eng.press(ev.key);
      }
    };
    window.addEventListener("keydown", down, { passive: false });
    return () => window.removeEventListener("keydown", down);
  }, []);

  const nextKey = snap.words[snap.idx]?.[snap.typed.length] ?? "";

  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 1050);
    return () => window.clearTimeout(t);
  }, [banner]);

  return (
    <motion.div animate={shakeCtrl} className="relative h-full w-full overflow-hidden">
      <Hud
        snap={snap}
        def={def}
        accent={accent}
        sound={settings.sound}
        onToggleSound={() => {
          sfx.ui();
          onToggleSound();
        }}
        onPause={engine.togglePause}
        onQuit={onQuit}
      />

      <div className="flex h-full w-full flex-col gap-1.5 px-2 pb-2 pt-[116px] sm:gap-3 sm:px-4 sm:pb-4 sm:pt-[112px]">
        <div className="shrink-0">
          <RivalTrack stateRef={engine.stateRef} accent={accent} rivalNames={rivalNames} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <WordTrack
            words={snap.words}
            idx={snap.idx}
            typed={snap.typed}
            accent={accent}
            perfect={perfectMap.current}
            focusRef={focusRef}
          />
        </div>

        <div className="shrink-0">
          {settings.showKeyboard ? (
            <>
              <div className="mx-auto mb-1 hidden max-w-[720px] items-center justify-center gap-3 opacity-60 sm:flex">
                <span className="label-xs text-mute">TAB skip</span>
                <span className="label-xs text-mute">⌫ delete</span>
                <span className="label-xs text-mute">ESC pause</span>
              </div>
              <TouchKeyboard
                nextKey={nextKey}
                word={snap.words[snap.idx]}
                flash={flashKey}
                guide={settings.fingerGuide}
                onPress={engine.press}
                onBack={engine.backspace}
                onSkip={engine.skip}
                disabled={snap.status !== "playing"}
              />
            </>
          ) : (
            <NextKeyGuide
              nextKey={nextKey}
              accent={accent}
              guide={settings.fingerGuide}
              flash={flashKey}
              onSkip={engine.skip}
              onBack={engine.backspace}
            />
          )}
        </div>
      </div>

      {/* countdown */}
      <AnimatePresence>
        {snap.status === "countdown" && (
          <motion.div
            key="cd"
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-ink/55 backdrop-blur-[2px]"
          >
            <motion.div
              key={snap.countdown}
              initial={{ scale: 2.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 18 }}
              className="font-display text-[26vw] leading-none sm:text-[16rem]"
              style={{ color: accent, textShadow: `0 0 60px ${accent}88` }}
            >
              {snap.countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* event banner */}
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.n}
            initial={{ opacity: 0, scale: 0.6, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.3, y: -20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="pointer-events-none absolute inset-x-0 top-[32%] z-40 text-center"
          >
            <span
              className="font-display text-[7vw] leading-none sm:text-5xl"
              style={{ color: banner.color, textShadow: `0 4px 30px ${banner.color}66, 0 0 4px #000` }}
            >
              {banner.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* pause */}
      <AnimatePresence>
        {snap.status === "paused" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 grid place-items-center bg-ink/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ y: 24, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              className="panel w-[min(92vw,420px)] rounded-2xl p-6 text-center"
            >
              <div className="label-xs mb-2" style={{ color: accent }}>
                Race paused
              </div>
              <h2 className="font-display text-4xl text-cream">PIT STOP</h2>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  ["WPM", String(snap.wpm)],
                  ["SCORE", snap.score.toLocaleString()],
                  ["ACC", `${snap.accuracy.toFixed(0)}%`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-line bg-ink-2/70 p-2">
                    <div className="label-xs text-mute">{k}</div>
                    <div className="font-display text-lg text-cream">{v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={engine.togglePause}
                  className="btn-3d flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-display text-ink"
                  style={{ background: accent }}
                >
                  <PlayIcon size={18} /> RESUME
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={launch}
                    className="btn-3d flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-4 py-3 font-display text-sm text-cream"
                  >
                    <RotateCcw size={16} /> RESTART
                  </button>
                  <button
                    onClick={onQuit}
                    className="btn-3d flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-4 py-3 font-display text-sm text-cream"
                  >
                    <Home size={16} /> MENU
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Slim desktop guide bar shown when the on-screen keyboard is hidden. */
function NextKeyGuide({
  nextKey,
  accent,
  guide,
  flash,
  onSkip,
  onBack,
}: {
  nextKey: string;
  accent: string;
  guide: boolean;
  flash: { k: string; n: number; ok: boolean } | null;
  onSkip: () => void;
  onBack: () => void;
}) {
  const finger = nextKey ? fingerOf(nextKey) : null;
  const lit = flash && performance.now() - flash.n < 130 ? flash : null;
  return (
    <div className="mx-auto flex w-full max-w-[760px] items-center gap-3">
      <div className="panel flex flex-1 items-center gap-3 rounded-xl px-3 py-2">
        <motion.div
          key={nextKey + (lit?.n ?? 0)}
          initial={{ scale: 1.16 }}
          animate={{ scale: 1 }}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border-2 font-mono text-xl font-extrabold"
          style={{
            borderColor: lit ? (lit.ok ? "#35e0a1" : "#ff5a7a") : accent,
            color: lit ? (lit.ok ? "#35e0a1" : "#ff5a7a") : "#f3efe4",
            background: lit ? (lit.ok ? "rgba(53,224,161,.16)" : "rgba(255,90,122,.16)") : `${accent}14`,
            boxShadow: `0 0 22px -6px ${lit ? (lit.ok ? "#35e0a1" : "#ff5a7a") : accent}`,
          }}
        >
          {lit ? lit.k : nextKey || "·"}
        </motion.div>
        <div className="min-w-0">
          <div className="label-xs text-mute">{guide && finger ? `Use your ${FINGER_LABEL[finger].toLowerCase()}` : "Next key"}</div>
          <div className="truncate font-mono text-[11px] text-cream/70">
            eyes on the words · hands on home row <span className="text-amber">ASDF JKL;</span>
          </div>
        </div>
      </div>
      <button
        onClick={onBack}
        className="btn-3d label-xs rounded-xl border border-coral/50 bg-coral/12 px-3 py-3 font-bold text-coral"
      >
        ⌫ DELETE
      </button>
      <button
        onClick={onSkip}
        className="btn-3d label-xs rounded-xl border border-line bg-panel-2 px-3 py-3 font-bold text-mute"
      >
        SKIP ▸ TAB
      </button>
    </div>
  );
}
