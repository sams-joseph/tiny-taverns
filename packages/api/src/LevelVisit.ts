import { Schema } from "effect";
import { CombatantPosition } from "./Combatant.js";
import { CampaignCharacterId, LevelId, LevelVisitId } from "./Ids.js";
import { RunBoardLevel } from "./LevelFight.js";

/**
 * A level visit: a campaign's live state of one of its creator's levels, the
 * dungeon as the party left it (`0113_level_visits.ts`). One per campaign and
 * level, for good; the DM's *Reset level* is its delete. At most one is on the
 * table at a time (`onTable`).
 *
 * A visit is a copy of the level, taken when it was opened, as a fight's board
 * is (`LevelFight.ts`): editing or deleting the level never moves it, and a
 * deleted level leaves `levelId` `null`. Hob does not open one: a visit is a
 * live-play record.
 *
 * **The creator's whole.** Every field here is the DM's; a player's view of a
 * visit, when there is one, is a distinct schema narrowed in SQL.
 */

/** One seat's character standing on the visit. */
export const LevelVisitToken = Schema.Struct({
  seatId: CampaignCharacterId,
  /** The seat's name at this table (`PartySeat.displayName`). */
  name: Schema.String,
  column: Schema.Int,
  row: Schema.Int,
});
export type LevelVisitToken = typeof LevelVisitToken.Type;

export class LevelVisit extends Schema.Class<LevelVisit>("LevelVisit")({
  id: LevelVisitId,
  /** The level it was opened from, or `null` once that level is deleted. */
  levelId: Schema.NullOr(LevelId),
  /** The level's name when the visit was opened. */
  name: Schema.String,
  columns: Schema.Int,
  rows: Schema.Int,
  feetPerCell: Schema.Int,
  /**
   * The visit's copy of the level, in a fight copy's shape: door states,
   * reveals and lights are live on it.
   */
  level: RunBoardLevel,
  /** The squares under the DM's fog of war, in reading order. */
  fog: Schema.Array(CombatantPosition),
  /**
   * What the party sees now and has seen of the visit, each square
   * `row * columns + column`, ascending (`0110_party_vision.ts`).
   */
  partySees: Schema.Array(Schema.Int),
  partySeen: Schema.Array(Schema.Int),
  /** Where each seat stands, in seat order. */
  tokens: Schema.Array(LevelVisitToken),
  /** Whether this is the visit on the campaign's table. */
  onTable: Schema.Boolean,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/** One of a campaign's visits in its list: what it is and whether it is on the table. */
export class LevelVisitSummary extends Schema.Class<LevelVisitSummary>("LevelVisitSummary")({
  id: LevelVisitId,
  levelId: Schema.NullOr(LevelId),
  name: Schema.String,
  columns: Schema.Int,
  rows: Schema.Int,
  feetPerCell: Schema.Int,
  onTable: Schema.Boolean,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * Open a visit of one of the creator's own levels. Another account's level is
 * `NotFound`; a level the campaign already has a visit of is a `Conflict`
 * (put that one on the table, or reset it).
 */
export const LevelVisitOpen = Schema.Struct({ levelId: LevelId });
export type LevelVisitOpen = typeof LevelVisitOpen.Type;

/** Put one of the campaign's visits on its table, taking off whichever was there. */
export const TableVisitSet = Schema.Struct({ visitId: LevelVisitId });
export type TableVisitSet = typeof TableVisitSet.Type;
