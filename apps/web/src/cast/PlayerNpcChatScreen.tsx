import type { CampaignId, NpcId, PlayerNpc } from "@taverns/api";
import { Link, useParams } from "@tanstack/react-router";
import { Badge, Card, SectionHeading, BackLink, EmptyState, Loading } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { TopBar } from "../shell/TopBar";
import { DetailSection } from "../ui/detail";
import { NpcAvatar } from "./NpcCard";
import { useNpcPlayerChat } from "./playerChat";
import { RehearsalPanel } from "./RehearsalPanel";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

const playerNpcAtom = Atom.family(
  (at: { readonly campaignId: CampaignId; readonly npcId: NpcId }) =>
    apiAtom((client) => client.npcs.playerFindById({ params: at }), [reads.npcs(at.campaignId)]),
);

export function PlayerNpcChatScreen() {
  const { campaignId, npcId } = useParams({
    from: "/_shell/campaigns/$campaignId/cast/$npcId/talk",
  });
  const [resource, reload] = useApiAtom(playerNpcAtom({ campaignId, npcId }));
  const npc = resource.state === "ready" ? resource.value : undefined;

  return (
    <>
      <TopBar
        title={npc?.name ?? "An NPC"}
        subtitle="Talk privately · only you can read this transcript"
      >
        <BackLink render={<Link to="/campaigns/$campaignId" params={{ campaignId }} />}>
          Overview
        </BackLink>
      </TopBar>
      {resource.state === "loading" && <Loading label="Reading the NPC…" />}
      {resource.state === "failed" && (
        <ApiFailureNotice failure={resource.failure} onRetry={reload} />
      )}
      {npc !== undefined && <PlayerNpcChatBody npc={npc} />}
    </>
  );
}

function PlayerNpcChatBody({ npc }: { readonly npc: PlayerNpc }) {
  const chat = useNpcPlayerChat(npc.campaignId, npc.id, npc.name);
  return (
    <div className="@container flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid min-h-0 flex-1 gap-4 @3xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-h-[34rem] min-w-0">
          <RehearsalPanel
            name={npc.name}
            rehearsal={chat}
            subtitle="Talk privately · only you can read this transcript"
            emptyTitle={`Talk to ${npc.name}`}
            emptyBody="Ask in character. Your DM can see that this NPC is available, but not this private transcript or its usage metadata. This chat does not change campaign canon or create NPC memory."
            label={`Say something to ${npc.name}`}
            ariaLabel={`Talk privately with ${npc.name}`}
          />
        </div>
        <Card tone="sunken" className="gap-4 p-card">
          <div className="flex items-start gap-3">
            <NpcAvatar name={npc.name} size="lg" />
            <div className="min-w-0">
              <SectionHeading size="title">{npc.name}</SectionHeading>
              {npc.role !== "" && (
                <p className="text-body-s leading-body text-muted-foreground">{npc.role}</p>
              )}
            </div>
          </div>
          {npc.persona.identity?.summary !== undefined ? (
            <p className="text-body-s leading-body text-foreground">
              {npc.persona.identity.summary}
            </p>
          ) : (
            <EmptyState icon="user-round" title="No public profile yet">
              Your DM shared this NPC, but did not write a public summary.
            </EmptyState>
          )}
          <DetailSection title="Privacy boundary">
            <div className="flex flex-col gap-2 text-body-s leading-body text-muted-foreground">
              <p>
                <Badge variant="outline">Talk privately</Badge> Your transcript belongs to you.
                Other players and the campaign creator do not get a transcript reader in this slice.
              </p>
              <p>
                Only player-safe facts and approved memories can be included in replies. This chat
                does not automatically create or approve NPC memory.
              </p>
            </div>
          </DetailSection>
        </Card>
      </div>
    </div>
  );
}
