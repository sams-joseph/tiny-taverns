import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bodyOf,
  brannoc,
  campaignId,
  installRunServer,
  liveRun,
  liveScene,
  loggedCheck,
  renderRunner,
  sceneOf,
  sceneRun,
  sorrel,
  type SceneMode,
} from "./run.fixtures";

/**
 * The runner for a scene that is not a fight — `SceneRunner.tsx` — against the
 * stub server: what each kind draws, what each act sends, and that none of it
 * invents a number the scene does not hold. Layout is the Playwright suite's
 * (`e2e/layout/run.spec.ts`).
 */

const server = installRunServer();

const runBase = `/campaigns/${campaignId}/sessions/${liveRun.sessionId}/runs/${liveRun.id}`;

const open = async (mode: SceneMode, scene?: Record<string, unknown>) => {
  server.routes = liveScene(mode);
  if (scene !== undefined) server.routes.set(`GET ${runBase}/scene`, { status: 200, body: scene });
  await renderRunner();
};

const header = () => within(document.querySelector("[data-slot=page-heading]") as HTMLElement);
const region = (name: string) => within(screen.getByRole("region", { name }));
const sceneReads = () =>
  server.calls.filter((call) => call.method === "GET" && call.pathname === `${runBase}/scene`)
    .length;

beforeEach(() => server.reset());
afterEach(() => {
  server.drop();
  vi.restoreAllMocks();
});

describe("a conversation", () => {
  it("is headed by its kind and the DM's note, and takes no turns", async () => {
    await open("social");
    await screen.findByRole("region", { name: "The conversation" });
    expect(header().getByText("Social")).toBeInTheDocument();
    expect(header().getByText("Attitude: hostile · 1 check")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Next turn/ })).toBeNull();
    expect(screen.queryByRole("table", { name: "Initiative order" })).toBeNull();
    // The read-aloud attached to its encounter, and none of the drawing's
    // invented DCs by attitude.
    expect(region("Read aloud").getByText(/legs of driftwood/)).toBeInTheDocument();
    expect(region("The conversation").queryByText(/DC/)).toBeNull();
    expect(region("The conversation").getByText(/If it turns, Green Hag join/)).toBeInTheDocument();
  });

  it("writes the attitude, and clears it with a second press", async () => {
    await open("social");
    const attitude = await screen.findByRole("group", { name: "Attitude" });
    await userEvent.click(within(attitude).getByRole("button", { name: "Friendly" }));
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", "/scene")).toEqual({ attitude: "friendly" }),
    );

    server.calls.length = 0;
    await userEvent.click(within(attitude).getByRole("button", { name: "Hostile" }));
    await waitFor(() => expect(bodyOf(server, "PATCH", "/scene")).toEqual({ attitude: null }));
  });

  it("ticks a beat by its place", async () => {
    await open("social");
    const beats = await screen.findByRole("list", { name: "Beats to hit" });
    const [first, second] = within(beats).getAllByRole("checkbox");
    expect(first).toBeChecked();
    await userEvent.click(second!);
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", "/scene")).toEqual({ beat: { index: 1, done: true } }),
    );
  });

  it("logs a check against the DC the DM set, starting from the last one", async () => {
    await open("social");
    const card = within(await screen.findByRole("region", { name: "Make a check" }));
    expect(card.getByLabelText("DC")).toHaveValue("15");
    expect(card.getByRole("button", { name: /Log check/ })).toBeDisabled();

    await userEvent.click(card.getByRole("button", { name: "Sorrel" }));
    await userEvent.click(card.getByRole("button", { name: "Persuasion" }));
    await userEvent.type(card.getByLabelText("Their total"), "16");
    expect(card.getByText("Beats DC 15.")).toBeInTheDocument();

    const before = sceneReads();
    await userEvent.click(card.getByRole("button", { name: /Log check/ }));
    await waitFor(() =>
      expect(bodyOf(server, "POST", "/checks")).toMatchObject({
        combatantId: sorrel.id,
        skill: "Persuasion",
        total: 16,
        dc: 15,
      }),
    );
    // The write names the scene, which is read again.
    await waitFor(() => expect(sceneReads()).toBeGreaterThan(before));
    // Ready for the next one, with the DC kept.
    await waitFor(() => expect(card.getByLabelText("Their total")).toHaveValue(""));
    expect(card.getByLabelText("DC")).toHaveValue("15");
  });

  it("rolls for them with their sheet's modifier, into the DM's dice", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await open("social");
    const card = within(await screen.findByRole("region", { name: "Make a check" }));
    await userEvent.click(card.getByRole("button", { name: "Sorrel" }));
    // Sorrel's Charisma is −1 and Persuasion is not on her sheet.
    await waitFor(() =>
      expect(card.getByRole("button", { name: "Persuasion" })).toHaveTextContent("-1"),
    );
    await userEvent.click(card.getByRole("button", { name: "Persuasion" }));
    await userEvent.click(card.getByRole("button", { name: /Roll for them/ }));
    expect(card.getByLabelText("Their total")).toHaveValue("10");
    expect(
      within(screen.getByRole("list", { name: "Your rolls" })).getByText("Sorrel · Persuasion"),
    ).toBeInTheDocument();
  });

  it("offers no roll when the sheet says nothing", async () => {
    await open("social");
    const card = within(await screen.findByRole("region", { name: "Make a check" }));
    await userEvent.click(card.getByRole("button", { name: "Sorrel" }));
    await userEvent.type(card.getByLabelText("Another skill"), "Thieves' tools");
    expect(card.getByRole("button", { name: /Roll for them/ })).toBeDisabled();
  });

  it("takes a logged check back", async () => {
    await open("social");
    const log = await screen.findByRole("list", { name: "Logged checks" });
    await userEvent.click(within(log).getByRole("button", { name: "Remove Brannoc's Persuasion" }));
    await waitFor(() =>
      expect(
        server.calls.some(
          (call) =>
            call.method === "DELETE" &&
            call.pathname.endsWith(`/checks/${String(loggedCheck({})["id"])}`),
        ),
      ).toBe(true),
    );
  });

  it("turns into a fight with Roll initiative", async () => {
    await open("social");
    await screen.findByRole("region", { name: "The conversation" });
    // The server's answer from then on is the fight.
    const fight = { ...sceneRun("social"), mode: "combat", activeCombatantId: brannoc.id };
    server.routes.set(`GET ${runBase}`, { status: 200, body: fight });
    server.routes.set(`POST ${runBase}/escalate`, { status: 200, body: fight });

    await userEvent.click(screen.getByRole("button", { name: /Roll initiative/ }));
    await waitFor(() =>
      expect(server.calls.some((call) => call.pathname.endsWith("/escalate"))).toBe(true),
    );
    await screen.findByRole("table", { name: "Initiative order" });
    expect(header().getByText("Round 1")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "The conversation" })).toBeNull();
  });
});

describe("a skill challenge", () => {
  it("counts its log against its numbers, and logs at its own DC", async () => {
    await open("challenge");
    const challenge = within(await screen.findByRole("region", { name: "The challenge" }));
    expect(challenge.getByRole("img", { name: "Successes: 1 of 3" })).toBeInTheDocument();
    expect(challenge.getByRole("img", { name: "Failures: 0 of 2" })).toBeInTheDocument();
    expect(header().getByText("Skill challenge")).toBeInTheDocument();
    expect(header().getByText("1 of 3 successes · 0 of 2 failures")).toBeInTheDocument();

    const card = within(screen.getByRole("region", { name: "Make a check" }));
    expect(card.getByText("DC 14")).toBeInTheDocument();
    expect(card.queryByLabelText("DC")).toBeNull();
    await userEvent.click(card.getByRole("button", { name: "Brannoc" }));
    // The challenge's own skills, Athletics off Brannoc's sheet.
    expect(card.getByRole("button", { name: "Athletics" })).toHaveTextContent("+7");
    await userEvent.click(card.getByRole("button", { name: "Athletics" }));
    await userEvent.type(card.getByLabelText("Their total"), "9");
    expect(card.getByText("Misses DC 14.")).toBeInTheDocument();
    await userEvent.click(card.getByRole("button", { name: /Log check/ }));
    await waitFor(() => expect(bodyOf(server, "POST", "/checks")).toBeDefined());
    const sent = bodyOf(server, "POST", "/checks") as Record<string, unknown>;
    expect(sent).toMatchObject({ combatantId: brannoc.id, skill: "Athletics", total: 9 });
    // The server fills in the challenge's DC.
    expect(sent["dc"]).toBeUndefined();
  });

  it("says they made it, with the prep's own line, and stops taking checks", async () => {
    const won = {
      ...sceneOf("challenge"),
      checks: [1, 2, 3].map((n) =>
        loggedCheck({
          id: `2b1f2a1e-0000-4000-8000-00000000${String(n).padStart(4, "0")}`,
          skill: "Survival",
          total: 15,
          dc: 14,
        }),
      ),
    };
    await open("challenge", won);
    const challenge = within(await screen.findByRole("region", { name: "The challenge" }));
    expect(challenge.getByText("They made it")).toBeInTheDocument();
    expect(challenge.getByText(/buried cache/)).toBeInTheDocument();
    expect(header().getByText("Challenge won · 3 checks")).toBeInTheDocument();
    const card = within(screen.getByRole("region", { name: "Make a check" }));
    expect(card.getByText("The challenge is settled.")).toBeInTheDocument();
    expect(card.getByRole("button", { name: /Log check/ })).toBeDisabled();
  });

  it("says it went wrong, and borrows no line the prep did not write", async () => {
    const lost = {
      ...sceneOf("challenge"),
      checks: [1, 2].map((n) =>
        loggedCheck({
          id: `2b1f2a1e-0000-4000-8000-00000000${String(n).padStart(4, "0")}`,
          skill: "Nature",
          total: 3,
          dc: 14,
          outcome: "failure",
        }),
      ),
    };
    await open("challenge", lost);
    const challenge = within(await screen.findByRole("region", { name: "The challenge" }));
    const panel = challenge.getByText("It went wrong").parentElement!;
    expect(panel.textContent).toBe("It went wrong");
  });
});

describe("a hazard", () => {
  it("calls for one save each per stage, and waits for everyone", async () => {
    await open("hazard");
    const hazard = within(await screen.findByRole("region", { name: "The hazard" }));
    expect(hazard.getByRole("heading", { name: "Stage 1 of 2" })).toBeInTheDocument();
    expect(hazard.getByText("CON save DC 13")).toBeInTheDocument();
    expect(hazard.getByText(/On a failed save: 1 level of exhaustion\./)).toBeInTheDocument();
    expect(hazard.getByText("Saved · 17")).toBeInTheDocument();
    expect(hazard.getByText("1 still to save this stage.")).toBeInTheDocument();
    expect(hazard.getByRole("button", { name: /Next stage/ })).toBeDisabled();
    // No check card: a hazard's saves are its rows.
    expect(screen.queryByRole("region", { name: "Make a check" })).toBeNull();

    await userEvent.click(hazard.getByRole("button", { name: "Sorrel fails" }));
    await waitFor(() =>
      expect(bodyOf(server, "POST", "/checks")).toMatchObject({
        combatantId: sorrel.id,
        save: "CON",
        outcome: "failure",
      }),
    );
  });

  it("rolls a save with the sheet's save, and lets the server say how it went", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await open("hazard");
    const hazard = within(await screen.findByRole("region", { name: "The hazard" }));
    await userEvent.click(hazard.getByRole("button", { name: "Roll Sorrel's save" }));
    await waitFor(() => expect(bodyOf(server, "POST", "/checks")).toBeDefined());
    const sent = bodyOf(server, "POST", "/checks") as Record<string, unknown>;
    // d20 11, CON save +1.
    expect(sent).toMatchObject({ combatantId: sorrel.id, save: "CON", total: 12 });
    expect(sent["outcome"]).toBeUndefined();
    expect(sent["dc"]).toBeUndefined();
  });

  it("takes a save back", async () => {
    await open("hazard");
    const hazard = within(await screen.findByRole("region", { name: "The hazard" }));
    await userEvent.click(hazard.getByRole("button", { name: "Remove Brannoc's save" }));
    await waitFor(() =>
      expect(
        server.calls.some((call) => call.method === "DELETE" && call.pathname.includes("/checks/")),
      ).toBe(true),
    );
  });

  const allIn = (stage: number) => ({
    ...sceneOf("hazard"),
    stage,
    checks: [
      loggedCheck({ save: "CON", total: 17, dc: 13, stage }),
      loggedCheck({
        id: "2b1f2a1e-0000-4000-8000-000000000e02",
        combatantId: sorrel.id,
        displayName: "Sorrel",
        save: "CON",
        outcome: "failure",
        stage,
      }),
    ],
  });

  it("moves on when everyone has saved", async () => {
    await open("hazard", allIn(1));
    const hazard = within(await screen.findByRole("region", { name: "The hazard" }));
    expect(hazard.getByText("Everyone has saved this stage.")).toBeInTheDocument();
    await userEvent.click(hazard.getByRole("button", { name: /Next stage/ }));
    await waitFor(() => expect(bodyOf(server, "PATCH", "/scene")).toEqual({ stage: 2 }));
  });

  it("steps back a stage, and on the last one ends with the runner's own End", async () => {
    await open("hazard", allIn(2));
    const hazard = within(await screen.findByRole("region", { name: "The hazard" }));
    expect(hazard.queryByRole("button", { name: /Next stage/ })).toBeNull();
    await userEvent.click(hazard.getByRole("button", { name: /Back a stage/ }));
    await waitFor(() => expect(bodyOf(server, "PATCH", "/scene")).toEqual({ stage: 1 }));
    // The step's own write settles before the next press lands.
    await waitFor(() =>
      expect(hazard.getByRole("button", { name: "End the hazard" })).toBeEnabled(),
    );
    await userEvent.click(hazard.getByRole("button", { name: "End the hazard" }));
    await screen.findByText("End this hazard?");
    expect(screen.getByText(/The checks and saves for Salt-flat sandstorm/)).toBeInTheDocument();
    // The dialog's own, with the runner behind it out of reach.
    expect(screen.getByRole("button", { name: "End the hazard" })).toBeInTheDocument();
  });

  it("sets how long it lasts when it begins, rolling the prep's dice", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await open("hazard", { ...sceneOf("hazard"), stage: null, stages: null, checks: [] });
    const hazard = within(await screen.findByRole("region", { name: "The hazard" }));
    expect(hazard.getByText(/It lasts 1d4 hours/)).toBeInTheDocument();
    expect(header().getByText("CON save DC 13 · not begun")).toBeInTheDocument();
    await userEvent.click(hazard.getByRole("button", { name: /Roll 1d4/ }));
    expect(hazard.getByLabelText("How many stages")).toHaveValue("3");
    await userEvent.click(hazard.getByRole("button", { name: "Begin" }));
    await waitFor(() => expect(bodyOf(server, "PATCH", "/scene")).toEqual({ stages: 3, stage: 1 }));
  });

  it("puts exhaustion on the character as a condition", async () => {
    await open("hazard");
    const hazard = within(await screen.findByRole("region", { name: "The hazard" }));
    await userEvent.click(hazard.getByRole("button", { name: "Sorrel's conditions" }));
    await userEvent.click(hazard.getByRole("button", { name: "More exhaustion for Sorrel" }));
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/combatants/${sorrel.id}`)).toEqual({
        conditions: ["Exhaustion 1"],
      }),
    );
  });
});

it("keeps the fight's own runner for a fight", async () => {
  await renderRunner();
  await screen.findByRole("table", { name: "Initiative order" });
  expect(server.calls.some((call) => call.pathname.endsWith("/scene"))).toBe(false);
});
