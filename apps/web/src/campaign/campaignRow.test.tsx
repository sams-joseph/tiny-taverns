import { cleanup, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderAt } from "../test/renderRoute";
import { campaign, campaignId, encounterId, installStubServer } from "./campaign.fixtures";

/**
 * The campaign's chrome says the same thing on every one of its screens.
 *
 * ### The bug this exists for
 *
 * *"Sometimes the session name badge appears in the sub nav of a campaign and
 * sometimes it doesn't — it shows on some tabs but not the other, even on the
 * same night, same screen size."*
 *
 * It was not intermittent and it was not the width. The badge and the campaign
 * action were props a screen passed to the shell, and the Party and the
 * Chronicle each composed a shell of their own that passed neither. Both are
 * read from `campaignNightAtom` by the campaign row now, and the shell is
 * mounted once by the layout route, so no screen can draw either short.
 *
 * ### Why it is written as an enumeration, and not as five assertions
 *
 * The failure mode is a *new screen*, not a regression in these: a destination
 * that somehow draws the row differently would ship the way those two did, and a
 * test naming today's destinations by hand would pass over it. So the destinations are
 * read out of the rendered campaign row — the row is the definition of what a
 * campaign's destinations are — and every one of them is then visited. Add an
 * item to `campaignNavFor` and this test starts visiting it with no edit here.
 *
 * The whole thing goes through the real router and the shared stub server, so
 * each destination is reached the way a DM reaches it: by its URL.
 */

const server = installStubServer();

beforeEach(() => {
  server.reset();
});

/** The campaign row: its name and badge, its tabs, and the campaign's press. */
const campaignRow = (): HTMLElement => {
  const row = screen.getByRole("navigation", { name: "This campaign" }).parentElement;
  expect(row).not.toBeNull();
  return row as HTMLElement;
};

const ACT = /Start session|Start an encounter|Back to the fight/;

/** Every press of the campaign's on the screen, and where each is. */
const acts = (): ReadonlyArray<string> =>
  screen
    .queryAllByRole("button")
    .filter((button) => ACT.test(button.textContent ?? ""))
    .map(
      (button) =>
        `${button.textContent ?? ""}${campaignRow().contains(button) ? "" : " (off the row)"}`,
    );

describe("the campaign's chrome, across every destination it offers", () => {
  /** A rendered `href` is the route itself, which is what `renderAt` takes. */
  const destinations = async (): Promise<ReadonlyArray<{ label: string; path: string }>> => {
    await renderAt(`/campaigns/${campaignId}`);
    await screen.findByRole("heading", { name: "The Salt Road" });
    // The campaign `<nav>` itself, not the header around it: the header also
    // holds the global row, whose items are above any campaign and are not this
    // campaign's destinations. That the two are different lists is the sixth
    // delivery's own rule — nothing appears on both rows.
    const nav = screen.getByRole("navigation", { name: "This campaign" });
    const found = within(nav)
      .getAllByRole("link")
      .map((link) => ({
        label: link.textContent ?? "",
        path: link.getAttribute("href") ?? "",
      }));
    cleanup();
    return found;
  };

  it("carries the night and the campaign's own press on the row, on every tab", async () => {
    const where = await destinations();
    // Overview, Encounters, Party, Notes, Cast, Chronicle.
    // Named so that a row that silently lost an item is a failure rather than a
    // smaller loop.
    expect(where.map((entry) => entry.label)).toEqual([
      "Overview",
      "Encounters",
      "Party",
      "Notes",
      "Cast",
      "Chronicle",
    ]);

    const seen: Array<{ label: string; badge: string; acts: ReadonlyArray<string> }> = [];
    for (const entry of where) {
      await renderAt(entry.path);
      // The row settles once the membership read has: the route wrapper's
      // loading frame is replaced by the real screen, so the node found first
      // may be replaced too — every assertion below re-queries.
      await screen.findByRole("navigation", { name: "This campaign" });
      // The badge is the night the campaign is preparing, so it is looked for
      // *inside the row* — the Chronicle's spine draws a card named for the same
      // session, and finding that one would prove nothing about the bar.
      const badge = await within(campaignRow()).findByText(/^Session \d+$/);
      await within(campaignRow()).findByRole("button", { name: ACT });
      // The screen's own content has loaded too, so a second press drawn in
      // it would be counted.
      await screen.findByRole("heading", { level: 1 });
      seen.push({ label: entry.label, badge: badge.textContent ?? "", acts: acts() });
      cleanup();
    }

    // One value, rendered six times — not six branches that happen to agree.
    // `act.tsx`'s `actFor` computes the press once; a screen that decided for
    // itself is exactly what this is here to catch. And one each: the
    // Overview's *Tonight* card used to carry a second, which two peach
    // buttons on one screen cannot afford.
    expect(seen).toEqual([
      { label: "Overview", badge: "Session 12", acts: ["Start an encounter"] },
      { label: "Encounters", badge: "Session 12", acts: ["Start an encounter"] },
      { label: "Party", badge: "Session 12", acts: ["Start an encounter"] },
      { label: "Notes", badge: "Session 12", acts: ["Start an encounter"] },
      { label: "Cast", badge: "Session 12", acts: ["Start an encounter"] },
      { label: "Chronicle", badge: "Session 12", acts: ["Start an encounter"] },
    ]);
  }, 30_000);

  it("draws no badge at all when no night is open, and offers to start one", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, currentSessionId: null },
    });

    const where = await destinations();
    const seen: Array<{ label: string; badges: number; acts: ReadonlyArray<string> }> = [];
    for (const entry of where) {
      await renderAt(entry.path);
      await screen.findByRole("navigation", { name: "This campaign" });
      // Waiting on the press is waiting on the load: it is the last thing the
      // row draws, so a count of zero badges taken before it would be the
      // loading state rather than the answer.
      await within(campaignRow()).findByRole("button", { name: /Start session/ });
      await screen.findByRole("heading", { level: 1 });
      seen.push({
        label: entry.label,
        // An absent session must render *nothing* — not an empty badge and not
        // a placeholder, which is the other way this could have been "fixed".
        badges: within(campaignRow()).queryAllByText(/^Session/).length,
        acts: acts(),
      });
      cleanup();
    }

    expect(seen).toEqual([
      { label: "Overview", badges: 0, acts: ["Start session"] },
      { label: "Encounters", badges: 0, acts: ["Start session"] },
      { label: "Party", badges: 0, acts: ["Start session"] },
      { label: "Notes", badges: 0, acts: ["Start session"] },
      { label: "Cast", badges: 0, acts: ["Start session"] },
      { label: "Chronicle", badges: 0, acts: ["Start session"] },
    ]);
  }, 30_000);

  /**
   * **The press is the row's last thing, after the tabs, and it is the only
   * button there besides the tabs' own *More*.** It was once taken off this row
   * because it overflowed it: measured in Chromium at 760 the row's last item
   * reached x=788 against a row ending at 760, and the shell's clip cut the
   * label mid-word — invisible to `scrollWidth`. It is back because the captain
   * chose the row (2026-09-23), and the row now collapses to make room for it
   * (`CampaignRow`); the pixels are the Playwright suite's (`apps/web/e2e/`).
   * What jsdom can pin is the shape: the label can go to the screen reader
   * alone, and the press follows the nav rather than sitting inside it.
   */
  it("puts the press after the tabs, with a label that can give way to its icon", async () => {
    await renderAt(`/campaigns/${campaignId}/encounters`);
    const press = await within(campaignRow()).findByRole("button", {
      name: "Start an encounter",
    });
    const nav = screen.getByRole("navigation", { name: "This campaign" });

    expect(nav.contains(press)).toBe(false);
    expect(nav.compareDocumentPosition(press) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(press).toHaveAttribute("title", "Start an encounter");
    expect(within(press).getByText("Start an encounter")).toHaveClass("@max-2xl:sr-only");
    // Nothing on the row but the tabs, their *More* and the press.
    expect(
      within(campaignRow())
        .queryAllByRole("button")
        .filter((button) => !nav.contains(button)),
    ).toEqual([press]);
  }, 30_000);

  it("draws no press on the encounter builder, and keeps Encounters lit", async () => {
    for (const [path, title] of [
      [`/campaigns/${campaignId}/encounters/new`, "New encounter"],
      [`/campaigns/${campaignId}/encounters/${encounterId}/edit`, "Edit encounter"],
    ] as const) {
      await renderAt(path);
      await screen.findByRole("heading", { level: 1, name: title });
      await within(campaignRow()).findByText(/^Session \d+$/);
      expect(within(campaignRow()).queryByRole("button", { name: ACT })).toBeNull();
      expect(
        within(screen.getByRole("navigation", { name: "This campaign" })).getByRole("link", {
          name: "Encounters",
        }),
      ).toHaveAttribute("aria-current");
      cleanup();
    }
  }, 30_000);

  it("draws no press on the create form, whose own next step is its peach", async () => {
    await renderAt(`/campaigns/${campaignId}/characters/new`);
    await screen.findByRole("heading", { level: 1, name: "New character" });
    await within(campaignRow()).findByText(/^Session \d+$/);
    expect(within(campaignRow()).queryByRole("button", { name: ACT })).toBeNull();
  }, 30_000);
});
