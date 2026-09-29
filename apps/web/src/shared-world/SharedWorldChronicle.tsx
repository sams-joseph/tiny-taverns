import type {
  SharedWorldHistoryEntry,
  SharedWorldHistorySummary,
  SharedWorldId,
} from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Loading,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { dayOf } from "../chronicle/format";
import { SaveFailure, Textarea } from "../ui/form";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { historyAtom, summaryAtom } from "./load";

/**
 * The sharedWorld's chronicle — report §3.5 on screen, read-only plus one composer.
 *
 * **Every line here was admitted on purpose.** A recap entry is a copy a
 * campaign's creator shared (`POST …/history/from-recap` — server-first for
 * now, its campaign-side control comes with sharedWorld Hob); a manual entry is a
 * member writing the story down by hand, which is the composer at the top.
 * Nothing here reads through a campaign, so nothing here can leak one
 * creator's unplayed prep to another — the boundary is which rows exist.
 */

function StorySoFar({
  worldId,
  summary,
  latestWorldSeq,
  onAskHob,
  owns,
}: {
  readonly worldId: SharedWorldId;
  readonly summary: SharedWorldHistorySummary | null;
  readonly latestWorldSeq: number;
  /** Opens the Hob panel; absent where there is none, and so is the button. */
  readonly onAskHob: (() => void) | undefined;
  /** Whether the reader owns the world: clearing is the owner's alone. */
  readonly owns: boolean;
}) {
  const [clearing, setClearing] = useState(false);
  const stale = summary !== null && latestWorldSeq > summary.lastWorldSeq;
  return (
    <section className="flex flex-col gap-2" aria-label="Story So Far">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label leading-snug font-semibold text-heading">Story So Far</span>
        {stale && <Badge variant="outline">Update needed</Badge>}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3 pt-card">
          {summary === null ? (
            <p className="text-body-s leading-body text-faint">
              No Story So Far has been kept yet. Hob can draft one from the accepted Chronicle.
            </p>
          ) : (
            <>
              <p className="max-w-measure text-body-s leading-body whitespace-pre-line text-foreground">
                {summary.text}
              </p>
              {stale && (
                <p className="text-caption leading-body text-muted-foreground">
                  The Chronicle has newer entries. This accepted summary remains current until a
                  member keeps a replacement.
                </p>
              )}
            </>
          )}
          {((onAskHob !== undefined && (summary === null || stale)) ||
            (owns && summary !== null)) && (
            <div className="flex flex-wrap gap-2">
              {onAskHob !== undefined && (summary === null || stale) && (
                <Button size="sm" variant="outline" onClick={onAskHob}>
                  {summary === null ? "Draft Story So Far with Hob" : "Refresh with Hob"}
                </Button>
              )}
              {owns && summary !== null && (
                <Button size="sm" variant="ghost" onClick={() => setClearing(true)}>
                  <Icon name="trash-2" size={13} />
                  Clear
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {clearing && <ClearStorySoFarDialog worldId={worldId} onClose={() => setClearing(false)} />}
    </section>
  );
}

/**
 * The owner's clear, behind a confirm that says what goes and what stays: the
 * Story So Far goes for every member, and the Chronicle it was drawn from is
 * not touched, so Hob can draft a new one from all of it.
 */
function ClearStorySoFarDialog({
  worldId,
  onClose,
}: {
  readonly worldId: SharedWorldId;
  readonly onClose: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const clear = async () => {
    const done = await submit(
      (client) => client.sharedWorldHistory.clearSummary({ params: { worldId } }),
      [reads.sharedWorldHistory(worldId)],
    );
    if (Result.isSuccess(done)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Clear the Story So Far">
        <DialogHeader>
          <DialogTitle>Clear the Story So Far?</DialogTitle>
          <DialogDescription>Every member of this Shared World stops reading it.</DialogDescription>
        </DialogHeader>
        <div className="px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            The Story So Far is cleared, and the world has none until a member keeps a new one. The
            Chronicle is not touched, and Hob can draft a new Story So Far from all of it.
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
            {busy ? "Clearing…" : "Clear Story So Far"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntryRow({ entry }: { readonly entry: SharedWorldHistoryEntry }) {
  // Display order prefers when it happened; acceptance order is the list's.
  const day = dayOf(entry.occurredAt ?? entry.acceptedAt);
  return (
    <div className="flex flex-col gap-1 border-t border-hairline py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-2">
        {entry.title !== null && (
          <span className="text-body-s leading-snug font-semibold text-heading">{entry.title}</span>
        )}
        <span className="text-caption leading-none text-faint">{day}</span>
        {entry.sourceKind === "recap" ? (
          <Badge variant="secondary">A night played</Badge>
        ) : entry.sourceKind === "manual" ? null : (
          <Badge variant="outline">{entry.sourceKind}</Badge>
        )}
      </div>
      <p className="max-w-measure text-body-s leading-body whitespace-pre-line text-foreground">
        {entry.body}
      </p>
    </div>
  );
}

function Composer({ worldId }: { readonly worldId: SharedWorldId }) {
  const [body, setBody] = useState("");
  const { busy, failure, submit } = useMutation();

  const save = async () => {
    const trimmed = body.trim();
    if (trimmed === "") return;
    const done = await submit(
      (client) =>
        client.sharedWorldHistory.create({
          params: { worldId: worldId },
          payload: { body: trimmed },
        }),
      [reads.sharedWorldHistory(worldId)],
    );
    if (done._tag === "Success") setBody("");
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setBody(event.target.value)}
        placeholder="Write something the whole Shared World should remember…"
        rows={2}
        aria-label="Write the chronicle"
      />
      <div className="flex items-center gap-3">
        {failure !== undefined && (
          <div className="min-w-0 flex-1">
            <SaveFailure failure={failure} />
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={busy || body.trim() === ""}
          onClick={() => void save()}
        >
          {busy ? "Writing…" : "Write it down"}
        </Button>
      </div>
    </div>
  );
}

export function SharedWorldChronicle({
  worldId,
  onAskHob,
  owns,
}: {
  readonly worldId: SharedWorldId;
  /** Opens the Hob panel; absent where there is none, and so is the button. */
  readonly onAskHob: (() => void) | undefined;
  /** Whether the reader owns the world, which is who may clear its Story So Far. */
  readonly owns: boolean;
}) {
  const [resource, retry] = useApiAtom(historyAtom(worldId));
  const [summary, retrySummary] = useApiAtom(summaryAtom(worldId));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {summary.state === "loading" && <Loading label="Reading the Story So Far…" />}
      {summary.state === "failed" && (
        <ApiFailureNotice failure={summary.failure} onRetry={retrySummary} />
      )}
      {summary.state === "ready" && resource.state === "ready" && (
        <StorySoFar
          worldId={worldId}
          owns={owns}
          summary={summary.value}
          latestWorldSeq={resource.value[0]?.worldSeq ?? 0}
          onAskHob={onAskHob}
        />
      )}
      <section className="flex flex-col gap-3" aria-label="Chronicle">
        <span className="text-label leading-snug font-semibold text-heading">Chronicle</span>
        <Composer worldId={worldId} />
        {resource.state === "loading" && <Loading label="Reading the chronicle…" />}
        {resource.state === "failed" && (
          <ApiFailureNotice failure={resource.failure} onRetry={retry} />
        )}
        {resource.state === "ready" &&
          (resource.value.length === 0 ? (
            <p className="text-body-s leading-body text-faint">
              Nothing admitted yet. A campaign's creator can share a played night here, and anyone
              can write the story down by hand.
            </p>
          ) : (
            <Card>
              <CardContent className="pt-card">
                {resource.value.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </CardContent>
            </Card>
          ))}
      </section>
    </div>
  );
}
