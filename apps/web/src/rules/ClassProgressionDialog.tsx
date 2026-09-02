import type { CampaignId, CharacterOption, ClassLevel, Feature } from "@taverns/api";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@taverns/ui";
import { useApiAtom } from "../api/atoms";
import { DetailBody, DetailSection } from "../ui/detail";
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

        <DetailBody className="@container">
          {resource.state === "loading" && <Loading label="Reading the progression…" />}
          {resource.state === "failed" && (
            <FailureNotice failure={resource.failure} onRetry={reload} />
          )}
          {resource.state === "ready" && (
            <>
              {/* One line, not three tiles: the three counts are one sentence
                  about the same rows drawn below, and tiles the width of the
                  dialog read as content rather than a summary. */}
              <p className="text-label leading-label text-muted-foreground">
                {countLine(resource.value.subclasses.length, "subclass", "subclasses")} ·{" "}
                {countLine(resource.value.levels.length, "level", "levels")} ·{" "}
                {countLine(resource.value.features.length, "feature", "features")}
              </p>

              {resource.value.subclasses.length > 0 && (
                <DetailSection title="Subclasses">
                  <div className="flex flex-wrap gap-2">
                    {resource.value.subclasses.map((subclass) => (
                      <Badge key={subclass.id} variant="secondary">
                        {subclass.name}
                      </Badge>
                    ))}
                  </div>
                </DetailSection>
              )}

              <DetailSection title="Levels">
                <div className="grid gap-2 @lg:grid-cols-2">
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
              </DetailSection>

              <DetailSection title="Features">
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
              </DetailSection>
            </>
          )}
        </DetailBody>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const countLine = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;
