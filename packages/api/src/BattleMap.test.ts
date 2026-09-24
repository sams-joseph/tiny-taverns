import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  BattleMapAlignment,
  BattleMapUpdate,
  battleMapHasSubject,
  battleMapPromptFor,
  ENCOUNTER_SETTING_MAX,
} from "./BattleMap.js";
import { EncounterCreate } from "./Encounter.js";
import { HOUSE_MAP_STYLE } from "./HouseStyle.js";

const style = { style: HOUSE_MAP_STYLE };

const REEDS = {
  name: "Ambush in the reeds",
  tags: ["Marsh", "Night"],
  setting: "A boardwalk over black water, reed beds on both sides and a sunken barge",
};

describe("battleMapPromptFor", () => {
  it("draws the setting as the scene, coloured by the name and the tags, in the map style", () => {
    expect(battleMapPromptFor(REEDS, style)).toBe(
      "Top-down battle map for a tabletop roleplaying game: A boardwalk over black water, " +
        "reed beds on both sides and a sunken barge. A fight here is called Ambush in the " +
        "reeds; let that colour the place, shown rather than written. Its feel: Marsh, " +
        "Night. " +
        HOUSE_MAP_STYLE,
    );
  });

  it("asks for a top-down picture with no grid, no creatures and no text", () => {
    const prompt = battleMapPromptFor(REEDS, style).toLowerCase();
    expect(prompt).toContain("top-down");
    expect(prompt).toContain("no grid");
    expect(prompt).toContain("no creatures");
    expect(prompt).toContain("no text");
  });

  it("leaves out tags it was not given, and blank ones", () => {
    const prompt = battleMapPromptFor({ ...REEDS, tags: [" ", ""] }, style);
    expect(prompt).not.toContain("Its feel");
  });

  it("bounds a long setting at the schema's limit and drops quotes", () => {
    const prompt = battleMapPromptFor(
      { ...REEDS, setting: `"${"y".repeat(ENCOUNTER_SETTING_MAX + 50)}"` },
      style,
    );
    expect(prompt).toContain(`${"y".repeat(ENCOUNTER_SETTING_MAX)}.`);
    expect(prompt).not.toContain("y".repeat(ENCOUNTER_SETTING_MAX + 1));
    expect(prompt).not.toContain('"');
  });
});

describe("battleMapHasSubject", () => {
  it("draws only from a setting line: a name and tags alone are a guess", () => {
    expect(battleMapHasSubject(REEDS)).toBe(true);
    expect(battleMapHasSubject({ ...REEDS, setting: null })).toBe(false);
    expect(battleMapHasSubject({ ...REEDS, setting: "  “”  " })).toBe(false);
  });
});

describe("the grid on the wire", () => {
  const alignment = Schema.decodeUnknownExit(BattleMapAlignment);
  const update = Schema.decodeUnknownExit(BattleMapUpdate);

  it("keeps an offset within one square", () => {
    expect(alignment({ cellPx: 64, offsetXPx: 0, offsetYPx: 63.5 })._tag).toBe("Success");
    expect(alignment({ cellPx: 64, offsetXPx: 64, offsetYPx: 0 })._tag).toBe("Failure");
    expect(alignment({ cellPx: 64, offsetXPx: 0, offsetYPx: 70 })._tag).toBe("Failure");
    expect(alignment({ cellPx: 64, offsetXPx: -1, offsetYPx: 0 })._tag).toBe("Failure");
    expect(alignment({ cellPx: 4, offsetXPx: 0, offsetYPx: 0 })._tag).toBe("Failure");
  });

  it("offers a square grid or none, and bounds the board", () => {
    expect(update({ grid: "none", columns: 20, rows: 12, feetPerCell: 10 })._tag).toBe("Success");
    expect(update({ grid: "hex" })._tag).toBe("Failure");
    expect(update({ columns: 0 })._tag).toBe("Failure");
    expect(update({ rows: 201 })._tag).toBe("Failure");
    expect(update({ columns: 2.5 })._tag).toBe("Failure");
    expect(update({ feetPerCell: 0 })._tag).toBe("Failure");
    expect(update({ alignment: { cellPx: 50, offsetXPx: 50, offsetYPx: 0 } })._tag).toBe("Failure");
  });

  it("bounds the setting line on the encounter's own payload", () => {
    const create = Schema.decodeUnknownExit(EncounterCreate);
    expect(create({ name: "Reeds", setting: "x".repeat(ENCOUNTER_SETTING_MAX) })._tag).toBe(
      "Success",
    );
    expect(create({ name: "Reeds", setting: "x".repeat(ENCOUNTER_SETTING_MAX + 1) })._tag).toBe(
      "Failure",
    );
  });
});
