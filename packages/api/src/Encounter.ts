import { Schema } from "effect";
import { EncounterSetting } from "./BattleMap.js";
import { EncounterCreatureCount } from "./EncounterCreature.js";
import { EncounterDifficulty } from "./EncounterDifficulty.js";
import { EncounterKind } from "./EncounterKind.js";
import { EncounterRunEndedReason } from "./EncounterRun.js";
import { CampaignId, CreatureId, EncounterId, EncounterRunId, SessionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";
import { AbilityKey } from "./Ruleset.js";

export * from "./EncounterKind.js";

/**
 * A tag on an encounter — `"Marsh"`, `"Night"`, `"Boss"` (`data.js:10-12`).
 *
 * An open vocabulary in a `text[]`, not a join table: the fixtures show at most
 * two per encounter, and a join table would buy referential integrity over a
 * list the DM invents as they go, at the cost of a join on the card grid that
 * `CampaignHome` renders first.
 */
const Tag = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 40));

/** One playing of an encounter, as its list row and its log link need it. */
export const EncounterPlayed = Schema.Struct({
  runId: EncounterRunId,
  sessionId: SessionId,
  sessionNumber: Schema.Int,
  endedAt: Schema.DateTimeUtcFromString,
  endedReason: EncounterRunEndedReason,
});
export type EncounterPlayed = typeof EncounterPlayed.Type;

/** The bounds the form, the schema, the tool and the table all state. */
export const ENCOUNTER_TACTICS_MAX = 12;
export const ENCOUNTER_TACTIC_MAX = 300;
export const ENCOUNTER_TREASURE_MAX = 500;
export const ENCOUNTER_SKILLS_MAX = 8;
export const ENCOUNTER_SKILL_MAX = 40;
export const ENCOUNTER_HAZARD_TEXT_MAX = 120;
export const ENCOUNTER_OUTCOME_MAX = 300;
export const ENCOUNTER_ROSTER_MAX = 50;

/** A check's DC or a save's, as the SRD sets them. */
const Dc = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 30 }));
const Tally = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }));
const prose = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));

/**
 * The skills a challenge is met with — `"Athletics"`, `"Survival"`. An open
 * vocabulary, like `Skill.name` on a sheet: a DM may call for thieves' tools.
 */
const ChallengeSkills = Schema.Array(prose(ENCOUNTER_SKILL_MAX)).check(
  Schema.isMaxLength(ENCOUNTER_SKILLS_MAX),
);

/** A skill challenge: so many successes at this DC before so many failures. */
export const EncounterSkillChallenge = Schema.Struct({
  kind: Schema.Literal("challenge"),
  dc: Dc,
  successes: Tally,
  failures: Tally,
  skills: ChallengeSkills,
  /**
   * What the runner says when the party makes it — `"They find the buried
   * cache"` — and when it goes wrong. Optional, and absent says nothing: the
   * runner shows only "They made it" rather than borrowing a tactic line.
   */
  onSuccess: Schema.optionalKey(prose(ENCOUNTER_OUTCOME_MAX)),
  onFailure: Schema.optionalKey(prose(ENCOUNTER_OUTCOME_MAX)),
});
export type EncounterSkillChallenge = typeof EncounterSkillChallenge.Type;

/** A hazard: the save it forces, what failing costs, and how long it lasts. */
export const EncounterHazard = Schema.Struct({
  kind: Schema.Literal("hazard"),
  save: Schema.Struct({ ability: AbilityKey, dc: Dc }),
  /** `"1 level of exhaustion"` */
  onFail: Schema.optionalKey(prose(ENCOUNTER_HAZARD_TEXT_MAX)),
  /** `"1d4 hours"` */
  duration: Schema.optionalKey(prose(ENCOUNTER_HAZARD_TEXT_MAX)),
  /** What gets the party through it — `"Survival"`, `"Animal Handling"`. */
  skills: ChallengeSkills,
});
export type EncounterHazard = typeof EncounterHazard.Type;

/**
 * The numbers a skill challenge or a hazard is run by, tagged with the kind
 * they belong to. A fight and a conversation have none. The tag must be the
 * encounter's kind — the payloads below refuse anything else, and so does the
 * table — so a challenge can never outlive the kind it was written for.
 */
export const EncounterChallenge = Schema.Union([EncounterSkillChallenge, EncounterHazard]);
export type EncounterChallenge = typeof EncounterChallenge.Type;

/**
 * The authored encounter — a reusable template, never mutated by running it.
 *
 * One field the fixture's encounter card shows is still deliberately absent:
 * **`active`** (`data.js:10`, "On the table now") is not a column here at all.
 * Exactly one encounter is live, so it is a pointer on the session — the active
 * `encounter_run` — and a boolean per encounter would let two rows both claim
 * the table. It arrives with the live-session step.
 */
export class Encounter extends Schema.Class<Encounter>("Encounter")({
  id: EncounterId,
  campaignId: CampaignId,
  name: Schema.String,
  /**
   * How hard it is for this table's party, computed on read by the DMG method
   * (`EncounterDifficulty.ts`) from the roster's XP and the seated characters'
   * levels — **never stored and never typed**. Both halves are what *this
   * reader* can see, the rule `creatureCount` follows.
   *
   * The creator's alone, as the whole of `Encounter` is: a player's
   * `PlayerEncounter` carries no difficulty (see there for why).
   */
  difficulty: EncounterDifficulty,
  kind: EncounterKind,
  tags: Schema.Array(Schema.String),
  /**
   * The card's "6 creatures" (`data.js:10`, `CampaignHome.jsx:15`).
   *
   * `sum(encounter_creature.count)`, computed on read — not a column. A stored
   * total is a second answer to a question the roster already answers, and the
   * two disagree the first time a roster row is deleted by a cascade rather
   * than by the endpoint that would have decremented it.
   *
   * It counts the roster the *actor* can see, so it is consistent with what a
   * subsequent read of that roster returns rather than with what the DM would
   * have got.
   */
  creatureCount: Schema.Int,
  /**
   * The last time this encounter came off the table, or `null` if it never
   * has — the Encounters page's "Played · Session 12", and the link to that
   * fight's log.
   *
   * Computed on read from `encounter_run`, over the runs **this reader** can
   * see: a fight the DM kept hidden is not played as far as a player knows. A
   * fight still on the table is not in it (the campaign's live run says that);
   * a `carried` one is, with its reason, because it was played that night.
   */
  lastPlayed: Schema.NullOr(EncounterPlayed),
  /**
   * The DM's Share switch. A player reads the encounter only when it is
   * `shared` **and** its prep is Ready: a shared draft is still the DM's.
   */
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const tags = Schema.Array(Tag).check(Schema.isLengthBetween(0, 16));

/**
 * How the DM means to run it — `"Archers open from the reeds with full
 * cover"` — one short line each, in order.
 */
export const EncounterTactics = Schema.Array(prose(ENCOUNTER_TACTIC_MAX)).check(
  Schema.isMaxLength(ENCOUNTER_TACTICS_MAX),
);

/** What the party can come away with — `"28 sp and a bone whistle"`. */
export const EncounterTreasure = prose(ENCOUNTER_TREASURE_MAX);

/**
 * The encounter's DM prep: its tactics, its treasure and, for a skill
 * challenge or a hazard, the numbers it is run by — **the creator's alone.**
 *
 * Not on the `encounter` row, whose shared ones a player reads: this is the
 * DM's plan for the scene, and it reaches the wire only through the creator's
 * prep reads (`encounterPrep`), on a table no player read touches
 * (`0060_encounter_prep.ts`). It is written through the encounter's own create
 * and update, as the map's setting line is.
 *
 * The drawing's "where" line is not here: it is the battle map's setting line
 * (`BattleMap.setting`), already the creator's alone and already written on
 * the encounter's form.
 */
export class EncounterPrep extends Schema.Class<EncounterPrep>("EncounterPrep")({
  encounterId: EncounterId,
  /**
   * The DM's own word that the encounter is ready to run — the list's
   * Ready/Draft. Only a person sets it: a new encounter is a draft, and so is
   * one Hob proposed and the DM accepted, until the DM says otherwise. A draft
   * reaches no player, whatever its `visibility`.
   */
  ready: Schema.Boolean,
  tactics: Schema.Array(Schema.String),
  /** `null` when none was written. */
  treasure: Schema.NullOr(Schema.String),
  /** `null` for a fight or a conversation, and for a challenge not yet set out. */
  challenge: Schema.NullOr(EncounterChallenge),
}) {}

/**
 * A challenge is written with the kind it belongs to, in the same payload: the
 * kind is what a reader checks the tag against, and a payload naming one
 * without the other would leave the server to guess which the DM meant.
 */
const challengeMatchesKind = Schema.makeFilter(
  (payload: {
    readonly kind?: EncounterKind | undefined;
    readonly challenge?: EncounterChallenge | null | undefined;
  }) =>
    payload.challenge === undefined ||
    payload.challenge === null ||
    payload.challenge.kind === payload.kind
      ? undefined
      : { path: ["challenge"], issue: "a challenge is sent with the kind it belongs to" },
);

/**
 * One line of the roster an encounter is made with: this creature, this many.
 * Any creature the campaign can use, as a roster line added on its own takes.
 */
export const EncounterRosterLine = Schema.Struct({
  creatureId: CreatureId,
  count: EncounterCreatureCount,
});
export type EncounterRosterLine = typeof EncounterRosterLine.Type;

/**
 * One line per creature. A repeat is refused rather than merged, for the
 * reason a second add of the same creature is a `Conflict`
 * (`EncounterCreature`): merging would turn a mis-click into a doubled roster
 * with nothing said.
 */
const roster = Schema.Array(EncounterRosterLine).check(
  Schema.isMaxLength(ENCOUNTER_ROSTER_MAX),
  Schema.makeFilter((lines: ReadonlyArray<EncounterRosterLine>) =>
    new Set(lines.map((line) => line.creatureId)).size === lines.length
      ? undefined
      : "a creature is named once on a roster, with its count",
  ),
);

/**
 * `setting` is the one line the encounter's battle map is drawn from
 * (`BattleMap.ts`). It is written here, on the encounter's form, because the
 * map is made with the encounter and drawn once as it is made; but it is stored
 * on the map and read back only through the creator's map read, never on
 * the `encounter` row, whose shared ones a player may read. `tactics`,
 * `treasure` and `challenge` are the same arrangement over `EncounterPrep`.
 */
export const EncounterCreate = Schema.Struct({
  name: Schema.NonEmptyString,
  /** Absent is a fight. */
  kind: Schema.optional(EncounterKind),
  tags: Schema.optional(tags),
  visibility: Schema.optional(Visibility),
  setting: Schema.optional(Schema.NullOr(EncounterSetting)),
  tactics: Schema.optional(EncounterTactics),
  treasure: Schema.optional(EncounterTreasure),
  challenge: Schema.optional(EncounterChallenge),
  /** Absent is a draft. */
  ready: Schema.optional(Schema.Boolean),
  /**
   * The roster, made in the same transaction as the encounter through the
   * roster's own create — so a creature the campaign cannot use refuses the
   * whole encounter rather than leaving half of one. Editing it afterwards is
   * per line (`encounterCreatures`).
   */
  creatures: Schema.optional(roster),
}).check(challengeMatchesKind);
export type EncounterCreate = typeof EncounterCreate.Type;

export const EncounterUpdate = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  /**
   * A new kind clears a challenge written for the old one, unless this payload
   * carries the new kind's challenge.
   */
  kind: Schema.optional(EncounterKind),
  tags: Schema.optional(tags),
  visibility: Schema.optional(Visibility),
  /** The map's setting line; `null` or a blank clears it. Editing it redraws nothing. */
  setting: Schema.optional(Schema.NullOr(EncounterSetting)),
  /** The whole list, replacing the last; `[]` clears it. */
  tactics: Schema.optional(EncounterTactics),
  /** `null` clears it. */
  treasure: Schema.optional(Schema.NullOr(EncounterTreasure)),
  /** `null` clears it; a challenge is sent with its kind. */
  challenge: Schema.optional(Schema.NullOr(EncounterChallenge)),
  ready: Schema.optional(Schema.Boolean),
}).check(challengeMatchesKind);
export type EncounterUpdate = typeof EncounterUpdate.Type;
