import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import { campaign, installStubServer } from "../campaign/campaign.fixtures";
import { cryptLevelId, fordLevelId } from "../levels/levels.fixtures";
import { campaignId, seatId, sessionId } from "../test/ids";
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

const summary = (id: string, name: string, levelId: string | null, onTable: boolean) => ({
  id,
  levelId,
  name,
  columns: 6,
  rows: 4,
  feetPerCell: 5,
  onTable,
  createdAt: stamp,
  updatedAt: stamp,
});

/** The hall, whole: a door down the middle, Brannoc in the west room. */
const hall = (
  over: { doorState?: "open" | "closed"; column?: number; onTable?: boolean } = {},
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

  it("says the level needs a wider window rather than squeezing the stage", async () => {
    await at(`${base}/levels/${hallId}`);
    expect(await screen.findByText("The level needs a wider window")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Level" })).toBeNull();
  });
});
