import { describe, expect, it } from "vitest";
import {
  darkvisionOf,
  partyPathCost,
  partyReach,
  partyWalk,
  playerLevelLayout,
  playerSight,
  playerWalk,
} from "./LevelFight.js";
import type { LevelLayout } from "./LevelGeometry.js";

describe("darkvisionOf", () => {
  it("reads the feet from the SRD's Darkvision trait", () => {
    expect(
      darkvisionOf([
        { name: "Dwarven Resilience", text: "Advantage on saving throws against poison." },
        {
          name: "Darkvision",
          text: "You can see in dim light within 60 feet of you as if it were bright light.",
        },
      ]),
    ).toBe(60);
  });

  it("takes the most any darkvision trait says, in feet or ft", () => {
    expect(
      darkvisionOf([
        { name: "Darkvision", text: "within 60 feet" },
        { name: "Superior Darkvision", text: "Your darkvision has a radius of 120 ft." },
      ]),
    ).toBe(120);
  });

  it("is 0 with no darkvision trait, and for one that names no distance", () => {
    expect(darkvisionOf([])).toBe(0);
    expect(darkvisionOf([{ name: "Keen Senses", text: "within 60 feet" }])).toBe(0);
    expect(darkvisionOf([{ name: "Darkvision", text: "You see in the dark." }])).toBe(0);
    expect(darkvisionOf([{ name: "Darkvision" }])).toBe(0);
  });
});

describe("playerLevelLayout", () => {
  it("puts each seen square's floor in place and leaves every other square void", () => {
    const layout = playerLevelLayout(
      { columns: 3, rows: 2, feetPerCell: 5 },
      {
        ambient: "dim",
        sees: [1],
        seen: [1, 4],
        floor: [2, 6],
        walls: [],
        props: [],
        lights: [],
        regions: [],
      },
    );
    expect(layout.floor).toEqual([0, 2, 0, 0, 6, 0]);
  });

  it("knows every secret door it was sent as found", () => {
    const sight = playerSight({
      walls: [
        {
          id: "a" as never,
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 0,
          kind: "secretDoor",
          doorState: "open",
          low: false,
        },
        { id: "b" as never, x1: 0, y1: 1, x2: 1, y2: 1, kind: "wall", doorState: null, low: false },
      ],
    });
    expect([...(sight.revealed ?? [])]).toEqual(["a"]);
  });
});

describe("partyWalk", () => {
  // A corridor five squares long, one wide, all flagstone; a wall closes the
  // east end between columns 3 and 4.
  const corridor: LevelLayout = {
    columns: 5,
    rows: 1,
    feetPerCell: 5,
    ambient: "bright",
    floor: [1, 1, 1, 1, 1],
    walls: [{ id: "w", x1: 4, y1: 0, x2: 4, y2: 1, kind: "wall", doorState: null, low: false }],
    props: [],
    lights: [],
    regions: [],
  };
  const at = (column: number) => ({ column, row: 0 });

  it("walks the seen squares and one step into the dark beyond them, no further", () => {
    const walk = partyWalk(corridor, [0, 1]);
    expect([...walk.ends]).toEqual([2]);
    expect(partyPathCost(walk, at(0), at(1), {})).toBe(5);
    expect(partyPathCost(walk, at(0), at(2), {})).toBe(10);
    // Two squares into the dark is not a walk, however open the floor really is.
    expect(partyPathCost(walk, at(0), at(3), {})).toBeNull();
    expect(partyReach(walk, at(0), 30, {}).map((reached) => reached.square.column)).toEqual([1, 2]);
  });

  it("never walks on through a dark square to reach another", () => {
    // Seen at both ends, the middle dark: the far end is not reached through it.
    const walk = partyWalk(corridor, [0, 2]);
    expect(walk.ends.has(1)).toBe(true);
    expect(partyPathCost(walk, at(0), at(1), {})).toBe(5);
    expect(partyPathCost(walk, at(0), at(2), {})).toBeNull();
  });

  it("refuses a dark square the server knows is void or walled, as it would any other", () => {
    const voided = partyWalk({ ...corridor, floor: [1, 1, 0, 1, 1] }, [0, 1]);
    expect(partyPathCost(voided, at(1), at(2), {})).toBeNull();
    const walled = partyWalk(corridor, [0, 1, 2, 3]);
    expect(partyPathCost(walled, at(3), at(4), {})).toBeNull();
  });

  it("agrees with the player's board, which stands the dark on flagstone", () => {
    const board = { columns: 5, rows: 1, feetPerCell: 5 };
    const walk = playerWalk(board, {
      ambient: "bright",
      sees: [0, 1],
      seen: [0, 1],
      floor: [1, 1],
      walls: [],
      props: [],
      lights: [],
      regions: [],
    });
    expect(walk.layout.floor).toEqual([1, 1, 1, 0, 0]);
    expect(partyPathCost(walk, at(0), at(2), {})).toBe(10);
    expect(partyPathCost(walk, at(0), at(3), {})).toBeNull();
  });
});
