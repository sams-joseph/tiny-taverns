import { Schema } from "effect";
import { Campaign } from "./Campaign.js";
import { AccountId } from "./Ids.js";

/**
 * What somebody is at a table — **derived, never stored**.
 *
 * There is no `campaign_member.role` column any more, by the captain's
 * decision of 2026-09-01: the campaign creator is its sole DM, and every other
 * live participant is a player. So the relation is computed from
 * `campaign.creator_account_id` at read time, and a mutable role — the thing
 * that made co-DM semantics one UPDATE away — is not representable.
 * `apps/server/test/schema.test.ts` fails if the column reappears.
 *
 * It is deliberately *not* on `Actor`: a person is the creator of one campaign
 * and a player at another on the same credential, so the relation is a fact
 * about a pair. See `Actor` and `apps/server/src/repo/visibility.ts`.
 */
export const CampaignRelation = Schema.Literals(["creator", "player"]);
export type CampaignRelation = typeof CampaignRelation.Type;

/**
 * A table you are at, and what you are at it — the answer `GET /me/campaigns`
 * gives.
 *
 * **It composes exactly the predicate `campaigns.list` composes**, so the two
 * reads cannot disagree about reach: a campaign is here when this credential
 * reaches it and this account may read it, which for a player participant
 * means the creator has shared the campaign. What this adds is the one thing
 * the campaign row cannot carry — this reader's own relation to it — because
 * the relation belongs to the pair rather than to either half of it.
 *
 * That matters on every campaign screen: "am I running this or sitting at it"
 * is the question that decides which chrome to draw, and it is answered here
 * per campaign rather than by a global mode.
 */
export class CampaignMembership extends Schema.Class<CampaignMembership>("CampaignMembership")({
  campaign: Campaign,
  relation: CampaignRelation,
  /** When this account joined — for the creator, when they created the campaign. */
  joinedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * Somebody else at the table — the answer `GET /campaigns/:c/members` gives,
 * and the mirror image of `CampaignMembership`.
 *
 * The pair is the same row read from either end: `mine` asks *which tables am
 * I at*, this asks *who is at this table*. So it carries the campaign in the
 * path rather than in the payload, and what it adds is the one thing the other
 * cannot have — a name that is not the reader's.
 *
 * **That is why it is behind the `CampaignCreatorActor` gate.** A participant
 * list is other people's account names and the shape of the table; a player
 * does not enumerate who else is sitting at it. (The *group's* member list is
 * different — a group is the social container, and its roster is every live
 * member's to read. See `GroupMember`.)
 *
 * Live participants only; a revoked participation is absent rather than
 * flagged, exactly as before the group model.
 */
export class CampaignMember extends Schema.Class<CampaignMember>("CampaignMember")({
  /** Who they are, and the key everything about them is joined on. */
  accountId: AccountId,
  /** Their account name. */
  name: Schema.String,
  /** Derived from `campaign.creator_account_id`, never stored. */
  relation: CampaignRelation,
  /** When they joined — for the creator, when they created the campaign. */
  joinedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * The campaign creator naming an existing live group member as a participant —
 * `POST /campaigns/:c/members`.
 *
 * The one place an account id travels in a participation payload, and it is
 * bounded twice: the caller must be the campaign's creator, and the named
 * account must hold a live membership of the campaign's group — participation
 * cannot exist for a non-group member, structurally.
 */
export const CampaignMemberAdd = Schema.Struct({
  accountId: AccountId,
});
export type CampaignMemberAdd = typeof CampaignMemberAdd.Type;
