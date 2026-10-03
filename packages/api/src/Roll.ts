import { Schema } from "effect";
import {
  AccountId,
  CampaignId,
  CharacterId,
  CombatantId,
  EncounterRunId,
  RollId,
  SessionId,
} from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/** How a d20 roll chose the face it kept. Non-d20 rolls are always normal. */
export const RollMode = Schema.Literals(["normal", "advantage", "disadvantage"]);
export type RollMode = typeof RollMode.Type;

/** The d20 critical result the browser observed, when the roll has one. */
export const RollCritical = Schema.Literals(["hit", "miss"]);
export type RollCritical = typeof RollCritical.Type;

/**
 * What a roll was for. `plain` is a die or a check with nothing more to say,
 * and the default; the others are the runner's log lines: an attack's to-hit,
 * its damage, a death save, and a concentration save (a fight logs no
 * `encounter_run_check`, so a save made in one is a roll of this kind).
 */
export const RollKind = Schema.Literals([
  "attack",
  "damage",
  "death-save",
  "concentration",
  "plain",
]);
export type RollKind = typeof RollKind.Type;

/**
 * How an attack's to-hit came out against the target, as the browser worked
 * it out: `crit` is a natural 20 and `fumble` a natural 1. The server stores
 * it and does not recompute it.
 */
export const RollOutcome = Schema.Literals(["hit", "miss", "crit", "fumble"]);
export type RollOutcome = typeof RollOutcome.Type;

const RollFaces = Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })));
const RollLabel = Schema.NonEmptyString;
const RollNotation = Schema.NonEmptyString;

/**
 * One browser-rolled result, persisted only while a night is open.
 *
 * The server stores the faces the browser submitted; it does not roll them and
 * it does not interpret the event payload later. Visibility is copied from the
 * session at append time, so a roll keeps the sharing rule it was made under,
 * except that a roll with no character, the DM's, is always `dm`: its label
 * may carry a monster's name.
 */
export class Roll extends Schema.Class<Roll>("Roll")({
  id: RollId,
  campaignId: CampaignId,
  sessionId: SessionId,
  /** The fight it was rolled in; null for a reader who cannot read that fight. */
  encounterRunId: Schema.NullOr(EncounterRunId),
  accountId: AccountId,
  accountName: Schema.NonEmptyString,
  characterId: Schema.NullOr(CharacterId),
  characterName: Schema.NullOr(Schema.NonEmptyString),
  label: RollLabel,
  notation: RollNotation,
  dice: RollFaces,
  kept: RollFaces,
  modifier: Schema.Int,
  total: Schema.Int,
  mode: RollMode,
  critical: Schema.NullOr(RollCritical),
  kind: RollKind,
  /**
   * Who rolled it and at whom, in the fight it was rolled in. Each is null
   * for a reader who cannot read that combatant, as `encounterRunId` is.
   */
  combatantId: Schema.NullOr(CombatantId),
  targetCombatantId: Schema.NullOr(CombatantId),
  targetAc: Schema.NullOr(Schema.Int),
  outcome: Schema.NullOr(RollOutcome),
  requestId: Schema.NullOr(Schema.NonEmptyString),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * What a sheet or the DM's runner submits after it rolled in the browser.
 *
 * `visibility: "dm"` keeps a roll to the creator, and only the creator may ask
 * for it; a roll with no character is `dm` whether it asks or not. The
 * combatant pointers are the creator's too: each must name a combatant of the
 * fight on the table tonight, or the roll is `NotFound`.
 */
export const RollCreate = Schema.Struct({
  characterId: Schema.optional(CharacterId),
  visibility: Schema.optional(Schema.Literal("dm")),
  kind: Schema.optional(RollKind),
  combatantId: Schema.optional(CombatantId),
  targetCombatantId: Schema.optional(CombatantId),
  targetAc: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 40 }))),
  outcome: Schema.optional(RollOutcome),
  label: RollLabel,
  notation: RollNotation,
  dice: RollFaces,
  kept: RollFaces,
  modifier: Schema.Int,
  total: Schema.Int,
  mode: RollMode,
  critical: Schema.optional(Schema.NullOr(RollCritical)),
  requestId: Schema.optional(Schema.NonEmptyString),
});
export type RollCreate = typeof RollCreate.Type;

/** One session's durable roll tray, newest useful rows first. */
export const RollListFilter = {
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
} as const;

const RollListFilterValues = Schema.Struct(RollListFilter);
export type RollListFilterValues = typeof RollListFilterValues.Type;
