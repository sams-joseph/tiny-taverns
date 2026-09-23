import { describe, expect, it } from "vitest";
import { HOUSE_COVER_STYLE } from "./HouseStyle.js";
import { sharedWorldImageHasSubject, sharedWorldImagePromptFor } from "./SharedWorldImage.js";

const style = { style: HOUSE_COVER_STYLE };

describe("sharedWorldImagePromptFor", () => {
  it("asks for the land the name suggests, in the house style framed as a cover", () => {
    const prompt = sharedWorldImagePromptFor({ name: "The Salt Company" }, style);
    expect(prompt).toBe(
      "Wide vista of a fantasy world called The Salt Company: the land and the mood that " +
        "name suggests, shown rather than written. " +
        HOUSE_COVER_STYLE,
    );
  });

  it("strips quotes and runs of space, and bounds the name", () => {
    expect(sharedWorldImagePromptFor({ name: `  "The   Sundered\nReach"  ` }, style)).toContain(
      "called The Sundered Reach:",
    );
    const long = sharedWorldImagePromptFor({ name: "x".repeat(400) }, style);
    expect(long).not.toContain('"');
    expect(long).not.toContain("x".repeat(121));
  });
});

describe("sharedWorldImageHasSubject", () => {
  it("draws any world with a name, and skips one named in nothing but space and quotes", () => {
    expect(sharedWorldImageHasSubject({ name: "The Reach" })).toBe(true);
    expect(sharedWorldImageHasSubject({ name: "  “” " })).toBe(false);
  });
});
