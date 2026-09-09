import type {
  CampaignId,
  Npc,
  NpcId,
  NpcKnowledgeFact,
  NpcMemory,
  NpcProposal,
  PlayerNpc,
  SessionId,
} from "@taverns/api";
import { Effect } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { apiAtom, combine } from "../api/atoms";
import { reads } from "../api/keys";

/**
 * The cast's reads, as atoms — `Atom.family` at module scope, keyed on what
 * each read closes over, exactly as `campaign/load.ts` does.
 *
 * Two atoms and no combination: the list is the Cast screen's `extra` and one
 * row is the NPC screen's, and neither needs the other. The rehearsal
 * transcript is deliberately *not* an atom — like Hob's it is read by the hook
 * that streams into it (`cast/rehearsal.ts`), because a refresh would replace
 * the reply the creator is watching arrive.
 */

export const npcsAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.npcs.list({ params: { campaignId }, query: {} }),
    [reads.npcs(campaignId)],
  ),
);

interface OneNpc {
  readonly campaignId: CampaignId;
  readonly npcId: NpcId;
}

export interface NpcDetail {
  readonly npc: Npc;
  readonly knowledge: ReadonlyArray<NpcKnowledgeFact>;
  readonly memories: ReadonlyArray<NpcMemory>;
  readonly proposals: ReadonlyArray<NpcProposal>;
}

const npcRowAtom = Atom.family((at: OneNpc) =>
  apiAtom(
    (client) => client.npcs.findById({ params: at }),
    [reads.npc(at.npcId), reads.npcs(at.campaignId)],
  ),
);

const npcKnowledgeAtom = Atom.family((at: OneNpc) =>
  apiAtom((client) => client.npcs.knowledge({ params: at }), [reads.npcKnowledge(at.npcId)]),
);

const npcMemoriesAtom = Atom.family((at: OneNpc) =>
  apiAtom((client) => client.npcs.memories({ params: at }), [reads.npcMemories(at.npcId)]),
);

export const npcProposalsAtom = Atom.family((at: OneNpc) =>
  apiAtom((client) => client.npcs.proposals({ params: at }), [reads.npcProposals(at.npcId)]),
);

export const npcPendingProposalCountAtom = Atom.family((at: OneNpc) =>
  apiAtom(
    (client) =>
      Effect.map(
        client.npcs.proposals({ params: at }),
        (proposals) => proposals.filter((proposal) => proposal.state === "pending").length,
      ),
    [reads.npcProposals(at.npcId)],
  ),
);

interface SessionNpcsKey {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
}

export const sessionNpcsAtom = Atom.family((at: SessionNpcsKey) =>
  apiAtom((client) => client.npcs.sessionList({ params: at }), [reads.sessionNpcs(at.sessionId)]),
);

export interface SessionNpcProposalSummary {
  readonly npc: PlayerNpc;
  readonly pendingProposals: number;
}

export const sessionNpcProposalSummaryAtom = Atom.family((at: SessionNpcsKey) =>
  apiAtom(
    (client) =>
      Effect.flatMap(client.npcs.sessionList({ params: at }), (sessionNpcs) =>
        Effect.all(
          sessionNpcs.map((npc) =>
            Effect.map(
              client.npcs.proposals({ params: { campaignId: at.campaignId, npcId: npc.id } }),
              (proposals): SessionNpcProposalSummary => ({
                npc,
                pendingProposals: proposals.filter((proposal) => proposal.state === "pending")
                  .length,
              }),
            ),
          ),
          { concurrency: 4 },
        ),
      ),
    [reads.sessionNpcs(at.sessionId)],
  ),
);

/**
 * One NPC plus the two context lists the detail screen manages. Split under the
 * hood so a fact write refreshes facts without re-reading the persona, then
 * combined back to one value so the screen keeps its three states.
 */
export const npcAtom = Atom.family((at: OneNpc) =>
  Atom.readable((get): AsyncResult.AsyncResult<NpcDetail, unknown> =>
    combine(
      get,
      AsyncResult.all({
        npc: get(npcRowAtom(at)),
        knowledge: get(npcKnowledgeAtom(at)),
        memories: get(npcMemoriesAtom(at)),
        proposals: get(npcProposalsAtom(at)),
      }),
    ),
  ),
);
