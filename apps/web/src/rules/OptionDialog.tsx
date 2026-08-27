import type { CampaignId, CharacterOption, OptionKind, Visibility } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@taverns/ui";
import { Effect, Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { SaveFailure, VisibilityField } from "../ui/form";
import { optionWritesAt } from "./load";
import { OptionFields } from "./OptionFields";
import { documentOf, draftFrom, NOUN, problemsIn, refuses, type OptionDraft } from "./optionDraft";

/**
 * Writing a class, a species or a background **for a campaign**, and editing
 * the one that table holds.
 *
 * ### It is one dialog and **two different writes**, and the difference is the
 * whole shape of the Library model
 *
 * - **Writing a new one is two statements in one `submit`**: it authors the
 *   original into this account's Library, then copies it into this campaign.
 *   The `EncounterDialog` precedent — one form, one `Effect`, two writes —
 *   because two `submit`s would give the form two busy flags and a half-saved
 *   class to explain. There is no `POST /campaigns/:c/options`: authoring
 *   happens in the Library by the captain's second statement, so the campaign
 *   gets a row through `derive` and through nothing else.
 * - **Editing one edits the campaign's copy and nothing else.** The original
 *   stays exactly as it was, which is what the sentence at the bottom of the
 *   form says out loud — see below.
 *
 * **The boxes are `OptionFields`, shared with `OptionForm`** — the Library's
 * own authoring surface, which writes an original with no campaign anywhere
 * near it. What differs between the two shells is the write, the visibility
 * switch and the delete; what must not differ is what a hit die is and whether
 * a background box holding `0` becomes a row, which is why it is one editor
 * rather than two.
 *
 * ### The copy is a snapshot, and this dialog is where that is explained
 *
 * `CopyIntoCampaign` makes the same point about a monster, and it is more
 * surprising here: a DM who fixes a hit die on their table's copy will expect
 * their Library to follow, and it does not. Nothing is ever read through
 * `derivedFrom`, so the two rows part company the moment either is edited. It
 * is said in the form rather than left to be discovered at the table.
 *
 * ### `visibility` is a **visible choice**, sent out loud, and defaults on
 *
 * `corpusRowReadable` ends in `isDm OR visibility = 'shared'`, so a class the
 * players cannot see is a class no player can pick — and the create form's
 * pickers are a player's screen. For a monster that gate is the whole point of
 * the feature; for a rules entry it is friction, and a table's classes are not
 * secrets the way a stat block is.
 *
 * So this is the **one form in the product whose visibility switch starts on**,
 * and it is a screen-level choice rather than a changed column default: the
 * payload says `visibility: "shared"` in as many words, exactly as
 * `CharacterDialog` says `dm` in as many words. Nothing in
 * `repo/visibility.ts` moved, `dm` is still what an unstated visibility means
 * everywhere, and a DM with a class they are not ready to show turns the switch
 * off and it behaves like everything else.
 *
 * It is held **beside** the draft rather than inside it, because the Library
 * shell has no such field at all: `OptionLibraryCreate` and
 * `OptionLibraryUpdate` carry no `visibility`, since an original is in no
 * campaign and there is nobody for it to be hidden from.
 */

/** What the description under the title says. One map, so the three agree. */
const BLURB: Record<OptionKind, string> = {
  class: "A class carries the hit die a new character's hit points are worked out from.",
  species: "A species carries the extra hit points it gives at every level.",
  background: "A background carries the ability score increases a new character starts with.",
};

export function OptionDialog({
  campaignId,
  kind,
  option,
  onClose,
  onSaved,
}: {
  readonly campaignId: CampaignId;
  /** Which kind is being written. Not editable — see `OptionUpdate`. */
  readonly kind: OptionKind;
  /** The campaign's copy being edited, or `undefined` to write a new one. */
  readonly option: CharacterOption | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [draft, setDraft] = useState<OptionDraft>(() => draftFrom(option));
  // **On for a new one, and this is the decision** — see the block above.
  const [visibility, setVisibility] = useState<Visibility>(option?.visibility ?? "shared");
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();

  const problems = problemsIn(kind, draft);

  const isNew = option === undefined;
  const noun = NOUN[kind];

  const save = async () => {
    setShowProblems(true);
    if (refuses(problems)) return;

    const name = draft.name.trim();
    const written = documentOf(kind, draft);

    const saved = await submit(
      (client) =>
        Effect.gen(function* () {
          if (option !== undefined) {
            return yield* client.options.update({
              params: { campaignId, optionId: option.id },
              payload: { name, body: written.body, visibility },
            });
          }

          // **Two writes, one `Effect`.** Authoring is a Library act; using it
          // here is a copy. Two separate `submit`s would give this form two busy
          // flags and a half-saved class to explain — a DM who wrote one and
          // then found it was not on their table.
          //
          // There is no transaction across requests, so a failure between the
          // two leaves the original in the Library and the table without it.
          // That is the honest outcome and it is recoverable in one press —
          // *Copy from your library* is the control for exactly that state —
          // where rolling back with a third request would fail the same way one
          // call later.
          // Branched at the call site rather than handed a computed payload:
          // the endpoint's payload is a union discriminated on `kind`, and TS
          // will not resolve a union *value* against it. Narrowing `written`
          // first is what makes that cast-free — `written.body` really is a
          // class document inside the first arm.
          const original =
            written.kind === "class"
              ? yield* client.library.createOption({
                  payload: { kind: "class", name, body: written.body },
                })
              : written.kind === "species"
                ? yield* client.library.createOption({
                    payload: { kind: "species", name, body: written.body },
                  })
                : yield* client.library.createOption({
                    payload: { kind: "background", name, body: written.body },
                  });
          return yield* client.options.derive({
            params: { campaignId, optionId: original.id },
            // The visible screen-level choice, said out loud on the wire. It is
            // the *only* place a copy's visibility is ever named, which is what
            // keeps `dm` the meaning of an unstated one everywhere else.
            payload: { visibility },
          });
        }),
      // Both lists, always. Authoring touches the Library as well as the
      // campaign, and the copy control's own list would otherwise be one row
      // short until something else refreshed it.
      optionWritesAt(campaignId),
    );

    if (Result.isSuccess(saved)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={isNew ? `Write a ${noun}` : `Edit ${option.name}`}>
        <DialogHeader>
          <DialogTitle>{isNew ? `Write a ${noun}` : `Edit ${option.name}`}</DialogTitle>
          <DialogDescription>{BLURB[kind]}</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <OptionFields
            kind={kind}
            draft={draft}
            problems={problems}
            showProblems={showProblems}
            onChange={setDraft}
          />

          <VisibilityField
            id="option-visibility"
            value={visibility}
            onChange={setVisibility}
            shared={`Your players can pick this ${noun} when they make a character.`}
            hidden={`Only you can see it. No player can pick this ${noun} until you share it.`}
          />

          {/* The snapshot, said where it will be believed. `CopyIntoCampaign`
              makes the same point about a monster; here it is the likeliest
              support question the whole feature creates. */}
          <p className="text-caption leading-body text-muted-foreground">
            {isNew
              ? `This writes the ${noun} into your library and copies it into this campaign. The campaign's copy is a snapshot — editing it here later will not change your library's original, and editing the original will not change this table.`
              : `You are editing this campaign's copy. Your library's original is untouched, and so is every character already made from this ${noun} — they keep the numbers they were made with.`}
          </p>
        </div>

        {/* In the footer, not at the end of the body — the body scrolls. */}
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
            {busy ? "Saving…" : isNew ? `Add ${noun}` : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
