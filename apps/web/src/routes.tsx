import { CampaignId, CharacterId, EncounterRunId, GroupId, SessionId } from "@taverns/api";
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Schema } from "effect";
import { LibraryScreen } from "./bestiary/LibraryScreen";
import { CampaignRouteScreen } from "./campaign/CampaignRoute";
import { EncountersScreen } from "./campaign/EncountersScreen";
import { NotesScreen } from "./campaign/NotesScreen";
import { CharacterCreateScreen } from "./characters/CharacterCreateScreen";
import { CharacterSheetScreen } from "./characters/CharacterSheetScreen";
import { MyCharactersScreen } from "./characters/MyCharactersScreen";
import { ChronicleRouteScreen } from "./chronicle/ChronicleRoute";
import { CompendiumLibraryScreen } from "./compendium/CompendiumLibraryScreen";
import { EquipmentLibraryScreen } from "./equipment/EquipmentLibraryScreen";
import { Gallery } from "./gallery/Gallery";
import { JoinScreen } from "./join/JoinScreen";
import { MagicItemLibraryScreen } from "./magic-items/MagicItemLibraryScreen";
import { GroupScreen } from "./group/GroupScreen";
import { GroupsScreen } from "./group/GroupsScreen";
import { SignedOutGate } from "./marketing/SignedOutGate";
import { PartyScreen } from "./party/PartyScreen";
import { PlayerTableScreen } from "./play/PlayerTableScreen";
import { OptionLibraryScreen } from "./rules/OptionLibraryScreen";
import { RunScreen } from "./run/RunScreen";
import { SpellLibraryScreen } from "./spells/SpellLibraryScreen";

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
const asGroupId = decoder(GroupId);
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

/**
 * The root, which renders the gate rather than a bare `<Outlet />`.
 *
 * **The marketing homepage is the signed-out view of the app**, so "is there a
 * credential?" is asked once, above every match, instead of by each screen. It
 * has to be *inside* the router rather than around it, because two routes are
 * exempt and one of those exemptions is a security property — see
 * `marketing/SignedOutGate.tsx`, which is where the whole of it is written
 * down, including why `#/join/<token>` may never be swallowed by it.
 */
const rootRoute = createRootRoute({ component: SignedOutGate });

/**
 * The groups this account belongs to — the whole of what `#/` means.
 *
 * The group is the top-level container for connected play, so home is the
 * list of your groups, and a campaign is reached through the group that holds
 * it. There is no `/play` half any more and no mode: the relation is per
 * campaign, derived where the campaign is rendered.
 */
const groupsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/groups",
  component: GroupsScreen,
});

/**
 * One group: its campaign directory, its people, and — as the later stages
 * land — its shared history and its Hob. One `params.parse`, exactly as the
 * campaign's parent does it, so a bad id is a bad link that falls back to the
 * groups list.
 */
const groupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/groups/$groupId",
  params: {
    parse: ({ groupId }) => {
      const decoded = asGroupId(groupId);
      return decoded === undefined ? false : { groupId: decoded };
    },
  },
});

const groupIndexRoute = createRoute({
  getParentRoute: () => groupRoute,
  path: "/",
  component: GroupScreen,
  remountDeps: ({ params }) => params.groupId,
});

/** An unknown section under a legible group is that group. */
const groupSplatRoute = createRoute({
  getParentRoute: () => groupRoute,
  path: "$",
  component: GroupScreen,
  remountDeps: ({ params }) => params.groupId,
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
  component: CampaignRouteScreen,
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
  component: CampaignRouteScreen,
});

/**
 * The Library: where a monster is authored, and **the first route outside
 * `/characters` that names no campaign.**
 *
 * That is the model's shape rather than a routing preference. Since
 * `0015_library_creatures.ts` a creature can belong to an **account** and sit in
 * no campaign, and `libraryRowReadable` composes no campaign gate at all —
 * uniquely in this product — because there is no membership to check on a row no
 * campaign contains. So there is nothing for this URL to carry, and an account
 * at no table gets its Library rather than a 404: authoring is not an act inside
 * a campaign, so it cannot require one.
 *
 * No `remountDeps`: there is no id for a different one of to exist. What the
 * screen accumulates — the chip vocabulary, and whether the list is empty at all
 * — is about this account, which does not change under it.
 */
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: LibraryScreen,
});

/**
 * The other half of the same shelf: **the classes, races and backgrounds this
 * account has written**, in no campaign either.
 *
 * A second shelf under the global Library destination: the two read different
 * tables through the same predicate, and neither list can ever contain a row of
 * the other's. The global bar therefore stays on *Library* while this screen's
 * own tabs name the shelf.
 *
 * `/library/rules` and not `/library/options`, though the endpoint is
 * `GET /library/options`: the web routes have called this vocabulary *rules*
 * since the campaign screen shipped at `/campaigns/$campaignId/rules`, and one
 * word for one thing across the two levels is worth more than matching the
 * wire.
 *
 * No `remountDeps`, for `libraryRoute`'s reason: there is no id for a different
 * one of to exist.
 */
const libraryRulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/rules",
  component: OptionLibraryScreen,
});

/** The 2014 reference rules and authored rule-section articles. */
const libraryCompendiumRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/compendium",
  component: CompendiumLibraryScreen,
});

/** The spell shelf under the global Library destination. */
const librarySpellsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/spells",
  component: SpellLibraryScreen,
});

/** The mundane equipment shelf under the global Library destination. */
const libraryEquipmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/equipment",
  component: EquipmentLibraryScreen,
});

/** The magic item shelf under the global Library destination. */
const libraryMagicItemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/magic-items",
  component: MagicItemLibraryScreen,
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
  component: ChronicleRouteScreen,
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

/** The player-safe view of a live table, reached only when this account has a seat. */
const playerTableRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "table",
  component: PlayerTableScreen,
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
 * Writing down a character of your own — under the campaign used as creation
 * context, because the campaign is still *step one*: the character row is
 * account-owned and top-level, creation seats it nowhere, but the form and Hob
 * draft against that table's vocabulary and Hob's drafting thread is
 * campaign-scoped (`assistant_thread.campaign_id`). Putting the id in the URL
 * is what makes that choice a thing you can bookmark and reload.
 *
 * Remounted on the campaign: a form half-typed for one table must not survive
 * into another.
 */
const characterCreateRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "characters/new",
  component: CharacterCreateScreen,
  remountDeps: ({ params }) => params.campaignId,
});

/**
 * The characters this account plays, and one of them — top-level, because the
 * endpoint is: `GET /me/characters` is the one read on `character` with no
 * campaign in its path. The question *"which characters are mine"* is asked
 * across every table at once, and a player at three tables has one list.
 *
 * The sheet names the character alone for the same reason. `GET /me/campaigns`
 * is what turns that row's `campaignId` into a name — the join key travels,
 * the name is looked up.
 */
const charactersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters",
});

const charactersIndexRoute = createRoute({
  getParentRoute: () => charactersRoute,
  path: "/",
  component: MyCharactersScreen,
});

/**
 * A half-typed sheet link still knows it meant the roster, which is the same
 * fall-back-one-level a broken run link takes to its campaign.
 */
const charactersSplatRoute = createRoute({
  getParentRoute: () => charactersRoute,
  path: "$",
  component: MyCharactersScreen,
});

const characterRoute = createRoute({
  getParentRoute: () => charactersRoute,
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
 * Anything else is the groups list.
 *
 * The last resort of the fall-back chain, and the reason a mangled id, a
 * mangled invitation token and a URL nobody ever minted all land somewhere
 * usable rather than on a not-found screen: the list is where you go to find
 * what you meant.
 */
const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  component: GroupsScreen,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: GroupsScreen,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  groupsRoute,
  groupRoute.addChildren([groupIndexRoute, groupSplatRoute]),
  libraryRoute,
  libraryRulesRoute,
  libraryCompendiumRoute,
  librarySpellsRoute,
  libraryEquipmentRoute,
  libraryMagicItemsRoute,
  campaignRoute.addChildren([
    campaignIndexRoute,
    encountersRoute,
    notesRoute,
    chronicleRoute,
    partyRoute,
    playerTableRoute,
    characterCreateRoute,
    runRoute,
    campaignSplatRoute,
  ]),
  charactersRoute.addChildren([charactersIndexRoute, characterRoute, charactersSplatRoute]),
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
  groups: groupsRoute,
  group: groupRoute,
  library: libraryRoute,
  libraryRules: libraryRulesRoute,
  librarySpells: librarySpellsRoute,
  libraryEquipment: libraryEquipmentRoute,
  libraryMagicItems: libraryMagicItemsRoute,
  campaign: campaignRoute,
  encounters: encountersRoute,
  notes: notesRoute,
  chronicle: chronicleRoute,
  party: partyRoute,
  characterCreate: characterCreateRoute,
  run: runRoute,
  characters: charactersRoute,
  character: characterRoute,
  join: joinRoute,
  gallery: galleryRoute,
} as const;
