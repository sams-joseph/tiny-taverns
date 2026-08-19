import type { CampaignId, Encounter, EncounterId, Note, NoteKind, Visibility } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea, VisibilityField } from "../ui/form";

/**
 * Writing a note, in either of the two registers the product has.
 *
 * `read_aloud` is a *kind* on the one `note` table, not a second thing
 * (`Note.ts`), so this is one form with a two-item select rather than two
 * dialogs that would each need their own visibility rule to get wrong.
 *
 * ### The attachment is a union, and is written as one
 *
 * On the wire it is `attachedTo: { kind, id } | null`, and `kind` is a closed
 * set with exactly one member today. The select therefore maps to
 * `{ kind: "encounter", id }` rather than to a bare id — when `creature` joins
 * the union (`Note.ts` says it needs a repository-side check first, because a
 * creature may be global and so cannot be named in the composite key that keeps
 * `encounter_id` honest) this grows a second group of options and nothing else.
 *
 * On update, `attachedTo: null` **detaches** and omitting the field leaves it
 * alone. This form always sends it, because the select always has an answer —
 * "Nothing" is a choice a DM makes, not a field they failed to fill in.
 */

/** The one option that is not an encounter. */
const UNATTACHED = "";

const KINDS: ReadonlyArray<{ readonly value: NoteKind; readonly label: string }> = [
  { value: "note", label: "Note" },
  { value: "read_aloud", label: "Read aloud" },
];

export function NoteDialog({
  campaignId,
  note,
  encounters,
  onClose,
  onSaved,
}: {
  readonly campaignId: CampaignId;
  /** Absent for a new one. Present, and this edits it. */
  readonly note: Note | undefined;
  /** Everything attachable, already loaded by the screen. */
  readonly encounters: ReadonlyArray<Encounter>;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [kind, setKind] = useState<string>(note?.kind ?? "note");
  const [attached, setAttached] = useState<string>(note?.attachedTo?.id ?? UNATTACHED);
  // `dm` for a new note: the column default, and the only safe one to fail to.
  const [visibility, setVisibility] = useState<Visibility>(note?.visibility ?? "dm");
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();

  const problem = title.trim() === "" ? "Give it a title." : undefined;

  const save = async () => {
    setShowProblems(true);
    if (problem !== undefined) return;

    const attachedTo =
      attached === UNATTACHED ? null : { kind: "encounter" as const, id: attached as EncounterId };
    const payload = {
      title: title.trim(),
      body,
      kind: kind as NoteKind,
      visibility,
    };

    const saved = await submit(
      (client) =>
        note === undefined
          ? client.notes.create({
              params: { campaignId },
              // `NoteCreate.attachedTo` is `optional(NoteAttachment)` and takes no
              // null: a note that is attached to nothing simply does not say so.
              payload: attachedTo === null ? payload : { ...payload, attachedTo },
            })
          : client.notes.update({
              params: { campaignId, noteId: note.id },
              payload: { ...payload, attachedTo },
            }),
      // The notes, and nothing else — **including when the attachment moves.**
      // An encounter card's *"· 1 note"* is counted in the browser over this
      // list, so the card redraws because the notes did; the encounter row
      // itself never carried the number and does not have to be re-read.
      [reads.notes(campaignId)],
    );

    if (Result.isSuccess(saved)) onSaved();
  };

  const readAloud = kind === "read_aloud";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={note === undefined ? "New note" : "Edit note"}>
        <DialogHeader>
          <DialogTitle>{note === undefined ? "New note" : "Edit note"}</DialogTitle>
          <DialogDescription>
            The thing you meant to remember when the party opens the crate. Read-aloud prose too.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <Field label="Title" htmlFor="note-title" error={showProblems ? problem : undefined}>
            <Input
              id="note-title"
              placeholder="Read aloud at the water"
              value={title}
              aria-invalid={showProblems && problem !== undefined}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          <Field
            label="Kind"
            htmlFor="note-kind"
            hint={
              readAloud
                ? "Set in the prose face, for reading out at the table."
                : "Your own words, in the interface face."
            }
          >
            <Select value={kind} onValueChange={(value) => setKind(String(value))}>
              <SelectTrigger id="note-kind">
                {/* Written here rather than left to Base UI: `Select.Value`
                    with neither `items` nor children serialises the *value*,
                    which would put `read_aloud` on screen. */}
                <SelectValue>
                  {(value) => KINDS.find((entry) => entry.value === value)?.label ?? "Note"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={readAloud ? "What you read out" : "Body"} htmlFor="note-body">
            <Textarea
              id="note-body"
              placeholder="The reeds are taller than you are and they are not moving."
              value={body}
              className={readAloud ? "font-serif text-body-l leading-loose italic" : undefined}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>

          <Field
            label="Attached to"
            htmlFor="note-attachment"
            hint="An attached note travels with its encounter, and is counted on its card."
          >
            <Select value={attached} onValueChange={(value) => setAttached(String(value))}>
              <SelectTrigger id="note-attachment">
                {/* Same reason again, and the loudest case: the value here is a
                    uuid, so without this the trigger reads out a raw id. */}
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
          </Field>

          <VisibilityField
            id="note-visibility"
            value={visibility}
            onChange={setVisibility}
            shared="Your players can read this, word for word."
            hidden="Only you can read this."
          />
        </div>

        {/* In the footer, not at the end of the body — see `EncounterDialog`. */}
        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : note === undefined ? "Create note" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
