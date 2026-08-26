import type { CharacterOption } from "@taverns/api";
import { Badge, Button, Card, CardContent, Icon } from "@taverns/ui";
import { isCampaignCopy, numbersOf } from "./option";

/**
 * One class or species this table offers, as a row on the Rules screen.
 *
 * What a card says about a row is decided by **who owns it**, never by
 * `origin` — `isCampaignCopy` in `option.ts` is where that is written, along
 * with the reason it matters.
 */

export function OptionCard({
  option,
  onEdit,
  onRemove,
}: {
  readonly option: CharacterOption;
  readonly onEdit: (option: CharacterOption) => void;
  readonly onRemove: (option: CharacterOption) => void;
}) {
  const editable = isCampaignCopy(option);

  return (
    <Card tone="raised">
      <CardContent className="flex flex-wrap items-start gap-x-3 gap-y-2.5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-body leading-snug font-semibold text-heading">
            {option.name}
            {/* **Absence is what says "this table wrote it"**, the same call
                `bestiary/provenance.ts` makes about an authored creature: a
                badge on every row would say nothing. So only the two things a
                DM has to know are drawn — that a row is not theirs to edit, and
                that a row their players cannot see is one nobody can pick. */}
            {!editable && <Badge variant="secondary">Standard</Badge>}
            {editable && option.visibility === "dm" && (
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
          {editable && option.visibility === "dm" && (
            <p className="mt-1.5 text-caption leading-body text-muted-foreground">
              Nobody at this table can pick it until you share it.
            </p>
          )}
        </div>

        {editable && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Edit ${option.name}`}
              onClick={() => onEdit(option)}
            >
              <Icon name="pencil" size={13} />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${option.name} from this table`}
              onClick={() => onRemove(option)}
            >
              <Icon name="trash-2" size={13} />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
