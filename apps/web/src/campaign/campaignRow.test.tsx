import { cleanup, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderAt } from "../test/renderRoute";
import { campaign, campaignId, installStubServer } from "./campaign.fixtures";

/**
 * The campaign row says the same thing on every one of the campaign's screens.
 *
 * ### The bug this exists for
 *
 * *"Sometimes the session name badge appears in the sub nav of a campaign and
 * sometimes it doesn't — it shows on some tabs but not the other, even on the
 * same night, same screen size."*
 *
 * It was not intermittent and it was not the width. Overview, Encounters and
 * Notes render `CampaignChrome`, which is what passes `campaignBadge` and
 * `campaignActions` into the shell; the Party and the Chronicle predated the
 * sixth delivery's split and each composed `AppShell` **itself**, passing
 * `campaignName` and nothing else. So two of the five destinations had no way to
 * draw either, whatever the night — and the same gap cost the campaign action,
 * which is the press a DM reaches for most.
 *
 * ### Why it is written as an enumeration, and not as five assertions
 *
 * The failure mode is a *new screen*, not a regression in these five: a sixth
 * destination that hand-builds a shell would ship exactly as these two did, and
 * a test naming today's five by hand would pass over it. So the destinations are
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

/** The two-row nav: one `<header>`, holding the campaign row and its badge. */
const campaignRow = (): HTMLElement => {
  const nav = screen.getByRole("navigation", { name: "This campaign" });
  const header = nav.closest("header");
  expect(header).not.toBeNull();
  return header as HTMLElement;
};

/**
 * Where the campaign row can go, read off the row itself.
 *
 * A rendered `href` is `/#/…` under the hash history, so the route behind it is
 * what is left once the `/#` is dropped — which is what `renderAt` takes.
 */
const destinations = async (): Promise<ReadonlyArray<{ label: string; path: string }>> => {
  await renderAt(`/campaigns/${campaignId}`);
  await screen.findByRole("heading", { name: "Overview" });
  // The campaign `<nav>` itself, not the header around it: the header also
  // holds the global row, whose items are above any campaign and are not this
  // campaign's destinations. That the two are different lists is the sixth
  // delivery's own rule — nothing appears on both rows.
  const nav = screen.getByRole("navigation", { name: "This campaign" });
  const found = within(nav)
    .getAllByRole("link")
    .map((link) => ({
      label: link.textContent ?? "",
      path: (link.getAttribute("href") ?? "").replace(/^\/#/, ""),
    }));
  cleanup();
  return found;
};

/** The label on the campaign row's own press, or nothing if there is none. */
const actLabel = (): string | undefined =>
  within(campaignRow())
    .queryAllByRole("button")
    .map((button) => button.textContent ?? "")
    // *Ask Hob* is the global row's and belongs to the app rather than to this
    // campaign, so it is not the press being compared.
    .find((label) => !label.startsWith("Ask Hob"));

describe("the campaign row, across every destination it offers", () => {
  it("carries the night and the campaign's own press on all of them", async () => {
    const where = await destinations();
    // Overview, Encounters, Party, Notes, Chronicle. Named so that a row that
    // silently lost an item is a failure rather than a smaller loop.
    expect(where.map((entry) => entry.label)).toEqual([
      "Overview",
      "Encounters",
      "Party",
      "Notes",
      "Chronicle",
    ]);

    const seen: Array<{ label: string; badge: string; act: string | undefined }> = [];
    for (const entry of where) {
      await renderAt(entry.path);
      const row = await screen.findByRole("navigation", { name: "This campaign" });
      expect(row).toBeInTheDocument();
      // The badge is the night the campaign is preparing, so it is looked for
      // *inside the row* — the Chronicle's spine draws a card named for the same
      // session, and finding that one would prove nothing about the bar.
      const badge = await within(campaignRow()).findByText(/^Session \d+$/);
      seen.push({ label: entry.label, badge: badge.textContent ?? "", act: actLabel() });
      cleanup();
    }

    // One value, rendered five times — not five branches that happen to agree.
    // `CampaignChrome`'s `actFor` computes the press once; a screen that decided
    // for itself is exactly what this is here to catch.
    expect(seen).toEqual([
      { label: "Overview", badge: "Session 12", act: "Start an encounter" },
      { label: "Encounters", badge: "Session 12", act: "Start an encounter" },
      { label: "Party", badge: "Session 12", act: "Start an encounter" },
      { label: "Notes", badge: "Session 12", act: "Start an encounter" },
      { label: "Chronicle", badge: "Session 12", act: "Start an encounter" },
    ]);
  }, 30_000);

  it("draws no badge at all when no night is open, and offers to start one", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, currentSessionId: null },
    });

    const where = await destinations();
    const seen: Array<{ label: string; badges: number; act: string | undefined }> = [];
    for (const entry of where) {
      await renderAt(entry.path);
      await screen.findByRole("navigation", { name: "This campaign" });
      // Waiting on the press is waiting on the load: it is the last thing the
      // row draws, so a count of zero badges taken before it would be the
      // loading state rather than the answer.
      const row = campaignRow();
      await within(row).findByRole("button", { name: /Start session/ });
      seen.push({
        label: entry.label,
        // An absent session must render *nothing* — not an empty badge and not
        // a placeholder, which is the other way this could have been "fixed".
        badges: within(row).queryAllByText(/^Session/).length,
        act: actLabel(),
      });
      cleanup();
    }

    expect(seen).toEqual([
      { label: "Overview", badges: 0, act: "Start session" },
      { label: "Encounters", badges: 0, act: "Start session" },
      { label: "Party", badges: 0, act: "Start session" },
      { label: "Notes", badges: 0, act: "Start session" },
      { label: "Chronicle", badges: 0, act: "Start session" },
    ]);
  }, 30_000);
});
