import type { Campaign, CampaignId, CampaignInvite, CampaignMember, Character } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * What the party screen reads: four calls, one round, one value.
 *
 * The rule every screen here follows — one `Effect`, not one hook per endpoint —
 * and this is the case it was written for. Three of these four reads only mean
 * anything joined to the others: a member with no `Character` whose `accountId`
 * is theirs is the *"joined but has no character"* state, and a member is
 * distinguished from an invitation only by which list they came out of. Four
 * independent hooks would give this screen sixteen combinations of loading and
 * failed to render, to say one sentence about a roster.
 *
 * **One round, unbounded concurrency**: nothing here depends on anything else's
 * answer. `campaign/load.ts` needs two rounds because the prep checklist hangs
 * off `campaign.currentSessionId`; nothing on this screen hangs off a value in
 * another response.
 *
 * `members.list` and `invites.list` are both behind the `DmActor` gate and the
 * ordinary `campaignWritable` predicate respectively, so a player who reaches
 * this URL gets the ordinary `NotFound` and the screen says *"Not here"* — which
 * is the correct answer and not a case to special-case.
 */

export interface PartyView {
  readonly campaign: Campaign;
  /**
   * Who is at the table, live memberships only — the server drops a revoked one
   * rather than flagging it, because somebody who has left the table is not at
   * it. What a DM needs to know about a withdrawal is on the invitation that
   * granted it, which is why the two lists are read together.
   */
  readonly members: ReadonlyArray<CampaignMember>;
  /**
   * Every invitation, in every state. The roster draws only the live ones as
   * people; the rest are the lifecycle, and `InviteDialog` is where that is
   * already rendered — including the withdrawn-before-taken precedence, which
   * this screen must not restate.
   */
  readonly invites: ReadonlyArray<CampaignInvite>;
  /**
   * Every character in the campaign, not only the assigned ones.
   *
   * The unassigned half is what `AssignDialog` offers, so filtering here would
   * cost a second read to get them back.
   */
  readonly characters: ReadonlyArray<Character>;
}

export const loadParty = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [campaign, members, invites, characters] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.members.list({ params: { campaignId } }),
        client.invites.list({ params: { campaignId } }),
        client.characters.list({ params: { campaignId } }),
      ],
      { concurrency: "unbounded" },
    );

    return { campaign, members, invites, characters } satisfies PartyView;
  });
