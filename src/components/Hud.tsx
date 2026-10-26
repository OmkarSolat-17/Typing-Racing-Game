import { memo } from "react";
import { motion } from "framer-motion";
import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { Sparkline } from "./Sparkline";
import { ENERGY, SCORE, COMBO } from "../game/config";
import { formatClock, formatNumber, formatPercent, placeLabel } from "../game/metrics";
import type { Snapshot } from "../game/rules";
import type { ModeDef } from "../game/types";

const PIPS = COMBO.step;

interface Props {
  snap: Snapshot;
  def: ModeDef;
  accent: string;
  sound: boolean;
  onToggleSound: () => void;
  onPause: () => void;
  onQuit: () => void;
}

/**
 * Race telemetry. Purely a function of `Snapshot`: every number here is produced by
 * `game/metrics.ts`, so the HUD can never disagree with the results screen about what a
 * run measured.
 */
export const Hud = memo(function Hud({ snap, def, accent, sound, onToggleSound, onPause, onQuit }: Props) {
  const timeMode = def.seconds !== null;
  const urgent = timeMode && snap.timeLeft <= 10_000;
  const energyMode = def.energy;
  const energyLow = energyMode && snap.energy < 25;
  const liveWpm = Math.round(snap.wpm);
  const nextWord = Math.min(snap.idx + 1, snap.totalWords);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-1.5 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-2 sm:p-3">
      {/* row 1 — identity, score, controls */}
      <div className="mx-auto flex w-full max-w-[1100px] items-stretch gap-1.5 sm:gap-2">
        <div className="panel pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2">
          <span className="h-7 w-[4px] shrink-0 rounded-full" style={{ background: accent }} />
          <div className="min-w-0">
            <div className="label-xs truncate" style={{ color: accent }}>
              {def.name}
            </div>
            <div className="font-mono text-[10px] text-mute sm:text-[11px]">
              word {nextWord}/{snap.totalWords}
              {snap.skips > 0 ? ` · ${snap.skips} skip${snap.skips > 1 ? "s" : ""}` : ""}
            </div>
          </div>
        </div>

        <div className="panel pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2">
          <div className="min-w-0">
            <span className="label-xs text-mute">Score</span>
            <motion.div
              key={snap.score}
              initial={{ scale: 1.18, color: accent }}
              animate={{ scale: 1, color: "var(--color-cream)" }}
              transition={{ duration: 0.16 }}
              className="font-display text-lg leading-none sm:text-2xl"
            >
              {formatNumber(snap.score)}
            </motion.div>
          </div>
          <div className="ml-auto text-right">
            <motion.span
              key={snap.mult}
              initial={{ scale: 1.6, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              className="font-display text-base leading-none sm:text-xl"
              style={{ color: snap.mult >= 4 ? "var(--color-coral)" : snap.mult >= 2 ? accent : "var(--color-mute)" }}
            >
              x{snap.mult}
            </motion.span>
            <div className="mt-1 flex justify-end gap-[3px]" aria-hidden>
              {Array.from({ length: PIPS }, (_, i) => {
                /** `tier` is how far into the *next* multiplier you are — it never blanks out on promotion. */
                const lit = snap.tier > i / PIPS || snap.mult >= COMBO.maxMult;
                return (
                  <span
                    key={i}
                    className="h-[5px] w-2.5 rounded-sm transition-colors duration-150 sm:w-3"
                    style={{
                      background: lit ? accent : "var(--color-line)",
                      boxShadow: lit ? `0 0 8px ${accent}` : undefined,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel pointer-events-auto flex shrink-0 items-center gap-1 rounded-xl px-1.5 py-1.5 sm:gap-1.5 sm:px-2">
          <HudBtn onClick={onToggleSound} label={sound ? "Mute sound" : "Unmute sound"} pressed={sound}>
            {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </HudBtn>
          <HudBtn
            onClick={onPause}
            label={snap.status === "paused" ? "Resume race" : "Pause race"}
            disabled={snap.status !== "playing" && snap.status !== "paused"}
          >
            {snap.status === "paused" ? <Play size={15} /> : <Pause size={15} />}
          </HudBtn>
          <HudBtn onClick={onQuit} label="Quit race">
            <X size={15} />
          </HudBtn>
        </div>
      </div>

      {/* row 2 — live telemetry */}
      <div className="mx-auto flex w-full max-w-[1100px] items-stretch gap-1.5 sm:gap-2">
        <div className="panel pointer-events-auto flex min-w-0 flex-[1.6] flex-col justify-center rounded-xl px-2.5 py-1.5 sm:px-3">
          {timeMode ? (
            <div className="flex items-baseline gap-2">
              <span className="label-xs text-mute">Clock</span>
              <motion.span
                animate={urgent ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                transition={urgent ? { repeat: Infinity, duration: 0.55 } : {}}
                className="ml-auto font-display text-xl leading-none sm:text-2xl"
                style={{ color: urgent ? "var(--color-coral)" : "var(--color-cream)" }}
              >
                {formatClock(snap.timeLeft)}s
              </motion.span>
            </div>
          ) : energyMode ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="label-xs text-mute">Boost tank</span>
                <span
                  className="ml-auto font-mono text-[10px]"
                  style={{ color: energyLow ? "var(--color-coral)" : "var(--color-mute)" }}
                >
                  {Math.round(snap.energy)}%{energyLow ? " REFUEL!" : ""}
                </span>
              </div>
              <div
                className="mt-1 h-2.5 w-full overflow-hidden rounded-full border border-line bg-ink"
                role="progressbar"
                aria-label="Boost tank"
                aria-valuenow={Math.round(snap.energy)}
                aria-valuemin={0}
                aria-valuemax={ENERGY.max}
              >
                <motion.div
                  className="h-full rounded-full"
                  animate={{ width: `${Math.max(0, Math.min(100, snap.energy))}%` }}
                  transition={{ duration: 0.14, ease: "linear" }}
                  style={{
                    background: energyLow
                      ? "linear-gradient(90deg,var(--color-coral),var(--color-amber))"
                      : "linear-gradient(90deg,var(--color-mint),var(--color-sky))",
                    boxShadow: `0 0 12px ${energyLow ? "var(--color-coral)" : "var(--color-mint)"}`,
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="label-xs text-mute">Lap progress{snap.lap > 1 ? ` · lap ${snap.lap}` : ""}</span>
                <span className="ml-auto font-mono text-[10px] text-mute">{Math.round(snap.progress * 100)}%</span>
              </div>
              <div
                className="mt-1 h-2.5 w-full overflow-hidden rounded-full border border-line bg-ink"
                role="progressbar"
                aria-label="Lap progress"
                aria-valuenow={Math.round(snap.progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <motion.div
                  className="h-full rounded-full"
                  animate={{ width: `${snap.progress * 100}%` }}
                  transition={{ type: "spring", stiffness: 140, damping: 24 }}
                  style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
                />
              </div>
            </>
          )}
        </div>

        <Tele
          label="WPM"
          value={String(liveWpm)}
          color={accent}
          hint={`${SCORE.perChar} pts per clean key x${snap.mult}`}
        />
        <Tele label="ACC" value={formatPercent(snap.accuracy)} color="var(--color-mint)" />
        <Tele
          label="POS"
          value={snap.field > 0 ? placeLabel(snap.place) : "—"}
          color={snap.place === 1 ? "var(--color-amber)" : "var(--color-sky)"}
        />
        <div className="panel hidden shrink-0 items-center rounded-xl px-2.5 md:flex" aria-hidden>
          <Sparkline
            series={snap.series}
            color={accent}
            width={104}
            height={26}
            padY={2}
            floor={40}
            gridlines={false}
            animate={false}
            area
            label="Live WPM graph"
          />
        </div>
      </div>
    </div>
  );
});

function Tele({ label, value, color, hint }: { label: string; value: string; color: string; hint?: string }) {
  return (
    <div
      className="panel pointer-events-auto flex min-w-0 flex-1 flex-col justify-center rounded-xl px-2.5 py-1.5"
      title={hint}
    >
      <span className="label-xs text-mute">{label}</span>
      <span className="truncate font-display text-lg leading-none sm:text-2xl" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function HudBtn({
  onClick,
  label,
  children,
  pressed,
  disabled,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-panel-2/70 text-mute transition-colors hover:border-amber hover:text-amber focus-visible:outline-2 focus-visible:outline-amber disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
    >
      {children}
    </button>
  );
}
