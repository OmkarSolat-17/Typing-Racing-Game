import { memo, useEffect, useId, useRef } from "react";
import { wpm } from "../game/metrics";
import type { RunState } from "../game/rules";

interface Props {
  /** Live race state. Read inside the frame loop, never copied into React state. */
  stateRef: React.RefObject<RunState>;
  accent: string;
  /** Names/colours of the field, from the snapshot. */
  rivals: readonly { name: string; color: string }[];
  /** Only animate while a race is actually moving; otherwise the loop stays parked. */
  active: boolean;
}

interface CarProps {
  color: string;
  /** Unique per instance: a shared `<linearGradient id>` made every car adopt the first paint. */
  gradientId: string;
}

const Car = memo(function Car({ color, gradientId }: CarProps) {
  return (
    <svg viewBox="0 0 64 28" width="64" height="28" aria-hidden className="block">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="45%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <rect x="1" y="5" width="4" height="12" rx="1.5" fill={color} opacity="0.85" />
      <path
        d="M6 19 L9 12 Q11 8 17 7 L30 6 Q38 6 44 10 L56 13 Q62 15 62 18 L62 20 Q62 21 60 21 L8 21 Q6 21 6 19 Z"
        fill={`url(#${gradientId})`}
      />
      <path d="M24 7.5 Q30 6.6 36 8.6 L38 11 L23 11 Z" fill="var(--color-ink)" opacity="0.7" />
      <rect x="12" y="14.5" width="44" height="1.8" fill="var(--color-ink)" opacity="0.32" />
      <circle cx="17" cy="21" r="5.4" fill="var(--color-ink)" />
      <circle cx="17" cy="21" r="2.2" fill={color} />
      <circle cx="49" cy="21" r="5.4" fill="var(--color-ink)" />
      <circle cx="49" cy="21" r="2.2" fill={color} />
      <circle cx="60" cy="17" r="1.6" fill="#fff8dc" />
    </svg>
  );
});

interface LaneProps {
  label: string;
  color: string;
  you?: boolean;
  gradientId: string;
  carRef: (el: HTMLDivElement | null) => void;
  wpmRef: (el: HTMLSpanElement | null) => void;
  trailRef: (el: HTMLDivElement | null) => void;
}

const Lane = memo(function Lane({ label, color, you, gradientId, carRef, wpmRef, trailRef }: LaneProps) {
  return (
    <div
      className={`relative h-[38px] overflow-hidden border-b border-line/50 sm:h-[52px] ${you ? "bg-cream/[0.055]" : "bg-ink-2/40"}`}
      role="img"
      aria-label={`${label} lane`}
    >
      <div
        className="absolute inset-x-0 bottom-0 h-[3px] opacity-25"
        style={{ background: `repeating-linear-gradient(90deg, ${color} 0 18px, transparent 18px 42px)` }}
      />
      <div
        ref={trailRef}
        className="pointer-events-none absolute top-1/2 left-14 h-[3px] w-24 rounded-full opacity-0 blur-[1px] will-change-transform"
        style={{ background: `linear-gradient(90deg, transparent, ${color})` }}
      />
      <div ref={carRef} className="absolute top-1/2 left-14 -translate-y-1/2 will-change-transform">
        <Car color={color} gradientId={gradientId} />
      </div>
      <span
        className="label-xs pointer-events-none absolute top-1.5 left-2 rounded px-1.5 py-1 font-bold"
        style={{ color: you ? "var(--color-ink)" : color, background: you ? color : "rgba(10,13,28,.72)" }}
      >
        {label}
      </span>
      <span
        ref={wpmRef}
        className="label-xs pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-cream/40"
      />
    </div>
  );
});

/** Left padding of the lane label, right gutter for the finish flag — shared by every car. */
const LANE_INSET_PX = 56;
const FINISH_GUTTER_PX = 20;
const CAR_PX = 64;
/** Text (wpm labels) is throttled harder than geometry: 6 Hz is plenty for a number. */
const TEXT_INTERVAL_MS = 160;

/**
 * Rival lanes.
 *
 * Car transforms are written straight to the DOM inside a frame loop, so 60 fps motion
 * costs zero React renders. The loop only runs while `active` — it used to run forever,
 * including on the results and career screens.
 */
export const RivalTrack = memo(function RivalTrack({ stateRef, accent, rivals, active }: Props) {
  const uid = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const youCar = useRef<HTMLDivElement | null>(null);
  const youWpm = useRef<HTMLSpanElement | null>(null);
  const youTrail = useRef<HTMLDivElement | null>(null);
  const cars = useRef<(HTMLDivElement | null)[]>([]);
  const wpms = useRef<(HTMLSpanElement | null)[]>([]);
  const trails = useRef<(HTMLDivElement | null)[]>([]);
  const lastText = useRef(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;

    const place = (el: HTMLDivElement | null, dist: number, trail: HTMLDivElement | null, speed: number) => {
      if (el === null) return;
      const s = stateRef.current;
      if (s === null) return;
      const laneW = wrapRef.current?.clientWidth ?? window.innerWidth - 32;
      const travel = Math.max(0, laneW - LANE_INSET_PX - FINISH_GUTTER_PX - CAR_PX);
      const p = Math.min(1, s.lapChars > 0 ? dist / s.lapChars : 0);
      const x = p * travel;
      el.style.transform = `translate3d(${x}px,-50%,0)`;
      if (trail !== null) {
        trail.style.opacity = String(Math.min(0.8, Math.max(0, speed / 95)));
        trail.style.width = `${36 + Math.min(96, Math.max(0, speed))}px`;
        trail.style.transform = `translate3d(${x - 92}px,-50%,0)`;
      }
    };

    const loop = (at: number) => {
      raf = requestAnimationFrame(loop);
      const s = stateRef.current;
      if (s === null || s.lapChars <= 0) return;

      // Same measurement the HUD uses — one WPM definition for the whole screen.
      const youSpeed = wpm(s.dist, s.elapsed);
      place(youCar.current, s.dist, youTrail.current, youSpeed);
      s.rivals.forEach((r, i) => {
        const car = cars.current[i];
        const trail = trails.current[i];
        if (car !== undefined && trail !== undefined) place(car, r.dist, trail, r.wpm);
      });

      if (at - lastText.current >= TEXT_INTERVAL_MS) {
        lastText.current = at;
        const lap = s.lapChars > 0 ? Math.floor(s.dist / s.lapChars) + 1 : 1;
        if (youWpm.current !== null) youWpm.current.textContent = `${youSpeed} wpm${lap > 1 ? ` · lap ${lap}` : ""}`;
        s.rivals.forEach((r, i) => {
          const el = wpms.current[i];
          if (el !== null && el !== undefined)
            el.textContent = r.finished ? `finished ${(r.finishAt / 1000).toFixed(1)}s` : `${Math.round(r.wpm)} wpm`;
        });
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, stateRef]);

  return (
    <div ref={wrapRef} className="panel relative mx-auto w-full max-w-[1100px] overflow-hidden rounded-xl">
      <Lane
        label="YOU"
        color={accent}
        you
        gradientId={`${uid}-you`}
        carRef={(el) => {
          youCar.current = el;
        }}
        wpmRef={(el) => {
          youWpm.current = el;
        }}
        trailRef={(el) => {
          youTrail.current = el;
        }}
      />
      {rivals.map((r, i) => (
        <Lane
          key={r.name}
          label={r.name}
          color={r.color}
          gradientId={`${uid}-r${i}`}
          carRef={(el) => {
            cars.current[i] = el;
          }}
          wpmRef={(el) => {
            wpms.current[i] = el;
          }}
          trailRef={(el) => {
            trails.current[i] = el;
          }}
        />
      ))}
      <div
        className="pointer-events-none absolute inset-y-0 right-[7px] w-[10px] opacity-60"
        style={{
          background: "repeating-conic-gradient(var(--color-cream) 0% 25%, var(--color-ink) 0% 50%) 0 0/10px 10px",
        }}
        aria-hidden
      />
    </div>
  );
});
