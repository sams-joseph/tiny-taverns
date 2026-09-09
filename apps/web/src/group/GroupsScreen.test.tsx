import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  campaign,
  campaignId,
  group,
  groupId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  renderCampaigns,
  renderGroup,
} from "../campaign/campaign.fixtures";

/**
 * The way in, under the group architecture: home is the groups you belong to,
 * and one group's screen is its campaign directory and its people.
 *
 * What replaced the old campaign list's role filter is the **relation on each
 * card**: `Created by you`, `Playing`, or a plain group campaign — a member
 * sees that a campaign exists and who runs it, and gets no way in until its
 * creator seats them. That last card is the participation decision on screen.
 */

const server = installStubServer();
installMemoryStorage();

const aimDirectory = (relation: "creator" | "player" | "none") =>
  server.routes.set(`GET /groups/${groupId}/campaigns`, {
    status: 200,
    body: [
      {
        id: campaignId,
        groupId,
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

describe("the groups list", () => {
  it("lists the groups this account belongs to, and opens one", async () => {
    await renderCampaigns("/groups", mintingSession());

    expect(await screen.findByText("The Salt Company")).toBeTruthy();
    // The owner's own group says so; a group you were invited into would not.
    expect(screen.getByText("Yours")).toBeTruthy();
    const open = screen.getByRole("button", { name: /Open/ });
    expect(open.getAttribute("href")).toBe(`/#/worlds/${groupId}`);
  });

  it("founds a group with one field, and re-reads the list", async () => {
    server.routes.set("POST /groups", { status: 200, body: group });
    await renderCampaigns("/groups", mintingSession());
    await screen.findByText("The Salt Company");

    await userEvent.type(screen.getByLabelText("Shared World name"), "The Hag's Bargain Co");
    await userEvent.click(screen.getByRole("button", { name: "Create Shared World" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/groups")).toEqual({ name: "The Hag's Bargain Co" }),
    );
  });

  it("says what an empty list means, without a mode to blame", async () => {
    server.routes.set("GET /groups", { status: 200, body: [] });
    await renderCampaigns("/groups", mintingSession());

    expect(await screen.findByText("No Shared World yet")).toBeTruthy();
    expect(screen.getByText(/share history and Hob's memory/)).toBeTruthy();
  });
});

describe("one group's screen", () => {
  it("draws the directory with this reader's relation on each card", async () => {
    await renderGroup(mintingSession());

    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.getByText("Created by you")).toBeTruthy();
    expect(screen.getByText("Run by Wren Alderby")).toBeTruthy();
  });

  it("offers no way into a campaign this member does not participate in", async () => {
    // The participation decision on screen: the card names the campaign and
    // who runs it, and a link that lands on a 404 is worse than none.
    aimDirectory("none");
    await renderGroup(mintingSession());

    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open/ })).toBeNull();
    expect(screen.getByText("The Salt Road").closest("a")).toBeNull();
  });

  it("links a card you play at to the same campaign URL its creator uses", async () => {
    aimDirectory("player");
    await renderGroup(mintingSession());

    expect(await screen.findByText("Playing")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open/ }).getAttribute("href")).toBe(
      `/#/campaigns/${campaignId}`,
    );
  });

  it("starts a campaign in this group, and the founder runs it", async () => {
    server.routes.set(`POST /groups/${groupId}/campaigns`, { status: 200, body: campaign });
    await renderGroup(mintingSession());
    await screen.findByText("The Salt Road");

    await userEvent.type(screen.getByLabelText("New campaign name"), "The Long Winter");
    await userEvent.click(screen.getByRole("button", { name: "Start a campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", `/groups/${groupId}/campaigns`)).toEqual({
        name: "The Long Winter",
      }),
    );
  });

  it("keeps the roster informational and leaves onboarding with campaigns", async () => {
    await renderGroup(mintingSession());

    expect(await screen.findByText("Wren Alderby")).toBeTruthy();
    expect(screen.getByText("Owner")).toBeTruthy();
    // Campaign links are the one onboarding act. The Shared World is context,
    // so it neither offers a competing invitation nor a broad removal that
    // could silently affect several tables.
    expect(screen.queryByRole("button", { name: /Invite/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    // With no owner-only chrome left, the screen no longer asks who the
    // current account is; group reach has already been proven by each read.
    expect(server.calls.some((call) => call.method === "GET" && call.pathname === "/me")).toBe(
      false,
    );
  });
});
