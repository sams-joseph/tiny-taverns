import type { ReactNode } from "react";
import { cn } from "@taverns/ui";

/**
 * The one shape a Library detail dialog has, written once.
 *
 * Every corpus has a reader — the stat block, a spell, a piece of equipment, a
 * magic item, a compendium article — and each used to lay its body out its own
 * way: some flush against the dialog's edge with the last line touching the
 * footer's hairline, some padded like the creature dialog. The standard is the
 * creature dialog's, because it was the one that read well:
 *
 * - `DialogHeader` carries the title, its badges and the one-line meta.
 * - **`DetailBody` is the scrolling middle**: the header's own gutter carried
 *   through, breathing room above the footer, `gap-4` between sections.
 * - **`DetailSection` separates two kinds of content** with the hairline the
 *   creature dialog uses — never two borders touching, never content against
 *   the footer.
 * - **`DetailFacts` is the label/value grid** — one spelling of the two-column
 *   `dl`, so "Cost 2 gp" and "Rarity Uncommon" line up the same way in every
 *   reader.
 * - The footer holds *Close* (and a form's verbs); a reader's actions — copy
 *   into a campaign — sit in a `DetailSection` at the end of the body, beside
 *   the row they act on, the decision `CreatureDialog` records.
 */
export function DetailBody({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={cn("flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-gutter py-3", className)}
    >
      {children}
    </div>
  );
}

/** A ruled-off run of the body — actions, provenance, an "at higher levels". */
export function DetailSection({
  title,
  className,
  children,
}: {
  readonly title?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-2 border-t border-hairline pt-4", className)}>
      {title !== undefined && (
        <h3 className="font-display text-body leading-title font-semibold text-heading">{title}</h3>
      )}
      {children}
    </section>
  );
}

export interface DetailFact {
  readonly label: string;
  readonly value: ReactNode;
}

/** The label/value grid every reader draws its numbers with. */
export function DetailFacts({ facts }: { readonly facts: ReadonlyArray<DetailFact> }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-label leading-label text-muted-foreground">
      {facts.map((fact) => (
        <div key={fact.label} className="col-span-2 grid grid-cols-subgrid">
          <dt>{fact.label}</dt>
          <dd className="text-heading">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
