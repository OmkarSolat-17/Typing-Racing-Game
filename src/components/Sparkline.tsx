import { memo, useId, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface Props {
  /** Values to plot, oldest → newest. Fewer than two points renders a flat baseline. */
  series: readonly number[];
  color: string;
  width?: number;
  height?: number;
  /** Vertical reserve so the stroke never touches the frame. */
  padY?: number;
  /** Lower bound of the y-axis, so a slow race still shows a legible curve. */
  floor?: number;
  area?: boolean;
  gridlines?: boolean;
  /** Stroke-draw-in animation. Silenced for the live HUD graph and reduced-motion users. */
  animate?: boolean;
  /** Optional per-point markers (the career chart colours each race by its mode). */
  pointColors?: readonly (string | undefined)[];
  className?: string;
  label?: string;
}

/**
 * The app's only line chart.
 *
 * The HUD's live graph, the results speed curve and the career history used to be three
 * hand-copied variants of the same normalisation maths with three sets of padding
 * constants — which is how "peak WPM" and the graph disagreed. One implementation, one
 * gradient id per instance (`useId`, so two charts on a page cannot collide).
 */
export const Sparkline = memo(function Sparkline({
  series,
  color,
  width = 560,
  height = 90,
  padY = 8,
  floor = 30,
  area = true,
  gridlines = true,
  animate = true,
  pointColors,
  className,
  label,
}: Props) {
  const gradientId = useId();
  const reduceMotion = useReducedMotion();
  const draw = animate && reduceMotion !== true;

  const shape = useMemo(() => {
    if (series.length < 2) return null;
    const max = Math.max(floor, ...series);
    const step = width / (series.length - 1);
    const usable = Math.max(1, height - padY * 2);
    const pts = series.map((v, i) => [i * step, height - padY - (Math.max(0, v) / max) * usable] as const);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    return { pts, line, areaPath: `${line} L${width},${height} L0,${height} Z`, peak: max };
  }, [series, width, height, padY, floor]);

  if (shape === null) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        style={{ width: "100%", height }}
        role="img"
        aria-label={label ?? "graph waiting for data"}
      >
        <line
          x1="0"
          y1={height - padY}
          x2={width}
          y2={height - padY}
          stroke={color}
          strokeOpacity="0.35"
          strokeWidth="2"
          strokeDasharray="4 8"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ width: "100%", height }}
      preserveAspectRatio="none"
      role="img"
      aria-label={label ?? `${series.length} samples, peak ${Math.round(shape.peak)}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.42" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridlines &&
        [0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={width}
            y1={height * g}
            y2={height * g}
            stroke="var(--color-line)"
            strokeWidth="1"
            strokeDasharray="3 7"
          />
        ))}

      {area && <path d={shape.areaPath} fill={`url(#${gradientId})`} />}

      {draw ? (
        <motion.path
          d={shape.line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      ) : (
        <path
          d={shape.line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {pointColors &&
        shape.pts.map((p, i) => {
          const dot = pointColors[i];
          if (dot === undefined) return null;
          return <circle key={i} cx={p[0]} cy={p[1]} r="3.4" fill={dot} />;
        })}
    </svg>
  );
});
