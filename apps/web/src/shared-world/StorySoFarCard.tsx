import type { SharedWorldId } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Icon, Loading } from "@taverns/ui";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { OverviewCard, OverviewEmpty, sectionLink } from "../campaign/OverviewParts";
import { dayOf } from "../chronicle/format";
import { historyAtom, summaryAtom } from "./load";

/** How many of the newest entries the card quotes before sending you to the rest. */
const LATEST = 3;

/**
 * *Story So Far*: the world's accepted summary and its newest Chronicle
 * entries, as a summary card whose *Read the chronicle* is the way to the whole
 * thing (`SharedWorldChronicleScreen.tsx`), where the composer and the Hob
 * draft live.
 *
 * Both reads are the Chronicle's own atoms, so what this card quotes and what
 * the Chronicle lists are one answer, and a kept Hob proposal refreshes both.
 * The rows open nothing, as on every Overview card (`OverviewParts.tsx`).
 */
export function StorySoFarCard({ worldId }: { readonly worldId: SharedWorldId }) {
  const [history, retryHistory] = useApiAtom(historyAtom(worldId));
  const [summary, retrySummary] = useApiAtom(summaryAtom(worldId));

  const entries = history.state === "ready" ? history.value : undefined;
  const story = summary.state === "ready" ? summary.value : undefined;
  // The list is newest first, so its head is the latest accepted sequence.
  const stale =
    story !== undefined &&
    story !== null &&
    entries !== undefined &&
    (entries[0]?.worldSeq ?? 0) > story.lastWorldSeq;
  const latest = entries?.slice(0, LATEST) ?? [];

  return (
    <OverviewCard
      title="Story So Far"
      meta={stale ? <Badge variant="outline">Update needed</Badge> : undefined}
      action={
        <Link to="/worlds/$worldId/chronicle" params={{ worldId }} className={sectionLink}>
          Read the chronicle
        </Link>
      }
    >
      {summary.state === "failed" ? (
        <div className="px-card py-4">
          <ApiFailureNotice failure={summary.failure} onRetry={retrySummary} />
        </div>
      ) : history.state === "failed" ? (
        <div className="px-card py-4">
          <ApiFailureNotice failure={history.failure} onRetry={retryHistory} />
        </div>
      ) : story === undefined || entries === undefined ? (
        <div className="px-card py-4">
          <Loading label="Reading the Story So Far…" />
        </div>
      ) : (
        <>
          {story === null ? (
            <OverviewEmpty>
              {entries.length === 0
                ? "Nothing admitted yet. A campaign's creator can share a played night here, and anyone can write the story down by hand."
                : "No Story So Far has been kept yet. Hob can draft one from the Chronicle."}
            </OverviewEmpty>
          ) : (
            <p className="mb-0 max-w-measure px-card py-4 text-body leading-body whitespace-pre-line text-foreground">
              {story.text}
            </p>
          )}
          {latest.length > 0 && (
            <section aria-label="Latest in the chronicle" className="border-t border-hairline">
              <p className="mb-0 px-card pt-3 text-label-s leading-snug font-medium text-faint">
                Latest in the chronicle
              </p>
              <ul>
                {latest.map((entry) => (
                  <li key={entry.id} className="flex gap-2.5 px-card py-3">
                    <Icon name="scroll-text" size={14} className="mt-0.5 shrink-0 text-faint" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        {entry.title !== null && (
                          <span className="text-body-s leading-snug font-medium text-heading">
                            {entry.title}
                          </span>
                        )}
                        <span className="text-label-s leading-snug text-faint">
                          {/* When it happened if known; acceptance order is the list's. */}
                          {dayOf(entry.occurredAt ?? entry.acceptedAt)}
                        </span>
                      </div>
                      <p className="mb-0 line-clamp-2 text-body-s leading-body text-muted-foreground">
                        {entry.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </OverviewCard>
  );
}
