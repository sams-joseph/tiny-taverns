import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CampaignId, CharacterId, EncounterRunId, GroupId, SessionId } from "@taverns/api";
import type { RouteIds } from "@tanstack/react-router";
import { Schema } from "effect";
import type { routeTree } from "../routes";
import { renderAt } from "../test/renderRoute";

/**
 * The bar, under the group architecture: one global row for every account, and
 * a campaign row derived from **what this account is at the table** rather
 * than from a global mode.
 *
 * **There is no role switch to test any more, and that is the finding.** The
 * relation is per campaign — `useCampaignRelation`, off the membership read —
 * so the same campaign URL draws creator chrome to its creator and the two
 * player screens to a player, and the global row is the same four items
 * everywhere.
 *
 * What is enumerated below is `RouteIds` of the real route tree rather than a
 * hand-written list of screens, and `Record<RouteIds<…>, string | undefined>`
 * is the point: **a new route does not compile until it is listed here with a
 * URL**, so the chrome a new screen renders is a decision somebody makes
 * rather than one that happens to them.
 *
 * **These render the real screens at real URLs**, with no stub server behind
 * them. The bar is drawn before anything loads and stays drawn when a load
 * fails — `useCampaignRelation` falls back to `creator` on a failed read for
 * exactly that reason: a screen that cannot reach a server is the case where a
 * DM most needs the nav to still work.
 */

const groupId = Schema.decodeSync(GroupId)("2b1f2a1e-0000-4000-8000-00000000aaa1");
const campaignId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
const npcId = "2b1f2a1e-0000-4000-8000-00000000d0c1";
const sessionId = Schema.decodeSync(SessionId)("2b1f2a1e-0000-4000-8000-00000000cafe");
const runId = Schema.decodeSync(EncounterRunId)("2b1f2a1e-0000-4000-8000-00000000beef");
const characterId = Schema.decodeSync(CharacterId)("2b1f2a1e-0000-4000-8000-00000000fade");

/**
 * Every route there is, and the URL that reaches it. Exhaustive by type, so a
 * new one lands here.
 *
 * The parents that exist only to group a subtree or decode an id are
 * `undefined`: they render `<Outlet />` and nothing of their own, so there is
 * no bar to assert about. Naming them is still the deliberate edit this record
 * exists to demand.
 */
const everyRoute: Record<RouteIds<typeof routeTree>, string | undefined> = {
  __root__: undefined,
  "/campaigns/$campaignId": undefined,
  "/groups/$groupId": undefined,
  "/characters": undefined,

  "/": "/",
  "/$": "/nothing-like-a-route",
  "/campaigns": "/campaigns",
  "/worlds": "/worlds",
  "/groups": "/groups",
  "/groups/$groupId/": `/groups/${groupId}`,
  "/groups/$groupId/$": `/groups/${groupId}/a-section-we-do-not-serve`,
  "/worlds/$groupId": `/worlds/${groupId}`,
  "/library": "/library",
  "/library/rules": "/library/rules",
  "/library/compendium": "/library/compendium",
  "/library/spells": "/library/spells",
  "/library/equipment": "/library/equipment",
  "/library/magic-items": "/library/magic-items",
  "/library/npcs": "/library/npcs",
  "/campaigns/$campaignId/": `/campaigns/${campaignId}`,
  "/campaigns/$campaignId/$": `/campaigns/${campaignId}/a-section-we-do-not-serve`,
  "/campaigns/$campaignId/encounters": `/campaigns/${campaignId}/encounters`,
  "/campaigns/$campaignId/notes": `/campaigns/${campaignId}/notes`,
  "/campaigns/$campaignId/cast": `/campaigns/${campaignId}/cast`,
  "/campaigns/$campaignId/cast/follow-up": `/campaigns/${campaignId}/cast/follow-up`,
  "/campaigns/$campaignId/cast/$npcId/talk": `/campaigns/${campaignId}/cast/${npcId}/talk`,
  "/campaigns/$campaignId/cast/$npcId": `/campaigns/${campaignId}/cast/${npcId}`,
  "/campaigns/$campaignId/cast/$": `/campaigns/${campaignId}/cast/not-a-uuid`,
  "/campaigns/$campaignId/chronicle": `/campaigns/${campaignId}/chronicle`,
  "/campaigns/$campaignId/party": `/campaigns/${campaignId}/party`,
  "/campaigns/$campaignId/table": `/campaigns/${campaignId}/table`,
  "/campaigns/$campaignId/characters/new": `/campaigns/${campaignId}/characters/new`,
  "/campaigns/$campaignId/sessions/$sessionId/runs/$runId": `/campaigns/${campaignId}/sessions/${sessionId}/runs/${runId}`,
  "/characters/": "/characters",
  "/characters/$": "/characters/not-a-uuid",
  "/characters/$characterId": `/characters/${characterId}`,
  "/gallery": "/gallery",
  "/join/$token": "/join/aaaaaaaaaaaaaaaaaaaaaaaa",
};

/** The routes a reader can actually be at, which is what has a bar. */
const reachable = Object.entries(everyRoute).filter(
  (entry): entry is [string, string] => entry[1] !== undefined,
);

/** The global row: everything above a campaign. */
const nav = () => screen.getByRole("navigation", { name: "Sections" });
/** The campaign row, which exists only inside a campaign. */
const campaignNav = () => screen.getByRole("navigation", { name: "This campaign" });
const noCampaignNav = () => screen.queryByRole("navigation", { name: "This campaign" });

/**
 * The campaign row's items settle after the membership read does — with no
 * server behind these renders that is the moment the fetch fails and the
 * `creator` fallback applies — so an assertion about them waits.
 */
const campaignItems = () =>
  waitFor(() => {
    const links = within(campaignNav()).getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    return links;
  });

afterEach(cleanup);

describe("the shell's top bar", () => {
  it.each(reachable)("carries the same global row at %s", async (_id, path) => {
    await renderAt(path);

    const links = within(nav()).getAllByRole("link");
    // One row for every account — there is no mode left to branch on, so the
    // four items are the four items everywhere, join page and gallery included.
    expect(links.map((link) => link.textContent)).toEqual([
      "Campaigns",
      "Characters",
      "Library",
      "Components",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/#/campaigns",
      "/#/characters",
      "/#/library",
      "/#/gallery",
    ]);
    // …and no role switch beside them, ever again: the relation is a fact
    // about a pair, read per campaign, and there is nothing global to toggle.
    expect(screen.queryByLabelText("Role")).toBeNull();
  });

  it("lights Characters from a sheet, because a sheet is within the roster", async () => {
    await renderAt(`/characters/${characterId}`);
    expect(within(nav()).getByText("Characters").closest("a")?.getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      within(nav()).getByText("Campaigns").closest("a")?.getAttribute("aria-current"),
    ).toBeNull();
  });

  it("repairs a compatibility group URL and keeps it within Campaigns", async () => {
    await renderAt(`/groups/${groupId}`);
    await waitFor(() => expect(globalThis.location.hash).toBe(`#/worlds/${groupId}`));
    expect(within(nav()).getByText("Campaigns").closest("a")?.getAttribute("aria-current")).toBe(
      "page",
    );
    expect(noCampaignNav()).toBeNull();
  });

  describe("the Library item", () => {
    it("is lit at every Library shelf, with Rules no longer a global peer", async () => {
      for (const path of [
        "/library",
        "/library/rules",
        "/library/spells",
        "/library/equipment",
        "/library/magic-items",
      ]) {
        await renderAt(path);
        expect(
          within(nav()).getByRole("link", { name: "Library" }).getAttribute("aria-current"),
        ).toBe("page");
        expect(
          within(nav()).getByRole("link", { name: "Campaigns" }).getAttribute("aria-current"),
        ).toBeNull();
        expect(within(nav()).queryByRole("link", { name: "Rules" })).toBeNull();
        expect(noCampaignNav()).toBeNull();
        cleanup();
      }
    });

    it("lands an old bestiary bookmark on the campaign, with the Library above", async () => {
      // The campaign corpus routes are gone with the instancing decision of
      // 2026-09-02; a stale bookmark falls through the splat to the campaign
      // it named, and the Library on the global row is where the corpus lives.
      await renderAt(`/campaigns/${campaignId}/bestiary`);
      expect(screen.queryByRole("link", { name: "Bestiary" })).toBeNull();
      expect(within(nav()).getByRole("link", { name: "Library" })).toBeTruthy();
      await waitFor(() =>
        expect(
          within(campaignNav())
            .getByRole("link", { name: "Overview" })
            .getAttribute("aria-current"),
        ).toBe("page"),
      );
      expect(screen.getByTitle("Campaign home")).toBeTruthy();
    });
  });

  it("keeps Ask Hob on the bar above any campaign", async () => {
    await renderAt("/campaigns");
    expect(screen.getByRole("button", { name: /Ask Hob/ })).toBeTruthy();
  });

  /**
   * A fall-back draws the bar of the screen it fell back *to*, which is the
   * whole point of falling back a level rather than to a not-found page.
   */
  it("draws a campaign's bar on a section under it that does not exist", async () => {
    await renderAt(`/campaigns/${campaignId}/a-section-we-do-not-serve`);
    const links = await campaignItems();
    expect(links.map((link) => link.textContent)).toContain("Encounters");
  });

  /**
   * The sixth delivery's rule, which is the shape of the bar rather than two
   * lists somebody keeps disjoint: *the thin top row is everything above a
   * campaign, the second row exists only inside one, and nothing appears on
   * both.*
   */
  describe("two tiers", () => {
    it("has no campaign row above a campaign", async () => {
      for (const path of [
        "/campaigns",
        "/worlds",
        `/worlds/${groupId}`,
        "/library",
        "/library/rules",
        "/library/spells",
        "/library/equipment",
        "/library/magic-items",
        "/characters",
        "/gallery",
      ]) {
        await renderAt(path);
        expect(noCampaignNav()).toBeNull();
        cleanup();
      }
    });

    it("draws the campaign's own screens on the second row, inside one", async () => {
      await renderAt(`/campaigns/${campaignId}`);

      const links = await campaignItems();
      // No corpus screen on this row at all — the instancing decision of
      // 2026-09-02. The Library above holds the originals; what a campaign
      // uses of them shows up inside encounters, fights and the create form.
      expect(links.map((link) => link.textContent)).toEqual([
        "Overview",
        "Encounters",
        "Party",
        "Notes",
        "Cast",
        "Chronicle",
      ]);
      // Every one of them names the campaign, because every endpoint behind
      // them does — which is the same fact that makes the row exist at all.
      for (const link of links) {
        expect(link.getAttribute("href")).toContain(`/#/campaigns/${campaignId}`);
      }
    });

    it("lights nothing on the global row while you are inside a campaign", async () => {
      // **This is "nothing appears on both rows", and it is one value rather
      // than two lists**: there is a single `Section` for the whole bar, so
      // being on a campaign screen and no global item being lit are the same
      // fact.
      await renderAt(`/campaigns/${campaignId}/notes`);

      for (const link of within(nav()).getAllByRole("link")) {
        expect(link.getAttribute("aria-current")).toBeNull();
      }
      await waitFor(() =>
        expect(
          within(campaignNav()).getByRole("link", { name: "Notes" }).getAttribute("aria-current"),
        ).toBe("page"),
      );
    });

    it("lights Overview from a fight, because a fight is within its campaign", async () => {
      await renderAt(`/campaigns/${campaignId}/sessions/${sessionId}/runs/${runId}`);
      await waitFor(() =>
        expect(
          within(campaignNav())
            .getByRole("link", { name: "Overview" })
            .getAttribute("aria-current"),
        ).toBe("page"),
      );
    });

    it("titles the second row with the campaign, and that is the way home", async () => {
      // The shell builds this link itself — where home is, is a fact about the
      // route — so no screen can point the way back at the wrong one. And it
      // is one link now, whatever the reader is at the table: the same URL
      // renders each of them the projection that is theirs.
      await renderAt(`/campaigns/${campaignId}/bestiary`);
      expect(screen.getByTitle("Campaign home").getAttribute("href")).toBe(
        `/#/campaigns/${campaignId}`,
      );
    });
  });
});
