import { useIsMobile } from "@taverns/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * Whether the panel is open, and whether there is room for it inline.
 *
 * ### The threshold
 *
 * **1020px**, from `AppShell.jsx`'s `CHAT_INLINE_MIN`, and it moved there in the
 * second delivery for a reason worth keeping: the 260px rail became a 56px top
 * bar, which handed that width back to the content, so the old 1180 was 160
 * too many. Above it the panel is a column beside the content; below it there
 * is not room for content plus 400px, so it becomes an overlay rather than
 * squeezing the prep UI into a column nobody can use.
 *
 * The measurement itself is `@taverns/ui`'s `useIsMobile`, which is shadcn's own
 * hook with the breakpoint made a parameter — one media query in the product
 * rather than two spellings of the same question, and the same one
 * `SidebarProvider` would use if it were not told. Inline is simply *not*
 * mobile. It is a media query rather than a `resize` listener on `innerWidth`:
 * the browser evaluates it, so there is one event when the answer changes
 * instead of one per frame of a drag. `matchMedia` is guarded inside that hook
 * because jsdom ships one that never matches anything — a test that cares which
 * side it is on passes `inline` to `HobDock` directly.
 *
 * ### The keys
 *
 * ⌘K / Ctrl-K toggles and Esc closes, both from the kit's README. Esc only acts
 * while the panel is open and only on an event nothing else has claimed, so a
 * dialog or a select popup still gets its own Escape — those call
 * `preventDefault` on the key they consume, and this listener is on `window`,
 * which sees the bubbled event after they have.
 */

export const HOB_INLINE_MIN = 1020;

export interface HobPanelState {
  readonly open: boolean;
  /** True when the viewport is wide enough for the panel to sit beside the content. */
  readonly inline: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
  readonly show: () => void;
}

export function useHobPanel({
  /** The kit's README: "Open by default, because a DM who opened the app to prep
   * is going to talk to Hob." The shell decides — while nothing answers, a
   * shell may reasonably start it closed. */
  initialOpen = true,
}: { readonly initialOpen?: boolean } = {}): HobPanelState {
  const [open, setOpen] = useState(initialOpen);
  const inline = !useIsMobile(HOB_INLINE_MIN);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.key === "Escape") setOpen(false);
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);

  const toggle = useCallback(() => setOpen((current) => !current), []);
  const close = useCallback(() => setOpen(false), []);
  const show = useCallback(() => setOpen(true), []);

  return { open, inline, toggle, close, show };
}
