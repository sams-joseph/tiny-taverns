import type { OwnedCharacter } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Loading,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { ArtifactCard } from "../hob/ArtifactCard";
import { artifactFrom } from "../hob/transcript";
import { Field, SaveFailure, Textarea } from "../ui/form";
import { CHOOSE_FOR_ME, useLevelUpDraft } from "./levelUpDraft";
import { levelUpWrites } from "./write";

/**
 * **Asking Hob to choose the next level** — the sheet's level-up composer,
 * beside *Level up*, for the same one level.
 *
 * The owner says what matters to them (or nothing: Hob chooses for the
 * character as it stands), Hob reads the offer and proposes every choice it
 * asks for, and the card says what keeping it applies. *Keep it* is the
 * accept: the server applies the proposal it stored, through the wizard's own
 * write, with the version the offer was read at, so a sheet changed since is
 * refused and *Reload* reads it again. *Discard* turns the offer down. Asking
 * again with a correction continues the same conversation, and Hob offers
 * the whole level again.
 *
 * Hob takes the fixed hit points; a roll, or a choice of the owner's own, is
 * the wizard's.
 */
export function HobLevelUpDialog({
  owned,
  toLevel,
  onClose,
  onDone,
  onReload,
}: {
  readonly owned: OwnedCharacter;
  /** The level the offer reaches: the one Hob chooses for. */
  readonly toLevel: number;
  readonly onClose: () => void;
  /** The level is kept; the sheet re-reads itself through the write's keys. */
  readonly onDone: () => void;
  /** Read the sheet again, after a refusal that says it moved on. */
  readonly onReload: () => void;
}) {
  const character = owned.character;
  const draft = useLevelUpDraft(character.id);
  const { busy, failure, clear, submit } = useMutation();
  const [text, setText] = useState("");
  const offered = draft.offered;

  const keep = async () => {
    if (offered === undefined) return;
    const kept = await submit(
      (client) =>
        client.meHob.accept({
          params: { threadId: offered.threadId, turnId: offered.turnId },
          payload: {},
        }),
      levelUpWrites(owned),
    );
    if (Result.isSuccess(kept)) onDone();
  };

  const discard = async () => {
    if (offered === undefined) return;
    // A discard changes nothing any screen reads: the card goes, and the
    // proposal stays on its turn as one that was turned down.
    const done = await submit(
      (client) =>
        client.meHob.discard({
          params: { threadId: offered.threadId, turnId: offered.turnId },
          payload: {},
        }),
      [],
    );
    if (Result.isSuccess(done)) draft.forget();
  };

  const ask = () => {
    clear();
    draft.ask(text);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Ask Hob to level up">
        <DialogHeader>
          <DialogTitle>Ask Hob for level {toLevel}</DialogTitle>
          <DialogDescription>
            Hob reads what level {toLevel} offers {character.name} and chooses everything it asks
            for. Nothing changes until you keep it, and the hit points are the fixed value.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-gutter py-3">
          {draft.available === undefined ? (
            <Loading label="Asking whether Hob is here…" inline />
          ) : !draft.available ? (
            <p className="text-body-s leading-body text-muted-foreground">
              No model is configured behind Hob on this server, so there is nothing to ask. Choose
              the level yourself with Level up.
            </p>
          ) : (
            <>
              <Field label="What should Hob weigh?" htmlFor="hob-level-up-ask">
                <Textarea
                  id="hob-level-up-ask"
                  value={text}
                  placeholder={CHOOSE_FOR_ME}
                  maxLength={4000}
                  disabled={draft.asking}
                  onChange={(event) => setText(event.target.value)}
                />
              </Field>
              {draft.activity !== undefined && (
                <p className="text-caption leading-body text-muted-foreground">{draft.activity}</p>
              )}
              {draft.note !== undefined && (
                <p className="text-body-s leading-body whitespace-pre-wrap text-muted-foreground">
                  {draft.note}
                </p>
              )}
              {draft.proposal !== undefined && offered !== undefined && (
                <ArtifactCard
                  artifact={artifactFrom(offered.turnId, draft.proposal)}
                  {...(busy
                    ? {}
                    : {
                        onSave: () => void keep(),
                        onDiscard: () => void discard(),
                      })}
                />
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} onReload={onReload} />
            </div>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          {draft.available === true && (
            <Button size="sm" disabled={draft.asking || busy} onClick={ask}>
              {draft.asking
                ? "Hob is choosing…"
                : draft.proposal === undefined
                  ? "Ask Hob"
                  : "Ask again"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
