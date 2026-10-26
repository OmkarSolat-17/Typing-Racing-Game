import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Keeps Tab inside an open modal and restores focus to whatever had it beforehand.
 *
 * The pause dialog used to sit behind the game: keyboard focus walked straight out of the
 * modal into the HUD buttons underneath it.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (container === null) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFirst = () => {
      const target =
        container.querySelector<HTMLElement>("[data-autofocus]") ?? container.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    };
    // Defer one frame so an entry animation cannot swallow the focus call.
    const raf = requestAnimationFrame(focusFirst);

    /**
     * "Focusable right now" is asked of the markup, never of the layout: `offsetParent` is
     * null for a `position: fixed` element, which would leave this trap with zero nodes in
     * exactly the dialogs that need it. `tabIndex` is not consulted either — jsdom reports -1
     * for a plain `<button>`, while browsers report 0, and the selector already restricts the
     * set to interactive elements.
     */
    const enabled = (el: HTMLElement) =>
      !el.hasAttribute("disabled") && !el.hidden && el.getAttribute("aria-hidden") !== "true";

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Tab") return;
      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(enabled);
      if (nodes.length === 0) return;
      const first = nodes[0] as HTMLElement;
      const last = nodes[nodes.length - 1] as HTMLElement;
      const activeEl = document.activeElement;
      if (ev.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && activeEl === last) {
        ev.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
