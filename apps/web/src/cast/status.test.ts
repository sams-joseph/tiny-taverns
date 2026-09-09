import type { Npc, NpcProposal, PlayerNpc, SessionId } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { campaignId, cazril, npcId, playerCazril, sessionId } from "../campaign/campaign.fixtures";
import { castStatusFor } from "./status";

const asNpc = (row: unknown): Npc => row as Npc;
const asPlayerNpc = (row: unknown): PlayerNpc => row as PlayerNpc;
const currentSessionId = sessionId as unknown as SessionId;

const proposal = (state: "pending" | "accepted" | "rejected"): NpcProposal =>
  ({
    id: `2b1f2a1e-0000-4000-8000-00000000f6${state === "pending" ? "01" : state === "accepted" ? "02" : "03"}`,
    campaignId,
    npcId,
    threadId: "2b1f2a1e-0000-4000-8000-00000000e0c1",
    npcTurnId: `2b1f2a1e-0000-4000-8000-00000000e1${state === "pending" ? "01" : state === "accepted" ? "02" : "03"}`,
    proposedByAccountId: null,
    kind: "memory" as const,
    content: { kind: "memory" as const, body: "The party promised a name." },
    state,
    decidedByAccountId: null,
    decidedAt: null,
    rejectionReason: null,
    acceptedMemoryId: null,
    acceptedNoteId: null,
    acceptedBeatId: null,
    visibility: "dm" as const,
    origin: "assistant" as const,
    assistantTurnId: null,
    createdAt: cazril.createdAt,
    updatedAt: cazril.updatedAt,
  }) as unknown as NpcProposal;

describe("Cast NPC status", () => {
  it("derives player-facing, current-session open, and pending proposal state", () => {
    expect(
      castStatusFor({
        npc: asNpc({ ...cazril, visibility: "shared" }),
        currentSessionId,
        sessionNpcs: [asPlayerNpc(playerCazril)],
        proposals: [proposal("pending"), proposal("accepted"), proposal("rejected")],
      }),
    ).toEqual({ playerFacing: true, openInCurrentSession: true, pendingProposals: 1 });
  });

  it("does not carry an old session's open state into the current Cast view", () => {
    expect(
      castStatusFor({
        npc: asNpc({ ...cazril, visibility: "shared" }),
        currentSessionId: undefined,
        sessionNpcs: [asPlayerNpc(playerCazril)],
        proposals: [],
      }).openInCurrentSession,
    ).toBe(false);
  });

  it("makes archived NPCs non-facing and closed without rewriting their rows", () => {
    expect(
      castStatusFor({
        npc: asNpc({ ...cazril, visibility: "shared", archivedAt: cazril.updatedAt }),
        currentSessionId,
        sessionNpcs: [asPlayerNpc(playerCazril)],
        proposals: [proposal("pending")],
      }),
    ).toEqual({ playerFacing: false, openInCurrentSession: false, pendingProposals: 1 });
  });
});
