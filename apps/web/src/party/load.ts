import type { CampaignId, CampaignInvite, CampaignMember } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * What the party screen reads **beyond the campaign view**: two calls, one round.
 *
 * The rule every screen here follows — one `Effect`, not one hook per endpoint —
 * and this is the case it was written for. These two reads only mean anything
 * joined to the campaign view's characters: a member with no `Character` whose
 * `accountId` is theirs is the *"joined but has no character"* state, and a
 * member is distinguished from an invitation only by which list they came out
 * of. Independent hooks would give this screen sixteen combinations of loading
 * and failed to render, to say one sentence about a roster.
 *
 * **It used to read four things and now reads two**, because the screen sits on
 * `CampaignChrome` — which is what carries the session badge and the campaign
 * action this screen was missing. The frame already asks for the campaign and
 * for `characters.list` (as `CampaignView.party`), so asking again here would be
 * two answers to one question in one round; `CampaignChrome` composes this into
 * the same Effect and hands it back as `slots.extra`.
 *
 * **One round, unbounded concurrency**: nothing here depends on anything else's
 * answer. `campaign/load.ts` needs two rounds because the prep checklist hangs
 * off `campaign.currentSessionId`; nothing on this screen hangs off a value in
 * another response.
 *
 * `members.list` and `invites.list` are behind the `DmActor` gate and the
 * ordinary `campaignWritable` predicate respectively, so a player who reaches
 * this URL gets the ordinary `NotFound` and the screen says *"Not here"* — which
 * is the correct answer and not a case to special-case.
 */

export interface PartyRoster {
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
}

export const loadPartyRoster = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [members, invites] = yield* Effect.all(
      [
        client.members.list({ params: { campaignId } }),
        client.invites.list({ params: { campaignId } }),
      ],
      { concurrency: "unbounded" },
    );

    return { members, invites } satisfies PartyRoster;
  });
