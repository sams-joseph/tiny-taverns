import type { BoardSquare } from "@taverns/api";
import { describe, expect, it } from "vitest";
import {
  AREA_SHAPES,
  areaAt,
  areaName,
  caughtBy,
  caughtLine,
  sameArea,
  squaresOf,
  startingFeet,
  stepFeet,
} from "./area";

const at = (column: number, row: number): BoardSquare => ({ column, row });

// The drawing's fight on its 24 × 16 board of 5 ft squares, Brannoc moved to
// (8, 9) as on its screens 19 and 20 (`Encounter Runner.dc.html`).
const board = { columns: 24, rows: 16, feetPerCell: 5 };
interface Row {
  readonly displayName: string;
  readonly kind: "pc" | "npc";
  readonly position: BoardSquare | null;
  readonly hp: number;
}
const row = (displayName: string, square: BoardSquare, kind: Row["kind"] = "npc", hp = 7): Row => ({
  displayName,
  kind,
  position: square,
  hp,
});
const fight = [
  row("Brannoc", at(8, 9), "pc", 44),
  row("Goblin Boss", at(9, 7)),
  row("Wren", at(4, 9), "pc", 31),
  row("Goblin 1", at(9, 10)),
  row("Goblin 2", at(10, 5)),
  row("Sable", at(3, 6), "pc", 38),
  row("Goblin Archer", at(14, 3)),
  row("Tobin", at(5, 11), "pc", 0),
  row("Marsh Hag", at(19, 8)),
  row("Bugbear", at(13, 11)),
];
const names = (rows: ReadonlyArray<{ readonly displayName: string }>) =>
  rows.map((caught) => caught.displayName);
const caughtIn = (area: Parameters<typeof squaresOf>[1], rows: ReadonlyArray<Row> = fight) =>
  names(caughtBy(squaresOf(board, area), rows, (caught) => caught.hp));

describe("the Area tool's shapes and sizes", () => {
  it("starts each shape at the drawing's size", () => {
    expect(AREA_SHAPES.map((entry) => [entry.label, entry.feet])).toEqual([
      ["Sphere", 20],
      ["Cone", 15],
      ["Line", 30],
      ["Cube", 15],
    ]);
    expect(startingFeet("line")).toBe(30);
  });

  it("steps five feet a press, between 5 and 120", () => {
    expect(stepFeet(20, 1)).toBe(25);
    expect(stepFeet(20, -1)).toBe(15);
    expect(stepFeet(5, -1)).toBe(5);
    expect(stepFeet(120, 1)).toBe(120);
  });

  it("names a template as the table says it", () => {
    expect(areaName({ shape: "sphere", feet: 20 })).toBe("20 ft sphere");
  });
});

describe("the template the pointer would pin", () => {
  it("centres a sphere or a cube on the square", () => {
    for (const shape of ["sphere", "cube"] as const) {
      expect(areaAt({ shape, feet: 20, at: at(10, 6), from: at(8, 9) })).toEqual({
        shape,
        feet: 20,
        origin: at(10, 6),
      });
    }
  });

  it("starts a cone or a line at the creature and points it at the square", () => {
    for (const shape of ["cone", "line"] as const) {
      expect(areaAt({ shape, feet: 15, at: at(11, 7), from: at(8, 9) })).toEqual({
        shape,
        feet: 15,
        origin: at(8, 9),
        toward: at(11, 7),
      });
    }
  });

  it("has no cone or line with nobody on the board to start from, or no way to point", () => {
    expect(areaAt({ shape: "cone", feet: 15, at: at(11, 7), from: null })).toBeUndefined();
    expect(areaAt({ shape: "line", feet: 30, at: at(8, 9), from: at(8, 9) })).toBeUndefined();
  });

  it("is the same pin when nothing about it moved", () => {
    const sphere = { shape: "sphere", feet: 20, origin: at(10, 6) } as const;
    expect(sameArea(sphere, { ...sphere })).toBe(true);
    expect(sameArea(sphere, { ...sphere, feet: 25 })).toBe(false);
    expect(sameArea(sphere, null)).toBe(false);
    expect(sameArea(null, null)).toBe(true);
    const cone = { shape: "cone", feet: 15, origin: at(8, 9), toward: at(11, 7) } as const;
    expect(sameArea(cone, { ...cone, toward: at(11, 8) })).toBe(false);
  });
});

describe("who a pinned template catches", () => {
  it("is everyone standing in a 20 ft sphere at (10, 6), in the fight's order", () => {
    const sphere = { shape: "sphere", feet: 20, origin: at(10, 6) } as const;
    expect(caughtIn(sphere)).toEqual(["Brannoc", "Goblin Boss", "Goblin 2"]);
    expect(caughtLine(caughtBy(squaresOf(board, sphere), fight, (r) => r.hp))).toBe(
      "3 caught: Brannoc, Goblin Boss, Goblin 2",
    );
  });

  it("is only the Goblin Boss in a 10 ft cone from Brannoc toward (11, 7)", () => {
    expect(caughtIn({ shape: "cone", feet: 10, origin: at(8, 9), toward: at(11, 7) })).toEqual([
      "Goblin Boss",
    ]);
  });

  it("leaves out a monster already at zero, and keeps a party member at zero", () => {
    const downed = fight.map((r) => (r.displayName === "Goblin 2" ? { ...r, hp: 0 } : r));
    const sphere = { shape: "sphere", feet: 20, origin: at(10, 6) } as const;
    expect(caughtIn(sphere, downed)).toEqual(["Brannoc", "Goblin Boss"]);
    // Tobin is down, and a fireball still reaches him.
    expect(caughtIn({ shape: "cube", feet: 5, origin: at(5, 11) })).toEqual(["Tobin"]);
  });

  it("leaves out anyone not on the board, and says so when nobody is caught", () => {
    const off = [{ ...fight[1]!, position: null }];
    const sphere = { shape: "sphere", feet: 20, origin: at(10, 6) } as const;
    expect(caughtIn(sphere, off)).toEqual([]);
    expect(caughtLine([])).toBe("Nobody caught in the area");
  });
});
