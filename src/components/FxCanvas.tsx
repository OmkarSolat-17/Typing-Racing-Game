import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "spark" | "shard" | "ring" | "streak" | "text";
  rot: number;
  spin: number;
  grav: number;
  text?: string;
};

export interface FxHandle {
  burst: (x: number, y: number, color: string, count?: number, power?: number) => void;
  ring: (x: number, y: number, color: string, size?: number) => void;
  confetti: (x: number, y: number, colors: string[], count?: number) => void;
  streaks: (color: string, count?: number) => void;
  popup: (x: number, y: number, text: string, color: string, size?: number) => void;
  flash: (color: string, alpha?: number) => void;
  clear: () => void;
}

export const FxCanvas = forwardRef<FxHandle>(function FxCanvas(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const parts = useRef<P[]>([]);
  const flashRef = useRef<{ color: string; a: number }>({ color: "#fff", a: 0 });

  useImperativeHandle(ref, () => ({
    burst(x, y, color, count = 14, power = 1) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (1.5 + Math.random() * 5.5) * power;
        parts.current.push({
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
      parts.current.push({
        x,
        y,
        vx: 0,
        vy: 0,
        life: 0,
        max: 420,
        size,
        color,
        kind: "ring",
        rot: 0,
        spin: 0,
        grav: 0,
      });
    },
    confetti(x, y, colors, count = 60) {
      for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const sp = 5 + Math.random() * 11;
        parts.current.push({
          x: x + (Math.random() - 0.5) * 260,
          y: y + (Math.random() - 0.5) * 40,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0,
          max: 1400 + Math.random() * 900,
          size: 4 + Math.random() * 6,
          color: colors[(Math.random() * colors.length) | 0],
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
      for (let i = 0; i < count; i++) {
        const y = Math.random() * h;
        const dir = Math.random() > 0.5 ? 1 : -1;
        parts.current.push({
          x: dir > 0 ? -120 : w + 120,
          y,
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
      parts.current.push({
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
      flashRef.current = { color, a: alpha };
    },
    clear() {
      parts.current = [];
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(48, now - last);
      last = now;
      const f = dt / 16.667;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // screen flash
      if (flashRef.current.a > 0.002) {
        ctx.globalAlpha = flashRef.current.a;
        ctx.fillStyle = flashRef.current.color;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        flashRef.current.a *= Math.pow(0.86, f);
      }

      const arr = parts.current;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
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

        if (p.kind === "spark") {
          ctx.globalAlpha = 1 - t;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, 6.283);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (p.kind === "shard") {
          ctx.globalAlpha = 1 - t * t;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        } else if (p.kind === "ring") {
          ctx.globalAlpha = (1 - t) * 0.8;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * (1 - t) + 0.6;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size + t * 130, 0, 6.283);
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else if (p.kind === "streak") {
          ctx.globalAlpha = (1 - t) * 0.5;
          const grad = ctx.createLinearGradient(p.x - p.size, p.y, p.x + p.size, p.y);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(0.5, p.color);
          grad.addColorStop(1, "transparent");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x - p.size, p.y);
          ctx.lineTo(p.x + p.size, p.y);
          ctx.stroke();
        } else if (p.kind === "text" && p.text) {
          ctx.globalAlpha = 1 - t * t;
          ctx.font = `800 ${p.size}px "Bungee", "Arial Black", sans-serif`;
          ctx.textAlign = "center";
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(6,9,20,0.85)";
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, p.x, p.y);
        }
      }
      ctx.globalAlpha = 1;
      if (arr.length > 900) arr.splice(0, arr.length - 900);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" />;
});
