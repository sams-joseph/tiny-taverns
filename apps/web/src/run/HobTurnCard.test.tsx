import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sseFrames } from "../characters/characters.fixtures";
import {
  brannoc,
  brannocPlaced,
  campaignId,
  goblin,
  goblinBoss,
  installRunServer,
  liveRun,
  renderRunner,
} from "./run.fixtures";

/**
 * The runner's *Ask Hob* card, against the stub server: it asks for the
 * selected monster's turn at a moment it has, shows the steps and the line
 * the table will hear, turns an offer down or asks again, finds an open offer
 * again after a reload, and draws nothing with no model behind Hob. *Keep* has
 * the server carry it out and the card shows what came of it, the saves left
 * to the DM, and *Undo*; a kept turn is found again after a reload too.
 */
const server = installRunServer();

const runBase = `/campaigns/${campaignId}/sessions/${liveRun.sessionId}/runs/${liveRun.id}`;
const turnRoute = `POST ${runBase}/combatants/${goblinBoss.id}/hob/turn`;
const threadId = "2b1f2a1e-0000-4000-8000-00000000f001";
const turnId = "2b1f2a1e-0000-4000-8000-00000000f002";
const againId = "2b1f2a1e-0000-4000-8000-00000000f003";
const discardRoute = (turn: string) =>
  `POST /campaigns/${campaignId}/hob/threads/${threadId}/turns/${turn}/discard`;

const proposal = (narration: string, line?: string) => ({
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
  ...(line === undefined ? {} : { line }),
  instruction: null,
});

const offered = (turn: string, narration: string, line?: string) =>
  sseFrames([
    { event: "began", data: { threadId, turnId: turn } },
    { event: "tool", data: { name: "proposeNpcTurn", phase: "called", detail: "" } },
    { event: "proposal", data: { turnId: turn, proposal: proposal(narration, line) } },
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
  it("asks for the monster's turn and shows what it does, to keep or not", async () => {
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
    expect(card().getByRole("button", { name: "Keep" })).toBeInTheDocument();
  });

  it("shows what the creature says aloud under what it does", async () => {
    server.routes.set(turnRoute, { status: 200, sse: offered(turnId, STEPPED, "Cut them down!") });
    await renderRunner();
    await userEvent.click(
      await waitFor(() => card().getByRole("button", { name: "Ask Hob for its turn" })),
    );
    await waitFor(() => expect(card().getByText(STEPPED)).toBeInTheDocument());
    expect(card().getByText("Cut them down!")).toBeInTheDocument();
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

  describe("a kept turn", () => {
    const keepRoute = `POST ${runBase}/hob/turns/${turnId}/keep`;
    const undoRoute = `POST ${runBase}/hob/turns/${turnId}/undo`;
    const saveId = "2b1f2a1e-0000-4000-8000-00000000f0a1";
    const resolveRoute = `POST ${runBase}/hob/saves/${saveId}/resolve`;

    const outcome = {
      turnId,
      sessionId: liveRun.sessionId,
      runId: liveRun.id,
      combatantId: goblinBoss.id,
      combatantName: goblinBoss.displayName,
      moment: "turn",
      round: liveRun.round,
      narration: STEPPED,
      steps: [
        { kind: "move", to: { column: 6, row: 4 }, feet: 5 },
        {
          kind: "option",
          optionId: "actions/Multiattack",
          name: "Multiattack",
          slot: "action",
          attacks: [
            {
              optionId: "actions/Scimitar",
              name: "Scimitar",
              target: { combatantId: brannoc.id, name: "Brannoc" },
              d20s: [17],
              d20: 17,
              mode: "normal",
              toHit: 4,
              total: 21,
              ac: 16,
              verdict: "hit",
              damage: [{ notation: "1d6+2", faces: [4], modifier: 2, total: 6, type: "Slashing" }],
              hit: { amount: 6, hpBefore: 6, hpAfter: 0, dropped: true },
            },
            {
              optionId: "actions/Scimitar",
              name: "Scimitar",
              target: { combatantId: brannoc.id, name: "Brannoc" },
              d20s: [1],
              d20: 1,
              mode: "normal",
              toHit: 4,
              total: 5,
              ac: 16,
              verdict: "natural-1",
              damage: [],
            },
          ],
          notes: ["Brannoc was unconscious: an attack on it has advantage."],
        },
      ],
    };
    const breath = {
      ...outcome,
      steps: [
        {
          kind: "option",
          optionId: "actions/Fire Breath",
          name: "Fire Breath",
          slot: "action",
          attacks: [],
          save: {
            dc: 13,
            ability: "DEX",
            onSuccess: "half",
            damage: [{ notation: "3d6", faces: [4, 4, 4], modifier: 0, total: 12, type: "Fire" }],
            targets: [
              {
                target: { combatantId: brannoc.id, name: "Brannoc" },
                roll: null,
                succeeded: null,
                pendingSaveId: saveId,
              },
            ],
          },
          notes: [],
        },
      ],
    };
    const pending = {
      id: saveId,
      turnId,
      combatantId: brannoc.id,
      targetName: "Brannoc",
      optionName: "Fire Breath",
      ability: "DEX",
      dc: 13,
      onSuccess: "half",
      amount: 12,
      damageTypes: ["Fire"],
      state: "pending",
      total: null,
      succeeded: null,
    };
    const result = () =>
      within(card().getByRole("region", { name: `What came of ${goblinBoss.displayName}'s turn` }));
    const combatantReads = () =>
      server.calls.filter(
        (call) => call.method === "GET" && call.pathname === `${runBase}/combatants`,
      ).length;

    const offeredThenKept = async (kept: unknown) => {
      server.routes.set(turnRoute, { status: 200, sse: offered(turnId, STEPPED) });
      server.routes.set(keepRoute, { status: 200, body: kept });
      await renderRunner();
      await userEvent.click(
        await waitFor(() => card().getByRole("button", { name: "Ask Hob for its turn" })),
      );
      await waitFor(() => expect(card().getByText(STEPPED)).toBeInTheDocument());
      const before = combatantReads();
      await userEvent.click(card().getByRole("button", { name: "Keep" }));
      await waitFor(() => expect(result().getByText("Kept: its turn")).toBeInTheDocument());
      return before;
    };

    it("keeps the offer, shows each roll and who dropped, re-reads the fight, and undoes it", async () => {
      server.routes.set(`GET ${runBase}/hob/saves`, { status: 200, body: [] });
      const before = await offeredThenKept(outcome);
      expect(sent(keepRoute)).toEqual([{}]);
      const happened = within(result().getByRole("list", { name: "What happened" }));
      expect(happened.getByText("Moved 5 ft to (6,4)")).toBeInTheDocument();
      expect(
        happened.getByText("d20 17 +4 = 21 vs AC 16 · 1d6+2 [4] = 6 slashing"),
      ).toBeInTheDocument();
      expect(happened.getByText("Brannoc took 6 damage: 6 → 0, down")).toBeInTheDocument();
      expect(happened.getByText("Natural 1")).toBeInTheDocument();
      expect(happened.getByText(/Brannoc was unconscious/)).toBeInTheDocument();
      await waitFor(() => expect(combatantReads()).toBeGreaterThan(before));

      server.routes.set(undoRoute, {
        status: 200,
        body: { turnId, restored: [{ combatantId: brannoc.id, name: "Brannoc" }] },
      });
      await userEvent.click(result().getByRole("button", { name: "Undo" }));
      await waitFor(() => expect(result().getByText("Undone")).toBeInTheDocument());
      expect(sent(undoRoute)).toEqual([{}]);
      expect(result().queryByRole("button", { name: "Undo" })).toBeNull();
    });

    it("waits on a party member's save, and applies the total the DM enters", async () => {
      server.routes.set(`GET ${runBase}/hob/saves`, { status: 200, body: [pending] });
      await offeredThenKept(breath);
      const total = await waitFor(() => result().getByLabelText("Brannoc's DEX save total"));
      expect(result().getByText("Brannoc: waiting on a DEX save, DC 13")).toBeInTheDocument();
      server.routes.set(resolveRoute, {
        status: 200,
        body: {
          save: { ...pending, state: "resolved", total: 15, succeeded: true },
          hit: { amount: 6, hpBefore: 6, hpAfter: 0, dropped: true },
          judged: false,
        },
      });
      await userEvent.type(total, "15");
      await userEvent.click(result().getByRole("button", { name: "Apply save" }));
      await waitFor(() =>
        expect(result().getByText("Brannoc: 15, saved · took 6 damage")).toBeInTheDocument(),
      );
      expect(sent(resolveRoute)).toEqual([{ total: 15 }]);
    });

    it("says why a keep was refused, and keeps the offer", async () => {
      server.routes.set(turnRoute, { status: 200, sse: offered(turnId, STEPPED) });
      server.routes.set(keepRoute, {
        status: 409,
        body: {
          _tag: "Conflict",
          message: "The fight has changed since Hob proposed that turn. Ask Hob again.",
        },
      });
      await renderRunner();
      await userEvent.click(
        await waitFor(() => card().getByRole("button", { name: "Ask Hob for its turn" })),
      );
      await waitFor(() => expect(card().getByText(STEPPED)).toBeInTheDocument());
      await userEvent.click(card().getByRole("button", { name: "Keep" }));
      await waitFor(() =>
        expect(
          card().getByText("The fight has changed since Hob proposed that turn. Ask Hob again."),
        ).toBeInTheDocument(),
      );
      expect(card().getByRole("button", { name: "Keep" })).toBeInTheDocument();
    });

    it("finds this creature's kept turn again after a reload", async () => {
      server.routes.set(`GET ${runBase}/hob/kept`, {
        status: 200,
        body: [{ outcome, undoneAt: null }],
      });
      server.routes.set(`GET ${runBase}/hob/saves`, { status: 200, body: [] });
      await renderRunner();
      await waitFor(() => expect(result().getByText("Kept: its turn")).toBeInTheDocument());
      expect(result().getByRole("button", { name: "Undo" })).toBeInTheDocument();
      await userEvent.click(result().getByRole("button", { name: "Done" }));
      expect(card().queryByRole("region", { name: /^What came of/ })).toBeNull();
    });
  });

  it("says a recharge is waiting before Hob is asked", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/creatures/${goblin.id}`, {
      status: 200,
      body: {
        ...goblin,
        statBlock: {
          ...goblin.statBlock,
          actions: [
            {
              name: "Fire Breath",
              desc: "The boss exhales fire in a 15-foot cone.",
              usage: { type: "recharge on roll", dice: "1d6", minValue: 5 },
              area: { shape: "cone", feet: 15, origin: "self" },
            },
          ],
        },
      },
    });
    server.routes.set(`GET ${runBase}/combatants`, {
      status: 200,
      body: [
        brannocPlaced,
        { ...goblinBoss, position: { column: 7, row: 4 }, rechargeSpent: ["actions/Fire Breath"] },
      ],
    });
    await renderRunner();
    await waitFor(() =>
      expect(
        card().getByText(
          "Fire Breath is recharging: roll it in Resources first if this turn brings it back.",
        ),
      ).toBeInTheDocument(),
    );
  });
});
