import type { Feat } from "@taverns/api";
import { Badge, Button } from "@taverns/ui";
import type { ReactNode } from "react";
import { EmptyState } from "../ui/states";
import { featPrerequisiteLine } from "./feat";

export function FeatSection({
  feats,
  emptyBody,
  onEdit,
}: {
  readonly feats: ReadonlyArray<Feat>;
  readonly emptyBody: ReactNode;
  readonly onEdit: (feat: Feat) => (() => void) | undefined;
}) {
  return (
    <section aria-label="Feats" className="flex flex-col gap-3">
      <h2 className="font-display text-subtitle leading-snug font-semibold text-heading">Feats</h2>
      {feats.length === 0 ? (
        <EmptyState icon="sparkles" title="No feats at all">
          {emptyBody}
        </EmptyState>
      ) : (
        <div className="@container">
          <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
            {feats.map((feat) => (
              <FeatCard key={feat.id} feat={feat} onEdit={onEdit(feat)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function FeatCard({
  feat,
  onEdit,
}: {
  readonly feat: Feat;
  readonly onEdit: (() => void) | undefined;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-card border border-subtle bg-surface-card p-4 shadow-1">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-title leading-snug font-semibold text-heading">
            {feat.name}
          </h3>
          <p className="text-caption leading-body text-muted-foreground">
            {featPrerequisiteLine(feat)}
          </p>
        </div>
        {feat.origin === "system" && <Badge variant="secondary">2014</Badge>}
      </div>

      <div className="flex flex-col gap-2 text-body-s leading-body text-foreground">
        {feat.description.slice(0, 3).map((line, index) => (
          <p key={`${feat.id}-desc-${String(index)}`}>{line}</p>
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {onEdit !== undefined && (
          <Button variant="secondary" size="sm" aria-label={`Edit ${feat.name}`} onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
    </article>
  );
}
