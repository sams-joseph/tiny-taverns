import { emptyStatBlock, StatBlock, type CreatureCreate } from "@taverns/api";
import { Effect, Schema } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import { SPELL_RAW } from "../spells/systemSpells.js";
import { crSortFor } from "../repo/Creatures.js";
import {
  conditionForRef,
  damageTypeForRef,
  FIVE_E_BITS_2014_SOURCE,
  proficiencyForRef,
  requireConditionForRef,
  requireDamageTypeByKey,
  requireDamageTypeForRef,
  requireProficiencyForRef,
  sourceKeyFor,
  TAVERNS_STARTER_SOURCE,
  type RulesSourceDefinition,
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
  readonly raw?: unknown;
}

interface SourceRef {
  readonly index: string;
  readonly name: string;
  readonly url?: string;
}

const decodeStatBlock = Schema.decodeUnknownSync(StatBlock);

const stripSourceUrls = <A>(value: A): A => {
  if (Array.isArray(value)) return value.map((item) => stripSourceUrls(item)) as A;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "url" && key !== "sourceUrl")
        .map(([key, item]) => [key, stripSourceUrls(item)]),
    ) as A;
  }
  return value;
};

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
  const statBlock = stripSourceUrls(
    decodeStatBlock({
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
        ...(entry.condition === undefined
          ? {}
          : { condition: refOf(entry.condition, "condition") }),
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
    }),
  );

  return {
    sourceIndex: rawText(row, "index"),
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

        for (const creature of corpus) {
          const statBlock = creature.statBlock ?? emptyStatBlock;
          const crSort = creature.crSort ?? crSortFor(creature.cr);
          const key = sourceKeyFor(source, "monsters", creature.sourceIndex);

          const rows = yield* sql<{ readonly inserted: boolean }>`
            insert into creature (
              campaign_id, account_id, origin, source_corpus, source_family, source_key,
              name, size, type, subtype, alignment, cr, cr_sort, ac, hp, environments,
              damage_vulnerabilities, damage_resistances, damage_immunities,
              condition_immunities, movement_modes, spellcaster, legendary, body
            )
            values (
              null,
              null,
              'system',
              ${key.sourceCorpus},
              ${key.sourceFamily},
              ${key.sourceKey},
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
              ${JSON.stringify(stripSourceUrls(statBlock))}
            )
            on conflict (source_corpus, source_family, source_key)
              where campaign_id is null and account_id is null and source_key is not null
            do update set
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
const spellIndexesByName = new Map(
  SPELL_RAW.map((row) => [
    rawText(row as Record<string, unknown>, "name"),
    rawText(row as Record<string, unknown>, "index"),
  ]),
);

const registerReferenceRows = (sql: SqlClient.SqlClient): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows: ReadonlyArray<{ readonly family: string; readonly row: Record<string, unknown> }> =
      [
        ...MONSTER_PROFICIENCY_RAW.map((row) => ({ family: "proficiencies", row })),
        ...MONSTER_CONDITION_RAW.map((row) => ({ family: "conditions", row })),
        ...MONSTER_DAMAGE_TYPE_RAW.map((row) => ({ family: "damage-types", row })),
      ];

    for (const { family, row } of rows) {
      const reference = refOf(row, family);
      if (family === "proficiencies") yield* proficiencyForRef(sql, reference);
      if (family === "conditions") yield* conditionForRef(sql, reference);
      if (family === "damage-types") yield* damageTypeForRef(sql, reference);
    }
  });

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
  if (typeof row.name === "string") {
    const index = spellIndexesByName.get(row.name);
    if (index !== undefined) into.push({ index, name: row.name });
  }
  for (const item of Object.values(row)) collectSpellRefs(item, into);
};

const equipmentIdBySource = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
): Effect.Effect<string | undefined, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly id: string }>`
      select id::text from equipment
      where source_corpus = ${FIVE_E_BITS_2014_SOURCE.corpus}
        and source_family = 'equipment'
        and source_key = ${sourceKey}
        and campaign_id is null
        and account_id is null
      limit 1
    `;
    return rows[0]?.id;
  });

const spellIdBySource = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
): Effect.Effect<string | undefined, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly id: string }>`
      select id::text from spell
      where source_corpus = ${FIVE_E_BITS_2014_SOURCE.corpus}
        and source_family = 'spells'
        and source_key = ${sourceKey}
        and campaign_id is null
        and account_id is null
      limit 1
    `;
    return rows[0]?.id;
  });

const syncMonsterRelationships = (
  sql: SqlClient.SqlClient,
  creatureId: string,
  creatureIdsBySource: ReadonlyMap<string, string>,
  raw: Record<string, unknown>,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    yield* sql`delete from creature_proficiency where creature_id = ${creatureId}`;
    yield* sql`delete from creature_condition_immunity where creature_id = ${creatureId}`;
    yield* sql`delete from creature_damage_type where creature_id = ${creatureId}`;
    yield* sql`delete from creature_armor_equipment where creature_id = ${creatureId}`;
    yield* sql`delete from creature_spell where creature_id = ${creatureId}`;
    yield* sql`delete from creature_form where creature_id = ${creatureId}`;

    let ordinal = 0;
    for (const proficiency of recordsOf(raw, "proficiencies")) {
      const proficiencyId = yield* requireProficiencyForRef(
        sql,
        refOf(proficiency.proficiency, "proficiency"),
        "monster-proficiency",
      );
      yield* sql`
        insert into creature_proficiency (creature_id, proficiency_id, value, ordinal)
        values (${creatureId}, ${proficiencyId}, ${rawNumber(proficiency, "value")}, ${ordinal++})
        on conflict do nothing
      `;
    }

    ordinal = 0;
    for (const condition of refsOf(raw, "condition_immunities")) {
      const conditionId = yield* requireConditionForRef(
        sql,
        condition,
        "monster-condition-immunity",
      );
      yield* sql`
        insert into creature_condition_immunity (creature_id, condition_id, ordinal)
        values (${creatureId}, ${conditionId}, ${ordinal++})
        on conflict do nothing
      `;
    }

    const damageStrings: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
      ["vulnerability", rawTexts(raw, "damage_vulnerabilities")],
      ["resistance", rawTexts(raw, "damage_resistances")],
      ["immunity", rawTexts(raw, "damage_immunities")],
    ];
    for (const [relation, values] of damageStrings) {
      for (const [index, value] of values.entries()) {
        if (damageTypeIndexes.has(value)) {
          const damageTypeId = yield* requireDamageTypeByKey(
            sql,
            value,
            `monster-damage-${relation}`,
          );
          yield* sql`
            insert into creature_damage_type (creature_id, damage_type_id, relation, ordinal)
            values (${creatureId}, ${damageTypeId}, ${relation}, ${index})
            on conflict do nothing
          `;
        }
      }
    }

    ordinal = 0;
    for (const armor of recordsOf(raw, "armor_class")) {
      for (const equipment of refsOf(armor, "armor")) {
        const equipmentId = yield* equipmentIdBySource(sql, equipment.index);
        if (equipmentId !== undefined) {
          yield* sql`
            insert into creature_armor_equipment (creature_id, equipment_id, ordinal)
            values (${creatureId}, ${equipmentId}, ${ordinal})
            on conflict do nothing
          `;
        }
        ordinal += 1;
      }
    }

    const damageRefs: Array<SourceRef> = [];
    collectDamageTypeRefs(raw, damageRefs);
    for (const [index, reference] of damageRefs.entries()) {
      const damageTypeId = yield* requireDamageTypeForRef(
        sql,
        reference,
        "monster-feature-damage-type",
      );
      yield* sql`
        insert into creature_damage_type (creature_id, damage_type_id, relation, ordinal)
        values (${creatureId}, ${damageTypeId}, 'feature', ${index})
        on conflict do nothing
      `;
    }

    const spellRefs: Array<SourceRef> = [];
    collectSpellRefs(raw, spellRefs);
    for (const [index, reference] of spellRefs.entries()) {
      const spellId = yield* spellIdBySource(sql, reference.index);
      if (spellId !== undefined) {
        yield* sql`
          insert into creature_spell (creature_id, spell_id, ordinal)
          values (${creatureId}, ${spellId}, ${index})
          on conflict do nothing
        `;
      }
    }

    for (const [index, form] of refsOf(raw, "forms").entries()) {
      const formId = creatureIdsBySource.get(form.index);
      if (formId !== undefined) {
        yield* sql`
          insert into creature_form (creature_id, form_id, ordinal)
          values (${creatureId}, ${formId}, ${index})
          on conflict do nothing
        `;
      }
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
        yield* registerReferenceRows(sql);

        let inserted = 0;
        let updated = 0;
        const idsBySource = new Map<string, string>();
        for (const monster of monsters) {
          const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "monsters", monster.sourceIndex);
          const rows = yield* sql<{ readonly id: string; readonly inserted: boolean }>`
            insert into creature (
              campaign_id, account_id, origin, source_corpus, source_family, source_key,
              name, size, type, subtype, alignment, cr, cr_sort, ac, hp, environments,
              damage_vulnerabilities, damage_resistances, damage_immunities,
              condition_immunities, movement_modes, spellcaster, legendary, body
            )
            values (
              null,
              null,
              'system',
              ${key.sourceCorpus},
              ${key.sourceFamily},
              ${key.sourceKey},
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
              ${JSON.stringify(stripSourceUrls(monster.statBlock ?? emptyStatBlock))}
            )
            on conflict (source_corpus, source_family, source_key)
              where campaign_id is null and account_id is null and source_key is not null
            do update set
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
            returning id::text, (xmax = 0) as inserted
          `;
          const row = rows[0];
          if (row === undefined) throw new Error(`monster ${monster.sourceIndex} was not written`);
          idsBySource.set(monster.sourceIndex, row.id);
          if (row.inserted === true) inserted += 1;
          else updated += 1;
        }

        for (const row of raw) {
          const creatureId = idsBySource.get(rawText(row, "index"));
          if (creatureId === undefined)
            throw new Error(`missing creature row ${rawText(row, "index")}`);
          yield* syncMonsterRelationships(sql, creatureId, idsBySource, row);
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
