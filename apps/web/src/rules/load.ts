import type { CampaignId, CharacterOption } from "@taverns/api";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import { apiAtom, combine } from "../api/atoms";
import { reads } from "../api/keys";

/**
 * The two option lists, and the one thing worth knowing before reading either:
 * **they can never contain the same row.**
 *
 * The Library is originals — in no campaign, and either the bundle or this
 * account's own. A campaign's vocabulary is what that campaign holds — the
 * bundle, plus the copies somebody has brought in. `derive` is the one seam
 * between them, and a copy is a separate row with its own id, its own
 * visibility and its own edits.
 *
 * That is the captain's Library model over a second table, and it needed no new
 * predicate: `libraryRowReadable` and `corpusRowReadable` have always taken a
 * table name.
 */

/**
 * What a campaign offers a character being made at it — **the read the create
 * form's pickers make**, and the one campaign-scoped list in the product a
 * *player* reads to fill in a control.
 *
 * Its own atom family rather than part of a screen's composed load, because two
 * screens want it and one of them is not the one that writes it: a DM sharing a
 * class on the Rules screen has to reach a player's create form, and naming a
 * resource is what does that.
 *
 * `corpusRowReadable`'s last clause — `isDm OR visibility = 'shared'` — is what
 * makes a DM's answer and a player's answer differ, so this is the same request
 * with two honest answers rather than a filter either screen applies.
 */
export const campaignOptionsAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.options.list({ params: { campaignId }, query: {} }),
    [reads.options(campaignId)],
  ),
);

/**
 * The classes and species this account has authored, plus the bundle.
 *
 * **No key on the campaign**, because the read names none: a Library original
 * is in no campaign, and `libraryRowReadable` compares its owner to the
 * credential's own account. So there is one of it, shared by whatever asks —
 * which today is the copy-in control on every campaign's Rules screen.
 */
export const libraryOptionsAtom = apiAtom(
  (client) => client.library.options({ query: {} }),
  [reads.libraryOptions],
);

/** What the Rules screen reads beyond the campaign view. */
export interface RulesView {
  /** What this table offers: the bundle, plus what has been copied in. */
  readonly offered: ReadonlyArray<CharacterOption>;
  /** What this account has written, in no campaign — the copy control's source. */
  readonly originals: ReadonlyArray<CharacterOption>;
}

/**
 * The two lists as one value, for `CampaignChrome`'s `extra`.
 *
 * `combine` rather than a bare `AsyncResult.all` for the reason `api/atoms.ts`
 * states: `all` propagates the first non-success verbatim, so a part that has
 * never been read makes the whole `Initial` and blanks a screen that already
 * has rows on it. Here that happens the first time the copy dialog is opened on
 * a fresh session, which is exactly when the list underneath it should stay put.
 *
 * The refresh callback is the second argument `Atom.readable` takes, and it is
 * required rather than optional here: re-running the read above hands back the
 * two cached parts, so without it the frame's *Try again* would redraw the
 * failure it was pressed on. Named by atom rather than by key because both are
 * this screen's own and it knows them by name — `party/load.ts` makes the same
 * call for the same reason.
 */
export const rulesAtom = Atom.family((campaignId: CampaignId) =>
  Atom.readable(
    (get): AsyncResult.AsyncResult<RulesView, unknown> =>
      combine(
        get,
        AsyncResult.all({
          offered: get(campaignOptionsAtom(campaignId)),
          originals: get(libraryOptionsAtom),
        }),
      ),
    (refresh) => {
      refresh(campaignOptionsAtom(campaignId));
      refresh(libraryOptionsAtom);
    },
  ),
);

/**
 * The reads a write to a campaign's vocabulary changes.
 *
 * Both, always, and the second one is the one that is easy to forget: authoring
 * goes into the Library *and* copies into the campaign in one `submit`, so a
 * write that named only the campaign would leave the copy control's own list
 * one row short until something else refreshed it.
 */
export const optionWritesAt = (campaignId: CampaignId) => [
  reads.options(campaignId),
  reads.libraryOptions,
];
