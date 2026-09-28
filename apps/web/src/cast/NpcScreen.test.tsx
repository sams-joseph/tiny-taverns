import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import {
  bodyOf,
  campaignId,
  campaignOptions,
  cazril,
  cazrilSheet,
  installStubServer,
  npcId,
  npcRehearsalStatus,
  npcThreadId,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";

/**
 * One NPC's screen: the persona with its private half marked, the inspector
 * that shows metadata and never a prompt, the rehearsal that streams and is
 * branded as the NPC, and the honest composer-less state when no model is
 * behind it.
 */

const server = installStubServer();

beforeEach(() => {
  server.reset();
});

afterEach(() => cleanup());

const renderNpc = async (): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/cast/${npcId}`, (screen) => (
    <HostedSessionScope session={TEST_SESSION}>{screen}</HostedSessionScope>
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
    // The appearance line is public persona, drawn above the private half.
    const look = screen.getByText(
      "Stooped and weathered, river-grey eyes, a lantern hung from his pole.",
    );
    expect(
      look.compareDocumentPosition(screen.getByRole("heading", { name: "Private material" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
      <HostedSessionScope session={TEST_SESSION}>{screen}</HostedSessionScope>
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
    expect(review).toHaveAttribute("href", `/campaigns/${campaignId}/cast/${npcId}#proposals`);
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
    await waitFor(() => expect(globalThis.location.pathname).toBe(`/campaigns/${campaignId}/cast`));
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
    expect(within(dialog).getByLabelText("Appearance")).toHaveValue(
      "Stooped and weathered, river-grey eyes, a lantern hung from his pole.",
    );
    const role = within(dialog).getByLabelText("Role");
    await userEvent.clear(role);
    await userEvent.type(role, "the ferryman");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const sent = bodyOf(server, "PATCH", `/npcs/${npcId}`) as Record<string, unknown>;
    expect(sent).toMatchObject({ expectedVersion: 2, role: "the ferryman" });
    // The persona is replaced whole, so the look the form opened on goes back.
    expect(sent).toMatchObject({
      persona: {
        identity: {
          appearance: "Stooped and weathered, river-grey eyes, a lantern hung from his pole.",
        },
      },
    });
    expect(sent["privateMaterial"]).toEqual({
      secrets: "The hag pays him in years. He has three left.",
    });
  }, 20_000);

  it("shares an NPC with the table from the dialog, and unshares it back to the DM", async () => {
    server.routes.set(`PATCH /campaigns/${campaignId}/npcs/${npcId}`, {
      status: 200,
      body: { ...cazril, visibility: "shared", version: 3 },
    });
    await renderNpc();
    await screen.findByRole("heading", { name: "Cazril", level: 2 });
    expect(screen.getByText("Cast only")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    let dialog = await screen.findByRole("dialog", { name: "Edit Cazril" });
    const share = within(dialog).getByRole("switch", { name: "Players can see this" });
    expect(share).not.toBeChecked();
    await userEvent.click(share);
    // The sentence names what a shared NPC carries, and that the secrets stay.
    expect(
      within(dialog).getByText(/everything here but the private material/),
    ).toBeInTheDocument();
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}`, {
      status: 200,
      body: { ...cazril, visibility: "shared", version: 3 },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bodyOf(server, "PATCH", `/npcs/${npcId}`)).toMatchObject({ visibility: "shared" });
    // The page re-reads the row and badges it as the players see it.
    await screen.findByText("Player-facing");

    server.routes.set(`PATCH /campaigns/${campaignId}/npcs/${npcId}`, {
      status: 200,
      body: { ...cazril, visibility: "dm", version: 4 },
    });
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    dialog = await screen.findByRole("dialog", { name: "Edit Cazril" });
    const unshare = within(dialog).getByRole("switch", { name: "Players can see this" });
    expect(unshare).toBeChecked();
    await userEvent.click(unshare);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Off is a value the payload says, not a key it leaves out.
    const calls = server.calls.filter(
      (call) => call.method === "PATCH" && call.pathname.endsWith(`/npcs/${npcId}`),
    );
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[1]!.body)).toMatchObject({ visibility: "dm", expectedVersion: 3 });
  }, 20_000);
});

describe("the Stats tab", () => {
  const sheetPath = `/campaigns/${campaignId}/npcs/${npcId}/sheet`;

  const renderStats = async () => {
    await renderAt(`/campaigns/${campaignId}/cast/${npcId}#stats`, (screen) => (
      <HostedSessionScope session={TEST_SESSION}>{screen}</HostedSessionScope>
    ));
    return await screen.findByText(/No stats yet|Level 5 Human Fighter/);
  };

  const sheetCalls = (method: string) =>
    server.calls.filter((call) => call.method === method && call.pathname === sheetPath);

  it("sits after Profile, opens from #stats, and says there are no stats yet", async () => {
    await renderStats();
    const tabs = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.trim())
      .filter((label) => label === "Profile" || label === "Stats" || label === "Rehearsal");
    expect(tabs.slice(0, 3)).toEqual(["Profile", "Stats", "Rehearsal"]);

    expect(screen.getByText("No stats yet")).toBeInTheDocument();
    expect(screen.getByText(/Only you see them/)).toBeInTheDocument();
    // Nothing to edit, rebuild or remove until there is a sheet.
    expect(screen.queryByRole("button", { name: "Edit stats" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rebuild from class and level" })).toBeNull();
    expect(screen.getByRole("button", { name: "Start from class and level" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write one" })).toBeInTheDocument();
  });

  it("writes one: the identity over a blank document, and re-reads the sheet", async () => {
    server.routes.set(`PUT ${sheetPath}`, { status: 200, body: cazrilSheet });
    await renderStats();

    await userEvent.click(screen.getByRole("button", { name: "Write one" }));
    const dialog = await screen.findByRole("dialog", { name: "Write Cazril’s stats" });
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "Level" }), "5");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Class" }), "Fighter");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Race" }), " Human ");
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "AC" }), "17");
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "Hit points" }), "44");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Challenge rating" }));
    await userEvent.click(await screen.findByRole("option", { name: "CR 3 · 700 XP" }));

    server.routes.set(`GET ${sheetPath}`, { status: 200, body: cazrilSheet });
    await userEvent.click(within(dialog).getByRole("button", { name: "Write stats" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const [put] = sheetCalls("PUT");
    // Every column, blank ones as `null`, over the column default — and no version, since none was read.
    expect(JSON.parse(put!.body)).toEqual({
      level: 5,
      race: "Human",
      subrace: null,
      className: "Fighter",
      ac: 17,
      hpMax: 44,
      cr: "3",
      sheet: { abilities: [], traits: [] },
    });
    expect(
      await screen.findByRole("heading", { name: "Level 5 Human Fighter" }),
    ).toBeInTheDocument();
  });

  it("refuses a number out of bounds before anything is sent", async () => {
    await renderStats();
    await userEvent.click(screen.getByRole("button", { name: "Write one" }));
    const dialog = await screen.findByRole("dialog", { name: "Write Cazril’s stats" });
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "AC" }), "41");
    await userEvent.click(within(dialog).getByRole("button", { name: "Write stats" }));
    expect(within(dialog).getByText("Between 0 and 40.")).toBeInTheDocument();
    expect(sheetCalls("PUT")).toHaveLength(0);
  });

  it("draws the sheet: the identity, the challenge line and the character's document", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: cazrilSheet });
    await renderStats();

    expect(screen.getByRole("heading", { name: "Level 5 Human Fighter" })).toBeInTheDocument();
    expect(screen.getByText("CR 3 · 700 XP")).toBeInTheDocument();
    expect(screen.getByText("Armour class")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("44")).toBeInTheDocument();
    expect(screen.getByText("DM only")).toBeInTheDocument();

    const document = screen.getByRole("region", { name: "Cazril's sheet" });
    expect(within(document).getByText("STR")).toBeInTheDocument();
    expect(within(document).getByText("Second Wind")).toBeInTheDocument();
    expect(within(document).getByText("Boathook")).toBeInTheDocument();
    // The section editors, and nothing that rolls or spends (`NpcSheetEditors.test.tsx`).
    expect(
      within(document)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Abilities", "Skills", "Add"]);
    // The player's half has no key here, so Story and Level ups are not drawn.
    expect(within(document).queryByText("Story")).toBeNull();
    expect(within(document).queryByText("Level ups")).toBeNull();
  });

  it("edits the identity by sending only what changed, with the version it read", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: cazrilSheet });
    server.routes.set(`PATCH ${sheetPath}`, {
      status: 200,
      body: { ...cazrilSheet, hpMax: 52, cr: null, version: 4 },
    });
    await renderStats();

    await userEvent.click(screen.getByRole("button", { name: "Edit stats" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Cazril’s stats" });
    expect(within(dialog).getByRole("spinbutton", { name: "Level" })).toHaveValue(5);
    const hp = within(dialog).getByRole("spinbutton", { name: "Hit points" });
    await userEvent.clear(hp);
    await userEvent.type(hp, "52");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Challenge rating" }));
    await userEvent.click(await screen.findByRole("option", { name: "No rating" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const [patch] = sheetCalls("PATCH");
    // No level or class, so the server has no reason to recompute the document.
    expect(JSON.parse(patch!.body)).toEqual({ expectedVersion: 3, hpMax: 52, cr: null });
  });

  it("sends nothing when nothing changed", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: cazrilSheet });
    await renderStats();
    await userEvent.click(screen.getByRole("button", { name: "Edit stats" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Cazril’s stats" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sheetCalls("PATCH")).toHaveLength(0);
  });

  it("says when the sheet moved on under the edit, and offers a reload", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: cazrilSheet });
    server.routes.set(`PATCH ${sheetPath}`, {
      status: 409,
      body: {
        _tag: "Conflict",
        message: "the NPC's sheet moved on while you were editing (version 4, you read 3).",
      },
    });
    await renderStats();

    await userEvent.click(screen.getByRole("button", { name: "Edit stats" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Cazril’s stats" });
    const ac = within(dialog).getByRole("spinbutton", { name: "AC" });
    await userEvent.clear(ac);
    await userEvent.type(ac, "16");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText(/moved on while you were editing/)).toBeInTheDocument();

    server.routes.set(`GET ${sheetPath}`, {
      status: 200,
      body: { ...cazrilSheet, ac: 18, version: 4 },
    });
    const reads = server.calls.filter(
      (call) => call.method === "GET" && call.pathname === sheetPath,
    );
    const before = reads.length;
    await userEvent.click(within(dialog).getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(
        server.calls.filter((call) => call.method === "GET" && call.pathname === sheetPath).length,
      ).toBeGreaterThan(before),
    );
    expect(await screen.findByText("18")).toBeInTheDocument();
  });

  it("removes the sheet only once asked, and goes back to no stats", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: cazrilSheet });
    server.routes.set(`DELETE ${sheetPath}`, { status: 204, body: null });
    await renderStats();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    let dialog = await screen.findByRole("dialog", { name: "Remove Cazril’s stats?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep them" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sheetCalls("DELETE")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    dialog = await screen.findByRole("dialog", { name: "Remove Cazril’s stats?" });
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: null });
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove stats" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sheetCalls("DELETE")).toHaveLength(1);
    expect(await screen.findByText("No stats yet")).toBeInTheDocument();
  });
});

describe("the Stats tab's quick start", () => {
  const sheetPath = `/campaigns/${campaignId}/npcs/${npcId}/sheet`;
  const optionsPath = `/campaigns/${campaignId}/options`;

  /**
   * The table's Fighter with its class table written out to 5th level, so a
   * level-5 start has features past the first to write and a +3 to read.
   */
  const feature = (at: number, index: string, name: string) => ({
    id: `2b1f2a1e-0000-4000-8000-0000000f00${String(10 + at)}`,
    index,
    name,
  });
  const optionsToFifth = campaignOptions.map((option) =>
    option.kind === "class" && option.name === "Fighter" && "details" in option
      ? {
          ...option,
          details: {
            ...option.details,
            classLevels: [
              // The fixture's own first level, written out: its details are a union.
              {
                level: 1,
                proficiencyBonus: 2,
                features: [feature(0, "second-wind", "Second Wind")],
              },
              {
                level: 2,
                proficiencyBonus: 2,
                features: [feature(1, "action-surge", "Action Surge")],
              },
              {
                level: 3,
                proficiencyBonus: 2,
                features: [feature(2, "martial-archetype", "Martial Archetype")],
              },
              { level: 4, proficiencyBonus: 2, features: [] },
              {
                level: 5,
                proficiencyBonus: 3,
                features: [feature(3, "extra-attack", "Extra Attack")],
              },
            ],
          },
        }
      : option,
  );

  beforeEach(() => {
    server.routes.set(`GET ${optionsPath}`, { status: 200, body: optionsToFifth });
  });

  const renderStats = async () => {
    await renderAt(`/campaigns/${campaignId}/cast/${npcId}#stats`, (screen) => (
      <HostedSessionScope session={TEST_SESSION}>{screen}</HostedSessionScope>
    ));
    return await screen.findByText(/No stats yet|Level 5 Human Fighter/);
  };

  const sheetCalls = (method: string) =>
    server.calls.filter((call) => call.method === method && call.pathname === sheetPath);

  const choose = async (dialog: HTMLElement, box: string, option: string) => {
    await userEvent.click(within(dialog).getByRole("combobox", { name: box }));
    await userEvent.click(await screen.findByRole("option", { name: option }));
  };

  it("starts a Fighter 5 from the character form's composer, at level 5 throughout", async () => {
    server.routes.set(`PUT ${sheetPath}`, { status: 200, body: cazrilSheet });
    await renderStats();

    await userEvent.click(screen.getByRole("button", { name: "Start from class and level" }));
    const dialog = await screen.findByRole("dialog", { name: "Start Cazril from a class" });
    // The campaign's rules: the target's options read.
    await within(dialog).findByRole("combobox", { name: "Class" });
    expect(
      server.calls.some((call) => call.method === "GET" && call.pathname === optionsPath),
    ).toBe(true);

    await choose(dialog, "Class", "Fighter");
    const level = within(dialog).getByRole("spinbutton", { name: "Level" });
    await userEvent.clear(level);
    await userEvent.type(level, "5");
    await choose(dialog, "Race", "Human");
    await choose(dialog, "Any martial weapon", "Longsword");
    await userEvent.click(within(dialog).getByRole("button", { name: "Standard array" }));

    // STR 15 … CHA 8, each +1 from Human: CON 14 is +2, DEX 15 is +2.
    // Hit points are 10 + 2, then four levels of 6 + 2; the armour class is unarmoured.
    expect(within(dialog).getByRole("spinbutton", { name: "Hit points" })).toHaveValue(44);
    expect(within(dialog).getByRole("spinbutton", { name: "AC" })).toHaveValue(12);
    expect(within(dialog).getByText(/unarmoured/)).toBeInTheDocument();

    server.routes.set(`GET ${sheetPath}`, { status: 200, body: cazrilSheet });
    await userEvent.click(within(dialog).getByRole("button", { name: "Write stats" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const [put] = sheetCalls("PUT");
    const payload = JSON.parse(put!.body);
    // A new sheet names no version, and has no rating until the DM sets one.
    expect(payload).toMatchObject({
      level: 5,
      race: "Human",
      subrace: null,
      className: "Fighter",
      ac: 12,
      hpMax: 44,
      cr: null,
    });
    expect(payload).not.toHaveProperty("expectedVersion");
    expect(payload.sheet.identity).toMatchObject({ proficiency: "+3", hitDice: "5/5 d10" });
    expect(payload.sheet.traits.map((trait: { name: string }) => trait.name)).toEqual(
      expect.arrayContaining(["Second Wind", "Action Surge", "Martial Archetype", "Extra Attack"]),
    );
    // The class's saves, marked on the moved cells at +3.
    expect(payload.sheet.abilities).toContainEqual(
      expect.objectContaining({ label: "STR", score: "16", proficient: true, save: "+6" }),
    );
    // The kit as picked: the longsword carried, and its attack line.
    expect(payload.sheet.inventory.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(["Longsword", "Shield"]),
    );
    expect(payload.sheet.actions).toContainEqual(
      expect.objectContaining({ name: "Longsword", hit: "+6", dice: "1d8+3" }),
    );
    // None of the player's half.
    expect(payload.sheet).not.toHaveProperty("notes");
    expect(payload.sheet).not.toHaveProperty("story");
  });

  it("keeps a typed number when a later pick re-seeds", async () => {
    await renderStats();
    await userEvent.click(screen.getByRole("button", { name: "Start from class and level" }));
    const dialog = await screen.findByRole("dialog", { name: "Start Cazril from a class" });
    await choose(dialog, "Class", "Fighter");
    const ac = within(dialog).getByRole("spinbutton", { name: "AC" });
    await userEvent.clear(ac);
    await userEvent.type(ac, "18");
    const level = within(dialog).getByRole("spinbutton", { name: "Level" });
    await userEvent.clear(level);
    await userEvent.type(level, "3");
    expect(ac).toHaveValue(18);
    // 10, then two levels of 6.
    expect(within(dialog).getByRole("spinbutton", { name: "Hit points" })).toHaveValue(22);
  });

  it("needs a class before it writes anything", async () => {
    await renderStats();
    await userEvent.click(screen.getByRole("button", { name: "Start from class and level" }));
    const dialog = await screen.findByRole("dialog", { name: "Start Cazril from a class" });
    await within(dialog).findByRole("combobox", { name: "Class" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Write stats" }));
    expect(within(dialog).getByText("Pick a class.")).toBeInTheDocument();
    expect(sheetCalls("PUT")).toHaveLength(0);
  });

  it("rebuilds a sheet only once confirmed, naming the version it read and keeping the rating", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: cazrilSheet });
    server.routes.set(`PUT ${sheetPath}`, { status: 200, body: { ...cazrilSheet, version: 4 } });
    await renderStats();

    await userEvent.click(screen.getByRole("button", { name: "Rebuild from class and level" }));
    const dialog = await screen.findByRole("dialog", { name: "Rebuild Cazril’s stats" });
    // Prefilled from the sheet's own labels.
    expect(await within(dialog).findByRole("combobox", { name: "Class" })).toHaveTextContent(
      "Fighter",
    );
    expect(within(dialog).getByRole("combobox", { name: "Race" })).toHaveTextContent("Human");
    expect(within(dialog).getByRole("spinbutton", { name: "Level" })).toHaveValue(5);

    await userEvent.click(within(dialog).getByRole("button", { name: "Rebuild stats" }));
    expect(
      within(dialog).getByText("Replace Cazril’s whole sheet with a level 5 Fighter’s?"),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Back" }));
    expect(sheetCalls("PUT")).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole("button", { name: "Rebuild stats" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Replace sheet" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const [put] = sheetCalls("PUT");
    expect(JSON.parse(put!.body)).toMatchObject({
      expectedVersion: 3,
      level: 5,
      race: "Human",
      className: "Fighter",
      cr: "3",
    });
  });

  it("says when the sheet moved on under a rebuild, and offers a reload", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: cazrilSheet });
    server.routes.set(`PUT ${sheetPath}`, {
      status: 409,
      body: {
        _tag: "Conflict",
        message: "the NPC's sheet moved on while you were editing (version 4, you read 3).",
      },
    });
    await renderStats();

    await userEvent.click(screen.getByRole("button", { name: "Rebuild from class and level" }));
    const dialog = await screen.findByRole("dialog", { name: "Rebuild Cazril’s stats" });
    await within(dialog).findByRole("combobox", { name: "Class" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Rebuild stats" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Replace sheet" }));
    expect(await within(dialog).findByText(/moved on while you were editing/)).toBeInTheDocument();

    const before = server.calls.filter(
      (call) => call.method === "GET" && call.pathname === sheetPath,
    ).length;
    await userEvent.click(within(dialog).getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(
        server.calls.filter((call) => call.method === "GET" && call.pathname === sheetPath).length,
      ).toBeGreaterThan(before),
    );
  });
});
