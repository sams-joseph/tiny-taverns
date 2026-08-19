import type { Creature, StatBlock, Trait } from "@taverns/api";
import { emptyStatBlock } from "@taverns/api";
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
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea } from "../ui/form";

/**
 * Writing a monster — **the thing the Library is for.**
 *
 * The captain's model puts authoring here and nowhere else: creating a creature
 * is not an act inside a campaign, and using one in a campaign copies it in. So
 * this form names no campaign, sends `CreatureLibraryCreate` /
 * `CreatureLibraryUpdate`, and is the only authoring surface over `creature` in
 * the product.
 *
 * **It is not a second `CreatureDialog`.** That component is the *reader* — the
 * stat block a DM opens at the table — and this is the editor; they are opened
 * from two different buttons on the same card rather than one from inside the
 * other, because a form launched from a dialog is a modal over a modal, which
 * the design system forbids (`CombatantDialog` records the same rule for its
 * removal button).
 *
 * ### A creature has two halves and this writes both
 *
 * The columns — name, size, type, CR, AC, HP, environments — are what filters
 * and sorts. The document is what a DM reads: `"17 (chain shirt, shield)"`
 * against `17`. Neither derives from the other (`Creature.ts`), so a form that
 * wrote only the columns would author a creature with no stat block, and one
 * that wrote only the document would author one the search and the sort cannot
 * see. Both are here, and the five document lines sit under the columns they
 * elaborate so the relationship is visible while typing.
 *
 * ### What it deliberately does not write
 *
 * - **Ability cells** (`statBlock.abilities`). Six cells of three fields each is
 *   its own control, and no delivery has drawn one. They are **preserved
 *   verbatim** on edit — the same rule `CharacterDialog` follows for the sheet
 *   keys it is not shown — so a creature imported or written elsewhere does not
 *   lose them to an edit here. A creature *created* here therefore has none, and
 *   that is a real gap rather than a decision; it is reported in `AGENTS.md`.
 * - **`visibility`.** `CreatureLibraryCreate` has no field for it and the
 *   absence is the contract's own decision: visibility says which of a
 *   campaign's players may read a row, a Library entity is in no campaign, and
 *   the copy `derive` makes takes the column default rather than inheriting one.
 *   A control here would reach nothing.
 * - **`origin`.** No payload in the product carries it. Provenance is the
 *   server's to state.
 *
 * ### Delete lives in here
 *
 * One dialog, one destructive button, no second confirmation — `CombatantDialog`
 * again: *"a modal over a modal, which the design system forbids and which
 * nobody reads anyway"*. What the line beside it says is the part that matters,
 * and it is the captain's decision of 2026-08-14 rendered rather than hidden:
 * **deleting an original leaves its copies standing.** A DM who expects the
 * monster to vanish from three campaigns would otherwise find out by looking.
 */

/** `Creature.ts`'s own bounds, said in a sentence before the schema says it in a type. */
const MAX_AC = 40;
const MAX_HP = 10_000;

const parseWhole = (raw: string): number | undefined =>
  raw.trim() === "" || !Number.isInteger(Number(raw)) ? undefined : Number(raw);

/** `"Marsh, River"` ⇄ `["Marsh", "River"]`, the same shape `EncounterDialog` gives tags. */
const parseList = (raw: string): ReadonlyArray<string> =>
  raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

/** A trait as it is being typed: `name` may still be blank, which the wire refuses. */
interface DraftTrait {
  readonly key: string;
  readonly name: string;
  readonly text: string;
  readonly dice: string;
}

const draftsOf = (traits: ReadonlyArray<Trait>): ReadonlyArray<DraftTrait> =>
  traits.map((trait, index) => ({
    key: `existing-${String(index)}`,
    name: trait.name,
    text: trait.text,
    dice: trait.dice ?? "",
  }));

export function CreatureForm({
  creature,
  onClose,
  onSaved,
}: {
  /** Absent for a new one. Present, and this edits it. */
  readonly creature: Creature | undefined;
  readonly onClose: () => void;
  /** Re-reads the list: a new, edited or deleted row changes its shape. */
  readonly onSaved: () => void;
}) {
  const block = creature?.statBlock ?? emptyStatBlock;

  const [name, setName] = useState(creature?.name ?? "");
  const [size, setSize] = useState(creature?.size ?? "");
  const [type, setType] = useState(creature?.type ?? "");
  const [cr, setCr] = useState(creature?.cr ?? "");
  const [acText, setAcText] = useState(creature === undefined ? "" : String(creature.ac));
  const [hpText, setHpText] = useState(creature === undefined ? "" : String(creature.hp));
  const [environments, setEnvironments] = useState((creature?.environments ?? []).join(", "));
  const [meta, setMeta] = useState(block.meta);
  const [acLine, setAcLine] = useState(block.ac);
  const [hpLine, setHpLine] = useState(block.hp);
  const [speed, setSpeed] = useState(block.speed);
  const [crLine, setCrLine] = useState(block.cr);
  const [traits, setTraits] = useState<ReadonlyArray<DraftTrait>>(draftsOf(block.traits));
  const [nextKey, setNextKey] = useState(0);
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();

  const ac = parseWhole(acText);
  const hp = parseWhole(hpText);

  /**
   * What the DM is told before anything is sent.
   *
   * The contract catches all of it anyway — the derived client encodes through
   * the schema the handler decodes with, so a bad payload fails locally and
   * never reaches the network — but `Expected a value between 0 and 40 at
   * ["ac"]` is a sentence for whoever wrote the schema. `SaveFailure` is the
   * backstop.
   */
  const problems: { name?: string; type?: string; cr?: string; ac?: string; hp?: string } = {};
  if (name.trim() === "") problems.name = "Give it a name.";
  if (type.trim() === "") problems.type = "Humanoid, Beast, Undead — whatever it is.";
  // Required rather than optional, because every card renders `CR {cr}`. `"—"`
  // is a rating, which is why this is a string and not a number.
  if (cr.trim() === "") problems.cr = "A rating. Use — if it has none.";
  if (ac === undefined) problems.ac = "An armour class is a whole number.";
  else if (ac < 0 || ac > MAX_AC) problems.ac = `Between 0 and ${String(MAX_AC)}.`;
  if (hp === undefined) problems.hp = "Hit points are a whole number.";
  else if (hp < 0 || hp > MAX_HP) problems.hp = `Between 0 and ${MAX_HP.toLocaleString("en")}.`;
  const refused = Object.keys(problems).length > 0;

  const addTrait = () => {
    setTraits((current) => [
      ...current,
      { key: `new-${String(nextKey)}`, name: "", text: "", dice: "" },
    ]);
    setNextKey((key) => key + 1);
  };

  const setTrait = (key: string, patch: Partial<DraftTrait>) =>
    setTraits((current) =>
      current.map((trait) => (trait.key === key ? { ...trait, ...patch } : trait)),
    );

  const save = async () => {
    setShowProblems(true);
    if (refused || ac === undefined || hp === undefined) return;

    const trimmedSize = size.trim();
    const list = parseList(environments);
    // The whole document, with the parts this form shows replaced and the
    // abilities it does not show carried through untouched. A payload that sent
    // only what is on screen would erase ability cells the form never drew.
    const statBlock: StatBlock = {
      ...block,
      meta: meta.trim(),
      ac: acLine.trim(),
      hp: hpLine.trim(),
      speed: speed.trim(),
      cr: crLine.trim(),
      // A trait with no name cannot be saved (`Schema.NonEmptyString`), and an
      // empty row is somebody who pressed *Add a trait* and changed their mind
      // — dropped rather than refused.
      traits: traits
        .filter((trait) => trait.name.trim() !== "")
        .map((trait) => ({
          name: trait.name.trim(),
          text: trait.text.trim(),
          ...(trait.dice.trim() === "" ? {} : { dice: trait.dice.trim() }),
        })),
    };

    const saved = await submit(
      (client) =>
        creature === undefined
          ? client.library.create({
              payload: {
                name: name.trim(),
                ...(trimmedSize === "" ? {} : { size: trimmedSize }),
                type: type.trim(),
                cr: cr.trim(),
                ac,
                hp,
                ...(list.length === 0 ? {} : { environments: list }),
                statBlock,
              },
            })
          : client.library.update({
              params: { creatureId: creature.id },
              payload: {
                name: name.trim(),
                // Nullable on update alone, so a cleared box is a null rather than
                // an omission — omitting it would leave the old value, which is
                // not what emptying a box means.
                size: trimmedSize === "" ? null : trimmedSize,
                type: type.trim(),
                cr: cr.trim(),
                ac,
                hp,
                environments: list,
                statBlock,
              },
            }),
      // The Library, and only the Library. **Editing an original does not
      // reach the copies a campaign already holds** — that is the captain's
      // model, so a campaign bestiary that is stale after this write is not
      // stale, it is a snapshot.
      [reads.library],
    );

    if (Result.isSuccess(saved)) onSaved();
  };

  const remove = async () => {
    if (creature === undefined) return;
    // **Copies already in campaigns stay where they are** — the line beside
    // this button says so, and it is why no campaign's bestiary is named here.
    // `derived_from` goes null and the copy stands.
    const gone = await submit(
      (client) => client.library.remove({ params: { creatureId: creature.id } }),
      [reads.library],
    );
    if (Result.isSuccess(gone)) onSaved();
  };

  const isNew = creature === undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={isNew ? "Write a creature" : "Edit creature"}>
        <DialogHeader>
          <DialogTitle>{isNew ? "Write a creature" : "Edit creature"}</DialogTitle>
          <DialogDescription>
            It lives in your Library, in no campaign. Copy it into a table when you want to use it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <Field
            label="Name"
            htmlFor="creature-name"
            error={showProblems ? problems.name : undefined}
          >
            <Input
              id="creature-name"
              placeholder="Goblin Boss"
              value={name}
              aria-invalid={showProblems && problems.name !== undefined}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <div className="flex flex-wrap gap-5">
            <Field label="Size" htmlFor="creature-size">
              <Input
                id="creature-size"
                placeholder="Small"
                value={size}
                onChange={(event) => setSize(event.target.value)}
                className="w-32"
              />
            </Field>
            <Field
              label="Type"
              htmlFor="creature-type"
              hint="Both are open vocabularies — rendered as you write them."
              error={showProblems ? problems.type : undefined}
            >
              <Input
                id="creature-type"
                placeholder="Humanoid"
                value={type}
                aria-invalid={showProblems && problems.type !== undefined}
                onChange={(event) => setType(event.target.value)}
                className="w-40"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-5">
            <Field label="CR" htmlFor="creature-cr" error={showProblems ? problems.cr : undefined}>
              <Input
                id="creature-cr"
                mono
                placeholder="1/4"
                value={cr}
                aria-invalid={showProblems && problems.cr !== undefined}
                onChange={(event) => setCr(event.target.value)}
                className="w-24"
              />
            </Field>
            <Field label="AC" htmlFor="creature-ac" error={showProblems ? problems.ac : undefined}>
              <Input
                id="creature-ac"
                mono
                type="number"
                min={0}
                max={MAX_AC}
                value={acText}
                aria-invalid={showProblems && problems.ac !== undefined}
                onChange={(event) => setAcText(event.target.value)}
                className="w-24"
              />
            </Field>
            <Field
              label="Hit points"
              htmlFor="creature-hp"
              hint="These three are the numbers the list filters and sorts on."
              error={showProblems ? problems.hp : undefined}
            >
              <Input
                id="creature-hp"
                mono
                type="number"
                min={0}
                max={MAX_HP}
                value={hpText}
                aria-invalid={showProblems && problems.hp !== undefined}
                onChange={(event) => setHpText(event.target.value)}
                className="w-28"
              />
            </Field>
          </div>

          <Field
            label="Environments"
            htmlFor="creature-environments"
            hint="Comma-separated. They become the chips the list filters by."
          >
            <Input
              id="creature-environments"
              placeholder="Marsh, River"
              value={environments}
              onChange={(event) => setEnvironments(event.target.value)}
            />
          </Field>

          <div className="flex flex-col gap-4 border-t border-hairline pt-4">
            <div>
              <p className="text-label leading-snug font-semibold text-heading">The stat block</p>
              {/* Why there are two AC boxes on one form, said once where it is
                  asked: the column is what sorts, the line is what you read out.
                  Neither derives from the other — "17 (chain shirt, shield)" is
                  not recoverable from 17. */}
              <p className="mt-1 text-caption leading-body text-muted-foreground">
                What you read at the table. Leave a line blank and the number above it is shown
                instead.
              </p>
            </div>

            <Field label="Subtitle" htmlFor="creature-meta">
              <Input
                id="creature-meta"
                placeholder="Small humanoid (goblinoid), neutral evil"
                value={meta}
                onChange={(event) => setMeta(event.target.value)}
              />
            </Field>

            <div className="flex flex-wrap gap-5">
              <Field label="AC line" htmlFor="creature-ac-line">
                <Input
                  id="creature-ac-line"
                  mono
                  placeholder="17 (chain shirt, shield)"
                  value={acLine}
                  onChange={(event) => setAcLine(event.target.value)}
                  className="w-56"
                />
              </Field>
              <Field label="HP line" htmlFor="creature-hp-line">
                <Input
                  id="creature-hp-line"
                  mono
                  placeholder="21 (6d6)"
                  value={hpLine}
                  onChange={(event) => setHpLine(event.target.value)}
                  className="w-40"
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-5">
              <Field label="Speed" htmlFor="creature-speed">
                <Input
                  id="creature-speed"
                  mono
                  placeholder="30 ft."
                  value={speed}
                  onChange={(event) => setSpeed(event.target.value)}
                  className="w-32"
                />
              </Field>
              <Field
                label="CR line"
                htmlFor="creature-cr-line"
                hint="Room for the XP award, which the sortable rating has none for."
              >
                <Input
                  id="creature-cr-line"
                  mono
                  placeholder="1 (200 XP)"
                  value={crLine}
                  onChange={(event) => setCrLine(event.target.value)}
                  className="w-40"
                />
              </Field>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-hairline pt-4">
            <div className="flex items-center gap-3">
              <p className="flex-1 text-label leading-snug font-semibold text-heading">
                Traits and actions
              </p>
              <Button variant="outline" size="sm" onClick={addTrait}>
                <Icon name="plus" size={13} />
                Add a trait
              </Button>
            </div>

            {traits.length === 0 ? (
              <p className="text-caption leading-body text-muted-foreground">
                Nimble Escape, Scimitar, a legendary action — anything with a name and a paragraph.
              </p>
            ) : (
              traits.map((trait, index) => (
                <div
                  key={trait.key}
                  className="flex flex-col gap-2.5 rounded-card bg-surface-sunken p-3"
                >
                  <div className="flex flex-wrap items-end gap-2.5">
                    <Field label="Trait" htmlFor={`creature-trait-${trait.key}`}>
                      <Input
                        id={`creature-trait-${trait.key}`}
                        placeholder="Nimble Escape"
                        value={trait.name}
                        onChange={(event) => setTrait(trait.key, { name: event.target.value })}
                        className="w-56"
                      />
                    </Field>
                    <Field
                      label="Dice"
                      htmlFor={`creature-trait-dice-${trait.key}`}
                      hint="Shown, never rolled — there is no dice tray."
                    >
                      <Input
                        id={`creature-trait-dice-${trait.key}`}
                        mono
                        placeholder="1d6+2"
                        value={trait.dice}
                        onChange={(event) => setTrait(trait.key, { dice: event.target.value })}
                        className="w-28"
                      />
                    </Field>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mb-0.5 ml-auto"
                      aria-label={`Remove trait ${index + 1}`}
                      onClick={() =>
                        setTraits((current) => current.filter((entry) => entry.key !== trait.key))
                      }
                    >
                      <Icon name="trash-2" size={15} />
                    </Button>
                  </div>
                  <Textarea
                    aria-label={`Trait ${index + 1} text`}
                    placeholder="The boss takes the Disengage or Hide action as a bonus action on each of its turns."
                    value={trait.text}
                    onChange={(event) => setTrait(trait.key, { text: event.target.value })}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* In the footer, not at the end of the body: the body scrolls, and a
            line appended below the fold is one a DM never sees. */}
        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          {!isNew && failure === undefined && (
            <div className="mr-auto flex min-w-0 flex-1 flex-col items-start gap-1">
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
                Delete
              </Button>
              {/* The captain's decision of 2026-08-14, rendered rather than
                  hidden: a copy is a snapshot and nothing is read through
                  `derived_from`, so the copies stay and simply stop pointing
                  back. A DM who expected them to go would find out by looking. */}
              <span className="text-caption leading-body text-faint">
                Copies already in your campaigns stay where they are.
              </span>
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : isNew ? "Add to your Library" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
