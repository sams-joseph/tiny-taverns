import {
  Button,
  Icon,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@taverns/ui";
import { Field } from "../ui/form";
import {
  assignScores,
  badScores,
  MAX_SCORE,
  MIN_SCORE,
  modifierFor,
  parseScore,
  rollAbilityScores,
  STANDARD_ARRAY,
  swapScores,
  type AbilityDraft,
} from "./abilities";

/**
 * The six cells as a control — **one editor, two surfaces.**
 *
 * It was written inline in `AbilitiesDialog` when the sheet was the only place
 * ability scores could be typed. The create form asks for them too now, and the
 * numbers it seeds from them are the same numbers Hob's draft seeds from its
 * own, so the two paths only agree for as long as the six cells mean the same
 * thing on both. A second editor over `sheet.abilities` would be the second
 * answer this codebase avoids everywhere else — and the one it would disagree
 * about first is the modifier, which is *stored* rather than derived and is
 * therefore only ever as right as the writer that wrote it.
 *
 * So this is the body and nothing else: no dialog, no mutation, no `Character`.
 * It takes drafts and hands drafts back, which is what lets the sheet wrap it
 * in a `PATCH` and the create form wrap it in a piece of form state that has
 * not been sent anywhere yet.
 *
 * ### The two generators, and what each of them is
 *
 * *Standard array* is the drawing's own (`CharacterCreate.jsx:157`); *Roll* is
 * 4d6-drop-lowest, the rule that drawing's toast names and its code does not.
 * Both are **client-side dice**, per the decision already written in
 * `run/RunScreen.tsx`: a roll is not durable state, only the number it produced
 * is, and there is no roll endpoint. **Neither is applied on mount, on either
 * surface** — they write into the boxes when they are pressed and nowhere else,
 * so nothing here ever changes a document, or a draft, without being asked.
 *
 * *Swap with* is the accessible form of the drawing's *"drag a score onto
 * another ability"*; `abilities.ts` carries that argument and the arithmetic.
 */
export function AbilityFields({
  drafts,
  onChange,
  showProblems,
}: {
  readonly drafts: ReadonlyArray<AbilityDraft>;
  readonly onChange: (next: ReadonlyArray<AbilityDraft>) => void;
  /** Whether a score out of range is drawn yet, or only once something is pressed. */
  readonly showProblems: boolean;
}) {
  const bad = badScores(drafts);
  const setDraft = (label: string, patch: Partial<AbilityDraft>) =>
    onChange(drafts.map((draft) => (draft.label === label ? { ...draft, ...patch } : draft)));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(assignScores(drafts, [...STANDARD_ARRAY]))}
        >
          <Icon name="check" size={13} />
          Standard array
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(assignScores(drafts, rollAbilityScores()))}
        >
          <Icon name="dices" size={13} />
          Roll 4d6, drop the lowest
        </Button>
        <span className="text-caption leading-body text-muted-foreground">
          Either fills the boxes. Nothing is saved until you say so.
        </span>
      </div>

      {drafts.map((draft) => {
        const score = parseScore(draft.score);
        const problem = showProblems && bad.some((entry) => entry.label === draft.label);
        return (
          <div
            key={draft.label}
            className="flex flex-col gap-2.5 rounded-card bg-surface-sunken p-3"
          >
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="flex min-w-13 flex-col gap-1.5">
                <span className="text-label-s leading-none font-semibold tracking-caps uppercase text-muted-foreground">
                  {draft.label}
                </span>
                {/* The derived half, drawn where the score is typed so the
                    arithmetic is visible rather than a surprise on save. */}
                <span className="font-display text-display-s leading-tight font-semibold text-heading">
                  {score === undefined ? "—" : modifierFor(score)}
                </span>
              </div>
              {/* **Six rows, so the visible label is not the accessible
                  name.** *Score* six times over is one control repeated
                  six times as far as anything that reads names is
                  concerned — a screen reader announcing the third one, or
                  a test reaching for it. The eye already has the STR
                  beside it; the name has to carry it too. */}
              <Field
                label="Score"
                htmlFor={`ability-score-${draft.label}`}
                error={
                  problem
                    ? `A whole number, ${String(MIN_SCORE)} to ${String(MAX_SCORE)}.`
                    : undefined
                }
              >
                <Input
                  id={`ability-score-${draft.label}`}
                  aria-label={`${draft.label} score`}
                  mono
                  type="number"
                  min={MIN_SCORE}
                  max={MAX_SCORE}
                  value={draft.score}
                  onChange={(event) => setDraft(draft.label, { score: event.target.value })}
                  className="w-24"
                />
              </Field>
              {/* The drawing's drag, as a control a keyboard can reach.
                  It never holds a value: swapping is an act, and leaving
                  the last ability swapped with showing would read as a
                  state this row is in. */}
              <Field label="Swap score with" htmlFor={`ability-swap-${draft.label}`}>
                <Select
                  value=""
                  onValueChange={(value) =>
                    onChange(swapScores(drafts, draft.label, String(value)))
                  }
                >
                  <SelectTrigger
                    id={`ability-swap-${draft.label}`}
                    aria-label={`Swap ${draft.label} score with`}
                    className="w-32"
                  >
                    {/* Written out: `Select.Value` with neither `items` nor
                        children serialises the value, which here is `""`. */}
                    <SelectValue>{() => "Choose"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {drafts
                      .filter((other) => other.label !== draft.label)
                      .map((other) => (
                        <SelectItem key={other.label} value={other.label}>
                          {other.label} {other.score === "" ? "—" : other.score}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <Field
                label="Saving throw"
                htmlFor={`ability-save-${draft.label}`}
                hint={
                  draft.label === "STR"
                    ? "As you write it on the sheet — the proficiency bonus is not worked out here."
                    : undefined
                }
              >
                <Input
                  id={`ability-save-${draft.label}`}
                  aria-label={`${draft.label} saving throw`}
                  mono
                  placeholder="+7"
                  value={draft.save}
                  onChange={(event) => setDraft(draft.label, { save: event.target.value })}
                  className="w-24"
                />
              </Field>
              <div className="mb-2 flex items-center gap-2.5">
                <Switch
                  id={`ability-proficient-${draft.label}`}
                  aria-label={`${draft.label} proficient save`}
                  checked={draft.proficient}
                  onCheckedChange={(next) => setDraft(draft.label, { proficient: next })}
                />
                <Label htmlFor={`ability-proficient-${draft.label}`}>Proficient save</Label>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
