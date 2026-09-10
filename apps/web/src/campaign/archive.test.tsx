import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  archivedCampaign,
  campaign,
  campaignId,
  worldId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  renderCampaigns,
  renderSharedWorld,
} from "./campaign.fixtures";

/**
 * Taking a campaign off the list, and bringing it back — from the group's
 * directory, where a campaign's card lives now.
 *
 * The captain asked to *delete* a campaign and this product archives one — so
 * what is under test is as much the **words** as the wire: a confirmation that
 * names the campaign, copy that says it is kept, and a way back that is one
 * press. A test that only checked the `DELETE` would pass against a screen
 * that had lost every one of those.
 *
 * Three properties are the ones that would rot silently, and each has a test:
 *
 * - **the shelf is a second URL, not a filter** — `GET /me/campaigns` is asked
 *   for the live list and nothing about archiving changes it;
 * - **archiving is the creator's** — a card for a table this account merely
 *   plays at, or merely shares a group with, carries no control, read off the
 *   card's own `relation`;
 * - **an open night is named, not ended** — the dialog reads the campaign row
 *   for the pointer, and the client sends one request.
 */

const server = installStubServer();
installMemoryStorage();

const shelf = "/me/campaigns/archived";

/** What `GET /me/campaigns` answers once the campaign has been shelved. */
const nothingLive = () => server.routes.set("GET /me/campaigns", { status: 200, body: [] });

const membership = (relation: "creator" | "player", row: unknown = campaign) => ({
  campaign: row,
  relation,
  sharedWorld: null,
  joinedAt: "2026-06-01T10:00:00.000Z",
});

/** The directory card, re-aimed per test. */
const card = (relation: "creator" | "player" | "none", archivedAt: string | null = null) => ({
  id: campaignId,
  worldId,
  creatorAccountId: campaign.creatorAccountId,
  creatorName: "Wren Alderby",
  name: campaign.name,
  relation,
  archivedAt,
  createdAt: campaign.createdAt,
});

const aimDirectory = (relation: "creator" | "player" | "none", archivedAt: string | null = null) =>
  server.routes.set(`GET /worlds/${worldId}/campaigns`, {
    status: 200,
    body: [card(relation, archivedAt)],
  });

const paths = (method: string) =>
  server.calls.filter((call) => call.method === method).map((call) => call.pathname);

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

describe("archiving a campaign", () => {
  it("confirms with the campaign's own name before anything is sent", async () => {
    await renderSharedWorld(mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

    // The name is the check a row-level button cannot make — the DM reads back
    // the thing they are about to shelve.
    expect(await screen.findByText("Archive The Salt Road?")).toBeTruthy();
    // …and nothing has been written yet.
    expect(paths("DELETE")).toEqual([]);
  });

  it("says the campaign is kept and can be brought back, because that is the trade", async () => {
    await renderSharedWorld(mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

    expect(await screen.findByText(/Nothing in it is deleted/)).toBeTruthy();
    expect(screen.getByText(/bring it back whenever you like/)).toBeTruthy();
  });

  it("names an open night without offering to end one", async () => {
    // The fixture campaign points at session 12, and a finished session cannot
    // be current — `0006_session_finished.ts` makes that structural — so a
    // non-null pointer is exactly "there is a night open here". The dialog
    // reads the campaign row itself: the card is a deliberate projection and
    // does not carry the pointer.
    await renderSharedWorld(mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

    expect(await screen.findByText(/A night is still open here/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Archive it" }));

    await waitFor(() => expect(paths("DELETE")).toEqual([`/campaigns/${campaignId}`]));
    // One write and one write only. Archiving does not finish the night, so
    // nothing patches the session or the campaign's pointer on the way out.
    expect(paths("PATCH")).toEqual([]);
    expect(paths("POST")).toEqual([]);
  });

  it("says nothing about a night when there is none", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, currentSessionId: null },
    });

    await renderSharedWorld(mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

    expect(await screen.findByText("Archive The Salt Road?")).toBeTruthy();
    expect(screen.queryByText(/A night is still open here/)).toBeNull();
  });

  it("re-reads the directory, and the card says Archived", async () => {
    await renderSharedWorld(mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: "Archive" }));
    // A structural write, so the screen re-reads rather than guessing: the
    // badge appears because the server says so.
    aimDirectory("creator", archivedCampaign.archivedAt as string);
    nothingLive();
    await userEvent.click(await screen.findByRole("button", { name: "Archive it" }));

    expect(await screen.findByText("Archived")).toBeTruthy();
  });

  it("keeps it when the confirmation is declined", async () => {
    await renderSharedWorld(mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: "Archive" }));
    await userEvent.click(await screen.findByRole("button", { name: "Keep it here" }));

    await waitFor(() => expect(screen.queryByText("Archive The Salt Road?")).toBeNull());
    expect(paths("DELETE")).toEqual([]);
    expect(screen.getByText("The Salt Road")).toBeTruthy();
  });

  it("stays open and says so when the write is refused", async () => {
    server.routes.set(`DELETE /campaigns/${campaignId}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    });

    await renderSharedWorld(mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: "Archive" }));
    await userEvent.click(await screen.findByRole("button", { name: "Archive it" }));

    // Still on screen, with the failure in the footer rather than below a fold
    // the DM never scrolls to — the rule `SaveFailure` exists for.
    expect(await screen.findByRole("button", { name: "Archive it" })).toBeTruthy();
    expect(screen.getByText("Archive The Salt Road?")).toBeTruthy();
  });
});

describe("the shelf", () => {
  it("asks for nothing until it is opened", async () => {
    await renderCampaigns("/worlds", mintingSession());
    expect(await screen.findByText("The Salt Company")).toBeTruthy();

    // A count beside the opener would cost a second request on every load for
    // a number that is zero for almost everybody.
    expect(paths("GET")).not.toContain(shelf);

    await userEvent.click(screen.getByRole("button", { name: /Archived campaigns/ }));

    await waitFor(() => expect(paths("GET")).toContain(shelf));
  });

  it("says the shelf is empty rather than looking broken", async () => {
    await renderCampaigns("/worlds", mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: /Archived campaigns/ }));

    expect(await screen.findByText(/Nothing here\./)).toBeTruthy();
  });

  it("brings a campaign back with one press", async () => {
    nothingLive();
    server.routes.set(`GET ${shelf}`, {
      status: 200,
      body: [membership("creator", archivedCampaign)],
    });

    await renderCampaigns("/worlds", mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: /Archived campaigns/ }));
    expect(await screen.findByText(/Archived 11 August 2026/)).toBeTruthy();

    server.routes.set("GET /me/campaigns", { status: 200, body: [membership("creator")] });
    server.routes.set(`GET ${shelf}`, { status: 200, body: [] });
    await userEvent.click(screen.getByRole("button", { name: /Restore/ }));

    await waitFor(() => expect(paths("POST")).toEqual([`/campaigns/${campaignId}/restore`]));
  });

  it("offers no way back for a table you only sit at", async () => {
    // The shelf is the ordinary membership read, so a player's archived table
    // is in the answer — and restoring is `campaignWritable`'s question, so a
    // *Restore* on it would be a control that exists and then 404s.
    server.routes.set(`GET ${shelf}`, {
      status: 200,
      body: [
        membership("player", { ...archivedCampaign, name: "The Hag's Bargain" }),
        membership("creator", { ...archivedCampaign, name: "The Long Winter" }),
      ],
    });

    await renderCampaigns("/worlds", mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: /Archived campaigns/ }));

    expect(await screen.findByText("The Long Winter")).toBeTruthy();
    expect(screen.queryByText("The Hag's Bargain")).toBeNull();
    expect(screen.getAllByRole("button", { name: /Restore/ })).toHaveLength(1);
  });
});

describe("somebody else's campaign", () => {
  it("offers no archive control on a card you play at or merely see", async () => {
    aimDirectory("player");
    await renderSharedWorld(mintingSession());
    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();

    aimDirectory("none");
    await renderSharedWorld(mintingSession());
    expect(await screen.findByText("Run by Wren Alderby")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });
});
