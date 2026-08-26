import type { Character } from "@taverns/api";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure } from "../ui/form";
import {
  abilitiesFrom,
  abilityDrafts,
  assignScores,
  MAX_SCORE,
  MIN_SCORE,
  modifierFor,
  parseScore,
  rollAbilityScores,
  STANDARD_ARRAY,
  swapScores,
  type AbilityDraft,
} from "./abilities";
import { ownCharacterWrites, saveOwnCharacter, sheetWith } from "./write";

/**
 * The six cells — `sheet.abilities`, behind the Stats tab's *Edit*.
 *
 * **The gap this closes was a shipped one and was not Hob's.** `AGENTS.md`
 * records the matching absence on the creature side (*"ability cells are
 * preserved and not editable, and that is a gap rather than a decision"*), and
 * on the character sheet it was sharper: `CharacterDialog` writes no abilities
 * at all, so every character the product has ever made had six cells nobody
 * could type a first value into. A drafting assistant would have needed this
 * editor too; nothing about it waits on one.
 *
 * ### One key of the document, sent as the whole document
 *
 * `sheetWith` is where that rule and the race it accepts are written down. What
 * matters here is the half it prevents: a form sending only `abilities` would
 * erase the skills, the spells, the inventory and the backstory it was never
 * shown. What `abilityDrafts` prevents is the same loss one level in — a
 * seventh cell somebody's DM typed is carried through rather than dropped
 * because this dialog draws six.
 *
 * ### The two generators, and what each of them is
 *
 * *Standard array* is the default and the drawing's own (`:157`); *Roll* is
 * 4d6-drop-lowest, the rule that drawing's toast names and its code does not.
 * Both are **client-side dice**, per the decision already written in
 * `run/RunScreen.tsx`: a roll is not durable state, only the number it produced
 * is, and there is no roll endpoint. Both write into the boxes rather than
 * saving, so nothing reaches the sheet until *Save abilities* — a generator
 * that wrote through would make a mis-tap on *Roll* unrecoverable.
 *
 * *Swap with* is the accessible form of the drawing's *"drag a score onto
 * another ability"*; `abilities.ts` carries that argument and the arithmetic.
 */
export function AbilitiesDialog({
  character,
  onClose,
  onSaved,
}: {
  readonly character: Character;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<ReadonlyArray<AbilityDraft>>(() =>
    abilityDrafts(character.sheet.abilities),
  );
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();

  const setDraft = (label: string, patch: Partial<AbilityDraft>) =>
    setDrafts((current) =>
      current.map((draft) => (draft.label === label ? { ...draft, ...patch } : draft)),
    );

  /**
   * A score that is not a whole number in range is the one thing said before
   * sending. A *blank* score is not a problem to report — it is a cell nobody
   * has filled in, and dropping it is what lets four of six be saved.
   */
  const bad = drafts.filter((draft) => {
    if (draft.score.trim() === "") return false;
    const score = parseScore(draft.score);
    return score === undefined || score < MIN_SCORE || score > MAX_SCORE;
  });

  const save = async () => {
    setShowProblems(true);
    if (bad.length > 0) return;

    const saved = await submit(
      (client) =>
        saveOwnCharacter(client, character, {
          sheet: sheetWith(character, { abilities: abilitiesFrom(drafts) }),
        }),
      ownCharacterWrites(character),
    );
    if (Result.isSuccess(saved)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Edit your abilities">
        <DialogHeader>
          <DialogTitle>Abilities</DialogTitle>
          <DialogDescription>
            Six scores. The modifier follows the score, so it is not a box you fill in.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-gutter py-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDrafts((current) => assignScores(current, [...STANDARD_ARRAY]))}
            >
              <Icon name="check" size={13} />
              Standard array
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDrafts((current) => assignScores(current, rollAbilityScores()))}
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
                        setDrafts((current) => swapScores(current, draft.label, String(value)))
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
            {busy ? "Saving…" : "Save abilities"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
