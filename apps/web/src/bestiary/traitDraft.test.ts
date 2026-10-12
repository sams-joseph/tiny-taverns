import { describe, expect, it } from "vitest";
import { blankDraft, draftOf, traitOf } from "./traitDraft";

describe("a trait as the creature form writes it", () => {
  it("round-trips a trait's distances, and keeps what the form does not show", () => {
    const trait = {
      name: "Longbow",
      text: "Ranged Weapon Attack: +4 to hit, range 150/600 ft., one target.",
      hit: "+4",
      note: "Ammunition",
      dice: "1d8+2",
      range: { normal: 150, long: 600 },
    };
    expect(traitOf(draftOf(trait, "a"))).toEqual({ trait });
  });

  it("writes typed distances as numbers, and a blank box as no key at all", () => {
    const draft = {
      ...blankDraft("b"),
      name: " Fire Breath ",
      text: "Each creature in a 15-foot cone…",
      reach: "",
      areaShape: "cone" as const,
      areaFeet: "15",
    };
    expect(traitOf(draft)).toEqual({
      trait: {
        name: "Fire Breath",
        text: "Each creature in a 15-foot cone…",
        area: { shape: "cone", feet: 15, origin: "self" },
      },
    });
  });

  it("clears a distance the DM emptied", () => {
    const draft = { ...draftOf({ name: "Claw", text: "", reach: 10 }, "c"), reach: "" };
    expect(traitOf(draft)).toEqual({ trait: { name: "Claw", text: "" } });
  });

  it("keeps a line's width and no other shape's", () => {
    const line = { ...blankDraft("d"), name: "Breath", areaShape: "line" as const };
    expect(traitOf({ ...line, areaFeet: "60", areaWidth: "10" })).toMatchObject({
      trait: { area: { shape: "line", feet: 60, width: 10 } },
    });
    expect(traitOf({ ...line, areaShape: "cone", areaFeet: "60", areaWidth: "10" })).toMatchObject({
      trait: { area: { shape: "cone", feet: 60, origin: "self" } },
    });
  });

  it("drops a row with no name, and says why it refuses one it cannot send", () => {
    expect(traitOf(blankDraft("e"))).toEqual({ trait: undefined });
    const named = { ...blankDraft("f"), name: "Bite" };
    expect(traitOf({ ...named, reach: "five" })).toEqual({
      problem: "Reach is a whole number of feet.",
    });
    expect(traitOf({ ...named, rangeLong: "60" })).toEqual({
      problem: "A long range needs a normal range before it.",
    });
    expect(traitOf({ ...named, rangeNormal: "60", rangeLong: "20" })).toEqual({
      problem: "The long range is the farther one.",
    });
    expect(traitOf({ ...named, areaShape: "sphere" })).toEqual({
      problem: "Say how big the area is, in feet.",
    });
    expect(traitOf({ ...named, areaShape: "sphere", areaFeet: "20", areaOrigin: "point" })).toEqual(
      { problem: "An area placed at a point needs the range it can be placed within." },
    );
  });
});
