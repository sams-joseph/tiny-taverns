import { useEffect } from "react";

/** How often a screen re-reads while Hob is drawing a picture. */
export const DRAWING_POLL_MS = 2_000;
/** When it gives up: longer than the server's job timeout, so the last read is the final state. */
export const DRAWING_POLL_LIMIT_MS = 3 * 60_000;

/**
 * Re-read while Hob is drawing — the screen's own `reload`, every two seconds,
 * until nothing on it is pending (a character's `portraitPending`, a campaign's
 * `imagePending`) or three minutes pass. One hook for every kind of picture, so
 * every screen that waits on one waits the same way.
 *
 * Polling the ordinary read rather than a stream of its own: the row already
 * holds the state, and a second read path onto it is the thing the doorbell's
 * contentlessness exists to avoid (`web-data.md`).
 */
export function useHobDrawingPolling(pending: boolean, reload: () => void) {
  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started >= DRAWING_POLL_LIMIT_MS) {
        clearInterval(timer);
        return;
      }
      reload();
    }, DRAWING_POLL_MS);
    return () => clearInterval(timer);
  }, [pending, reload]);
}
