import type { LevelId } from "@taverns/api";
import { Atom } from "effect/reactivity";
import { apiAtom } from "../api/atoms";
import { reads } from "../api/keys";

/**
 * The Levels shelf's reads, as atoms: the owner's levels, and one level whole.
 * Both are the owner's alone; nothing here names a campaign. The one level
 * answers the shelf's key too, since a delete from the shelf names only it.
 */

/** The owner's own levels, on the Library's Levels shelf. */
export const libraryLevelsAtom = apiAtom(
  (client) => client.libraryLevels.list(),
  [reads.libraryLevels],
);

/**
 * The encounters naming one of the owner's levels, for the delete
 * confirmation. An encounter's save that picks or drops a level names the
 * shelf's key, so this answers it.
 */
export const levelUsesAtom = Atom.family((levelId: LevelId) =>
  apiAtom(
    (client) => client.libraryLevels.uses({ params: { levelId } }),
    [reads.libraryLevel(levelId), reads.libraryLevels],
  ),
);

/** One of the owner's levels, the whole document. */
export const libraryLevelAtom = Atom.family((levelId: LevelId) =>
  apiAtom(
    (client) => client.libraryLevels.findById({ params: { levelId } }),
    [reads.libraryLevel(levelId), reads.libraryLevels],
  ),
);
