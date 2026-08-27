import type { CharacterOption } from "@taverns/api";
import { Badge, Button, Card, CardContent, Icon } from "@taverns/ui";
import { numbersOf, ownerOf } from "./option";

/**
 * One class or species, as a row on either list over this table.
 *
 * **The Rules screen and the Library screen share it**, the way `CreatureCard`
 * is shared by the campaign bestiary and the monster Library, and for the same
 * reason: what a row *is* — its name, the numbers a character is seeded from,
 * the sentence under it — is one question, and two cards would answer it twice.
 *
 * ### What differs between the two lists is not a flag
 *
 * - **The verbs are the caller's.** `onEdit` and `onRemove` are passed for the
 *   rows that reader may act on and omitted otherwise, which is the shipped
 *   write predicate rendered rather than restated — `isCampaignCopy` on the
 *   campaign's list, `isLibraryOriginal` on the Library's. The Library passes
 *   no `onRemove` at all: deleting an original lives inside `OptionForm`, next
 *   to the sentence about what happens to the copies.
 * - **The sharing line is drawn exactly when the row is a campaign's**, which
 *   is not a screen flag but the true rule: `visibility` says which of a
 *   *campaign's* players may read a row, so on an original — which is in no
 *   campaign, and whose column sits at its `dm` default because nothing writes
 *   it — it is not a fact about anybody. Drawn there it would mark every row a
 *   DM had ever written as hidden from players who could never have seen it.
 *
 * What a card says about a row is decided by **who owns it**, never by `origin`
 * — `ownerOf` in `option.ts` is where that is written, along with the reason it
 * matters.
 */

export function OptionCard({
  option,
  onEdit,
  onRemove,
}: {
  readonly option: CharacterOption;
  /** Open this row for editing. Absent for a row this reader may not write. */
  readonly onEdit?: () => void;
  /** Take it off this table. The campaign's list passes it; the Library does not. */
  readonly onRemove?: () => void;
}) {
  const owner = ownerOf(option);
  const unshared = owner === "campaign" && option.visibility === "dm";

  return (
    <Card tone="raised">
      {/* `py-3` rather than the card's own bottom padding: a vocabulary is
          thirty-eight rows long at a table that has copied nothing in, and a card
          shaped for a stat block would make it a page nobody reads to the end
          of. The grid this sits in is the screen's. */}
      <CardContent className="flex flex-wrap items-start gap-x-3 gap-y-2.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-body leading-snug font-semibold text-heading">
            {option.name}
            {/* **Absence is what says "this is yours"**, the same call
                `bestiary/provenance.ts` makes about an authored creature: a
                badge on every row would say nothing. So only the two things a
                reader has to know are drawn — that a row is not theirs to edit,
                and that a row their players cannot see is one nobody can pick. */}
            {owner === "bundle" && <Badge variant="secondary">Standard</Badge>}
            {unshared && (
              <Badge variant="outline">
                <Icon name="lock" size={11} />
                Not shared
              </Badge>
            )}
          </p>
          <p className="text-caption leading-body text-muted-foreground">{numbersOf(option)}</p>
          {option.body.summary !== undefined && option.body.summary !== "" && (
            <p className="mt-1.5 max-w-measure text-body-s leading-body text-muted-foreground">
              {option.body.summary}
            </p>
          )}
          {unshared && (
            <p className="mt-1.5 text-caption leading-body text-muted-foreground">
              Nobody at this table can pick it until you share it.
            </p>
          )}
        </div>

        {(onEdit !== undefined || onRemove !== undefined) && (
          <div className="flex shrink-0 items-center gap-2">
            {onEdit !== undefined && (
              <Button variant="ghost" size="sm" aria-label={`Edit ${option.name}`} onClick={onEdit}>
                <Icon name="pencil" size={13} />
                Edit
              </Button>
            )}
            {onRemove !== undefined && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${option.name} from this table`}
                onClick={onRemove}
              >
                <Icon name="trash-2" size={13} />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
