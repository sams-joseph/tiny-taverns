import type { OwnedCharacter } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { abilitiesFrom, abilityDrafts, badScores, type AbilityDraft } from "./abilities";
import { AbilityFields } from "./AbilityFields";
import { ownCharacterWrites, saveOwnCharacter, sheetWith } from "./write";

/**
 * The two dialogs over the six cells — **one editor, two things to do with what
 * comes out of it.**
 *
 * `AbilityFields` is the editor and is shared whole; these are the shells. They
 * are side by side in one file precisely so the difference between them is
 * readable at a glance, and the difference is entirely in what *Save* means:
 *
 * | shell                     | on save                                          |
 * | ------------------------- | ------------------------------------------------ |
 * | {@link AbilitiesDialog}   | `PATCH /me/characters/:id`, with busy and failure |
 * | {@link AbilityScoresDialog} | hands the drafts back; nothing has been sent    |
 *
 * They are not one component with an optional mutation because the mutation is
 * most of what the sheet's shell *is* — the busy label, the disabled buttons and
 * `SaveFailure` are all it, and a create form that has no row yet has nothing
 * for any of them to be about.
 */

/**
 * The six cells — `sheet.abilities`, behind the Stats tab's *Edit*.
 *
 * **The gap this closes was a shipped one and was not Hob's.** `AGENTS.md`
 * records the matching absence on the creature side (*"ability cells are
 * preserved and not editable, and that is a gap rather than a decision"*), and
 * on the character sheet it was sharper: `CharacterDialog` writes no abilities
 * at all, so every character the product has ever made had six cells nobody
 * could type a first value into.
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
 * ### Saving here does not move the hit points or the armour class
 *
 * By the captain's *seed, never recompute* decision: `seedFor` runs once, when
 * a character is made, and `ac`/`hp_max` are ordinary editable columns
 * afterwards. So a score changed here changes the modifier beside it and
 * nothing else, which is not an omission — a locked derived number is wrong the
 * first time somebody buys a shield. `sheetWrites.test.tsx` pins it, because
 * the create form now seeds from these same six and the two rules are one
 * mistake apart.
 */
export function AbilitiesDialog({
  owned,
  onClose,
  onSaved,
}: {
  /**
   * The character with its seats — the seats are the write's blast radius
   * (`ownCharacterWrites` names one party per seat), and the character no
   * longer names a campaign on its own.
   */
  readonly owned: OwnedCharacter;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const character = owned.character;
  const [drafts, setDrafts] = useState<ReadonlyArray<AbilityDraft>>(() =>
    abilityDrafts(character.sheet.abilities),
  );
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();

  const save = async () => {
    setShowProblems(true);
    if (badScores(drafts).length > 0) return;

    const saved = await submit(
      (client) =>
        saveOwnCharacter(client, character, {
          sheet: sheetWith(character, { abilities: abilitiesFrom(drafts) }),
        }),
      ownCharacterWrites(owned),
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
          <AbilityFields drafts={drafts} onChange={setDrafts} showProblems={showProblems} />
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

/**
 * The same six cells on the create form, over a character that does not exist
 * yet.
 *
 * **It writes nothing.** There is no row to `PATCH` and no `sheet` to merge
 * into — the scores are form state until *Create character* sends them as part
 * of one `CharacterOwnCreate`, exactly as the name and the class are. That is
 * also why it has no `SaveFailure`: the only thing that can be refused here is
 * a score out of range, which is said in the row it is in.
 *
 * **Why a dialog rather than six cells on the form.** The shipped idiom for
 * these six is a dialog, and the form is already a card of nine fields — six
 * more rows of four controls inline would bury the two boxes they exist to
 * seed. Reusing the shape is also what makes *"the abilities editor"* one thing
 * a player learns once, on whichever surface they meet it first.
 */
export function AbilityScoresDialog({
  drafts: initial,
  onClose,
  onDone,
}: {
  readonly drafts: ReadonlyArray<AbilityDraft>;
  readonly onClose: () => void;
  readonly onDone: (next: ReadonlyArray<AbilityDraft>) => void;
}) {
  const [drafts, setDrafts] = useState<ReadonlyArray<AbilityDraft>>(initial);
  const [showProblems, setShowProblems] = useState(false);

  const done = () => {
    setShowProblems(true);
    if (badScores(drafts).length > 0) return;
    onDone(drafts);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Set your ability scores">
        <DialogHeader>
          <DialogTitle>Ability scores</DialogTitle>
          <DialogDescription>
            The hit points and armour class on the form are worked out from these. Leave them blank
            and you get the class hit die and a bare 10 — you can come back to them any time.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-gutter py-3">
          <AbilityFields drafts={drafts} onChange={setDrafts} showProblems={showProblems} />
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={done}>
            Use these scores
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
