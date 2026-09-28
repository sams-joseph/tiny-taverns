import { CHALLENGE_RATINGS, type ChallengeRating, type NpcSheet } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useInvalidate } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { identityNumberProblems, MAX_AC, MAX_HP, MAX_LEVEL } from "../characters/create";
import { Field, SaveFailure } from "../ui/form";
import {
  boxesOf,
  challengeLine,
  type IdentityBoxes,
  identityPatch,
  type NpcSheetTarget,
  writeOnePayload,
} from "./npcSheet";

/** *No rating*: the one option that is not a rating. */
const NO_RATING = "";

/**
 * An NPC sheet's identity: the level, the labels the descriptor is derived
 * from, the two numbers a fight reads, and the challenge rating the DM sets by
 * hand — the columns `NpcSheetPut` and `NpcSheetUpdate` carry, and only those.
 *
 * **One dialog, two writes.** With no sheet it is *Write one*: a PUT of these
 * over a blank document. Over a sheet it is *Edit identity*: a PATCH of only
 * what changed, with the version it read, so an edit made elsewhere is a
 * `Conflict` offered a *Reload*.
 *
 * The number boxes are checked by the character's own rule
 * (`identityNumberProblems`), because the columns are the character's under
 * the same bounds. There is no descriptor box and no preview of one: the
 * descriptor is a generated column, and appears once the save lands.
 *
 * The challenge rating is a pick from the ratings the XP table knows, never
 * free text, so a rating set here always has XP.
 */
export function NpcSheetDialog({
  name,
  sheet,
  target,
  onClose,
  onSaved,
}: {
  /** The NPC's name, for the title. */
  readonly name: string;
  /** `null` for *Write one*. */
  readonly sheet: NpcSheet | null;
  readonly target: NpcSheetTarget;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [boxes, setBoxes] = useState<IdentityBoxes>(() => boxesOf(sheet));
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();
  const invalidate = useInvalidate();
  const problems = identityNumberProblems(boxes);
  const refused = Object.keys(problems).length > 0;
  const set = (fields: Partial<IdentityBoxes>) =>
    setBoxes((current) => ({ ...current, ...fields }));

  const save = async () => {
    setShowProblems(true);
    if (refused) return;
    if (sheet === null) {
      const saved = await submit(
        (client) => target.put(client, writeOnePayload(boxes)),
        target.writes,
      );
      if (Result.isSuccess(saved)) onSaved();
      return;
    }
    const patch = identityPatch(sheet, boxes);
    if (patch === undefined) {
      onClose();
      return;
    }
    const saved = await submit((client) => target.update(client, patch), target.writes);
    if (Result.isSuccess(saved)) onSaved();
  };

  // A refusal for a sheet that moved on: read it again and start over from it.
  const reload = () => {
    invalidate(target.writes);
    onClose();
  };

  const title = sheet === null ? `Write ${name}’s stats` : `Edit ${name}’s stats`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Who they are on a sheet, and the numbers a fight reads. Only you see these.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <div className="flex flex-wrap gap-5">
            <Field
              label="Level"
              htmlFor="npc-sheet-level"
              error={showProblems ? problems.level : undefined}
            >
              <Input
                id="npc-sheet-level"
                mono
                type="number"
                min={1}
                max={MAX_LEVEL}
                value={boxes.level}
                aria-invalid={showProblems && problems.level !== undefined}
                onChange={(event) => set({ level: event.target.value })}
                className="w-20"
              />
            </Field>
            <Field label="Class" htmlFor="npc-sheet-class">
              <Input
                id="npc-sheet-class"
                placeholder="Fighter"
                value={boxes.className}
                onChange={(event) => set({ className: event.target.value })}
                className="w-40"
              />
            </Field>
            <Field label="Race" htmlFor="npc-sheet-race">
              <Input
                id="npc-sheet-race"
                placeholder="Human"
                value={boxes.race}
                onChange={(event) => set({ race: event.target.value })}
                className="w-40"
              />
            </Field>
            <Field label="Subrace" htmlFor="npc-sheet-subrace">
              <Input
                id="npc-sheet-subrace"
                placeholder="Hill Dwarf"
                value={boxes.subrace}
                onChange={(event) => set({ subrace: event.target.value })}
                className="w-40"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-5">
            <Field label="AC" htmlFor="npc-sheet-ac" error={showProblems ? problems.ac : undefined}>
              <Input
                id="npc-sheet-ac"
                mono
                type="number"
                min={0}
                max={MAX_AC}
                value={boxes.ac}
                aria-invalid={showProblems && problems.ac !== undefined}
                onChange={(event) => set({ ac: event.target.value })}
                className="w-24"
              />
            </Field>
            <Field
              label="Hit points"
              htmlFor="npc-sheet-hp"
              hint="Their maximum."
              error={showProblems ? problems.hpMax : undefined}
            >
              <Input
                id="npc-sheet-hp"
                mono
                type="number"
                min={0}
                max={MAX_HP}
                value={boxes.hpMax}
                aria-invalid={showProblems && problems.hpMax !== undefined}
                onChange={(event) => set({ hpMax: event.target.value })}
                className="w-28"
              />
            </Field>
            <Field label="Challenge rating" htmlFor="npc-sheet-cr">
              <Select
                value={boxes.cr}
                onValueChange={(value) =>
                  set({
                    cr: value === null || value === NO_RATING ? "" : (value as ChallengeRating),
                  })
                }
              >
                <SelectTrigger id="npc-sheet-cr" className="w-44">
                  <SelectValue>
                    {(value: string) =>
                      value === NO_RATING ? "No rating" : challengeLine(value as ChallengeRating)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_RATING}>No rating</SelectItem>
                  {CHALLENGE_RATINGS.map((cr) => (
                    <SelectItem key={cr} value={cr}>
                      {challengeLine(cr)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        {/* In the footer, not at the end of the body: the body scrolls, and a
            line appended below the fold is one nobody sees. */}
        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} onReload={reload} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : sheet === null ? "Write stats" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
