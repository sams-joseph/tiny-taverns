import { describe, expect, it } from "vitest";
import { fogAfter, fogOutline, fogPayload, squareKey, squaresBetween } from "./fog";

// The fixture fight's board: 24 × 16 squares of 64 plane pixels, no picture.
const board = { columns: 24, rows: 16, alignment: { cellPx: 64, offsetXPx: 0, offsetYPx: 0 } };
const keys = (squares: ReadonlyArray<{ column: number; row: number }>) =>
  [...squares.map(squareKey)].sort();

describe("the fog the runner draws", () => {
  it("is the board's own while nothing is on its way", () => {
    const fog = [{ column: 3, row: 2 }];
    expect(fogAfter(board, fog, [])).toBe(fog);
  });

  it("lays each write over the last, in the order they were sent", () => {
    const fog = [{ column: 0, row: 0 }];
    const after = fogAfter(board, fog, [
      {
        kind: "hide",
        squares: [
          { column: 1, row: 0 },
          { column: 2, row: 0 },
        ],
      },
      { kind: "reveal", squares: [{ column: 0, row: 0 }] },
      { kind: "hide", squares: [{ column: 1, row: 0 }] },
    ]);
    expect(keys(after)).toEqual(["1,0", "2,0"]);
  });

  it("clears the board on Reveal all and covers every square on Cover all", () => {
    const fog = [{ column: 5, row: 5 }];
    expect(fogAfter(board, fog, [{ kind: "revealAll" }])).toEqual([]);
    const covered = fogAfter(board, [], [{ kind: "coverAll" }]);
    expect(covered).toHaveLength(24 * 16);
    expect(
      fogAfter(
        board,
        [],
        [{ kind: "coverAll" }, { kind: "reveal", squares: [{ column: 23, row: 15 }] }],
      ),
    ).toHaveLength(24 * 16 - 1);
  });

  it("leaves Reset to the server, which alone holds the fight's starting fog", () => {
    const fog = [{ column: 5, row: 5 }];
    expect(fogAfter(board, fog, [{ kind: "reset" }])).toEqual(fog);
  });

  it("sends each write as the one field it is", () => {
    const squares = [{ column: 1, row: 2 }];
    expect(fogPayload({ kind: "hide", squares })).toEqual({ hide: squares });
    expect(fogPayload({ kind: "reveal", squares })).toEqual({ reveal: squares });
    expect(fogPayload({ kind: "revealAll" })).toEqual({ revealAll: true });
    expect(fogPayload({ kind: "coverAll" })).toEqual({ coverAll: true });
    expect(fogPayload({ kind: "reset" })).toEqual({ reset: true });
  });
});

describe("a stroke of the brush", () => {
  it("takes every square a fast pointer crossed between two of its events", () => {
    expect(keys(squaresBetween({ column: 2, row: 3 }, { column: 6, row: 3 }))).toEqual(
      keys([2, 3, 4, 5, 6].map((column) => ({ column, row: 3 }))),
    );
    expect(squaresBetween({ column: 0, row: 0 }, { column: 3, row: 3 })).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 1 },
      { column: 2, row: 2 },
      { column: 3, row: 3 },
    ]);
    expect(squaresBetween({ column: 4, row: 4 }, { column: 4, row: 4 })).toEqual([
      { column: 4, row: 4 },
    ]);
  });

  it("is drawn as one path, a square per subpath on the board's own squares", () => {
    const offset = { ...board, alignment: { cellPx: 64, offsetXPx: 10, offsetYPx: 20 } };
    expect(
      fogOutline(offset, [
        { column: 1, row: 2 },
        { column: 2, row: 2 },
      ]),
    ).toBe("M74 148h64v64h-64zM138 148h64v64h-64z");
    expect(fogOutline(board, [])).toBe("");
  });
});
