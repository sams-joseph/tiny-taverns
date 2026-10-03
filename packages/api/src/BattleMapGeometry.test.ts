import { describe, expect, it } from "vitest";
import {
  type BoardSquare,
  areaSquares,
  battleMapPlane,
  boardRect,
  cellPxForColumns,
  cellRect,
  feetBetween,
  gridLines,
  offsetWithinSquare,
  pictureScale,
  reachableSquares,
  rowsThatFit,
  rulerReading,
  squareAt,
  squaresBetween,
} from "./BattleMap.js";

/** Every new map's board: 24 × 16 squares of 64 px over the 1536 × 1024 picture. */
const drawn = { columns: 24, rows: 16, alignment: { cellPx: 64, offsetXPx: 0, offsetYPx: 0 } };
/** A board nudged off the picture's corner. */
const nudged = { columns: 3, rows: 2, alignment: { cellPx: 50, offsetXPx: 10, offsetYPx: 20 } };

describe("the board's geometry", () => {
  it("puts a square at offset + index · cell", () => {
    expect(cellRect(drawn, { column: 0, row: 0 })).toEqual({ x: 0, y: 0, width: 64, height: 64 });
    expect(cellRect(nudged, { column: 2, row: 1 })).toEqual({
      x: 110,
      y: 70,
      width: 50,
      height: 50,
    });
  });

  it("covers the drawn picture exactly with a new map's board", () => {
    expect(boardRect(drawn)).toEqual({ x: 0, y: 0, width: 1536, height: 1024 });
    expect(boardRect(nudged)).toEqual({ x: 10, y: 20, width: 150, height: 100 });
  });

  it("draws on the picture when there is one, and on the board alone when there is not", () => {
    expect(battleMapPlane(nudged, { width: 1536, height: 1024 })).toEqual({
      width: 1536,
      height: 1024,
    });
    expect(battleMapPlane(nudged, null)).toEqual({ width: 160, height: 120 });
    expect(battleMapPlane(drawn, null)).toEqual({ width: 1536, height: 1024 });
  });

  it("runs one line more than there are squares, each way", () => {
    const lines = gridLines(drawn);
    expect(lines.xs).toHaveLength(25);
    expect(lines.ys).toHaveLength(17);
    expect(lines.xs.at(-1)).toBe(1536);
    expect(gridLines(nudged)).toEqual({ xs: [10, 60, 110, 160], ys: [20, 70, 120] });
  });

  it("sizes a square from how many run across the picture", () => {
    expect(cellPxForColumns(1536, 24)).toBe(64);
    expect(cellPxForColumns(1536, 20)).toBe(76.8);
    expect(cellPxForColumns(1536, 20, 16)).toBe(76);
  });

  it("counts the whole rows that fit down the picture", () => {
    expect(rowsThatFit(1024, { cellPx: 76.8, offsetXPx: 0, offsetYPx: 0 })).toBe(13);
    expect(rowsThatFit(1024, drawn.alignment)).toBe(16);
    expect(rowsThatFit(10, { cellPx: 64, offsetXPx: 0, offsetYPx: 20 })).toBe(0);
  });

  it("brings a nudge past a square's edge back within one square", () => {
    expect(offsetWithinSquare(70, 64)).toBe(6);
    expect(offsetWithinSquare(-1, 64)).toBe(63);
    expect(offsetWithinSquare(64, 64)).toBe(0);
    expect(offsetWithinSquare(76.8 * 3, 76.8)).toBe(0);
  });

  it("scales the original's pixels to the drawn width by one factor", () => {
    expect(pictureScale(768, { width: 1536, height: 1024 })).toBe(0.5);
  });

  it("finds the square under a point, and none off the board", () => {
    expect(squareAt(drawn, { x: 65, y: 1023 })).toEqual({ column: 1, row: 15 });
    expect(squareAt(nudged, { x: 5, y: 30 })).toBeUndefined();
    expect(squareAt(nudged, { x: 160, y: 30 })).toBeUndefined();
    expect(squareAt(nudged, { x: 159, y: 119 })).toEqual({ column: 2, row: 1 });
  });
});

const at = (column: number, row: number): BoardSquare => ({ column, row });
const five = { feetPerCell: 5, diagonals: "five" } as const;
const alternating = { feetPerCell: 5, diagonals: "alternating" } as const;
const has = (squares: ReadonlyArray<BoardSquare>, square: BoardSquare) =>
  squares.some((s) => s.column === square.column && s.row === square.row);

describe("distance on the board", () => {
  it("measures a 7 × 3 ruler at 35 ft under the five-foot rule", () => {
    expect(feetBetween(at(2, 4), at(9, 7), five)).toBe(35);
    expect(feetBetween(at(9, 7), at(2, 4), five)).toBe(35);
  });

  it("walks a 4 × 4 diagonal in 20 ft, or 30 ft when diagonals alternate", () => {
    expect(feetBetween(at(6, 7), at(10, 11), five)).toBe(20);
    expect(feetBetween(at(6, 7), at(10, 11), alternating)).toBe(30);
  });

  it("counts every second diagonal twice, and a straight line the same either way", () => {
    expect([1, 2, 3, 4, 5].map((n) => squaresBetween(at(0, 0), at(n, n), "alternating"))).toEqual([
      1, 3, 4, 6, 7,
    ]);
    expect(squaresBetween(at(0, 0), at(7, 3), "alternating")).toBe(8);
    expect(squaresBetween(at(3, 0), at(3, 6), "alternating")).toBe(6);
    expect(squaresBetween(at(3, 0), at(3, 6), "five")).toBe(6);
  });

  it("is in the board's own feet per square", () => {
    expect(feetBetween(at(0, 0), at(3, 1), { feetPerCell: 10, diagonals: "five" })).toBe(30);
  });
});

describe("the squares a move reaches", () => {
  const board = { columns: 24, rows: 16 };

  it("is every square within the feet, cut at the board's edge, other than its own", () => {
    const squares = reachableSquares(board, { from: at(2, 8), feet: 30, occupied: [], ...five });
    // Six squares every way: columns 0-8 by rows 2-14, less the one it stands on.
    expect(squares).toHaveLength(9 * 13 - 1);
    expect(has(squares, at(2, 8))).toBe(false);
    expect(has(squares, at(8, 14))).toBe(true);
    expect(has(squares, at(9, 8))).toBe(false);
  });

  it("leaves out a square someone holds", () => {
    const squares = reachableSquares(board, {
      from: at(6, 7),
      feet: 30,
      occupied: [at(9, 7), at(20, 7)],
      ...five,
    });
    expect(has(squares, at(9, 7))).toBe(false);
    expect(has(squares, at(8, 7))).toBe(true);
  });

  it("does not reach a far diagonal corner when diagonals alternate", () => {
    const reach = (rule: "five" | "alternating") =>
      reachableSquares(board, {
        from: at(6, 7),
        feet: 30,
        occupied: [],
        feetPerCell: 5,
        diagonals: rule,
      });
    expect(has(reach("five"), at(12, 13))).toBe(true);
    expect(has(reach("alternating"), at(12, 13))).toBe(false);
    expect(has(reach("alternating"), at(10, 11))).toBe(true);
  });

  it("is nothing when the feet do not make a square", () => {
    expect(reachableSquares(board, { from: at(2, 8), feet: 4, occupied: [], ...five })).toEqual([]);
  });
});

describe("an area of effect", () => {
  const board = { columns: 24, rows: 16 };
  /** The drawing's fight, Brannoc moved to (8, 9), as on its screens 19 and 20. */
  const tokens = {
    Brannoc: at(8, 9),
    "Goblin Boss": at(9, 7),
    Wren: at(4, 9),
    "Goblin 1": at(9, 10),
    "Goblin 2": at(10, 5),
    Sable: at(3, 6),
    "Goblin Archer": at(14, 3),
    Tobin: at(5, 11),
    "Marsh Hag": at(19, 8),
    Bugbear: at(13, 11),
  };
  const caught = (squares: ReadonlyArray<BoardSquare>) =>
    Object.entries(tokens)
      .filter(([, square]) => has(squares, square))
      .map(([name]) => name);

  it("as a 20 ft sphere at (10, 6) catches Brannoc, the Goblin Boss and Goblin 2", () => {
    const squares = areaSquares(board, {
      shape: "sphere",
      feet: 20,
      feetPerCell: 5,
      origin: at(10, 6),
      toward: at(10, 6),
    });
    expect(caught(squares)).toEqual(["Brannoc", "Goblin Boss", "Goblin 2"]);
    expect(has(squares, at(10, 6))).toBe(true);
  });

  it("as a 10 ft cone from Brannoc toward (11, 7) catches only the Goblin Boss", () => {
    const squares = areaSquares(board, {
      shape: "cone",
      feet: 10,
      feetPerCell: 5,
      origin: at(8, 9),
      toward: at(11, 7),
    });
    expect(caught(squares)).toEqual(["Goblin Boss"]);
    expect(has(squares, at(8, 9))).toBe(false);
  });

  it("as a cone widens as it goes, and a line stays one square wide", () => {
    const shape = (kind: "cone" | "line") =>
      areaSquares(board, {
        shape: kind,
        feet: 15,
        feetPerCell: 5,
        origin: at(5, 5),
        toward: at(9, 5),
      });
    expect(shape("cone")).toEqual([
      at(6, 5),
      at(7, 4),
      at(7, 5),
      at(7, 6),
      at(8, 4),
      at(8, 5),
      at(8, 6),
    ]);
    expect(shape("line")).toEqual([at(6, 5), at(7, 5), at(8, 5)]);
  });

  it("as a cone or a line with nowhere to point covers nothing", () => {
    for (const shape of ["cone", "line"] as const) {
      expect(
        areaSquares(board, { shape, feet: 30, feetPerCell: 5, origin: at(5, 5), toward: at(5, 5) }),
      ).toEqual([]);
    }
  });

  it("as a cube is its side in squares round its middle, cut at the board's edge", () => {
    const cube = (feet: number, origin: BoardSquare) =>
      areaSquares(board, { shape: "cube", feet, feetPerCell: 5, origin, toward: origin });
    expect(cube(15, at(5, 5))).toHaveLength(9);
    expect(has(cube(15, at(5, 5)), at(4, 4))).toBe(true);
    expect(has(cube(15, at(5, 5)), at(6, 6))).toBe(true);
    // An even side runs one square further right and down of the middle than left and up.
    expect(has(cube(10, at(5, 5)), at(6, 6))).toBe(true);
    expect(has(cube(10, at(5, 5)), at(4, 4))).toBe(false);
    expect(cube(15, at(0, 0))).toEqual([at(0, 0), at(0, 1), at(1, 0), at(1, 1)]);
  });
});

describe("the ruler", () => {
  it("reads a plain measure in feet", () => {
    expect(
      rulerReading({ from: at(2, 4), to: at(9, 7), remaining: null, occupied: false, ...five }),
    ).toEqual({ feet: 35, verdict: "distance", text: "35 ft" });
  });

  it("reads a move against the feet left, and past them", () => {
    const move = (to: BoardSquare) =>
      rulerReading({ from: at(6, 7), to, remaining: 30, occupied: false, ...five }).text;
    expect(move(at(10, 7))).toBe("20 ft · 10 left");
    expect(move(at(12, 7))).toBe("30 ft · 0 left");
    expect(move(at(13, 7))).toBe("35 ft · 5 over");
    expect(
      rulerReading({
        from: at(6, 7),
        to: at(10, 11),
        remaining: 30,
        occupied: false,
        ...alternating,
      }),
    ).toEqual({ feet: 30, verdict: "left", text: "30 ft · 0 left" });
  });

  it("says a held square is occupied, whatever the distance", () => {
    expect(
      rulerReading({ from: at(6, 7), to: at(9, 7), remaining: 30, occupied: true, ...five }),
    ).toEqual({ feet: 15, verdict: "occupied", text: "Occupied" });
  });
});
