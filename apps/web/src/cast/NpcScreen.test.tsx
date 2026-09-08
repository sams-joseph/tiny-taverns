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
    await within(inspector).findByText("npc-prompt/1.0.0");
    expect(within(inspector).getByText("about 240 tokens")).toBeInTheDocument();
    expect(within(inspector).getByText("none configured")).toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE MATERIAL/)).toBeNull();
    expect(screen.queryByText(/You are Cazril/)).toBeNull();
  });

  it("offers no composer when no model is behind the NPC, and says why", async () => {
    await renderNpc();

    const panel = await screen.findByRole("region", { name: "Rehearse with Cazril" });
    expect(
      await within(panel).findByText(/No model is configured behind Cazril/),
    ).toBeInTheDocument();
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
          templateVersion: "npc-prompt/1.0.0",
          estimatedTokens: 312,
        }) +
        frame("delta", { text: "Names keep. " }) +
        frame("delta", { text: "Coin sinks." }) +
        frame("done", { reason: "stop" }),
    });
    await renderNpc();

    const panel = await screen.findByRole("region", { name: "Rehearse with Cazril" });
    const input = await within(panel).findByRole("textbox", { name: "Say something to Cazril" });
    await userEvent.type(input, "What is your price?{enter}");

    expect(await within(panel).findByText("Names keep. Coin sinks.")).toBeInTheDocument();
    expect(within(panel).getByText("What is your price?")).toBeInTheDocument();
    // The line went as one question and a thread-less payload — the server
    // starts the thread and says which in `began`.
    const sent = bodyOf(server, "POST", "/rehearse") as { readonly text: string };
    expect(sent).toEqual({ text: "What is your price?" });
    // And the inspector now knows what that reply's prompt measured.
    const inspector = screen.getByLabelText("Prompt inspector");
    expect(
      await within(inspector).findByText("about 312 tokens sent, npc-prompt/1.0.0"),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/Hob/)).toBeNull();
  }, 20_000);

  it("resumes the newest thread on open, so a reload keeps the rehearsal", async () => {
    withModel();
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/threads`, {
      status: 200,
      body: [
        {
          id: npcThreadId,
          npcId,
          channel: "rehearsal",
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
          templateVersion: "npc-prompt/1.0.0",
          promptTokens: 300,
          createdAt: cazril.createdAt,
        },
      ],
    });
    await renderNpc();

    const panel = await screen.findByRole("region", { name: "Rehearse with Cazril" });
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
