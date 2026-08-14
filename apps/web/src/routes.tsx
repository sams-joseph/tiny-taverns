import { CampaignId, CharacterId, EncounterRunId, SessionId } from "@taverns/api";
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { Schema } from "effect";
import { BestiaryScreen } from "./bestiary/BestiaryScreen";
import { CampaignScreen } from "./campaign/CampaignScreen";
import { CampaignsScreen } from "./campaign/CampaignsScreen";
import { EncountersScreen } from "./campaign/EncountersScreen";
import { NotesScreen } from "./campaign/NotesScreen";
import { CharacterSheetScreen } from "./characters/CharacterSheetScreen";
import { MyCharactersScreen } from "./characters/MyCharactersScreen";
import { ChronicleScreen } from "./chronicle/ChronicleScreen";
import { PlayerChronicleScreen } from "./chronicle/PlayerChronicleScreen";
import { Gallery } from "./gallery/Gallery";
import { JoinScreen } from "./join/JoinScreen";
import { PartyScreen } from "./party/PartyScreen";
import { PlayerCampaignScreen } from "./play/PlayerCampaignScreen";
import { RunScreen } from "./run/RunScreen";

/**
 * Where you are, in the URL — TanStack Router over a hash history.
 *
 * ### It is still the hash, and that is a decision rather than an inheritance
 *
 * **`#/join/<token>` carries a real secret.** A browser never sends the
 * fragment to a server: it is not in the request line, it is not in a redirect,
 * and browsers strip it from the `Referer` of everything the page goes on to
 * load or link to. So an invitation link can be pasted into a chat, opened,
 * and redeemed without the token ever reaching an access log — ours or a CDN's.
 * A query string would put it in every one of those places. That is why the
 * route is shaped this way, and it is the reason the whole app stays on
 * `createHashHistory` rather than the browser history TanStack defaults to:
 * one route needing the fragment is enough, and two history kinds in one app is
 * a second answer to where the URL lives.
 *
 * It costs nothing else. `#/…` needs no server rewrite rule, which is what a
 * static SPA has to arrange for a real path, and a reload still keeps you on
 * the campaign you were reading.
 *
 * **The runner names all three ids, and that is what makes a mid-fight reload
 * work.** A laptop lid closes, a browser updates, a tab is restored a day
 * later: the hash alone finds the fight again, with no local state and no
 * "which one was I running?" lookup. It is also the shape the API already has —
 * campaign, session, run — so the route decodes straight into the path params
 * every live endpoint takes.
 *
 * ### A bad id is a bad link, not a crash
 *
 * The ids are branded UUIDs. `params.parse` decodes each one through its own
 * schema and returns `false` for anything it did not mint, which makes the
 * router **reject that route candidate and keep matching** — so a truncated id
 * falls back to the nearest ancestor that was still legible rather than
 * throwing during render or landing on a not-found page. That is the whole of
 * how `#/campaigns/<bad>` reaches the campaign list and
 * `#/campaigns/<good>/sessions/<bad>/runs/<good>` reaches the campaign: each
 * level that can still be read has a `$` splat child pointing at its own
 * screen, and matching backtracks into it. `routes.test.ts` pins every case.
 *
 * Returning `false` rather than throwing matters: a throw becomes a
 * `PathParamError` on the match, which is an error boundary and a rendered
 * apology. A refusal is a link that was never real.
 */

/**
 * An id we did not mint is a bad link, not a crash.
 *
 * Wraps a branded schema into the shape `params.parse` wants: the decoded
 * value, or `undefined` for the router to turn into `false`.
 */
const decoder = <A,>(schema: Schema.Codec<A, string>) => {
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

const asCampaignId = decoder(CampaignId);
const asCharacterId = decoder(CharacterId);
const asSessionId = decoder(SessionId);
const asRunId = decoder(EncounterRunId);

/**
 * An invitation token, as it may appear in a hash.
 *
 * 32 bytes of `randomBytes` in base64url, whose alphabet is exactly this — so a
 * link that lost characters to a chat client's line wrapping is refused here
 * rather than sent to the server to be refused there. The length is not
 * checked: the server's answer is the authority on whether a token is real, and
 * a rule restated in two places is a rule that can disagree with itself.
 */
const asToken = (raw: string | undefined): string | undefined =>
  raw !== undefined && /^[A-Za-z0-9_-]+$/.test(raw) ? raw : undefined;

const rootRoute = createRootRoute({ component: Outlet });

/**
 * The campaign list, and the whole of what `#/` means.
 *
 * `campaigns` and `play` are one screen answering two questions — which tables
 * I run, and which I sit at — off the one `GET /me/campaigns` that already
 * carries the role. Which question is the route it is reached by, never a prop
 * and never state: see `useMode`.
 */
const campaignsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/campaigns",
  component: CampaignsScreen,
});

/**
 * Everything inside one table.
 *
 * A parent with no component of its own — it renders `<Outlet />` — because
 * there is no chrome shared between a campaign, its bestiary and a fight: each
 * composes its own `AppShell`. What the parent is for is the id: one
 * `params.parse`, so every screen below inherits a decoded `CampaignId` and a
 * bad one is refused once rather than at each of six routes.
 */
const campaignRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/campaigns/$campaignId",
  params: {
    parse: ({ campaignId }) => {
      const decoded = asCampaignId(campaignId);
      return decoded === undefined ? false : { campaignId: decoded };
    },
  },
});

/**
 * The campaign's home — the sixth delivery's `CampOverview`.
 *
 * **The campaign view was one screen with three tabs and is now three
 * destinations**, because the delivery's second nav row is a row of URLs and a
 * tab is not one. `CampaignScreens.jsx` splits it exactly this way, and the
 * split is what the row is for: *Encounters* and *Notes* are places you can be
 * sent, bookmark, reload into and middle-click, none of which a `useState` tab
 * was.
 *
 * The index is the Overview rather than a redirect to Encounters, so the way
 * home the campaign row's title points at lands somewhere that answers *"where
 * were we and what happens when we sit down"*.
 */
const campaignIndexRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "/",
  component: CampaignScreen,
});

/**
 * The encounters built for this table, and the Notes beside them.
 *
 * Both are `remountDeps`-per-campaign for the reason every campaign-scoped
 * screen here is: which row is being edited and what has been searched for
 * belong to the table being read, and none of it may survive into another.
 */
const encountersRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "encounters",
  component: EncountersScreen,
  remountDeps: ({ params }) => params.campaignId,
});

const notesRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "notes",
  component: NotesScreen,
  remountDeps: ({ params }) => params.campaignId,
});

/**
 * A section under a campaign that is not one we serve is that campaign.
 *
 * The splat is what makes "fall back a level" a property of the tree rather
 * than of a hand-written `if`: a rejected id or an unknown section leaves the
 * router backtracking, and this is the nearest candidate that still matches. It
 * is also where a half-typed run link lands — it still knows which campaign was
 * meant, so that is where it goes.
 */
const campaignSplatRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "$",
  component: CampaignScreen,
});

/**
 * The bestiary names a campaign, because the API does: `creatures.list` hangs
 * off `/campaigns/:campaignId/creatures`, and that path is the only thing
 * gating the global `system` rows it returns beside the campaign's own. A
 * top-level `#/bestiary` would have no campaign to read *through*.
 *
 * `remountDeps` is the router's own answer to what `App.tsx` used to spell as a
 * `key`: a different campaign is a different bestiary — the environment chips
 * and the "is this list empty at all" answer are accumulated from what has been
 * read — so the match is remounted rather than re-rendered with new props.
 */
const bestiaryRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "bestiary",
  component: BestiaryScreen,
  remountDeps: ({ params }) => params.campaignId,
});

/**
 * The Chronicle names a campaign for the same reason the bestiary does: every
 * source it reads — `sessions.list`, `recap.read`, `search.search` — hangs off
 * `/campaigns/:campaignId`, and on the search endpoint that path is a security
 * property rather than a routing one (see `Api.ts`).
 *
 * Remounted per campaign: which night is open and what has been searched for
 * belong to the record being read.
 */
const chronicleRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "chronicle",
  component: ChronicleScreen,
  remountDeps: ({ params }) => params.campaignId,
});

/**
 * Who is at the table, which is a question about one table.
 *
 * `members.list`, `invites.list` and `characters.list` all hang off
 * `/campaigns/:campaignId`, and on the first two the path is what the `DmActor`
 * gate is checked against — so, like the bestiary and the Chronicle, there is
 * no campaign-less party to route to. Remounted per campaign: which member's
 * characters are being assigned belongs to the one being read.
 */
const partyRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "party",
  component: PartyScreen,
  remountDeps: ({ params }) => params.campaignId,
});

/**
 * The fight, named by all three ids — see this file's own note on why.
 *
 * Remounted per run: the stream, the log and the optimistic hit points all
 * belong to one fight and none of them may survive into another.
 */
const runRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "sessions/$sessionId/runs/$runId",
  params: {
    parse: ({ sessionId, runId }) => {
      const session = asSessionId(sessionId);
      const run = asRunId(runId);
      return session === undefined || run === undefined
        ? false
        : { sessionId: session, runId: run };
    },
  },
  component: RunScreen,
  remountDeps: ({ params }) => params.runId,
});

/**
 * The player side, and the whole of how the role switch is carried.
 *
 * **The mode lives in the URL and nowhere else.** The captain settled the
 * switch as a *mode* rather than a filter — flipping it changes what the app
 * is, not merely which campaigns are listed — and a mode kept in React state
 * beside the route is a second source of truth that can disagree with it: a
 * reload, a bookmark or a link would land on a screen the pill says you are not
 * looking at. Carried here it cannot, because `useMode` reads the matched
 * routes and the pill is two links.
 *
 * It also answers the question a global pill leaves open. *Player* at a table
 * you DM has no meaning; there is no such route to be in. `#/play` is the
 * tables you sit at, and `#/play/campaigns/:c` is one of them — a screen that
 * reads only what a player may read, so nothing on it can 404.
 *
 * Every player screen is a descendant of this route, which is what makes the
 * mode a fact about the match rather than a list of screen names to keep in
 * step.
 */
const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/play",
});

const playIndexRoute = createRoute({
  getParentRoute: () => playRoute,
  path: "/",
  component: CampaignsScreen,
});

/**
 * Anything under `#/play` we cannot read is still under `#/play`.
 *
 * The id is what was illegible; the mode was not, so falling back to the DM's
 * list would answer a question the URL did not ask.
 */
const playSplatRoute = createRoute({
  getParentRoute: () => playRoute,
  path: "$",
  component: CampaignsScreen,
});

const playCampaignRoute = createRoute({
  getParentRoute: () => playRoute,
  path: "campaigns/$campaignId",
  params: {
    parse: ({ campaignId }) => {
      const decoded = asCampaignId(campaignId);
      return decoded === undefined ? false : { campaignId: decoded };
    },
  },
});

const playCampaignIndexRoute = createRoute({
  getParentRoute: () => playCampaignRoute,
  path: "/",
  component: PlayerCampaignScreen,
  remountDeps: ({ params }) => params.campaignId,
});

const playCampaignSplatRoute = createRoute({
  getParentRoute: () => playCampaignRoute,
  path: "$",
  component: PlayerCampaignScreen,
  remountDeps: ({ params }) => params.campaignId,
});

/**
 * The record of a table you sit at.
 *
 * **A route of its own rather than `#/campaigns/:c/chronicle` in player mode**,
 * and the reason is the mode itself: the mode is read off the match, so a
 * player screen living under the DM's prefix would be a screen the pill says
 * you are not on. It also keeps the two straight in a bookmark — the same
 * campaign has two Chronicles, one wide and one narrow, and which you get is
 * the part of the URL you can read.
 *
 * It names a campaign for the reason the DM's does: `recap.readAsPlayer` and
 * `sessions.list` both hang off `/campaigns/:campaignId`.
 */
const playChronicleRoute = createRoute({
  getParentRoute: () => playCampaignRoute,
  path: "chronicle",
  component: PlayerChronicleScreen,
  remountDeps: ({ params }) => params.campaignId,
});

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
 * is what turns that row's `campaignId` into a name — the join key travels, the
 * name is looked up — which is the rule `CampaignMember.accountId` already
 * follows from the other side.
 */
const playCharactersRoute = createRoute({
  getParentRoute: () => playRoute,
  path: "characters",
});

const playCharactersIndexRoute = createRoute({
  getParentRoute: () => playCharactersRoute,
  path: "/",
  component: MyCharactersScreen,
});

/**
 * A half-typed sheet link still knows it meant the roster, which is the same
 * fall-back-one-level a broken run link takes to its campaign.
 */
const playCharactersSplatRoute = createRoute({
  getParentRoute: () => playCharactersRoute,
  path: "$",
  component: MyCharactersScreen,
});

const playCharacterRoute = createRoute({
  getParentRoute: () => playCharactersRoute,
  path: "$characterId",
  params: {
    parse: ({ characterId }) => {
      const decoded = asCharacterId(characterId);
      return decoded === undefined ? false : { characterId: decoded };
    },
  },
  component: CharacterSheetScreen,
  // A different character is a different sheet: which tab is open belongs to
  // the one being read.
  remountDeps: ({ params }) => params.characterId,
});

/**
 * Following an invitation, before there is anybody to follow it as.
 *
 * **The token lives in the fragment and nowhere else** — see this file's note
 * at the top, which is the whole reason the app is on a hash history. The page
 * reads it here and puts it in a `POST` body.
 *
 * It names no campaign, because the holder does not know which one it is yet —
 * that is what the page is for. Remounted on the token: a second invitation
 * opened in the same tab is a different invitation, and neither its preview nor
 * the "you are in" panel from the first should survive into it.
 */
const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/join/$token",
  params: {
    parse: ({ token }) => {
      const decoded = asToken(token);
      return decoded === undefined ? false : { token: decoded };
    },
  },
  component: JoinScreen,
  remountDeps: ({ params }) => params.token,
});

const galleryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gallery",
  component: Gallery,
});

/**
 * Anything else is the campaign list.
 *
 * The last resort of the fall-back chain, and the reason a mangled campaign id,
 * a mangled invitation token and a URL nobody ever minted all land somewhere
 * usable rather than on a not-found screen. A 404 here would be a worse answer
 * than the list: every one of these is a link that was mistyped or truncated,
 * and the list is where you go to find what you meant.
 */
const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  component: CampaignsScreen,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: CampaignsScreen,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  campaignsRoute,
  campaignRoute.addChildren([
    campaignIndexRoute,
    encountersRoute,
    notesRoute,
    bestiaryRoute,
    chronicleRoute,
    partyRoute,
    runRoute,
    campaignSplatRoute,
  ]),
  playRoute.addChildren([
    playIndexRoute,
    playCampaignRoute.addChildren([
      playCampaignIndexRoute,
      playChronicleRoute,
      playCampaignSplatRoute,
    ]),
    playCharactersRoute.addChildren([
      playCharactersIndexRoute,
      playCharacterRoute,
      playCharactersSplatRoute,
    ]),
    playSplatRoute,
  ]),
  joinRoute,
  galleryRoute,
  catchAllRoute,
]);

/**
 * The one router, on the one history.
 *
 * `createHashHistory` is the decision recorded at the top of this file, not a
 * default. It is also what makes an in-page anchor safe: a hash history parses
 * `#/gallery#foundations` as the route `/gallery` with the fragment
 * `foundations`, so the gallery's specimen links scroll without throwing the
 * reader back to the campaign list — which is what a bare `href="#foundations"`
 * would do, and did before.
 *
 * `scrollRestoration` is what performs that scroll, since the browser's own
 * fragment is the whole of `/gallery#foundations` and matches no element.
 */
export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  scrollRestoration: true,
  defaultPreload: false,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/**
 * The routes the shell needs to name, exported so nothing spells one as a
 * string literal it could get wrong.
 */
export const routes = {
  campaigns: campaignsRoute,
  campaign: campaignRoute,
  encounters: encountersRoute,
  notes: notesRoute,
  bestiary: bestiaryRoute,
  chronicle: chronicleRoute,
  party: partyRoute,
  run: runRoute,
  play: playRoute,
  playCampaign: playCampaignRoute,
  playChronicle: playChronicleRoute,
  playCharacters: playCharactersRoute,
  playCharacter: playCharacterRoute,
  join: joinRoute,
  gallery: galleryRoute,
} as const;
