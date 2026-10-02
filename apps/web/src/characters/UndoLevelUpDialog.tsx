import type { LevelUpKeptScore, OwnedCharacter } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import type { LogEntry } from "./levelUp";
import { levelUpWrites, undoOwnLevelUp } from "./write";

/**
 * **Taking the latest level-up back** — the Log's *Undo*, behind a confirm,
 * because it changes the sheet as much as the level-up did: the level, the
 * hit point maximum, and every choice the record says it applied.
 *
 * `DELETE /me/characters/:id/level-ups/:level` reverses exactly what the
 * record holds and then recomputes the level below, so the dialog can say
 * what goes before it goes. One thing it cannot know until the server has
 * looked: a score somebody changed by hand since the level-up raised it is
 * theirs, and stays. The answer names those, and the dialog stays open to
 * say so rather than closing on a sheet that did not move the way it said.
 */
export function UndoLevelUpDialog({
  owned,
  entry,
  onClose,
  onReload,
}: {
  readonly owned: OwnedCharacter;
  /** The latest record, and the one the undo takes back. */
  readonly entry: LogEntry;
  readonly onClose: () => void;
  readonly onReload: () => void;
}) {
  const character = owned.character;
  const { busy, failure, submit } = useMutation();
  const [kept, setKept] = useState<ReadonlyArray<LevelUpKeptScore> | undefined>();
  const below = entry.level - 1;

  const undo = async () => {
    const done = await submit(
      (client) => undoOwnLevelUp(client, character, entry.level),
      levelUpWrites(owned),
    );
    if (Result.isFailure(done)) return;
    if (done.success.keptScores.length === 0) onClose();
    else setKept(done.success.keptScores);
  };

  if (kept !== undefined) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent aria-label="Level-up undone">
          <DialogHeader>
            <DialogTitle>Back to level {below}</DialogTitle>
            <DialogDescription>
              Every other change went back. These scores were changed by hand since the level-up
              raised them, so they stay as they are.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1 px-gutter py-3">
            {kept.map((score) => (
              <li key={score.label} className="text-body-s leading-body text-foreground">
                {score.label} stays {score.score} (the level-up raised it from {score.raised.from}{" "}
                to {score.raised.to})
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Undo a level-up">
        <DialogHeader>
          <DialogTitle>Back to level {below}?</DialogTitle>
          <DialogDescription>
            {character.name} loses level {entry.level} and everything it brought. The Log entry goes
            with it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 px-gutter py-3">
          {entry.hitPoints !== undefined && (
            <p className="text-body-s leading-body text-muted-foreground">
              The hit points it gained come off the maximum.
            </p>
          )}
          {entry.lines.length > 0 && (
            <>
              <p className="text-body-s leading-body text-muted-foreground">
                These choices are taken back:
              </p>
              <ul className="flex flex-col gap-1">
                {entry.lines.map((line) => (
                  <li key={line} className="text-body-s leading-body text-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-body-s leading-body text-muted-foreground">
            The features and numbers of level {entry.level} are worked out again for level {below}.
          </p>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} onReload={onReload} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep level {entry.level}
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void undo()}>
            {busy ? "Undoing…" : `Back to level ${String(below)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
