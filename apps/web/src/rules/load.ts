import type {
  CampaignId,
  CharacterOption,
  CharacterOptionId,
  Feat,
  FeatId,
  FeatSort,
  OptionVocabulary,
} from "@taverns/api";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import { apiAtom, combine } from "../api/atoms";
import { reads } from "../api/keys";
import { collectPages, WHOLE_LIST } from "../api/page";

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
 * The classes, races and backgrounds this account has authored, plus the bundle.
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

export const campaignFeatsAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) =>
      collectPages<Feat, FeatSort, unknown, never>((cursor) =>
        client.feats.list({ params: { campaignId }, query: { limit: WHOLE_LIST, cursor } }),
      ),
    [reads.feats(campaignId)],
  ),
);

export const libraryFeatsAtom = apiAtom(
  (client) =>
    collectPages<Feat, FeatSort, unknown, never>((cursor) =>
      client.library.feats({ query: { limit: WHOLE_LIST, cursor } }),
    ),
  [reads.libraryFeats],
);

export const campaignFeatAtom = Atom.family(
  ({ campaignId, featId }: { readonly campaignId: CampaignId; readonly featId: FeatId }) =>
    apiAtom(
      (client) => client.feats.findById({ params: { campaignId, featId } }),
      [reads.feat(campaignId, featId)],
    ),
);

export const libraryFeatAtom = Atom.family((featId: FeatId) =>
  apiAtom((client) => client.library.findFeat({ params: { featId } }), [reads.libraryFeat(featId)]),
);

export const campaignOptionVocabularyAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.options.vocabulary({ params: { campaignId } }),
    [reads.optionVocabulary(campaignId)],
  ),
);

export const libraryOptionVocabularyAtom = apiAtom(
  (client) => client.library.optionVocabulary(),
  [reads.libraryOptionVocabulary],
);

export const campaignOptionProgressionAtom = Atom.family(
  ({
    campaignId,
    optionId,
  }: {
    readonly campaignId: CampaignId;
    readonly optionId: CharacterOptionId;
  }) =>
    apiAtom(
      (client) => client.options.progression({ params: { campaignId, optionId } }),
      [reads.optionProgression(campaignId, optionId)],
    ),
);

export const libraryOptionProgressionAtom = Atom.family((optionId: CharacterOptionId) =>
  apiAtom(
    (client) => client.library.optionProgression({ params: { optionId } }),
    [reads.libraryOptionProgression(optionId)],
  ),
);

export interface LibraryRulesView {
  readonly options: ReadonlyArray<CharacterOption>;
  readonly feats: ReadonlyArray<Feat>;
  readonly vocabulary: OptionVocabulary;
}

export const libraryRulesAtom = Atom.readable(
  (get): AsyncResult.AsyncResult<LibraryRulesView, unknown> =>
    combine(
      get,
      AsyncResult.all({
        options: get(libraryOptionsAtom),
        feats: get(libraryFeatsAtom),
        vocabulary: get(libraryOptionVocabularyAtom),
      }),
    ),
  (refresh) => {
    refresh(libraryOptionsAtom);
    refresh(libraryFeatsAtom);
    refresh(libraryOptionVocabularyAtom);
  },
);

/** What the Rules screen reads beyond the campaign view. */
export interface RulesView {
  /** What this table offers: the bundle, plus what has been copied in. */
  readonly offered: ReadonlyArray<CharacterOption>;
  /** What this account has written, in no campaign — the copy control's source. */
  readonly originals: ReadonlyArray<CharacterOption>;
  /** Concrete ids a campaign copy may attach to its rows. */
  readonly vocabulary: OptionVocabulary;
  /** Concrete ids a Library original may attach before it is copied. */
  readonly libraryVocabulary: OptionVocabulary;
  /** Feats this table offers: its copies, plus the bundle. */
  readonly feats: ReadonlyArray<Feat>;
  /** Feats this account has written, in no campaign — the copy control's source. */
  readonly featOriginals: ReadonlyArray<Feat>;
}

/**
 * The two lists as one value, for `CampaignChrome`'s `extra`.
 *
 * `combine` rather than a bare `AsyncResult.all` for the reason `api/atoms.ts`
 * states: `all` propagates the first non-success verbatim, so a part that is
 * `Initial` makes the whole `Initial` and blanks a screen that already has rows
 * on it. `party/load.ts` takes `all` because both its parts are keyed on the
 * campaign and its campaign never changes under it; here one part is keyed on
 * nothing at all and is shared with every other campaign's Rules screen, so
 * whether it is warm on arrival is not this screen's to know.
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
          vocabulary: get(campaignOptionVocabularyAtom(campaignId)),
          libraryVocabulary: get(libraryOptionVocabularyAtom),
          feats: get(campaignFeatsAtom(campaignId)),
          featOriginals: get(libraryFeatsAtom),
        }),
      ),
    (refresh) => {
      refresh(campaignOptionsAtom(campaignId));
      refresh(libraryOptionsAtom);
      refresh(campaignOptionVocabularyAtom(campaignId));
      refresh(libraryOptionVocabularyAtom);
      refresh(campaignFeatsAtom(campaignId));
      refresh(libraryFeatsAtom);
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
  reads.optionVocabulary(campaignId),
  reads.libraryOptions,
  reads.libraryOptionVocabulary,
];

export const featWritesAt = (campaignId: CampaignId) => [
  reads.feats(campaignId),
  reads.libraryFeats,
];
