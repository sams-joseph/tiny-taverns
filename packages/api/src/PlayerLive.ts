import { Schema } from "effect";
import {
  CampaignCharacterId,
  CampaignId,
  CharacterId,
  CombatantId,
  EncounterId,
  EncounterRunId,
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

export const PlayerLiveTurn = Schema.Struct({
  combatantId: CombatantId,
  displayName: Schema.String,
});
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
  initiative: Schema.Int,
  hpCurrent: Schema.Int,
  hpMax: Schema.Int,
  tempHp: Schema.Int,
  conditions: Schema.Array(Schema.String),
});
export type PlayerLiveCombatantYou = typeof PlayerLiveCombatantYou.Type;

export const PlayerLiveCombatantAlly = Schema.Struct({
  kind: Schema.Literal("ally"),
  combatantId: CombatantId,
  characterId: CharacterId,
  displayName: Schema.NonEmptyString,
  subtitle: Schema.NullOr(Schema.String),
  playerName: Schema.NullOr(Schema.String),
  initiative: Schema.Int,
  conditions: Schema.Array(Schema.String),
});
export type PlayerLiveCombatantAlly = typeof PlayerLiveCombatantAlly.Type;

export const PlayerLiveCombatantNpc = Schema.Struct({
  kind: Schema.Literal("npc"),
  combatantId: CombatantId,
  displayName: Schema.NonEmptyString,
  subtitle: Schema.NullOr(Schema.String),
  initiative: Schema.Int,
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

export const PlayerLiveFight = Schema.Struct({
  id: EncounterRunId,
  encounterId: Schema.NullOr(EncounterId),
  round: Schema.Int,
  /** `null` when the DM has set no marker, or has hidden the row it names. */
  upNext: Schema.NullOr(PlayerLiveTurn),
  /** This account's active campaign-character seats in this fight. */
  seats: Schema.Array(PlayerLiveSeat),
  /** The initiative order, already projected to what a player may know. */
  order: Schema.Array(PlayerLiveCombatant),
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
    id: Schema.UndefinedOr(Schema.String),
    event: Schema.Literal("heartbeat"),
    data: Schema.fromJsonString(PlayerLiveHeartbeat),
  }),
]);
export type PlayerLiveEvent = typeof PlayerLiveEvent.Type;
