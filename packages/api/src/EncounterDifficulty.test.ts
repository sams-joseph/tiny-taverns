import { describe, expect, it } from "vitest";
import {
  creatureXp,
  describeParty,
  encounterDifficulty,
  encounterMultiplier,
  partyThresholds,
} from "./EncounterDifficulty.js";

describe("partyThresholds", () => {
  it("is one character's row of the DMG table", () => {
    expect(partyThresholds([1])).toEqual({ easy: 25, medium: 50, hard: 75, deadly: 100 });
    expect(partyThresholds([5])).toEqual({ easy: 250, medium: 500, hard: 750, deadly: 1100 });
    expect(partyThresholds([20])).toEqual({ easy: 2800, medium: 5700, hard: 8500, deadly: 12700 });
  });

  it("sums a mixed party, level by level", () => {
    expect(partyThresholds([3, 5, 5, 7])).toEqual({
      easy: 75 + 250 + 250 + 350,
      medium: 150 + 500 + 500 + 750,
      hard: 225 + 750 + 750 + 1100,
      deadly: 400 + 1100 + 1100 + 1700,
    });
  });

  it("takes level 20's row past the table's end", () => {
    expect(partyThresholds([25])).toEqual(partyThresholds([20]));
  });
});

describe("encounterMultiplier", () => {
  it("follows the DMG's creature-count table for a party of three to five", () => {
    const table: ReadonlyArray<readonly [number, number]> = [
      [1, 1],
      [2, 1.5],
      [3, 2],
      [6, 2],
      [7, 2.5],
      [10, 2.5],
      [11, 3],
      [14, 3],
      [15, 4],
      [40, 4],
    ];
    for (const [creatures, multiplier] of table) {
      expect(encounterMultiplier(creatures, 4)).toBe(multiplier);
    }
  });

  it("steps up a row for a party under three, and down a row for six or more", () => {
    expect(encounterMultiplier(1, 2)).toBe(1.5);
    expect(encounterMultiplier(15, 1)).toBe(5);
    expect(encounterMultiplier(1, 6)).toBe(0.5);
    expect(encounterMultiplier(4, 7)).toBe(1.5);
  });
});

describe("creatureXp", () => {
  it("takes the stat block's own figure first", () => {
    expect(creatureXp({ cr: "0", statBlockXp: 0 })).toBe(0);
    expect(creatureXp({ cr: "5", statBlockXp: 2000 })).toBe(2000);
  });

  it("falls back to the XP table for the rating, fractions and decimals alike", () => {
    expect(creatureXp({ cr: "1/4", statBlockXp: null })).toBe(50);
    expect(creatureXp({ cr: "0.5", statBlockXp: null })).toBe(100);
    expect(creatureXp({ cr: " 30 ", statBlockXp: null })).toBe(155000);
  });

  it("is null for a rating the table does not know", () => {
    expect(creatureXp({ cr: "—", statBlockXp: null })).toBeNull();
    expect(creatureXp({ cr: "1/3", statBlockXp: null })).toBeNull();
  });
});

describe("encounterDifficulty", () => {
  it("rates the drawing's ambush for a party of four at level 5", () => {
    // A goblin boss, four archers and two worgs: 200 + 200 + 200 = 600 XP,
    // seven creatures ×2.5.
    const rated = encounterDifficulty(
      [
        { count: 1, xp: 200 },
        { count: 4, xp: 50 },
        { count: 2, xp: 100 },
      ],
      [5, 5, 5, 5],
    );
    expect(rated).toEqual({
      _tag: "rated",
      band: "Easy",
      xp: 600,
      adjustedXp: 1500,
      multiplier: 2.5,
      party: { size: 4, minLevel: 5, maxLevel: 5, unlevelled: 0 },
      thresholds: { easy: 1000, medium: 2000, hard: 3000, deadly: 4400 },
    });
  });

  it("puts each threshold at the bottom of its own band, and Trivial below Easy", () => {
    const band = (xp: number) => {
      const rated = encounterDifficulty([{ count: 1, xp }], [5, 5, 5, 5]);
      return rated._tag === "rated" ? rated.band : rated.reason;
    };
    expect(band(999)).toBe("Trivial");
    expect(band(1000)).toBe("Easy");
    expect(band(2000)).toBe("Medium");
    expect(band(3000)).toBe("Hard");
    expect(band(4400)).toBe("Deadly");
  });

  it("rates a mixed-level party against its summed thresholds", () => {
    const rated = encounterDifficulty([{ count: 2, xp: 450 }], [2, 4, 6]);
    // 900 XP ×1.5 = 1,350 against 50+125+300 / 100+250+600 / 150+375+900 / 200+500+1400.
    expect(rated).toMatchObject({
      _tag: "rated",
      band: "Medium",
      adjustedXp: 1350,
      party: { size: 3, minLevel: 2, maxLevel: 6, unlevelled: 0 },
      thresholds: { easy: 475, medium: 950, hard: 1425, deadly: 2100 },
    });
  });

  it("leaves characters without a level out of the party, and counts them", () => {
    const rated = encounterDifficulty([{ count: 1, xp: 200 }], [5, null, 5, null]);
    expect(rated).toMatchObject({
      _tag: "rated",
      multiplier: 1.5,
      party: { size: 2, minLevel: 5, maxLevel: 5, unlevelled: 2 },
    });
  });

  it("will not rate an empty roster, a creature with no XP, or a party with no levels", () => {
    expect(encounterDifficulty([], [5])).toEqual({ _tag: "unrated", reason: "no-creatures" });
    expect(
      encounterDifficulty(
        [
          { count: 1, xp: 200 },
          { count: 1, xp: null },
        ],
        [5],
      ),
    ).toEqual({ _tag: "unrated", reason: "missing-xp" });
    expect(encounterDifficulty([{ count: 1, xp: 200 }], [])).toEqual({
      _tag: "unrated",
      reason: "no-party",
    });
    expect(encounterDifficulty([{ count: 1, xp: 200 }], [null])).toEqual({
      _tag: "unrated",
      reason: "no-party",
    });
  });
});

describe("describeParty", () => {
  it("names one level or the range, and the characters left out", () => {
    expect(describeParty({ size: 4, minLevel: 5, maxLevel: 5, unlevelled: 0 })).toBe(
      "party of 4, lvl 5",
    );
    expect(describeParty({ size: 3, minLevel: 3, maxLevel: 5, unlevelled: 1 })).toBe(
      "party of 3, lvl 3–5 · 1 without a level",
    );
  });
});
