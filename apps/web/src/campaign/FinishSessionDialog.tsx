import type { Campaign, EncounterRun, Session } from "@taverns/api";
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
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { finishSession } from "../session/finish";
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
 * ### A live fight is carried, not refused
 *
 * This screen used to refuse the night outright while a fight was on the table,
 * and check that refusal twice — once from the run the campaign screen had
 * loaded, once by re-reading at submit time for a fight started in another tab.
 * `session/finish.ts` recorded that as the safe half of a question nobody had
 * answered. **The captain answered it: the fight carries into the next night.**
 *
 * So the refusal and both its checks are gone. What is left is a *sentence*: the
 * dialog says which fight will be carried, because ending the evening over a
 * live fight should never be a surprise, and the DM who wanted the smaller
 * ending can still take the fight off the table in the runner first. Nothing on
 * this side does the carrying — the server ends the run as `carried` in the same
 * transaction that stamps `endedAt`, which is why there is no second request
 * here and no tab race left to lose.
 */
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
  /** Put the confirmation away. The night leaves the screen on its own. */
  readonly onFinished: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const finish = async () => {
    // **The server does more than this write says**, and that is the reason the
    // key list is longer than the request: finishing a night clears
    // `campaign.current_session_id` and takes a live fight off the table, both
    // in the same transaction (`repo/Sessions.ts`). So the campaign row and the
    // night's fights move without either being sent.
    const done = await submit(finishSession(campaign.id, session), [
      reads.campaign(campaign.id),
      reads.sessions(campaign.id),
      reads.runs(session.id),
    ]);
    if (Result.isSuccess(done)) onFinished();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Finish the night">
        <DialogHeader>
          <DialogTitle>Finish session {session.number}?</DialogTitle>
          <DialogDescription>
            This marks the night over. {campaign.name} stops pointing at session {session.number},
            and the next encounter you run starts a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            {liveRun === undefined
              ? "Nothing is deleted. Everything in the session — the fights, the checklist, the notes — stays exactly as it is, and stays readable."
              : `${liveRun.encounterName} is still on the table. It comes off it and waits for the next night, with the initiative order, the hit points and the round exactly as they are now.`}
          </p>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep it open
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void finish()}>
            {busy ? "Finishing…" : "Finish the night"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
