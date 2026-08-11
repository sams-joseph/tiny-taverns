import type { Campaign, EncounterRun, Session } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from "@taverns/ui";
import { Effect, Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { hrefFor } from "../routes";
import { finishSession, liveRunIn } from "../session/finish";
import { SaveFailure } from "../ui/form";

/**
 * Ending the night from the prep screen — the other way out of a session.
 *
 * The only way to finish a session used to be the *"Finish session N too"*
 * switch inside `run/EndRunDialog.tsx`, which a DM reaches by ending a fight.
 * That is the wrong shape for the common evening: the fight finishes, the table
 * keeps playing, and the night ends an hour later over prep, notes and
 * roleplay — or there was never a fight at all. Both those DMs had no way to end
 * the night, and `StartRunDialog` only invents the next session once the
 * campaign's pointer resolves to nothing, so they were locked in the old one.
 *
 * The write itself is `session/finish.ts`, shared with that dialog, so the two
 * ways out cannot drift into meaning different things.
 *
 * ### Why a dialog, and not a button
 *
 * Ending the night is significant and the screen offers no way back: the session
 * closes, `campaign.current_session_id` clears, and the next fight starts a new
 * night. So it says all three of those out loud, and the confirm is the only
 * thing that does it.
 *
 * ### A live fight is refused, not ended
 *
 * Ending the run as a side effect would throw away the turn marker and round
 * count without being asked, so this refuses and says which fight is in the way
 * — with a link into it, because "end the fight first" is only useful next to
 * the door. `session/finish.ts` records why refusing is the safe half of a
 * question nobody has answered yet.
 *
 * The refusal is checked **twice**, and both are load bearing. The campaign
 * screen already knows the live fight, so the usual case renders as a refusal
 * with nothing to click. The re-read at submit time is for the fight that
 * started in another tab after this screen loaded: it happens *before* the
 * stamp, so a night is never finished over a fight that a stale render did not
 * know about.
 */

/** What the dialog is showing: the confirmation, or the fight in the way. */
type InTheWay = { readonly run: EncounterRun };

export function FinishSessionDialog({
  campaign,
  session,
  /** The live fight the screen knows about, if it saw one. */
  liveRun,
  onClose,
  onFinished,
}: {
  readonly campaign: Campaign;
  readonly session: Session;
  readonly liveRun: EncounterRun | undefined;
  readonly onClose: () => void;
  /** Re-reads the campaign. The session is gone from under the screen. */
  readonly onFinished: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const [refused, setRefused] = useState<InTheWay | undefined>(
    liveRun === undefined ? undefined : { run: liveRun },
  );

  const finish = async () => {
    const done = await submit((client) =>
      Effect.gen(function* () {
        // Read first, write second: a refusal costs a round trip and leaves
        // nothing written, where a check made after the stamp would be a night
        // already ended.
        const runs = yield* client.runs.list({
          params: { campaignId: campaign.id, sessionId: session.id },
        });
        const live = liveRunIn(runs);
        // Answered as a value rather than a failure — a fight in the way is
        // not a save that went wrong, and `SaveFailure`'s sentences are all
        // about the server.
        if (live !== undefined) return { refused: { run: live } } as const;
        yield* finishSession(campaign.id, session)(client);
        return { refused: undefined } as const;
      }),
    );

    if (Result.isFailure(done)) return;
    if (done.success.refused !== undefined) {
      setRefused(done.success.refused);
      return;
    }
    onFinished();
  };

  const runHref =
    refused === undefined
      ? undefined
      : hrefFor({
          screen: "run",
          campaignId: campaign.id,
          sessionId: session.id,
          runId: refused.run.id,
        });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Finish the night">
        <DialogHeader>
          <DialogTitle>
            {refused === undefined
              ? `Finish session ${String(session.number)}?`
              : "There is still a fight on the table"}
          </DialogTitle>
          <DialogDescription>
            {refused === undefined ? (
              <>
                This marks the night over. {campaign.name} stops pointing at session{" "}
                {session.number}, and the next encounter you run starts a new one.
              </>
            ) : (
              <>
                {refused.run.encounterName} is still running in session {session.number}. End that
                fight first — nothing here will take it off the table for you.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            {refused === undefined
              ? "Nothing is deleted. Everything in the session — the fights, the checklist, the notes — stays exactly as it is, and stays readable."
              : "The fight is untouched. Take it off the table in the runner, then come back and finish the night."}
          </p>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            {refused === undefined ? "Keep it open" : "Leave it open"}
          </Button>
          {refused === undefined ? (
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void finish()}>
              {busy ? "Finishing…" : "Finish the night"}
            </Button>
          ) : (
            // `nativeButton={false}` or Base UI applies button-only semantics to
            // the anchor — the rule the rail's nav rows follow.
            <Button size="sm" nativeButton={false} render={<a href={runHref} />}>
              <Icon name="swords" size={14} />
              Go to the fight
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
