import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiUrl } from "../api/client";
import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import {
  campaign,
  campaignId,
  drawnCover,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  renderCampaigns,
  renderScreen,
} from "./campaign.fixtures";

/**
 * A campaign's cover on the screens that show it: the campaign list's cards and
 * both projections of a campaign's home page. The plate itself is
 * `hob/HobCover.test.tsx`.
 */

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
  globalThis.history.replaceState(null, "", "/");
});
afterEach(() => cleanup());

const covers = () => document.querySelectorAll("[data-slot=hob-cover]");

/**
 * The polling tests wait on the real two-second timer, so they give the re-read
 * far more than one period to land on a loaded runner.
 */

const membershipWith = (over: object, relation: "creator" | "player" = "creator") => ({
  status: 200,
  body: [
    {
      campaign: { ...campaign, ...over },
      relation,
      sharedWorld: null,
      joinedAt: campaign.createdAt,
    },
  ],
});

describe("the campaign list", () => {
  it("heads a campaign's card with its cover", async () => {
    server.routes.set("GET /me/campaigns", membershipWith({ image: drawnCover }));
    await renderCampaigns("/campaigns", mintingSession());
    await screen.findByText("The Salt Road");
    expect(covers()).toHaveLength(1);
    expect(covers()[0]!.querySelector("img")?.getAttribute("src")).toBe(apiUrl(drawnCover.cardUrl));
  });

  it("draws a card with no cover exactly as before", async () => {
    await renderCampaigns("/campaigns", mintingSession());
    await screen.findByText("The Salt Road");
    expect(covers()).toHaveLength(0);
  });

  it("says Hob is drawing, and re-reads until the cover lands", async () => {
    server.routes.set("GET /me/campaigns", membershipWith({ imagePending: true }));
    await renderCampaigns("/campaigns", mintingSession());
    expect(await screen.findByText("Hob is drawing…")).toHaveAttribute("role", "status");

    server.routes.set("GET /me/campaigns", membershipWith({ image: drawnCover }));
    await waitFor(() => expect(covers()[0]?.querySelector("img")).toBeTruthy(), {
      timeout: 15_000,
    });
    expect(screen.queryByText("Hob is drawing…")).toBeNull();
    const reads = server.calls.filter((call) => call.pathname === "/me/campaigns");
    expect(reads.length).toBeGreaterThanOrEqual(2);
  });
});

describe("a campaign's home page", () => {
  it("puts the cover above the creator's Overview", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, image: drawnCover },
    });
    await renderScreen(mintingSession());
    await screen.findByRole("heading", { name: "Overview" });
    await waitFor(() => expect(covers()).toHaveLength(1));
    expect(covers()[0]!.querySelector("img")?.getAttribute("src")).toBe(apiUrl(drawnCover.fullUrl));
  });

  it("re-reads the campaign on the Overview while its cover is being drawn", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, imagePending: true },
    });
    await renderScreen(mintingSession());
    expect(await screen.findByText("Hob is drawing…")).toHaveAttribute("role", "status");

    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, image: drawnCover },
    });
    await waitFor(() => expect(covers()[0]?.querySelector("img")).toBeTruthy(), {
      timeout: 15_000,
    });
  });

  it("draws the Overview with no cover exactly as before", async () => {
    await renderScreen(mintingSession());
    await screen.findByRole("heading", { name: "Overview" });
    expect(covers()).toHaveLength(0);
  });

  it("puts the same cover above the player's page", async () => {
    server.routes.set("GET /me/campaigns", membershipWith({}, "player"));
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, visibility: "shared", image: drawnCover },
    });
    await renderAt(`/campaigns/${campaignId}`, (route) => (
      <HostedSessionScope session={mintingSession()}>{route}</HostedSessionScope>
    ));
    await waitFor(() => expect(covers()).toHaveLength(1));
    expect(covers()[0]!.querySelector("img")?.getAttribute("src")).toBe(apiUrl(drawnCover.fullUrl));
  });
});

describe("a campaign's description", () => {
  const PITCH = "Caravans cross the salt flats between glass storms.";

  it("sits under the cover on the creator's Overview", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, image: drawnCover, description: PITCH },
    });
    await renderScreen(mintingSession());
    const paragraph = await screen.findByText(PITCH);
    await waitFor(() => expect(covers()).toHaveLength(1));
    expect(
      covers()[0]!.compareDocumentPosition(paragraph) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("reaches the player's page", async () => {
    server.routes.set("GET /me/campaigns", membershipWith({}, "player"));
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, visibility: "shared", description: PITCH },
    });
    await renderAt(`/campaigns/${campaignId}`, (route) => (
      <HostedSessionScope session={mintingSession()}>{route}</HostedSessionScope>
    ));
    expect(await screen.findByText(PITCH)).toBeInTheDocument();
  });
});
