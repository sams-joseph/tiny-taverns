import {
  type Actor,
  type CampaignId,
  Conflict,
  Creature,
  CreatureId,
  CurrentActor,
  Difficulty,
  type HobProposal,
  type HobRosterLine,
  NotFound,
  SearchHit,
  SearchSource,
  Session,
  SessionEvent,
  SessionId,
  SessionRecap,
} from "@taverns/api";
import { Effect, Ref, Schema } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";
import type { Creatures } from "../repo/Creatures.js";
import type { Recap } from "../repo/Recap.js";
import type { Search } from "../repo/Search.js";
import type { SessionEvents } from "../repo/SessionEvents.js";
import type { Sessions } from "../repo/Sessions.js";

/**
 * What Hob can reach, and the only way it reaches anything.
 *
 * **The repository interface *is* the tool interface.** Every read below is
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
 * **Nothing here writes to the campaign, including the three `propose*`
 * tools.** A proposal is stashed in a `Ref` and saved on the conversation turn;
 * a note, a beat or an encounter appears only when a human accepts it, in
 * `repo/Proposals.ts`. There is no write repository in this directory to reach
 * for — which is the captain's *generate with approval* decision made
 * structural rather than remembered.
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
 * The three things Hob may offer to add to the campaign — and *offer* is the
 * whole of what these do.
 *
 * **A propose tool writes nothing.** It stashes what Hob drafted on the turn in
 * flight (`repo/HobThreads.ts` persists it) and hands the model back one
 * sentence, so the model can say something to the DM about it. The row is made
 * later, by `repo/Proposals.ts`, when a human presses *Save to session* — which
 * is the captain's *generate with approval* decision expressed as wiring rather
 * than as a rule: there is no write repository in this directory to misuse.
 *
 * One per accept target, rather than one tool over a tagged union, because a
 * flat parameter object is what a small local model can actually fill in. It is
 * also the honest count: these are three tables, not a proposal framework.
 */
const proposalFailure = Schema.Union([NotFound, Conflict]);

export const ProposeNote = Tool.make("proposeNote", {
  description:
    "Offer the DM a prep note to save — a description, an NPC, a scene, or " +
    "read-aloud text to read out at the table. It is only a suggestion: nothing " +
    "is saved unless the DM accepts it. Write the whole note in `body`; do not " +
    "repeat it in your reply.",
  parameters: Schema.Struct({
    title: Schema.String.check(Schema.isLengthBetween(1, 120)),
    body: Schema.String.check(Schema.isLengthBetween(1, 4000)),
    /** Read-aloud is a kind of note, not a table — see `NoteKind`. */
    readAloud: Schema.optional(Schema.Boolean),
  }),
  success: Schema.String,
  failure: proposalFailure,
  failureMode: "return",
});

export const ProposeBeat = Tool.make("proposeBeat", {
  description:
    "Offer the DM one line recording what just happened at the table, to file " +
    "against tonight's session. Only a suggestion; nothing is saved unless the " +
    "DM accepts it.",
  parameters: Schema.Struct({
    body: Schema.String.check(Schema.isLengthBetween(1, 1000)),
  }),
  success: Schema.String,
  failure: proposalFailure,
  failureMode: "return",
});

export const ProposeEncounter = Tool.make("proposeEncounter", {
  description:
    "Offer the DM an encounter to save, built from creatures that are already " +
    "in this campaign or in the shared bestiary. Find each creature with " +
    "searchCampaign (source 'creature') and use the id from the hit — do not " +
    "invent one, and do not propose a creature you have not found. Only a " +
    "suggestion; nothing is saved unless the DM accepts it.",
  parameters: Schema.Struct({
    name: Schema.String.check(Schema.isLengthBetween(1, 120)),
    /** The DMG band for the whole fight, not a creature's rating. */
    difficulty: Schema.optional(Difficulty),
    tags: Schema.optional(Schema.Array(Schema.String.check(Schema.isLengthBetween(1, 40)))),
    creatures: Schema.Array(
      Schema.Struct({
        creatureId: CreatureId,
        count: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 })),
      }),
    ).check(Schema.isLengthBetween(1, 12)),
  }),
  success: Schema.String,
  failure: proposalFailure,
  failureMode: "return",
});

/**
 * Five reads and three proposals.
 *
 * The reads are the five the reconciliation between this task and the session
 * history work settled on — search, the session list, the recap, a creature and
 * the log — because each is a shipped repository method that already carries
 * the visibility seam. A read that would need new SQL is a decision for whoever
 * owns the repositories.
 *
 * The proposals are the three accept targets and nothing else. Both halves are
 * listed in `apps/server/test/hob.test.ts`, so a ninth tool is a visible edit.
 */
export const HobToolkit = Toolkit.make(
  SearchCampaign,
  ListSessions,
  ReadRecap,
  GetCreature,
  ReadSessionLog,
  ProposeNote,
  ProposeBeat,
  ProposeEncounter,
);

/** The repositories a Hob tool call may reach. **Read-only, every one.** */
export interface HobRepositories {
  readonly search: (typeof Search)["Service"];
  readonly sessions: (typeof Sessions)["Service"];
  readonly recap: (typeof Recap)["Service"];
  readonly creatures: (typeof Creatures)["Service"];
  readonly events: (typeof SessionEvents)["Service"];
}

/**
 * Where a proposal waits until the turn is written down.
 *
 * One per question, and **at most one proposal in it**: a turn produces one
 * thing to accept, because an accept names a turn. A second `propose*` in the
 * same answer is refused rather than silently replacing the first — losing a
 * roster the DM was about to read is worse than telling the model to wait.
 */
export type ProposalSlot = Ref.Ref<HobProposal | undefined>;

const alreadyProposed = new Conflict({
  message:
    "you have already offered the DM something this turn — let them look at it " +
    "before offering anything else",
});

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
  proposal: ProposalSlot,
) => {
  const as = <A, E>(effect: Effect.Effect<A, E, CurrentActor>): Effect.Effect<A, E> =>
    Effect.provideService(effect, CurrentActor, actor);

  /** Takes the slot if it is free, and tells the model what it now has. */
  const offer = (made: HobProposal, said: string) =>
    Effect.gen(function* () {
      if ((yield* Ref.get(proposal)) !== undefined) return yield* alreadyProposed;
      yield* Ref.set(proposal, made);
      return said;
    });

  /**
   * Every creature on a proposed roster, read through the same predicate a
   * bestiary read uses.
   *
   * Two things at once, and both matter. It **validates**: a model that invented
   * an id, or named one from a campaign this credential cannot reach, gets a
   * `NotFound` it can read and correct rather than a card the DM cannot accept.
   * And it **resolves** the display half — the name, the rating and the hit
   * points the card draws — so a proposal is renderable without a read per line
   * at accept time.
   *
   * Duplicates are merged rather than refused: a model naming the same goblin
   * twice means six goblins, and `encounter_creature` is unique per creature.
   */
  const roster = (
    lines: ReadonlyArray<{ readonly creatureId: CreatureId; readonly count: number }>,
  ): Effect.Effect<ReadonlyArray<HobRosterLine>, NotFound> =>
    Effect.gen(function* () {
      const merged = new Map<CreatureId, number>();
      for (const line of lines) {
        merged.set(line.creatureId, (merged.get(line.creatureId) ?? 0) + line.count);
      }
      const resolved: Array<HobRosterLine> = [];
      for (const [creatureId, count] of merged) {
        const creature = yield* as(repositories.creatures.findById(campaignId, creatureId));
        resolved.push({
          creatureId,
          count: Math.min(count, 99),
          name: creature.name,
          cr: creature.cr,
          hp: creature.hp,
        });
      }
      return resolved;
    });

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

    proposeNote: ({ title, body, readAloud }) =>
      offer(
        { target: "note", title, body, kind: readAloud === true ? "read_aloud" : "note" },
        `Offered the DM a note called "${title}". They can save it or discard it; ` +
          "say one short line about it and stop.",
      ),

    proposeBeat: ({ body }) =>
      offer(
        { target: "beat", body },
        "Offered the DM a beat for tonight's session. They can save it or discard " +
          "it; say one short line about it and stop.",
      ),

    proposeEncounter: ({ name, difficulty, tags, creatures }) =>
      Effect.flatMap(roster(creatures), (lines) =>
        offer(
          {
            target: "encounter",
            name,
            difficulty: difficulty ?? null,
            tags: tags ?? [],
            roster: lines,
          },
          `Offered the DM an encounter called "${name}", with ` +
            `${lines.reduce((total, line) => total + line.count, 0)} creatures. They can ` +
            "save it or discard it; say one short line about it and stop — the roster " +
            "is already on their screen.",
        ),
      ),
  });
};
