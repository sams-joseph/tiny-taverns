import type { OptionKind } from "@taverns/api";
import { ABILITY_KEYS, type AbilityKey, increasesLine } from "@taverns/api";
import { Checkbox, Input, Label } from "@taverns/ui";
import { Field, Textarea } from "../ui/form";
import {
  increasesFrom,
  MAX_HIT_DIE,
  MAX_HP_PER_LEVEL,
  MAX_INCREASE,
  type DraftProblems,
  type OptionDraft,
} from "./optionDraft";
import { unarmouredLine } from "./option";

/**
 * The boxes a class, a species or a background is written in — **the editor,
 * not a dialog.**
 *
 * There are two shells over it and they are genuinely different acts:
 * `OptionDialog` authors into the Library *and* copies into a campaign in one
 * press, and carries the visibility switch a copy has; `OptionForm` writes the
 * Library original and has a delete beside it. What must not differ is what a
 * hit die is, what an unarmoured formula is, whether an untouched summary is an
 * absent key, and whether a background box holding `0` becomes a row — so that
 * is one file, exactly as `characters/AbilityFields.tsx` is one body under a
 * saving shell and a non-saving one.
 *
 * It holds no state and makes no request. The draft, the busy flag and the
 * write belong to whichever shell is over it — the rule `api/mutation.ts`
 * states about the three things that belong to one open form.
 */
export function OptionFields({
  kind,
  draft,
  problems,
  showProblems,
  onChange,
}: {
  /** Which kind is being written. Not editable — see `OptionUpdate`. */
  readonly kind: OptionKind;
  readonly draft: OptionDraft;
  readonly problems: DraftProblems;
  /** Problems are held back until the first press, then shown for good. */
  readonly showProblems: boolean;
  readonly onChange: (draft: OptionDraft) => void;
}) {
  const set = <K extends keyof OptionDraft>(key: K, value: OptionDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const toggleAbility = (key: AbilityKey, on: boolean) =>
    set(
      "unarmouredAc",
      on
        ? // In `ABILITY_KEYS` order rather than press order, so `10 + DEX + CON`
          // reads the same however it was clicked. The sum does not care; the
          // person reading the card does.
          ABILITY_KEYS.filter((ability) => ability === key || draft.unarmouredAc.includes(ability))
        : draft.unarmouredAc.filter((ability) => ability !== key),
    );

  return (
    <>
      <Field
        label="Name"
        htmlFor="option-name"
        error={showProblems ? problems.name : undefined}
        hint="What a player picks it by, and what lands on their sheet."
      >
        <Input
          id="option-name"
          placeholder={
            kind === "class" ? "Bloodsworn" : kind === "species" ? "Marshfolk" : "Salt-runner"
          }
          value={draft.name}
          aria-invalid={showProblems && problems.name !== undefined}
          onChange={(event) => set("name", event.target.value)}
        />
      </Field>

      {kind === "class" ? (
        <>
          <Field
            label="Hit die"
            htmlFor="option-hit-die"
            hint="The number of faces. A level-1 character gets this at its maximum, plus their constitution."
            error={showProblems ? problems.hitDie : undefined}
          >
            <Input
              id="option-hit-die"
              mono
              type="number"
              min={1}
              max={MAX_HIT_DIE}
              value={draft.hitDie}
              aria-invalid={showProblems && problems.hitDie !== undefined}
              onChange={(event) => set("hitDie", event.target.value)}
              className="w-24"
            />
          </Field>

          {/* Six toggles rather than a *has unarmoured defence* switch,
              because the real ruleset needs two different answers:
              Barbarian is `10 + DEX + CON` and Monk is `10 + DEX + WIS`.
              A boolean would be quietly wrong for exactly the two classes
              most likely to notice, and a homebrew class is more likely to
              be unusual here rather than less. */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label leading-snug font-semibold text-heading">
              Unarmoured armour class
            </legend>
            <p className="text-caption leading-body text-muted-foreground">
              Ten plus these, when nothing is worn.{" "}
              <span className="text-heading">{unarmouredLine(draft.unarmouredAc)}</span>
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2.5">
              {ABILITY_KEYS.map((ability) => (
                <div key={ability} className="flex items-center gap-2">
                  <Checkbox
                    id={`option-ac-${ability}`}
                    checked={draft.unarmouredAc.includes(ability)}
                    onCheckedChange={(next) => toggleAbility(ability, next === true)}
                  />
                  <Label htmlFor={`option-ac-${ability}`}>{ability}</Label>
                </div>
              ))}
            </div>
          </fieldset>
        </>
      ) : kind === "species" ? (
        <Field
          label="Hit points per level"
          htmlFor="option-hp-per-level"
          hint="Nine of the ten in the book give none. A dwarf gives one."
          error={showProblems ? problems.hpPerLevel : undefined}
        >
          <Input
            id="option-hp-per-level"
            mono
            type="number"
            min={0}
            max={MAX_HP_PER_LEVEL}
            value={draft.hpPerLevel}
            aria-invalid={showProblems && problems.hpPerLevel !== undefined}
            onChange={(event) => set("hpPerLevel", event.target.value)}
            className="w-24"
          />
        </Field>
      ) : (
        /* **Six boxes, and blank is the ordinary answer for four of them.**
           In the 2024 ruleset this is what a background is *for* — the
           ability score increases moved here off the species — so it is the
           one editor in this form whose value reaches a number on
           somebody's sheet rather than a number in a box on the create
           form.

           Six named boxes rather than an add-a-row list because the
           vocabulary is fixed at six and always will be: `ABILITY_KEYS` is
           the ruleset's *frame*, and a control that made you choose the
           ability as well as the amount would be a picker over a list of
           six that are all always offered. What is stored is still a list
           of what was said — see `increasesFrom`. */
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label leading-snug font-semibold text-heading">
            Ability score increases
          </legend>
          <p className="text-caption leading-body text-muted-foreground">
            Added to a new character's scores when they pick this.{" "}
            <span className="text-heading">
              {increasesLine(increasesFrom(draft)) === ""
                ? "Nothing yet"
                : increasesLine(increasesFrom(draft))}
            </span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2.5">
            {ABILITY_KEYS.map((ability) => (
              <div key={ability} className="flex items-center gap-2">
                <Label htmlFor={`option-increase-${ability}`}>{ability}</Label>
                <Input
                  id={`option-increase-${ability}`}
                  // A visible label repeated down a list is one control as
                  // far as anything reading names is concerned, which is
                  // the trap the sheet's own six cells already record.
                  aria-label={`${ability} increase`}
                  mono
                  type="number"
                  min={0}
                  max={MAX_INCREASE}
                  placeholder="0"
                  value={draft.increases[ability]}
                  aria-invalid={showProblems && problems.increases !== undefined}
                  onChange={(event) =>
                    set("increases", { ...draft.increases, [ability]: event.target.value })
                  }
                  className="w-16"
                />
              </div>
            ))}
          </div>
          {showProblems && problems.increases !== undefined && (
            <p role="alert" className="text-caption leading-body text-danger-ink">
              {problems.increases}
            </p>
          )}
          <p className="text-caption leading-body text-muted-foreground">
            Leave one blank for an ability this background does not touch. The bundled backgrounds
            carry none at all, so this is where a table's own numbers go.
          </p>
        </fieldset>
      )}

      <Field
        label="What it is"
        htmlFor="option-summary"
        hint="One line, for whoever is picking. Blank is fine."
      >
        <Textarea
          id="option-summary"
          placeholder="Sworn to the marsh, and it takes its due in blood."
          value={draft.summary}
          onChange={(event) => set("summary", event.target.value)}
        />
      </Field>
    </>
  );
}
