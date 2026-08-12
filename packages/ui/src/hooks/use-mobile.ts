import * as React from "react";

/**
 * Whether the viewport is below a breakpoint — shadcn's `use-mobile`, with one
 * change and one addition, both of which the Hob panel needed.
 *
 * **The breakpoint is a parameter.** Upstream hard-codes 768 in a module
 * constant, which is right for a page-level sidebar and wrong for every other
 * question. The chat panel turns over at the delivery's own 1020 (`AppShell.jsx`,
 * `CHAT_INLINE_MIN`), so the number belongs to the caller and the constant stays
 * as the default so an unparameterised call still means what upstream means.
 *
 * **It measures before the first paint.** Upstream starts `undefined` and fills
 * it in from an effect, which is the SSR-safe shape: the server cannot measure,
 * so the first client render has to agree with it. This package sets
 * `"rsc": false` and nothing here is server-rendered, so that first render is a
 * paint — and starting it at "not mobile" is a visible frame of the wide layout
 * on a narrow window. `matchMedia` is guarded because jsdom ships one that
 * matches nothing, and Node has none at all.
 *
 * It is a media query rather than a `resize` listener on `innerWidth`: the
 * browser evaluates it, so there is one event when the answer changes instead of
 * one per frame of a drag.
 */

/** shadcn's own default, kept so a bare `useIsMobile()` means what upstream means. */
export const MOBILE_BREAKPOINT = 768;

const queryFor = (breakpoint: number) => `(max-width: ${String(breakpoint - 1)}px)`;

const measure = (breakpoint: number): boolean =>
  typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia(queryFor(breakpoint)).matches;

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = React.useState(() => measure(breakpoint));

  React.useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return;
    const query = globalThis.matchMedia(queryFor(breakpoint));
    const onChange = () => setIsMobile(query.matches);
    // The viewport may have moved between the first render and this effect.
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
}
