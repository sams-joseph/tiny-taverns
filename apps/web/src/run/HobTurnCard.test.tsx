import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sseFrames } from "../characters/characters.fixtures";
import {
  brannoc,
  brannocPlaced,
  campaignId,
  goblinBoss,
  installRunServer,
  liveRun,
  renderRunner,
} from "./run.fixtures";

/**
 * The runner's *Ask Hob* card, against the stub server: it asks for the
 * selected monster's turn at a moment it has, shows the steps and the line
 * the table will hear, turns an offer down or asks again, finds an open offer
 * again after a reload, and draws nothing with no model behind Hob. It has no
 * keep: nothing carries a turn out yet.
 */
const server = installRunServer();

const runBase = `/campaigns/${campaignId}/sessions/${liveRun.sessionId}/runs/${liveRun.id}`;
const turnRoute = `POST ${runBase}/combatants/${goblinBoss.id}/hob/turn`;
const threadId = "2b1f2a1e-0000-4000-8000-00000000f001";
const turnId = "2b1f2a1e-0000-4000-8000-00000000f002";
const againId = "2b1f2a1e-0000-4000-8000-00000000f003";
const discardRoute = (turn: string) =>
  `POST /campaigns/${campaignId}/hob/threads/${threadId}/turns/${turn}/discard`;

const proposal = (narration: string) => ({
  target: "npcTurn",
  sessionId: liveRun.sessionId,
  runId: liveRun.id,
  combatantId: goblinBoss.id,
  combatantName: goblinBoss.displayName,
  moment: "turn",
  round: liveRun.round,
  stamp: "a".repeat(64),
  steps: [
    { kind: "move", to: { column: 6, row: 4 }, feet: 5 },
    {
      kind: "option",
      optionId: "actions/Multiattack",
      name: "Multiattack",
      slot: "action",
      targets: [{ combatantId: brannoc.id, name: "Brannoc" }],
      strikes: [
        {
          optionId: "actions/Scimitar",
          name: "Scimitar",
          target: { combatantId: brannoc.id, name: "Brannoc" },
        },
        {
          optionId: "actions/Scimitar",
          name: "Scimitar",
          target: { combatantId: brannoc.id, name: "Brannoc" },
        },
      ],
    },
  ],
  narration,
  instruction: null,
});

const offered = (turn: string, narration: string) =>
  sseFrames([
    { event: "began", data: { threadId, turnId: turn } },
    { event: "tool", data: { name: "proposeNpcTurn", phase: "called", detail: "" } },
    { event: "proposal", data: { turnId: turn, proposal: proposal(narration) } },
    { event: "done", data: { reason: "tool-calls" } },
  ]);

const STEPPED = "The boss lunges at Brannoc, scimitar high.";

const card = () =>
  within(screen.getByRole("region", { name: `Hob for ${goblinBoss.displayName}` }));

const hobIs = (available: boolean) =>
  server.routes.set(`GET /campaigns/${campaignId}/hob`, {
    status: 200,
    body: { available, model: available ? "scripted" : null, campaign: "The Salt Road" },
  });

beforeEach(() => {
  server.reset();
  // The Goblin Boss is up, a square from Brannoc.
  server.routes.set(`GET ${runBase}`, {
    status: 200,
    body: { ...liveRun, activeCombatantId: goblinBoss.id },
  });
  server.routes.set(`GET ${runBase}/combatants`, {
    status: 200,
    body: [brannocPlaced, { ...goblinBoss, position: { column: 7, row: 4 } }],
  });
  hobIs(true);
});
afterEach(() => server.drop());

const sent = (route: string) =>
  server.calls
    .filter((call) => `${call.method} ${call.pathname}` === route)
    .map((call) => JSON.parse(call.body === "" ? "{}" : call.body) as Record<string, unknown>);

describe("Hob's card in the runner", () => {
  it("asks for the monster's turn and shows what it does, with nothing to keep", async () => {
    server.routes.set(turnRoute, { status: 200, sse: offered(turnId, STEPPED) });
    await renderRunner();
    const ask = await waitFor(() => card().getByRole("button", { name: "Ask Hob for its turn" }));
    // Only the moments it has: up, it takes its turn, not a reaction's ask.
    expect(card().queryByRole("button", { name: /legendary action/ })).toBeNull();

    await userEvent.type(card().getByLabelText("What Hob should have it do"), "Go for the fighter");
    await userEvent.click(ask);

    const steps = await waitFor(() => within(card().getByRole("list", { name: "What it does" })));
    expect(steps.getByText("Moves 5 ft to (6,4)")).toBeInTheDocument();
    expect(steps.getByText(/^Multiattack/)).toBeInTheDocument();
    expect(steps.getAllByText("Scimitar → Brannoc")).toHaveLength(2);
    expect(card().getByText(STEPPED)).toBeInTheDocument();
    expect(sent(turnRoute)).toEqual([{ moment: "turn", instruction: "Go for the fighter" }]);
    // No keep in this phase: absent, not a button that cannot carry it out.
    for (const name of [/keep/i, /accept/i, /save/i, /apply/i]) {
      expect(card().queryByRole("button", { name })).toBeNull();
    }
  });

  it("turns an offer down, and Try again asks afresh with what was typed", async () => {
    server.routes.set(turnRoute, { status: 200, sse: offered(turnId, STEPPED) });
    server.routes.set(discardRoute(turnId), { status: 204 });
    await renderRunner();
    await userEvent.click(
      await waitFor(() => card().getByRole("button", { name: "Ask Hob for its turn" })),
    );
    await waitFor(() => expect(card().getByText(STEPPED)).toBeInTheDocument());

    server.routes.set(turnRoute, { status: 200, sse: offered(againId, "The boss flees.") });
    await userEvent.type(card().getByLabelText("What to change"), "Have it flee");
    await userEvent.click(card().getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(card().getByText("The boss flees.")).toBeInTheDocument());
    expect(sent(discardRoute(turnId))).toHaveLength(1);
    expect(sent(turnRoute).at(-1)).toEqual({ moment: "turn", instruction: "Have it flee" });

    server.routes.set(discardRoute(againId), { status: 204 });
    await userEvent.click(card().getByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(card().getByRole("button", { name: "Ask Hob for its turn" })).toBeInTheDocument(),
    );
    expect(card().queryByText("The boss flees.")).toBeNull();
  });

  it("finds the open offer again after a reload", async () => {
    server.routes.set(`GET ${runBase}/hob/thread`, {
      status: 200,
      body: {
        id: threadId,
        campaignId,
        worldId: null,
        title: "Fight: Ambush",
        name: null,
        createdAt: "2026-10-12T19:00:00.000Z",
        updatedAt: "2026-10-12T19:01:00.000Z",
      },
    });
    const turnRow = (id: string, who: string, extra: Record<string, unknown>) => ({
      id,
      threadId,
      who,
      text: "",
      proposal: null,
      acceptedAt: null,
      discardedAt: null,
      kept: null,
      createdAt: "2026-10-12T19:00:00.000Z",
      ...extra,
    });
    server.routes.set(`GET /campaigns/${campaignId}/hob/threads/${threadId}/turns`, {
      status: 200,
      body: [
        turnRow("2b1f2a1e-0000-4000-8000-00000000f010", "user", { text: "Take its turn." }),
        turnRow(turnId, "hob", { proposal: proposal(STEPPED) }),
      ],
    });
    await renderRunner();
    await waitFor(() => expect(card().getByText(STEPPED)).toBeInTheDocument());
    expect(sent(turnRoute)).toEqual([]);
  });

  it("draws nothing with no model behind Hob, and nothing for a party member", async () => {
    hobIs(false);
    await renderRunner();
    await waitFor(() =>
      expect(server.calls.some((call) => call.pathname === `/campaigns/${campaignId}/hob`)).toBe(
        true,
      ),
    );
    expect(screen.queryByRole("region", { name: /^Hob for / })).toBeNull();

    hobIs(true);
    server.routes.set(`GET ${runBase}`, {
      status: 200,
      body: { ...liveRun, activeCombatantId: brannoc.id },
    });
    await renderRunner();
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Selected combatant" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("region", { name: "Hob for Brannoc" })).toBeNull();
  });
});
