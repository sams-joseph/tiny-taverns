import { describe, expect, it } from "vitest";
import { HOUSE_ATLAS_STYLE, HOUSE_COVER_STYLE } from "./HouseStyle.js";
import {
  locationImageHasSubject,
  locationImagePromptFor,
  locationIsMapped,
} from "./LocationImage.js";

const town = {
  kind: "town" as const,
  name: "Gullport",
  description: "A fishing town of tarred piers.",
  appearance: "A crescent of piers around a grey harbour",
  childKinds: ["district", "district", "building"] as const,
};

describe("a place's picture", () => {
  it("draws a settlement as a map led by its appearance, with room for what is inside it", () => {
    const prompt = locationImagePromptFor(town);
    expect(prompt.startsWith("A map for a tabletop roleplaying game of a whole town")).toBe(true);
    expect(prompt).toContain("A crescent of piers around a grey harbour.");
    expect(prompt).not.toContain("tarred piers");
    expect(prompt).toContain("It is called Gullport");
    expect(prompt).toContain("Leave clear room for the sites within it: 2 districts, a building.");
    expect(prompt.endsWith(HOUSE_ATLAS_STYLE)).toBe(true);
  });

  it("draws a building as a scene, from its description when it has no appearance line", () => {
    const prompt = locationImagePromptFor({
      kind: "building",
      name: "The Lamb",
      description: "A low tavern with a drowned sheep on its sign",
      appearance: null,
      childKinds: ["building"],
    });
    expect(prompt.startsWith("A picture for a tabletop roleplaying game of a building")).toBe(true);
    expect(prompt).toContain("A low tavern with a drowned sheep on its sign.");
    expect(prompt).not.toContain("Leave clear room");
    expect(prompt.endsWith(HOUSE_COVER_STYLE)).toBe(true);
  });

  it("maps the large kinds and pictures the small ones", () => {
    expect(locationIsMapped("realm")).toBe(true);
    expect(locationIsMapped("dungeon")).toBe(true);
    expect(locationIsMapped("landmark")).toBe(false);
  });

  it("has something to draw while it has a name", () => {
    expect(locationImageHasSubject({ ...town, appearance: null, description: null })).toBe(true);
    expect(
      locationImageHasSubject({ ...town, name: "  ", appearance: null, description: null }),
    ).toBe(false);
  });
});
