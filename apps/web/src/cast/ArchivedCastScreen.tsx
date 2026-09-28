import type { Npc } from "@taverns/api";
import { Link, useParams } from "@tanstack/react-router";
import {
  BackLink,
  Button,
  Card,
  CardHeader,
  CardTitle,
  cardLinkClassName,
  EmptyState,
  Icon,
} from "@taverns/ui";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { dayOf } from "../chronicle/format";
import { SaveFailure } from "../ui/form";
import { archivedNpcsAtom } from "./load";
import { NpcAvatar } from "./NpcAvatar";

function ArchivedNpcCard({ npc }: { readonly npc: Npc }) {
  const { busy, failure, submit } = useMutation();

  // The mirror of the NPC page's *Archive*, and the same keys: the one list key
  // re-reads both shelves, so this card leaves here and is back on the Cast.
  // An archived NPC's follow-up rows carry its archived mark, so that read
  // moves too.
  const restore = () =>
    void submit(
      (client) =>
        client.npcs.restore({ params: { campaignId: npc.campaignId, npcId: npc.id }, payload: {} }),
      [reads.npcs(npc.campaignId), reads.npc(npc.id), reads.npcFollowUp(npc.campaignId)],
    );

  return (
    <Card linked className="h-full">
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <NpcAvatar name={npc.name} image={npc.image} size="lg" />
          <div className="min-w-0 flex-1">
            <CardTitle>
              <Link
                to="/campaigns/$campaignId/cast/$npcId"
                params={{ campaignId: npc.campaignId, npcId: npc.id }}
                data-card-link
                className={cardLinkClassName}
              >
                {npc.name}
              </Link>
            </CardTitle>
            {npc.role !== "" && (
              <p className="mb-0 text-caption leading-body text-muted-foreground">{npc.role}</p>
            )}
            {npc.archivedAt !== null && (
              <p className="mb-0 text-caption leading-body text-muted-foreground">
                Archived {dayOf(npc.archivedAt)}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={restore}>
            <Icon name="refresh-cw" size={14} />
            Restore
          </Button>
        </div>
        {failure !== undefined && <SaveFailure failure={failure} />}
      </CardHeader>
    </Card>
  );
}

/**
 * The archived shelf: the NPCs taken off the Cast, and the one press that
 * brings each back.
 *
 * A second URL rather than a filter on the Cast, as the campaign shelf is a
 * second read: the server answers `archived: true` and this screen draws what
 * it was given without re-filtering. It is reached from a quiet *Archived* link
 * on the Cast, because archive without a way back would be a one-way door. A
 * card opens the NPC's own page, which keeps its transcripts and says it is
 * archived.
 */
export function ArchivedCastScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Archived NPCs"
      extra={archivedNpcsAtom(campaignId)}
      subtitle={({ extra }) =>
        extra.length === 0
          ? "NPCs you take off the Cast wait here"
          : `${String(extra.length)} ${extra.length === 1 ? "NPC" : "NPCs"} off the Cast`
      }
      actions={() => (
        <BackLink render={<Link to="/campaigns/$campaignId/cast" params={{ campaignId }} />}>
          All NPCs
        </BackLink>
      )}
    >
      {({ extra: npcs }) =>
        npcs.length === 0 ? (
          <EmptyState icon="archive" title="Nothing archived">
            Archive an NPC from their page to take them off the Cast. They keep their transcripts,
            and <span className="text-heading">Restore</span> here puts them back.
          </EmptyState>
        ) : (
          <div className="@container">
            <ul className="grid list-none grid-cols-1 gap-4 p-0 @lg:grid-cols-2 @3xl:grid-cols-3">
              {npcs.map((npc) => (
                <li key={npc.id} className="min-w-0">
                  <ArchivedNpcCard npc={npc} />
                </li>
              ))}
            </ul>
          </div>
        )
      }
    </CampaignChrome>
  );
}
