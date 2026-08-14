import type { Creature } from "@taverns/api";

/**
 * Where a creature came from, and **whose it is** — said out loud.
 *
 * **Provenance is information the DM needs, not bookkeeping.** Three origins
 * share one list — `system`, `imported` and `authored` — and a list that drew
 * them all the same way would quietly imply ownership of rows nobody owns.
 *
 * ### Ownership is two columns, and it is not `origin`
 *
 * Since `0015_library_creatures.ts` a creature belongs to **a campaign**, to an
 * **account** (a Library entity, where monsters are authored), or to **nobody**
 * (the bundle). `campaignId` and `accountId` say which, exclusively, and they
 * are the only thing any write predicate looks at. So *may I edit this* is
 * `ownerOf`, never `origin`: an imported Library entity is `imported` and still
 * yours, and a bundled row is `system` and nobody's.
 *
 * That split is the whole of what changed here when the Library model landed.
 * Before it, `campaignId === null` was the same statement as `origin ===
 * "system"` and this file could read one and mean the other; there is a third
 * position now, and the sentence a DM reads has to be about the right one.
 */

/** Which of the three positions a row is in. Exclusive, by `creature_one_owner`. */
export type Owner = "bundle" | "library" | "campaign";

export const ownerOf = (creature: Creature): Owner =>
  creature.accountId !== null ? "library" : creature.campaignId !== null ? "campaign" : "bundle";

/**
 * Whether this row is the reader's to edit.
 *
 * True for a Library entity and nothing else, because `accountId` is only ever
 * non-null on rows the credential owns — `libraryRowReadable` compares it to the
 * actor's own account and to nothing a caller supplied, so a row carrying one
 * *is* yours. A campaign's creature is editable too, but through the campaign's
 * own path and by its DM, which is a different screen's question.
 */
export const isLibraryEntity = (creature: Creature): boolean => ownerOf(creature) === "library";

export interface Provenance {
  /**
   * The mark on the card, or `undefined` for the ordinary case.
   *
   * Absence is the signal, in both lists: in a campaign bestiary it says "this
   * campaign wrote it", and in the Library it says "you wrote it". A badge on
   * every row would say nothing.
   */
  readonly badge: string | undefined;
  /** Where it came from and what that means, for the stat-block panel. */
  readonly lines: ReadonlyArray<string>;
}

export const provenanceOf = (creature: Creature): Provenance => {
  const reskin =
    creature.derivedFrom === null
      ? []
      : ["It started as a copy of another creature, and the changes since are yours."];

  // The bundle first, and by owner rather than by origin — the two agree
  // (`creature_system_is_unowned` makes them the same statement), and reading
  // the owner is what keeps this file honest about the question it answers.
  if (ownerOf(creature) === "bundle") {
    return {
      badge: "Shared corpus",
      lines: [
        "Bundled with Tiny Taverns. It belongs to no campaign and to no account — the same creature is in every Library and reachable from every table — so it is not yours to edit. Changing it means keeping a copy of your own.",
        ...reskin,
      ],
    };
  }

  const library = ownerOf(creature) === "library";

  switch (creature.origin) {
    case "imported":
      return {
        badge: "Imported",
        lines: [
          library
            ? "Brought into your Library from somewhere else. It is yours to edit."
            : "Brought into this campaign from somewhere else. It is yours to edit.",
          ...reskin,
        ],
      };
    case "assistant":
      return {
        badge: "From Hob",
        lines: ["Hob wrote this one and you kept it. It is yours to edit.", ...reskin],
      };
    default:
      return {
        badge: undefined,
        lines: [
          library
            ? "Yours. It lives in your Library and in no campaign until you copy it into one."
            : "Yours, written for this campaign.",
          ...reskin,
        ],
      };
  }
};
