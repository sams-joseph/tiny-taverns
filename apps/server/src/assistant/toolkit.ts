import {
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
import { Effect, Ref, Schema, SchemaGetter } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";
import type { Creatures } from "../repo/Creatures.js";
import type { DmActor } from "../repo/DmActor.js";
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

/**
 * How much of the bestiary `listCreatures` reads out.
 *
 * Fifty compact lines is a few hundred tokens — a small local model can hold it
 * and still have room to think — where fifty stat blocks would be most of an
 * 8k window. A campaign with more than this has a bestiary a model should be
 * searching rather than reciting, which is what the tool's description says.
 */
const CREATURE_LIMIT = 50;

/**
 * The words a model writes when it means *nothing here*, for an endpoint that
 * cannot write a real `null`.
 *
 * **Measured, not guessed** (see the Hob reliability notes in AGENTS.md). A
 * chat template whose tool-call format is XML hands llama.cpp untyped parameter
 * *text*, which it then coerces using the published JSON schema. For an
 * integer- or array-typed optional the text `null` parses as JSON `null` and
 * arrives correctly; for a **string-typed** one it stays the string `"null"` —
 * six times out of six on the endpoint the report drove. `proposeEncounter`
 * with `difficulty` left unset produced `"null"` three times and `"None"` once.
 *
 * The list is the vocabulary and its plausible casings, and nothing else. It is
 * safe precisely because it is only ever reached through {@link optional}, and
 * **no optional parameter in this toolkit is free text** — they are two enums,
 * two integers, a boolean and an array of tags. A model that means the literal
 * word "none" as a *value* has nowhere here to say it.
 */
const ABSENT_WORDS = ["", "null", "Null", "NULL", "none", "None", "NONE"] as const;

/**
 * The sentinel arm: any of those words, decoded as the null it stood for.
 *
 * A `Schema.Literals` rather than a bare `Schema.String`, and the difference
 * matters in both directions. The published JSON schema is generated from the
 * *encoded* side of a transformation, so whatever this accepts is what the
 * model is shown — a string arm would widen `source` from an enum to "the enum
 * or any string at all", which both loses the grammar's guidance and would
 * silently swallow a mistyped real value. An enum of seven words says exactly
 * what it means and can swallow nothing else.
 */
const AbsentWord = Schema.Literals(ABSENT_WORDS).pipe(
  Schema.decodeTo(Schema.Null, {
    decode: SchemaGetter.transform(() => null),
    encode: SchemaGetter.transform(() => "null" as const),
  }),
);

/**
 * An optional tool parameter — which on the wire means *nullable and required*,
 * and on some endpoints means *the word "null"*.
 *
 * **`Schema.optional` alone is a bug here, and it is invisible until a model
 * takes the schema at its word.** The provider publishes a tool's parameters
 * through OpenAI's strict-mode convention: every property goes in `required`
 * and an optional one gains a `null` member, because strict mode has no way to
 * say "may be absent". So the schema we send says `source` *must* be present
 * and may be `null` — and an endpoint that compiles that schema into a grammar
 * (llama.cpp does) leaves the model no other way to say "no filter". It then
 * dutifully sends `"source": null`, and the *decode* side uses the untransformed
 * schema, which refuses a null. The tool call is thrown away and the whole
 * answer dies with `Expected "note" | "beat" | "creature" | undefined, got
 * null`, one round in, with nothing on screen to say a tool was ever involved.
 *
 * Accepting the null is the fix rather than fighting the transform: the two
 * halves of the round trip have to agree, and only this half is ours. The
 * {@link ABSENT_WORDS} arm is the same argument one step further along — the
 * transform is not the only thing between us and the model, and an endpoint
 * that cannot express a null in a string position still has to be able to say
 * "not given". Both arms decode to the same `null`, so a handler sees one
 * answer however it was spelled, and `absent` turns that into "not given".
 *
 * **This is the same shape as `packages/api/src/Query.ts`'s `queryArray`**, and
 * for the same class of reason: a transport that cannot express one of the
 * values our schema requires, reconciled in the only place both halves meet.
 */
const optional = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(Schema.Union([schema, Schema.Null, AbsentWord]));

/** `null` and absent are the same answer, and repositories take the latter. */
const absent = <A>(value: A | null | undefined): A | undefined => value ?? undefined;

/**
 * What a tool refuses with.
 *
 * `NotFound` is the repositories' own denial, unchanged — the model guessed a
 * session id, or named a creature this credential may not see. `Conflict` is
 * the assistant's: a call that is well formed and still does not mean anything,
 * like a search with nothing to search for. Both are `failureMode: "return"`,
 * so both are something Hob reads and acts on rather than something that tears
 * down a half-written answer.
 */
const toolFailure = Schema.Union([NotFound, Conflict]);

export const SearchCampaign = Tool.make("searchCampaign", {
  description:
    "Search this campaign's record — the DM's prep notes, the beats they jotted " +
    "during play, and the bestiary. Lexical: search for the words the DM would " +
    "have written, especially invented names. Use this before answering anything " +
    "about people, places, things or creatures. It needs a word: to see the " +
    "whole bestiary rather than search it, call listCreatures.",
  parameters: Schema.Struct({
    /**
     * **Length 0 is deliberate, and it is a defect fix.**
     *
     * A minimum of 1 is the right rule and the wrong place to enforce it. A
     * model asked to build an encounter with no hint reaches for the natural
     * escape — search for everything — and writes `""`; the framework decodes a
     * tool call against this schema *before* any handler runs, so a refusal
     * here is not a refusal the model can read. It killed the whole answer and
     * put the schema error on the DM's screen, measured on two different models
     * (see AGENTS.md). Accepting the string and refusing it in the handler
     * turns the same "no" into a sentence Hob can act on — which is what
     * `failureMode: "return"` is for — and lets it name the tool that does
     * answer the question.
     *
     * The HTTP contract's `SearchFilter.q` is untouched and still requires a
     * word: there, a caller reads a 400 and there is nothing to recover.
     */
    query: Schema.String.check(Schema.isLengthBetween(0, 200)),
    /** Absent searches everything. */
    source: optional(SearchSource),
    limit: optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 25 }))),
  }),
  success: Schema.Array(SearchHit),
  failure: toolFailure,
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

/**
 * One line of the bestiary, as Hob reads it.
 *
 * **A projection, not a second answer.** Every field is `Creature`'s own, read
 * through `Creatures.list` and the predicate it already composes; what is
 * dropped is the `statBlock` document, the provenance tail and the timestamps.
 * That is the same reading policy `SEARCH_LIMIT` is: fifty full stat blocks is
 * a screen a DM scrolls and a context window a local model drowns in, and
 * drowning it is the failure this whole area exists to stop — a model that
 * spends its budget reading a list never reaches the tool call it was listing
 * for. The whole block is one `getCreature` away.
 *
 * The id is called `creatureId` rather than `id` because that is the name it
 * has where it is going: a model can copy it straight into `proposeEncounter`'s
 * roster without renaming anything.
 */
const CreatureLine = Schema.Struct({
  creatureId: CreatureId,
  name: Schema.String,
  /** As the DM says it — `"1/4"`. See the bestiary notes on `Creature.cr`. */
  cr: Schema.String,
  ac: Schema.Int,
  hp: Schema.Int,
  /** `"Small humanoid"` — the bestiary card's own subtitle, assembled. */
  kind: Schema.String,
  environments: Schema.Array(Schema.String),
});

export const ListCreatures = Tool.make("listCreatures", {
  description:
    "Every creature this campaign can put in a fight — the ones in its own " +
    "bestiary and the ones in the shared corpus — by name. Use it to see what " +
    "is available before building an encounter, and take `creatureId` straight " +
    "to proposeEncounter. At most 50 are listed; if what you want is not here, " +
    "look for it by name with searchCampaign.",
  success: Schema.Array(CreatureLine),
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
    since: optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 ** 53 - 1 }))),
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
const proposalFailure = toolFailure;

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
    readAloud: optional(Schema.Boolean),
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
    difficulty: optional(Difficulty),
    tags: optional(Schema.Array(Schema.String.check(Schema.isLengthBetween(1, 40)))),
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
 * Six reads and three proposals.
 *
 * The reads began as five — search, the session list, the recap, a creature and
 * the log — because each is a shipped repository method that already carries
 * the visibility seam. A read that would need new SQL is a decision for whoever
 * owns the repositories.
 *
 * **`listCreatures` is the sixth, and it is a defect fix rather than a
 * capability.** Until it existed there was no way to ask what a campaign
 * *has*: the only reach into the bestiary was lexical and needed a word, so a
 * model told to build an encounter guessed nouns off the campaign's name, got
 * nothing back every time, and concluded — correctly, per the tool
 * descriptions it had been given — that it could not propose one. That is
 * measured, on two models, and it is the reason "build me an encounter" came
 * back as prose. `Creatures.list` was already shipped and already predicated;
 * only the tool was missing.
 *
 * The proposals are the three accept targets and nothing else. Both halves are
 * listed in `apps/server/test/hob.test.ts`, so a tenth tool is a visible edit.
 */
export const HobToolkit = Toolkit.make(
  SearchCampaign,
  ListSessions,
  ListCreatures,
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
 * Bind the toolkit to one campaign and one actor — as one proof of the pair.
 *
 * **The `DmActor` is the whole security story, and no part of it comes from the
 * model.** It is a pair the server proved: the campaign is the path segment the
 * request was routed on, and the actor is what `Authorization` resolved from
 * the bearer token. Re-providing that actor here rather than letting it be
 * inherited is deliberate — the stream this feeds is consumed after the handler
 * effect has returned, so the request's context is no longer ambient by the
 * time a tool runs. Naming it explicitly is what makes the actor a captured
 * value rather than a hope.
 *
 * It arrives as one proof rather than as two loose arguments for two reasons.
 * `sessionLog` reads the combat log, which is one of the three DM-only
 * projections and needs one anyway; and asking Hob is already a DM-only act —
 * a conversation is a row in the campaign, so `HobThreads.start` needs
 * `campaignWritable`. Taking the proof here means a tool surface cannot be
 * built for an actor whose DM-ness was never checked, which is the same idea as
 * the campaign not being a tool parameter, one level up.
 */
export const handlersFor = (repositories: HobRepositories, dm: DmActor, proposal: ProposalSlot) => {
  const { actor, campaign: campaignId } = dm;

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
      query.trim() === ""
        ? // The refusal the schema used to make, moved to where the model can
          // hear it — and pointed at the tool that answers what an empty search
          // was reaching for.
          Effect.fail(
            new Conflict({
              message:
                "searchCampaign needs a word to look for — it searches the record, it " +
                "does not list it. To see what creatures this campaign can use, call " +
                "listCreatures; for the nights it has played, listSessions.",
            }),
          )
        : as(
            repositories.search.search(campaignId, {
              q: query,
              source: absent(source),
              limit: limit ?? SEARCH_LIMIT,
            }),
          ),
    listSessions: () => as(repositories.sessions.list(campaignId)),
    listCreatures: () =>
      Effect.map(
        // Ordered by name and capped, which is the reading policy and not a
        // narrowing: the predicate is `corpusRowReadable`, exactly as the
        // bestiary screen's own list is. The cap is stated in the tool's
        // description rather than left for the model to discover, because a
        // silently truncated list reads as "that is all there is".
        as(repositories.creatures.list(campaignId, { sort: "name", limit: CREATURE_LIMIT })),
        (page) =>
          page.items.map((creature) => ({
            creatureId: creature.id,
            name: creature.name,
            cr: creature.cr,
            ac: creature.ac,
            hp: creature.hp,
            kind: creature.size === null ? creature.type : `${creature.size} ${creature.type}`,
            environments: creature.environments,
          })),
      ),
    // The DM's recap, through the same proof `sessionLog` needs: Hob is the
    // DM's sidekick, and its answers may quote a monster's exact hit points
    // because the person reading them is the person who set them.
    sessionRecap: ({ sessionId }) => repositories.recap.read(dm, sessionId),
    getCreature: ({ creatureId }) => as(repositories.creatures.findById(campaignId, creatureId)),
    sessionLog: ({ sessionId, since }) =>
      repositories.events.list(dm, sessionId, { since: absent(since), limit: LOG_LIMIT }),

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
