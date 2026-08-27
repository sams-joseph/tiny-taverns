import type { CharacterOption } from "@taverns/api";
import { AccountId, CampaignId } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { isCampaignCopy, numbersOf, unarmouredLine } from "./option";

/**
 * The pure half of the Rules screen.
 *
 * Its own file for the reason `chronicle/fight.ts`'s is: **every branch here
 * renders plausible output when it is wrong.** A hit die read off a species
 * document is `undefined` in a sentence that otherwise reads fine; a bundled
 * row judged the campaign's draws an *Edit* that 404s; an unarmoured formula
 * that dropped a modifier is still a formula.
 */

const aCampaign = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
const anAccount = Schema.decodeSync(AccountId)("2b1f2a1e-0000-4000-8000-0000000000a1");

const option = (
  part: Partial<CharacterOption> & { kind: "class" | "species" | "background" },
): CharacterOption =>
  ({
    id: "option",
    campaignId: null,
    accountId: null,
    derivedFrom: null,
    name: "Something",
    visibility: "shared",
    origin: "system",
    assistantTurnId: null,
    ...part,
  }) as unknown as CharacterOption;

describe("the unarmoured formula", () => {
  it("names every modifier the class adds, in the order it was given", () => {
    // The two exceptions the list exists for. A boolean would render one of
    // these as the other, and it would be right for ten of the twelve.
    expect(unarmouredLine(["DEX"])).toBe("10 + DEX");
    expect(unarmouredLine(["DEX", "CON"])).toBe("10 + DEX + CON");
    expect(unarmouredLine(["DEX", "WIS"])).toBe("10 + DEX + WIS");
  });

  it("is a bare 10 when a class adds nothing at all", () => {
    // Legal, and a homebrew class may genuinely want it. `"10 + "` would be the
    // shape a naive join produces.
    expect(unarmouredLine([])).toBe("10");
  });
});

describe("what a row's numbers say", () => {
  it("reads a class's die and its formula", () => {
    expect(
      numbersOf(option({ kind: "class", body: { hitDie: 10, unarmouredAc: ["DEX", "CON"] } })),
    ).toBe("d10 · unarmoured 10 + DEX + CON");
  });

  it("says a species moves nothing rather than drawing a zero", () => {
    // Nine of the ten bundled species, so this is the common case rather than
    // the edge one — and `+0 hit points per level` reads as a rule somebody
    // wrote rather than as the absence it is.
    expect(numbersOf(option({ kind: "species", body: { hpPerLevel: 0 } }))).toBe(
      "No extra hit points",
    );
  });

  it("gets the singular right for the one species in the book that moves it", () => {
    expect(numbersOf(option({ kind: "species", body: { hpPerLevel: 1 } }))).toBe(
      "+1 hit point per level",
    );
    expect(numbersOf(option({ kind: "species", body: { hpPerLevel: 2 } }))).toBe(
      "+2 hit points per level",
    );
  });

  it("reads a background's grant, pre-signed and in one line", () => {
    expect(
      numbersOf(
        option({
          kind: "background",
          body: {
            abilityIncreases: [
              { ability: "CON", amount: 2 },
              { ability: "WIS", amount: 1 },
            ],
          },
        }),
      ),
    ).toBe("+2 CON, +1 WIS");
  });

  it("says nobody has written one rather than that a background grants nothing", () => {
    // **All sixteen bundled backgrounds land here**, so it is the commonest
    // thing this screen says about one — the bundle ships names and no grants
    // by the bundle-licensing decision. The wording is the invitation to write
    // your own rather than a claim about the ruleset, which is the difference
    // between an absence and a fact.
    expect(numbersOf(option({ kind: "background", body: { abilityIncreases: [] } }))).toBe(
      "No ability score increases written down",
    );
  });
});

describe("which rows this table may edit", () => {
  it("is ownership, and never provenance", () => {
    // **The mistake this exists to prevent.** `origin` says where content came
    // from and never who may write it, so an *imported* copy is `imported` and
    // still the campaign's. A screen that asked `origin === "authored"` would
    // lock a row its owner needed to edit and would look ordinary doing it.
    const bundled = option({
      kind: "class",
      origin: "system",
      body: { hitDie: 8, unarmouredAc: [] },
    });
    const copy = option({
      kind: "class",
      campaignId: aCampaign,
      origin: "imported",
      body: { hitDie: 8, unarmouredAc: [] },
    });

    expect(isCampaignCopy(bundled)).toBe(false);
    expect(isCampaignCopy(copy)).toBe(true);
  });

  it("says no to a Library original, which is never in this list anyway", () => {
    // Belt and braces: the campaign's read cannot return one, so this is about
    // the function rather than about the screen — and the day something puts an
    // original in front of this card, an *Edit* pointing at
    // `options.update` would be a 404.
    const original = option({
      kind: "species",
      accountId: anAccount,
      origin: "authored",
      body: { hpPerLevel: 1 },
    });
    expect(isCampaignCopy(original)).toBe(false);
  });
});
