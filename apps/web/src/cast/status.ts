import type { Npc, NpcProposal, PlayerNpc, SessionId } from "@taverns/api";

/**
 * Derived Cast status. No mutable flags live here: each sentence is folded from
 * the NPC row, this session's opened NPC list, and that NPC's proposal rows.
 */
export interface NpcCastStatus {
  readonly playerFacing: boolean;
  readonly openInCurrentSession: boolean;
  readonly pendingProposals: number;
}

export const pendingNpcProposals = (proposals: ReadonlyArray<NpcProposal>): number =>
  proposals.filter((proposal) => proposal.state === "pending").length;

export const npcIsOpenInSession = ({
  npc,
  currentSessionId,
  sessionNpcs,
}: {
  readonly npc: Pick<Npc, "id">;
  readonly currentSessionId: SessionId | undefined;
  readonly sessionNpcs: ReadonlyArray<PlayerNpc>;
}): boolean => currentSessionId !== undefined && sessionNpcs.some((row) => row.id === npc.id);

export const castStatusFor = ({
  npc,
  currentSessionId,
  sessionNpcs,
  proposals,
}: {
  readonly npc: Npc;
  readonly currentSessionId: SessionId | undefined;
  readonly sessionNpcs: ReadonlyArray<PlayerNpc>;
  readonly proposals: ReadonlyArray<NpcProposal>;
}): NpcCastStatus => ({
  playerFacing: npc.archivedAt === null && npc.visibility === "shared",
  openInCurrentSession:
    npc.archivedAt === null && npcIsOpenInSession({ npc, currentSessionId, sessionNpcs }),
  pendingProposals: pendingNpcProposals(proposals),
});
