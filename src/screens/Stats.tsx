import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Flame, Keyboard, Medal, Target, Timer, Trash2, Trophy, Zap } from "lucide-react";
import type { Stats as StatsData } from "../game/types";
import { DIFFICULTIES, MODES } from "../game/types";
import { BADGES, fmtTime } from "../game/storage";
import { fingerOf, FINGER_LABEL } from "../components/TouchKeyboard";

interface Props {
  stats: StatsData;
  onBack: () => void;
  onReset: () => void;
}

const FINGERS = ["pinkyL", "ringL", "midL", "idxL", "idxR", "midR", "ringR", "pinkyR"] as const;
const FINGER_COLOR: Record<string, string> = {
  pinkyL: "#ff5a7a",
  ringL: "#ffb020",
  midL: "#35e0a1",
  idxL: "#4cc9ff",
  idxR: "#2f9fd8",
  midR: "#22b37f",
  ringR: "#d1891a",
  pinkyR: "#d13a5c",
};

function StatTile({
  label,
  value,
  sub,
  color,
  icon,
  big,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon?: React.ReactNode;
  big?: boolean;
}) {
  return (
    <div className={`panel rounded-xl px-3 py-3 ${big ? "sm:col-span-2 sm:row-span-2" : ""}`}>
      <div className="flex items-center gap-1.5" style={{ color }}>
        {icon}
        <span className="label-xs text-mute">{label}</span>
      </div>
      <div
        className="font-display leading-none"
        style={{ color, fontSize: big ? "clamp(3rem,9vw,5rem)" : "clamp(1.4rem,4vw,2rem)" }}
      >
        {value}
      </div>
      {sub && <div className="mt-1 font-mono text-[11px] text-mute">{sub}</div>}
    </div>
  );
}

export default function Stats({ stats, onBack, onReset }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const t = stats.totals;
  const totalKeys = t.correctChars + t.incorrectChars || 1;
  const lifetimeAcc = Math.round((t.correctChars / totalKeys) * 1000) / 10;

  const history = useMemo(() => stats.runs.slice(0, 24).reverse(), [stats.runs]);

  const fingerMisses = useMemo(() => {
    const acc: Record<string, number> = {};
    FINGERS.forEach((f) => (acc[f] = 0));
    for (const [k, v] of Object.entries(stats.keyMisses)) acc[fingerOf(k)] = (acc[fingerOf(k)] || 0) + v;
    const max = Math.max(1, ...Object.values(acc));
    return FINGERS.map((f) => ({ finger: f, count: acc[f] || 0, pct: ((acc[f] || 0) / max) * 100 }));
  }, [stats.keyMisses]);

  const weakKeys = useMemo(
    () => Object.entries(stats.keyMisses).sort((a, b) => b[1] - a[1]).slice(0, 12),
    [stats.keyMisses]
  );

  const buckets = useMemo(() => {
    const b = [0, 0, 0, 0, 0, 0, 0];
    stats.runs.forEach((r) => {
      const i = Math.min(6, Math.floor(r.wpm / 15));
      b[i]++;
    });
    return b;
  }, [stats.runs]);
  const bucketMax = Math.max(1, ...buckets);
  const bucketLabels = ["0-14", "15-29", "30-44", "45-59", "60-74", "75-89", "90+"];

  const chart = useMemo(() => {
    if (history.length < 2) return null;
    const W = 640;
    const H = 120;
    const max = Math.max(40, ...history.map((r) => r.wpm));
    const step = W / (history.length - 1);
    const pts = history.map((r, i) => [i * step, H - (r.wpm / max) * (H - 14) - 7] as const);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    return { W, H, max, pts, line, area: `${line} L${W},${H} L0,${H} Z` };
  }, [history]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="h-full w-full overflow-y-auto overscroll-contain px-3 py-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 pb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="btn-3d grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel-2 text-cream transition-colors hover:border-amber hover:text-amber"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="label-xs text-mute">Career garage</div>
            <h1 className="font-display text-3xl leading-none text-cream sm:text-4xl">
              YOUR <span className="text-amber">RECORDS</span>
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {confirmReset ? (
              <>
                <button
                  onClick={() => {
                    onReset();
                    setConfirmReset(false);
                  }}
                  className="btn-3d rounded-xl bg-coral px-3 py-2 font-display text-xs text-ink"
                >
                  CONFIRM WIPE
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="btn-3d rounded-xl border border-line bg-panel-2 px-3 py-2 font-display text-xs text-cream"
                >
                  CANCEL
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="btn-3d flex items-center gap-1.5 rounded-xl border border-line bg-panel-2 px-3 py-2 font-display text-[11px] text-mute transition-colors hover:border-coral hover:text-coral"
              >
                <Trash2 size={13} /> WIPE DATA
              </button>
            )}
          </div>
        </div>

        {stats.runs.length === 0 ? (
          <div className="panel grid place-items-center rounded-2xl px-6 py-16 text-center">
            <Zap size={40} className="mb-3 text-amber" />
            <h2 className="font-display text-2xl text-cream">NO TELEMETRY YET</h2>
            <p className="mt-2 max-w-sm font-mono text-sm text-mute">
              Finish a race and every keystroke gets logged here — speed curves, accuracy, weak keys and badges.
            </p>
            <button onClick={onBack} className="btn-3d mt-5 rounded-xl bg-amber px-6 py-3 font-display text-ink">
              GO RACE
            </button>
          </div>
        ) : (
          <>
            {/* headline tiles */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <StatTile big label="Personal best" value={`${t.bestWpm}`} sub="words per minute" color="#ffb020" icon={<Flame size={12} />} />
              <StatTile label="Races" value={`${stats.runs.length}`} sub={`${t.firstPlaces} wins`} color="#4cc9ff" icon={<Trophy size={12} />} />
              <StatTile label="Lifetime accuracy" value={`${lifetimeAcc}%`} sub={`${t.incorrectChars} slips`} color="#35e0a1" icon={<Target size={12} />} />
              <StatTile label="Words typed" value={`${t.words}`} sub={`${t.perfectWords} flawless`} color="#a78bfa" icon={<Keyboard size={12} />} />
              <StatTile label="Keystrokes" value={t.keystrokes.toLocaleString()} color="#ff5a7a" />
              <StatTile label="Time on track" value={fmtTime(t.ms)} color="#4cc9ff" icon={<Timer size={12} />} />
              <StatTile label="Best combo" value={`${t.maxCombo}`} sub="flawless words" color="#ffb020" />
              <StatTile label="High score" value={t.bestScore.toLocaleString()} color="#35e0a1" />
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
              {/* speed history */}
              <div className="panel rounded-2xl px-3 py-3">
                <div className="flex items-center justify-between">
                  <span className="label-xs text-mute">Last {history.length} races — WPM</span>
                  <span className="label-xs text-amber">peak {chart?.max ?? 0}</span>
                </div>
                {chart ? (
                  <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="mt-2 h-[130px] w-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffb020" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#ffb020" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {[0.25, 0.5, 0.75].map((g) => (
                      <line key={g} x1="0" x2={chart.W} y1={chart.H * g} y2={chart.H * g} stroke="#2c3866" strokeDasharray="3 7" />
                    ))}
                    <motion.path d={chart.area} fill="url(#hg)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
                    <motion.path
                      d={chart.line}
                      fill="none"
                      stroke="#ffb020"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                    {chart.pts.map((p, i) => (
                      <circle key={i} cx={p[0]} cy={p[1]} r="3.4" fill={MODES.find((m) => m.id === history[i].mode)?.accent ?? "#fff"} />
                    ))}
                  </svg>
                ) : (
                  <p className="py-10 text-center font-mono text-xs text-mute">Finish two races to see the curve.</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {MODES.map((m) => (
                    <span key={m.id} className="flex items-center gap-1.5 font-mono text-[11px] text-mute">
                      <span className="h-2 w-2 rounded-full" style={{ background: m.accent }} />
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* mode bests */}
              <div className="panel rounded-2xl px-3 py-3">
                <span className="label-xs flex items-center gap-1.5 text-mute">
                  <Medal size={12} /> Best per mode
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {MODES.map((m) => {
                    const b = stats.best[m.id];
                    return (
                      <div
                        key={m.id}
                        className="rounded-xl border px-3 py-2"
                        style={{ borderColor: `${m.accent}55`, background: `${m.accent}12` }}
                      >
                        <div className="label-xs truncate" style={{ color: m.accent }}>
                          {m.name}
                        </div>
                        <div className="font-display text-2xl leading-none text-cream">{b ? b.wpm : "—"}</div>
                        <div className="font-mono text-[10px] text-mute">
                          {b ? `${b.accuracy}% · ${b.score.toLocaleString()} pts` : "not finished"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* finger analysis */}
              <div className="panel rounded-2xl px-3 py-3">
                <span className="label-xs text-mute">Where your fingers slip</span>
                <div className="mt-2 flex flex-col gap-1.5">
                  {fingerMisses.map((f) => (
                    <div key={f.finger} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 font-mono text-[11px] text-mute">{FINGER_LABEL[f.finger]}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-2">
                        <motion.div
                          className="h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${f.pct}%` }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                          style={{ background: FINGER_COLOR[f.finger], boxShadow: `0 0 10px ${FINGER_COLOR[f.finger]}` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-cream">{f.count}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {weakKeys.slice(0, 8).map(([k, n]) => (
                    <span
                      key={k}
                      className="grid h-8 min-w-8 place-items-center rounded-md border px-1 font-mono text-sm font-bold"
                      style={{ borderColor: `${FINGER_COLOR[fingerOf(k)]}66`, color: FINGER_COLOR[fingerOf(k)], background: `${FINGER_COLOR[fingerOf(k)]}14` }}
                      title={`${n} misses · ${FINGER_LABEL[fingerOf(k)]}`}
                    >
                      {k === " " ? "␣" : k}
                    </span>
                  ))}
                </div>
              </div>

              {/* distribution */}
              <div className="panel rounded-2xl px-3 py-3">
                <span className="label-xs text-mute">Speed distribution</span>
                <div className="mt-3 flex h-[110px] items-end gap-2">
                  {buckets.map((v, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <span className="font-mono text-[10px] text-mute">{v || ""}</span>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${(v / bucketMax) * 78}px` }}
                        transition={{ duration: 0.6, delay: i * 0.05 }}
                        className="w-full rounded-t-md"
                        style={{
                          background: v ? `linear-gradient(180deg,#4cc9ff,#2f9fd8)` : "#1b2444",
                          boxShadow: v ? "0 0 14px -4px #4cc9ff" : undefined,
                        }}
                      />
                      <span className="label-xs text-mute">{bucketLabels[i]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* badges */}
            <div className="panel rounded-2xl px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="label-xs flex items-center gap-1.5 text-mute">
                  <Trophy size={12} /> Badges {stats.badges.length}/{BADGES.length}
                </span>
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink-2">
                  <div className="h-full rounded-full bg-amber" style={{ width: `${(stats.badges.length / BADGES.length) * 100}%` }} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {BADGES.map((b, i) => {
                  const got = stats.badges.includes(b.id);
                  return (
                    <motion.div
                      key={b.id}
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="rounded-xl border px-2.5 py-2"
                      style={{
                        borderColor: got ? `${b.color}77` : "#2c3866",
                        background: got ? `${b.color}14` : "rgba(10,13,28,.5)",
                        opacity: got ? 1 : 0.55,
                      }}
                    >
                      <div className="font-display text-[11px] leading-tight" style={{ color: got ? b.color : "#8b96c4" }}>
                        {got ? "★ " : "☆ "}
                        {b.name.toUpperCase()}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-mute">{b.desc}</div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* recent runs */}
            <div className="panel overflow-hidden rounded-2xl">
              <div className="border-b border-line px-3 py-2">
                <span className="label-xs text-mute">Recent runs</span>
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                <table className="w-full border-collapse font-mono text-[11px] sm:text-xs">
                  <thead className="sticky top-0 bg-panel-2/95 backdrop-blur">
                    <tr className="label-xs text-mute">
                      <th className="px-3 py-2 text-left font-bold">MODE</th>
                      <th className="px-2 py-2 text-left font-bold">LEVEL</th>
                      <th className="px-2 py-2 text-right font-bold">WPM</th>
                      <th className="px-2 py-2 text-right font-bold">ACC</th>
                      <th className="px-2 py-2 text-right font-bold">POS</th>
                      <th className="px-3 py-2 text-right font-bold">SCORE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.runs.slice(0, 20).map((r) => {
                      const m = MODES.find((x) => x.id === r.mode)!;
                      const d = DIFFICULTIES.find((x) => x.id === r.difficulty)!;
                      return (
                        <tr key={r.id} className="border-t border-line/50 text-cream/85 transition-colors hover:bg-cream/5">
                          <td className="px-3 py-1.5 font-bold" style={{ color: m.accent }}>
                            {m.name}
                          </td>
                          <td className="px-2 py-1.5 text-mute">{d.name}</td>
                          <td className="px-2 py-1.5 text-right">{r.finished ? r.wpm : "dnf"}</td>
                          <td className="px-2 py-1.5 text-right">{r.accuracy}%</td>
                          <td className="px-2 py-1.5 text-right">{r.finished ? `P${r.place}` : "—"}</td>
                          <td className="px-3 py-1.5 text-right font-bold">{r.score.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
