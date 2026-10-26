import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart3, Home, RotateCcw, Trophy } from "lucide-react";
import type { RunRecord, Stats } from "../game/types";
import { DIFFICULTIES, MODES } from "../game/types";
import { fmtTime, leaderboard } from "../game/storage";
import { fingerOf, FINGER_LABEL } from "../components/TouchKeyboard";
import type { FxHandle } from "../components/FxCanvas";

interface Props {
  result: RunRecord;
  stats: Stats;
  newBadges: string[];
  fx: React.RefObject<FxHandle | null>;
  onRestart: () => void;
  onHome: () => void;
  onStats: () => void;
}

const PLACE_COLOR = ["#ffb020", "#4cc9ff", "#a78bfa", "#8b96c4"];

function Chart({ series, color }: { series: number[]; color: string }) {
  const path = useMemo(() => {
    if (series.length < 2) return { line: "", area: "" };
    const W = 560;
    const H = 90;
    const max = Math.max(30, ...series);
    const step = W / (series.length - 1);
    const pts = series.map((v, i) => [i * step, H - (v / max) * (H - 8) - 4]);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    return { line, area: `${line} L${W},${H} L0,${H} Z` };
  }, [series]);

  return (
    <svg viewBox="0 0 560 90" className="h-[90px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" x2="560" y1={90 * g} y2={90 * g} stroke="#2c3866" strokeWidth="1" strokeDasharray="3 6" />
      ))}
      {path.area && <path d={path.area} fill="url(#cg)" />}
      {path.line && (
        <motion.path
          d={path.line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      )}
    </svg>
  );
}

export default function Results({ result, stats, newBadges, fx, onRestart, onHome, onStats }: Props) {
  const def = MODES.find((m) => m.id === result.mode)!;
  const diff = DIFFICULTIES.find((d) => d.id === result.difficulty)!;
  const accent = def.accent;
  const board = leaderboard(stats, result.mode);
  const best = stats.best[result.mode];
  const isRecord = best && best.wpm === result.wpm && result.finished;
  const crashed = !result.finished;
  const headline = crashed ? "OUT OF BOOST" : result.place === 1 ? "VICTORY" : result.place === 2 ? "RUNNER UP" : "FINISH";
  const weakKeys = Object.entries(result.keyMisses).sort((a, b) => b[1] - a[1]).slice(0, 5);

  useEffect(() => {
    if (result.finished && result.place === 1) {
      fx.current?.confetti(window.innerWidth / 2, window.innerHeight * 0.3, ["#ffb020", "#ff5a7a", "#35e0a1", "#4cc9ff"], 70);
    }
  }, [fx, result]);

  const cells: [string, string, string][] = [
    ["ACCURACY", `${result.accuracy}%`, result.accuracy >= 97 ? "#35e0a1" : result.accuracy >= 90 ? "#ffb020" : "#ff5a7a"],
    ["SCORE", result.score.toLocaleString(), accent],
    ["PERFECT WORDS", `${result.perfectWords}/${result.words}`, "#35e0a1"],
    ["MAX COMBO", `${result.maxCombo}`, "#ff5a7a"],
    ["CHARS", `${result.correctChars}/${result.correctChars + result.incorrectChars}`, "#4cc9ff"],
    ["TIME", fmtTime(result.durationMs), "#a78bfa"],
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative h-full w-full overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-3 pb-6">
        {/* headline */}
        <div className="panel relative overflow-hidden rounded-2xl px-4 py-4 sm:px-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{ background: `radial-gradient(90% 140% at 12% 0%, ${accent}, transparent 60%)` }}
          />
          <div className="relative flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <div className="label-xs text-mute">
                {def.name} · {diff.name}
              </div>
              <motion.h1
                initial={{ y: 22, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="font-display text-[clamp(2rem,7vw,3.6rem)] leading-none"
                style={{ color: crashed ? "#ff5a7a" : PLACE_COLOR[result.place - 1] ?? accent }}
              >
                {headline}
              </motion.h1>
            </div>
            <div className="ml-auto text-right">
              <div className="label-xs text-mute">Top speed</div>
              <div className="flex items-end justify-end gap-2">
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15, type: "spring", stiffness: 240, damping: 14 }}
                  className="font-display text-[clamp(3rem,11vw,5.5rem)] leading-[0.8]"
                  style={{ color: accent, textShadow: `0 0 40px ${accent}55` }}
                >
                  {result.wpm}
                </motion.span>
                <span className="label-xs mb-2 text-mute">WPM</span>
              </div>
              {isRecord && result.finished && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: [-6, 4, -2, 0] }}
                  transition={{ delay: 0.45, type: "spring", stiffness: 300, damping: 10 }}
                  className="mt-1 inline-block rounded-md bg-amber px-2 py-1 font-display text-xs text-ink"
                >
                  ★ NEW TRACK RECORD
                </motion.span>
              )}
            </div>
          </div>

          <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-md border border-line bg-ink-2/70 px-2 py-1 font-mono text-mute">
              raw {result.rawWpm} wpm
            </span>
            {def.rivals && !crashed && (
              <span className="rounded-md border border-line bg-ink-2/70 px-2 py-1 font-mono text-mute">
                finished P{result.place} of {result.place + 2 > 3 ? 3 : result.place + 2}
              </span>
            )}
            <span className="rounded-md border border-line bg-ink-2/70 px-2 py-1 font-mono text-mute">
              {new Date(result.date).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-3">
            {/* stat grid */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cells.map(([k, v, c], i) => (
                <motion.div
                  key={k}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.05 * i }}
                  className="panel rounded-xl px-3 py-2.5"
                >
                  <div className="label-xs text-mute">{k}</div>
                  <div className="font-display text-xl leading-tight sm:text-2xl" style={{ color: c }}>
                    {v}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* speed chart */}
            <div className="panel rounded-xl px-3 py-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="label-xs flex items-center gap-1.5 text-mute">
                  <BarChart3 size={12} /> Speed over time
                </span>
                <span className="label-xs text-mute">peak {Math.max(0, ...result.series)} wpm</span>
              </div>
              <Chart series={result.series} color={accent} />
            </div>

            {/* weak keys */}
            <div className="panel rounded-xl px-3 py-3">
              <span className="label-xs text-mute">Keys that tripped you</span>
              {weakKeys.length === 0 ? (
                <p className="mt-2 font-mono text-sm text-mint">Flawless. Not a single missed key.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {weakKeys.map(([k, n]) => (
                    <div key={k} className="flex items-center gap-2 rounded-lg border border-line bg-ink-2/60 px-2 py-1.5">
                      <span className="grid h-8 w-8 place-items-center rounded-md border border-coral/50 bg-coral/15 font-mono text-base font-bold text-coral">
                        {k === " " ? "␣" : k}
                      </span>
                      <div className="leading-tight">
                        <div className="font-mono text-[11px] text-cream">{n} miss{n > 1 ? "es" : ""}</div>
                        <div className="label-xs text-mute">{FINGER_LABEL[fingerOf(k)]}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* leaderboard */}
            <div className="panel rounded-xl px-3 py-3">
              <span className="label-xs flex items-center gap-1.5 text-mute">
                <Trophy size={12} /> {def.name} leaderboard
              </span>
              <div className="mt-2 flex flex-col gap-1.5">
                {board.length === 0 && <p className="font-mono text-xs text-mute">No finished runs yet.</p>}
                {board.map((r, i) => (
                  <div
                    key={r.id}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                      r.id === result.id ? "border-amber/60 bg-amber/10" : "border-line bg-ink-2/50"
                    }`}
                  >
                    <span className="font-display text-sm" style={{ color: PLACE_COLOR[i] ?? "#8b96c4" }}>
                      {i + 1}
                    </span>
                    <span className="font-mono text-xs text-cream">{r.wpm} wpm</span>
                    <span className="font-mono text-[11px] text-mute">{r.accuracy}%</span>
                    <span className="ml-auto font-display text-sm text-cream">{r.score.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* new badges */}
            {newBadges.length > 0 && (
              <div className="panel rounded-xl px-3 py-3">
                <span className="label-xs text-mute">Badges unlocked</span>
                <div className="mt-2 flex flex-col gap-1.5">
                  {newBadges.map((id) => (
                    <motion.div
                      key={id}
                      initial={{ x: -12, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className="flex items-center gap-2 rounded-lg border border-line bg-ink-2/60 px-2 py-1.5"
                    >
                      <span className="text-lg">★</span>
                      <span className="font-display text-xs text-cream">{id.replace(/-/g, " ").toUpperCase()}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* actions */}
            <div className="mt-auto flex flex-col gap-2">
              <button
                onClick={onRestart}
                className="btn-3d flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 font-display text-ink"
                style={{ background: accent }}
              >
                <RotateCcw size={18} /> RACE AGAIN
                <span className="ml-1 rounded border border-ink/30 px-1.5 py-0.5 font-mono text-[10px] opacity-70">R</span>
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onStats}
                  className="btn-3d flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-4 py-3 font-display text-xs text-cream"
                >
                  <BarChart3 size={15} /> CAREER
                </button>
                <button
                  onClick={onHome}
                  className="btn-3d flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-4 py-3 font-display text-xs text-cream"
                >
                  <Home size={15} /> MODES
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
