import { Schema } from "effect";
import type { SheetBody } from "./Character.js";
import type { ClassOption, FeatureBody, RaceOption, SubclassBody } from "./CharacterOption.js";
import { subraceNamed } from "./CharacterOption.js";
import { CharacterId, FeatId, FeatureId, SpellId, SubclassId } from "./Ids.js";
import { averageHitDie, levelOf, modifierOf } from "./Ruleset.js";
import { classLevelAt, type LevelGrants, levelGrantsFor } from "./SheetGrants.js";
import { type CharacterSpellRules, SpellSelectionMode } from "./Spellbook.js";

/**
 * **What the next level offers a character** — the read behind the level-up
 * wizard (`GET /me/characters/:id/level-up`), and the shape the level-up write
 * re-derives and validates a payload against.
 *
 * Everything in it is computed from the character's own vocabulary
 * (`characterVocabulary`: every table it sits at, or the core rules): the
 * class table and its features, the subclasses, the subclass spells, the feats
 * and the spell lists. The server reads those rows and {@link levelUpOfferFor}
 * assembles them, so the server's validator and the web's review share one
 * answer and the client never works an option out for itself.
 *
 * One level at a time: `toLevel` is always `fromLevel + 1`. It records nothing
 * and decides nothing a person chooses; the automatic half is what
 * `levelGrantsFor` says the level grants, the same rule creation and the
 * Level box's recompute use.
 */

const text = Schema.String;
const prose = Schema.Array(Schema.String);

/** A number before and after the level: absent `from` when the earlier level had none. */
const change = <S extends Schema.Top>(value: S) =>
  Schema.Struct({ from: Schema.optional(value), to: value });

export const LevelUpNumberChange = change(Schema.Int);
export type LevelUpNumberChange = typeof LevelUpNumberChange.Type;
export const LevelUpTextChange = change(text);
export type LevelUpTextChange = typeof LevelUpTextChange.Type;

/** A class or subclass feature: its row, and its prose. */
export const LevelUpFeature = Schema.Struct({
  featureId: FeatureId,
  name: text,
  level: Schema.Int,
  desc: prose,
});
export type LevelUpFeature = typeof LevelUpFeature.Type;

/** The granted feature a choice belongs to: *Fighting Style*, *Eldritch Invocations*. */
export const LevelUpOfferedBy = Schema.Struct({ featureId: FeatureId, name: text });
export type LevelUpOfferedBy = typeof LevelUpOfferedBy.Type;

/**
 * One of an option's typed prerequisites (the 2014 source types them on the
 * Eldritch Invocations), evaluated against the sheet at the new level.
 * `index` is the source key the prerequisite names.
 */
export const LevelUpPrerequisite = Schema.Union([
  Schema.Struct({ type: Schema.Literal("level"), level: Schema.Int, met: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literal("spell"), index: text, name: text, met: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literal("feature"), index: text, name: text, met: Schema.Boolean }),
]);
export type LevelUpPrerequisite = typeof LevelUpPrerequisite.Type;

/** A feature a choice can pick, and whether its prerequisites are met. */
export const LevelUpFeatureOption = Schema.Struct({
  featureId: FeatureId,
  name: text,
  desc: prose,
  prerequisites: Schema.Array(LevelUpPrerequisite),
  /** Every prerequisite met. An option that is not is offered disabled, so its reason can be drawn. */
  available: Schema.Boolean,
});
export type LevelUpFeatureOption = typeof LevelUpFeatureOption.Type;

/**
 * One choice the level asks for, inside a feature it grants.
 *
 * - `feature`: pick features (*Fighting Style: Archery*, a metamagic, an
 *   invocation, a pact boon). `choose` is how many, at most the options
 *   available.
 * - `expertise`: pick proficiencies to double, already restricted to the
 *   skills the sheet marks proficient (and not already expert) and the tools
 *   on its proficiency list.
 * - `text`: pick from the source's own words (*Favored Enemy*: "fiends").
 */
export const LevelUpChoice = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("feature"),
    offeredBy: LevelUpOfferedBy,
    choose: Schema.Int,
    options: Schema.Array(LevelUpFeatureOption),
  }),
  Schema.Struct({
    kind: Schema.Literal("expertise"),
    offeredBy: LevelUpOfferedBy,
    choose: Schema.Int,
    options: Schema.Array(text),
  }),
  Schema.Struct({
    kind: Schema.Literal("text"),
    offeredBy: LevelUpOfferedBy,
    choose: Schema.Int,
    desc: Schema.optional(text),
    options: Schema.Array(text),
  }),
]);
export type LevelUpChoice = typeof LevelUpChoice.Type;

/** A subclass spell the level brings: always prepared, and not counted against a limit. */
export const LevelUpSpellGrant = Schema.Struct({
  spellId: SpellId,
  name: text,
  level: Schema.Int,
  /** Gained only with this pick — a Land druid's circle terrain. Absent when every member gains it. */
  featureId: Schema.optional(FeatureId),
});
export type LevelUpSpellGrant = typeof LevelUpSpellGrant.Type;

/** A spell a pick can learn. `list` says which list reached it: the class's, the subclass's, or any. */
export const LevelUpSpellOption = Schema.Struct({
  spellId: SpellId,
  name: text,
  level: Schema.Int,
  school: text,
  list: Schema.Literals(["class", "subclass", "any"]),
});
export type LevelUpSpellOption = typeof LevelUpSpellOption.Type;

/** One subclass the character can take, and what it brings with it now. */
export const LevelUpSubclassOption = Schema.Struct({
  subclassId: SubclassId,
  name: text,
  flavor: Schema.NullOr(text),
  desc: prose,
  /** Its features at or below the new level. */
  features: Schema.Array(LevelUpFeature),
  /** The choices those features ask for. */
  choices: Schema.Array(LevelUpChoice),
  /** Its spells at or below the new level. */
  spells: Schema.Array(LevelUpSpellGrant),
});
export type LevelUpSubclassOption = typeof LevelUpSubclassOption.Type;

export const LevelUpSubclass = Schema.Struct({
  /** The class level the subclass is chosen at. */
  level: Schema.Int,
  /** A typed subclass label that names none of these, kept until one is taken. */
  current: Schema.optional(text),
  options: Schema.Array(LevelUpSubclassOption),
});
export type LevelUpSubclass = typeof LevelUpSubclass.Type;

/** A feat the character's vocabulary has and whose prerequisites the sheet meets. */
export const LevelUpFeat = Schema.Struct({
  featId: FeatId,
  name: text,
  description: prose,
  /** Ability minimums, as the feat states them: `{ability: "STR", minimum: 13}`. */
  prerequisites: Schema.Array(Schema.Struct({ ability: text, minimum: Schema.Int })),
});
export type LevelUpFeat = typeof LevelUpFeat.Type;

/**
 * An *Ability Score Improvement*: two points, to one score or split over two,
 * none above `maximum` — or one of `feats` instead, present only when the
 * vocabulary has a feat whose prerequisites the sheet meets.
 */
export const LevelUpAbilityScoreImprovement = Schema.Struct({
  offeredBy: LevelUpOfferedBy,
  points: Schema.Int,
  maximum: Schema.Int,
  feats: Schema.optional(Schema.Array(LevelUpFeat)),
});
export type LevelUpAbilityScoreImprovement = typeof LevelUpAbilityScoreImprovement.Type;

export const LevelUpHitPoints = Schema.Struct({
  /** The class's hit die: `10` for a d10. */
  die: Schema.Int,
  /** What is added to the die: the CON modifier, and the race's per-level bonus. */
  bonus: Schema.Int,
  /** The hit points `fixed` adds. */
  fixed: Schema.Int,
  /** The least and the most `rolled` can add. */
  rolled: Schema.Struct({ minimum: Schema.Int, maximum: Schema.Int }),
});
export type LevelUpHitPoints = typeof LevelUpHitPoints.Type;

/** What the level changes with nobody choosing anything. */
export const LevelUpAutomatic = Schema.Struct({
  proficiencyBonus: Schema.optional(LevelUpNumberChange),
  /** Class features, and the named subclass's, granted at the new level. */
  features: Schema.Array(LevelUpFeature),
  /** Counters, slots and hit dice whose ceiling moves or appears: `res:rage` 3 → 4. */
  resources: Schema.Array(
    Schema.Struct({
      id: text,
      name: text,
      from: Schema.optional(Schema.Int),
      to: Schema.Int,
      unit: Schema.optional(text),
    }),
  ),
  /** Attacks per Attack action, when *Extra Attack* moves it. */
  attacksPerAction: Schema.optional(LevelUpNumberChange),
  /** The casting numbers the class table moves. */
  spellcasting: Schema.optional(
    Schema.Struct({
      save: Schema.optional(LevelUpTextChange),
      attack: Schema.optional(LevelUpTextChange),
      cantripsKnown: Schema.optional(LevelUpNumberChange),
      spellsKnown: Schema.optional(LevelUpNumberChange),
    }),
  ),
  /** The named subclass's spells gained at the new level. */
  subclassSpells: Schema.Array(LevelUpSpellGrant),
});
export type LevelUpAutomatic = typeof LevelUpAutomatic.Type;

/**
 * The spells the level lets the character learn, by the class's own casting
 * rule (the spell picker's: `mode`, the limits, the lists).
 *
 * - `cantrips` and `spells` are how many new ones: the table's growth for a
 *   known caster (less the Magical Secrets, which the Spells Known column
 *   already counts), two for a wizard's spellbook, none for a prepared caster
 *   (who re-prepares at any time with the picker; `prepared` is the new limit).
 * - `replace`: a known caster may swap one spell it knows for another.
 * - `options` are the class (and subclass) list at the new level's highest
 *   slot, without what the sheet already knows.
 * - `magicalSecrets` and `mysticArcanum` are their own pickers, from any list
 *   and from the class list at one level.
 */
export const LevelUpSpells = Schema.Struct({
  mode: SpellSelectionMode,
  highestSlotLevel: LevelUpNumberChange,
  cantrips: Schema.Int,
  spells: Schema.Int,
  replace: Schema.Boolean,
  prepared: Schema.optional(LevelUpNumberChange),
  options: Schema.Array(LevelUpSpellOption),
  magicalSecrets: Schema.optional(
    Schema.Struct({
      count: Schema.Int,
      maximumLevel: Schema.Int,
      options: Schema.Array(LevelUpSpellOption),
    }),
  ),
  mysticArcanum: Schema.optional(
    Schema.Struct({ level: Schema.Int, options: Schema.Array(LevelUpSpellOption) }),
  ),
});
export type LevelUpSpells = typeof LevelUpSpells.Type;

export const LevelUpOffer = Schema.Struct({
  characterId: CharacterId,
  /** The character's version the offer was read at: what a level-up write sends back. */
  version: Schema.Int,
  /** The class as the vocabulary names it, or as the row has it when it names none. */
  className: Schema.NullOr(text),
  fromLevel: Schema.Int,
  toLevel: Schema.Int,
  /** Absent when the class resolves to nothing in the vocabulary. */
  hitPoints: Schema.optional(LevelUpHitPoints),
  automatic: LevelUpAutomatic,
  /** At or past the subclass level, while the sheet names none of the class's subclasses. */
  subclass: Schema.optional(LevelUpSubclass),
  choices: Schema.Array(LevelUpChoice),
  abilityScoreImprovement: Schema.optional(LevelUpAbilityScoreImprovement),
  /** Absent for a class that never casts. */
  spells: Schema.optional(LevelUpSpells),
});
export type LevelUpOffer = typeof LevelUpOffer.Type;

/** A `feature` row of the character's class, as the server read it in the vocabulary. */
export interface LevelUpFeatureRow {
  readonly id: FeatureId;
  readonly index: string | null;
  readonly name: string;
  readonly level: number;
  readonly subclassId: SubclassId | null;
  readonly parentFeatureId: FeatureId | null;
  readonly body: FeatureBody;
}

/** A `subclass` row of the character's class, in the vocabulary. */
export interface LevelUpSubclassRow {
  readonly id: SubclassId;
  readonly name: string;
  readonly flavor: string | null;
  readonly body: SubclassBody;
}

/** A `subclass_spell` line, with the spell it names. `level` is the class level it is gained at. */
export interface LevelUpSubclassSpellRow {
  readonly subclassId: SubclassId;
  readonly spellId: SpellId;
  readonly name: string;
  readonly spellLevel: number;
  readonly level: number;
  readonly featureId: FeatureId | null;
}

/** A feat in the vocabulary, and its ability minimums grouped as the row groups them. */
export interface LevelUpFeatRow {
  readonly id: FeatId;
  readonly name: string;
  readonly description: ReadonlyArray<string>;
  readonly prerequisites: ReadonlyArray<{
    readonly groupOrdinal: number;
    readonly ability: string;
    readonly minimumScore: number;
  }>;
}

/** A spell row as the wide pickers read it: any class's list. */
export interface LevelUpSpellRow {
  readonly id: SpellId;
  readonly name: string;
  readonly level: number;
  readonly schoolName: string;
  readonly classNames: ReadonlyArray<string>;
}

/** What {@link levelUpOfferFor} assembles from: the character, and its vocabulary's rows. */
export interface LevelUpOfferSources {
  readonly character: {
    readonly id: CharacterId;
    readonly version: number;
    readonly level: number | null;
    readonly className: string | null;
    readonly subrace: string | null;
    readonly body: SheetBody;
  };
  /** The class, hydrated with `details`; absent when it resolves to nothing. */
  readonly classOption?: ClassOption | undefined;
  readonly raceOption?: RaceOption | undefined;
  /** Every feature row of the class, class and subclass alike. */
  readonly features: ReadonlyArray<LevelUpFeatureRow>;
  readonly subclasses: ReadonlyArray<LevelUpSubclassRow>;
  readonly subclassSpells: ReadonlyArray<LevelUpSubclassSpellRow>;
  readonly feats: ReadonlyArray<LevelUpFeatRow>;
  /** The spell picker's rules at the current level and the next; absent for a class that never casts. */
  readonly spellRules?: { readonly from: CharacterSpellRules; readonly to: CharacterSpellRules };
  /** Every spell in the vocabulary, when {@link levelUpWideSpells} says the level needs them. */
  readonly wideSpells?: ReadonlyArray<LevelUpSpellRow> | undefined;
}

const wanted = (label: string | null | undefined): string => (label ?? "").trim().toLowerCase();

const present = (label: string | null | undefined): string | undefined => {
  const trimmed = label?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

/** `"Eldritch Blast"` → `"eldritch-blast"`: how the source's prerequisites name a spell or a feature. */
const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** `"pact-of-the-blade"` → `"Pact Of The Blade"`, for a source key nothing in the vocabulary names. */
const titled = (index: string): string =>
  index
    .split("-")
    .filter((word) => word !== "")
    .map((word) => `${word[0]!.toUpperCase()}${word.slice(1)}`)
    .join(" ");

/** The last segment of `"/api/2014/features/pact-of-the-blade"`. */
const lastSegment = (url: string): string =>
  url
    .split("/")
    .filter((part) => part !== "")
    .at(-1) ?? "";

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const counterAt = (classOption: ClassOption, level: number, key: string): number => {
  const value = classLevelAt(classOption, level)?.classSpecific?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

/** How far each counter matching `pattern` rose between the two levels, keyed by its captured number. */
const risen = (
  classOption: ClassOption,
  fromLevel: number,
  toLevel: number,
  pattern: RegExp,
): ReadonlyArray<{ readonly at: number; readonly by: number }> => {
  const keys = new Set(
    [classLevelAt(classOption, fromLevel), classLevelAt(classOption, toLevel)].flatMap((row) =>
      Object.keys(row?.classSpecific ?? {}),
    ),
  );
  return [...keys].flatMap((key) => {
    const at = pattern.exec(key)?.[1];
    if (at === undefined) return [];
    const by = counterAt(classOption, toLevel, key) - counterAt(classOption, fromLevel, key);
    return by > 0 ? [{ at: Number(at), by }] : [];
  });
};

/**
 * The two wide spell pickers the next level opens, read off the class table's
 * counters: *Magical Secrets* (`magical_secrets_max_N`, spells of any list up
 * to level N) and *Mystic Arcanum* (`mystic_arcanum_level_N`, one class spell
 * of level N). The server reads every spell in the vocabulary only when one of
 * them is present.
 */
export const levelUpWideSpells = (
  classOption: ClassOption | undefined,
  fromLevel: number,
): {
  readonly magicalSecrets?: { readonly count: number; readonly maximumLevel: number };
  readonly mysticArcanum?: { readonly level: number };
} => {
  if (classOption === undefined) return {};
  const from = levelOf(fromLevel);
  const secrets = risen(classOption, from, from + 1, /^magical_secrets_max_(\d+)$/);
  const arcanum = risen(classOption, from, from + 1, /^mystic_arcanum_level_(\d+)$/);
  return {
    ...(secrets.length === 0
      ? {}
      : {
          magicalSecrets: {
            count: secrets.reduce((total, entry) => total + entry.by, 0),
            maximumLevel: Math.max(...secrets.map((entry) => entry.at)),
          },
        }),
    ...(arcanum.length === 0
      ? {}
      : { mysticArcanum: { level: Math.max(...arcanum.map((entry) => entry.at)) } }),
  };
};

/** The 2014 ASI feature, by its source key (`fighter-ability-score-improvement-1`) or its name. */
const isAbilityScoreImprovement = (row: LevelUpFeatureRow): boolean =>
  /ability-score-improvement/.test(row.index ?? "") ||
  wanted(row.name) === "ability score improvement";

/** The `from.options` of a source choice, flattened through nested choices. */
const optionItems = (from: unknown): ReadonlyArray<unknown> => {
  const options = record(from)?.options;
  if (!Array.isArray(options)) return [];
  return options.flatMap((option): ReadonlyArray<unknown> => {
    const entry = record(option);
    if (entry === undefined) return [option];
    if (entry.option_type === "reference") return [entry.item];
    if (entry.option_type === "choice") return optionItems(record(entry.choice)?.from);
    return [];
  });
};

/**
 * The count a source choice asks for. A choice whose options are themselves
 * choices (*Expertise* at rogue 1: two skills, or one skill and thieves' tools)
 * is the inner count over every inner option, which is the same set of picks.
 */
const choiceCount = (choice: Record<string, unknown>): number => {
  const options = record(choice.from)?.options;
  const inner = Array.isArray(options)
    ? options.map((option) => record(record(option)?.choice)?.choose).find(Number.isInteger)
    : undefined;
  const count = inner ?? choice.choose;
  return typeof count === "number" && Number.isInteger(count) ? count : 0;
};

/** The sheet facts a choice and a prerequisite are read against. */
interface Held {
  readonly toLevel: number;
  readonly featureIds: ReadonlySet<string>;
  readonly featureNames: ReadonlySet<string>;
  readonly spellSlugs: ReadonlySet<string>;
  readonly byIndex: ReadonlyMap<string, LevelUpFeatureRow>;
}

const holds = (held: Held, row: LevelUpFeatureRow): boolean =>
  held.featureIds.has(row.id) || held.featureNames.has(wanted(row.name));

/**
 * An option's typed prerequisites. A type the source may add later and this
 * does not know is left out rather than guessed at.
 */
const prerequisitesOf = (row: LevelUpFeatureRow, held: Held): ReadonlyArray<LevelUpPrerequisite> =>
  row.body.prerequisites.flatMap((entry): ReadonlyArray<LevelUpPrerequisite> => {
    const prerequisite = record(entry);
    if (prerequisite?.type === "level" && typeof prerequisite.level === "number") {
      return [
        { type: "level", level: prerequisite.level, met: held.toLevel >= prerequisite.level },
      ];
    }
    if (prerequisite?.type === "spell" && typeof prerequisite.spell === "string") {
      const index = lastSegment(prerequisite.spell);
      return [{ type: "spell", index, name: titled(index), met: held.spellSlugs.has(index) }];
    }
    if (prerequisite?.type === "feature" && typeof prerequisite.feature === "string") {
      const index = lastSegment(prerequisite.feature);
      const feature = held.byIndex.get(index);
      const name = feature?.name ?? titled(index);
      const met =
        feature === undefined ? held.featureNames.has(wanted(name)) : holds(held, feature);
      return [{ type: "feature", index, name, met }];
    }
    return [];
  });

/** Feature options by source key, without what the sheet already holds. */
const featureChoice = (
  offeredBy: LevelUpFeatureRow,
  count: number,
  indexes: ReadonlyArray<string>,
  held: Held,
): ReadonlyArray<LevelUpChoice> => {
  const options = indexes.flatMap((index): ReadonlyArray<LevelUpFeatureOption> => {
    const row = held.byIndex.get(index);
    if (row === undefined || holds(held, row)) return [];
    const prerequisites = prerequisitesOf(row, held);
    return [
      {
        featureId: row.id,
        name: row.name,
        desc: row.body.desc,
        prerequisites,
        available: prerequisites.every((prerequisite) => prerequisite.met),
      },
    ];
  });
  const choose = Math.min(count, options.filter((option) => option.available).length);
  return choose <= 0
    ? []
    : [
        {
          kind: "feature",
          offeredBy: { featureId: offeredBy.id, name: offeredBy.name },
          choose,
          options,
        },
      ];
};

const itemIndex = (item: unknown): string | undefined => {
  const index = record(item)?.index;
  return typeof index === "string" ? index : undefined;
};

/**
 * The choices one granted feature asks for, read off its `featureSpecific` —
 * not off `parent_feature_id`, which misses the features that offer another
 * feature's children (*Metamagic* at 10 and 17, the Champion's *Additional
 * Fighting Style*). Invocations are counted elsewhere: their count is the
 * class table's, not the feature's.
 */
const choicesOf = (
  row: LevelUpFeatureRow,
  held: Held,
  body: SheetBody,
): ReadonlyArray<LevelUpChoice> => {
  const specific = row.body.featureSpecific ?? {};
  const offeredBy = { featureId: row.id, name: row.name };
  return Object.entries(specific).flatMap(([key, value]): ReadonlyArray<LevelUpChoice> => {
    const choice = record(value);
    if (choice === undefined || !key.endsWith("_options")) return [];
    const count = choiceCount(choice);
    const items = optionItems(choice.from);
    if (key === "subfeature_options") {
      return featureChoice(
        row,
        count,
        items.flatMap((item) => itemIndex(item) ?? []),
        held,
      );
    }
    if (key === "expertise_options") {
      const options = expertiseOptions(items, body);
      const choose = Math.min(count, options.length);
      return choose <= 0 ? [] : [{ kind: "expertise", offeredBy, choose, options }];
    }
    if (choice.type === "string") {
      const options = items.filter((item): item is string => typeof item === "string");
      const choose = Math.min(count, options.length);
      const desc = typeof choice.desc === "string" ? choice.desc : undefined;
      return choose <= 0
        ? []
        : [{ kind: "text", offeredBy, choose, ...(desc === undefined ? {} : { desc }), options }];
    }
    return [];
  });
};

/**
 * Expertise is for what the character is already proficient in: a skill the
 * sheet marks proficient and not yet expert, or a tool on its proficiency list
 * (*Thieves' Tools*). The source lists every skill; the restriction is the
 * rule's prose, written here.
 */
const expertiseOptions = (
  items: ReadonlyArray<unknown>,
  body: SheetBody,
): ReadonlyArray<string> => {
  const skills = new Map((body.skills ?? []).map((skill) => [wanted(skill.name), skill]));
  const proficiencies = new Set((body.proficiencies ?? []).map(wanted));
  const names = items.flatMap((item) => {
    const name = record(item)?.name;
    return typeof name === "string" ? [name.replace(/^skill:\s*/i, "").trim()] : [];
  });
  return [...new Set(names)].flatMap((name) => {
    const skill = skills.get(wanted(name));
    if (skill !== undefined) {
      return skill.proficient === true && skill.expertise !== true ? [skill.name] : [];
    }
    return proficiencies.has(wanted(name)) ? [name] : [];
  });
};

const featureOf = (row: LevelUpFeatureRow): LevelUpFeature => ({
  featureId: row.id,
  name: row.name,
  level: row.level,
  desc: row.body.desc,
});

/** Every prerequisite of some one group met, or none stated. */
const featMet = (feat: LevelUpFeatRow, body: SheetBody): boolean => {
  if (feat.prerequisites.length === 0) return true;
  const score = (ability: string): number | undefined => {
    const cell = body.abilities.find((entry) => wanted(entry.label) === wanted(ability));
    const value = Number(cell?.score.trim());
    return cell !== undefined && Number.isInteger(value) ? value : undefined;
  };
  const groups = new Map<number, Array<LevelUpFeatRow["prerequisites"][number]>>();
  for (const prerequisite of feat.prerequisites) {
    groups.set(prerequisite.groupOrdinal, [
      ...(groups.get(prerequisite.groupOrdinal) ?? []),
      prerequisite,
    ]);
  }
  return [...groups.values()].some((group) =>
    group.every((prerequisite) => (score(prerequisite.ability) ?? 0) >= prerequisite.minimumScore),
  );
};

const featOf = (feat: LevelUpFeatRow): LevelUpFeat => ({
  featId: feat.id,
  name: feat.name,
  description: feat.description,
  prerequisites: feat.prerequisites.map((prerequisite) => ({
    ability: prerequisite.ability,
    minimum: prerequisite.minimumScore,
  })),
});

const numberChange = (
  from: number | undefined,
  to: number | undefined,
): LevelUpNumberChange | undefined =>
  to === undefined || from === to ? undefined : { ...(from === undefined ? {} : { from }), to };

const textChange = (
  from: string | undefined,
  to: string | undefined,
): LevelUpTextChange | undefined =>
  to === undefined || from === to ? undefined : { ...(from === undefined ? {} : { from }), to };

/** The level's automatic half: what `levelGrantsFor` grants at the new level and did not at the old. */
const automaticOf = (
  from: LevelGrants,
  to: LevelGrants,
  gained: ReadonlyArray<LevelUpFeature>,
  subclassSpells: ReadonlyArray<LevelUpSpellGrant>,
): LevelUpAutomatic => {
  const before = new Map(from.resources.map((resource) => [resource.id, resource]));
  const resources = to.resources.flatMap((resource) => {
    const was = before.get(resource.id);
    return was?.max === resource.max
      ? []
      : [
          {
            id: resource.id,
            name: resource.name,
            ...(was === undefined ? {} : { from: was.max }),
            to: resource.max,
            ...(resource.unit === undefined ? {} : { unit: resource.unit }),
          },
        ];
  });
  const casting = {
    save: textChange(from.spellcasting?.save, to.spellcasting?.save),
    attack: textChange(from.spellcasting?.attack, to.spellcasting?.attack),
    cantripsKnown: numberChange(from.spellcasting?.cantripsKnown, to.spellcasting?.cantripsKnown),
    spellsKnown: numberChange(from.spellcasting?.spellsKnown, to.spellcasting?.spellsKnown),
  };
  const spellcasting = Object.fromEntries(
    Object.entries(casting).filter(([, value]) => value !== undefined),
  );
  const proficiencyBonus = numberChange(from.proficiencyBonus, to.proficiencyBonus);
  const attacksPerAction = numberChange(from.attacksPerAction, to.attacksPerAction);
  return {
    ...(proficiencyBonus === undefined ? {} : { proficiencyBonus }),
    features: gained,
    resources,
    ...(attacksPerAction === undefined ? {} : { attacksPerAction }),
    ...(Object.keys(spellcasting).length === 0 ? {} : { spellcasting }),
    subclassSpells,
  };
};

const spellGrantOf = (row: LevelUpSubclassSpellRow): LevelUpSpellGrant => ({
  spellId: row.spellId,
  name: row.name,
  level: row.spellLevel,
  ...(row.featureId === null ? {} : { featureId: row.featureId }),
});

const spellOptionOf = (
  spell: {
    readonly id: SpellId;
    readonly name: string;
    readonly level: number;
    readonly schoolName: string;
  },
  list: LevelUpSpellOption["list"],
): LevelUpSpellOption => ({
  spellId: spell.id,
  name: spell.name,
  level: spell.level,
  school: spell.schoolName,
  list,
});

/** The spells half, by the picker's rules at both levels. */
const spellsOf = (
  sources: LevelUpOfferSources,
  classOption: ClassOption,
  fromLevel: number,
): LevelUpSpells | undefined => {
  const rules = sources.spellRules;
  if (rules === undefined || rules.to.mode === "none") return undefined;
  const { from, to } = rules;
  const known = new Set(
    (sources.character.body.spellcasting?.known ?? []).flatMap((spell) =>
      spell.spellId === undefined || spell.spellId === null ? [] : [spell.spellId],
    ),
  );
  const grow = (key: "cantripsKnown" | "spellsKnown") =>
    Math.max(0, (to.limits[key] ?? 0) - (from.limits[key] ?? 0));
  const wide = levelUpWideSpells(classOption, fromLevel);
  const cantrips = grow("cantripsKnown");
  const spells =
    to.mode === "known" || to.mode === "spellbook"
      ? Math.max(0, grow("spellsKnown") - (wide.magicalSecrets?.count ?? 0))
      : 0;
  const replace = to.mode === "known";
  const options = to.spells.flatMap((option) =>
    known.has(option.spell.id) ||
    (option.spell.level === 0 ? cantrips === 0 : spells === 0 && !replace)
      ? []
      : [spellOptionOf(option.spell, option.list)],
  );
  const everySpell = (sources.wideSpells ?? []).filter((spell) => !known.has(spell.id));
  const prepared = numberChange(from.limits.prepared, to.limits.prepared);
  return {
    mode: to.mode,
    highestSlotLevel: { from: from.highestSlotLevel, to: to.highestSlotLevel },
    cantrips,
    spells,
    replace,
    ...(prepared === undefined ? {} : { prepared }),
    options,
    ...(wide.magicalSecrets === undefined
      ? {}
      : {
          magicalSecrets: {
            ...wide.magicalSecrets,
            options: everySpell
              .filter((spell) => spell.level <= wide.magicalSecrets!.maximumLevel)
              .map((spell) => spellOptionOf(spell, "any")),
          },
        }),
    ...(wide.mysticArcanum === undefined
      ? {}
      : {
          mysticArcanum: {
            ...wide.mysticArcanum,
            options: everySpell
              .filter(
                (spell) =>
                  spell.level === wide.mysticArcanum!.level &&
                  spell.classNames.some((name) => wanted(name) === wanted(classOption.name)),
              )
              .map((spell) => spellOptionOf(spell, "class")),
          },
        }),
  };
};

/**
 * **The one assembly of a level-up offer.** Pure over what the server read in
 * the character's vocabulary, so the read (`repo/Advancement.ts`), the
 * level-up write's validation and the web's review cannot disagree about what
 * level N + 1 offers.
 *
 * - **Automatic**: the difference between `levelGrantsFor` at the two levels,
 *   with each new feature's prose, and the named subclass's spells gained now.
 * - **Hit points**: the hit die and what is added to it, fixed or rolled.
 * - **Subclass**: at or past the subclass level (the lowest level of the
 *   class's subclass features) while `identity.subclass` names none of the
 *   class's subclasses; each option carries its features, choices and spells.
 * - **Choices**: from the features the level grants (`featureSpecific`), plus
 *   new invocations while the table's `invocations_known` rises. Options the
 *   sheet already holds are left out; an option whose prerequisites are not
 *   met is offered disabled.
 * - **Ability Score Improvement**: when the level grants the ASI feature (the
 *   feature rows, never `ability_score_bonuses`, which is wrong for a rogue),
 *   with the feats whose prerequisites the sheet meets.
 * - **Spells**: the picker's rule at both levels, and the wide pickers.
 *
 * A class with no progression rows (homebrew) offers its hit points and hit
 * dice and nothing else; a class that resolves to nothing offers nothing.
 */
export const levelUpOfferFor = (sources: LevelUpOfferSources): LevelUpOffer => {
  const { character, classOption } = sources;
  const body = character.body;
  const fromLevel = levelOf(character.level ?? undefined);
  const toLevel = fromLevel + 1;
  const base = {
    characterId: character.id,
    version: character.version,
    className: classOption?.name ?? present(character.className) ?? null,
    fromLevel,
    toLevel,
  };
  if (classOption === undefined) {
    return { ...base, automatic: { features: [], resources: [], subclassSpells: [] }, choices: [] };
  }

  const raceOption = sources.raceOption;
  const subrace = subraceNamed(raceOption?.body, character.subrace);
  const label = present(body.identity?.subclass);
  const grantsAt = (level: number) =>
    levelGrantsFor({
      classOption,
      raceOption,
      subraceName: subrace?.name ?? present(character.subrace),
      subclass: label,
      level,
      abilities: body.abilities,
    });
  const from = grantsAt(fromLevel);
  const to = grantsAt(toLevel);

  const byId = new Map(sources.features.map((row) => [row.id, row]));
  // What the sheet holds, and what the new level grants by itself: an option
  // the level grants outright is not a choice (the 2014 source gives
  // *Metamagic: Twinned Spell* no parent, so sorcerer 3 grants it and
  // *Metamagic* lists it too).
  const held: Held = {
    toLevel,
    featureIds: new Set([
      ...body.traits.flatMap((trait) => trait.featureId ?? []),
      ...to.features.flatMap((feature) => feature.featureId ?? []),
    ]),
    featureNames: new Set([
      ...body.traits.map((trait) => wanted(trait.name)),
      ...to.features.map((feature) => wanted(feature.name)),
    ]),
    spellSlugs: new Set((body.spellcasting?.known ?? []).map((spell) => slug(spell.name))),
    byIndex: new Map(
      sources.features.flatMap((row) => (row.index === null ? [] : [[row.index, row] as const])),
    ),
  };

  // The features the new level grants and the old did not, class and named subclass.
  const before = new Set(from.features.flatMap((feature) => feature.featureId ?? []));
  const gainedRows = to.features.flatMap((feature) =>
    feature.featureId === undefined || feature.featureId === null || before.has(feature.featureId)
      ? []
      : (byId.get(feature.featureId) ?? []),
  );
  const resolved = sources.subclasses.find((row) => wanted(row.name) === wanted(label));
  const subclassSpells =
    resolved === undefined
      ? []
      : sources.subclassSpells
          .filter(
            (row) =>
              row.subclassId === resolved.id &&
              row.level === toLevel &&
              (row.featureId === null || held.featureIds.has(row.featureId)),
          )
          .map(spellGrantOf);

  // New invocations: the count is the class table's, the options the granting feature's.
  const invocationsBy =
    counterAt(classOption, toLevel, "invocations_known") -
    counterAt(classOption, fromLevel, "invocations_known");
  const granted = new Set(to.features.flatMap((feature) => feature.featureId ?? []));
  const invocations =
    invocationsBy <= 0
      ? []
      : sources.features.flatMap((row) => {
          const list = row.body.featureSpecific?.invocations;
          return granted.has(row.id) && Array.isArray(list)
            ? featureChoice(
                row,
                invocationsBy,
                list.flatMap((item) => itemIndex(item) ?? []),
                held,
              )
            : [];
        });

  const subclassFeatures = sources.features.filter(
    (row) => row.subclassId !== null && row.parentFeatureId === null,
  );
  const subclassLevel =
    subclassFeatures.length === 0
      ? undefined
      : Math.min(...subclassFeatures.map((row) => row.level));
  const subclass: LevelUpSubclass | undefined =
    subclassLevel === undefined ||
    toLevel < subclassLevel ||
    resolved !== undefined ||
    sources.subclasses.length === 0
      ? undefined
      : {
          level: subclassLevel,
          ...(label === undefined ? {} : { current: label }),
          options: sources.subclasses.map((option) => {
            const rows = subclassFeatures.filter(
              (row) => row.subclassId === option.id && row.level <= toLevel,
            );
            return {
              subclassId: option.id,
              name: option.name,
              flavor: option.flavor,
              desc: option.body.desc,
              features: rows.map(featureOf),
              choices: rows.flatMap((row) => choicesOf(row, held, body)),
              spells: sources.subclassSpells
                .filter((row) => row.subclassId === option.id && row.level <= toLevel)
                .map(spellGrantOf),
            };
          }),
        };

  const asi = gainedRows.find(isAbilityScoreImprovement);
  const feats = sources.feats
    .filter((feat) => featMet(feat, body) && !held.featureNames.has(wanted(feat.name)))
    .map(featOf);

  const die = classOption.body.hitDie;
  const bonus =
    modifierOf(body.abilities, "CON") +
    (raceOption?.body.hpPerLevel ?? 0) +
    (subrace?.hpPerLevel ?? 0);
  const spells = spellsOf(sources, classOption, fromLevel);

  return {
    ...base,
    hitPoints: {
      die,
      bonus,
      fixed: averageHitDie(die) + bonus,
      rolled: { minimum: 1 + bonus, maximum: die + bonus },
    },
    automatic: automaticOf(from, to, gainedRows.map(featureOf), subclassSpells),
    ...(subclass === undefined ? {} : { subclass }),
    choices: [...gainedRows.flatMap((row) => choicesOf(row, held, body)), ...invocations],
    ...(asi === undefined
      ? {}
      : {
          abilityScoreImprovement: {
            offeredBy: { featureId: asi.id, name: asi.name },
            points: 2,
            maximum: 20,
            ...(feats.length === 0 ? {} : { feats }),
          },
        }),
    ...(spells === undefined ? {} : { spells }),
  };
};
