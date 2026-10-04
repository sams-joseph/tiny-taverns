import { MAX_IMAGE_UPLOAD_BYTES } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { CENTRED, MAX_ZOOM, clampView, cropOf, panBy, placementOf, zoomTo } from "./crop";
import { MAX_EDGE, planUpload } from "./prepare";

const WIDE = { width: 400, height: 200 };
const TALL = { width: 300, height: 900 };

describe("a crop", () => {
  it("starts as the widest rectangle of the aspect, centred, as a drawn picture is cut", () => {
    expect(cropOf(WIDE, 1, CENTRED)).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
    expect(cropOf(TALL, 2, CENTRED)).toEqual({
      x: 0,
      y: 0.5 - 1 / 12,
      width: 1,
      height: 1 / 6,
    });
  });

  it("is always the kind's aspect in pixels", () => {
    for (const aspect of [1, 2, 3 / 2]) {
      for (const picture of [WIDE, TALL]) {
        const crop = cropOf(picture, aspect, { zoom: 2.3, centerX: 0.1, centerY: 0.9 });
        expect((crop.width * picture.width) / (crop.height * picture.height)).toBeCloseTo(aspect);
      }
    }
  });

  it("never leaves the picture, however far it is dragged or zoomed", () => {
    let view = CENTRED;
    for (const [dx, dy] of [
      [5, 5],
      [-9, 3],
      [0.3, -7],
    ] as const) {
      view = panBy(WIDE, 1, zoomTo(WIDE, 1, view, 3), dx, dy);
      const crop = cropOf(WIDE, 1, view);
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(1 + 1e-12);
      expect(crop.y + crop.height).toBeLessThanOrEqual(1 + 1e-12);
    }
    expect(clampView(WIDE, 1, { zoom: 99, centerX: 0.5, centerY: 0.5 }).zoom).toBe(MAX_ZOOM);
    expect(clampView(WIDE, 1, { zoom: 0.1, centerX: 0.5, centerY: 0.5 }).zoom).toBe(1);
  });

  it("moves the picture with the pointer: dragging right shows more of its left", () => {
    const before = cropOf(WIDE, 1, CENTRED);
    const after = cropOf(WIDE, 1, panBy(WIDE, 1, CENTRED, 0.25, 0));
    expect(after.x).toBeCloseTo(before.x - 0.25 * before.width);
  });

  it("places the picture so the frame shows exactly the crop", () => {
    expect(placementOf({ x: 0.25, y: 0, width: 0.5, height: 1 })).toEqual({
      width: "200%",
      height: "100%",
      left: "-50%",
      top: "0%",
    });
  });
});

describe("a chosen file", () => {
  it("goes as it is when the server can read it whole", () => {
    expect(planUpload({ type: "image/png", size: 1000, width: 800, height: 600 })).toEqual({
      _tag: "asIs",
      type: "image/png",
    });
  });

  it("is redrawn no longer than the server decodes when it is too big or another type", () => {
    expect(planUpload({ type: "image/jpeg", size: 1000, width: 8000, height: 6000 })).toEqual({
      _tag: "redraw",
      size: { width: MAX_EDGE, height: 3072 },
    });
    expect(
      planUpload({ type: "image/jpeg", size: MAX_IMAGE_UPLOAD_BYTES + 1, width: 900, height: 900 }),
    ).toEqual({ _tag: "redraw", size: { width: 900, height: 900 } });
    expect(planUpload({ type: "image/gif", size: 10, width: 10, height: 20 })).toEqual({
      _tag: "redraw",
      size: { width: 10, height: 20 },
    });
  });
});
