import { memo, useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";

interface Props {
  words: string[];
  idx: number;
  typed: string;
  accent: string;
  perfect: boolean[];
  focusRef?: React.Ref<HTMLDivElement>;
}

/**
 * Two-tier track:
 *  1. a giant focus word (per-character live feedback)
 *  2. the full race text — last words + upcoming words visible in a light tone
 */
export const WordTrack = memo(function WordTrack({ words, idx, typed, accent, perfect, focusRef }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    const el = wordRefs.current.get(idx);
    if (!box || !inner || !el) return;
    const target = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    inner.style.transform = `translate3d(0, ${-Math.max(0, target)}px, 0)`;
  }, [idx]);

  const current = words[idx] ?? "";

  return (
    <div className="w-full">
      {/* ---- giant focus word ---- */}
      <div
        ref={focusRef}
        className="relative flex min-h-[clamp(58px,11vw,132px)] items-center justify-center overflow-hidden px-2"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }}
        />
        {current.length > 0 && (
          <motion.div
            key={`${idx}-${current}`}
            initial={{ y: 22, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            className="font-mono text-[clamp(2rem,9vw,4.6rem)] font-extrabold leading-none tracking-tight"
          >
            {current.split("").map((ch, i) => {
              const done = i < typed.length;
              const active = i === typed.length;
              return (
                <span
                  key={i}
                  data-caret={active ? "1" : undefined}
                  className="relative inline-block transition-[color,background-color,transform] duration-75"
                  style={{
                    color: done ? "#0a0d1c" : active ? "#0a0d1c" : "#f3efe4",
                    backgroundColor: done ? "#35e0a1" : active ? accent : "transparent",
                    borderRadius: done || active ? 6 : 0,
                    padding: done || active ? "0 2px" : 0,
                    transform: active ? "translateY(-2px)" : undefined,
                    boxShadow: active ? `0 6px 22px -6px ${accent}` : undefined,
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* ---- context lane: last + upcoming words in a light tone ---- */}
      <div
        ref={boxRef}
        className="panel relative mx-auto mt-2 h-[74px] w-full max-w-3xl overflow-hidden rounded-xl px-3 py-2 sm:mt-3 sm:h-[108px] sm:px-4 sm:py-3"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-[#131a33] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-[#131a33] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-8 -translate-y-1/2 border-y border-cream/10" />
        <div
          ref={innerRef}
          className="flex flex-wrap gap-x-3 gap-y-2 font-mono text-[13px] leading-6 sm:text-[15px] sm:leading-7"
          style={{ transition: "transform 260ms cubic-bezier(.22,.9,.25,1)" }}
        >
          {words.map((w, i) => {
            const state = i < idx ? (perfect[i] ? "done" : "flaw") : i === idx ? "now" : "next";
            return (
              <span
                key={i}
                ref={(el) => {
                  if (el) wordRefs.current.set(i, el);
                  else wordRefs.current.delete(i);
                }}
                className={
                  state === "now"
                    ? "rounded-md px-1 font-bold text-cream ring-1"
                    : "px-1 transition-colors duration-300"
                }
                style={
                  state === "now"
                    ? ({ ["--tw-ring-color" as string]: `${accent}88`, backgroundColor: `${accent}1f` } as React.CSSProperties)
                    : state === "done"
                      ? { color: perfect[i] ? "rgba(53,224,161,.55)" : "rgba(255,90,122,.6)" }
                      : state === "flaw"
                        ? { color: "rgba(255,90,122,.6)" }
                        : { color: "rgba(243,239,228,.28)" }
                }
              >
                {state === "now" && typed.length > 0 && (
                  <span className="text-mint">{w.slice(0, typed.length)}</span>
                )}
                {state === "now" ? w.slice(typed.length) : w}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
});
