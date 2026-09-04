import {
  type AccountId,
  type Actor,
  type CampaignId,
  type CharacterSheet,
  type CharacterSpellbook,
  type CharacterSpellRules,
  type CharacterId,
  type ClassBody,
  type ClassLevelSpellcasting,
  CurrentActor,
  NotFound,
  type Page,
  Spell,
  type SpellBody,
  type SpellFilterValues,
  type SpellId,
  type SpellLibraryCreate,
  type SpellLibraryUpdate,
  type SpellReference,
  type SpellSort,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import {
  defined,
  dieOnSqlError,
  likeContains,
  type ProvenanceColumns,
  provenanceOf,
  setClause,
} from "./rows.js";
import {
  orderClause,
  orderColumn,
  type Ordering,
  pageClauses,
  pageLimit,
  pageOfRows,
  timeColumn,
} from "./paging.js";
import {
  libraryRowReadable,
  libraryRowWritable,
  ownCharacter,
  usableInCampaign,
} from "./visibility.js";

interface SpellRow extends ProvenanceColumns {
  readonly id: SpellId;
  readonly campaign_id: CampaignId | null;
  readonly account_id: AccountId | null;
  readonly derived_from: SpellId | null;
  readonly source_corpus: string | null;
  readonly source_family: string | null;
  readonly source_key: string | null;
  readonly name: string;
  readonly level: number;
  readonly school_index: string;
  readonly school_name: string;
  readonly ritual: boolean;
  readonly concentration: boolean;
  readonly casting_time: string;
  readonly spell_range: string;
  readonly duration: string;
  readonly class_indexes: ReadonlyArray<string>;
  readonly class_names: ReadonlyArray<string>;
  readonly subclass_indexes: ReadonlyArray<string>;
  readonly subclass_names: ReadonlyArray<string>;
  readonly body: SpellBody;
}

export const toSpell = (row: SpellRow): Spell =>
  new Spell({
    id: row.id,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    derivedFrom: row.derived_from,
    name: row.name,
    level: row.level,
    schoolIndex: row.school_index,
    schoolName: row.school_name,
    ritual: row.ritual,
    concentration: row.concentration,
    castingTime: row.casting_time,
    range: row.spell_range,
    duration: row.duration,
    classIndexes: row.class_indexes,
    classNames: row.class_names,
    subclassIndexes: row.subclass_indexes,
    subclassNames: row.subclass_names,
    spell: row.body,
    ...provenanceOf(row),
  });

const encodeBody = (body: SpellBody): string => JSON.stringify(body);

const compactReferences = (
  references: ReadonlyArray<SpellReference> | undefined,
): ReadonlyArray<SpellReference> => references ?? [];

const defaultBody = (payload: SpellLibraryCreate): SpellBody =>
  payload.spell ?? {
    desc: [],
    components: [],
    school: payload.school,
    classes: compactReferences(payload.classes),
    subclasses: compactReferences(payload.subclasses),
  };

const indexesOf = (references: ReadonlyArray<SpellReference>): ReadonlyArray<string> =>
  references.map((reference) => reference.index);

const namesOf = (references: ReadonlyArray<SpellReference>): ReadonlyArray<string> =>
  references.map((reference) => reference.name);

const createColumns = (payload: SpellLibraryCreate, owner: Record<string, unknown>) => {
  const body = defaultBody(payload);
  const school = payload.school;
  const classes = compactReferences(payload.classes ?? body.classes);
  const subclasses = compactReferences(payload.subclasses ?? body.subclasses);
  return defined({
    ...owner,
    name: payload.name,
    level: payload.level,
    school_index: school.index,
    school_name: school.name,
    ritual: payload.ritual,
    concentration: payload.concentration,
    casting_time: payload.castingTime,
    spell_range: payload.range,
    duration: payload.duration,
    class_indexes: indexesOf(classes),
    class_names: namesOf(classes),
    subclass_indexes: indexesOf(subclasses),
    subclass_names: namesOf(subclasses),
    body: encodeBody({ ...body, school, classes, subclasses }),
    visibility: "visibility" in payload ? payload.visibility : undefined,
  });
};

const updateColumns = (patch: SpellLibraryUpdate): Record<string, unknown> => {
  const school = patch.school ?? patch.spell?.school;
  const classes = patch.classes ?? patch.spell?.classes;
  const subclasses = patch.subclasses ?? patch.spell?.subclasses;
  return defined({
    name: patch.name,
    level: patch.level,
    school_index: school?.index,
    school_name: school?.name,
    ritual: patch.ritual,
    concentration: patch.concentration,
    casting_time: patch.castingTime,
    spell_range: patch.range,
    duration: patch.duration,
    class_indexes: classes === undefined ? undefined : indexesOf(classes),
    class_names: classes === undefined ? undefined : namesOf(classes),
    subclass_indexes: subclasses === undefined ? undefined : indexesOf(subclasses),
    subclass_names: subclasses === undefined ? undefined : namesOf(subclasses),
    body:
      patch.spell &&
      encodeBody({
        ...patch.spell,
        school: school ?? patch.spell.school,
        classes: classes ?? patch.spell.classes,
        subclasses: subclasses ?? patch.spell.subclasses,
      }),
    visibility: "visibility" in patch ? patch.visibility : undefined,
  });
};

const matchesQuery = (sql: SqlClient.SqlClient, query: string): Statement.Fragment =>
  sql.or([
    sql`spell.name ilike ${likeContains(query)}`,
    sql`spell.search @@ websearch_to_tsquery('english', ${query})`,
  ]);

const narrowedBy = (
  sql: SqlClient.SqlClient,
  filter: SpellFilterValues,
): ReadonlyArray<Statement.Fragment> => {
  const clauses: Array<Statement.Fragment> = [];
  if (filter.q !== undefined && filter.q.trim() !== "") {
    clauses.push(matchesQuery(sql, filter.q.trim()));
  }
  if (filter.levels !== undefined && filter.levels.length > 0) {
    clauses.push(sql`spell.level = any(${filter.levels.map((level) => Number(level))})`);
  }
  if (filter.schools !== undefined && filter.schools.length > 0) {
    clauses.push(sql`spell.school_index = any(${filter.schools})`);
  }
  if (filter.classes !== undefined && filter.classes.length > 0) {
    clauses.push(sql`spell.class_indexes && ${filter.classes}`);
  }
  if (filter.ritual !== undefined) clauses.push(sql`spell.ritual = ${filter.ritual}`);
  if (filter.concentration !== undefined) {
    clauses.push(sql`spell.concentration = ${filter.concentration}`);
  }
  return clauses;
};

const orderingsOf = (sql: SqlClient.SqlClient): Record<SpellSort, Ordering<SpellRow>> => {
  const name = orderColumn<SpellRow>(sql, sql`spell.name`, "text", (row) => row.name);
  const id = orderColumn<SpellRow>(sql, sql`spell.id`, "uuid", (row) => row.id);
  return {
    name: [name, id],
    recent: [
      timeColumn<SpellRow>(sql, sql`spell.created_at`, (row) => row.created_at, "desc"),
      name,
      id,
    ],
    level: [
      orderColumn<SpellRow>(sql, sql`spell.level`, "double precision", (row) => row.level),
      name,
      id,
    ],
  };
};

interface CharacterSpellRow {
  readonly id: CharacterId;
  readonly class_name: string | null;
  readonly level: number | null;
  readonly body: {
    readonly abilities?: ReadonlyArray<{ readonly label: string; readonly modifier: string }>;
    readonly identity?: { readonly subclass?: string };
    readonly spellcasting?: {
      readonly slots?: ReadonlyArray<{ readonly level: number; readonly total: number }>;
    };
  };
}

interface CharacterClassRow {
  readonly id: string;
  readonly name: string;
  readonly body: ClassBody;
}

interface CharacterClassLevelRow {
  readonly body: { readonly spellcasting?: Record<string, unknown> };
}

const selectedCampaigns = (
  sql: SqlClient.SqlClient,
  characterId: CharacterId,
  accountId: AccountId,
): Effect.Effect<ReadonlyArray<CampaignId>> =>
  sql<{ readonly campaign_id: CampaignId }>`
    select campaign_id from campaign_character
    where character_id = ${characterId}
      and account_id = ${accountId}
      and left_at is null
  `.pipe(
    Effect.map((rows) => rows.map((row) => row.campaign_id)),
    Effect.orDie,
  );

const usableForAnySeat = (
  sql: SqlClient.SqlClient,
  table: string,
  seats: ReadonlyArray<CampaignId>,
  actor: Actor,
): Statement.Fragment =>
  sql.or([
    libraryRowReadable(sql, table, actor),
    ...seats.map((campaignId) => usableInCampaign(sql, table, campaignId, actor)),
  ]);

type SpellSourceBody = CharacterSpellRow["body"];

const modifierOf = (body: SpellSourceBody, ability: string | undefined): number => {
  if (ability === undefined) return 0;
  const raw = body.abilities?.find(
    (entry) => entry.label.trim().toUpperCase() === ability.trim().toUpperCase(),
  )?.modifier;
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const numberAt = (record: Record<string, unknown> | undefined, key: string): number => {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const classSpellcasting = (
  raw: Record<string, unknown> | undefined,
): ClassLevelSpellcasting | undefined => {
  if (raw === undefined) return undefined;
  const explicit = Array.isArray(raw.slots)
    ? raw.slots.filter((v): v is number => typeof v === "number")
    : [];
  const slots =
    explicit.length > 0
      ? explicit
      : Array.from({ length: 9 }, (_, index) =>
          numberAt(raw, `spell_slots_level_${String(index + 1)}`),
        );
  while (slots.length > 0 && slots[slots.length - 1] === 0) slots.pop();
  const cantripsKnown = numberAt(raw, "cantrips_known") || numberAt(raw, "cantripsKnown");
  const spellsKnown = numberAt(raw, "spells_known") || numberAt(raw, "spellsKnown");
  return {
    ...(cantripsKnown === 0 ? {} : { cantripsKnown }),
    ...(spellsKnown === 0 ? {} : { spellsKnown }),
    slots,
  };
};

const highestSlot = (spellcasting: ClassLevelSpellcasting | undefined): number => {
  const slots = spellcasting?.slots ?? [];
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    if ((slots[index] ?? 0) > 0) return index + 1;
  }
  return 0;
};

const highestSheetSlot = (body: SpellSourceBody): number =>
  Math.max(0, ...(body.spellcasting?.slots ?? []).map((slot) => (slot.total > 0 ? slot.level : 0)));

const spellMode = (className: string | undefined): CharacterSpellbook["mode"] => {
  switch ((className ?? "").trim().toLowerCase()) {
    case "cleric":
    case "druid":
    case "paladin":
      return "prepared";
    case "wizard":
      return "spellbook";
    case "bard":
    case "ranger":
    case "sorcerer":
    case "warlock":
      return "known";
    default:
      return "none";
  }
};

const preparedLimit = (
  mode: CharacterSpellbook["mode"],
  className: string | undefined,
  level: number,
  modifier: number,
): number | undefined => {
  if (mode !== "prepared" && mode !== "spellbook") return undefined;
  const base = (className ?? "").trim().toLowerCase() === "paladin" ? Math.floor(level / 2) : level;
  return Math.max(1, base + modifier);
};

const wizardKnownLimit = (level: number): number => Math.max(6, 6 + (Math.max(1, level) - 1) * 2);

const matchesClassList = (sql: SqlClient.SqlClient, className: string): Statement.Fragment => sql`
  exists (select 1 from unnest(spell.class_names) as class_name
          where lower(class_name) = lower(${className}))
`;

const matchesSubclassList = (
  sql: SqlClient.SqlClient,
  subclassName: string,
): Statement.Fragment => sql`
  exists (select 1 from unnest(spell.subclass_names) as subclass_name
          where lower(subclass_name) = lower(${subclassName}))
`;

interface SpellbookSource {
  readonly className?: string | undefined;
  readonly subclassName?: string | undefined;
  readonly level: number;
  readonly body: SpellSourceBody;
  readonly seats: ReadonlyArray<CampaignId>;
}

const emptySpellRules = (source: SpellbookSource): CharacterSpellRules => ({
  ...(source.className === undefined ? {} : { className: source.className }),
  ...(source.subclassName === undefined ? {} : { subclassName: source.subclassName }),
  level: source.level,
  highestSlotLevel: 0,
  mode: "none",
  limits: {},
  spells: [],
});

const spellbookRulesFor = (sql: SqlClient.SqlClient, actor: Actor, source: SpellbookSource) =>
  Effect.gen(function* () {
    const className = source.className?.trim();
    if (className === undefined || className === "" || source.seats.length === 0) {
      return emptySpellRules(source);
    }

    const classRows = yield* sql<CharacterClassRow>`
      select id, name, body from character_option
      where kind = 'class'
        and lower(name) = lower(${className})
        and ${usableForAnySeat(sql, "character_option", source.seats, actor)}
      order by case when account_id is null and campaign_id is null then 0 else 1 end,
               created_at asc, id asc
      limit 1
    `;
    const classOption = classRows[0];
    const classLevelRows =
      classOption === undefined
        ? []
        : yield* sql<CharacterClassLevelRow>`
            select body from class_level
            where class_option_id = ${classOption.id}
              and subclass_id is null
              and level <= ${source.level}
            order by level desc
            limit 1
          `;
    const table = classSpellcasting(classLevelRows[0]?.body.spellcasting);
    const highestSlotLevel = Math.max(highestSlot(table), highestSheetSlot(source.body));
    const resolvedClassName = classOption?.name ?? className;
    const mode = spellMode(resolvedClassName);
    const modifier = modifierOf(source.body, classOption?.body.spellcastingAbility);
    const prepared = preparedLimit(mode, resolvedClassName, source.level, modifier);
    const limits = {
      ...(table?.cantripsKnown === undefined ? {} : { cantripsKnown: table.cantripsKnown }),
      ...(mode === "spellbook"
        ? { spellsKnown: wizardKnownLimit(source.level) }
        : table?.spellsKnown === undefined
          ? {}
          : { spellsKnown: table.spellsKnown }),
      ...(prepared === undefined ? {} : { prepared }),
    };
    const subclassName = source.subclassName?.trim();
    const rules = {
      className: resolvedClassName,
      ...(subclassName === undefined || subclassName === "" ? {} : { subclassName }),
      level: source.level,
      highestSlotLevel,
      mode,
      limits,
    };
    if (mode === "none" || (highestSlotLevel === 0 && (table?.cantripsKnown ?? 0) === 0)) {
      return { ...rules, spells: [] };
    }

    const spellRows = yield* sql<SpellRow>`
      select * from spell
      where ${sql.and([
        usableForAnySeat(sql, "spell", source.seats, actor),
        sql`(spell.level = 0 or spell.level <= ${highestSlotLevel})`,
        subclassName === undefined || subclassName === ""
          ? matchesClassList(sql, resolvedClassName)
          : sql.or([
              matchesClassList(sql, resolvedClassName),
              matchesSubclassList(sql, subclassName),
            ]),
      ])}
      order by spell.level asc, spell.name asc, spell.id asc
    `;
    return {
      ...rules,
      spells: spellRows.map((row) => {
        const subclass =
          subclassName !== undefined &&
          row.subclass_names.some((name) => name.toLowerCase() === subclassName.toLowerCase());
        return {
          spell: toSpell(row),
          list: subclass ? ("subclass" as const) : ("class" as const),
        };
      }),
    };
  });

/**
 * The 2014 SRD spell corpus, plus an account's own originals.
 *
 * | method           | predicate            |
 * | ---------------- | -------------------- |
 * | `library`        | `libraryRowReadable` |
 * | `libraryFindById`| `libraryRowReadable` |
 * | `libraryCreate`  | owner from the actor |
 * | `libraryUpdate`  | `libraryRowWritable` |
 * | `libraryRemove`  | `libraryRowWritable` |
 *
 * The Library is this corpus's entire surface. Campaign copies became internal
 * plumbing with the instancing decision of 2026-09-02 — creature instancing
 * lives in `EncounterCreatures.create`, and spells have no per-campaign
 * consumer at all — so the campaign-scoped methods (`list`, `findById`,
 * `create`, `update`, `remove`, `derive`) are gone with their endpoints.
 */
export class Spells extends Context.Service<
  Spells,
  {
    readonly library: (
      filter: SpellFilterValues,
    ) => Effect.Effect<Page<Spell, SpellSort>, never, CurrentActor>;
    readonly forCharacter: (
      id: CharacterId,
    ) => Effect.Effect<CharacterSpellbook, NotFound, CurrentActor>;
    readonly forDraft: (
      campaignId: CampaignId,
      draft: {
        readonly className?: string | undefined;
        readonly subclassName?: string | undefined;
        readonly level: number;
        readonly sheet: CharacterSheet;
      },
    ) => Effect.Effect<CharacterSpellRules, NotFound, CurrentActor>;
    readonly libraryFindById: (id: SpellId) => Effect.Effect<Spell, NotFound, CurrentActor>;
    readonly libraryCreate: (
      payload: SpellLibraryCreate,
    ) => Effect.Effect<Spell, never, CurrentActor>;
    readonly libraryUpdate: (
      id: SpellId,
      patch: SpellLibraryUpdate,
    ) => Effect.Effect<Spell, NotFound, CurrentActor>;
    readonly libraryRemove: (id: SpellId) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Spells") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const orderings = orderingsOf(sql);
      const orderingFor = (filter: SpellFilterValues) => {
        const sort = filter.cursor?.o ?? filter.sort ?? "level";
        return [sort, orderings[sort]] as const;
      };

      return {
        library: (filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const [sort, ordering] = orderingFor(filter);
              const rows = yield* sql<SpellRow>`
              select * from spell
              where ${sql.and([
                libraryRowReadable(sql, "spell", actor),
                ...narrowedBy(sql, filter),
                ...pageClauses(sql, ordering, filter.cursor),
              ])}
              order by ${orderClause(sql, ordering)}
              limit ${pageLimit(filter.limit)}
            `;
              return pageOfRows(rows, filter.limit, ordering, sort, toSpell);
            }),
          ),

        forCharacter: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const characterRows = yield* sql<CharacterSpellRow>`
                select id, class_name, level, body from character
                where character.id = ${id} and ${ownCharacter(sql, actor)}
              `;
              const character = characterRows[0];
              if (character === undefined)
                return yield* new NotFound({ resource: "character", id });
              const level = Math.max(1, character.level ?? 1);
              const rules = yield* spellbookRulesFor(sql, actor, {
                className: character.class_name ?? undefined,
                subclassName: character.body.identity?.subclass,
                level,
                body: character.body,
                seats: yield* selectedCampaigns(sql, id, actor.accountId),
              });
              return { characterId: id, ...rules };
            }),
          ),

        forDraft: (campaignId, draft) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              return yield* spellbookRulesFor(sql, actor, {
                className: draft.className,
                subclassName: draft.subclassName,
                level: Math.max(1, draft.level),
                body: draft.sheet,
                seats: [campaignId],
              });
            }),
          ),

        libraryFindById: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<SpellRow>`
              select * from spell
              where spell.id = ${id}
                and ${libraryRowReadable(sql, "spell", actor)}
            `;
              if (rows.length === 0) return yield* new NotFound({ resource: "spell", id });
              return toSpell(rows[0]!);
            }),
          ),

        libraryCreate: (payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<SpellRow>`
              insert into spell ${sql.insert(createColumns(payload, { account_id: actor.accountId }))}
              returning *
            `;
              return toSpell(rows[0]!);
            }),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<SpellRow>`
              update spell set ${setClause(sql, updateColumns(patch))}
              where spell.id = ${id}
                and ${libraryRowWritable(sql, "spell", actor)}
              returning *
            `;
              if (rows.length === 0) return yield* new NotFound({ resource: "spell", id });
              return toSpell(rows[0]!);
            }),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: SpellId }>`
              delete from spell
              where spell.id = ${id}
                and ${libraryRowWritable(sql, "spell", actor)}
              returning spell.id
            `;
              if (rows.length === 0) return yield* new NotFound({ resource: "spell", id });
            }),
          ),
      };
    }),
  );
}
