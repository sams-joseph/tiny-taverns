import type { RuleBlock } from "@taverns/api";

/**
 * A run of blocks whose first heading repeats a title already on screen —
 * the dialog's own, or the section heading above it — reads as a stutter, so
 * the caller passes what the reader has already said.
 */
export const withoutLeadingHeading = (
  blocks: ReadonlyArray<RuleBlock>,
  said: string,
): ReadonlyArray<RuleBlock> => {
  const first = blocks[0];
  return first !== undefined &&
    first.kind === "heading" &&
    first.text.trim().toLowerCase() === said.trim().toLowerCase()
    ? blocks.slice(1)
    : blocks;
};
