import type { CampaignId, Encounter, Note, NoteCategory, NoteId, PartySeat } from "@taverns/api";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  Button,
  EMPTY_FILTER_VALUE,
  EmptyState,
  FilterInput,
  type FilterInputValue,
  Icon,
  Toggle,
} from "@taverns/ui";
import { DateTime, Result } from "effect";
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
import { CATEGORIES, pinnedFirst, UNTITLED } from "./noteText";

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
 * The list is filtered by the search, the list's own `FilterInput` over the
 * title and the body, AND one category pill (*All* by default), both in the
 * browser over what the frame already read: the Notes exception to the
 * one-filter rule (`docs/internals/web-screens.md`). Pinned notes lead.
 *
 * **A pin is its own press**, not a field the autosave carries: it goes to the
 * pin endpoints at once and leaves the note's edited time alone. The list and
 * the header's count follow the press before the server answers
 * (`usePins`), and fall back if it refuses.
 */
export function NotesScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const navigate = useNavigate();
  const [filter, setFilter] = useState(EMPTY_FILTER_VALUE);
  const [category, setCategory] = useState<CategoryFilter>(ALL);
  /** The note *New note* just made, until the list's own read has it. */
  const [created, setCreated] = useState<Note>();
  /** The same note, until its title has been focused once. */
  const [fresh, setFresh] = useState<NoteId>();
  const { busy, failure, submit } = useMutation();
  const pins = usePins(campaignId);

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
    // A new note is found wherever the search was: clear it, and the pill.
    setFilter(EMPTY_FILTER_VALUE);
    setCategory(ALL);
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
      subtitle={({ view }) => countOf(pins.over(withCreated(created, view.notes)))}
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
          notes={pins.over(withCreated(created, view.notes))}
          encounters={view.encounters}
          party={view.party}
          fresh={fresh}
          onFreshFocused={() => setFresh(undefined)}
          onForget={(noteId) => setCreated((note) => (note?.id === noteId ? undefined : note))}
          filter={filter}
          onFilter={setFilter}
          category={category}
          onCategory={setCategory}
          onPin={(noteId, pin) => {
            const framed = withCreated(created, view.notes).find((note) => note.id === noteId);
            if (framed !== undefined) void pins.press(framed, pin);
          }}
          pinning={pins.busy}
          failure={failure ?? pins.failure}
        />
      )}
    </CampaignChrome>
  );
}

/** *All*, or one category: the list's pills. */
const ALL = "all";
type CategoryFilter = NoteCategory | typeof ALL;

const PILLS: ReadonlyArray<readonly [CategoryFilter, string]> = [
  [ALL, "All"],
  ...CATEGORIES.map(({ value, plural }) => [value, plural] as const),
];

const inCategory = (note: Note, category: CategoryFilter): boolean =>
  category === ALL || note.category === category;

/** *4 notes*, *4 notes · 2 pinned*: every note, whatever the filter shows. */
const countOf = (notes: ReadonlyArray<Note>): string => {
  if (notes.length === 0) return "Read-aloud text, secrets and loose ends";
  const count = notes.length === 1 ? "1 note" : `${String(notes.length)} notes`;
  const pinned = notes.filter((note) => note.pinnedAt !== null).length;
  return pinned === 0 ? count : `${count} · ${String(pinned)} pinned`;
};

/** The frame's notes, and the one *New note* made until the frame has it. */
const withCreated = (created: Note | undefined, notes: ReadonlyArray<Note>): ReadonlyArray<Note> =>
  created !== undefined && !notes.some((note) => note.id === created.id)
    ? [created, ...notes]
    : notes;

/**
 * The pins pressed on this visit, laid over the frame's notes until its read
 * catches up: a pinned row jumps up the list on the press, not a round trip
 * later. Each press remembers whether the frame had the note pinned when it
 * was made, and stops applying once the frame says otherwise — that is the
 * frame's read agreeing. A refused press drops its entry, so the row goes back
 * and the failure is said. One press at a time (`busy`), so an answer never
 * lands over a later press. The write names `reads.notes` and nothing else.
 */
const usePins = (campaignId: CampaignId) => {
  const { busy, failure, submit } = useMutation();
  const [pressed, setPressed] = useState<
    ReadonlyMap<NoteId, { readonly pinnedAt: Note["pinnedAt"]; readonly wasPinned: boolean }>
  >(new Map());

  /** `framed` is the note as the frame holds it, under no press. */
  const settle = (framed: Note, pinnedAt?: Note["pinnedAt"]) =>
    setPressed((current) => {
      const next = new Map(current);
      if (pinnedAt === undefined) next.delete(framed.id);
      else next.set(framed.id, { pinnedAt, wasPinned: framed.pinnedAt !== null });
      return next;
    });

  const press = async (framed: Note, pin: boolean) => {
    settle(framed, pin ? DateTime.nowUnsafe() : null);
    const params = { campaignId, noteId: framed.id };
    const done = await submit(
      (client) => (pin ? client.notes.pin({ params }) : client.notes.unpin({ params })),
      [reads.notes(campaignId)],
    );
    if (Result.isFailure(done)) settle(framed);
    else settle(framed, done.success.pinnedAt);
  };

  const over = (notes: ReadonlyArray<Note>): ReadonlyArray<Note> =>
    pressed.size === 0
      ? notes
      : notes.map((note) => {
          const press = pressed.get(note.id);
          return press === undefined || press.wasPinned !== (note.pinnedAt !== null)
            ? note
            : { ...note, pinnedAt: press.pinnedAt };
        });

  return { press, over, busy, failure };
};

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
  party,
  fresh,
  onFreshFocused,
  onForget,
  filter,
  onFilter,
  category,
  onCategory,
  onPin,
  pinning,
  failure: saveFailure,
}: {
  readonly campaignId: CampaignId;
  readonly notes: ReadonlyArray<Note>;
  readonly encounters: ReadonlyArray<Encounter>;
  readonly party: ReadonlyArray<PartySeat>;
  /** The note *New note* made, whose title the pane selects. */
  readonly fresh: NoteId | undefined;
  readonly onFreshFocused: () => void;
  /** A note was deleted: whatever the screen holds of it goes. */
  readonly onForget: (noteId: NoteId) => void;
  readonly filter: FilterInputValue;
  readonly onFilter: (next: FilterInputValue) => void;
  readonly category: CategoryFilter;
  readonly onCategory: (next: CategoryFilter) => void;
  readonly onPin: (noteId: NoteId, pin: boolean) => void;
  /** A pin is on its way: the pane's *Pin* waits for it. */
  readonly pinning: boolean;
  /** *New note* or a pin was refused. */
  readonly failure: ApiFailure | undefined;
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

  const shown = pinnedFirst(notes).filter(
    (note) => inCategory(note, category) && matches(filter.text, note.title, note.body),
  );
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

  // Keep the address honest: a choice the search or the pill hides gives way
  // to the first note they show.
  const dropHidden = (text: string, pill: CategoryFilter) => {
    const still = notes.find((note) => note.id === chosen);
    if (still !== undefined && !(inCategory(still, pill) && matches(text, still.title, still.body)))
      choose(undefined);
  };

  const search = (next: FilterInputValue) => {
    onFilter(next);
    dropHidden(next.text, category);
  };

  const pick = (next: CategoryFilter) => {
    onCategory(next);
    dropHidden(filter.text, next);
  };

  const failure = saveFailure !== undefined && (
    <div className="max-w-3xl">
      <SaveFailure failure={saveFailure} />
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
          <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
            {PILLS.map(([value, label]) => (
              <Toggle
                key={value}
                size="sm"
                className="rounded-pill"
                pressed={category === value}
                onPressedChange={() => pick(value)}
              >
                {label}
              </Toggle>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="m-0 px-3 py-7 text-center text-body-s leading-body text-muted-foreground">
              Nothing matches. Loosen a filter, or write the note you meant to.
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
            party={party}
            focusTitle={selected.id === fresh}
            onShown={() => {
              if (selected.id === fresh) onFreshFocused();
              revealIfChosen();
            }}
            paneRef={paneRef}
            pinning={pinning}
            onPin={(pin) => onPin(selected.id, pin)}
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
