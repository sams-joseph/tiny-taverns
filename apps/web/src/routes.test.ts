import { CampaignId, CharacterId, EncounterRunId, SessionId } from "@taverns/api";
import { createHashHistory, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { routeTree } from "./routes";

/**
 * The route table, asked the same questions the hand-rolled parser was asked.
 *
 * **Every assertion below was in `routes.test.ts` before the router landed**,
 * and they are here because they are the contract rather than a description of
 * an implementation: which URL is which screen, which ids it carries, and what
 * a link that was never real falls back to. What changed is only how the
 * question is put — `parseRoute(hash)` became "match this location against the
 * real tree and tell me the leaf", and `hrefFor(route)` became
 * `router.buildLocation`, which is the router's own way of writing a link and
 * the one this app renders through.
 *
 * A memory history rather than the hash history the app runs on: this file is
 * about *which route a path is*, and the fragment is a transport for the path
 * rather than part of it. `test/renderRoute.tsx` uses the real hash history,
 * because what it asserts is `href`s.
 */

const CAMPAIGN_ID = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
const SESSION_ID = Schema.decodeSync(SessionId)("2b1f2a1e-0000-4000-8000-000000000501");
const RUN_ID = Schema.decodeSync(EncounterRunId)("2b1f2a1e-0000-4000-8000-000000000c01");
const CHARACTER_ID = Schema.decodeSync(CharacterId)("2b1f2a1e-0000-4000-8000-000000000901");

const routerAt = (path: string) =>
  createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });

/**
 * Where a path lands: the id of the deepest route that matched, and the params
 * it decoded.
 *
 * The route id is what the old union's `screen` was — one name per screen —
 * and the params are what its payload was. A fall-back shows up as a `$` in
 * that id: `/campaigns/$campaignId/$` is *the campaign*, reached by a URL that
 * named a section under it we do not serve.
 */
const landsOn = (path: string): { readonly at: string; readonly params: unknown } => {
  const router = routerAt(path);
  const matches = router.matchRoutes(router.latestLocation);
  const leaf = matches[matches.length - 1];
  // `_splat` and `*` are the router's own bookkeeping on a splat match, not
  // something a screen reads; dropping them keeps these assertions about ids.
  const { _splat, "*": _star, ...params } = leaf?.params as Record<string, unknown>;
  return { at: leaf?.routeId ?? "", params };
};

/** The link this app would render for a route, which is what a nav item is. */
const linkTo = (
  path: string,
  options: Parameters<ReturnType<typeof routerAt>["buildLocation"]>[0],
) => routerAt(path).buildLocation(options).href;

describe("the route table", () => {
  it("reads a campaign id out of the path", () => {
    expect(landsOn(`/campaigns/${CAMPAIGN_ID}`)).toEqual({
      at: "/campaigns/$campaignId/",
      params: { campaignId: CAMPAIGN_ID },
    });
  });

  it("round-trips every screen through its own link", () => {
    // `buildLocation` is what `Link` renders and what the nav is built from, so
    // this is the same round trip the old `parseRoute(hrefFor(route))` was:
    // build the URL for a screen, and land back on that screen.
    const screens = [
      { to: "/campaigns", at: "/campaigns" },
      { to: "/library", at: "/library" },
      { to: "/gallery", at: "/gallery" },
      {
        to: "/campaigns/$campaignId",
        params: { campaignId: CAMPAIGN_ID },
        at: "/campaigns/$campaignId/",
      },
      {
        to: "/campaigns/$campaignId/bestiary",
        params: { campaignId: CAMPAIGN_ID },
        at: "/campaigns/$campaignId/bestiary",
      },
      {
        to: "/campaigns/$campaignId/chronicle",
        params: { campaignId: CAMPAIGN_ID },
        at: "/campaigns/$campaignId/chronicle",
      },
      {
        to: "/campaigns/$campaignId/party",
        params: { campaignId: CAMPAIGN_ID },
        at: "/campaigns/$campaignId/party",
      },
      {
        to: "/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
        params: { campaignId: CAMPAIGN_ID, sessionId: SESSION_ID, runId: RUN_ID },
        at: "/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
      },
      { to: "/join/$token", params: { token: "aG93LWRvLXlvdS1kbw" }, at: "/join/$token" },
      { to: "/play", at: "/play/" },
      {
        to: "/play/campaigns/$campaignId",
        params: { campaignId: CAMPAIGN_ID },
        at: "/play/campaigns/$campaignId/",
      },
      {
        to: "/play/campaigns/$campaignId/chronicle",
        params: { campaignId: CAMPAIGN_ID },
        at: "/play/campaigns/$campaignId/chronicle",
      },
      { to: "/play/characters", at: "/play/characters/" },
      {
        to: "/play/characters/$characterId",
        params: { characterId: CHARACTER_ID },
        at: "/play/characters/$characterId",
      },
    ] as const;

    for (const screen of screens) {
      const href = linkTo("/", {
        to: screen.to,
        // The union of every screen's params, which is exactly what a
        // heterogeneous list of routes has; `buildLocation` wants the one
        // route's shape and this loop deliberately walks them all.
        params: ("params" in screen ? screen.params : {}) as never,
      });
      const landed = landsOn(href);
      expect({ href, at: landed.at }).toEqual({ href, at: screen.at });
      if ("params" in screen) expect(landed.params).toEqual(screen.params);
    }
  });

  it("carries all three ids for a fight, which is what makes a reload land back in it", () => {
    expect(landsOn(`/campaigns/${CAMPAIGN_ID}/sessions/${SESSION_ID}/runs/${RUN_ID}`)).toEqual({
      at: "/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
      params: { campaignId: CAMPAIGN_ID, sessionId: SESSION_ID, runId: RUN_ID },
    });
  });

  it("carries an invitation token in the fragment, and refuses a mangled one", () => {
    // The fragment is the point, and it is why the whole app is on a hash
    // history: a browser never sends it to a server, so the token stays out of
    // access logs and out of the `Referer` of anything the join page links to.
    // base64url is the alphabet `randomBytes(32)` produces, so a link a chat
    // client wrapped is refused here rather than sent onwards to be refused
    // there.
    expect(landsOn("/join/aG93LWRvLXlvdS1kbw")).toEqual({
      at: "/join/$token",
      params: { token: "aG93LWRvLXlvdS1kbw" },
    });
    expect(landsOn("/join/not a token").at).toBe("/$");
    expect(landsOn("/join").at).toBe("/$");
  });

  it("puts the token in the fragment and nowhere else in the URL", () => {
    // The hash history is the whole of this property, so it is asserted against
    // the real one rather than the memory history the rest of this file uses.
    // Everything before the `#` is the page's own path: no query string, no
    // path segment, nothing a request line or a `Referer` would carry.
    globalThis.location.hash = "";
    const router = createRouter({ routeTree, history: createHashHistory() });
    // `history.createHref` over the built location is exactly what `Link`
    // renders, and what `campaign/InviteDialog.tsx` pastes after the origin.
    const href = router.history.createHref(
      router.buildLocation({ to: "/join/$token", params: { token: "aG93LWRvLXlvdS1kbw" } })
        .publicHref,
    );
    expect(href).toBe("/#/join/aG93LWRvLXlvdS1kbw");
    expect(href.slice(0, href.indexOf("#"))).not.toContain("aG93LWRvLXlvdS1kbw");
  });

  it("hangs the bestiary off a campaign, because the API does", () => {
    // `creatures.list` is `/campaigns/:campaignId/creatures`, and that path is
    // the only thing gating the global `system` rows it returns beside the
    // campaign's own — so there is no campaign-less bestiary to route to.
    expect(landsOn(`/campaigns/${CAMPAIGN_ID}/bestiary`)).toEqual({
      at: "/campaigns/$campaignId/bestiary",
      params: { campaignId: CAMPAIGN_ID },
    });
    expect(landsOn("/campaigns/not-a-uuid/bestiary").at).toBe("/$");
  });

  it("gives the Library a route that names no campaign, because its rows are in none", () => {
    // A Library entity is owned by an account and sits in no campaign, so
    // `libraryRowReadable` composes no campaign gate at all — there is nothing
    // for this URL to carry, and it is the second place in the product (after
    // `/play/characters`) where that is true. The campaign-scoped bestiary above
    // is untouched and still its own screen: it holds that campaign's copies,
    // which is a question the Library cannot be asked. What it lost was its nav
    // item, not its route.
    expect(landsOn("/library")).toEqual({ at: "/library", params: {} });
    expect(landsOn("/library/anything").at).toBe("/$");
  });

  it("hangs the chronicle off a campaign too, for the same reason", () => {
    // Every source it reads — `sessions.list`, `recap.read`, `search.search` —
    // is under `/campaigns/:campaignId`, and on the search endpoint that path is
    // a security property rather than a routing one.
    expect(landsOn(`/campaigns/${CAMPAIGN_ID}/chronicle`)).toEqual({
      at: "/campaigns/$campaignId/chronicle",
      params: { campaignId: CAMPAIGN_ID },
    });
    expect(landsOn("/campaigns/not-a-uuid/chronicle").at).toBe("/$");
    // An unknown section under a real campaign is that campaign, not a 404.
    expect(landsOn(`/campaigns/${CAMPAIGN_ID}/chronicles`)).toEqual({
      at: "/campaigns/$campaignId/$",
      params: { campaignId: CAMPAIGN_ID },
    });
  });

  it("hangs the party off a campaign, because the roster is one table's", () => {
    // `members.list` and `invites.list` are both `/campaigns/:campaignId/…` and
    // both behind the DM gate, which is checked against exactly that path.
    expect(landsOn(`/campaigns/${CAMPAIGN_ID}/party`)).toEqual({
      at: "/campaigns/$campaignId/party",
      params: { campaignId: CAMPAIGN_ID },
    });
    expect(landsOn("/campaigns/not-a-uuid/party").at).toBe("/$");
  });

  it("falls back a level, not all the way, on a half-typed run link", () => {
    // It still knows which campaign was meant, so that is where it lands — the
    // campaign's own splat, which renders the campaign.
    expect(landsOn(`/campaigns/${CAMPAIGN_ID}/sessions/nope/runs/${RUN_ID}`)).toEqual({
      at: "/campaigns/$campaignId/$",
      params: { campaignId: CAMPAIGN_ID },
    });
    expect(landsOn(`/campaigns/${CAMPAIGN_ID}/sessions/${SESSION_ID}`)).toEqual({
      at: "/campaigns/$campaignId/$",
      params: { campaignId: CAMPAIGN_ID },
    });
  });

  it("carries the role switch in the URL, because a mode kept beside it could disagree", () => {
    // The captain settled the switch as a mode rather than a filter, so it
    // changes what the app is. Held in React state it would be a second answer
    // to "which app am I in" beside the URL, and a reload, a bookmark or a
    // shared link would land on a screen the pill says you are not looking at.
    //
    // Under the router the mode is a fact about the *tree*: every player screen
    // is a descendant of `/play`, so being in player mode and being on one of
    // those routes are the same statement. `shell/location.ts` reads it, and
    // `shell/AppShell.test.tsx` pins what the bar does with it.
    expect(landsOn("/play").at).toBe("/play/");
    expect(landsOn(`/play/campaigns/${CAMPAIGN_ID}`)).toEqual({
      at: "/play/campaigns/$campaignId/",
      params: { campaignId: CAMPAIGN_ID },
    });

    const player = [
      "/play",
      `/play/campaigns/${CAMPAIGN_ID}`,
      `/play/campaigns/${CAMPAIGN_ID}/chronicle`,
      "/play/characters",
      `/play/characters/${CHARACTER_ID}`,
    ];
    for (const path of player) expect(landsOn(path).at.startsWith("/play")).toBe(true);

    // Neither names a mode; the answer only decides which nav they draw, and
    // the invitation page runs before there is anybody to have a role at all.
    for (const path of [`/campaigns/${CAMPAIGN_ID}`, "/join/aG93", "/gallery"]) {
      expect(landsOn(path).at.startsWith("/play")).toBe(false);
    }

    expect(linkTo("/", { to: "/play" })).toBe("/play");
    expect(linkTo("/", { to: "/campaigns" })).toBe("/campaigns");
  });

  it("falls back within the mode, not out of it, on a player link it cannot read", () => {
    // The id is what was illegible; the mode was not. Falling back to the DM's
    // list would answer a question the URL did not ask — so every one of these
    // lands on `/play`'s own splat rather than on the root's.
    expect(landsOn("/play/campaigns/not-a-uuid").at).toBe("/play/$");
    expect(landsOn("/play/campaigns").at).toBe("/play/$");
    expect(landsOn("/play/nonsense").at).toBe("/play/$");
    // A half-typed sheet link still knows it meant the roster, which is the
    // same fall-back-one-level a broken run link takes to its campaign.
    expect(landsOn("/play/characters/not-a-uuid").at).toBe("/play/characters/$");
  });

  it("reads the character routes, which name no campaign at all", () => {
    // `GET /me/characters` is the one read on `character` with no campaign in
    // its path, so neither route carries one — the campaign is on the row.
    expect(landsOn("/play/characters").at).toBe("/play/characters/");
    expect(landsOn(`/play/characters/${CHARACTER_ID}`)).toEqual({
      at: "/play/characters/$characterId",
      params: { characterId: CHARACTER_ID },
    });
  });

  it("gives the player's chronicle a route of its own, under the mode", () => {
    // Two Chronicles read one record through two endpoints — `recap.read` is
    // behind the `DmActor` gate, `recap.readAsPlayer` is the narrow one — so
    // which you get has to be the part of the URL you can read. Under the DM's
    // prefix it would also be a screen the pill says you are not on.
    expect(landsOn(`/play/campaigns/${CAMPAIGN_ID}/chronicle`)).toEqual({
      at: "/play/campaigns/$campaignId/chronicle",
      params: { campaignId: CAMPAIGN_ID },
    });
    // The DM's is untouched and still its own screen.
    expect(landsOn(`/campaigns/${CAMPAIGN_ID}/chronicle`).at).toBe(
      "/campaigns/$campaignId/chronicle",
    );
    // An unknown section under a real player campaign is that table, the same
    // fallback the DM's side takes.
    expect(landsOn(`/play/campaigns/${CAMPAIGN_ID}/chronicles`)).toEqual({
      at: "/play/campaigns/$campaignId/$",
      params: { campaignId: CAMPAIGN_ID },
    });
    expect(landsOn("/play/campaigns/not-a-uuid/chronicle").at).toBe("/play/$");
  });

  it("falls back to the list rather than throwing on an id we never minted", () => {
    // The ids are branded UUIDs, so a hand-typed one has to decode or be
    // refused — and `params.parse` returning `false` is what makes the refusal
    // a link that does not match rather than an error boundary mid-render.
    expect(landsOn("/campaigns/not-a-uuid").at).toBe("/$");
    expect(landsOn("/campaigns").at).toBe("/campaigns");
    expect(landsOn("/").at).toBe("/");
  });

  it("refuses a malformed id in every route that carries one", () => {
    // One case per id-bearing route, because each `params.parse` is its own
    // function and a schema swapped for a string in one of them would be
    // invisible everywhere else.
    const malformed = [
      { path: "/campaigns/nope", at: "/$" },
      { path: "/campaigns/nope/bestiary", at: "/$" },
      { path: "/campaigns/nope/chronicle", at: "/$" },
      { path: "/campaigns/nope/party", at: "/$" },
      {
        path: `/campaigns/${CAMPAIGN_ID}/sessions/nope/runs/${RUN_ID}`,
        at: "/campaigns/$campaignId/$",
      },
      {
        path: `/campaigns/${CAMPAIGN_ID}/sessions/${SESSION_ID}/runs/nope`,
        at: "/campaigns/$campaignId/$",
      },
      { path: "/play/campaigns/nope", at: "/play/$" },
      { path: "/play/campaigns/nope/chronicle", at: "/play/$" },
      { path: "/play/characters/nope", at: "/play/characters/$" },
      { path: "/join/not a token", at: "/$" },
    ];
    for (const { path, at } of malformed)
      expect({ path, at: landsOn(path).at }).toEqual({ path, at });
  });

  it("decodes ids into their brands, so a screen never re-decodes one", () => {
    // The branded types are the reason `params.parse` exists rather than a
    // bare regex: what reaches a screen is a `CampaignId`, already decoded
    // through the same schema the API client encodes with.
    const { params } = landsOn(`/campaigns/${CAMPAIGN_ID}/sessions/${SESSION_ID}/runs/${RUN_ID}`);
    expect(
      Schema.decodeUnknownSync(CampaignId)((params as { campaignId: string }).campaignId),
    ).toBe(CAMPAIGN_ID);
  });
});
