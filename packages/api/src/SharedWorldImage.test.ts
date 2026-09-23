import { describe, expect, it } from "vitest";
import { HOUSE_COVER_STYLE } from "./HouseStyle.js";
import { SHARED_WORLD_DESCRIPTION_MAX } from "./SharedWorld.js";
import { sharedWorldImageHasSubject, sharedWorldImagePromptFor } from "./SharedWorldImage.js";

const style = { style: HOUSE_COVER_STYLE };

describe("sharedWorldImagePromptFor", () => {
  it("asks for the land the name suggests, in the house style framed as a cover", () => {
    const prompt = sharedWorldImagePromptFor(
      { name: "The Salt Company", description: null },
      style,
    );
    expect(prompt).toBe(
      "Wide vista of a fantasy world called The Salt Company: the land and the mood that " +
        "name suggests, shown rather than written. " +
        HOUSE_COVER_STYLE,
    );
  });

  it("draws the description first, as the land, with the name only colouring it", () => {
    const prompt = sharedWorldImagePromptFor(
      {
        name: "The Sundered Reach",
        description: "Floating islands chained over an endless storm, lit by lightning",
      },
      style,
    );
    expect(prompt).toBe(
      "Wide vista of a fantasy world. Floating islands chained over an endless storm, lit by " +
        "lightning. The world is called The Sundered Reach; let that colour the mood, shown " +
        "rather than written. " +
        HOUSE_COVER_STYLE,
    );
  });

  it("treats a blank description as none, and bounds a long one at the schema's limit", () => {
    expect(sharedWorldImagePromptFor({ name: "The Reach", description: " “” " }, style)).toBe(
      sharedWorldImagePromptFor({ name: "The Reach", description: null }, style),
    );
    const long = sharedWorldImagePromptFor(
      { name: "The Reach", description: "y".repeat(SHARED_WORLD_DESCRIPTION_MAX + 50) },
      style,
    );
    expect(long).toContain("y".repeat(SHARED_WORLD_DESCRIPTION_MAX));
    expect(long).not.toContain("y".repeat(SHARED_WORLD_DESCRIPTION_MAX + 1));
  });

  it("strips quotes and runs of space, and bounds the name", () => {
    expect(
      sharedWorldImagePromptFor({ name: `  "The   Sundered\nReach"  `, description: null }, style),
    ).toContain("called The Sundered Reach:");
    const long = sharedWorldImagePromptFor({ name: "x".repeat(400), description: null }, style);
    expect(long).not.toContain('"');
    expect(long).not.toContain("x".repeat(121));
  });
});

describe("sharedWorldImageHasSubject", () => {
  it("draws from a description alone", () => {
    const world = { name: "“”", description: "A salt desert under two moons." };
    expect(sharedWorldImageHasSubject(world)).toBe(true);
    expect(sharedWorldImagePromptFor(world, style)).toBe(
      "Wide vista of a fantasy world. A salt desert under two moons. " + HOUSE_COVER_STYLE,
    );
  });

  it("draws any world with a name, and skips one named in nothing but space and quotes", () => {
    expect(sharedWorldImageHasSubject({ name: "The Reach", description: null })).toBe(true);
    expect(sharedWorldImageHasSubject({ name: "  “” ", description: "  " })).toBe(false);
  });
});
