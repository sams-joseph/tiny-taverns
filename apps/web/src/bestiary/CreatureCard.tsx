import type { Creature } from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
} from "@taverns/ui";
import { provenanceOf } from "./provenance";

/**
 * One bestiary entry, as `ui_kits/dm-screen/Bestiary.jsx:38-55` draws it.
 *
 * **The card is the row half of the creature, never the document half.** `AC 17`
 * and `21 hp` here are `creature.ac` and `creature.hp`, the integers that filter
 * and sort; the panel behind *Stat block* is where `"17 (chain shirt, shield)"`
 * lives. Reading the parenthetical onto a card that has to line up in a grid
 * would make the two halves compete for the same space and win nothing.
 *
 * The prototype makes the whole card clickable. It carries a button instead, for
 * the reason `EncounterCard` records: the inline `onClick` on a `<div>` is the
 * visual specification, not the interaction, and a card is not a control.
 */

/**
 * `"Small Humanoid"` — the two parts the contract stores separately, put back
 * together here because this card is the reason they are separate
 * (`Creature.ts`). Both stay capitalised: it is the DM's own vocabulary,
 * rendered as written.
 */
const typeLine = (creature: Creature): string =>
  creature.size === null || creature.size === ""
    ? creature.type
    : `${creature.size} ${creature.type}`;

export function CreatureCard({
  creature,
  onEdit,
  onOpen,
}: {
  readonly creature: Creature;
  /**
   * Open this row for editing — **the Library passes it, the campaign bestiary
   * does not**, and neither passes it for a row its reader cannot write.
   *
   * The Library is where a monster is authored, so a card there carries the way
   * in; the campaign bestiary is a browse screen over copies and has never had
   * an authoring path. A bundled row gets none in either list, which is the
   * shipped predicate rendered rather than restated: `libraryRowWritable` is
   * `libraryRowReadable` with the bundle's disjunct removed, and `accountId` on
   * the wire is how a screen knows which side of that a row is on
   * (`provenance.ts`'s `isLibraryEntity`).
   */
  readonly onEdit?: () => void;
  readonly onOpen: () => void;
}) {
  const provenance = provenanceOf(creature);

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <CardTitle className="min-w-0 flex-1 break-words">{creature.name}</CardTitle>
          {creature.legendary && <Badge variant="info">Legendary</Badge>}
          <Badge>CR {creature.cr}</Badge>
        </div>
        <CardDescription className="font-serif italic">{typeLine(creature)}</CardDescription>
      </CardHeader>

      <CardContent className="mt-auto flex flex-col gap-2.5 border-t border-hairline pt-3">
        <div className="flex flex-wrap items-center gap-3.5 font-mono text-mono leading-snug font-medium text-foreground">
          <span>AC {creature.ac}</span>
          <span>{creature.hp} hp</span>
          <span className="ml-auto flex flex-wrap justify-end gap-1.5">
            {creature.environments.map((environment) => (
              <Badge key={environment} variant="outline">
                {environment}
              </Badge>
            ))}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Which corpus this row is from. `authored` earns none — see
              `provenance.ts`; absence is what says "yours". */}
          {provenance.badge !== undefined && <Badge variant="secondary">{provenance.badge}</Badge>}
          {/* Every row defaults to `dm`, so the exception is what is worth
              marking: this one is visible to players. */}
          {creature.visibility === "shared" && <Badge variant="info">Shared</Badge>}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            aria-label={`Stat block for ${creature.name}`}
            onClick={onOpen}
          >
            <Icon name="scroll-text" size={13} />
            Stat block
          </Button>
          {/* Beside the reader rather than inside it: opening the form from
              within the stat block dialog would be a modal over a modal, which
              the design system forbids and which `CombatantDialog` already
              records as the reason removal lives in the form it does. */}
          {onEdit !== undefined && (
            <Button variant="ghost" size="sm" aria-label={`Edit ${creature.name}`} onClick={onEdit}>
              <Icon name="pencil" size={13} />
              Edit
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
