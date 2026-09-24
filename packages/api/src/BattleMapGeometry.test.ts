import { describe, expect, it } from "vitest";
import {
  battleMapPlane,
  boardRect,
  cellPxForColumns,
  cellRect,
  gridLines,
  offsetWithinSquare,
  pictureScale,
  rowsThatFit,
  squareAt,
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
