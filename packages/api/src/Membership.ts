import { Schema } from "effect";
import { Campaign } from "./Campaign.js";
import { AccountId } from "./Ids.js";

/**
 * What somebody is at a table.
 *
 * **The column carries both values from the first migration and the product
 * mints exactly one of them.** `Campaigns.create` writes the owner's `dm` row
 * and the invite writes a `player` row; there is no third writer and no way to
 * ask for a role. A co-DM is a settled *no* for the first iteration, and when it
 * arrives it must be its own deliberate act rather than this same path with a
 * role argument — that would put the most destructive grant in the product one
 * selection away from the least. Naming both here is what keeps the eventual
 * addition additive rather than a migration.
 *
 * It is deliberately *not* on `Actor`: a person is the DM of one table and a
 * player at another on the same credential, so a role is a fact about a pair.
 * See `Actor` and `apps/server/src/repo/visibility.ts`.
 */
export const MemberRole = Schema.Literals(["dm", "player"]);
export type MemberRole = typeof MemberRole.Type;

/**
 * A table you are at, and what you are at it — the answer `GET /me/campaigns`
 * gives.
 *
 * **It composes exactly the predicate `campaigns.list` composes**, so the two
 * reads cannot disagree about reach: a campaign is here when this credential
 * reaches it and this account may read it, which for a player member means the
 * DM has shared the campaign. What this adds is the one thing the campaign row
 * cannot carry — the role — because the role belongs to the pair rather than to
 * either half of it.
 *
 * That matters the day a player screen exists: "am I running this or sitting at
 * it" is the question that decides which screen to draw, and reading it off the
 * campaign would mean guessing.
 */
export class CampaignMembership extends Schema.Class<CampaignMembership>("CampaignMembership")({
  campaign: Campaign,
  role: MemberRole,
  /** When this account joined — for the DM, when they created the campaign. */
  joinedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * Somebody else at the table — the answer `GET /campaigns/:c/members` gives, and
 * the mirror image of `CampaignMembership`.
 *
 * The pair is the same row read from either end: `mine` asks *which tables am I
 * at*, this asks *who is at this table*. So it carries the campaign in the path
 * rather than in the payload, and what it adds is the one thing the other cannot
 * have — a name that is not the reader's.
 *
 * **That is why it is behind the `DmActor` gate.** A member list is other
 * people's account names and the shape of the table; a player does not enumerate
 * who else is sitting at it, and the day a player screen wants to it will be a
 * decision with a narrower schema, not this one with a flag. See
 * `apps/server/src/repo/DmActor.ts`.
 *
 * ### Live members only, and no seat
 *
 * A revoked membership is absent rather than listed with a flag: every predicate
 * in the product tests `revoked_at is null`, and somebody who has left the table
 * is not at it. What a DM needs to see about a withdrawal is on the invitation
 * that granted it — `CampaignInvite.status` says `revoked` and names who took it
 * — so listing the dead row here would be a second answer to a question
 * `invites.list` already answers better.
 *
 * **There is no seat, and this schema is where that decision is visible.** The
 * fourth delivery draws an *open* seat with nobody in it and an *"Add seat"*
 * button; a membership cannot exist before an account, so an empty seat is not
 * representable and inventing a row to hold one would create a thing that can
 * disagree with membership, invitations and characters at once. What the drawn
 * statuses become instead:
 *
 * - **invited** — a `CampaignInvite` whose `status` is `live`, from
 *   `invites.list`. It is not a member yet, and this list does not pretend it is.
 * - **no-character** — a member here with no `Character` in `characters.list`
 *   whose `accountId` is this `accountId`.
 * - **playing** — a member here with one.
 * - **open** — nothing. It comes out of the drawing.
 *
 * So the join key is the whole reason `accountId` is on the wire, and the count
 * of characters is deliberately *not*: `Character.accountId` already answers it
 * from a list the party screen reads anyway, and a field here would be a second
 * answer that is structurally `0` for every row until something populates that
 * column. Absent beats stubbed — the rule the encounter card's `count` follows.
 */
export class CampaignMember extends Schema.Class<CampaignMember>("CampaignMember")({
  /**
   * Who they are, and the key everything about them is joined on —
   * `Character.accountId` today, and whatever assigns one tomorrow.
   */
  accountId: AccountId,
  /**
   * Their account name.
   *
   * `DEFAULT_ACCOUNT_NAME` for somebody provisioned just-in-time who has not
   * been given one, which is *"Someone"* rather than *"DM"* precisely because
   * this is the list it would be wrong on.
   */
  name: Schema.String,
  role: MemberRole,
  /** When they joined — for the DM, when they created the campaign. */
  joinedAt: Schema.DateTimeUtcFromString,
}) {}
