import type { Equipment, InventoryItem } from "@taverns/api";
import { weightLabel } from "@taverns/api";

/**
 * What a linked gear line says about its row — the pure half of the Gear
 * section, separately tested for the reason `chronicle/fight.ts` is: every
 * branch here renders plausible English, so picking the wrong column reads as
 * a working line.
 *
 * Two shapes for two places. The **compact** line sits under the item's name
 * and says the two or three things a player reaches for at the table — what
 * kind of thing it is, what a weapon rolls, what armour is worth — and the
 * **facts** are the full label/value grid the line expands to, in the
 * `DetailFacts` idiom every Library reader draws its numbers with. Both are
 * read off the row's promoted columns, never off the display document, so a
 * Library original a DM typed with only the columns filled says the same
 * things a bundled row does.
 */

export interface GearFact {
  readonly label: string;
  readonly value: string;
}

const costLine = (row: Equipment): string => `${String(row.costQuantity)} ${row.costUnit}`;

const kindLine = (row: Equipment): string => {
  if (row.categoryRange !== null) return row.categoryRange;
  // A shield is its own category in the 2014 rows, not "Shield armour".
  if (row.armorCategory === "Shield") return "Shield";
  if (row.armorCategory !== null) return `${row.armorCategory} armour`;
  if (row.toolCategory !== null) return row.toolCategory;
  if (row.vehicleCategory !== null) return row.vehicleCategory;
  return row.gearCategoryName ?? row.categoryName;
};

const damageLine = (row: Equipment): string | undefined => {
  if (row.damageDice === null) return undefined;
  const type = row.damageTypeName === null ? "" : ` ${row.damageTypeName.toLowerCase()}`;
  const versatile =
    row.twoHandedDamageDice === null ? "" : ` (${row.twoHandedDamageDice} two-handed)`;
  return `${row.damageDice}${type}${versatile}`;
};

const armourLine = (row: Equipment): string | undefined => {
  if (row.armorClassBase === null) return undefined;
  // A shield adds to the armour class rather than setting it.
  if (row.armorCategory === "Shield") return `+${String(row.armorClassBase)} AC`;
  const dex =
    row.armorClassDexBonus === true
      ? row.armorClassMaxBonus === null
        ? " + DEX"
        : ` + DEX (max ${String(row.armorClassMaxBonus)})`
      : "";
  return `AC ${String(row.armorClassBase)}${dex}`;
};

const rangeLine = (row: Equipment): string | undefined => {
  if (row.rangeNormal !== null && row.rangeLong !== null) {
    return `${String(row.rangeNormal)}/${String(row.rangeLong)} ft.`;
  }
  if (row.throwRangeNormal !== null && row.throwRangeLong !== null) {
    return `Thrown ${String(row.throwRangeNormal)}/${String(row.throwRangeLong)} ft.`;
  }
  // The one reach the 2014 rows state only as a property — the same reading
  // the kit's attack line makes of it.
  if (row.propertyNames.some((name) => name.toLowerCase() === "reach")) return "Reach 10 ft.";
  return undefined;
};

/** The line under the name: kind, then the one number the table asks for, then the cost. */
export const compactGearLine = (row: Equipment): string =>
  [kindLine(row), damageLine(row) ?? armourLine(row), costLine(row)]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" · ");

/** The expanded grid: everything the row's columns say, in a fixed order. */
export const gearFacts = (row: Equipment): ReadonlyArray<GearFact> => {
  const facts: Array<GearFact> = [{ label: "Category", value: kindLine(row) }];
  const damage = damageLine(row);
  if (damage !== undefined) facts.push({ label: "Damage", value: damage });
  const range = rangeLine(row);
  if (range !== undefined) facts.push({ label: "Range", value: range });
  const armour = armourLine(row);
  if (armour !== undefined) facts.push({ label: "Armour class", value: armour });
  if (row.strengthMinimum !== null && row.strengthMinimum > 0) {
    facts.push({ label: "Strength", value: `${String(row.strengthMinimum)} minimum` });
  }
  if (row.stealthDisadvantage === true) facts.push({ label: "Stealth", value: "Disadvantage" });
  if (row.propertyNames.length > 0) {
    facts.push({ label: "Properties", value: row.propertyNames.join(", ") });
  }
  facts.push({ label: "Cost", value: costLine(row) });
  if (row.weight !== null) facts.push({ label: "Weight", value: weightLabel(row.weight) });
  return facts;
};

/**
 * What the line shows as its weight: what was typed, and the row's when
 * nothing was — a kit line carries no weight text of its own, and the row is
 * the one place the number is known.
 */
export const gearWeight = (item: InventoryItem, row: Equipment | undefined): string | undefined => {
  if (item.weight !== undefined && item.weight !== "") return item.weight;
  if (row === undefined || row.weight === null) return undefined;
  return weightLabel(row.weight);
};
