import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FxCanvas, type FxHandle } from "./components/FxCanvas";
import Home from "./screens/Home";
import Play from "./screens/Play";
import Results from "./screens/Results";
import StatsScreen from "./screens/Stats";
import type { Mode, RunRecord, Settings, Stats as StatsData } from "./game/types";
import { emptyStats, loadSettings, loadStats, recordRun, resetStats, saveSettings, saveStats } from "./game/storage";
import { sfx } from "./game/audio";

type Screen =
  | { name: "home" }
  | { name: "play"; mode: Mode; raceId: number }
  | { name: "results"; result: RunRecord; newBadges: string[] }
  | { name: "stats" };

const slide = {
  initial: { opacity: 0, y: 18, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -14, scale: 0.995 },
  transition: { duration: 0.22, ease: [0.22, 0.9, 0.25, 1] as const },
};

export default function App() {
  const fx = useRef<FxHandle | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [stats, setStats] = useState<StatsData>(() => loadStats());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    sfx.muted = !settings.sound;
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const start = useCallback((mode: Mode) => {
    sfx.unlock();
    sfx.ui();
    fx.current?.streaks("#ffb020", 8);
    setScreen({ name: "play", mode, raceId: Date.now() });
  }, []);

  const goHome = useCallback(() => setScreen({ name: "home" }), []);
  const goStats = useCallback(() => setScreen({ name: "stats" }), []);

  const statsRef = useRef<StatsData>(stats);
  statsRef.current = stats;

  const handleFinish = useCallback((result: RunRecord) => {
    const { stats: next, newBadges } = recordRun(statsRef.current, result);
    statsRef.current = next;
    saveStats(next);
    setStats(next);
    setScreen({ name: "results", result, newBadges });
  }, []);

  const handleReset = useCallback(() => {
    resetStats();
    setStats(emptyStats());
  }, []);

  /* results-screen shortcuts: instant restart */
  useEffect(() => {
    if (screen.name !== "results") return;
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "r" || e.key === "Enter") {
        e.preventDefault();
        start(screen.result.mode);
      } else if (e.key === "Escape") {
        e.preventDefault();
        goHome();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        goStats();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [screen, start, goHome, goStats]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-arena">
      {/* ---------- ambient layers ---------- */}
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[45vh] bg-gradient-to-b from-sky/10 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38vh] overflow-hidden opacity-[0.5]">
        <div
          className="road-stripes absolute inset-x-0 bottom-0 h-full"
          style={{ maskImage: "linear-gradient(to top, #000, transparent 85%)" }}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber/60 to-transparent" />
      <div className="pointer-events-none absolute inset-0 scanlines opacity-30" />
      <div className="pointer-events-none absolute inset-0 vignette" />

      {/* ---------- screens ---------- */}
      <div className="relative z-10 h-full w-full">
        <AnimatePresence mode="wait">
          {screen.name === "home" && (
            <motion.div key="home" {...slide} className="h-full w-full">
              <Home
                stats={stats}
                settings={settings}
                setSettings={setSettings}
                fx={fx}
                onStart={start}
                onStats={goStats}
              />
            </motion.div>
          )}

          {screen.name === "play" && (
            <motion.div key={`play-${screen.raceId}`} {...slide} className="h-full w-full">
              <Play
                key={screen.raceId}
                mode={screen.mode}
                difficulty={settings.difficulty}
                settings={settings}
                fx={fx}
                onFinish={handleFinish}
                onQuit={goHome}
                onToggleSound={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
              />
            </motion.div>
          )}

          {screen.name === "results" && (
            <motion.div key="results" {...slide} className="h-full w-full">
              <Results
                result={screen.result}
                stats={stats}
                newBadges={screen.newBadges}
                fx={fx}
                onRestart={() => start(screen.result.mode)}
                onHome={goHome}
                onStats={goStats}
              />
            </motion.div>
          )}

          {screen.name === "stats" && (
            <motion.div key="stats" {...slide} className="h-full w-full">
              <StatsScreen stats={stats} onBack={goHome} onReset={handleReset} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <FxCanvas ref={fx} />
    </div>
  );
}
