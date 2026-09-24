import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  campaign,
  campaignId,
  sharedWorldDetails,
  installStubServer,
  mintingSession,
  renderCampaigns,
  renderScreen,
} from "./campaign.fixtures";

const server = installStubServer();

/**
 * The campaign's own Shared World control: its Overview's actions menu, since
 * the campaign list's cards carry no controls.
 */
const openWorldControl = async (name: "Connect to Shared World" | "Change Shared World") => {
  await renderScreen(mintingSession());
  await userEvent.click(await screen.findByRole("button", { name: "Campaign actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name }));
  return screen.findByRole("dialog");
};

const openNewCampaign = async () => {
  await userEvent.click(screen.getByRole("button", { name: "New campaign" }));
  return screen.findByRole("dialog", { name: "New campaign" });
};

beforeEach(() => {
  server.reset();
  globalThis.history.replaceState(null, "", "/");
});

describe("the campaign-first home", () => {
  it("lists campaigns directly with this account's relation", async () => {
    await renderCampaigns("/campaigns", mintingSession());

    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.getByText("Created by you")).toBeTruthy();
    expect(screen.getByRole("button", { name: "The Salt Company" }).getAttribute("href")).toBe(
      `/worlds/${sharedWorldDetails.id}`,
    );
    // The whole card opens the campaign through the link on its name; there is
    // no separate Open control.
    expect(screen.getByRole("link", { name: "The Salt Road" }).getAttribute("href")).toBe(
      `/campaigns/${campaignId}`,
    );
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
  });

  it("carries no campaign controls on a card, the creator's included", async () => {
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [
        { campaign, relation: "creator", sharedWorld: null, joinedAt: campaign.createdAt },
        {
          campaign: { ...campaign, id: "2b1f2a1e-0000-4000-8000-00000000c0df", name: "Low Tide" },
          relation: "creator",
          sharedWorld: sharedWorldDetails,
          joinedAt: campaign.createdAt,
        },
      ],
    });
    await renderCampaigns("/campaigns", mintingSession());

    await screen.findByText("Low Tide");
    const grid = screen
      .getByRole("link", { name: "The Salt Road" })
      .closest("[data-slot=card]")!.parentElement!;
    // The world's name is a link to the world; nothing else on a card is one.
    expect(
      within(grid)
        .queryAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["The Salt Company"]);
    for (const name of [
      "Connect to Shared World",
      "Change Shared World",
      "Archive",
      "Delete permanently",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("button", { name: /actions/i })).toBeNull();
  });

  it("shows a campaign's description on its card, and nothing when it has none", async () => {
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [
        {
          campaign: { ...campaign, description: "Caravans cross the white salt flats." },
          relation: "creator",
          sharedWorld: null,
          joinedAt: campaign.createdAt,
        },
        {
          campaign: { ...campaign, id: "2b1f2a1e-0000-4000-8000-00000000c0df", name: "Low Tide" },
          relation: "player",
          sharedWorld: null,
          joinedAt: campaign.createdAt,
        },
      ],
    });
    await renderCampaigns("/campaigns", mintingSession());

    const described = (await screen.findByRole("link", { name: "The Salt Road" })).closest(
      "[data-slot=card]",
    )!;
    expect(described.textContent).toContain("Caravans cross the white salt flats.");
    const bare = screen.getByRole("link", { name: "Low Tide" }).closest("[data-slot=card]")!;
    expect(bare.querySelector("p")).toBeNull();
  });

  it("promotes a standalone campaign into a named Shared World", async () => {
    server.routes.set("GET /worlds", { status: 200, body: [] });
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [{ campaign, relation: "creator", sharedWorld: null, joinedAt: campaign.createdAt }],
    });
    server.routes.set(`POST /campaigns/${campaignId}/shared-world`, {
      status: 200,
      body: { ...sharedWorldDetails, name: "The Roads Between" },
    });
    await openWorldControl("Connect to Shared World");
    await userEvent.type(screen.getByLabelText("Shared World name"), "The Roads Between");
    await userEvent.click(screen.getByRole("button", { name: "Create Shared World" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/shared-world")).toEqual({ name: "The Roads Between" }),
    );
    await waitFor(() =>
      expect(globalThis.location.pathname).toBe(`/worlds/${sharedWorldDetails.id}`),
    );
  });

  it("describes the Shared World a campaign is promoted into", async () => {
    server.routes.set("GET /worlds", { status: 200, body: [] });
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [{ campaign, relation: "creator", sharedWorld: null, joinedAt: campaign.createdAt }],
    });
    server.routes.set(`POST /campaigns/${campaignId}/shared-world`, {
      status: 200,
      body: { ...sharedWorldDetails, name: "The Roads Between" },
    });
    await openWorldControl("Connect to Shared World");
    await userEvent.type(screen.getByLabelText("Shared World name"), "The Roads Between");
    await userEvent.type(screen.getByLabelText("Shared World description"), "Old trade roads.");
    await userEvent.click(screen.getByRole("button", { name: "Create Shared World" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/shared-world")).toEqual({
        name: "The Roads Between",
        description: "Old trade roads.",
      }),
    );
  });

  it("connects a standalone campaign to an existing owned Shared World", async () => {
    const somebodyElsesWorld = {
      ...sharedWorldDetails,
      id: "5a1e2b3c-0000-4000-8000-00000000aaa2",
      name: "Somebody Else's World",
      ownerAccountId: "5a1e2b3c-0000-4000-8000-0000000000ff",
      description: null,
    };
    server.routes.set("GET /worlds", {
      status: 200,
      body: [
        { sharedWorld: sharedWorldDetails, isOwner: true, joinedAt: campaign.createdAt },
        { sharedWorld: somebodyElsesWorld, isOwner: false, joinedAt: campaign.createdAt },
      ],
    });
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [{ campaign, relation: "creator", sharedWorld: null, joinedAt: campaign.createdAt }],
    });
    server.routes.set(`POST /campaigns/${campaignId}/shared-world/connect`, {
      status: 200,
      body: sharedWorldDetails,
    });
    await openWorldControl("Connect to Shared World");
    expect(screen.getByText(/current participants join the Shared World/)).toBeTruthy();
    expect(screen.getByText(/other world members can see its name/)).toBeTruthy();
    expect(
      screen.getByText(/campaign content remains visible only to its participants/),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("combobox", { name: "Existing Shared World" }));
    expect(await screen.findByRole("option", { name: "The Salt Company" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Somebody Else's World" })).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: "The Salt Company" }));
    await userEvent.click(screen.getByRole("button", { name: "Connect campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/shared-world/connect")).toEqual({
        worldId: sharedWorldDetails.id,
      }),
    );
    await waitFor(() =>
      expect(globalThis.location.pathname).toBe(`/worlds/${sharedWorldDetails.id}`),
    );
  });

  it("makes a connected campaign standalone with the consequences stated", async () => {
    const standalone = {
      ...campaign,
      contextId: "5a1e2b3c-0000-4000-8000-00000000c0de",
    };
    server.routes.set(`POST /campaigns/${campaignId}/shared-world/disconnect`, {
      status: 200,
      body: standalone,
    });
    await openWorldControl("Change Shared World");
    expect(screen.getByText(/campaign keeps its content, invitations, Hob/)).toBeTruthy();
    expect(screen.getByText(/History already accepted there stays there/)).toBeTruthy();
    expect(screen.getByText(/everyone remains a member/)).toBeTruthy();
    await userEvent.click(screen.getByRole("combobox", { name: "New Shared World connection" }));
    await userEvent.click(await screen.findByRole("option", { name: "Standalone campaign" }));
    expect(
      screen.getByText(/stop contributing future activity and using Library sources/),
    ).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("existing encounter instances");
    await userEvent.click(screen.getByRole("button", { name: "Make standalone" }));

    await waitFor(() => expect(bodyOf(server, "POST", "/shared-world/disconnect")).toEqual({}));
  });

  it("moves a connected campaign directly to another owned Shared World", async () => {
    const destination = {
      ...sharedWorldDetails,
      id: "5a1e2b3c-0000-4000-8000-00000000aaa3",
      name: "The Second Atlas",
    };
    const somebodyElsesWorld = {
      ...sharedWorldDetails,
      id: "5a1e2b3c-0000-4000-8000-00000000aaa4",
      name: "Somebody Else's Atlas",
      ownerAccountId: "5a1e2b3c-0000-4000-8000-0000000000ff",
      description: null,
    };
    server.routes.set("GET /worlds", {
      status: 200,
      body: [
        { sharedWorld: sharedWorldDetails, isOwner: true, joinedAt: campaign.createdAt },
        { sharedWorld: destination, isOwner: true, joinedAt: campaign.createdAt },
        { sharedWorld: somebodyElsesWorld, isOwner: false, joinedAt: campaign.createdAt },
      ],
    });
    server.routes.set(`POST /campaigns/${campaignId}/shared-world/move`, {
      status: 200,
      body: destination,
    });
    await openWorldControl("Change Shared World");
    expect(screen.queryByRole("button", { name: "Make standalone" })).toBeNull();
    expect(screen.getByText(/Participants join a new destination/)).toBeTruthy();
    expect(screen.getByText(/everyone remains a member/)).toBeTruthy();
    expect(screen.getByText(/History already accepted there stays there/)).toBeTruthy();
    expect(screen.getByText(/switch to the destination world's Library shares/)).toBeTruthy();
    await userEvent.click(screen.getByRole("combobox", { name: "New Shared World connection" }));
    expect(await screen.findByRole("option", { name: "Standalone campaign" })).toBeTruthy();
    expect(await screen.findByRole("option", { name: destination.name })).toBeTruthy();
    expect(screen.queryByRole("option", { name: sharedWorldDetails.name })).toBeNull();
    expect(screen.queryByRole("option", { name: somebodyElsesWorld.name })).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: destination.name }));
    await userEvent.click(screen.getByRole("button", { name: "Move campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/shared-world/move")).toEqual({ worldId: destination.id }),
    );
    await waitFor(() => expect(globalThis.location.pathname).toBe(`/worlds/${destination.id}`));
  });

  it("puts New campaign in the bar and no create form in the body", async () => {
    await renderCampaigns("/campaigns", mintingSession());
    await screen.findByText("The Salt Road");

    // The bar's one primary, and the inline form it replaced is gone.
    expect(screen.getByRole("button", { name: "New campaign" }).classList).toContain("bg-accent");
    expect(screen.queryByLabelText("New campaign name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start a campaign" })).toBeNull();
  });

  it("closes the new campaign dialog on Cancel without writing", async () => {
    await renderCampaigns("/campaigns", mintingSession());
    await screen.findByText("The Salt Road");

    await openNewCampaign();
    await userEvent.type(screen.getByLabelText("New campaign name"), "The Long Winter");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(server.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("keeps the new campaign dialog open and says so when the create fails", async () => {
    server.routes.set("POST /campaigns", { status: 500, body: {} });
    await renderCampaigns("/campaigns", mintingSession());
    await screen.findByText("The Salt Road");

    const dialog = await openNewCampaign();
    expect(
      (within(dialog).getByRole("button", { name: "Start a campaign" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await userEvent.type(screen.getByLabelText("New campaign name"), "The Long Winter");
    await userEvent.click(screen.getByRole("button", { name: "Start a campaign" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That did not save. Try it again.",
    );
    expect(screen.getByLabelText("New campaign name")).toHaveValue("The Long Winter");
    expect(globalThis.location.pathname).toBe("/campaigns");
  });

  it("creates from one name and opens the campaign", async () => {
    server.routes.set("POST /campaigns", { status: 200, body: campaign });
    await renderCampaigns("/campaigns", mintingSession());
    await screen.findByText("The Salt Road");

    await openNewCampaign();
    await userEvent.type(screen.getByLabelText("New campaign name"), "The Long Winter");
    await userEvent.click(screen.getByRole("button", { name: "Start a campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/campaigns")).toEqual({ name: "The Long Winter" }),
    );
    await waitFor(() => expect(globalThis.location.pathname).toBe(`/campaigns/${campaignId}`));
  });

  it("sends the description the form was given, trimmed, and omits a blank one", async () => {
    server.routes.set("POST /campaigns", { status: 200, body: campaign });
    await renderCampaigns("/campaigns", mintingSession());
    await screen.findByText("The Salt Road");

    await openNewCampaign();
    await userEvent.type(screen.getByLabelText("New campaign name"), "The Long Winter");
    await userEvent.type(
      screen.getByLabelText("New campaign description"),
      "  Snow that never ends, and what lives under it.  ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Start a campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/campaigns")).toEqual({
        name: "The Long Winter",
        description: "Snow that never ends, and what lives under it.",
      }),
    );
  });

  it("sends the party name, trimmed, and omits a blank one, as Hob's accept does", async () => {
    server.routes.set("POST /campaigns", { status: 200, body: campaign });
    await renderCampaigns("/campaigns", mintingSession());
    await screen.findByText("The Salt Road");

    await openNewCampaign();
    await userEvent.type(screen.getByLabelText("New campaign name"), "The Long Winter");
    await userEvent.type(screen.getByLabelText("Party name"), "  The Snowbound  ");
    await userEvent.click(screen.getByRole("button", { name: "Start a campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/campaigns")).toEqual({
        name: "The Long Winter",
        partyName: "The Snowbound",
      }),
    );
  });

  it("starts a connected campaign in a Shared World from the primary flow", async () => {
    server.routes.set(`POST /worlds/${sharedWorldDetails.id}/campaigns`, {
      status: 200,
      body: campaign,
    });
    await renderCampaigns("/campaigns", mintingSession());
    await screen.findByText("The Salt Road");

    await openNewCampaign();
    await userEvent.type(screen.getByLabelText("New campaign name"), "The Long Winter");
    await userEvent.click(screen.getByRole("combobox", { name: "Campaign context" }));
    await userEvent.click(await screen.findByRole("option", { name: "The Salt Company" }));
    await userEvent.click(screen.getByRole("button", { name: "Start a campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", `/worlds/${sharedWorldDetails.id}/campaigns`)).toEqual({
        name: "The Long Winter",
      }),
    );
    expect(
      server.calls.some((call) => call.method === "POST" && call.pathname === "/campaigns"),
    ).toBe(false);
    await waitFor(() => expect(globalThis.location.pathname).toBe(`/campaigns/${campaignId}`));
  });

  it("makes the empty state about campaigns rather than containers", async () => {
    server.routes.set("GET /me/campaigns", { status: 200, body: [] });
    await renderCampaigns("/campaigns", mintingSession());

    expect(await screen.findByText("No campaign yet")).toBeTruthy();
    expect(screen.getByText(/follow an invitation/)).toBeTruthy();
    expect(screen.getByText("New campaign", { selector: "em" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Shared Worlds" })).toBeNull();
    expect(screen.queryByText(/group/i)).toBeNull();
  });
});
