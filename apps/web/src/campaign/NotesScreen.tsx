import type { Note } from "@taverns/api";
import { useParams } from "@tanstack/react-router";
import { Button, Icon, Input } from "@taverns/ui";
import { useState } from "react";
import { EmptyState } from "../ui/states";
import { CampaignChrome } from "./CampaignChrome";
import { matches } from "./load";
import { NoteDialog } from "./NoteDialog";
import { NotesList } from "./NotesList";

/**
 * Read-aloud text, secrets and loose ends — `CampaignScreens.jsx`'s `CampNotes`.
 *
 * The campaign screen's second tab, given the URL the delivery's second nav row
 * implies. It is the same shape as `EncountersScreen` and for the same reasons:
 * the search term and the open dialog are held above `CampaignChrome` because
 * the top bar sets them and the body reads them, and the filter is client-side
 * over what the frame already loaded.
 *
 * The delivery's own subtitle is kept verbatim — it is the sentence that says
 * what a note is for, which is the one thing an empty Notes screen most needs.
 */
export function NotesScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ readonly note: Note | undefined }>();

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Notes"
      subtitle={() => "Read-aloud text, secrets and loose ends"}
      actions={() => (
        <>
          <Input
            aria-label="Search notes"
            placeholder="Search notes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-control-sm w-44"
          />
          <Button variant="secondary" size="sm" onClick={() => setEditing({ note: undefined })}>
            <Icon name="plus" size={14} />
            New note
          </Button>
        </>
      )}
    >
      {({ view }) => {
        const shown = view.notes.filter((note) => matches(search, note.title, note.body));

        return (
          <>
            {view.notes.length === 0 ? (
              <EmptyState icon="scroll-text" title="No notes yet">
                The thing you meant to remember when the party opens the crate goes here. Read-aloud
                prose too — start one with <span className="text-heading">New note</span> above.
              </EmptyState>
            ) : shown.length === 0 ? (
              <EmptyState icon="search" title="Nothing matches">
                Nothing here answers to &ldquo;{search.trim()}&rdquo;. Loosen the search, or clear
                it.
              </EmptyState>
            ) : (
              <NotesList
                notes={shown}
                encounters={view.encounters}
                onEdit={(note) => setEditing({ note })}
              />
            )}

            {editing !== undefined && (
              <NoteDialog
                key={editing.note?.id ?? "new-note"}
                campaignId={view.campaign.id}
                note={editing.note}
                encounters={view.encounters}
                onClose={() => setEditing(undefined)}
                onSaved={() => setEditing(undefined)}
              />
            )}
          </>
        );
      }}
    </CampaignChrome>
  );
}
