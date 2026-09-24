import type { CampaignId, Note } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Icon } from "@taverns/ui";
import { recentNotes } from "./overview";
import { OverviewCard, OverviewEmpty, sectionLink } from "./OverviewParts";
import { agoOf, useNow } from "./when";

/**
 * The last few things written down, and the way to all of them.
 *
 * `view.notes` is already in the frame's read, so this costs no request. The
 * rows are a summary and open nothing; *All notes* is the way in.
 */
export function RecentNotes({
  notes,
  campaignId,
}: {
  readonly notes: ReadonlyArray<Note>;
  readonly campaignId: CampaignId;
}) {
  const now = useNow();
  const recent = recentNotes(notes);

  return (
    <OverviewCard
      title="Recent notes"
      action={
        <Link to="/campaigns/$campaignId/notes" params={{ campaignId }} className={sectionLink}>
          All notes
        </Link>
      }
    >
      {recent.length === 0 ? (
        <OverviewEmpty>
          No notes yet. Whatever you write on the Notes tab shows up here.
        </OverviewEmpty>
      ) : (
        <ul>
          {recent.map((note) => (
            <li
              key={note.id}
              className="flex gap-2.5 border-t border-hairline px-card py-3 first:border-t-0"
            >
              <Icon name="scroll-text" size={14} className="mt-0.5 shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                <div className="text-body-s leading-snug font-medium text-heading">
                  {note.title}
                </div>
                <div className="text-label-s leading-snug text-faint">
                  {agoOf(note.updatedAt, now)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
