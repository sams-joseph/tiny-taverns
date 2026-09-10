import { Schema } from "effect";
import { CampaignId, CampaignInviteId } from "./Ids.js";
import { CampaignSharedWorld } from "./Membership.js";

/**
 * An invitation to join a campaign.
 *
 * **A link is an invitation to join, not a way in.** Following one requires
 * signing in or signing up; its whole effect is to grant a `group_member` row
 * and a `campaign_member` row in the same transaction to the account that
 * accepts it. It is explicitly *not* a
 * bearer credential that reaches Shared World data on its own, not a guest account
 * with no identity, and not a second credential kind with an actor shape of
 * its own — that last one is "a second way to be reachable, which is exactly
 * where the next leak lives".
 *
 * So once accepted, the member is an ordinary account with ordinary membership
 * rows, indistinguishable from one admitted any other way. This needs **no new
 * predicate, no new base case and no change to `Authorization`**.
 *
 * **Campaign-first to the user, eligibility-first internally.** Campaign
 * participation cannot exist without its backing membership (`campaign_member`
 * carries a foreign key into `group_member`), so accepting a campaign link
 * quietly ensures that prerequisite before granting the seat. The hidden row
 * is persistence plumbing, not another decision the inviter or player makes.
 *
 * It is minted by the campaign's creator, including a creator who does not own
 * its underlying context.
 *
 * ### It is still a credential, so it has a lifetime
 *
 * Four rules, each the choice that fails safe:
 *
 * - **Single-use.** One invitation, one membership. `redeemedAt` is set in the
 *   same transaction that writes the membership.
 * - **Expiring, on a fixed server-set clock.** `expiresAt` is `createdAt` plus
 *   `INVITE_TTL_DAYS` and never client-supplied.
 * - **Revocable before acceptance — and after it.** Revocation removes only
 *   the campaign seat this invitation actually granted. Shared World
 *   eligibility and other campaign memberships remain.
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
 * One invitation, as the campaign creator sees it. **The token is not on this
 * shape and never will be** — the server stores only a digest.
 */
export class CampaignInvite extends Schema.Class<CampaignInvite>("CampaignInvite")({
  id: CampaignInviteId,
  /** The campaign this invitation admits to. */
  campaignId: CampaignId,
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
 * Nested rather than a `token` field on `CampaignInvite`, so the type itself says
 * which read carries the secret.
 */
export class IssuedInvite extends Schema.Class<IssuedInvite>("IssuedInvite")({
  invite: CampaignInvite,
  /** 32 random bytes, base64url. Shown once; the server keeps only its digest. */
  token: Schema.String,
}) {}

/** Minting a seat at one campaign. The campaign comes from the URL. */
export const CampaignInviteCreate = Schema.Struct({
  label: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 80))),
});
export type CampaignInviteCreate = typeof CampaignInviteCreate.Type;

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
export class CampaignInvitePreview extends Schema.Class<CampaignInvitePreview>(
  "CampaignInvitePreview",
)({
  kind: Schema.Literal("campaign"),
  campaignName: Schema.String,
  /** The campaign creator who minted the invitation. */
  creatorName: Schema.String,
  /** Null when the campaign has only its invisible standalone context. */
  sharedWorldName: Schema.NullOr(Schema.String),
  expiresAt: Schema.DateTimeUtcFromString,
}) {}

export const InvitePreview = CampaignInvitePreview;
export type InvitePreview = typeof InvitePreview.Type;

/**
 * What redeeming answers with.
 *
 * Campaign-first and deliberately narrow: enough to explain the new seat and
 * link onwards. The backing context is absent; an explicit Shared World is an
 * optional named destination instead.
 */
export class CampaignInviteRedeemed extends Schema.Class<CampaignInviteRedeemed>(
  "CampaignInviteRedeemed",
)({
  kind: Schema.Literal("campaign"),
  campaignId: CampaignId,
  campaignName: Schema.String,
  /** Null when the campaign has only its invisible standalone context. */
  sharedWorld: Schema.NullOr(CampaignSharedWorld),
  /**
   * Whether that campaign is shared with its participants yet. A campaign
   * starts `dm`, so the ordinary outcome of joining is a screen with nothing
   * on it; saying so at the moment of joining is the difference between "the
   * creator has not shared this table yet" and "this product is broken".
   */
  shared: Schema.Boolean,
}) {}

export const InviteRedeemed = CampaignInviteRedeemed;
export type InviteRedeemed = typeof InviteRedeemed.Type;
