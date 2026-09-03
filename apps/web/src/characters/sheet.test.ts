import type { CharacterSheet } from "@taverns/api";
import { emptyCharacterSheet } from "@taverns/api";
import { describe, expect, it } from "vitest";
import {
  coins,
  drawnSections,
  hitPoints,
  hpFraction,
  initialsOf,
  rosterSummary,
  sectionInView,
  SHEET_SECTIONS,
  sheetSections,
} from "./sheet";

/**
 * The decisions that are wrong silently.
 *
 * A section drawn empty, a hit point invented out of a null, a plate showing
 * three letters — none of them throws, and all three read as fine on a
 * screenshot.
 */

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Brannoc Duskharrow")).toBe("BD");
    expect(initialsOf("Wren")).toBe("W");
    expect(initialsOf("Sister Pell of the Marsh")).toBe("SP");
  });

  it("says nothing rather than something about a name with no letters", () => {
    expect(initialsOf("   ")).toBe("");
  });
});

describe("hit points", () => {
  it("shows the pair when both are known", () => {
    expect(hitPoints(44, 52)).toBe("44 / 52");
  });

  /**
   * `hpCurrent` null is *nobody has said*, and `0014` declined to backfill it
   * for that reason. Showing `52 / 52` here would make the claim the migration
   * refused to make.
   */
  it("shows the one number it has when nobody has said where they are", () => {
    expect(hitPoints(null, 52)).toBe("52");
    expect(hitPoints(44, null)).toBe("44");
    expect(hitPoints(null, null)).toBeUndefined();
  });

  it("draws no bar without a maximum to draw it against", () => {
    expect(hpFraction(44, null)).toBeUndefined();
    expect(hpFraction(null, 0)).toBeUndefined();
    expect(hpFraction(null, 52)).toBe(1);
    expect(hpFraction(0, 52)).toBe(0);
    // A clamp, because temporary hit points can put somebody over their own max
    // on a sheet the DM typed by hand.
    expect(hpFraction(80, 52)).toBe(1);
  });
});

describe("coin", () => {
  it("names the piles that are held and invents no zeroes", () => {
    expect(coins({ gp: 84, cp: 0 })).toEqual([
      { label: "gp", amount: 84 },
      { label: "cp", amount: 0 },
    ]);
    expect(coins({})).toEqual([]);
  });
});

describe("which sections the document can fill", () => {
  const only = (part: Partial<CharacterSheet>): CharacterSheet => ({
    ...emptyCharacterSheet,
    ...part,
  });

  /**
   * The state every character written through `CharacterDialog` is in: three
   * required keys, all empty. Seven sections over that would say the data
   * exists and is blank, when what is true is that nobody has written it.
   */
  it("draws no section at all for a sheet nobody has written", () => {
    expect(sheetSections(emptyCharacterSheet)).toEqual({
      abilities: false,
      actions: false,
      magic: false,
      features: false,
      gear: false,
      story: false,
      log: false,
      empty: true,
    });
    expect(drawnSections(emptyCharacterSheet)).toEqual([]);
  });

  it("opens a section as soon as one key under it is filled", () => {
    expect(sheetSections(only({ skills: [{ name: "Athletics" }] })).abilities).toBe(true);
    expect(sheetSections(only({ proficiencies: ["Orcish"] })).abilities).toBe(true);
    expect(sheetSections(only({ attacks: [{ name: "Halberd", text: "" }] })).actions).toBe(true);
    // Spellcasting with nothing but a save DC is still spellcasting.
    expect(sheetSections(only({ spellcasting: { save: "14" } })).magic).toBe(true);
    // The continuous sheet gives features their own section, where the tabbed
    // one folded them under Stats.
    expect(sheetSections(only({ traits: [{ name: "Extra Attack", text: "" }] })).features).toBe(
      true,
    );
    expect(sheetSections(only({ currency: { gp: 3 } })).gear).toBe(true);
    expect(sheetSections(only({ story: { bond: "The road marker." } })).story).toBe(true);
    expect(sheetSections(only({ notes: "A temple foundling." })).story).toBe(true);
    expect(sheetSections(only({ levelUps: [{ level: 5 }] })).log).toBe(true);
  });

  /**
   * **Which sections carry an affordance rather than a value**, and the line
   * between them is *is there a write behind it*. Abilities crossed that line
   * with the abilities and skills editors; Actions, Spellcasting, Features and
   * Level ups have not, because nothing on the sheet writes an attack, a spell
   * slot, a feature or a level-up — which is what keeps the flag meaning
   * something rather than being `true` spelled twice.
   */
  it("draws the three a player can start from, on a sheet nobody has written", () => {
    expect(sheetSections(emptyCharacterSheet, true)).toEqual({
      abilities: true,
      actions: false,
      magic: false,
      features: false,
      gear: true,
      story: true,
      log: false,
      empty: false,
    });
    expect(drawnSections(emptyCharacterSheet, true).map((section) => section.id)).toEqual([
      "abilities",
      "gear",
      "story",
    ]);
  });

  it("counts an empty spellcasting block and blank prose as nothing", () => {
    expect(sheetSections(only({ spellcasting: {} })).magic).toBe(false);
    expect(sheetSections(only({ notes: "   " })).story).toBe(false);
    expect(sheetSections(only({ currency: {} })).gear).toBe(false);
  });

  /**
   * The spine lists the drawn sections **in the delivery's order**, whatever
   * order the document's keys happen to be in — so a sheet with a log and no
   * attacks still reads abilities, then gear, then story, then the log.
   */
  it("lists the drawn sections in the drawn order", () => {
    const sheet = only({ levelUps: [{ level: 5 }], attacks: [{ name: "Halberd", text: "" }] });
    expect(drawnSections(sheet, true).map((section) => section.id)).toEqual([
      "abilities",
      "actions",
      "gear",
      "story",
      "log",
    ]);
    expect(SHEET_SECTIONS.map((section) => section.id)).toEqual([
      "abilities",
      "actions",
      "magic",
      "features",
      "gear",
      "story",
      "log",
    ]);
  });
});

describe("which section is in view", () => {
  const tops = [
    { id: "abilities", top: 0 },
    { id: "gear", top: 400 },
    { id: "story", top: 900 },
  ] as const;

  it("names the last section whose top has passed the reading line", () => {
    expect(sectionInView(tops, 0, 60, false)).toBe("abilities");
    expect(sectionInView(tops, 300, 60, false)).toBe("abilities");
    // The slack lights a section just before its top reaches the edge.
    expect(sectionInView(tops, 350, 60, false)).toBe("gear");
    expect(sectionInView(tops, 880, 60, false)).toBe("story");
  });

  /**
   * A short last section never reaches the reading line on its own, so the
   * bottom of the sheet hands it the marker rather than leaving the section
   * above it lit for ever.
   */
  it("gives the last section the marker at the bottom of the sheet", () => {
    expect(sectionInView(tops, 700, 60, true)).toBe("story");
  });

  it("has nothing to say about a sheet with no sections", () => {
    expect(sectionInView([], 0, 60, false)).toBeUndefined();
  });
});

describe("the roster's own line", () => {
  /**
   * The tables are counted over **seats** now — one shared character can sit
   * at several, and a character between tables sits at none, which is a real
   * state a retired seat leaves behind.
   */
  const at = (...campaignIds: ReadonlyArray<string>) =>
    ({ seats: campaignIds.map((campaignId) => ({ campaignId })) }) as never;

  it("names the reader, then counts characters and the tables they are seated at", () => {
    expect(rosterSummary([at("a"), at("b")], 2, "Ilse Vantar")).toBe(
      "Ilse Vantar · 2 characters, at 2 tables.",
    );
    expect(rosterSummary([at("a"), at("a")], 3, "Ilse Vantar")).toBe(
      "Ilse Vantar · 2 characters, at 1 table.",
    );
    // One character seated at two tables: the continuity decision on one line.
    expect(rosterSummary([at("a", "b")], 2, "Ilse Vantar")).toBe(
      "Ilse Vantar · 1 character, at 2 tables.",
    );
    // Characters outlive their tables — every seat retired, the rows remain.
    expect(rosterSummary([at(), at()], 2, "Ilse Vantar")).toBe(
      "Ilse Vantar · 2 characters, none seated at a table.",
    );
  });

  /**
   * The name is the real one or it is the provisioning default — never a blank
   * and never invented here. `DEFAULT_ACCOUNT_NAME` is what an account is called
   * before the identity provider has offered a name, and it renders as itself.
   */
  it("renders whatever the account is called, including the default", () => {
    expect(rosterSummary([at("a")], 1, "Someone")).toBe("Someone · 1 character, at 1 table.");
  });

  /**
   * The two silences an empty roster can be, told apart by the memberships —
   * which is what stops the empty state being a friendlier lie than the truth.
   */
  it("says which kind of empty it is", () => {
    expect(rosterSummary([], 0, "Ilse Vantar")).toBe("Ilse Vantar · not at a table yet.");
    expect(rosterSummary([], 2, "Ilse Vantar")).toBe(
      "Ilse Vantar · no characters yet, at 2 tables.",
    );
  });
});
