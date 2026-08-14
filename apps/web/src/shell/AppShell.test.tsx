import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CampaignId, CharacterId, EncounterRunId, SessionId } from "@taverns/api";
import type { RouteIds } from "@tanstack/react-router";
import { Schema } from "effect";
import type { routeTree } from "../routes";
import { renderAt } from "../test/renderRoute";

/**
 * The bar, and the one control on it that every screen used to be able to
 * forget.
 *
 * **The guard is the shell's shape, and this file is what says so out loud.**
 * `AppShell` has no `route` prop any more, let alone the `roleSwitch` one it
 * started with: the pill and the nav are drawn from the router, so there is
 * nothing for a new screen to pass and nothing for it to omit. A test that
 * merely walked today's screens would say nothing about tomorrow's — the reason
 * the switch was invisible in the first place is that it was opt-in and eight
 * screens out of nine had not opted in.
 *
 * What is enumerated below is `RouteIds` of the real route tree rather than a
 * hand-written list of screens, and `Record<RouteIds<…>, string | undefined>`
 * is the point: **a new route does not compile until it is listed here with a
 * URL**, so the mode a new screen renders in is a decision somebody makes
 * rather than one that happens to them. It went one better than the old
 * `Record<Route["screen"], Route>` by accident and then on purpose — the splat
 * fall-backs are routes too, and each of them draws a bar.
 *
 * **These render the real screens at real URLs**, with no stub server behind
 * them. That is deliberate: the bar is drawn before anything loads and stays
 * drawn when a load fails, so a screen that cannot reach a server is exactly
 * the case where a DM most needs the nav to still work. It also means this file
 * cannot drift from the route table — there is no second tree here to keep in
 * step.
 */

const campaignId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
const sessionId = Schema.decodeSync(SessionId)("2b1f2a1e-0000-4000-8000-00000000cafe");
const runId = Schema.decodeSync(EncounterRunId)("2b1f2a1e-0000-4000-8000-00000000beef");
const characterId = Schema.decodeSync(CharacterId)("2b1f2a1e-0000-4000-8000-00000000fade");

/**
 * Every route there is, and the URL that reaches it. Exhaustive by type, so a
 * new one lands here.
 *
 * The five the product cannot be *at* — the root, and the four parents that
 * exist only to group a subtree or decode an id — are `undefined`: they render `<Outlet />` and
 * nothing of their own, so there is no bar to assert about. Naming them is
 * still the deliberate edit this record exists to demand.
 */
const everyRoute: Record<RouteIds<typeof routeTree>, string | undefined> = {
  __root__: undefined,
  "/campaigns/$campaignId": undefined,
  "/play": undefined,
  "/play/campaigns/$campaignId": undefined,
  "/play/characters": undefined,

  "/": "/",
  "/$": "/nothing-like-a-route",
  "/campaigns": "/campaigns",
  "/library": "/library",
  "/campaigns/$campaignId/": `/campaigns/${campaignId}`,
  "/campaigns/$campaignId/$": `/campaigns/${campaignId}/a-section-we-do-not-serve`,
  "/campaigns/$campaignId/encounters": `/campaigns/${campaignId}/encounters`,
  "/campaigns/$campaignId/notes": `/campaigns/${campaignId}/notes`,
  "/campaigns/$campaignId/bestiary": `/campaigns/${campaignId}/bestiary`,
  "/campaigns/$campaignId/chronicle": `/campaigns/${campaignId}/chronicle`,
  "/campaigns/$campaignId/party": `/campaigns/${campaignId}/party`,
  "/campaigns/$campaignId/sessions/$sessionId/runs/$runId": `/campaigns/${campaignId}/sessions/${sessionId}/runs/${runId}`,
  "/gallery": "/gallery",
  "/join/$token": "/join/aaaaaaaaaaaaaaaaaaaaaaaa",
  "/play/": "/play",
  "/play/$": "/play/nothing-like-a-route",
  "/play/campaigns/$campaignId/": `/play/campaigns/${campaignId}`,
  "/play/campaigns/$campaignId/$": `/play/campaigns/${campaignId}/a-section-we-do-not-serve`,
  "/play/campaigns/$campaignId/chronicle": `/play/campaigns/${campaignId}/chronicle`,
  "/play/characters/": "/play/characters",
  "/play/characters/$": "/play/characters/not-a-uuid",
  "/play/characters/$characterId": `/play/characters/${characterId}`,
};

/** The routes a reader can actually be at, which is what has a bar. */
const reachable = Object.entries(everyRoute).filter(
  (entry): entry is [string, string] => entry[1] !== undefined,
);

const pill = () => screen.getByLabelText("Role");
/** The global row: everything above a campaign. */
const nav = () => screen.getByRole("navigation", { name: "Sections" });
/** The campaign row, which exists only inside a campaign. */
const campaignNav = () => screen.getByRole("navigation", { name: "This campaign" });
const noCampaignNav = () => screen.queryByRole("navigation", { name: "This campaign" });

afterEach(cleanup);

describe("the shell's top bar", () => {
  it.each(reachable)("carries the role switch at %s", async (_id, path) => {
    await renderAt(path);

    const links = within(pill()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["DM", "Player"]);
    // Two links and no state — that is how a mode survives a reload, a
    // bookmark and a middle click, and it is the same pair on every screen.
    // `/#/…` rather than `#/…` is what `createHashHistory` builds: the page's
    // own path, then the route behind the fragment. See `test/renderRoute.tsx`.
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/#/campaigns", "/#/play"]);
  });

  it("presses the side the URL is actually on", async () => {
    await renderAt(`/campaigns/${campaignId}`);
    expect(within(pill()).getByRole("link", { name: "DM" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(pill()).getByRole("link", { name: "Player" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("presses the player's side inside a player's campaign", async () => {
    await renderAt(`/play/campaigns/${campaignId}`);
    expect(within(pill()).getByRole("link", { name: "Player" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("keeps the DM's chrome off every player route", async () => {
    // The switch reaching every screen must not carry the DM's controls with
    // it. Asking Hob is a write — `HobThreads.start` needs `campaignWritable` —
    // so it stays absent rather than present and failing.
    //
    // Every player route, taken off the record above rather than listed again:
    // a player screen added tomorrow is covered by this the day it is routed.
    const playerRoutes = reachable.filter(([id]) => id.startsWith("/play"));
    expect(playerRoutes).toHaveLength(8);
    for (const [, path] of playerRoutes) {
      await renderAt(path);
      expect(screen.queryByRole("button", { name: /Ask Hob/ })).toBeNull();
      // The player's rows are the screens that exist, and the DM's gated
      // sections are not among them: `members.list` is behind `DmActor` and a
      // player's projection of a roster is nothing at all. Queried across the
      // whole document rather than one row, because the bar has two since the
      // sixth delivery and "absent" has to mean absent from both.
      //
      // **Library is the newest of them and the delivery draws it that way** —
      // its `GLOBAL_PLAYER` has no Library. Its reason is the mode rather than a
      // gate, unlike *Party* above: authoring monsters is not something you do
      // at somebody else's table. See `globalNavFor`.
      expect(screen.queryByRole("link", { name: "Library" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Party" })).toBeNull();
      cleanup();
    }
  });

  /**
   * The nav item a screen earns by existing — and the one place a player could
   * be pointed at the DM's wide recap by accident.
   */
  describe("the player's Chronicle item", () => {
    it("appears once the route names a campaign, and points at the player's route", async () => {
      await renderAt(`/play/campaigns/${campaignId}`);

      const item = within(campaignNav()).getByRole("link", { name: "Chronicle" });
      // `#/play/campaigns/:c/chronicle`, never `#/campaigns/:c/chronicle`:
      // that screen reads `recap.read`, which is behind the `DmActor` gate.
      expect(item.getAttribute("href")).toBe(`/#/play/campaigns/${campaignId}/chronicle`);
      expect(item.getAttribute("href")).not.toBe(`/#/campaigns/${campaignId}/chronicle`);
    });

    it("is absent from the tables list, which names no campaign", async () => {
      await renderAt("/play");
      // Not merely absent from the row — there is **no campaign row at all**,
      // which is the sixth delivery's rule held as a shape: the second row
      // exists exactly when the route names a campaign.
      expect(noCampaignNav()).toBeNull();
      expect(screen.queryByRole("link", { name: "Chronicle" })).toBeNull();
    });

    it("is the lit section while it is being read", async () => {
      await renderAt(`/play/campaigns/${campaignId}/chronicle`);
      expect(
        within(campaignNav()).getByRole("link", { name: "Chronicle" }).getAttribute("aria-current"),
      ).toBe("page");
      expect(within(nav()).getByRole("link", { name: "Tables" }).getAttribute("aria-current")).toBe(
        null,
      );
    });
  });

  it("carries Characters through player mode, and never into the DM's", async () => {
    // `GET /me/characters` names no campaign, so unlike Bestiary, Chronicle and
    // Party the item is constant rather than appearing once a table is open.
    for (const path of [
      "/play",
      `/play/campaigns/${campaignId}`,
      "/play/characters",
      `/play/characters/${characterId}`,
    ]) {
      await renderAt(path);
      expect(within(nav()).getByText("Characters").closest("a")?.getAttribute("href")).toBe(
        "/#/play/characters",
      );
      cleanup();
    }

    await renderAt(`/campaigns/${campaignId}`);
    expect(within(nav()).queryByText("Characters")).toBeNull();
  });

  it("lights Characters from a sheet, because a sheet is within the roster", async () => {
    await renderAt(`/play/characters/${characterId}`);
    expect(within(nav()).getByText("Characters").closest("a")?.getAttribute("aria-current")).toBe(
      "page",
    );
    expect(within(nav()).getByText("Tables").closest("a")?.getAttribute("aria-current")).toBeNull();
  });

  /**
   * The item the sixth delivery asked for, arriving a delivery late because it
   * was waiting for a read rather than for a drawing.
   */
  describe("the Library item", () => {
    it("rides the global row in DM mode, unchanged by where in the app you are", async () => {
      // The whole reason the bar was split: this row is a function of the mode
      // alone, so it does not move as you go in and out of a table.
      for (const path of [
        "/campaigns",
        "/library",
        `/campaigns/${campaignId}`,
        `/campaigns/${campaignId}/notes`,
        `/campaigns/${campaignId}/sessions/${sessionId}/runs/${runId}`,
      ]) {
        await renderAt(path);
        expect(within(nav()).getByRole("link", { name: "Library" }).getAttribute("href")).toBe(
          "/#/library",
        );
        cleanup();
      }
    });

    it("is lit at its own URL, and nothing on the campaign row is", async () => {
      await renderAt("/library");
      expect(
        within(nav()).getByRole("link", { name: "Library" }).getAttribute("aria-current"),
      ).toBe("page");
      expect(
        within(nav()).getByRole("link", { name: "Campaigns" }).getAttribute("aria-current"),
      ).toBeNull();
      expect(noCampaignNav()).toBeNull();
    });

    it("took Bestiary off the campaign row, and left the screen reachable", async () => {
      // *Nothing appears on both rows* — so the item moved rather than being
      // duplicated. The route it used to point at is deliberately still a
      // route (see `routes.tsx`): it is the only answer to "what can **this**
      // campaign reach", and a bookmark to it still lands on a working screen
      // with the way home in the row above.
      await renderAt(`/campaigns/${campaignId}/bestiary`);
      expect(screen.queryByRole("link", { name: "Bestiary" })).toBeNull();
      expect(within(nav()).getByRole("link", { name: "Library" })).toBeTruthy();
      expect(
        within(campaignNav()).getByRole("link", { name: "Overview" }).getAttribute("aria-current"),
      ).toBe("page");
      expect(screen.getByTitle("Campaign home")).toBeTruthy();
    });
  });

  it("keeps Ask Hob on the DM's side", async () => {
    await renderAt(`/campaigns/${campaignId}`);
    expect(screen.getByRole("button", { name: /Ask Hob/ })).toBeTruthy();
  });

  /**
   * A fall-back draws the bar of the screen it fell back *to*, which is the
   * whole point of falling back a level rather than to a not-found page: the
   * part of the URL that was legible still names somewhere you can work.
   */
  it("draws a campaign's bar on a section under it that does not exist", async () => {
    await renderAt(`/campaigns/${campaignId}/a-section-we-do-not-serve`);
    expect(within(campaignNav()).getByText("Encounters")).toBeTruthy();
    expect(within(pill()).getByRole("link", { name: "DM" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  /**
   * The sixth delivery's rule, which is the shape of the bar rather than two
   * lists somebody keeps disjoint: *the thin top row is everything above a
   * campaign, the second row exists only inside one, and nothing appears on
   * both.*
   */
  describe("two tiers", () => {
    it("has no campaign row above a campaign, in either mode", async () => {
      for (const path of ["/campaigns", "/library", "/play", "/play/characters", "/gallery"]) {
        await renderAt(path);
        expect(noCampaignNav()).toBeNull();
        cleanup();
      }
    });

    it("draws the campaign's own screens on the second row, inside one", async () => {
      await renderAt(`/campaigns/${campaignId}`);

      expect(
        within(campaignNav())
          .getAllByRole("link")
          .map((link) => link.textContent),
        // Five, not six: *Bestiary* left this row when *Library* arrived on the
        // one above, which is the delivery's "nothing appears on both rows".
      ).toEqual(["Overview", "Encounters", "Party", "Notes", "Chronicle"]);
      // Every one of them names the campaign, because every endpoint behind
      // them does — which is the same fact that makes the row exist at all.
      for (const link of within(campaignNav()).getAllByRole("link")) {
        expect(link.getAttribute("href")).toContain(`/#/campaigns/${campaignId}`);
      }
    });

    it("gives a player the two screens that exist, and not the gated ones", async () => {
      // *At the table* is drawn by the delivery and has no screen; *My
      // character* is not campaign-scoped here, so it stays on the global row.
      // Each earns its item the day it exists — the rule that keeps *Run* out.
      await renderAt(`/play/campaigns/${campaignId}`);
      expect(
        within(campaignNav())
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(["Overview", "Chronicle"]);
    });

    it("lights nothing on the global row while you are inside a campaign", async () => {
      // **This is "nothing appears on both rows", and it is one value rather
      // than two lists**: there is a single `Section` for the whole bar, so
      // being on a campaign screen and no global item being lit are the same
      // fact. The delivery's own `GlobalItem` works this way.
      await renderAt(`/campaigns/${campaignId}/notes`);

      for (const link of within(nav()).getAllByRole("link")) {
        expect(link.getAttribute("aria-current")).toBeNull();
      }
      expect(
        within(campaignNav()).getByRole("link", { name: "Notes" }).getAttribute("aria-current"),
      ).toBe("page");
    });

    it("lights Overview from a fight, because a fight is within its campaign", async () => {
      // The old "a fight lights Campaigns" rule, one level down — which is
      // where the campaign's own screens live now.
      await renderAt(`/campaigns/${campaignId}/sessions/${sessionId}/runs/${runId}`);
      expect(
        within(campaignNav()).getByRole("link", { name: "Overview" }).getAttribute("aria-current"),
      ).toBe("page");
    });

    it("titles the second row with the campaign, and that is the way home", async () => {
      // The shell builds this link itself — where home is, is a fact about the
      // route — so no screen can point the way back at the wrong one.
      await renderAt(`/campaigns/${campaignId}/bestiary`);
      expect(screen.getByTitle("Campaign home").getAttribute("href")).toBe(
        `/#/campaigns/${campaignId}`,
      );

      cleanup();
      await renderAt(`/play/campaigns/${campaignId}/chronicle`);
      expect(screen.getByTitle("Campaign home").getAttribute("href")).toBe(
        `/#/play/campaigns/${campaignId}`,
      );
    });
  });

  it("stays in player mode on a player link it could not read", async () => {
    // The id was illegible; the mode was not — so the bar is still the
    // player's, and the pill still offers the way back to the DM's side.
    await renderAt("/play/campaigns/not-a-uuid");
    expect(within(pill()).getByRole("link", { name: "Player" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.queryByRole("button", { name: /Ask Hob/ })).toBeNull();
  });
});
