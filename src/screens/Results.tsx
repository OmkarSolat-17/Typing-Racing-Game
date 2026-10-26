import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Home as HomeIcon, RotateCcw, Trophy, TrendingUp } from "lucide-react";
import { getDifficulty, getMode } from "../game/config";
import { FINGER_COLOR, fingerOf } from "../game/fingers";
import { badgeById, badgeName } from "../game/badges";
import { formatDuration, formatNumber, formatPercent, placeLabel } from "../game/metrics";
import { sfx } from "../game/audio";
import { Sparkline } from "../components/Sparkline";
import type { RunRecord, Stats } from "../game/types";

interface Props {
  record: RunRecord;
  stats: Stats;
  newBadges: string[];
  onReplay: () => void;
  onHome: () => void;
  onStats: () => void;
}

const END_COPY: Record<RunRecord["endReason"], { label: string; tone: "good" | "bad" }> = {
  track: { label: "TRACK CLEARED", tone: "good" },
  clock: { label: "TIME UP", tone: "good" },
  crash: { label: "BOOST DRAINED", tone: "bad" },
  abandon: { label: "RACE ABANDONED", tone: "bad" },
};

/** Split a `keyMisses` map into the offenders that actually deserve attention. */
const worstKeys = (map: Record<string, number>, limit = 8) =>
  Object.entries(map)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);

export default function Results({ record, stats, newBadges, onReplay, onHome, onStats }: Props) {
  const accent = getMode(record.mode).accent;
  const end = END_COPY[record.endReason];
  const [celebrate, setCelebrate] = useState(newBadges.length > 0);

  const isPb = useMemo(() => {
    if (!record.valid) return false;
    const prior = stats.runs.filter((r) => r.id !== record.id && r.mode === record.mode && r.valid);
    return prior.every((r) => record.score > r.score);
  }, [record, stats]);

  const podium = record.finished && record.field > 0 && record.place === 1;
  const misses = worstKeys(record.keyMisses);
  const maxMiss = misses.reduce((m, [, n]) => Math.max(m, n), 1);

  useEffect(() => {
    if (newBadges.length > 0) sfx.badge();
    // Announce for screen readers, then hand the stage to the numbers.
    const t = window.setTimeout(() => setCelebrate(false), 2600);
    return () => window.clearTimeout(t);
  }, [newBadges]);

  const headline = !record.finished
    ? "RUN NOT COMPLETED"
    : podium
      ? "WINNER"
      : record.wpm >= 70
        ? "INSANE RUN"
        : record.wpm >= 45
          ? "CLEAN LAPS"
          : "FINISHED";

  const grid = [
    { k: "WPM", v: formatNumber(record.wpm), sub: `raw ${record.rawWpm}`, color: accent },
    {
      k: "ACCURACY",
      v: formatPercent(record.accuracy),
      sub: `${record.incorrectChars} errors`,
      color: "var(--color-mint)",
    },
    { k: "SCORE", v: formatNumber(record.score), sub: `${record.maxCombo}x best combo`, color: "var(--color-amber)" },
    {
      k: record.field > 0 ? "POSITION" : "DISTANCE",
      v: record.field > 0 ? placeLabel(record.place) : `${record.words}w`,
      sub: record.field > 0 ? `of ${record.field} cars` : `${formatDuration(record.durationMs)}`,
      color: "var(--color-sky)",
    },
  ];

  return (
    <div className="screen-scroll h-full w-full overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header className="panel relative overflow-hidden rounded-2xl p-5 text-center sm:p-7">
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
            style={{ background: `linear-gradient(90deg,transparent,${accent},transparent)` }}
            aria-hidden
          />
          <p className="label-xs" style={{ color: end.tone === "good" ? accent : "var(--color-coral)" }}>
            {end.label} · {getMode(record.mode).name} · {getDifficulty(record.difficulty).name}
          </p>
          <motion.h1
            initial={{ scale: 0.86, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 18 }}
            className="font-display mt-1 text-[13vw] leading-[0.9] sm:text-6xl"
            style={{ color: accent, textShadow: `0 0 44px ${accent}55` }}
          >
            {headline}
          </motion.h1>

          {!record.valid && (
            <p className="mx-auto mt-2 max-w-md text-[11px] leading-relaxed text-mute" role="note">
              {record.skips > 0
                ? `${record.skips} skipped ${record.skips === 1 ? "word" : "words"} — this run stays in your history but cannot set a personal best.`
                : record.correctChars < 8
                  ? "Too little input to score: this run is recorded for history only."
                  : "This run is recorded for history only."}
            </p>
          )}
          {isPb && record.valid && (
            <p className="label-xs mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber/60 bg-amber/12 px-3 py-1 text-amber">
              <Trophy size={12} aria-hidden /> NEW PERSONAL BEST FOR {getMode(record.mode).name.toUpperCase()}
            </p>
          )}
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {grid.map((g) => (
            <div key={g.k} className="panel rounded-xl p-3">
              <div className="label-xs text-mute">{g.k}</div>
              <div className="font-display text-3xl leading-none" style={{ color: g.color }}>
                {g.v}
              </div>
              <div className="mt-1 font-mono text-[10px] text-cream/50">{g.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr]">
          <section className="panel rounded-xl p-4" aria-labelledby="pace-h">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp size={15} className="text-cream/70" aria-hidden />
              <h2 id="pace-h" className="font-display text-sm">
                PACE CURVE
              </h2>
              <span className="label-xs ml-auto text-mute">{Math.round(record.durationMs / 1000)}s sampled</span>
            </div>
            <Sparkline
              series={record.series}
              color={accent}
              width={520}
              height={104}
              floor={Math.max(0, Math.min(40, record.wpm - 10))}
              label={`WPM over ${record.series.length} samples, peaking at ${Math.max(0, ...record.series)}`}
              area
            />
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              {[
                ["PEAK", `${Math.max(0, ...record.series)}`],
                [
                  "MEAN",
                  record.series.length > 0
                    ? String(Math.round(record.series.reduce((a, b) => a + b, 0) / record.series.length))
                    : "0",
                ],
                ["KEYS", formatNumber(record.correctChars + record.incorrectChars)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line/70 bg-ink-2/60 py-1.5">
                  <div className="label-xs text-mute">{k}</div>
                  <div className="font-display text-base text-cream">{v}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel rounded-xl p-4" aria-labelledby="keys-h">
            <h2 id="keys-h" className="font-display mb-2 text-sm">
              SLIPPERY KEYS
            </h2>
            {misses.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-mint">
                Not one mistyped key. That is the rarest board on this screen.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {misses.map(([k, n]) => {
                  const color = FINGER_COLOR[fingerOf(k)];
                  return (
                    <li key={k} className="flex items-center gap-2">
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md border font-mono text-[11px] font-bold"
                        style={{ borderColor: color, color, background: `${color}1a` }}
                        title={fingerOf(k)}
                      >
                        {k === " " ? "␣" : k}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink" aria-hidden>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(n / maxMiss) * 100}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(90deg,${color}66,${color})` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-[10px] text-cream/70">{n}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="label-xs mt-2 text-mute">Colour = the finger that owns the key on a US layout.</p>
          </section>
        </div>

        {celebrate && newBadges.length > 0 ? (
          <section className="panel rounded-xl border-amber/50 p-4" role="status" aria-live="polite">
            <h2 className="font-display mb-2 text-sm text-amber">BADGE UNLOCKED</h2>
            <ul className="flex flex-wrap gap-2">
              {newBadges.map((id) => {
                const b = badgeById(id);
                return (
                  <li
                    key={id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2"
                    style={{ borderColor: `${b?.color ?? accent}66`, background: `${b?.color ?? accent}12` }}
                  >
                    <Trophy size={15} style={{ color: b?.color ?? accent }} aria-hidden />
                    <span>
                      <span className="font-display block text-xs text-cream">{badgeName(id)}</span>
                      <span className="font-mono text-[10px] text-mute">{b?.desc}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              sfx.ui();
              onReplay();
            }}
            className="btn-3d flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber px-5 py-3.5 font-display text-base text-ink"
          >
            <RotateCcw size={17} aria-hidden /> RACE AGAIN <span className="label-xs opacity-60">R</span>
          </button>
          <button
            type="button"
            onClick={() => {
              sfx.ui();
              onStats();
            }}
            className="btn-3d flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-5 py-3.5 font-display text-base text-cream"
          >
            CAREER <ArrowRight size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              sfx.ui();
              onHome();
            }}
            className="btn-3d flex items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-5 py-3.5 font-display text-base text-cream"
          >
            <HomeIcon size={16} aria-hidden /> GARAGE <span className="label-xs opacity-60">ESC</span>
          </button>
        </div>

        <p className="text-center font-mono text-[10px] text-mute">
          {new Date(record.date).toLocaleString()} · run {record.id} ·
          {record.valid ? "counts toward personal bests" : "history only"}
        </p>
      </div>
    </div>
  );
}
