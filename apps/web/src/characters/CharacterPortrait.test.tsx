import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl } from "../api/client";
import { CharacterPortrait } from "./CharacterPortrait";
import {
  DRAWING_POLL_LIMIT_MS,
  DRAWING_POLL_MS,
  useHobDrawingPolling,
} from "../hob/drawingPolling";

/**
 * The plate: initials always, the portrait over them when there is one, and the
 * initials again whenever the picture cannot be shown. jsdom loads no image,
 * so `load` and `error` are fired by hand; what a browser draws is not
 * measurable here and is not asserted.
 */

afterEach(() => cleanup());

const portrait = {
  thumbUrl: "/portraits/p1/thumb?e=1&s=t",
  cardUrl: "/portraits/p1/card?e=1&s=c",
  fullUrl: "/portraits/p1/full?e=1&s=f",
};

describe("CharacterPortrait", () => {
  it("draws the initials and no image when there is no portrait", () => {
    const { container } = render(<CharacterPortrait name="Marta Vell" portrait={null} />);
    expect(container.textContent).toBe("MV");
    expect(container.querySelector("img")).toBeNull();
  });

  it("lays the thumb over the initials, lazily, decoratively, against the API base", () => {
    const { container } = render(
      <CharacterPortrait name="Marta Vell" portrait={portrait} size="lg" />,
    );
    const img = container.querySelector("img")!;
    expect(container.textContent).toBe("MV");
    expect(img.getAttribute("src")).toBe(apiUrl(portrait.thumbUrl));
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("loading")).toBe("lazy");
    // Sized by CSS, not attributes: preflight's `height: auto` beats those.
    expect(img.hasAttribute("width")).toBe(false);
    expect(img.hasAttribute("height")).toBe(false);
    expect(img.className).toContain("size-full");
  });

  it("uses the card size for the card", () => {
    const { container } = render(
      <CharacterPortrait name="Marta Vell" portrait={portrait} size="card" />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(apiUrl(portrait.cardUrl));
  });

  it("stays transparent until it loads, then shows", () => {
    const { container } = render(<CharacterPortrait name="Marta Vell" portrait={portrait} />);
    const img = container.querySelector("img")!;
    expect(img.className).toContain("opacity-0");
    expect(img.className).not.toContain("opacity-100");
    fireEvent.load(img);
    expect(container.querySelector("img")!.className).toContain("opacity-100");
    expect(container.querySelector("img")!.hasAttribute("data-loaded")).toBe(true);
  });

  it("falls back to the initials, with no error chrome, when the image fails", () => {
    const { container, rerender } = render(
      <CharacterPortrait name="Marta Vell" portrait={portrait} />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("MV");

    // A freshly signed URL gets a fresh chance.
    rerender(
      <CharacterPortrait
        name="Marta Vell"
        portrait={{ ...portrait, thumbUrl: "/portraits/p1/thumb?e=2&s=u" }}
      />,
    );
    expect(container.querySelector("img")).not.toBeNull();
  });
});

describe("CharacterPortrait on a list row", () => {
  it("draws the row's own icon, not the initials, when there is no portrait", () => {
    const { container } = render(
      <CharacterPortrait
        name="Marta Vell"
        portrait={null}
        size="row"
        fallback={<svg data-testid="shield" />}
      />,
    );
    expect(container.querySelector("[data-testid=shield]")).not.toBeNull();
    expect(container.textContent).toBe("");
    expect(container.querySelector("img")).toBeNull();
  });

  it("lays the thumb over the initials when there is one, and keeps the icon out", () => {
    const { container } = render(
      <CharacterPortrait
        name="Marta Vell"
        portrait={portrait}
        size="row"
        fallback={<svg data-testid="shield" />}
      />,
    );
    expect(container.querySelector("[data-testid=shield]")).toBeNull();
    expect(container.textContent).toBe("MV");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(apiUrl(portrait.thumbUrl));
    expect((container.firstElementChild as HTMLElement).className).toContain("size-7");
  });
});

describe("useHobDrawingPolling", () => {
  afterEach(() => vi.useRealTimers());

  it("re-reads every two seconds while pending, and stops when it is not", () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const { rerender } = renderHook(({ pending }) => useHobDrawingPolling(pending, reload), {
      initialProps: { pending: true },
    });
    vi.advanceTimersByTime(DRAWING_POLL_MS * 3);
    expect(reload).toHaveBeenCalledTimes(3);
    rerender({ pending: false });
    vi.advanceTimersByTime(DRAWING_POLL_MS * 3);
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it("gives up after three minutes", () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    renderHook(() => useHobDrawingPolling(true, reload));
    vi.advanceTimersByTime(DRAWING_POLL_LIMIT_MS + DRAWING_POLL_MS * 5);
    const calls = reload.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(DRAWING_POLL_LIMIT_MS / DRAWING_POLL_MS);
    vi.advanceTimersByTime(DRAWING_POLL_MS * 10);
    expect(reload).toHaveBeenCalledTimes(calls);
  });

  it("does nothing when nothing is being drawn", () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    renderHook(() => useHobDrawingPolling(false, reload));
    vi.advanceTimersByTime(DRAWING_POLL_MS * 5);
    expect(reload).not.toHaveBeenCalled();
  });
});
