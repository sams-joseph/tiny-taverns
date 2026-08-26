import {
  type Ability,
  ABILITY_KEYS,
  AbilityKey,
  type Actor,
  type CampaignId,
  type CharacterSheet,
  Conflict,
  Creature,
  CreatureId,
  CurrentActor,
  Difficulty,
  type HobProposal,
  type HobRosterLine,
  modifierFor,
  NotFound,
  SearchHit,
  SearchSource,
  seedFor,
  Session,
  SessionEvent,
  SessionId,
  SessionRecap,
  type Skill,
} from "@taverns/api";
import {
  BundledClassName,
  BundledSpeciesName,
  bundledClass,
  bundledSpecies,
} from "../ruleset/systemOptions.js";
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
 * **Nothing here writes to the campaign, including the four `propose*`
 * tools.** A proposal is stashed in a `Ref` and saved on the conversation turn;
 * a note, a beat, an encounter or a character appears only when a human accepts
 * it, in `repo/Proposals.ts`. There is no write repository in this directory to
 * reach for — which is the captain's *generate with approval* decision made
 * structural rather than remembered.
 *
 * ### Two toolkits, because there are two people who may ask
 *
 * The captain reversed *players do not talk to Hob* on 2026-08-26 so that a
 * player can have a character drafted for them. What that bought had to be a
 * **second toolkit rather than a widened one**, because the toolkit is what the
 * model is shown: a player offered `getCreature` would be offered a stat block,
 * which is precisely what the product says a player must not have, whether or
 * not the predicate underneath would refuse it.
 *
 * So {@link HobToolkit} is the DM's nine and {@link PlayerToolkit} is two —
 * `searchCampaign`, which composes `rowReadable` and therefore reaches the
 * `shared` notes and beats a player is entitled to and nothing else, and
 * `proposeCharacter`. `dmHandlersFor` takes a `DmActor`; `playerHandlersFor`
 * takes a plain `Actor` and the campaign, because there is no DM-ness to prove
 * and the two tools it binds need none. **The campaign is closed over in both**,
 * so the grounding property is untouched: it is still not a parameter of any
 * tool, and a model still cannot express a call into another campaign.
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
 * An optional **free-text** parameter — and deliberately not {@link optional}.
 *
 * {@link ABSENT_WORDS} is safe only because no optional parameter reached
 * through `optional` is prose: in an enum position the word "none" cannot be a
 * value, so decoding it as absence loses nothing. `proposeCharacter` is the
 * first tool with prose optionals — a background, a bond, an ideal, a flaw —
 * and there "None" is a perfectly good answer somebody might mean. Swallowing
 * it would be the sentinel doing exactly the damage it was written to avoid.
 *
 * So this arm accepts absent, `null`, or any string, and the *handler* treats a
 * blank one as not given ({@link blank}). That is `searchCampaign.query`'s
 * lesson applied a second time: a refusal the framework makes before a handler
 * runs is a refusal the model cannot hear, so the schema is permissive and the
 * rule is in the handler.
 */
const optionalText = (max: number) =>
  Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isLengthBetween(0, max)), Schema.Null]),
  );

/** Whitespace, `""` and absent are one answer: nothing was said. */
const blank = (value: string | null | undefined): string | undefined => {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
};

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
 * The four things Hob may offer to add — three to the DM's campaign, one to
 * the player who asked — and *offer* is the whole of what these do.
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
 * `proposeCharacter` is the fourth and belongs to the other toolkit; it is
 * declared further down, beside the arithmetic it does.
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
 * The six abilities, the twelve classes and the ten species are all
 * `packages/api/src/Ruleset.ts`'s — imported above, not restated here.
 *
 * Each is a closed enum rather than free text, and `proposeCharacter` is where
 * being strict pays: the published JSON schema becomes a fixed vocabulary,
 * which an endpoint that compiles it into a grammar can hold the model to. A
 * model that wrote `"Wisdom"` would otherwise produce an ability nothing on a
 * sheet can match up with a saving throw, and one that wrote `"Wood Elf"` a
 * species nothing can look a hit point up against.
 *
 * **They live in `@taverns/api` because the create form picks from the same
 * three lists**, and two copies of a vocabulary are two answers to what a
 * druid is. A near miss — `"Wood Elf"` where the grammar is not compiled — is
 * a tool call that fails to decode, which is exactly what `Hob.ts`'s `recover`
 * exists for and is charged to `MAX_ROUNDS` like any other.
 */

/**
 * The array `proposeCharacter` assigns, and the reason the tool takes no
 * numbers.
 *
 * `CharacterCreate.jsx:157` opens on the standard array and makes rolling an
 * explicit second action, so this is the drawn default rather than a
 * simplification. It is also what makes the tool call something a small model
 * can get right: a measured 4B ranks six words reliably and miscounts 4d6
 * routinely, and the arithmetic has one right answer, which is exactly the sort
 * of thing this codebase keeps on the server. `apps/web/src/characters/abilities.ts`
 * holds the same array for the sheet's own editor, where the *dice* live — a
 * roll is the browser's by a decision already written down, and an assignment
 * is not a roll.
 */
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/**
 * Six ability cells from a ranking — **the whole of the arithmetic, in one
 * place.**
 *
 * `Ability.score` and `Ability.modifier` are *both* stored `NonEmptyString`s
 * (`Creature.ts`: the document keeps what was written), so the one thing the
 * document cannot survive is the two disagreeing. Every cell here is written in
 * one object literal, which is what makes that structural rather than careful.
 *
 * The ranking is repaired rather than refused: a model that names four
 * abilities, or names one twice, gets the rest appended in the canonical order
 * and the array applied down the list. A tool call that is *nearly* right is the
 * common case on a small model, and a `NotFound` for a duplicated "DEX" would
 * cost a round to say something the server can simply resolve.
 */
const abilitiesFrom = (order: ReadonlyArray<AbilityKey>): ReadonlyArray<Ability> => {
  const ranked: Array<AbilityKey> = [];
  for (const key of [...order, ...ABILITY_KEYS]) {
    if (!ranked.includes(key)) ranked.push(key);
  }
  const scores = new Map<AbilityKey, number>(
    ranked.map((key, index) => [key, STANDARD_ARRAY[index] ?? 10]),
  );
  // Drawn in the canonical order whatever the ranking was: the ranking decides
  // the numbers, not where a cell sits on the sheet.
  return ABILITY_KEYS.map((label) => {
    const score = scores.get(label) ?? 10;
    return { label, score: String(score), modifier: modifierFor(score) };
  });
};

/** Named skills, as the sheet's own rows. Proficient, with no bonus invented. */
const skillsFrom = (names: ReadonlyArray<string>): ReadonlyArray<Skill> => {
  const seen = new Set<string>();
  const rows: Array<Skill> = [];
  for (const raw of names) {
    const name = raw.trim();
    // A bonus is the modifier plus a proficiency this document does not model,
    // so deriving one would be a wrong number in a column somebody reads out at
    // the table. The mark is what the sheet draws and the mark is all this
    // claims. Same call `apps/web/src/characters/skills.ts` makes.
    if (name !== "" && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      rows.push({ name, proficient: true });
    }
  }
  return rows;
};

/**
 * What Hob offers a **player**: a character, drafted from a paragraph they
 * wrote.
 *
 * ### It takes no numbers, and that is the measured design
 *
 * The prior report drove the captain's own configured 4B model and measured it
 * choosing `proposeEncounter` **one time in five** with all the tools offered.
 * A character draft is a strictly harder call — the drawn sheet is fifteen
 * fields including six ability scores — so every parameter here is one a small
 * model is *good* at: labels, a ranking of six words, and prose. The scores,
 * the modifiers and the sheet document are the server's, in `abilitiesFrom`
 * above, which is why `HobProposal`'s character member carries a resolved
 * `CharacterSheet` rather than the model's raw answer.
 *
 * `level` is not a parameter either: a new character is level 1, and levelling
 * one up is somebody's later act rather than something a draft decides.
 *
 * ### Every optional is prose, so none of them goes through `optional`
 *
 * See {@link optionalText}. The sentinel that rescues an unset enum would eat a
 * background genuinely called "None", so the free-text optionals take the
 * permissive arm and the handler collapses a blank one.
 */
export const ProposeCharacter = Tool.make("proposeCharacter", {
  description:
    "Offer the player a character sheet built from what they described. Give " +
    "them a name, then pick one species from Aasimar, Dragonborn, Dwarf, Elf, " +
    "Gnome, Goliath, Halfling, Human, Orc, Tiefling and one class from " +
    "Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, " +
    "Sorcerer, Warlock, Wizard — spelled exactly like that. Put anything more " +
    "specific, like a wood elf or a circle of the moon, in subclass. Rank the " +
    "six abilities most important first, name up to four skills, and write a " +
    "short backstory in their own register. Do not give scores, modifiers, hit " +
    "points, armour class or a level — the standard array is applied for you " +
    "and the starting numbers are worked out from the class and species. Only " +
    "a suggestion: nothing is saved unless the player accepts it. Say one " +
    "short line about it and stop.",
  parameters: Schema.Struct({
    name: Schema.String.check(Schema.isLengthBetween(1, 120)),
    /**
     * The species and the class, as **closed vocabularies** — the bundled ten
     * and twelve, from `src/ruleset/systemOptions.ts`.
     *
     * They were free text of up to sixty characters, and the captain's decision
     * of 2026-08-26 is that they are not. The gain is not tidiness: a class is
     * the only thing that carries a hit die, so *"which of the twelve"* is the
     * question that lets the three numbers below this be seeded at all. A model
     * writing `"Circle of the Moon Druid"` produces a label nothing can look a
     * die up against, and it did — that is what the old bound allowed.
     *
     * Both required, unlike every other parameter here: a character has a class
     * and a species, this is the one call whose whole job is to say which, and
     * an empty arm would be an escape a small model reaches for under pressure.
     * The description names both lists so the vocabulary is in the prompt as
     * well as in the grammar.
     *
     * **These are the bundle's names and deliberately not the campaign's**,
     * even though a campaign can have its own classes now. A per-campaign
     * vocabulary cannot be a module-level literal, and a closed enum is what
     * lets a grammar-compiling endpoint hold a small model to a list — measured
     * at the 4B tier. Building the toolkit per request is the answer and is its
     * own piece of work; until then Hob drafts from the twelve and the ten,
     * which degrades gracefully because a drafted character already carries a
     * label the campaign may not have, exactly like today's `"Half-orc"`.
     */
    species: BundledSpeciesName,
    className: BundledClassName,
    /** `"Circle of the Land (Marsh)"` — the drawn tagline's unowned half. */
    subclass: optionalText(80),
    background: optionalText(80),
    /**
     * Six ability keys, most important first — **a ranking, not scores.**
     *
     * Short of six is repaired rather than refused (see `abilitiesFrom`), which
     * is why the check allows an empty array: a schema refusal here happens
     * before any handler runs and cannot be read by the model.
     */
    abilityOrder: Schema.Array(AbilityKey).check(Schema.isLengthBetween(0, 6)),
    skills: optional(
      Schema.Array(Schema.String.check(Schema.isLengthBetween(1, 40))).check(
        Schema.isLengthBetween(0, 8),
      ),
    ),
    backstory: Schema.String.check(Schema.isLengthBetween(0, 4000)),
    bond: optionalText(400),
    ideal: optionalText(400),
    flaw: optionalText(400),
    /** Starting kit, as item names. It becomes `sheet.inventory`. */
    kit: optional(
      Schema.Array(Schema.String.check(Schema.isLengthBetween(1, 80))).check(
        Schema.isLengthBetween(0, 20),
      ),
    ),
    /**
     * Why these choices — one short line each, the drawn *What Hob did* aside.
     *
     * Asked for explicitly rather than left to the reply, because it is the one
     * part of a draft the player has to be able to argue with, and a sentence
     * buried in prose above the card is not that.
     */
    rationale: optional(
      Schema.Array(Schema.String.check(Schema.isLengthBetween(1, 400))).check(
        Schema.isLengthBetween(0, 8),
      ),
    ),
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
 * The proposals are the DM's three accept targets and nothing else. Both halves
 * are listed in `apps/server/test/hob.test.ts`, so a tenth tool is a visible
 * edit — and so is a third one on {@link PlayerToolkit}.
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

/**
 * What a **player** is offered: one read and one proposal.
 *
 * **A second toolkit rather than the first one narrowed at the handler**, and
 * the difference is not style: a toolkit is what the provider is *shown*, so a
 * tool bound to a handler that always refuses is still a tool the model spends
 * its budget reaching for and still a capability the DM's product appears to
 * offer their players. Two toolkits means a player's Hob has never heard of
 * `getCreature`.
 *
 * Which two, and why nothing else:
 *
 * - **`searchCampaign`** composes `rowReadable`, so it reaches the `shared`
 *   notes and beats their DM has opened up and nothing else — the same `WHERE`
 *   clause the HTTP API answers them with, which is the property
 *   `hob.test.ts` has measured since before there was a player surface. It is
 *   what makes the drawn showcase line possible (*"your DM's campaign is on the
 *   salt road"*), and at a table whose DM shares nothing it honestly returns
 *   nothing.
 * - **`proposeCharacter`** is the point of the surface.
 *
 * The other seven are out, each for its own reason rather than by omission.
 * `getCreature` is a stat block, which is precisely what the product says a
 * player must not have. `sessionRecap` and `sessionLog` need a `DmActor` and
 * are two of the three DM-only projections. `listSessions`, `listCreatures`,
 * `proposeNote`, `proposeBeat` and `proposeEncounter` are all the DM's campaign
 * to shape — a player cannot write a note or an encounter through the API
 * either, so offering to draft one would be a card whose *Save* could only
 * fail.
 */
export const PlayerToolkit = Toolkit.make(SearchCampaign, ProposeCharacter);

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
 * It arrives as one proof rather than as two loose arguments because
 * `sessionRecap` and `sessionLog` read two of the three DM-only projections and
 * need one anyway. Taking the proof here means **this** tool surface cannot be
 * built for an actor whose DM-ness was never checked, which is the same idea as
 * the campaign not being a tool parameter, one level up.
 *
 * It used to mean more than that. Until the captain reversed *players do not
 * talk to Hob*, a tool surface for a player was not something to refuse but
 * something that could not be constructed, because there was only this
 * function. That is no longer the boundary; {@link playerHandlersFor} is, and
 * what keeps it honest is that it binds a strictly smaller toolkit rather than
 * this one with a weaker proof. The `DmActor` is still what gates the two log
 * reads, and it is still the only thing that can.
 */
const bind = (actor: Actor, proposal: ProposalSlot) => ({
  /**
   * Every read a tool makes, with this actor named rather than inherited.
   *
   * The stream this feeds is pulled *after* the handler effect has returned, so
   * the request's context is no longer ambient by the time a tool runs. Naming
   * the actor makes it a captured value rather than a hope.
   */
  as: <A, E>(effect: Effect.Effect<A, E, CurrentActor>): Effect.Effect<A, E> =>
    Effect.provideService(effect, CurrentActor, actor),

  /** Takes the slot if it is free, and tells the model what it now has. */
  offer: (made: HobProposal, said: string) =>
    Effect.gen(function* () {
      if ((yield* Ref.get(proposal)) !== undefined) return yield* alreadyProposed;
      yield* Ref.set(proposal, made);
      return said;
    }),
});

/**
 * `searchCampaign`, bound — the one tool both toolkits have.
 *
 * Written once because it must mean the same thing on both sides: it is the
 * shipped `Search.search` with whichever actor is asking, so the row-level
 * predicate is what makes a DM's answer wide and a player's narrow. A second
 * copy narrowed "for players" would be the second data path this whole
 * directory exists to avoid.
 */
const searchWith =
  (
    repositories: HobRepositories,
    campaignId: CampaignId,
    as: <A, E>(effect: Effect.Effect<A, E, CurrentActor>) => Effect.Effect<A, E>,
  ) =>
  ({
    query,
    source,
    limit,
  }: {
    readonly query: string;
    readonly source?: SearchSource | null;
    readonly limit?: number | null;
  }) =>
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
        );

export const dmHandlersFor = (
  repositories: HobRepositories,
  dm: DmActor,
  proposal: ProposalSlot,
) => {
  const { actor, campaign: campaignId } = dm;
  const { as, offer } = bind(actor, proposal);

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
    searchCampaign: searchWith(repositories, campaignId, as),
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

/**
 * The same idea for a player: one campaign, one plain `Actor`, two tools.
 *
 * **There is no proof to take, and none is missing.** A `DmActor` answers *is
 * this account the DM of this campaign*, and the whole point of this surface is
 * that its caller is not — the same reason `Characters.updateOwn` is the one
 * ungated method where the gate would answer the wrong question. What bounds a
 * player here is what bounds them everywhere: `searchCampaign` runs
 * `Search.search` with their actor, so `rowReadable` gives them the `shared`
 * rows and nothing else, and `proposeCharacter` writes nothing at all.
 *
 * The campaign arrives the same way it does above — closed over from the path
 * segment the request was routed on, never a parameter — so the grounding
 * property holds identically on both sides. `Hob.ask` resolves *which* of the
 * two to build once per question, from the DM proof it already asks for.
 */
export const playerHandlersFor = (
  repositories: HobRepositories,
  actor: Actor,
  campaignId: CampaignId,
  proposal: ProposalSlot,
) => {
  const { as, offer } = bind(actor, proposal);

  return PlayerToolkit.of({
    searchCampaign: searchWith(repositories, campaignId, as),

    proposeCharacter: ({
      name,
      species,
      className,
      subclass,
      background,
      abilityOrder,
      skills,
      backstory,
      bond,
      ideal,
      flaw,
      kit,
      rationale,
    }) => {
      const identity = {
        ...(blank(subclass) === undefined ? {} : { subclass: blank(subclass)! }),
        ...(blank(background) === undefined ? {} : { background: blank(background)! }),
      };
      const story = {
        ...(blank(bond) === undefined ? {} : { bond: blank(bond)! }),
        ...(blank(ideal) === undefined ? {} : { ideal: blank(ideal)! }),
        ...(blank(flaw) === undefined ? {} : { flaw: blank(flaw)! }),
      };
      const carried = (kit ?? []).map((item) => item.trim()).filter((item) => item !== "");
      /**
       * The document, assembled here so the card and the row cannot disagree.
       *
       * Every optional key is omitted rather than written empty, for the reason
       * `emptyCharacterSheet` names only its three required keys: a sheet with
       * `skills: []` on it draws a Skills section that says nothing, where a
       * sheet without the key draws the section's own invitation to fill it in.
       */
      const sheet: CharacterSheet = {
        notes: blank(backstory) ?? "",
        abilities: abilitiesFrom(abilityOrder),
        traits: [],
        ...(Object.keys(identity).length === 0 ? {} : { identity }),
        ...(Object.keys(story).length === 0 ? {} : { story }),
        ...((skills ?? []).length === 0 ? {} : { skills: skillsFrom(skills ?? []) }),
        ...(carried.length === 0 ? {} : { inventory: carried.map((item) => ({ name: item })) }),
      };

      /**
       * The three numbers a character starts on, worked out **here** rather
       * than at the accept.
       *
       * `HobProposal.sheet` is resolved when the proposal is made, and these
       * follow it for the same stated reason: the card the player reads and the
       * row *Keep them* creates cannot disagree, and the accept does no
       * arithmetic a reader could not see coming. It reads the class hit die,
       * the species, and the constitution and dexterity modifiers out of the
       * `sheet` this handler has just assembled — so a draft that ranked
       * constitution first really does come back with more hit points, which is
       * the whole point of ranking it.
       *
       * `seedFor` is `@taverns/api`'s and is the same function the manual create
       * form calls, so a drafted druid and a hand-filled one start on the same
       * number. It is called **once**, and nothing recomputes any of the three
       * afterwards.
       *
       * It takes **entries** rather than labels now, because there is no global
       * class map to look a label up in — a campaign's vocabulary is a read.
       * The lookup here is the bundle's, matching the closed vocabulary the two
       * parameters above are held to, so it cannot miss; the manual create form
       * resolves against the campaign's own options instead. Two resolvers, one
       * seed, and the arithmetic is untouched.
       */
      const seed = seedFor({
        classEntry: bundledClass(className),
        speciesEntry: bundledSpecies(species),
        abilities: sheet.abilities,
      });

      return offer(
        {
          target: "character",
          name,
          species,
          className,
          sheet,
          level: seed.level,
          ac: seed.ac,
          // Always present in practice — the class is a closed vocabulary, so
          // there is always a hit die — and optional on the wire because a
          // proposal saved before this existed has no key at all.
          ...(seed.hpMax === undefined ? {} : { hpMax: seed.hpMax }),
          rationale: (rationale ?? []).map((line) => line.trim()).filter((line) => line !== ""),
        },
        `Offered ${name} to the player. They can keep them or ask for changes; ` +
          "say one short line about the character and stop — the sheet is already " +
          "on their screen.",
      );
    },
  });
};
