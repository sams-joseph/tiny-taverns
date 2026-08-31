import type { OptionKind } from "@taverns/api";
import { ABILITY_KEYS, bonusesLine, type AbilityKey } from "@taverns/api";
import { Checkbox, Input, Label } from "@taverns/ui";
import { Field, Textarea } from "../ui/form";
import {
  bonusesFrom,
  MAX_BONUS,
  MAX_HIT_DIE,
  MAX_HP_PER_LEVEL,
  MAX_SPEED,
  type DraftProblems,
  type OptionDraft,
} from "./optionDraft";
import { unarmouredLine } from "./option";

export function OptionFields({
  kind,
  draft,
  problems,
  showProblems,
  onChange,
}: {
  readonly kind: OptionKind;
  readonly draft: OptionDraft;
  readonly problems: DraftProblems;
  readonly showProblems: boolean;
  readonly onChange: (draft: OptionDraft) => void;
}) {
  const set = <K extends keyof OptionDraft>(key: K, value: OptionDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const toggleAbility = (key: AbilityKey, on: boolean) =>
    set(
      "unarmouredAc",
      on
        ? ABILITY_KEYS.filter((ability) => ability === key || draft.unarmouredAc.includes(ability))
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
            kind === "class" ? "Bloodsworn" : kind === "race" ? "Marshfolk" : "Salt-runner"
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
            hint="The number of faces. A level-1 character gets this at its maximum, plus constitution."
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
          <Field label="Proficiencies" htmlFor="option-class-proficiencies" hint="One per line.">
            <Textarea
              id="option-class-proficiencies"
              value={draft.classProficiencies}
              onChange={(event) => set("classProficiencies", event.target.value)}
            />
          </Field>
          <Field label="Saving throws" htmlFor="option-saving-throws" hint="One per line.">
            <Textarea
              id="option-saving-throws"
              value={draft.savingThrows}
              onChange={(event) => set("savingThrows", event.target.value)}
            />
          </Field>
        </>
      ) : kind === "race" ? (
        <>
          <div className="flex flex-wrap gap-5">
            <Field
              label="Speed"
              htmlFor="option-speed"
              hint="Feet."
              error={showProblems ? problems.speed : undefined}
            >
              <Input
                id="option-speed"
                mono
                type="number"
                min={0}
                max={MAX_SPEED}
                value={draft.speed}
                aria-invalid={showProblems && problems.speed !== undefined}
                onChange={(event) => set("speed", event.target.value)}
                className="w-24"
              />
            </Field>
            <Field label="Size" htmlFor="option-size">
              <Input
                id="option-size"
                value={draft.size}
                onChange={(event) => set("size", event.target.value)}
                className="w-32"
              />
            </Field>
            <Field
              label="Hit points per level"
              htmlFor="option-hp-per-level"
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
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label leading-snug font-semibold text-heading">
              Ability bonuses
            </legend>
            <p className="text-caption leading-body text-muted-foreground">
              Fixed 2014 race bonuses.{" "}
              <span className="text-heading">
                {bonusesLine(bonusesFrom(draft)) || "No fixed bonuses"}
              </span>
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2.5">
              {ABILITY_KEYS.map((ability) => (
                <div key={ability} className="flex items-center gap-2">
                  <Label htmlFor={`option-bonus-${ability}`}>{ability}</Label>
                  <Input
                    id={`option-bonus-${ability}`}
                    aria-label={`${ability} bonus`}
                    mono
                    type="number"
                    min={0}
                    max={MAX_BONUS}
                    placeholder="0"
                    value={draft.abilityBonuses[ability]}
                    aria-invalid={showProblems && problems.abilityBonuses !== undefined}
                    onChange={(event) =>
                      set("abilityBonuses", {
                        ...draft.abilityBonuses,
                        [ability]: event.target.value,
                      })
                    }
                    className="w-16"
                  />
                </div>
              ))}
            </div>
            {showProblems && problems.abilityBonuses !== undefined && (
              <p role="alert" className="text-caption leading-body text-danger-ink">
                {problems.abilityBonuses}
              </p>
            )}
            {draft.abilityBonusChoice !== undefined && (
              <p className="text-caption leading-body text-muted-foreground">
                Also offers a choice: pick {draft.abilityBonusChoice.choose} from{" "}
                {draft.abilityBonusChoice.bonuses.map((bonus) => bonus.ability).join(", ")}.
                Character creation asks for that choice; this editor preserves the source choice.
              </p>
            )}
          </fieldset>
          <Field label="Traits" htmlFor="option-traits" hint="One per line; descriptive only here.">
            <Textarea
              id="option-traits"
              value={draft.traits}
              onChange={(event) => set("traits", event.target.value)}
            />
          </Field>
          {draft.subraces.length > 0 && (
            <div className="rounded-control border border-hairline bg-surface-sunken px-3 py-2.5">
              <p className="text-label leading-snug font-semibold text-heading">Subraces</p>
              <p className="mt-1 text-caption leading-body text-muted-foreground">
                {draft.subraces.map((subrace) => subrace.name).join(", ")}. Subraces are contained
                in their parent race; add or remove them by reimporting or editing the document
                JSON.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <Field
            label="Proficiencies"
            htmlFor="option-background-proficiencies"
            hint="One per line."
          >
            <Textarea
              id="option-background-proficiencies"
              value={draft.proficiencies}
              onChange={(event) => set("proficiencies", event.target.value)}
            />
          </Field>
          <Field
            label="Languages"
            htmlFor="option-background-languages"
            hint="Fixed grants or choice text."
          >
            <Textarea
              id="option-background-languages"
              value={draft.languages}
              onChange={(event) => set("languages", event.target.value)}
            />
          </Field>
          <Field
            label="Equipment"
            htmlFor="option-background-equipment"
            hint="One line per grant or choice."
          >
            <Textarea
              id="option-background-equipment"
              value={draft.equipment}
              onChange={(event) => set("equipment", event.target.value)}
            />
          </Field>
          <Field label="Gold" htmlFor="option-background-gold">
            <Input
              id="option-background-gold"
              value={draft.gold}
              onChange={(event) => set("gold", event.target.value)}
              className="w-32"
            />
          </Field>
          <Field label="Feature name" htmlFor="option-feature-name">
            <Input
              id="option-feature-name"
              value={draft.featureName}
              onChange={(event) => set("featureName", event.target.value)}
            />
          </Field>
          <Field label="Feature text" htmlFor="option-feature-text">
            <Textarea
              id="option-feature-text"
              value={draft.featureText}
              onChange={(event) => set("featureText", event.target.value)}
            />
          </Field>
          <Field
            label="Personality choices"
            htmlFor="option-background-choices"
            hint="One choice block per line."
          >
            <Textarea
              id="option-background-choices"
              value={draft.choices}
              onChange={(event) => set("choices", event.target.value)}
            />
          </Field>
        </>
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
