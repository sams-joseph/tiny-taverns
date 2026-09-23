import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { apiUrl } from "../api/client";
import {
  bodyOf,
  campaign,
  campaignId,
  drawnWorldCover,
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

  it("puts New Shared World in the bar and no create form in the body", async () => {
    await renderCampaigns("/worlds", mintingSession());
    await screen.findByText("The Salt Company");

    expect(screen.getByRole("button", { name: "New Shared World" }).classList).toContain(
      "bg-accent",
    );
    expect(screen.queryByLabelText("Shared World name")).toBeNull();
  });

  it("founds a sharedWorld with one field, and lands on it", async () => {
    server.routes.set("POST /worlds", { status: 200, body: sharedWorldDetails });
    await renderCampaigns("/worlds", mintingSession());
    await screen.findByText("The Salt Company");

    await userEvent.click(screen.getByRole("button", { name: "New Shared World" }));
    await userEvent.type(screen.getByLabelText("Shared World name"), "The Hag's Bargain Co");
    await userEvent.click(screen.getByRole("button", { name: "Create Shared World" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/worlds")).toEqual({ name: "The Hag's Bargain Co" }),
    );
    await waitFor(() => expect(globalThis.location.hash).toBe(`#/worlds/${worldId}`));
  });

  it("founds a Shared World with its description, trimmed, for the one cover draw", async () => {
    server.routes.set("POST /worlds", { status: 200, body: sharedWorldDetails });
    await renderCampaigns("/worlds", mintingSession());
    await screen.findByText("The Salt Company");

    await userEvent.click(screen.getByRole("button", { name: "New Shared World" }));
    await userEvent.type(screen.getByLabelText("Shared World name"), "The Reach");
    await userEvent.type(
      screen.getByLabelText("Shared World description"),
      "  Chained islands over a storm.  ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create Shared World" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/worlds")).toEqual({
        name: "The Reach",
        description: "Chained islands over a storm.",
      }),
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

    await userEvent.click(screen.getByRole("button", { name: "New campaign" }));
    await userEvent.type(screen.getByLabelText("New campaign name"), "The Long Winter");
    await userEvent.click(screen.getByRole("button", { name: "Start a campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", `/worlds/${worldId}/campaigns`)).toEqual({
        name: "The Long Winter",
      }),
    );
  });

  it("asks for a new campaign in a dialog without offering another context", async () => {
    await renderSharedWorld(mintingSession());
    await screen.findByText("The Salt Road");

    expect(screen.queryByLabelText("New campaign name")).toBeNull();
    const section = screen.getByRole("region", { name: "Campaigns" });
    await userEvent.click(within(section).getByRole("button", { name: "New campaign" }));
    const dialog = await screen.findByRole("dialog", { name: "New campaign" });
    expect(within(dialog).getByText(/A new table in The Salt Company/)).toBeTruthy();
    expect(within(dialog).queryByRole("combobox")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("starts a campaign in this Shared World with its description", async () => {
    server.routes.set(`POST /worlds/${worldId}/campaigns`, { status: 200, body: campaign });
    await renderSharedWorld(mintingSession());
    await screen.findByText("The Salt Road");

    await userEvent.click(screen.getByRole("button", { name: "New campaign" }));
    await userEvent.type(screen.getByLabelText("New campaign name"), "The Long Winter");
    await userEvent.type(
      screen.getByLabelText("New campaign description"),
      "Snow that never ends.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Start a campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", `/worlds/${worldId}/campaigns`)).toEqual({
        name: "The Long Winter",
        description: "Snow that never ends.",
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

  it("puts the owner's settings in the bar, not the body", async () => {
    await renderSharedWorld(mintingSession());

    const settings = await screen.findByRole("button", { name: "Shared World settings" });
    const header = screen.getByRole("heading", { level: 1 }).closest("header");
    expect(header).not.toBeNull();
    expect(header?.contains(settings)).toBe(true);
    expect(screen.getByRole("main").contains(settings)).toBe(false);
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
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/worlds/${worldId}`)).toEqual({
        name: "The Lantern Roads",
        description: null,
      }),
    );
  });

  it("lets the owner rewrite the description, and clearing the box clears it", async () => {
    server.routes.set(`GET /worlds/${worldId}`, {
      status: 200,
      body: { ...sharedWorldDetails, description: "Reed marshes at dusk." },
    });
    server.routes.set(`PATCH /worlds/${worldId}`, { status: 200, body: sharedWorldDetails });
    await renderSharedWorld(mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Shared World settings" }));
    const description = screen.getByRole("textbox", { name: "Description" });
    expect(description).toHaveValue("Reed marshes at dusk.");
    await userEvent.clear(description);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/worlds/${worldId}`)).toEqual({
        name: sharedWorldDetails.name,
        description: null,
      }),
    );
  });

  it("puts the world's description under its cover, and nothing when there is none", async () => {
    server.routes.set(`GET /worlds/${worldId}`, {
      status: 200,
      body: { ...sharedWorldDetails, description: "Reed marshes at dusk." },
    });
    await renderSharedWorld(mintingSession());
    const paragraph = await screen.findByText("Reed marshes at dusk.");
    const directory = screen.getByRole("region", { name: "Campaigns" });
    expect(
      paragraph.compareDocumentPosition(directory) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    const acceptPath = `/worlds/${worldId}/hob/threads/${threadId}/turns/${turnId}/accept`;
    const historyPath = `/worlds/${worldId}/history`;
    // Answer from state, as the server does: the entry exists once the accept
    // has been received, whichever read asks and however many do.
    const accepted = () =>
      server.calls.some((call) => call.method === "POST" && call.pathname === acceptPath);
    server.routes.set(`GET ${historyPath}`, {
      status: 200,
      body: () => (accepted() ? [entry] : []),
    });

    await renderSharedWorld(mintingSession());
    await screen.findByText("The Salt Road");
    await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));

    expect(await screen.findByText("What should we remember together?")).toBeInTheDocument();
    const ask = await screen.findByRole("textbox", { name: "Ask Hob" });
    await userEvent.type(ask, "Remember the night the lanterns failed.{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Add to Chronicle" }));

    // The keep is what refreshes the Chronicle: the screen read it once on the
    // way in, nothing re-read it before the accept, and a read follows the
    // accept and draws the entry only that read can return.
    //
    // Reads *after* the accept are counted as "at least one", not "exactly one",
    // on purpose. One invalidation can refresh an atom twice when the runner is
    // starved: measured under single-core contention, a single invalidation of
    // this key refreshed both the history and the summary atoms twice while the
    // Chronicle mounted once. That is the atom library's reactivity wiring, not
    // this screen, and a count that includes it fails on load rather than on a
    // regression.
    const historyReads = (calls: typeof server.calls) =>
      calls.filter((call) => call.method === "GET" && call.pathname === historyPath);
    const acceptAt = () =>
      server.calls.findIndex((call) => call.method === "POST" && call.pathname === acceptPath);
    await waitFor(() => expect(acceptAt()).toBeGreaterThanOrEqual(0));
    await waitFor(() =>
      expect(historyReads(server.calls.slice(acceptAt() + 1)).length).toBeGreaterThanOrEqual(1),
    );
    expect(historyReads(server.calls.slice(0, acceptAt()))).toHaveLength(1);
    expect(
      await within(screen.getByRole("region", { name: "Chronicle" })).findByText(
        "Every lantern went dark on the same night.",
      ),
    ).toBeInTheDocument();
  });
});

describe("a Shared World's cover", () => {
  // The polling tests wait on the real two-second timer, so they give the
  // re-read far more than one period to land on a loaded runner.
  const covers = () => document.querySelectorAll("[data-slot=hob-cover]");

  const listWith = (over: object) => ({
    status: 200,
    body: [
      {
        sharedWorld: { ...sharedWorldDetails, ...over },
        isOwner: true,
        joinedAt: campaign.createdAt,
      },
    ],
  });
  const worldWith = (over: object) => ({ status: 200, body: { ...sharedWorldDetails, ...over } });

  it("heads a world's card on the list with its cover", async () => {
    server.routes.set("GET /worlds", listWith({ image: drawnWorldCover }));
    await renderCampaigns("/worlds", mintingSession());
    await screen.findByText("The Salt Company");
    expect(covers()).toHaveLength(1);
    expect(covers()[0]!.querySelector("img")?.getAttribute("src")).toBe(
      apiUrl(drawnWorldCover.cardUrl),
    );
  });

  it("draws a card with no cover exactly as before", async () => {
    await renderCampaigns("/worlds", mintingSession());
    await screen.findByText("The Salt Company");
    expect(covers()).toHaveLength(0);
  });

  it("says Hob is drawing on the list, and re-reads until the cover lands", async () => {
    server.routes.set("GET /worlds", listWith({ imagePending: true }));
    await renderCampaigns("/worlds", mintingSession());
    expect(await screen.findByText("Hob is drawing…")).toHaveAttribute("role", "status");

    server.routes.set("GET /worlds", listWith({ image: drawnWorldCover }));
    await waitFor(() => expect(covers()[0]?.querySelector("img")).toBeTruthy(), {
      timeout: 15_000,
    });
    expect(screen.queryByText("Hob is drawing…")).toBeNull();
  });

  it("puts the cover above the world's own screen, and none on its campaign cards", async () => {
    server.routes.set(`GET /worlds/${worldId}`, worldWith({ image: drawnWorldCover }));
    await renderSharedWorld(mintingSession());
    await screen.findByText("The Salt Road");
    await waitFor(() => expect(covers()).toHaveLength(1));
    expect(covers()[0]!.querySelector("img")?.getAttribute("src")).toBe(
      apiUrl(drawnWorldCover.fullUrl),
    );
    // Above the directory, in the page rather than the sticky chrome.
    const directory = screen.getByRole("region", { name: "Campaigns" });
    expect(
      covers()[0]!.compareDocumentPosition(directory) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("main").contains(covers()[0]!)).toBe(true);
  });

  it("re-reads the world on its screen while its cover is being drawn", async () => {
    server.routes.set(`GET /worlds/${worldId}`, worldWith({ imagePending: true }));
    await renderSharedWorld(mintingSession());
    expect(await screen.findByText("Hob is drawing…")).toHaveAttribute("role", "status");

    server.routes.set(`GET /worlds/${worldId}`, worldWith({ image: drawnWorldCover }));
    await waitFor(() => expect(covers()[0]?.querySelector("img")).toBeTruthy(), {
      timeout: 15_000,
    });
    expect(screen.queryByText("Hob is drawing…")).toBeNull();
  });

  it("draws the world's screen with no cover exactly as before", async () => {
    await renderSharedWorld(mintingSession());
    await screen.findByText("The Salt Road");
    expect(covers()).toHaveLength(0);
  });
});
