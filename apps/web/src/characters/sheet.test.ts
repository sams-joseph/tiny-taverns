import type { CharacterSheet } from "@taverns/api";
import { emptyCharacterSheet } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { coins, hitPoints, hpFraction, initialsOf, rosterSummary, sheetTabs } from "./sheet";

/**
 * The decisions that are wrong silently.
 *
 * A tab drawn empty, a hit point invented out of a null, a plate showing three
 * letters — none of them throws, and all three read as fine on a screenshot.
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

describe("which tabs the document can fill", () => {
  /**
   * The state every character written through `CharacterDialog` is in: three
   * required keys, all empty. Five tabs over that would say the data exists and
   * is blank, when what is true is that nobody has written it.
   */
  it("draws no tab at all for a sheet nobody has written", () => {
    expect(sheetTabs(emptyCharacterSheet)).toEqual({
      stats: false,
      actions: false,
      gear: false,
      story: false,
      log: false,
      empty: true,
    });
  });

  it("opens a tab as soon as one key under it is filled", () => {
    const only = (part: Partial<CharacterSheet>): CharacterSheet => ({
      ...emptyCharacterSheet,
      ...part,
    });

    expect(sheetTabs(only({ skills: [{ name: "Athletics" }] })).stats).toBe(true);
    expect(sheetTabs(only({ attacks: [{ name: "Halberd", text: "" }] })).actions).toBe(true);
    // Spellcasting with nothing but a save DC is still spellcasting.
    expect(sheetTabs(only({ spellcasting: { save: "14" } })).actions).toBe(true);
    expect(sheetTabs(only({ currency: { gp: 3 } })).gear).toBe(true);
    expect(sheetTabs(only({ story: { bond: "The road marker." } })).story).toBe(true);
    expect(sheetTabs(only({ notes: "A temple foundling." })).story).toBe(true);
    expect(sheetTabs(only({ levelUps: [{ level: 5 }] })).log).toBe(true);
  });

  it("counts an empty spellcasting block and blank prose as nothing", () => {
    expect(sheetTabs({ ...emptyCharacterSheet, spellcasting: {} }).actions).toBe(false);
    expect(sheetTabs({ ...emptyCharacterSheet, notes: "   " }).story).toBe(false);
    expect(sheetTabs({ ...emptyCharacterSheet, currency: {} }).gear).toBe(false);
  });
});

describe("the roster's own line", () => {
  const at = (campaignId: string) => ({ campaignId }) as never;

  it("names the reader, then counts characters and the tables they are at", () => {
    expect(rosterSummary([at("a"), at("b")], 2, "Ilse Vantar")).toBe(
      "Ilse Vantar · 2 characters, at 2 tables.",
    );
    expect(rosterSummary([at("a"), at("a")], 3, "Ilse Vantar")).toBe(
      "Ilse Vantar · 2 characters, at 1 table.",
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
