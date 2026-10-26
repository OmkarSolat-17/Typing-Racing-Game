/**
 * Touch-typing layout data — the single source of truth for the finger guide.
 *
 * `Results`, `Stats` and `TouchKeyboard` all colour-code by finger; they must not each
 * carry their own copy of the table (a fork here once produced `undefined66` colour strings).
 *
 * Mapping assumes a US/ANSI keyboard. Non-QWERTY users get a *visually distinct*
 * `unknown` lane rather than a confidently wrong instruction.
 */
import type { Finger } from "./types";

export const FINGER_LABEL: Record<Finger, string> = {
  pinkyL: "Left pinky",
  ringL: "Left ring",
  midL: "Left middle",
  idxL: "Left index",
  idxR: "Right index",
  midR: "Right middle",
  ringR: "Right ring",
  pinkyR: "Right pinky",
  thumb: "Thumb (space)",
  unknown: "Off-layout key",
};

export const FINGER_COLOR: Record<Finger, string> = {
  pinkyL: "#ff5a7a",
  ringL: "#ffb020",
  midL: "#35e0a1",
  idxL: "#4cc9ff",
  idxR: "#2f9fd8",
  midR: "#22b37f",
  ringR: "#d1891a",
  pinkyR: "#d13a5c",
  thumb: "#8b96c4",
  unknown: "#6b77a5",
};

/** Keys carrying a position bump, so a guide can say "feel for the ridge". */
export const HOME_ROW = ["f", "j"] as const;

const L = "pinkyL";
const RL = "ringL";
const ML = "midL";
const IL = "idxL";
const IR = "idxR";
const MR = "midR";
const RR = "ringR";
const R = "pinkyR";
const T = "thumb";

const FINGER_OF: Record<string, Finger> = {
  "1": L,
  "2": RL,
  "3": ML,
  "4": IL,
  "5": IL,
  "6": IR,
  "7": IR,
  "8": MR,
  "9": RR,
  "0": R,
  "!": L,
  "@": RL,
  "#": ML,
  $: IL,
  "%": IL,
  "^": IR,
  "&": IR,
  "*": MR,
  "(": RR,
  ")": R,
  q: L,
  a: L,
  z: L,
  w: RL,
  s: RL,
  x: RL,
  e: ML,
  d: ML,
  c: ML,
  r: IL,
  f: IL,
  v: IL,
  t: IL,
  g: IL,
  b: IL,
  y: IR,
  h: IR,
  n: IR,
  u: IR,
  j: IR,
  m: IR,
  i: MR,
  k: MR,
  ",": MR,
  o: RR,
  l: RR,
  ".": RR,
  p: R,
  ";": R,
  "/": R,
  "'": R,
  "[": R,
  "]": R,
  "\\": R,
  "-": R,
  "=": R,
  _: R,
  "+": R,
  ":": R,
  '"': R,
  "<": MR,
  ">": RR,
  "?": R,
  "{": R,
  "}": R,
  "|": R,
  "~": L,
  "`": L,
  "\t": R,
  " ": T,
};

/** Case-insensitive: `"S"` and `"s"` are the same finger on a US layout. */
export const fingerOf = (ch: string): Finger => {
  if (!ch) return "unknown";
  if (ch === " ") return T;
  return FINGER_OF[ch.toLowerCase()] ?? "unknown";
};

export const isOnLayout = (ch: string): boolean => fingerOf(ch) !== "unknown";

/** Fingers in reading order, for legends and charts (thumb first: it owns the loudest key). */
export const FINGER_ORDER: Finger[] = ["pinkyL", "ringL", "midL", "idxL", "idxR", "midR", "ringR", "pinkyR", "thumb"];

/**
 * Rows as they are physically laid out, so the legend and the mapping can never disagree:
 * the key list is *derived* from the same table `fingerOf` consults, not typed again.
 */
const LEGEND_ROWS = ["1234567890", "qwertyuiop", "asdfghjkl;", "zxcvbnm,./", " "];

export const FINGER_KEYS: Record<Finger, string[]> = (() => {
  const out = {} as Record<Finger, string[]>;
  for (const f of FINGER_ORDER) out[f] = [];
  for (const row of LEGEND_ROWS) {
    for (const ch of row) {
      const f = FINGER_OF[ch];
      if (f !== undefined && f !== "unknown") out[f].push(ch);
    }
  }
  return out;
})();

/** Fingers with at least one mapped key, in reading order — used by the career screen. */
export const FINGERS: Exclude<Finger, "thumb" | "unknown">[] = [
  "pinkyL",
  "ringL",
  "midL",
  "idxL",
  "idxR",
  "midR",
  "ringR",
  "pinkyR",
];
