import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CampaignId, CharacterId, EncounterRunId, SessionId } from "@taverns/api";
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
const characterId = Schema.decodeSync(CharacterId)("2b1f2a1e-0000-4000-8000-00000000fade");

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
  playChronicle: { screen: "playChronicle", campaignId },
  playCharacters: { screen: "playCharacters" },
  playCharacter: { screen: "playCharacter", characterId },
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
    for (const route of [everyRoute.play, everyRoute.playCampaign, everyRoute.playChronicle]) {
      const { unmount } = render(
        <AppShell route={route} topBar={<TopBar title="Anything" />}>
          <p>a screen</p>
        </AppShell>,
      );
      expect(screen.queryByRole("button", { name: /Ask Hob/ })).toBeNull();
      // The player nav is the screens that exist, and the DM's gated sections
      // are not among them: `members.list` is behind `DmActor` and a player's
      // projection of a roster is nothing at all.
      const nav = screen.getByRole("navigation", { name: "Sections" });
      expect(within(nav).queryByText("Bestiary")).toBeNull();
      expect(within(nav).queryByText("Party")).toBeNull();
      unmount();
    }
  });

  /**
   * The nav item a screen earns by existing — and the one place a player could
   * be pointed at the DM's wide recap by accident.
   */
  describe("the player's Chronicle item", () => {
    it("appears once the route names a campaign, and points at the player's route", () => {
      renderShell(everyRoute.playCampaign);

      const nav = screen.getByRole("navigation", { name: "Sections" });
      const item = within(nav).getByRole("link", { name: "Chronicle" });
      // `#/play/campaigns/:c/chronicle`, never `#/campaigns/:c/chronicle`:
      // that screen reads `recap.read`, which is behind the `DmActor` gate.
      expect(item.getAttribute("href")).toBe(`#/play/campaigns/${campaignId}/chronicle`);
      expect(item.getAttribute("href")).not.toBe(`#/campaigns/${campaignId}/chronicle`);
    });

    it("is absent from the tables list, which names no campaign", () => {
      renderShell(everyRoute.play);
      const nav = screen.getByRole("navigation", { name: "Sections" });
      expect(within(nav).queryByText("Chronicle")).toBeNull();
    });

    it("is the lit section while it is being read", () => {
      renderShell(everyRoute.playChronicle);
      const nav = screen.getByRole("navigation", { name: "Sections" });
      expect(
        within(nav).getByRole("link", { name: "Chronicle" }).getAttribute("aria-current"),
      ).toBe("page");
      expect(within(nav).getByRole("link", { name: "Tables" }).getAttribute("aria-current")).toBe(
        null,
      );
    });
  });

  it("carries Characters through player mode, and never into the DM's", () => {
    // `GET /me/characters` names no campaign, so unlike Bestiary, Chronicle and
    // Party the item is constant rather than appearing once a table is open.
    for (const route of [
      everyRoute.play,
      everyRoute.playCampaign,
      everyRoute.playCharacters,
      everyRoute.playCharacter,
    ]) {
      const { unmount } = render(
        <AppShell route={route} topBar={<TopBar title="Anything" />}>
          <p>a screen</p>
        </AppShell>,
      );
      const nav = screen.getByRole("navigation", { name: "Sections" });
      expect(within(nav).getByText("Characters").closest("a")?.getAttribute("href")).toBe(
        "#/play/characters",
      );
      unmount();
    }

    renderShell(everyRoute.campaign);
    expect(
      within(screen.getByRole("navigation", { name: "Sections" })).queryByText("Characters"),
    ).toBeNull();
  });

  it("lights Characters from a sheet, because a sheet is within the roster", () => {
    renderShell(everyRoute.playCharacter);
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getByText("Characters").closest("a")?.getAttribute("aria-current")).toBe(
      "page",
    );
    expect(within(nav).getByText("Tables").closest("a")?.getAttribute("aria-current")).toBeNull();
  });

  it("keeps Ask Hob on the DM's side", () => {
    renderShell(everyRoute.campaign);
    expect(screen.getByRole("button", { name: /Ask Hob/ })).toBeTruthy();
  });
});
