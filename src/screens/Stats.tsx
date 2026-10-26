import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Eraser, Trophy, X } from "lucide-react";
import { BADGES } from "../game/badges";
import { DIFFICULTIES, getDifficulty, getMode, MAX_WPM, MODES, PALETTE, RUN_HISTORY_LIMIT } from "../game/config";
import { FINGERS, FINGER_COLOR, FINGER_LABEL, fingerOf } from "../game/fingers";
import { emptyTotals } from "../game/career";
import { formatDuration, formatNumber, formatPercent } from "../game/metrics";
import { Sparkline } from "../components/Sparkline";
import type { Mode, Stats } from "../game/types";

interface Props {
  stats: Stats;
  /** Anything the persistence layer had to repair, discard or refuse to write. */
  issues: string[];
  onBack: () => void;
  onWipe: () => void;
}

/** Shared bar row so the finger chart and the key chart cannot drift apart in style. */
function BarRow({
  label,
  value,
  max,
  color,
  hint,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  hint?: string;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="grid h-6 min-w-6 shrink-0 place-items-center rounded-md border px-1 font-mono text-[10px] font-bold"
        style={{ borderColor: `${color}88`, color, background: `${color}14` }}
        title={hint ?? label}
      >
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink" aria-hidden>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <span className="w-10 text-right font-mono text-[10px] text-cream/70">{formatNumber(value)}</span>
    </li>
  );
}

const modeAccent = (m: Mode): string => getMode(m).accent;

export default function StatsScreen({ stats, issues, onBack, onWipe }: Props) {
  const uid = useId();
  const [confirming, setConfirming] = useState(false);
  const [depth, setDepth] = useState(30);
  const [modeFilter, setModeFilter] = useState<Mode | "all">("all");

  const t = stats.totals.races > 0 ? stats.totals : emptyTotals();

  const runs = useMemo(
    () => (modeFilter === "all" ? stats.runs : stats.runs.filter((r) => r.mode === modeFilter)),
    [stats.runs, modeFilter],
  );
  const shown = useMemo(() => runs.slice(0, depth).slice().reverse(), [runs, depth]);

  const trend = shown.map((r) => r.wpm);
  const peak = runs.reduce((m, r) => Math.max(m, r.wpm), 0);

  /**
   * Grouped through `fingerOf` — the same table the on-screen keyboard highlights with — so
   * a stored key can never be attributed to a finger by a second, drifting copy.
   */
  const fingerErrors = useMemo(() => {
    const out = new Map<string, number>();
    for (const [key, n] of Object.entries(stats.keyMisses)) {
      const f = fingerOf(key);
      out.set(f, (out.get(f) ?? 0) + n);
    }
    return FINGERS.map((f) => ({ finger: f, n: out.get(f) ?? 0 })).sort((a, b) => b.n - a.n);
  }, [stats.keyMisses]);

  const maxFinger = fingerErrors.reduce((m, x) => Math.max(m, x.n), 1);
  const worstKeys = Object.entries(stats.keyMisses)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const maxKey = worstKeys.reduce((m, [, n]) => Math.max(m, n), 1);

  const earned = new Set(stats.badges);
  const accuracy = formatPercent(t.keystrokes > 0 ? (t.correctChars / t.keystrokes) * 100 : 0);
  const historyTruncated = stats.runs.length >= RUN_HISTORY_LIMIT;

  return (
    <div className="screen-scroll h-full w-full overflow-y-auto px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-12">
        <header className="flex flex-wrap items-center gap-3">
          <div>
            <p className="label-xs text-amber">career file · {t.races} races logged</p>
            <h1 className="font-display text-4xl leading-none text-cream sm:text-5xl">GARAGE</h1>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="btn-3d ml-auto flex items-center gap-2 rounded-xl border border-line bg-panel-2 px-4 py-2.5 font-display text-sm text-cream"
          >
            <X size={15} aria-hidden /> BACK <span className="label-xs opacity-60">ESC</span>
          </button>
        </header>

        {issues.length > 0 && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-amber/50 bg-amber/10 p-3 text-[11px] leading-relaxed text-amber"
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span>{issues.join(" ")}</span>
          </p>
        )}

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label="Career totals">
          {[
            ["RACES", formatNumber(t.races)],
            ["FINISHED", formatNumber(t.finishedRaces)],
            ["BEST WPM", String(Math.min(MAX_WPM, t.bestWpm))],
            ["BEST SCORE", formatNumber(t.bestScore)],
            ["KEYS", formatNumber(t.keystrokes)],
            ["TIME ON TRACK", formatDuration(t.ms)],
          ].map(([k, v]) => (
            <div key={k} className="panel rounded-xl p-3">
              <div className="label-xs text-mute">{k}</div>
              <div className="font-display text-2xl leading-none text-cream">{v}</div>
            </div>
          ))}
        </section>

        <section className="panel rounded-xl p-4" aria-labelledby={`${uid}-trend`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 id={`${uid}-trend`} className="font-display text-sm">
              WPM PROGRESSION
            </h2>
            <span className="label-xs text-mute">
              last {shown.length} of {runs.length} stored race{runs.length === 1 ? "" : "s"} · peak {peak} WPM ·{" "}
              {accuracy} lifetime accuracy
            </span>
            <div className="ml-auto flex flex-wrap gap-1" role="group" aria-label="Filter by mode">
              {(["all", ...MODES.map((m) => m.id)] as const).map((m) => {
                const on = modeFilter === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setModeFilter(m)}
                    className={`label-xs rounded-md border px-2 py-1 transition-colors ${
                      on
                        ? "border-amber/70 bg-amber/12 text-amber"
                        : "border-line bg-panel-2/60 text-mute hover:text-cream"
                    }`}
                  >
                    {m === "all" ? "ALL" : getMode(m).name}
                  </button>
                );
              })}
            </div>
          </div>
          <Sparkline
            series={trend}
            color={modeFilter === "all" ? PALETTE.amber : modeAccent(modeFilter)}
            width={900}
            height={130}
            floor={Math.max(20, Math.min(40, peak - 15))}
            pointColors={shown.map((r) => modeAccent(r.mode))}
            label={
              trend.length > 1 ? `WPM across ${trend.length} races, best ${peak}` : "Not enough races yet for a trend"
            }
          />
          <label htmlFor={`${uid}-depth`} className="label-xs mt-3 flex items-center gap-3 text-mute">
            <span>Depth</span>
            <input
              id={`${uid}-depth`}
              type="range"
              min={5}
              max={Math.max(5, Math.min(RUN_HISTORY_LIMIT, runs.length))}
              step={5}
              value={Math.min(depth, Math.max(5, runs.length))}
              onChange={(e) => setDepth(Number(e.target.value))}
              aria-valuetext={`${shown.length} races shown`}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-amber"
            />
            <span className="font-mono text-cream/70">{shown.length}</span>
          </label>
          {historyTruncated && (
            <p className="label-xs mt-2 text-mute">
              The race list keeps the newest {RUN_HISTORY_LIMIT} for speed; totals above always count every race ever
              played.
            </p>
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="panel rounded-xl p-4" aria-labelledby={`${uid}-finger`}>
            <h2 id={`${uid}-finger`} className="font-display mb-3 text-sm">
              ERRORS BY FINGER
            </h2>
            {maxFinger === 1 && fingerErrors.every((f) => f.n === 0) ? (
              <p className="text-[11px] text-mint">No recorded miskeys. The fingers are behaving.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {fingerErrors.map(({ finger, n }) => (
                  <BarRow
                    key={finger}
                    label={finger}
                    value={n}
                    max={maxFinger}
                    color={FINGER_COLOR[finger]}
                    hint={FINGER_LABEL[finger]}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="panel rounded-xl p-4" aria-labelledby={`${uid}-keys`}>
            <h2 id={`${uid}-keys`} className="font-display mb-3 text-sm">
              MOST PUNISHED KEYS
            </h2>
            {worstKeys.length === 0 ? (
              <p className="text-[11px] text-mute">Type a few races and this becomes your practice list.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {worstKeys.map(([k, n]) => (
                  <BarRow
                    key={k}
                    label={k === " " ? "␣" : k}
                    value={n}
                    max={maxKey}
                    color={PALETTE.coral}
                    hint={`${n} miskeys on "${k === " " ? "space" : k}"`}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="panel rounded-xl p-4" aria-labelledby={`${uid}-bests`}>
          <h2 id={`${uid}-bests`} className="font-display mb-3 text-sm">
            PERSONAL BESTS BY MODE
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <caption className="sr-only">Personal best speed, accuracy and score for each race mode</caption>
              <thead>
                <tr className="label-xs text-mute">
                  <th scope="col" className="py-1.5">
                    MODE
                  </th>
                  <th scope="col">WPM</th>
                  <th scope="col">ACC</th>
                  <th scope="col">SCORE</th>
                  <th scope="col" className="text-right">
                    RACES
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono text-[11px]">
                {MODES.map((m) => {
                  const b = stats.best[m.id];
                  const count = stats.runs.filter((r) => r.mode === m.id).length;
                  return (
                    <tr key={m.id} className="border-t border-line/60">
                      <th scope="row" className="py-1.5 text-left font-display text-xs" style={{ color: m.accent }}>
                        {m.name}
                      </th>
                      <td>{b ? b.wpm : "—"}</td>
                      <td>{b ? formatPercent(b.accuracy) : "—"}</td>
                      <td>{b ? formatNumber(b.score) : "—"}</td>
                      <td className="text-right text-mute">{count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="label-xs mt-2 text-mute">
            Bests only accept a race that was finished with no skipped words (
            {DIFFICULTIES.map((d) => d.name).join("/")}) — a Tab-spammed track cannot hold a record.
          </p>
        </section>

        <section className="panel rounded-xl p-4" aria-labelledby={`${uid}-badges`}>
          <div className="mb-3 flex items-center gap-2">
            <Trophy size={15} className="text-amber/80" aria-hidden />
            <h2 id={`${uid}-badges`} className="font-display text-sm">
              BADGES · {earned.size}/{BADGES.length}
            </h2>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {BADGES.map((b) => {
              const on = earned.has(b.id);
              return (
                <li
                  key={b.id}
                  className="rounded-lg border px-2.5 py-1.5"
                  style={{
                    borderColor: on ? `${b.color}88` : "var(--color-line)",
                    background: on ? `${b.color}12` : "transparent",
                    opacity: on ? 1 : 0.55,
                  }}
                  title={b.desc}
                >
                  <span
                    className="font-display block text-[11px]"
                    style={{ color: on ? b.color : "var(--color-mute)" }}
                  >
                    {b.name}
                  </span>
                  <span className="font-mono text-[9px] text-mute">{b.desc}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {runs.length > 0 && (
          <section className="panel rounded-xl p-4" aria-labelledby={`${uid}-log`}>
            <h2 id={`${uid}-log`} className="font-display mb-3 text-sm">
              RACE LOG
            </h2>
            <ul className="flex flex-col gap-1.5">
              {runs.slice(0, 12).map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-line/60 bg-ink-2/50 px-2.5 py-1.5"
                >
                  <span className="label-xs w-16 shrink-0" style={{ color: modeAccent(r.mode) }}>
                    {getMode(r.mode).name.replace(/^[A-Z]+ ?/, "") || getMode(r.mode).name}
                  </span>
                  <span className="label-xs text-mute">{getDifficulty(r.difficulty).name}</span>
                  <span className="font-mono text-[10px] text-cream/80">
                    {r.wpm} WPM · {formatPercent(r.accuracy)} · {formatNumber(r.score)}
                  </span>
                  {r.skips > 0 && <span className="label-xs text-coral">{r.skips} skip</span>}
                  <span className={`label-xs ml-auto ${r.finished ? "text-mint" : "text-coral"}`}>
                    {r.endReason.toUpperCase()}
                  </span>
                  <span className="font-mono text-[9px] text-mute">{new Date(r.date).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="panel rounded-xl border-coral/40 p-4" aria-labelledby={`${uid}-danger`}>
          <h2 id={`${uid}-danger`} className="font-display text-sm text-coral">
            WIPE THE GARAGE
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-mute">
            Deletes every stored race, badge and personal best from this browser. There is no undo, and nothing is kept
            on a server — this data only ever lived on this device.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {confirming ? (
              <>
                <button
                  type="button"
                  onClick={onWipe}
                  className="btn-3d flex items-center gap-2 rounded-lg bg-coral px-4 py-2 font-display text-sm text-ink"
                >
                  <Eraser size={15} aria-hidden /> YES, ERASE {formatNumber(t.races)} RACES
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="label-xs rounded-lg border border-line px-3 py-2 text-mute hover:text-cream"
                >
                  CANCEL
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="btn-3d flex items-center gap-2 rounded-lg border border-coral/50 bg-coral/10 px-4 py-2 font-display text-sm text-coral"
              >
                <Eraser size={15} aria-hidden /> WIPE PROGRESS
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
