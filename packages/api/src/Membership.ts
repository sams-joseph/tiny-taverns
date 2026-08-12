import { Schema } from "effect";
import { Campaign } from "./Campaign.js";

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
