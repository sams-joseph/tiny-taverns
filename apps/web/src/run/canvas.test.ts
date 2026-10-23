import { describe, expect, it } from "vitest";
import {
  SQUARE_PX,
  fitView,
  keepInView,
  openingView,
  wheelZoomFactor,
  zoomAbout,
  zoomLimits,
} from "./canvas";

// The fixture fight's board: 24 × 16 squares of 64 plane pixels, no picture.
const cellPx = 64;
const plane = { width: 24 * cellPx, height: 16 * cellPx };
const limits = zoomLimits(cellPx);
const drawnSquare = (zoom: number) => cellPx * zoom;

describe("the canvas view", () => {
  it("fits the whole board in the free area, centred", () => {
    const area = { x: 100, y: 20, width: 960, height: 1000 };
    const view = fitView(plane, area, limits);
    // Width is the tighter side: 960 / 1536.
    expect(view.zoom).toBeCloseTo(0.625);
    expect(view.x).toBeCloseTo(100);
    expect(view.y).toBeCloseTo(20 + (1000 - 1024 * 0.625) / 2);
  });

  it("opens fitted when a fitted square is big enough to press", () => {
    const area = { x: 0, y: 0, width: 960, height: 640 };
    expect(openingView(plane, area, cellPx)).toEqual(fitView(plane, area, limits));
    expect(drawnSquare(openingView(plane, area, cellPx).zoom)).toBeGreaterThanOrEqual(
      SQUARE_PX.target,
    );
  });

  it("opens at the smallest playable square from the corner when fitting would be smaller", () => {
    // A narrow gap between the panels: fitting 24 squares into 220px is 9px each.
    const area = { x: 364, y: 12, width: 220, height: 450 };
    const view = openingView(plane, area, cellPx);
    expect(drawnSquare(view.zoom)).toBeCloseTo(SQUARE_PX.target);
    expect(view.x).toBe(364);
    // 16 squares of 24px fit the height, so it is centred that way.
    expect(view.y).toBeCloseTo(12 + (450 - 16 * SQUARE_PX.target) / 2);
  });

  it("zooms about the point under the pointer", () => {
    const view = { x: 40, y: 30, zoom: 0.5 };
    const at = { x: 300, y: 200 };
    const before = { x: (at.x - view.x) / view.zoom, y: (at.y - view.y) / view.zoom };
    const zoomed = zoomAbout(view, 1, at, limits);
    expect(zoomed.zoom).toBe(1);
    // The plane's point under the pointer is still under it.
    expect(before.x * zoomed.zoom + zoomed.x).toBeCloseTo(at.x);
    expect(before.y * zoomed.zoom + zoomed.y).toBeCloseTo(at.y);
  });

  it("bounds the zoom by the drawn square, not by a factor", () => {
    const view = { x: 0, y: 0, zoom: 1 };
    expect(drawnSquare(zoomAbout(view, 100, { x: 0, y: 0 }, limits).zoom)).toBeCloseTo(
      SQUARE_PX.max,
    );
    expect(drawnSquare(zoomAbout(view, 0.001, { x: 0, y: 0 }, limits).zoom)).toBeCloseTo(
      SQUARE_PX.min,
    );
    // A picture with bigger squares gets a smaller factor for the same square.
    expect(zoomLimits(128).max).toBeCloseTo(limits.max / 2);
  });

  it("keeps a square of the board on the canvas however far it is panned", () => {
    const canvas = { width: 800, height: 600 };
    const square = cellPx * 0.5;
    const away = keepInView({ x: 5000, y: -5000, zoom: 0.5 }, plane, canvas, cellPx);
    expect(away.x).toBe(canvas.width - square);
    expect(away.y).toBe(square - plane.height * 0.5);
    const inside = { x: 10, y: 10, zoom: 0.5 };
    expect(keepInView(inside, plane, canvas, cellPx)).toEqual(inside);
  });

  it("zooms a wheel notch one bounded step, and a pinch's small deltas smoothly", () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(Math.SQRT2);
    expect(wheelZoomFactor(100)).toBeCloseTo(Math.SQRT1_2);
    expect(wheelZoomFactor(-1000)).toBeCloseTo(Math.SQRT2);
    expect(wheelZoomFactor(-4)).toBeCloseTo(2 ** 0.04);
  });

  it("opens on whoever is up at a readable size when the fitted board is too small to read", () => {
    const plane = { width: 1536, height: 1024 };
    const area = { x: 100, y: 50, width: 600, height: 400 };
    const view = openingView(plane, area, 64, { x: 640, y: 320 });
    expect(view.zoom * 64).toBeCloseTo(SQUARE_PX.readable);
    // The focus lands in the middle of the area.
    expect(640 * view.zoom + view.x).toBeCloseTo(400);
    expect(320 * view.zoom + view.y).toBeCloseTo(250);
    // A focus near the board's edge pulls the board no further than its edge:
    // no bare band inside the area while the far side is cut off.
    const edge = openingView(plane, area, 64, { x: 32, y: 32 });
    expect(edge.x).toBeCloseTo(area.x);
    expect(edge.y).toBeCloseTo(area.y);
    const far = openingView(plane, area, 64, { x: 1504, y: 992 });
    expect(far.x + plane.width * far.zoom).toBeCloseTo(area.x + area.width);
    expect(far.y + plane.height * far.zoom).toBeCloseTo(area.y + area.height);
    // A board a little too big to read whole: 26 squares across 1088 pixels
    // opens readable, with its left edge on the area's, not pulled past it.
    const visit = { width: 26 * 64, height: 16 * 64 };
    const wide = { x: 12, y: 80, width: 1076, height: 800 };
    const opened = openingView(visit, wide, 64, { x: 15.5 * 64, y: 7.5 * 64 });
    expect(opened.x).toBeGreaterThanOrEqual(wide.x + wide.width - visit.width * opened.zoom - 1e-9);
    expect(opened.x).toBeLessThanOrEqual(wide.x);
    // A board that fits readably is fitted, focus or none.
    const small = { width: 640, height: 320 };
    expect(openingView(small, area, 64, { x: 10, y: 10 })).toEqual(
      fitView(small, area, zoomLimits(64)),
    );
  });
});
