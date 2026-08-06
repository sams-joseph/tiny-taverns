import { Schema } from "effect";
import { CharacterId, CombatantId, CreatureId, EncounterRunId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * Which icon the initiative row draws, and which half of the seed produced it —
 * `EncounterRunner.jsx:32`, `shield` for a PC and `skull` for anything else.
 */
export const CombatantKind = Schema.Literals(["pc", "npc"]);
export type CombatantKind = typeof CombatantKind.Type;

/**
 * A condition badge — `"Hostile"`, `"Concentrating"`, `"Prone"`, `"Downed"`,
 * `"Legendary"` (`data.js:15-21`).
 *
 * An open vocabulary in a `text[]`, for the same reason `encounter.tags` is:
 * `EncounterRunner.jsx:6` maps five known names to badge variants and falls
 * back to `secondary` for anything else, which is a UI that expects to meet
 * words it does not know.
 */
const Condition = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 40));

const conditions = Schema.Array(Condition).check(Schema.isLengthBetween(0, 24));

/**
 * One creature *instance* in one fight.
 *
 * The fixtures settle this outright: `data.js:18-19` are two `Goblin Archer`
 * rows with different ids and `hp: 4` vs `hp: 0`. A combatant is not a creature
 * and not a roster line — the bestiary entry is a template, the roster says how
 * many, and this is one of them, with its own hit points.
 *
 * **Hit points reaching zero does not remove it.** `EncounterRunner.jsx:107`
 * says so in the product's own voice: "Still in initiative — remove them when
 * you're ready." A downed combatant stays in the order, greyed and struck
 * through (`:30`, `:34`); removal is a separate, explicit act.
 */
export class Combatant extends Schema.Class<Combatant>("Combatant")({
  id: CombatantId,
  encounterRunId: EncounterRunId,
  /**
   * The party member this was seeded from, if any. `null` for an NPC and for
   * anything the DM typed in mid-fight.
   *
   * `on delete set null`: retiring a character must not delete them out of a
   * fight that already happened. Nothing is ever read *through* this — every
   * displayable field below is a snapshot — so it is provenance, not an access
   * path.
   */
  characterId: Schema.NullOr(CharacterId),
  /** The bestiary entry this was seeded from, if any. Same rules as above. */
  creatureId: Schema.NullOr(CreatureId),
  /**
   * `"Goblin Archer"`. Two instances of one creature carry the same name — the
   * fixture does not number them (`data.js:18-19`) and neither does this.
   *
   * Snapshotted at seed time rather than joined. A combatant must outlive its
   * template: `creature_id` goes null when the creature is deleted, and a row
   * whose name came from the join would go blank in a fight the DM is running.
   */
  displayName: Schema.String,
  /**
   * The descriptive half of the fixture's `sub` line: `"Half-orc paladin"` for a
   * PC (`data.js:15`), `"Small humanoid"` for an NPC (`data.js:16`).
   *
   * The report says `sub` is derived and to "store the parts", and this is the
   * part that is not `playerName`. It is one column rather than the four
   * (`descriptor`, `playerName`, `size`, `type`) that reconstructing it from
   * both source tables would need, and it is stored rather than joined for the
   * same reason `displayName` is.
   */
  subtitle: Schema.NullOr(Schema.String),
  /**
   * `"Ilse"` — the second half of `"Half-orc paladin · Ilse"`. Separate from
   * `subtitle` so the separator stays a rendering decision, exactly as
   * `Character` already documents for the same string.
   */
  playerName: Schema.NullOr(Schema.String),
  initiative: Schema.Int,
  /** Zero is a legal, common, deliberate value. It does not mean "gone". */
  hpCurrent: Schema.Int,
  hpMax: Schema.Int,
  ac: Schema.NullOr(Schema.Int),
  kind: CombatantKind,
  conditions: Schema.Array(Schema.String),
  /** The per-row "Hide from players" override (`EncounterRunner.jsx:139`). */
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const initiative = Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 100 }));
const hp = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }));
const ac = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 40 }));

/**
 * Add a combatant by hand — `EncounterRunner.jsx:137`, the `plus` button.
 *
 * Everything but the name is optional because the thing this is for is a
 * summoned wolf or a guard captain the DM invented in the moment, which has no
 * bestiary entry to point at. `characterId`/`creatureId` are absent from the
 * payload deliberately: a combatant seeded *from* something is created by
 * starting the run, and letting a client claim a source it did not seed from
 * would be one more id in a path to have to contain.
 */
export const CombatantCreate = Schema.Struct({
  displayName: Schema.NonEmptyString,
  subtitle: Schema.optional(Schema.String),
  playerName: Schema.optional(Schema.String),
  kind: Schema.optional(CombatantKind),
  initiative: Schema.optional(initiative),
  hpMax: Schema.optional(hp),
  hpCurrent: Schema.optional(hp),
  ac: Schema.optional(ac),
  conditions: Schema.optional(conditions),
  visibility: Schema.optional(Visibility),
});
export type CombatantCreate = typeof CombatantCreate.Type;

export const CombatantUpdate = Schema.Struct({
  displayName: Schema.optional(Schema.NonEmptyString),
  subtitle: Schema.optional(Schema.NullOr(Schema.String)),
  playerName: Schema.optional(Schema.NullOr(Schema.String)),
  initiative: Schema.optional(initiative),
  hpCurrent: Schema.optional(hp),
  hpMax: Schema.optional(hp),
  ac: Schema.optional(Schema.NullOr(ac)),
  conditions: Schema.optional(conditions),
  visibility: Schema.optional(Visibility),
});
export type CombatantUpdate = typeof CombatantUpdate.Type;

/**
 * Apply damage or healing — the runner's `minus` button
 * (`EncounterRunner.jsx:41`, `:103-110`).
 *
 * A delta rather than a new absolute value, and its own endpoint rather than a
 * `PATCH { hpCurrent }`, for two reasons. It is the mutation that actually
 * happens every few seconds, so it is the one that has to be safe to repeat —
 * hence `requestId`. And a delta is what the DM means: "the ogre hits for 12"
 * is true regardless of what anyone's screen last showed, whereas an absolute
 * write from a stale screen silently undoes whatever happened in between.
 *
 * The result is clamped into `[0, hpMax]`, matching `Math.max(0, c.hp - 5)`.
 */
export const CombatantDamage = Schema.Struct({
  /** Positive damages, negative heals. Zero is legal and does nothing. */
  amount: Schema.Int.check(Schema.isBetween({ minimum: -10_000, maximum: 10_000 })),
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isLengthBetween(1, 128))),
});
export type CombatantDamage = typeof CombatantDamage.Type;
