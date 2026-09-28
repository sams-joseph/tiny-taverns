import { ABILITY_KEYS, type AbilityKey, type CharacterOption } from "@taverns/api";
import { Checkbox, Icon, Label } from "@taverns/ui";
import { raceChoiceNote, raceIn, selectedRaceBonuses, type CharacterDraft } from "./create";

/**
 * The race's own ability bonuses, and the checkboxes for the ones it lets you
 * choose (a Half-Elf's two +1s) — the new-character form's and an NPC quick
 * start's, which compose from the same draft (`startingSourcesOf`), so they
 * draw the same control over it.
 *
 * It draws nothing for a race with no bonuses and no choice. A toggle is the
 * caller's to apply, because the caller decides what re-seeds with it.
 */
export function RaceBonusFields({
  idPrefix,
  draft,
  options,
  onToggle,
}: {
  readonly idPrefix: string;
  readonly draft: CharacterDraft;
  readonly options: ReadonlyArray<CharacterOption>;
  readonly onToggle: (ability: AbilityKey, on: boolean) => void;
}) {
  const race = raceIn(draft, options);
  const choice = race?.kind === "race" ? race.body.abilityBonusChoice : undefined;
  const bonuses = selectedRaceBonuses(draft, options);
  const note = raceChoiceNote(draft, options);

  return (
    <>
      {choice !== undefined && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label leading-snug font-semibold text-heading">
            Race bonus choices
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {ABILITY_KEYS.map((ability) =>
              choice.bonuses.some((bonus) => bonus.ability === ability) ? (
                <div key={ability} className="flex items-center gap-2">
                  <Checkbox
                    id={`${idPrefix}-race-bonus-${ability}`}
                    checked={draft.raceBonusChoices.includes(ability)}
                    onCheckedChange={(next) => onToggle(ability, next === true)}
                  />
                  <Label htmlFor={`${idPrefix}-race-bonus-${ability}`}>{ability}</Label>
                </div>
              ) : null,
            )}
          </div>
        </fieldset>
      )}

      {(bonuses !== "" || note !== undefined) && (
        <p className="flex items-start gap-2 text-caption leading-body text-muted-foreground">
          <Icon name="sparkles" size={14} className="mt-0.5 shrink-0 text-faint" />
          <span>
            {bonuses === "" ? "No race bonuses selected yet." : `Race bonuses: ${bonuses}.`}
            {note === undefined ? "" : ` ${note}`}
          </span>
        </p>
      )}
    </>
  );
}
