import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FxCanvas, type FxHandle } from "./components/FxCanvas";
import Home from "./screens/Home";
import Play from "./screens/Play";
import Results from "./screens/Results";
import StatsScreen from "./screens/Stats";
import { DEFAULT_MODE, getMode } from "./game/config";
import { emptyStats, recordRun } from "./game/career";
import { clearAll, loadSettings, loadStats, saveSettings, saveStats, subscribeToStorage } from "./game/storage";
import { sfx } from "./game/audio";
import type { Mode, RunRecord, Settings, Stats } from "./game/types";

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
  const raceRef = useRef(0);

  // One read of the persistence boundary, so a corrupt file is reported once — not on every render.
  const bootRef = useRef<{ stats: Stats; settings: Settings; notices: string[] } | null>(null);
  if (bootRef.current === null) {
    const s = loadStats();
    const g = loadSettings();
    bootRef.current = {
      stats: s.value,
      settings: g.value,
      notices: [...s.issues, ...g.issues].map((i) => i.message),
    };
  }

  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const [stats, setStats] = useState<Stats>(bootRef.current.stats);
  const [settings, setSettings] = useState<Settings>(bootRef.current.settings);
  const [notices, setNotices] = useState<string[]>(bootRef.current.notices);

  const statsRef = useRef(stats);
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  const patchStats = useCallback((next: Stats) => {
    statsRef.current = next;
    setStats(next);
    const save = saveStats(next);
    if (!save.ok) setNotices((n) => [...n, ...save.issues.map((i) => i.message)]);
  }, []);

  /* ------------------------------------------------------- settings ↔ storage */

  const settingsDirty = useRef(false);
  const patchSettings = useCallback((p: Partial<Settings>) => {
    settingsDirty.current = true;
    setSettings((s) => ({ ...s, ...p }));
  }, []);

  useEffect(() => {
    sfx.muted = !settings.sound;
    if (!settingsDirty.current) return;
    settingsDirty.current = false;
    const save = saveSettings(settings);
    if (!save.ok) setNotices((n) => [...n, ...save.issues.map((i) => i.message)]);
  }, [settings]);

  /* ------------------------------------------------------- audio unlock */

  useEffect(() => {
    const unlock = () => {
      sfx.unlock();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /* ------------------------------------------------------- other tabs */

  useEffect(() => {
    return subscribeToStorage((key) => {
      // Never yank a live race's career file out from under the run.
      if (key === "stats") {
        if (screenRef.current.name === "play") return;
        const r = loadStats();
        statsRef.current = r.value;
        setStats(r.value);
        if (r.issues.length > 0) setNotices((n) => [...n, ...r.issues.map((i) => i.message)]);
      } else {
        const r = loadSettings();
        setSettings(r.value);
      }
    });
  }, []);

  /* ------------------------------------------------------- routing */

  const startRace = useCallback((m: Mode) => {
    sfx.unlock();
    sfx.ui();
    setMode(m);
    raceRef.current += 1;
    fx.current?.streaks(getMode(m).accent, 8);
    setScreen({ name: "play", mode: m, raceId: raceRef.current });
  }, []);

  const goHome = useCallback(() => setScreen({ name: "home" }), []);
  const goStats = useCallback(() => setScreen({ name: "stats" }), []);

  const badgesPending = useRef<string[]>([]);

  /** Called the instant a race settles — before the celebration, so nothing can lose the record. */
  const handleSettled = useCallback(
    (result: RunRecord) => {
      const { stats: next, newBadges } = recordRun(statsRef.current, result);
      patchStats(next);
      badgesPending.current = newBadges;
    },
    [patchStats],
  );

  /** Called after the handoff delay: this is navigation only. */
  const handleFinish = useCallback((result: RunRecord) => {
    setScreen({ name: "results", result, newBadges: badgesPending.current });
  }, []);

  const handleQuit = useCallback(() => {
    badgesPending.current = [];
    goHome();
  }, [goHome]);

  const handleWipe = useCallback(() => {
    const res = clearAll();
    statsRef.current = emptyStats();
    setStats(emptyStats());
    setNotices(res.ok ? [] : res.issues.map((i) => i.message));
    goHome();
  }, [goHome]);

  /* ------------------------------------------------------- screen shortcuts */

  useEffect(() => {
    if (screen.name === "play") return;
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      if (screen.name === "results") {
        if (k === "r" || e.key === "Enter") {
          e.preventDefault();
          startRace(screen.result.mode);
        } else if (e.key === "Escape") {
          e.preventDefault();
          goHome();
        } else if (k === "s") {
          e.preventDefault();
          goStats();
        }
      } else if (screen.name === "stats" && e.key === "Escape") {
        e.preventDefault();
        goHome();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [screen, startRace, goHome, goStats]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-arena">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-60" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[45vh] bg-gradient-to-b from-sky/10 to-transparent"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38vh] overflow-hidden opacity-50" aria-hidden>
        <div
          className="road-stripes absolute inset-x-0 bottom-0 h-full"
          style={{ maskImage: "linear-gradient(to top, #000, transparent 85%)" }}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber/60 to-transparent"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 scanlines opacity-30" aria-hidden />
      <div className="pointer-events-none absolute inset-0 vignette" aria-hidden />

      <div className="relative z-10 h-full w-full">
        <AnimatePresence mode="wait">
          {screen.name === "home" && (
            <motion.div key="home" {...slide} className="h-full w-full">
              <Home
                mode={mode}
                stats={stats}
                settings={settings}
                notice={notices.length > 0 ? notices.join(" ") : null}
                onSelectMode={setMode}
                onStart={startRace}
                patchSettings={patchSettings}
                onStats={goStats}
              />
            </motion.div>
          )}

          {screen.name === "play" && (
            <motion.div key={`play-${screen.raceId}`} {...slide} className="h-full w-full">
              <Play
                mode={screen.mode}
                difficulty={settings.difficulty}
                settings={settings}
                fx={fx}
                onSettled={handleSettled}
                onFinish={handleFinish}
                onQuit={handleQuit}
                onToggleSound={() => patchSettings({ sound: !settings.sound })}
              />
            </motion.div>
          )}

          {screen.name === "results" && (
            <motion.div key="results" {...slide} className="h-full w-full">
              <Results
                record={screen.result}
                stats={stats}
                newBadges={screen.newBadges}
                onReplay={() => startRace(screen.result.mode)}
                onHome={goHome}
                onStats={goStats}
              />
            </motion.div>
          )}

          {screen.name === "stats" && (
            <motion.div key="stats" {...slide} className="h-full w-full">
              <StatsScreen stats={stats} issues={notices} onBack={goHome} onWipe={handleWipe} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <FxCanvas ref={fx} />
    </div>
  );
}
