import { Schema } from "effect";
import { AccountId, CampaignId, SharedWorldId, SessionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * Where a campaign's cover loads from: two sizes of one 3:2 WebP, each a
 * short-lived signed path on this API (`/campaign-images/:imageId/:variant?e=…&s=…`).
 *
 * The same capability `CharacterPortraitImages` is: a path rather than an
 * absolute URL, minted only inside a read whose SQL already returned the
 * campaign, so whoever can read the campaign sees its cover and nobody else
 * gets a URL. A bad or expired one is `NotFound`.
 */
export class CampaignImages extends Schema.Class<CampaignImages>("CampaignImages")({
  /** 768 × 512, for the campaign list's cards. */
  cardUrl: Schema.String,
  /** 1536 × 1024, the drawn size, for the Overview's cover. */
  fullUrl: Schema.String,
}) {}

export class Campaign extends Schema.Class<Campaign>("Campaign")({
  id: CampaignId,
  /** Private-context identity used by server integrity; never presented as a Shared World. */
  contextId: SharedWorldId,
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
  /**
   * The cover Hob drew once, after the campaign was made — or `null`: none was
   * drawn (images are off, there was nothing to draw from, the provider
   * refused), it is still being drawn, or this server cannot sign URLs.
   */
  image: Schema.NullOr(CampaignImages),
  /**
   * The cover is being drawn right now. A screen shows a quiet drawing state
   * and re-reads until it clears; it never becomes true again, because a cover
   * is drawn once.
   */
  imagePending: Schema.Boolean,
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
