import { type Creature, sheetFromStatBlock } from "@taverns/api";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  SectionHeading,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useInvalidate } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { CreaturePicker } from "../campaign/CreaturePicker";
import { SaveFailure } from "../ui/form";
import { bestiaryStartLines, type NpcSheetTarget } from "./npcSheet";

/**
 * *Start from a bestiary NPC*: pick a humanoid from the bestiary the NPC's
 * owner reads, see what its stat block writes, and start the sheet from it.
 *
 * The translation is `sheetFromStatBlock`, the one rule for it: the cells,
 * AC, HP and CR, speed, the proficiency bonus, skills and saves, senses and
 * languages as badges, features and action lines. **Class and level stay
 * empty** — a Veteran is not a Fighter 5, and the dialog says so rather than
 * guessing; *Edit stats* sets them afterwards.
 *
 * Picking only chooses; the confirm writes. The write is the PUT that starts a
 * sheet, with no `expectedVersion` because there was none to read — so a
 * sheet started elsewhere meanwhile is a `Conflict`, offered a *Reload*.
 */
export function NpcSheetFromBestiaryDialog({
  name,
  target,
  onClose,
  onSaved,
}: {
  /** The NPC's name, for the title. */
  readonly name: string;
  readonly target: NpcSheetTarget;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [picked, setPicked] = useState<Creature | null>(null);
  const { busy, failure, submit } = useMutation();
  const invalidate = useInvalidate();

  const start = async () => {
    if (picked === null) return;
    const saved = await submit(
      (client) => target.put(client, sheetFromStatBlock(picked)),
      target.writes,
    );
    if (Result.isSuccess(saved)) onSaved();
  };

  // A refusal because a sheet was started meanwhile: read it and leave.
  const reload = () => {
    invalidate(target.writes);
    onClose();
  };

  const title = `Start ${name}’s stats from the bestiary`;
  const lines = picked === null ? undefined : bestiaryStartLines(sheetFromStatBlock(picked));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Pick a humanoid. Its stat block becomes {name}&rsquo;s sheet; class and level stay empty
            for you to set.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-gutter py-3">
          {picked === null || lines === undefined ? (
            <CreaturePicker
              scope={target.bestiary}
              type="humanoid"
              pickLabel={(creature) => `Start from ${creature.name}`}
              onPick={setPicked}
            />
          ) : (
            <Card data-slot="bestiary-start" className="gap-2 p-card">
              <div className="flex flex-wrap items-center gap-2">
                <SectionHeading size="title" className="min-w-0 flex-1">
                  {picked.name}
                </SectionHeading>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPicked(null)}>
                  <Icon name="chevron-left" size={14} />
                  Pick another
                </Button>
              </div>
              <p className="mb-0 font-mono text-mono leading-body text-foreground">
                {lines.numbers}
              </p>
              <p className="mb-0 text-body-s leading-body text-muted-foreground">
                {lines.contents}
              </p>
              <p className="mb-0 text-body-s leading-body text-muted-foreground">
                No class or level: a stat block has neither. Set them with <em>Edit stats</em> if{" "}
                {name} has them.
              </p>
            </Card>
          )}
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} onReload={reload} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          {picked !== null && (
            <Button size="sm" disabled={busy} onClick={() => void start()}>
              {busy ? "Starting…" : `Start from ${picked.name}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
