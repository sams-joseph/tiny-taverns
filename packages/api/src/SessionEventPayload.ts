import { Schema } from "effect";
import { LevelRegionKind } from "./LevelKit.js";

/**
 * The few `SessionEvent.payload` shapes a client reads: the hit-point, death
 * save and condition lines the DM's *Rolls* dock prints ("31 → 19 hp",
 * "Con save DC 10", "Unconscious added"), and which door or light a level's
 * line names ("A door was locked", "A torch was lit").
 *
 * `payload` stays `Schema.Unknown` on the wire, because every other kind is a
 * doorbell and its remainder is nobody's contract. These are declared
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

/** `hob-turn-kept`: the narration of a kept monster turn, what it said aloud if anything, and who took it. */
export const HobTurnKeptPayload = Schema.Struct({
  narration: Schema.String,
  line: Schema.optional(Schema.String),
  combatantName: Schema.String,
  moment: Schema.Literals(["turn", "legendary", "reaction"]),
  round: Schema.Int,
});
export type HobTurnKeptPayload = typeof HobTurnKeptPayload.Type;

/**
 * `combatant-updated`, as far as a reader cares: the conditions that moved
 * because the hit points crossed zero. The rest of the line is the patch.
 */
export const CombatantUpdatedPayload = Schema.Struct({ ...conditionsCrossed });
export type CombatantUpdatedPayload = typeof CombatantUpdatedPayload.Type;

const DoorState = Schema.Literals(["open", "closed", "locked"]);

/**
 * `board-door-updated`: which kind of door, and what it was and is now. A
 * line logged before `wallKind` and the `was…` fields existed fails to decode
 * and prints from its kind alone.
 */
export const BoardDoorUpdatedPayload = Schema.Struct({
  wallId: Schema.String,
  wallKind: Schema.Literals(["door", "secretDoor"]),
  doorState: DoorState,
  revealed: Schema.Boolean,
  wasDoorState: DoorState,
  wasRevealed: Schema.Boolean,
});
export type BoardDoorUpdatedPayload = typeof BoardDoorUpdatedPayload.Type;

/** `board-region-updated`: which region, of what kind, and whether the table is shown it now and was before. */
export const BoardRegionUpdatedPayload = Schema.Struct({
  regionId: Schema.String,
  regionKind: LevelRegionKind,
  revealed: Schema.Boolean,
  wasRevealed: Schema.Boolean,
});
export type BoardRegionUpdatedPayload = typeof BoardRegionUpdatedPayload.Type;

/** `board-light-updated`: which light, by the preset it matches (`lightPresetOf`), lit or snuffed. */
export const BoardLightUpdatedPayload = Schema.Struct({
  lightId: Schema.String,
  lit: Schema.Boolean,
  preset: Schema.NullOr(
    Schema.Literals(["candle", "torch", "lamp", "brazier", "arcane", "moonbeam"]),
  ),
});
export type BoardLightUpdatedPayload = typeof BoardLightUpdatedPayload.Type;

const Square = Schema.Struct({ column: Schema.Int, row: Schema.Int });

/** `visit-token-moved`: whose token, by its seat, and from where to where on the visit. */
export const VisitTokenMovedPayload = Schema.Struct({
  seatId: Schema.String,
  from: Square,
  to: Square,
});
export type VisitTokenMovedPayload = typeof VisitTokenMovedPayload.Type;

/** `visit-tabled`: the visit put on the campaign's table (`true`) or taken off it. */
export const VisitTabledPayload = Schema.Struct({ onTable: Schema.Boolean });
export type VisitTabledPayload = typeof VisitTabledPayload.Type;

/**
 * `visit-placement-updated`: the DM placed an encounter's creatures on the
 * visit's level again, or its trigger area, by the encounter's name. The DM's
 * line: it would say where a fight waits.
 */
export const VisitPlacementUpdatedPayload = Schema.Struct({
  encounterId: Schema.String,
  name: Schema.String,
});
export type VisitPlacementUpdatedPayload = typeof VisitPlacementUpdatedPayload.Type;

/**
 * `visit-returned`: a fight that borrowed the visit ended resolved and handed
 * the dungeon back, by the visit's name (the level's when it was opened):
 * doors, lights, reveals, fog and what the party saw are the fight's, and the
 * party stands where the fight left it.
 */
export const VisitReturnedPayload = Schema.Struct({ name: Schema.String });
export type VisitReturnedPayload = typeof VisitReturnedPayload.Type;
