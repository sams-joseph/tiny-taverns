import type { CampaignId, Encounter, Note, NoteId } from "@taverns/api";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  Button,
  EMPTY_FILTER_VALUE,
  EmptyState,
  FilterInput,
  type FilterInputValue,
  Icon,
} from "@taverns/ui";
import { Result } from "effect";
import { useRef, useState } from "react";
import { reads } from "../api/keys";
import type { ApiFailure } from "../api/failure";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { CampaignChrome } from "./CampaignChrome";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { matches } from "./load";
import { useNoteSavers } from "./noteAutosave";
import { NotePane } from "./NotePane";
import { NotesList } from "./NotesList";
import { newestFirst, UNTITLED } from "./noteText";

/**
 * Read-aloud text, secrets and loose ends, as the redesign draws the tab
 * (`Campaign Overview.dc.html`): a list beside the note selected, written in
 * place.
 *
 * **The page is centred at the Overview's width** (`CampaignChrome`'s
 * `centred`), header included, and scrolls with the window — the note's body
 * grows with its text rather than scrolling inside itself.
 *
 * **A row selects**, as on the Encounters tab: the selection is the URL's
 * (`?note=`), written with `replace` so picking through the list is one visit
 * and *Back* leaves the tab. With no choice, or one the search hides, the
 * first row shown is the one in the pane. The two columns are the drawing's
 * wrap, `basis-notes-list-min` up to `max-w-notes-list` beside
 * `basis-notes-pane`, stacking below 724px of content; stacked, choosing a row
 * brings the pane into view.
 *
 * **The pane saves as you type** (`noteAutosave.ts`), so *New note* makes the
 * note at once — `UNTITLED`, the DM's alone, as every new row is — and lands
 * it in the pane with its title selected. It stays `secondary`: the campaign
 * row's press is this screen's one primary.
 *
 * The search is the list's own `FilterInput`, over the title and the body, in
 * the browser over what the frame already read.
 */
export function NotesScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const navigate = useNavigate();
  const [filter, setFilter] = useState(EMPTY_FILTER_VALUE);
  /** The note *New note* just made, until the list's own read has it. */
  const [created, setCreated] = useState<Note>();
  /** The same note, until its title has been focused once. */
  const [fresh, setFresh] = useState<NoteId>();
  const { busy, failure, submit } = useMutation();

  const newNote = async () => {
    const made = await submit(
      (client) =>
        client.notes.create({
          params: { campaignId },
          payload: { title: UNTITLED, kind: "note", visibility: "dm" },
        }),
      [reads.notes(campaignId)],
    );
    if (Result.isFailure(made)) return;
    // A new note is found wherever the search was: clear it.
    setFilter(EMPTY_FILTER_VALUE);
    setCreated(made.success);
    setFresh(made.success.id);
    void navigate({
      to: "/campaigns/$campaignId/notes",
      params: { campaignId },
      search: { note: made.success.id },
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Notes"
      centred
      subtitle={({ view }) => countOf(view.notes.length + (isNew(created, view.notes) ? 1 : 0))}
      actions={() => (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void newNote()}>
          <Icon name="plus" size={14} />
          New note
        </Button>
      )}
    >
      {({ view }) => (
        <NoteBrowser
          campaignId={campaignId}
          notes={isNew(created, view.notes) ? [created, ...view.notes] : view.notes}
          encounters={view.encounters}
          fresh={fresh}
          onFreshFocused={() => setFresh(undefined)}
          onForget={(noteId) => setCreated((note) => (note?.id === noteId ? undefined : note))}
          filter={filter}
          onFilter={setFilter}
          createFailure={failure}
        />
      )}
    </CampaignChrome>
  );
}

const countOf = (count: number): string =>
  count === 0
    ? "Read-aloud text, secrets and loose ends"
    : count === 1
      ? "1 note"
      : `${String(count)} notes`;

const isNew = (created: Note | undefined, notes: ReadonlyArray<Note>): created is Note =>
  created !== undefined && !notes.some((note) => note.id === created.id);

/**
 * Whether the pane sits under the list rather than beside it. A list with no
 * height has not been laid out (or is jsdom's), and nothing is scrolled then.
 */
const stacked = (list: HTMLElement, pane: HTMLElement): boolean => {
  const above = list.getBoundingClientRect();
  return above.height > 0 && pane.getBoundingClientRect().top >= above.bottom - 1;
};

const reducedMotion = (): boolean =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function NoteBrowser({
  campaignId,
  notes,
  encounters,
  fresh,
  onFreshFocused,
  onForget,
  filter,
  onFilter,
  createFailure,
}: {
  readonly campaignId: CampaignId;
  readonly notes: ReadonlyArray<Note>;
  readonly encounters: ReadonlyArray<Encounter>;
  /** The note *New note* made, whose title the pane selects. */
  readonly fresh: NoteId | undefined;
  readonly onFreshFocused: () => void;
  /** A note was deleted: whatever the screen holds of it goes. */
  readonly onForget: (noteId: NoteId) => void;
  readonly filter: FilterInputValue;
  readonly onFilter: (next: FilterInputValue) => void;
  readonly createFailure: ApiFailure | undefined;
}) {
  const chosen = useSearch({ strict: false }).note;
  const navigate = useNavigate();
  const { saverFor, forget } = useNoteSavers(campaignId);
  const [deleting, setDeleting] = useState<Note>();
  const listRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  /**
   * Whether the next pane to be drawn should be scrolled to: set by a row's
   * click and by opening on a choice, and nothing else.
   */
  const reveal = useRef(chosen !== undefined);

  const shown = newestFirst(notes).filter((note) => matches(filter.text, note.title, note.body));
  const selected = shown.find((note) => note.id === chosen) ?? shown[0];

  const choose = (noteId: NoteId | undefined) =>
    void navigate({
      to: "/campaigns/$campaignId/notes",
      params: { campaignId },
      search: noteId === undefined ? {} : { note: noteId },
      replace: true,
      resetScroll: false,
    });

  // Stacked, the pane is under the whole list: bring it into view on a choice.
  const bringPaneIntoView = () => {
    const list = listRef.current;
    const pane = paneRef.current;
    if (list === null || pane === null || !stacked(list, pane)) return;
    pane.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  };

  const revealIfChosen = () => {
    if (!reveal.current) return;
    reveal.current = false;
    bringPaneIntoView();
  };

  const search = (next: FilterInputValue) => {
    onFilter(next);
    // Keep the address honest: a choice the search hides gives way to the
    // first note it shows.
    const still = notes.find((note) => note.id === chosen);
    if (still !== undefined && !matches(next.text, still.title, still.body)) choose(undefined);
  };

  const failure = createFailure !== undefined && (
    <div className="max-w-3xl">
      <SaveFailure failure={createFailure} />
    </div>
  );

  if (notes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {failure}
        <EmptyState icon="scroll-text" title="No notes yet">
          The thing you meant to remember when the party opens the crate goes here. Read-aloud prose
          too — start one with <span className="text-heading">New note</span> above.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {failure}
      <div className="flex flex-wrap items-start gap-6">
        <div
          ref={listRef}
          data-slot="note-list"
          className="flex min-w-0 shrink grow basis-notes-list-min flex-col gap-3.5 max-w-notes-list"
        >
          <FilterInput
            label="Search notes"
            value={filter}
            onChange={search}
            facets={[]}
            className="w-full max-w-full"
          />
          {shown.length === 0 ? (
            <p className="m-0 px-3 py-7 text-center text-body-s leading-body text-muted-foreground">
              Nothing here answers to &ldquo;{filter.text.trim()}&rdquo;. Loosen the search, or
              write the note you meant to.
            </p>
          ) : (
            <NotesList
              notes={shown}
              selected={selected?.id}
              onSelect={(note) => {
                if (note.id === selected?.id) {
                  bringPaneIntoView();
                  return;
                }
                reveal.current = true;
                choose(note.id);
              }}
            />
          )}
        </div>

        {selected !== undefined && (
          <NotePane
            key={selected.id}
            note={selected}
            saver={saverFor(selected)}
            encounters={encounters}
            focusTitle={selected.id === fresh}
            onShown={() => {
              if (selected.id === fresh) onFreshFocused();
              revealIfChosen();
            }}
            paneRef={paneRef}
            onDelete={() => {
              // What is typed goes before the question does.
              void saverFor(selected).flush();
              setDeleting(selected);
            }}
          />
        )}
      </div>

      {deleting !== undefined && (
        <DeleteNoteDialog
          campaignId={campaignId}
          note={deleting}
          onDeleting={() => saverFor(deleting).stop()}
          onKept={() => saverFor(deleting).resume()}
          onClose={() => setDeleting(undefined)}
          onDeleted={() => {
            forget(deleting.id);
            onForget(deleting.id);
            setDeleting(undefined);
            choose(undefined);
          }}
        />
      )}
    </div>
  );
}
