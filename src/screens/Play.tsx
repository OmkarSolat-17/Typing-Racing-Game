import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { Home, RotateCcw, Play as PlayIcon } from "lucide-react";
import { useEngine, type GameEvent } from "../game/useEngine";
import { getMode, HANDOFF, PALETTE } from "../game/config";
import { sfx } from "../game/audio";
import { Hud } from "../components/Hud";
import { WordTrack } from "../components/WordTrack";
import { RivalTrack } from "../components/RivalTrack";
import { TouchKeyboard, type KeyFlash } from "../components/TouchKeyboard";
import { NextKeyGuide } from "../components/NextKeyGuide";
import { useFocusTrap } from "../game/useFocusTrap";
import type { FxHandle } from "../components/FxCanvas";
import type { Difficulty, Mode, RunRecord, Settings } from "../game/types";

interface Props {
  mode: Mode;
  difficulty: Difficulty;
  settings: Settings;
  fx: React.RefObject<FxHandle | null>;
  /** Persist the run. Called synchronously when the race settles, so a quit cannot lose it. */
  onSettled: (r: RunRecord) => void;
  /** Navigate to the results screen. Deferred so the crash/victory FX get airtime. */
  onFinish: (r: RunRecord) => void;
  onQuit: () => void;
  onToggleSound: () => void;
}

interface Banner {
  text: string;
  color: string;
  seq: number;
}

/** Keys that read as control input rather than typing, in any layout. */
const CONTROL_KEYS = new Set([
  "Dead",
  "Unidentified",
  "Process",
  "Alt",
  "Control",
  "Meta",
  "Shift",
  "CapsLock",
  "Tab",
  "Backspace",
  "Escape",
  "Enter",
]);

export default function Play({ mode, difficulty, settings, fx, onSettled, onFinish, onQuit, onToggleSound }: Props) {
  const def = getMode(mode);
  const accent = def.accent;
  const focusRef = useRef<HTMLDivElement | null>(null);
  const shakeCtrl = useAnimationControls();
  const reduceMotion = useReducedMotion();

  const [flashKey, setFlashKey] = useState<KeyFlash | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [announce, setAnnounce] = useState("");
  const seqRef = useRef(0);
  const settledRef = useRef<RunRecord | null>(null);
  const handoffRef = useRef<number | undefined>(undefined);

  const nextSeq = () => {
    seqRef.current += 1;
    return seqRef.current;
  };

  const engine = useEngine({ mode, difficulty, onEvent: handleEvent });
  const { snap } = engine;
  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  /* ------------------------------------------------------------- feedback */

  /** Burst origin = the live caret, falling back to the word box, then the viewport centre. */
  const caretPos = useCallback((): { x: number; y: number } => {
    const host = focusRef.current;
    if (host === null) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const caret = host.querySelector<HTMLElement>('[data-caret="1"]');
    const r = (caret ?? host).getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, []);

  const shake = useCallback(
    (power = 1) => {
      if (!settings.screenShake || reduceMotion === true) return;
      const d = 5 * power;
      void shakeCtrl.start({
        x: [0, -d, d * 0.8, -d * 0.6, d * 0.3, 0],
        y: [0, d * 0.5, -d * 0.5, d * 0.3, 0, 0],
        transition: { duration: 0.26, ease: "easeOut" },
      });
    },
    [reduceMotion, settings.screenShake, shakeCtrl],
  );

  const showBanner = useCallback((text: string, color: string) => setBanner({ text, color, seq: nextSeq() }), []);

  function handleEvent(e: GameEvent): void {
    switch (e.type) {
      case "countdown":
        sfx.tick(e.n);
        fx.current?.ring(window.innerWidth / 2, window.innerHeight * 0.42, accent, 20);
        setAnnounce(String(e.n));
        break;

      case "go":
        sfx.go();
        fx.current?.flash(accent, 0.28);
        fx.current?.streaks(accent, 14);
        shake(1.6);
        showBanner("GO!", accent);
        setAnnounce("Go");
        break;

      case "key": {
        if (e.ok) {
          sfx.key(e.combo);
          const p = caretPos();
          fx.current?.burst(p.x, p.y, PALETTE.mint, 5, 0.6);
        }
        setFlashKey({ k: e.char, ok: true, seq: nextSeq() });
        break;
      }

      case "error": {
        sfx.error();
        const p = caretPos();
        fx.current?.burst(p.x, p.y, PALETTE.coral, 16, 1.2);
        fx.current?.flash(PALETTE.coral, 0.16);
        shake(1.5);
        setFlashKey({ k: e.char, ok: false, seq: nextSeq() });
        break;
      }

      case "word": {
        const p = caretPos();
        sfx.word(e.mult);
        // `points` comes from the rules layer — the popup can never disagree with the score.
        fx.current?.burst(p.x, p.y, e.perfect ? accent : PALETTE.sky, 26 + e.mult * 6, 1.3 + e.mult * 0.12);
        fx.current?.ring(p.x, p.y, e.perfect ? PALETTE.mint : accent, 12);
        fx.current?.popup(p.x, p.y - 30, `+${e.points}`, e.mult >= 3 ? PALETTE.coral : accent, 20 + e.mult * 2);
        if (e.mult >= 3) fx.current?.streaks(accent, 6);
        if (e.perfect && snap.combo > 0 && snap.combo % 4 === 0) {
          showBanner(`x${e.mult} COMBO`, PALETTE.coral);
          fx.current?.flash(PALETTE.coral, 0.14);
          shake(1.1);
        } else {
          shake(0.55);
        }
        break;
      }

      case "skip":
        sfx.skip();
        showBanner("SKIPPED", PALETTE.mute);
        break;

      case "extend":
        showBanner("+TRACK EXTENDED", PALETTE.sky);
        break;

      case "overtake":
        sfx.overtake(e.up);
        showBanner(e.up ? `YOU PASS ${e.rival}` : `${e.rival} PASSES YOU`, e.up ? PALETTE.mint : PALETTE.coral);
        fx.current?.streaks(e.up ? PALETTE.mint : PALETTE.coral, 10);
        shake(e.up ? 0.8 : 1.2);
        break;

      case "warn":
        sfx.warn();
        fx.current?.flash(PALETTE.coral, 0.2);
        showBanner("BOOST LOW — TYPE!", PALETTE.coral);
        shake(1);
        break;

      case "paused":
        sfx.paused();
        setAnnounce("Race paused");
        break;

      case "resumed":
        sfx.resumed();
        setAnnounce("Race resumed");
        break;

      case "end": {
        // 1. Persist immediately: this record must survive the handoff *and* an unmount.
        settledRef.current = e.result;
        onSettled(e.result);
        // 2. Celebrate or mourn.
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight * 0.4;
        if (e.result.finished) {
          sfx.finish(e.result.place);
          fx.current?.flash(e.result.place === 1 ? PALETTE.amber : PALETTE.sky, 0.35);
          fx.current?.confetti(cx, cy, [PALETTE.amber, PALETTE.coral, PALETTE.mint, PALETTE.sky, PALETTE.cream], 90);
          fx.current?.ring(cx, cy, PALETTE.amber, 30);
          showBanner(
            e.result.place === 1 ? "VICTORY!" : e.result.place === 2 ? "2ND PLACE" : "FINISH",
            e.result.place === 1 ? PALETTE.amber : PALETTE.sky,
          );
          setAnnounce(e.result.place === 1 ? "Victory" : `Finished place ${e.result.place}`);
        } else {
          sfx[e.result.endReason === "crash" ? "crash" : "error"]();
          fx.current?.flash(PALETTE.coral, 0.45);
          fx.current?.burst(cx, cy, PALETTE.coral, 60, 2.2);
          showBanner(e.result.endReason === "crash" ? "BOOST DRAINED" : "RUN ABANDONED", PALETTE.coral);
          setAnnounce(e.result.endReason === "crash" ? "Out of boost" : "Race abandoned");
        }
        shake(2.4);
        // 3. Defer only the navigation, and make that deferral cancellable (an uncancelled
        //    timer used to re-mount a results screen under a user who had already quit).
        if (handoffRef.current !== undefined) window.clearTimeout(handoffRef.current);
        handoffRef.current = window.setTimeout(() => {
          handoffRef.current = undefined;
          const settled = settledRef.current;
          if (settled !== null) onFinish(settled);
        }, HANDOFF.resultDelayMs);
        break;
      }
    }
  }

  /* ------------------------------------------------------------- lifecycle */

  const launch = useCallback(() => {
    if (handoffRef.current !== undefined) {
      window.clearTimeout(handoffRef.current);
      handoffRef.current = undefined;
    }
    settledRef.current = null;
    setBanner(null);
    setFlashKey(null);
    fx.current?.clear();
    engineRef.current.start();
  }, [fx]);

  useEffect(() => {
    launch();
    return () => {
      if (handoffRef.current !== undefined) {
        window.clearTimeout(handoffRef.current);
        handoffRef.current = undefined;
      }
    };
    // Mount-only: `launch` reads the engine through a ref on purpose.
  }, [launch]);

  useEffect(() => {
    sfx.muted = !settings.sound;
  }, [settings.sound]);

  useEffect(() => {
    if (banner === null) return;
    const t = window.setTimeout(() => setBanner(null), HANDOFF.bannerMs);
    return () => window.clearTimeout(t);
  }, [banner]);

  /* ------------------------------------------------------------- keyboard */

  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      const eng = engineRef.current;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const status = eng.stateRef.current.status;

      if (ev.key === "Escape") {
        ev.preventDefault();
        if (status === "playing") eng.pause();
        else if (status === "paused") eng.resume();
        return;
      }
      if (status !== "playing") return;

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
      // An in-flight IME composition owns the keyboard; its keystrokes are not answers.
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === " ") {
        // Words auto-submit, so a habit-space is swallowed rather than punished — unless the
        // current word really needs one (SYNTAX phrases contain spaces).
        const st = eng.stateRef.current;
        const remaining = (st.words[st.idx] ?? "").slice(st.typed.length);
        ev.preventDefault();
        if (remaining.startsWith(" ")) eng.press(" ");
        return;
      }
      if (CONTROL_KEYS.has(ev.key)) return;
      if (ev.repeat) return;
      ev.preventDefault();
      // `ev.key` may be a grapheme cluster (IME commit); the rules layer matches by prefix.
      eng.press(ev.key);
    };

    window.addEventListener("keydown", down, { passive: false });
    return () => window.removeEventListener("keydown", down);
    // One binding for the life of the race: the handler reads the live engine state out
    // of `engineRef`/`stateRef` instead of closing over `snap`, which is what keeps
    // Escape/Backspace working after the countdown hands over to `playing`.
  }, []);

  /* ------------------------------------------------------------- quit */

  const quit = useCallback(() => {
    // `abandon()` ends the run through the normal path, so the `end` event has already
    // handed the DNF record to `onSettled`. Persisting it again here is how a single
    // abandoned race ended up counted twice in the career (runs++, duplicate row).
    engineRef.current.abandon();
    onQuit();
  }, [onQuit]);

  const restart = useCallback(() => {
    launch();
  }, [launch]);

  const paused = snap.status === "paused";
  const trapRef = useFocusTrap<HTMLDivElement>(paused);

  return (
    <motion.div animate={shakeCtrl} className="relative h-full w-full overflow-hidden">
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

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
        onQuit={quit}
      />

      <div className="flex h-full w-full flex-col gap-1.5 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[116px] sm:gap-3 sm:px-4 sm:pb-4 sm:pt-[112px]">
        <div className="shrink-0">
          <RivalTrack
            stateRef={engine.stateRef}
            accent={accent}
            rivals={snap.rivals}
            active={snap.status === "playing" || snap.status === "paused"}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <WordTrack
            words={snap.words}
            idx={snap.idx}
            typed={snap.typed}
            accent={accent}
            perfect={snap.perfect}
            focusRef={focusRef}
            totalWords={snap.totalWords}
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
                nextKey={snap.expected}
                word={snap.word}
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
              nextKey={snap.expected}
              word={snap.word}
              accent={accent}
              guide={settings.fingerGuide}
              flash={flashKey}
              onSkip={engine.skip}
              onBack={engine.backspace}
              disabled={snap.status !== "playing"}
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
        {banner !== null && (
          <motion.div
            key={banner.seq}
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
        {paused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 grid place-items-center bg-ink/80 p-4 backdrop-blur-md"
          >
            <motion.div
              ref={trapRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="pause-title"
              initial={{ y: 24, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              className="panel w-[min(92vw,420px)] rounded-2xl p-6 text-center"
            >
              <div className="label-xs mb-2" style={{ color: accent }}>
                Race paused · clock frozen
              </div>
              <h2 id="pause-title" className="font-display text-4xl text-cream">
                PIT STOP
              </h2>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  ["WPM", String(snap.wpm)],
                  ["SCORE", snap.score.toLocaleString()],
                  ["ACC", `${Math.round(snap.accuracy)}%`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-line bg-ink-2/70 p-2">
                    <div className="label-xs text-mute">{k}</div>
                    <div className="font-display text-lg text-cream">{v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={engine.resume}
                  autoFocus
                  className="btn-3d flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-display text-ink"
                  style={{ background: accent }}
                >
                  <PlayIcon size={18} /> RESUME <span className="label-xs opacity-70">ESC</span>
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={restart}
                    className="btn-3d flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-4 py-3 font-display text-sm text-cream"
                  >
                    <RotateCcw size={16} /> RESTART
                  </button>
                  <button
                    type="button"
                    onClick={quit}
                    className="btn-3d flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-4 py-3 font-display text-sm text-cream"
                  >
                    <Home size={16} /> MENU
                  </button>
                </div>
                <p className="mt-1 font-mono text-[10px] text-mute">
                  Quitting records this race as abandoned — it will show in your career history.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
