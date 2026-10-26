import { memo, useEffect, useRef } from "react";
import type { RivalState } from "../game/types";

function Car({ color }: { color: string }) {
  const id = `b-${color.replace("#", "")}`;
  return (
    <svg viewBox="0 0 64 28" width="64" height="28" aria-hidden className="block">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="45%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <rect x="1" y="5" width="4" height="12" rx="1.5" fill={color} opacity="0.85" />
      <path
        d="M6 19 L9 12 Q11 8 17 7 L30 6 Q38 6 44 10 L56 13 Q62 15 62 18 L62 20 Q62 21 60 21 L8 21 Q6 21 6 19 Z"
        fill={`url(#${id})`}
      />
      <path d="M24 7.5 Q30 6.6 36 8.6 L38 11 L23 11 Z" fill="#0a0d1c" opacity="0.7" />
      <rect x="12" y="14.5" width="44" height="1.8" fill="#0a0d1c" opacity="0.32" />
      <circle cx="17" cy="21" r="5.4" fill="#0a0d1c" />
      <circle cx="17" cy="21" r="2.2" fill={color} />
      <circle cx="49" cy="21" r="5.4" fill="#0a0d1c" />
      <circle cx="49" cy="21" r="2.2" fill={color} />
      <circle cx="60" cy="17" r="1.6" fill="#fff8dc" />
    </svg>
  );
}

interface LaneProps {
  label: string;
  color: string;
  you?: boolean;
  carRef: (el: HTMLDivElement | null) => void;
  wpmRef: (el: HTMLSpanElement | null) => void;
  trailRef: (el: HTMLDivElement | null) => void;
}

const Lane = ({ label, color, you, carRef, wpmRef, trailRef }: LaneProps) => (
  <div className={`relative h-[38px] overflow-hidden border-b border-line/50 sm:h-[52px] ${you ? "bg-cream/[0.055]" : "bg-ink-2/40"}`}>
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
      <Car color={color} />
    </div>
    <span
      className="label-xs pointer-events-none absolute top-1.5 left-2 rounded px-1.5 py-1 font-bold"
      style={{ color: you ? "#0a0d1c" : color, background: you ? color : "rgba(10,13,28,.72)" }}
    >
      {label}
    </span>
    <span ref={wpmRef} className="label-xs pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-cream/40" />
  </div>
);

interface Props {
  stateRef: React.RefObject<{ rivals: RivalState[]; dist: number; totalChars: number; elapsed: number; place: number }>;
  accent: string;
  rivalNames: string[];
}

/** Rival lanes. Car transforms are written straight to the DOM inside rAF — no React re-renders. */
export const RivalTrack = memo(function RivalTrack({ stateRef, accent, rivalNames }: Props) {
  const youCar = useRef<HTMLDivElement>(null);
  const youWpm = useRef<HTMLSpanElement>(null);
  const youTrail = useRef<HTMLDivElement>(null);
  const rivalCars = useRef<(HTMLDivElement | null)[]>([]);
  const rivalWpms = useRef<(HTMLSpanElement | null)[]>([]);
  const rivalTrails = useRef<(HTMLDivElement | null)[]>([]);
  const wrapEl = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const lastText = useRef(0);

  useEffect(() => {
    const loop = () => {
      raf.current = requestAnimationFrame(loop);
      const s = stateRef.current;
      if (!s || !s.totalChars) return;
      const laneW = wrapEl.current?.clientWidth ?? window.innerWidth - 32;
      const carW = 64;
      const now = performance.now();

      const apply = (el: HTMLDivElement | null, dist: number, trail: HTMLDivElement | null, speed: number) => {
        if (!el) return;
        const p = Math.min(1.015, dist / s.totalChars);
        const x = p * Math.max(0, laneW - 56 - 20 - carW);
        el.style.transform = `translate3d(${x}px,-50%,0)`;
        if (trail) {
          trail.style.opacity = String(Math.min(0.8, Math.max(0.05, speed / 95)));
          trail.style.width = `${36 + Math.min(96, speed)}px`;
          trail.style.transform = `translate3d(${x - 92}px,-50%,0)`;
        }
      };

      const pSpeed = s.elapsed > 500 ? s.dist / 5 / (s.elapsed / 60000) : 0;
      apply(youCar.current, s.dist, youTrail.current, pSpeed);
      s.rivals.forEach((r, i) => apply(rivalCars.current[i], r.dist, rivalTrails.current[i], r.wpm));

      if (now - lastText.current > 100) {
        lastText.current = now;
        if (youWpm.current) youWpm.current.textContent = `${Math.round(pSpeed)} wpm`;
        s.rivals.forEach((r, i) => {
          const el = rivalWpms.current[i];
          if (el) el.textContent = r.finished ? "finished" : `${Math.round(r.wpm)} wpm`;
        });

      }
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [stateRef]);

  return (
    <div ref={wrapEl} className="panel relative mx-auto w-full max-w-[1100px] overflow-hidden rounded-xl">
      <Lane
        label="YOU"
        color={accent}
        you
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
      {rivalNames.map((name, i) => (
        <Lane
          key={name}
          label={name}
          color={stateRef.current?.rivals[i]?.color ?? "#a78bfa"}
          carRef={(el) => {
            rivalCars.current[i] = el;
          }}
          wpmRef={(el) => {
            rivalWpms.current[i] = el;
          }}
          trailRef={(el) => {
            rivalTrails.current[i] = el;
          }}
        />
      ))}
      <div
        className="pointer-events-none absolute inset-y-0 right-[7px] w-[10px] opacity-60"
        style={{ background: "repeating-conic-gradient(#f3efe4 0% 25%, #0a0d1c 0% 50%) 0 0/10px 10px" }}
      />

    </div>
  );
});
