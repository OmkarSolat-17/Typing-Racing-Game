import { memo, useLayoutEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface Props {
  words: readonly string[];
  idx: number;
  typed: string;
  accent: string;
  /** Per-word flawless flag, indexed by absolute word index. */
  perfect: readonly boolean[];
  focusRef?: React.Ref<HTMLDivElement>;
  /** How many words to keep mounted before/after the caret. A timed track can be 125 words long. */
  window?: number;
  /** Total words in the race, which may exceed `words.length` when the track is being extended. */
  totalWords?: number;
}

/**
 * Two-tier track: a giant focus word with per-character feedback, plus a light context
 * lane showing where you are in the race.
 *
 * The lane renders a **window** around the caret, not the whole track: this component
 * re-renders on every keystroke, so its cost is now O(1) in track length instead of
 * O(words) — which is what let TIME ATTACK carry a 125-word track without a 10 Hz
 * full-lane diff.
 */
export const WordTrack = memo(function WordTrack({
  words,
  idx,
  typed,
  accent,
  perfect,
  focusRef,
  window: half = 7,
  totalWords,
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<number, HTMLSpanElement>());
  const reduceMotion = useReducedMotion();

  const start = Math.max(0, idx - half);
  const end = Math.min(words.length, idx + half + 1);
  const slice = words.slice(start, end);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    const el = nodeRefs.current.get(idx);
    if (box === null || inner === null || el === null || el === undefined) return;
    const target = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    inner.style.transform = `translate3d(0, ${-Math.max(0, target)}px, 0)`;
  }, [idx]);

  const current = words[idx] ?? "";

  return (
    <div className="w-full">
      {/* ---- giant focus word ---- */}
      <div
        ref={focusRef}
        className="keep-space relative flex min-h-[clamp(58px,11vw,132px)] items-center justify-center overflow-hidden px-2"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }}
        />
        {current.length > 0 && (
          <motion.div
            key={idx}
            initial={reduceMotion === true ? false : { y: 22, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            className="font-mono text-[clamp(1.6rem,7.5vw,4.6rem)] font-extrabold leading-none tracking-tight"
          >
            {cells(current).map((cell) => {
              const ch = cell.text;
              const done = typed.length >= cell.end;
              const active = !done && typed.length >= cell.start;
              return (
                <span
                  key={cell.start}
                  data-caret={active ? "1" : undefined}
                  className="relative inline-block min-w-[0.28em] transition-[color,background-color,transform] duration-75"
                  style={{
                    color: done || active ? "var(--color-ink)" : "var(--color-cream)",
                    backgroundColor: done ? "var(--color-mint)" : active ? accent : "transparent",
                    borderRadius: done || active ? 6 : 0,
                    padding: done || active ? "0 2px" : 0,
                    transform: active ? "translateY(-2px)" : undefined,
                    boxShadow: active ? `0 6px 22px -6px ${accent}` : undefined,
                  }}
                >
                  {ch === " " ? "\u00a0" : ch}
                </span>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* ---- context lane: recent + upcoming words ---- */}
      <div
        ref={boxRef}
        className="panel relative mx-auto mt-2 h-[74px] w-full max-w-3xl overflow-hidden rounded-xl px-3 py-2 sm:mt-3 sm:h-[108px] sm:px-4 sm:py-3"
        aria-hidden
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-(--color-panel-fade) to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-(--color-panel-fade) to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-8 -translate-y-1/2 border-y border-cream/10" />
        <div
          ref={innerRef}
          className="keep-space flex flex-wrap gap-x-3 gap-y-2 font-mono text-[13px] leading-6 sm:text-[15px] sm:leading-7"
          style={{ transition: reduceMotion === true ? "none" : "transform 260ms cubic-bezier(.22,.9,.25,1)" }}
        >
          {slice.map((w, offset) => {
            const i = start + offset;
            const state = i < idx ? (perfect[i] === true ? "done" : "flaw") : i === idx ? "now" : "next";
            return (
              <span
                key={i}
                data-word={i}
                data-perfect={i < idx ? (perfect[i] === true ? "1" : "0") : undefined}
                ref={(el) => {
                  if (el === null) nodeRefs.current.delete(i);
                  else nodeRefs.current.set(i, el);
                }}
                className={
                  state === "now"
                    ? "rounded-md px-1 font-bold text-cream ring-1"
                    : "px-1 transition-colors duration-300"
                }
                style={
                  state === "now"
                    ? { ["--tw-ring-color" as string]: `${accent}88`, backgroundColor: `${accent}1f` }
                    : state === "done"
                      ? { color: "rgba(53,224,161,.55)" }
                      : state === "flaw"
                        ? { color: "rgba(255,90,122,.6)" }
                        : { color: "rgba(243,239,228,.28)" }
                }
              >
                {state === "now" && typed.length > 0 && <span className="text-mint">{w.slice(0, typed.length)}</span>}
                {state === "now" ? w.slice(typed.length) : w}
              </span>
            );
          })}
        </div>
      </div>

      {totalWords !== undefined && totalWords > words.length && (
        <div className="mt-1 text-center label-xs text-mute">
          {totalWords - words.length} more words queued for the clock
        </div>
      )}
    </div>
  );
});

/**
 * Split a word into display cells with their code-unit span.
 *
 * The rules layer indexes `typed` in UTF-16 code units (that is what `KeyboardEvent.key`
 * delivers), while `.split("")` here would turn a surrogate pair into two unmatchable
 * halves. Iterating code points and carrying each cell's span keeps the caret maths and
 * the visuals in agreement for any character a pool might ever contain.
 */
export interface Cell {
  text: string;
  start: number;
  end: number;
}

export function cells(word: string): Cell[] {
  const out: Cell[] = [];
  let at = 0;
  for (const text of Array.from(word)) {
    out.push({ text, start: at, end: at + text.length });
    at += text.length;
  }
  return out;
}
