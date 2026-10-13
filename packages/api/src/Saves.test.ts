import { describe, expect, it } from "vitest";
import { abilityKeyOf, damageAfterSave, saveModifier } from "./Saves.js";

const sheet = {
  abilities: [
    { label: "STR", score: "18", modifier: "+4", save: "+7" },
    { label: "CON", score: "13", modifier: "+1" },
    { label: "CHA", score: "8", modifier: "−1" },
  ],
};

describe("saves", () => {
  it("takes a save as written, else the ability's modifier", () => {
    expect(saveModifier(sheet, "STR")).toBe(7);
    expect(saveModifier(sheet, "CON")).toBe(1);
    expect(saveModifier(sheet, "CHA")).toBe(-1);
    expect(saveModifier(sheet, "WIS")).toBeUndefined();
  });

  it("names an ability however a stat block spells it", () => {
    expect(abilityKeyOf("DEX")).toBe("DEX");
    expect(abilityKeyOf(" Dexterity ")).toBe("DEX");
    expect(abilityKeyOf("Luck")).toBeUndefined();
  });

  it("lets all damage through a failure, half or none through a success, and flags a word it does not know", () => {
    expect(damageAfterSave(17, false, "half")).toEqual({ amount: 17, judged: false });
    expect(damageAfterSave(17, true, "half")).toEqual({ amount: 8, judged: false });
    expect(damageAfterSave(17, true, "none")).toEqual({ amount: 0, judged: false });
    expect(damageAfterSave(17, true, "other")).toEqual({ amount: 17, judged: true });
  });
});
