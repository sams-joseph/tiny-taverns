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
  sessionId,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";

/**
 * The Cast screen against a stubbed wire decoded by the real client: the
 * grid, the two empty states, and the builder — including the one property
 * the builder exists to keep, that what is typed under *Private material*
 * leaves the browser in `privateMaterial` and never in `persona`.
 */

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

afterEach(() => cleanup());

const renderCast = async (): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/cast`, (screen) => (
    <HostedSessionScope session={noSession}>{screen}</HostedSessionScope>
  ));
};

const pendingProposal = {
  id: "2b1f2a1e-0000-4000-8000-00000000f601",
  campaignId,
  npcId,
  threadId: "2b1f2a1e-0000-4000-8000-00000000e0c1",
  npcTurnId: "2b1f2a1e-0000-4000-8000-00000000e101",
  proposedByAccountId: null,
  kind: "memory",
  content: { kind: "memory", body: "The party promised Cazril a true name." },
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
  createdAt: cazril.createdAt,
  updatedAt: cazril.updatedAt,
};

const followUpWithProposal = {
  campaignId,
  proposalCount: 1,
  awarenessCount: 0,
  items: [
    {
      itemKind: "proposal",
      npc: { id: npcId, name: "Cazril", role: "the ferryman", archivedAt: null },
      proposal: pendingProposal,
      source: {
        channel: "rehearsal",
        sessionId: null,
        sessionNumber: null,
        label: "Creator rehearsal",
      },
    },
  ],
};

describe("CastScreen", () => {
  it("draws the cast as cards, on the campaign row, with the private-material mark", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/follow-up`, {
      status: 200,
      body: followUpWithProposal,
    });
    await renderCast();

    expect(await screen.findByRole("heading", { name: "Cast" })).toBeInTheDocument();
    // The count is the subtitle — "1 person your players will meet".
    expect(screen.getByText("1 person your players will meet")).toBeInTheDocument();
    const card = screen.getByRole("link", { name: "Cazril" }).closest("li");
    expect(card).not.toBeNull();
    expect(within(card!).getByText("the ferryman at the crossing")).toBeInTheDocument();
    expect(within(card!).getByText(/takes names instead of coin/)).toBeInTheDocument();
    expect(within(card!).getByText("Cast only")).toBeInTheDocument();
    expect(within(card!).getByText("Private material")).toBeInTheDocument();
    // Both ways in point at the NPC's own screen.
    expect(screen.getByRole("link", { name: "Cazril" })).toHaveAttribute(
      "href",
      `/#/campaigns/${campaignId}/cast/${npcId}`,
    );
    expect(within(card!).getByRole("button", { name: "Rehearse" })).toHaveAttribute(
      "href",
      `/#/campaigns/${campaignId}/cast/${npcId}`,
    );
    const followUp = screen.getByRole("button", { name: /NPC follow-up/ });
    expect(followUp).toHaveAttribute("href", `/#/campaigns/${campaignId}/cast/follow-up`);
    expect(within(followUp).getByText("1")).toBeInTheDocument();
    // And *Cast* is the lit item on the campaign row.
    const row = screen.getByRole("navigation", { name: "This campaign" });
    expect(within(row).getByRole("link", { name: "Cast" })).toHaveAttribute("aria-current", "page");
  });

  it("derives player-facing, current-session and pending-proposal cues from existing reads", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, visibility: "shared" }],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/sessions/${sessionId}`, {
      status: 200,
      body: [
        { id: npcId, campaignId, name: "Cazril", role: "the ferryman", persona: cazril.persona },
      ],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/proposals`, {
      status: 200,
      body: [pendingProposal],
    });

    await renderCast();

    const card = (await screen.findByRole("link", { name: "Cazril" })).closest("li");
    expect(card).not.toBeNull();
    expect(within(card!).getByText("Player-facing")).toBeInTheDocument();
    expect(within(card!).getByText("Open at table")).toBeInTheDocument();
    const review = within(card!).getByRole("button", { name: "1 pending" });
    expect(review).toHaveAttribute("href", `/#/campaigns/${campaignId}/cast/${npcId}#proposals`);
  });

  it("says what to do next when the cast is empty, and when nothing matches", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, { status: 200, body: [] });
    await renderCast();

    expect(await screen.findByText("Nobody in the cast yet")).toBeInTheDocument();
    expect(screen.getByText("The people your players will meet")).toBeInTheDocument();
    cleanup();

    server.reset();
    await renderCast();
    await screen.findByRole("link", { name: "Cazril" });
    await userEvent.type(screen.getByRole("combobox", { name: "Search the cast" }), "innkeeper");
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
  });

  it("writes a new NPC with the secret in its own document, then goes to rehearse it", async () => {
    const created = { ...cazril, id: "2b1f2a1e-0000-4000-8000-00000000d0c2", name: "Fen" };
    server.routes.set(`POST /campaigns/${campaignId}/npcs`, { status: 200, body: created });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${created.id}`, {
      status: 200,
      body: created,
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${created.id}/rehearsal`, {
      status: 200,
      body: {
        available: false,
        model: null,
        npc: "Fen",
        templateVersion: "npc-prompt/1.1.0",
        estimatedTokens: 90,
        knowledgeIncluded: 0,
        knowledgeTotal: 0,
        memoriesIncluded: 0,
        memoriesTotal: 0,
      },
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${created.id}/knowledge`, {
      status: 200,
      body: [],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${created.id}/memories`, {
      status: 200,
      body: [],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${created.id}/threads`, {
      status: 200,
      body: [],
    });
    await renderCast();
    await screen.findByRole("link", { name: "Cazril" });

    await userEvent.click(screen.getByRole("button", { name: "New NPC" }));
    const dialog = await screen.findByRole("dialog", { name: "New NPC" });
    // Basic first: the advanced half is behind a press, and the private
    // section is not on screen until it is opened.
    expect(within(dialog).queryByLabelText("Secrets")).toBeNull();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Fen");
    await userEvent.type(within(dialog).getByLabelText("Role"), "the patron");
    await userEvent.type(within(dialog).getByLabelText("Who they are"), "Pays for silence.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Advanced" }));
    await userEvent.type(within(dialog).getByLabelText("Secrets"), "Fen hired the hag.");
    await userEvent.type(within(dialog).getByLabelText("Phrases they use"), "Quiet, now.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create NPC" }));

    // What left the browser: the public document and the private one, apart.
    await waitFor(() =>
      expect(
        server.calls.some((call) => call.method === "POST" && call.pathname.endsWith("/npcs")),
      ).toBe(true),
    );
    const sent = bodyOf(server, "POST", "/npcs") as {
      readonly persona: unknown;
      readonly privateMaterial: unknown;
    };
    expect(sent).toMatchObject({
      name: "Fen",
      role: "the patron",
      persona: { identity: { summary: "Pays for silence." }, voice: { phrases: ["Quiet, now."] } },
      privateMaterial: { secrets: "Fen hired the hag." },
    });
    expect(JSON.stringify(sent.persona)).not.toContain("hired the hag");

    // A new NPC lands on its own screen, where the rehearsal is.
    await waitFor(() =>
      expect(globalThis.location.hash).toBe(`#/campaigns/${campaignId}/cast/${created.id}`),
    );
  }, 20_000);

  it("explains Library-to-Cast copy semantics before copying a source", async () => {
    await renderCast();
    await screen.findByRole("link", { name: "Cazril" });

    await userEvent.click(screen.getByRole("button", { name: "Add from Library" }));

    expect(await screen.findByText(/Choose a reusable NPC source/)).toBeInTheDocument();
    expect(screen.getByText(/independent Cast snapshot/)).toBeInTheDocument();
    expect(
      screen.getByText(/another creator's group-shared secrets are not copied/),
    ).toBeInTheDocument();
  });

  it("refuses to create a nameless NPC, in the form, before any request", async () => {
    await renderCast();
    await screen.findByRole("link", { name: "Cazril" });
    await userEvent.click(screen.getByRole("button", { name: "New NPC" }));
    const dialog = await screen.findByRole("dialog", { name: "New NPC" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Create NPC" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Give them a name.");
    expect(server.calls.filter((call) => call.method === "POST")).toEqual([]);
  });
});
