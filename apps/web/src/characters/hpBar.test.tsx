import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HpBar } from "./SheetParts";

/**
 * The bar's output, pinned at every step edge.
 *
 * The steps moved into `sheet.ts`'s `hpBand` so the Party header's *low* and
 * *down* words read the same rule; this is what proves the move changed no
 * pixel on the sheet, *My characters* or the Overview's party card.
 */
describe("the hit-point bar", () => {
  const fillOf = (fraction: number) => {
    const { container, unmount } = render(<HpBar fraction={fraction} />);
    const fill = container.querySelector<HTMLElement>("[data-slot=hp-fill]");
    const drawn = { className: fill?.className, width: fill?.style.width };
    unmount();
    return drawn;
  };

  it.each([
    [0, "h-full bg-crimson-400", "0%"],
    [0.01, "h-full bg-danger", "1%"],
    [0.34, "h-full bg-danger", "34%"],
    [0.35, "h-full bg-accent", "35%"],
    [0.67, "h-full bg-accent", "67%"],
    [0.68, "h-full bg-success", "68%"],
    [1, "h-full bg-success", "100%"],
  ])("at %s draws %s at %s", (fraction, className, width) => {
    expect(fillOf(fraction)).toEqual({ className, width });
  });
});
