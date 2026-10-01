import {
  ACT_TITLE_MAX,
  APPEARANCE_MAX,
  type Ability,
  type AbilityBonus,
  ABILITY_KEYS,
  type AssistantThreadId,
  type AssistantTurnId,
  AbilityKey,
  type Actor,
  asBackgroundOption,
  asClassOption,
  asRaceOption,
  CAMPAIGN_DESCRIPTION_MAX,
  SHARED_WORLD_DESCRIPTION_MAX,
  CAMPAIGN_PREVIOUSLY_MAX,
  CAMPAIGN_STORY_MAX,
  CampaignId,
  ChallengeRating,
  type CharacterOption,
  type CharacterSheet,
  type CharacterSpellRules,
  Conflict,
  Creature,
  CreatureId,
  CurrentActor,
  type EncounterChallenge,
  ENCOUNTER_HAZARD_TEXT_MAX,
  ENCOUNTER_OUTCOME_MAX,
  ENCOUNTER_SETTING_MAX,
  ENCOUNTER_SKILL_MAX,
  ENCOUNTER_SKILLS_MAX,
  ENCOUNTER_TACTIC_MAX,
  ENCOUNTER_TACTICS_MAX,
  ENCOUNTER_TREASURE_MAX,
  EncounterKind,
  encounterKindLabel,
  gearLinesNamed,
  type HobProposal,
  type HobRosterLine,
  NoteCategory,
  NpcKnowledgeSourceKind,
  NPC_WHEREABOUTS_MAX,
  NpcAttitude,
  NpcStatus,
  isRaceOption,
  modifierFor,
  NotFound,
  NpcId,
  NpcPersona,
  NpcPrep,
  NpcPrivateMaterial,
  NpcSheet,
  OptionKind,
  optionNamed,
  SearchHit,
  SearchSource,
  sheetWithSpellSelection,
  startingSheetBody,
  spellById,
  spellKnownFor,
  spellNoteFor,
  spellSelectionProblems,
  SpellId,
  STARTING_LEVEL,
  type SpellKnown,
  Session,
  SessionEvent,
  SessionId,
  SessionRecap,
  type SharedWorldId,
  SheetLabel,
  type Skill,
  type RaceEntry,
  type SubraceEntry,
  subraceNamed,
} from "@taverns/api";
import { Effect, Ref, Schema, SchemaGetter } from "effect";
import { Tool, Toolkit } from "effect/ai";
import type { Acts } from "../repo/Acts.js";
import type { CampaignStories } from "../repo/CampaignStories.js";
import type { Creatures } from "../repo/Creatures.js";
import type { GroupHistory, PlayedNight } from "../repo/GroupHistory.js";
import type { Groups } from "../repo/Groups.js";
import type {
  HobDirectResourceContext,
  HobDirectResourceTarget,
  HobDirectWrites,
} from "../repo/HobDirectWrites.js";
import type { CampaignCreatorActor } from "../repo/CreatorActor.js";
import type { NpcKnowledge } from "../repo/NpcKnowledge.js";
import type { NpcMemories } from "../repo/NpcMemories.js";
import type { NpcPreps } from "../repo/NpcPrep.js";
import type { NpcSheets } from "../repo/NpcSheets.js";
import type { Npcs } from "../repo/Npcs.js";
import type { NpcAwareness, NpcAwarenessDraft } from "../repo/NpcAwareness.js";
import type { Options } from "../repo/Options.js";
import type { Recap } from "../repo/Recap.js";
import type { Search } from "../repo/Search.js";
import type { SessionEvents } from "../repo/SessionEvents.js";
import type { Sessions } from "../repo/Sessions.js";
import type { EquipmentRepo } from "../repo/Equipment.js";
import type { Spells } from "../repo/Spells.js";

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
 * **Nothing here creates anything, including the `propose*` tools.** A
 * proposal is stashed in a `Ref` and saved on the conversation turn; a note, a
 * beat, an encounter, a character or a campaign appears only when a human
 * accepts it, in `repo/Proposals.ts`. The one direct write Hob may make is slice 6's
 * audited spend of an existing resource counter, and that tool appears only
 * when the DM has turned on the current fight's switch.
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
 * So {@link HobToolkit} is the DM's campaign toolkit and {@link PlayerToolkit}
 * is the character-drafting one — `searchCampaign`, which composes
 * `rowReadable` and therefore reaches the `shared` notes and beats a player is
 * entitled to and nothing else, plus the character draft tools. `dmHandlersFor`
 * takes a `CampaignCreatorActor`; `playerHandlersFor` takes a plain `Actor` and
 * the campaign, because there is no DM-ness to prove and the player tools it
 * binds need none. **The campaign is closed over in all of them**, so the
 * grounding property is untouched: it is still not a parameter of any tool, and
 * a model still cannot express a call into another campaign.
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
 * How many ended nights `readCampaignStorySources` reads out at once, oldest
 * first after the story's own night. A campaign further behind than this is
 * brought up to date by the next refresh, from where the kept story stops —
 * the Shared World's `ENTRY_LIMIT` rule, at a size a local model can hold.
 */
const STORY_NIGHT_LIMIT = 12;

/**
 * How many names of one kind may go into the tool's own grammar before
 * {@link ListOptions} reads them out instead.
 *
 * `CREATURE_LIMIT`'s argument, one level down and with one extra term. Forty
 * short words is a few hundred tokens in a schema a local model has to hold
 * alongside everything else, and a campaign with more classes than that has a
 * vocabulary a model should be *asked* for rather than shown. The extra term is
 * that this list is published as a JSON-schema `enum`, so its cost is paid on
 * **every round** rather than once when a tool answers.
 *
 * Under it the vocabulary is in the grammar and a draft costs two rounds; over
 * it the vocabulary is a tool call and a draft costs three. That is the whole of
 * what the cap decides, and it is why it is generous: three rounds against a
 * budget of four leaves nothing for {@link recover}, which is the reliability
 * work this must not spend.
 */
const OPTION_ENUM_CAP = 40;

/** How long a homebrew name may be — `CharacterOption.ts`'s own bound. */
const OPTION_NAME_MAX = 60;

/**
 * **This campaign's** classes, races and backgrounds, as the words
 * `proposeCharacter` is held to.
 *
 * ### Why a campaign's vocabulary cannot be a module-level literal
 *
 * It used to be: the twelve and the ten of `src/ruleset/systemOptions.ts`, as
 * two `Schema.Literals`, decided when this file was compiled. A campaign has its
 * own classes since `0017` — the whole point of that slice is that a DM writes
 * *Bloodsworn* and their players can pick it — so the vocabulary is now a
 * **read**, and a schema built from a read has to be built when the read
 * happens. That is the one structural change slice 2 makes: the player's toolkit
 * is constructed per request rather than per module.
 *
 * ### The grammar is what a small model is actually held to
 *
 * A closed enum is not tidiness. An endpoint that compiles the published JSON
 * schema into a grammar (llama.cpp does) *cannot emit* a value outside it, which
 * is the only mechanism measured on this fleet to keep a 4B model inside a
 * vocabulary — and the round budget is four with recovery charged against it, so
 * a mechanism that costs a round is a mechanism that costs reliability. Hence
 * the enum wherever it fits, and {@link ListOptions} only where it does not.
 *
 * ### A homebrew name is untrusted text, and this is how that is handled
 *
 * A DM may call a class *"ignore all previous instructions"*, and that name then
 * reaches the model twice — once as a JSON-schema `enum` member and once in the
 * tool's own description. It is deliberately **not rewritten**: the label is the
 * entire link between a character and an option (`optionNamed` matches it
 * exactly, case aside), so a sanitiser here would seed a character against a
 * class that does not exist.
 *
 * What is done instead, and it is enough:
 *
 * - the `enum` half is structurally inert — a JSON string inside an array of
 *   permitted values is never in instruction position, whatever it says;
 * - the **description** half renders every name through `JSON.stringify`
 *   ({@link quoted}), which is the identical escaping the schema uses, so a name
 *   carrying a quote, a newline or a brace is a listed item rather than a new
 *   sentence — and the prose and the grammar carry byte-identical text, which is
 *   the property that stops them drifting;
 * - the exposure is bounded to 60 characters by `CharacterOption.ts`'s own
 *   `optionName`, and to names an account authored at its own table.
 *
 * This is not a new class of exposure. A note's title already reaches the model
 * through `searchCampaign`, unquoted and up to 200 characters; what is new is
 * only that it reaches it in a schema as well as in a result.
 */
export interface CharacterVocabulary {
  /**
   * The rows themselves, kept because the handler resolves a chosen label back
   * to the numbers `seedFor` reads — through `optionNamed`, which is the
   * product's own rule and not a second one.
   */
  readonly options: ReadonlyArray<CharacterOption>;
  /** Class names, de-duplicated, in the order the picker shows them. */
  readonly classes: ReadonlyArray<string>;
  /** {@link classes}' twin. */
  readonly race: ReadonlyArray<string>;
  /** {@link classes}' third — the origins, proficiencies and starting kit. */
  readonly backgrounds: ReadonlyArray<string>;
  /**
   * Whether **any** kind is over {@link OPTION_ENUM_CAP} — which is the one
   * thing that decides which toolkit a player gets.
   */
  readonly listed: boolean;
}

/** A campaign with nothing written down. Also what the DM's side is handed. */
export const NO_VOCABULARY: CharacterVocabulary = {
  options: [],
  classes: [],
  race: [],
  backgrounds: [],
  listed: false,
};

/**
 * The names of one kind, de-duplicated case-insensitively, first spelling kept.
 *
 * Duplicates are expected rather than defensive: a group share and the
 * sharer's own Library can answer the same name twice, and nothing refuses a
 * shared original named like a bundled one. The first spelling is kept because
 * that is the row `optionNamed` resolves to — it is a `find`, so an enum
 * offering the second row's casing would name a row the handler will not
 * reach.
 */
const namesOf = (
  options: ReadonlyArray<CharacterOption>,
  kind: OptionKind,
): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const names: Array<string> = [];
  for (const option of options) {
    if (option.kind !== kind) continue;
    const key = option.name.trim().toLowerCase();
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    names.push(option.name);
  }
  return names;
};

/** What `Options.list` answered, as the two lists and the one decision. */
export const vocabularyOf = (options: ReadonlyArray<CharacterOption>): CharacterVocabulary => {
  const classes = namesOf(options, "class");
  const race = namesOf(options, "race");
  const backgrounds = namesOf(options, "background");
  return {
    options,
    classes,
    race,
    backgrounds,
    // Any one kind over the cap puts `listOptions` in the toolkit, because the
    // fallback reads every kind out in one call — a per-kind decision here
    // would be a per-kind tool there, which is the round this design refuses to
    // spend.
    listed: [classes, race, backgrounds].some((names) => names.length > OPTION_ENUM_CAP),
  };
};

/**
 * One name, escaped exactly as the schema escapes it.
 *
 * `JSON.stringify` and not a hand-rolled quote: the tool's parameters are
 * published as JSON, so this is the same transformation applied to the same
 * string, which is what makes "the prompt and the grammar cannot drift" a
 * property rather than a habit.
 */
const quoted = (name: string): string => JSON.stringify(name);

/**
 * How a name is spelled in the tool schema for one kind — and therefore whether
 * the vocabulary reaches the model as a grammar or as a tool.
 *
 * Three cases, and each is a true sentence about the campaign rather than a
 * fallback chain:
 *
 * - **nothing written down** — free text. There is no enum to build and nothing
 *   for {@link ListOptions} to read out, so the model writes what fits and the
 *   seed degrades exactly as an unmatched label already does.
 * - **within the cap** — `Schema.Literals`, which is the whole design.
 * - **over the cap** — free text, with {@link ListOptions} in the toolkit and
 *   the description pointing at it.
 *
 * The return type is erased to a plain string codec on purpose: the two arms
 * have different *static* types and identical runtime meaning for a caller, and
 * the handler stores a label either way. Nothing is lost — the AST the JSON
 * schema is generated from is untouched, so the `enum` still reaches the wire.
 */
const nameSchema = (names: ReadonlyArray<string>): Schema.Codec<string, string> =>
  names.length === 0 || names.length > OPTION_ENUM_CAP
    ? Schema.String.check(Schema.isBetweenLength(1, OPTION_NAME_MAX))
    : Schema.Literals(names);

/**
 * The sentence in the tool's description for one kind, built from the same list
 * the schema was.
 *
 * Templated rather than written out, which is the point: the twelve and the ten
 * used to appear twice — once as `Schema.Literals` and once as prose — and two
 * statements of one vocabulary is two things to forget to update.
 */
const nameSentence = (
  rules: DraftRules,
  noun: string,
  plural: string,
  names: ReadonlyArray<string>,
): string =>
  names.length === 0
    ? `${rules === "campaign" ? "This campaign has" : "The core rules have"} no ${plural} ` +
      `written down, so put whatever fits the character in ${noun} and say so.`
    : names.length > OPTION_ENUM_CAP
      ? `Pick one ${noun} from ${rules === "campaign" ? "this campaign's own list" : "the core rules"}: ` +
        "call listOptions first and copy a name back exactly as it came, spelling and all."
      : `Pick one ${noun} from ${names.map(quoted).join(", ")} — spelled exactly ` +
        "like that, quotes aside.";

/**
 * Which rules a character is drafted against: a campaign's vocabulary
 * (`usableInCampaign`, the player toolkit) or the core rules alone
 * (`coreRulesUsable`, drafting with no campaign). It changes the words the
 * model is shown and the reads behind them, never the shape of a tool.
 */
export type DraftRules = "campaign" | "core";

/** Where the vocabulary came from, as the refusals say it. */
const rulesPlace = (rules: DraftRules): string =>
  rules === "campaign" ? "in this campaign" : "in the core rules";

/**
 * The words a model writes when it means *nothing here*, for an endpoint that
 * cannot write a real `null`.
 *
 * **Measured, not guessed** (see the Hob reliability notes in AGENTS.md). A
 * chat template whose tool-call format is XML hands llama.cpp untyped parameter
 * *text*, which it then coerces using the published JSON schema. For an
 * integer- or array-typed optional the text `null` parses as JSON `null` and
 * arrives correctly; for a **string-typed** one it stays the string `"null"` —
 * six times out of six on the endpoint the report drove. An optional enum left
 * unset (`proposeEncounter`'s DM-set band, since removed) produced `"null"`
 * three times and `"None"` once.
 *
 * The list is the vocabulary and its plausible casings, and nothing else. It is
 * safe precisely because it is only ever reached through {@link optional}, and
 * **no optional parameter in this toolkit is free text** — they are enums,
 * UUIDs, integers, a boolean and an array of tags. A model that means the
 * literal word "none" as a *value* has nowhere here to say it.
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
    Schema.Union([Schema.String.check(Schema.isBetweenLength(0, max)), Schema.Null]),
  );

/** Whitespace, `""` and absent are one answer: nothing was said. */
const blank = (value: string | null | undefined): string | undefined => {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
};

/**
 * The keys that hold something, so an unset field is absent rather than a key
 * holding `undefined` — optional keys are omitted, not sent as `undefined`.
 */
const given = <K extends string>(
  fields: Record<K, string | undefined>,
): Partial<Record<K, string>> =>
  Object.fromEntries(
    Object.entries<string | undefined>(fields).filter(([, value]) => value !== undefined),
  ) as Partial<Record<K, string>>;

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
    "during play, the party, the Cast and the bestiary. Lexical: search for " +
    "the words the DM would have written, especially invented names. Use this " +
    "before answering anything about people, places, things or creatures. It " +
    "needs a word: to see the whole bestiary rather than search it, call " +
    "listCreatures.",
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
    query: Schema.String.check(Schema.isBetweenLength(0, 200)),
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
    "Every creature this campaign can put in a fight — the shared corpus, the " +
    "DM's own Library, and what the Shared World shares — by name. Use it to see what " +
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

const NPC_CONTEXT_LIMIT = 12;

const NpcContext = Schema.Struct({
  npcId: NpcId,
  name: Schema.String,
  role: Schema.String,
  derivedFrom: Schema.NullOr(NpcId),
  derivedFromVersion: Schema.NullOr(Schema.Int),
  derivedFromName: Schema.NullOr(Schema.String),
  persona: NpcPersona,
  privateMaterial: NpcPrivateMaterial,
  knowledge: Schema.Array(
    Schema.Struct({
      body: Schema.String,
      sourceLabel: Schema.String,
    }),
  ),
  memories: Schema.Array(Schema.Struct({ body: Schema.String })),
  /**
   * The DM's own prep: how the NPC stands toward the party, whether they are
   * about, where to find them, the night the party first met them and the
   * nights they were at the table. The creator's toolkits only — no other
   * toolkit has `getNpc`, and the NPC agent's prompt never reads it.
   */
  prep: NpcPrep,
  /**
   * The NPC's stat sheet — level, class, armour class, hit points, challenge
   * rating and the rules half of a character's document — or `null` when it
   * has none. The creator's toolkit only, as prep is: no other toolkit has
   * `getNpc`, and the NPC agent's prompt never reads the sheet.
   */
  sheet: Schema.NullOr(NpcSheet),
});

export const GetNpc = Tool.make("getNpc", {
  description:
    "Read one campaign NPC's bounded creator context by id: the campaign " +
    "instance's public persona, creator-only private material, active knowledge " +
    "facts, approved memories and the DM's prep (attitude toward the party, " +
    "status, whereabouts, the night the party first met them and the nights " +
    "they were at the table, as session ids listSessions names) and their stat " +
    "sheet when they have one (null when not). Take the id " +
    "from a searchCampaign hit whose " +
    "source is 'npc'. This reads the campaign snapshot, not the Library source, " +
    "and never includes NPC chat transcripts.",
  parameters: Schema.Struct({ npcId: NpcId }),
  success: NpcContext,
  failure: NotFound,
  failureMode: "return",
});

export const ProposeNpcAwareness = Tool.make("proposeNpcAwareness", {
  description:
    "Offer the DM a durable knowledge or memory candidate for one campaign NPC, " +
    "based on the campaign research you just performed. This creates only a " +
    "review row for the Cast screen; it does not change the NPC prompt, and the " +
    "NPC agent never receives your broad campaign tools. Use kind 'knowledge' " +
    "for stable facts the NPC knows; use kind 'memory' for something the NPC " +
    "will remember after creator approval. Copy the relevant source excerpt or " +
    "summary into sourceExcerpt because approval never reads through sourceId.",
  parameters: Schema.Struct({
    npcId: NpcId,
    kind: Schema.Literals(["knowledge", "memory"]),
    body: Schema.String.check(Schema.isBetweenLength(1, 4000)),
    sourceKind: NpcKnowledgeSourceKind,
    sourceId: optional(Schema.String.check(Schema.isUUID())),
    sourceLabel: Schema.String.check(Schema.isBetweenLength(0, 200)),
    sourceExcerpt: Schema.String.check(Schema.isBetweenLength(0, 2000)),
    rationale: Schema.String.check(Schema.isBetweenLength(0, 2000)),
  }),
  success: Schema.String,
  failure: toolFailure,
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
 * The group-context reads — on the DM's toolkit *and* the group toolkit.
 *
 * Both read only what the group-Hob boundary decision of 2026-09-01 grants:
 * the chronicle (copies admitted on purpose) and its accepted summary. A
 * campaign Hob with these can cite what the group has agreed happened without
 * ever holding a read into another creator's campaign — the entry was copied
 * when its creator shared it, and there is nothing else to reach.
 */
export const SearchSharedWorldHistory = Tool.make("searchSharedWorldHistory", {
  description:
    "Search the Shared World's chronicle — what its members have agreed " +
    "happened, across every campaign in it. Lexical: search for names and " +
    "words somebody would have written. Entries were shared on purpose; " +
    "campaign prep that was never shared is not in here.",
  parameters: Schema.Struct({
    query: Schema.String.check(Schema.isBetweenLength(0, 200)),
  }),
  success: Schema.Array(
    Schema.Struct({
      title: Schema.NullOr(Schema.String),
      body: Schema.String,
      /** ISO date of when it happened, or when it was admitted. */
      when: Schema.String,
    }),
  ),
  failure: toolFailure,
  failureMode: "return",
});

export const ReadSharedWorldSummary = Tool.make("readSharedWorldSummary", {
  description:
    "The Shared World's accepted running summary — the story so far across every " +
    "campaign, as its members last agreed it. One paragraph or a sentence " +
    "saying there is none yet.",
  success: Schema.String,
  failure: NotFound,
  failureMode: "return",
});

/**
 * The only source reader for a Story So Far refresh. Its result is already
 * copied into the Shared World Chronicle, and the handler remembers the exact
 * final sequence returned so the subsequent proposal cannot over-claim.
 */
export const ReadStorySoFarSources = Tool.make("readStorySoFarSources", {
  description:
    "Read the accepted Story So Far and every newer accepted Chronicle entry " +
    "in sequence. Call this immediately before proposing a Story So Far. This " +
    "contains no campaign prep, notes, plans, or draft conversations.",
  success: Schema.Struct({
    current: Schema.NullOr(Schema.String),
    entries: Schema.Array(
      Schema.Struct({
        worldSeq: Schema.Int,
        title: Schema.NullOr(Schema.String),
        body: Schema.String,
        when: Schema.String,
      }),
    ),
  }),
  failure: NotFound,
  failureMode: "return",
});

/**
 * The group toolkit's own reads: the campaigns, the played timeline, and one
 * night's story. These are the decision's *canonical events* made reachable —
 * played sessions, and the beats and finished fights their DMs shared — and
 * nothing of anybody's unplayed prep: `nightStory` refuses a planned session
 * exactly as it refuses a missing one, and no tool here can name a note, a
 * prep item or an encounter that never ran. What a DM kept hidden, and a fight
 * still on the table, is not in them (`GroupHistory.nightStory`).
 */
export const ListSharedWorldCampaigns = Tool.make("listSharedWorldCampaigns", {
  description:
    "The campaigns in this Shared World, each with who runs it. World-visible " +
    "metadata only — a campaign's own content belongs to its table.",
  success: Schema.Array(
    Schema.Struct({
      campaignId: CampaignId,
      name: Schema.String,
      runBy: Schema.String,
    }),
  ),
  failure: NotFound,
  failureMode: "return",
});

export const ListPlayedNights = Tool.make("listPlayedNights", {
  description:
    "Every night that has actually been played across this Shared World's " +
    "campaigns, oldest first — the world's canonical timeline. Planned " +
    "sessions are not in it. Take campaignId and sessionId to nightStory " +
    "for what happened on one of them.",
  success: Schema.Array(
    Schema.Struct({
      campaignId: CampaignId,
      campaign: Schema.String,
      sessionId: SessionId,
      number: Schema.Int,
      title: Schema.NullOr(Schema.String),
      started: Schema.String,
    }),
  ),
  failure: NotFound,
  failureMode: "return",
});

export const NightStory = Tool.make("nightStory", {
  description:
    "What happened on one played night, anywhere in the Shared World, as far " +
    "as its DM shared it: the DM's summary if the night itself is shared, the " +
    "shared story beats verbatim and each shared, " +
    "finished fight or scene by name, kind and outcome; a conversation, a " +
    "skill challenge or a hazard has no round. No numbers and no stat blocks — " +
    "outcomes, not mechanics. Take the ids from listPlayedNights.",
  parameters: Schema.Struct({
    campaignId: CampaignId,
    sessionId: SessionId,
  }),
  success: Schema.Struct({
    campaign: Schema.String,
    number: Schema.Int,
    title: Schema.NullOr(Schema.String),
    /** The DM's summary of the night, when they shared the night itself. */
    summary: Schema.NullOr(Schema.String),
    beats: Schema.Array(Schema.String),
    fights: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        kind: EncounterKind,
        round: Schema.NullOr(Schema.Int),
        outcome: Schema.Literals(["resolved", "carried"]),
      }),
    ),
  }),
  failure: NotFound,
  failureMode: "return",
});

export const ProposeSharedWorldEntry = Tool.make("proposeSharedWorldEntry", {
  description:
    "Offer the Shared World a line for its chronicle — a summary of events, " +
    "a connection between campaigns, a fact worth keeping. Only a " +
    "suggestion: nothing enters the chronicle unless a member accepts it.",
  parameters: Schema.Struct({
    // `optionalText`, not `optional`: a title is prose, and the sentinel that
    // rescues an unset enum would eat one genuinely called "None".
    title: optionalText(200),
    body: Schema.String.check(Schema.isBetweenLength(1, 4000)),
  }),
  success: Schema.String,
  failure: toolFailure,
  failureMode: "return",
});

export const ProposeStorySoFar = Tool.make("proposeStorySoFar", {
  description:
    "Offer a concise replacement for the Shared World's Story So Far. Call " +
    "readStorySoFarSources first and use only its accepted summary and Chronicle " +
    "entries. Nothing is remembered unless a member accepts the proposal.",
  parameters: Schema.Struct({
    text: Schema.String.check(Schema.isBetweenLength(1, 6000)),
  }),
  success: Schema.String,
  failure: toolFailure,
  failureMode: "return",
});

/**
 * The campaign's own story so far — the creator's toolkit's pair to the Shared
 * World's two above. The reader is the only source for a proposal: it hands
 * back the kept story and the ended nights after it, and the handler remembers
 * the newest night it showed, so the proposal cannot claim to cover a night
 * Hob never read. Beats are the DM's, flagged by whether the players were
 * shown them, because the *Previously* is read to the players.
 */
export const ReadCampaignStorySources = Tool.make("readCampaignStorySources", {
  description:
    "Read this campaign's current story so far and Previously, and every night " +
    "that has ended since it was written, oldest first: the DM's own summary of " +
    "the night when they kept one, its beats in the DM's words, each marked " +
    "whether the players were shown it, and how its fights and scenes ended. " +
    "Call this immediately before proposeCampaignStory.",
  success: Schema.Struct({
    current: Schema.NullOr(
      Schema.Struct({
        text: Schema.String,
        previously: Schema.NullOr(Schema.String),
        afterSession: Schema.Int,
      }),
    ),
    nights: Schema.Array(
      Schema.Struct({
        number: Schema.Int,
        title: Schema.NullOr(Schema.String),
        played: Schema.String,
        summary: Schema.NullOr(
          Schema.Struct({ text: Schema.String, shownToPlayers: Schema.Boolean }),
        ),
        beats: Schema.Array(Schema.Struct({ text: Schema.String, shownToPlayers: Schema.Boolean })),
        fights: Schema.Array(
          Schema.Struct({
            name: Schema.String,
            kind: EncounterKind,
            round: Schema.NullOr(Schema.Int),
            outcome: Schema.Literals(["resolved", "carried", "unfinished"]),
          }),
        ),
      }),
    ),
  }),
  failure: NotFound,
  failureMode: "return",
});

export const ProposeCampaignStory = Tool.make("proposeCampaignStory", {
  description:
    "Offer the DM a replacement for this campaign's story so far, and a short " +
    "Previously for them to read aloud to the players to open the next night. Call " +
    "readCampaignStorySources first and use only its current story and nights. Write " +
    "the Previously to the players, and leave out anything the players were not " +
    "shown. Nothing is saved unless the DM accepts it.",
  parameters: Schema.Struct({
    text: Schema.String.check(Schema.isBetweenLength(1, CAMPAIGN_STORY_MAX)),
    // `optionalText`, not `optional`: it is prose, and the sentinel that
    // rescues an unset enum would eat a Previously that said "None".
    previously: optionalText(CAMPAIGN_PREVIOUSLY_MAX),
  }),
  success: Schema.String,
  failure: toolFailure,
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
    "Offer the DM a prep note to save — a description, a place, a scene, or " +
    "read-aloud text to read out at the table. A new person for the Cast is " +
    "proposeNpc, not a note. It is only a suggestion: nothing " +
    "is saved unless the DM accepts it. Write the whole note in `body`; do not " +
    "repeat it in your reply.",
  parameters: Schema.Struct({
    title: Schema.String.check(Schema.isBetweenLength(1, 120)),
    body: Schema.String.check(Schema.isBetweenLength(1, 4000)),
    /** Read-aloud is a kind of note, not a table — see `NoteKind`. */
    readAloud: optional(Schema.Boolean),
    /**
     * What the note is about, when it is plainly one of these; left out
     * otherwise, and the DM can choose one later. Independent of `readAloud`.
     */
    category: optional(NoteCategory),
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
    body: Schema.String.check(Schema.isBetweenLength(1, 1000)),
  }),
  success: Schema.String,
  failure: proposalFailure,
  failureMode: "return",
});

/**
 * A summary of one played night, kept on the night once the DM accepts it.
 *
 * The creator's toolkit alone has it: the player's and the drafting ones write
 * a character, the account's a campaign, Shared World Hob the world's own
 * record, and an NPC speaks as a character. The session is a parameter because
 * the panel may be asked about any night; the handler binds it to this
 * campaign through the creator's own read.
 */
export const ProposeNightSummary = Tool.make("proposeNightSummary", {
  description:
    "Offer the DM a summary of one played night for the Chronicle: a few sentences " +
    "about what happened, in the order it happened, drawn only from what sessionRecap " +
    "returns for that night. Take the session id from listSessions. Only a suggestion: " +
    "nothing is kept unless the DM accepts it. Write the whole summary in `summary`; do " +
    "not repeat it in your reply.",
  parameters: Schema.Struct({
    sessionId: SessionId,
    summary: Schema.String.check(Schema.isBetweenLength(1, 4000)),
  }),
  success: Schema.String,
  failure: proposalFailure,
  failureMode: "return",
});

/** How many lines a planned night's checklist may carry. */
const NIGHT_PREP_MAX = 12;

/**
 * A night, planned: its title, the lines of its "Before you sit down"
 * checklist, and an act it starts when the DM asked for one.
 *
 * The creator's toolkit alone has it, for `proposeNightSummary`'s reason:
 * only the creator makes a night. There is no number parameter: the night is
 * numbered one past the highest the campaign has when the DM keeps it, so
 * after any night already planned, and a kept night is planned, not open,
 * until *Start the night* opens it (the earliest planned first). A night
 * already on `listSessions` is never edited by this tool.
 */
export const ProposeNight = Tool.make("proposeNight", {
  description:
    "Offer the DM a new planned session: a short title when there is one, and the " +
    "prep checklist for it — each line one thing to do or have ready before the party " +
    'sits down ("Reread the ferryman\'s note", "Print the salt road map"). Set ' +
    "actTitle only when the DM asked for this session to start a new act. It is numbered " +
    "after every session on listSessions, including any already planned and not started; " +
    "nothing already on listSessions changes. Only a suggestion: " +
    "nothing is saved unless the DM accepts it. Say one short line about it and stop.",
  parameters: Schema.Struct({
    title: optionalText(120),
    prep: optional(
      Schema.Array(Schema.String.check(Schema.isBetweenLength(0, 500))).check(
        Schema.isMaxLength(NIGHT_PREP_MAX),
      ),
    ),
    actTitle: optionalText(ACT_TITLE_MAX),
  }),
  success: Schema.String,
  failure: proposalFailure,
  failureMode: "return",
});

/**
 * A new act on the Chronicle, starting at a night the campaign already has
 * and running until the next act. The creator's alone, as the act's own
 * create is; the handler reads the nights and the acts through the creator's
 * reads, so a night the campaign does not have, or one that already starts
 * an act, is refused in words the model can act on.
 */
export const ProposeAct = Tool.make("proposeAct", {
  description:
    'Offer the DM a new act for the Chronicle: a title ("Act II · The heist") and ' +
    "the session number it starts at, from listSessions. The act runs from that session " +
    "until the next act. Leave sessionNumber out to start it at the newest session. To " +
    "start an act at a session not planned yet, use proposeNight with actTitle instead. " +
    "Only a suggestion: nothing is saved unless the DM accepts it. Say one short line " +
    "about it and stop.",
  parameters: Schema.Struct({
    title: Schema.String.check(Schema.isBetweenLength(1, ACT_TITLE_MAX)),
    sessionNumber: optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000 }))),
  }),
  success: Schema.String,
  failure: proposalFailure,
  failureMode: "return",
});

export const ProposeEncounter = Tool.make("proposeEncounter", {
  description:
    "Offer the DM an encounter to save. Set kind to the one the DM asked for: " +
    "combat (a fight, the default), social (a conversation), challenge (a skill " +
    "challenge) or hazard. A fight is built from creatures this campaign can use " +
    "— see listCreatures; the other kinds may have creatures too, or none. Find " +
    "each creature with searchCampaign (source 'creature') and use the id from " +
    "the hit — do not invent one, and do not propose a creature you have not " +
    "found. Give a setting when you can: one line on what the place looks like " +
    "from above, with no creatures in it; the encounter's battle map is drawn " +
    "from it. Give tactics — a few short lines on how to run it — and treasure " +
    "when there is any. Only a challenge and a hazard take numbers: a challenge " +
    "needs dc, successes and failures, and may say onSuccess and onFailure (what " +
    "happens when the party makes it, and when it goes wrong); a hazard needs " +
    "saveAbility and dc, and may give onFail and duration; either may name " +
    "skills. For combat and social leave dc, successes, failures, onSuccess, " +
    "onFailure, saveAbility, onFail, duration and skills out: a social " +
    "encounter's checks and what they lead to go in tactics, one line each " +
    '("DC 14 Persuasion: he waves them through"). Only a suggestion; nothing ' +
    "is saved unless the DM accepts it, and nothing is offered unless this tool " +
    "says it offered it.",
  parameters: Schema.Struct({
    name: Schema.String.check(Schema.isBetweenLength(1, 120)),
    kind: optional(EncounterKind),
    tags: optional(Schema.Array(Schema.String.check(Schema.isBetweenLength(1, 40)))),
    /**
     * The battle map's setting line, bounded as the form bounds it. The one
     * thing the map is drawn from, so the card shows it before the DM accepts.
     */
    setting: optionalText(ENCOUNTER_SETTING_MAX),
    /** Absent or empty for a scene with nobody in it; a fight is refused one. */
    creatures: optional(
      Schema.Array(
        Schema.Struct({
          creatureId: CreatureId,
          count: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 })),
        }),
      ).check(Schema.isMaxLength(12)),
    ),
    tactics: optional(
      Schema.Array(Schema.String.check(Schema.isBetweenLength(0, ENCOUNTER_TACTIC_MAX))).check(
        Schema.isMaxLength(ENCOUNTER_TACTICS_MAX),
      ),
    ),
    treasure: optionalText(ENCOUNTER_TREASURE_MAX),
    /**
     * The challenge's numbers, flat rather than one nested object, for the
     * reason every parameter here is flat. `dc` is a skill challenge's check DC
     * and a hazard's save DC; which the rest must be is the kind's.
     */
    dc: optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 30 }))),
    successes: optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))),
    failures: optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))),
    onSuccess: optionalText(ENCOUNTER_OUTCOME_MAX),
    onFailure: optionalText(ENCOUNTER_OUTCOME_MAX),
    saveAbility: optional(AbilityKey),
    onFail: optionalText(ENCOUNTER_HAZARD_TEXT_MAX),
    duration: optionalText(ENCOUNTER_HAZARD_TEXT_MAX),
    skills: optional(
      Schema.Array(Schema.String.check(Schema.isBetweenLength(0, ENCOUNTER_SKILL_MAX))).check(
        Schema.isMaxLength(ENCOUNTER_SKILLS_MAX),
      ),
    ),
  }),
  success: Schema.String,
  failure: proposalFailure,
  failureMode: "return",
});

/** What `proposeEncounter` says a challenge with, before the kind has sorted it. */
interface ChallengeParameters {
  readonly dc?: number | null | undefined;
  readonly successes?: number | null | undefined;
  readonly failures?: number | null | undefined;
  readonly onSuccess?: string | null | undefined;
  readonly onFailure?: string | null | undefined;
  readonly saveAbility?: AbilityKey | null | undefined;
  readonly onFail?: string | null | undefined;
  readonly duration?: string | null | undefined;
  readonly skills?: ReadonlyArray<string> | null | undefined;
}

/**
 * A `proposeEncounter` refusal, ending in what the model has to hear most:
 * nothing reached the DM. A model told only what was wrong went on to tell the
 * DM a social encounter was ready to view, over a card that never came.
 */
const notOffered = (why: string) =>
  new Conflict({
    message:
      `${why}. Nothing was offered to the DM — call proposeEncounter again with that ` +
      "fixed, and do not say an encounter is ready until it says it offered one.",
  });

/**
 * {@link notOffered} for the two planning tools: the same refusal, naming the
 * tool to call again.
 */
const notPlanned = (tool: "proposeNight" | "proposeAct", why: string) =>
  new Conflict({
    message: `${why}. Nothing was offered to the DM — call ${tool} again with that fixed.`,
  });

/**
 * An encounter's free text, with the words that mean "nothing here" read as
 * nothing.
 *
 * {@link optionalText} keeps "None" because a character's background may
 * really be called that; nothing an encounter says in prose can be. Treasure
 * "None" is no treasure, and an outcome "null" is the string an XML tool-call
 * template sends for a string parameter it was told may be null (see
 * {@link ABSENT_WORDS}). Read as a value, it made every such call a challenge
 * the kind could not take, and refused a social encounter that said nothing
 * of the sort.
 */
const proseOf = (value: string | null | undefined): string | undefined => {
  const text = blank(value);
  return text === undefined || (ABSENT_WORDS as ReadonlyArray<string>).includes(text)
    ? undefined
    : text;
};

/** Lines a model wrote, trimmed, with the blanks and the repeats taken out. */
const linesOf = (lines: ReadonlyArray<string> | null | undefined): ReadonlyArray<string> => {
  const kept: Array<string> = [];
  for (const raw of lines ?? []) {
    const line = proseOf(raw);
    if (line !== undefined && !kept.includes(line)) kept.push(line);
  }
  return kept;
};

/**
 * The parameters in `fields` a call gave, or left out, by name, as a sentence
 * lists them: what a refusal tells the model to change.
 */
const named = (fields: Readonly<Record<string, unknown>>, which: "given" | "missing"): string =>
  listed(
    Object.entries(fields)
      .filter(([, value]) => (value !== undefined) === (which === "given"))
      .map(([name]) => name),
  );

const listed = (names: ReadonlyArray<string>): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/**
 * The challenge a `proposeEncounter` call describes, or the sentence that
 * tells the model what to change.
 *
 * A refusal rather than a guess: a skill challenge with no DC is one the DM
 * would have to finish before running, and numbers sent with a fight or a
 * conversation belong to no field it has — dropping them would lose what the
 * model said. Nothing sent at all is a challenge not yet set out, which the DM
 * can write.
 *
 * **Each refusal names the parameters that were wrong and what to do instead**,
 * because the model is the only reader and it acts on the words. A social
 * encounter is the one a model most often gets wrong this way — a conversation
 * naturally has a Persuasion DC — and a refusal that only said what the kind
 * lacks left it with nothing to do but tell the DM a card was ready that never
 * came.
 */
const challengeFrom = (
  kind: EncounterKind,
  given: ChallengeParameters,
): { readonly challenge: EncounterChallenge | undefined } | { readonly refused: string } => {
  const skills = linesOf(given.skills);
  const dc = absent(given.dc);
  const successes = absent(given.successes);
  const failures = absent(given.failures);
  const onSuccess = proseOf(given.onSuccess);
  const onFailure = proseOf(given.onFailure);
  const saveAbility = absent(given.saveAbility);
  const onFail = proseOf(given.onFail);
  const duration = proseOf(given.duration);
  const said = [dc, successes, failures, onSuccess, onFailure, saveAbility, onFail, duration].some(
    (value) => value !== undefined,
  );
  if (!said && skills.length === 0) return { challenge: undefined };
  switch (kind) {
    case "challenge": {
      const misplaced = named({ saveAbility, onFail, duration }, "given");
      if (
        dc === undefined ||
        successes === undefined ||
        failures === undefined ||
        misplaced !== ""
      ) {
        const missing = named({ dc, successes, failures }, "missing");
        return {
          refused:
            "a challenge takes dc, successes and failures, and may give onSuccess, " +
            "onFailure and skills" +
            (missing === "" ? "" : `; give ${missing}`) +
            (misplaced === "" ? "" : `; leave out ${misplaced}, which are a hazard's`),
        };
      }
      return {
        challenge: {
          kind,
          dc,
          successes,
          failures,
          skills,
          ...(onSuccess === undefined ? {} : { onSuccess }),
          ...(onFailure === undefined ? {} : { onFailure }),
        },
      };
    }
    case "hazard": {
      const misplaced = named({ successes, failures, onSuccess, onFailure }, "given");
      if (saveAbility === undefined || dc === undefined || misplaced !== "") {
        const missing = named({ saveAbility, dc }, "missing");
        return {
          refused:
            "a hazard takes saveAbility and dc, and may give onFail, duration and skills" +
            (missing === "" ? "" : `; give ${missing}`) +
            (misplaced === "" ? "" : `; leave out ${misplaced}, which are a challenge's`),
        };
      }
      return {
        challenge: {
          kind,
          save: { ability: saveAbility, dc },
          ...(onFail === undefined ? {} : { onFail }),
          ...(duration === undefined ? {} : { duration }),
          skills,
        },
      };
    }
    default:
      return {
        refused:
          `a ${encounterKindLabel(kind).toLowerCase()} encounter has no challenge, so leave ` +
          `out ${named(
            {
              dc,
              successes,
              failures,
              onSuccess,
              onFailure,
              saveAbility,
              onFail,
              duration,
              skills: skills.length === 0 ? undefined : skills,
            },
            "given",
          )}. Put its checks and what they lead to in tactics, one line each ` +
          '("DC 14 Persuasion: he waves them through") — or, if it is really a skill ' +
          "challenge or a hazard, set kind to challenge or hazard",
      };
  }
};

/**
 * The six abilities and the campaign's classes, races and backgrounds are all
 * `packages/api/src/Ruleset.ts`'s shapes — imported above, not restated here.
 *
 * Each option label is a closed enum rather than free text when the vocabulary
 * fits, and `proposeCharacter` is where being strict pays: the published JSON
 * schema becomes a fixed vocabulary, which an endpoint that compiles it into a
 * grammar can hold the model to. A model that wrote `"Wisdom"` would otherwise
 * produce an ability nothing on a sheet can match up with a saving throw, and
 * one that wrote `"Wood Elf"` a race nothing can seed from.
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
export const proposeCharacterOver = (vocabulary: CharacterVocabulary, rules: DraftRules) =>
  Tool.make("proposeCharacter", {
    description:
      "Offer the player a character sheet built from what they described. Give " +
      "them a name, then a race, a class and a background. " +
      `${nameSentence(rules, "race", "race", vocabulary.race)} ` +
      `${nameSentence(rules, "class", "classes", vocabulary.classes)} ` +
      `${nameSentence(rules, "background", "backgrounds", vocabulary.backgrounds)} ` +
      "If the race has a subrace, put that subrace in subrace; put a class specialty " +
      "like circle of the moon in subclass. Rank the " +
      "six abilities most important first, name up to four skills, write a " +
      "short backstory in their own register, and put one or two sentences on how " +
      "they look in appearance: age, build, hair, skin, eyes, clothing, one " +
      "distinguishing mark. Do not give scores, modifiers, hit " +
      "points, armour class or a level — the standard array is applied for you " +
      "and the starting numbers are worked out from the class, race and subrace. Only " +
      "a suggestion: nothing is saved unless the player accepts it. Say one " +
      "short line about it and stop.",
    parameters: Schema.Struct({
      name: Schema.String.check(Schema.isBetweenLength(1, 120)),
      /**
       * The race and the class — **this campaign's own vocabulary**, as a
       * closed enum wherever it fits in one.
       *
       * They were free text of up to sixty characters, then the bundled ten and
       * twelve as module-level `Schema.Literals`, and now they are the words
       * `Options.list` answered for *this* campaign. The gain of a closed
       * vocabulary is not tidiness: a class is the only thing that carries a hit
       * die, so *"which one"* is the question that lets the three numbers below
       * be seeded at all — and a model writing `"Circle of the Moon Druid"`
       * produces a label nothing can look a die up against, which is what the
       * free-text bound allowed and what the enum ended.
       *
       * What slice 2 changed is *whose* words they are. A campaign's classes are
       * a read, so the schema is built when the read happens — see
       * {@link CharacterVocabulary} for why that is worth a per-request toolkit,
       * and {@link nameSchema} for the three shapes this takes.
       *
       * Both required, unlike every other parameter here: a character has a
       * class and a race, this is the one call whose whole job is to say
       * which, and an empty arm would be an escape a small model reaches for
       * under pressure. The description names the same two lists, built from the
       * same two arrays, so the prompt and the grammar cannot drift.
       */
      race: nameSchema(vocabulary.race),
      /** Optional, and must be one of the subraces contained by the race. */
      subrace: optionalText(OPTION_NAME_MAX),
      className: nameSchema(vocabulary.classes),
      /** `"Circle of the Land (Marsh)"` — the drawn tagline's unowned half. */
      subclass: optionalText(80),
      /**
       * The background — **the campaign's vocabulary too, and required like the
       * other two rather than the prose optional it used to be.**
       *
       * It was `optionalText(80)`, back when a background was only a line on the
       * sheet. In the 2014 ruleset it is a rules entry: proficiencies,
       * languages, equipment, gold and feature text. Required is also the
       * cheaper call for a small model here, because the enum makes it a *pick*
       * rather than something to invent: the measured hazard on this tier is
       * inventing, not choosing.
       *
       * A campaign with no backgrounds written down gets free text, which is
       * what {@link nameSchema} does with an empty list and is what this
       * parameter has always been.
       */
      background: nameSchema(vocabulary.backgrounds),
      /**
       * Six ability keys, most important first — **a ranking, not scores.**
       *
       * Short of six is repaired rather than refused (see `abilitiesFrom`),
       * which is why the check allows an empty array: a schema refusal here
       * happens before any handler runs and cannot be read by the model.
       */
      abilityOrder: Schema.Array(AbilityKey).check(Schema.isBetweenLength(0, 6)),
      skills: optional(
        Schema.Array(Schema.String.check(Schema.isBetweenLength(1, 40))).check(
          Schema.isBetweenLength(0, 8),
        ),
      ),
      backstory: Schema.String.check(Schema.isBetweenLength(0, 4000)),
      bond: optionalText(400),
      ideal: optionalText(400),
      flaw: optionalText(400),
      /**
       * How they look — the one line a portrait is drawn from verbatim
       * (`@taverns/api`'s `Portrait.ts`), since the backstory never is.
       */
      appearance: optionalText(APPEARANCE_MAX),
      /** Starting kit, as item names. It becomes `sheet.inventory`. */
      kit: optional(
        Schema.Array(Schema.String.check(Schema.isBetweenLength(1, 80))).check(
          Schema.isBetweenLength(0, 20),
        ),
      ),
      /** Spell ids from listStartingSpells. Cantrips are always ready. */
      cantrips: optional(Schema.Array(SpellId).check(Schema.isBetweenLength(0, 8))),
      /** Leveled spell ids known, or in a wizard's spellbook. */
      spells: optional(Schema.Array(SpellId).check(Schema.isBetweenLength(0, 20))),
      /** Leveled spell ids prepared for prepared casters and wizards. */
      preparedSpells: optional(Schema.Array(SpellId).check(Schema.isBetweenLength(0, 20))),
      /**
       * Why these choices — one short line each, the drawn *What Hob did* aside.
       *
       * Asked for explicitly rather than left to the reply, because it is the
       * one part of a draft the player has to be able to argue with, and a
       * sentence buried in prose above the card is not that.
       */
      rationale: optional(
        Schema.Array(Schema.String.check(Schema.isBetweenLength(1, 400))).check(
          Schema.isBetweenLength(0, 8),
        ),
      ),
    }),
    success: Schema.String,
    failure: proposalFailure,
    failureMode: "return",
  });

/**
 * What a drafted NPC sheet is composed from: labels, a level and a ranking.
 * {@link ProposeNpcSheet}'s and {@link ProposeNpc}'s, spelled once so the two
 * tools ask the model the same question and hand the same answer to one
 * composer (`composeNpcSheet`, in `dmHandlersFor`).
 */
const npcSheetFields = {
  className: Schema.String.check(Schema.isBetweenLength(1, OPTION_NAME_MAX)),
  level: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })),
  race: optionalText(OPTION_NAME_MAX),
  /** Optional, and must be one of the subraces contained by the race. */
  subrace: optionalText(OPTION_NAME_MAX),
  subclass: optionalText(80),
  background: optionalText(OPTION_NAME_MAX),
  /** `"1/4"` — the ratings the XP table knows, as the sheet's column does. */
  cr: optional(ChallengeRating),
  /** Six ability keys, most important first; repaired as `proposeCharacter`'s is. */
  abilityOrder: Schema.Array(AbilityKey).check(Schema.isBetweenLength(0, 6)),
};
const NpcSheetDraftInput = Schema.Struct(npcSheetFields);

/**
 * What Hob offers a **creator**: a sheet for one of their NPCs, built the way
 * a character's is.
 *
 * `proposeCharacter`'s design one row over. It takes labels, a level and a
 * ranking — never a score, a hit point or a feature — and the handler composes
 * the document through `startingSheetBody`, the one assembly the character
 * form and `proposeCharacter` share, at the level the model named rather than
 * `STARTING_LEVEL`: an NPC is met already made.
 *
 * ### Free text, refused in words, because the creator's toolkit is static
 *
 * The labels are bounded free text rather than {@link nameSchema}'s enum. The
 * creator's toolkit is module-level so a DM's question costs no vocabulary
 * read; building it per request for one tool would spend that read on every
 * question. The handler reads the campaign's options instead and refuses a
 * name it does not have with the list to pick from ({@link notAnOption}), the
 * round it costs being paid only by a draft that missed. With nothing of a
 * kind written down the label stays as written, as a character's does.
 *
 * ### One sheet per NPC, replaced only when asked
 *
 * An NPC with a sheet is refused unless `replace` is set, and the model is
 * told to set it only when the DM asked for a replacement. The card then says
 * what it replaces, and the accept is the creator's PUT with the version the
 * draft read, so a sheet edited by hand since the offer refuses the keep.
 */
export const ProposeNpcSheet = Tool.make("proposeNpcSheet", {
  description:
    "Offer the DM a stat sheet for one of this campaign's NPCs, built like a " +
    "character's. Take npcId from a searchCampaign hit whose source is 'npc'. Name " +
    "the class and the level (1 to 20), and a race, subrace, subclass, background " +
    "and challenge rating when they fit; use this campaign's own class, race and " +
    "background names — a name it does not have is refused with the list to pick " +
    "from. Rank the six abilities most important first. Do not give scores, " +
    "modifiers, hit points, armour class or features: the standard array is " +
    "applied and everything else is worked out from the class, race and level. " +
    "An NPC that already has a sheet is refused unless the DM asked you to replace " +
    "it; only then set replace to true. Only a suggestion: nothing is saved unless " +
    "the DM accepts it. Say one short line about it and stop.",
  parameters: Schema.Struct({
    npcId: NpcId,
    ...npcSheetFields,
    /** Only when the DM asked to replace the sheet the NPC already has. */
    replace: optional(Schema.Boolean),
    /** Why these choices, one short line each. */
    rationale: optional(
      Schema.Array(Schema.String.check(Schema.isBetweenLength(1, 400))).check(
        Schema.isBetweenLength(0, 8),
      ),
    ),
  }),
  success: Schema.String,
  failure: proposalFailure,
  failureMode: "return",
});

/**
 * What Hob offers a **creator**: a new NPC for the campaign's cast.
 *
 * The fields are the Cast drawer's — name, role, voice and manner, what they
 * want, the secret — beside the persona's summary and the appearance line the
 * portrait is drawn from, and the DM's prep that fits a person nobody has met
 * yet: attitude, status, whereabouts. The bounds are the wire's
 * (`NpcPersona`, `NpcPrivateMaterial`, `NpcPrepUpdate`), so a draft that fits
 * here fits the row. There is no visibility: a kept NPC joins the cast hidden
 * from the table, and sharing it is the DM's call.
 *
 * `sheet` is {@link ProposeNpcSheet}'s parameters without the NPC, composed
 * by the same handler code (`composeNpcSheet`), and only when the DM asked
 * for stats. A name a live NPC of the cast already has is refused, so "give
 * Grusk stats" cannot become a second Grusk.
 */
export const ProposeNpc = Tool.make("proposeNpc", {
  description:
    "Offer the DM a new NPC for this campaign's Cast: a name, and a role, a " +
    "one-paragraph summary, how they look (the line their portrait is drawn from), " +
    "their voice and manner, what they want, and a secret only the DM sees, when " +
    "they fit. Set attitude, status and whereabouts only when the DM said them or " +
    "they are plainly part of the ask. Add a sheet only when the DM asked for stats: " +
    "name its class and level and rank the abilities, exactly as proposeNpcSheet " +
    "takes them. For an NPC already in the Cast, use proposeNpcSheet or getNpc " +
    "instead. Only a suggestion: nothing is saved unless the DM accepts it. Say one " +
    "short line about it and stop.",
  parameters: Schema.Struct({
    name: Schema.String.check(Schema.isBetweenLength(1, 80)),
    /** "the ferryman at the crossing" — the Cast card's subtitle. */
    role: optionalText(120),
    summary: optionalText(2000),
    /** How they look, in a sentence or two: what the portrait is drawn from first. */
    appearance: optionalText(APPEARANCE_MAX),
    /** How the DM plays them at the table. */
    manner: optionalText(600),
    wants: optionalText(600),
    /** DM only: what the party does not know yet. */
    secret: optionalText(4000),
    attitude: optional(NpcAttitude),
    status: optional(NpcStatus),
    whereabouts: optionalText(NPC_WHEREABOUTS_MAX),
    sheet: optional(NpcSheetDraftInput),
  }),
  success: Schema.String,
  failure: proposalFailure,
  failureMode: "return",
});

/** One line of a campaign's vocabulary, as {@link ListOptions} reads it out. */
const OptionLine = Schema.Struct({
  kind: OptionKind,
  /** The label, exactly as `proposeCharacter` must spell it back. */
  name: Schema.String,
  /** Present only on race rows; subraces are contained by this parent race. */
  subraces: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * The campaign's vocabulary, read out — **only offered above
 * {@link OPTION_ENUM_CAP}**, and this is the fallback the design names.
 *
 * It is `listCreatures` one table across, and it exists for the identical
 * measured reason: a model that cannot enumerate a corpus dead-ends, guesses,
 * and concludes correctly that it cannot make the call. Under the cap it is
 * absent rather than idle, because a toolkit is what the model is *shown* and a
 * third tool is a third thing to spend a round reaching for — which on a budget
 * of four is the whole cost this design was chosen to avoid.
 *
 * **All three kinds in one call**, deliberately: a per-kind tool would cost a
 * round each, and the point of the fallback is that it costs exactly one.
 *
 * It takes no parameters, exactly as `listSessions` and `listCreatures` do —
 * "what can this campaign build a character from" has nothing to get wrong.
 */
export const ListOptions = Tool.make("listOptions", {
  description:
    "Every class, race and background a character in this campaign can be built from — " +
    "the shared bundle, plus what is shared to this table's Shared World. Use it " +
    "before proposeCharacter, and copy a `name` back exactly as it came.",
  success: Schema.Array(OptionLine),
  failure: NotFound,
  failureMode: "return",
});

/**
 * {@link ListOptions} for drafting with no campaign: the same line, said about
 * the core rules, which is all there is to read out on that surface.
 */
export const CoreListOptions = Tool.make("listOptions", {
  description:
    "Every class, race and background in the core rules a character can be built from. " +
    "Use it before proposeCharacter, and copy a `name` back exactly as it came.",
  success: Schema.Array(OptionLine),
  failure: NotFound,
  failureMode: "return",
});

const StartingSpellLine = Schema.Struct({
  spellId: SpellId,
  name: Schema.String,
  level: Schema.Int,
  school: Schema.String,
  list: Schema.Literals(["class", "subclass"]),
  ritual: Schema.Boolean,
  concentration: Schema.Boolean,
  note: Schema.String,
});

const startingSpellsParameters = Schema.Struct({
  className: Schema.String.check(Schema.isBetweenLength(1, OPTION_NAME_MAX)),
  subclass: optionalText(80),
});

const startingSpellsSuccess = Schema.Struct({
  mode: Schema.Literals(["none", "known", "prepared", "spellbook"]),
  limits: Schema.Struct({
    cantripsKnown: Schema.optional(Schema.Int),
    spellsKnown: Schema.optional(Schema.Int),
    prepared: Schema.optional(Schema.Int),
  }),
  spells: Schema.Array(StartingSpellLine),
});

export const ListStartingSpells = Tool.make("listStartingSpells", {
  description:
    "List the cantrips and 1st-level spells this proposed level-1 class can start with, " +
    "using the same campaign-visible spell list as the sheet picker. Call this before " +
    "proposeCharacter for a caster, then copy spellId values into cantrips, spells and " +
    "preparedSpells. The campaign is already chosen by the request; do not invent spell ids.",
  parameters: startingSpellsParameters,
  success: startingSpellsSuccess,
  failure: NotFound,
  failureMode: "return",
});

/** {@link ListStartingSpells} over the core rules' spells, for drafting with no campaign. */
export const CoreListStartingSpells = Tool.make("listStartingSpells", {
  description:
    "List the cantrips and 1st-level spells this proposed level-1 class can start with " +
    "in the core rules. Call this before proposeCharacter for a caster, then copy spellId " +
    "values into cantrips, spells and preparedSpells. Do not invent spell ids.",
  parameters: startingSpellsParameters,
  success: startingSpellsSuccess,
  failure: NotFound,
  failureMode: "return",
});

/**
 * The DM's campaign toolkit.
 *
 * Its reads are shipped repository methods that already carry the visibility
 * seam: search, the session list, the recap, creatures, NPCs, the combat log
 * and group chronicle reads. A read that would need new SQL is a decision for
 * whoever owns the repositories.
 *
 * **`listCreatures` is a defect fix rather than a capability.** Until it
 * existed there was no way to ask what a campaign *has*: the only reach into
 * the bestiary was lexical and needed a word, so a model told to build an
 * encounter guessed nouns off the campaign's name, got nothing back every time,
 * and concluded — correctly, per the tool descriptions it had been given — that
 * it could not propose one. That is measured, on two models, and it is the
 * reason "build me an encounter" came back as prose. `Creatures.list` was
 * already shipped and already predicated; only the tool was missing.
 *
 * The write-shaped tools are review only: campaign proposals go through the
 * ordinary Hob accept path, and NPC awareness lands in Cast for creator review.
 * Both halves are listed in `apps/server/test/hob.test.ts`, so changing the
 * toolkit is a visible edit — as is changing {@link PlayerToolkit}.
 */
const DirectResourceSpendResult = Schema.Struct({ message: Schema.NonEmptyString });

const directTargetSummary = (target: HobDirectResourceTarget): string =>
  `${target.key}: ${quoted(target.characterName)} — ${quoted(target.resourceName)} ` +
  `(${String(target.max - target.used)} of ${String(target.max)} left)`;

/**
 * Hob's direct-write extension for a live fight whose DM explicitly enabled it.
 *
 * Built from the current resource rows so the model gets an enum, not a free
 * text resource id. The target values are opaque handles for this request; the
 * handler maps them back to combatant, character and resource ids and then the
 * repository re-checks the live fight and the switch before moving anything.
 */
export const directResourceToolkitOver = (context: HobDirectResourceContext) => {
  const targetKeys = context.targets.map((target) => target.key) as [string, ...Array<string>];
  const SpendCharacterResource = Tool.make("spendCharacterResource", {
    description:
      "Spend an existing character resource during the live fight, only when the DM asks for it. " +
      "Use this for counters like Second Wind, Lay on Hands, Divine Sense, spell slots or hit dice; " +
      "do not use it for hit points, notes, new content, or guesses. Pick one of these exact targets: " +
      context.targets.map(directTargetSummary).join("; "),
    parameters: Schema.Struct({
      target: Schema.Literals(targetKeys),
      amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10000 })),
    }),
    success: DirectResourceSpendResult,
    failure: toolFailure,
    failureMode: "return" as const,
  });

  return Toolkit.make(
    SearchCampaign,
    ListSessions,
    ListCreatures,
    ReadRecap,
    GetCreature,
    GetNpc,
    ProposeNpcAwareness,
    ReadSessionLog,
    SearchSharedWorldHistory,
    ReadSharedWorldSummary,
    ReadCampaignStorySources,
    ProposeNote,
    ProposeBeat,
    ProposeNightSummary,
    ProposeNight,
    ProposeAct,
    ProposeEncounter,
    ProposeCampaignStory,
    ProposeNpc,
    ProposeNpcSheet,
    SpendCharacterResource,
  );
};

export const HobToolkit = Toolkit.make(
  SearchCampaign,
  ListSessions,
  ListCreatures,
  ReadRecap,
  GetCreature,
  GetNpc,
  ProposeNpcAwareness,
  ReadSessionLog,
  // The group context, read-only: what the group has agreed happened, so a
  // campaign's Hob can answer "what happened at the other table" exactly as
  // far as that table's creator shared it — and no further.
  SearchSharedWorldHistory,
  ReadSharedWorldSummary,
  // The campaign's own story so far: one source reader and one proposal, the
  // Shared World's Story So Far pattern kept to this table's nights. The
  // creator's alone — no other toolkit reads or drafts it.
  ReadCampaignStorySources,
  ProposeNote,
  ProposeBeat,
  ProposeNightSummary,
  // The next night with its checklist, and an act on the Chronicle: the
  // creator's alone, as making a night or an act by hand is.
  ProposeNight,
  ProposeAct,
  ProposeEncounter,
  ProposeCampaignStory,
  // A new NPC for the cast, and an NPC's stat sheet built like a character's:
  // the creator's alone, as `getNpc`, which reads both back, is.
  ProposeNpc,
  ProposeNpcSheet,
);

/**
 * What **group** Hob is offered: the canonical record and one proposal.
 *
 * A third toolkit rather than the DM's narrowed, for the reason the player's
 * is: a toolkit is what the provider is shown. Group Hob has never heard of
 * `getCreature`, `sessionRecap` or any campaign write — its whole world is
 * what the group-Hob boundary decision grants, and the one thing it can offer
 * is a chronicle line, accepted by a member through `Proposals.acceptSharedWorld`.
 */
export const SharedWorldToolkit = Toolkit.make(
  SearchSharedWorldHistory,
  ReadSharedWorldSummary,
  ReadStorySoFarSources,
  ListSharedWorldCampaigns,
  ListPlayedNights,
  NightStory,
  ProposeSharedWorldEntry,
  ProposeStorySoFar,
);

/**
 * What a **player** is offered: one read and one proposal — built per request,
 * because one of the two is shaped by the campaign it was asked in.
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
 * - **`proposeCharacter`** is the point of the surface, and since slice 2 it is
 *   built from {@link CharacterVocabulary} rather than from a module-level
 *   literal — so a DM's homebrew class is in the grammar the model is held to
 *   at *their* table and at no other.
 *
 * The other seven are out, each for its own reason rather than by omission.
 * `getCreature` is a stat block, which is precisely what the product says a
 * player must not have. `sessionRecap` and `sessionLog` need a `CampaignCreatorActor` and
 * are two of the three DM-only projections. `listSessions`, `listCreatures`,
 * `proposeNote`, `proposeBeat` and `proposeEncounter` are all the DM's campaign
 * to shape — a player cannot write a note or an encounter through the API
 * either, so offering to draft one would be a card whose *Save* could only
 * fail.
 *
 * ### Why this is two functions rather than one with a flag
 *
 * The two shapes carry **different tools**, so they are different types, and
 * `Toolkit` is invariant in its tool record — one function returning either
 * would return a union nothing can bind. Two builders and one branch at the
 * call site is the honest form of that, and it keeps the cost visible where the
 * choice is made rather than buried behind a boolean.
 *
 * Everything else about them is identical, including the handlers: it is the
 * *schema* that varies with the campaign and nothing else, which is the one
 * constraint the design put on itself — a tool surface that varied for any
 * other reason would fragment prompt caching for no gain.
 */
export const playerToolkitOver = (vocabulary: CharacterVocabulary) =>
  Toolkit.make(SearchCampaign, ListStartingSpells, proposeCharacterOver(vocabulary, "campaign"));

/** {@link playerToolkitOver} above the cap: the same three, plus the listing. */
export const playerToolkitListing = (vocabulary: CharacterVocabulary) =>
  Toolkit.make(
    SearchCampaign,
    ListOptions,
    ListStartingSpells,
    proposeCharacterOver(vocabulary, "campaign"),
  );

/**
 * **The drafting toolkit with no campaign** — the player's, over the core
 * rules, minus `searchCampaign`.
 *
 * There is no campaign record to search and no Shared World to read, so the
 * toolkit holds nothing that reads one: `listStartingSpells` over
 * `Spells.forDraft(null, …)` and `proposeCharacter` over `Options.core`, both
 * `coreRulesUsable`, the same predicate the create form's core pickers read.
 * A tool that could reach a campaign is absent, not refused.
 */
export const coreToolkitOver = (vocabulary: CharacterVocabulary) =>
  Toolkit.make(CoreListStartingSpells, proposeCharacterOver(vocabulary, "core"));

/** {@link coreToolkitOver} above the cap: the same two, plus the listing. */
export const coreToolkitListing = (vocabulary: CharacterVocabulary) =>
  Toolkit.make(CoreListOptions, CoreListStartingSpells, proposeCharacterOver(vocabulary, "core"));

/** A Shared World the asker may start a campaign in: live member, not archived. */
export interface CampaignWorld {
  readonly id: SharedWorldId;
  readonly name: string;
}

/**
 * `proposeCampaign`, built per request over **the asker's own Shared Worlds**,
 * for the reason `proposeCharacter` is built over a vocabulary: the worlds a
 * campaign may start in are a read, and the model should be held to them.
 *
 * The fields are the ones `NewCampaignDialog` writes (name, party name, the
 * pitch its one cover is drawn from, where it lives), and the accept writes
 * them through the same `campaignCreateFrom`. `sharedWorld` is a name rather
 * than an id: names are what a small model can copy, and the handler resolves
 * it against the same list the enum was built from. With no worlds it is free
 * text that any value but absence is refused through, so the answer is always
 * a standalone campaign.
 */
export const proposeCampaignOver = (worlds: ReadonlyArray<CampaignWorld>) => {
  const names = [...new Set(worlds.map((world) => world.name))];
  return Tool.make("proposeCampaign", {
    description:
      "Offer them a new campaign — a tabletop game they will run — built from what " +
      "they described: a name, a party name if one fits, and a short pitch in " +
      "description (the setting, the premise and the tone, in a few sentences; its " +
      "cover picture is drawn from it). " +
      (names.length === 0
        ? "They are in no Shared World, so leave sharedWorld out; it will be a " +
          "standalone campaign. "
        : "It is a standalone campaign unless they ask for it to be part of one of " +
          `their Shared Worlds: then put that world in sharedWorld, one of ${names
            .map(quoted)
            .join(", ")}, spelled exactly like that. `) +
      "Only a suggestion: nothing is made unless they keep it. Say one short line " +
      "about it and stop.",
    parameters: Schema.Struct({
      name: Schema.String.check(Schema.isBetweenLength(1, 120)),
      partyName: optionalText(120),
      description: optionalText(CAMPAIGN_DESCRIPTION_MAX),
      sharedWorld: optional(nameSchema(names)),
    }),
    success: Schema.String,
    failure: proposalFailure,
    failureMode: "return",
  });
};

type CampaignDraft = Tool.Parameters<ReturnType<typeof proposeCampaignOver>>;

/**
 * `proposeSharedWorld`: a new Shared World for the asker to own.
 *
 * The fields are the two `NewSharedWorldDialog` writes (a name, and the few
 * sentences its one cover is drawn from), and the accept writes them through
 * the same `sharedWorldCreateFrom`. Nothing about it is a read, so it is one
 * tool rather than one built per request: a world is founded empty, and
 * connecting campaigns to it is its owner's later act, never the draft's.
 */
export const ProposeSharedWorld = Tool.make("proposeSharedWorld", {
  description:
    "Offer them a new Shared World — a setting several of their campaigns can share, " +
    "with one Chronicle of what has happened in it — built from what they described: " +
    "a name, and a short description (the land, its age and its trouble, in a few " +
    "sentences; its cover picture is drawn from it). They will own it. It starts " +
    "with no campaigns; they connect or start those afterwards. Only a suggestion: " +
    "nothing is made unless they keep it. Say one short line about it and stop.",
  parameters: Schema.Struct({
    name: Schema.String.check(Schema.isBetweenLength(1, 120)),
    description: optionalText(SHARED_WORLD_DESCRIPTION_MAX),
  }),
  success: Schema.String,
  failure: proposalFailure,
  failureMode: "return",
});

/**
 * **The account's own panel** — Hob on every screen outside a campaign or
 * Shared World (`/me/hob` with no `intent`).
 *
 * The core drafting toolkit plus {@link proposeCampaignOver} and
 * {@link ProposeSharedWorld}, and nothing else: it has no campaign to read and
 * no Shared World record, so it can draft the three things an account makes
 * on its own — a character over the core rules, a new campaign and a new
 * Shared World. Campaign content (a note, an encounter) needs a campaign, and
 * a Chronicle entry needs a world; their tools are absent rather than refused.
 */
export const accountToolkitOver = (
  vocabulary: CharacterVocabulary,
  worlds: ReadonlyArray<CampaignWorld>,
) =>
  Toolkit.make(
    CoreListStartingSpells,
    proposeCharacterOver(vocabulary, "core"),
    proposeCampaignOver(worlds),
    ProposeSharedWorld,
  );

/** {@link accountToolkitOver} above the cap: the same four, plus the listing. */
export const accountToolkitListing = (
  vocabulary: CharacterVocabulary,
  worlds: ReadonlyArray<CampaignWorld>,
) =>
  Toolkit.make(
    CoreListOptions,
    CoreListStartingSpells,
    proposeCharacterOver(vocabulary, "core"),
    proposeCampaignOver(worlds),
    ProposeSharedWorld,
  );

/** The repositories a DM Hob tool call may reach — read-only, except the conditional direct counter writer. */
export interface HobRepositories {
  readonly search: (typeof Search)["Service"];
  readonly sessions: (typeof Sessions)["Service"];
  /** The campaign's acts, which `proposeAct` reads to refuse a night that already starts one. */
  readonly acts: (typeof Acts)["Service"];
  readonly recap: (typeof Recap)["Service"];
  readonly creatures: (typeof Creatures)["Service"];
  readonly npcs: (typeof Npcs)["Service"];
  readonly npcKnowledge: (typeof NpcKnowledge)["Service"];
  readonly npcMemories: (typeof NpcMemories)["Service"];
  readonly npcAwareness: (typeof NpcAwareness)["Service"];
  /** Each NPC's DM prep, which `getNpc` returns beside the persona. */
  readonly npcPreps: (typeof NpcPreps)["Service"];
  /**
   * Each NPC's stat sheet, which `getNpc` returns beside the prep and
   * `proposeNpcSheet` reads to know whether it would replace one.
   */
  readonly npcSheets: (typeof NpcSheets)["Service"];
  readonly events: (typeof SessionEvents)["Service"];
  /** The campaign's kept story so far, which a refresh starts from. */
  readonly stories: (typeof CampaignStories)["Service"];
  /** Slice 6's audited direct counter write, reached only by the conditional DM toolkit. */
  readonly directWrites?: (typeof HobDirectWrites)["Service"] | undefined;
  /**
   * The campaign's classes, races and backgrounds.
   *
   * **For a player, read once per question rather than inside a tool**: the
   * vocabulary decides the *shape* of `proposeCharacter`, so it has to be
   * known before the toolkit exists. `Hob.ask` makes that read where
   * `CurrentActor` is still ambient and where a `NotFound` is still a 404, and
   * hands the result down as a {@link CharacterVocabulary}. The creator's
   * toolkit is static, so `proposeNpcSheet` reads it inside its handler
   * instead, and only when a sheet is drafted.
   *
   * It is `Options.list`, the same method and the same `usableInCampaign` the
   * create form's own pickers read through, so an option Hob may offer is
   * exactly one the player could have picked by hand.
   */
  readonly options: (typeof Options)["Service"];
  /** The same rules answer the manual spell picker uses, before a draft is accepted. */
  readonly spells: (typeof Spells)["Service"];
  /**
   * The bundled equipment a drafted kit's names are resolved against
   * (`bundledNamed`), so a carried line the model spells the way the SRD does
   * lands linked to its row — the same link the starting kit writes — and a
   * name with no single bundled row stays exactly as typed.
   */
  readonly equipment: (typeof EquipmentRepo)["Service"];
  /**
   * The group's chronicle and summary — the two group-context reads on the
   * DM's toolkit, keyed on the proof's own `group`. Read-only like everything
   * else here; what it can answer is bounded by what was admitted, which is
   * the decision's whole design.
   */
  readonly history: (typeof GroupHistory)["Service"];
}

/** What group Hob's tools may reach. Read-only, every one, plus the slot. */
export interface SharedWorldHobRepositories {
  readonly history: (typeof GroupHistory)["Service"];
  readonly groups: (typeof Groups)["Service"];
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
export type SummaryCoverageSlot = Ref.Ref<number | undefined>;
/**
 * The newest ended night `readCampaignStorySources` showed this turn — what a
 * `proposeCampaignStory` covers. Unset until the sources are read.
 */
export type StoryCoverageSlot = Ref.Ref<number | undefined>;

const alreadyProposed = new Conflict({
  message:
    "you have already offered the DM something this turn — let them look at it " +
    "before offering anything else",
});

/**
 * Bind the toolkit to one campaign and one actor — as one proof of the pair.
 *
 * **The `CampaignCreatorActor` is the whole security story, and no part of it comes from the
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
 * this one with a weaker proof. The `CampaignCreatorActor` is still what gates the two log
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

/** `searchSharedWorldHistory`, bound — shared by the DM's toolkit and the group's. */
const searchHistoryWith =
  (
    history: (typeof GroupHistory)["Service"],
    groupId: Parameters<(typeof GroupHistory)["Service"]["search"]>[0],
    as: <A, E>(effect: Effect.Effect<A, E, CurrentActor>) => Effect.Effect<A, E>,
  ) =>
  ({ query }: { readonly query: string }) =>
    query.trim() === ""
      ? Effect.fail(
          new Conflict({
            message:
              "searchSharedWorldHistory needs a word to look for. To read the whole " +
              "story so far, call readSharedWorldSummary; for the timeline, listPlayedNights.",
          }),
        )
      : Effect.map(as(history.search(groupId, query.trim())), (entries) =>
          entries.map((entry) => ({
            title: entry.title,
            body: entry.body,
            when: (entry.occurredAt ?? entry.acceptedAt).toString(),
          })),
        );

const summaryWith =
  (
    history: (typeof GroupHistory)["Service"],
    groupId: Parameters<(typeof GroupHistory)["Service"]["summary"]>[0],
    as: <A, E>(effect: Effect.Effect<A, E, CurrentActor>) => Effect.Effect<A, E>,
  ) =>
  () =>
    Effect.map(as(history.summary(groupId)), (summary) =>
      summary === null
        ? "The Shared World has no accepted summary yet — the chronicle's entries are the record."
        : summary.text,
    );

export type AwarenessSlot = Ref.Ref<ReadonlyArray<NpcAwarenessDraft>>;

export const dmHandlersFor = (
  repositories: HobRepositories,
  dm: CampaignCreatorActor,
  proposal: ProposalSlot,
  awareness: AwarenessSlot,
  storyCoverage: StoryCoverageSlot,
) => {
  const { actor, campaign: campaignId } = dm;
  const { as, offer } = bind(actor, proposal);

  /**
   * An NPC sheet's draft, composed — `proposeNpcSheet`'s and `proposeNpc`'s
   * one path from the model's labels to the document, so an NPC drafted with
   * stats and a sheet drafted for one already in the cast cannot disagree.
   */
  const composeNpcSheet = ({
    className,
    level,
    race,
    subrace,
    subclass,
    background,
    cr,
    abilityOrder,
  }: typeof NpcSheetDraftInput.Type) =>
    Effect.gen(function* () {
      /**
       * The labels, read back as the rows they name through `optionNamed`,
       * against the same `Options.list` a player's draft and the sheet's
       * own pickers read. A kind the campaign has nothing of keeps the
       * label as written; a kind it has refuses a miss with the list.
       */
      const options = yield* as(repositories.options.list(campaignId, {}));
      const vocabulary = vocabularyOf(options);
      const namedRace = blank(race);
      const namedSubrace = blank(subrace);
      const namedBackground = blank(background);
      const classOption = optionNamed(options, "class", className);
      const raceOption =
        namedRace === undefined ? undefined : optionNamed(options, "race", namedRace);
      const backgroundOption =
        namedBackground === undefined
          ? undefined
          : optionNamed(options, "background", namedBackground);
      const subraceOption = subraceEntryOf(raceOption, namedSubrace);
      if (classOption === undefined && vocabulary.classes.length > 0) {
        return yield* notAnOption("class", className, vocabulary.classes);
      }
      if (namedRace !== undefined && raceOption === undefined && vocabulary.race.length > 0) {
        return yield* notAnOption("race", namedRace, vocabulary.race);
      }
      if (
        namedBackground !== undefined &&
        backgroundOption === undefined &&
        vocabulary.backgrounds.length > 0
      ) {
        return yield* notAnOption("background", namedBackground, vocabulary.backgrounds);
      }
      if (namedSubrace !== undefined && namedRace === undefined) {
        return yield* new Conflict({
          message: `a subrace needs its race: name the race "${namedSubrace}" belongs to, or leave subrace out.`,
        });
      }
      if (namedSubrace !== undefined && raceOption !== undefined && subraceOption === undefined) {
        return yield* notASubrace("campaign", raceOption.name, namedSubrace);
      }

      // The campaign's own spelling where a label resolved, the model's
      // where it did not — the rule a character's labels follow.
      const labels = {
        className: classOption?.name ?? className,
        race: namedRace === undefined ? null : (raceOption?.name ?? namedRace),
        subrace: namedSubrace === undefined ? null : (subraceOption?.name ?? namedSubrace),
      };
      for (const label of Object.values(labels)) {
        if (label !== null && !Schema.is(SheetLabel)(label)) {
          return yield* new Conflict({
            message: `"${label}" is too long for a sheet, which takes names of up to 40 characters.`,
          });
        }
      }

      /**
       * The document, through `startingSheetBody` — the character form's
       * and `proposeCharacter`'s one assembly — at the level the model
       * named: every feature to that level, its slots and hit dice, the
       * kit's side (a), and the seed's armour class and hit points at that
       * level.
       */
      const { body, seed } = startingSheetBody({
        classOption: asClassOption(classOption),
        raceOption: asRaceOption(raceOption),
        subrace: namedSubrace,
        backgroundOption: asBackgroundOption(backgroundOption),
        background: backgroundOption?.name ?? namedBackground,
        subclass: blank(subclass),
        level,
        abilities: abilitiesFrom(abilityOrder),
        raceBonusChoices: raceChoiceBonuses(raceEntryOf(raceOption), abilityOrder),
      });
      return {
        level: seed.level,
        ...labels,
        ac: seed.ac,
        hpMax: seed.hpMax ?? null,
        cr: absent(cr) ?? null,
        sheet: body,
      };
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
    searchCampaign: searchWith(repositories, campaignId, as),
    listSessions: () => as(repositories.sessions.list(campaignId)),
    listCreatures: () =>
      Effect.map(
        // Ordered by name and capped, which is the reading policy and not a
        // narrowing: the predicate is `usableInCampaign`, exactly as the
        // encounter picker's own list is. The cap is stated in the tool's
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
    getNpc: ({ npcId }) =>
      Effect.gen(function* () {
        const npc = yield* repositories.npcs.findById(dm, npcId);
        if (npc.archivedAt !== null) return yield* new NotFound({ resource: "npc", id: npcId });
        const [knowledge, memories, prep, sheet] = yield* Effect.all([
          repositories.npcKnowledge.activeForPrompt(dm, npcId),
          repositories.npcMemories.approvedForPrompt(dm, npcId),
          repositories.npcPreps.find(dm, npcId),
          repositories.npcSheets.find(dm, npcId),
        ]);
        return {
          npcId: npc.id,
          name: npc.name,
          role: npc.role,
          derivedFrom: npc.derivedFrom,
          derivedFromVersion: npc.derivedFromVersion,
          derivedFromName: npc.derivedFromName,
          persona: npc.persona,
          privateMaterial: npc.privateMaterial,
          knowledge: knowledge.slice(0, NPC_CONTEXT_LIMIT).map((fact) => ({
            body: fact.body,
            sourceLabel: fact.sourceLabel,
          })),
          memories: memories.slice(0, NPC_CONTEXT_LIMIT).map((memory) => ({ body: memory.body })),
          prep,
          sheet,
        };
      }),
    sessionLog: ({ sessionId, since }) =>
      repositories.events.list(dm, sessionId, { since: absent(since), limit: LOG_LIMIT }),

    proposeNpcAwareness: (params) => {
      const draft: NpcAwarenessDraft = {
        npcId: params.npcId,
        kind: params.kind,
        body: params.body,
        sourceKind: params.sourceKind,
        sourceId: absent(params.sourceId) ?? null,
        sourceLabel: params.sourceLabel,
        sourceExcerpt: params.sourceExcerpt,
        rationale: params.rationale,
      };
      return Effect.gen(function* () {
        const valid = yield* repositories.npcAwareness.validateDraft(dm, draft);
        yield* Ref.update(awareness, (items) => [...items, valid]);
        return `Queued a ${valid.kind} candidate for this NPC. The Cast screen will ask the DM to approve, edit or reject it.`;
      });
    },

    // The group context, keyed on the proof's own group — not a parameter, for
    // the same reason the campaign is not one.
    searchSharedWorldHistory: searchHistoryWith(repositories.history, dm.group, as),
    readSharedWorldSummary: summaryWith(repositories.history, dm.group, as),

    // The kept story and the nights ended after it, each told from the DM's
    // own recap: the same read `sessionRecap` makes, reduced to what a story
    // is made of. The newest night shown is what a proposal will cover.
    readCampaignStorySources: () =>
      Effect.gen(function* () {
        const story = yield* repositories.stories.read(dm);
        const after = story?.afterSessionNumber ?? 0;
        const sessions = yield* as(repositories.sessions.list(campaignId));
        const ended = sessions
          .filter((session) => session.endedAt !== null && session.number > after)
          .sort((a, b) => a.number - b.number)
          .slice(0, STORY_NIGHT_LIMIT);
        const nights = [];
        for (const session of ended) {
          const recap = yield* repositories.recap.read(dm, session.id);
          // A player is shown a night only while it is shared, and then its
          // summary and whichever of its beats are shared too.
          const nightShown = session.visibility === "shared";
          nights.push({
            number: session.number,
            title: session.title,
            played: (session.startedAt ?? session.endedAt ?? session.createdAt).toString(),
            summary:
              session.summary === null
                ? null
                : { text: session.summary, shownToPlayers: nightShown },
            beats: recap.beats.map((beat) => ({
              text: beat.body,
              shownToPlayers: nightShown && beat.visibility === "shared",
            })),
            fights: recap.fights.map(({ run }) => ({
              name: run.encounterName,
              kind: run.mode,
              round: run.mode === "combat" ? run.round : null,
              outcome: run.endedAt === null ? ("unfinished" as const) : run.endedReason,
            })),
          });
        }
        yield* Ref.set(storyCoverage, ended.at(-1)?.number ?? after);
        return {
          current:
            story === null
              ? null
              : {
                  text: story.text,
                  previously: story.previously,
                  afterSession: story.afterSessionNumber,
                },
          nights,
        };
      }),

    proposeCampaignStory: ({ text, previously }) =>
      Effect.flatMap(Ref.get(storyCoverage), (afterSessionNumber) => {
        if (afterSessionNumber === undefined) {
          return Effect.fail(
            new Conflict({
              message: "readCampaignStorySources before proposing the story so far",
            }),
          );
        }
        const story = blank(text);
        if (story === undefined) {
          return Effect.fail(new Conflict({ message: "the story so far needs some words" }));
        }
        const opening = blank(previously) ?? null;
        return offer(
          { target: "campaignStory", text: story, previously: opening, afterSessionNumber },
          `Offered the DM a story so far${opening === null ? "" : " and a Previously"}. ` +
            "Nothing is saved unless they accept it; say one short line about it and stop.",
        );
      }),

    proposeNote: ({ title, body, readAloud, category }) => {
      const topic = absent(category);
      return offer(
        {
          target: "note",
          title,
          body,
          kind: readAloud === true ? "read_aloud" : "note",
          ...(topic === undefined ? {} : { category: topic }),
        },
        `Offered the DM a note called "${title}". They can save it or discard it; ` +
          "say one short line about it and stop.",
      );
    },

    proposeNpcSheet: ({ npcId, replace, rationale, ...sheet }) =>
      Effect.gen(function* () {
        // The creator's own read, and `getNpc`'s rule: an archived NPC is not
        // one Hob drafts for.
        const npc = yield* repositories.npcs.findById(dm, npcId);
        if (npc.archivedAt !== null) return yield* new NotFound({ resource: "npc", id: npcId });
        const existing = yield* repositories.npcSheets.find(dm, npcId);
        if (existing !== null && replace !== true) {
          return yield* new Conflict({
            message:
              `${npc.name} already has a sheet (${existing.descriptor ?? "no class or level on it"}). ` +
              "Offer a new one only if the DM asked you to replace it, and then set replace " +
              "to true. Nothing reached the DM.",
          });
        }

        const draft = yield* composeNpcSheet(sheet);

        return yield* offer(
          {
            target: "npcSheet",
            npcId,
            npcName: npc.name,
            ...draft,
            replaces:
              existing === null
                ? null
                : { version: existing.version, descriptor: existing.descriptor },
            rationale: (rationale ?? []).map((line) => line.trim()).filter((line) => line !== ""),
          },
          `Offered the DM a level ${String(draft.level)} ${draft.className} sheet for ${npc.name}` +
            `${existing === null ? "" : ", replacing the one they have"}. Nothing is saved unless ` +
            "they accept it; say one short line about it and stop.",
        );
      }),

    proposeNpc: ({
      name,
      role,
      summary,
      appearance,
      manner,
      wants,
      secret,
      attitude,
      status,
      whereabouts,
      sheet,
    }) =>
      Effect.gen(function* () {
        const named = name.trim();
        if (named === "") {
          return yield* new Conflict({
            message: "an NPC needs a name: give them one. Nothing reached the DM.",
          });
        }
        // The live cast, through the creator's own read: a name somebody in
        // it already has is almost always the DM asking about them, which is
        // `proposeNpcSheet` or `getNpc`, not a second of them.
        const cast = yield* repositories.npcs.list(dm, {});
        const same = cast.find((npc) => npc.name.trim().toLowerCase() === named.toLowerCase());
        if (same !== undefined) {
          return yield* new Conflict({
            message:
              `${same.name} is already in the Cast (npcId ${same.id}). To give them stats, ` +
              "use proposeNpcSheet; for somebody new, pick a name that tells them apart. " +
              "Nothing reached the DM.",
          });
        }

        const drafted = absent(sheet);
        const composed = drafted === undefined ? null : yield* composeNpcSheet(drafted);

        // Only what Hob said, so a section it left out is absent rather than
        // blank — the persona's own rule for a section nobody opened.
        const identity = given({ summary: blank(summary), appearance: blank(appearance) });
        const voice = given({ manner: blank(manner) });
        const intent = given({ wants: blank(wants) });
        const secrets = blank(secret);
        const roleLine = blank(role);
        return yield* offer(
          {
            target: "npc",
            name: named,
            role: roleLine ?? "",
            persona: {
              ...(Object.keys(identity).length === 0 ? {} : { identity }),
              ...(Object.keys(voice).length === 0 ? {} : { voice }),
              ...(Object.keys(intent).length === 0 ? {} : { intent }),
            },
            privateMaterial: secrets === undefined ? {} : { secrets },
            prep: {
              attitude: absent(attitude) ?? null,
              status: absent(status) ?? null,
              whereabouts: blank(whereabouts) ?? null,
            },
            sheet: composed,
          },
          `Offered the DM ${named}${roleLine === undefined ? "" : `, ${roleLine}`}, for the Cast` +
            `${composed === null ? "" : `, with a level ${String(composed.level)} ${composed.className} sheet`}. ` +
            "Nothing is saved unless they accept it; say one short line about it and stop.",
        );
      }),

    proposeBeat: ({ body }) =>
      offer(
        { target: "beat", body },
        "Offered the DM a beat for tonight's session. They can save it or discard " +
          "it; say one short line about it and stop.",
      ),

    proposeNightSummary: ({ sessionId, summary }) =>
      Effect.gen(function* () {
        const text = summary.trim();
        if (text === "") {
          return yield* new Conflict({
            message: "a summary needs words — write a few sentences about the night",
          });
        }
        // The creator's own read, so a night of another campaign, or one
        // that is gone, is the `NotFound` the model can correct from
        // listSessions.
        const night = yield* as(repositories.sessions.findById(campaignId, sessionId));
        if (night.startedAt === null) {
          return yield* new Conflict({
            message:
              `session ${String(night.number)} has not been played yet, so there is ` +
              "nothing to summarise — pick a night from listSessions that has started",
          });
        }
        return yield* offer(
          { target: "nightSummary", sessionId: night.id, sessionNumber: night.number, text },
          `Offered the DM a summary of session ${String(night.number)} for the Chronicle. ` +
            "They can keep it or discard it; say one short line about it and stop.",
        );
      }),

    proposeNight: ({ title, prep, actTitle }) =>
      Effect.gen(function* () {
        const named = proseOf(title);
        const lines = linesOf(prep);
        const act = proseOf(actTitle);
        if (named === undefined && lines.length === 0) {
          return yield* notPlanned(
            "proposeNight",
            "a planned session needs a title or at least one prep line — give it what the " +
              "DM should do or have ready before the party sits down",
          );
        }
        // The creator's own read of the nights, only to tell the model which
        // number the night would take today and which are planned already;
        // the accept numbers it again.
        const nights = yield* as(repositories.sessions.list(campaignId));
        const number = nights.reduce((highest, night) => Math.max(highest, night.number), 0) + 1;
        const planned = nights
          .filter((night) => night.startedAt === null && night.endedAt === null)
          .map((night) => night.number)
          .sort((a, b) => a - b);
        return yield* offer(
          { target: "night", title: named ?? null, prep: lines, actTitle: act ?? null },
          `Offered the DM session ${String(number)}${named === undefined ? "" : `, "${named}"`}` +
            `${lines.length === 0 ? "" : `, with ${String(lines.length)} prep ${lines.length === 1 ? "line" : "lines"}`}` +
            `${act === undefined ? "" : `, starting the act "${act}"`}. ` +
            (planned.length === 0
              ? ""
              : `${planned.length === 1 ? "Session" : "Sessions"} ${planned.join(", ")} ` +
                `${planned.length === 1 ? "is" : "are"} already planned and not started, and ` +
                "Start the night opens the earliest first; this one would come after. ") +
            "Nothing is saved unless they accept it; say one short line about it and stop.",
        );
      }),

    proposeAct: ({ title, sessionNumber }) =>
      Effect.gen(function* () {
        const named = title.trim();
        if (named === "") {
          return yield* notPlanned("proposeAct", "an act needs a title — give it one");
        }
        // The creator's own reads: the nights, newest first, and the acts.
        const nights = yield* as(repositories.sessions.list(campaignId));
        const wanted = absent(sessionNumber);
        const night =
          wanted === undefined ? nights[0] : nights.find((row) => row.number === wanted);
        if (night === undefined) {
          return yield* notPlanned(
            "proposeAct",
            nights.length === 0
              ? "this campaign has no sessions yet, so an act has nowhere to start — plan the " +
                  "next session with proposeNight and give it an actTitle"
              : `there is no session ${String(wanted)} — pick one of ` +
                  `${nights.map((row) => String(row.number)).join(", ")} from listSessions, or ` +
                  "plan the next with proposeNight and an actTitle",
          );
        }
        const acts = yield* as(repositories.acts.list(campaignId));
        const starting = acts.find((act) => act.firstSessionNumber === night.number);
        if (starting !== undefined) {
          return yield* notPlanned(
            "proposeAct",
            `session ${String(night.number)} already starts the act "${starting.title}" — ` +
              "pick another session, or ask the DM whether to rename that one by hand",
          );
        }
        return yield* offer(
          { target: "act", title: named, firstSessionNumber: night.number },
          `Offered the DM the act "${named}", starting at session ${String(night.number)}. ` +
            "Nothing is saved unless they accept it; say one short line about it and stop.",
        );
      }),

    proposeEncounter: ({
      name,
      kind: given,
      tags,
      setting,
      creatures,
      tactics,
      treasure,
      ...challengeParameters
    }) =>
      Effect.gen(function* () {
        const kind = given ?? "combat";
        if (kind === "combat" && (creatures ?? []).length === 0) {
          return yield* notOffered(
            "a fight needs at least one creature — find them with searchCampaign; if " +
              "this is not a fight, set kind to social, challenge or hazard",
          );
        }
        const sorted = challengeFrom(kind, challengeParameters);
        if ("refused" in sorted) return yield* notOffered(sorted.refused);
        const lines = yield* roster(creatures ?? []);
        const settingLine = proseOf(setting);
        const tacticLines = linesOf(tactics);
        const treasureLine = proseOf(treasure);
        const count = lines.reduce((total, line) => total + line.count, 0);
        const what =
          kind === "combat"
            ? "an encounter"
            : `a ${encounterKindLabel(kind).toLowerCase()} encounter`;
        return yield* offer(
          {
            target: "encounter",
            name,
            tags: tags ?? [],
            ...(settingLine === undefined ? {} : { setting: settingLine }),
            kind,
            ...(tacticLines.length === 0 ? {} : { tactics: tacticLines }),
            ...(treasureLine === undefined ? {} : { treasure: treasureLine }),
            ...(sorted.challenge === undefined ? {} : { challenge: sorted.challenge }),
            roster: lines,
          },
          `Offered the DM ${what} called "${name}"` +
            (count === 0 ? "" : `, with ${count} ${count === 1 ? "creature" : "creatures"}`) +
            ". They can save it or discard it; say one short line about it and stop — " +
            "the card is already on their screen.",
        );
      }),
  });
};

/**
 * Bind the DM toolkit plus the direct spend tool for the one live fight that
 * enabled it.
 *
 * The direct targets are closed over from the repository read above, not passed
 * as ids in tool parameters. The model sees opaque handles and an amount; the
 * handler maps the handle back to the combatant, character and resource rows,
 * and the repository re-checks the live fight and the switch before writing.
 */
export const dmBindWithDirect = (
  repositories: HobRepositories,
  dm: CampaignCreatorActor,
  proposal: ProposalSlot,
  awareness: AwarenessSlot,
  storyCoverage: StoryCoverageSlot,
  context: HobDirectResourceContext,
  threadId: AssistantThreadId,
  turnId: AssistantTurnId,
  touchedDirect: Ref.Ref<boolean>,
) => {
  const directWrites = repositories.directWrites;
  if (directWrites === undefined) {
    return Effect.die(new Error("direct writes were enabled without a repository"));
  }
  const toolkit = directResourceToolkitOver(context);
  const targetByKey = new Map(context.targets.map((target) => [target.key, target] as const));
  return Effect.flatMap(
    toolkit.toHandlers(
      toolkit.of({
        ...dmHandlersFor(repositories, dm, proposal, awareness, storyCoverage),
        spendCharacterResource: (params, call) => {
          const { target, amount } = params as { readonly target: string; readonly amount: number };
          const resolved = targetByKey.get(target);
          if (resolved === undefined) {
            return Effect.fail(new NotFound({ resource: "character_resource", id: target }));
          }
          return Effect.map(
            Effect.tap(
              directWrites.spendResource(dm, {
                threadId,
                turnId,
                toolCallId: call.toolCallId,
                sessionId: resolved.sessionId,
                runId: resolved.runId,
                combatantId: resolved.combatantId,
                characterId: resolved.characterId,
                characterName: resolved.characterName,
                resourceId: resolved.resourceId,
                amount,
              }),
              () => Ref.set(touchedDirect, true),
            ),
            ({ message }) => ({ message }),
          );
        },
      }),
    ),
    (bound) => Effect.provideContext(toolkit, bound),
  );
};

export const groupHandlersFor = (
  repositories: SharedWorldHobRepositories,
  actor: Actor,
  groupId: Parameters<(typeof GroupHistory)["Service"]["search"]>[0],
  proposal: ProposalSlot,
  summaryCoverage: SummaryCoverageSlot,
) => {
  const { as, offer } = bind(actor, proposal);

  return SharedWorldToolkit.of({
    searchSharedWorldHistory: searchHistoryWith(repositories.history, groupId, as),
    readSharedWorldSummary: summaryWith(repositories.history, groupId, as),
    readStorySoFarSources: () =>
      Effect.flatMap(as(repositories.history.summarySources(groupId)), (sources) =>
        Effect.as(Ref.set(summaryCoverage, sources.lastWorldSeq), {
          current: sources.summary?.text ?? null,
          entries: sources.entries.map((entry) => ({
            worldSeq: entry.worldSeq,
            title: entry.title,
            body: entry.body,
            when: (entry.occurredAt ?? entry.acceptedAt).toString(),
          })),
        }),
      ),
    listSharedWorldCampaigns: () =>
      Effect.map(as(repositories.groups.campaigns(groupId)), (cards) =>
        cards.map((card) => ({
          campaignId: card.id,
          name: card.name,
          runBy: card.creatorName,
        })),
      ),
    listPlayedNights: () =>
      Effect.map(as(repositories.history.playedNights(groupId)), (nights) =>
        nights.map((night: PlayedNight) => ({
          campaignId: night.campaignId,
          campaign: night.campaignName,
          sessionId: night.sessionId,
          number: night.number,
          title: night.title,
          started: night.startedAt.toString(),
        })),
      ),
    nightStory: ({ campaignId, sessionId }) =>
      Effect.map(as(repositories.history.nightStory(groupId, campaignId, sessionId)), (story) => ({
        campaign: story.campaignName,
        number: story.number,
        title: story.title,
        summary: story.summary,
        beats: story.beats,
        fights: story.fights.map((fight) => ({
          name: fight.name,
          kind: fight.mode,
          round: fight.mode === "combat" ? fight.round : null,
          outcome: fight.outcome,
        })),
      })),
    proposeSharedWorldEntry: ({ title, body }) =>
      offer(
        { target: "sharedWorldHistory", title: blank(title) ?? null, body },
        "Offered the Shared World a line for its chronicle. Nothing is saved unless a " +
          "member accepts it; say one short line about it and stop.",
      ),
    proposeStorySoFar: ({ text }) =>
      Effect.flatMap(Ref.get(summaryCoverage), (lastWorldSeq) =>
        lastWorldSeq === undefined
          ? Effect.fail(
              new Conflict({
                message: "readStorySoFarSources before proposing the Story So Far",
              }),
            )
          : offer(
              { target: "sharedWorldSummary", text, lastWorldSeq },
              "Offered a Story So Far. Nothing is saved unless a Shared World member " +
                "accepts it; say one short line about it and stop.",
            ),
      ),
  });
};

/**
 * What a `proposeCharacter` call carries, **derived from the tool rather than
 * restated.**
 *
 * The handler is written once and bound to two toolkits, so its parameter needs
 * a name — and the one thing it must not be is a second copy of the fifteen
 * fields above. `Tool.Parameters` reads it off the tool, and the tool is built
 * from {@link CharacterVocabulary}, so this follows the schema automatically.
 *
 * The vocabulary does not reach it: both name parameters erase to `string`
 * ({@link nameSchema}), which is exactly right — a label is a label whether it
 * came from a grammar or from a listing, and `HobProposal` has stored one as a
 * string since before either existed.
 */
type CharacterDraft = Tool.Parameters<ReturnType<typeof proposeCharacterOver>>;

/** What a drafted character's spells are read against, closed over by its caller. */
type SpellsForDraft = (draft: {
  readonly className?: string | undefined;
  readonly subclassName?: string | undefined;
  readonly level: number;
  readonly sheet: CharacterSheet;
}) => Effect.Effect<CharacterSpellRules, NotFound, CurrentActor>;

/**
 * The race's numbers, out of a row `optionNamed` returned — what the ability
 * ranking's bonus choice is read against. `undefined` in, `undefined` out.
 */
const raceEntryOf = (option: CharacterOption | undefined): RaceEntry | undefined =>
  option !== undefined && isRaceOption(option) ? option.body : undefined;

const subraceEntryOf = (
  option: CharacterOption | undefined,
  label: string | undefined,
): SubraceEntry | undefined =>
  option !== undefined && isRaceOption(option) && label !== undefined
    ? subraceNamed(option.body, label)
    : undefined;

const raceChoiceBonuses = (
  race: RaceEntry | undefined,
  abilityOrder: ReadonlyArray<AbilityKey>,
): ReadonlyArray<AbilityBonus> => {
  if (race === undefined) return [];
  const choice = race.abilityBonusChoice;
  if (choice === undefined) return [];
  const allowed = new Map(choice.bonuses.map((bonus) => [bonus.ability, bonus]));
  const fixed = new Set(race.abilityBonuses.map((bonus) => bonus.ability));
  const picked: Array<AbilityBonus> = [];
  for (const ability of abilityOrder) {
    const bonus = allowed.get(ability);
    if (bonus === undefined || fixed.has(ability)) continue;
    if (picked.some((item) => item.ability === ability)) continue;
    picked.push(bonus);
    if (picked.length >= choice.choose) break;
  }
  return picked;
};

/**
 * A label the campaign does not have, refused where the model can hear it.
 *
 * **Only reachable above {@link OPTION_ENUM_CAP}.** Under the cap the name came
 * out of the grammar, so it is in the list by construction; a near miss there is
 * a *decode* failure and is `Hob.ts`'s `recover`'s to handle. With nothing
 * written down there is no list to be outside of, and the seed degrades exactly
 * as an unmatched free-text label already does.
 *
 * So this is the listing mode's own recovery, shaped after `searchCampaign`'s
 * empty-query refusal: a `Conflict` naming the tool that answers what the model
 * was reaching for, charged to the round budget like any other.
 */
const notInVocabulary = (rules: DraftRules, kind: OptionKind, label: string) =>
  new Conflict({
    message:
      `"${label}" is not a ${kind} ${rulesPlace(rules)}. Call listOptions and copy a ` +
      "name back exactly as it comes, spelling and all.",
  });

/**
 * A label the creator's campaign does not have, refused with the names it
 * does — `proposeNpcSheet`'s own recovery, since its labels are free text
 * (see {@link ProposeNpcSheet}). Every name is listed, escaped as the
 * grammar would escape it ({@link quoted}): the creator's toolkit has no
 * `listOptions`, so this refusal is the one place the model reads them.
 */
const notAnOption = (kind: OptionKind, label: string, names: ReadonlyArray<string>) =>
  new Conflict({
    message:
      `"${label}" is not a ${kind} in this campaign. Pick one of ` +
      `${names.map(quoted).join(", ")}, spelled exactly like that.`,
  });

const notASubrace = (rules: DraftRules, race: string, subrace: string) =>
  new Conflict({
    message: `"${subrace}" is not a subrace of "${race}" ${rulesPlace(rules)}. Pick one contained by that race or leave subrace blank.`,
  });

const unavailableSpell = (spellId: SpellId) =>
  new Conflict({
    message:
      `spell ${spellId} is not available for this class at level 1. Call ` +
      "listStartingSpells and copy spellId values from it.",
  });

const tooManySpells = (problems: ReadonlyArray<string>) =>
  new Conflict({ message: problems.join(" ") });

const dedupeSpellIds = (ids: ReadonlyArray<SpellId>): ReadonlyArray<SpellId> => {
  const seen = new Set<string>();
  const kept: Array<SpellId> = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    kept.push(id);
  }
  return kept;
};

const spellRowsFor = (
  book: CharacterSpellRules,
  picks: {
    readonly cantrips?: ReadonlyArray<SpellId> | null;
    readonly spells?: ReadonlyArray<SpellId> | null;
    readonly preparedSpells?: ReadonlyArray<SpellId> | null;
  },
): Effect.Effect<ReadonlyArray<SpellKnown>, Conflict> => {
  const byId = spellById(book);
  const rowFor = (id: SpellId, prepared = false): Effect.Effect<SpellKnown, Conflict> => {
    const option = byId.get(id);
    if (option === undefined) return Effect.fail(unavailableSpell(id));
    return Effect.succeed(spellKnownFor(option, prepared));
  };

  return Effect.gen(function* () {
    if (book.mode === "none") return [];
    const knownRows: Array<SpellKnown> = [];
    for (const id of dedupeSpellIds(
      (picks.cantrips ?? []).filter((id) => byId.get(id)?.spell.level === 0),
    )) {
      knownRows.push(yield* rowFor(id));
    }

    const leveled = dedupeSpellIds(
      (picks.spells ?? []).filter((id) => byId.get(id)?.spell.level !== 0),
    );
    const prepared = dedupeSpellIds(
      (picks.preparedSpells ?? []).filter((id) => byId.get(id)?.spell.level !== 0),
    );
    const preparedSet = new Set(prepared);

    if (book.mode === "known") {
      for (const id of leveled) knownRows.push(yield* rowFor(id));
    } else if (book.mode === "prepared") {
      for (const id of prepared.length === 0 ? leveled : prepared) {
        knownRows.push(yield* rowFor(id, true));
      }
    } else if (book.mode === "spellbook") {
      for (const id of dedupeSpellIds([...leveled, ...prepared])) {
        knownRows.push(yield* rowFor(id, preparedSet.has(id)));
      }
    }

    // Anything mentioned but filtered out by level still has to be reported;
    // otherwise an invented level-4 id is silently ignored and the model thinks
    // it made a choice. Use the same book the picker uses as the authority.
    for (const id of [
      ...(picks.cantrips ?? []),
      ...(picks.spells ?? []),
      ...(picks.preparedSpells ?? []),
    ]) {
      if (!byId.has(id)) return yield* unavailableSpell(id);
    }

    const problems = spellSelectionProblems(book, knownRows);
    if (problems.length > 0) return yield* tooManySpells(problems);
    return knownRows;
  });
};

/**
 * The same idea for a player: one campaign, one plain `Actor`, three tools — and
 * the campaign's own vocabulary, which is what one of the two is built from.
 *
 * **There is no proof to take, and none is missing.** A `CampaignCreatorActor` answers *is
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
 * player toolkit to build once per question, from the DM proof it already asks for.
 *
 * **The vocabulary arrives already read**, for the reason `HobRepositories.options`
 * states: it decides the shape of a tool, so it cannot be read from inside one.
 * It is also the same list `listOptions` reads out, so the tool and the grammar
 * cannot disagree about what this campaign has.
 */
export const playerHandlersFor = (
  repositories: HobRepositories,
  actor: Actor,
  campaignId: CampaignId,
  proposal: ProposalSlot,
  vocabulary: CharacterVocabulary,
) => ({
  searchCampaign: searchWith(repositories, campaignId, bind(actor, proposal).as),
  ...draftingHandlersFor(repositories, actor, proposal, vocabulary, "campaign", (draft) =>
    repositories.spells.forDraft(campaignId, draft),
  ),
});

/**
 * {@link playerHandlersFor} with no campaign: the drafting half alone, over
 * the core rules. `Hob.askDraft` reads the vocabulary through `Options.core`,
 * and the spells come from `Spells.forDraft(null, …)` (`vocabularyAt` with no table), so nothing here can name a
 * campaign or a Shared World.
 */
export const coreHandlersFor = (
  repositories: DraftingRepositories,
  actor: Actor,
  proposal: ProposalSlot,
  vocabulary: CharacterVocabulary,
) =>
  draftingHandlersFor(repositories, actor, proposal, vocabulary, "core", (draft) =>
    repositories.spells.forDraft(null, draft),
  );

/** What the drafting half reads: the spells and the bundled kit names. */
export type DraftingRepositories = Pick<HobRepositories, "spells" | "equipment">;

/**
 * The three drafting handlers both character surfaces share: `listOptions`,
 * `listStartingSpells` and `proposeCharacter`. One implementation, so a
 * character drafted at a table and one drafted with no campaign are composed
 * by the same code over a different vocabulary and spell list (`rules`,
 * `spellsFor`).
 */
const draftingHandlersFor = (
  repositories: DraftingRepositories,
  actor: Actor,
  proposal: ProposalSlot,
  vocabulary: CharacterVocabulary,
  rules: DraftRules,
  spellsFor: SpellsForDraft,
) => {
  const { as, offer } = bind(actor, proposal);

  return {
    listOptions: () =>
      Effect.succeed(
        vocabulary.options.map((option) => ({
          kind: option.kind,
          name: option.name,
          ...(option.kind === "race"
            ? { subraces: option.body.subraces.map((subrace) => subrace.name) }
            : {}),
        })),
      ),

    listStartingSpells: ({ className, subclass }: Tool.Parameters<typeof ListStartingSpells>) =>
      Effect.map(
        as(
          spellsFor({
            className,
            subclassName: blank(subclass),
            level: 1,
            sheet: { notes: "", abilities: [], traits: [] },
          }),
        ),
        (book) => ({
          mode: book.mode,
          limits: book.limits,
          spells: book.spells.map((option) => ({
            spellId: option.spell.id,
            name: option.spell.name,
            level: option.spell.level,
            school: option.spell.schoolName,
            list: option.list,
            ritual: option.spell.ritual,
            concentration: option.spell.concentration,
            note: spellNoteFor(option),
          })),
        }),
      ),

    proposeCharacter: ({
      name,
      race,
      subrace,
      className,
      subclass,
      background,
      abilityOrder,
      skills,
      backstory,
      bond,
      ideal,
      flaw,
      appearance,
      kit,
      cantrips,
      spells,
      preparedSpells,
      rationale,
    }: CharacterDraft) => {
      /**
       * The three labels, read back as the rows they name — through
       * `optionNamed`, which is the product's own rule for turning a stored
       * label into an option and is deliberately not re-derived here.
       *
       * It is case-insensitive and exact, with no fuzzy matching, so
       * `"Circle of the Moon Druid"` resolves to nothing exactly as it does on
       * a hand-filled sheet. Under the enum it cannot miss; above the cap it
       * can, and that is what {@link notInVocabulary} is for.
       */
      const classOption = optionNamed(vocabulary.options, "class", className);
      const raceOption = optionNamed(vocabulary.options, "race", race);
      const backgroundOption = optionNamed(vocabulary.options, "background", background);
      const namedSubrace = blank(subrace);
      const subraceOption = subraceEntryOf(raceOption, namedSubrace);

      if (vocabulary.listed && classOption === undefined) {
        return Effect.fail(notInVocabulary(rules, "class", className));
      }
      if (vocabulary.listed && raceOption === undefined) {
        return Effect.fail(notInVocabulary(rules, "race", race));
      }
      // Only when the campaign has some. A table with no backgrounds written
      // down gets free text from `nameSchema` and there is no list to be
      // outside of — the same three states the other two have.
      if (
        vocabulary.listed &&
        vocabulary.backgrounds.length > 0 &&
        backgroundOption === undefined
      ) {
        return Effect.fail(notInVocabulary(rules, "background", background));
      }
      if (namedSubrace !== undefined && raceOption !== undefined && subraceOption === undefined) {
        return Effect.fail(notASubrace(rules, raceOption.name, namedSubrace));
      }

      /**
       * The rules half of the sheet, through `startingSheetBody` — **the one
       * assembly the manual form's `payloadFrom` and an NPC's quick start
       * share**, so the paths cannot disagree about what a Hill Dwarf Fighter
       * starts with. See `@taverns/api`'s `SheetGrants`.
       *
       * The seed inside it applies the race and subrace bonuses to the
       * ranking's standard array first, and every number after is read off the
       * moved cells: a draft whose race raises constitution really does come
       * back with more hit points *and* a sheet whose constitution cell says so.
       * The level is `STARTING_LEVEL`: the captain fixes Hob's drafts at 1. No kit
       * side is picked here — the tool takes no picks, so side (a) of every
       * choice is what a draft carries, exactly as the form does before the
       * player touches the picker — and the model's own `kit` names are
       * appended as plain lines below.
       */
      const raceEntry = raceEntryOf(raceOption);
      const { body, seed } = startingSheetBody({
        classOption: asClassOption(classOption),
        raceOption: asRaceOption(raceOption),
        subrace: namedSubrace,
        backgroundOption: asBackgroundOption(backgroundOption),
        // The campaign's own spelling where it resolved, the model's where it
        // did not — the same rule the race and the class labels follow.
        background: backgroundOption?.name ?? background,
        subclass: blank(subclass),
        level: STARTING_LEVEL,
        abilities: abilitiesFrom(abilityOrder),
        raceBonusChoices: raceChoiceBonuses(raceEntry, abilityOrder),
      });

      const story = {
        ...(blank(bond) === undefined ? {} : { bond: blank(bond)! }),
        ...(blank(ideal) === undefined ? {} : { ideal: blank(ideal)! }),
        ...(blank(flaw) === undefined ? {} : { flaw: blank(flaw)! }),
        ...(blank(appearance) === undefined ? {} : { appearance: blank(appearance)! }),
      };
      const modelKit = (kit ?? []).map((item) => item.trim()).filter((item) => item !== "");

      return Effect.gen(function* () {
        /**
         * The model's own carried lines, each linked to the bundled row called
         * exactly that when there is one — *"Scimitar"* is the SRD's scimitar,
         * with its weight, and a line the sheet's gear section can draw the
         * row's facts for. A name no bundled row answers, or two do, stays
         * as typed: *"Leather armour"* in the model's spelling is a name, not
         * a guess. The kit's own lines above are already linked by the corpus.
         */
        const bundled =
          modelKit.length === 0 ? [] : yield* as(repositories.equipment.bundledNamed(modelKit));
        const carried = [...(body.inventory ?? []), ...gearLinesNamed(modelKit, bundled)];
        /**
         * The document, assembled here so the card and the row cannot disagree:
         * the rules half above, with what only this caller knows — the backstory,
         * the story lines, the model's skills and its own kit lines. Every
         * optional key is omitted rather than written empty, for the reason
         * `startingSheetBody` gives.
         */
        const baseSheet: CharacterSheet = {
          notes: blank(backstory) ?? "",
          ...body,
          ...(Object.keys(story).length === 0 ? {} : { story }),
          ...((skills ?? []).length === 0 ? {} : { skills: skillsFrom(skills ?? []) }),
          // The kit's lines, then the model's: empty only when the body had none.
          ...(carried.length === 0 ? {} : { inventory: carried }),
        };

        const spellBook = yield* as(
          spellsFor({
            className: classOption?.name ?? className,
            subclassName: blank(subclass),
            level: seed.level,
            sheet: baseSheet,
          }),
        );
        const selectedSpells = yield* spellRowsFor(spellBook, {
          cantrips: absent(cantrips),
          spells: absent(spells),
          preparedSpells: absent(preparedSpells),
        });
        const sheet =
          selectedSpells.length === 0
            ? baseSheet
            : sheetWithSpellSelection(baseSheet, spellBook, selectedSpells);

        return yield* offer(
          {
            target: "character",
            name,
            // The **campaign's own spelling** where it resolved, and the model's
            // where it did not. The label is the entire link between a character
            // and an option, so storing a lower-cased near-miss would put a word
            // on the sheet that the picker would never have produced.
            race: raceOption?.name ?? race,
            ...(namedSubrace === undefined ? {} : { subrace: subraceOption?.name ?? namedSubrace }),
            className: classOption?.name ?? className,
            sheet,
            level: seed.level,
            ac: seed.ac,
            // Absent only where the campaign has no class by that name and so no
            // hit die to read — and optional on the wire because a proposal saved
            // before this existed has no key at all.
            ...(seed.hpMax === undefined ? {} : { hpMax: seed.hpMax }),
            rationale: (rationale ?? []).map((line) => line.trim()).filter((line) => line !== ""),
          },
          `Offered ${name} to the player. They can keep them or ask for changes; ` +
            "say one short line about the character and stop — the sheet is already " +
            "on their screen.",
        );
      });
    },
  };
};

/**
 * The player's toolkit, made and bound to its own handlers — **one fresh value,
 * used as both.**
 *
 * This is the whole mechanism of slice 2 in four lines, and the reason it works
 * at all is that `Toolkit.make` is an ordinary call: the value it returns is
 * used to build the handler context (`toHandlers`) *and* as the key that context
 * is provided under (`provideContext`). Both sides reference the same fresh
 * value, so a toolkit that exists for one request is as good a tag as a
 * module-level one — which is what makes a per-campaign grammar possible with no
 * change to `round`, `recover` or `toHobEvent`.
 *
 * The toolkit deliberately does **not** escape this function. Handing back the
 * bound `Effect` rather than the toolkit is what makes "both sides reference the
 * same value" structural instead of a rule a caller has to keep.
 *
 * @see {@link playerBindListing} for the shape above the cap.
 */
export const playerBindOver = (
  repositories: HobRepositories,
  actor: Actor,
  campaignId: CampaignId,
  proposal: ProposalSlot,
  vocabulary: CharacterVocabulary,
) => {
  const toolkit = playerToolkitOver(vocabulary);
  return Effect.flatMap(
    toolkit.toHandlers(
      toolkit.of(playerHandlersFor(repositories, actor, campaignId, proposal, vocabulary)),
    ),
    (bound) => Effect.provideContext(toolkit, bound),
  );
};

/**
 * {@link playerBindOver} with no campaign: the core toolkit, bound to
 * {@link coreHandlersFor}. `listOptions` is in the handlers either way and has
 * a tool to answer only above the cap, exactly as on the player side.
 */
export const coreBindOver = (
  repositories: DraftingRepositories,
  actor: Actor,
  proposal: ProposalSlot,
  vocabulary: CharacterVocabulary,
) => {
  const toolkit = coreToolkitOver(vocabulary);
  return Effect.flatMap(
    toolkit.toHandlers(toolkit.of(coreHandlersFor(repositories, actor, proposal, vocabulary))),
    (bound) => Effect.provideContext(toolkit, bound),
  );
};

/** {@link coreBindOver} above {@link OPTION_ENUM_CAP}. */
export const coreBindListing = (
  repositories: DraftingRepositories,
  actor: Actor,
  proposal: ProposalSlot,
  vocabulary: CharacterVocabulary,
) => {
  const toolkit = coreToolkitListing(vocabulary);
  return Effect.flatMap(
    toolkit.toHandlers(toolkit.of(coreHandlersFor(repositories, actor, proposal, vocabulary))),
    (bound) => Effect.provideContext(toolkit, bound),
  );
};

/** Whether a model's answer for an optional name meant "none". */
const saidNothing = (value: string | null | undefined): boolean =>
  value === null ||
  value === undefined ||
  (ABSENT_WORDS as ReadonlyArray<string>).includes(value.trim());

/**
 * `proposeCampaign`, bound. It resolves the world by name against the list the
 * schema was built from; a name that is not one of them (the free-text shape,
 * with no worlds or above the cap) is a `Conflict` the model reads and can
 * correct, never a guess.
 */
const campaignHandlerFor =
  (actor: Actor, proposal: ProposalSlot, worlds: ReadonlyArray<CampaignWorld>) =>
  ({ name, partyName, description, sharedWorld }: CampaignDraft) =>
    Effect.gen(function* () {
      const { offer } = bind(actor, proposal);
      const wanted = saidNothing(sharedWorld) ? undefined : sharedWorld!.trim();
      const matching =
        wanted === undefined
          ? []
          : worlds.filter((world) => world.name.toLowerCase() === wanted.toLowerCase());
      if (wanted !== undefined && matching.length !== 1) {
        return yield* new Conflict({
          message:
            matching.length === 0
              ? worlds.length === 0
                ? "they are in no Shared World, so leave sharedWorld out"
                : `${quoted(wanted)} is not one of their Shared Worlds: use one of ` +
                  `${worlds.map((world) => quoted(world.name)).join(", ")}, or leave it out`
              : `two of their Shared Worlds are called ${quoted(wanted)}; leave sharedWorld ` +
                "out and they can connect the campaign to one afterwards",
        });
      }
      const world = matching[0];
      const title = name.trim();
      return yield* offer(
        {
          target: "campaign",
          name: title,
          partyName: blank(partyName) ?? null,
          description: blank(description) ?? null,
          world: world === undefined ? null : { id: world.id, name: world.name },
        },
        `Offered the campaign "${title}"${
          world === undefined ? "" : ` in ${world.name}`
        }. Say one short line about it and stop.`,
      );
    });

/** `proposeSharedWorld`, bound: the draft as the card shows it, nothing read. */
const sharedWorldHandlerFor =
  (actor: Actor, proposal: ProposalSlot) =>
  ({ name, description }: Tool.Parameters<typeof ProposeSharedWorld>) =>
    Effect.gen(function* () {
      const title = name.trim();
      // The form's create refuses a blank name, so the draft is told here,
      // where the model can hear it, rather than failing the keep.
      if (title === "") return yield* new Conflict({ message: "give the Shared World a name" });
      return yield* bind(actor, proposal).offer(
        { target: "sharedWorld", name: title, description: blank(description) ?? null },
        `Offered the Shared World "${title}". Say one short line about it and stop.`,
      );
    });

/**
 * The account panel's handlers: {@link coreHandlersFor}, the same drafting
 * code the create screen's composer runs, plus `proposeCampaign` and
 * `proposeSharedWorld`.
 */
const accountHandlersFor = (
  repositories: DraftingRepositories,
  actor: Actor,
  proposal: ProposalSlot,
  vocabulary: CharacterVocabulary,
  worlds: ReadonlyArray<CampaignWorld>,
) => ({
  ...coreHandlersFor(repositories, actor, proposal, vocabulary),
  proposeCampaign: campaignHandlerFor(actor, proposal, worlds),
  proposeSharedWorld: sharedWorldHandlerFor(actor, proposal),
});

/** {@link accountToolkitOver}, bound to {@link accountHandlersFor}. */
export const accountBindOver = (
  repositories: DraftingRepositories,
  actor: Actor,
  proposal: ProposalSlot,
  vocabulary: CharacterVocabulary,
  worlds: ReadonlyArray<CampaignWorld>,
) => {
  const toolkit = accountToolkitOver(vocabulary, worlds);
  return Effect.flatMap(
    toolkit.toHandlers(
      toolkit.of(accountHandlersFor(repositories, actor, proposal, vocabulary, worlds)),
    ),
    (bound) => Effect.provideContext(toolkit, bound),
  );
};

/** {@link accountBindOver} above {@link OPTION_ENUM_CAP}. */
export const accountBindListing = (
  repositories: DraftingRepositories,
  actor: Actor,
  proposal: ProposalSlot,
  vocabulary: CharacterVocabulary,
  worlds: ReadonlyArray<CampaignWorld>,
) => {
  const toolkit = accountToolkitListing(vocabulary, worlds);
  return Effect.flatMap(
    toolkit.toHandlers(
      toolkit.of(accountHandlersFor(repositories, actor, proposal, vocabulary, worlds)),
    ),
    (bound) => Effect.provideContext(toolkit, bound),
  );
};

/**
 * The same, above {@link OPTION_ENUM_CAP}: four tools, one of which reads the
 * vocabulary out because it is too big to be in the grammar.
 *
 * A separate function rather than a flag because the tool records are different
 * types and `Toolkit` is invariant in its — see {@link playerToolkitOver}. The
 * handlers are the *same object*: `listOptions` is bound either way and simply
 * has no tool to answer under the cap, which is the cheapest possible way for
 * the two modes to be unable to disagree about what the vocabulary is.
 */
export const playerBindListing = (
  repositories: HobRepositories,
  actor: Actor,
  campaignId: CampaignId,
  proposal: ProposalSlot,
  vocabulary: CharacterVocabulary,
) => {
  const toolkit = playerToolkitListing(vocabulary);
  return Effect.flatMap(
    toolkit.toHandlers(
      toolkit.of(playerHandlersFor(repositories, actor, campaignId, proposal, vocabulary)),
    ),
    (bound) => Effect.provideContext(toolkit, bound),
  );
};
