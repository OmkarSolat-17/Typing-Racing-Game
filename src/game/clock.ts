/**
 * Two clocks exist in this app and mixing them is a bug (it was a bug — see the audit):
 *
 *  • `now()`   monotonic, page-relative. Timers, flashes, elapsed, animation.
 *  • `stamp()` wall-clock, epoch. Only for record timestamps and "did I race at night".
 *
 * Never subtract one from the other.
 */

export const now = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

export const stamp = (): number => Date.now();

/** Collision-resistant id for a stored record. */
export const uid = (at: number = stamp()): string =>
  `${at.toString(36)}-${Math.floor(Math.random() * 1679616).toString(36)}`;

/** "Night owl" window: midnight–04:59 local. */
export const isNightHour = (epochMs: number): boolean => {
  const h = new Date(epochMs).getHours();
  return Number.isFinite(h) && h >= 0 && h < 5;
};

/** Clamped delta between two `now()` reads — never negative, never a runaway frame. */
export const frameDelta = (current: number, previous: number, maxMs = 50): number =>
  Math.min(maxMs, Math.max(0, current - previous));
