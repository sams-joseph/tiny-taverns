import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import sharp from "sharp";
import { layoutGuide, layoutGuideSvg } from "../src/images/layoutGuide.js";

describe("a place's layout guide", () => {
  it("marks each pinned site where its pin is, sized by its kind, with no text", () => {
    const svg = layoutGuideSvg(
      [
        { kind: "city", pin: { x: 0.25, y: 0.5 } },
        { kind: "building", pin: { x: 1, y: 0 } },
      ],
      1536,
      1024,
    );
    expect(svg).toContain('cx="384" cy="512" r="102"');
    expect(svg).toContain('cx="1536" cy="0" r="46"');
    expect(svg).not.toContain("<text");
  });

  it.effect("is a PNG the drawn size, so a pin is the same point on both", () =>
    Effect.gen(function* () {
      const png = yield* layoutGuide([{ kind: "town", pin: { x: 0.5, y: 0.5 } }], "1536x1024");
      const meta = yield* Effect.promise(() => sharp(Buffer.from(png)).metadata());
      expect([meta.format, meta.width, meta.height]).toEqual(["png", 1536, 1024]);
    }),
  );
});
