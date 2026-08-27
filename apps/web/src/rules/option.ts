import type { AbilityKey, CharacterOption } from "@taverns/api";
import { increasesLine } from "@taverns/api";

/**
 * The pure half of the Rules screen — **what a row says about itself.**
 *
 * Its own file, and separately tested, for the reason `chronicle/fight.ts` and
 * `characters/sheet.ts` are: everything decided here is wrong *silently*. A hit
 * die read off the wrong half of a document is still a number, an unarmoured
 * formula missing a modifier is still a formula, and a row wrongly judged the
 * bundle's still draws — just without the *Edit* its owner needed.
 */

/**
 * `"10 + DEX + CON"`, or `"10"` when nothing is ticked.
 *
 * A list rather than a boolean is `Ruleset.ts`'s decision and this is what it
 * renders: **Barbarian** is `10 + DEX + CON` and **Monk** is `10 + DEX + WIS`,
 * so a formula that assumed `10 + DEX` would be quietly wrong for exactly the
 * two players most likely to notice — and a homebrew class is more likely to be
 * unusual here rather than less.
 */
export const unarmouredLine = (abilities: ReadonlyArray<AbilityKey>): string =>
  ["10", ...abilities].join(" + ");

/**
 * The numbers a row carries, in one line.
 *
 * It renders what the document holds and stops there. **Working out what a
 * level-1 character would come out on is `seedFor`'s job**, and it is called
 * exactly once — when a character is made. A preview here would be the second
 * implementation the *seed, never recompute* decision exists to prevent, and it
 * would be the copy that drifts.
 */
export const numbersOf = (option: CharacterOption): string => {
  switch (option.kind) {
    case "class":
      return `d${String(option.body.hitDie)} · unarmoured ${unarmouredLine(option.body.unarmouredAc)}`;
    case "species": {
      // Nine of the ten bundled species move nothing, and saying so is better
      // than drawing `+0` — the same call `PartyList` makes about an absent
      // stat.
      const perLevel = option.body.hpPerLevel;
      return perLevel === 0
        ? "No extra hit points"
        : `+${String(perLevel)} hit point${perLevel === 1 ? "" : "s"} per level`;
    }
    case "background": {
      /**
       * **All sixteen bundled backgrounds land here**, because the bundle
       * ships names and no grants — the bundle-licensing decision, argued in
       * `systemOptions.ts`. So this sentence is the commonest thing this
       * screen says about a background, and it is written to invite the edit
       * rather than to read as a fact about the ruleset: *nobody has said*,
       * not *this background gives nothing*.
       */
      const line = increasesLine(option.body.abilityIncreases);
      return line === "" ? "No ability score increases written down" : line;
    }
  }
};

/**
 * Whether this row is the campaign's own copy — the only kind a DM may edit.
 *
 * **Ownership, and never `origin`.** `bestiary/provenance.ts` had to pull those
 * two apart when the Library landed, and the same rule applies here from the
 * start: `origin` says where content came from, the two id columns say who may
 * write it. An *imported* copy is `imported` and still the campaign's, so a
 * screen that asked `origin === "authored"` would lock a row its owner needed
 * to edit and would look perfectly ordinary doing it.
 *
 * There are only two positions in this list — the bundle and a campaign copy —
 * because a Library original is never in a campaign's answer. That is the
 * model, not a filter this screen applies.
 *
 * It is also what the background makes most visible: a bundled background
 * grants nothing and cannot be edited here, so a table that wants one that
 * moves a number writes its own and edits *that*.
 */
export const isCampaignCopy = (option: CharacterOption): boolean => option.campaignId !== null;
