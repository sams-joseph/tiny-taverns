import { CampaignId, CharacterId, EncounterRunId, SessionId } from "@taverns/api";
import { Schema } from "effect";
import { useCallback, useEffect, useState } from "react";

/**
 * Where you are, in the URL.
 *
 * The hash rather than a router: this is a static SPA with four screens, and
 * `#/…` needs no history API, no server rewrite rule and no dependency. What it
 * buys is real — a reload keeps you on the campaign you were reading, and a
 * campaign is linkable, which is how you point someone at the thing you are
 * looking at.
 *
 * **The runner names all three ids, and that is what makes a mid-fight reload
 * work.** A laptop lid closes, a browser updates, a tab is restored a day later:
 * the hash alone is enough to find the fight again, with no local state and no
 * "which one was I running?" lookup. It is also the shape the API already has —
 * campaign, session, run — so the route decodes straight into the path params
 * every live endpoint takes.
 */
export type Route =
  | { readonly screen: "campaigns" }
  | { readonly screen: "campaign"; readonly campaignId: CampaignId }
  /**
   * The player side, and the whole of how the role switch is carried.
   *
   * **The mode lives in the URL and nowhere else.** The captain settled the
   * switch as a *mode* rather than a filter — flipping it changes what the app
   * is, not merely which campaigns are listed — and a mode kept in React state
   * beside the route is a second source of truth that can disagree with it: a
   * reload, a bookmark or a link would land on a screen the pill says you are
   * not looking at. Carried here it cannot, because `modeOf` reads the route
   * itself and the pill is two links.
   *
   * It also answers the question a global pill leaves open. *Player* at a table
   * you DM has no meaning; there is no such route to be in. `#/play` is the
   * tables you sit at, and `#/play/campaigns/:c` is one of them — a screen that
   * reads only what a player may read, so nothing on it can 404.
   */
  | { readonly screen: "play" }
  | { readonly screen: "playCampaign"; readonly campaignId: CampaignId }
  /**
   * The record of a table you sit at.
   *
   * **A route of its own rather than `#/campaigns/:c/chronicle` in player
   * mode**, and the reason is the mode itself: `modeOf` reads the route, so a
   * player screen living under the DM's prefix would be a screen the pill says
   * you are not on. It also keeps the two straight in a bookmark — the same
   * campaign has two Chronicles, one wide and one narrow, and which you get is
   * the part of the URL you can read.
   *
   * It names a campaign for the reason the DM's does: `recap.readAsPlayer` and
   * `sessions.list` both hang off `/campaigns/:campaignId`.
   */
  | { readonly screen: "playChronicle"; readonly campaignId: CampaignId }
  /**
   * The characters this account plays, and one of them.
   *
   * **The only pair of routes in the product that names no campaign**, and that
   * is the endpoint's shape rather than a convenience: `GET /me/characters` is
   * the one read on `character` with no campaign in its path, because the
   * question *"which characters are mine"* is asked across every table at once
   * and a player at three tables has one list, not three. The campaign a
   * character belongs to is on the row (`campaignId`), so the screens still know
   * which table each one sits at.
   *
   * The sheet names the character alone for the same reason. `GET /me/campaigns`
   * is what turns that row's `campaignId` into a name — the join key travels,
   * the name is looked up — which is the rule `CampaignMember.accountId` already
   * follows from the other side.
   */
  | { readonly screen: "playCharacters" }
  | { readonly screen: "playCharacter"; readonly characterId: CharacterId }
  /**
   * The bestiary names a campaign, because the API does: `creatures.list` hangs
   * off `/campaigns/:campaignId/creatures`, and that path is the only thing
   * gating the global `system` rows it returns beside the campaign's own. A
   * top-level `#/bestiary` would have no campaign to read *through*.
   */
  | { readonly screen: "bestiary"; readonly campaignId: CampaignId }
  /**
   * The Chronicle names a campaign for the same reason the bestiary does: every
   * source it reads — `sessions.list`, `recap.read`, `search.search` — hangs off
   * `/campaigns/:campaignId`, and on the search endpoint that path is a security
   * property rather than a routing one (see `Api.ts`). A top-level
   * `#/chronicle` would have no campaign whose record to read.
   */
  | { readonly screen: "chronicle"; readonly campaignId: CampaignId }
  /**
   * Who is at the table, which is a question about one table.
   *
   * `members.list`, `invites.list` and `characters.list` all hang off
   * `/campaigns/:campaignId`, and on the first two the path is what the `DmActor`
   * gate is checked against — so, like the bestiary and the Chronicle, there is
   * no campaign-less party to route to.
   */
  | { readonly screen: "party"; readonly campaignId: CampaignId }
  | {
      readonly screen: "run";
      readonly campaignId: CampaignId;
      readonly sessionId: SessionId;
      readonly runId: EncounterRunId;
    }
  /**
   * Following an invitation, before there is anybody to follow it as.
   *
   * **The token lives in the fragment and nowhere else**, which is the whole
   * reason this route exists rather than a query string: a browser never sends
   * the fragment to a server, so the secret stays out of access logs and out of
   * the `Referer` of anything this page links to. The page reads it here and
   * puts it in a `POST` body.
   *
   * It names no campaign, because the holder does not know which one it is yet
   * — that is what the page is for.
   */
  | { readonly screen: "join"; readonly token: string }
  | { readonly screen: "gallery" };

/**
 * An id we did not mint is a bad link, not a crash.
 *
 * The ids are branded UUIDs, so a hand-typed or truncated one has to decode or
 * be refused — and refusing here is what lets `parseRoute` fall back a level
 * rather than throw during render.
 */
const parser = <A>(schema: Schema.Codec<A, string>) => {
  const decode = Schema.decodeSync(schema);
  return (raw: string | undefined): A | undefined => {
    if (raw === undefined || raw === "") return undefined;
    try {
      return decode(raw);
    } catch {
      return undefined;
    }
  };
};

/**
 * An invitation token, as it may appear in a hash.
 *
 * 32 bytes of `randomBytes` in base64url, whose alphabet is exactly this — so a
 * link that lost characters to a chat client's line wrapping is refused here
 * rather than sent to the server to be refused there. The length is not checked:
 * the server's answer is the authority on whether a token is real, and a rule
 * restated in two places is a rule that can disagree with itself.
 */
const parseToken = (raw: string | undefined): string | undefined =>
  raw !== undefined && /^[A-Za-z0-9_-]+$/.test(raw) ? raw : undefined;

const parseCampaignId = parser(CampaignId);
const parseCharacterId = parser(CharacterId);
const parseSessionId = parser(SessionId);
const parseRunId = parser(EncounterRunId);

export const parseRoute = (hash: string): Route => {
  // `section` is whatever follows the campaign's id: `bestiary`, or `sessions`
  // on the way to a fight. Under `#/play` everything shifts one segment right —
  // the mode is the head — so `section` holds the campaign there and
  // `sessionRaw` holds its section. Named for the DM's shape, which is the
  // longer one.
  const [head, campaignRaw, section, sessionRaw, runs, runRaw] = hash
    .replace(/^#\/?/, "")
    .split("/");

  if (head === "gallery") return { screen: "gallery" };

  if (head === "play") {
    // `#/play` is the list; `#/play/campaigns/:c` is one table. A campaign id
    // that does not decode falls back to the player list rather than to the
    // DM's, because the mode is the part of the URL that was legible.
    if (campaignRaw === "campaigns") {
      const campaignId = parseCampaignId(section);
      if (campaignId !== undefined) {
        // A section that does not exist on the player's side falls back to the
        // table itself, which is the same thing a half-typed run link does on
        // the DM's — the part of the URL that was legible still names a screen.
        if (sessionRaw === "chronicle") return { screen: "playChronicle", campaignId };
        return { screen: "playCampaign", campaignId };
      }
    }
    if (campaignRaw === "characters") {
      // A half-typed sheet link still knows it meant the roster, which is the
      // same fall-back-one-level a broken run link takes to its campaign.
      const characterId = parseCharacterId(section);
      return characterId === undefined
        ? { screen: "playCharacters" }
        : { screen: "playCharacter", characterId };
    }
    return { screen: "play" };
  }

  if (head === "join") {
    // `campaignRaw` is the second segment whatever it holds; here it is the
    // token. A malformed one falls through to the campaign list, which is the
    // same thing a half-typed run link does.
    const token = parseToken(campaignRaw);
    if (token !== undefined) return { screen: "join", token };
  }

  if (head === "campaigns") {
    const campaignId = parseCampaignId(campaignRaw);
    if (campaignId !== undefined) {
      if (section === "bestiary") return { screen: "bestiary", campaignId };
      if (section === "chronicle") return { screen: "chronicle", campaignId };
      if (section === "party") return { screen: "party", campaignId };
      if (section === "sessions" && runs === "runs") {
        const sessionId = parseSessionId(sessionRaw);
        const runId = parseRunId(runRaw);
        // A half-typed run link still knows which campaign it meant, so it
        // lands on the campaign rather than all the way back at the list.
        if (sessionId !== undefined && runId !== undefined) {
          return { screen: "run", campaignId, sessionId, runId };
        }
      }
      return { screen: "campaign", campaignId };
    }
  }

  return { screen: "campaigns" };
};

export const hrefFor = (route: Route): string => {
  switch (route.screen) {
    case "gallery":
      return "#/gallery";
    case "play":
      return "#/play";
    case "playCampaign":
      return `#/play/campaigns/${route.campaignId}`;
    case "playChronicle":
      return `#/play/campaigns/${route.campaignId}/chronicle`;
    case "playCharacters":
      return "#/play/characters";
    case "playCharacter":
      return `#/play/characters/${route.characterId}`;
    case "campaign":
      return `#/campaigns/${route.campaignId}`;
    case "bestiary":
      return `#/campaigns/${route.campaignId}/bestiary`;
    case "chronicle":
      return `#/campaigns/${route.campaignId}/chronicle`;
    case "party":
      return `#/campaigns/${route.campaignId}/party`;
    case "join":
      return `#/join/${route.token}`;
    case "run":
      return `#/campaigns/${route.campaignId}/sessions/${route.sessionId}/runs/${route.runId}`;
    default:
      return "#/campaigns";
  }
};

/**
 * Which app you are in: the DM's tool, or the player's.
 *
 * **Derived from the route, never stored beside it.** That is what makes the
 * switch a mode rather than a filter without needing a second piece of state to
 * keep in step — there is one answer, the URL is it, and every screen, every
 * nav item and the pill itself read the same function. A role is otherwise a
 * fact about a *pair* (this account, this campaign), so a mode held globally is
 * under-determined the moment you open a table: reading it off the route means
 * the campaign you are looking at is always the campaign the mode is about.
 *
 * `join` and `gallery` name no mode and answer `dm`. Neither is a DM screen —
 * the invitation page runs before there is anybody to have a role — and the
 * answer only decides which nav they draw.
 */
export type Mode = "dm" | "player";

export const modeOf = (route: Route): Mode =>
  route.screen === "play" ||
  route.screen === "playCampaign" ||
  route.screen === "playChronicle" ||
  route.screen === "playCharacters" ||
  route.screen === "playCharacter"
    ? "player"
    : "dm";

/** The same route on the other side, for the pill. */
export const listFor = (mode: Mode): Route =>
  mode === "player" ? { screen: "play" } : { screen: "campaigns" };

const currentHash = (): string => globalThis.location?.hash ?? "";

/**
 * Routes are the hashes beginning `#/`. Anything else is an in-page anchor.
 *
 * The gallery's section links are plain `href="#foundations"` jumps, and without
 * this rule every one of them would read as "navigate to an unknown route" and
 * throw the reader back to the campaign list mid-scroll. A hash with no leading
 * slash leaves the route exactly where it was, which is what an anchor means.
 */
const isRouteHash = (hash: string): boolean => hash === "" || hash.startsWith("#/");

/** The current route, and a way to change it. Both go through the hash. */
export function useRoute(): readonly [Route, (route: Route) => void] {
  const [route, setRoute] = useState(() => parseRoute(currentHash()));

  useEffect(() => {
    const onHashChange = () => {
      const hash = currentHash();
      if (isRouteHash(hash)) setRoute(parseRoute(hash));
    };
    globalThis.addEventListener("hashchange", onHashChange);
    // The hash may have moved between first render and this effect.
    onHashChange();
    return () => globalThis.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    globalThis.location.hash = hrefFor(next);
  }, []);

  return [route, navigate] as const;
}
