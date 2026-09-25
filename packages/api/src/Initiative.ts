import type { Ability } from "./Creature.js";

/**
 * The bonuses a combatant row can hold, and the database's check on
 * `combatant.initiative_bonus`. A document that claims more is not believed.
 */
export const MIN_INITIATIVE_BONUS = -20;
export const MAX_INITIATIVE_BONUS = 30;

const believable = (bonus: number | undefined): number | undefined =>
  bonus === undefined || bonus < MIN_INITIATIVE_BONUS || bonus > MAX_INITIATIVE_BONUS
    ? undefined
    : bonus;

/**
 * What a combatant adds to a d20 for initiative, read off the document it was
 * seeded from. Used by the server when it seeds a fight, and by any client
 * that rolls for somebody, so the two cannot disagree.
 *
 * `"+3"` → 3, `"-1"` → -1, `"2"` → 2. Anything else (`"+3 (Alert)"`, a blank,
 * a word) is not a number to add, and the answer is absent rather than a
 * guess.
 */
export const signedModifier = (text: string | undefined): number | undefined => {
  // U+2212 is the minus a typeset sheet writes; it means the same thing.
  const trimmed = text?.trim().replace(/^−/, "-");
  if (trimmed === undefined || !/^[+-]?\d{1,2}$/.test(trimmed)) return undefined;
  return Number(trimmed);
};

const dexModifier = (abilities: ReadonlyArray<Ability>): number | undefined =>
  signedModifier(
    abilities.find((ability) => ability.label.trim().toUpperCase() === "DEX")?.modifier,
  );

/**
 * A character's initiative bonus: what the sheet wrote, else its Dexterity
 * modifier, which is what 2014 initiative is when nothing adds to it.
 *
 * A written value wins because it is the sheet's own claim (an Alert feat, a
 * Jack of All Trades). One that is written and is not a number is still the
 * sheet's claim, so it does not fall back to Dexterity: the bonus is absent,
 * and the DM types the total. The web's identity pill draws the same written
 * value verbatim (`characters/sheet.ts`, `initiativeOf`).
 */
export const initiativeBonusOf = (sheet: {
  readonly abilities: ReadonlyArray<Ability>;
  readonly identity?: { readonly initiative?: string | undefined } | undefined;
}): number | undefined => {
  const written = sheet.identity?.initiative?.trim();
  if (written !== undefined && written !== "") return believable(signedModifier(written));
  return believable(dexModifier(sheet.abilities));
};

/** A stat block's initiative bonus: its Dexterity modifier, the SRD rule for monsters. */
export const statBlockInitiativeBonus = (block: {
  readonly abilities: ReadonlyArray<Ability>;
}): number | undefined => believable(dexModifier(block.abilities));
