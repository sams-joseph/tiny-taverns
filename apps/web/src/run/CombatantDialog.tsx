import type { Combatant, CombatantKind, Visibility } from "@taverns/api";
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
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, VisibilityField } from "../ui/form";
import { combatantWrites, type RunPath } from "./load";

/**
 * Adding someone mid-fight, changing them, and taking them out.
 *
 * The prototype's `plus` button (`EncounterRunner.jsx:137`) is the summoned wolf
 * and the guard captain the DM invented in the moment — which is why everything
 * but the name is optional on `CombatantCreate`, and why this form asks for
 * nothing it does not need.
 *
 * **Removal lives in here, and that is the whole design.** Hit points reaching
 * zero does not remove anybody — the product's own toast says "Still in
 * initiative — remove them when you're ready" — so removal has to be an act the
 * DM performs deliberately. Opening a dialog and pressing a red button is that
 * act; a second confirmation on top of it would be a modal over a modal, which
 * the design system forbids and which nobody reads anyway.
 *
 * **`kind` is asked once and never again.** `CombatantUpdate` has no field for
 * it: whether a row draws a shield or a skull came from which half of the seed
 * produced it, and a party member who became a monster mid-fight is a new
 * combatant rather than an edit.
 */

const MIN_INITIATIVE = -50;
const MAX_INITIATIVE = 100;
const MAX_HP = 10_000;
const MAX_AC = 40;
const MAX_CONDITIONS = 24;
const MAX_CONDITION_LENGTH = 40;

/** `"Hostile, Prone"` ⇄ `["Hostile", "Prone"]`. Blanks and repeats fall out. */
const parseConditions = (raw: string): ReadonlyArray<string> => {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const condition = part.trim();
    if (condition !== "") seen.add(condition);
  }
  return [...seen];
};

/** `""` means "leave it out"; anything else has to be a whole number. */
const parseNumber = (raw: string): number | undefined => {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isInteger(value) ? value : Number.NaN;
};

interface Draft {
  readonly displayName: string;
  readonly subtitle: string;
  readonly playerName: string;
  readonly kind: CombatantKind;
  readonly initiative: string;
  readonly hpMax: string;
  readonly hpCurrent: string;
  readonly ac: string;
  readonly conditions: string;
  readonly visibility: Visibility;
}

/**
 * The same rules the contract checks, said in the room they are broken in.
 *
 * A payload the schema rejects never reaches the network — the derived client
 * encodes through it — so the backstop is real. But "Expected a value between
 * -50 and 100 at [\"initiative\"]" is a sentence for whoever wrote the schema.
 */
const validate = (draft: Draft) => {
  const problems: {
    displayName?: string;
    initiative?: string;
    hp?: string;
    ac?: string;
    conditions?: string;
  } = {};

  if (draft.displayName.trim() === "") problems.displayName = "Give them a name.";

  const initiative = parseNumber(draft.initiative);
  if (
    initiative !== undefined &&
    (Number.isNaN(initiative) || initiative < MIN_INITIATIVE || initiative > MAX_INITIATIVE)
  ) {
    problems.initiative = `A whole number from ${String(MIN_INITIATIVE)} to ${String(MAX_INITIATIVE)}.`;
  }

  const hpMax = parseNumber(draft.hpMax);
  const hpCurrent = parseNumber(draft.hpCurrent);
  for (const value of [hpMax, hpCurrent]) {
    if (value !== undefined && (Number.isNaN(value) || value < 0 || value > MAX_HP)) {
      problems.hp = `Hit points run from 0 to ${String(MAX_HP)}.`;
    }
  }

  const ac = parseNumber(draft.ac);
  if (ac !== undefined && (Number.isNaN(ac) || ac < 0 || ac > MAX_AC)) {
    problems.ac = `Armour class runs from 0 to ${String(MAX_AC)}.`;
  }

  const conditions = parseConditions(draft.conditions);
  if (conditions.length > MAX_CONDITIONS) {
    problems.conditions = `Twenty-four conditions is the most one combatant carries.`;
  } else if (conditions.some((condition) => condition.length > MAX_CONDITION_LENGTH)) {
    problems.conditions = `Keep each condition under ${String(MAX_CONDITION_LENGTH + 1)} characters.`;
  }

  return problems;
};

const KINDS: ReadonlyArray<{ readonly value: CombatantKind; readonly label: string }> = [
  { value: "npc", label: "Hostile or neutral" },
  { value: "pc", label: "Party member" },
];

export function CombatantDialog({
  path,
  combatant,
  onClose,
  onSaved,
}: {
  readonly path: RunPath;
  /** Absent for a new one. Present, and this edits it. */
  readonly combatant: Combatant | undefined;
  readonly onClose: () => void;
  /** Re-reads the fight. A new or removed row changes the shape of the list. */
  readonly onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    displayName: combatant?.displayName ?? "",
    subtitle: combatant?.subtitle ?? "",
    playerName: combatant?.playerName ?? "",
    kind: combatant?.kind ?? "npc",
    initiative: combatant === undefined ? "" : String(combatant.initiative),
    hpMax: combatant === undefined ? "" : String(combatant.hpMax),
    hpCurrent: combatant === undefined ? "" : String(combatant.hpCurrent),
    ac: combatant?.ac === null || combatant?.ac === undefined ? "" : String(combatant.ac),
    conditions: combatant?.conditions.join(", ") ?? "",
    // `dm` for a new row: the column default, and the only safe one to fail to.
    visibility: combatant?.visibility ?? "dm",
  });
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();
  const problems = validate(draft);
  const refused = Object.keys(problems).length > 0;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setShowProblems(true);
    if (refused) return;

    const displayName = draft.displayName.trim();
    const subtitle = draft.subtitle.trim();
    const playerName = draft.playerName.trim();
    const conditions = parseConditions(draft.conditions);
    const initiative = parseNumber(draft.initiative);
    const hpMax = parseNumber(draft.hpMax);
    const hpCurrent = parseNumber(draft.hpCurrent);
    const ac = parseNumber(draft.ac);

    const saved = await submit(
      (client) =>
        combatant === undefined
          ? client.combatants.create({
              params: path,
              payload: {
                displayName,
                kind: draft.kind,
                visibility: draft.visibility,
                // Absent rather than null: a field the DM left blank is one the
                // column default should decide, and `CombatantCreate` has no
                // nullable members to say it with.
                ...(subtitle === "" ? {} : { subtitle }),
                ...(playerName === "" ? {} : { playerName }),
                ...(initiative === undefined ? {} : { initiative }),
                ...(hpMax === undefined ? {} : { hpMax }),
                ...(hpCurrent === undefined ? {} : { hpCurrent }),
                ...(ac === undefined ? {} : { ac }),
                ...(conditions.length === 0 ? {} : { conditions }),
              },
            })
          : client.combatants.update({
              params: { ...path, combatantId: combatant.id },
              payload: {
                displayName,
                // On update the blanks *are* expressible, and mean "clear it".
                subtitle: subtitle === "" ? null : subtitle,
                playerName: playerName === "" ? null : playerName,
                ac: ac ?? null,
                conditions,
                visibility: draft.visibility,
                ...(initiative === undefined ? {} : { initiative }),
                ...(hpMax === undefined ? {} : { hpMax }),
                ...(hpCurrent === undefined ? {} : { hpCurrent }),
              },
            }),
      combatantWrites(path.campaignId),
    );

    if (Result.isSuccess(saved)) onSaved();
  };

  const remove = async () => {
    if (combatant === undefined) return;
    // A combatant is the fight's own row and its `character_id` is provenance
    // rather than a write-through, so removing one reaches nothing outside this
    // screen. The list's new shape comes back through `onSaved`'s re-read.
    const gone = await submit(
      (client) => client.combatants.remove({ params: { ...path, combatantId: combatant.id } }),
      [],
    );
    if (Result.isSuccess(gone)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={combatant === undefined ? "Add a combatant" : "Edit combatant"}>
        <DialogHeader>
          <DialogTitle>
            {combatant === undefined ? "Add a combatant" : "Edit combatant"}
          </DialogTitle>
          <DialogDescription>
            {combatant === undefined
              ? "Whatever just walked in. Only the name is needed; the rest can wait."
              : "Everything here was copied when the fight started, so changing it changes this fight and nothing else."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <Field
            label="Name"
            htmlFor="combatant-name"
            error={showProblems ? problems.displayName : undefined}
          >
            <Input
              id="combatant-name"
              placeholder="Goblin Archer"
              value={draft.displayName}
              aria-invalid={showProblems && problems.displayName !== undefined}
              onChange={(event) => set("displayName", event.target.value)}
            />
          </Field>

          {combatant === undefined && (
            <Field label="Side" htmlFor="combatant-kind" hint="A shield in the order, or a skull.">
              <Select
                value={draft.kind}
                onValueChange={(value) => set("kind", String(value) as CombatantKind)}
              >
                <SelectTrigger id="combatant-kind">
                  {/* Written here, not left to Base UI: `Select.Value` with
                      neither `items` nor children serialises the *value*, so
                      this would read "npc". */}
                  <SelectValue>
                    {(value) => KINDS.find((kind) => kind.value === value)?.label ?? String(value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((kind) => (
                    <SelectItem key={kind.value} value={kind.value}>
                      {kind.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field
            label="Description"
            htmlFor="combatant-subtitle"
            hint="The line under the name — Small humanoid, Half-orc paladin."
          >
            <Input
              id="combatant-subtitle"
              placeholder="Small humanoid"
              value={draft.subtitle}
              onChange={(event) => set("subtitle", event.target.value)}
            />
          </Field>

          <Field label="Player" htmlFor="combatant-player" hint="Only for someone at the table.">
            <Input
              id="combatant-player"
              placeholder="Ilse"
              value={draft.playerName}
              onChange={(event) => set("playerName", event.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Initiative"
              htmlFor="combatant-initiative"
              error={showProblems ? problems.initiative : undefined}
            >
              <Input
                mono
                id="combatant-initiative"
                inputMode="numeric"
                placeholder="14"
                value={draft.initiative}
                aria-invalid={showProblems && problems.initiative !== undefined}
                onChange={(event) => set("initiative", event.target.value)}
              />
            </Field>
            <Field
              label="Armour class"
              htmlFor="combatant-ac"
              error={showProblems ? problems.ac : undefined}
            >
              <Input
                mono
                id="combatant-ac"
                inputMode="numeric"
                placeholder="15"
                value={draft.ac}
                aria-invalid={showProblems && problems.ac !== undefined}
                onChange={(event) => set("ac", event.target.value)}
              />
            </Field>
            <Field label="Hit points" htmlFor="combatant-hp-current">
              <Input
                mono
                id="combatant-hp-current"
                inputMode="numeric"
                placeholder="7"
                value={draft.hpCurrent}
                aria-invalid={showProblems && problems.hp !== undefined}
                onChange={(event) => set("hpCurrent", event.target.value)}
              />
            </Field>
            <Field
              label="Out of"
              htmlFor="combatant-hp-max"
              error={showProblems ? problems.hp : undefined}
            >
              <Input
                mono
                id="combatant-hp-max"
                inputMode="numeric"
                placeholder="7"
                value={draft.hpMax}
                aria-invalid={showProblems && problems.hp !== undefined}
                onChange={(event) => set("hpMax", event.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Conditions"
            htmlFor="combatant-conditions"
            hint="Separated by commas — Hostile, Prone, Concentrating."
            error={showProblems ? problems.conditions : undefined}
          >
            <Input
              id="combatant-conditions"
              placeholder="Hostile"
              value={draft.conditions}
              aria-invalid={showProblems && problems.conditions !== undefined}
              onChange={(event) => set("conditions", event.target.value)}
            />
          </Field>

          <VisibilityField
            id="combatant-visibility"
            value={draft.visibility}
            onChange={(next) => set("visibility", next)}
            shared="Your players can see this line, if the fight itself is shared."
            hidden="Only you can see this line."
          />
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          {combatant !== undefined && failure === undefined && (
            <Button
              variant="destructive"
              size="sm"
              className="mr-auto"
              disabled={busy}
              onClick={() => void remove()}
            >
              Remove from the fight
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : combatant === undefined ? "Add to the fight" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
