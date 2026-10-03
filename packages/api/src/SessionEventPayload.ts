import { Schema } from "effect";

/**
 * The few `SessionEvent.payload` shapes a client reads: the hit-point, death
 * save and condition lines the DM's *Rolls* dock prints ("31 → 19 hp",
 * "Con save DC 10", "Unconscious added").
 *
 * `payload` stays `Schema.Unknown` on the wire, because every other kind is a
 * doorbell and its remainder is nobody's contract. These three are declared
 * here so that the server's object literals (`satisfies …Encoded`) and the
 * dock's decode cannot drift apart; a row that fails to decode — an older line
 * from before a field existed, say — is printed from its `kind` alone.
 *
 * Every field the server adds conditionally is optional, and a reader must not
 * assume more than this says: a line logged before `hpBefore` was stamped has
 * none.
 */

const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }));

/** What a write moved in a condition list, each present only when not empty. */
const conditionsCrossed = {
  conditionsAdded: Schema.optional(Schema.Array(Schema.String)),
  conditionsRemoved: Schema.optional(Schema.Array(Schema.String)),
} as const;

/** `combatant-damaged`: one hit or heal, as `Combatants.damage` applied it. */
export const CombatantDamagedPayload = Schema.Struct({
  /** Positive damages, negative heals: the delta the DM sent. */
  amount: Schema.Int,
  /** The hit points the row held before this write, before any clamp. */
  hpBefore: Schema.optional(Schema.Int),
  hpCurrent: Schema.Int,
  hpMax: Schema.Int,
  /** Present when a row holding Concentrating took damage and is still up. */
  concentrationDc: Schema.optional(Schema.Int),
  critical: Schema.optional(Schema.Boolean),
  /** A player character's counts after the hit. */
  deathSaves: Schema.optional(Schema.Struct({ successes: Count, failures: Count })),
  ...conditionsCrossed,
});
export type CombatantDamagedPayload = typeof CombatantDamagedPayload.Type;

/** `death-save`: the dots set, or a save rolled, and the counts it left. */
export const DeathSavePayload = Schema.Struct({
  /** The d20's face, when the save was rolled rather than set. */
  face: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))),
  successes: Count,
  failures: Count,
  /** Absent on a player's own write, which moves no hit points. */
  hpCurrent: Schema.optional(Schema.Int),
  /** `"player"` when the owner marked it on their sheet. */
  by: Schema.optional(Schema.Literal("player")),
  ...conditionsCrossed,
});
export type DeathSavePayload = typeof DeathSavePayload.Type;

/**
 * `combatant-updated`, as far as a reader cares: the conditions that moved
 * because the hit points crossed zero. The rest of the line is the patch.
 */
export const CombatantUpdatedPayload = Schema.Struct({ ...conditionsCrossed });
export type CombatantUpdatedPayload = typeof CombatantUpdatedPayload.Type;
