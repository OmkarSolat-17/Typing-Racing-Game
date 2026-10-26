import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
];

type Finger = "pinkyL" | "ringL" | "midL" | "idxL" | "idxR" | "midR" | "ringR" | "pinkyR" | "thumb";

const FINGER_COLOR: Record<Finger, string> = {
  pinkyL: "#ff5a7a",
  ringL: "#ffb020",
  midL: "#35e0a1",
  idxL: "#4cc9ff",
  idxR: "#2f9fd8",
  midR: "#22b37f",
  ringR: "#d1891a",
  pinkyR: "#d13a5c",
  thumb: "#8b96c4",
};

export const FINGER_LABEL: Record<Finger, string> = {
  pinkyL: "Left pinky",
  ringL: "Left ring",
  midL: "Left middle",
  idxL: "Left index",
  idxR: "Right index",
  midR: "Right middle",
  ringR: "Right ring",
  pinkyR: "Right pinky",
  thumb: "Thumb",
};

const FINGER_OF: Record<string, Finger> = {
  "1": "pinkyL", q: "pinkyL", a: "pinkyL", z: "pinkyL",
  "2": "ringL", w: "ringL", s: "ringL", x: "ringL",
  "3": "midL", e: "midL", d: "midL", c: "midL",
  "4": "idxL", r: "idxL", f: "idxL", v: "idxL", "5": "idxL", t: "idxL", g: "idxL", b: "idxL",
  "6": "idxR", y: "idxR", h: "idxR", n: "idxR", "7": "idxR", u: "idxR", j: "idxR", m: "idxR",
  "8": "midR", i: "midR", k: "midR", ",": "midR",
  "9": "ringR", o: "ringR", l: "ringR", ".": "ringR",
  "0": "pinkyR", p: "pinkyR", ";": "pinkyR", "/": "pinkyR", "'": "pinkyR", "-": "pinkyR",
};

export const fingerOf = (ch: string): Finger => FINGER_OF[ch.toLowerCase()] ?? "thumb";

interface Props {
  nextKey?: string;
  word?: string;
  flash?: { k: string; n: number; ok: boolean } | null;
  guide: boolean;
  onPress: (ch: string) => void;
  onBack: () => void;
  onSkip: () => void;
  disabled?: boolean;
  compact?: boolean;
}

const BASE_KEYS = new Set(ROWS.flat());

export const TouchKeyboard = memo(function TouchKeyboard({
  nextKey,
  word,
  flash,
  guide,
  onPress,
  onBack,
  onSkip,
  disabled,
  compact,
}: Props) {
  const [lit, setLit] = useState<{ k: string; ok: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!flash) return;
    setLit({ k: flash.k, ok: flash.ok });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLit(null), 110);
    return () => window.clearTimeout(timer.current);
  }, [flash]);

  const hint = nextKey ? nextKey.toLowerCase() : "";
  const hintFinger = hint ? fingerOf(hint) : null;

  /* SYNTAX mode needs characters the QWERTY grid doesn't carry */
  const extras = useMemo(() => {
    if (!word) return [];
    const out: string[] = [];
    for (const ch of word) {
      const lower = ch.toLowerCase();
      if ((ch !== lower || !BASE_KEYS.has(lower)) && !out.includes(ch)) out.push(ch);
    }
    return out.slice(0, 10);
  }, [word]);

  const keyClass = (k: string) => {
    const isHint = guide && k.toLowerCase() === hint && !disabled;
    const isLit = lit ? lit.k.toLowerCase() === k.toLowerCase() : false;
    const fc = FINGER_COLOR[fingerOf(k)];
    return { isHint, isLit, fc };
  };

  const press = (ch: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    setLit({ k: ch, ok: true });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLit(null), 110);
    onPress(ch);
  };

  return (
    <div className="w-full">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-[5px] sm:gap-1.5">
        {extras.length > 0 && (
          <div className="flex justify-center gap-[4px] sm:gap-1.5">
            {extras.map((k) => {
              const { isHint, isLit, fc } = keyClass(k);
              return (
                <motion.button
                  key={k}
                  onPointerDown={press(k)}
                  whileTap={{ scale: 0.88 }}
                  animate={isLit ? { scale: 1.08, y: -2 } : isHint ? { scale: 1.05, y: -3 } : { scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 700, damping: 26 }}
                  className={`touch-none rounded-[7px] border px-2.5 font-mono font-bold no-touch-callout sm:px-3.5 ${
                    compact ? "h-8 text-[11px]" : "h-9 text-xs"
                  }`}
                  style={{
                    borderColor: isHint ? fc : isLit ? (lit?.ok ? "#35e0a1" : "#ff5a7a") : "#5b4a86",
                    background: isHint
                      ? `${fc}33`
                      : isLit
                        ? lit?.ok
                          ? "rgba(53,224,161,.3)"
                          : "rgba(255,90,122,.32)"
                        : "linear-gradient(180deg,#2b2450,#191533)",
                    color: isHint ? "#fff" : "#f3efe4",
                    boxShadow: isHint
                      ? `0 0 0 2px ${fc}, 0 0 22px -4px ${fc}`
                      : "inset 0 1px 0 rgba(255,255,255,.08), 0 3px 0 rgba(0,0,0,.4)",
                  }}
                >
                  {k}
                </motion.button>
              );
            })}
          </div>
        )}
        {ROWS.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-[4px] sm:gap-1.5" style={{ paddingLeft: ri * 8 }}>
            {row.map((k) => {
              const { isHint, isLit, fc } = keyClass(k);
              const bump = k === "f" || k === "j";
              return (
                <motion.button
                  key={k}
                  onPointerDown={press(k)}
                  whileTap={{ scale: 0.88 }}
                  animate={
                    isLit
                      ? { scale: 1.08, y: -2 }
                      : isHint
                        ? { scale: 1.04, y: -3 }
                        : { scale: 1, y: 0 }
                  }
                  transition={{ type: "spring", stiffness: 700, damping: 26 }}
                  className={`relative flex-1 touch-none rounded-[7px] border font-mono font-bold no-touch-callout ${
                    compact ? "h-8 text-[10px] sm:h-10 sm:text-xs" : "h-10 text-xs sm:h-12 sm:text-sm"
                  }`}
                  style={{
                    maxWidth: 62,
                    borderColor: isHint ? fc : isLit ? (lit?.ok ? "#35e0a1" : "#ff5a7a") : "#2c3866",
                    background: isHint
                      ? `${fc}33`
                      : isLit
                        ? lit?.ok
                          ? "rgba(53,224,161,.3)"
                          : "rgba(255,90,122,.32)"
                        : "linear-gradient(180deg,#1b2444,#111731)",
                    color: isHint ? "#fff" : "#f3efe4",
                    boxShadow: isHint
                      ? `0 0 0 2px ${fc}, 0 0 22px -4px ${fc}, inset 0 1px 0 rgba(255,255,255,.14)`
                      : isLit
                        ? `0 0 18px -4px ${lit?.ok ? "#35e0a1" : "#ff5a7a"}`
                        : "inset 0 1px 0 rgba(255,255,255,.07), 0 3px 0 rgba(0,0,0,.4)",
                  }}
                >
                  {k}
                  {bump && <span className="absolute bottom-1 left-1/2 h-[2px] w-3 -translate-x-1/2 rounded bg-cream/40" />}
                  {guide && (
                    <span
                      className="pointer-events-none absolute inset-x-1 bottom-[3px] h-[2px] rounded-full opacity-70"
                      style={{ background: fc }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        ))}

        {/* action row */}
        <div className="flex justify-center gap-[4px] sm:gap-1.5">
          <motion.button
            onPointerDown={(e) => {
              e.preventDefault();
              if (!disabled) onSkip();
            }}
            whileTap={{ scale: 0.94 }}
            className="label-xs h-10 flex-[2] touch-none rounded-[7px] border border-line bg-panel-2/80 px-2 font-bold text-mute no-touch-callout sm:h-12"
            style={{ maxWidth: 150 }}
          >
            SKIP ▸ TAB
          </motion.button>
          <motion.button
            onPointerDown={(e) => {
              e.preventDefault();
              if (!disabled) onBack();
            }}
            whileTap={{ scale: 0.94 }}
            className="label-xs h-10 flex-[3] touch-none rounded-[7px] border border-coral/50 bg-coral/15 px-2 font-bold text-coral no-touch-callout sm:h-12"
            style={{ maxWidth: 220 }}
          >
            ⌫ DELETE
          </motion.button>
          <div
            className="label-xs hidden h-12 flex-[2] items-center justify-center rounded-[7px] border border-line bg-panel/60 px-3 font-bold sm:flex"
            style={{ maxWidth: 190, color: hintFinger ? FINGER_COLOR[hintFinger] : "#8b96c4" }}
          >
            {hintFinger && !disabled ? `${FINGER_LABEL[hintFinger]} → ${hint.toUpperCase()}` : "READY"}
          </div>
        </div>
      </div>
    </div>
  );
});
