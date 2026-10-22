import { describe, expect, it } from "vitest";
import { darkvisionOf, playerLevelLayout, playerSight } from "./LevelFight.js";

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
