import type { CampaignId, Note, PlayerNote } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { cardLinkClassName, Icon } from "@taverns/ui";
import { recentNotes, sharedNoteAnchor } from "./overview";
import {
  type Audience,
  OverviewCard,
  OverviewEmpty,
  SHARED_NOTES,
  sectionLink,
} from "./OverviewParts";
import { agoOf, useNow } from "./when";

/**
 * The last few things written down, and the way to all of them.
 *
 * `view.notes` is already in the frame's read, so this costs no request. Each
 * row opens its note from anywhere on the row: the creator's on the Notes tab
 * (`?note=`), a player's at its card lower on this page (`sharedNoteAnchor`).
 *
 * A player has no Notes tab: the shared notes are read in full lower on their
 * own Overview (`play/PlayerCampaignScreen.tsx`), under `SHARED_NOTES`, so
 * that section is where their *All notes* goes. Their `notes` are their own
 * projection, `PlayerNote`, and only the shared ones — a DM note is never in a
 * player's answer (`repo/visibility.ts`).
 */
export function RecentNotes({
  notes,
  campaignId,
  audience,
}: {
  readonly notes: ReadonlyArray<Note | PlayerNote>;
  readonly campaignId: CampaignId;
  readonly audience: Audience;
}) {
  const now = useNow();
  const recent = recentNotes(notes);

  return (
    <OverviewCard
      title="Recent notes"
      action={
        audience === "creator" ? (
          <Link to="/campaigns/$campaignId/notes" params={{ campaignId }} className={sectionLink}>
            All notes
          </Link>
        ) : (
          <a href={`#${SHARED_NOTES}`} className={sectionLink}>
            All notes
          </a>
        )
      }
    >
      {recent.length === 0 ? (
        <OverviewEmpty>
          {audience === "creator"
            ? "No notes yet. Whatever you write on the Notes tab shows up here."
            : "Nothing shared yet."}
        </OverviewEmpty>
      ) : (
        <ul>
          {recent.map((note) => (
            <li
              key={note.id}
              className="relative flex gap-2.5 border-t border-hairline px-card py-3 transition-control first:border-t-0 hover:bg-surface-raised has-[a[data-card-link]:focus-visible]:ring-focus"
            >
              <Icon name="scroll-text" size={14} className="mt-0.5 shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                <div className="text-body-s leading-snug font-medium text-heading">
                  {audience === "creator" ? (
                    <Link
                      to="/campaigns/$campaignId/notes"
                      params={{ campaignId }}
                      search={{ note: note.id }}
                      data-card-link
                      className={cardLinkClassName}
                    >
                      {note.title}
                    </Link>
                  ) : (
                    <a
                      href={`#${sharedNoteAnchor(note.id)}`}
                      data-card-link
                      className={cardLinkClassName}
                    >
                      {note.title}
                    </a>
                  )}
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
