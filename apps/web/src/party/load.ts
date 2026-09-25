import type { CampaignId, CampaignInvite, CampaignMember, SeatPrep } from "@taverns/api";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { apiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { campaignInvitesAtom, membersAtom } from "../campaign/load";
import { libraryOptionVocabularyAtom } from "../rules/load";

/**
/**
 * The creator's hook and secret for every live seat — `seatPrep.list`, the
 * creator's alone. Both the Party tab and a seat's page read it, the one list
 * for both, so a note written on the page is on its card when the DM goes back.
 */
export const seatPrepAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.seatPrep.list({ params: { campaignId } }),
    [reads.partyPrep(campaignId)],
  ),
);

/**
 * What the party screen reads **beyond the campaign view**: four atoms, one round.
 *
 * The members and invitations only mean anything joined to the campaign view's characters: a
 * member with no `Character` whose `accountId` is theirs is the *"joined but has
 * no character"* state, and a member is distinguished from an invitation only by
 * which list they came out of. So they arrive as one `extra` — one value, three
 * states — rather than as two hooks giving the screen sixteen combinations of
 * loading and failed to say one sentence about a roster.
 *
 * **It no longer reads the campaign or its characters**, because the screen sits on
 * `CampaignChrome` — which is what carries the session badge and the campaign
 * action this screen was missing. The frame already asks for the campaign and
 * for `characters.list` (as `CampaignView.party`), so asking again here would be
 * two answers to one question in one round.
 *
 * ### Atoms rather than one Effect, and the sharing is the reason
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
 * Combined with plain `AsyncResult.all` rather than `combine`, because every
 * part is keyed on the campaign or on nothing, and this screen's campaign never
 * changes under it — there is no moment where one of them becomes an atom nobody has read.
 *
 * The seats' prep rides along because the cards draw each seat's hook and
 * secret; it is in no way part of the roster's derivation.
 *
 * The roster's two reads and the prep are campaign-creator surfaces, so a
 * player who reaches this URL gets the ordinary `NotFound` and the screen says
 * *"Not here"* — the correct answer rather than a case to special-case.
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
  /**
   * The rules' language names, which *Between them* picks out of each sheet's
   * proficiencies. The Library vocabulary rather than a campaign's because
   * languages are one bundled table every vocabulary answers alike
   * (`languageRows`, `apps/server/src/ruleset/vocabularies.ts`), and this read
   * is keyed on nothing, so any screen that already asked has it cached.
   */
  readonly languages: ReadonlyArray<string>;
  /** Every live seat's hook and secret, the creator's own notes. */
  readonly prep: ReadonlyArray<SeatPrep>;
}

export const rosterAtom = Atom.family((campaignId: CampaignId) =>
  Atom.readable(
    (get): AsyncResult.AsyncResult<PartyRoster, unknown> =>
      // The roster's resources are owned directly by the campaign, so no world read or
      // client-side filtering stands between the roster and its invitations.
      AsyncResult.all({
        members: get(membersAtom(campaignId)),
        invites: get(campaignInvitesAtom(campaignId)),
        languages: AsyncResult.map(get(libraryOptionVocabularyAtom), (vocabulary) =>
          vocabulary.languages.map((language) => language.name),
        ),
        prep: get(seatPrepAtom(campaignId)),
      }),
    // **A derived atom needs to be told how to refresh, and this is the second
    // argument `Atom.readable` takes for exactly that.** Re-running the read
    // above hands back the cached parts, so without this the frame's *Try
    // again* would redraw the same failure it was pressed on. Naming them here
    // rather than by key is right because each is this screen's own read and it
    // knows them by name; the campaign view cannot do the same, because three
    // of its eight are keyed on a session id it only has once the campaign has
    // loaded — see `campaignViewKeys`.
    (refresh) => {
      refresh(membersAtom(campaignId));
      refresh(campaignInvitesAtom(campaignId));
      refresh(libraryOptionVocabularyAtom);
      refresh(seatPrepAtom(campaignId));
    },
  ),
);

/**
 * What a seat's page reads beyond the campaign view: the members, for the
 * player's name and as the page's creator-only gate, and the seats' prep, for
 * the hook and secret the page edits.
 */
export interface SeatExtra {
  readonly members: ReadonlyArray<CampaignMember>;
  readonly prep: ReadonlyArray<SeatPrep>;
}

export const seatExtraAtom = Atom.family((campaignId: CampaignId) =>
  Atom.readable(
    (get): AsyncResult.AsyncResult<SeatExtra, unknown> =>
      AsyncResult.all({
        members: get(membersAtom(campaignId)),
        prep: get(seatPrepAtom(campaignId)),
      }),
    // Told how to refresh, for the reason `rosterAtom` gives.
    (refresh) => {
      refresh(membersAtom(campaignId));
      refresh(seatPrepAtom(campaignId));
    },
  ),
);
