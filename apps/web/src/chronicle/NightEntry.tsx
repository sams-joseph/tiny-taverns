import type {
  Beat,
  BeatId,
  Campaign,
  ChronicleNight,
  PartySeat,
  Session,
  Visibility,
} from "@taverns/api";
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
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure, VisibilityField } from "../ui/form";
import { NightBody } from "./NightBody";
import { NightComposer } from "./NightComposer";

/**
 * An opened night, **the DM's**: the night read back (`NightBody`), and what
 * the DM can do to it — *Edit* (the composer, inline, where the summary is),
 * *Clear summary* (after asking), *Share with the table*, and each moment's
 * *Share* / *Unshare*.
 *
 * Every write here names `reads.sessions`, which the Chronicle's one read
 * answers — it carries the session row and the night's beats — and which the
 * Overview's *Last time* reads under too; and `reads.recap` for a night's
 * recap read elsewhere.
 *
 * All of it lives inside the opened card, never on its header: the header is
 * the accordion's one button, and nothing in the body toggles it.
 *
 * **Sharing a night is the switch players' Chronicles wait on.** A night
 * starts `dm` (`session/start.ts` gives it no visibility), so a player's list
 * is empty until the DM turns this on; what a shared night then tells them is
 * decided by the server's narrow reads, not here: its title, date, summary and
 * spotlight, the moments the DM shared one by one, and its encounters by kind.
 */
export function DmNight({
  campaign,
  night,
  party,
  hobAvailable,
  writtenAbove,
}: {
  readonly campaign: Campaign;
  readonly night: ChronicleNight;
  readonly party: ReadonlyArray<PartySeat>;
  readonly hobAvailable: boolean;
  /**
   * The composer card above the list is already writing this night up, so
   * there is no second composer in here.
   */
  readonly writtenAbove: boolean;
}) {
  const campaignId = campaign.id;
  const session = night.session;
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const share = useMutation();
  const moment = useMutation();
  const [sharing, setSharing] = useState<BeatId | undefined>(undefined);

  const shareMoment = async (beat: Beat, visibility: Visibility) => {
    setSharing(beat.id);
    await moment.submit(
      (client) =>
        client.beats.update({
          params: { campaignId, sessionId: session.id, beatId: beat.id },
          payload: { visibility },
        }),
      [reads.sessions(campaignId), reads.recap(session.id)],
    );
    setSharing(undefined);
  };

  const setVisibility = (visibility: Session["visibility"]) =>
    void share.submit(
      (client) =>
        client.sessions.update({
          params: { campaignId, sessionId: session.id },
          payload: { visibility },
        }),
      [reads.sessions(campaignId), reads.recap(session.id)],
    );

  return (
    <>
      <NightBody
        audience={{
          kind: "dm",
          campaignId,
          share: (beat, visibility) => void shareMoment(beat, visibility),
          sharing,
          editor: editing ? (
            <NightComposer
              campaignId={campaignId}
              session={session}
              party={party}
              hobAvailable={hobAvailable}
              mode={{ kind: "edit" }}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          ) : undefined,
        }}
        night={night}
      />
      {moment.failure !== undefined && <SaveFailure failure={moment.failure} />}

      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 border-t border-hairline pt-3.5">
        {/* Beside the presses while the card has room; above them on a phone. */}
        <div className="min-w-0 basis-full @md:flex-1 @md:basis-0">
          <VisibilityField
            id={`share-${session.id}`}
            label="Share with the table"
            value={session.visibility}
            disabled={share.busy}
            onChange={setVisibility}
            shared={
              campaign.visibility === "shared"
                ? "Players can read this night: its title, date, summary and spotlight, the moments you share and its encounters by kind."
                : "Players can read this night once the campaign itself is shared with them."
            }
            hidden="Only you can read this night."
          />
          {share.failure !== undefined && <SaveFailure failure={share.failure} />}
        </div>
        {!editing && (
          <div className="flex flex-wrap items-center gap-2">
            {(session.summary !== null || !writtenAbove) && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Icon name="pencil" size={13} />
                {session.summary === null ? "Write a summary" : "Edit"}
              </Button>
            )}
            {session.summary !== null && (
              <Button variant="ghost" size="sm" onClick={() => setClearing(true)}>
                <Icon name="x" size={13} />
                Clear summary
              </Button>
            )}
          </div>
        )}
      </div>

      {clearing && (
        <ClearSummaryDialog
          campaign={campaign}
          session={session}
          onClose={() => setClearing(false)}
        />
      )}
    </>
  );
}

/**
 * *Clear summary*, after asking. It clears the words and their provenance
 * (`summary: null`) and nothing else — the title, the spotlight, the moments
 * and the encounters stay — and a night left with no summary is written up
 * again from its card, or from the composer if it is the newest.
 */
function ClearSummaryDialog({
  campaign,
  session,
  onClose,
}: {
  readonly campaign: Campaign;
  readonly session: Session;
  readonly onClose: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const clear = async () => {
    const done = await submit(
      (client) =>
        client.sessions.update({
          params: { campaignId: campaign.id, sessionId: session.id },
          payload: { summary: null },
        }),
      [reads.sessions(campaign.id), reads.recap(session.id)],
    );
    if (Result.isSuccess(done)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Clear the summary">
        <DialogHeader>
          <DialogTitle>Clear the summary of session {session.number}?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>

        <div className="px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            The summary is deleted. The night&apos;s title, spotlight, moments and encounters stay
            as they are.
          </p>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void clear()}>
            {busy ? "Clearing…" : "Clear summary"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
