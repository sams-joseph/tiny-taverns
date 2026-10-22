import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  brannocId,
  campaign,
  campaignId,
  installCharacterServer,
  sessionId,
  liveRunId,
  playing,
  sharedBoard,
  tableOrder,
  yourCombatantId,
} from "../characters/characters.fixtures";
import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";

/**
 * A fight on a level, on a seated player's canvas: the party's level is drawn
 * by the level renderer under the board in the party's view, from exactly
 * what the table was sent (`PlayerLiveLevel`), and the tokens stand over it.
 *
 * The renderer is three.js over WebGL, which jsdom has none of: it is a fake
 * that records what it was handed, behind the same dynamic import, as
 * `run/levelBoard.test.tsx` fakes it for the DM's board.
 */
const drawn = vi.hoisted(() => ({
  levels: [] as Array<{
    readonly level: {
      readonly columns: number;
      readonly floor: ReadonlyArray<number>;
      readonly props: ReadonlyArray<{ readonly dmOnly: boolean }>;
      readonly lights: ReadonlyArray<{ readonly lit: boolean }>;
    };
    readonly reader: { readonly party: boolean; readonly revealed: ReadonlySet<string> };
  }>,
  visions: [] as Array<{
    readonly part: {
      readonly viewers: ReadonlyArray<unknown>;
      readonly sees: ReadonlyArray<number>;
    };
    readonly seen: Uint8Array;
  } | null>,
  overlays: [] as Array<ReadonlyArray<{ readonly type: string }>>,
  options: [] as Array<{ readonly viewAs: boolean; readonly lit: boolean }>,
}));

vi.mock("../run/fx3d/support", () => ({ canDrawWebGL: () => true }));
vi.mock("../run/fx3d/Fx3D", () => ({ Fx3D: () => null }));
vi.mock("../level/renderer", () => ({
  LevelRenderer: class {
    renderer = { domElement: document.createElement("canvas") };
    setLevel(
      level: (typeof drawn.levels)[number]["level"],
      reader: (typeof drawn.levels)[number]["reader"],
    ) {
      drawn.levels.push({ level, reader });
    }
    setOptions(options: { readonly viewAs: boolean; readonly lit: boolean }) {
      drawn.options.push(options);
    }
    setVision(vision: (typeof drawn.visions)[number]) {
      drawn.visions.push(vision);
    }
    setOverlay(marks: ReadonlyArray<{ readonly type: string }>) {
      drawn.overlays.push(marks);
    }
    setHover() {}
    setView() {}
    resize() {}
    start() {}
    dispose() {}
  },
}));

const server = installCharacterServer();

/** Put the table on its canvas: the probe the stylesheet shows from `@3xl`. */
const onTheCanvas = () =>
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.slot === "run-stage-probe" ? 1024 : 0;
  });

const SECRET = "1e7e4000-0000-4000-8000-000000000003";
const at = (column: number, row: number) => row * sharedBoard.columns + column;

/** What the party has seen of the level: the squares round the player's token. */
const partyLevel = {
  ambient: "dim",
  sees: [at(5, 4), at(6, 4)],
  seen: [at(4, 4), at(5, 4), at(6, 4)],
  floor: [2, 1, 1],
  walls: [
    {
      id: "1e7e4000-0000-4000-8000-000000000001",
      x1: 7,
      y1: 4,
      x2: 7,
      y2: 5,
      kind: "wall",
      doorState: null,
      low: false,
    },
    {
      id: SECRET,
      x1: 4,
      y1: 4,
      x2: 4,
      y2: 5,
      kind: "secretDoor",
      doorState: "closed",
      low: false,
    },
  ],
  props: [
    {
      id: "1e7e4000-0000-4000-8000-000000000010",
      kind: "barrel",
      x: 6,
      y: 4,
      rotation: 0,
      blocksMovement: null,
      blocksSight: null,
      cover: null,
      difficult: null,
    },
  ],
  lights: [
    {
      id: "1e7e4000-0000-4000-8000-000000000020",
      x: 5.5,
      y: 4.5,
      bright: 20,
      dim: 20,
      tone: "fire",
      flicker: true,
    },
  ],
  regions: [{ id: "1e7e4000-0000-4000-8000-000000000030", kind: "difficult", squares: [at(6, 4)] }],
};

const levelBoard = {
  ...sharedBoard,
  image: null,
  level: partyLevel,
  tokens: sharedBoard.tokens.filter((token) => token.combatantId === yourCombatantId),
};

const renderTable = async () => {
  await renderAt(`/campaigns/${campaignId}/table`, (route) => (
    <HostedSessionScope session={TEST_SESSION}>{route}</HostedSessionScope>
  ));
};

beforeEach(() => {
  server.reset();
  onTheCanvas();
  server.routes.set(`GET /campaigns/${campaignId}`, { status: 200, body: campaign });
  server.routes.set(
    `GET /campaigns/${campaignId}/table/sessions/${sessionId}/characters/${brannocId}/rolls`,
    { status: 200, body: [] },
  );
  // A 404 stops the doorbell's stream, so the table is read once.
  server.routes.set(`GET /campaigns/${campaignId}/table/sessions/${sessionId}/events`, {
    status: 404,
    body: { _tag: "NotFound", resource: "session" },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  drawn.levels = [];
  drawn.visions = [];
  drawn.overlays = [];
  drawn.options = [];
});

describe("a fight on a level, on a seated player's canvas", () => {
  it("draws the party's level under the board, in the party's view, from what was sent", async () => {
    server.routes.set(
      ...playing(campaignId, {
        order: tableOrder.filter((row) => row.kind !== "npc"),
        board: levelBoard,
      }),
    );
    await renderTable();
    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    await waitFor(() => expect(drawn.levels.at(-1)?.level.columns).toBe(24));
    expect(document.querySelector("[data-slot=level-backdrop]")).not.toBeNull();

    const { level, reader } = drawn.levels.at(-1)!;
    // Each seen square's floor in its place; every other square is void.
    expect(level.floor[at(4, 4)]).toBe(2);
    expect(level.floor[at(5, 4)]).toBe(1);
    expect(level.floor[at(8, 4)]).toBe(0);
    expect(level.floor.filter((material) => material !== 0)).toHaveLength(3);
    // As the party knows it: the secret door it was sent is found, no DM-only prop.
    expect(reader.party).toBe(true);
    expect([...reader.revealed]).toEqual([SECRET]);
    expect(level.props.map((prop) => prop.dmOnly)).toEqual([false]);
    expect(level.lights.map((light) => light.lit)).toEqual([true]);

    // Its sight is the squares the table was told: in view now, and explored.
    const vision = drawn.visions.at(-1)!;
    expect(vision?.part.viewers).toEqual([]);
    expect(vision?.part.sees).toEqual(partyLevel.sees);
    expect([...vision!.seen].flatMap((flag, square) => (flag === 1 ? [square] : []))).toEqual(
      partyLevel.seen,
    );
    expect(drawn.options.at(-1)).toMatchObject({ lit: true, viewAs: true });
    // Only the region it was sent is marked: nothing of the DM's.
    expect(drawn.overlays.at(-1)?.map((mark) => mark.type)).toEqual(["squares"]);

    // The board box over it is clear, its grid the renderer's, and the tokens stand on it.
    expect(document.querySelectorAll("[data-slot=battle-map-grid]")).toHaveLength(0);
    expect(map.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ })).toBeInTheDocument();
  });

  it("says why a move the level refuses did not happen", async () => {
    server.routes.set(
      ...playing(campaignId, {
        order: tableOrder.filter((row) => row.kind !== "npc"),
        board: levelBoard,
      }),
    );
    server.routes.set(
      `POST /campaigns/${campaignId}/table/runs/${liveRunId}/combatants/${yourCombatantId}/move`,
      {
        status: 409,
        body: { _tag: "Conflict", message: "you cannot get there from where you stand" },
      },
    );
    await renderTable();
    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    const you = map.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ });
    you.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(
      await screen.findByText("you cannot get there from where you stand"),
    ).toBeInTheDocument();
  });
});
