import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bodyOf,
  campaignId,
  installRunServer,
  liveRun,
  renderRunner,
  runLevelBoard,
  runLevelDoorId,
  runLevelSecretId,
  runLevelTorchId,
  sessionEvent,
} from "./run.fixtures";

/**
 * A fight on a level, on the DM's canvas: the level is drawn by the level
 * renderer under the board, and the board's door and light switches call the
 * live writes and draw the server's answer.
 *
 * The renderer is three.js over WebGL, which jsdom has none of: it is a fake
 * that records what it was handed, behind the same dynamic import, as
 * `level/LevelEditor.test.tsx` fakes it. The combat effects' own WebGL stage
 * is put away, since this file says WebGL is there.
 */
const drawn = vi.hoisted(() => ({
  levels: [] as Array<{ readonly columns: number; readonly walls: ReadonlyArray<unknown> }>,
  views: [] as Array<{ readonly zoom: number }>,
  options: [] as Array<{ readonly viewAs: boolean; readonly lit: boolean }>,
  disposed: 0,
}));

vi.mock("./fx3d/support", () => ({ canDrawWebGL: () => true }));
vi.mock("./fx3d/Fx3D", () => ({ Fx3D: () => null }));
vi.mock("../level/renderer", () => ({
  LevelRenderer: class {
    renderer = { domElement: document.createElement("canvas") };
    setLevel(level: { readonly columns: number; readonly walls: ReadonlyArray<unknown> }) {
      drawn.levels.push(level);
    }
    setOptions(options: { readonly viewAs: boolean; readonly lit: boolean }) {
      drawn.options.push(options);
    }
    setVision() {}
    setOverlay() {}
    setHover() {}
    setView(view: { readonly zoom: number }) {
      drawn.views.push(view);
    }
    resize() {}
    start() {}
    dispose() {
      drawn.disposed += 1;
    }
  },
}));

const server = installRunServer();

const serverRunBase = () =>
  `/campaigns/${campaignId}/sessions/${liveRun.sessionId}/runs/${liveRun.id}`;

/** Put the runner on its canvas: the probe the stylesheet shows from `@3xl`. */
const onTheCanvas = () =>
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.slot === "run-stage-probe" ? 1024 : 0;
  });

const withDoor = (state: "open" | "closed" | "locked", revealed = false) => ({
  ...runLevelBoard,
  level: {
    ...runLevelBoard.level,
    walls: runLevelBoard.level.walls.map((wall) =>
      wall.id === runLevelDoorId
        ? { ...wall, doorState: state }
        : wall.id === runLevelSecretId
          ? { ...wall, revealed }
          : wall,
    ),
  },
});

const board = () => within(screen.getByRole("region", { name: "Battle map" }));
const doorWrites = () =>
  server.calls.filter((call) => call.method === "PATCH" && call.pathname.includes("/board/doors/"));

beforeEach(() => {
  server.reset();
  onTheCanvas();
  server.routes.set(`GET ${serverRunBase()}/board`, { status: 200, body: runLevelBoard });
});
afterEach(() => {
  server.drop();
  vi.restoreAllMocks();
  cleanup();
  drawn.levels = [];
  drawn.views = [];
  drawn.options = [];
  drawn.disposed = 0;
});

describe("a fight on a level, on the DM's canvas", () => {
  it("draws the fight's copy of the level under the board, lit, in play mode", async () => {
    await renderRunner();
    await screen.findByRole("region", { name: "Battle map" });
    await waitFor(() => expect(drawn.levels.at(-1)?.columns).toBe(8));
    expect(document.querySelector("[data-slot=level-backdrop]")).not.toBeNull();
    // The DM's view, lit by the fight's own ambient and lights, never the party's preview.
    expect(drawn.options.at(-1)).toMatchObject({ lit: true, viewAs: false });
    // The board's own picture surface is clear over it, and draws no second grid.
    expect(document.querySelectorAll("[data-slot=battle-map-grid]")).toHaveLength(0);
    // Its view follows the board canvas: a square is the plane's 64 pixels at the canvas's zoom.
    expect(drawn.views.length).toBeGreaterThan(0);
  });

  it("opens a door on a click, and draws the server's answer", async () => {
    server.routes.set(`PATCH ${serverRunBase()}/board/doors/${runLevelDoorId}`, {
      status: 200,
      body: withDoor("open"),
    });
    await renderRunner();
    await screen.findByRole("region", { name: "Battle map" });
    await userEvent.click(await board().findByRole("button", { name: "Open the door" }));
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/board/doors/${runLevelDoorId}`)).toMatchObject({
        doorState: "open",
      }),
    );
    expect(await board().findByRole("button", { name: "Close the door" })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        (
          (drawn.levels.at(-1)?.walls ?? []) as ReadonlyArray<{ id: string; doorState: string }>
        ).find((wall) => wall.id === runLevelDoorId)?.doorState,
      ).toBe("open"),
    );
  });

  it("locks a door and reveals a secret one from the door's menu", async () => {
    server.routes.set(`PATCH ${serverRunBase()}/board/doors/${runLevelDoorId}`, {
      status: 200,
      body: withDoor("locked"),
    });
    server.routes.set(`PATCH ${serverRunBase()}/board/doors/${runLevelSecretId}`, {
      status: 200,
      body: withDoor("locked", true),
    });
    await renderRunner();
    await screen.findByRole("region", { name: "Battle map" });
    await userEvent.click(await board().findByRole("button", { name: "More for the door" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Lock the door" }));
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/board/doors/${runLevelDoorId}`)).toMatchObject({
        doorState: "locked",
      }),
    );
    expect(await board().findByRole("button", { name: "Unlock the door" })).toBeInTheDocument();

    await userEvent.click(board().getByRole("button", { name: "More for the secret door" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reveal it to the table" }));
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/board/doors/${runLevelSecretId}`)).toMatchObject({
        revealed: true,
      }),
    );
    expect(doorWrites()).toHaveLength(2);
  });

  it("snuffs a light", async () => {
    server.routes.set(`PATCH ${serverRunBase()}/board/lights/${runLevelTorchId}`, {
      status: 200,
      body: {
        ...runLevelBoard,
        level: {
          ...runLevelBoard.level,
          lights: runLevelBoard.level.lights.map((light) => ({ ...light, lit: false })),
        },
      },
    });
    await renderRunner();
    await screen.findByRole("region", { name: "Battle map" });
    const torch = await board().findByRole("button", { name: "Snuff the light" });
    expect(torch).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(torch);
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/board/lights/${runLevelTorchId}`)).toMatchObject({
        lit: false,
      }),
    );
    expect(await board().findByRole("button", { name: "Light the light" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("re-reads the board when another tab opens a door", async () => {
    await renderRunner();
    await screen.findByRole("region", { name: "Battle map" });
    await board().findByRole("button", { name: "Open the door" });
    server.routes.set(`GET ${serverRunBase()}/board`, { status: 200, body: withDoor("open") });
    server.emit(sessionEvent(12, "board-door-updated"));
    expect(await board().findByRole("button", { name: "Close the door" })).toBeInTheDocument();
    expect(doorWrites()).toEqual([]);
  });
});
