import type { Creature } from "@taverns/api";

/**
 * Where a creature came from, said out loud.
 *
 * **Provenance is information the DM needs, not bookkeeping.** Three origins
 * share one list — `system`, `imported` and `authored` — and which one a row is
 * changes what the DM may do with it: a `system` creature is global and
 * immutable, so editing it means keeping a copy of their own. A list that drew
 * them all the same way would be a list that quietly implies ownership of rows
 * nobody owns.
 *
 * `campaignId === null` is the same statement as `origin === "system"` — the
 * database enforces the pair — so this reads the origin and says what the null
 * means rather than testing both.
 */

export interface Provenance {
  /**
   * The mark on the card, or `undefined` for the ordinary case.
   *
   * `authored` gets none: it is what a DM's own bestiary is made of, and a badge
   * on every row would say nothing. Absence is the signal, and the panel spells
   * it out in words for whoever wants it.
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

  switch (creature.origin) {
    case "system":
      return {
        badge: "Shared corpus",
        lines: [
          "Bundled with Tiny Taverns. It belongs to no campaign — the same creature is here in every one you run — so it is not yours to edit. Changing it means keeping a copy of your own.",
          ...reskin,
        ],
      };
    case "imported":
      return {
        badge: "Imported",
        lines: ["Brought into this campaign from somewhere else. It is yours to edit.", ...reskin],
      };
    case "assistant":
      return {
        badge: "From Hob",
        lines: ["Hob wrote this one and you kept it. It is yours to edit.", ...reskin],
      };
    default:
      return {
        badge: undefined,
        lines: ["Yours, written for this campaign.", ...reskin],
      };
  }
};
