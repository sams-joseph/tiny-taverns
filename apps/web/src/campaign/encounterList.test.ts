import { Encounter, EncounterPrep } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  dryWell,
  encounter,
  hagsBargain,
  sandstorm,
  sketch,
  tollBridge,
  wolves,
} from "./campaign.fixtures";
import {
  creatureWords,
  encountersSummary,
  matchesKind,
  ratingOf,
  sectionsOf,
} from "./encounterList";

const decode = Schema.decodeUnknownSync(Encounter);
const prep = Schema.decodeUnknownSync(EncounterPrep);

const ambush = decode(encounter);
const crate = decode(sketch);
const well = decode(dryWell);
const bargain = decode(hagsBargain);
const storm = decode(sandstorm);
const bridge = decode(tollBridge);
const pack = decode(wolves);
const shelf = [ambush, crate, well, bargain, storm, bridge, pack];

describe("sectionsOf", () => {
  it("leads with the fight on the table, and puts the latest played first", () => {
    const sections = sectionsOf(shelf, ambush.id);
    expect(sections.map((section) => section.title)).toEqual([
      "On the table now",
      "Not yet played",
      "Played",
    ]);
    expect(sections[0]!.encounters).toEqual([ambush]);
    // Session 11's before session 10's, though the list has them the other way.
    expect(sections[2]!.encounters.map((row) => row.name)).toEqual([
      "Toll bridge standoff",
      "Wolves at the caravan",
    ]);
  });

  it("leaves out a group with nothing in it", () => {
    expect(sectionsOf([well], undefined).map((section) => section.group)).toEqual(["unplayed"]);
  });
});

describe("encountersSummary", () => {
  it("says only the groups there are", () => {
    expect(encountersSummary(shelf, undefined)).toBe("5 not yet played · 2 played");
    expect(encountersSummary([ambush], ambush.id)).toBe("1 on the table");
    expect(encountersSummary([], undefined)).toBeUndefined();
  });
});

describe("matchesKind", () => {
  it("puts challenges and hazards under one pill", () => {
    expect(shelf.filter((row) => matchesKind(row, "other"))).toEqual([well, storm]);
    expect(shelf.filter((row) => matchesKind(row, "social"))).toEqual([bargain, bridge]);
    expect(shelf.filter((row) => matchesKind(row, "all"))).toHaveLength(7);
  });
});

describe("ratingOf", () => {
  it("says a challenge's DC once it has one, and Unrated until it does", () => {
    const set = prep({
      encounterId: well.id,
      ready: false,
      tactics: [],
      treasure: null,
      challenge: { kind: "challenge", dc: 14, successes: 3, failures: 2, skills: [] },
    });
    expect(ratingOf(well, set)).toEqual({ text: "DC 14" });
    expect(ratingOf(well, undefined)).toEqual({ text: "Unrated" });
  });

  it("says the band for a fight, and what else a scene is when it has none", () => {
    expect(ratingOf(ambush, undefined)).toEqual({ text: "Medium", band: "Medium" });
    expect(ratingOf(bargain, undefined)).toEqual({ text: "Hard", band: "Hard" });
    expect(ratingOf(crate, undefined)).toEqual({ text: "Unrated" });
    expect(ratingOf(storm, undefined)).toEqual({ text: "Hazard" });
    expect(ratingOf(bridge, undefined)).toEqual({ text: "No combat" });
  });
});

describe("creatureWords", () => {
  it("names a fight's empty roster, and says nothing of a scene's", () => {
    expect(creatureWords(ambush)).toBe("6 creatures");
    expect(creatureWords(crate)).toBe("1 creature");
    expect(creatureWords(decode({ ...encounter, creatureCount: 0 }))).toBe("No creatures yet");
    expect(creatureWords(well)).toBeUndefined();
  });
});
