import { afterEach, describe, expect, it, vi } from "vitest";
import { smallLevel } from "./level.fixtures";
import { LEVEL_COLOURS, type Palette, THEME_COLOURS } from "./palette";
import { drawLevelThumbnail } from "./thumbnail";

/** Every colour black: the drawing's shape is under test, not its tones. */
const palette = {
  level: Object.fromEntries(LEVEL_COLOURS.map((name) => [name, [0, 0, 0]])),
  theme: Object.fromEntries(Object.keys(THEME_COLOURS).map((name) => [name, [0, 0, 0]])),
} as unknown as Palette;

/** Every colour its own grey by its place in the list, so tones between two can be told apart. */
const toned = {
  level: Object.fromEntries(
    LEVEL_COLOURS.map((name, index) => [name, [index / LEVEL_COLOURS.length, 0.2, 0.4]]),
  ),
  theme: Object.fromEntries(Object.keys(THEME_COLOURS).map((name) => [name, [0, 0, 0]])),
} as unknown as Palette;

/** A 2D context that records what was drawn: enough of one for the thumbnail. */
const recorder = () => {
  const calls: Array<string> = [];
  const context = new Proxy(
    {},
    {
      get: (_target, key: string) =>
        key === "createRadialGradient"
          ? () => ({ addColorStop: () => undefined })
          : (...args: Array<unknown>) => {
              calls.push(`${key}(${args.map(String).join(",")})`);
            },
      set: () => true,
    },
  );
  return { calls, context: context as CanvasRenderingContext2D };
};

afterEach(() => vi.restoreAllMocks());

describe("drawLevelThumbnail", () => {
  it("sizes the canvas to the board and draws its floor, its lights and its walls", () => {
    const level = smallLevel();
    const { calls, context } = recorder();
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(context);
    // The kit's prop art is a canvas of its own, which jsdom does not have.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(drawLevelThumbnail(canvas, level, palette, 4)).toBe(true);
    expect([canvas.width, canvas.height]).toEqual([level.columns * 4, level.rows * 4]);

    const floored = level.floor.filter((material) => material !== 0).length;
    const squareFills = calls.filter((call) => /^fillRect\(\d+,\d+,4,4\)$/.test(call));
    // The void, every floored square's own tone, its joints over it, the
    // ambient shade, and one glow per lit light.
    expect(squareFills).toHaveLength(floored);
    const joints = calls.filter((call) =>
      /^fillRect\([\d.]+,[\d.]+,[\d.]+,[\d.]+\)$/.test(call),
    ).length;
    expect(joints).toBeGreaterThan(
      1 + floored + 1 + level.lights.filter((light) => light.lit).length,
    );
    expect(calls.filter((call) => call === "stroke()")).toHaveLength(level.walls.length);
  });

  it("textures a floor rather than checkering it: a tone per square, the same every draw", () => {
    const level = smallLevel();
    const draw = () => {
      const { calls, context } = recorder();
      const canvas = document.createElement("canvas");
      vi.spyOn(canvas, "getContext").mockReturnValue(context);
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
      const styles: Array<unknown> = [];
      const seen = new Proxy(context, {
        set: (_target, key, value) => {
          if (key === "fillStyle" && typeof value === "string") styles.push(value);
          return true;
        },
        get: (target, key) => Reflect.get(target, key) as unknown,
      });
      vi.spyOn(canvas, "getContext").mockReturnValue(seen);
      drawLevelThumbnail(canvas, level, toned, 4);
      return { calls, styles };
    };
    const first = draw();
    expect(draw().styles).toEqual(first.styles);
    // More than the two tones a checkerboard has.
    expect(new Set(first.styles.slice(1, 1 + 20)).size).toBeGreaterThan(2);
  });

  it("draws nothing, and says so, with no 2D canvas", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(null);
    expect(drawLevelThumbnail(canvas, smallLevel(), palette, 4)).toBe(false);
  });
});
