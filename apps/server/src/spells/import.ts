import { SpellBody } from "@taverns/api";
import { Effect, Schema } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import {
  abilityScoreForRef,
  classOptionForRef,
  damageTypeForRef,
  FIVE_E_BITS_2014_SOURCE,
  magicSchoolForRef,
  requireDamageTypeForRef,
  sourceKeyFor,
  subclassForRef,
} from "../ruleset/source.js";
import { ABILITY_SCORE_RAW, DAMAGE_TYPE_RAW, MAGIC_SCHOOL_RAW, SPELL_RAW } from "./systemSpells.js";

export interface ImportSpellsResult {
  readonly inserted: number;
  readonly updated: number;
  readonly seen: number;
}

interface SourceRef {
  readonly index: string;
  readonly name: string;
  readonly url?: string;
}

interface SystemSpell {
  readonly sourceIndex: string;
  readonly name: string;
  readonly level: number;
  readonly school: SourceRef;
  readonly ritual: boolean;
  readonly concentration: boolean;
  readonly castingTime: string;
  readonly range: string;
  readonly duration: string;
  readonly classes: ReadonlyArray<SourceRef>;
  readonly subclasses: ReadonlyArray<SourceRef>;
  readonly body: SpellBody;
  readonly raw: Record<string, unknown>;
}

const decodeBody = Schema.decodeSync(SpellBody);

const rawText = (row: Record<string, unknown>, key: string): string => {
  const value = row[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`spell source ${key} is required`);
  }
  return value;
};

const rawBoolean = (row: Record<string, unknown>, key: string): boolean => {
  const value = row[key];
  if (typeof value !== "boolean") throw new Error(`spell source ${key} must be boolean`);
  return value;
};

const rawLevel = (row: Record<string, unknown>): number => {
  const value = row.level;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 9) {
    throw new Error(`spell source level must be 0..9 for ${String(row.name)}`);
  }
  return value;
};

const rawTexts = (row: Record<string, unknown>, key: string): ReadonlyArray<string> => {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`spell source ${key} must be an array of strings`);
  }
  return value;
};

const refOf = (value: unknown, key: string): SourceRef => {
  if (value === null || typeof value !== "object") throw new Error(`spell ${key} is required`);
  const record = value as Record<string, unknown>;
  const index = record.index;
  const name = record.name;
  const url = record.url;
  if (typeof index !== "string" || index.trim() === "") {
    throw new Error(`spell ${key}.index is required`);
  }
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error(`spell ${key}.name is required`);
  }
  if (url !== undefined && typeof url !== "string")
    throw new Error(`spell ${key}.url must be text`);
  return { index, name, url };
};

const refsOf = (row: Record<string, unknown>, key: string): ReadonlyArray<SourceRef> => {
  const value = row[key];
  if (!Array.isArray(value)) throw new Error(`spell source ${key} must be an array`);
  return value.map((item) => refOf(item, key));
};

const optionalRecord = (
  row: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`spell source ${key} must be an object`);
  }
  return value as Record<string, unknown>;
};

const optionalDice = (
  row: Record<string, unknown>,
  key: string,
): Record<string, string> | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`spell source ${key} must be an object`);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.every(([slot, dice]) => slot.trim() !== "" && typeof dice === "string")) {
    throw new Error(`spell source ${key} must be a string map`);
  }
  return Object.fromEntries(entries) as Record<string, string>;
};

const damageOf = (row: Record<string, unknown>): SpellBody["damage"] => {
  const damage = optionalRecord(row, "damage");
  if (damage === undefined) return undefined;
  return {
    damageType:
      damage.damage_type === undefined ? undefined : refOf(damage.damage_type, "damage_type"),
    damageAtSlotLevel: optionalDice(damage, "damage_at_slot_level"),
    damageAtCharacterLevel: optionalDice(damage, "damage_at_character_level"),
  };
};

const dcOf = (row: Record<string, unknown>): SpellBody["dc"] => {
  const dc = optionalRecord(row, "dc");
  if (dc === undefined) return undefined;
  return {
    dcType: refOf(dc.dc_type, "dc_type"),
    dcSuccess: rawText(dc, "dc_success"),
    desc: typeof dc.desc === "string" ? dc.desc : undefined,
  };
};

const areaOf = (row: Record<string, unknown>): SpellBody["areaOfEffect"] => {
  const area = optionalRecord(row, "area_of_effect");
  if (area === undefined) return undefined;
  const size = area.size;
  const type = area.type;
  if (typeof type !== "string" || type.trim() === "") throw new Error("spell AoE type is required");
  if (typeof size !== "number" || !Number.isInteger(size) || size < 0) {
    throw new Error("spell AoE size must be a non-negative integer");
  }
  return { type, size };
};

const transformedSpell = (row: Record<string, unknown>): SystemSpell => {
  const school = refOf(row.school, "school");
  const classes = refsOf(row, "classes");
  const subclasses = refsOf(row, "subclasses");
  const body = decodeBody({
    desc: rawTexts(row, "desc"),
    higherLevel: row.higher_level === undefined ? undefined : rawTexts(row, "higher_level"),
    components: rawTexts(row, "components"),
    material: typeof row.material === "string" ? row.material : undefined,
    attackType: typeof row.attack_type === "string" ? row.attack_type : undefined,
    damage: damageOf(row),
    dc: dcOf(row),
    areaOfEffect: areaOf(row),
    healAtSlotLevel: optionalDice(row, "heal_at_slot_level"),
    school,
    classes,
    subclasses,
  });

  return {
    sourceIndex: rawText(row, "index"),
    name: rawText(row, "name"),
    level: rawLevel(row),
    school,
    ritual: rawBoolean(row, "ritual"),
    concentration: rawBoolean(row, "concentration"),
    castingTime: rawText(row, "casting_time"),
    range: rawText(row, "range"),
    duration: rawText(row, "duration"),
    classes,
    subclasses,
    body,
    raw: row,
  };
};

const referenceRows = (): ReadonlyArray<{
  readonly family: string;
  readonly row: Record<string, unknown>;
}> => [
  ...MAGIC_SCHOOL_RAW.map((row) => ({ family: "magic-schools", row })),
  ...DAMAGE_TYPE_RAW.map((row) => ({ family: "damage-types", row })),
  ...ABILITY_SCORE_RAW.map((row) => ({ family: "ability-scores", row })),
];

const registerReferenceRows = (sql: SqlClient.SqlClient): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const { family, row } of referenceRows()) {
      const reference = refOf(row, family);
      if (family === "magic-schools") yield* magicSchoolForRef(sql, reference);
      if (family === "damage-types") yield* damageTypeForRef(sql, reference);
      if (family === "ability-scores") yield* abilityScoreForRef(sql, reference);
    }
  });

const syncSpellRelationships = (
  sql: SqlClient.SqlClient,
  spellId: string,
  spell: SystemSpell,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    yield* sql`delete from spell_class where spell_id = ${spellId}`;
    yield* sql`delete from spell_subclass where spell_id = ${spellId}`;
    yield* sql`delete from spell_damage_type where spell_id = ${spellId}`;

    for (const [ordinal, reference] of spell.classes.entries()) {
      const classOptionId = yield* classOptionForRef(sql, reference);
      yield* sql`
        insert into spell_class (spell_id, class_option_id, ordinal)
        values (${spellId}, ${classOptionId}, ${ordinal})
      `;
    }
    for (const [ordinal, reference] of spell.subclasses.entries()) {
      const subclassId = yield* subclassForRef(sql, reference);
      yield* sql`
        insert into spell_subclass (spell_id, subclass_id, ordinal)
        values (${spellId}, ${subclassId}, ${ordinal})
      `;
    }

    const damageType = spell.body.damage?.damageType;
    if (damageType !== undefined) {
      const damageTypeId = yield* requireDamageTypeForRef(sql, damageType, "spell-damage-type");
      yield* sql`
        insert into spell_damage_type (spell_id, damage_type_id, relation, ordinal)
        values (${spellId}, ${damageTypeId}, 'damage', 0)
      `;
    }
  });

/**
 * Writes the pinned 2014 5e-bits spell corpus into `spell` as global `system`
 * rows. The source is the checked-in snapshot in `systemSpells.ts`; this import
 * performs no network access, and a fresh database should end with exactly 319
 * spell rows.
 */
export const importSystemSpells = (
  raw: ReadonlyArray<Record<string, unknown>> = SPELL_RAW,
): Effect.Effect<ImportSpellsResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        let inserted = 0;
        let updated = 0;

        yield* registerReferenceRows(sql);

        const spells = raw.map(transformedSpell);
        for (const spell of spells) {
          const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "spells", spell.sourceIndex);
          const schoolId = yield* magicSchoolForRef(sql, spell.school);
          const dcAbilityId =
            spell.body.dc === undefined
              ? null
              : yield* abilityScoreForRef(sql, spell.body.dc.dcType);

          const rows = yield* sql<{ readonly id: string; readonly inserted: boolean }>`
            insert into spell (
              campaign_id, account_id, origin, source_corpus, source_family, source_key,
              school_id, dc_ability_id,
              name, level, school_index, school_name, ritual, concentration,
              casting_time, spell_range, duration, class_indexes, class_names,
              subclass_indexes, subclass_names, body, visibility
            ) values (
              null,
              null,
              'system',
              ${key.sourceCorpus},
              ${key.sourceFamily},
              ${key.sourceKey},
              ${schoolId},
              ${dcAbilityId},
              ${spell.name},
              ${spell.level},
              ${spell.school.index},
              ${spell.school.name},
              ${spell.ritual},
              ${spell.concentration},
              ${spell.castingTime},
              ${spell.range},
              ${spell.duration},
              ${spell.classes.map((reference) => reference.index)},
              ${spell.classes.map((reference) => reference.name)},
              ${spell.subclasses.map((reference) => reference.index)},
              ${spell.subclasses.map((reference) => reference.name)},
              ${JSON.stringify(spell.body)},
              'shared'
            )
            on conflict (source_corpus, source_family, source_key)
              where campaign_id is null and account_id is null and source_key is not null
            do update set
              school_id          = excluded.school_id,
              dc_ability_id      = excluded.dc_ability_id,
              name               = excluded.name,
              level              = excluded.level,
              school_index       = excluded.school_index,
              school_name        = excluded.school_name,
              ritual             = excluded.ritual,
              concentration      = excluded.concentration,
              casting_time       = excluded.casting_time,
              spell_range        = excluded.spell_range,
              duration           = excluded.duration,
              class_indexes      = excluded.class_indexes,
              class_names        = excluded.class_names,
              subclass_indexes   = excluded.subclass_indexes,
              subclass_names     = excluded.subclass_names,
              body               = excluded.body,
              updated_at         = now()
            returning id::text, (xmax = 0) as inserted
          `;
          const row = rows[0];
          if (row === undefined) throw new Error(`spell ${spell.sourceIndex} was not written`);
          yield* syncSpellRelationships(sql, row.id, spell);
          if (row.inserted === true) inserted += 1;
          else updated += 1;
        }

        return { inserted, updated, seen: spells.length };
      }),
    );
  });
