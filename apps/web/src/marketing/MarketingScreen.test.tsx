import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashHref, renderAt } from "../test/renderRoute";
import { installMemoryStorage } from "../test/storage";

/**
 * The homepage itself: what it says, where its links go, and — the half worth
 * a test rather than a look — what it deliberately does *not* say.
 *
 * Two of these assertions are about absences the captain decided on, and an
 * absence is exactly the kind of thing that comes quietly back. The pricing
 * table advertised plans for a product with no billing; the email capture
 * promised a link this product never sends.
 *
 * The rest are about links. Under a hash history a bare `href="#features"`
 * replaces the whole route and throws the reader onto the campaign list, so an
 * in-page anchor has to be `<Link to="/" hash="…">` and render as `/#/#features`
 * — that is a real defect this page could carry invisibly, since a wrong anchor
 * still looks like a link.
 */

installMemoryStorage();

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

/** The homepage is what `#/` is for a reader with no credential of any kind. */
const renderHome = () => renderAt("/", undefined, "none");

describe("the marketing homepage", () => {
  it("leads with the product rather than an illustration", async () => {
    await renderHome();

    expect(
      screen.getByRole("heading", { name: /Run the fight, not the spreadsheet/ }),
    ).toBeInTheDocument();

    // The kit's own reason for the hero: it draws a real initiative list, on
    // the runner's row recipe, rather than a picture of one.
    const order = screen.getByRole("table", { name: "Initiative order" });
    expect(within(order).getByText("Brannoc")).toBeInTheDocument();
    expect(within(order).getByText("44/52")).toBeInTheDocument();
    // Whoever is up wears the accent edge, from the semantic slot and not the
    // ramp step it happens to resolve to today.
    const rows = within(order).getAllByRole("row");
    expect(rows[0]).toHaveClass("border-l-accent", "bg-accent-soft");
    expect(rows[1]).toHaveClass("border-l-transparent");
  });

  it("names six things the product actually does", async () => {
    await renderHome();

    expect(
      screen.getByRole("heading", { name: "Six things you stop doing by hand" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Initiative that keeps up")).toBeInTheDocument();
    expect(screen.getByText("Dark at the table")).toBeInTheDocument();
  });

  /**
   * Dropped by the captain: three plans, two prices and tiered features for a
   * product with no billing, no plans and no limits — and one advertised
   * feature, co-DM seats, is something this project has decided against and has
   * a schema constraint preventing.
   */
  it("advertises no plans, no prices and no seats", async () => {
    await renderHome();

    expect(screen.queryByText(/Pricing/)).toBeNull();
    expect(screen.queryByText(/Hedge tavern|Roadhouse|Guildhall/)).toBeNull();
    expect(screen.queryByText(/per month/)).toBeNull();
    expect(screen.queryByText(/Co-DM/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/\$\d/);
  });

  /** Accounts come from the hosted identity provider; there is no list to join. */
  it("captures no email and promises no link", async () => {
    await renderHome();

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/the link is on its way/)).toBeNull();
  });

  it("builds in-page anchors through the router, never as a bare fragment", async () => {
    await renderHome();

    const nav = screen.getByRole("navigation", { name: "This page" });
    // `/#/#features`, not `#features`: the route, then the fragment inside it.
    expect(within(nav).getByRole("link", { name: "Features" })).toHaveAttribute(
      "href",
      `${hashHref("/")}#features`,
    );
    expect(within(nav).getByRole("link", { name: "Components" })).toHaveAttribute(
      "href",
      hashHref("/gallery"),
    );
  });

  it("renders no link that goes nowhere", async () => {
    await renderHome();

    // Everything the kit drew and this product has no page for. A dead link is
    // the same lie as a stubbed field, so each is absent rather than inert.
    for (const gone of [
      "Bestiary",
      "Changelog",
      "Player view",
      "Status",
      "Contact",
      "Privacy",
      "Keyboard shortcuts",
      "Import a monster",
      "Printable sheets",
    ]) {
      expect(screen.queryByRole("link", { name: gone })).toBeNull();
    }

    // And nothing at all is an `<a>` without somewhere to be.
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^\/#\//);
    }
  });

  /**
   * The wrinkle `StartCta.tsx` had to answer, in the state this suite runs in:
   * `vite.config.ts` pins the publishable key empty, so hosted sign-in is
   * unconfigured here exactly as it is on a developer's machine. The button
   * must not be missing (a page built around a call to action reads as broken
   * without one) and must not be dead — so it points at the one credential this
   * build genuinely has, and says so.
   */
  it("offers the developer token when there is no hosted sign-up to open", async () => {
    await renderHome();

    // A `Button` rendering an `<a>` keeps the `button` role — that is what
    // `nativeButton={false}` is for — so this asks for a button and reads its
    // `href`, which is the shape every route-as-a-button assertion here takes.
    const cta = screen.getAllByRole("button", { name: /Set up a developer token/ });
    expect(cta).toHaveLength(3);
    for (const button of cta) {
      expect(button).toHaveAttribute("href", `${hashHref("/gallery")}#server`);
    }
    expect(screen.getByText(/Hosted sign-in is not configured on this build/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a campaign" })).toBeNull();
  });
});
