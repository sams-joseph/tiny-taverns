import { useEffect, useRef } from "react";

/**
 * Esc puts away whatever the board is busy with — the attack's pick of a
 * target, the Fog brush, a tool's ruler or pinned area — wherever focus is,
 * except a key meant for the Hob panel (Esc is its own), one typed into a field
 * (which clears its own text), or one something else already claimed (a menu
 * closing claims its own); and claims it, so the Hob panel's window listener
 * does not close on it too.
 */
export function useEscapeAway(active: boolean, away: () => void): void {
  const latest = useRef(away);
  latest.current = away;
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest('section[aria-label="Hob"], input, textarea, [contenteditable="true"]')
      )
        return;
      event.preventDefault();
      latest.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}
