import { Encounter, EncounterPrep, Note } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  dryWell,
  encounter,
  hagsBargain,
  readAloud,
  sandstorm,
  sketch,
  tollBridge,
  wolves,
} from "./campaign.fixtures";
import {
  creatureWords,
  dropPlacement,
  encountersSummary,
  matchesKind,
  movedWords,
  onDeckOf,
  placed,
  placementFor,
  ratingOf,
  sectionsOf,
} from "./encounterList";
import { orderOver } from "./encounterOrder";
import { openingReadAloud } from "./overview";

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

const names = (rows: ReadonlyArray<Encounter>) => rows.map((row) => row.name);

describe("placementFor", () => {
  // The unplayed rows, in the list's order.
  const rows = [ambush, crate, well, bargain, storm];

  it("anchors each move on the row it passes", () => {
    expect(placementFor(rows, well.id, "top")).toEqual({ before: ambush.id });
    expect(placementFor(rows, well.id, "up")).toEqual({ before: crate.id });
    expect(placementFor(rows, well.id, "down")).toEqual({ after: bargain.id });
    expect(placementFor(rows, well.id, "bottom")).toEqual({ after: storm.id });
  });

  it("has nowhere to send the first row up or the last row down", () => {
    expect(placementFor(rows, ambush.id, "top")).toBeUndefined();
    expect(placementFor(rows, ambush.id, "up")).toBeUndefined();
    expect(placementFor(rows, storm.id, "down")).toBeUndefined();
    expect(placementFor(rows, storm.id, "bottom")).toBeUndefined();
    expect(placementFor(rows, pack.id, "up")).toBeUndefined();
  });

  it("anchors on the rows a kind pill shows, not the ones it hides", () => {
    const combat = rows.filter((row) => matchesKind(row, "combat"));
    expect(names(combat)).toEqual(["Ambush in the reeds", "Whatever is in the crate"]);
    // Up past the ambush, though the list has nothing hidden between them…
    expect(placementFor(combat, crate.id, "up")).toEqual({ before: ambush.id });
    const other = rows.filter((row) => matchesKind(row, "other"));
    // …and down past the sandstorm, over the bargain the pill hides.
    expect(placementFor(other, well.id, "down")).toEqual({ after: storm.id });
    expect(placementFor(other, well.id, "bottom")).toEqual({ after: storm.id });
    expect(placementFor(other, storm.id, "top")).toEqual({ before: well.id });
  });
});

describe("placed", () => {
  it("moves one row before or after its anchor and leaves the rest in order", () => {
    expect(names(placed(shelf, storm.id, { before: ambush.id }))[0]).toBe("Salt-flat sandstorm");
    expect(names(placed(shelf, ambush.id, { after: well.id }))).toEqual([
      "Whatever is in the crate",
      "The dry well",
      "Ambush in the reeds",
      "The hag's bargain",
      "Salt-flat sandstorm",
      "Toll bridge standoff",
      "Wolves at the caravan",
    ]);
  });

  it("keeps a row the pill hides in its place among the rest", () => {
    // The pill shows the well and the sandstorm; the bargain between them stays
    // where it was relative to the rest.
    expect(names(placed(shelf, well.id, { after: storm.id })).slice(0, 5)).toEqual([
      "Ambush in the reeds",
      "Whatever is in the crate",
      "The hag's bargain",
      "Salt-flat sandstorm",
      "The dry well",
    ]);
  });

  it("changes nothing for itself as anchor, or an anchor it does not hold", () => {
    expect(placed(shelf, well.id, { before: well.id })).toBe(shelf);
    expect(placed([ambush, crate], well.id, { before: ambush.id })).toEqual([ambush, crate]);
    expect(placed([ambush, crate], ambush.id, { after: well.id })).toEqual([ambush, crate]);
  });
});

describe("dropPlacement", () => {
  // Five 56px rows 6px apart, the list's own spacing; the dragged row's span
  // is its own place, where it stays, dimmed, while it is carried.
  const spans = (rows: ReadonlyArray<Encounter>) =>
    rows.map((row, at) => ({ id: row.id, top: at * 62, bottom: at * 62 + 56 }));
  const rows = [ambush, crate, well, bargain, storm];

  it("drops into the gap nearest the pointer, before the first row or after the one above", () => {
    // Above the crate's middle: the gap before it, which is the list's top.
    expect(dropPlacement(spans(rows), well.id, 10)).toEqual({ before: ambush.id });
    expect(dropPlacement(spans(rows), well.id, -400)).toEqual({ before: ambush.id });
    // Past the ambush's middle, before the crate's: the gap between them.
    expect(dropPlacement(spans(rows), well.id, 40)).toEqual({ after: ambush.id });
    // Down past the bargain's middle, and past the end.
    expect(dropPlacement(spans(rows), well.id, 220)).toEqual({ after: bargain.id });
    expect(dropPlacement(spans(rows), well.id, 4000)).toEqual({ after: storm.id });
  });

  it("is nothing back in the row's own gap, so a drop there sends nothing", () => {
    // Between the crate's middle and the bargain's: where the well already is.
    expect(dropPlacement(spans(rows), well.id, 100)).toBeUndefined();
    expect(dropPlacement(spans(rows), well.id, 150)).toBeUndefined();
    expect(dropPlacement(spans(rows), ambush.id, -50)).toBeUndefined();
    expect(dropPlacement(spans(rows), storm.id, 4000)).toBeUndefined();
  });

  it("anchors on the rows a pill draws, and has nothing for a row it does not hold", () => {
    const other = rows.filter((row) => matchesKind(row, "other"));
    expect(names(other)).toEqual(["The dry well", "Salt-flat sandstorm"]);
    // Past the sandstorm, over the bargain the pill hides.
    expect(dropPlacement(spans(other), well.id, 100)).toEqual({ after: storm.id });
    expect(dropPlacement(spans(rows), pack.id, 100)).toBeUndefined();
    expect(dropPlacement(spans([well]), well.id, 100)).toBeUndefined();
  });
});

describe("movedWords", () => {
  it("says the row's place among those drawn and the neighbour that places it", () => {
    const rows = [ambush, well, crate];
    expect(movedWords(rows, well.id)).toBe(
      "The dry well moved to 2 of 3, after Ambush in the reeds.",
    );
    expect(movedWords(rows, ambush.id)).toBe(
      "Ambush in the reeds moved to 1 of 3, before The dry well.",
    );
    expect(movedWords(rows, pack.id)).toBeUndefined();
  });
});

describe("orderOver", () => {
  const framed = shelf.map((row) => row.id);
  const pending = { encounterId: storm.id, placement: { before: ambush.id }, framed };

  it("lays the move over the order it was made on", () => {
    expect(names(orderOver(shelf, pending))[0]).toBe("Salt-flat sandstorm");
    expect(orderOver(shelf, undefined)).toBe(shelf);
  });

  it("gives way to any other order the frame reads", () => {
    const reread = placed(shelf, storm.id, { before: ambush.id });
    expect(orderOver(reread, pending)).toBe(reread);
    // Somebody else's move landed first: theirs is what the frame says.
    const theirs = placed(shelf, pack.id, { before: ambush.id });
    expect(orderOver(theirs, pending)).toBe(theirs);
    // An encounter added in another tab changes the frame too.
    expect(orderOver(shelf.slice(1), pending)).toEqual(shelf.slice(1));
  });
});

describe("onDeckOf", () => {
  const carried = decode({
    ...wolves,
    lastPlayed: { ...wolves.lastPlayed, endedReason: "carried" },
  });

  it("puts the fight on the table first, then a carried one, then the DM's order", () => {
    expect(names(onDeckOf([crate, well, carried, bridge, ambush], ambush.id))).toEqual([
      "Ambush in the reeds",
      "Wolves at the caravan",
      "Whatever is in the crate",
      "The dry well",
    ]);
  });

  it("leaves a played encounter off", () => {
    expect(names(onDeckOf([bridge, well], undefined))).toEqual(["The dry well"]);
  });
});

describe("openingReadAloud", () => {
  const note = Schema.decodeUnknownSync(Note);

  it("opens on the first encounter still to play, not the first ever written", () => {
    const bridgeProse = note({
      ...readAloud,
      id: "2b1f2a1e-0000-4000-8000-00000000a0a1",
      attachedTo: { kind: "encounter", id: bridge.id },
    });
    const notes = [bridgeProse, note(readAloud)];
    // The toll bridge is first in the list but played; the ambush is next.
    expect(openingReadAloud(onDeckOf([bridge, ambush], undefined), notes)?.body).toBe(
      readAloud.body,
    );
  });
});
