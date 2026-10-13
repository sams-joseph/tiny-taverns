import type { Ability } from "./Creature.js";
import type { AbilityKey } from "./Ruleset.js";

/**
 * **A saving throw, as both sides make one**: what a creature adds to it, read
 * off its stat block or sheet, and what a save-for-damage comes to once the
 * total is known. The runner rolls a monster's save with these in the browser;
 * the server rolls a monster target's save in a Hob-run turn with them, and
 * resolves a party member's from the total the DM enters.
 */

const ABILITY_NAMES: Readonly<Record<string, AbilityKey>> = {
  str: "STR",
  strength: "STR",
  dex: "DEX",
  dexterity: "DEX",
  con: "CON",
  constitution: "CON",
  int: "INT",
  intelligence: "INT",
  wis: "WIS",
  wisdom: "WIS",
  cha: "CHA",
  charisma: "CHA",
};

/** `"DEX"`, `"Dexterity"`, `"dex"` → `DEX`; anything else is no ability. */
export const abilityKeyOf = (name: string): AbilityKey | undefined =>
  ABILITY_NAMES[name.trim().toLowerCase()];

/** `"+3"`, `"-1"`, `"2"` → the number; anything else is absent. */
const signedNumber = (text: string | undefined): number | undefined => {
  const trimmed = text?.trim().replace(/^\+/, "").replace(/^−/, "-");
  return trimmed !== undefined && /^-?\d+$/.test(trimmed) ? Number(trimmed) : undefined;
};

/** The cell of a stat block's or a sheet's abilities for one ability, by its label. */
export const abilityCell = (
  document: { readonly abilities: ReadonlyArray<Ability> },
  ability: string,
): Ability | undefined =>
  document.abilities.find((cell) => cell.label.trim().toUpperCase() === ability.toUpperCase());

/**
 * A saving throw with this ability: the save written on the sheet, else the
 * modifier. A stat block's ability cells are the sheet's shape (`Ability`), so
 * a creature's is read the same way. Absent when neither is a number.
 */
export const saveModifier = (
  document: { readonly abilities: ReadonlyArray<Ability> },
  ability: AbilityKey,
): number | undefined => {
  const cell = abilityCell(document, ability);
  return signedNumber(cell?.save) ?? signedNumber(cell?.modifier);
};

/**
 * What a save against damage lets through: all of it on a failure; on a
 * success half (rounded down, as the SRD rounds) when the source says `half`,
 * none when it says `none`, and — for any word this does not know — all of it,
 * with `judged` set so the caller says the DM has to rule.
 */
export const damageAfterSave = (
  amount: number,
  succeeded: boolean,
  onSuccess: string,
): { readonly amount: number; readonly judged: boolean } => {
  if (!succeeded) return { amount, judged: false };
  const word = onSuccess.trim().toLowerCase();
  if (word === "half") return { amount: Math.floor(amount / 2), judged: false };
  if (word === "none") return { amount: 0, judged: false };
  return { amount, judged: true };
};
