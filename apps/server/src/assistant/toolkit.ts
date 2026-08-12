import {
  type Actor,
  type CampaignId,
  Creature,
  CreatureId,
  CurrentActor,
  NotFound,
  SearchHit,
  SearchSource,
  Session,
  SessionEvent,
  SessionId,
  SessionRecap,
} from "@taverns/api";
import { Effect, Schema } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";
import type { Creatures } from "../repo/Creatures.js";
import type { Recap } from "../repo/Recap.js";
import type { Search } from "../repo/Search.js";
import type { SessionEvents } from "../repo/SessionEvents.js";
import type { Sessions } from "../repo/Sessions.js";

/**
 * What Hob can reach, and the only way it reaches anything.
 *
 * **The repository interface *is* the tool interface.** Every handler below is
 * one call to a shipped repository method — the same method the HTTP group
 * next to it calls — and there is no SQL, no predicate and no privilege
 * anywhere in this directory. `apps/server/test/hob.test.ts` fails if a
 * `` sql` `` template or a `SqlClient` import appears here, in the same spirit
 * as `seam.test.ts` and the identity provider. If Hob ever needs a read the
 * repositories do not expose, the answer is a new repository method, not a
 * query in this file: two search paths over one corpus would become permanent,
 * and the second one is where the visibility seam gets re-derived slightly
 * wrong.
 *
 * ### The campaign is not a parameter, and that is the point
 *
 * No tool here takes a campaign id. The handlers close over the one in the
 * request path (`handlersFor`), so a model that hallucinated another
 * campaign's id has nowhere to put it — the call is not expressible, never
 * mind refused. Underneath that, every method still requires `CurrentActor`
 * and still runs its own `WHERE`, so the credential's own reach applies as
 * well: a campaign-scoped token gets one table, a player gets the `shared`
 * rows, and nothing about being a tool call changes either.
 *
 * ### Failures come back to the model, not to the caller
 *
 * Every tool is `failureMode: "return"`. A `NotFound` — the model guessed a
 * session id, or named a creature this credential may not see — is something
 * Hob should read and say out loud, not something that should tear down a
 * half-written answer. It also means the denial the DM sees is the same
 * `NotFound` the API answers with, rather than a second vocabulary invented
 * for the assistant.
 */

/**
 * How many hits a tool call returns by default.
 *
 * Much smaller than `Search`'s own `DEFAULT_LIMIT` of 50, and for a different
 * consumer: fifty snippets is a results panel a DM scans, and a context window
 * a local model drowns in. This is the assistant's reading policy, not a second
 * search — the query, the predicates and the ordering are all still `Search`'s.
 */
const SEARCH_LIMIT = 8;

/** One page of the log. Enough to answer "what happened", short of a transcript. */
const LOG_LIMIT = 100;

export const SearchCampaign = Tool.make("searchCampaign", {
  description:
    "Search this campaign's record — the DM's prep notes, the beats they jotted " +
    "during play, and the bestiary. Lexical: search for the words the DM would " +
    "have written, especially invented names. Use this before answering anything " +
    "about people, places, things or creatures.",
  parameters: Schema.Struct({
    query: Schema.String.check(Schema.isLengthBetween(1, 200)),
    /** Absent searches everything. */
    source: Schema.optional(SearchSource),
    limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 25 }))),
  }),
  success: Schema.Array(SearchHit),
  failure: NotFound,
  failureMode: "return",
});

export const ListSessions = Tool.make("listSessions", {
  description:
    "List the nights of this campaign, newest number last. Use it to find the " +
    "session id for a recap, or to answer which night something happened on.",
  success: Schema.Array(Session),
  failure: NotFound,
  failureMode: "return",
});

export const ReadRecap = Tool.make("sessionRecap", {
  description:
    "What happened on one night: the fights and who was in them, the DM's beats " +
    "verbatim, the prep they ticked off, and the read-aloud that was attached to " +
    "an encounter that ran. Take the session id from listSessions.",
  parameters: Schema.Struct({ sessionId: SessionId }),
  success: SessionRecap,
  failure: NotFound,
  failureMode: "return",
});

export const GetCreature = Tool.make("getCreature", {
  description:
    "Read one creature's full stat block by id. Take the id from a " +
    "searchCampaign hit whose source is 'creature'.",
  parameters: Schema.Struct({ creatureId: CreatureId }),
  success: Creature,
  failure: NotFound,
  failureMode: "return",
});

export const ReadSessionLog = Tool.make("sessionLog", {
  description:
    "The blow-by-blow combat log of one night, oldest first. Only worth reading " +
    "for a question about the mechanics of a fight — for what happened in the " +
    "story, use sessionRecap.",
  parameters: Schema.Struct({
    sessionId: SessionId,
    /** Exclusive cursor, for reading on past a first page. */
    since: Schema.optional(
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 ** 53 - 1 })),
    ),
  }),
  success: Schema.Array(SessionEvent),
  failure: NotFound,
  failureMode: "return",
});

/**
 * The five reads the assistant plan named, and no sixth.
 *
 * They are the five the reconciliation between this task and the session
 * history work settled on — search, the session list, the recap, a creature and
 * the log — because each is a shipped repository method that already carries
 * the visibility seam. A capability that would need new SQL is a decision for
 * whoever owns the repositories.
 */
export const HobToolkit = Toolkit.make(
  SearchCampaign,
  ListSessions,
  ReadRecap,
  GetCreature,
  ReadSessionLog,
);

/** The repositories a Hob tool call may reach. Read-only, every one. */
export interface HobRepositories {
  readonly search: (typeof Search)["Service"];
  readonly sessions: (typeof Sessions)["Service"];
  readonly recap: (typeof Recap)["Service"];
  readonly creatures: (typeof Creatures)["Service"];
  readonly events: (typeof SessionEvents)["Service"];
}

/**
 * Bind the toolkit to one campaign and one actor.
 *
 * The two arguments are the whole security story, and neither comes from the
 * model: `campaignId` is the path segment the request was routed on, and
 * `actor` is what `Authorization` resolved from the bearer token. Re-providing
 * the actor here rather than letting it be inherited is deliberate — the stream
 * this feeds is consumed after the handler effect has returned, so the request's
 * context is no longer ambient by the time a tool runs. Naming it explicitly is
 * what makes the actor a captured value rather than a hope.
 */
export const handlersFor = (
  repositories: HobRepositories,
  campaignId: CampaignId,
  actor: Actor,
) => {
  const as = <A, E>(effect: Effect.Effect<A, E, CurrentActor>): Effect.Effect<A, E> =>
    Effect.provideService(effect, CurrentActor, actor);

  return HobToolkit.of({
    searchCampaign: ({ query, source, limit }) =>
      as(
        repositories.search.search(campaignId, {
          q: query,
          source,
          limit: limit ?? SEARCH_LIMIT,
        }),
      ),
    listSessions: () => as(repositories.sessions.list(campaignId)),
    sessionRecap: ({ sessionId }) => as(repositories.recap.read(campaignId, sessionId)),
    getCreature: ({ creatureId }) => as(repositories.creatures.findById(campaignId, creatureId)),
    sessionLog: ({ sessionId, since }) =>
      as(repositories.events.list(campaignId, sessionId, { since, limit: LOG_LIMIT })),
  });
};
