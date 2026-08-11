import type { Session } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Switch,
} from "@taverns/ui";
import { Effect, Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { finishSession } from "../session/finish";
import { SaveFailure } from "../ui/form";
import type { RunPath } from "./load";

/**
 * Taking the fight off the table — `EncounterRunner.jsx:160-171`.
 *
 * The prototype's copy is the promise this dialog has to keep: *"Initiative
 * order and hit points are saved to Session 12."* Ending is a `POST`, not a
 * `DELETE`, and nothing is deleted — the run, its combatants and its log all
 * survive, which is what makes a fight interrupted at midnight and resumed next
 * week a second run rather than a resurrection.
 *
 * **Two endings, and they are different sizes.** Ending the fight frees the
 * session so the DM can start the next encounter; finishing the *session* says
 * the night is over. The prototype conflates them because it has one screen;
 * here the smaller one is the default and the larger one is a switch that is
 * off, because a DM who meant only to close a fight should not discover
 * afterwards that they closed the evening.
 *
 * The larger ending is **not written here**: it is `session/finish.ts`, shared
 * with the campaign view's own way out of the night. This screen is where a DM
 * whose fight is ending can also end the evening; it is not the only place an
 * evening ends.
 */
export function EndRunDialog({
  path,
  session,
  encounterName,
  onClose,
  onEnded,
}: {
  readonly path: RunPath;
  readonly session: Session;
  readonly encounterName: string;
  readonly onClose: () => void;
  readonly onEnded: () => void;
}) {
  const [finishNight, setFinishNight] = useState(false);
  const { busy, failure, submit } = useMutation();

  const end = async () => {
    const ended = await submit((client) =>
      Effect.gen(function* () {
        // One `submit`, two writes, exactly as the encounter form composes its
        // roster: two submits in a row would give this dialog two busy flags
        // and a half-ended night to explain.
        const run = yield* client.runs.end({ params: path, payload: {} });
        // The fight comes off the table first, and that is what makes this the
        // *smaller* ending even when both switches are on: ending it here is
        // `resolved`, deliberately, where a night finished over a live fight
        // carries it. A DM who chose "End the fight" chose the first.
        if (finishNight) yield* finishSession(path.campaignId, session)(client);
        return run;
      }),
    );

    if (Result.isSuccess(ended)) onEnded();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="End this fight">
        <DialogHeader>
          <DialogTitle>End this fight?</DialogTitle>
          <DialogDescription>
            The initiative order and hit points for {encounterName} are saved to Session{" "}
            {session.number}. Nothing is deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 px-gutter py-3">
          <div className="flex items-center gap-2.5">
            <Switch id="finish-session" checked={finishNight} onCheckedChange={setFinishNight} />
            <Label htmlFor="finish-session">Finish session {session.number} too</Label>
          </div>
          <span className="text-caption leading-body text-muted-foreground">
            {finishNight
              ? "Marks the night over. Everything in it stays readable."
              : "The session stays open, so you can put the next encounter on the table."}
          </span>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep playing
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void end()}>
            {busy ? "Ending…" : "End the fight"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
