import type { CharacterSheet, InventoryItem, SheetAction } from "./Character.js";
import type { KitEquipment } from "./CharacterOption.js";
import type { Equipment } from "./Equipment.js";
import type { EquipmentId } from "./Ids.js";
import { weaponAttack } from "./SheetGrants.js";

/**
 * Gear after creation — the one place a line picked from the equipment
 * catalogue becomes a sheet line and, for a weapon, an attack.
 *
 * ### Why it lives here, beside `SheetGrants.ts`
 *
 * `sheetGrantsFor` writes a fresh sheet's weapon attacks from the starting kit
 * through `weaponAttack`, the product's one implementation of the 2014 rule
 * (DEX for ranged, the better of STR and DEX for Finesse, STR otherwise; the
 * proficiency bonus when the character is proficient with the weapon or its
 * category). A weapon a player picks onto the sheet a month later has to
 * derive its line through **that same function** — the captain's report was
 * that gear "doesn't appear to be connected to the actual equipment we have
 * in the database", and a second attack rule written for the Gear dialog
 * would be the same disconnection one step over. So this module lifts the
 * derivation rather than copying it: `weaponAttack` is exported for exactly
 * this caller and no other.
 *
 * ### What it reads off the sheet, and what it does not invent
 *
 * The kit derivation at creation had the class option in hand; a sheet edit
 * does not, so the three inputs the rule needs are read off the document the
 * corpus already wrote:
 *
 * - **the six cells** — `sheet.abilities`, the same cells the kit read;
 * - **the proficiency bonus** — `sheet.identity.proficiency` (`"+2"`), which
 *   `identityGrants` wrote from the class table; absent, the attack is at the
 *   bare modifier, the same degrade a homebrew class with no progression rows
 *   already has;
 * - **the proficiency lines** — `sheet.proficiencies`, class, race and
 *   background grants in one list;
 * - **attacks per action** — read back off a derived weapon line the kit
 *   already wrote (`"… · Attack ×2"`), because *Extra Attack* is a class
 *   feature this module cannot see. A sheet with no weapon line yet gets one
 *   attack, which is right for every character below level 5.
 *
 * Nothing here recomputes a line that is already there: an existing derived
 * weapon attack is kept exactly as written, a newly linked weapon gets a line,
 * and a derived weapon line whose gear is gone is retired. A line the player
 * typed by hand (`derived` absent) is never touched.
 */

/** `Equipment` on the wire, as the kit-shaped row the attack rule reads. */
export const kitEquipmentOf = (row: Equipment): KitEquipment => ({
  id: row.id,
  index: row.sourceKey,
  name: row.name,
  weaponCategory: row.weaponCategory,
  weaponRange: row.weaponRange,
  categoryRange: row.categoryRange,
  armorCategory: row.armorCategory,
  damageDice: row.damageDice,
  damageType: row.damageTypeName,
  twoHandedDamageDice: row.twoHandedDamageDice,
  rangeNormal: row.rangeNormal,
  rangeLong: row.rangeLong,
  throwRangeNormal: row.throwRangeNormal,
  throwRangeLong: row.throwRangeLong,
  properties: row.propertyNames,
  weight: row.weight,
  gearCategoryIndex: row.gearCategoryIndex,
  toolCategory: row.toolCategory,
});

/** `3` → `"3 lb"`, `0.5` → `"1/2 lb"` — as `InventoryItem.weight` is written by hand. */
export const weightLabel = (weight: number): string => {
  if (weight === 0.5) return "1/2 lb";
  if (weight === 0.25) return "1/4 lb";
  return `${String(weight)} lb`;
};

/** A picked row as the line the Gear dialog writes: its name, its weight, its id. */
export const gearLineFor = (row: Equipment): InventoryItem => ({
  name: row.name,
  ...(row.weight === null || row.weight === 0 ? {} : { weight: weightLabel(row.weight) }),
  equipmentId: row.id,
});

/**
 * Names as typed — a drafted kit, *"Leather armour, Scimitar, Herbalism kit"*
 * — as lines, each linked to the one row called exactly that, case-insensitively,
 * and left as typed otherwise. `rows` is every candidate the caller could
 * reach under those names; a name with two candidates is an ambiguity and stays
 * free text, because a guess written into a link is worse than a name.
 */
export const gearLinesNamed = (
  names: ReadonlyArray<string>,
  rows: ReadonlyArray<Equipment>,
): ReadonlyArray<InventoryItem> => {
  const byName = new Map<string, Array<Equipment>>();
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  return names
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .map((name) => {
      const matches = byName.get(name.toLowerCase()) ?? [];
      return matches.length === 1 && matches[0] !== undefined ? gearLineFor(matches[0]) : { name };
    });
};

/** Every row the sheet's gear names — what the sheet reads back to draw the row's facts. */
export const linkedEquipmentIds = (sheet: CharacterSheet): ReadonlyArray<EquipmentId> => {
  const ids = new Set<EquipmentId>();
  for (const item of sheet.inventory ?? []) {
    if (item.equipmentId !== undefined && item.equipmentId !== null) ids.add(item.equipmentId);
  }
  return [...ids].sort();
};

/** `"+2"` on the identity card, as the number the attack rule adds. */
const proficiencyBonusOf = (sheet: CharacterSheet): number | undefined => {
  const raw = sheet.identity?.proficiency?.trim();
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw.replace(/^\+/, ""));
  return Number.isInteger(value) ? value : undefined;
};

/**
 * How many attacks one Attack action gives, read off a weapon line the corpus
 * already wrote — *Extra Attack* is a feature this module cannot see, and the
 * kit line's `"Attack ×2"` is the corpus's own statement of it.
 */
const attacksPerActionOf = (sheet: CharacterSheet): number => {
  let attacks = 1;
  for (const action of sheet.actions ?? []) {
    if (action.source !== "weapon" || action.derived !== true) continue;
    const match = /Attack ×(\d+)/.exec(action.text ?? "");
    if (match?.[1] !== undefined) attacks = Math.max(attacks, Number(match[1]));
  }
  return attacks;
};

const isDerivedWeapon = (action: SheetAction): boolean =>
  action.derived === true && action.source === "weapon";

/**
 * The sheet with its gear replaced, and the weapon attacks that follow from it.
 *
 * `rows` is every equipment row the caller could resolve — the ones just
 * picked, plus the ones the sheet's existing links name — keyed by id inside.
 * A linked line whose row is not in hand keeps whatever attack it already had
 * and gets no new one, which is the honest answer for a row out of reach.
 */
export const sheetWithGear = (
  sheet: CharacterSheet,
  inventory: ReadonlyArray<InventoryItem>,
  rows: ReadonlyArray<KitEquipment>,
): CharacterSheet => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const linked = (items: ReadonlyArray<InventoryItem>): Set<EquipmentId> => {
    const ids = new Set<EquipmentId>();
    for (const item of items) {
      if (item.equipmentId !== undefined && item.equipmentId !== null) ids.add(item.equipmentId);
    }
    return ids;
  };
  const before = linked(sheet.inventory ?? []);
  const carried = linked(inventory);
  const abilities = sheet.abilities;
  const proficiencyBonus = proficiencyBonusOf(sheet);
  const proficiencies = sheet.proficiencies ?? [];
  const attacksPerAction = attacksPerActionOf(sheet);

  // Retire the derived weapon lines whose gear left the pack **in this edit**
  // — linked before, not linked now. A derived line whose gear was never on
  // the list as a link (a row written before lines carried one) is left as
  // written, the way everything the player typed is.
  const kept = (sheet.actions ?? []).filter(
    (action) =>
      !isDerivedWeapon(action) ||
      action.equipmentId === undefined ||
      action.equipmentId === null ||
      carried.has(action.equipmentId) ||
      !before.has(action.equipmentId),
  );
  const alreadyDerived = new Set(
    kept.flatMap((action) =>
      isDerivedWeapon(action) && action.equipmentId !== undefined && action.equipmentId !== null
        ? [action.equipmentId]
        : [],
    ),
  );

  const added: Array<SheetAction> = [];
  for (const id of carried) {
    if (alreadyDerived.has(id)) continue;
    const row = byId.get(id);
    if (row === undefined) continue;
    const attack = weaponAttack(row, abilities, proficiencyBonus, proficiencies, attacksPerAction);
    if (attack === undefined) continue;
    alreadyDerived.add(id);
    added.push(attack);
  }

  const actions = [...kept, ...added];
  return {
    ...sheet,
    inventory,
    ...(actions.length === 0 && sheet.actions === undefined ? {} : { actions }),
  };
};
