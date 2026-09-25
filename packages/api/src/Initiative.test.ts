import { describe, expect, it } from "vitest";
import { initiativeBonusOf, signedModifier, statBlockInitiativeBonus } from "./Initiative.js";

const cells = (dex: string) => [
  { label: "STR", score: "10", modifier: "+0" },
  { label: "dex ", score: "14", modifier: dex },
];

describe("the initiative bonus", () => {
  it("reads a signed or bare whole number, and nothing else", () => {
    expect(signedModifier("+3")).toBe(3);
    expect(signedModifier(" -1 ")).toBe(-1);
    expect(signedModifier("−2")).toBe(-2);
    expect(signedModifier("2")).toBe(2);
    expect(signedModifier("+3 (Alert)")).toBeUndefined();
    expect(signedModifier("")).toBeUndefined();
    expect(signedModifier(undefined)).toBeUndefined();
  });

  it("takes a sheet's written initiative, else its DEX, and never falls back past what was written", () => {
    expect(initiativeBonusOf({ abilities: cells("+2"), identity: { initiative: "+7" } })).toBe(7);
    expect(initiativeBonusOf({ abilities: cells("+2") })).toBe(2);
    expect(initiativeBonusOf({ abilities: cells("+2"), identity: { initiative: " " } })).toBe(2);
    expect(
      initiativeBonusOf({ abilities: cells("+2"), identity: { initiative: "+7 with Alert" } }),
    ).toBeUndefined();
    expect(initiativeBonusOf({ abilities: [] })).toBeUndefined();
  });

  it("takes a stat block's DEX, and believes no number a row cannot hold", () => {
    expect(statBlockInitiativeBonus({ abilities: cells("+4") })).toBe(4);
    expect(statBlockInitiativeBonus({ abilities: cells("+45") })).toBeUndefined();
    expect(statBlockInitiativeBonus({ abilities: [] })).toBeUndefined();
  });
});
