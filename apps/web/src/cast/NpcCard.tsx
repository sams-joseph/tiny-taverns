import type { Npc } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Card, cardLinkClassName, cn, SectionHeading } from "@taverns/ui";
import { NpcAvatar } from "./NpcAvatar";

/**
 * One NPC on the Cast, as the redesign draws the card: the portrait band, then
 * who they are.
 *
 * **The whole card opens the NPC's drawer**, portrait band included: the name
 * is the one link, to the Cast with `?npc=` (`CastScreen`), its `::after`
 * stretched over the card (`<Card linked>`), and the card carries no control
 * of its own. Editing, sharing and archiving are in the drawer; rehearsing and
 * what Hob proposed are on the NPC's page, which the drawer opens. The card
 * whose drawer is open wears the accent border, as drawn.
 *
 * The band is the seat card's: the initials, with Hob's portrait over them once
 * there is one, and *Hob is drawing…* while it is on its way (the Cast re-reads
 * until it lands). The drawn card's attitude, status, whereabouts and *first
 * met* lines are not here: nothing on the wire answers them yet, so they are
 * not drawn.
 */
export function NpcCard({ npc, chosen }: { readonly npc: Npc; readonly chosen: boolean }) {
  return (
    <Card
      linked
      data-slot="npc-card"
      data-chosen={chosen || undefined}
      className={cn("h-full overflow-hidden", chosen && "border-accent")}
    >
      <div className="relative h-portrait-band shrink-0 overflow-hidden border-b border-hairline bg-surface-sunken">
        <NpcAvatar name={npc.name} image={npc.image} size="card" />
        {npc.imagePending && (
          <Badge variant="outline" role="status" className="absolute bottom-2.5 left-card">
            Hob is drawing…
          </Badge>
        )}
      </div>
      <div className="px-card pt-3.5 pb-card">
        <SectionHeading size="title">
          <Link
            to="/campaigns/$campaignId/cast"
            params={{ campaignId: npc.campaignId }}
            search={{ npc: npc.id }}
            replace
            resetScroll={false}
            data-card-link
            className={cardLinkClassName}
          >
            {npc.name}
          </Link>
        </SectionHeading>
        {npc.role !== "" && (
          <p className="mt-1 mb-0 text-body-s leading-snug text-muted-foreground">{npc.role}</p>
        )}
      </div>
    </Card>
  );
}
