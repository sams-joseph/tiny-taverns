import type { Character } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea } from "../ui/form";
import { ownCharacterWrites, saveOwnCharacter, sheetWith } from "./write";

/**
 * The backstory — `sheet.notes`, and the drawing's own *Edit* on the Story tab.
 *
 * **One key of the document, sent as the whole document.** `sheetWith` is where
 * that rule and the race it accepts are written down; what matters here is the
 * half it *does* prevent, which is that a form sending only `notes` would erase
 * every ability, skill, spell and feature it was never shown.
 *
 * There is no second `backstory` key and there must not be one: `0012` put this
 * prose in `notes` and a key beside it would be two places to look for one
 * paragraph. The four lines the Story tab draws next to it — personality,
 * ideal, bond, flaw — are `sheet.story` and are still read-only; they are not
 * this dialog's, and folding them in would make *Edit backstory* a control that
 * saves four other things.
 *
 * **A blank paragraph is a real answer**, so the box may be emptied and saved:
 * `notes` is a required key of the document with `""` as its own empty value,
 * unlike the nullable columns next door. What that costs is that the Story tab
 * still exists afterwards with nothing in it, which is correct — on a writable
 * sheet the tab is the place to write, not the proof something is written.
 */
export function BackstoryDialog({
  character,
  onClose,
  onSaved,
}: {
  readonly character: Character;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [notes, setNotes] = useState(character.sheet.notes);
  const { busy, failure, submit } = useMutation();

  const save = async () => {
    const saved = await submit(
      (client) =>
        saveOwnCharacter(client, character, {
          sheet: sheetWith(character, { notes: notes.trim() }),
        }),
      ownCharacterWrites(character),
    );
    if (Result.isSuccess(saved)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Edit your backstory">
        <DialogHeader>
          <DialogTitle>Backstory</DialogTitle>
          <DialogDescription>
            Where they came from, what they are afraid of, who they owe. A blank line between
            paragraphs.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <Field
            label="Backstory"
            htmlFor="own-backstory"
            /* Said where it is asked rather than in a settings screen nobody
               opens: the document is indexed at weight C in the campaign's
               search (`repo/Search.ts`), so a DM searching their own record
               finds what is typed here. That is mostly the point, and it is not
               a thing to discover afterwards. */
            hint="Your DM can read this, and it turns up in their campaign search."
          >
            <Textarea
              id="own-backstory"
              className="min-h-48"
              placeholder="The temple on the salt road takes in what the road leaves behind."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>

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
            {busy ? "Saving…" : "Save backstory"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
