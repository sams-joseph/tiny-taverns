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
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { ownCharacterWrites } from "./write";

/**
 * Throwing away a character of your own — **the product's first character
 * delete on screen, and the reason it is here rather than anywhere else.**
 *
 * `DELETE /me/characters/:characterId` shipped with slice 1 and had no caller:
 * the DM's `characters.remove` has never had one either, so until now nothing
 * in the product deleted a character at all. That was defensible while every
 * `character` row was typed by a DM who could already remove it in `psql`.
 * It stopped being defensible the moment Hob could draft one: a player who
 * describes somebody, keeps the draft and then changes their mind owns a real
 * row, and the honest remedy is a way to take it back rather than an apology
 * in a comment.
 *
 * **It is not a leak while it sits there**, which is why this is a remedy and
 * not a fix: a new character is unseated, so no campaign party reads it until
 * the owner explicitly adds it to a campaign.
 *
 * ### Really deleted, and the dialog says so
 *
 * Unlike a campaign — which is *two years of Thursday nights* and is archived
 * rather than deleted (`campaign/ArchiveDialog.tsx`) — a character row goes.
 * There is no `archived_at` on `character` and no restore, so the confirmation
 * has to name the character and say the word: the check a control on a page
 * full of other controls cannot make.
 *
 * ### What it does not touch, and what that means
 *
 * A combatant seeded from this character snapshots every displayable field and
 * reads nothing back (`repo/EncounterRuns.ts`), so a fight in progress keeps
 * the row it is drawing — `combatant.character_id` is `on delete set null` and
 * is provenance rather than an access path. The dialog says that rather than
 * implying the character vanishes from a night that is happening.
 *
 * `ownRowWritable` is the predicate, the same one the sheet's every edit
 * composes: yours, at a table you are a live member of, through a credential
 * that reaches it, while the DM has shared it. So there is nothing to check
 * here — a character on this screen is one this account may remove, by the same
 * clauses that let it be edited.
 */
export function DeleteCharacterDialog({
  owned,
  onClose,
  onDeleted,
}: {
  /**
   * The character with its seats — the seats are the write's blast radius
   * (`ownCharacterWrites` names one party per seat), and the character no
   * longer names a campaign on its own.
   */
  readonly owned: OwnedCharacter;
  readonly onClose: () => void;
  /** The row is gone; the screen has nothing left to draw. */
  readonly onDeleted: () => void;
}) {
  const character = owned.character;
  const { busy, failure, submit } = useMutation();

  const remove = async () => {
    const done = await submit(
      (client) => client.me.deleteCharacter({ params: { characterId: character.id } }),
      // The same two reads every write to this row names: this account's roster,
      // and the campaign's party list — a DM's screen, which this write has
      // never seen and reaches by naming the resource rather than the screen.
      ownCharacterWrites(owned),
    );
    if (Result.isSuccess(done)) onDeleted();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Delete a character">
        <DialogHeader>
          <DialogTitle>Delete {character.name}?</DialogTitle>
          <DialogDescription>
            The sheet goes, and it does not come back. There is no archive for a character the way
            there is for a campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            Your DM will stop seeing them on the party screen.
          </p>
          <p className="text-body-s leading-body text-muted-foreground">
            A fight already on the table keeps whatever it was drawing — the initiative row is a
            copy your DM made when the fight started, not a view of this sheet.
          </p>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep them
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete them"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
