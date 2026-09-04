import { Schema } from "effect";
import {
  AssistantTurnId,
  CharacterId,
  CombatantId,
  EncounterRunId,
  HobDirectResourceUpdateId,
  SessionId,
} from "./Ids.js";

/**
 * One resource counter Hob moved directly while a fight was live.
 *
 * It is an audit row, not character content: the character sheet remains the
 * state holder, and this row records the exact before/after Hob wrote so the DM
 * can see it and undo it while they are watching the fight. The row is linked
 * to the assistant turn that made the tool call; the tool call id is server-side
 * idempotency and is not exposed as a capability.
 */
export class HobDirectResourceUpdate extends Schema.Class<HobDirectResourceUpdate>(
  "HobDirectResourceUpdate",
)({
  id: HobDirectResourceUpdateId,
  sessionId: SessionId,
  encounterRunId: EncounterRunId,
  combatantId: Schema.NullOr(CombatantId),
  characterId: Schema.NullOr(CharacterId),
  characterName: Schema.NonEmptyString,
  resourceId: Schema.NonEmptyString,
  resourceName: Schema.NonEmptyString,
  resourceMax: Schema.Int,
  amount: Schema.Int,
  beforeUsed: Schema.Int,
  afterUsed: Schema.Int,
  assistantTurnId: AssistantTurnId,
  undoneAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
