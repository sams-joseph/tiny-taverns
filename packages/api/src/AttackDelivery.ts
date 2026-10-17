import { Schema } from "effect";
import { AREA_FEET, type BoardArea, type BoardSquare } from "./BattleMap.js";
import type { ActionArea } from "./Creature.js";
import type { SpellArea } from "./Spell.js";
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
 * A spell row's range: `"60 feet"`, `"1 mile"`, `"Touch"` (5 feet, the reach
 * of a touch), `"Self"` (the caster, or an area from it). `"Sight"`,
 * `"Unlimited"` and `"Special"` are no distance a board measures.
 */
export const spellRangeOf = (label: string): number | "self" | undefined => {
  const trimmed = label.trim().toLowerCase();
  if (trimmed.startsWith("self")) return "self";
  if (trimmed === "touch") return 5;
  const feet = /^(\d+)\s*(?:feet|foot|ft\.?)$/.exec(trimmed);
  if (feet !== null) return Number(feet[1]);
  const miles = /^(\d+)\s*miles?$/.exec(trimmed);
  return miles === null ? undefined : Number(miles[1]) * 5280;
};

/**
 * A spell row's area as an action's: a cylinder is drawn as the sphere it
 * covers on a flat board, and an area from a `"Self"` range starts at the
 * caster (a cone, a line, a burst), any other at a point it picks. One rule
 * for a monster's casting (`npcTurnOptions`) and a character's spell line
 * (`spellActionFor`).
 */
export const spellAreaOf = (area: SpellArea | undefined, self: boolean): ActionArea | undefined => {
  if (area === undefined) return undefined;
  const shape =
    area.type === "cylinder"
      ? "sphere"
      : (["sphere", "cone", "line", "cube"] as const).find((s) => s === area.type);
  return shape === undefined
    ? undefined
    : { shape, feet: area.size, origin: self ? "self" : "point" };
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

/**
 * A stat block's area where it was put, as the board's template: a sphere or a
 * cube about `origin`, a cone or a line from `origin` toward `toward`. Nothing
 * for a size the board's template cannot hold (`AREA_FEET`), or a cone or a
 * line with nowhere to point.
 */
export const boardAreaOf = (
  area: Pick<ActionArea, "shape" | "feet">,
  placement: { readonly origin: BoardSquare; readonly toward: BoardSquare },
): BoardArea | undefined => {
  if (area.feet < AREA_FEET.minimum || area.feet > AREA_FEET.maximum) return undefined;
  if (area.shape === "sphere" || area.shape === "cube") {
    return { shape: area.shape, feet: area.feet, origin: placement.origin };
  }
  const { origin, toward } = placement;
  if (origin.column === toward.column && origin.row === toward.row) return undefined;
  return { shape: area.shape, feet: area.feet, origin, toward };
};
