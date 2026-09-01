import type { CampaignId, CharacterOption, ClassLevel, Feature } from "@taverns/api";
import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@taverns/ui";
import { useApiAtom } from "../api/atoms";
import { FailureNotice, Loading } from "../ui/states";
import { campaignOptionProgressionAtom, libraryOptionProgressionAtom } from "./load";

const levelLabel = (level: ClassLevel): string =>
  level.subclassId === null
    ? `Class level ${String(level.level)}`
    : `Subclass level ${String(level.level)}`;

const featureLine = (feature: Feature, levels: ReadonlyArray<ClassLevel>): string => {
  const level = levels.find((row) => row.id === feature.classLevelId);
  return level === undefined ? `Level ${String(feature.level)}` : levelLabel(level);
};

export function ClassProgressionDialog({
  option,
  campaignId,
  onClose,
}: {
  readonly option: CharacterOption;
  readonly campaignId?: CampaignId;
  readonly onClose: () => void;
}) {
  const [resource, reload] = useApiAtom(
    campaignId === undefined
      ? libraryOptionProgressionAtom(option.id)
      : campaignOptionProgressionAtom({ campaignId, optionId: option.id }),
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`${option.name} progression`}>
        <DialogHeader>
          <DialogTitle>{option.name} progression</DialogTitle>
          <DialogDescription>
            Concrete 2014 subclasses, levels and features for this class row. A campaign copy is a
            snapshot of the original.
          </DialogDescription>
        </DialogHeader>

        <div className="@container flex max-h-[65vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          {resource.state === "loading" && <Loading label="Reading the progression…" />}
          {resource.state === "failed" && (
            <FailureNotice failure={resource.failure} onRetry={reload} />
          )}
          {resource.state === "ready" && (
            <>
              <div className="grid gap-3 @md:grid-cols-3">
                <CountCard label="Subclasses" value={resource.value.subclasses.length} />
                <CountCard label="Levels" value={resource.value.levels.length} />
                <CountCard label="Features" value={resource.value.features.length} />
              </div>

              {resource.value.subclasses.length > 0 && (
                <section className="flex flex-col gap-2" aria-label="Subclasses">
                  <h3 className="font-display text-title leading-snug font-semibold text-heading">
                    Subclasses
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {resource.value.subclasses.map((subclass) => (
                      <Badge key={subclass.id} variant="secondary">
                        {subclass.name}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              <section className="flex flex-col gap-2" aria-label="Levels">
                <h3 className="font-display text-title leading-snug font-semibold text-heading">
                  Levels
                </h3>
                <div className="grid gap-2 @3xl:grid-cols-2">
                  {resource.value.levels.map((level) => (
                    <div
                      key={level.id}
                      className="rounded-control border border-subtle bg-surface-card px-3 py-2"
                    >
                      <p className="text-body-s leading-body font-semibold text-heading">
                        {levelLabel(level)}
                      </p>
                      <p className="text-caption leading-body text-muted-foreground">
                        {level.abilityScoreBonuses === null
                          ? "No ability-score increase"
                          : `${String(level.abilityScoreBonuses)} ability-score increase${
                              level.abilityScoreBonuses === 1 ? "" : "s"
                            }`}
                        {level.proficiencyBonus === null
                          ? ""
                          : ` · proficiency +${String(level.proficiencyBonus)}`}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-2" aria-label="Features">
                <h3 className="font-display text-title leading-snug font-semibold text-heading">
                  Features
                </h3>
                <div className="flex flex-col divide-y divide-subtle rounded-card border border-subtle bg-surface-card">
                  {resource.value.features.map((feature) => (
                    <div key={feature.id} className="px-3 py-2">
                      <p className="text-body-s leading-body font-semibold text-heading">
                        {feature.name}
                      </p>
                      <p className="text-caption leading-body text-muted-foreground">
                        {featureLine(feature, resource.value.levels)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CountCard({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-control border border-subtle bg-surface-card px-3 py-2">
      <p className="text-caption leading-body text-muted-foreground">{label}</p>
      <p className="font-display text-subtitle leading-snug font-semibold text-heading">
        {String(value)}
      </p>
    </div>
  );
}
