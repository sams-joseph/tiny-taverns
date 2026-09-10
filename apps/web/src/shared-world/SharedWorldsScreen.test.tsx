import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  campaign,
  campaignId,
  sharedWorld,
  sharedWorldDetails,
  worldId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  renderCampaigns,
  renderSharedWorld,
} from "../campaign/campaign.fixtures";

/**
 * The Shared World directory and one world's campaign directory and people.
 *
 * What replaced the old campaign list's role filter is the **relation on each
 * card**: `Created by you`, `Playing`, or a plain world campaign — a member
 * sees that a campaign exists and who runs it, and gets no way in until its
 * creator seats them. That last card is the participation decision on screen.
 */

const server = installStubServer();
installMemoryStorage();

const frame = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

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

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

describe("the Shared Worlds list", () => {
  it("lists the Shared Worlds this account belongs to, and opens one", async () => {
    await renderCampaigns("/worlds", mintingSession());

    expect(await screen.findByText("The Salt Company")).toBeTruthy();
    // The owner's own sharedWorld says so; a sharedWorld you were invited into would not.
    expect(screen.getByText("Yours")).toBeTruthy();
    const open = screen.getByRole("button", { name: /Open/ });
    expect(open.getAttribute("href")).toBe(`/#/worlds/${worldId}`);
  });

  it("founds a sharedWorld with one field, and re-reads the list", async () => {
    server.routes.set("POST /worlds", { status: 200, body: sharedWorld });
    await renderCampaigns("/worlds", mintingSession());
    await screen.findByText("The Salt Company");

    await userEvent.type(screen.getByLabelText("Shared World name"), "The Hag's Bargain Co");
    await userEvent.click(screen.getByRole("button", { name: "Create Shared World" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/worlds")).toEqual({ name: "The Hag's Bargain Co" }),
    );
  });

  it("says what an empty list means, without a mode to blame", async () => {
    server.routes.set("GET /worlds", { status: 200, body: [] });
    await renderCampaigns("/worlds", mintingSession());

    expect(await screen.findByText("No Shared World yet")).toBeTruthy();
    expect(screen.getByText(/share history and Hob's memory/)).toBeTruthy();
  });

  it("keeps archived Shared Worlds on a lazy shelf and restores one", async () => {
    const archivedWorld = {
      ...sharedWorldDetails,
      name: "The Old Roads",
      archivedAt: "2026-08-11T09:00:00.000Z",
    };
    server.routes.set("GET /worlds/archived", { status: 200, body: [archivedWorld] });
    server.routes.set(`POST /worlds/${worldId}/restore`, {
      status: 200,
      body: { ...archivedWorld, archivedAt: null },
    });
    await renderCampaigns("/worlds", mintingSession());
    await screen.findByText("The Salt Company");

    expect(server.calls.some((call) => call.pathname === "/worlds/archived")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Archived Shared Worlds" }));

    expect(await screen.findByText("The Old Roads")).toBeTruthy();
    expect(screen.getByText(/shared memory and history are kept/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(bodyOf(server, "POST", `/worlds/${worldId}/restore`)).toEqual({}));
  });
});

describe("one Shared World's screen", () => {
  it("draws the directory with this reader's relation on each card", async () => {
    await renderSharedWorld(mintingSession());

    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.getByText("Created by you")).toBeTruthy();
    expect(screen.getByText("Run by Wren Alderby")).toBeTruthy();
  });

  it("shows the accepted Story So Far above the Chronicle and marks newer entries", async () => {
    const summaryText = "The company followed the lantern road into the marsh.";
    const newerEntry = {
      id: "8a1d1f28-3a4b-4c6d-9e11-0d2f3c4b5a61",
      worldId,
      campaignId: null,
      sessionId: null,
      sourceKind: "manual",
      worldSeq: 4,
      occurredAt: null,
      acceptedAt: campaign.createdAt,
      title: "A newer turn",
      body: "The bell rang after the company entered the marsh.",
      facts: {},
      origin: "authored",
      assistantTurnId: null,
      createdByAccountId: campaign.creatorAccountId,
      createdAt: campaign.createdAt,
    };
    server.routes.set(`GET /worlds/${worldId}/history`, { status: 200, body: [newerEntry] });
    server.routes.set(`GET /worlds/${worldId}/history/summary`, {
      status: 200,
      body: {
        id: "0b9d3d1e-71ba-48e5-b2f1-f2cdd6ca893d",
        worldId,
        status: "accepted",
        lastWorldSeq: 3,
        text: summaryText,
        origin: "assistant",
        assistantTurnId: "c4f4b6d2-9b1a-4c3e-8f7a-2b1c3d4e5f60",
        acceptedAt: campaign.createdAt,
        createdAt: campaign.createdAt,
      },
    });

    await renderSharedWorld(mintingSession());

    const story = await screen.findByRole("region", { name: "Story So Far" });
    const chronicle = screen.getByRole("region", { name: "Chronicle" });
    expect(within(story).getByText(summaryText)).toBeInTheDocument();
    expect(within(story).getByText("Update needed")).toBeInTheDocument();
    expect(within(story).getByRole("button", { name: "Refresh with Hob" })).toBeInTheDocument();
    expect(
      story.compareDocumentPosition(chronicle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("offers no way into a campaign this member does not participate in", async () => {
    // The participation decision on screen: the card names the campaign and
    // who runs it, and a link that lands on a 404 is worse than none.
    aimDirectory("none");
    await renderSharedWorld(mintingSession());

    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open/ })).toBeNull();
    expect(screen.getByText("The Salt Road").closest("a")).toBeNull();
  });

  it("links a card you play at to the same campaign URL its creator uses", async () => {
    aimDirectory("player");
    await renderSharedWorld(mintingSession());

    expect(await screen.findByText("Playing")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open/ }).getAttribute("href")).toBe(
      `/#/campaigns/${campaignId}`,
    );
  });

  it("starts a campaign in this sharedWorld, and the founder runs it", async () => {
    server.routes.set(`POST /worlds/${worldId}/campaigns`, { status: 200, body: campaign });
    await renderSharedWorld(mintingSession());
    await screen.findByText("The Salt Road");

    await userEvent.type(screen.getByLabelText("New campaign name"), "The Long Winter");
    await userEvent.click(screen.getByRole("button", { name: "Start a campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", `/worlds/${worldId}/campaigns`)).toEqual({
        name: "The Long Winter",
      }),
    );
  });

  it("keeps the roster informational and leaves onboarding with campaigns", async () => {
    await renderSharedWorld(mintingSession());

    expect(await screen.findByText("Wren Alderby")).toBeTruthy();
    expect(screen.getByText("Owner")).toBeTruthy();
    // Campaign links are the one onboarding act. The Shared World is context,
    // so it neither offers a competing invitation nor a broad removal that
    // could silently affect several tables.
    expect(screen.queryByRole("button", { name: /Invite/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    // With no owner-only chrome left, the screen no longer asks who the
    // current account is; sharedWorld reach has already been proven by each read.
    expect(server.calls.some((call) => call.method === "GET" && call.pathname === "/me")).toBe(
      false,
    );
  });

  it("lets the owner rename the Shared World", async () => {
    server.routes.set(`PATCH /worlds/${worldId}`, {
      status: 200,
      body: { ...sharedWorldDetails, name: "The Lantern Roads" },
    });
    await renderSharedWorld(mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Shared World settings" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "The Lantern Roads");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/worlds/${worldId}`)).toEqual({
        name: "The Lantern Roads",
      }),
    );
  });

  it("shows no Shared World settings to a non-owner", async () => {
    server.routes.set("GET /worlds", {
      status: 200,
      body: [
        {
          sharedWorld: sharedWorldDetails,
          isOwner: false,
          joinedAt: campaign.createdAt,
        },
      ],
    });
    await renderSharedWorld(mintingSession());

    await screen.findByText("The Salt Road");
    expect(screen.queryByRole("button", { name: "Shared World settings" })).toBeNull();
  });

  it("explains safe retirement and shows why a world with campaigns cannot be archived", async () => {
    server.routes.set(`DELETE /worlds/${worldId}`, {
      status: 409,
      body: {
        _tag: "Conflict",
        message:
          "Move or disconnect every campaign in this Shared World before archiving it. Archived campaigns count too.",
      },
    });
    await renderSharedWorld(mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Shared World settings" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive Shared World" }));

    expect(screen.getByText(/no campaigns remain here, including archived campaigns/)).toBeTruthy();
    expect(
      screen.getByText(
        /Chronicle, Hob conversation, members, and Library shares are all preserved/,
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Archive it" }));
    expect(
      await screen.findByText(/Move or disconnect every campaign.*Archived campaigns count too/),
    ).toBeTruthy();
    expect(globalThis.location.hash).toBe(`#/worlds/${worldId}`);
  });

  it("returns to the directory after archiving an empty Shared World", async () => {
    server.routes.set(`DELETE /worlds/${worldId}`, {
      status: 200,
      body: {
        ...sharedWorldDetails,
        archivedAt: "2026-09-09T14:00:00.000Z",
      },
    });
    await renderSharedWorld(mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Shared World settings" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive Shared World" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive it" }));

    await waitFor(() => expect(globalThis.location.hash).toBe("#/worlds"));
  });

  it("opens Shared World Hob and refreshes the Chronicle when a proposal is kept", async () => {
    const threadId = "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
    const turnId = "c4f4b6d2-9b1a-4c3e-8f7a-2b1c3d4e5f60";
    const historyId = "8a1d1f28-3a4b-4c6d-9e11-0d2f3c4b5a61";
    const entry = {
      id: historyId,
      worldId,
      campaignId: null,
      sessionId: null,
      sourceKind: "manual",
      worldSeq: 1,
      occurredAt: null,
      acceptedAt: campaign.createdAt,
      title: "The roads remember",
      body: "Every lantern went dark on the same night.",
      facts: {},
      origin: "assistant",
      assistantTurnId: turnId,
      createdByAccountId: null,
      createdAt: campaign.createdAt,
    };
    server.routes.set(`GET /worlds/${worldId}/hob`, {
      status: 200,
      body: { available: true, model: "local", sharedWorld: sharedWorld.name },
    });
    server.routes.set(`GET /worlds/${worldId}/hob/threads`, { status: 200, body: [] });
    server.routes.set(`POST /worlds/${worldId}/hob/ask`, {
      status: 200,
      sse:
        frame("began", { threadId, turnId }) +
        frame("proposal", {
          turnId,
          proposal: {
            target: "sharedWorldHistory",
            title: entry.title,
            body: entry.body,
          },
        }) +
        frame("done", { reason: "stop" }),
    });
    server.routes.set(`POST /worlds/${worldId}/hob/threads/${threadId}/turns/${turnId}/accept`, {
      status: 200,
      body: { accepted: "sharedWorldHistory", entry },
    });
    server.routes.set(`GET /worlds/${worldId}/history`, {
      status: 200,
      body: () => {
        const reads = server.calls.filter(
          (call) => call.method === "GET" && call.pathname === `/worlds/${worldId}/history`,
        );
        return reads.length < 2 ? [] : [entry];
      },
    });

    await renderSharedWorld(mintingSession());
    await screen.findByText("The Salt Road");
    await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));

    expect(await screen.findByText("What should we remember together?")).toBeInTheDocument();
    const ask = await screen.findByRole("textbox", { name: "Ask Hob" });
    await userEvent.type(ask, "Remember the night the lanterns failed.{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Add to Chronicle" }));

    await waitFor(() =>
      expect(
        server.calls.filter(
          (call) => call.method === "GET" && call.pathname === `/worlds/${worldId}/history`,
        ),
      ).toHaveLength(2),
    );
    expect(
      await within(screen.getByRole("region", { name: "Chronicle" })).findByText(
        "Every lantern went dark on the same night.",
      ),
    ).toBeInTheDocument();
  });
});
