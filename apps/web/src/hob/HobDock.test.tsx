import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HobDock, HobRegion } from "./HobDock";
import { HOB_INLINE_MIN, useHobPanel } from "./useHobPanel";

/**
 * Where the panel sits, and what wins when it covers the content.
 *
 * **jsdom computes no stacking and no layout**, which is the same blind spot
 * `packages/ui/src/layering.test.ts` and `motion.test.ts` exist for — so these
 * tests assert the *names* the dock reaches for, and the real ordering those
 * names resolve to is asserted by `layering.test.ts` against the compiled CSS.
 * Between them the property is covered end to end: the dock never writes a
 * number, and the numbers behind the names are strictly ordered. The one thing
 * neither can see is a browser, so the threshold was also driven in Chromium —
 * see the notes in AGENTS.md.
 *
 * There is one property here jsdom *can* see, and it is the one a container swap
 * is most likely to lose: an overlaid panel is portalled, and a portal goes to
 * `<body>` unless it is told otherwise. "Inside the region" is a DOM fact, so it
 * is checked as one — the difference between dimming the prep UI and dimming the
 * whole app is invisible to every class-name assertion.
 *
 * jsdom's `matchMedia` matches nothing, so `inline` is passed here rather than
 * measured. That is why it is a prop.
 */

const region = () => document.querySelector("[data-slot=sidebar-wrapper]")?.parentElement ?? null;
const scrim = () => document.querySelector("[data-slot=sheet-overlay]");
/** The sheet's popup — which the sidebar re-slots as itself, so it is named by
 *  the flag only the overlaid form carries. */
const overlaidPanel = () => document.querySelector("[data-mobile=true]");
const inlinePanel = () => document.querySelector("[data-slot=sidebar-container]");
const gap = () => document.querySelector("[data-slot=sidebar-gap]");

const dock = (props: { open: boolean; inline: boolean; onClose?: () => void }) =>
  render(
    <HobRegion>
      <div>the content</div>
      <HobDock turns={[]} {...props} />
    </HobRegion>,
  );

describe("HobDock", () => {
  it("keeps the column but takes it off-canvas — and out of the tab order — when closed", () => {
    dock({ open: false, inline: true });

    // The sidebar slides out rather than unmounting, which is what gives the
    // close a transition instead of a disappearance. Everything in it is still
    // in the document, so `inert` is what stops a keyboard reaching a panel
    // nobody can see.
    expect(document.querySelector("[data-slot=sidebar]")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
    expect(inlinePanel()).toHaveAttribute("inert");
    expect(scrim()).toBeNull();
  });

  it("renders nothing at all while it is closed below the threshold", () => {
    dock({ open: false, inline: false });

    expect(screen.queryByLabelText("Hob")).toBeNull();
    expect(scrim()).toBeNull();
  });

  it("is a plain column beside the content above the threshold — no scrim", () => {
    dock({ open: true, inline: true });

    // The panel is the delivery's 400px and the gap beside the content reserves
    // exactly that much, which is what makes the content column narrower rather
    // than covered. Both read the same custom property.
    expect(inlinePanel()).toHaveClass("w-chat-panel");
    expect(gap()).toHaveClass("w-(--sidebar-width)");
    expect(document.querySelector("[data-slot=sidebar-wrapper]")).toHaveStyle({
      "--sidebar-width": "var(--spacing-chat-panel)",
    });
    expect(scrim()).toBeNull();
    expect(inlinePanel()).not.toHaveAttribute("inert");
  });

  it("covers the content below it, with the panel strictly above its own scrim", () => {
    dock({ open: true, inline: false });

    // Two different rungs, never one. Equal layers leave document order to
    // decide, which is how a select once opened underneath a dialog.
    expect(scrim()).toHaveClass("z-scrim");
    expect(overlaidPanel()).toHaveClass("z-dialog");
    expect(overlaidPanel()).toHaveClass("w-chat-panel");
  });

  it("covers the content and not the app — the overlay lives inside the region", () => {
    dock({ open: true, inline: false });

    // The property the shell depends on, and the one a portal quietly loses: the
    // scrim and the panel are `absolute` inside `HobRegion`, so the top nav above
    // the region stays lit and clickable. Portalled to `<body>` they would be
    // `fixed` over the whole window and nothing in a class name would say so.
    expect(region()).not.toBeNull();
    expect(region()?.contains(scrim() as Node)).toBe(true);
    expect(region()?.contains(overlaidPanel() as Node)).toBe(true);
    expect(scrim()).toHaveClass("absolute");
    expect(scrim()).not.toHaveClass("fixed");
    expect(overlaidPanel()).toHaveClass("absolute");
    expect(overlaidPanel()).not.toHaveClass("fixed");
  });

  it("dismisses on the scrim, which is the ordinary way out of an overlay", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    dock({ open: true, inline: false, onClose });

    await user.click(scrim() as Element);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("dismisses on Escape, which the sheet answers as well as the shortcut does", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    dock({ open: true, inline: false, onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });
});

describe("useHobPanel", () => {
  it("opens by default, because a DM who opened the app to prep will talk to Hob", () => {
    const { result } = renderHook(() => useHobPanel());

    expect(result.current.open).toBe(true);
  });

  it("toggles on ⌘K and on Ctrl-K, and closes on Escape", () => {
    const { result } = renderHook(() => useHobPanel({ initialOpen: false }));

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    });
    expect(result.current.open).toBe(true);

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.open).toBe(false);

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "K", ctrlKey: true }));
    });
    expect(result.current.open).toBe(true);
  });

  it("leaves an Escape another overlay already claimed alone", () => {
    const { result } = renderHook(() => useHobPanel());

    act(() => {
      const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      event.preventDefault();
      globalThis.dispatchEvent(event);
    });

    // A dialog or a select popup consumes its own Escape; the panel behind it
    // must not close as well.
    expect(result.current.open).toBe(true);
  });

  it("measures the threshold the delivery names", () => {
    const matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMedia);

    const { result } = renderHook(() => useHobPanel());

    // `useIsMobile` is the one media query in the product, so the panel's own
    // threshold is expressed against it: not-mobile is inline.
    expect(result.current.inline).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(`(max-width: ${String(HOB_INLINE_MIN - 1)}px)`);
    expect(HOB_INLINE_MIN).toBe(1020);

    vi.unstubAllGlobals();
  });
});
