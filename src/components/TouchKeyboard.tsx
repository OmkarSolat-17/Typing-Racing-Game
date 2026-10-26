import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { HANDOFF } from "../game/config";
import { FINGER_COLOR, fingerOf, FINGER_LABEL } from "../game/fingers";

const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
];

const BASE_KEYS = new Set(ROWS.flat());
const MAX_EXTRAS = 12;

/**
 * The key the player just produced, and a sequence counter used as an animation key.
 *
 * Timing is expressed as "which keystroke was this", never as a wall-clock window: the
 * first version compared a `Date.now()` stamp against `performance.now()`, so the flash
 * condition was permanently true and the guide froze on the last key typed.
 */
export interface KeyFlash {
  k: string;
  ok: boolean;
  seq: number;
}

interface Props {
  /** The exact text the player must produce next (may be >1 char for an astral grapheme). */
  nextKey?: string;
  word?: string;
  flash?: KeyFlash | null;
  guide: boolean;
  onPress: (ch: string) => void;
  onBack: () => void;
  onSkip: () => void;
  disabled?: boolean;
  compact?: boolean;
}

interface KeycapProps {
  label: string;
  /** What this key actually submits — differs from `label` when case must match the word. */
  sends: string;
  hint: boolean;
  lit: { k: string; ok: boolean } | null;
  guide: boolean;
  compact: boolean;
  flex: "letter" | "wide";
  bump?: boolean;
  disabled?: boolean;
  onActivate: (sends: string) => void;
  children?: React.ReactNode;
}

/**
 * One key.
 *
 * `onPointerDown` gives the arcade-grade latency a touch keyboard needs, but a pointer-only
 * handler is inert for a keyboard or switch-access user — so `onClick` covers activation
 * (and the browser fires exactly one of the two paths for a real tap because we do not
 * preventDefault on click).
 */
const Keycap = memo(function Keycap({
  label,
  sends,
  hint,
  lit,
  guide,
  compact,
  flex,
  bump,
  disabled,
  onActivate,
  children,
}: KeycapProps) {
  const reduce = useReducedMotion();
  const litColor = lit !== null ? (lit.ok ? "var(--color-mint)" : "var(--color-coral)") : undefined;
  const finger = fingerOf(sends);
  const fc = FINGER_COLOR[finger];
  const isLit = lit !== null && lit.k.toLowerCase() === sends.toLowerCase();

  return (
    <motion.button
      type="button"
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        e.preventDefault();
        if (disabled === true) return;
        onActivate(sends);
      }}
      onClick={(e) => {
        // Pointer devices already fired on pointerdown; this covers keyboard/AT activation.
        if (e.detail > 0) return;
        if (disabled === true) return;
        onActivate(sends);
      }}
      whileTap={reduce === true ? {} : { scale: 0.9 }}
      animate={isLit ? { scale: 1.08, y: -2 } : hint ? { scale: 1.04, y: -3 } : { scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 700, damping: 26 }}
      aria-disabled={disabled === true}
      aria-label={`Key ${label}`}
      className={`relative touch-none rounded-[7px] border font-mono font-bold no-touch-callout ${
        compact ? "h-8 text-[10px] sm:h-10 sm:text-xs" : "h-10 text-xs sm:h-12 sm:text-sm"
      } ${flex === "letter" ? "flex-1" : ""}`}
      style={{
        maxWidth: flex === "letter" ? 62 : undefined,
        borderColor: hint ? fc : isLit ? litColor : "var(--color-line)",
        background: hint
          ? `${fc}33`
          : isLit
            ? lit?.ok
              ? "rgba(53,224,161,.3)"
              : "rgba(255,90,122,.32)"
            : "linear-gradient(180deg,var(--color-panel-2),var(--color-ink-2))",
        color: hint ? "#ffffff" : "var(--color-cream)",
        boxShadow: hint
          ? `0 0 0 2px ${fc}, 0 0 22px -4px ${fc}, inset 0 1px 0 rgba(255,255,255,.14)`
          : isLit
            ? `0 0 18px -4px ${litColor}`
            : "inset 0 1px 0 rgba(255,255,255,.07), 0 3px 0 rgba(0,0,0,.4)",
      }}
    >
      {children ?? label}
      {bump === true && (
        <span className="absolute bottom-1 left-1/2 h-[2px] w-3 -translate-x-1/2 rounded bg-cream/40" />
      )}
      {guide && (
        <span
          className="pointer-events-none absolute inset-x-1 bottom-[3px] h-[2px] rounded-full opacity-70"
          style={{ background: fc }}
        />
      )}
    </motion.button>
  );
});

interface ActionProps {
  label: string;
  onActivate: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  flex: number;
  maxWidth: number;
}

const ActionKey = memo(function ActionKey({
  label,
  onActivate,
  disabled,
  tone = "default",
  flex,
  maxWidth,
}: ActionProps) {
  return (
    <motion.button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        if (disabled !== true) onActivate();
      }}
      onClick={(e) => {
        if (e.detail > 0) return;
        if (disabled !== true) onActivate();
      }}
      whileTap={{ scale: 0.94 }}
      aria-label={label.replace(/\s*▸\s*TAB/, "").replace(/\s*⌫\s*/, "")}
      className={`label-xs h-10 touch-none rounded-[7px] border px-2 font-bold no-touch-callout sm:h-12 ${
        tone === "danger" ? "border-coral/50 bg-coral/15 text-coral" : "border-line bg-panel-2/80 text-mute"
      }`}
      style={{ flex, maxWidth }}
    >
      {label}
    </motion.button>
  );
});

/**
 * On-screen keyboard for touch play and the finger guide for everyone else.
 *
 * Characters the QWERTY grid cannot produce (SYNTAX mode's braces, quotes, operators) are
 * surfaced on a dynamic extras row derived from the *current* word, so no word is ever
 * untypeable on a phone.
 */
export const TouchKeyboard = memo(function TouchKeyboard({
  nextKey = "",
  word = "",
  flash,
  guide,
  onPress,
  onBack,
  onSkip,
  disabled = false,
  compact = false,
}: Props) {
  const [lit, setLit] = useState<{ k: string; ok: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const lightFor = useCallback((k: string, ok: boolean) => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    setLit({ k, ok });
    timer.current = window.setTimeout(() => setLit(null), HANDOFF.touchFlashMs);
  }, []);

  useEffect(() => {
    if (flash === null || flash === undefined) return;
    lightFor(flash.k, flash.ok);
  }, [flash, lightFor]);

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  const activate = useCallback(
    (sends: string) => {
      lightFor(sends, true);
      onPress(sends);
    },
    [lightFor, onPress],
  );

  /** Tapping a key must produce what the word needs, not what the legend says (`p` → `P`). */
  const sendFor = useCallback(
    (k: string): string => {
      const want = nextKey[0] ?? "";
      if (want !== "" && want.toLowerCase() === k) return nextKey.slice(0, Math.max(1, want.length));
      return k;
    },
    [nextKey],
  );

  const hintKey = nextKey[0]?.toLowerCase() ?? "";
  const hintFinger = hintKey === "" ? null : fingerOf(hintKey);

  const extras = useMemo(() => {
    if (word === "") return [];
    const out: string[] = [];
    for (const ch of Array.from(word)) {
      const lower = ch.toLowerCase();
      if ((!BASE_KEYS.has(lower) || ch !== lower) && !out.includes(ch)) out.push(ch);
      if (out.length >= MAX_EXTRAS) break;
    }
    return out;
  }, [word]);

  return (
    <div className="w-full">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-[5px] sm:gap-1.5">
        {extras.length > 0 && (
          <div
            className="flex flex-wrap justify-center gap-[4px] sm:gap-1.5"
            aria-label="Characters needed by this word"
          >
            {extras.map((k) => (
              <Keycap
                key={k}
                label={k === " " ? "␣" : k}
                sends={k}
                hint={guide && k === nextKey}
                lit={lit}
                guide={guide}
                compact={compact}
                flex="wide"
                disabled={disabled}
                onActivate={activate}
              />
            ))}
          </div>
        )}

        {ROWS.map((row, ri) => (
          <div key={row.join("")} className="flex justify-center gap-[4px] sm:gap-1.5" style={{ paddingLeft: ri * 8 }}>
            {row.map((k) => (
              <Keycap
                key={k}
                label={k}
                sends={sendFor(k)}
                hint={guide && !disabled && k === hintKey}
                lit={lit}
                guide={guide}
                compact={compact}
                flex="letter"
                bump={k === "f" || k === "j"}
                disabled={disabled}
                onActivate={activate}
              />
            ))}
          </div>
        ))}

        <div className="flex justify-center gap-[4px] sm:gap-1.5">
          <ActionKey label="SKIP ▸ TAB" onActivate={onSkip} disabled={disabled} flex={2} maxWidth={150} />
          <ActionKey label="⌫ DELETE" onActivate={onBack} disabled={disabled} tone="danger" flex={3} maxWidth={220} />
          <div
            className="label-xs hidden h-12 flex-[2] items-center justify-center rounded-[7px] border border-line bg-panel/60 px-3 font-bold sm:flex"
            style={{ maxWidth: 190, color: hintFinger === null ? "var(--color-mute)" : FINGER_COLOR[hintFinger] }}
          >
            {hintFinger !== null && !disabled
              ? `${FINGER_LABEL[hintFinger]} → ${(nextKey[0] ?? "").toUpperCase()}`
              : "READY"}
          </div>
        </div>
      </div>
    </div>
  );
});
