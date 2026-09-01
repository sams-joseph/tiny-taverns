import { Schema } from "effect";
import { CampaignId, GroupId, GroupInviteId } from "./Ids.js";

/**
 * An invitation to join a group — and, optionally, one of its campaigns in the
 * same act.
 *
 * **A link is an invitation to join, not a way in.** Following one requires
 * signing in or signing up; its whole effect is to grant a `group_member` row
 * (and, when the invitation names a campaign, a `campaign_member` row in the
 * same transaction) to the account that accepts it. It is explicitly *not* a
 * bearer credential that reaches group data on its own, not a guest account
 * with no identity, and not a second credential kind with an actor shape of
 * its own — that last one is "a second way to be reachable, which is exactly
 * where the next leak lives".
 *
 * So once accepted, the member is an ordinary account with ordinary membership
 * rows, indistinguishable from one admitted any other way. This needs **no new
 * predicate, no new base case and no change to `Authorization`**.
 *
 * **Group-first, structurally.** Campaign participation cannot exist for a
 * non-group member (`campaign_member` carries a foreign key into
 * `group_member`), so an invitation that admits to a campaign grants the group
 * membership first and the participation second, in one transaction. There is
 * no campaign-only invitation.
 *
 * **Minting is the group owner's act** — the governance decision of
 * 2026-09-01: the owner manages membership and invitations. A campaign creator
 * who is not the owner adds *existing group members* to their campaign through
 * the campaign's own participation endpoint instead.
 *
 * ### It is still a credential, so it has a lifetime
 *
 * Four rules, each the choice that fails safe:
 *
 * - **Single-use.** One invitation, one membership. `redeemedAt` is set in the
 *   same transaction that writes the membership.
 * - **Expiring, on a fixed server-set clock.** `expiresAt` is `createdAt` plus
 *   `INVITE_TTL_DAYS` and never client-supplied.
 * - **Revocable before acceptance — and after it.** Revoking a spent
 *   invitation revokes the group membership it granted (and every campaign
 *   participation and party join under it) in the same transaction.
 * - **Forwarded is granted.** Whoever holds the token and signs in gets the
 *   membership; `redeemedByName` makes the wrong person visible, and one press
 *   undoes them.
 *
 * Denial is uniform and quiet: an unknown, expired, withdrawn or already-spent
 * token is the same `NotFound` a hidden row gets.
 */

/**
 * Where an invitation is in its life, decided by the server rather than by
 * four timestamps a client compares against its own clock.
 *
 * Precedence is `revoked` → `redeemed` → `expired` → `live`.
 */
export const InviteStatus = Schema.Literals(["live", "redeemed", "revoked", "expired"]);
export type InviteStatus = typeof InviteStatus.Type;

/**
 * One invitation, as the group owner sees it. **The token is not on this shape
 * and never will be** — the server stores only a digest.
 */
export class GroupInvite extends Schema.Class<GroupInvite>("GroupInvite")({
  id: GroupInviteId,
  groupId: GroupId,
  /**
   * The campaign this invitation admits to as well, or `null` for the group
   * alone. Named at mint time by the owner; the campaign must be in the group,
   * which the schema enforces with a composite foreign key.
   */
  campaignId: Schema.NullOr(CampaignId),
  /** Who it is for, in the owner's words. */
  label: Schema.String,
  status: InviteStatus,
  expiresAt: Schema.DateTimeUtcFromString,
  revokedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  redeemedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  /** The name of the account that took it, once one has. Provenance, not reach. */
  redeemedByName: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * A freshly minted invitation and the one time its token exists in plaintext.
 *
 * Nested rather than a `token` field on `GroupInvite`, so the type itself says
 * which read carries the secret.
 */
export class IssuedInvite extends Schema.Class<IssuedInvite>("IssuedInvite")({
  invite: GroupInvite,
  /** 32 random bytes, base64url. Shown once; the server keeps only its digest. */
  token: Schema.String,
}) {}

/**
 * Minting one. There is no role field — an invitation admits a member, and a
 * member is a member. `campaignId` optionally names one of the group's own
 * campaigns to admit the redeemer to in the same transaction.
 */
export const InviteCreate = Schema.Struct({
  label: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 80))),
  campaignId: Schema.optional(CampaignId),
});
export type InviteCreate = typeof InviteCreate.Type;

/**
 * The token, in a payload rather than a path.
 *
 * The link puts it in the hash fragment (`#/join/<token>`), which a browser
 * never sends to a server — so it stays out of access logs and out of the
 * `Referer` of anything the join page links to. Carrying it in a `POST` body
 * rather than in the request line is the same rule applied one step later.
 */
export const InviteToken = Schema.Struct({ token: Schema.NonEmptyString });
export type InviteToken = typeof InviteToken.Type;

/**
 * What the holder of a live invitation is told **before** signing in.
 *
 * A deliberate, minimal disclosure to whoever holds the capability — which is
 * the same trade the invitation itself is.
 */
export class InvitePreview extends Schema.Class<InvitePreview>("InvitePreview")({
  groupName: Schema.String,
  /** The group owner's own name, so the page can say who is asking. */
  ownerName: Schema.String,
  /** The campaign this invitation also seats you at, when it names one. */
  campaignName: Schema.NullOr(Schema.String),
  expiresAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * What redeeming answers with.
 *
 * Deliberately not the `Group` or the `Campaign`: the id and the names are
 * what the join page needs to say "you are in The Salt Company" and to link
 * onwards.
 */
export class InviteRedeemed extends Schema.Class<InviteRedeemed>("InviteRedeemed")({
  groupId: GroupId,
  groupName: Schema.String,
  /** The campaign this invitation seated you at, when it named one. */
  campaignId: Schema.NullOr(CampaignId),
  campaignName: Schema.NullOr(Schema.String),
  /**
   * Whether that campaign is shared with its participants yet. `false` also
   * when the invitation named no campaign. A campaign starts `dm`, so the
   * ordinary outcome of joining is a screen with nothing on it; saying so at
   * the moment of joining is the difference between "the creator has not
   * shared this table yet" and "this product is broken".
   */
  shared: Schema.Boolean,
}) {}
