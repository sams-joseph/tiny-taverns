import type {
  SharedWorldHistoryEntry,
  SharedWorldHistorySummary,
  SharedWorldId,
} from "@taverns/api";
import { Badge, Button, Card, CardContent } from "@taverns/ui";
import { useState } from "react";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { dayOf } from "../chronicle/format";
import { SaveFailure, Textarea } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";

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

const historyAtom = Atom.family((worldId: SharedWorldId) =>
  apiAtom(
    (client) => client.sharedWorldHistory.list({ params: { worldId: worldId } }),
    [reads.sharedWorldHistory(worldId)],
  ),
);

const summaryAtom = Atom.family((worldId: SharedWorldId) =>
  apiAtom(
    (client) => client.sharedWorldHistory.summary({ params: { worldId } }),
    [reads.sharedWorldHistory(worldId)],
  ),
);

function StorySoFar({
  summary,
  latestWorldSeq,
  onAskHob,
}: {
  readonly summary: SharedWorldHistorySummary | null;
  readonly latestWorldSeq: number;
  readonly onAskHob: () => void;
}) {
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
          {(summary === null || stale) && (
            <Button size="sm" variant="outline" className="self-start" onClick={onAskHob}>
              {summary === null ? "Draft Story So Far with Hob" : "Refresh with Hob"}
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
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
}: {
  readonly worldId: SharedWorldId;
  readonly onAskHob: () => void;
}) {
  const [resource, retry] = useApiAtom(historyAtom(worldId));
  const [summary, retrySummary] = useApiAtom(summaryAtom(worldId));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {summary.state === "loading" && <Loading label="Reading the Story So Far…" />}
      {summary.state === "failed" && (
        <FailureNotice failure={summary.failure} onRetry={retrySummary} />
      )}
      {summary.state === "ready" && resource.state === "ready" && (
        <StorySoFar
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
          <FailureNotice failure={resource.failure} onRetry={retry} />
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
