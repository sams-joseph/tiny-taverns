import { Schema } from "effect";
import { CombatantPosition } from "./Combatant.js";
import { EncounterKind } from "./EncounterKind.js";
import {
  CampaignCharacterId,
  EncounterCreatureId,
  EncounterId,
  EncounterRunId,
  LevelId,
  LevelVisitId,
  SessionId,
} from "./Ids.js";
import { PlayerLiveLevel, RunBoardLevel } from "./LevelFight.js";

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
 * **The creator's whole.** Every field here is the DM's; a seated player's
 * view of the visit on the table is `PlayerLevelVisit`, a distinct schema
 * narrowed in SQL.
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

/**
 * Why a placed creature cannot stand where it was put on the visit's copy:
 * the square is past the copy's edge, or no token may stand on it there
 * (`standable`). The placement was checked against the level when it was
 * written; the visit is a copy taken when it was opened, and either may have
 * changed since. A flagged spot is listed rather than dropped, so the DM sees
 * it needs moving.
 */
export const LevelVisitSpotProblem = Schema.Literals(["offBoard", "blocked"]);
export type LevelVisitSpotProblem = typeof LevelVisitSpotProblem.Type;

/** One placed creature of an encounter on the visit, as the DM sees it. */
export const LevelVisitPlacedCreature = Schema.Struct({
  encounterCreatureId: EncounterCreatureId,
  ordinal: Schema.Int,
  /** The roster line's name: a member of the Cast's own, else the creature's. */
  name: Schema.String,
  column: Schema.Int,
  row: Schema.Int,
  /** `null` when it can stand there. */
  problem: Schema.NullOr(LevelVisitSpotProblem),
});
export type LevelVisitPlacedCreature = typeof LevelVisitPlacedCreature.Type;

/**
 * An encounter placed in the visit: the campaign's, on the visit's level,
 * with creatures placed, and never played (`EncounterSpots.ts`). Computed on
 * read, never stored.
 */
export const LevelVisitEncounter = Schema.Struct({
  id: EncounterId,
  name: Schema.String,
  kind: EncounterKind,
  /** By roster line, then instance. */
  creatures: Schema.Array(LevelVisitPlacedCreature),
  /**
   * The trigger area on the visit's board, in reading order, or `null` for
   * none. Squares of the level past the copy's edge are left out.
   */
  trigger: Schema.NullOr(Schema.Array(CombatantPosition)),
});
export type LevelVisitEncounter = typeof LevelVisitEncounter.Type;

/**
 * The live fight borrowing a visit: the run, on its night, so the DM's stage
 * can go to it. While a fight borrows the visit, every write to the visit is a
 * `Conflict` and the board is the fight's; ending it resolved hands the
 * dungeon back (`EncounterRun.levelVisitId`).
 */
export const LevelVisitFight = Schema.Struct({
  runId: EncounterRunId,
  sessionId: SessionId,
  /** The fight's name: its encounter's, as it was when the fight started. */
  name: Schema.String,
});
export type LevelVisitFight = typeof LevelVisitFight.Type;

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
  /** The encounters placed in the visit and not yet played, in the DM's planned order. */
  encounters: Schema.Array(LevelVisitEncounter),
  /** Whether this is the visit on the campaign's table. */
  onTable: Schema.Boolean,
  /** The live fight played on the visit, or `null` while the party explores it. */
  fight: Schema.NullOr(LevelVisitFight),
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

/**
 * The DM stands a seat's token on a square of the visit, as they would a
 * miniature: any square on the board a token may stand on (`standable`), with
 * no walk and no speed. `Conflict` for a square off the board or one no token
 * may stand on; `NotFound` for a seat with no token on the visit. It is
 * written over and over while the DM drags, so it carries a `requestId`.
 *
 * Every write to a visit (this, and its fog, doors, lights and regions, which
 * take a fight board's payloads: `BoardFogUpdate`, `BoardDoorUpdate`,
 * `BoardLightUpdate`, `BoardRegionUpdate`) is answered with the visit,
 * recomputes what the party sees, and is a `Conflict` while a live fight is
 * played on the visit. A repeated `requestId` changes nothing.
 */
export const LevelVisitTokenMove = Schema.Struct({
  position: CombatantPosition,
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isBetweenLength(1, 128))),
});
export type LevelVisitTokenMove = typeof LevelVisitTokenMove.Type;

/** Put one of the campaign's visits on its table, taking off whichever was there. */
export const TableVisitSet = Schema.Struct({ visitId: LevelVisitId });
export type TableVisitSet = typeof TableVisitSet.Type;

/**
 * One of the party's tokens on the visit as a seated player's table has it: a
 * live seat this player may see (shared, or their own), and not one the DM's
 * fog covers unless it is their own. `own` marks the asker's own seats, the
 * only tokens they walk (`table.moveOnVisit`).
 */
export const PlayerLevelVisitToken = Schema.Struct({
  seatId: CampaignCharacterId,
  /** The seat's name at this table (`PartySeat.displayName`). */
  name: Schema.String,
  own: Schema.Boolean,
  column: Schema.Int,
  row: Schema.Int,
});
export type PlayerLevelVisitToken = typeof PlayerLevelVisitToken.Type;

/**
 * A placed creature the party sees now: its name and its square, and nothing
 * else (no encounter, no roster line, no count, no trigger). Sight decides on
 * a level: a line the DM keeps hidden (`visibility = 'dm'`) is shown when the
 * party sees its square, as a fight's foe on a level is.
 */
export const PlayerLevelVisitCreature = Schema.Struct({
  /** A member of the Cast's own name, else the creature's, as a fight's token would say. */
  name: Schema.String,
  column: Schema.Int,
  row: Schema.Int,
});
export type PlayerLevelVisitCreature = typeof PlayerLevelVisitCreature.Type;

/**
 * The visit on the table as a seated player sees it (`PlayerLiveTable.visit`).
 *
 * A distinct schema, not `LevelVisit` with fields taken off: no `levelId` and
 * no name (the level is the DM's to name, as a fight's encounter is), and the
 * level is the party's view of the copy (`PlayerLiveLevel`), narrowed in SQL
 * by what the party has seen with the DM's fog taken out, as a fight's player
 * board is: no `entry` region, no DM-only prop, no unrevealed secret, nothing
 * on a square the party has not seen. The size and scale mean what they mean
 * on `LevelVisit`.
 */
export const PlayerLevelVisit = Schema.Struct({
  id: LevelVisitId,
  columns: Schema.Int,
  rows: Schema.Int,
  feetPerCell: Schema.Int,
  level: PlayerLiveLevel,
  /** The squares under the DM's fog, in reading order, drawn opaque as a fight's player board draws them. */
  fog: Schema.Array(CombatantPosition),
  /** The party's tokens this player may see, in seat order. */
  tokens: Schema.Array(PlayerLevelVisitToken),
  /**
   * The placed creatures of unplayed encounters standing where the party sees
   * now (`party_sees` with the DM's fog taken out), in reading order. What the
   * party saw before and does not see now is not here: the table is told only
   * what is in front of it.
   */
  creatures: Schema.Array(PlayerLevelVisitCreature),
});
export type PlayerLevelVisit = typeof PlayerLevelVisit.Type;
