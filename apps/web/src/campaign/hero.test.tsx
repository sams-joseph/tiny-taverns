import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  campaign,
  campaignId,
  drawnCover,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  renderScreen,
} from "./campaign.fixtures";

/**
 * The top of the creator's Overview: the cover, and the campaign's header laid
 * over the bottom of it when there is a picture (`CampaignHero.tsx`).
 *
 * jsdom lays nothing out, so the overlap is asserted as what produces it: the
 * cover's `data-picture`, which the header's `group-has-data-picture/hero:`
 * utilities answer. The pixels are the browser's.
 */

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});
afterEach(cleanup);

const withCampaign = (over: object) =>
  server.routes.set(`GET /campaigns/${campaignId}`, {
    status: 200,
    body: { ...campaign, ...over },
  });

const hero = () => document.querySelector<HTMLElement>("[data-slot=campaign-hero]");
const cover = () => hero()?.querySelector("[data-slot=hob-cover]") ?? null;
const overlaps = () => hero()?.matches(":has([data-picture])") ?? false;

const renderHero = async () => {
  await renderScreen(mintingSession());
  return screen.findByRole("heading", { level: 1, name: "The Salt Road" });
};

describe("the Overview's hero", () => {
  it("titles the page with the campaign's name, the one h1 on it", async () => {
    const title = await renderHero();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(hero()?.contains(title)).toBe(true);
    // The display-large step of the one heading recipe, not the tab header's.
    expect(title).toHaveClass("font-display", "@2xl:text-display-l");
    expect(title.closest("[data-slot=page-heading]")).toBeNull();
  });

  it("says whose party it is and how long the table has run, and nothing it cannot know", async () => {
    await renderHero();
    const header = hero()!.querySelector("header")!;
    const meta = header.querySelector("p")!;
    expect(meta).toHaveTextContent("The Gilded Spoon·Since August 2026");
    // No ruleset constant, and no schedule: nothing stores one.
    expect(meta).not.toHaveTextContent(/5e|Thursday/);
  });

  it("leaves the party's name out of the line when there is none", async () => {
    withCampaign({ partyName: null });
    await renderHero();
    expect(hero()!.querySelector("header p")).toHaveTextContent(/^Since August 2026$/);
  });

  it("puts the pitch under the name, at its own measure", async () => {
    withCampaign({ description: "Four strangers walk a salt caravan to the coast." });
    await renderHero();
    const pitch = within(hero()!).getByText("Four strangers walk a salt caravan to the coast.");
    expect(pitch).toHaveClass("max-w-overview-pitch");
    expect(pitch).not.toHaveClass("max-w-measure");
  });

  it("draws no pitch when none was written", async () => {
    await renderHero();
    expect(hero()!.querySelectorAll("header p")).toHaveLength(1);
  });

  it("carries the campaign's own settings as outline buttons, the sharing word legible", async () => {
    await renderHero();
    const header = within(hero()!.querySelector("header")!);

    const invite = header.getByRole("button", { name: "Invite player" });
    const settings = header.getByRole("button", { name: "Settings · Private to you" });
    expect(settings).toHaveTextContent("SettingsPrivate");
    for (const button of [invite, settings]) expect(button).toHaveClass("border-current");
    // The acts that change what the campaign is stay beside Settings.
    expect(header.getByRole("button", { name: "Campaign actions" })).toBeInTheDocument();
    // One peach primary per screen, and it is the campaign row's press.
    expect(
      header.queryAllByRole("button").filter((b) => b.classList.contains("bg-accent")),
    ).toEqual([]);

    await userEvent.click(invite);
    expect(await screen.findByRole("dialog", { name: "Invite a player" })).toBeInTheDocument();
  });

  it("opens the campaign's settings from Settings, and says Shared once it is", async () => {
    withCampaign({ visibility: "shared" });
    await renderHero();
    const settings = screen.getByRole("button", { name: "Settings · Shared with your players" });
    expect(settings).toHaveTextContent("SettingsShared");
    await userEvent.click(settings);
    expect(await screen.findByRole("dialog", { name: "Campaign settings" })).toBeInTheDocument();
  });

  it("lays the header over a drawn cover", async () => {
    withCampaign({ image: drawnCover });
    await renderHero();
    await waitFor(() => expect(cover()).toHaveAttribute("data-picture"));
    expect(overlaps()).toBe(true);
    const header = hero()!.querySelector("header")!;
    expect(header).toHaveClass(
      "group-has-data-picture/hero:-mt-overview-overlap",
      "group-has-data-picture/hero:px-6",
    );
    // The picture's bottom fades into the page under the header.
    expect(cover()!.querySelector(".bg-linear-to-t")).toHaveClass("from-surface-page");
    expect(cover()).toHaveClass("h-overview-cover");
  });

  it("sits flat with no cover", async () => {
    await renderHero();
    expect(cover()).toBeNull();
    expect(overlaps()).toBe(false);
  });

  it("sits flat under the band while Hob is drawing, and keeps its badge clear", async () => {
    withCampaign({ imagePending: true });
    await renderHero();
    expect(within(hero()!).getByText("Hob is drawing…")).toHaveAttribute("role", "status");
    expect(cover()).not.toHaveAttribute("data-picture");
    expect(overlaps()).toBe(false);
  });

  it("drops to flat when the cover will not load", async () => {
    withCampaign({ image: drawnCover });
    await renderHero();
    await waitFor(() => expect(overlaps()).toBe(true));
    fireEvent.error(cover()!.querySelector("img")!);
    await waitFor(() => expect(cover()).toBeNull());
    expect(overlaps()).toBe(false);
  });

  it("shares the body's centred width, so its left edge is the columns'", async () => {
    await renderHero();
    const page = hero()!.parentElement!;
    expect(page).toHaveClass("mx-auto", "max-w-overview");
    expect(within(page).getByRole("link", { name: "Manage party" })).toBeInTheDocument();
  });
});
