import { Schema } from "effect";
import { EncounterSetting } from "./BattleMap.js";
import { EncounterDifficulty } from "./EncounterDifficulty.js";
import { EncounterRunEndedReason } from "./EncounterRun.js";
import { CampaignId, EncounterId, EncounterRunId, SessionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

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
   * reader* can see, the rule `creatureCount` follows, so a player's answer
   * says nothing about a creature or a seat hidden from them.
   */
  difficulty: EncounterDifficulty,
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
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const tags = Schema.Array(Tag).check(Schema.isLengthBetween(0, 16));

/**
 * `setting` is the one line the encounter's battle map is drawn from
 * (`BattleMap.ts`). It is written here, on the encounter's form, because the
 * map is made with the encounter and drawn once as it is made; but it is stored
 * on the map and read back only through the creator's map read, never on
 * `Encounter`, which a player may read when it is shared.
 */
export const EncounterCreate = Schema.Struct({
  name: Schema.NonEmptyString,
  tags: Schema.optional(tags),
  visibility: Schema.optional(Visibility),
  setting: Schema.optional(Schema.NullOr(EncounterSetting)),
});
export type EncounterCreate = typeof EncounterCreate.Type;

export const EncounterUpdate = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  tags: Schema.optional(tags),
  visibility: Schema.optional(Visibility),
  /** The map's setting line; `null` or a blank clears it. Editing it redraws nothing. */
  setting: Schema.optional(Schema.NullOr(EncounterSetting)),
});
export type EncounterUpdate = typeof EncounterUpdate.Type;
