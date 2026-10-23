import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Scroll to the element `id` names once, when the page was opened at `#id`.
 *
 * The router scrolls to a link's hash as it navigates (`router.ts`), but a
 * section drawn only once its reads have answered is not there yet, so the
 * page lands at the top. Call this where the section is drawn, or once its
 * page has what it needs: it scrolls on that render, and only for the hash
 * the page was opened with, since a hash the reader scrolled away from is not
 * a place to send them back to.
 */
export function useArrivalScroll(id: string): void {
  const hash = useLocation({ select: (location) => location.hash });
  const [arrivedAt] = useState(() => hash);
  useEffect(() => {
    const target = arrivedAt === id ? document.getElementById(id) : null;
    // jsdom lays nothing out and has no `scrollIntoView` at all.
    if (target !== null && typeof target.scrollIntoView === "function") target.scrollIntoView();
  }, [arrivedAt, id]);
}
