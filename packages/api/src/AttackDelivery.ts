import { Schema } from "effect";
import type { NpcAttack, NpcTarget } from "./NpcTurnOptions.js";

/**
 * **What an attack was**, as a roll keeps it: how it was delivered and what
 * kind of damage it does. The board draws an attack from these (an arrow, a
 * bolt of fire, a swing), so a roll that cannot say leaves them null rather
 * than guessing; the board then draws only the hit.
 *
 * One rule for both writers: the runner's strike in the browser and a kept Hob
 * turn on the server, each reading the same `NpcTurnOptions` option.
 */

/** The SRD's four attack rolls: melee or ranged, with a weapon or a spell. */
export const AttackDelivery = Schema.Literals([
  "melee-weapon",
  "ranged-weapon",
  "melee-spell",
  "ranged-spell",
]);
export type AttackDelivery = typeof AttackDelivery.Type;

/** The SRD's thirteen damage types, by their index. */
export const DamageType = Schema.Literals([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);
export type DamageType = typeof DamageType.Type;

const isDamageType = Schema.is(DamageType);

/**
 * A damage type as a line writes it (`"Fire"`, `"slashing"`, `" cold "`), or
 * nothing when it is not one of the thirteen: a typed-in `"fire and ice"` is
 * prose, and prose is not branched on.
 */
export const damageTypeOf = (written: string | null | undefined): DamageType | undefined => {
  const word = written?.trim().toLowerCase();
  return word !== undefined && isDamageType(word) ? word : undefined;
};

/** A spell's `attack_type` as the SRD writes it, `"ranged"` or `"melee"`; anything else, none. */
export const spellAttackOf = (written: string | undefined): "melee" | "ranged" | undefined => {
  const word = written?.trim().toLowerCase();
  return word === "melee" || word === "ranged" ? word : undefined;
};

/**
 * How an attack was delivered at a target standing in `band`.
 *
 * A spell says so itself (`NpcAttack.spell`). A weapon is melee when the
 * target is within its reach and ranged when it is within its range: a dagger
 * with both is thrown at a goblin across the room and stabbed into one beside
 * it. With no band (no board, or a target off it) the line's own geometry
 * answers when it has only one of the two; with both, or neither, nothing is
 * said.
 */
export const attackDelivery = (
  attack: Pick<NpcAttack, "reach" | "range" | "spell">,
  band: NpcTarget["band"] | undefined,
): AttackDelivery | undefined => {
  if (attack.spell !== undefined) return `${attack.spell}-spell`;
  if (band === "reach") return "melee-weapon";
  if (band === "normal" || band === "long") return "ranged-weapon";
  if (attack.reach !== undefined && attack.range === undefined) return "melee-weapon";
  if (attack.range !== undefined && attack.reach === undefined) return "ranged-weapon";
  return undefined;
};
