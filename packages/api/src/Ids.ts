import { Schema } from "effect";

/**
 * Every identifier in the product is a v4 UUID. They are branded so an
 * `AccountId` can never be passed where a `CampaignId` is wanted — the ids are
 * structurally identical strings and the compiler is the only thing that can
 * tell them apart.
 */
const id = <const Name extends string>(name: Name) =>
  Schema.String.check(Schema.isUUID()).pipe(Schema.brand(name));

export const AccountId = id("AccountId");
export type AccountId = typeof AccountId.Type;

export const CampaignId = id("CampaignId");
export type CampaignId = typeof CampaignId.Type;

export const SessionId = id("SessionId");
export type SessionId = typeof SessionId.Type;

export const CharacterId = id("CharacterId");
export type CharacterId = typeof CharacterId.Type;

export const NoteId = id("NoteId");
export type NoteId = typeof NoteId.Type;

export const EncounterId = id("EncounterId");
export type EncounterId = typeof EncounterId.Type;

export const PrepItemId = id("PrepItemId");
export type PrepItemId = typeof PrepItemId.Type;

export const CreatureId = id("CreatureId");
export type CreatureId = typeof CreatureId.Type;

/**
 * A creature's place on one encounter's roster — the join row, not the creature.
 * It has an id of its own because the roster line is what a client edits: the
 * count changes, the creature does not.
 */
export const EncounterCreatureId = id("EncounterCreatureId");
export type EncounterCreatureId = typeof EncounterCreatureId.Type;

/**
 * One playing of an encounter. Not the encounter: the same template can be run
 * again next week, and each run is its own row with its own combatants.
 */
export const EncounterRunId = id("EncounterRunId");
export type EncounterRunId = typeof EncounterRunId.Type;

/**
 * One creature *instance* in one fight. `data.js:18-19` has two `Goblin Archer`
 * rows with different ids and different hit points — this is what tells them
 * apart, and why a combatant is never addressed by its creature.
 */
export const CombatantId = id("CombatantId");
export type CombatantId = typeof CombatantId.Type;

/** One line of the append-only session log. */
export const SessionEventId = id("SessionEventId");
export type SessionEventId = typeof SessionEventId.Type;

/**
 * One line of prose about what happened at the table. Unlike a `SessionEventId`
 * this names something the DM can go back and correct — which is the whole
 * reason beats are not log lines.
 */
export const BeatId = id("BeatId");
export type BeatId = typeof BeatId.Type;

/**
 * One invitation to join a campaign.
 *
 * Names the *row*, never the token — the token is a secret the server only ever
 * stores as a digest, and it is what a person holds. This is what a DM revokes.
 */
export const InviteId = id("InviteId");
export type InviteId = typeof InviteId.Type;

/** One conversation with Hob — a thread of turns, scoped to one campaign. */
export const AssistantThreadId = id("AssistantThreadId");
export type AssistantThreadId = typeof AssistantThreadId.Type;

/**
 * Points at the assistant conversation turn that produced a row.
 *
 * `assistant_turn` is a real table now, and every content table's
 * `assistant_turn_id` is a real foreign key into it — so "where did this NPC
 * name come from?" is a join rather than a guess. See `HobTurn`.
 */
export const AssistantTurnId = id("AssistantTurnId");
export type AssistantTurnId = typeof AssistantTurnId.Type;
