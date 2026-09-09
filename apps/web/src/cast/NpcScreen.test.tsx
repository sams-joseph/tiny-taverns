import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import {
  bodyOf,
  campaignId,
  cazril,
  installMemoryStorage,
  installStubServer,
  noSession,
  npcId,
  npcRehearsalStatus,
  npcThreadId,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";

/**
 * One NPC's screen: the persona with its private half marked, the inspector
 * that shows metadata and never a prompt, the rehearsal that streams and is
 * branded as the NPC, and the honest composer-less state when no model is
 * behind it.
 */

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

afterEach(() => cleanup());

const renderNpc = async (): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/cast/${npcId}`, (screen) => (
    <HostedSessionScope session={noSession}>{screen}</HostedSessionScope>
  ));
};

const frame = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const withModel = () => {
  server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/rehearsal`, {
    status: 200,
    body: { ...npcRehearsalStatus, available: true, model: "local-3b" },
  });
};

const openRehearsal = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Rehearsal" }));
  return await screen.findByRole("region", { name: "Rehearse with Cazril" });
};

const awarenessCandidate = {
  id: "2b1f2a1e-0000-4000-8000-00000000f501",
  campaignId,
  npcId,
  kind: "knowledge",
  body: "Cazril knows the ford asks for names.",
  sourceKind: "recap",
  sourceId: null,
  sourceLabel: "Session 4 recap",
  sourceExcerpt: "The ford asked Brannoc for a true name.",
  rationale: "This is the toll Cazril explains.",
  version: 7,
  state: "pending",
  decidedByAccountId: null,
  decidedAt: null,
  rejectionReason: null,
  acceptedKnowledgeFactId: null,
  acceptedMemoryId: null,
  visibility: "dm",
  createdAt: cazril.createdAt,
  updatedAt: cazril.updatedAt,
  origin: "assistant",
  assistantTurnId: "2b1f2a1e-0000-4000-8000-00000000e201",
};

const proposal = {
  id: "2b1f2a1e-0000-4000-8000-00000000f601",
  campaignId,
  npcId,
  threadId: npcThreadId,
  npcTurnId: "2b1f2a1e-0000-4000-8000-00000000e101",
  proposedByAccountId: "2b1f2a1e-0000-4000-8000-0000000000aa",
  kind: "note",
  content: {
    kind: "note",
    title: "Cazril's price",
    body: "Pearls sink first.",
    noteKind: "note",
  },
  state: "pending",
  decidedByAccountId: null,
  decidedAt: null,
  rejectionReason: null,
  acceptedMemoryId: null,
  acceptedNoteId: null,
  acceptedBeatId: null,
  visibility: "dm",
  createdAt: cazril.createdAt,
  updatedAt: cazril.updatedAt,
  origin: "assistant",
  assistantTurnId: null,
};

describe("NpcScreen", () => {
  it("draws the persona, marks the private half, and shows prompt metadata rather than a prompt", async () => {
    await renderNpc();

    expect(await screen.findByRole("heading", { name: "Cazril", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Cazril · the ferryman at the crossing")).toBeInTheDocument();
    expect(screen.getByText(/takes names instead of coin/)).toBeInTheDocument();
    expect(screen.getByText("Names keep. Coin sinks.")).toBeInTheDocument();
    expect(screen.getByText("Naming the hag")).toBeInTheDocument();
    // The private half, under its own heading with the sentence that says who sees it.
    expect(screen.getByRole("heading", { name: "Private material" })).toBeInTheDocument();
    expect(screen.getByText(/Only you see this\. Your rehearsal uses it/)).toBeInTheDocument();
    expect(screen.getByText("The hag pays him in years. He has three left.")).toBeInTheDocument();

    // The inspector: version, size, model — and never the assembled prompt.
    const inspector = await screen.findByLabelText("Prompt inspector");
    await within(inspector).findByText("npc-prompt/1.1.0");
    expect(within(inspector).getByText("about 240 tokens")).toBeInTheDocument();
    expect(within(inspector).getByText("none configured")).toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE MATERIAL/)).toBeNull();
    expect(screen.queryByText(/You are Cazril/)).toBeNull();
  });

  it("offers no composer when no model is behind the NPC, and says why", async () => {
    await renderNpc();

    const panel = await openRehearsal();
    expect(
      await within(panel).findByText(/No model is configured behind Cazril/),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/profile, knowledge and memory/)).toBeInTheDocument();
    expect(within(panel).queryByRole("textbox")).toBeNull();
    // Nothing on the panel says Hob.
    expect(within(panel).queryByText(/Hob/)).toBeNull();
  });

  it("streams a rehearsal reply in the NPC's name, and records the reply's prompt in the inspector", async () => {
    withModel();
    server.routes.set(`POST /campaigns/${campaignId}/npcs/${npcId}/rehearse`, {
      status: 200,
      sse:
        frame("began", {
          threadId: npcThreadId,
          turnId: "2b1f2a1e-0000-4000-8000-00000000e101",
          templateVersion: "npc-prompt/1.1.0",
          estimatedTokens: 312,
          knowledgeIncluded: 0,
          knowledgeTotal: 0,
          memoriesIncluded: 0,
          memoriesTotal: 0,
        }) +
        frame("delta", { text: "Names keep. " }) +
        frame("delta", { text: "Coin sinks." }) +
        frame("done", { reason: "stop" }),
    });
    await renderNpc();

    const panel = await openRehearsal();
    const input = await within(panel).findByRole("textbox", { name: "Say something to Cazril" });
    await userEvent.type(input, "What is your price?{enter}");

    expect(await within(panel).findByText("Names keep. Coin sinks.")).toBeInTheDocument();
    expect(within(panel).getByText("What is your price?")).toBeInTheDocument();
    // The line went as one question and a thread-less payload — the server
    // starts the thread and says which in `began`.
    const sent = bodyOf(server, "POST", "/rehearse") as { readonly text: string };
    expect(sent).toEqual({ text: "What is your price?" });
    // And the inspector now knows what that reply's prompt measured.
    await userEvent.click(screen.getByRole("button", { name: "Profile" }));
    const inspector = screen.getByLabelText("Prompt inspector");
    expect(
      await within(inspector).findByText("about 312 tokens sent, npc-prompt/1.1.0"),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/Hob/)).toBeNull();
  }, 20_000);

  it("manages facts and memory from their own tab rows", async () => {
    const fact = {
      id: "2b1f2a1e-0000-4000-8000-00000000a001",
      npcId,
      body: "Cazril knows the ford by the willow.",
      sourceKind: "manual",
      sourceLabel: "Typed lore",
      sourceId: null,
      retiredAt: null,
      visibility: "dm",
      origin: "authored",
      assistantTurnId: null,
      createdAt: cazril.createdAt,
      updatedAt: cazril.updatedAt,
    };
    const memory = {
      id: "2b1f2a1e-0000-4000-8000-00000000b001",
      npcId,
      body: "The party promised Cazril a true name.",
      status: "draft",
      sourceThreadId: null,
      sourceTurnId: null,
      approvedAt: null,
      retiredAt: null,
      visibility: "dm",
      origin: "authored",
      assistantTurnId: null,
      createdAt: cazril.createdAt,
      updatedAt: cazril.updatedAt,
    };
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/knowledge`, {
      status: 200,
      body: [fact],
    });
    server.routes.set(`POST /campaigns/${campaignId}/npcs/${npcId}/knowledge`, {
      status: 200,
      body: { ...fact, id: "2b1f2a1e-0000-4000-8000-00000000a002" },
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/memories`, {
      status: 200,
      body: [memory],
    });
    server.routes.set(`POST /campaigns/${campaignId}/npcs/${npcId}/memories/${memory.id}/approve`, {
      status: 200,
      body: { ...memory, status: "approved", approvedAt: cazril.updatedAt },
    });

    await renderNpc();
    await userEvent.click(await screen.findByRole("button", { name: "Knowledge" }));
    expect(await screen.findByText("Cazril knows the ford by the willow.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Fact"), "He knows where the hag sleeps.");
    await userEvent.selectOptions(screen.getByLabelText("Source kind"), "note");
    await userEvent.type(screen.getByLabelText("Source label"), "Session 12");
    await userEvent.click(screen.getByRole("button", { name: "Add fact" }));
    expect(bodyOf(server, "POST", "/knowledge")).toEqual({
      body: "He knows where the hag sleeps.",
      sourceKind: "note",
      sourceLabel: "Session 12",
    });

    await userEvent.click(screen.getByRole("button", { name: "Memory" }));
    expect(await screen.findByText("The party promised Cazril a true name.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(bodyOf(server, "POST", "/approve")).toEqual({});
  });

  it("edits and approves Hob research candidates from the Cast review tab", async () => {
    const candidateId = awarenessCandidate.id;
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/awareness-candidates`, {
      status: 200,
      body: [awarenessCandidate],
    });
    server.routes.set(
      `PATCH /campaigns/${campaignId}/npcs/${npcId}/awareness-candidates/${candidateId}`,
      {
        status: 200,
        body: {
          ...awarenessCandidate,
          body: "Cazril knows the true toll.",
          sourceLabel: "Copied recap",
          version: 8,
        },
      },
    );
    server.routes.set(
      `POST /campaigns/${campaignId}/npcs/${npcId}/awareness-candidates/${candidateId}/approve`,
      {
        status: 200,
        body: {
          ...awarenessCandidate,
          body: "Cazril knows the true toll.",
          sourceLabel: "Copied recap",
          state: "approved",
          version: 9,
          decidedByAccountId: "2b1f2a1e-0000-4000-8000-0000000000aa",
          decidedAt: cazril.updatedAt,
          acceptedKnowledgeFactId: "2b1f2a1e-0000-4000-8000-00000000a701",
        },
      },
    );

    await renderNpc();
    await userEvent.click(await screen.findByRole("button", { name: "Hob research" }));
    expect(await screen.findByText("Cazril knows the ford asks for names.")).toBeInTheDocument();
    expect(screen.getByText(/Source copy: The ford asked Brannoc/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit awareness candidate" }));
    const candidate = screen.getByLabelText("Candidate");
    await userEvent.clear(candidate);
    await userEvent.type(candidate, "Cazril knows the true toll.");
    const sourceLabel = screen.getByLabelText("Source label");
    await userEvent.clear(sourceLabel);
    await userEvent.type(sourceLabel, "Copied recap");
    await userEvent.click(screen.getByRole("button", { name: "Save edits" }));
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/awareness-candidates/${candidateId}`)).toEqual({
        expectedVersion: 7,
        body: "Cazril knows the true toll.",
        sourceLabel: "Copied recap",
        sourceExcerpt: "The ford asked Brannoc for a true name.",
        rationale: "This is the toll Cazril explains.",
      }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Approve awareness candidate" }),
    );
    expect(bodyOf(server, "POST", `/awareness-candidates/${candidateId}/approve`)).toEqual({
      expectedVersion: 8,
    });
  }, 20_000);

  it("rejects Hob research candidates with only the stored row identity", async () => {
    const candidateId = awarenessCandidate.id;
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/awareness-candidates`, {
      status: 200,
      body: [awarenessCandidate],
    });
    server.routes.set(
      `POST /campaigns/${campaignId}/npcs/${npcId}/awareness-candidates/${candidateId}/reject`,
      {
        status: 200,
        body: {
          ...awarenessCandidate,
          state: "rejected",
          version: 8,
          decidedByAccountId: "2b1f2a1e-0000-4000-8000-0000000000aa",
          decidedAt: cazril.updatedAt,
          rejectionReason: "Rejected from the Cast screen.",
        },
      },
    );

    await renderNpc();
    await userEvent.click(await screen.findByRole("button", { name: "Hob research" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Reject awareness candidate" }),
    );
    expect(bodyOf(server, "POST", `/awareness-candidates/${candidateId}/reject`)).toEqual({
      expectedVersion: 7,
      reason: "Rejected from the Cast screen.",
    });
  });

  it("reviews NPC proposals without sending replacement content on accept", async () => {
    const proposalId = proposal.id;
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/proposals`, {
      status: 200,
      body: [proposal],
    });
    server.routes.set(
      `POST /campaigns/${campaignId}/npcs/${npcId}/proposals/${proposalId}/accept`,
      {
        status: 200,
        body: {
          id: proposalId,
          campaignId,
          npcId,
          threadId: npcThreadId,
          npcTurnId: "2b1f2a1e-0000-4000-8000-00000000e101",
          proposedByAccountId: "2b1f2a1e-0000-4000-8000-0000000000aa",
          kind: "note",
          content: {
            kind: "note",
            title: "Cazril's price",
            body: "Pearls sink first.",
            noteKind: "note",
          },
          state: "accepted",
          decidedByAccountId: "2b1f2a1e-0000-4000-8000-0000000000aa",
          decidedAt: cazril.updatedAt,
          rejectionReason: null,
          acceptedMemoryId: null,
          acceptedNoteId: "2b1f2a1e-0000-4000-8000-00000000f701",
          acceptedBeatId: null,
          visibility: "dm",
          createdAt: cazril.createdAt,
          updatedAt: cazril.updatedAt,
          origin: "assistant",
          assistantTurnId: null,
        },
      },
    );

    await renderNpc();
    await userEvent.click(await screen.findByRole("button", { name: "Proposals" }));
    expect(await screen.findByText("Note: Cazril's price")).toBeInTheDocument();
    expect(screen.getByText("Pearls sink first.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(bodyOf(server, "POST", `/proposals/${proposalId}/accept`)).toEqual({});
  });

  it("opens the Proposals tab from a Cast review link", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/proposals`, {
      status: 200,
      body: [proposal],
    });
    await renderAt(`/campaigns/${campaignId}/cast/${npcId}#proposals`, (screen) => (
      <HostedSessionScope session={noSession}>{screen}</HostedSessionScope>
    ));

    expect(await screen.findByRole("heading", { name: "Pending proposals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Proposals" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("acknowledges streamed rehearsal proposals and refreshes the pending proposal state", async () => {
    withModel();
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/proposals`, {
      status: 200,
      body: () => {
        const reads = server.calls.filter(
          (call) => call.method === "GET" && call.pathname.endsWith(`/npcs/${npcId}/proposals`),
        );
        return reads.length < 2 ? [] : [proposal];
      },
    });
    server.routes.set(`POST /campaigns/${campaignId}/npcs/${npcId}/rehearse`, {
      status: 200,
      sse:
        frame("began", {
          threadId: npcThreadId,
          turnId: "2b1f2a1e-0000-4000-8000-00000000e101",
          templateVersion: "npc-prompt/1.1.0",
          estimatedTokens: 312,
        }) +
        frame("proposal", { proposal }) +
        frame("done", { reason: "stop" }),
    });

    await renderNpc();
    const panel = await openRehearsal();
    await userEvent.type(
      await within(panel).findByRole("textbox", { name: "Say something to Cazril" }),
      "Remember this.{enter}",
    );

    expect(await within(panel).findByText(/proposal is waiting/)).toBeInTheDocument();
    const review = within(panel).getByRole("button", { name: "Review in Cast" });
    expect(review).toHaveAttribute("href", `/#/campaigns/${campaignId}/cast/${npcId}#proposals`);
    await waitFor(() => {
      const reads = server.calls.filter(
        (call) => call.method === "GET" && call.pathname.endsWith(`/npcs/${npcId}/proposals`),
      );
      expect(reads.length).toBeGreaterThan(1);
    });
  });

  it("renders the exact typed rate-limit message and retry timing at the composer", async () => {
    withModel();
    server.routes.set(`POST /campaigns/${campaignId}/npcs/${npcId}/rehearse`, {
      status: 429,
      body: {
        _tag: "RateLimited",
        message: "This campaign has reached today's NPC chat limit. Try again tomorrow.",
        retryAfterSeconds: 3720,
      },
    });

    await renderNpc();
    const panel = await openRehearsal();
    await userEvent.type(
      await within(panel).findByRole("textbox", { name: "Say something to Cazril" }),
      "Again.{enter}",
    );

    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "This campaign has reached today's NPC chat limit. Try again tomorrow. Retry after 3720 seconds.",
    );
  });

  it("resumes the newest thread on open, so a reload keeps the rehearsal", async () => {
    withModel();
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/threads`, {
      status: 200,
      body: [
        {
          id: npcThreadId,
          npcId,
          channel: "rehearsal",
          sessionId: null,
          sessionState: "open",
          title: "Will you take us at dawn?",
          createdAt: cazril.createdAt,
          updatedAt: cazril.updatedAt,
        },
      ],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/threads/${npcThreadId}/turns`, {
      status: 200,
      body: [
        {
          id: "2b1f2a1e-0000-4000-8000-00000000e102",
          threadId: npcThreadId,
          who: "user",
          text: "Will you take us at dawn?",
          templateVersion: null,
          promptTokens: null,
          createdAt: cazril.createdAt,
        },
        {
          id: "2b1f2a1e-0000-4000-8000-00000000e103",
          threadId: npcThreadId,
          who: "npc",
          text: "Dawn, if you have names.",
          templateVersion: "npc-prompt/1.1.0",
          promptTokens: 300,
          createdAt: cazril.createdAt,
        },
      ],
    });
    await renderNpc();

    const panel = await openRehearsal();
    expect(await within(panel).findByText("Dawn, if you have names.")).toBeInTheDocument();
    expect(within(panel).getByText("Will you take us at dawn?")).toBeInTheDocument();
    // The thread can be set aside: *New thread* forgets it on screen.
    await userEvent.click(within(panel).getByRole("button", { name: "New thread" }));
    expect(within(panel).queryByText("Dawn, if you have names.")).toBeNull();
    expect(within(panel).getByText("Rehearse with Cazril")).toBeInTheDocument();
  });

  it("archives from the bar and goes back to the cast", async () => {
    server.routes.set(`POST /campaigns/${campaignId}/npcs/${npcId}/archive`, {
      status: 200,
      body: { ...cazril, archivedAt: cazril.updatedAt },
    });
    await renderNpc();
    await screen.findByRole("heading", { name: "Cazril", level: 2 });

    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(globalThis.location.hash).toBe(`#/campaigns/${campaignId}/cast`));
    expect(
      server.calls.some((call) => call.method === "POST" && call.pathname.endsWith("/archive")),
    ).toBe(true);
  });

  it("edits through the same dialog, sending the version it opened on", async () => {
    server.routes.set(`PATCH /campaigns/${campaignId}/npcs/${npcId}`, {
      status: 200,
      body: { ...cazril, role: "the ferryman", version: 3 },
    });
    await renderNpc();
    await screen.findByRole("heading", { name: "Cazril", level: 2 });

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Cazril" });
    // An existing row with advanced material opens with that half shown.
    expect(within(dialog).getByLabelText("Secrets")).toHaveValue(
      "The hag pays him in years. He has three left.",
    );
    const role = within(dialog).getByLabelText("Role");
    await userEvent.clear(role);
    await userEvent.type(role, "the ferryman");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const sent = bodyOf(server, "PATCH", `/npcs/${npcId}`) as Record<string, unknown>;
    expect(sent).toMatchObject({ expectedVersion: 2, role: "the ferryman" });
    expect(sent["privateMaterial"]).toEqual({
      secrets: "The hag pays him in years. He has three left.",
    });
  }, 20_000);
});
