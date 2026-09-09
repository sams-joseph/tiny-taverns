import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  campaign,
  campaignId,
  group,
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
      `/#/worlds/${group.id}`,
    );
    expect(screen.getByRole("button", { name: /Open/ }).getAttribute("href")).toBe(
      `/#/campaigns/${campaignId}`,
    );
  });

  it("promotes a standalone campaign into a named Shared World", async () => {
    server.routes.set("GET /groups", { status: 200, body: [] });
    server.routes.set(`POST /campaigns/${campaignId}/shared-world`, {
      status: 200,
      body: { ...group, name: "The Roads Between", isSharedWorld: true },
    });
    await renderCampaigns("/campaigns", mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Create Shared World" }));
    await userEvent.type(screen.getByLabelText("Shared World name"), "The Roads Between");
    await userEvent.click(screen.getByRole("button", { name: "Create Shared World" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/shared-world")).toEqual({ name: "The Roads Between" }),
    );
    await waitFor(() => expect(globalThis.location.hash).toBe(`#/worlds/${group.id}`));
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

  it("makes the empty state about campaigns rather than containers", async () => {
    server.routes.set("GET /me/campaigns", { status: 200, body: [] });
    await renderCampaigns("/campaigns", mintingSession());

    expect(await screen.findByText("No campaign yet")).toBeTruthy();
    expect(screen.getByText(/follow an invitation/)).toBeTruthy();
    expect(screen.queryByText(/group/i)).toBeNull();
  });
});
