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

/**
 * Points at the assistant conversation turn that produced a row. The turn table
 * does not exist yet — see `Provenance.Origin`.
 */
export const AssistantTurnId = id("AssistantTurnId");
export type AssistantTurnId = typeof AssistantTurnId.Type;
