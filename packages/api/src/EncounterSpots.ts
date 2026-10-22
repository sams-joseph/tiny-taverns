import { Schema } from "effect";
import { CombatantPosition } from "./Combatant.js";
import { EncounterCreatureId } from "./Ids.js";
import { LEVEL_SQUARES_MAX } from "./LevelKit.js";

/**
 * Where an encounter's creatures stand on its level before the fight, and the
 * squares that set it off: the DM's placement (`0113_level_visits.ts`'
 * `encounter_creature_spot`, `0115_encounter_placement.ts`' trigger). **The
 * creator's alone**: it reaches the wire on `EncounterPrep.placement` and on
 * the DM's visit read, never on a player read. A seated player is told a
 * placed creature only when the party sees its square on the visit on the
 * table (`PlayerLevelVisit.creatures`).
 *
 * An encounter is *placed in a visit* when the campaign has a visit of the
 * encounter's level, the encounter has spots, and it has never been played;
 * that is computed on every read, never stored.
 */

/** A square of a level, `row * columns + column`. */
const squareIndex = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: LEVEL_SQUARES_MAX * LEVEL_SQUARES_MAX - 1 }),
);

/** One instance of a roster line standing on a square of the encounter's level. */
export const EncounterSpot = Schema.Struct({
  /** The roster line (`EncounterCreature.id`). */
  encounterCreatureId: EncounterCreatureId,
  /** Which of the line's `count`, from `0`. */
  ordinal: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 998 })),
  ...CombatantPosition.fields,
});
export type EncounterSpot = typeof EncounterSpot.Type;

/** The most squares one placement names: every instance a roster can hold, near enough. */
export const ENCOUNTER_SPOTS_MAX = 999;

/**
 * An encounter's placement on its level: every placed instance, and the
 * trigger area, `null` for none, as squares of the level in reading order.
 * Read on `EncounterPrep`, and written whole by `encounters.place`, which
 * replaces every spot and the trigger in one transaction.
 *
 * The write's rules: an encounter with a level, never played; each spot names
 * a line of this encounter and an instance it has (`ordinal < count`), once;
 * each square on the level's board and one a token may stand on there
 * (`standable`, the level's own floor and props); no two creatures on one
 * square; trigger squares on the board. A line of another encounter is
 * `NotFound`; a bad square, a played encounter or one with no level is a
 * worded `Conflict`. The trigger is stored ascending and distinct, and an
 * empty one is none.
 */
export const EncounterLevelPlacement = Schema.Struct({
  spots: Schema.Array(EncounterSpot).check(
    Schema.isMaxLength(ENCOUNTER_SPOTS_MAX),
    Schema.makeFilter((spots: ReadonlyArray<EncounterSpot>) =>
      new Set(spots.map((spot) => `${spot.encounterCreatureId}:${String(spot.ordinal)}`)).size ===
      spots.length
        ? undefined
        : "each creature stands on one square",
    ),
    Schema.makeFilter((spots: ReadonlyArray<EncounterSpot>) =>
      new Set(spots.map((spot) => `${String(spot.column)}:${String(spot.row)}`)).size ===
      spots.length
        ? undefined
        : "two creatures cannot stand on one square",
    ),
  ),
  trigger: Schema.NullOr(
    Schema.Array(squareIndex).check(Schema.isMaxLength(LEVEL_SQUARES_MAX * LEVEL_SQUARES_MAX)),
  ),
});
export type EncounterLevelPlacement = typeof EncounterLevelPlacement.Type;
