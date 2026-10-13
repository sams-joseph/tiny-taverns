import { Schema } from "effect";
import { CombatantPosition } from "./Combatant.js";
import {
  AssistantTurnId,
  CombatantId,
  EncounterRunId,
  HobPendingSaveId,
  SessionId,
} from "./Ids.js";
import { NpcTurnMoment } from "./NpcTurnCheck.js";
import { RollMode } from "./Roll.js";

/**
 * **What came of a kept monster turn**: the server carried out an `npcTurn`
 * proposal (`hobFight.keep`) and this is the record of it, step by step — each
 * die it rolled, how each attack came out, each save, the hit points every
 * target lost and who dropped — plus what it left to the DM, in words.
 *
 * Stored on the turn's audit row when it is kept and answered by the keep, so
 * the runner's card says what happened without re-deriving it from the log.
 * Names are snapshots for the card; ids are pointers, never an access path.
 */

const Named = Schema.Struct({ combatantId: CombatantId, name: Schema.String });

/** One damage notation as rolled (`DamageRoll`, `Attack.ts`). */
export const NpcTurnDamageRoll = Schema.Struct({
  notation: Schema.String,
  faces: Schema.Array(Schema.Int),
  modifier: Schema.Int,
  total: Schema.Int,
  type: Schema.NullOr(Schema.String),
});
export type NpcTurnDamageRoll = typeof NpcTurnDamageRoll.Type;

/** Hit points one target lost to one roll, as the damage statement answered them. */
export const NpcTurnHit = Schema.Struct({
  amount: Schema.Int,
  hpBefore: Schema.Int,
  hpAfter: Schema.Int,
  /** It was standing and is now at zero. */
  dropped: Schema.Boolean,
  /** The Constitution save a concentrating target now owes, as `combatant-damaged` logs it. */
  concentrationDc: Schema.optional(Schema.Int),
});
export type NpcTurnHit = typeof NpcTurnHit.Type;

/** One attack roll: a single attack, a strike of a multiattack, or a spell attack. */
export const NpcTurnAttack = Schema.Struct({
  optionId: Schema.String,
  name: Schema.String,
  target: Named,
  d20s: Schema.Array(Schema.Int),
  d20: Schema.Int,
  mode: RollMode,
  toHit: Schema.Int,
  total: Schema.Int,
  ac: Schema.NullOr(Schema.Int),
  verdict: Schema.Literals(["critical", "hit", "natural-1", "miss", "no-ac"]),
  damage: Schema.Array(NpcTurnDamageRoll),
  /** Absent when nothing landed, or there was nothing to take (a miss, no dice). */
  hit: Schema.optional(NpcTurnHit),
});
export type NpcTurnAttack = typeof NpcTurnAttack.Type;

/** One target's save against a save-for-damage option. */
export const NpcTurnSave = Schema.Struct({
  target: Named,
  /**
   * The d20 and what was added, when the server rolled it: a monster target
   * whose stat block writes the save. Null when it did not.
   */
  roll: Schema.NullOr(Schema.Struct({ d20: Schema.Int, modifier: Schema.Int, total: Schema.Int })),
  succeeded: Schema.NullOr(Schema.Boolean),
  hit: Schema.optional(NpcTurnHit),
  /** The save left to the DM when the server could not roll it (`HobPendingSave`). */
  pendingSaveId: Schema.optional(HobPendingSaveId),
});
export type NpcTurnSave = typeof NpcTurnSave.Type;

export const NpcTurnOutcomeStep = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("move"), to: CombatantPosition, feet: Schema.Int }),
  Schema.Struct({
    kind: Schema.Literal("option"),
    optionId: Schema.String,
    name: Schema.String,
    slot: Schema.Literals(["action", "bonus", "reaction", "legendary"]),
    attacks: Schema.Array(NpcTurnAttack),
    /** A save-for-damage: the DC, the damage rolled once for every target, and each target's save. */
    save: Schema.optional(
      Schema.Struct({
        dc: Schema.Int,
        ability: Schema.String,
        onSuccess: Schema.String,
        damage: Schema.Array(NpcTurnDamageRoll),
        targets: Schema.Array(NpcTurnSave),
      }),
    ),
    /** What the data could not carry out, for the DM to judge (resistances, riders, prose). */
    notes: Schema.Array(Schema.String),
  }),
]);
export type NpcTurnOutcomeStep = typeof NpcTurnOutcomeStep.Type;

export const NpcTurnOutcome = Schema.Struct({
  turnId: AssistantTurnId,
  sessionId: SessionId,
  runId: EncounterRunId,
  combatantId: CombatantId,
  combatantName: Schema.String,
  moment: NpcTurnMoment,
  round: Schema.Int,
  steps: Schema.Array(NpcTurnOutcomeStep),
  narration: Schema.String,
});
export type NpcTurnOutcome = typeof NpcTurnOutcome.Type;

/**
 * **A save a kept turn could not roll**, waiting on the DM: a party member's
 * (Hob never rolls for a player), or a monster's whose stat block writes no
 * save. The damage was rolled once with the turn; the DM enters the target's
 * total (`hobFight.resolveSave`) and the server applies all, half or none of
 * it by `onSuccess`. `lapsed` is a save that will never be resolved: the fight
 * ended with it outstanding, or its turn was undone, and no damage was applied.
 */
export const HobPendingSave = Schema.Struct({
  id: HobPendingSaveId,
  turnId: AssistantTurnId,
  /** Null once the target has left the fight; then it cannot be resolved. */
  combatantId: Schema.NullOr(CombatantId),
  targetName: Schema.String,
  optionName: Schema.String,
  ability: Schema.String,
  dc: Schema.Int,
  onSuccess: Schema.String,
  amount: Schema.Int,
  damageTypes: Schema.Array(Schema.String),
  state: Schema.Literals(["pending", "resolved", "lapsed"]),
  total: Schema.NullOr(Schema.Int),
  succeeded: Schema.NullOr(Schema.Boolean),
});
export type HobPendingSave = typeof HobPendingSave.Type;

/** What the DM enters for a pending save: the target's total. */
export const HobSaveResolve = Schema.Struct({
  total: Schema.Int.check(Schema.isBetween({ minimum: -10, maximum: 60 })),
});
export type HobSaveResolve = typeof HobSaveResolve.Type;

/** A pending save, resolved: the row, and what the target lost. */
export const HobSaveResolved = Schema.Struct({
  save: HobPendingSave,
  hit: Schema.NullOr(NpcTurnHit),
  /** Set when the source's success word is one the rule does not know: the damage went in full. */
  judged: Schema.Boolean,
});
export type HobSaveResolved = typeof HobSaveResolved.Type;
