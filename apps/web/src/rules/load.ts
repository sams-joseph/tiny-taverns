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
 * The option reads: the Library shelf, and the one campaign-scoped vocabulary.
 *
 * The Library is originals — in no campaign, and either the bundle or this
 * account's own. A campaign's vocabulary is what a character at that table can
 * be built from: the shared bundle, the reader's own Library, and originals
 * shared to the campaign's group. Since the instancing decision of 2026-09-02
 * there is no campaign-copy list, no copy-in control and no campaign Rules
 * screen — authoring and sharing are Library and group acts, and the campaign
 * read below is a picker's vocabulary rather than a managed collection.
 */

/**
 * What a campaign offers a character being made at it — **the read the create
 * form's pickers make**, and the one campaign-scoped list in the product a
 * *player* reads to fill in a control. `usableInCampaign` is what makes a
 * creator's answer and a player's answer differ (the bundle's row-visibility
 * rule, and each reader's own Library), so this is the same request with two
 * honest answers rather than a filter either screen applies.
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
 * credential's own account. So there is one of it, shared by whatever asks.
 */
export const libraryOptionsAtom = apiAtom(
  (client) => client.library.options({ query: {} }),
  [reads.libraryOptions],
);

export const libraryFeatsAtom = apiAtom(
  (client) =>
    collectPages<Feat, FeatSort, unknown, never>((cursor) =>
      client.library.feats({ query: { limit: WHOLE_LIST, cursor } }),
    ),
  [reads.libraryFeats],
);

export const libraryFeatAtom = Atom.family((featId: FeatId) =>
  apiAtom((client) => client.library.findFeat({ params: { featId } }), [reads.libraryFeat(featId)]),
);

export const libraryOptionVocabularyAtom = apiAtom(
  (client) => client.library.optionVocabulary(),
  [reads.libraryOptionVocabulary],
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
