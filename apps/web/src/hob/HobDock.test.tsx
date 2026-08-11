import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HobDock } from "./HobDock";
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
 * jsdom's `matchMedia` matches nothing, so `inline` is passed here rather than
 * measured. That is why it is a prop.
 */

describe("HobDock", () => {
  it("renders nothing at all while it is closed", () => {
    const { container } = render(<HobDock open={false} inline turns={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("is a plain column beside the content above the threshold — no scrim", () => {
    render(<HobDock open inline turns={[]} />);

    const panel = screen.getByLabelText("Hob").parentElement;
    expect(panel).toHaveClass("w-100");
    expect(panel?.className).not.toMatch(/absolute|z-/);
    expect(document.querySelector(".bg-scrim")).toBeNull();
  });

  it("covers the content below it, with the panel strictly above its own scrim", () => {
    render(<HobDock open inline={false} turns={[]} />);

    const scrim = document.querySelector(".bg-scrim");
    const panel = screen.getByLabelText("Hob").parentElement;

    // Two different rungs, never one. Equal layers leave document order to
    // decide, which is how a select once opened underneath a dialog.
    expect(scrim).toHaveClass("z-scrim");
    expect(panel).toHaveClass("z-dialog");
    expect(panel).toHaveClass("w-100");
  });

  it("dismisses on the scrim, which is the ordinary way out of an overlay", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<HobDock open inline={false} turns={[]} onClose={onClose} />);

    await user.click(document.querySelector(".bg-scrim") as Element);

    expect(onClose).toHaveBeenCalledOnce();
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
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMedia);

    const { result } = renderHook(() => useHobPanel());

    expect(result.current.inline).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(`(min-width: ${String(HOB_INLINE_MIN)}px)`);
    expect(HOB_INLINE_MIN).toBe(1020);

    vi.unstubAllGlobals();
  });
});
