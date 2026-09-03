import type { Creature } from "@taverns/api";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@taverns/ui";
import { DetailBody, DetailSection } from "../ui/detail";
import { provenanceOf } from "./provenance";
import { StatBlockBody } from "./StatBlock";

/**
 * A creature, read.
 *
 * The prototype hangs its stat block in a fixed right-hand panel, because in the
 * prototype there is exactly one and it is always the same creature. Here it is
 * a dialog: the bestiary is a grid a DM scans, the block is what they open when
 * one of them is the answer, and a dialog reads the same at every width — a
 * docked panel would have to be a panel at one width and something else below
 * it, which is two layouts for one thing.
 *
 * **It says where the creature came from, in words.** `Bestiary.jsx` has no such
 * line, and it needs one the moment the list is real rather than a fixture: the
 * same grid holds bundled `system` rows, imported ones and the DM's own, and
 * which it is decides whether they may change it. See `provenance.ts`.
 *
 * **There is no *Edit* here, and that is a layout decision rather than a
 * gap.** The Library authors monsters, but the way in is a button on the card
 * beside *Stat block*: opening a form from inside this dialog would be a modal
 * over a modal, which the design system forbids. There is no copy control
 * either — since the instancing decision of 2026-09-02 a creature is used in a
 * campaign by picking it in the encounter dialog, and the campaign's internal
 * instance is nothing a reader is shown.
 */
export function CreatureDialog({
  creature,
  onClose,
}: {
  readonly creature: Creature;
  readonly onClose: () => void;
}) {
  const provenance = provenanceOf(creature);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`${creature.name} stat block`}>
        <DialogHeader>
          <div className="flex flex-wrap items-start gap-2.5 pr-8">
            <DialogTitle className="min-w-0 flex-1 break-words">{creature.name}</DialogTitle>
            {creature.legendary && <Badge variant="info">Legendary</Badge>}
            {/* Provenance goes *above* the fold, for the reason `SaveFailure`
                sits in the footer rather than at the end of the body: the block
                below scrolls, and a line appended under it is one a DM never
                reads. The sentence explaining it can be down there; which corpus
                this is cannot. */}
            <Badge variant="secondary">{provenance.badge ?? "Yours"}</Badge>
            <Badge>CR {creature.cr}</Badge>
          </div>
          {/* The columns' own line, and only when the document has none of its
              own: `statBlock.meta` is the richer half — "Small humanoid
              (goblinoid), neutral evil" against "Small Humanoid" — and the body
              renders it a few pixels below. Two lines saying nearly the same
              thing is what a creature carrying both halves invites, and this is
              where it would have happened. */}
          {creature.statBlock.meta === "" && (
            <DialogDescription className="font-serif italic">
              {creature.size === null || creature.size === ""
                ? creature.type
                : `${creature.size} ${creature.type}`}
            </DialogDescription>
          )}
        </DialogHeader>

        <DetailBody>
          <StatBlockBody
            creature={creature}
            emptyNote="Nothing is written on this one yet. Its rating and the two numbers above are all it has."
          />

          <DetailSection>
            <div className="flex flex-wrap items-center gap-1.5">
              {creature.environments.map((environment) => (
                <Badge key={environment} variant="outline">
                  {environment}
                </Badge>
              ))}
            </div>
            {provenance.lines.map((line) => (
              <p key={line} className="text-caption leading-body text-muted-foreground">
                {line}
              </p>
            ))}
          </DetailSection>
        </DetailBody>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
