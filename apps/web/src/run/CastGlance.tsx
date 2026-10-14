import type { CampaignId, NpcId } from "@taverns/api";
import { Badge } from "@taverns/ui";
import { Link } from "@tanstack/react-router";
import { useApiAtom } from "../api/atoms";
import { npcPrepAtom, npcsAtom } from "../cast/load";

/**
 * **Who a Cast combatant is**, under its name in the runner's panel: the role,
 * the DM's attitude, how they talk, and the way to their page — the persona
 * Hob plays them with, at a glance (`fightPersona.ts` on the server). Read
 * from the Cast's own lists, which the cast screen keeps fresh, by the
 * combatant's `npcId`; the creator's alone, as the runner is.
 *
 * An NPC the live list does not hold is archived or gone, and Hob plays it as
 * its stat block, which is what this says.
 */
export function CastGlance({
  campaignId,
  npcId,
}: {
  readonly campaignId: CampaignId;
  readonly npcId: NpcId;
}) {
  const [cast] = useApiAtom(npcsAtom(campaignId));
  const [prep] = useApiAtom(npcPrepAtom(campaignId));
  if (cast.state !== "ready") return null;
  const npc = cast.value.find((candidate) => candidate.id === npcId);
  if (npc === undefined) {
    return (
      <p className="mt-1 mb-0 text-caption leading-snug text-muted-foreground">
        From the Cast, now archived: Hob plays them as their stat block.
      </p>
    );
  }
  const attitude =
    prep.state === "ready"
      ? (prep.value.find((row) => row.npcId === npcId)?.attitude ?? null)
      : null;
  const manner = npc.persona.voice?.manner;
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5 text-caption leading-snug text-muted-foreground">
        <Link
          to="/campaigns/$campaignId/cast/$npcId"
          params={{ campaignId, npcId }}
          className="font-medium text-accent-ink underline-offset-2 hover:underline"
        >
          From the Cast
        </Link>
        {npc.role !== "" && <span>· {npc.role}</span>}
        {attitude !== null && <Badge variant="secondary">{attitude}</Badge>}
      </div>
      {manner !== undefined && manner !== "" && (
        <p className="mb-0 line-clamp-2 font-serif text-body-s leading-snug text-muted-foreground italic">
          {manner}
        </p>
      )}
    </div>
  );
}
