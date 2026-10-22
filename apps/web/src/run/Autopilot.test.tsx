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
 * **Hob's autopilot in the runner**, against the stub server: with this tab
 * the fight's driver and the Goblin Boss up, the runner asks Hob for its
 * turn, keeps it, shows it on the card through a countdown, and moves the
 * marker on from the boss. It waits on a party member's save and goes on once
 * the DM enters it, pauses when Hob offers nothing, and stops on *Stop*.
 */
const server = installRunServer();

const DRIVER = "2b1f2a1e-0000-4000-8000-00000000a0f1";
const OTHER_TAB = "2b1f2a1e-0000-4000-8000-00000000a0f2";
const runBase = `/campaigns/${campaignId}/sessions/${liveRun.sessionId}/runs/${liveRun.id}`;
const turnRoute = `POST ${runBase}/combatants/${goblinBoss.id}/hob/turn`;
const nextRoute = `POST ${runBase}/next-turn`;
const threadId = "2b1f2a1e-0000-4000-8000-00000000f001";
const turnId = "2b1f2a1e-0000-4000-8000-00000000f002";
const keepRoute = `POST ${runBase}/hob/turns/${turnId}/keep`;
const saveId = "2b1f2a1e-0000-4000-8000-00000000f0a1";

const NARRATION = "The boss lunges at Brannoc, scimitar high.";

const proposal = {
  target: "npcTurn",
  sessionId: liveRun.sessionId,
  runId: liveRun.id,
  combatantId: goblinBoss.id,
  combatantName: goblinBoss.displayName,
  moment: "turn",
  round: liveRun.round,
  stamp: "a".repeat(64),
  steps: [{ kind: "move", to: { column: 6, row: 4 }, feet: 5 }],
  narration: NARRATION,
  instruction: null,
};

const offered = sseFrames([
  { event: "began", data: { threadId, turnId } },
  { event: "proposal", data: { turnId, proposal } },
  { event: "done", data: { reason: "tool-calls" } },
]);

const outcome = {
  turnId,
  sessionId: liveRun.sessionId,
  runId: liveRun.id,
  combatantId: goblinBoss.id,
  combatantName: goblinBoss.displayName,
  moment: "turn",
  round: liveRun.round,
  narration: NARRATION,
  steps: [{ kind: "move", to: { column: 6, row: 4 }, feet: 5 }],
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

const bar = () => within(screen.getByRole("region", { name: "Hob's autopilot" }));
const card = () =>
  within(screen.getByRole("region", { name: `Hob for ${goblinBoss.displayName}` }));

const sent = (route: string) =>
  server.calls
    .filter((call) => `${call.method} ${call.pathname}` === route)
    .map((call) => JSON.parse(call.body === "" ? "{}" : call.body) as Record<string, unknown>);

/** The run with the boss up and `driver` driving it. */
const upWith = (driver: string | null) =>
  server.routes.set(`GET ${runBase}`, {
    status: 200,
    body: { ...liveRun, activeCombatantId: goblinBoss.id, hobAutopilotDriver: driver },
  });

beforeEach(() => {
  server.reset();
  window.sessionStorage.setItem("taverns.hob-autopilot.driver", DRIVER);
  upWith(DRIVER);
  server.routes.set(`GET ${runBase}/combatants`, {
    status: 200,
    body: [brannocPlaced, { ...goblinBoss, position: { column: 7, row: 4 } }],
  });
  server.routes.set(`GET /campaigns/${campaignId}/hob`, {
    status: 200,
    body: { available: true, model: "scripted", campaign: "The Salt Road" },
  });
  server.routes.set(`GET ${runBase}/hob/saves`, { status: 200, body: [] });
  server.routes.set(turnRoute, { status: 200, sse: offered });
  server.routes.set(keepRoute, { status: 200, body: outcome });
  server.routes.set(nextRoute, {
    status: 200,
    body: { ...liveRun, activeCombatantId: brannoc.id, hobAutopilotDriver: DRIVER },
  });
});
afterEach(() => {
  server.drop();
  window.sessionStorage.clear();
});

/** Hob's turn, kept and on the card, with the countdown running. */
const keptAndCounting = async () => {
  await renderRunner();
  await waitFor(() => expect(bar().getByRole("button", { name: "Next now" })).toBeInTheDocument());
  expect(
    within(
      card().getByRole("region", { name: `What came of ${goblinBoss.displayName}'s turn` }),
    ).getByText("Kept: its turn"),
  ).toBeInTheDocument();
  await waitFor(() => expect(bar().getByRole("status")).toHaveTextContent(/Next in \ds\./));
};

describe("Hob's autopilot in the runner", () => {
  it("takes the monster's turn, keeps it, and moves on from it to the next creature", async () => {
    await keptAndCounting();
    expect(sent(turnRoute)).toEqual([{ moment: "turn" }]);
    expect(sent(keepRoute)).toEqual([{}]);
    // While it drives, the card asks nothing by hand.
    expect(card().queryByRole("button", { name: "Ask Hob for its turn" })).toBeNull();

    upWith(DRIVER).set(`GET ${runBase}`, {
      status: 200,
      body: { ...liveRun, activeCombatantId: brannoc.id, hobAutopilotDriver: DRIVER },
    });
    await userEvent.click(bar().getByRole("button", { name: "Next now" }));
    await waitFor(() => expect(sent(nextRoute)).toHaveLength(1));
    expect(sent(nextRoute)[0]).toMatchObject({ expectedActiveCombatantId: goblinBoss.id });
    // Brannoc is up: the table's turn, and the loop waits.
    await waitFor(() =>
      expect(bar().getByRole("status")).toHaveTextContent(/takes the next monster's turn/),
    );
    expect(sent(turnRoute)).toHaveLength(1);
  });

  it("moves on by itself once the countdown runs out", async () => {
    await keptAndCounting();
    upWith(DRIVER).set(`GET ${runBase}`, {
      status: 200,
      body: { ...liveRun, activeCombatantId: brannoc.id, hobAutopilotDriver: DRIVER },
    });
    await waitFor(() => expect(sent(nextRoute)).toHaveLength(1), { timeout: 8_000 });
  });

  it("waits on a party member's save, and goes on once the DM enters it", async () => {
    server.routes.set(keepRoute, { status: 200, body: breath });
    server.routes.set(`GET ${runBase}/hob/saves`, { status: 200, body: [pending] });
    await renderRunner();
    await waitFor(() =>
      expect(bar().getByRole("status")).toHaveTextContent(/Waiting on the saves/),
    );
    expect(bar().queryByRole("button", { name: "Next now" })).toBeNull();

    const result = within(
      card().getByRole("region", { name: `What came of ${goblinBoss.displayName}'s turn` }),
    );
    server.routes.set(`POST ${runBase}/hob/saves/${saveId}/resolve`, {
      status: 200,
      body: {
        save: { ...pending, state: "resolved", total: 15, succeeded: true },
        hit: { amount: 6, hpBefore: 6, hpAfter: 0, dropped: true },
        judged: false,
      },
    });
    await userEvent.type(result.getByLabelText("Brannoc's DEX save total"), "15");
    await userEvent.click(result.getByRole("button", { name: "Apply save" }));
    await waitFor(() =>
      expect(bar().getByRole("button", { name: "Next now" })).toBeInTheDocument(),
    );
    expect(sent(nextRoute)).toHaveLength(0);
  });

  it("pauses when Hob offers nothing, and hands the card back to the DM", async () => {
    server.routes.set(turnRoute, {
      status: 200,
      sse: sseFrames([
        { event: "began", data: { threadId, turnId } },
        { event: "failed", data: { message: "Hob ran out of room to answer." } },
      ]),
    });
    await renderRunner();
    await waitFor(() =>
      expect(bar().getByRole("status")).toHaveTextContent(
        "Autopilot is paused: Hob ran out of room to answer.",
      ),
    );
    expect(bar().getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(sent(keepRoute)).toHaveLength(0);
    // The DM can ask by hand again.
    expect(card().getByRole("button", { name: "Ask Hob for its turn" })).toBeInTheDocument();
  });

  it("stops on Stop, and Resume carries on from where it was", async () => {
    await keptAndCounting();
    await userEvent.click(bar().getByRole("button", { name: "Stop" }));
    expect(bar().getByRole("status")).toHaveTextContent("Autopilot is paused: you stopped it.");
    expect(bar().queryByRole("button", { name: "Next now" })).toBeNull();

    await userEvent.click(bar().getByRole("button", { name: "Resume" }));
    await waitFor(() =>
      expect(bar().getByRole("button", { name: "Next now" })).toBeInTheDocument(),
    );
    expect(sent(keepRoute)).toHaveLength(1);
    expect(sent(nextRoute)).toHaveLength(0);
  });

  it("turns on for this tab, and says when another tab drives", async () => {
    upWith(null);
    server.routes.set(`PATCH ${runBase}`, {
      status: 200,
      body: { ...liveRun, activeCombatantId: goblinBoss.id, hobAutopilotDriver: OTHER_TAB },
    });
    await renderRunner();
    await userEvent.click(await screen.findByRole("button", { name: "Hob settings" }));
    const toggle = await screen.findByRole("switch", { name: "Autopilot" });
    expect(screen.queryByRole("region", { name: "Hob's autopilot" })).toBeNull();
    await userEvent.click(toggle);
    await waitFor(() => expect(sent(`PATCH ${runBase}`)).toEqual([{ hobAutopilotDriver: DRIVER }]));
    // The answer says another tab drives (as if it took over since): this one only offers to.
    await waitFor(() =>
      expect(bar().getByRole("button", { name: "Drive here" })).toBeInTheDocument(),
    );
    expect(bar().getByRole("status")).toHaveTextContent(/another tab or device/);
    expect(sent(turnRoute)).toHaveLength(0);
  });

  it("offers no switch when Hob is off", async () => {
    upWith(null);
    server.routes.set(`GET /campaigns/${campaignId}/hob`, {
      status: 200,
      body: { available: false, model: null, campaign: "The Salt Road" },
    });
    await renderRunner();
    await screen.findByRole("switch", { name: "Share" });
    // Once the status has been read, and not before, is the absence worth anything.
    await waitFor(() =>
      expect(
        server.calls.filter(
          (call) => call.method === "GET" && call.pathname === `/campaigns/${campaignId}/hob`,
        ).length,
      ).toBeGreaterThan(0),
    );
    await screen.findByRole("region", { name: "Hob for Goblin Boss" }).catch(() => undefined);
    // Nor the button it sits behind: the spending switch is Hob's too, and off.
    expect(screen.queryByRole("button", { name: "Hob settings" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Autopilot" })).toBeNull();
  });
});
