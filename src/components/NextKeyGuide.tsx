import { memo } from "react";
import { motion } from "framer-motion";
import { fingerOf, FINGER_LABEL } from "../game/fingers";
import type { KeyFlash } from "./TouchKeyboard";

interface Props {
  /** What the player must produce next. */
  nextKey: string;
  /** The current word, so the guide can show where in it you are. */
  word: string;
  accent: string;
  guide: boolean;
  /** Last keystroke, tagged with its sequence number. */
  flash: KeyFlash | null;
  onSkip: () => void;
  onBack: () => void;
  disabled?: boolean;
}

/**
 * Slim desktop guide bar shown when the on-screen keyboard is hidden — and on desktop that
 * is the default, so it *is* the typing tutor.
 *
 * Two rules this file exists to enforce:
 *  • it shows the key you need **next**, with the last keystroke expressed as a decaying
 *    animation keyed on a sequence number (comparing a `Date.now()` stamp against
 *    `performance.now()` used to leave it stuck on the previous key forever);
 *  • it only names a finger when the key really is on the layout, so a non-QWERTY or
 *    symbol key never gets a confidently wrong instruction.
 */
export const NextKeyGuide = memo(function NextKeyGuide({
  nextKey,
  word,
  accent,
  guide,
  flash,
  onSkip,
  onBack,
  disabled = false,
}: Props) {
  const head = nextKey[0] ?? "";
  const finger = head === "" ? null : fingerOf(head);
  const known = finger !== null && finger !== "unknown";
  const typed = word.slice(0, word.length - nextKey.length);
  const flashColor = flash !== null ? (flash.ok ? "var(--color-mint)" : "var(--color-coral)") : undefined;

  return (
    <div className="mx-auto flex w-full max-w-[760px] items-center gap-3">
      <div className="panel flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2">
        <div className="relative grid h-11 w-11 shrink-0 place-items-center">
          {/* The key you need. `key` on the box is stable so the stroke never jumps. */}
          <div
            className="grid h-11 w-11 place-items-center rounded-lg border-2 font-mono text-xl font-extrabold"
            style={{
              borderColor: accent,
              color: "var(--color-cream)",
              background: `${accent}14`,
              boxShadow: `0 0 22px -6px ${accent}`,
            }}
            aria-hidden
          >
            {head === "" ? "·" : head === " " ? "␣" : head}
          </div>
          {flash !== null && (
            <motion.span
              key={flash.seq}
              initial={{ opacity: 0.9, scale: 1.35 }}
              animate={{ opacity: 0, scale: 1 }}
              transition={{ duration: 0.34, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg border-2 font-mono text-xl font-extrabold"
              style={{ borderColor: flashColor, color: flashColor, background: "transparent" }}
              aria-hidden
            >
              {flash.k === " " ? "␣" : flash.k}
            </motion.span>
          )}
        </div>

        <div className="min-w-0">
          <div className="label-xs text-mute">
            {guide && known
              ? `Use your ${FINGER_LABEL[finger].toLowerCase()}`
              : guide && finger === "unknown"
                ? "Off-layout key — look for it"
                : "Next key"}
          </div>
          <div className="keep-space truncate font-mono text-[11px] text-cream/70">
            {typed.length > 0 ? <span className="text-mint">{typed}</span> : null}
            <span className="text-cream/45">{nextKey}</span>
            <span className="ml-2 text-amber">ASDF JKL;</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onBack}
        disabled={disabled}
        className="btn-3d label-xs rounded-xl border border-coral/50 bg-coral/12 px-3 py-3 font-bold text-coral disabled:cursor-not-allowed disabled:opacity-40"
      >
        ⌫ DELETE
      </button>
      <button
        type="button"
        onClick={onSkip}
        disabled={disabled}
        className="btn-3d label-xs rounded-xl border border-line bg-panel-2 px-3 py-3 font-bold text-mute disabled:cursor-not-allowed disabled:opacity-40"
      >
        SKIP ▸ TAB
      </button>
    </div>
  );
});
