import { Schema } from "effect";
import type { CharacterSheet, SheetAction, SheetResource, SpellKnown } from "./Character.js";
import { Spell } from "./Spell.js";
import { CharacterId, type SpellId } from "./Ids.js";

/** How this class treats the picked spell list on the character sheet. */
export const SpellSelectionMode = Schema.Literals(["none", "known", "prepared", "spellbook"]);
export type SpellSelectionMode = typeof SpellSelectionMode.Type;

/** The picker limits the server can derive from the class table and the class's 2014 rule. */
export const CharacterSpellLimits = Schema.Struct({
  /** Level 0 spells the character may keep on the sheet. */
  cantripsKnown: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 }))),
  /** Leveled spells a known-caster may know, or a wizard may keep in their spellbook. */
  spellsKnown: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 999 }))),
  /** Leveled spells a prepared caster may mark prepared. */
  prepared: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 999 }))),
});
export type CharacterSpellLimits = typeof CharacterSpellLimits.Type;

export const CharacterSpellOption = Schema.Struct({
  spell: Spell,
  /** Whether the row is reached through the class list or the subclass list. */
  list: Schema.Literals(["class", "subclass"]),
});
export type CharacterSpellOption = typeof CharacterSpellOption.Type;

/** One character's bounded spell vocabulary — the sheet picker reads this whole. */
export const CharacterSpellbook = Schema.Struct({
  characterId: CharacterId,
  className: Schema.optional(Schema.String),
  subclassName: Schema.optional(Schema.String),
  level: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  highestSlotLevel: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9 })),
  mode: SpellSelectionMode,
  limits: CharacterSpellLimits,
  spells: Schema.Array(CharacterSpellOption),
});
export type CharacterSpellbook = typeof CharacterSpellbook.Type;

const actionCost = (castingTime: string): SheetAction["cost"] | undefined => {
  switch (castingTime.trim().toLowerCase()) {
    case "1 action":
      return "action";
    case "1 bonus action":
      return "bonus";
    case "1 reaction":
      return "reaction";
    default:
      return undefined;
  }
};

const diceAt = (
  table: Readonly<Record<string, string>> | undefined,
  level: number,
): string | undefined => {
  if (table === undefined) return undefined;
  const exact = table[String(level)];
  if (exact !== undefined) return exact;
  let bestLevel = -1;
  let best: string | undefined;
  for (const [key, value] of Object.entries(table)) {
    const parsed = Number.parseInt(key, 10);
    if (Number.isFinite(parsed) && parsed <= level && parsed > bestLevel) {
      bestLevel = parsed;
      best = value;
    }
  }
  return best;
};

/** The action line for one selected spell. Pure, so the picker and recompute use one spelling. */
export const spellActionFor = (
  option: CharacterSpellOption,
  context: {
    readonly characterLevel: number;
    readonly spellAttack?: string;
    readonly spellSave?: string;
  },
): SheetAction => {
  const spell = option.spell;
  const damage = spell.spell.damage;
  const dice =
    diceAt(damage?.damageAtCharacterLevel, context.characterLevel) ??
    diceAt(damage?.damageAtSlotLevel, Math.max(1, spell.level)) ??
    diceAt(spell.spell.healAtSlotLevel, Math.max(1, spell.level));
  const save = spell.spell.dc?.dcType.name;
  const hit = spell.spell.attackType === undefined ? undefined : context.spellAttack;
  const descriptors = [
    spell.schoolName,
    spell.spell.attackType,
    save === undefined
      ? undefined
      : `${save} save${context.spellSave === undefined ? "" : ` DC ${context.spellSave}`}`,
    spell.concentration ? "Concentration" : undefined,
    spell.ritual ? "Ritual" : undefined,
  ].filter((part): part is string => part !== undefined && part !== "");
  return {
    id: `spell:${spell.id}`,
    name: spell.name,
    ...(actionCost(spell.castingTime) === undefined ? {} : { cost: actionCost(spell.castingTime) }),
    ...(hit === undefined ? {} : { hit }),
    ...(dice === undefined ? {} : { dice }),
    ...(damage?.damageType?.name === undefined ? {} : { damageType: damage.damageType.name }),
    range: spell.range,
    ...(descriptors.length === 0 ? {} : { text: descriptors.join(" · ") }),
    source: "spell",
    ...(spell.level > 0 ? { resource: `slot:${String(spell.level)}` } : {}),
    spellId: spell.id,
    derived: true,
  };
};

export const spellById = (book: CharacterSpellbook): ReadonlyMap<SpellId, CharacterSpellOption> =>
  new Map(book.spells.map((option) => [option.spell.id, option]));

export const cantripLimit = (book: CharacterSpellbook): number | undefined =>
  book.limits.cantripsKnown;
export const knownLimit = (book: CharacterSpellbook): number | undefined => book.limits.spellsKnown;
export const preparedLimit = (book: CharacterSpellbook): number | undefined => book.limits.prepared;

/** Keep only selected spell ids the server still says are eligible. */
export const eligibleKnownSpells = (
  book: CharacterSpellbook,
  known: ReadonlyArray<SpellKnown>,
): ReadonlyArray<SpellKnown> => {
  const options = spellById(book);
  return known.filter(
    (spell) => spell.spellId !== undefined && spell.spellId !== null && options.has(spell.spellId),
  );
};

const spellActionsFromKnown = (
  book: CharacterSpellbook,
  known: ReadonlyArray<SpellKnown>,
  sheet: CharacterSheet,
): ReadonlyArray<SheetAction> => {
  const options = spellById(book);
  return known.flatMap((knownSpell) => {
    if (knownSpell.spellId === undefined) return [];
    if (knownSpell.spellId === null) return [];
    const option = options.get(knownSpell.spellId);
    if (option === undefined) return [];
    const shouldDraw =
      option.spell.level === 0 || book.mode === "known" || knownSpell.prepared === true;
    return shouldDraw
      ? [
          spellActionFor(option, {
            characterLevel: book.level,
            spellAttack: sheet.spellcasting?.attack,
            spellSave: sheet.spellcasting?.save,
          }),
        ]
      : [];
  });
};

const carryResourceUsage = (
  previous: ReadonlyArray<SheetResource>,
  next: ReadonlyArray<SheetResource>,
): ReadonlyArray<SheetResource> => {
  const used = new Map(previous.map((resource) => [resource.id, resource.used]));
  return next.map((resource) => ({
    ...resource,
    used: Math.max(0, Math.min(resource.max, used.get(resource.id) ?? resource.used)),
  }));
};

/**
 * Replace corpus-derived rows and leave hand-authored rows untouched. Nothing calls this on read;
 * it is for picker saves and level-up writes.
 */
export const sheetWithRecomputedDerived = (
  sheet: CharacterSheet,
  grants: {
    readonly actions: ReadonlyArray<SheetAction>;
    readonly resources: ReadonlyArray<SheetResource>;
  },
  book?: CharacterSpellbook,
): CharacterSheet => {
  const known =
    book === undefined
      ? (sheet.spellcasting?.known ?? [])
      : eligibleKnownSpells(book, sheet.spellcasting?.known ?? []);
  const spellActions = book === undefined ? [] : spellActionsFromKnown(book, known, sheet);
  const customActions = (sheet.actions ?? []).filter((action) => action.derived !== true);
  const customResources = (sheet.resources ?? []).filter((resource) => resource.derived !== true);
  const derivedResources = carryResourceUsage(
    sheet.resources ?? [],
    grants.resources.filter((resource) => resource.derived === true),
  );
  const spellcasting = sheet.spellcasting;
  return {
    ...sheet,
    actions: [
      ...customActions,
      ...grants.actions.filter((action) => action.derived === true),
      ...spellActions,
    ],
    resources: [...customResources, ...derivedResources],
    ...(spellcasting === undefined ? {} : { spellcasting: { ...spellcasting, known } }),
  };
};

export const sheetWithSpellSelection = (
  sheet: CharacterSheet,
  book: CharacterSpellbook,
  known: ReadonlyArray<SpellKnown>,
): CharacterSheet => ({
  ...sheet,
  actions: [
    ...(sheet.actions ?? []).filter(
      (action) => !(action.derived === true && action.source === "spell"),
    ),
    ...spellActionsFromKnown(book, eligibleKnownSpells(book, known), sheet),
  ],
  spellcasting: { ...(sheet.spellcasting ?? {}), known: eligibleKnownSpells(book, known) },
});

export const selectedSpellCounts = (
  book: CharacterSpellbook,
  known: ReadonlyArray<SpellKnown>,
): { readonly cantrips: number; readonly known: number; readonly prepared: number } => {
  const options = spellById(book);
  let cantrips = 0;
  let leveledKnown = 0;
  let prepared = 0;
  for (const row of known) {
    if (row.spellId === undefined) continue;
    if (row.spellId === null) continue;
    const spell = options.get(row.spellId)?.spell;
    if (spell === undefined) continue;
    if (spell.level === 0) cantrips += 1;
    else {
      leveledKnown += 1;
      if (row.prepared === true) prepared += 1;
    }
  }
  return { cantrips, known: leveledKnown, prepared };
};

export const spellSelectionProblems = (
  book: CharacterSpellbook,
  known: ReadonlyArray<SpellKnown>,
): ReadonlyArray<string> => {
  const counts = selectedSpellCounts(book, known);
  const problems: Array<string> = [];
  if (book.limits.cantripsKnown !== undefined && counts.cantrips > book.limits.cantripsKnown) {
    problems.push(`Choose at most ${String(book.limits.cantripsKnown)} cantrips.`);
  }
  if (book.limits.spellsKnown !== undefined && counts.known > book.limits.spellsKnown) {
    problems.push(`Choose at most ${String(book.limits.spellsKnown)} leveled spells known.`);
  }
  if (book.limits.prepared !== undefined && counts.prepared > book.limits.prepared) {
    problems.push(`Prepare at most ${String(book.limits.prepared)} leveled spells.`);
  }
  return problems;
};
