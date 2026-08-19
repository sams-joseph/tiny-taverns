import type { AccountId, CampaignId, CampaignMember, Character, CharacterId } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure } from "../ui/form";

/**
 * Whose character is whose — the write that makes the roster's central
 * distinction reachable.
 *
 * `character.account_id` was a column no predicate named until it became the one
 * pointer in the product that is read *through*; assigning it is a DM's act and
 * has **its own endpoint** rather than a field on the PATCH, because the PATCH
 * is where a player's own edits will land and the owner of a row is precisely
 * the field that must not travel on a payload a player can send. That decision
 * is why this dialog exists at all instead of a select on `CharacterDialog`.
 *
 * ### Why the whole thing is here rather than an "assign" row action
 *
 * Both directions belong together. Giving somebody a character and taking it
 * back are the same fact written twice, and a screen that could only do the
 * first would make a mistyped assignment unfixable from the only screen that
 * shows it. `null` unassigns, which is the endpoint's own second meaning.
 *
 * ### It offers only unassigned characters
 *
 * Taking somebody else's character away by giving it to a second person is a
 * thing to do deliberately, one press at a time: unassign it on their row, then
 * give it here. So the list is the characters nobody holds, plus this member's
 * own — and when there are none it says where characters are written down rather
 * than showing an empty select.
 */

export function AssignDialog({
  campaignId,
  member,
  characters,
  onClose,
  onSaved,
}: {
  readonly campaignId: CampaignId;
  readonly member: CampaignMember;
  /** Every character in the campaign; the split is made here. */
  readonly characters: ReadonlyArray<Character>;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const theirs = characters.filter((character) => character.accountId === member.accountId);
  const spare = characters.filter((character) => character.accountId === null);
  /**
   * A plain string, and the character is found from it — `Select`'s value is
   * `string`, and threading a branded id through it would be a cast rather than
   * a decode. The row itself is what the write needs anyway.
   */
  const [chosen, setChosen] = useState("");
  const pick = spare.find((character) => character.id === chosen);

  const assign = async (characterId: CharacterId, accountId: AccountId | null) => {
    const saved = await submit(
      (client) =>
        client.characters.assign({
          params: { campaignId, characterId },
          // The account is the member's, never a value this form composed: the
          // server refuses one that is not a live member of this campaign, and
          // there is nowhere here to type a different one.
          payload: { accountId },
        }),
      // The characters, and nothing else. **The roster's `playing` status is
      // derived from this list joined to the members** — assigning flips a row
      // without any member row changing — so refreshing the characters is what
      // redraws it, and the members do not have to be re-read to say so.
      [reads.characters(campaignId)],
    );
    if (Result.isSuccess(saved)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Characters for ${member.name}`}>
        <DialogHeader>
          <DialogTitle>{member.name}&rsquo;s character</DialogTitle>
          <DialogDescription>
            A character belongs to one account. Whoever holds it reads their own sheet in full, even
            while the rest of the party&rsquo;s stay private to you.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          {theirs.length > 0 && (
            <div className="flex flex-col">
              <span className="pb-1 text-label leading-snug font-semibold text-heading">
                Theirs now
              </span>
              {theirs.map((character) => (
                <div
                  key={character.id}
                  className="flex flex-wrap items-center gap-2.5 border-b border-hairline py-2.5 last:border-b-0"
                >
                  <Icon name="shield" size={15} className="text-faint" />
                  <span className="min-w-0 flex-1 truncate text-body-s leading-body text-foreground">
                    {character.name}
                    {character.descriptor !== null && character.descriptor !== "" && (
                      <span className="text-muted-foreground"> · {character.descriptor}</span>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void assign(character.id, null)}
                  >
                    <Icon name="unlink" size={14} />
                    Take it back
                  </Button>
                </div>
              ))}
            </div>
          )}

          {spare.length === 0 ? (
            <p className="text-body-s leading-body text-muted-foreground">
              {theirs.length === 0
                ? "No character in this campaign is unassigned."
                : "Nothing else is unassigned."}{" "}
              Write one down on the campaign&rsquo;s{" "}
              <Link
                to="/campaigns/$campaignId"
                params={{ campaignId }}
                className="text-link underline decoration-hairline underline-offset-2 hover:text-link-hover"
              >
                Party tab
              </Link>{" "}
              and it can be given to somebody here.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <Field
                label="Give them one"
                htmlFor="assign-character"
                hint="Only characters nobody holds are listed."
              >
                <Select value={chosen} onValueChange={(value) => setChosen(String(value))}>
                  <SelectTrigger id="assign-character" className="w-full">
                    {/* Written out: `SelectValue` with neither `items` nor
                        children serialises the value, which here is a uuid. */}
                    <SelectValue>
                      {(value) =>
                        spare.find((character) => character.id === value)?.name ??
                        "Choose a character"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {spare.map((character) => (
                      <SelectItem key={character.id} value={character.id}>
                        {character.name}
                        {character.descriptor !== null && character.descriptor !== ""
                          ? ` · ${character.descriptor}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button
                size="sm"
                className="self-start"
                disabled={busy || pick === undefined}
                onClick={() => pick !== undefined && void assign(pick.id, member.accountId)}
              >
                <Icon name="user-plus" size={14} />
                {busy ? "Saving…" : "Give it to them"}
              </Button>
            </div>
          )}

          {failure !== undefined && <SaveFailure failure={failure} />}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
