import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { apiUrl } from "../api/client";
import { drawnCover, drawnMapPicture } from "../campaign/campaign.fixtures";
import { HobCover } from "./HobCover";

/**
 * A cover — a campaign's, a Shared World's or a battle map's: nothing when there is none, a
 * quiet band while Hob draws it, and the picture once it is drawn. jsdom loads
 * no image, so `load` and `error` are fired by hand; what a browser draws is not
 * measurable here and is not asserted. The screens that show one are tested
 * beside them (`campaign/covers.test.tsx`, `shared-world/SharedWorldsScreen.test.tsx`).
 */

afterEach(() => cleanup());

describe("HobCover", () => {
  it("draws nothing at all when there is no cover and none coming", () => {
    const { container } = render(<HobCover image={null} pending={false} shape="card" />);
    expect(container.innerHTML).toBe("");
  });

  it("holds a band that says Hob is drawing while it is pending", () => {
    render(<HobCover image={null} pending shape="hero" />);
    expect(screen.getByRole("status")).toHaveTextContent("Hob is drawing…");
    expect(document.querySelector("img")).toBeNull();
  });

  it("loads the card size on a card and the full size on a hero, decoratively", () => {
    const { container, rerender } = render(
      <HobCover image={drawnCover} pending={false} shape="card" />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(apiUrl(drawnCover.cardUrl));
    expect(img.getAttribute("srcset")).toBe(
      `${apiUrl(drawnCover.cardUrl)} 768w, ${apiUrl(drawnCover.fullUrl)} 1536w`,
    );
    expect(img.getAttribute("sizes")).toBe("auto, 100vw");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.className).toContain("object-cover");
    expect(img.className).toContain("opacity-0");
    fireEvent.load(img);
    expect(container.querySelector("img")!.className).toContain("opacity-100");

    rerender(<HobCover image={drawnCover} pending={false} shape="hero" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(apiUrl(drawnCover.fullUrl));
  });

  it("collapses to the current look when the image fails, and tries a fresh URL", () => {
    const { container, rerender } = render(
      <HobCover image={drawnCover} pending={false} shape="card" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.innerHTML).toBe("");

    rerender(
      <HobCover
        image={{ ...drawnCover, cardUrl: "/campaign-images/x/card?e=2&s=u" }}
        pending={false}
        shape="card"
      />,
    );
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("draws a battle map full size, and takes what is laid over it away with it", () => {
    const link = <a href="/encounter">Battle map</a>;
    const { container, rerender } = render(
      <HobCover image={drawnMapPicture} pending={false} shape="strip">
        {link}
      </HobCover>,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(apiUrl(drawnMapPicture.fullUrl));
    expect(container.firstElementChild).toHaveClass("aspect-24/9");
    expect(screen.getByRole("link", { name: "Battle map" })).toBeInTheDocument();

    fireEvent.error(img);
    expect(container.innerHTML).toBe("");

    rerender(
      <HobCover image={null} pending={false} shape="whole">
        {link}
      </HobCover>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    rerender(
      <HobCover image={null} pending shape="whole">
        {link}
      </HobCover>,
    );
    expect(container.firstElementChild).toHaveClass("aspect-3/2");
    expect(screen.getByRole("status")).toHaveTextContent("Hob is drawing…");
  });
});
