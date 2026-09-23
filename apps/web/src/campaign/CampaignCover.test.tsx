import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { CampaignCover } from "./CampaignCover";

/**
 * A campaign's cover: nothing when there is none, a quiet band while Hob draws
 * it, and the picture once it is drawn — on the campaign list's cards and on
 * both projections of a campaign's home page. jsdom loads no image, so `load`
 * and `error` are fired by hand; what a browser draws is not measurable here and
 * is not asserted.
 */

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
  globalThis.location.hash = "";
});
afterEach(() => cleanup());

const covers = () => document.querySelectorAll("[data-slot=campaign-cover]");

describe("CampaignCover", () => {
  it("draws nothing at all when there is no cover and none coming", () => {
    const { container } = render(<CampaignCover image={null} pending={false} shape="card" />);
    expect(container.innerHTML).toBe("");
  });

  it("holds a band that says Hob is drawing while it is pending", () => {
    render(<CampaignCover image={null} pending shape="band" />);
    expect(screen.getByRole("status")).toHaveTextContent("Hob is drawing…");
    expect(document.querySelector("img")).toBeNull();
  });

  it("loads the card size on a card and the full size on a band, decoratively", () => {
    const { container, rerender } = render(
      <CampaignCover image={drawnCover} pending={false} shape="card" />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(apiUrl(drawnCover.cardUrl));
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.className).toContain("object-cover");
    expect(img.className).toContain("opacity-0");
    fireEvent.load(img);
    expect(container.querySelector("img")!.className).toContain("opacity-100");

    rerender(<CampaignCover image={drawnCover} pending={false} shape="band" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(apiUrl(drawnCover.fullUrl));
  });

  it("collapses to the current look when the image fails, and tries a fresh URL", () => {
    const { container, rerender } = render(
      <CampaignCover image={drawnCover} pending={false} shape="card" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.innerHTML).toBe("");

    rerender(
      <CampaignCover
        image={{ ...drawnCover, cardUrl: "/campaign-images/x/card?e=2&s=u" }}
        pending={false}
        shape="card"
      />,
    );
    expect(container.querySelector("img")).not.toBeNull();
  });
});

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
      timeout: 6_000,
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
      timeout: 6_000,
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
