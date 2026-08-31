import { emptyStatBlock, StatBlock, type CreatureCreate } from "@taverns/api";
import { Effect, Schema } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import { EQUIPMENT_RAW } from "../equipment/systemEquipment.js";
import { SPELL_RAW } from "../spells/systemSpells.js";
import { crSortFor } from "../repo/Creatures.js";
import {
  beginRulesImport,
  FIVE_E_BITS_2014_SOURCE,
  sourceLinkFor,
  sourceRevisionFor,
  TAVERNS_STARTER_SOURCE,
  type RulesSourceDefinition,
  type RulesImportContext,
  type SourceRevision,
} from "../ruleset/source.js";
import { SYSTEM_CREATURES, type SystemCreature } from "./systemCreatures.js";
import {
  MONSTER_CONDITION_RAW,
  MONSTER_DAMAGE_TYPE_RAW,
  MONSTER_PROFICIENCY_RAW,
  MONSTER_RAW,
} from "./systemMonsters.js";

/** What one run of the import did. */
export interface ImportResult {
  readonly inserted: number;
  readonly updated: number;
}

/** What one run of the 2014 5e-bits/SRD monster import did. */
export interface ImportMonstersResult extends ImportResult {
  readonly seen: number;
}

/** What `pnpm -F server bestiary:import` loads. */
export interface ImportBestiaryResult {
  readonly starter: ImportResult;
  readonly srd: ImportMonstersResult;
}

interface SourceCreature extends Omit<CreatureCreate, "visibility"> {
  /** Stable source identity within the source document; not a display name. */
  readonly sourceIndex: string;
  readonly sourceUrl?: string;
  /** The exact source row to store as the source revision. */
  readonly raw?: unknown;
}

interface SourceRef {
  readonly index: string;
  readonly name: string;
  readonly url?: string;
}

const decodeStatBlock = Schema.decodeUnknownSync(StatBlock);

const sourceUrlFor = (url: string | undefined): string | undefined =>
  url === undefined ? undefined : `https://www.dnd5eapi.co${url}`;

const rawString = (row: Record<string, unknown>, key: string): string => {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`monster source ${key} must be text`);
  return value;
};

const rawText = (row: Record<string, unknown>, key: string): string => {
  const value = rawString(row, key);
  if (value.trim() === "") throw new Error(`monster source ${key} is required`);
  return value;
};

const optionalText = (row: Record<string, unknown>, key: string): string | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`monster source ${key} must be text`);
  return value;
};

const rawNumber = (row: Record<string, unknown>, key: string): number => {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`monster source ${key} must be a number`);
  }
  return value;
};

const optionalNumber = (row: Record<string, unknown>, key: string): number | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`monster source ${key} must be a number when present`);
  }
  return value;
};

const rawTexts = (row: Record<string, unknown>, key: string): ReadonlyArray<string> => {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`monster source ${key} must be an array of strings`);
  }
  return value;
};

const descriptionOf = (row: Record<string, unknown>): ReadonlyArray<string> | undefined => {
  const value = row.desc;
  if (value === undefined) return undefined;
  if (typeof value === "string") return value.trim() === "" ? undefined : [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  throw new Error("monster source desc must be text or an array of text");
};

const recordOf = (value: unknown, key: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`monster ${key} is required`);
  }
  return value as Record<string, unknown>;
};

const optionalRecord = (
  row: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  return recordOf(value, key);
};

const recordsOf = (
  row: Record<string, unknown>,
  key: string,
): ReadonlyArray<Record<string, unknown>> => {
  const value = row[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`monster source ${key} must be an array`);
  return value.map((item) => recordOf(item, key));
};

const refOf = (value: unknown, key: string): SourceRef => {
  const row = recordOf(value, key);
  const index = rawText(row, "index");
  const name = rawText(row, "name");
  const url = optionalText(row, "url");
  return url === undefined ? { index, name } : { index, name, url };
};

const refsOf = (row: Record<string, unknown>, key: string): ReadonlyArray<SourceRef> =>
  recordsOf(row, key).map((item) => refOf(item, key));

const sourceFamilyOf = (url: string | undefined): string | undefined =>
  url?.match(/^\/api\/2014\/([^/]+)\//)?.[1];

const sourceIndexFromUrl = (url: string | undefined, family: string): string | undefined => {
  const escaped = family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return url?.match(new RegExp(`^/api/2014/${escaped}/([^/]+)$`))?.[1];
};

const signed = (value: number): string => (value >= 0 ? `+${value}` : String(value));
const modifierOf = (score: number): number => Math.floor((score - 10) / 2);

const crText = (challenge: number): string => {
  if (challenge === 0.125) return "1/8";
  if (challenge === 0.25) return "1/4";
  if (challenge === 0.5) return "1/2";
  return Number.isInteger(challenge) ? String(challenge) : String(challenge);
};

const speedLine = (speed: Record<string, unknown>): string =>
  ["walk", "burrow", "climb", "fly", "swim"]
    .flatMap((mode) => {
      const value = speed[mode];
      if (typeof value !== "string" || value.trim() === "") return [];
      return [mode === "walk" ? value : `${mode} ${value}`];
    })
    .concat(speed.hover === true ? ["hover"] : [])
    .join(", ");

const movementModesOf = (speed: Record<string, unknown>): ReadonlyArray<string> =>
  ["walk", "burrow", "climb", "fly", "swim"]
    .filter((mode) => typeof speed[mode] === "string" && (speed[mode] as string).trim() !== "")
    .concat(speed.hover === true ? ["hover"] : []);

const armorClassLine = (
  armor: ReadonlyArray<Record<string, unknown>>,
  fallback: number,
): string => {
  const first = armor[0];
  if (first === undefined) return String(fallback);
  const value = rawNumber(first, "value");
  const names = refsOf(first, "armor").map((item) => item.name.toLowerCase());
  const desc = optionalText(first, "desc");
  const spell = optionalRecord(first, "spell");
  const condition = optionalRecord(first, "condition");
  const parenthetical =
    names.length > 0
      ? names.join(", ")
      : desc !== undefined && desc.trim() !== ""
        ? desc
        : spell !== undefined
          ? rawText(spell, "name")
          : condition !== undefined
            ? rawText(condition, "name")
            : rawText(first, "type") === "dex"
              ? ""
              : rawText(first, "type");
  return parenthetical.trim() === "" ? String(value) : `${value} (${parenthetical})`;
};

const usageOf = (row: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (row === undefined) return undefined;
  return {
    type: rawText(row, "type"),
    ...(typeof row.dice === "string" ? { dice: row.dice } : {}),
    ...(typeof row.min_value === "number" ? { minValue: row.min_value } : {}),
    ...(typeof row.times === "number" ? { times: row.times } : {}),
    ...(Array.isArray(row.rest_types) && row.rest_types.every((item) => typeof item === "string")
      ? { restTypes: row.rest_types }
      : {}),
  };
};

const dcOf = (row: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (row === undefined) return undefined;
  return {
    dcType: refOf(row.dc_type, "dc_type"),
    dcValue: rawNumber(row, "dc_value"),
    successType: rawText(row, "success_type"),
    ...(typeof row.desc === "string" ? { desc: row.desc } : {}),
  };
};

const damageOf = (value: unknown): Record<string, unknown> => {
  const row = recordOf(value, "damage");
  const damageType =
    row.damage_type === undefined ? undefined : refOf(row.damage_type, "damage_type");
  if (damageType === undefined) return { choice: row };
  return {
    damageType,
    ...(typeof row.damage_dice === "string" ? { damageDice: row.damage_dice } : {}),
  };
};

const damagesOf = (
  row: Record<string, unknown>,
): ReadonlyArray<Record<string, unknown>> | undefined => {
  const value = row.damage;
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("monster damage must be an array");
  return value.map(damageOf);
};

const actionItemsOf = (
  row: Record<string, unknown>,
  key: "actions" | "attacks",
): ReadonlyArray<Record<string, unknown>> | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`monster ${key} must be an array`);
  if (key === "attacks") {
    return value.map((item) => {
      const attack = recordOf(item, key);
      return {
        name: rawText(attack, "name"),
        dc: dcOf(recordOf(attack.dc, "dc")),
        ...(damagesOf(attack) === undefined ? {} : { damage: damagesOf(attack) }),
      };
    });
  }
  return value.map((item) => {
    const action = recordOf(item, key);
    return {
      actionName: rawText(action, "action_name"),
      count:
        typeof action.count === "number" || typeof action.count === "string" ? action.count : 1,
      type: rawText(action, "type"),
    };
  });
};

const spellcastingOf = (
  row: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
  if (row === undefined) return undefined;
  const spells = recordsOf(row, "spells").map((spell) => ({
    name: rawText(spell, "name"),
    level: rawNumber(spell, "level"),
    url: rawText(spell, "url"),
    ...(usageOf(optionalRecord(spell, "usage")) === undefined
      ? {}
      : { usage: usageOf(optionalRecord(spell, "usage")) }),
    ...(typeof spell.notes === "string" ? { notes: spell.notes } : {}),
  }));
  return {
    ability: refOf(row.ability, "ability"),
    componentsRequired: rawTexts(row, "components_required"),
    spells,
    ...(typeof row.level === "number" ? { level: row.level } : {}),
    ...(typeof row.dc === "number" ? { dc: row.dc } : {}),
    ...(typeof row.modifier === "number" ? { modifier: row.modifier } : {}),
    ...(typeof row.school === "string" ? { school: row.school } : {}),
    ...(row.slots !== undefined ? { slots: recordOf(row.slots, "slots") } : {}),
  };
};

const featureOf = (row: Record<string, unknown>): Record<string, unknown> => {
  const usage = usageOf(optionalRecord(row, "usage"));
  const dc = dcOf(optionalRecord(row, "dc"));
  const damage = damagesOf(row);
  const spellcasting = spellcastingOf(optionalRecord(row, "spellcasting"));
  const actions = actionItemsOf(row, "actions");
  const attacks = actionItemsOf(row, "attacks");
  return {
    name: rawText(row, "name"),
    desc: rawText(row, "desc"),
    ...(typeof row.attack_bonus === "number" ? { attackBonus: row.attack_bonus } : {}),
    ...(dc === undefined ? {} : { dc }),
    ...(usage === undefined ? {} : { usage }),
    ...(typeof row.multiattack_type === "string" ? { multiattackType: row.multiattack_type } : {}),
    ...(actions === undefined ? {} : { actions }),
    ...(row.action_options === undefined
      ? {}
      : { actionOptions: recordOf(row.action_options, "action_options") }),
    ...(attacks === undefined ? {} : { attacks }),
    ...(row.options === undefined ? {} : { options: recordOf(row.options, "options") }),
    ...(damage === undefined ? {} : { damage }),
    ...(spellcasting === undefined ? {} : { spellcasting }),
  };
};

const scoreBy = {
  STR: "strength",
  DEX: "dexterity",
  CON: "constitution",
  INT: "intelligence",
  WIS: "wisdom",
  CHA: "charisma",
} as const;

const abilitiesOf = (
  row: Record<string, unknown>,
  proficiencies: ReadonlyArray<Record<string, unknown>>,
) =>
  Object.entries(scoreBy).map(([label, key]) => {
    const score = rawNumber(row, key);
    const proficiency = proficiencies.find((entry) =>
      rawText(recordOf(entry.proficiency, "proficiency"), "index").endsWith(
        `-${label.toLowerCase()}`,
      ),
    );
    const save = proficiency === undefined ? undefined : signed(rawNumber(proficiency, "value"));
    return {
      label,
      score: String(score),
      modifier: signed(modifierOf(score)),
      ...(save === undefined ? {} : { save, proficient: true }),
    };
  });

const transformedMonster = (row: Record<string, unknown>): SourceCreature => {
  const proficiencies = recordsOf(row, "proficiencies");
  const speed = recordOf(row.speed, "speed");
  const armor = recordsOf(row, "armor_class");
  const challenge = rawNumber(row, "challenge_rating");
  const cr = crText(challenge);
  const name = rawText(row, "name");
  const size = rawText(row, "size");
  const type = rawText(row, "type");
  const subtype = optionalText(row, "subtype");
  const alignment = rawText(row, "alignment");
  const hp = rawNumber(row, "hit_points");
  const hitDice = rawText(row, "hit_dice");
  const hitPointsRoll = rawText(row, "hit_points_roll");
  const specialAbilities = recordsOf(row, "special_abilities").map(featureOf);
  const actions = recordsOf(row, "actions").map(featureOf);
  const reactions = recordsOf(row, "reactions").map(featureOf);
  const legendaryActions = recordsOf(row, "legendary_actions").map(featureOf);
  const conditionImmunities = refsOf(row, "condition_immunities");
  const damageVulnerabilities = rawTexts(row, "damage_vulnerabilities");
  const damageResistances = rawTexts(row, "damage_resistances");
  const damageImmunities = rawTexts(row, "damage_immunities");
  const spellcaster = specialAbilities.some((ability) => ability.spellcasting !== undefined);
  const sourceUrl = sourceUrlFor(rawText(row, "url"));
  const statBlock = decodeStatBlock({
    meta: `${size} ${type}${subtype === undefined ? "" : ` (${subtype})`}, ${alignment}`,
    ac: armorClassLine(armor, rawNumber(armor[0] ?? { value: 0 }, "value")),
    hp: `${String(hp)} (${hitPointsRoll === hitDice ? hitDice : hitPointsRoll})`,
    speed: speedLine(speed),
    cr: `${cr} (${String(rawNumber(row, "xp"))} XP)`,
    abilities: abilitiesOf(row, proficiencies),
    traits: [],
    ...(descriptionOf(row) === undefined ? {} : { desc: descriptionOf(row) }),
    armorClass: armor.map((entry) => ({
      type: rawText(entry, "type"),
      value: rawNumber(entry, "value"),
      ...(refsOf(entry, "armor").length === 0 ? {} : { armor: refsOf(entry, "armor") }),
      ...(entry.condition === undefined ? {} : { condition: refOf(entry.condition, "condition") }),
      ...(entry.spell === undefined ? {} : { spell: refOf(entry.spell, "spell") }),
      ...(typeof entry.desc === "string" ? { desc: entry.desc } : {}),
    })),
    hitDice,
    hitPointsRoll,
    speeds: speed,
    proficiencies: proficiencies.map((entry) => ({
      value: rawNumber(entry, "value"),
      proficiency: refOf(entry.proficiency, "proficiency"),
    })),
    damageVulnerabilities,
    damageResistances,
    damageImmunities,
    conditionImmunities,
    senses: recordOf(row.senses, "senses"),
    languages: rawString(row, "languages"),
    proficiencyBonus: optionalNumber(row, "proficiency_bonus"),
    xp: rawNumber(row, "xp"),
    specialAbilities,
    actions,
    reactions,
    legendaryActions,
    forms: refsOf(row, "forms"),
    image: optionalText(row, "image"),
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
  });

  return {
    sourceIndex: rawText(row, "index"),
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
    raw: row,
    name,
    size,
    type,
    ...(subtype === undefined ? {} : { subtype }),
    alignment,
    cr,
    crSort: challenge,
    ac: rawNumber(armor[0] ?? { value: 0 }, "value"),
    hp,
    environments: [],
    damageVulnerabilities,
    damageResistances,
    damageImmunities,
    conditionImmunities: conditionImmunities.map((condition) => condition.index),
    movementModes: movementModesOf(speed),
    spellcaster,
    legendary: legendaryActions.length > 0,
    statBlock,
  };
};

const projectedRaw = (creature: SourceCreature): unknown => ({
  sourceIndex: creature.sourceIndex,
  name: creature.name,
  size: creature.size ?? null,
  type: creature.type,
  subtype: creature.subtype ?? null,
  alignment: creature.alignment ?? null,
  cr: creature.cr,
  crSort: creature.crSort ?? crSortFor(creature.cr),
  ac: creature.ac,
  hp: creature.hp,
  environments: creature.environments ?? [],
  damageVulnerabilities: creature.damageVulnerabilities ?? [],
  damageResistances: creature.damageResistances ?? [],
  damageImmunities: creature.damageImmunities ?? [],
  conditionImmunities: creature.conditionImmunities ?? [],
  movementModes: creature.movementModes ?? [],
  spellcaster: creature.spellcaster ?? false,
  legendary: creature.legendary ?? false,
  statBlock: creature.statBlock ?? emptyStatBlock,
});

const writeCreatureCorpus = (
  source: RulesSourceDefinition,
  corpus: ReadonlyArray<SourceCreature>,
): Effect.Effect<ImportResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        let inserted = 0;
        let updated = 0;

        const context = yield* beginRulesImport(sql, source);

        for (const creature of corpus) {
          const statBlock = creature.statBlock ?? emptyStatBlock;
          const crSort = creature.crSort ?? crSortFor(creature.cr);
          const sourceRevision = yield* sourceRevisionFor(sql, context, {
            family: "monsters",
            sourceIndex: creature.sourceIndex,
            sourceUrl: creature.sourceUrl,
            name: creature.name,
            raw: creature.raw ?? projectedRaw(creature),
          });

          // `xmax = 0` is true only for a tuple this statement inserted, which
          // is how an upsert reports which of the two things it did.
          const rows = yield* sql<{ readonly inserted: boolean }>`
            insert into creature (
              campaign_id, account_id, origin, source_entity_id, source_revision_id,
              name, size, type, subtype, alignment, cr, cr_sort, ac, hp, environments,
              damage_vulnerabilities, damage_resistances, damage_immunities,
              condition_immunities, movement_modes, spellcaster, legendary, body
            )
            values (
              null,
              null,
              'system',
              ${sourceRevision.sourceEntityId},
              ${sourceRevision.sourceRevisionId},
              ${creature.name},
              ${creature.size ?? null},
              ${creature.type},
              ${creature.subtype ?? null},
              ${creature.alignment ?? null},
              ${creature.cr},
              ${crSort},
              ${creature.ac},
              ${creature.hp},
              ${creature.environments ?? []},
              ${creature.damageVulnerabilities ?? []},
              ${creature.damageResistances ?? []},
              ${creature.damageImmunities ?? []},
              ${creature.conditionImmunities ?? []},
              ${creature.movementModes ?? []},
              ${creature.spellcaster ?? false},
              ${creature.legendary ?? false},
              ${JSON.stringify(statBlock)}
            )
            on conflict (source_entity_id)
              where campaign_id is null and account_id is null and source_entity_id is not null
            do update set
              source_revision_id       = excluded.source_revision_id,
              name                     = excluded.name,
              size                     = excluded.size,
              type                     = excluded.type,
              subtype                  = excluded.subtype,
              alignment                = excluded.alignment,
              cr                       = excluded.cr,
              cr_sort                  = excluded.cr_sort,
              ac                       = excluded.ac,
              hp                       = excluded.hp,
              environments             = excluded.environments,
              damage_vulnerabilities   = excluded.damage_vulnerabilities,
              damage_resistances       = excluded.damage_resistances,
              damage_immunities        = excluded.damage_immunities,
              condition_immunities     = excluded.condition_immunities,
              movement_modes           = excluded.movement_modes,
              spellcaster              = excluded.spellcaster,
              legendary                = excluded.legendary,
              body                     = excluded.body,
              updated_at               = now()
            returning (xmax = 0) as inserted
          `;
          if (rows[0]?.inserted === true) inserted += 1;
          else updated += 1;
        }

        return { inserted, updated };
      }),
    );
  });

const damageTypeIndexes = new Set(MONSTER_DAMAGE_TYPE_RAW.map((row) => rawText(row, "index")));

const registerReferenceRows = (
  sql: SqlClient.SqlClient,
  context: RulesImportContext,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows: ReadonlyArray<{ readonly family: string; readonly row: Record<string, unknown> }> =
      [
        ...MONSTER_PROFICIENCY_RAW.map((row) => ({ family: "proficiencies", row })),
        ...MONSTER_CONDITION_RAW.map((row) => ({ family: "conditions", row })),
        ...MONSTER_DAMAGE_TYPE_RAW.map((row) => ({ family: "damage-types", row })),
        ...EQUIPMENT_RAW.map((row) => ({
          family: "equipment",
          row: row as Record<string, unknown>,
        })),
        ...SPELL_RAW.map((row) => ({ family: "spells", row: row as Record<string, unknown> })),
      ];

    for (const { family, row } of rows) {
      yield* sourceRevisionFor(sql, context, {
        family,
        sourceIndex: rawText(row, "index"),
        sourceUrl: sourceUrlFor(typeof row.url === "string" ? row.url : undefined),
        name: rawText(row, "name"),
        raw: row,
      });
    }
  });

const requiredLink = (
  sql: SqlClient.SqlClient,
  context: RulesImportContext,
  from: SourceRevision,
  relation: string,
  targetFamily: string,
  targetIndex: string,
  ordinal: number,
  payload: unknown,
): Effect.Effect<void, SqlError.SqlError> =>
  sourceLinkFor(sql, context, from, {
    relation,
    targetFamily,
    targetIndex,
    ordinal,
    payload,
    required: true,
  });

const linkReference = (
  sql: SqlClient.SqlClient,
  context: RulesImportContext,
  from: SourceRevision,
  relation: string,
  reference: SourceRef,
  ordinal: number,
): Effect.Effect<void, SqlError.SqlError> => {
  const family = sourceFamilyOf(reference.url);
  if (family === undefined) {
    throw new Error(`monster source reference ${reference.index} has no 2014 family`);
  }
  return requiredLink(sql, context, from, relation, family, reference.index, ordinal, {
    name: reference.name,
    url: reference.url,
  });
};

const collectDamageTypeRefs = (value: unknown, into: Array<SourceRef>): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectDamageTypeRefs(item, into);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const row = value as Record<string, unknown>;
  if (row.damage_type !== undefined) into.push(refOf(row.damage_type, "damage_type"));
  for (const item of Object.values(row)) collectDamageTypeRefs(item, into);
};

const collectSpellRefs = (value: unknown, into: Array<SourceRef>): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectSpellRefs(item, into);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const row = value as Record<string, unknown>;
  if (typeof row.url === "string") {
    const index = sourceIndexFromUrl(row.url, "spells");
    if (index !== undefined) {
      into.push({ index, name: typeof row.name === "string" ? row.name : index, url: row.url });
    }
  }
  for (const item of Object.values(row)) collectSpellRefs(item, into);
};

const linkMonster = (
  sql: SqlClient.SqlClient,
  context: RulesImportContext,
  revision: SourceRevision,
  raw: Record<string, unknown>,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    let ordinal = 0;
    for (const proficiency of recordsOf(raw, "proficiencies")) {
      yield* linkReference(
        sql,
        context,
        revision,
        "proficiency",
        refOf(proficiency.proficiency, "proficiency"),
        ordinal++,
      );
    }

    ordinal = 0;
    for (const condition of refsOf(raw, "condition_immunities")) {
      yield* linkReference(sql, context, revision, "condition-immunity", condition, ordinal++);
    }

    const damageStrings: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
      ["damage-vulnerability", rawTexts(raw, "damage_vulnerabilities")],
      ["damage-resistance", rawTexts(raw, "damage_resistances")],
      ["damage-immunity", rawTexts(raw, "damage_immunities")],
    ];
    for (const [relation, values] of damageStrings) {
      for (const [index, value] of values.entries()) {
        // The top-level immunity/resistance/vulnerability arrays are source
        // prose, not source references: some are exact damage keys (`fire`),
        // and some are whole rules sentences (`bludgeoning, piercing, and
        // slashing from nonmagical weapons`). Link the exact keys and keep the
        // prose in the creature row; do not invent a target for the rest.
        if (damageTypeIndexes.has(value)) {
          yield* requiredLink(sql, context, revision, relation, "damage-types", value, index, {
            name: value,
          });
        }
      }
    }

    ordinal = 0;
    for (const armor of recordsOf(raw, "armor_class")) {
      for (const equipment of refsOf(armor, "armor")) {
        yield* linkReference(sql, context, revision, "armor", equipment, ordinal++);
      }
    }

    const damageRefs: Array<SourceRef> = [];
    collectDamageTypeRefs(raw, damageRefs);
    for (const [index, reference] of damageRefs.entries()) {
      yield* linkReference(sql, context, revision, "damage-type", reference, index);
    }

    const spellRefs: Array<SourceRef> = [];
    collectSpellRefs(raw, spellRefs);
    for (const [index, reference] of spellRefs.entries()) {
      yield* linkReference(sql, context, revision, "spell", reference, index);
    }

    for (const [index, form] of refsOf(raw, "forms").entries()) {
      yield* linkReference(sql, context, revision, "form", form, index);
    }
  });

/**
 * Writes the Taverns-authored starter creatures into `creature` as global
 * `system` rows. Kept separate from the 2014 SRD import so the six project
 * monsters never get relabelled as 5e-bits/SRD material.
 */
export const importSystemCreatures = (
  corpus: ReadonlyArray<SystemCreature> = SYSTEM_CREATURES,
): Effect.Effect<ImportResult, SqlError.SqlError, SqlClient.SqlClient> =>
  writeCreatureCorpus(TAVERNS_STARTER_SOURCE, corpus);

/**
 * Writes the pinned 2014 5e-bits/SRD monster corpus into the same unowned
 * `system` half of `creature`.
 *
 * The source is the checked-in snapshot in `systemMonsters.ts`; this import
 * performs no network access, validates every required monster reference it
 * records, and a fresh database should end with exactly 334 SRD monster rows in
 * addition to the Taverns-authored starter bundle if that bundle is imported.
 */
export const importSystemMonsters = (
  raw: ReadonlyArray<Record<string, unknown>> = MONSTER_RAW,
): Effect.Effect<ImportMonstersResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const monsters = raw.map(transformedMonster);

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const context = yield* beginRulesImport(sql, FIVE_E_BITS_2014_SOURCE);
        yield* registerReferenceRows(sql, context);

        const revisions = new Map<string, SourceRevision>();
        for (const monster of monsters) {
          const revision = yield* sourceRevisionFor(sql, context, {
            family: "monsters",
            sourceIndex: monster.sourceIndex,
            sourceUrl: monster.sourceUrl,
            name: monster.name,
            raw: monster.raw ?? projectedRaw(monster),
          });
          revisions.set(monster.sourceIndex, revision);
        }

        for (const row of raw) {
          const revision = revisions.get(rawText(row, "index"));
          if (revision === undefined)
            throw new Error(`missing source revision for ${rawText(row, "index")}`);
          yield* linkMonster(sql, context, revision, row);
        }

        let inserted = 0;
        let updated = 0;
        for (const monster of monsters) {
          const revision = revisions.get(monster.sourceIndex);
          if (revision === undefined)
            throw new Error(`missing source revision for ${monster.sourceIndex}`);
          const rows = yield* sql<{ readonly inserted: boolean }>`
            insert into creature (
              campaign_id, account_id, origin, source_entity_id, source_revision_id,
              name, size, type, subtype, alignment, cr, cr_sort, ac, hp, environments,
              damage_vulnerabilities, damage_resistances, damage_immunities,
              condition_immunities, movement_modes, spellcaster, legendary, body
            )
            values (
              null,
              null,
              'system',
              ${revision.sourceEntityId},
              ${revision.sourceRevisionId},
              ${monster.name},
              ${monster.size ?? null},
              ${monster.type},
              ${monster.subtype ?? null},
              ${monster.alignment ?? null},
              ${monster.cr},
              ${monster.crSort ?? crSortFor(monster.cr)},
              ${monster.ac},
              ${monster.hp},
              ${monster.environments ?? []},
              ${monster.damageVulnerabilities ?? []},
              ${monster.damageResistances ?? []},
              ${monster.damageImmunities ?? []},
              ${monster.conditionImmunities ?? []},
              ${monster.movementModes ?? []},
              ${monster.spellcaster ?? false},
              ${monster.legendary ?? false},
              ${JSON.stringify(monster.statBlock ?? emptyStatBlock)}
            )
            on conflict (source_entity_id)
              where campaign_id is null and account_id is null and source_entity_id is not null
            do update set
              source_revision_id       = excluded.source_revision_id,
              name                     = excluded.name,
              size                     = excluded.size,
              type                     = excluded.type,
              subtype                  = excluded.subtype,
              alignment                = excluded.alignment,
              cr                       = excluded.cr,
              cr_sort                  = excluded.cr_sort,
              ac                       = excluded.ac,
              hp                       = excluded.hp,
              environments             = excluded.environments,
              damage_vulnerabilities   = excluded.damage_vulnerabilities,
              damage_resistances       = excluded.damage_resistances,
              damage_immunities        = excluded.damage_immunities,
              condition_immunities     = excluded.condition_immunities,
              movement_modes           = excluded.movement_modes,
              spellcaster              = excluded.spellcaster,
              legendary                = excluded.legendary,
              body                     = excluded.body,
              updated_at               = now()
            returning (xmax = 0) as inserted
          `;
          if (rows[0]?.inserted === true) inserted += 1;
          else updated += 1;
        }

        return { seen: monsters.length, inserted, updated };
      }),
    );
  });

/** Import both monster sources without conflating their source documents. */
export const importSystemBestiary = (): Effect.Effect<
  ImportBestiaryResult,
  SqlError.SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const starter = yield* importSystemCreatures();
    const srd = yield* importSystemMonsters();
    return { starter, srd };
  });
