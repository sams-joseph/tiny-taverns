import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import { campaign, installStubServer } from "../campaign/campaign.fixtures";
import { cryptLevelId, fordLevelId } from "../levels/levels.fixtures";
import { campaignId, encounterId, seatId, sessionId } from "../test/ids";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";

/**
 * A table's levels: the visits the party has been to, each opening its stage
 * from its card, put on and taken off the table, and reset only after asking;
 * opening another; and the stage, where the DM explores a visit on the
 * runner's canvas and every write draws the server's answer.
 *
 * The level renderer is three.js over WebGL, which jsdom has none of: a fake
 * records what it was handed, as `run/levelBoard.test.tsx` fakes it.
 */
const drawn = vi.hoisted(() => ({
  options: [] as Array<{ readonly viewAs: boolean }>,
  vision: [] as Array<unknown>,
}));

vi.mock("../run/fx3d/support", () => ({ canDrawWebGL: () => true }));
vi.mock("../run/fx3d/Fx3D", () => ({ Fx3D: () => null }));
vi.mock("../level/renderer", () => ({
  LevelRenderer: class {
    renderer = { domElement: document.createElement("canvas") };
    setLevel() {}
    setOptions(options: { readonly viewAs: boolean }) {
      drawn.options.push(options);
    }
    setVision(vision: unknown) {
      drawn.vision.push(vision);
    }
    setOverlay() {}
    setHover() {}
    setView() {}
    resize() {}
    start() {}
    dispose() {}
  },
}));

const server = installStubServer();

const hallId = "1e7e7000-0000-4000-8000-0000000000a1";
const cellarId = "1e7e7000-0000-4000-8000-0000000000a2";
const doorId = "1e7e7000-0000-4000-8000-000000000d01";
const stamp = "2026-10-22T19:00:00.000Z";

interface Fight {
  readonly runId: string;
  readonly sessionId: string;
  readonly name: string;
  readonly carried: boolean;
}

const summary = (
  id: string,
  name: string,
  levelId: string | null,
  onTable: boolean,
  fight: Fight | null = null,
) => ({
  id,
  levelId,
  name,
  columns: 6,
  rows: 4,
  feetPerCell: 5,
  onTable,
  fight,
  createdAt: stamp,
  updatedAt: stamp,
});

/** The hall, whole: a door down the middle, Brannoc in the west room. */
const hall = (
  over: {
    doorState?: "open" | "closed";
    column?: number;
    onTable?: boolean;
    fight?: Fight;
  } = {},
) => ({
  ...summary(hallId, "The Hall", cryptLevelId, over.onTable ?? true),
  level: {
    ambient: "dim",
    floor: Array.from({ length: 24 }, () => 1),
    walls: [
      {
        id: doorId,
        x1: 3,
        y1: 1,
        x2: 3,
        y2: 2,
        kind: "door",
        doorState: over.doorState ?? "closed",
        low: false,
        revealed: false,
      },
    ],
    props: [],
    lights: [],
    regions: [],
  },
  fog: [],
  partySees: [0, 1, 2, 6, 7, 8],
  partySeen: [0, 1, 2, 6, 7, 8],
  tokens: [{ seatId, name: "Brannoc", column: over.column ?? 0, row: 1 }],
  encounters: [],
  fight: over.fight ?? null,
});

const base = `/campaigns/${campaignId}`;

beforeEach(() => {
  server.reset();
  server.routes.set(`GET ${base}/visits`, {
    status: 200,
    body: [
      summary(cellarId, "The Cellar", null, false),
      summary(hallId, "The Hall", cryptLevelId, true),
    ],
  });
  server.routes.set(`GET ${base}/visits/${hallId}`, { status: 200, body: hall() });
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  drawn.options = [];
  drawn.vision = [];
});

const at = (path: string) =>
  renderAt(path, (route) => (
    <HostedSessionScope session={TEST_SESSION}>{route}</HostedSessionScope>
  ));

const calls = (method: string, pathname: string) =>
  server.calls.filter((call) => call.method === method && call.pathname === pathname);

describe("a table's levels", () => {
  it("lists each visit as a card that opens its stage, and says which is on the table", async () => {
    await at(`${base}/levels`);
    const name = await screen.findByRole("link", { name: "The Hall" });
    expect(name.getAttribute("data-card-link")).not.toBeNull();
    expect(name.getAttribute("href")).toBe(`${base}/levels/${hallId}`);
    const card = name.closest("[data-slot=card]") as HTMLElement;
    expect(within(card).getByText("On the table")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Take off the table" })).toBeTruthy();
    const cellar = screen.getByRole("link", { name: "The Cellar" }).closest("[data-slot=card]");
    expect(within(cellar as HTMLElement).queryByText("On the table")).toBeNull();
    // Its level was deleted: the copy stays, and the card says so.
    expect(
      within(cellar as HTMLElement).getByText(/has been deleted from your Library/),
    ).toBeTruthy();
  });

  it("names the fight holding a visit, and offers only what the server would take", async () => {
    const runId = "2b1f2a1e-0000-4000-8000-00000000f003";
    const fight = (carried: boolean) => ({ runId, sessionId, name: "Ambush", carried });
    server.routes.set(`GET ${base}/visits`, {
      status: 200,
      body: [
        summary(cellarId, "The Cellar", null, false),
        summary(hallId, "The Hall", cryptLevelId, true, fight(false)),
      ],
    });
    await at(`${base}/levels`);
    const card = (name: string) =>
      screen.getByRole("link", { name }).closest("[data-slot=card]") as HTMLElement;
    await screen.findByRole("link", { name: "The Hall" });
    // Live: the way to it, and no table change or reset anywhere.
    expect(within(card("The Hall")).getByRole("link", { name: "Ambush" })).toHaveAttribute(
      "href",
      `${base}/sessions/${sessionId}/runs/${runId}`,
    );
    expect(within(card("The Hall")).queryByRole("button")).toBeNull();
    expect(
      within(card("The Cellar")).queryByRole("button", { name: "Put on the table" }),
    ).toBeNull();
    expect(within(card("The Cellar")).getByRole("button", { name: "Reset level" })).toBeTruthy();
    cleanup();

    // Carried: still no table change, but the level may be reset.
    server.routes.set(`GET ${base}/visits`, {
      status: 200,
      body: [summary(hallId, "The Hall", cryptLevelId, true, fight(true))],
    });
    await at(`${base}/levels`);
    await screen.findByRole("link", { name: "The Hall" });
    expect(card("The Hall").textContent).toContain("was carried over here");
    expect(
      within(card("The Hall")).queryByRole("button", { name: "Take off the table" }),
    ).toBeNull();
    await userEvent.click(within(card("The Hall")).getByRole("button", { name: "Reset level" }));
    const dialog = await screen.findByRole("dialog", { name: /Reset The Hall/ });
    expect(within(dialog).getByText(/nothing is handed back/)).toBeTruthy();
  });

  it("puts a visit on the table, and the list reads again", async () => {
    server.routes.set(`PUT ${base}/table-visit`, {
      status: 200,
      body: { ...hall(), id: cellarId, name: "The Cellar" },
    });
    await at(`${base}/levels`);
    const cellar = (await screen.findByRole("link", { name: "The Cellar" })).closest(
      "[data-slot=card]",
    ) as HTMLElement;
    await userEvent.click(within(cellar).getByRole("button", { name: "Put on the table" }));
    await waitFor(() =>
      expect(calls("PUT", `${base}/table-visit`).map((call) => call.body)).toEqual([
        JSON.stringify({ visitId: cellarId }),
      ]),
    );
    await waitFor(() => expect(calls("GET", `${base}/visits`).length).toBeGreaterThan(1));
  });

  it("asks before resetting a level, saying the party's progress is lost", async () => {
    server.routes.set(`DELETE ${base}/visits/${hallId}`, { status: 204, body: undefined });
    await at(`${base}/levels`);
    const card = (await screen.findByRole("link", { name: "The Hall" })).closest(
      "[data-slot=card]",
    ) as HTMLElement;
    await userEvent.click(within(card).getByRole("button", { name: "Reset level" }));
    const dialog = await screen.findByRole("dialog", { name: /Reset The Hall/ });
    expect(within(dialog).getByText(/progress on this level is lost/)).toBeTruthy();
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset level" }));
    await waitFor(() => expect(calls("DELETE", `${base}/visits/${hallId}`)).toHaveLength(1));
  });

  it("opens one of the levels the party has not been to, and goes to its stage", async () => {
    server.routes.set(`POST ${base}/visits`, {
      status: 200,
      body: { ...hall(), id: hallId, levelId: fordLevelId, name: "Ford" },
    });
    await at(`${base}/levels`);
    await userEvent.click(await screen.findByRole("button", { name: "Open a level" }));
    const dialog = await screen.findByRole("dialog", { name: "Open a level" });
    const select = await within(dialog).findByRole("combobox", { name: "Level" });
    await userEvent.click(select);
    // The crypt has a visit already, so only the ford is offered.
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([expect.stringContaining("Ford")]);
    await userEvent.click(options[0]!);
    await userEvent.click(within(dialog).getByRole("button", { name: "Open level" }));
    await waitFor(() =>
      expect(calls("POST", `${base}/visits`).map((call) => call.body)).toEqual([
        JSON.stringify({ levelId: fordLevelId }),
      ]),
    );
    await waitFor(() => expect(calls("GET", `${base}/visits/${hallId}`).length).toBeGreaterThan(0));
  });
});

describe("a visit's stage", () => {
  const onTheCanvas = () =>
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.slot === "run-stage-probe" ? 1024 : 0;
    });

  beforeEach(() => {
    // No night open: nothing to listen to.
    server.routes.set(`GET ${base}`, {
      status: 200,
      body: { ...campaign, currentSessionId: null },
    });
  });

  it("draws the visit on the canvas with the party's token, and no fight", async () => {
    onTheCanvas();
    await at(`${base}/levels/${hallId}`);
    const board = await screen.findByRole("region", { name: "Level" });
    expect(await within(board).findByRole("button", { name: /Brannoc/ })).toBeTruthy();
    expect(document.querySelector("[data-slot=level-backdrop]")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "The Hall" })).toBeTruthy();
    // A visit has no order, no turn and no rolls.
    expect(document.querySelector("[data-slot=run-hud-turn]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Initiative/ })).toBeNull();
    // Move and Fog, and none of a fight's other tools.
    const tools = screen.getByRole("group", { name: "Tools" });
    expect(
      within(tools)
        .getAllByRole("button")
        .map((tool) => tool.getAttribute("aria-label")),
    ).toEqual(["Move", "Fog"]);
  });

  it("opens a door on a click, and draws the server's answer", async () => {
    onTheCanvas();
    server.routes.set(`PATCH ${base}/visits/${hallId}/doors/${doorId}`, {
      status: 200,
      body: hall({ doorState: "open" }),
    });
    await at(`${base}/levels/${hallId}`);
    const board = await screen.findByRole("region", { name: "Level" });
    await userEvent.click(await within(board).findByRole("button", { name: "Open the door" }));
    await waitFor(() => {
      const sent = calls("PATCH", `${base}/visits/${hallId}/doors/${doorId}`);
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0]!.body)).toMatchObject({ doorState: "open" });
    });
    expect(await within(board).findByRole("button", { name: "Close the door" })).toBeTruthy();
  });

  it("draws the party's view when the DM asks for it", async () => {
    onTheCanvas();
    await at(`${base}/levels/${hallId}`);
    await screen.findByRole("region", { name: "Level" });
    await waitFor(() => expect(drawn.options.at(-1)?.viewAs).toBe(false));
    await userEvent.click(screen.getByRole("switch", { name: "Party's view" }));
    await waitFor(() => expect(drawn.options.at(-1)?.viewAs).toBe(true));
    expect(drawn.vision.at(-1)).not.toBeNull();
  });

  it("re-reads the visit when its doorbell rings on the open night", async () => {
    onTheCanvas();
    server.routes.set(`GET ${base}`, { status: 200, body: campaign });
    const line = {
      id: "2b1f2a1e-0000-4000-8000-000000009001",
      sessionId,
      seq: 41,
      kind: "visit-door-updated",
      encounterRunId: null,
      combatantId: null,
      levelVisitId: hallId,
      payload: {},
      visibility: "dm",
      origin: "authored",
      assistantTurnId: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    server.routes.set(`GET ${base}/sessions/${sessionId}/visits/${hallId}/events`, {
      status: 200,
      sse: `id: 41\nevent: session-event\ndata: ${JSON.stringify(line)}\n\n`,
    } as never);
    await at(`${base}/levels/${hallId}`);
    await screen.findByRole("region", { name: "Level" });
    await waitFor(() => expect(calls("GET", `${base}/visits/${hallId}`).length).toBeGreaterThan(1));
  });

  it("marks the encounters waiting on the level, and opens one from its creature", async () => {
    onTheCanvas();
    const line = "2b1f2a1e-0000-4000-8000-000000000b01";
    const creature = (ordinal: number, column: number, problem: string | null) => ({
      encounterCreatureId: line,
      ordinal,
      name: "Goblin",
      column,
      row: 2,
      problem,
    });
    server.routes.set(`GET ${base}/visits/${hallId}`, {
      status: 200,
      body: {
        ...hall(),
        encounters: [
          {
            id: encounterId,
            name: "Ambush",
            kind: "combat",
            creatures: [
              creature(0, 1, null),
              creature(1, 2, "blocked"),
              creature(2, 9, "offBoard"),
            ],
            trigger: [{ column: 0, row: 3 }],
            noticed: false,
          },
        ],
      },
    });
    await at(`${base}/levels/${hallId}`);
    const board = await screen.findByRole("region", { name: "Level" });
    // On the board: the two the copy has a square for, as the DM's hidden
    // tokens; the trigger area and the one that needs moving marked.
    const waiting = await within(board).findAllByRole("button", { name: /Goblin, Ambush/ });
    expect(waiting).toHaveLength(2);
    expect(document.querySelectorAll("[data-trigger]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-needs-moving]")).toHaveLength(1);

    // The drawer lists it, with what needs moving, by name.
    await userEvent.click(screen.getByRole("button", { name: "Waiting here" }));
    const list = document.querySelector<HTMLElement>("[data-slot=waiting-here]");
    expect(list).not.toBeNull();
    expect(within(list!).getByRole("link", { name: "Ambush" })).toHaveAttribute(
      "href",
      `${base}/encounters/${encounterId}#placement`,
    );
    expect(list!.textContent).toContain("3 creatures wait, with a trigger area");
    expect(list!.textContent).toContain("Goblin (nothing can stand there), Goblin (past the edge)");

    // A creature on the board opens its encounter.
    await userEvent.click(waiting[0]!);
    await waitFor(() =>
      expect(globalThis.location.pathname).toBe(`${base}/encounters/${encounterId}`),
    );
  });

  it("is read-only under a banner to the fight while a fight borrows the visit", async () => {
    onTheCanvas();
    const runId = "2b1f2a1e-0000-4000-8000-00000000f001";
    server.routes.set(`GET ${base}/visits/${hallId}`, {
      status: 200,
      body: hall({ fight: { runId, sessionId, name: "Ambush", carried: false } }),
    });
    await at(`${base}/levels/${hallId}`);
    const board = await screen.findByRole("region", { name: "Level" });
    const banner = document.querySelector<HTMLElement>("[data-slot=visit-fight-banner]");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("Ambush is being played here");
    const go = banner!.querySelector("a");
    expect(go?.textContent).toBe("Go to the fight");
    expect(go).toHaveAttribute("href", `${base}/sessions/${sessionId}/runs/${runId}`);
    // Nothing on the board writes: the door is drawn and does not switch, the
    // tools are off, and the table cannot change under the fight.
    const door = await within(board).findByRole("button", { name: "Open the door" });
    expect(door).toBeDisabled();
    for (const tool of within(screen.getByRole("group", { name: "Tools" })).getAllByRole(
      "button",
    )) {
      expect(tool).toBeDisabled();
    }
    expect(screen.getByRole("switch", { name: "On the table" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  const noticedHall = (noticed: boolean) => ({
    ...hall(),
    encounters: [
      {
        id: encounterId,
        name: "Ambush",
        kind: "combat",
        creatures: [
          {
            encounterCreatureId: "2b1f2a1e-0000-4000-8000-000000000b01",
            ordinal: 0,
            name: "Goblin",
            column: 1,
            row: 2,
            problem: null,
          },
        ],
        trigger: null,
        noticed,
      },
    ],
  });

  it("asks to start an encounter the party has noticed, and Not yet leaves it In sight", async () => {
    onTheCanvas();
    server.routes.set(`GET ${base}/visits/${hallId}`, { status: 200, body: noticedHall(true) });
    await at(`${base}/levels/${hallId}`);
    const prompt = await screen.findByRole("region", { name: "Ambush is in sight" });
    expect(prompt.textContent).toContain("Ambush — the party has seen them. Start it?");
    // The board is still the DM's while it asks.
    expect(screen.getByRole("region", { name: "Level" })).toBeTruthy();

    await userEvent.click(within(prompt).getByRole("button", { name: "Not yet" }));
    expect(screen.queryByRole("region", { name: "Ambush is in sight" })).toBeNull();
    // Nothing was written: no dismissal is stored.
    expect(server.calls.filter((call) => call.method !== "GET")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Waiting here" }));
    const list = document.querySelector<HTMLElement>("[data-slot=waiting-here]")!;
    expect(within(list).getByText("In sight")).toBeTruthy();
    expect(within(list).getByRole("button", { name: "Start" })).toBeTruthy();
  });

  it("asks when the visit's stream says the party noticed an encounter", async () => {
    onTheCanvas();
    server.routes.set(`GET ${base}`, { status: 200, body: campaign });
    let reads = 0;
    server.routes.set(`GET ${base}/visits/${hallId}`, {
      status: 200,
      body: () => noticedHall((reads += 1) > 1),
    });
    const line = {
      id: "2b1f2a1e-0000-4000-8000-000000009002",
      sessionId,
      seq: 42,
      kind: "visit-encounter-noticed",
      encounterRunId: null,
      combatantId: null,
      levelVisitId: hallId,
      payload: { encounterId, name: "Ambush" },
      visibility: "dm",
      origin: "authored",
      assistantTurnId: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    server.routes.set(`GET ${base}/sessions/${sessionId}/visits/${hallId}/events`, {
      status: 200,
      sse: `id: 42\nevent: session-event\ndata: ${JSON.stringify(line)}\n\n`,
    } as never);
    await at(`${base}/levels/${hallId}`);
    expect(await screen.findByRole("region", { name: "Ambush is in sight" })).toBeTruthy();
  });

  it("opens the start flow with the noticed encounter picked on Start", async () => {
    onTheCanvas();
    server.routes.set(`GET ${base}/visits/${hallId}`, { status: 200, body: noticedHall(true) });
    await at(`${base}/levels/${hallId}`);
    const prompt = await screen.findByRole("region", { name: "Ambush is in sight" });
    await userEvent.click(within(prompt).getByRole("button", { name: "Start" }));
    const title = await screen.findByText("Put an encounter on the table");
    const dialog = title.closest<HTMLElement>("[role=dialog]")!;
    expect(within(dialog).getByRole("combobox", { name: "Encounter" }).textContent).toContain(
      "Ambush in the reeds",
    );
    // Answered: the prompt does not ask again behind the dialog.
    expect(screen.queryByRole("region", { name: "Ambush is in sight" })).toBeNull();
    // Nothing starts until the DM confirms there.
    expect(server.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("says a carried fight holds the visit, and goes to it", async () => {
    onTheCanvas();
    const runId = "2b1f2a1e-0000-4000-8000-00000000f002";
    server.routes.set(`GET ${base}/visits/${hallId}`, {
      status: 200,
      body: hall({ fight: { runId, sessionId, name: "Ambush", carried: true } }),
    });
    await at(`${base}/levels/${hallId}`);
    await screen.findByRole("region", { name: "Level" });
    const banner = document.querySelector<HTMLElement>("[data-slot=visit-fight-banner]");
    expect(banner!.textContent).toContain("Ambush was carried over");
    expect(banner!.querySelector("a")).toHaveAttribute(
      "href",
      `${base}/sessions/${sessionId}/runs/${runId}`,
    );
  });

  it("says the level needs a wider window rather than squeezing the stage", async () => {
    await at(`${base}/levels/${hallId}`);
    expect(await screen.findByText("The level needs a wider window")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Level" })).toBeNull();
  });
});
