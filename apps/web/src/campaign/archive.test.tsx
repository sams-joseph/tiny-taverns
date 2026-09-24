import { screen, waitFor, within } from "@testing-library/react";
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
  renderScreen,
  renderSharedWorld,
} from "./campaign.fixtures";

/**
 * Taking a campaign off the list, and bringing it back. The archive lives
 * inside the campaign (its Overview's actions menu, and its settings dialog);
 * the lists' cards carry no campaign controls, and the shelf on the list is
 * the way back.
 *
 * What is under test is as much the **words** as the wire: a confirmation that
 * names the campaign, copy that says it is kept, and a way back that is one
 * press. Three properties would rot silently, and each has a test:
 *
 * - **the shelf is a second URL, not a filter**: `GET /me/campaigns` is asked
 *   for the live list and nothing about archiving changes it;
 * - **archiving is the creator's**: no card on any list offers it, and a
 *   player's projection of the campaign has no actions menu;
 * - **an open night is named, not ended**: the dialog reads the campaign row
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

/** The Shared World directory, with the fixture campaign's card re-aimed per test. */
const aimDirectory = (relation: "creator" | "player" | "none") =>
  server.routes.set(`GET /worlds/${worldId}/campaigns`, {
    status: 200,
    body: [
      {
        id: campaignId,
        worldId,
        creatorAccountId: campaign.creatorAccountId,
        creatorName: "Wren Alderby",
        name: campaign.name,
        relation,
        archivedAt: null,
        createdAt: campaign.createdAt,
      },
    ],
  });

const paths = (method: string) =>
  server.calls.filter((call) => call.method === method).map((call) => call.pathname);

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

/** The campaign's own archive: its Overview's actions menu. */
const openArchive = async () => {
  await renderScreen(mintingSession());
  await userEvent.click(await screen.findByRole("button", { name: "Campaign actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Archive campaign" }));
};

describe("archiving a campaign", () => {
  it("confirms with the campaign's own name before anything is sent", async () => {
    await openArchive();

    // The name is the check a bare button cannot make: the DM reads back the
    // thing they are about to shelve.
    expect(await screen.findByText("Archive The Salt Road?")).toBeTruthy();
    // …and nothing has been written yet.
    expect(paths("DELETE")).toEqual([]);
  });

  it("is also reached from the campaign's settings", async () => {
    await renderScreen(mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: /^Settings/ }));
    const settings = await screen.findByRole("dialog", { name: "Campaign settings" });
    await userEvent.click(within(settings).getByRole("button", { name: "Archive campaign" }));

    expect(await screen.findByText("Archive The Salt Road?")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Campaign settings" })).toBeNull();
  });

  it("says the campaign is kept and can be brought back, because that is the trade", async () => {
    await openArchive();

    expect(await screen.findByText(/Nothing in it is deleted/)).toBeTruthy();
    expect(screen.getByText(/bring it back whenever you like/)).toBeTruthy();
  });

  it("names an open night without offering to end one", async () => {
    // The fixture campaign points at session 12, and a finished session cannot
    // be current (`0006_session_finished.ts`), so a non-null pointer is exactly
    // "there is a night open here".
    await openArchive();

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

    await openArchive();

    expect(await screen.findByText("Archive The Salt Road?")).toBeTruthy();
    expect(screen.queryByText(/A night is still open here/)).toBeNull();
  });

  it("returns to the campaign list, where the shelf is", async () => {
    await openArchive();
    nothingLive();
    await userEvent.click(await screen.findByRole("button", { name: "Archive it" }));

    await waitFor(() => expect(globalThis.location.pathname).toBe("/campaigns"));
    expect(await screen.findByRole("button", { name: /Archived campaigns/ })).toBeTruthy();
  });

  it("keeps it when the confirmation is declined", async () => {
    await openArchive();
    await userEvent.click(await screen.findByRole("button", { name: "Keep it here" }));

    await waitFor(() => expect(screen.queryByText("Archive The Salt Road?")).toBeNull());
    expect(paths("DELETE")).toEqual([]);
    expect(globalThis.location.pathname).toBe(`/campaigns/${campaignId}`);
  });

  it("stays open and says so when the write is refused", async () => {
    server.routes.set(`DELETE /campaigns/${campaignId}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    });

    await openArchive();
    await userEvent.click(await screen.findByRole("button", { name: "Archive it" }));

    // Still on screen, with the failure in the footer rather than below a fold
    // the DM never scrolls to: the rule `SaveFailure` exists for.
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

describe("no list offers it", () => {
  it.each(["creator", "player", "none"] as const)(
    "draws no archive control on a Shared World's %s card",
    async (relation) => {
      aimDirectory(relation);
      await renderSharedWorld(mintingSession());
      expect(await screen.findByText("Run by Wren Alderby")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    },
  );

  it("gives a player's projection of the campaign no actions menu", async () => {
    server.routes.set("GET /me/campaigns", { status: 200, body: [membership("player")] });
    await renderScreen(mintingSession());

    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Campaign actions" })).toBeNull();
  });
});
