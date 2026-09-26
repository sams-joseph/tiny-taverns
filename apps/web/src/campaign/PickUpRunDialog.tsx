import type {
  Campaign,
  Encounter,
  EncounterPlayed,
  EncounterRunId,
  Session,
  SessionId,
} from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Loading,
} from "@taverns/ui";
import { Effect, Result } from "effect";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { sceneNoun } from "../run/scene";
import { startSession } from "../session/start";
import { SaveFailure } from "../ui/form";
import { runNumberAtom } from "./runNumber";

/**
 * Picking a carried encounter back up — the way into the runner for a fight a
 * night finished over.
 *
 * **An encounter is played once** (`repo/EncounterRuns.ts`, `playthroughOf`),
 * so a carried one cannot be started again, and continuing it is not a start:
 * `runs.resume` copies the carried run into a new one on tonight's session,
 * with its order, hit points, round and log (`0007_run_carryover.ts`). This
 * dialog is the only caller of it, reached from the encounter's *Pick up*.
 *
 * It opens a night when none is open, exactly as `StartRunDialog`'s cold branch
 * does and through the same `session/start.ts`, because a DM who sits down to
 * finish last week's fight must not be made to open the night first.
 */
export function PickUpRunDialog({
  campaign,
  session,
  encounter,
  carried,
  onClose,
  onPickedUp,
}: {
  readonly campaign: Campaign;
  /** The campaign's current session, if it has one. */
  readonly session: Session | undefined;
  readonly encounter: Encounter;
  /** The run the night finished over, which this continues. */
  readonly carried: EncounterPlayed;
  readonly onClose: () => void;
  readonly onPickedUp: (sessionId: SessionId, runId: EncounterRunId) => void;
}) {
  const campaignId = campaign.id;
  const [number, reload] = useApiAtom(runNumberAtom({ campaignId, known: session?.number }));
  const { busy, failure, submit } = useMutation();
  const noun = sceneNoun(encounter.kind);
  const from = `session ${String(carried.sessionNumber)}`;

  const pickUp = async () => {
    if (number.state !== "ready") return;
    const opening = number.value;
    const picked = await submit(
      (client) =>
        Effect.gen(function* () {
          const sessionId =
            session === undefined ? yield* startSession(campaignId, opening)(client) : session.id;
          const run = yield* client.runs.resume({
            params: { campaignId, sessionId },
            payload: { continuedFrom: carried.runId },
          });
          return { sessionId, run };
        }),
      // What `StartRunDialog` names, for the same reasons: the night's fights,
      // and the campaign with its spine only when this opened the night. The
      // encounters too: the one picked up moves to the table.
      session === undefined
        ? [reads.campaign(campaignId), reads.sessions(campaignId), reads.encounters(campaignId)]
        : [reads.runs(session.id), reads.encounters(campaignId)],
    );
    if (Result.isSuccess(picked)) {
      onPickedUp(picked.success.sessionId, picked.success.run.id);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Pick up ${encounter.name}`}>
        <DialogHeader>
          <DialogTitle>Pick up {encounter.name}</DialogTitle>
          <DialogDescription>
            {session === undefined
              ? number.state === "ready"
                ? `This starts session ${String(number.value)} and picks the ${noun} up where ${from} left it.`
                : `This starts a new session and picks the ${noun} up where ${from} left it.`
              : `This picks the ${noun} up in session ${String(session.number)}, where ${from} left it.`}
          </DialogDescription>
        </DialogHeader>

        {number.state === "loading" && (
          <div className="px-gutter py-gutter">
            <Loading label="Counting the sessions…" />
          </div>
        )}
        {number.state === "failed" && (
          <div className="px-gutter py-gutter">
            <ApiFailureNotice failure={number.failure} onRetry={reload} />
          </div>
        )}
        {number.state === "ready" && (
          <div className="px-gutter py-3">
            <p className="mb-0 text-body-s leading-body text-muted-foreground">
              {encounter.kind === "combat"
                ? "The initiative order, hit points, conditions and the round carry over as they were."
                : "Everyone in it, its beats and its log of checks carry over as they were."}
            </p>
          </div>
        )}

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || number.state !== "ready"}
            onClick={() => void pickUp()}
          >
            {busy ? "Picking up…" : `Pick up the ${noun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
