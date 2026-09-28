import { describe, expect, it } from "vitest";
import { cazrilSheet, cazrilSheetSummary } from "../campaign/campaign.fixtures";
import {
  boxesOf,
  challengeLine,
  identityPatch,
  sheetSummaryLine,
  writeOnePayload,
} from "./npcSheet";

/**
 * The NPC sheet's pure half: the drawer's line, the challenge line, and the
 * identity dialog's two payloads. `NpcScreen.test.tsx` drives them over the
 * wire; this pins the edges a screen test would not reach.
 */

type Sheet = Parameters<typeof identityPatch>[0];
const sheet = cazrilSheet as unknown as Sheet;

describe("sheetSummaryLine", () => {
  it("draws only the columns that are set", () => {
    const summary = cazrilSheetSummary as unknown as Sheet;
    expect(sheetSummaryLine(summary)).toBe("Level 5 Human Fighter · AC 17 · HP 44 · CR 3");
    expect(sheetSummaryLine({ ...summary, descriptor: null, hpMax: null } as Sheet)).toBe(
      "AC 17 · CR 3",
    );
  });

  it("says a sheet with nothing in its columns is still there", () => {
    const blank = {
      ...cazrilSheetSummary,
      level: null,
      race: null,
      className: null,
      descriptor: null,
      ac: null,
      hpMax: null,
      cr: null,
    } as unknown as Sheet;
    expect(sheetSummaryLine(blank)).toBe("A sheet with nothing on it yet");
  });
});

describe("challengeLine", () => {
  it("reads the XP from the one table, fractions included", () => {
    expect(challengeLine("3")).toBe("CR 3 · 700 XP");
    expect(challengeLine("1/8")).toBe("CR 1/8 · 25 XP");
    expect(challengeLine("0")).toBe("CR 0 · 10 XP");
    expect(challengeLine("30")).toBe("CR 30 · 155,000 XP");
  });
});

describe("the identity payloads", () => {
  it("writes one with every column, blanks as null, over the column default", () => {
    expect(writeOnePayload(boxesOf(null))).toEqual({
      level: null,
      race: null,
      subrace: null,
      className: null,
      ac: null,
      hpMax: null,
      cr: null,
      sheet: { abilities: [], traits: [] },
    });
  });

  it("patches only what moved, trimmed, with the version it read", () => {
    const boxes = boxesOf(sheet);
    expect(identityPatch(sheet, boxes)).toBeUndefined();
    // Retyped the same, with space around it, is no change.
    expect(identityPatch(sheet, { ...boxes, className: " Fighter " })).toBeUndefined();
    expect(identityPatch(sheet, { ...boxes, level: "6", subrace: "Variant" })).toEqual({
      expectedVersion: 3,
      level: 6,
      subrace: "Variant",
    });
    // Emptying a box clears it rather than leaving it out.
    expect(identityPatch(sheet, { ...boxes, race: "", ac: "" })).toEqual({
      expectedVersion: 3,
      race: null,
      ac: null,
    });
  });
});
