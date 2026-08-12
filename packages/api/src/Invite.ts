import { Schema } from "effect";
import { CampaignId, InviteId } from "./Ids.js";

/**
 * An invitation to join a campaign.
 *
 * **A link is an invitation to join, not a way in.** Following one requires
 * signing in or signing up; its whole effect is to grant a `campaign_member`
 * row to the account that accepts it. It is explicitly *not* a bearer
 * credential that reaches campaign data on its own, not a guest account with no
 * identity, and not a second credential kind with an actor shape of its own —
 * that last one is the thing the players plan exists to avoid, being "a second
 * way to be reachable, which is exactly where the next leak lives".
 *
 * So once accepted, the member is an ordinary account with an ordinary
 * membership row, indistinguishable from one invited any other way. This needs
 * **no new predicate, no new base case and no change to `Authorization`**.
 *
 * ### It is still a credential, so it has a lifetime
 *
 * An invitation that never expires and can be passed on is a way into a
 * campaign, just a slower one. Four rules, and each is the choice that fails
 * safe rather than the convenient one:
 *
 * - **Single-use.** One invitation, one membership. `redeemedAt` is set in the
 *   same transaction that writes the membership, and a spent invitation is
 *   thereafter indistinguishable from a nonexistent one to anybody but the DM.
 *   A DM with four players mints four invitations, which is also what makes the
 *   list legible: each line is a person.
 * - **Expiring, on a fixed server-set clock.** `expiresAt` is `createdAt` plus
 *   `INVITE_TTL_DAYS` and is never client-supplied, so an eternal invitation is
 *   not something a caller may ask for. A link found in an old group chat is
 *   dead rather than dormant.
 * - **Revocable before acceptance — and after it.** `DELETE …/invites/:id`
 *   withdraws the invitation, and if it has already been taken up it revokes
 *   the membership it granted in the same transaction. That is the honest
 *   meaning of the button: a revoke that left a spent invitation alone would do
 *   nothing at all, which is worse than no button. It can only ever revoke a
 *   `player` row — see `apps/server/src/repo/Memberships.ts`.
 * - **Forwarded is granted.** Whoever holds the token and signs in gets the
 *   membership; there is no second factor, and pretending otherwise would be
 *   the guess that makes a capability feel safer than it is. What contains it is
 *   the other three rules plus `redeemedByName`: the DM sees *who* took the
 *   invitation, and undoing it is one click. A wrong player who joined is
 *   visible and reversible, which is the property worth buying.
 *
 * Denial is uniform and quiet: an unknown, expired, withdrawn or already-spent
 * token is the same `NotFound` a hidden row gets, because distinguishing them
 * for the holder of a bad token discloses which kind of bad it is.
 */

/**
 * Where an invitation is in its life, decided by the server rather than by four
 * timestamps a client compares against its own clock.
 *
 * Precedence is `revoked` → `redeemed` → `expired` → `live`: a withdrawal is an
 * act somebody took and outranks the passage of time, and it is what the DM
 * needs to see on a line they revoked after it was used.
 */
export const InviteStatus = Schema.Literals(["live", "redeemed", "revoked", "expired"]);
export type InviteStatus = typeof InviteStatus.Type;

/**
 * One invitation, as its DM sees it. **The token is not on this shape and never
 * will be** — the server stores only a digest, so there is nothing to put here.
 */
export class CampaignInvite extends Schema.Class<CampaignInvite>("CampaignInvite")({
  id: InviteId,
  campaignId: CampaignId,
  /**
   * Who it is for, in the DM's words. Optional because requiring it to invite a
   * friend is friction on the one step between a person at the table and the
   * read-aloud text; the list stays legible without it because a spent
   * invitation names its redeemer.
   */
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
 * Nested rather than a `token` field on `CampaignInvite`, so the type itself
 * says which read carries the secret: everything that lists invitations returns
 * the bare row, and there is no shape in the contract that could accidentally
 * grow one.
 */
export class IssuedInvite extends Schema.Class<IssuedInvite>("IssuedInvite")({
  invite: CampaignInvite,
  /** 32 random bytes, base64url. Shown once; the server keeps only its digest. */
  token: Schema.String,
}) {}

/** Minting one. There is no role field, because an invitation is a player's. */
export const InviteCreate = Schema.Struct({
  label: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 80))),
});
export type InviteCreate = typeof InviteCreate.Type;

/**
 * The token, in a payload rather than a path.
 *
 * The link puts it in the hash fragment (`#/join/<token>`), which a browser
 * never sends to a server — so it stays out of access logs and out of the
 * `Referer` of anything the join page links to. Carrying it in a `POST` body
 * rather than in the request line is the same rule applied one step later:
 * a path lands in every log on the way.
 */
export const InviteToken = Schema.Struct({ token: Schema.NonEmptyString });
export type InviteToken = typeof InviteToken.Type;

/**
 * What the holder of a live invitation is told **before** signing in.
 *
 * A deliberate, minimal disclosure to whoever holds the capability — which is
 * the same trade the invitation itself is. It exists because the alternative is
 * a stranger's first screen of the product being a vendor's sign-in card with no
 * indication of what they are signing in *to*, at a table, on a phone.
 *
 * There is no role field: an invitation is an invitation to play, and there is
 * no other kind to distinguish it from.
 */
export class InvitePreview extends Schema.Class<InvitePreview>("InvitePreview")({
  campaignName: Schema.String,
  /** The DM's own name, so the page can say who is asking. */
  dmName: Schema.String,
  expiresAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * What redeeming answers with.
 *
 * Deliberately not the `Campaign`: a player who has just joined an unshared
 * campaign may not read it, and answering with a row the very next request
 * would refuse is a lie about what they now have. The id and the name are what
 * the join page needs to say "you are at The Salt Road" and to link onwards.
 */
export class InviteRedeemed extends Schema.Class<InviteRedeemed>("InviteRedeemed")({
  campaignId: CampaignId,
  campaignName: Schema.String,
  /**
   * Whether the campaign is shared with its players yet.
   *
   * The one field here that is not simply an echo, and it earns its place: a
   * campaign starts `dm`, so the ordinary outcome of joining is a screen with
   * nothing on it. Saying so at the moment of joining is the difference between
   * "the DM has not shared this table yet" and "this product is broken".
   */
  shared: Schema.Boolean,
}) {}
