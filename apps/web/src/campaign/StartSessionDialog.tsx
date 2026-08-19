import type { Campaign } from "@taverns/api";
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
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { nextSessionNumber, startSession } from "../session/start";
import { SaveFailure } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";

/**
 * Opening the night, with no fight in sight — and the other half of a pair the
 * product shipped only one side of.
 *
 * **Starting a session used to require choosing an encounter.** `StartRunDialog`
 * was the only way into a night, so an evening that opens in a tavern, or over
 * the party arguing about a crate, could not be recorded at all: no session, no
 * checklist to tick, no night for a beat to hang off. The captain's own words —
 * *"a session can start in the middle of a tavern and there may not be an
 * encounter yet"*. An encounter goes on the table when the party reaches it, at
 * the DM's discretion, and that is a second press rather than a precondition.
 *
 * So this is a second door, not the existing one moved: `StartRunDialog` keeps
 * its cold-campaign branch, because a DM who goes straight to a fight must not
 * be made to open the night first. Both go through `session/start.ts`.
 *
 * ### Why a dialog, and not a bare button
 *
 * The mirror of `FinishSessionDialog`, and for the mirror of its reason. Opening
 * a night is a numbered, durable thing the campaign then points at, and the
 * number is the one fact a DM wants to see before they agree to it — *"Session
 * 13"* is what the chronicle, the recap and every beat of the evening will be
 * filed under. It is also not undoable from here: finishing the night is its own
 * confirmation, on the session card.
 */
/**
 * What the next night would be numbered, as an atom keyed on the campaign.
 *
 * Module scope, because an atom *is* its identity: built inside the component
 * it would be a new one every render and load forever. That is the same hazard
 * the `useCallback` here used to answer, in a shape that cannot be forgotten.
 */
const nextNumberAtom = Atom.family((campaignId: Campaign["id"]) =>
  apiAtom(nextSessionNumber(campaignId)),
);

export function StartSessionDialog({
  campaign,
  onClose,
  onStarted,
}: {
  readonly campaign: Campaign;
  readonly onClose: () => void;
  /** Re-reads the campaign. The night is on the screen now. */
  readonly onStarted: () => void;
}) {
  const campaignId = campaign.id;

  const [number, reload] = useApiAtom(nextNumberAtom(campaignId));

  const { busy, failure, submit } = useMutation();

  const start = async () => {
    if (number.state !== "ready") return;
    const opened = await submit(startSession(campaignId, number.value));
    if (Result.isSuccess(opened)) onStarted();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Start the night">
        <DialogHeader>
          <DialogTitle>
            {number.state === "ready"
              ? `Start session ${String(number.value)}?`
              : "Start a session"}
          </DialogTitle>
          <DialogDescription>
            {campaign.name} starts pointing at this night. The checklist, the notes you take and
            everything that happens at the table are filed under it.
          </DialogDescription>
        </DialogHeader>

        <div className="px-gutter py-3">
          {number.state === "loading" && <Loading label="Counting the sessions…" />}
          {number.state === "failed" && <FailureNotice failure={number.failure} onRetry={reload} />}
          {number.state === "ready" && (
            <p className="text-body-s leading-body text-muted-foreground">
              Nothing goes on the table yet. Put an encounter on it when the party reaches one —{" "}
              <span className="text-heading">Run</span> on any encounter joins this night rather
              than starting another.
            </p>
          )}
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Not yet
          </Button>
          <Button
            size="sm"
            disabled={busy || number.state !== "ready"}
            onClick={() => void start()}
          >
            {busy ? "Starting…" : "Start the night"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
