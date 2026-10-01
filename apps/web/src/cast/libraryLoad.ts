import type { NpcId, NpcSheetSummary, NpcSource } from "@taverns/api";
import { Effect } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";
import { apiAtom, combine } from "../api/atoms";
import { reads } from "../api/keys";
import { linkedGear } from "../characters/load";
import type { NpcStats } from "./load";

/**
 * The Library NPC shelf's reads, as atoms, the way `cast/load.ts` holds the
 * Cast's: the owner's originals, the summaries of their sheets, and one
 * original with its whole sheet for its stats page. All of it is the owner's
 * alone; nothing here names a campaign.
 */

export const libraryNpcsAtom = Atom.family((archived: boolean) =>
  apiAtom(
    (client) => client.library.npcs({ query: archived ? { archived: true } : {} }),
    [reads.libraryNpcs],
  ),
);

/**
 * The summary of every live original's sheet, in the shelf's order, leaving
 * out an original with none — each card's one stats line. It answers
 * `libraryNpcs` as well as its own key, for `npcSheetsAtom`'s reason: which
 * originals it lists moves whenever one is written, archived or removed.
 */
export const libraryNpcSheetsAtom = apiAtom(
  (client) => client.library.npcSheets({ query: {} }),
  [reads.libraryNpcSheets, reads.libraryNpcs],
);

/** What the Library NPC shelf draws: the originals and their sheets' summaries. */
export interface LibraryNpcShelf {
  readonly sources: ReadonlyArray<NpcSource>;
  /** The live originals' sheets, without their documents; one with none is not in it. */
  readonly sheets: ReadonlyArray<NpcSheetSummary>;
}

/**
 * The shelf as one value with three states, so a sheet read that failed is
 * said rather than drawn as *No stats* on every card.
 */
export const libraryNpcShelfAtom = Atom.readable(
  (get): AsyncResult.AsyncResult<LibraryNpcShelf, unknown> =>
    combine(
      get,
      AsyncResult.all({
        sources: get(libraryNpcsAtom(false)),
        sheets: get(libraryNpcSheetsAtom),
      }),
    ),
  (refresh) => {
    refresh(libraryNpcsAtom(false));
    refresh(libraryNpcSheetsAtom);
  },
);

const librarySourceRowAtom = Atom.family((npcId: NpcId) =>
  apiAtom(
    (client) => client.library.findNpc({ params: { npcId } }),
    [reads.libraryNpc(npcId), reads.libraryNpcs],
  ),
);

/**
 * One original's sheet, or `null`, and the gear rows it names: the stats
 * page's read, as the Cast's `npcSheetAtom` is a campaign NPC's.
 */
const librarySheetAtom = Atom.family((npcId: NpcId) =>
  apiAtom(
    (client): Effect.Effect<NpcStats, unknown> =>
      Effect.flatMap(
        client.library.npcSheet({ params: { npcId } }),
        (sheet): Effect.Effect<NpcStats, unknown> =>
          sheet === null
            ? Effect.succeed({ sheet, gear: [] })
            : Effect.map(linkedGear(client, sheet.sheet), (gear) => ({ sheet, gear })),
      ),
    [reads.npcSheet(npcId), reads.libraryEquipment],
  ),
);

/**
 * The spell picker's rules for one original's sheet, against the core rules
 * (`npcSheetSpells`). It moves with the sheet, so it answers the sheet's key.
 */
export const librarySheetSpellsAtom = Atom.family((npcId: NpcId) =>
  apiAtom(
    (client) => client.library.npcSheetSpells({ params: { npcId } }),
    [reads.npcSheet(npcId)],
  ),
);

export interface LibraryNpcDetail {
  readonly source: NpcSource;
  /** The sheet (`null` when the owner has not written one) and the gear rows it names. */
  readonly stats: NpcStats;
}

/** One original and its sheet: the Library NPC page's read. */
export const libraryNpcAtom = Atom.family((npcId: NpcId) =>
  Atom.readable(
    (get): AsyncResult.AsyncResult<LibraryNpcDetail, unknown> =>
      combine(
        get,
        AsyncResult.all({
          source: get(librarySourceRowAtom(npcId)),
          stats: get(librarySheetAtom(npcId)),
        }),
      ),
    (refresh) => {
      refresh(librarySourceRowAtom(npcId));
      refresh(librarySheetAtom(npcId));
    },
  ),
);
