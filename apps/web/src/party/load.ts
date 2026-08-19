import type { CampaignId, CampaignInvite, CampaignMember } from "@taverns/api";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { invitesAtom, membersAtom } from "../campaign/load";

/**
 * What the party screen reads **beyond the campaign view**: two atoms, one round.
 *
 * These two reads only mean anything joined to the campaign view's characters: a
 * member with no `Character` whose `accountId` is theirs is the *"joined but has
 * no character"* state, and a member is distinguished from an invitation only by
 * which list they came out of. So they arrive as one `extra` — one value, three
 * states — rather than as two hooks giving the screen sixteen combinations of
 * loading and failed to say one sentence about a roster.
 *
 * **It used to read four things and now reads two**, because the screen sits on
 * `CampaignChrome` — which is what carries the session badge and the campaign
 * action this screen was missing. The frame already asks for the campaign and
 * for `characters.list` (as `CampaignView.party`), so asking again here would be
 * two answers to one question in one round.
 *
 * ### Two atoms rather than one Effect, and the sharing is the reason
 *
 * They were one composed `Effect` until writes learned what they invalidate.
 * Split, each names its own resource — so **withdrawing an invitation refreshes
 * the invitations and the members, and minting one refreshes only the
 * invitations**, which is the difference between two requests and one on a
 * screen where the invitation dialog is open over the roster it changes.
 *
 * The invitations are `campaign/load.ts`'s atom, the same one `InviteDialog`
 * reads. That is not tidiness: the dialog opens *over* this screen, so two atoms
 * for one list would be a mint that updated the dialog and left the roster
 * behind it stale.
 *
 * Combined with plain `AsyncResult.all` rather than `combine`, because both
 * parts are keyed on the campaign and this screen's campaign never changes under
 * it — there is no moment where one of them becomes an atom nobody has read.
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

export const rosterAtom = Atom.family((campaignId: CampaignId) =>
  Atom.readable(
    (get): AsyncResult.AsyncResult<PartyRoster, unknown> =>
      AsyncResult.all({
        members: get(membersAtom(campaignId)),
        invites: get(invitesAtom(campaignId)),
      }),
    // **A derived atom needs to be told how to refresh, and this is the second
    // argument `Atom.readable` takes for exactly that.** Re-running the read
    // above hands back the two cached parts, so without this the frame's *Try
    // again* would redraw the same failure it was pressed on. Naming them here
    // rather than by key is right because both are this screen's own and it
    // knows them by name; the campaign view cannot do the same, because three
    // of its eight are keyed on a session id it only has once the campaign has
    // loaded — see `campaignViewKeys`.
    (refresh) => {
      refresh(membersAtom(campaignId));
      refresh(invitesAtom(campaignId));
    },
  ),
);
