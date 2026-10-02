import {
  type Actor,
  asClassOption,
  asRaceOption,
  type CharacterOption,
  Conflict,
  KitEquipment,
  levelGrantsFor,
  type RaceBody,
  type SheetBody,
  Spell,
  SpellId,
  spellActionFor,
  subraceNamed,
  withLevel,
} from "@taverns/api";
import { Effect, Option, Schema, Struct } from "effect";
import { type SqlClient, type SqlError, SqlSchema, type Statement } from "effect/sql";
import { optionDetailsReader } from "../ruleset/vocabularies.js";
import { OptionRow } from "./Options.js";
import { fromColumns, uuidArray } from "./rows.js";
import { libraryRowReadable, type Vocabulary } from "./visibility.js";

/**
 * **The one level change for a sheet's rules half** — a character's and an
 * NPC's (`repo/NpcSheets.ts`). A write that really moves the level or the
 * class, with no sheet in it, runs this against the vocabulary the caller
 * says the sheet is written in (a character's is `characterVocabulary`, a
 * campaign NPC's its campaign's). It checks no reach: the caller has already
 * proven the write is theirs. The subrace check below is shared the same way.
 *
 * It resolves what the pure rule needs, in that vocabulary and nowhere else —
 * the class before and after (with its table, features and subclasses), the
 * race (whose overlay lines scale with level), and the rows the derived
 * weapon lines name (in the vocabulary or the writer's own Library, where the
 * Gear picker finds them) — and hands them to `withLevel` (`@taverns/api`
 * `SheetGrants.ts`), the rule creation's `levelGrantsFor` shares. That moves
 * the proficiency bonus, the saves and skills, the casting numbers, the
 * identity strings, the counters, the class and subclass features, the weapon
 * to-hits and *Extra Attack*, and the hit dice; it keeps every line a person
 * typed and leaves the hit points and the scores alone.
 *
 * The known spells are this file's half, because they need the spell rows:
 * narrowed to what the class (or subclass) list still reaches at the new
 * level's highest slot in this vocabulary, and their derived action lines
 * rewritten at the new level and the new casting numbers (a cantrip's dice
 * grow).
 *
 * A class that resolves to nothing in the vocabulary leaves the body as it
 * was: there is no table to read, and absent beats a guess.
 */
export const recomputeForLevel = <Body extends SheetBody>(
  sql: SqlClient.SqlClient,
  input: {
    readonly body: Body;
    /** The level after the write; `null` reads as 1. */
    readonly level: number | null;
    /** The class after the write; blank or `null` leaves the body as it was. */
    readonly className: string | null;
    /** The race and subrace after the write: the racial lines that scale with level. */
    readonly race: string | null;
    readonly subrace: string | null;
    /** The level and class the body was written at — what a stored number is compared with. */
    readonly from: { readonly level: number | null; readonly className: string | null };
    readonly vocabulary: Vocabulary;
    /** Who writes: a derived weapon line may name their own Library's row, as the Gear picker offers it. */
    readonly actor: Actor;
  },
): Effect.Effect<Body, SqlError.SqlError | Schema.SchemaError> =>
  Effect.gen(function* () {
    const { body, vocabulary } = input;
    const level = Math.max(1, input.level ?? 1);
    const className = present(input.className);
    if (className === undefined) return body;
    const named = (kind: "class" | "race", name: string | undefined) =>
      name === undefined
        ? Effect.succeed(undefined)
        : Effect.map(
            optionNamedIn(sql, { kind, name, vocabulary: vocabulary("character_option") }),
            Option.getOrUndefined,
          );
    const classRow = yield* named("class", className);
    if (classRow === undefined) return body;
    const formerName = present(input.from.className);
    const formerRow =
      formerName === undefined
        ? undefined
        : formerName.toLowerCase() === className.toLowerCase()
          ? classRow
          : yield* named("class", formerName);
    const raceRow = yield* named("race", present(input.race));
    const rows = [classRow, formerRow, raceRow].flatMap((row) => (row === undefined ? [] : [row]));
    const details = yield* optionDetailsReader(sql)([...new Set(rows.map((row) => row.id))]);
    const hydrated = (row: OptionRow | undefined): CharacterOption | undefined =>
      row === undefined ? undefined : { ...row, details: details.get(row.id)! };
    const classOption = asClassOption(hydrated(classRow));
    const formerOption = asClassOption(hydrated(formerRow));
    const raceOption = asRaceOption(hydrated(raceRow));

    const typedSubrace = present(input.subrace);
    const sources = {
      raceOption,
      subraceName: subraceNamed(raceOption?.body, typedSubrace)?.name ?? typedSubrace,
      subclass: present(body.identity?.subclass),
      abilities: body.abilities,
    };
    const to = levelGrantsFor({ ...sources, classOption, level });
    const from =
      formerOption === undefined
        ? undefined
        : levelGrantsFor({
            ...sources,
            classOption: formerOption,
            level: Math.max(1, input.from.level ?? 1),
          });

    const weaponIds = [
      ...new Set(
        (body.actions ?? []).flatMap((action) =>
          action.derived === true &&
          action.source === "weapon" &&
          action.equipmentId !== undefined &&
          action.equipmentId !== null
            ? [action.equipmentId]
            : [],
        ),
      ),
    ];
    const equipment =
      weaponIds.length === 0
        ? []
        : yield* SqlSchema.findAll({
            Request: Schema.toType(Schema.Array(Schema.String)),
            Result: LevelEquipmentRow,
            execute: (ids) => sql`
              select equipment.id::text, equipment.source_key as index, equipment.name,
                     equipment.weapon_category, equipment.weapon_range, equipment.category_range,
                     equipment.armor_category, equipment.damage_dice,
                     equipment.damage_type_name as damage_type, equipment.two_handed_damage_dice,
                     equipment.range_normal, equipment.range_long,
                     equipment.throw_range_normal, equipment.throw_range_long,
                     equipment.property_names as properties, equipment.weight,
                     equipment.gear_category_index, equipment.tool_category
              from equipment
              where equipment.id = any(${uuidArray(ids)})
                and ${sql.or([vocabulary("equipment"), libraryRowReadable(sql, "equipment", input.actor)])}
            `,
          })(weaponIds);

    const leveled = withLevel(body, { from, to, equipment });
    return yield* withKnownSpellsAt(sql, {
      body: leveled,
      level,
      className: classOption?.name ?? className,
      highest: to.resources.reduce((best, resource) => {
        const slot = /^slot:(\d+)$/.exec(resource.id)?.[1];
        return slot !== undefined && resource.max > 0 ? Math.max(best, Number(slot)) : best;
      }, 0),
      vocabulary,
    });
  });

/**
 * Whether a write moves the level or the class — what makes it a level change
 * at all. A class relabelled only in case or spacing is the same class.
 */
export const levelOrClassMoved = (
  before: { readonly level: number | null; readonly className: string | null },
  after: { readonly level: number | null; readonly className: string | null },
): boolean =>
  Math.max(1, before.level ?? 1) !== Math.max(1, after.level ?? 1) ||
  (present(before.className)?.toLowerCase() ?? "") !==
    (present(after.className)?.toLowerCase() ?? "");

/** One option of a kind by name in a vocabulary, the bundle's row first when two share it. */
const optionNamedIn = (
  sql: SqlClient.SqlClient,
  input: {
    readonly kind: "class" | "race";
    readonly name: string;
    readonly vocabulary: Statement.Fragment;
  },
) =>
  SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: OptionRow,
    execute: () => sql`
      select * from character_option
      where kind = ${input.kind}
        and lower(name) = lower(${input.name})
        and ${input.vocabulary}
      order by case when account_id is null and campaign_id is null then 0 else 1 end,
               created_at asc, id asc
      limit 1
    `,
  })(undefined);

/** The weapon columns of an `equipment` row, as `weaponAttack` reads them. */
const LevelEquipmentRow = fromColumns(KitEquipment);

/**
 * The known spells at the new level, and their lines: kept while the class
 * (or subclass) list still reaches them at `highest` in this vocabulary, and
 * every derived spell line written again from the kept ones at the casting
 * numbers `withLevel` just moved.
 */
const withKnownSpellsAt = <Body extends SheetBody>(
  sql: SqlClient.SqlClient,
  input: {
    readonly body: Body;
    readonly level: number;
    readonly className: string;
    readonly highest: number;
    readonly vocabulary: Vocabulary;
  },
): Effect.Effect<Body, SqlError.SqlError | Schema.SchemaError> =>
  Effect.gen(function* () {
    const { body, level, className, highest, vocabulary } = input;
    const knownIds = (body.spellcasting?.known ?? []).flatMap((spell) =>
      spell.spellId === undefined || spell.spellId === null ? [] : [spell.spellId],
    );
    const subclassName = present(body.identity?.subclass);
    const onClassList = sql`exists (select 1 from unnest(spell.class_names) as class_name where lower(class_name) = lower(${className}))`;
    const spellRows =
      knownIds.length === 0
        ? []
        : yield* SqlSchema.findAll({
            Request: Schema.toType(Schema.Array(SpellId)),
            Result: LevelSpellRow,
            execute: (ids) => sql`
              select id, name, level, school_name, ritual, concentration, casting_time,
                     spell_range, body
              from spell
              where id = any(${uuidArray(ids)})
                and ${vocabulary("spell")}
                and (level = 0 or level <= ${highest})
                and ${
                  subclassName === undefined
                    ? onClassList
                    : sql.or([
                        onClassList,
                        sql`exists (select 1 from unnest(spell.subclass_names) as subclass_name where lower(subclass_name) = lower(${subclassName}))`,
                      ])
                }
            `,
          })(knownIds);
    const spellById = new Map(spellRows.map((row) => [row.id, row]));
    const keptKnown = (body.spellcasting?.known ?? []).filter(
      (spell) =>
        spell.spellId !== undefined && spell.spellId !== null && spellById.has(spell.spellId),
    );
    const spellActions = keptKnown.flatMap((known) => {
      if (known.spellId === undefined || known.spellId === null) return [];
      const row = spellById.get(known.spellId);
      if (row === undefined) return [];
      if (row.level > 0 && known.prepared !== true) return [];
      return [
        spellActionFor(
          { spell: row },
          {
            characterLevel: level,
            spellAttack: body.spellcasting?.attack,
            spellSave: body.spellcasting?.save,
          },
        ),
      ];
    });
    const otherActions = (body.actions ?? []).filter(
      (action) => !(action.derived === true && action.source === "spell"),
    );
    const actions = [...otherActions, ...spellActions];
    return {
      ...body,
      ...(actions.length === 0 && body.actions === undefined ? {} : { actions }),
      ...(body.spellcasting?.known === undefined
        ? {}
        : { spellcasting: { ...body.spellcasting, known: keptKnown } }),
    };
  });

const present = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

/** A known spell as a level change rewrites its action line: `spellActionFor`'s half of a `spell` row. */
const LevelSpellRow = fromColumns(
  Schema.Struct(
    Struct.pick(Spell.fields, [
      "id",
      "name",
      "level",
      "schoolName",
      "ritual",
      "concentration",
      "castingTime",
      "range",
      "spell",
    ]),
  ),
  { range: "spell_range", spell: "body" },
);

const subraceMismatch = (race: string, subrace: string, place: string): Conflict =>
  new Conflict({
    message: `"${subrace}" is not a subrace of "${race}" ${place}. Pick one contained by that race or leave subrace blank.`,
  });

const missingRaceForSubrace = (subrace: string): Conflict =>
  new Conflict({
    message: `"${subrace}" needs a race before it can be checked. Pick the race it belongs to or leave subrace blank.`,
  });

/**
 * **The one subrace check for a sheet's identity** — a character's and an
 * NPC's. A named subrace must be contained by the named race in the vocabulary
 * the sheet is checked against, so what is pickable is exactly what validates.
 *
 * For a character, at creation that is the one the form or Hob used: the
 * campaign context's (`usableInCampaign`, `Options.list`'s) or the core rules
 * (`coreRulesUsable`, `Options.core`'s). On the shared sheet it is
 * `characterVocabulary`: every table the character sits at, or the core rules
 * when it sits at none. For a campaign NPC's sheet it is its campaign's.
 * `place` says which, in the refusal ("in a campaign this character is at").
 */
export const validateSubrace = (
  sql: SqlClient.SqlClient,
  vocabulary: Statement.Fragment,
  race: string | null | undefined,
  subrace: string | null | undefined,
  place: string,
): Effect.Effect<void, Conflict> =>
  Effect.gen(function* () {
    const namedSubrace = present(subrace);
    if (namedSubrace === undefined) return;
    const namedRace = present(race);
    if (namedRace === undefined) return yield* missingRaceForSubrace(namedSubrace);

    const rows = yield* sql<{ readonly name: string; readonly body: RaceBody }>`
      select name, body from character_option
      where kind = 'race'
        and lower(name) = lower(${namedRace})
        and ${vocabulary}
    `.pipe(Effect.orDie);
    const resolves = rows.some((row) =>
      row.body.subraces.some(
        (candidate) => candidate.name.toLowerCase() === namedSubrace.toLowerCase(),
      ),
    );
    if (!resolves) return yield* subraceMismatch(namedRace, namedSubrace, place);
  });
