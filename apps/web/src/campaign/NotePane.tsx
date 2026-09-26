import type { Encounter, EncounterId, Note } from "@taverns/api";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
  cn,
  sectionHeadingVariants,
} from "@taverns/ui";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";
import { ActionsMenu } from "../ui/ActionsMenu";
import { VisibilityField } from "../ui/form";
import type { NoteFields, NoteSaver, SaveStatus } from "./noteAutosave";
import { editedAgo, KINDS, kindLabel } from "./noteText";
import { useNow } from "./when";

/** The one option that is not an encounter. */
const UNATTACHED = "";

/**
 * One note, written in place — the drawing's pane beside the Notes list.
 *
 * **It saves as you type** (the captain's call): every edit goes to the
 * note's `NoteSaver` (`noteAutosave.ts`), which owns the draft, the debounce
 * and the one request in flight, and this component only draws the draft and
 * what the saver says about it. There is no *Save* and nothing guards leaving:
 * blurring a field, choosing another note or leaving the tab sends what is
 * unsaved.
 *
 * What it edits is today's note and nothing more: the title, the register
 * (*Note* or *Read aloud*, the drawing's toolbar toggles), the body, the one
 * encounter it is attached to, and who can see it through `VisibilityField`,
 * the product's one control for that. The drawing's category, pin and links
 * are not on the wire yet and are not drawn.
 *
 * The body grows with its text and the window scrolls: `field-sizing-content`
 * where the browser has it, its own height measured where it does not. Never
 * an inner scroller. Title and body are the drawing's borderless fields, so
 * the global focus ring is taken off them: the caret, and the title's
 * underline, say where the DM is writing.
 *
 * *Delete note* is in the actions menu and asks first (`DeleteNoteDialog`).
 */
export function NotePane({
  note,
  saver,
  encounters,
  focusTitle,
  onShown,
  paneRef,
  onDelete,
}: {
  /** The note as the server last answered it: its edited time. */
  readonly note: Note;
  readonly saver: NoteSaver;
  /** Everything attachable, already loaded by the screen. */
  readonly encounters: ReadonlyArray<Encounter>;
  /** Just made by *New note*: the title is focused and selected, ready to type over. */
  readonly focusTitle: boolean;
  /** Drawn: the screen may bring it into view. */
  readonly onShown: () => void;
  readonly paneRef: Ref<HTMLElement>;
  readonly onDelete: () => void;
}) {
  const now = useNow();
  const [draft, setDraft] = useState<NoteFields>(saver.draft);
  const status = useSyncExternalStore(saver.subscribe, saver.getStatus);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const type = (fields: Partial<NoteFields>) => {
    setDraft((current) => ({ ...current, ...fields }));
    saver.type(fields);
  };
  const set = (fields: Partial<NoteFields>) => {
    setDraft((current) => ({ ...current, ...fields }));
    void saver.set(fields);
  };

  useEffect(() => {
    if (focusTitle) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
    onShown();
    // On mount only: a note is new, and is chosen, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Choosing another note, or leaving the tab, sends what is still waiting.
  useEffect(() => () => void saver.flush(), [saver]);

  useGrowWithText(bodyRef, draft.body);

  const titleHeld = draft.title.trim() === "";
  const readAloud = draft.kind === "read_aloud";

  return (
    <article
      ref={paneRef}
      data-slot="note-pane"
      aria-label={note.title}
      className="min-w-0 shrink grow-2 basis-notes-pane scroll-mt-(--chrome-height) overflow-hidden rounded-card border border-hairline bg-surface-card shadow-1"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3.5">
        <div role="group" aria-label="Kind" className="flex flex-wrap gap-1.5">
          {KINDS.map(([value, label]) => (
            <Toggle
              key={value}
              size="sm"
              className="rounded-pill"
              pressed={draft.kind === value}
              onPressedChange={() => set({ kind: value })}
            >
              {label}
            </Toggle>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <SaveState status={status} onRetry={() => void saver.flush()} />
          <ActionsMenu
            label="Note actions"
            items={[
              { label: "Delete note", icon: "trash-2", destructive: true, onSelect: onDelete },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-6 pt-5.5 pb-2">
        <input
          ref={titleRef}
          aria-label="Title"
          placeholder="Untitled note"
          value={draft.title}
          aria-invalid={titleHeld}
          aria-describedby={titleHeld ? "note-title-held" : undefined}
          onChange={(event) => type({ title: event.target.value })}
          onBlur={() => void saver.flush()}
          className={cn(
            sectionHeadingVariants({ size: "display" }),
            "w-full min-w-0 border-0 border-b border-transparent bg-transparent p-0 outline-none placeholder:text-faint focus:border-hairline focus-visible:shadow-none",
          )}
        />
        {titleHeld && (
          <span id="note-title-held" className="text-caption leading-body text-danger-ink">
            A note needs a title. Until it has one, it keeps &ldquo;{note.title}&rdquo;.
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2 text-body-s leading-snug text-muted-foreground">
          <span>{kindLabel(draft.kind)}</span>
          <span aria-hidden="true" className="text-faint">
            ·
          </span>
          <span>{editedAgo(note, now)}</span>
        </div>
      </div>

      <div className="px-6 pt-2 pb-5">
        <textarea
          ref={bodyRef}
          aria-label={readAloud ? "What you read out" : "Body"}
          placeholder={
            readAloud
              ? "The reeds are taller than you are and they are not moving."
              : "Write it down before you forget it."
          }
          value={draft.body}
          onChange={(event) => type({ body: event.target.value })}
          onBlur={() => void saver.flush()}
          className={cn(
            "block min-h-80 w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none field-sizing-content placeholder:text-faint focus-visible:shadow-none",
            readAloud
              ? "font-serif text-body-l leading-loose text-foreground italic"
              : "font-sans text-body leading-loose text-foreground",
          )}
        />
      </div>

      <div className="flex flex-col gap-5 border-t border-hairline px-6 pt-4 pb-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note-attachment">Attached to</Label>
          <Select
            value={draft.attachedTo?.id ?? UNATTACHED}
            onValueChange={(value) =>
              set({
                attachedTo:
                  value === UNATTACHED || value === null
                    ? null
                    : { kind: "encounter", id: value as EncounterId },
              })
            }
          >
            <SelectTrigger id="note-attachment" className="max-w-sm">
              {/* Written here rather than left to Base UI: the value is a uuid,
                  and without this the trigger reads out a raw id. */}
              <SelectValue>
                {(value) =>
                  encounters.find((encounter) => encounter.id === value)?.name ?? "Nothing"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNATTACHED}>Nothing</SelectItem>
              {encounters.map((encounter) => (
                <SelectItem key={encounter.id} value={encounter.id}>
                  {encounter.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-caption leading-body text-muted-foreground">
            An attached note travels with its encounter, and is counted on its card.
          </span>
        </div>

        <VisibilityField
          id="note-visibility"
          value={draft.visibility}
          onChange={(visibility) => set({ visibility })}
          shared="Your players can read this, word for word."
          hidden="Only you can read this."
        />
      </div>
    </article>
  );
}

/**
 * *Saving…*, *Saved*, or *Couldn't save* with a way to try again — quiet,
 * beside the actions, and announced politely rather than as an alert, since
 * it changes every time the DM stops typing.
 */
function SaveState({
  status,
  onRetry,
}: {
  readonly status: SaveStatus;
  readonly onRetry: () => void;
}) {
  return (
    <span
      role="status"
      data-slot="note-save-state"
      className="flex items-center gap-2 text-caption leading-none text-faint"
    >
      {status.state === "saving" && "Saving…"}
      {status.state === "saved" && "Saved"}
      {status.state === "failed" && (
        <>
          <span className="text-danger-ink">Couldn&rsquo;t save</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </>
      )}
    </span>
  );
}

const sizesToContent = (): boolean =>
  globalThis.CSS?.supports?.("field-sizing", "content") ?? false;

/**
 * Where `field-sizing: content` is missing, the textarea is given the height
 * of its text after each change, so it still grows with the page instead of
 * scrolling inside itself.
 */
const useGrowWithText = (ref: { readonly current: HTMLTextAreaElement | null }, text: string) => {
  useLayoutEffect(() => {
    const area = ref.current;
    if (area === null || sizesToContent()) return;
    area.style.height = "auto";
    area.style.height = `${String(area.scrollHeight)}px`;
  }, [ref, text]);
};
