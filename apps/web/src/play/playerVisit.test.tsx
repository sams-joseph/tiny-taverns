import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  brannocId,
  brannocSeatRef,
  campaign,
  campaignId,
  installCharacterServer,
  playing,
  sessionId,
  sharedBoard,
  tableOrder,
} from "../characters/characters.fixtures";
import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";

/**
 * A level visit on a seated player's table (`PlayerLevelVisit`): with no
 * fight on, the party's level on the canvas, the tokens the server sent over
 * it, and the player walking their own token and nobody else's
 * (`table.moveOnVisit`), the range drawn as far as the walk reaches.
 *
 * The level renderer is three.js over WebGL, which jsdom has none of: a fake
 * records what it was handed, as `playerLevel.test.tsx` fakes it.
 */
const drawn = vi.hoisted(() => ({
  levels: [] as Array<{
    readonly level: { readonly columns: number; readonly floor: ReadonlyArray<number> };
    readonly reader: { readonly party: boolean };
  }>,
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
    setOptions() {}
    setVision() {}
    setOverlay() {}
    setHover() {}
    setView() {}
    resize() {}
    start() {}
    dispose() {}
  },
}));

const server = installCharacterServer();

/** Put the table on its canvas, or not: the probe the stylesheet shows from `@3xl`. */
const stageWidth = (width: number) =>
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.slot === "run-stage-probe" ? width : 0;
  });

const visitId = "1e7e5000-0000-4000-8000-000000000001";
const otherSeatId = "1e7e5000-0000-4000-8000-000000000002";
const COLUMNS = 8;
const at = (column: number, row: number) => row * COLUMNS + column;

/** Row 1 of an 8 × 4 level, seen from column 0 to 4, with no walls. */
const seen = [0, 1, 2, 3, 4].map((column) => at(column, 1));
const visit = {
  id: visitId,
  columns: COLUMNS,
  rows: 4,
  feetPerCell: 5,
  level: {
    ambient: "bright",
    sees: seen,
    seen,
    floor: seen.map(() => 1),
    walls: [],
    props: [],
    lights: [],
    regions: [],
  },
  fog: [],
  tokens: [
    {
      seatId: brannocSeatRef.campaignCharacterId,
      name: "Brannoc Duskharrow",
      own: true,
      column: 1,
      row: 1,
    },
    { seatId: otherSeatId, name: "Ilse Thornbury", own: false, column: 3, row: 1 },
  ],
  creatures: [],
};

const moveRoute = (seatId: string) =>
  `PUT /campaigns/${campaignId}/table/visits/${visitId}/tokens/${seatId}`;

const renderTable = async () => {
  await renderAt(`/campaigns/${campaignId}/table`, (route) => (
    <HostedSessionScope session={TEST_SESSION}>{route}</HostedSessionScope>
  ));
};

beforeEach(() => {
  server.reset();
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
  server.routes.set(moveRoute(brannocSeatRef.campaignCharacterId), { status: 204, body: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  drawn.levels = [];
});

const moves = () =>
  server.calls.filter(
    (call) => call.method === "PUT" && call.pathname.includes(`/table/visits/${visitId}/`),
  );

describe("a level visit on a seated player's canvas", () => {
  it("draws the party's level and the tokens the table was sent, with no fight", async () => {
    stageWidth(1024);
    server.routes.set(...playing(campaignId, null, visit));
    await renderTable();
    const level = within(await screen.findByRole("region", { name: "Level" }));
    await waitFor(() => expect(drawn.levels.at(-1)?.level.columns).toBe(COLUMNS));
    expect(drawn.levels.at(-1)?.reader.party).toBe(true);
    expect(level.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ })).toBeInTheDocument();
    expect(level.getByRole("button", { name: /^Ilse Thornbury/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Battle map" })).toBeNull();
    expect(screen.getAllByText(/exploring/).length).toBeGreaterThan(0);
  });

  it("walks your own token, and nobody else's", async () => {
    stageWidth(1024);
    server.routes.set(...playing(campaignId, null, visit));
    await renderTable();
    const level = within(await screen.findByRole("region", { name: "Level" }));
    const you = level.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ });
    you.focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(moves()).toHaveLength(1));
    expect(moves()[0]!.pathname).toContain(`/tokens/${brannocSeatRef.campaignCharacterId}`);
    expect(JSON.parse(moves()[0]!.body)).toMatchObject({ position: { column: 2, row: 1 } });

    level.getByRole("button", { name: /^Ilse Thornbury/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(moves()).toHaveLength(1);
  });

  it("draws a creature the party sees as a foe's token, with nothing to press", async () => {
    stageWidth(1024);
    server.routes.set(
      ...playing(campaignId, null, {
        ...visit,
        creatures: [{ name: "Goblin", column: 4, row: 1 }],
      }),
    );
    await renderTable();
    const level = within(await screen.findByRole("region", { name: "Level" }));
    const goblin = level.getByRole("button", { name: /^Goblin, column 5, row 2/ });
    goblin.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(moves()).toHaveLength(0);
  });

  it("tints every square the walk reaches over what the party has seen, with no speed", async () => {
    stageWidth(1024);
    server.routes.set(...playing(campaignId, null, visit));
    await renderTable();
    const level = within(await screen.findByRole("region", { name: "Level" }));
    await userEvent.click(level.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ }));
    const range = () =>
      new Set(
        [...document.querySelectorAll<SVGElement>("[data-slot=range-square]")].map(
          (square) => square.dataset.square!,
        ),
      );
    await waitFor(() => expect(range().size).toBeGreaterThan(0));
    // The seen row and the dark ring round it, whatever the distance, less
    // the squares the party holds.
    expect(range().has("4,1")).toBe(true);
    expect(range().has("5,1")).toBe(true);
    expect(range().has("6,1")).toBe(false);
    expect(range().has("3,1")).toBe(false);
  });

  it("says why a walk the server refused did not happen", async () => {
    stageWidth(1024);
    server.routes.set(...playing(campaignId, null, visit));
    server.routes.set(moveRoute(brannocSeatRef.campaignCharacterId), {
      status: 409,
      body: { _tag: "Conflict", message: "No way there" },
    });
    await renderTable();
    const level = within(await screen.findByRole("region", { name: "Level" }));
    level.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(await screen.findByText("No way there")).toBeInTheDocument();
  });

  it("does not send a step its own walk calls No way there", async () => {
    stageWidth(1024);
    // A wall between columns 1 and 2 down the seen row: nothing gets round it
    // but through the dark, where a walk only ever ends.
    const walled = {
      ...visit,
      level: {
        ...visit.level,
        walls: [
          {
            id: "1e7e5000-0000-4000-8000-000000000010",
            x1: 2,
            y1: 0,
            x2: 2,
            y2: 4,
            kind: "wall",
            doorState: null,
            low: false,
          },
        ],
      },
    };
    server.routes.set(...playing(campaignId, null, walled));
    await renderTable();
    const level = within(await screen.findByRole("region", { name: "Level" }));
    const you = level.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ });
    you.focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(() => expect(moves()).toHaveLength(1));
    // Only the step the walk reaches went to the server.
    expect(JSON.parse(moves()[0]!.body)).toMatchObject({ position: { column: 0, row: 1 } });
  });

  it("clears a refused walk's words once the DM moves your token, and once a fight starts", async () => {
    stageWidth(1024);
    let table: "refused" | "moved" | "fight" = "refused";
    const [route, answer] = playing(campaignId, null, visit);
    const moved = playing(campaignId, null, {
      ...visit,
      tokens: visit.tokens.map((token) => (token.own ? { ...token, column: 0 } : token)),
    })[1];
    const fight = playing(campaignId, { order: tableOrder, board: sharedBoard }, null)[1];
    server.routes.set(route, {
      status: 200,
      body: () => (table === "refused" ? answer : table === "moved" ? moved : fight).body as never,
    });
    server.routes.set(moveRoute(brannocSeatRef.campaignCharacterId), {
      status: 409,
      body: { _tag: "Conflict", message: "No way there" },
    });
    await renderTable();
    const level = within(await screen.findByRole("region", { name: "Level" }));
    level.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(await screen.findByText("No way there")).toBeInTheDocument();

    // The doorbell rings: the DM moved your token.
    const ring = () => {
      server.routes.set(`GET /campaigns/${campaignId}/table/sessions/${sessionId}/events`, {
        status: 200,
        sse: 'id: 9\nevent: tick\ndata: {"tick":"session"}\n\n',
      });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    table = "moved";
    ring();
    await waitFor(() =>
      expect(
        level.getByRole("button", { name: /^Brannoc Duskharrow \(you\), column 1, row 2/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("No way there")).toBeNull();

    // Refused again, then a fight starts: the battle map has no word of it.
    level.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(moves()).toHaveLength(2));
    expect(await screen.findByText("No way there")).toBeInTheDocument();
    table = "fight";
    ring();
    expect(await screen.findByRole("region", { name: "Battle map" })).toBeInTheDocument();
    expect(screen.queryByText("No way there")).toBeNull();
  });

  it("is a card of where everyone stands below the canvas's width", async () => {
    stageWidth(0);
    server.routes.set(...playing(campaignId, null, visit));
    await renderTable();
    const card = within(await screen.findByRole("region", { name: "Level" }));
    expect(card.getByText("Exploring")).toBeInTheDocument();
    expect(screen.queryByText("Nothing on the table")).toBeNull();
  });

  it("gives way to a fight on the table", async () => {
    stageWidth(1024);
    server.routes.set(...playing(campaignId, { order: tableOrder, board: sharedBoard }, visit));
    await renderTable();
    expect(await screen.findByRole("region", { name: "Battle map" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Level" })).toBeNull();
  });
});
