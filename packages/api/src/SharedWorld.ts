import { Schema } from "effect";
import { AccountId, CampaignId, SharedWorldId } from "./Ids.js";

/** An explicit Shared World: optional context shared by connected campaigns. */
export class SharedWorld extends Schema.Class<SharedWorld>("SharedWorld")({
  id: SharedWorldId,
  name: Schema.String,
  /** Who may rename, archive, restore and share Library sources into this world. */
  ownerAccountId: AccountId,
  archivedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export const SharedWorldCreate = Schema.Struct({
  name: Schema.NonEmptyString,
});
export type SharedWorldCreate = typeof SharedWorldCreate.Type;

export const SharedWorldUpdate = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
});
export type SharedWorldUpdate = typeof SharedWorldUpdate.Type;

/** Connects one standalone campaign to an existing Shared World. */
export const SharedWorldConnection = Schema.Struct({
  worldId: SharedWorldId,
});
export type SharedWorldConnection = typeof SharedWorldConnection.Type;

/**
 * A Shared World this account belongs to — the answer `GET /worlds` gives.
 *
 * `isOwner` is the one fact about the pair (this account, this Shared World) that the
 * Shared World row cannot carry, exactly as `CampaignMembership.relation` is for a
 * campaign. It is derived from `owner_account_id`, never stored a second time.
 */
export class SharedWorldMembership extends Schema.Class<SharedWorldMembership>(
  "SharedWorldMembership",
)({
  sharedWorld: SharedWorld,
  isOwner: Schema.Boolean,
  /** When this account joined — for the owner, when they created the Shared World. */
  joinedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * This reader's relation to one campaign in the Shared World's directory.
 *
 * `none` is the state the whole participation decision exists for: a Shared
 * World member who is not a participant sees that the campaign exists, but
 * reaches none of its content.
 */
export const SharedWorldCampaignRelation = Schema.Literals(["creator", "player", "none"]);
export type SharedWorldCampaignRelation = typeof SharedWorldCampaignRelation.Type;

/**
 * One campaign in the Shared World's directory — the answer
 * `GET /worlds/:worldId/campaigns` gives to every live member.
 *
 * **Deliberately narrower than `Campaign`.** A member who does not participate
 * in a campaign gets its card — name, who runs it, their own relation — and
 * not its row: no session pointer, no visibility, no provenance. Content still
 * goes through `campaignReadable`, which requires participation. The card is
 * the Shared World directory the navigation draws relation badges from
 * (`Created by you` / `Playing` / `Shared World campaign`).
 */
export class SharedWorldCampaignCard extends Schema.Class<SharedWorldCampaignCard>(
  "SharedWorldCampaignCard",
)({
  id: CampaignId,
  worldId: SharedWorldId,
  creatorAccountId: AccountId,
  /** The creator's account name, so the card can say who runs it. */
  creatorName: Schema.String,
  name: Schema.String,
  relation: SharedWorldCampaignRelation,
  archivedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * Somebody in the Shared World — the answer `GET /worlds/:worldId/members` gives.
 *
 * Readable by every live member, unlike a campaign's member list: a Shared World is
 * the social container, and who is in your Shared World is exactly what a Shared World is.
 * What stays gated is the *campaign* roster, whose participant subset is the
 * campaign creator's to enumerate.
 */
export class SharedWorldMember extends Schema.Class<SharedWorldMember>("SharedWorldMember")({
  accountId: AccountId,
  /** Their account name. */
  name: Schema.String,
  /** Derived from `play_group.owner_account_id`, never stored twice. */
  isOwner: Schema.Boolean,
  joinedAt: Schema.DateTimeUtcFromString,
}) {}
