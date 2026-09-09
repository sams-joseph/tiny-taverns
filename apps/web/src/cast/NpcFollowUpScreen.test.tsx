import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import {
  campaignId,
  cazril,
  installMemoryStorage,
  installStubServer,
  noSession,
  npcId,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

afterEach(() => cleanup());

const proposal = {
  id: "2b1f2a1e-0000-4000-8000-00000000f701",
  campaignId,
  npcId,
  threadId: "2b1f2a1e-0000-4000-8000-00000000e701",
  npcTurnId: "2b1f2a1e-0000-4000-8000-00000000e702",
  proposedByAccountId: null,
  kind: "memory",
  content: { kind: "memory", body: "Cazril should remember the party's promised name." },
  state: "pending",
  decidedByAccountId: null,
  decidedAt: null,
  rejectionReason: null,
  acceptedMemoryId: null,
  acceptedNoteId: null,
  acceptedBeatId: null,
  visibility: "dm",
  origin: "assistant",
  assistantTurnId: null,
  createdAt: cazril.updatedAt,
  updatedAt: cazril.updatedAt,
};

const awareness = {
  id: "2b1f2a1e-0000-4000-8000-00000000f702",
  campaignId,
  npcId: "2b1f2a1e-0000-4000-8000-00000000d0f2",
  kind: "knowledge",
  body: "Marta knows the hag's copper key is warm after dusk.",
  sourceKind: "recap",
  sourceId: null,
  sourceLabel: "Session 12 recap",
  sourceExcerpt: "The copper key warmed after the table bargained with the hag.",
  rationale: "Hob matched the key to Marta's old inn ledger.",
  version: 3,
  state: "pending",
  decidedByAccountId: null,
  decidedAt: null,
  rejectionReason: null,
  acceptedKnowledgeFactId: null,
  acceptedMemoryId: null,
  visibility: "dm",
  origin: "assistant",
  assistantTurnId: "2b1f2a1e-0000-4000-8000-00000000f812",
  createdAt: cazril.createdAt,
  updatedAt: cazril.updatedAt,
};

const followUp = {
  campaignId,
  proposalCount: 2,
  awarenessCount: 1,
  items: [
    {
      itemKind: "proposal",
      npc: { id: npcId, name: "Cazril", role: "the ferryman", archivedAt: null },
      proposal,
      source: {
        channel: "rehearsal",
        sessionId: null,
        sessionNumber: null,
        label: "Creator rehearsal",
      },
    },
    {
      itemKind: "proposal",
      npc: { id: npcId, name: "Cazril", role: "the ferryman", archivedAt: null },
      proposal: {
        ...proposal,
        id: "2b1f2a1e-0000-4000-8000-00000000f703",
        npcTurnId: "2b1f2a1e-0000-4000-8000-00000000e703",
        kind: "beat",
        content: { kind: "beat", body: "Cazril raised the ferry chain." },
      },
      source: {
        channel: "session_shared",
        sessionId: "2b1f2a1e-0000-4000-8000-000000000501",
        sessionNumber: 12,
        label: "Shared table conversation · Session 12",
      },
    },
    {
      itemKind: "awareness",
      npc: {
        id: awareness.npcId,
        name: "Marta",
        role: "retired innkeeper",
        archivedAt: cazril.updatedAt,
      },
      candidate: awareness,
    },
  ],
};

const renderFollowUp = async (path = `/campaigns/${campaignId}/cast/follow-up`): Promise<void> => {
  await renderAt(path, (screen) => (
    <HostedSessionScope session={noSession}>{screen}</HostedSessionScope>
  ));
};

describe("NpcFollowUpScreen", () => {
  it("aggregates mixed pending NPC review records and routes to authoritative review tabs", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/follow-up`, {
      status: 200,
      body: followUp,
    });

    await renderFollowUp();

    expect(await screen.findByRole("heading", { name: "NPC follow-up" })).toBeInTheDocument();
    expect(screen.getByText("3 NPC follow-up items waiting")).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "NPC follow-up sections" });
    expect(within(tabs).getByRole("button", { name: /All/ })).toBeInTheDocument();
    expect(screen.getByText(/memory proposal · Creator rehearsal/)).toBeInTheDocument();
    expect(
      screen.getByText("beat proposal · Shared table conversation · Session 12"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("knowledge candidate · Hob research · recap · Session 12 recap"),
    ).toBeInTheDocument();
    expect(screen.getByText("Archived NPC")).toBeInTheDocument();
    expect(JSON.stringify(document.body.textContent)).not.toContain(
      "PLAYER_DIRECT_TRANSCRIPT_SENTINEL",
    );

    expect(screen.getAllByRole("button", { name: "Review in NPC Proposals" })[0]).toHaveAttribute(
      "href",
      `/#/campaigns/${campaignId}/cast/${npcId}#proposals`,
    );
    expect(screen.getByRole("button", { name: "Review in Hob research" })).toHaveAttribute(
      "href",
      `/#/campaigns/${campaignId}/cast/${awareness.npcId}#awareness`,
    );
  });

  it("keeps tabs on their own row and narrows without losing the pending counts", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/follow-up`, {
      status: 200,
      body: followUp,
    });

    await renderFollowUp();
    const tabs = await screen.findByRole("navigation", { name: "NPC follow-up sections" });
    await userEvent.click(within(tabs).getByRole("button", { name: /Hob research/ }));

    expect(screen.getByRole("heading", { name: "Marta" })).toBeInTheDocument();
    expect(screen.queryByText("Cazril should remember")).not.toBeInTheDocument();
    expect(within(tabs).getByRole("button", { name: /All/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("button", { name: /Proposals/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("button", { name: /Hob research/ })).toBeInTheDocument();
  });

  it("draws the empty state when no NPC follow-up is waiting", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/follow-up`, {
      status: 200,
      body: { campaignId, proposalCount: 0, awarenessCount: 0, items: [] },
    });

    await renderFollowUp();

    expect(await screen.findByText("No NPC follow-up waiting")).toBeInTheDocument();
    expect(
      screen.getByText(/without exposing private player-direct transcripts/),
    ).toBeInTheDocument();
  });
});
