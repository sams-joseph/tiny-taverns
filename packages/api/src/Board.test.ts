import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  type BoardSquare,
  BoardFogUpdate,
  areaSquares,
  boardPlane,
  boardRect,
  cellRect,
  feetBetween,
  gridLines,
  reachableSquares,
  rulerReading,
  squareAt,
  squaresBetween,
  startingSquares,
} from "./Board.js";

/** The plain board: 24 × 16 squares of 64 px. */
const plain = { columns: 24, rows: 16 };
const small = { columns: 3, rows: 2 };

describe("the board's plane", () => {
  it("puts a square at index · cell", () => {
    expect(cellRect({ column: 0, row: 0 })).toEqual({ x: 0, y: 0, width: 64, height: 64 });
    expect(cellRect({ column: 2, row: 1 })).toEqual({ x: 128, y: 64, width: 64, height: 64 });
  });

  it("is exactly the board", () => {
    expect(boardRect(plain)).toEqual({ x: 0, y: 0, width: 1536, height: 1024 });
    expect(boardPlane(small)).toEqual({ width: 192, height: 128 });
  });

  it("runs one line more than there are squares, each way", () => {
    const lines = gridLines(plain);
    expect(lines.xs).toHaveLength(25);
    expect(lines.ys).toHaveLength(17);
    expect(lines.xs.at(-1)).toBe(1536);
    expect(gridLines(small)).toEqual({ xs: [0, 64, 128, 192], ys: [0, 64, 128] });
  });

  it("finds the square under a point, and none off the board", () => {
    expect(squareAt(plain, { x: 65, y: 1023 })).toEqual({ column: 1, row: 15 });
    expect(squareAt(small, { x: -1, y: 30 })).toBeUndefined();
    expect(squareAt(small, { x: 192, y: 30 })).toBeUndefined();
    expect(squareAt(small, { x: 191, y: 127 })).toEqual({ column: 2, row: 1 });
  });
});

describe("the fog on the wire", () => {
  it("takes at most one whole-board fog change, beside squares on the largest board", () => {
    const fog = Schema.decodeUnknownExit(BoardFogUpdate);
    const square = { column: 3, row: 4 };
    expect(fog({ hide: [square], reveal: [square], requestId: "stroke" })._tag).toBe("Success");
    expect(fog({ reset: true, hide: [square] })._tag).toBe("Success");
    expect(fog({ revealAll: true, coverAll: true })._tag).toBe("Failure");
    expect(fog({ coverAll: true, reset: true })._tag).toBe("Failure");
    expect(fog({ revealAll: false })._tag).toBe("Failure");
    expect(fog({ hide: [{ column: 200, row: 0 }] })._tag).toBe("Failure");
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

describe("where tokens start", () => {
  it("lines the party up the left edge and its foes up the right, from the middle row out", () => {
    const party = startingSquares(plain, "party", 3, []);
    expect(party).toEqual([
      { column: 0, row: 7 },
      { column: 0, row: 8 },
      { column: 0, row: 6 },
    ]);
    expect(startingSquares(plain, "foes", 2, party)).toEqual([
      { column: 23, row: 7 },
      { column: 23, row: 8 },
    ]);
  });

  it("passes over a square already taken, and moves a column in once one is full", () => {
    const tiny = { columns: 3, rows: 2 };
    expect(startingSquares(tiny, "party", 3, [{ column: 0, row: 0 }])).toEqual([
      { column: 0, row: 1 },
      { column: 1, row: 0 },
      { column: 1, row: 1 },
    ]);
  });

  it("answers fewer squares than asked when the board has no room left", () => {
    const tiny = { columns: 2, rows: 1 };
    expect(startingSquares(tiny, "foes", 3, [])).toEqual([
      { column: 1, row: 0 },
      { column: 0, row: 0 },
    ]);
  });
});
