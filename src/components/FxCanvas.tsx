import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { useReducedMotion } from "framer-motion";

type Kind = "spark" | "shard" | "ring" | "streak" | "text";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  /** Total lifetime in ms, not frames — the loop is frame-rate independent. */
  max: number;
  size: number;
  color: string;
  kind: Kind;
  rot: number;
  spin: number;
  grav: number;
  text?: string;
}

export interface FxHandle {
  burst: (x: number, y: number, color: string, count?: number, power?: number) => void;
  ring: (x: number, y: number, color: string, size?: number) => void;
  confetti: (x: number, y: number, colors: readonly string[], count?: number) => void;
  streaks: (color: string, count?: number) => void;
  popup: (x: number, y: number, text: string, color: string, size?: number) => void;
  flash: (color: string, alpha?: number) => void;
  clear: () => void;
}

/** Hard ceiling on live particles. Above it the oldest are dropped, never the newest. */
const MAX_PARTICLES = 420;
/** Above this lifetime remaining, a flash is invisible but still costing a fill. */
const FLASH_EPSILON = 0.002;

interface Flash {
  color: string;
  a: number;
}

/**
 * One canvas for every particle effect, with a single frame loop that **parks itself**
 * when there is nothing left to draw. An always-on `requestAnimationFrame` loop used to
 * sit in every screen for the whole session, redrawing an empty canvas 60 times a second.
 *
 * `prefers-reduced-motion` scales the effect counts down instead of ignoring the setting:
 * the feedback still reads, it just stops shaking the room.
 */
export const FxCanvas = forwardRef<FxHandle>(function FxCanvas(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const partsRef = useRef<Particle[]>([]);
  const flashRef = useRef<Flash>({ color: "#ffffff", a: 0 });
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const scaleRef = useRef(1);
  scaleRef.current = reduceMotion === true ? 0.35 : 1;

  const stop = useCallback(() => {
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const start = useCallback(() => {
    if (rafRef.current !== 0) return;
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    function tick(nowTs: number) {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (canvas === null || ctx === null) {
        rafRef.current = 0;
        return;
      }
      const dt = Math.min(48, Math.max(0, nowTs - lastRef.current));
      lastRef.current = nowTs;
      const f = dt / 16.667;
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const flash = flashRef.current;
      if (flash.a > FLASH_EPSILON) {
        ctx.globalAlpha = flash.a;
        ctx.fillStyle = flash.color;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        flash.a *= Math.pow(0.86, f);
      } else if (flash.a !== 0) {
        flash.a = 0;
      }

      const arr = partsRef.current;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        if (p === undefined) {
          arr.splice(i, 1);
          continue;
        }
        p.life += dt;
        if (p.life >= p.max) {
          arr.splice(i, 1);
          continue;
        }
        const t = p.life / p.max;
        p.x += p.vx * f;
        p.y += p.vy * f;
        p.vy += p.grav * f;
        p.vx *= Math.pow(0.985, f);
        p.rot += p.spin * f;
        draw(ctx, p, t);
      }
      ctx.globalAlpha = 1;

      const busy = arr.length > 0 || flash.a > FLASH_EPSILON;
      rafRef.current = busy ? requestAnimationFrame(tick) : 0;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (ctx === null) return;
    ctxRef.current = ctx;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });
    return () => {
      window.removeEventListener("resize", resize);
      ctxRef.current = null;
      stop();
    };
  }, [stop]);

  const push = useCallback(
    (p: Particle) => {
      const arr = partsRef.current;
      arr.push(p);
      if (arr.length > MAX_PARTICLES) arr.splice(0, arr.length - MAX_PARTICLES);
      start();
    },
    [start],
  );

  const scaled = useCallback((count: number) => Math.max(1, Math.round(count * scaleRef.current)), []);

  useImperativeHandle(
    ref,
    () => ({
      burst(x, y, color, count = 14, power = 1) {
        for (let i = 0; i < scaled(count); i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = (1.5 + Math.random() * 5.5) * power;
          push({
            x,
            y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 1.4,
            life: 0,
            max: 320 + Math.random() * 420,
            size: 2 + Math.random() * 3.4,
            color,
            kind: "spark",
            rot: 0,
            spin: 0,
            grav: 0.13,
          });
        }
      },
      ring(x, y, color, size = 10) {
        push({ x, y, vx: 0, vy: 0, life: 0, max: 420, size, color, kind: "ring", rot: 0, spin: 0, grav: 0 });
      },
      confetti(x, y, colors, count = 60) {
        if (colors.length === 0) return;
        for (let i = 0; i < scaled(count); i++) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
          const sp = 5 + Math.random() * 11;
          const color = colors[Math.floor(Math.random() * colors.length)] ?? colors[0];
          if (color === undefined) return;
          push({
            x: x + (Math.random() - 0.5) * 260,
            y: y + (Math.random() - 0.5) * 40,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 0,
            max: 1400 + Math.random() * 900,
            size: 4 + Math.random() * 6,
            color,
            kind: "shard",
            rot: Math.random() * 6.28,
            spin: (Math.random() - 0.5) * 0.4,
            grav: 0.22,
          });
        }
      },
      streaks(color, count = 10) {
        const h = window.innerHeight;
        const w = window.innerWidth;
        for (let i = 0; i < scaled(count); i++) {
          const dir = Math.random() > 0.5 ? 1 : -1;
          push({
            x: dir > 0 ? -120 : w + 120,
            y: Math.random() * h,
            vx: dir * (14 + Math.random() * 16),
            vy: 0,
            life: 0,
            max: 900,
            size: 40 + Math.random() * 120,
            color,
            kind: "streak",
            rot: 0,
            spin: 0,
            grav: 0,
          });
        }
      },
      popup(x, y, text, color, size = 26) {
        push({
          x,
          y,
          vx: (Math.random() - 0.5) * 1.2,
          vy: -2.1,
          life: 0,
          max: 900,
          size,
          color,
          kind: "text",
          rot: 0,
          spin: 0,
          grav: 0.035,
          text,
        });
      },
      flash(color, alpha = 0.35) {
        flashRef.current = { color, a: scaleRef.current === 1 ? alpha : alpha * 0.4 };
        start();
      },
      clear() {
        partsRef.current = [];
        flashRef.current = { color: flashRef.current.color, a: 0 };
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (canvas !== null && ctx !== null) ctx.clearRect(0, 0, canvas.width, canvas.height);
        stop();
      },
    }),
    [push, scaled, start, stop],
  );

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-50" />;
});

function draw(ctx: CanvasRenderingContext2D, p: Particle, t: number): void {
  switch (p.kind) {
    case "spark": {
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.2, p.size * (1 - t * 0.6)), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      return;
    }
    case "shard": {
      ctx.globalAlpha = 1 - t * t;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
      return;
    }
    case "ring": {
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3 * (1 - t) + 0.6;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + t * 130, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      return;
    }
    case "streak": {
      ctx.globalAlpha = (1 - t) * 0.5;
      const grad = ctx.createLinearGradient(p.x - p.size, p.y, p.x + p.size, p.y);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, p.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - p.size, p.y);
      ctx.lineTo(p.x + p.size, p.y);
      ctx.stroke();
      return;
    }
    case "text": {
      if (p.text === undefined) return;
      ctx.globalAlpha = 1 - t * t;
      ctx.font = `800 ${p.size}px "Bungee", "Arial Black", sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(6,9,20,0.85)";
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      return;
    }
  }
}
