import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CampaignId, EncounterRunId, SessionId } from "@taverns/api";
import { Schema } from "effect";
import type { Route } from "../routes";
import { AppShell, TopBar } from "./AppShell";

/**
 * The bar, and the one control on it that every screen used to be able to
 * forget.
 *
 * **The guard is the shell's shape, and this file is what says so out loud.**
 * `AppShell` has no `roleSwitch` prop any more: the pill is drawn from
 * `modeOf(route)` exactly as the nav is, so there is nothing for a new screen to
 * pass and nothing for it to omit. A test that merely walked today's screens
 * would say nothing about tomorrow's — the reason the switch was invisible in
 * the first place is that it was opt-in and eight screens out of nine had not
 * opted in.
 *
 * What is enumerated below is the `Route` union rather than the screens, and
 * `Record<Route["screen"], Route>` is the point: a new route member does not
 * compile until it is listed here, so the mode a new screen renders in is a
 * decision somebody makes rather than one that happens to them.
 */

const campaignId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
const sessionId = Schema.decodeSync(SessionId)("2b1f2a1e-0000-4000-8000-00000000cafe");
const runId = Schema.decodeSync(EncounterRunId)("2b1f2a1e-0000-4000-8000-00000000beef");

/** Every screen there is. Exhaustive by type, so a new one lands here. */
const everyRoute: Record<Route["screen"], Route> = {
  campaigns: { screen: "campaigns" },
  campaign: { screen: "campaign", campaignId },
  bestiary: { screen: "bestiary", campaignId },
  chronicle: { screen: "chronicle", campaignId },
  party: { screen: "party", campaignId },
  run: { screen: "run", campaignId, sessionId, runId },
  play: { screen: "play" },
  playCampaign: { screen: "playCampaign", campaignId },
  join: { screen: "join", token: "aaaaaaaaaaaaaaaaaaaaaaaa" },
  gallery: { screen: "gallery" },
};

const renderShell = (route: Route): void => {
  render(
    <AppShell route={route} topBar={<TopBar title="Anything" />}>
      <p>a screen</p>
    </AppShell>,
  );
};

const pill = () => screen.getByLabelText("Role");

describe("the shell's top bar", () => {
  it.each(Object.entries(everyRoute))("carries the role switch on %s", (_screen, route) => {
    renderShell(route);

    const links = within(pill()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["DM", "Player"]);
    // Two links and no state — that is how a mode survives a reload, a
    // bookmark and a middle click, and it is the same pair on every screen.
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["#/campaigns", "#/play"]);
  });

  it("presses the side the URL is actually on", () => {
    renderShell(everyRoute.campaign);
    expect(within(pill()).getByRole("link", { name: "DM" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(pill()).getByRole("link", { name: "Player" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("presses the player's side inside a player's campaign", () => {
    renderShell(everyRoute.playCampaign);
    expect(within(pill()).getByRole("link", { name: "Player" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("keeps the DM's chrome off every player route", () => {
    // The switch reaching every screen must not carry the DM's controls with
    // it. Asking Hob is a write — `HobThreads.start` needs `campaignWritable` —
    // so it stays absent rather than present and failing.
    for (const route of [everyRoute.play, everyRoute.playCampaign]) {
      const { unmount } = render(
        <AppShell route={route} topBar={<TopBar title="Anything" />}>
          <p>a screen</p>
        </AppShell>,
      );
      expect(screen.queryByRole("button", { name: /Ask Hob/ })).toBeNull();
      // The player nav is the screens that exist, and the DM's sections are
      // not among them.
      const nav = screen.getByRole("navigation", { name: "Sections" });
      expect(within(nav).queryByText("Bestiary")).toBeNull();
      expect(within(nav).queryByText("Chronicle")).toBeNull();
      expect(within(nav).queryByText("Party")).toBeNull();
      unmount();
    }
  });

  it("keeps Ask Hob on the DM's side", () => {
    renderShell(everyRoute.campaign);
    expect(screen.getByRole("button", { name: /Ask Hob/ })).toBeTruthy();
  });
});
