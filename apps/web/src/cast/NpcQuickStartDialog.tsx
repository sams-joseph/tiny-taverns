import type { CharacterOption, NpcSheet } from "@taverns/api";
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
  Loading,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { type ReactNode, useState } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { useMutation } from "../api/mutation";
import type { AbilityDraft } from "../characters/abilities";
import { AbilityFields } from "../characters/AbilityFields";
import {
  backgroundKitOf,
  backgroundKitRowsIn,
  kitOf,
  kitRowsIn,
  MAX_AC,
  MAX_HP,
  MAX_LEVEL,
  pickKitRow,
  pickKitSide,
  raceIn,
  seededDraft,
  subraceOptionsOf,
  withPick,
  withRaceBonus,
  type SeededField,
  type SheetPick,
} from "../characters/create";
import { KitFields } from "../characters/KitFields";
import { RaceBonusFields } from "../characters/RaceBonusFields";
import { Field, SaveFailure } from "../ui/form";
import {
  type NpcSheetTarget,
  quickStartDraft,
  type QuickStartDraft,
  quickStartPayload,
  quickStartProblems,
} from "./npcSheet";

/** The *none* item of an optional picker: race and background may be left off. */
const NONE = "";

/**
 * *Start from class and level* — an NPC sheet written by **the character
 * form's own composer at level N**, in one dialog: the class and level, an
 * optional race, subrace and background, the class's kit, the form's ability
 * controls, and the armour class and hit points seeded from them.
 *
 * The state is the form's draft and every move on it is the form's helper
 * (`withPick`, `withRaceBonus`, `seededDraft`, the kit picks), so a pick
 * re-seeds the two boxes exactly as it does there and a box typed over stays
 * the DM's. The document is `startingSheetBody`'s (`quickStartPayload`).
 *
 * **It says what the seed does not know**: the armour class is unarmoured —
 * the class's rule over the scores, before any armour or shield in the kit —
 * so it is a box to type over, not a number to trust.
 *
 * Over a sheet it is *Rebuild*: the same form, prefilled from the sheet's
 * labels, then a confirm, because the PUT replaces the whole document. It
 * names the version it read, so a sheet edited meanwhile is a `Conflict`
 * offered a *Reload* rather than overwritten.
 *
 * The options are the target's: the NPC's campaign's classes, races and
 * backgrounds, or the core rules for a Library original.
 */
export function NpcQuickStartDialog({
  name,
  sheet,
  target,
  onClose,
  onSaved,
}: {
  /** The NPC's name, for the title. */
  readonly name: string;
  /** `null` to start one; a sheet to rebuild it. */
  readonly sheet: NpcSheet | null;
  readonly target: NpcSheetTarget;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [resource, retry] = useApiAtom(target.options);
  const title = sheet === null ? `Start ${name} from a class` : `Rebuild ${name}’s stats`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={title} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            A class at a level, and the sheet a character of it starts with. Only you see it.
          </DialogDescription>
        </DialogHeader>
        {resource.state === "ready" ? (
          <QuickStartForm
            name={name}
            sheet={sheet}
            target={target}
            options={resource.value}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : (
          <div className="px-gutter py-3">
            {resource.state === "loading" ? (
              <Loading label="Reading the rules…" />
            ) : (
              <ApiFailureNotice failure={resource.failure} onRetry={retry} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The dialog's body and footer, once the options are read — the draft starts from them. */
function QuickStartForm({
  name,
  sheet,
  target,
  options,
  onClose,
  onSaved,
}: {
  readonly name: string;
  readonly sheet: NpcSheet | null;
  readonly target: NpcSheetTarget;
  readonly options: ReadonlyArray<CharacterOption>;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [draft, setDraft] = useState<QuickStartDraft>(() => quickStartDraft(sheet, options));
  /** The seeded boxes the DM has typed in, which a pick no longer moves (`seededDraft`). */
  const [edited, setEdited] = useState<ReadonlySet<SeededField>>(() => new Set());
  const [showProblems, setShowProblems] = useState(false);
  /** A rebuild asks once more before replacing the whole sheet. */
  const [confirming, setConfirming] = useState(false);
  const { busy, failure, submit } = useMutation();
  const invalidate = useInvalidate();

  const problems = quickStartProblems(draft);
  const refused = Object.keys(problems).length > 0;

  const classes = options.filter((option) => option.kind === "class");
  const races = options.filter((option) => option.kind === "race");
  const backgrounds = options.filter((option) => option.kind === "background");
  const subraces = subraceOptionsOf(raceIn(draft, options));
  const kit = kitOf(draft, options);
  const backgroundKit = backgroundKitOf(draft, options);

  const pick = (key: SheetPick, value: string) =>
    setDraft((current) => withPick(current, key, value, edited, options));
  const setSeeded = (key: SeededField, value: string) => {
    setEdited((current) => new Set(current).add(key));
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const setLevel = (level: string) =>
    setDraft((current) => seededDraft({ ...current, level }, edited, options));
  const setAbilities = (abilities: ReadonlyArray<AbilityDraft>) =>
    setDraft((current) => seededDraft({ ...current, abilities }, edited, options));

  const write = async () => {
    const saved = await submit(
      (client) => target.put(client, quickStartPayload(draft, options, sheet)),
      target.writes,
    );
    if (Result.isSuccess(saved)) onSaved();
  };

  const save = () => {
    setShowProblems(true);
    if (refused) return;
    if (sheet === null) void write();
    else setConfirming(true);
  };

  // A refusal for a sheet that moved on: read it again and start over from it.
  const reload = () => {
    invalidate(target.writes);
    onClose();
  };

  const footer = (buttons: ReactNode) => (
    <DialogFooter>
      {failure !== undefined && (
        <div className="mr-auto min-w-0 flex-1 text-left">
          <SaveFailure failure={failure} onReload={reload} />
        </div>
      )}
      {buttons}
    </DialogFooter>
  );

  if (confirming) {
    return (
      <>
        <div className="flex flex-col gap-3 px-gutter py-3">
          <p className="text-body-s leading-body text-foreground">
            {`Replace ${name}’s whole sheet with a level ${draft.level.trim()} ${draft.className}’s?`}
          </p>
          <p className="text-body-s leading-body text-muted-foreground">
            Everything on it now goes: the scores, the features, the gear and anything you wrote by
            hand. The challenge rating stays.
          </p>
        </div>
        {footer(
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Back
            </Button>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void write()}>
              {busy ? "Replacing…" : "Replace sheet"}
            </Button>
          </>,
        )}
      </>
    );
  }

  return (
    <>
      <div
        data-slot="npc-quick-start-body"
        className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3"
      >
        {sheet !== null && (
          <p className="flex items-start gap-2 text-caption leading-body text-muted-foreground">
            <Icon name="triangle-alert" size={14} className="mt-0.5 shrink-0 text-faint" />
            <span>
              This writes a new sheet over the one {name} has. You confirm before it does.
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-5">
          <Field
            label="Class"
            htmlFor="npc-quick-class"
            error={showProblems ? problems.className : undefined}
          >
            <Select
              value={draft.className}
              onValueChange={(value) => pick("className", String(value))}
            >
              <SelectTrigger
                id="npc-quick-class"
                className="w-40"
                aria-invalid={showProblems && problems.className !== undefined}
              >
                <SelectValue>
                  {(value) => (value === "" ? "Pick a class" : String(value))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {classes.map((option) => (
                  <SelectItem key={option.id} value={option.name}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Level"
            htmlFor="npc-quick-level"
            error={showProblems ? problems.level : undefined}
          >
            <Input
              id="npc-quick-level"
              mono
              type="number"
              min={1}
              max={MAX_LEVEL}
              value={draft.level}
              aria-invalid={showProblems && problems.level !== undefined}
              onChange={(event) => setLevel(event.target.value)}
              className="w-20"
            />
          </Field>
          <Field label="Race" htmlFor="npc-quick-race">
            <Select value={draft.race} onValueChange={(value) => pick("race", String(value))}>
              <SelectTrigger id="npc-quick-race" className="w-40">
                <SelectValue>{(value) => (value === NONE ? "No race" : String(value))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No race</SelectItem>
                {races.map((option) => (
                  <SelectItem key={option.id} value={option.name}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {subraces.length > 0 && (
            <Field label="Subrace" htmlFor="npc-quick-subrace">
              <Select
                value={draft.subrace}
                onValueChange={(value) => pick("subrace", String(value))}
              >
                <SelectTrigger id="npc-quick-subrace" className="w-44">
                  <SelectValue>
                    {(value) => (value === NONE ? "No subrace" : String(value))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No subrace</SelectItem>
                  {subraces.map((subrace) => (
                    <SelectItem key={subrace.name} value={subrace.name}>
                      {subrace.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Background" htmlFor="npc-quick-background">
            <Select
              value={draft.background}
              onValueChange={(value) => pick("background", String(value))}
            >
              <SelectTrigger id="npc-quick-background" className="w-40">
                <SelectValue>
                  {(value) => (value === NONE ? "No background" : String(value))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No background</SelectItem>
                {backgrounds.map((option) => (
                  <SelectItem key={option.id} value={option.name}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <RaceBonusFields
          idPrefix="npc-quick"
          draft={draft}
          options={options}
          onToggle={(ability, on) =>
            setDraft((current) => withRaceBonus(current, ability, on, edited, options))
          }
        />

        {kit !== undefined && (
          <KitFields
            idPrefix="npc-quick-kit"
            legend="Starting kit"
            choiceLabel="Kit choice"
            kit={kit}
            choices={draft.kitChoices}
            rowsFor={(categoryIndex) => kitRowsIn(draft, options, categoryIndex)}
            onSide={(index, option) => setDraft((current) => pickKitSide(current, index, option))}
            onRow={(index, slot, equipmentId) =>
              setDraft((current) => pickKitRow(current, index, slot, equipmentId))
            }
          />
        )}
        {backgroundKit !== undefined && (
          <KitFields
            idPrefix="npc-quick-background-kit"
            legend="Background kit"
            choiceLabel="Background kit choice"
            kit={backgroundKit}
            choices={draft.backgroundKitChoices}
            rowsFor={(categoryIndex) => backgroundKitRowsIn(draft, options, categoryIndex)}
            onSide={(index, option) =>
              setDraft((current) => pickKitSide(current, index, option, "backgroundKitChoices"))
            }
            onRow={(index, slot, equipmentId) =>
              setDraft((current) =>
                pickKitRow(current, index, slot, equipmentId, "backgroundKitChoices"),
              )
            }
          />
        )}

        <fieldset className="flex flex-col gap-2.5">
          <legend className="text-label leading-snug font-semibold text-heading">
            Ability scores
          </legend>
          <p className="text-caption leading-body text-muted-foreground">
            Before the race&rsquo;s bonuses, which are added for you. Left blank, every modifier
            counts as +0.
          </p>
          <AbilityFields
            drafts={draft.abilities}
            onChange={setAbilities}
            showProblems={showProblems}
          />
          {showProblems && problems.abilities !== undefined && (
            <span role="alert" className="text-caption leading-body text-danger-ink">
              {problems.abilities}
            </span>
          )}
        </fieldset>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-5">
            <Field label="AC" htmlFor="npc-quick-ac" error={showProblems ? problems.ac : undefined}>
              <Input
                id="npc-quick-ac"
                mono
                type="number"
                min={0}
                max={MAX_AC}
                value={draft.ac}
                aria-invalid={showProblems && problems.ac !== undefined}
                onChange={(event) => setSeeded("ac", event.target.value)}
                className="w-24"
              />
            </Field>
            <Field
              label="Hit points"
              htmlFor="npc-quick-hp"
              hint="Their maximum."
              error={showProblems ? problems.hpMax : undefined}
            >
              <Input
                id="npc-quick-hp"
                mono
                type="number"
                min={0}
                max={MAX_HP}
                value={draft.hpMax}
                aria-invalid={showProblems && problems.hpMax !== undefined}
                onChange={(event) => setSeeded("hpMax", event.target.value)}
                className="w-28"
              />
            </Field>
          </div>
          {/* What the two numbers are, said before the press: the seed knows
              the class's unarmoured rule and nothing the NPC wears. */}
          <p className="flex items-start gap-2 text-caption leading-body text-muted-foreground">
            <Icon name="sparkles" size={14} className="mt-0.5 shrink-0 text-faint" />
            <span>
              Worked out from the class, level, race and scores: the hit die, its average for each
              level after the first, and an <strong className="font-semibold">unarmoured</strong>{" "}
              armour class — nothing worn or carried counts. Type over either, here or later with
              Edit stats.
            </span>
          </p>
        </div>
      </div>

      {footer(
        <>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={save}>
            {busy ? "Writing…" : sheet === null ? "Write stats" : "Rebuild stats"}
          </Button>
        </>,
      )}
    </>
  );
}
