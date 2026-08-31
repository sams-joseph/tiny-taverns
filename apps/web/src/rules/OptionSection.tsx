import type { CharacterOption } from "@taverns/api";
import type { ReactNode } from "react";
import { EmptyState } from "../ui/states";
import { OptionCard } from "./OptionCard";

/**
 * One of the labelled lists a vocabulary is drawn as — classes, then races,
 * then backgrounds.
 *
 * **Labelled regions rather than tabs**, the call `PartyScreen` makes about its
 * two: they are different questions about one vocabulary and each is short, so
 * a tab would hide two thirds of the answer behind a press. Both screens over
 * `character_option` draw exactly this set, so the recipe is one file — the
 * same reason `CorpusParts.tsx` holds the bestiary's grid for its two, and what
 * made the background's arrival one call site each rather than two components.
 *
 * **The verbs come in as functions over a row**, the shape `CreatureGrid` uses:
 * a caller answers *may this reader act on this row* per row rather than the
 * card asking, so the shipped write predicate is rendered at the one place that
 * knows which list this is — `isCampaignCopy` on a campaign's, and
 * `isLibraryOriginal` on the Library's.
 */
export function OptionSection({
  title,
  options,
  empty,
  emptyBody,
  onEdit,
  onRemove,
}: {
  readonly title: string;
  readonly options: ReadonlyArray<CharacterOption>;
  readonly empty: string;
  readonly emptyBody: ReactNode;
  /** `undefined` for a row this reader may not write. */
  readonly onEdit: (option: CharacterOption) => (() => void) | undefined;
  /** Absent entirely where the list has no remove at all. */
  readonly onRemove?: (option: CharacterOption) => (() => void) | undefined;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="font-display text-subtitle leading-snug font-semibold text-heading">
        {title}
      </h2>
      {options.length === 0 ? (
        <EmptyState icon="book-open" title={empty}>
          {emptyBody}
        </EmptyState>
      ) : (
        /* Two columns where the column is wide enough, because a bundled
           vocabulary is thirty-eight rows before a table copies anything in,
           and a single file of them is a page nobody reads to the end of. `@container` on the section and `@3xl`
           on the grid, never a viewport breakpoint: the question is how wide
           *this column* is, and the campaign frame's aside is not something a
           window width can see. */
        <div className="@container">
          <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
            {options.map((option) => (
              <OptionCard
                key={option.id}
                option={option}
                onEdit={onEdit(option)}
                onRemove={onRemove?.(option)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
