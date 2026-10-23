import type { CampaignId, LevelId, LevelVisit, LevelVisitSummary } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Loading,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { libraryLevelsAtom } from "../levels/load";
import { sizeLine } from "../levels/size";
import { Field, SaveFailure } from "../ui/form";

/**
 * Take the party to one of the creator's levels: a visit of it, a copy taken
 * now, with the party on its way in (its *Way in* region, else the left edge).
 * Only the levels the table has not been to are offered: a level it has a
 * visit of is that visit, as the party left it, or a reset away from a fresh
 * one (the server refuses a second open).
 */
export function OpenVisitDialog({
  campaignId,
  visited,
  onClose,
  onOpened,
}: {
  readonly campaignId: CampaignId;
  readonly visited: ReadonlyArray<LevelVisitSummary>;
  readonly onClose: () => void;
  readonly onOpened: (visit: LevelVisit) => void;
}) {
  const [shelf, retry] = useApiAtom(libraryLevelsAtom);
  const [levelId, setLevelId] = useState<LevelId>();
  const { busy, failure, submit } = useMutation();
  const been = new Set(visited.map((visit) => visit.levelId));
  const levels = shelf.state === "ready" ? shelf.value.filter((level) => !been.has(level.id)) : [];

  const open = async () => {
    if (levelId === undefined) return;
    const made = await submit(
      (client) => client.levelVisits.open({ params: { campaignId }, payload: { levelId } }),
      [reads.levelVisits(campaignId)],
    );
    if (Result.isSuccess(made)) onOpened(made.success);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-label="Open a level">
        <DialogHeader>
          <DialogTitle>Open a level</DialogTitle>
          <DialogDescription>
            The party goes to one of your levels. It stays as they leave it, night after night.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 px-gutter py-3">
          {shelf.state === "loading" && <Loading label="Reading your levels…" />}
          {shelf.state === "failed" && <ApiFailureNotice failure={shelf.failure} onRetry={retry} />}
          {shelf.state === "ready" &&
            (levels.length === 0 ? (
              <p className="mb-0 text-body-s leading-body text-muted-foreground">
                {shelf.value.length === 0
                  ? "Your Library has no levels yet. Build one on the Levels shelf first."
                  : "The party has been to every level in your Library. Open one of their visits, or build another level."}
              </p>
            ) : (
              <Field
                label="Level"
                htmlFor="visit-level"
                hint="A copy is taken now: editing the level later changes nothing here."
              >
                <Select
                  value={levelId ?? ""}
                  onValueChange={(next) => setLevelId(String(next) as LevelId)}
                >
                  <SelectTrigger id="visit-level" className="w-full">
                    <SelectValue>
                      {(selected) =>
                        levels.find((level) => level.id === selected)?.name ?? "Pick a level"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        {level.name} · {sizeLine(level)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
        </div>
        <DialogFooter>
          {failure !== undefined && <SaveFailure failure={failure} />}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void open()} disabled={busy || levelId === undefined}>
            {busy ? "Opening…" : "Open level"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
