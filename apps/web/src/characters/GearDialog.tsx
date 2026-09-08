import type { Equipment, EquipmentId, InventoryItem, OwnedCharacter } from "@taverns/api";
import { gearLineFor, kitEquipmentOf, sheetWithGear } from "@taverns/api";
import {
  Badge,
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
import { EquipmentPicker } from "./EquipmentPicker";
import { ownCharacterWrites, saveOwnCharacter } from "./write";

/**
 * What they are carrying — `sheet.inventory`, behind the Gear section's *Add*.
 *
 * **It opens with a blank line ready to type, and it edits the whole list.**
 * The button that opens it says *Add*, which is the drawing's word and the
 * thing a player reaches for; a dialog that could only append would make the
 * first typo permanent, so the lines already there are editable and removable
 * too. That is `bestiary/CreatureForm.tsx`'s trait editor, which is this
 * repository's one worked example of editing an array inside a document, and
 * the shape is deliberately its rather than a second one.
 *
 * **Since 2026-09-08 a line can be picked from the equipment catalogue as well
 * as typed.** The captain's report was that a character's gear was not
 * connected to the equipment table; the starting kit already was (every kit
 * line names its row), and this dialog was the one place a line came from
 * with no way to name one. `EquipmentPicker` is the search-and-pick over the
 * owner's Library shelf — the bundle plus their own originals, the same read
 * and the same facets the Library's equipment tab uses — and a pick writes a
 * line with the row's name, its weight and its `equipmentId`, through
 * `gearLineFor`. Quantity, note and equipped stay the player's; **renaming a
 * linked line keeps the link**, because the id is provenance the way the kit's
 * is, not a claim about the text. A free-text line is still a free-text line.
 *
 * **A weapon picked here gets its attack, and a weapon removed loses it** —
 * `sheetWithGear` on save, which derives the line through the kit's own
 * `weaponAttack` (the 2014 ability and proficiency rule, once) and retires
 * the derived attack of a link that left the list. The rows it needs are the
 * ones picked in this dialog plus the ones the sheet already loaded for its
 * linked lines (`rows`); a line whose row is out of reach keeps what it had.
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
  /**
   * The row the line names — carried through untouched on a kit line, written
   * by a pick here. The form draws it as a badge and never edits it: a save
   * that dropped it would cut the weapon attack on `actions` off from the line
   * it was derived from.
   */
  readonly equipmentId: InventoryItem["equipmentId"];
}

const blank = (key: string): DraftItem => ({
  key,
  name: "",
  quantity: "",
  weight: "",
  note: "",
  equipped: false,
  equipmentId: undefined,
});

const draftOf = (key: string, item: InventoryItem): DraftItem => ({
  key,
  name: item.name,
  quantity: item.quantity === undefined ? "" : String(item.quantity),
  weight: item.weight ?? "",
  note: item.note ?? "",
  equipped: item.equipped === true,
  equipmentId: item.equipmentId,
});

const draftsOf = (items: ReadonlyArray<InventoryItem>): ReadonlyArray<DraftItem> =>
  items.map((item, index) => draftOf(`carried-${String(index)}`, item));

/** `""` ⇄ absent, and a fraction of an item is not a thing to carry. */
const parseCount = (raw: string): number | undefined =>
  raw.trim() === "" || !Number.isInteger(Number(raw)) ? undefined : Number(raw);

const isBlank = (item: DraftItem): boolean =>
  item.name.trim() === "" && item.equipmentId === undefined;

export function GearDialog({
  owned,
  rows,
  onClose,
  onSaved,
  onReload,
}: {
  /**
   * The character with its seats — the seats are the write's blast radius
   * (`ownCharacterWrites` names one party per seat), and the character no
   * longer names a campaign on its own.
   */
  readonly owned: OwnedCharacter;
  /**
   * The equipment rows the sheet's linked lines name, as the sheet already
   * loaded them — what a weapon on the list derives its attack from if it has
   * none yet, and what names the row on a linked line's badge.
   */
  readonly rows: ReadonlyArray<Equipment>;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  /** Re-read the sheet after a stale-version refusal; see `SaveFailure`. */
  readonly onReload?: () => void;
}) {
  const character = owned.character;
  // The blank line the *Add* button promises, appended on open rather than
  // waiting for a second press inside the dialog.
  const [items, setItems] = useState<ReadonlyArray<DraftItem>>([
    ...draftsOf(character.sheet.inventory ?? []),
    blank("new-0"),
  ]);
  const [nextKey, setNextKey] = useState(1);
  const [showProblems, setShowProblems] = useState(false);
  const [picking, setPicking] = useState(false);
  /** The rows picked in this dialog, kept whole for the save's derivation. */
  const [picked, setPicked] = useState<ReadonlyMap<EquipmentId, Equipment>>(new Map());
  const known = new Map<EquipmentId, Equipment>([
    ...rows.map((row) => [row.id, row] as const),
    ...picked,
  ]);

  const { busy, failure, submit } = useMutation();

  const setItem = (key: string, patch: Partial<DraftItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const addItem = () => {
    setItems((current) => [...current, blank(`new-${String(nextKey)}`)]);
    setNextKey((key) => key + 1);
  };

  /**
   * A pick lands as a linked line — in place of the trailing blank when that
   * is what is waiting, so the list does not grow an empty row under every
   * pick — with the row kept for the attack derivation on save.
   */
  const pickRow = (row: Equipment) => {
    const key = `picked-${String(nextKey)}`;
    setNextKey((n) => n + 1);
    setPicked((current) => new Map(current).set(row.id, row));
    setItems((current) => {
      const last = current[current.length - 1];
      const line = draftOf(key, gearLineFor(row));
      return last !== undefined && isBlank(last)
        ? [...current.slice(0, -1), line, last]
        : [...current, line];
    });
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
          ...(item.equipmentId === undefined ? {} : { equipmentId: item.equipmentId }),
        };
      });

    const saved = await submit(
      (client) =>
        saveOwnCharacter(client, character, {
          sheet: sheetWithGear(character.sheet, inventory, [...known.values()].map(kitEquipmentOf)),
        }),
      ownCharacterWrites(owned),
    );
    if (Result.isSuccess(saved)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Edit your gear" className="@container">
        <DialogHeader>
          <DialogTitle>What you are carrying</DialogTitle>
          <DialogDescription>
            Pick from the catalogue, or type a line. Leave one blank and it is not saved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-gutter py-3">
          {/* The catalogue, behind one press: a search box and a list is most
              of a dialog on its own, and a player who came to tick *equipped*
              on the halberd should not have to scroll past it. */}
          <div className="flex flex-col gap-2">
            <div>
              <Button
                variant="outline"
                size="sm"
                aria-expanded={picking}
                onClick={() => setPicking((open) => !open)}
              >
                <Icon name={picking ? "chevron-up" : "search"} size={13} />
                {picking ? "Hide the catalogue" : "Pick from the catalogue"}
              </Button>
            </div>
            {picking && <EquipmentPicker onPick={pickRow} />}
          </div>

          {items.map((item, index) => {
            const row =
              item.equipmentId === undefined || item.equipmentId === null
                ? undefined
                : known.get(item.equipmentId);
            return (
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
                {item.equipmentId !== undefined && item.equipmentId !== null && (
                  /* The link, said out loud so a renamed line is legibly still
                     the row it came from. Not a control: the id is provenance,
                     and removing the line is how it is let go of. */
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      <Icon name="link" size={11} />
                      {row === undefined ? "Linked to the catalogue" : `Linked to ${row.name}`}
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}

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
              <SaveFailure failure={failure} onReload={onReload} />
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
