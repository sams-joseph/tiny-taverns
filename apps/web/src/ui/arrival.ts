import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/** How long the page may keep growing above the section before it stays where the reader left it. */
const SETTLE_MS = 3000;

/** What the reader does that says they are moving the page themselves. */
const READER_MOVES = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Scroll to the element `id` names once, when the page was opened at `#id`.
 *
 * The router scrolls to a link's hash as it navigates (`router.ts`), but a
 * section drawn only once its reads have answered is not there yet, so the
 * page lands at the top. Call this where the section is drawn, or once its
 * page has what it needs: it scrolls on that render, and only for the hash
 * the page was opened with, since a hash the reader scrolled away from is not
 * a place to send them back to.
 *
 * What is drawn above the section may still grow once it is there (a level's
 * still is painted after its card), which would push it back down the page.
 * So until the reader moves the page themselves, or for `SETTLE_MS`, it is
 * scrolled to again whenever the page's height changes.
 */
export function useArrivalScroll(id: string): void {
  const hash = useLocation({ select: (location) => location.hash });
  const [arrivedAt] = useState(() => hash);
  useEffect(() => {
    const target = arrivedAt === id ? document.getElementById(id) : null;
    // jsdom lays nothing out and has no `scrollIntoView` at all.
    if (target === null || typeof target.scrollIntoView !== "function") return;
    target.scrollIntoView();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => target.scrollIntoView());
    observer.observe(document.body);
    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      for (const kind of READER_MOVES) window.removeEventListener(kind, stop, true);
    };
    const timer = window.setTimeout(stop, SETTLE_MS);
    for (const kind of READER_MOVES) window.addEventListener(kind, stop, true);
    return stop;
  }, [arrivedAt, id]);
}
