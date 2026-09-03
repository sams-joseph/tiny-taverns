import { FEATURE_OVERLAY, RACIAL_TRAIT_OVERLAY, type OverlayContext } from "./ActionOverlay.js";
import type { InventoryItem, SheetAction, SheetResource, Spellcasting } from "./Character.js";
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
import { isBackgroundOption, isClassOption, isRaceOption } from "./CharacterOption.js";
import type { EquipmentId, FeatureId, RacialTraitId } from "./Ids.js";
import { type AbilityKey, ABILITY_KEYS, modifierOf, signed, STARTING_LEVEL } from "./Ruleset.js";

/**
 * What the picked class, race, subrace and background put on a fresh sheet —
 * the one implementation of "the corpora drive the starting sheet".
 *
 * ### Why this lives in `@taverns/api`
 *
 * The same reason `seedFor` does: **both creation paths call it**, the manual
 * form's `payloadFrom` (`apps/web/src/characters/create.ts`) and Hob's
 * `proposeCharacter` handler (`apps/server/src/assistant/toolkit.ts`). The
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
  readonly backgroundOption?: BackgroundOption | undefined;
  /** The level the sheet is written for; `STARTING_LEVEL` when absent. */
  readonly level?: number | undefined;
  /** The six cells after the seed moved them — what a to-hit is read from. */
  readonly abilities?: ReadonlyArray<Ability> | undefined;
  /** One pick per `startingKit.choices` entry, in order; see `KitPick`. */
  readonly kitChoices?: ReadonlyArray<KitPick> | undefined;
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
  /** Level-1 class features, then race/subrace traits, then the background feature. */
  readonly traits: ReadonlyArray<Trait>;
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
): ReadonlyArray<Trait> =>
  option?.details === undefined
    ? []
    : forSubrace(option.details.traits, subraceName).map((grant) => ({
        name: grant.trait.name,
        text: prose(grant.trait.desc),
      }));

/** One class feature the level grants: level 1 with its paragraphs, higher up by name. */
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
 * Every top-level feature the class grants at or below this level. Level 1
 * comes off `levelOneFeatures`, which carries the prose the Features section
 * draws; the higher levels come off the class table by name and id.
 */
const grantedFeatures = (
  option: ClassOption | undefined,
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
  return [...levelOne, ...higher];
};

const classFeatureTraits = (features: ReadonlyArray<GrantedFeature>): ReadonlyArray<Trait> =>
  features.map((feature) => ({ name: feature.name, text: prose(feature.desc) }));

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
const kitInventory = (lines: ReadonlyArray<KitLine>): ReadonlyArray<InventoryItem> =>
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
 */
const weaponAttack = (
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

const slotResources = (row: OptionClassLevel | undefined): ReadonlyArray<SheetResource> =>
  (row?.spellcasting?.slots ?? []).flatMap((count, index) =>
    count > 0
      ? [
          {
            id: `slot:${String(index + 1)}`,
            name: `${ordinal(index + 1)}-level slots`,
            used: 0,
            max: count,
            recharge: "long" as const,
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
  const level = Math.max(1, Math.floor(sources.level ?? STARTING_LEVEL));
  const abilities = sources.abilities ?? [];
  const row = levelRow(classOption, level);
  const proficiencyBonus =
    row?.proficiencyBonus ?? (level === 1 ? classOption?.details?.proficiencyBonus : undefined);
  const gold = goldPieces(background);
  const features = grantedFeatures(classOption, level);
  const racialTraits =
    raceOption?.details === undefined
      ? []
      : forSubrace(raceOption.details.traits, sources.subraceName);

  const proficiencies = dedupe([
    ...classProficiencies(classOption),
    ...raceDetailNames(raceOption?.details, sources.subraceName),
    ...(background?.proficiencies ?? []),
    ...(background?.languages ?? []),
  ]);

  const context: OverlayContext = {
    level,
    proficiencyBonus,
    modifier: (key) => modifierOf(abilities, key),
    counter: countersAt(row),
  };

  // The overlay's half: counted features and the ones with a cost, class
  // first and then the race's traits, one resource per counter.
  const resources = new Map<string, SheetResource>();
  const featureActions: Array<SheetAction> = [];
  let attacksPerAction = 1;
  const apply = (grant: ReturnType<typeof overlayGrants>) => {
    if (grant.resource !== undefined) resources.set(grant.resource.id, grant.resource);
    if (grant.action !== undefined) featureActions.push(grant.action);
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
      proficiencyBonus,
      proficiencies,
      attacksPerAction,
    );
    if (attack === undefined) continue;
    seenWeapons.add(line.equipmentId);
    weaponActions.push(attack);
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
    traits: [
      ...classFeatureTraits(features),
      ...raceTraits(raceOption, sources.subraceName),
      ...backgroundFeature(background),
    ],
    proficiencies,
    savingThrows: savingThrowsOf(classOption),
    ...(proficiencyBonus === undefined ? {} : { proficiencyBonus }),
    inventory: [
      ...kitInventory(kitLines),
      ...(background?.equipment ?? []).map((name) => ({ name })),
    ],
    ...(gold === undefined ? {} : { gold }),
    ...(raceOption === undefined ? {} : { speed: raceOption.body.speed }),
    ...(hitDie === undefined ? {} : { hitDie }),
    level,
    actions: [...weaponActions, ...featureActions],
    resources: [...slotResources(row), ...hitDice, ...resources.values()],
    ...(spellcasting === undefined ? {} : { spellcasting }),
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
  ...(grants.hitDie === undefined
    ? {}
    : { hitDice: `${String(grants.level)}/${String(grants.level)} d${String(grants.hitDie)}` }),
});

/** The resolved option of a kind, told apart for `SheetGrantSources`. */
export const asClassOption = (option: CharacterOption | undefined): ClassOption | undefined =>
  option !== undefined && isClassOption(option) ? option : undefined;
export const asRaceOption = (option: CharacterOption | undefined): RaceOption | undefined =>
  option !== undefined && isRaceOption(option) ? option : undefined;
export const asBackgroundOption = (
  option: CharacterOption | undefined,
): BackgroundOption | undefined =>
  option !== undefined && isBackgroundOption(option) ? option : undefined;
