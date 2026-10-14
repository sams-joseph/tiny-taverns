import type { CampaignId, Creature, Npc, NpcId } from "@taverns/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Loading,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { useState } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom } from "../api/atoms";
import { npcsAtom } from "../cast/load";
import { Field } from "../ui/form";
import { CreaturePicker } from "./CreaturePicker";

/**
 * A member of the Cast put on the roster as itself: which NPC, and the stat
 * block it fights as. A fight reads what a creature may do from a stat block
 * alone, so the second pick is not optional; the NPC's own sheet still gives
 * its armour class and hit points when the fight starts.
 *
 * The list is the Cast's live shelf, the NPCs already on the roster left out:
 * a member of the Cast is in a fight once.
 */
export function CastLineDialog({
  campaignId,
  taken,
  onPick,
  onClose,
}: {
  readonly campaignId: CampaignId;
  /** The NPCs the roster already holds. */
  readonly taken: ReadonlySet<NpcId>;
  readonly onPick: (npc: Pick<Npc, "id" | "name">, creature: Creature) => void;
  readonly onClose: () => void;
}) {
  const [cast, reload] = useApiAtom(npcsAtom(campaignId));
  const [chosen, setChosen] = useState<NpcId | undefined>();
  const free =
    cast.state === "ready"
      ? [...cast.value]
          .filter((npc) => !taken.has(npc.id))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
  const npc = free.find((candidate) => candidate.id === chosen);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Add a member of the Cast">
        <DialogHeader>
          <DialogTitle>Add a member of the Cast</DialogTitle>
          <DialogDescription>
            They fight as themselves, with the stat block you pick for them.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-gutter py-3">
          {cast.state === "loading" && <Loading label="Reading the Cast…" />}
          {cast.state === "failed" && <ApiFailureNotice failure={cast.failure} onRetry={reload} />}
          {cast.state === "ready" &&
            (free.length === 0 ? (
              <p className="mb-0 text-body-s leading-body text-muted-foreground">
                Everyone in the Cast is on this roster already, or the Cast is empty.
              </p>
            ) : (
              <>
                <Field label="Who" htmlFor="cast-line-npc">
                  <Select
                    value={chosen ?? null}
                    onValueChange={(value) => setChosen((value ?? undefined) as NpcId | undefined)}
                  >
                    <SelectTrigger id="cast-line-npc">
                      <SelectValue>
                        {(value) =>
                          free.find((candidate) => candidate.id === value)?.name ??
                          "Pick a member of the Cast"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {free.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {npc !== undefined && (
                  <CreaturePicker
                    scope={{ kind: "campaign", campaignId }}
                    pickLabel={(creature) => `${npc.name} fights as ${creature.name}`}
                    onPick={(creature) => onPick(npc, creature)}
                  />
                )}
              </>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
