import { FEATURE_OVERLAY, RACIAL_TRAIT_OVERLAY, type OverlayContext } from "./ActionOverlay.js";
import type {
  InventoryItem,
  SheetAction,
  SheetBody,
  SheetFeature,
  SheetIdentity,
  SheetResource,
  Skill,
  Spellcasting,
} from "./Character.js";
import type { Ability, Trait } from "./Creature.js";
import type {
  BackgroundBody,
  BackgroundOption,
  CharacterOption,
  ClassOption,
  KitEquipment,
  KitLine,
  OptionClassLevel,
  OptionDetails,
  RaceOption,
  StartingKit,
} from "./CharacterOption.js";
import {
  isBackgroundOption,
  isClassOption,
  isRaceOption,
  subraceNamed,
} from "./CharacterOption.js";
import type { EquipmentId, FeatureId, RacialTraitId } from "./Ids.js";
import {
  type AbilityBonus,
  type AbilityKey,
  ABILITY_KEYS,
  type CharacterSeed,
  levelOf,
  modifierOf,
  seedFor,
  signed,
} from "./Ruleset.js";

/**
 * What the picked class, race, subrace and background put on a fresh sheet —
 * the one implementation of "the corpora drive the starting sheet".
 *
 * ### Why this lives in `@taverns/api`
 *
 * The same reason `seedFor` does: **both creation paths call it**, through
 * {@link startingSheetBody} — the manual form's `payloadFrom`
 * (`apps/web/src/characters/create.ts`) and Hob's `proposeCharacter` handler
 * (`apps/server/src/assistant/toolkit.ts`). The
 * two paths have diverged on exactly this material before — the manual form
 * once seeded from a bare 10 while Hob's draft carried the standard array —
 * and a second implementation of "which racial traits does a Hill Dwarf get"
 * would part company first at the thing nobody looks at. Background grants
 * used to be two private copies of four little helpers, one per composer;
 * they are this module now.
 *
 * ### What it reads, and what that means for a label that resolves to nothing
 *
 * Everything comes off the resolved `CharacterOption` values — the prose
 * `body` the DM can author, and the FK-backed `details` the 2014 importer
 * fills (`optionDetailsFor`). A free-text race, a homebrew class with no
 * progression rows, or an unresolved background each contribute exactly what
 * they carry and nothing invented: no traits, no proficiency bonus, no
 * features, no attacks, no slots. That is the same degradation an unmatched
 * label has always had on the seed arithmetic.
 *
 * ### The actions and the resources — since 2026-09-03
 *
 * The corpus supplies the ingredients for every weapon attack (the starting
 * kit's `equipment` rows, the proficiency lines, the six cells, the level's
 * proficiency bonus), for the spell slots and the casting numbers
 * (`class_level.body.spellcasting`, the class's `spellcastingAbility`) and for
 * the popular counters (`classSpecific`); what it never structures — the
 * economy and the recharge of a feature, and the limit of the prose-only ones
 * — comes from `ActionOverlay.ts`, a curated table keyed by the row's source
 * index. Everything written here is `derived: true`, which is what a later
 * level-up reads to know which lines are the corpus's to rewrite.
 *
 * ### What deliberately does not happen here
 *
 * - **No choices are made, except the kit's, and those are the caller's.** A
 *   `parent_feature_id` under a granted feature (*Fighting Style: Archery*) and
 *   a `rule_choice_group` are the player's to pick later; only the parent grant
 *   is written. The starting kit's *(a)/(b)* sides are picked through
 *   `kitChoices`; absent, side (a) is taken and a category line stays a line
 *   with no weapon behind it rather than a weapon nobody chose.
 * - **No saving-throw or skill *numbers* are derived without their sources.**
 *   `withSavingThrows` writes a save value only when both the modifier cell
 *   and the corpus-supplied proficiency bonus are in hand.
 * - **Feats are not consulted.** No 2014 SRD feat applies at level 1 (Grappler
 *   is an ASI-level choice with a prerequisite), so a fresh sheet has nothing
 *   to read from that corpus.
 * - **No known or prepared spell is chosen.** Slots and the casting numbers
 *   are data; which spells fill them is its own picker domain.
 */
export interface SheetGrantSources {
  readonly classOption?: ClassOption | undefined;
  readonly raceOption?: RaceOption | undefined;
  /** Already resolved through `subraceNamed`; the campaign's own spelling. */
  readonly subraceName?: string | undefined;
  /** The subclass label, as `identity.subclass` will hold it; see `levelGrantsFor`. */
  readonly subclass?: string | undefined;
  readonly backgroundOption?: BackgroundOption | undefined;
  /** The level the sheet is written for; `STARTING_LEVEL` when absent. */
  readonly level?: number | undefined;
  /** The six cells after the seed moved them — what a to-hit is read from. */
  readonly abilities?: ReadonlyArray<Ability> | undefined;
  /** One pick per `startingKit.choices` entry, in order; see `KitPick`. */
  readonly kitChoices?: ReadonlyArray<KitPick> | undefined;
  /**
   * The same, for the background's own `startingKit` — one pick per choice,
   * in order. A 2014 background's one choice is a category (*"any holy
   * symbol"*), so a pick here is which row was taken from it; absent, the
   * category stays a line with no row behind it, exactly as the class kit's.
   */
  readonly backgroundKitChoices?: ReadonlyArray<KitPick> | undefined;
}

/**
 * Which side of an *(a) … or (b) …* kit choice was taken, and — for a side
 * that says *"any martial weapon"* — which rows were picked from that
 * category, in the order the side's category lines appear. A category line
 * whose picks run out stays on the inventory as the category's name, with no
 * weapon attack behind it.
 */
export interface KitPick {
  readonly option: number;
  readonly picks: ReadonlyArray<EquipmentId>;
}

export interface SheetGrants {
  /** Class and subclass features to the level, then race/subrace traits, then the background feature. */
  readonly traits: ReadonlyArray<SheetFeature>;
  /** Armour, weapons, tools and languages — class, race and background grants, deduplicated. */
  readonly proficiencies: ReadonlyArray<string>;
  /** The class's proficient saving throws, as ability labels. */
  readonly savingThrows: ReadonlyArray<AbilityKey>;
  /** The proficiency bonus at this level, when the class has progression rows. */
  readonly proficiencyBonus?: number;
  /** The class's starting kit as picked, then the background's starting equipment. */
  readonly inventory: ReadonlyArray<InventoryItem>;
  /** The background's starting gold, when its source states one in gp. */
  readonly gold?: number;
  /** The race's walking speed, in feet. */
  readonly speed?: number;
  /** The class's hit die size — `10` for a d10. */
  readonly hitDie?: number;
  /** The level the grants were worked out for. */
  readonly level: number;
  /** Weapon attacks from the kit, and features with a cost or a roll. */
  readonly actions: ReadonlyArray<SheetAction>;
  /** Slots, hit dice, counted features, pools. */
  readonly resources: ReadonlyArray<SheetResource>;
  /** The casting aside, when the class casts at this level. */
  readonly spellcasting?: Spellcasting;
}

const wanted = (label: string | undefined): string => (label ?? "").trim().toLowerCase();

/** Grants scoped to a subrace apply only when that subrace was picked. */
const forSubrace = <Row extends { readonly subraceName: string | null }>(
  rows: ReadonlyArray<Row>,
  subraceName: string | undefined,
): ReadonlyArray<Row> =>
  rows.filter(
    (row) =>
      row.subraceName === null || wanted(row.subraceName ?? undefined) === wanted(subraceName),
  );

const dedupe = (names: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const kept: Array<string> = [];
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    kept.push(name.trim());
  }
  return kept;
};

const prose = (lines: ReadonlyArray<string>): string => lines.join("\n\n");

/**
 * The class's proficiency list minus the entries that are not proficiencies:
 * `"Saving Throw: STR"` is written as a mark on the ability cell instead
 * (`withSavingThrows`), and `"Choose two skills from …"` is an instruction —
 * the pick lands in `sheet.skills` when it is made, not in this list.
 */
const classProficiencies = (option: ClassOption | undefined): ReadonlyArray<string> =>
  (option?.body.proficiencies ?? []).filter(
    (line) => !/^saving throw:/i.test(line.trim()) && !/^choose /i.test(line.trim()),
  );

const raceDetailNames = (
  details: OptionDetails | undefined,
  subraceName: string | undefined,
): ReadonlyArray<string> =>
  details === undefined
    ? []
    : [
        ...forSubrace(details.proficiencies, subraceName).map((grant) => grant.proficiency.name),
        ...forSubrace(details.languages, subraceName).map((grant) => grant.language.name),
      ];

const raceTraits = (
  option: RaceOption | undefined,
  subraceName: string | undefined,
): ReadonlyArray<SheetFeature> =>
  option?.details === undefined
    ? []
    : forSubrace(option.details.traits, subraceName).map((grant) => ({
        name: grant.trait.name,
        text: prose(grant.trait.desc),
        racialTraitId: grant.trait.id,
        derived: true,
      }));

/** One class or subclass feature the level grants: level 1 with its paragraphs, higher up by name. */
interface GrantedFeature {
  readonly id: FeatureId;
  readonly index: string | null;
  readonly name: string;
  readonly desc: ReadonlyArray<string>;
}

/**
 * The class table's row for this level — or the highest row at or below it,
 * so a class whose table stops short still answers what it can.
 */
const levelRow = (option: ClassOption | undefined, level: number): OptionClassLevel | undefined => {
  const rows = option?.details?.classLevels ?? [];
  let best: OptionClassLevel | undefined;
  for (const row of rows) {
    if (row.level <= level && (best === undefined || row.level > best.level)) best = row;
  }
  return best;
};

/**
 * Every top-level feature the class grants at or below this level, then the
 * subclass's when `subclass` names one of the class's own. Level 1 comes off
 * `levelOneFeatures`, which carries the prose the Features section draws; the
 * higher levels and every subclass feature come off the projected tables by
 * name and id.
 */
const grantedFeatures = (
  option: ClassOption | undefined,
  subclass: string | undefined,
  level: number,
): ReadonlyArray<GrantedFeature> => {
  const levelOne = (option?.details?.levelOneFeatures ?? []).map((feature) => ({
    id: feature.id,
    index: feature.index,
    name: feature.name,
    desc: feature.desc,
  }));
  const higher = (option?.details?.classLevels ?? [])
    .filter((row) => row.level >= 2 && row.level <= level)
    .flatMap((row) =>
      row.features.map((feature) => ({
        id: feature.id,
        index: feature.index,
        name: feature.name,
        desc: [] as ReadonlyArray<string>,
      })),
    );
  const named = wanted(subclass);
  const subclassFeatures =
    named === ""
      ? []
      : (option?.details?.subclasses ?? [])
          .filter((row) => wanted(row.name) === named)
          .flatMap((row) => row.features)
          .filter((feature) => feature.level <= level)
          .map((feature) => ({
            id: feature.id,
            index: feature.index,
            name: feature.name,
            desc: [] as ReadonlyArray<string>,
          }));
  return [...levelOne, ...higher, ...subclassFeatures];
};

const featureTraits = (features: ReadonlyArray<GrantedFeature>): ReadonlyArray<SheetFeature> =>
  features.map((feature) => ({
    name: feature.name,
    text: prose(feature.desc),
    featureId: feature.id,
    derived: true,
  }));

const backgroundFeature = (body: BackgroundBody | undefined): ReadonlyArray<Trait> =>
  body?.feature === undefined ? [] : [{ name: body.feature.name, text: body.feature.text }];

const savingThrowsOf = (option: ClassOption | undefined): ReadonlyArray<AbilityKey> =>
  (option?.body.savingThrows ?? [])
    .map((line) => line.trim().toUpperCase())
    .filter((line): line is AbilityKey => (ABILITY_KEYS as ReadonlyArray<string>).includes(line));

const goldPieces = (body: BackgroundBody | undefined): number | undefined => {
  const match = body?.gold?.trim().match(/^(\d+)\s*gp$/i);
  if (match?.[1] === undefined) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
};

/** One pick per choice, side (a) throughout — what an absent `kitChoices` means. */
export const defaultKitPicks = (kit: StartingKit | undefined): ReadonlyArray<KitPick> =>
  (kit?.choices ?? []).map(() => ({ option: 0, picks: [] }));

/**
 * The kit as lines to carry, with the picks applied: the fixed lines, then for
 * each choice the picked side's lines, a category line replaced by the rows
 * picked from it (one line per pick) and left as itself when the picks ran
 * out. Pure over the option's own `details.equipment`, so a pick that names a
 * row outside the category resolves to nothing rather than to a weapon the
 * source never offered.
 */
export const kitLinesFor = (
  kit: StartingKit | undefined,
  equipment: ReadonlyArray<KitEquipment>,
  kitChoices: ReadonlyArray<KitPick> | undefined,
): ReadonlyArray<KitLine> => {
  if (kit === undefined) return [];
  const byId = new Map(equipment.map((row) => [row.id, row]));
  const lines: Array<KitLine> = [...kit.fixed];
  kit.choices.forEach((choice, index) => {
    const pick = kitChoices?.[index] ?? { option: 0, picks: [] };
    const side = choice.options[pick.option] ?? choice.options[0];
    if (side === undefined) return;
    const queue = [...pick.picks];
    for (const line of side.lines) {
      if (line.category === undefined) {
        lines.push(line);
        continue;
      }
      let left = line.quantity;
      while (left > 0 && queue.length > 0) {
        const row = byId.get(queue.shift()!);
        if (row === undefined || !inCategory(row, line.category.index)) continue;
        lines.push({ name: row.name, quantity: 1, equipmentId: row.id });
        left -= 1;
      }
      if (left > 0) lines.push({ ...line, quantity: left });
    }
  });
  return lines;
};

/**
 * Which rows a kit category names — the 2014 categories the class kits use,
 * spelled against the row's own columns. The same rule `optionDetailsFor`
 * uses to gather the members onto `details.equipment`; a category neither
 * knows resolves to nothing.
 */
export const inCategory = (row: KitEquipment, categoryIndex: string): boolean => {
  switch (categoryIndex) {
    case "martial-weapons":
      return row.weaponCategory === "Martial";
    case "simple-weapons":
      return row.weaponCategory === "Simple";
    case "martial-melee-weapons":
      return row.categoryRange === "Martial Melee";
    case "martial-ranged-weapons":
      return row.categoryRange === "Martial Ranged";
    case "simple-melee-weapons":
      return row.categoryRange === "Simple Melee";
    case "simple-ranged-weapons":
      return row.categoryRange === "Simple Ranged";
    case "musical-instruments":
      return row.toolCategory === "Musical Instrument";
    case "artisans-tools":
      return row.toolCategory === "Artisan's Tools";
    default:
      return row.gearCategoryIndex === categoryIndex;
  }
};

/** The kit's lines as the Gear section draws them. */
export const kitInventory = (lines: ReadonlyArray<KitLine>): ReadonlyArray<InventoryItem> =>
  lines.map((line) => ({
    name: line.name,
    ...(line.quantity > 1 ? { quantity: line.quantity } : {}),
    ...(line.equipmentId === undefined ? {} : { equipmentId: line.equipmentId }),
    ...(line.category === undefined ? {} : { note: "Your pick" }),
  }));

/** `"Crossbows, light"` and `"Crossbow, light"` and `"Light Crossbows"` are one weapon. */
const weaponWords = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((word) => word !== "")
    .map((word) => word.replace(/s$/, ""))
    .sort()
    .join(" ");

const proficientWith = (row: KitEquipment, lines: ReadonlyArray<string>): boolean => {
  const category =
    row.weaponCategory === null ? undefined : `${row.weaponCategory.toLowerCase()} weapons`;
  const name = weaponWords(row.name);
  return lines.some((line) => {
    const normalised = line.trim().toLowerCase();
    return normalised === category || weaponWords(line) === name;
  });
};

const has = (row: KitEquipment, property: string): boolean =>
  row.properties.some((name) => name.toLowerCase() === property);

const ordinal = (n: number): string =>
  `${String(n)}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

const feet = (normal: number | null, long: number | null): string =>
  long === null ? `${String(normal ?? 0)} ft.` : `${String(normal ?? 0)}/${String(long)} ft.`;

/**
 * One weapon's attack line, from the row and the character: the ability the
 * 2014 rules say to use (DEX for a ranged weapon, the better of STR and DEX
 * for Finesse, STR otherwise), the proficiency bonus when the character is
 * proficient with the weapon or its category, and the bonus written inside the
 * damage notation so a roll reads it whole.
 *
 * **Exported for `Gear.ts`, and that is the whole reason it is exported.** A
 * weapon picked onto the sheet after creation derives its line through this
 * same function (`sheetWithGear`), so there is one 2014 attack rule in the
 * product and not a second one that agrees until the day it does not.
 */
export const weaponAttack = (
  row: KitEquipment,
  abilities: ReadonlyArray<Ability>,
  proficiencyBonus: number | undefined,
  proficiencyLines: ReadonlyArray<string>,
  attacksPerAction: number,
): SheetAction | undefined => {
  if (row.damageDice === null) return undefined;
  const str = modifierOf(abilities, "STR");
  const dex = modifierOf(abilities, "DEX");
  const ranged = row.weaponRange === "Ranged";
  const modifier = ranged ? dex : has(row, "finesse") && dex > str ? dex : str;
  const proficient = proficientWith(row, proficiencyLines);
  const hit = modifier + (proficient ? (proficiencyBonus ?? 0) : 0);
  const range = ranged
    ? feet(row.rangeNormal, row.rangeLong)
    : has(row, "thrown")
      ? `Thrown ${feet(row.throwRangeNormal, row.throwRangeLong)}`
      : has(row, "reach")
        ? "Reach 10 ft."
        : undefined;
  const properties = row.properties.map((property) =>
    property.toLowerCase() === "versatile" && row.twoHandedDamageDice !== null
      ? `Versatile (${row.twoHandedDamageDice})`
      : property,
  );
  const text = [
    ...(row.categoryRange === null ? [] : [row.categoryRange]),
    ...properties,
    ...(attacksPerAction > 1 ? [`Attack ×${String(attacksPerAction)}`] : []),
  ].join(" · ");
  return {
    id: `atk:${row.index ?? row.id}`,
    name: row.name,
    cost: "action",
    hit: signed(hit),
    dice: `${row.damageDice}${modifier === 0 ? "" : signed(modifier)}`,
    ...(row.damageType === null ? {} : { damageType: row.damageType }),
    ...(range === undefined ? {} : { range }),
    ...(text === "" ? {} : { text }),
    source: "weapon",
    equipmentId: row.id,
    derived: true,
  };
};

/** The counters the class table supplies at this level, numeric values only. */
const countersAt = (row: OptionClassLevel | undefined): ((key: string) => number | undefined) => {
  const counters = row?.classSpecific ?? {};
  return (key) => {
    const value = counters[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };
};

/**
 * When a class's spell slots come back: a warlock's Pact Magic slots on a
 * short rest, every other caster's on a long one. The class table carries the
 * counts but not the recharge, so the name answers it, as the server's level
 * recompute matches the class by name.
 */
export const slotRecharge = (className: string | undefined): "short" | "long" =>
  className?.trim().toLowerCase() === "warlock" ? "short" : "long";

const slotResources = (
  row: OptionClassLevel | undefined,
  recharge: "short" | "long",
): ReadonlyArray<SheetResource> =>
  (row?.spellcasting?.slots ?? []).flatMap((count, index) =>
    count > 0
      ? [
          {
            id: `slot:${String(index + 1)}`,
            name: `${ordinal(index + 1)}-level slots`,
            used: 0,
            max: count,
            recharge,
            derived: true,
          },
        ]
      : [],
  );

/** The overlay's answer for one granted row, as a resource and an action. */
const overlayGrants = (
  entry: (typeof FEATURE_OVERLAY)[string],
  named: {
    readonly id: string;
    readonly index: string;
    readonly name: string;
    readonly source: "feature" | "racial";
  },
  context: OverlayContext,
): {
  readonly resource?: SheetResource;
  readonly action?: SheetAction;
  readonly attacks?: number;
} => {
  const link =
    named.source === "feature"
      ? { featureId: named.id as FeatureId }
      : { racialTraitId: named.id as RacialTraitId };
  const max =
    (entry.counter === undefined ? undefined : context.counter(entry.counter)) ??
    entry.max?.(context);
  const resourceId = entry.resource === undefined ? undefined : `res:${entry.resource}`;
  const resource: SheetResource | undefined =
    resourceId !== undefined && max !== undefined && max > 0
      ? {
          id: resourceId,
          name: entry.resourceName ?? named.name,
          used: 0,
          max: Math.min(max, 9999),
          recharge: entry.recharge ?? "long",
          ...(entry.unit === undefined ? {} : { unit: entry.unit }),
          ...link,
          derived: true,
        }
      : undefined;
  const dice = entry.dice?.(context);
  const spends = entry.spends ?? (resource === undefined ? undefined : resource.id);
  const action: SheetAction | undefined =
    entry.cost !== undefined || dice !== undefined
      ? {
          id: `${named.source === "feature" ? "feat" : "trait"}:${named.index}`,
          name: named.name,
          ...(entry.cost === undefined ? {} : { cost: entry.cost }),
          ...(dice === undefined ? {} : { dice }),
          ...(entry.damageType === undefined ? {} : { damageType: entry.damageType }),
          ...(entry.text === undefined ? {} : { text: entry.text }),
          source: named.source,
          ...(spends === undefined ? {} : { resource: spends }),
          ...link,
          derived: true,
        }
      : undefined;
  return {
    ...(resource === undefined ? {} : { resource }),
    ...(action === undefined ? {} : { action }),
    ...(entry.attacks === undefined ? {} : { attacks: entry.attacks(context) }),
  };
};

/** The casting aside, when the class table says the class casts at this level. */
const spellcastingOf = (
  option: ClassOption | undefined,
  row: OptionClassLevel | undefined,
  abilities: ReadonlyArray<Ability>,
  proficiencyBonus: number | undefined,
): Spellcasting | undefined => {
  const table = row?.spellcasting;
  if (table === undefined) return undefined;
  const casts = table.slots.some((count) => count > 0) || (table.cantripsKnown ?? 0) > 0;
  if (!casts) return undefined;
  const ability = option?.body.spellcastingAbility;
  const modifier = ability === undefined ? undefined : modifierOf(abilities, ability);
  const numbers =
    ability !== undefined && modifier !== undefined && proficiencyBonus !== undefined
      ? {
          save: String(8 + proficiencyBonus + modifier),
          attack: signed(proficiencyBonus + modifier),
        }
      : {};
  return {
    ...(ability === undefined ? {} : { ability }),
    ...numbers,
    ...(table.cantripsKnown === undefined ? {} : { cantripsKnown: table.cantripsKnown }),
    ...(table.spellsKnown === undefined ? {} : { spellsKnown: table.spellsKnown }),
  };
};

/**
 * The background's starting equipment as lines to carry.
 *
 * Through the same `kitLinesFor` the class kit uses when the importer wrote a
 * `startingKit` — so *Clothes, common* and *Pouch* name their bundled rows and
 * the holy-symbol category takes the player's pick or stays a line — and off
 * the prose `equipment` list when it did not: a background typed into the
 * Library, or a row written before the kit existed, still lands what it says.
 */
const backgroundInventory = (
  option: BackgroundOption | undefined,
  sources: SheetGrantSources,
): ReadonlyArray<InventoryItem> => {
  const kit = option?.body.startingKit;
  if (kit === undefined) return (option?.body.equipment ?? []).map((name) => ({ name }));
  return kitInventory(
    kitLinesFor(kit, option?.details?.equipment ?? [], sources.backgroundKitChoices),
  );
};

/** What {@link levelGrantsFor} reads: the resolved class and race, the subclass label, the level and the cells. */
export interface LevelGrantSources {
  readonly classOption?: ClassOption | undefined;
  readonly raceOption?: RaceOption | undefined;
  /** Already resolved through `subraceNamed`; the campaign's own spelling. */
  readonly subraceName?: string | undefined;
  /** `identity.subclass` as written; its features are granted when it names one of the class's. */
  readonly subclass?: string | undefined;
  /** The level the grants are for; `STARTING_LEVEL` when absent. */
  readonly level?: number | undefined;
  /** The six cells — what a counter's ceiling and a casting number are read from. */
  readonly abilities?: ReadonlyArray<Ability> | undefined;
}

/**
 * **The level-scaled half of a sheet**: everything the class table, the
 * class's and subclass's features and the overlay say at one level, and
 * nothing a person chose. Every line in it is `derived: true` and carries its
 * source row.
 */
export interface LevelGrants {
  readonly level: number;
  /** The proficiency bonus at this level, when the class has progression rows. */
  readonly proficiencyBonus?: number;
  /** The class's hit die size — `10` for a d10. */
  readonly hitDie?: number;
  /** The class's proficient saving throws. */
  readonly savingThrows: ReadonlyArray<AbilityKey>;
  /** The class's proficiencies, as `classProficiencies` reads them. */
  readonly proficiencies: ReadonlyArray<string>;
  /** Class features to this level, then the named subclass's. */
  readonly features: ReadonlyArray<SheetFeature>;
  /** Slots, hit dice, then the overlay's counters, class first and then the race's. */
  readonly resources: ReadonlyArray<SheetResource>;
  /** The overlay's feature and racial lines. Weapon lines are the caller's: they need the gear. */
  readonly actions: ReadonlyArray<SheetAction>;
  /** Attacks per Attack action — *Extra Attack*, read off the overlay. */
  readonly attacksPerAction: number;
  /** The casting aside's derived keys, when the class casts at this level. */
  readonly spellcasting?: Spellcasting;
  /** Whether a race resolved, which makes its overlay lines this answer's to rewrite. */
  readonly race: boolean;
}

/**
 * **The one answer to "what does level N grant"** — creation's
 * (`sheetGrantsFor`, through `startingSheetBody`) and a level change's
 * (`withLevel`, through the server's `recomputeForLevel`), so a Fighter
 * composed at 5 and a Fighter 1 moved to 5 cannot disagree.
 * `apps/server/test/level-grants.test.ts` pins that over every imported class
 * at every level.
 */
export const levelGrantsFor = (sources: LevelGrantSources): LevelGrants => {
  const classOption =
    sources.classOption !== undefined && isClassOption(sources.classOption)
      ? sources.classOption
      : undefined;
  const raceOption =
    sources.raceOption !== undefined && isRaceOption(sources.raceOption)
      ? sources.raceOption
      : undefined;
  const level = levelOf(sources.level);
  const abilities = sources.abilities ?? [];
  const row = levelRow(classOption, level);
  const proficiencyBonus =
    row?.proficiencyBonus ?? (level === 1 ? classOption?.details?.proficiencyBonus : undefined);
  const features = grantedFeatures(classOption, sources.subclass, level);
  const racialTraits =
    raceOption?.details === undefined
      ? []
      : forSubrace(raceOption.details.traits, sources.subraceName);

  const context: OverlayContext = {
    level,
    proficiencyBonus,
    modifier: (key) => modifierOf(abilities, key),
    counter: countersAt(row),
  };

  // The overlay's half: counted features and the ones with a cost, class
  // first and then the race's traits, one resource per counter.
  const resources = new Map<string, SheetResource>();
  const actions: Array<SheetAction> = [];
  let attacksPerAction = 1;
  const apply = (grant: ReturnType<typeof overlayGrants>) => {
    if (grant.resource !== undefined) resources.set(grant.resource.id, grant.resource);
    if (grant.action !== undefined) actions.push(grant.action);
    if (grant.attacks !== undefined) attacksPerAction = Math.max(attacksPerAction, grant.attacks);
  };
  for (const feature of features) {
    const entry = feature.index === null ? undefined : FEATURE_OVERLAY[feature.index];
    if (entry === undefined || feature.index === null) continue;
    apply(
      overlayGrants(
        entry,
        { id: feature.id, index: feature.index, name: feature.name, source: "feature" },
        context,
      ),
    );
  }
  for (const grant of racialTraits) {
    const index = grant.trait.index;
    const entry = index === null ? undefined : RACIAL_TRAIT_OVERLAY[index];
    if (entry === undefined || index === null) continue;
    apply(
      overlayGrants(
        entry,
        { id: grant.trait.id, index, name: grant.trait.name, source: "racial" },
        context,
      ),
    );
  }

  const hitDie = classOption?.body.hitDie;
  const hitDice: ReadonlyArray<SheetResource> =
    hitDie === undefined
      ? []
      : [
          {
            id: "hit-dice",
            name: "Hit dice",
            used: 0,
            max: level,
            recharge: "long",
            unit: `d${String(hitDie)}`,
            derived: true,
          },
        ];
  const spellcasting = spellcastingOf(classOption, row, abilities, proficiencyBonus);

  return {
    level,
    ...(proficiencyBonus === undefined ? {} : { proficiencyBonus }),
    ...(hitDie === undefined ? {} : { hitDie }),
    savingThrows: savingThrowsOf(classOption),
    proficiencies: classProficiencies(classOption),
    features: featureTraits(features),
    resources: [
      ...slotResources(row, slotRecharge(classOption?.name)),
      ...hitDice,
      ...resources.values(),
    ],
    actions,
    attacksPerAction,
    ...(spellcasting === undefined ? {} : { spellcasting }),
    race: raceOption !== undefined,
  };
};

export const sheetGrantsFor = (sources: SheetGrantSources): SheetGrants => {
  const classOption =
    sources.classOption !== undefined && isClassOption(sources.classOption)
      ? sources.classOption
      : undefined;
  const raceOption =
    sources.raceOption !== undefined && isRaceOption(sources.raceOption)
      ? sources.raceOption
      : undefined;
  const backgroundOption =
    sources.backgroundOption !== undefined && isBackgroundOption(sources.backgroundOption)
      ? sources.backgroundOption
      : undefined;
  const background = backgroundOption?.body;
  const abilities = sources.abilities ?? [];
  const gold = goldPieces(background);
  const grants = levelGrantsFor({
    classOption,
    raceOption,
    subraceName: sources.subraceName,
    subclass: sources.subclass,
    level: sources.level,
    abilities,
  });

  const proficiencies = dedupe([
    ...grants.proficiencies,
    ...raceDetailNames(raceOption?.details, sources.subraceName),
    ...(background?.proficiencies ?? []),
    ...(background?.languages ?? []),
  ]);

  // The kit, as picked, and the weapon attacks its rows derive — one per
  // distinct weapon, so two handaxes are one line.
  const kitLines = kitLinesFor(
    classOption?.body.startingKit,
    classOption?.details?.equipment ?? [],
    sources.kitChoices,
  );
  const equipmentById = new Map((classOption?.details?.equipment ?? []).map((e) => [e.id, e]));
  const seenWeapons = new Set<string>();
  const weaponActions: Array<SheetAction> = [];
  for (const line of kitLines) {
    if (line.equipmentId === undefined || seenWeapons.has(line.equipmentId)) continue;
    const equipment = equipmentById.get(line.equipmentId);
    if (equipment === undefined) continue;
    const attack = weaponAttack(
      equipment,
      abilities,
      grants.proficiencyBonus,
      proficiencies,
      grants.attacksPerAction,
    );
    if (attack === undefined) continue;
    seenWeapons.add(line.equipmentId);
    weaponActions.push(attack);
  }

  return {
    traits: [
      ...grants.features,
      ...raceTraits(raceOption, sources.subraceName),
      ...backgroundFeature(background),
    ],
    proficiencies,
    savingThrows: grants.savingThrows,
    ...(grants.proficiencyBonus === undefined ? {} : { proficiencyBonus: grants.proficiencyBonus }),
    inventory: [...kitInventory(kitLines), ...backgroundInventory(backgroundOption, sources)],
    ...(gold === undefined ? {} : { gold }),
    ...(raceOption === undefined ? {} : { speed: raceOption.body.speed }),
    ...(grants.hitDie === undefined ? {} : { hitDie: grants.hitDie }),
    level: grants.level,
    actions: [...weaponActions, ...grants.actions],
    resources: grants.resources,
    ...(grants.spellcasting === undefined ? {} : { spellcasting: grants.spellcasting }),
  };
};

/**
 * Marks the class's proficient saving throws on the seeded ability cells.
 *
 * The save *value* is written only when both of its parts are reads rather
 * than guesses: the cell's own modifier, and the corpus-supplied proficiency
 * bonus. A class whose progression rows are absent still gets the mark —
 * `proficient` is the source's own statement — with no number beside it.
 */
export const withSavingThrows = (
  abilities: ReadonlyArray<Ability>,
  savingThrows: ReadonlyArray<AbilityKey>,
  proficiencyBonus?: number,
): ReadonlyArray<Ability> => {
  if (savingThrows.length === 0) return abilities;
  const marked = new Set<string>(savingThrows);
  return abilities.map((ability) => {
    if (!marked.has(ability.label.trim().toUpperCase())) return ability;
    const modifier = Number(ability.modifier.trim());
    const save =
      proficiencyBonus !== undefined && Number.isInteger(modifier)
        ? signed(modifier + proficiencyBonus)
        : undefined;
    return { ...ability, proficient: true, ...(save === undefined ? {} : { save }) };
  });
};

/**
 * The identity keys the corpora answer for a fresh sheet, in the formats
 * `SheetIdentity` documents: `"25 ft."`, `"+2"`, `"1/1 d10"`. Merged by the
 * composer with the keys only it knows (background, subclass).
 */
export const identityGrants = (
  grants: SheetGrants,
): { readonly speed?: string; readonly proficiency?: string; readonly hitDice?: string } => ({
  ...(grants.speed === undefined ? {} : { speed: `${String(grants.speed)} ft.` }),
  ...(grants.proficiencyBonus === undefined
    ? {}
    : { proficiency: signed(grants.proficiencyBonus) }),
  ...(grants.hitDie === undefined ? {} : { hitDice: hitDiceLine(grants.level, grants.hitDie) }),
});

/** `identity.hitDice` as the corpus writes it: `"5/5 d10"`. */
const hitDiceLine = (level: number, hitDie: number): string =>
  `${String(level)}/${String(level)} d${String(hitDie)}`;

/** The resolved option of a kind, told apart for `SheetGrantSources`. */
export const asClassOption = (option: CharacterOption | undefined): ClassOption | undefined =>
  option !== undefined && isClassOption(option) ? option : undefined;
export const asRaceOption = (option: CharacterOption | undefined): RaceOption | undefined =>
  option !== undefined && isRaceOption(option) ? option : undefined;
export const asBackgroundOption = (
  option: CharacterOption | undefined,
): BackgroundOption | undefined =>
  option !== undefined && isBackgroundOption(option) ? option : undefined;

/** What {@link startingSheetBody} composes from: the resolved options and the few picks. */
export interface StartingSheetSources {
  readonly classOption?: ClassOption | undefined;
  readonly raceOption?: RaceOption | undefined;
  /** The subrace label as typed; resolved inside the race through `subraceNamed`. */
  readonly subrace?: string | undefined;
  readonly backgroundOption?: BackgroundOption | undefined;
  /**
   * The background as the identity card spells it: the option's name where it
   * resolved, the typed label where it did not. Callers choose the spelling.
   */
  readonly background?: string | undefined;
  /** Written to `identity.subclass` as given. */
  readonly subclass?: string | undefined;
  /** The level the sheet and its hit points are written for; `STARTING_LEVEL` when absent. */
  readonly level?: number | undefined;
  /** The six cells **before** the race moves them — the standard array as placed, say. */
  readonly abilities: ReadonlyArray<Ability>;
  /** Explicit picks for a source-defined race bonus option. */
  readonly raceBonusChoices?: ReadonlyArray<AbilityBonus> | undefined;
  readonly kitChoices?: ReadonlyArray<KitPick> | undefined;
  readonly backgroundKitChoices?: ReadonlyArray<KitPick> | undefined;
}

/**
 * The seed a starting sheet is written on: the cells with the race's bonuses
 * applied, and the armour class and hit points read off them at the sheet's
 * level. {@link startingSheetBody} calls it; a form that shows the seeded
 * numbers before anything is composed calls it too, so the two cannot differ.
 */
export const startingSeed = (sources: StartingSheetSources): CharacterSeed =>
  seedFor({
    classEntry: sources.classOption?.body,
    raceEntry: sources.raceOption?.body,
    subraceEntry: subraceNamed(sources.raceOption?.body, sources.subrace),
    raceBonusChoices: sources.raceBonusChoices ?? [],
    abilities: sources.abilities,
    level: sources.level,
  });

/**
 * **The one assembly of a starting sheet's rules half** — the character form's
 * `payloadFrom`, Hob's `proposeCharacter` and an NPC's quick start all compose
 * through here, so none of them can start a Hill Dwarf Fighter differently.
 *
 * The seed moves the cells first, because a weapon's to-hit and a spell save
 * DC are read off the moved ones; `sheetGrantsFor` then writes the corpora's
 * half at the seed's level, and the class's saving throws are marked on the
 * cells. Every optional key is omitted rather than written empty: a sheet with
 * `actions: []` on it draws an Actions section that says nothing, where a sheet
 * without the key draws the section's own invitation to fill it in.
 *
 * What only a caller knows stays with the caller — a character's notes and
 * story, Hob's skills and the model's own kit lines — and goes on beside the
 * body it returns.
 */
export const startingSheetBody = (
  sources: StartingSheetSources,
): { readonly body: SheetBody; readonly seed: CharacterSeed } => {
  const seed = startingSeed(sources);
  const subrace = subraceNamed(sources.raceOption?.body, sources.subrace);
  const typedSubrace = sources.subrace?.trim();
  const subclass = sources.subclass?.trim();
  const grants = sheetGrantsFor({
    classOption: sources.classOption,
    raceOption: sources.raceOption,
    subraceName: subrace?.name ?? (typedSubrace === "" ? undefined : typedSubrace),
    subclass,
    backgroundOption: sources.backgroundOption,
    level: seed.level,
    abilities: seed.abilities,
    kitChoices: sources.kitChoices,
    backgroundKitChoices: sources.backgroundKitChoices,
  });
  const background = sources.background?.trim();
  const identity: SheetIdentity = {
    ...identityGrants(grants),
    ...(subclass === undefined || subclass === "" ? {} : { subclass }),
    ...(background === undefined || background === "" ? {} : { background }),
  };
  const body: SheetBody = {
    abilities: withSavingThrows(seed.abilities, grants.savingThrows, grants.proficiencyBonus),
    traits: grants.traits,
    ...(Object.keys(identity).length === 0 ? {} : { identity }),
    ...(grants.proficiencies.length === 0 ? {} : { proficiencies: grants.proficiencies }),
    ...(grants.actions.length === 0 ? {} : { actions: grants.actions }),
    ...(grants.resources.length === 0 ? {} : { resources: grants.resources }),
    ...(grants.spellcasting === undefined ? {} : { spellcasting: grants.spellcasting }),
    ...(grants.inventory.length === 0 ? {} : { inventory: grants.inventory }),
    ...(grants.gold === undefined ? {} : { currency: { gp: grants.gold } }),
  };
  return { body, seed };
};

/** What a level change moves, and from where. */
export interface LevelChange {
  /**
   * What the sheet's level and class **before** the change granted — what a
   * stored number is compared against. Absent when that class resolved to
   * nothing, and then no stored number is taken for the corpus's.
   */
  readonly from?: LevelGrants | undefined;
  readonly to: LevelGrants;
  /** The rows the sheet's derived weapon lines name, as far as the caller could reach them. */
  readonly equipment?: ReadonlyArray<KitEquipment> | undefined;
}

/**
 * **Compare-and-move.** A stored number the corpus wrote moves to the new
 * level's value only while it still says what the old level's numbers would
 * have produced; anything else is somebody's typing and stays. An absent one
 * is written when `fill` says the corpus writes that key at creation.
 */
const moved = (
  stored: string | undefined,
  before: string | undefined,
  after: string | undefined,
  fill: boolean,
): string | undefined => {
  if (after === undefined) return stored;
  if (stored === undefined) return fill ? after : undefined;
  return before !== undefined && stored.trim() === before ? after : stored;
};

/** `"3/5 d10"`: anything before the slash, then the level and the die the line was written for. */
const HIT_DICE_LINE = /^\s*\d+\s*\/\s*(\d+)\s*d(\d+)\s*$/i;

/** The modifier a cell states, when it states a whole number. */
const statedModifier = (cell: Ability | undefined): number | undefined => {
  const value = Number(cell?.modifier.trim());
  return cell !== undefined && Number.isInteger(value) ? value : undefined;
};

const bonusAt = (bonus: number | undefined, modifier: number, times: number): string | undefined =>
  bonus === undefined ? undefined : signed(modifier + times * bonus);

/**
 * **A sheet moved to another level** — the level change's whole rule, for a
 * character and an NPC alike (the server's `recomputeForLevel` resolves the
 * inputs and calls this). A sheet holds three kinds of content and each is
 * treated differently:
 *
 * - **Derived lines are rewritten.** The class and subclass features, the
 *   slots, the hit dice, the overlay's counters and lines (the race's too,
 *   when the race resolved), and the derived weapon lines whose rows the
 *   caller reached — to-hit at the new bonus, *Attack ×N* at the new count.
 *   A counter's `used` is carried over and clamped to the new ceiling.
 * - **Picks follow the feature that offered them**: kept while it is still
 *   granted, dropped with it.
 * - **Hand lines are kept**, untouched: anything without `derived`. A typed
 *   feature that shares a granted one's name (every sheet written before
 *   features carried `featureId`) stands in for it, so nothing is listed
 *   twice and nothing typed is removed.
 *
 * The numbers that are not lines — `identity.proficiency` and `hitDice`, a
 * proficient save or skill, the casting save DC and attack — follow
 * compare-and-move (`moved`): rewritten only while they still say what the
 * old level wrote. The casting counts are the table's and always follow it.
 * A class change also moves the class's save marks and proficiency entries:
 * the new class's are added, and the old class's go unless the new one grants
 * them too or a save's number was typed; anything else on those lists stays.
 *
 * Hit points and ability scores are not derived and are not touched; known
 * spells and their lines are the server's, since they need the spell rows.
 * `withLevel(composed at 1, to N)` equals the sheet composed at N, which is
 * what `apps/server/test/level-grants.test.ts` pins for every class.
 */
export const withLevel = <Body extends SheetBody>(body: Body, change: LevelChange): Body => {
  const { from, to } = change;
  const before = from?.proficiencyBonus;
  const after = to.proficiencyBonus;

  // A class change moves the class's save marks: the new class's are marked,
  // and the old class's go while their number is still the old level's.
  const formerSaves = new Set<string>(from?.savingThrows ?? []);
  const saves = new Set<string>(to.savingThrows);
  const abilities = body.abilities.map((ability): Ability => {
    const key = ability.label.trim().toUpperCase();
    const modifier = statedModifier(ability);
    if (ability.proficient !== true) {
      if (!saves.has(key) || formerSaves.has(key)) return ability;
      const save = modifier === undefined ? undefined : bonusAt(after, modifier, 1);
      return { ...ability, proficient: true, ...(save === undefined ? {} : { save }) };
    }
    if (formerSaves.has(key) && !saves.has(key)) {
      const written = modifier === undefined ? undefined : bonusAt(before, modifier, 1);
      if (ability.save !== undefined && ability.save.trim() !== written) return ability;
      const { proficient: _proficient, save: _save, ...cell } = ability;
      return cell;
    }
    if (modifier === undefined) return ability;
    const save = moved(
      ability.save,
      bonusAt(before, modifier, 1),
      bonusAt(after, modifier, 1),
      true,
    );
    return save === undefined || save === ability.save ? ability : { ...ability, save };
  });

  const skills = body.skills?.map((skill): Skill => {
    const label = skill.ability?.trim().toUpperCase();
    const modifier = statedModifier(
      abilities.find((ability) => ability.label.trim().toUpperCase() === label),
    );
    if (skill.proficient !== true || modifier === undefined) return skill;
    const times = skill.expertise === true ? 2 : 1;
    const bonus = moved(
      skill.bonus,
      bonusAt(before, modifier, times),
      bonusAt(after, modifier, times),
      false,
    );
    return bonus === undefined || bonus === skill.bonus ? skill : { ...skill, bonus };
  });

  const identity: SheetIdentity = body.identity ?? {};
  const proficiency = moved(
    identity.proficiency,
    before === undefined ? undefined : signed(before),
    after === undefined ? undefined : signed(after),
    true,
  );
  const hitDice = ((): string | undefined => {
    if (to.hitDie === undefined) return identity.hitDice;
    if (identity.hitDice === undefined) return hitDiceLine(to.level, to.hitDie);
    const written = HIT_DICE_LINE.exec(identity.hitDice);
    return written !== null &&
      from?.hitDie !== undefined &&
      Number(written[1]) === from.level &&
      Number(written[2]) === from.hitDie
      ? hitDiceLine(to.level, to.hitDie)
      : identity.hitDice;
  })();
  const nextIdentity: SheetIdentity = {
    ...identity,
    ...(proficiency === undefined ? {} : { proficiency }),
    ...(hitDice === undefined ? {} : { hitDice }),
  };

  // Features: the grants' own replace the derived ones; a pick stays while
  // what offered it is granted; everything else stays where it was.
  const granted = new Set(to.features.flatMap((feature) => feature.featureId ?? []));
  const keptTraits = body.traits.filter((trait) => {
    if (trait.derived !== true) return true;
    if (trait.pick !== undefined) return granted.has(trait.pick.offeredBy);
    return trait.featureId === undefined;
  });
  const typed = new Set(
    keptTraits.filter((trait) => trait.derived !== true).map((trait) => wanted(trait.name)),
  );
  const traits = [
    ...to.features.filter((feature) => !typed.has(wanted(feature.name))),
    ...keptTraits,
  ];

  // Counters: every derived one the grants answer is replaced, `used` carried.
  const previous = body.resources ?? [];
  const ownsResource = (resource: SheetResource): boolean =>
    resource.derived === true &&
    (resource.id.startsWith("slot:") ||
      resource.id === "hit-dice" ||
      resource.featureId !== undefined ||
      (to.race && resource.racialTraitId !== undefined));
  const usedOf = new Map(
    previous.filter(ownsResource).map((resource) => [resource.id, resource.used]),
  );
  const keptResources = previous.filter((resource) => !ownsResource(resource));
  const handResourceIds = new Set(keptResources.map((resource) => resource.id));
  const resources = [
    ...to.resources
      .filter((resource) => !handResourceIds.has(resource.id))
      .map((resource) => ({
        ...resource,
        used: Math.max(0, Math.min(resource.max, usedOf.get(resource.id) ?? 0)),
      })),
    ...keptResources,
  ];

  // Actions: the overlay's lines are replaced; a derived weapon line whose row
  // is in hand is worked out again at the new bonus and attack count.
  const equipment = new Map((change.equipment ?? []).map((row) => [row.id, row]));
  const proficiencies = proficienciesAt(body.proficiencies, from?.proficiencies, to.proficiencies);
  const ownsAction = (action: SheetAction): boolean =>
    action.derived === true &&
    (action.source === "feature" || (to.race && action.source === "racial"));
  const keptActions = (body.actions ?? []).flatMap((action): ReadonlyArray<SheetAction> => {
    if (ownsAction(action)) return [];
    if (action.derived !== true || action.source !== "weapon" || after === undefined)
      return [action];
    const row =
      action.equipmentId === undefined || action.equipmentId === null
        ? undefined
        : equipment.get(action.equipmentId);
    if (row === undefined) return [action];
    return [weaponAttack(row, abilities, after, proficiencies, to.attacksPerAction) ?? action];
  });
  const keptActionIds = new Set(keptActions.map((action) => action.id));
  const actions = [...keptActions, ...to.actions.filter((action) => !keptActionIds.has(action.id))];

  const spellcasting = castingAt(body.spellcasting, from?.spellcasting, to.spellcasting);

  const next: Body = {
    ...body,
    abilities,
    traits,
    ...(skills === undefined ? {} : { skills }),
    ...(proficiencies.length === 0 && body.proficiencies === undefined ? {} : { proficiencies }),
    ...(body.identity === undefined && Object.keys(nextIdentity).length === 0
      ? {}
      : { identity: nextIdentity }),
    ...(actions.length === 0 && body.actions === undefined ? {} : { actions }),
    ...(resources.length === 0 && body.resources === undefined ? {} : { resources }),
    ...(spellcasting === undefined ? {} : { spellcasting }),
  };
  if (spellcasting === undefined) delete (next as { spellcasting?: Spellcasting }).spellcasting;
  return next;
};

/**
 * The proficiency list after a class change: the old class's entries the new
 * one does not grant go, the new class's that the old did not are added, and
 * every other entry — the race's, the background's, a typed one — stays.
 */
const proficienciesAt = (
  stored: ReadonlyArray<string> | undefined,
  before: ReadonlyArray<string> | undefined,
  after: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const former = new Set((before ?? []).map(wanted));
  const granted = new Set(after.map(wanted));
  const kept = (stored ?? []).filter(
    (name) => granted.has(wanted(name)) || !former.has(wanted(name)),
  );
  const have = new Set(kept.map(wanted));
  return [...kept, ...after.filter((name) => !former.has(wanted(name)) && !have.has(wanted(name)))];
};

/**
 * The casting aside at the new level: the table's counts, and the save DC and
 * attack by compare-and-move. A class that stops casting (a Paladin back to
 * level 1) loses the corpus's numbers and keeps what anybody chose or typed;
 * an aside left with nothing but its ability is the corpus's alone and goes.
 */
const castingAt = (
  stored: Spellcasting | undefined,
  before: Spellcasting | undefined,
  after: Spellcasting | undefined,
): Spellcasting | undefined => {
  if (after === undefined) {
    if (stored === undefined || before === undefined) return stored;
    const left: Spellcasting = {
      ...(stored.ability === undefined ? {} : { ability: stored.ability }),
      ...(stored.save === undefined || stored.save === before.save ? {} : { save: stored.save }),
      ...(stored.attack === undefined || stored.attack === before.attack
        ? {}
        : { attack: stored.attack }),
      ...(stored.slots === undefined ? {} : { slots: stored.slots }),
      ...(stored.known === undefined ? {} : { known: stored.known }),
    };
    return Object.keys(left).some((key) => key !== "ability") ? left : undefined;
  }
  const ability = stored?.ability ?? after.ability;
  const save = moved(stored?.save, before?.save, after.save, true);
  const attack = moved(stored?.attack, before?.attack, after.attack, true);
  return {
    ...(ability === undefined ? {} : { ability }),
    ...(save === undefined ? {} : { save }),
    ...(attack === undefined ? {} : { attack }),
    ...(after.cantripsKnown === undefined ? {} : { cantripsKnown: after.cantripsKnown }),
    ...(after.spellsKnown === undefined ? {} : { spellsKnown: after.spellsKnown }),
    ...(stored?.slots === undefined ? {} : { slots: stored.slots }),
    ...(stored?.known === undefined ? {} : { known: stored.known }),
  };
};
