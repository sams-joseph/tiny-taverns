import type { Npc, NpcPrep, Session } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Card, cardLinkClassName, cn, Icon, SectionHeading } from "@taverns/ui";
import { NpcAvatar } from "./NpcAvatar";
import { attitudeOf, metLine, statusOf } from "./prep";

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
 * until it lands).
 *
 * Under the name, the DM's prep (`prep.ts`): the attitude and, unless they are
 * alive, the status as badges, then *where* and *first met* pinned to the
 * card's foot so a row of cards lines them up. What was never set is not
 * drawn — no "Somewhere", no guessed attitude — except *Not met yet*, which is
 * what an unset *first met* means.
 */
export function NpcCard({
  npc,
  prep,
  nights,
  chosen,
}: {
  readonly npc: Npc;
  /** Undefined for an NPC just made, until the prep list has it. */
  readonly prep: NpcPrep | undefined;
  readonly nights: ReadonlyArray<Session>;
  readonly chosen: boolean;
}) {
  const attitude = prep?.attitude == null ? undefined : attitudeOf(prep.attitude);
  const status = prep?.status == null ? undefined : statusOf(prep.status);
  const where = prep?.whereabouts ?? null;
  const met = metLine(prep?.metSessionId ?? null, nights);
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
      <div className="flex flex-1 flex-col gap-2.5 px-card pt-3.5 pb-card">
        <div>
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
        {(attitude !== undefined || status?.badge !== undefined) && (
          <div data-slot="npc-card-badges" className="flex flex-wrap gap-1.5">
            {attitude !== undefined && <Badge variant={attitude.badge}>{attitude.label}</Badge>}
            {status?.badge !== undefined && <Badge variant={status.badge}>{status.label}</Badge>}
          </div>
        )}
        <div
          data-slot="npc-card-lines"
          className="mt-auto flex flex-col gap-1.25 text-caption leading-snug text-muted-foreground"
        >
          {where !== null && (
            <span className="flex items-center gap-1.5">
              <Icon name="map-pin" size={12} className="shrink-0 text-faint" />
              <span className="sr-only">Where: </span>
              {where}
            </span>
          )}
          {met !== undefined && (
            <span className="flex items-center gap-1.5">
              <Icon name="clock" size={12} className="shrink-0 text-faint" />
              {met}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
