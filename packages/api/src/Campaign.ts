import { Schema } from "effect";
import { AccountId, CampaignId, GroupId, SessionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

export class Campaign extends Schema.Class<Campaign>("Campaign")({
  id: CampaignId,
  /** The group this campaign belongs to. Every campaign is in exactly one. */
  groupId: GroupId,
  /**
   * Who created the campaign — its sole DM, by the captain's decision of
   * 2026-09-01. Not a mutable role: creator-ness is this column, and every
   * other live participant is a player. On the wire because relation-derived
   * chrome branches on it — the same campaign URL renders creator actions or
   * participant projections with no global mode toggle.
   */
  creatorAccountId: AccountId,
  name: Schema.String,
  partyName: Schema.NullOr(Schema.String),
  playerCount: Schema.Int,
  /** The session the DM is running or preparing; drives the "Session 12" badge. */
  currentSessionId: Schema.NullOr(SessionId),
  visibility: Visibility,
  ...provenanceFields,
  /** Campaigns are never deleted — two years of Thursday nights — only archived. */
  archivedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * `visibility` is optional and *not* defaulted here: omitting it lets the
 * column default apply, which is the one place the `dm` default is stated.
 */
export const CampaignCreate = Schema.Struct({
  name: Schema.NonEmptyString,
  partyName: Schema.optional(Schema.String),
  playerCount: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 64 }))),
  visibility: Schema.optional(Visibility),
});
export type CampaignCreate = typeof CampaignCreate.Type;

export const CampaignUpdate = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  partyName: Schema.optional(Schema.NullOr(Schema.String)),
  playerCount: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 64 }))),
  currentSessionId: Schema.optional(Schema.NullOr(SessionId)),
  visibility: Schema.optional(Visibility),
});
export type CampaignUpdate = typeof CampaignUpdate.Type;
