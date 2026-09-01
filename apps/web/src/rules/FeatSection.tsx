import type { Feat } from "@taverns/api";
import { Badge, Button, Icon } from "@taverns/ui";
import type { ReactNode } from "react";
import { EmptyState } from "../ui/states";
import { featPrerequisiteLine } from "./feat";

export function FeatSection({
  feats,
  emptyBody,
  onEdit,
  onRemove,
  onCopy,
}: {
  readonly feats: ReadonlyArray<Feat>;
  readonly emptyBody: ReactNode;
  readonly onEdit: (feat: Feat) => (() => void) | undefined;
  readonly onRemove?: (feat: Feat) => (() => void) | undefined;
  readonly onCopy?: (feat: Feat) => (() => void) | undefined;
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
              <FeatCard
                key={feat.id}
                feat={feat}
                onEdit={onEdit(feat)}
                onRemove={onRemove?.(feat)}
                onCopy={onCopy?.(feat)}
              />
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
  onRemove,
  onCopy,
}: {
  readonly feat: Feat;
  readonly onEdit: (() => void) | undefined;
  readonly onRemove: (() => void) | undefined;
  readonly onCopy: (() => void) | undefined;
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
        {onCopy !== undefined && (
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Copy ${feat.name} into this campaign`}
            onClick={onCopy}
          >
            <Icon name="copy" size={14} />
            Copy in
          </Button>
        )}
        {onEdit !== undefined && (
          <Button variant="secondary" size="sm" aria-label={`Edit ${feat.name}`} onClick={onEdit}>
            Edit
          </Button>
        )}
        {onRemove !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remove ${feat.name} from this table`}
            onClick={onRemove}
          >
            Remove
          </Button>
        )}
      </div>
    </article>
  );
}
