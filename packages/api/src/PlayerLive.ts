import { Schema } from "effect";
import { AttackDelivery, DamageType } from "./AttackDelivery.js";
import { BoardArea } from "./Board.js";
import { CharacterPortraitImages, DeathSaves } from "./Character.js";
import { CombatantPosition, InitiativeSetBy } from "./Combatant.js";
import { EncounterKind } from "./EncounterKind.js";
import { EncounterRunPhase } from "./EncounterRun.js";
import { RollOutcome } from "./Roll.js";
import {
  CampaignCharacterId,
  CampaignId,
  CharacterId,
  CombatantId,
  EncounterId,
  EncounterRunId,
  RollId,
  SessionEventId,
  SessionId,
} from "./Ids.js";

/**
 * What is happening at a table **right now**, told to somebody sitting at it.
 *
 * This is a distinct player schema on a distinct endpoint, never a filtered DM
 * combatant list. Exact monster hit points and armour class have no field here,
 * and a player row reaches this endpoint only through an active
 * `campaign_character` seat.
 */
export const PlayerLiveHpBand = Schema.Literals(["unhurt", "hurt", "bloodied", "down", "unknown"]);
export type PlayerLiveHpBand = typeof PlayerLiveHpBand.Type;

/** Whose turn it is, when the player may see that creature. */
export const PlayerLiveTurnVisible = Schema.Struct({
  kind: Schema.Literal("visible"),
  combatantId: CombatantId,
  displayName: Schema.String,
});
export type PlayerLiveTurnVisible = typeof PlayerLiveTurnVisible.Type;

/**
 * The DM's marker is on a row this player may not see: a creature the DM has
 * hidden, or a character whose seat is not shared. The table can say that
 * something moves; it is not told what, so there is no id and no name.
 */
export const PlayerLiveTurnHidden = Schema.Struct({
  kind: Schema.Literal("hidden"),
});
export type PlayerLiveTurnHidden = typeof PlayerLiveTurnHidden.Type;

export const PlayerLiveTurn = Schema.Union([PlayerLiveTurnVisible, PlayerLiveTurnHidden]);
export type PlayerLiveTurn = typeof PlayerLiveTurn.Type;

export const PlayerLiveSeat = Schema.Struct({
  characterId: CharacterId,
  campaignCharacterId: CampaignCharacterId,
  combatantId: CombatantId,
});
export type PlayerLiveSeat = typeof PlayerLiveSeat.Type;

export const PlayerLiveCombatantYou = Schema.Struct({
  kind: Schema.Literal("you"),
  combatantId: CombatantId,
  characterId: CharacterId,
  campaignCharacterId: CampaignCharacterId,
  displayName: Schema.NonEmptyString,
  subtitle: Schema.NullOr(Schema.String),
  /** `null` until somebody has said — see `Combatant.initiative`. */
  initiative: Schema.NullOr(Schema.Int),
  /**
   * Your own character's initiative bonus, so *Roll* on your Table is d20 plus
   * the number your sheet gives. Yours alone: no other arm carries one.
   */
  initiativeBonus: Schema.NullOr(Schema.Int),
  /**
   * Who entered your number. While it is `null` or `player`, and the fight is
   * rolling initiative, you may enter or correct it; once it is `dm`, the DM's
   * number stands.
   */
  initiativeSetBy: Schema.NullOr(InitiativeSetBy),
  hpCurrent: Schema.Int,
  hpMax: Schema.Int,
  tempHp: Schema.Int,
  /** Your character's armour class as the fight snapshotted it (`Combatant.ac`). */
  ac: Schema.NullOr(Schema.Int),
  conditions: Schema.Array(Schema.String),
  /**
   * This turn's spending on your own row, as `Combatant.actionUsed` and its
   * siblings: yours alone, since the spending of anybody else's turn is the
   * DM's. You tick the first three (`table.turn`); `feetMoved` counts your
   * own moves while you are up (`table.move`) and the DM's moves of you.
   */
  actionUsed: Schema.Boolean,
  bonusUsed: Schema.Boolean,
  reactionUsed: Schema.Boolean,
  feetMoved: Schema.Int,
  /** Your character's death saves, as the fight holds them. */
  deathSaves: DeathSaves,
  /** Your character's portrait, as `Character.portrait` carries it. */
  portrait: Schema.NullOr(CharacterPortraitImages),
});
export type PlayerLiveCombatantYou = typeof PlayerLiveCombatantYou.Type;

export const PlayerLiveCombatantAlly = Schema.Struct({
  kind: Schema.Literal("ally"),
  combatantId: CombatantId,
  characterId: CharacterId,
  displayName: Schema.NonEmptyString,
  subtitle: Schema.NullOr(Schema.String),
  playerName: Schema.NullOr(Schema.String),
  initiative: Schema.NullOr(Schema.Int),
  /**
   * The ally's exact hit points and death saves: a party shares them openly.
   * Selected in SQL through the same seat that makes the row visible at all,
   * so a character the asker may not see is not in the order to carry them.
   * Temporary hit points stay the owner's (`you`).
   */
  hpCurrent: Schema.Int,
  hpMax: Schema.Int,
  conditions: Schema.Array(Schema.String),
  deathSaves: DeathSaves,
  /**
   * The ally's portrait, computed in SQL through the seat that makes the row
   * visible at all, so a character the asker may not see has no URL here.
   */
  portrait: Schema.NullOr(CharacterPortraitImages),
});
export type PlayerLiveCombatantAlly = typeof PlayerLiveCombatantAlly.Type;

export const PlayerLiveCombatantNpc = Schema.Struct({
  kind: Schema.Literal("npc"),
  combatantId: CombatantId,
  displayName: Schema.NonEmptyString,
  subtitle: Schema.NullOr(Schema.String),
  initiative: Schema.NullOr(Schema.Int),
  hpBand: PlayerLiveHpBand,
  conditions: Schema.Array(Schema.String),
});
export type PlayerLiveCombatantNpc = typeof PlayerLiveCombatantNpc.Type;

export const PlayerLiveCombatant = Schema.Union([
  PlayerLiveCombatantYou,
  PlayerLiveCombatantAlly,
  PlayerLiveCombatantNpc,
]);
export type PlayerLiveCombatant = typeof PlayerLiveCombatant.Type;

/** A token on the player's board: a row of their order, standing on a square. */
export const PlayerLiveToken = Schema.Struct({
  /** The row in `PlayerLiveFight.order` this token stands for. */
  combatantId: CombatantId,
  position: CombatantPosition,
});
export type PlayerLiveToken = typeof PlayerLiveToken.Type;

/**
 * The fight's board as a player sees it, once the DM has turned on *Share map*.
 *
 * A distinct schema, not the creator's `EncounterRunBoard` with fields taken
 * off. The size and scale mean what they mean on `EncounterRunBoard`.
 */
export const PlayerLiveBoard = Schema.Struct({
  columns: Schema.Int,
  rows: Schema.Int,
  feetPerCell: Schema.Int,
  /**
   * The squares under fog of war, in reading order (row by row): drawn opaque,
   * since no token on one is on this player's board but their own. A creature
   * there is not in their order either; an ally keeps its row.
   */
  fog: Schema.Array(CombatantPosition),
  /**
   * The area template the DM has pinned, or `null`: the same template the DM's
   * board carries, shown while the board is.
   */
  area: Schema.NullOr(BoardArea),
  /**
   * The tokens on the board: only rows in this player's `order`, only those the
   * DM has put down, no NPC's while the DM hides hostile tokens, and none under
   * fog but the player's own.
   */
  tokens: Schema.Array(PlayerLiveToken),
});
export type PlayerLiveBoard = typeof PlayerLiveBoard.Type;

/**
 * A line the table heard: the narration of a monster's turn Hob proposed and
 * the DM kept, when a player could have seen the creature act — it and the
 * fight shown, and it not under fog where the turn left it. Decided when the
 * turn was kept, so a creature hidden since does not unsay it; a turn the DM
 * undid takes its line with it. `said` is what the creature said aloud, under
 * the same rule, or `null` when it said nothing.
 */
export const PlayerLiveNarration = Schema.Struct({
  id: SessionEventId,
  combatantName: Schema.String,
  text: Schema.String,
  said: Schema.NullOr(Schema.String),
  round: Schema.Int,
});
export type PlayerLiveNarration = typeof PlayerLiveNarration.Type;

/**
 * Something the board draws that happened in the fight, as a player may see
 * it (`BoardEffects.tsx`): an attack from one creature at another, or an area
 * where its damage went. A distinct schema on the player's path, not the
 * creator's `Roll`: it carries the geometry and how an attack came out, and no
 * label, total, dice or armour class. An attack is here only when this player
 * is shown both creatures; an area whenever its fight's board is, naming the
 * creature that loosed it only when they are shown that too. A turn the DM
 * undid takes its acts with it.
 */
export const PlayerLiveAct = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("strike"),
    /** The roll it was made by, which is no key to read it by. */
    id: RollId,
    from: CombatantId,
    to: CombatantId,
    delivery: AttackDelivery,
    damageType: Schema.NullOr(DamageType),
    outcome: Schema.NullOr(RollOutcome),
  }),
  Schema.Struct({
    kind: Schema.Literal("blast"),
    id: RollId,
    from: Schema.NullOr(CombatantId),
    area: BoardArea,
    damageType: Schema.NullOr(DamageType),
  }),
]);
export type PlayerLiveAct = typeof PlayerLiveAct.Type;

export const PlayerLiveFight = Schema.Struct({
  id: EncounterRunId,
  /** `null` unless this player may read the encounter (Shared and Ready). */
  encounterId: Schema.NullOr(EncounterId),
  /**
   * What kind of scene is on the table. Only a fight has an order; for a
   * conversation, a skill challenge or a hazard this, the read-aloud through
   * `encounterId`, and the player's own rolls are all a player is told — the
   * scene's DCs, targets, tally, attitude and beats are the creator's
   * (`EncounterRunScene`) and have no field here.
   */
  mode: EncounterKind,
  round: Schema.Int,
  /**
   * `initiative` while the numbers are still arriving — nobody is up, and a
   * seated player may enter their own (`table.setInitiative`) — else `turns`.
   */
  phase: EncounterRunPhase,
  /**
   * Whose turn it is: `visible` names the row, `hidden` says only that the
   * marker is on a row this player may not see, and `null` means the DM has
   * set no marker (and always while rolling initiative, or outside a fight).
   */
  upNext: Schema.NullOr(PlayerLiveTurn),
  /** This account's active campaign-character seats in this fight. */
  seats: Schema.Array(PlayerLiveSeat),
  /** The initiative order, already projected to what a player may know. */
  order: Schema.Array(PlayerLiveCombatant),
  /** The board, or `null` unless the DM has turned on *Share map* and the fight has one. */
  board: Schema.NullOr(PlayerLiveBoard),
  /** The last few lines the table heard of this fight, newest first. */
  narration: Schema.Array(PlayerLiveNarration),
  /** The fight's latest attacks and areas this player may see drawn, oldest first; none without a board. */
  acts: Schema.Array(PlayerLiveAct),
});
export type PlayerLiveFight = typeof PlayerLiveFight.Type;

export class PlayerLiveTable extends Schema.Class<PlayerLiveTable>("PlayerLiveTable")({
  campaignId: CampaignId,
  sessionId: SessionId,
  /** *"Session 12"* — the number, not the whole `Session`, which carries the DM's title. */
  sessionNumber: Schema.Int,
  fight: Schema.NullOr(PlayerLiveFight),
}) {}

/** A contentless player live doorbell. Clients re-read the narrow table/log. */
export const PlayerLiveTick = Schema.Struct({ tick: Schema.Literal("session") });
export type PlayerLiveTick = typeof PlayerLiveTick.Type;

export class PlayerLiveHeartbeat extends Schema.Class<PlayerLiveHeartbeat>("PlayerLiveHeartbeat")({
  _tag: Schema.tag("Heartbeat"),
  seq: Schema.Int,
}) {}

export const PlayerLiveEvent = Schema.Union([
  Schema.Struct({
    id: Schema.String,
    event: Schema.Literal("tick"),
    data: Schema.fromJsonString(PlayerLiveTick),
  }),
  Schema.Struct({
    // Absent, not `undefined`: the SSE decoder omits an event's missing `id`.
    id: Schema.optionalKey(Schema.String),
    event: Schema.Literal("heartbeat"),
    data: Schema.fromJsonString(PlayerLiveHeartbeat),
  }),
]);
export type PlayerLiveEvent = typeof PlayerLiveEvent.Type;
