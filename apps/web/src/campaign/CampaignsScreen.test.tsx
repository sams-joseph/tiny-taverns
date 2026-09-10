import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  campaign,
  campaignId,
  sharedWorldDetails,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  renderCampaigns,
} from "./campaign.fixtures";

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
  globalThis.location.hash = "";
});

describe("the campaign-first home", () => {
  it("lists campaigns directly with this account's relation", async () => {
    await renderCampaigns("/campaigns", mintingSession());

    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.getByText("Created by you")).toBeTruthy();
    expect(screen.getByRole("button", { name: "The Salt Company" }).getAttribute("href")).toBe(
      `/#/worlds/${sharedWorldDetails.id}`,
    );
    expect(screen.getByRole("button", { name: "Open" }).getAttribute("href")).toBe(
      `/#/campaigns/${campaignId}`,
    );
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
    await renderCampaigns("/campaigns", mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Connect to Shared World" }));
    await userEvent.type(screen.getByLabelText("Shared World name"), "The Roads Between");
    await userEvent.click(screen.getByRole("button", { name: "Create Shared World" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/shared-world")).toEqual({ name: "The Roads Between" }),
    );
    await waitFor(() => expect(globalThis.location.hash).toBe(`#/worlds/${sharedWorldDetails.id}`));
  });

  it("connects a standalone campaign to an existing owned Shared World", async () => {
    const somebodyElsesWorld = {
      ...sharedWorldDetails,
      id: "5a1e2b3c-0000-4000-8000-00000000aaa2",
      name: "Somebody Else's World",
      ownerAccountId: "5a1e2b3c-0000-4000-8000-0000000000ff",
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
    await renderCampaigns("/campaigns", mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Connect to Shared World" }));
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
    await waitFor(() => expect(globalThis.location.hash).toBe(`#/worlds/${sharedWorldDetails.id}`));
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
    await renderCampaigns("/campaigns", mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Make standalone" }));
    expect(screen.getByText(/campaign, its participants, invitations, and Hob/)).toBeTruthy();
    expect(screen.getByText(/History already accepted.*stays in that Shared World/)).toBeTruthy();
    expect(screen.getByText(/members remain members there/)).toBeTruthy();
    expect(
      screen.getByText(/can no longer use Library sources shared through that world/),
    ).toBeTruthy();
    expect(screen.getByText(/existing encounter instances remain/)).toBeTruthy();
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
    await renderCampaigns("/campaigns", mintingSession());

    await userEvent.click(
      await screen.findByRole("button", { name: "Move to another Shared World" }),
    );
    expect(screen.getByText(/Participants join the destination Shared World/)).toBeTruthy();
    expect(screen.getByText(/everyone remains a member/)).toBeTruthy();
    expect(screen.getByText(/History already accepted there stays there/)).toBeTruthy();
    expect(screen.getByText(/switches to the destination world's Library shares/)).toBeTruthy();
    await userEvent.click(screen.getByRole("combobox", { name: "Destination Shared World" }));
    expect(await screen.findByRole("option", { name: destination.name })).toBeTruthy();
    expect(screen.queryByRole("option", { name: sharedWorldDetails.name })).toBeNull();
    expect(screen.queryByRole("option", { name: somebodyElsesWorld.name })).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: destination.name }));
    await userEvent.click(screen.getByRole("button", { name: "Move campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/shared-world/move")).toEqual({ worldId: destination.id }),
    );
    await waitFor(() => expect(globalThis.location.hash).toBe(`#/worlds/${destination.id}`));
  });

  it("creates from one name and opens the campaign", async () => {
    server.routes.set("POST /campaigns", { status: 200, body: campaign });
    await renderCampaigns("/campaigns", mintingSession());
    await screen.findByText("The Salt Road");

    await userEvent.type(screen.getByLabelText("New campaign name"), "The Long Winter");
    await userEvent.click(screen.getByRole("button", { name: "Start a campaign" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/campaigns")).toEqual({ name: "The Long Winter" }),
    );
    await waitFor(() => expect(globalThis.location.hash).toBe(`#/campaigns/${campaignId}`));
  });

  it("starts a connected campaign in a Shared World from the primary flow", async () => {
    server.routes.set(`POST /worlds/${sharedWorldDetails.id}/campaigns`, {
      status: 200,
      body: campaign,
    });
    await renderCampaigns("/campaigns", mintingSession());
    await screen.findByText("The Salt Road");

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
    await waitFor(() => expect(globalThis.location.hash).toBe(`#/campaigns/${campaignId}`));
  });

  it("makes the empty state about campaigns rather than containers", async () => {
    server.routes.set("GET /me/campaigns", { status: 200, body: [] });
    await renderCampaigns("/campaigns", mintingSession());

    expect(await screen.findByText("No campaign yet")).toBeTruthy();
    expect(screen.getByText(/follow an invitation/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Shared World The Salt Company" })).toBeTruthy();
    expect(screen.queryByText(/group/i)).toBeNull();
  });
});
