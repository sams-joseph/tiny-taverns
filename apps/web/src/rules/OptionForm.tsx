import type { CharacterOption, OptionKind } from "@taverns/api";
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
import type { TavernsClient } from "../api/client";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { OptionFields } from "./OptionFields";
import { documentOf, draftFrom, NOUN, problemsIn, refuses, type OptionDraft } from "./optionDraft";

/**
 * Writing a class, a race or a background **into your library** — in no
 * campaign at all.
 *
 * The captain's model puts authoring here and nowhere else: writing a class is
 * not an act inside a campaign, and using one at a table copies it in. So this
 * form names no campaign, sends `OptionLibraryCreate` / `OptionLibraryUpdate`,
 * and is the second authoring surface over `character_option` — the other being
 * `OptionDialog`, which authors *and* copies in one press because a DM standing
 * on a campaign's Rules screen means both.
 *
 * **It is `CreatureForm`'s counterpart**, one table across, and it is shaped
 * the same way for the same reasons: create, edit and delete in one dialog; no
 * second confirmation over the delete (`CombatantDialog`'s rule — a modal over
 * a modal, which the design system forbids and which nobody reads anyway); and
 * the line beside that button is the part that matters.
 *
 * ### The three things it does not write, and why each absence is the decision
 *
 * - **`visibility`.** `OptionLibraryCreate` has no field for it and neither
 *   does the update. A row's visibility says which of a *campaign's* players
 *   may read it, and an original is in no campaign — there is nobody for it to
 *   be hidden from. The copy `derive` makes takes the visibility the copy-in
 *   control names, not one inherited from here.
 * - **`kind`.** Not on `OptionLibraryUpdate` and it cannot be: a class that
 *   became a race would carry a document its own column contradicts. The
 *   kind is chosen once, when the row is written, and is what the row *is*.
 * - **`origin`.** No payload in the product carries it. Provenance is the
 *   server's to state.
 *
 * ### The snapshot is what this form has to say out loud
 *
 * Editing an original here reaches **no campaign that has already copied it**,
 * and deleting one leaves every copy standing with `derivedFrom` gone null.
 * That is the single most likely confusion the whole feature creates, and it is
 * said in the same words `CopyOptionIn` and `CreatureForm` use rather than in
 * new ones — a DM who reads one sentence in the copy-in dialog and a different
 * one here has to work out whether they mean the same thing.
 */
export function OptionForm({
  kind,
  option,
  onClose,
  onSaved,
}: {
  /** Which kind is being written. Ignored when `option` is present — the row says. */
  readonly kind: OptionKind;
  /** Absent for a new one. Present, and this edits that original. */
  readonly option: CharacterOption | undefined;
  readonly onClose: () => void;
  /** Re-reads the list: a new, edited or deleted row changes its shape. */
  readonly onSaved: () => void;
}) {
  const writing = option?.kind ?? kind;
  const [draft, setDraft] = useState<OptionDraft>(() => draftFrom(option));
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();

  const problems = problemsIn(writing, draft);
  const isNew = option === undefined;
  const noun = NOUN[writing];

  const save = async () => {
    setShowProblems(true);
    if (refuses(problems)) return;

    const name = draft.name.trim();
    const written = documentOf(writing, draft);

    // Branched rather than handed a computed payload, for the reason
    // `OptionDialog` gives: the payload is a union discriminated on `kind`, and
    // TS will not resolve a union *value* against it. Narrowing `written` first
    // is what makes this cast-free — `written.body` really is a class document
    // inside the first arm.
    const write = (client: TavernsClient) => {
      if (option !== undefined) {
        return client.library.updateOption({
          params: { optionId: option.id },
          // The whole document, not a patch of one key — `OptionLibraryUpdate.body`
          // is whole for the reason `CreatureUpdate.statBlock` is.
          payload: { name, body: written.body },
        });
      }
      switch (written.kind) {
        case "class":
          return client.library.createOption({
            payload: { kind: "class", name, body: written.body },
          });
        case "race":
          return client.library.createOption({
            payload: { kind: "race", name, body: written.body },
          });
        case "background":
          return client.library.createOption({
            payload: { kind: "background", name, body: written.body },
          });
      }
    };

    const saved = await submit(
      write,
      // **The Library, and only the Library.** Editing an original does not
      // reach the copies a campaign already holds — that is the captain's
      // model, so a campaign's Rules screen that is stale after this write is
      // not stale, it is looking at a snapshot. Naming a campaign's options
      // here would refresh a list that genuinely did not move.
      [reads.libraryOptions],
    );

    if (Result.isSuccess(saved)) onSaved();
  };

  const remove = async () => {
    if (option === undefined) return;
    // **Copies already in campaigns stay where they are** — the line beside
    // this button says so, and it is why no campaign's list is named here.
    // `derived_from` goes null and the copy stands.
    const gone = await submit(
      (client) => client.library.removeOption({ params: { optionId: option.id } }),
      [reads.libraryOptions],
    );
    if (Result.isSuccess(gone)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={isNew ? `Write a ${noun}` : `Edit ${option.name}`}>
        <DialogHeader>
          <DialogTitle>{isNew ? `Write a ${noun}` : `Edit ${option.name}`}</DialogTitle>
          <DialogDescription>
            {isNew
              ? `It lives in your library, in no campaign. Copy it into a table when you want characters built from it.`
              : `This is your library's original. Editing it does not change any campaign that has already copied it.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <OptionFields
            kind={writing}
            draft={draft}
            problems={problems}
            showProblems={showProblems}
            onChange={setDraft}
          />

          {/* The snapshot, in the same words `CopyOptionIn` uses. Said here
              because this is the screen where a DM would most reasonably
              expect an edit to travel — it is the one place the original
              lives, so it reads like the source of truth, and it is not. */}
          <p className="text-caption leading-body text-muted-foreground">
            {isNew
              ? `A campaign takes its own copy of this ${noun} when you bring it in, and keeps it as it was on the day. Editing here afterwards will not change that table.`
              : `A copy is a snapshot. Campaigns that already have this ${noun} keep theirs exactly as it is, and every character already made from one keeps the numbers they were made with.`}
          </p>
        </div>

        {/* In the footer, not at the end of the body: the body scrolls, and a
            line appended below the fold is one a DM never sees. */}
        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          {!isNew && failure === undefined && (
            <div className="mr-auto flex min-w-0 flex-1 flex-col items-start gap-1">
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
                Delete
              </Button>
              {/* The captain's decision of 2026-08-14, one table across and
                  rendered rather than hidden: a copy is a snapshot and nothing
                  is read through `derived_from`, so the copies stay and simply
                  stop pointing back. A DM who expected them to go would find
                  out by looking. */}
              <span className="text-caption leading-body text-faint">
                Copies already in your campaigns stay where they are.
              </span>
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : isNew ? "Add to your library" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
