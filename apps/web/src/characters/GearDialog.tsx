import type { Character, InventoryItem } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  Label,
  Switch,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure } from "../ui/form";
import { ownCharacterWrites, saveOwnCharacter, sheetWith } from "./write";

/**
 * What they are carrying — `sheet.inventory`, behind the Gear tab's *Add*.
 *
 * **It opens with a blank line ready to type, and it edits the whole list.**
 * The button that opens it says *Add*, which is the drawing's word and the
 * thing a player reaches for; a dialog that could only append would make the
 * first typo permanent, so the lines already there are editable and removable
 * too. That is `bestiary/CreatureForm.tsx`'s trait editor, which is this
 * repository's one worked example of editing an array inside a document, and
 * the shape is deliberately its rather than a second one.
 *
 * A line with no name is dropped rather than refused: `InventoryItem.name` is a
 * `NonEmptyString`, and an empty row is somebody who pressed *Add* and changed
 * their mind. Everything else on a line is optional, and an absent quantity is
 * absent rather than a `×1` nobody typed — the rule the coin piles already
 * follow one panel over.
 *
 * The coin itself is **not** here. `sheet.currency` is a different key with a
 * different shape and the delivery draws no control over it; a purse editor is
 * its own small decision and nothing in the drawing asks for one yet.
 */

/** A line as it is being typed: `name` may still be blank, which the wire refuses. */
interface DraftItem {
  readonly key: string;
  readonly name: string;
  readonly quantity: string;
  readonly weight: string;
  readonly note: string;
  readonly equipped: boolean;
}

const blank = (key: string): DraftItem => ({
  key,
  name: "",
  quantity: "",
  weight: "",
  note: "",
  equipped: false,
});

const draftsOf = (items: ReadonlyArray<InventoryItem>): ReadonlyArray<DraftItem> =>
  items.map((item, index) => ({
    key: `carried-${String(index)}`,
    name: item.name,
    quantity: item.quantity === undefined ? "" : String(item.quantity),
    weight: item.weight ?? "",
    note: item.note ?? "",
    equipped: item.equipped === true,
  }));

/** `""` ⇄ absent, and a fraction of an item is not a thing to carry. */
const parseCount = (raw: string): number | undefined =>
  raw.trim() === "" || !Number.isInteger(Number(raw)) ? undefined : Number(raw);

export function GearDialog({
  character,
  onClose,
  onSaved,
}: {
  readonly character: Character;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  // The blank line the *Add* button promises, appended on open rather than
  // waiting for a second press inside the dialog.
  const [items, setItems] = useState<ReadonlyArray<DraftItem>>([
    ...draftsOf(character.sheet.inventory ?? []),
    blank("new-0"),
  ]);
  const [nextKey, setNextKey] = useState(1);
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();

  const setItem = (key: string, patch: Partial<DraftItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const addItem = () => {
    setItems((current) => [...current, blank(`new-${String(nextKey)}`)]);
    setNextKey((key) => key + 1);
  };

  /**
   * A quantity that is not a whole number is the one thing said before sending.
   * The name is not a problem to report — a nameless line is a line nobody
   * filled in, and dropping it is what *Add* then *Cancel a change of mind*
   * should do.
   */
  const badCounts = items.filter(
    (item) => item.quantity.trim() !== "" && parseCount(item.quantity) === undefined,
  );

  const save = async () => {
    setShowProblems(true);
    if (badCounts.length > 0) return;

    const inventory: ReadonlyArray<InventoryItem> = items
      .filter((item) => item.name.trim() !== "")
      .map((item) => {
        const quantity = parseCount(item.quantity);
        const weight = item.weight.trim();
        const note = item.note.trim();
        return {
          name: item.name.trim(),
          ...(quantity === undefined ? {} : { quantity }),
          ...(weight === "" ? {} : { weight }),
          ...(note === "" ? {} : { note }),
          // Only when it is true: a `false` on every line would be twelve keys
          // saying nothing, and absent is what the reader already draws.
          ...(item.equipped ? { equipped: true } : {}),
        };
      });

    const saved = await submit(
      (client) =>
        saveOwnCharacter(client, character, { sheet: sheetWith(character, { inventory }) }),
      ownCharacterWrites(character),
    );
    if (Result.isSuccess(saved)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Edit your gear">
        <DialogHeader>
          <DialogTitle>What you are carrying</DialogTitle>
          <DialogDescription>
            A line per thing. Leave one blank and it is not saved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-gutter py-3">
          {items.map((item, index) => (
            <div
              key={item.key}
              className="flex flex-col gap-2.5 rounded-card bg-surface-sunken p-3"
            >
              <div className="flex flex-wrap items-end gap-2.5">
                <Field label="Item" htmlFor={`gear-name-${item.key}`}>
                  <Input
                    id={`gear-name-${item.key}`}
                    placeholder="Halberd"
                    value={item.name}
                    onChange={(event) => setItem(item.key, { name: event.target.value })}
                    className="w-56"
                  />
                </Field>
                <Field
                  label="How many"
                  htmlFor={`gear-quantity-${item.key}`}
                  error={
                    showProblems && badCounts.some((bad) => bad.key === item.key)
                      ? "A whole number."
                      : undefined
                  }
                >
                  <Input
                    id={`gear-quantity-${item.key}`}
                    mono
                    type="number"
                    min={0}
                    value={item.quantity}
                    onChange={(event) => setItem(item.key, { quantity: event.target.value })}
                    className="w-24"
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mb-0.5 ml-auto"
                  aria-label={`Remove item ${String(index + 1)}`}
                  onClick={() =>
                    setItems((current) => current.filter((entry) => entry.key !== item.key))
                  }
                >
                  <Icon name="trash-2" size={15} />
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2.5">
                <Field label="Weight" htmlFor={`gear-weight-${item.key}`}>
                  <Input
                    id={`gear-weight-${item.key}`}
                    placeholder="6 lb"
                    value={item.weight}
                    onChange={(event) => setItem(item.key, { weight: event.target.value })}
                    className="w-28"
                  />
                </Field>
                <Field
                  label="Note"
                  htmlFor={`gear-note-${item.key}`}
                  hint="Where it came from, what it is for."
                >
                  <Input
                    id={`gear-note-${item.key}`}
                    placeholder="From session 11"
                    value={item.note}
                    onChange={(event) => setItem(item.key, { note: event.target.value })}
                    className="w-48"
                  />
                </Field>
                <div className="mb-2 flex items-center gap-2.5">
                  <Switch
                    id={`gear-equipped-${item.key}`}
                    checked={item.equipped}
                    onCheckedChange={(next) => setItem(item.key, { equipped: next })}
                  />
                  <Label htmlFor={`gear-equipped-${item.key}`}>Equipped</Label>
                </div>
              </div>
            </div>
          ))}

          <div>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Icon name="plus" size={13} />
              Add another
            </Button>
          </div>
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
            {busy ? "Saving…" : "Save gear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
