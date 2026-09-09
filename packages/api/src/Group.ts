import { Schema } from "effect";
import { AccountId, CampaignId, GroupId } from "./Ids.js";

/**
 * A group: the top-level social container for connected play.
 *
 * The captain's model, settled 2026-09-01: a group holds users, campaigns and
 * a shared history. Group membership is **eligibility, not participation** —
 * a live member may create campaigns in the group and reads the group's shared
 * history, but reaches a campaign's content only through that campaign's own
 * explicit participant subset. The group owner manages membership and
 * invitations; every live member may create campaigns; each campaign's creator
 * is its sole DM.
 *
 * `play_group` in SQL, because `group` is a keyword. A group everywhere else.
 *
 * There is deliberately no role column anywhere in this model. Owner-ness is
 * `play_group.owner_account_id`; creator-ness is `campaign.creator_account_id`;
 * everything else is a live membership row. A mutable role would be a second
 * answer to a question a column already settles.
 */
export class Group extends Schema.Class<Group>("Group")({
  id: GroupId,
  name: Schema.String,
  /** False for the automatic context behind a standalone campaign. */
  isSharedWorld: Schema.Boolean,
  /**
   * Who owns the group — the one account that manages membership and
   * invitations. On the wire because relation-derived chrome needs it: the
   * same group URL renders owner controls or member chrome off this field,
   * with no mode toggle anywhere.
   */
  ownerAccountId: AccountId,
  /** Groups are never deleted — they are somebody's shared world — only archived. */
  archivedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export const GroupCreate = Schema.Struct({
  name: Schema.NonEmptyString,
});
export type GroupCreate = typeof GroupCreate.Type;

export const GroupUpdate = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
});
export type GroupUpdate = typeof GroupUpdate.Type;

/**
 * A group this account belongs to — the answer `GET /groups` gives.
 *
 * `isOwner` is the one fact about the pair (this account, this group) that the
 * group row cannot carry, exactly as `CampaignMembership.relation` is for a
 * campaign. It is derived from `owner_account_id`, never stored a second time.
 */
export class GroupMembership extends Schema.Class<GroupMembership>("GroupMembership")({
  group: Group,
  isOwner: Schema.Boolean,
  /** When this account joined — for the owner, when they created the group. */
  joinedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * This reader's relation to one campaign in the group's directory.
 *
 * `none` is the state the whole participation decision exists for: a group
 * member who is not a participant sees that the campaign exists — the group's
 * shared world includes knowing what is being played in it — and nothing of
 * its content.
 */
export const GroupCampaignRelation = Schema.Literals(["creator", "player", "none"]);
export type GroupCampaignRelation = typeof GroupCampaignRelation.Type;

/**
 * One campaign in the group's directory — the answer
 * `GET /groups/:groupId/campaigns` gives to every live member.
 *
 * **Deliberately narrower than `Campaign`.** A member who does not participate
 * in a campaign gets its card — name, who runs it, their own relation — and
 * not its row: no session pointer, no visibility, no provenance. Content still
 * goes through `campaignReadable`, which requires participation. The card is
 * the group directory the navigation draws relation badges from
 * (`Created by you` / `Playing` / `Group campaign`).
 */
export class GroupCampaignCard extends Schema.Class<GroupCampaignCard>("GroupCampaignCard")({
  id: CampaignId,
  groupId: GroupId,
  creatorAccountId: AccountId,
  /** The creator's account name, so the card can say who runs it. */
  creatorName: Schema.String,
  name: Schema.String,
  relation: GroupCampaignRelation,
  archivedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * Somebody in the group — the answer `GET /groups/:groupId/members` gives.
 *
 * Readable by every live member, unlike a campaign's member list: a group is
 * the social container, and who is in your group is exactly what a group is.
 * What stays gated is the *campaign* roster, whose participant subset is the
 * campaign creator's to enumerate.
 */
export class GroupMember extends Schema.Class<GroupMember>("GroupMember")({
  accountId: AccountId,
  /** Their account name. */
  name: Schema.String,
  /** Derived from `play_group.owner_account_id`, never stored twice. */
  isOwner: Schema.Boolean,
  joinedAt: Schema.DateTimeUtcFromString,
}) {}
