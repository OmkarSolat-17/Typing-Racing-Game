import { memo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import type { Snap } from "../game/useEngine";
import type { ModeDef } from "../game/types";

const Sparkline = memo(function Sparkline({ series, color }: { series: number[]; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 104;
    const H = 26;
    c.width = W * dpr;
    c.height = H * dpr;
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (series.length < 2) return;
    const max = Math.max(40, ...series);
    const step = W / Math.max(1, series.length - 1);
    ctx.beginPath();
    series.forEach((v, i) => {
      const x = i * step;
      const y = H - (v / max) * (H - 4) - 2;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 7;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = `${color}22`;
    ctx.fill();
  }, [series, color]);
  return <canvas ref={ref} className="block" />;
});

interface Props {
  snap: Snap;
  def: ModeDef;
  accent: string;
  sound: boolean;
  onToggleSound: () => void;
  onPause: () => void;
  onQuit: () => void;
}

export const Hud = memo(function Hud({ snap, def, accent, sound, onToggleSound, onPause, onQuit }: Props) {
  const timeMode = !!def.seconds;
  const secs = snap.timeLeft / 1000;
  const urgent = timeMode && secs <= 10;
  const energyLow = !!def.energy && snap.energy < 25;
  const placeTxt = snap.place === 1 ? "1ST" : snap.place === 2 ? "2ND" : "3RD";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-1.5 p-2 sm:gap-2 sm:p-3">
      {/* row 1 — identity, score, controls */}
      <div className="mx-auto flex w-full max-w-[1100px] items-stretch gap-1.5 sm:gap-2">
        <div className="panel pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2">
          <span className="h-7 w-[4px] shrink-0 rounded-full" style={{ background: accent }} />
          <div className="min-w-0">
            <div className="label-xs truncate" style={{ color: accent }}>
              {def.name}
            </div>
            <div className="font-mono text-[10px] text-mute sm:text-[11px]">
              word {Math.min(snap.idx + 1, snap.words.length)}/{snap.words.length}
            </div>
          </div>
        </div>

        <div className="panel pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2">
          <div className="min-w-0">
            <span className="label-xs text-mute">Score</span>
            <motion.div
              key={snap.score}
              initial={{ scale: 1.18, color: accent }}
              animate={{ scale: 1, color: "#f3efe4" }}
              transition={{ duration: 0.16 }}
              className="font-display text-lg leading-none sm:text-2xl"
            >
              {snap.score.toLocaleString()}
            </motion.div>
          </div>
          <div className="ml-auto text-right">
            <motion.span
              key={snap.mult}
              initial={{ scale: 1.6, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              className="font-display text-base leading-none sm:text-xl"
              style={{ color: snap.mult >= 4 ? "#ff5a7a" : snap.mult >= 2 ? accent : "#8b96c4" }}
            >
              x{snap.mult}
            </motion.span>
            <div className="mt-1 flex justify-end gap-[3px]">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-[5px] w-2.5 rounded-sm transition-colors duration-150 sm:w-3"
                  style={{
                    background: i < snap.combo % 4 || (snap.combo >= 16 && i < 4) ? accent : "#2c3866",
                    boxShadow: i < snap.combo % 4 ? `0 0 8px ${accent}` : undefined,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="panel pointer-events-auto flex shrink-0 items-center gap-1 rounded-xl px-1.5 py-1.5 sm:gap-1.5 sm:px-2">
          <HudBtn onClick={onToggleSound} label={sound ? "Mute" : "Unmute"}>
            {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </HudBtn>
          <HudBtn onClick={onPause} label={snap.status === "paused" ? "Resume" : "Pause"}>
            {snap.status === "paused" ? <Play size={15} /> : <Pause size={15} />}
          </HudBtn>
          <HudBtn onClick={onQuit} label="Quit">
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
                style={{ color: urgent ? "#ff5a7a" : "#f3efe4" }}
              >
                {secs.toFixed(secs < 10 ? 1 : 0)}s
              </motion.span>
            </div>
          ) : def.energy ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="label-xs text-mute">Boost tank</span>
                <span className="ml-auto font-mono text-[10px]" style={{ color: energyLow ? "#ff5a7a" : "#8b96c4" }}>
                  {Math.round(snap.energy)}%{energyLow ? " REFUEL!" : ""}
                </span>
              </div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full border border-line bg-ink">
                <motion.div
                  className="h-full rounded-full"
                  animate={{ width: `${snap.energy}%` }}
                  transition={{ duration: 0.14, ease: "linear" }}
                  style={{
                    background: energyLow ? "linear-gradient(90deg,#ff5a7a,#ffb020)" : "linear-gradient(90deg,#35e0a1,#4cc9ff)",
                    boxShadow: `0 0 12px ${energyLow ? "#ff5a7a" : "#35e0a1"}`,
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="label-xs text-mute">Lap progress</span>
                <span className="ml-auto font-mono text-[10px] text-mute">{Math.round(snap.progress * 100)}%</span>
              </div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full border border-line bg-ink">
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

        <Tele label="WPM" value={String(snap.wpm)} color={accent} />
        <Tele label="ACC" value={`${snap.accuracy.toFixed(snap.accuracy < 100 ? 1 : 0)}%`} color="#35e0a1" />
        <Tele label="POS" value={placeTxt} color={snap.place === 1 ? "#ffb020" : "#4cc9ff"} />
        <div className="panel hidden shrink-0 items-center rounded-xl px-2.5 md:flex">
          <Sparkline series={snap.series} color={accent} />
        </div>
      </div>
    </div>
  );
});

function Tele({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="panel pointer-events-auto flex min-w-0 flex-1 flex-col justify-center rounded-xl px-2.5 py-1.5">
      <span className="label-xs text-mute">{label}</span>
      <span className="truncate font-display text-lg leading-none sm:text-2xl" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function HudBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-panel-2/70 text-mute transition-colors hover:border-amber hover:text-amber sm:h-9 sm:w-9"
    >
      {children}
    </button>
  );
}
