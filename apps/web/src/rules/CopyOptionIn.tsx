import type { CampaignId, CharacterOption, OptionKind } from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { EmptyState } from "../ui/states";
import { optionWritesAt } from "./load";
import { numbersOf } from "./option";

/**
 * Bringing a class, a species or a background this account has already written
 * into **this** campaign — statement 3 of the captain's Library model, over the
 * second table that carries it.
 *
 * > when you use them in a campaign they are copied in […] the campaign is a
 * > copied state of the entity
 *
 * The list is the account's originals: the bundle, plus everything it has
 * authored. `OptionDialog` writes a *new* one and copies it in one press; this
 * is the other half — reusing one, at a second table, or picking one back up
 * after a copy was removed.
 *
 * ### Three things it says out loud, because all three surprise people
 *
 * - **A copy is a snapshot.** Editing the original afterwards does not reach
 *   this table, and editing this table's copy does not reach the original.
 *   Nothing is ever read through `derivedFrom`.
 * - **It lands shared.** `corpusRowReadable` ends in
 *   `isDm OR visibility = 'shared'`, so a copy nobody can see is a class no
 *   player can pick — and the create form's pickers are a player's screen. The
 *   column default is untouched; this control names `shared` on the wire, and
 *   the row's own switch is on the card afterwards.
 * - **Copying again makes a second copy.** `derive` has no uniqueness rule and
 *   nothing refuses it. A button that looks idempotent and is not is worse than
 *   one that says so — and two of something in one campaign is occasionally
 *   what a DM wants while they work out which they are keeping.
 */

/** What the badge on a row says. One map, so the three cannot drift apart. */
const KIND_LABEL: Record<OptionKind, string> = {
  class: "Class",
  species: "Species",
  background: "Background",
};

export function CopyOptionIn({
  campaignId,
  originals,
  offered,
  onClose,
  onCopied,
}: {
  readonly campaignId: CampaignId;
  /** This account's Library: the bundle, plus what it has written. */
  readonly originals: ReadonlyArray<CharacterOption>;
  /** What the campaign already holds — used to say what is already here. */
  readonly offered: ReadonlyArray<CharacterOption>;
  readonly onClose: () => void;
  readonly onCopied: () => void;
}) {
  const [copying, setCopying] = useState<CharacterOption>();
  const { busy, failure, submit } = useMutation();

  /**
   * The bundle is dropped, and that is not a filter over a leak — it is the one
   * thing this control genuinely cannot do anything useful with.
   *
   * A bundled option belongs to **every** campaign already: `corpusRowReadable`
   * reads the unowned rows through whatever campaign is in the path, so
   * "Druid" is on this table's list without anybody copying it. Offering to
   * copy one would make a second Druid that shadows the first, which is a
   * thing `derive` will happily do and nobody wants by accident.
   */
  const mine = originals.filter((option) => option.accountId !== null);

  const alreadyHere = (option: CharacterOption): boolean =>
    offered.some((row) => row.kind === option.kind && row.name === option.name);

  const copy = async (option: CharacterOption) => {
    setCopying(option);
    const made = await submit(
      (client) =>
        client.options.derive({
          params: { campaignId, optionId: option.id },
          // Said out loud, exactly as `OptionDialog` says it. A rules entry no
          // player can pick is not a rules entry.
          payload: { visibility: "shared" },
        }),
      // The campaign gains a row; the Library does not lose one. Both are named
      // because the Library list under this dialog is what a second copy would
      // be made from, and it should say what it says after a write.
      optionWritesAt(campaignId),
    );
    if (Result.isSuccess(made)) onCopied();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Copy from your library">
        <DialogHeader>
          <DialogTitle>Copy from your library</DialogTitle>
          <DialogDescription>
            The classes, species and backgrounds you have written. Bringing one in gives this table
            its own copy of it as it is now.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-gutter py-3">
          {mine.length === 0 ? (
            <EmptyState icon="book-open" title="Nothing in your library yet">
              Write a class, a species or a background with the buttons on this screen and it lands
              here as well as on this table — so the next campaign you run can take a copy of it.
            </EmptyState>
          ) : (
            mine.map((option) => (
              <Card key={option.id} tone="raised">
                <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-body leading-snug font-semibold text-heading">
                      {option.name}
                      <Badge variant="secondary">{KIND_LABEL[option.kind]}</Badge>
                    </p>
                    <p className="text-caption leading-body text-muted-foreground">
                      {numbersOf(option)}
                      {alreadyHere(option) ? " · already on this table" : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    // The visible word repeated down a list is one control as
                    // far as anything reading names is concerned — the trap the
                    // sheet's six ability cells already record. The visible
                    // text is kept as the prefix, so anything driving by what
                    // it can see still matches.
                    aria-label={`Copy in ${option.name}`}
                    disabled={busy}
                    onClick={() => void copy(option)}
                  >
                    <Icon name="copy" size={13} />
                    {busy && copying?.id === option.id ? "Copying…" : "Copy in"}
                  </Button>
                </CardContent>
              </Card>
            ))
          )}

          <p className="text-caption leading-body text-muted-foreground">
            A copy is a snapshot. Editing your library's original afterwards will not change this
            table, and editing this table's copy will not change your original. Copying the same one
            again makes a second copy.
          </p>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
