import type { OwnedCharacter } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { skillDrafts, skillsFrom, type SkillDraft } from "./skills";
import { ownCharacterWrites, saveOwnCharacter, sheetWith } from "./write";

/**
 * The skill list — `sheet.skills`, behind the Stats tab's *Edit skills*.
 *
 * **The eighteen, always drawn, with a switch and a number against each.** The
 * drawing (`CharacterCreate.jsx:162`) is a chip grid over ten of them with a
 * *four of four* counter; the chips are the right idea and the counter is a
 * creation rule rather than a sheet one — `skills.ts` carries that argument. A
 * row already in the document under some other name is drawn beside them rather
 * than dropped, which is the same guard `abilityDrafts` applies to a seventh
 * ability cell and `sheetWith` applies to the document as a whole.
 *
 * ### Why a switch and a box rather than a chip
 *
 * A chip says *proficient* and nothing else, and the shipped reader already
 * draws two facts per row: the mark, and the bonus in mono beside it. A grid of
 * chips could set the first and would leave the second unwritable, so the
 * chip's one press becomes a switch and the number gets a box. The bonus is
 * **typed and not derived**, for the reason the saving throw is: it is the
 * modifier plus a proficiency bonus plus whatever expertise or item the table
 * has handed out, and a wrong number here is one a player reads out loud.
 *
 * ### An unwritten skill is absent, not a nought
 *
 * Saving writes only the rows that are proficient or carry a bonus. Eighteen
 * rows of nothing would fill the panel with a list of what this character is
 * *not* good at, which is the same call the coin piles and the encounter card's
 * absent count already make.
 */
export function SkillsDialog({
  owned,
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
  readonly onClose: () => void;
  readonly onSaved: () => void;
  /** Re-read the sheet after a stale-version refusal; see `SaveFailure`. */
  readonly onReload?: () => void;
}) {
  const character = owned.character;
  const [drafts, setDrafts] = useState<ReadonlyArray<SkillDraft>>(() =>
    skillDrafts(character.sheet.skills ?? []),
  );
  const { busy, failure, submit } = useMutation();

  const setDraft = (name: string, patch: Partial<SkillDraft>) =>
    setDrafts((current) =>
      current.map((draft) => (draft.name === name ? { ...draft, ...patch } : draft)),
    );

  const proficient = drafts.filter((draft) => draft.proficient).length;

  /**
   * *Animal Handling* and *Sleight of Hand* have spaces in them, and an `id`
   * may not — a `<label for>` still finds it and the accessible name still
   * resolves, but `#skill-proficient-Animal Handling` is not a selector, so
   * anything reaching for the control by id (a test, a driver, `:focus-visible`
   * tooling) silently misses it. The name is the label's job; the id is only a
   * handle.
   */
  const handle = (name: string) => `skill-proficient-${name.replace(/\s+/g, "-").toLowerCase()}`;

  const save = async () => {
    const saved = await submit(
      (client) =>
        saveOwnCharacter(client, character, {
          sheet: sheetWith(character, { skills: skillsFrom(drafts) }),
        }),
      ownCharacterWrites(owned),
    );
    if (Result.isSuccess(saved)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Edit your skills">
        <DialogHeader>
          <DialogTitle>Skills</DialogTitle>
          <DialogDescription>
            Mark what you are proficient in, and write the bonus you add. A skill with neither is
            not saved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto px-gutter py-3">
          <p className="mb-1 text-caption leading-body text-muted-foreground">
            {proficient === 1 ? "1 proficient skill." : `${String(proficient)} proficient skills.`}
          </p>
          {drafts.map((draft) => (
            <div
              key={draft.name}
              className="flex flex-wrap items-center gap-2.5 border-b border-hairline py-2 last:border-b-0"
            >
              <Switch
                id={handle(draft.name)}
                checked={draft.proficient}
                onCheckedChange={(next) => setDraft(draft.name, { proficient: next })}
              />
              {/* The name labels the switch, so the row is one target and a
                  screen reader hears the skill for the control that marks it —
                  the `Switch` + `Label` pair `VisibilityField` already uses. */}
              <label
                htmlFor={handle(draft.name)}
                className="min-w-0 flex-1 cursor-pointer text-body-s leading-none text-foreground"
              >
                {draft.name}
              </label>
              {draft.ability !== "" && (
                <span className="text-micro leading-none text-faint">{draft.ability}</span>
              )}
              <Input
                mono
                aria-label={`${draft.name} bonus`}
                placeholder="+0"
                value={draft.bonus}
                onChange={(event) => setDraft(draft.name, { bonus: event.target.value })}
                className="w-20"
              />
            </div>
          ))}
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
            {busy ? "Saving…" : "Save skills"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
