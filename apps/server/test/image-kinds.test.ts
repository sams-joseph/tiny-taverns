import { describe, expect, it } from "@effect/vitest";
import { IMAGE_ASPECT, IMAGE_KINDS_OF_SUBJECT, ImageKindName } from "@taverns/api";
import { ALL_IMAGE_KINDS, IMAGE_KINDS } from "../src/images/kinds.js";

/**
 * The contract names the image kinds and the aspect a crop is drawn at, for
 * the web client; the server's kind table decides the sizes. They are two
 * statements of one fact, so this pins them together.
 */
describe("the image kinds", () => {
  it("are the same set on the wire and in the server", () => {
    expect([...ALL_IMAGE_KINDS].sort()).toEqual([...ImageKindName.literals].sort());
    expect(Object.values(IMAGE_KINDS_OF_SUBJECT).flat().sort()).toEqual(
      [...ALL_IMAGE_KINDS].sort(),
    );
  });

  it.each(ALL_IMAGE_KINDS)("crop %s at the aspect of its stored sizes", (kind) => {
    const spec = IMAGE_KINDS[kind];
    const aspect = IMAGE_ASPECT[kind];
    if (spec.fit === "inside") {
      // Scaled whole, never cut: there is no aspect to crop to.
      expect(aspect).toBeNull();
      return;
    }
    for (const size of Object.values(spec.variants)) {
      expect(size.width / size.height).toBeCloseTo(aspect!, 6);
    }
  });
});
