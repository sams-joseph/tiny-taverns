import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rehearsal, RehearsalTurn } from "./rehearsal";
import { RehearsalPanel } from "./RehearsalPanel";

/**
 * The chat is a document the window scrolls, not a scroll box: jsdom computes
 * no layout, so what it can pin is the shape (no scroller, a sticky composer)
 * and when the panel asks the window to bring its end into view.
 */

const rehearsal = (over: Partial<Rehearsal> = {}): Rehearsal => ({
  turns: [],
  thinking: false,
  send: () => undefined,
  unavailable: undefined,
  notice: undefined,
  proposals: [],
  status: undefined,
  lastPrompt: undefined,
  reset: undefined,
  ...over,
});

const line = (id: string, who: RehearsalTurn["who"] = "npc"): RehearsalTurn => ({
  id,
  who,
  text: `line ${id}`,
});

const scrolled = vi.fn();

beforeEach(() => {
  scrolled.mockClear();
  // jsdom has no `scrollIntoView`; the panel skips it when it is missing.
  Element.prototype.scrollIntoView = scrolled;
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

describe("the rehearsal chat", () => {
  it("lets the transcript take its height, with the composer sticky at the bottom", () => {
    render(
      <RehearsalPanel image={null} name="Mara" rehearsal={rehearsal({ turns: [line("1")] })} />,
    );

    const panel = screen.getByRole("region", { name: "Rehearse with Mara" });
    for (const element of [panel, ...panel.querySelectorAll("*")]) {
      expect(element.getAttribute("class") ?? "").not.toMatch(
        /(^|\s)(overflow(-y)?-(auto|scroll|hidden)|max-h-\S+|h-full|min-h-0)(\s|$)/,
      );
    }
    const composer = screen.getByRole("textbox").closest(".sticky");
    expect(composer).toHaveClass("bottom-0");
    expect(panel).toContainElement(composer as HTMLElement);
  });

  it("brings the newest line into view on open only when the panel is the page", () => {
    const { unmount } = render(
      <RehearsalPanel image={null} name="Mara" rehearsal={rehearsal({ turns: [line("1")] })} />,
    );
    expect(scrolled).not.toHaveBeenCalled();
    unmount();

    render(
      <RehearsalPanel
        image={null}
        jumpOnOpen
        name="Mara"
        rehearsal={rehearsal({ turns: [line("1")] })}
      />,
    );
    expect(scrolled).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("follows the reader's own line, and leaves a reader who scrolled away", () => {
    const { rerender } = render(
      <RehearsalPanel image={null} name="Mara" rehearsal={rehearsal({ turns: [line("1")] })} />,
    );
    // Someone else spoke; nothing says this reader is at the end.
    rerender(
      <RehearsalPanel
        image={null}
        name="Mara"
        rehearsal={rehearsal({ turns: [line("1"), line("2")] })}
      />,
    );
    expect(scrolled).not.toHaveBeenCalled();

    // This reader sent: the reply is coming, so the end comes into view.
    rerender(
      <RehearsalPanel
        image={null}
        name="Mara"
        rehearsal={rehearsal({ turns: [line("1"), line("2"), line("3", "user")], thinking: true })}
      />,
    );
    expect(scrolled).toHaveBeenCalledTimes(1);
  });
});
