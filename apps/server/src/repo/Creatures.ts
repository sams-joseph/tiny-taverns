import {
  type AccountId,
  type CampaignId,
  Creature,
  CreatureFacets,
  type CreatureFilterValues,
  type CreatureId,
  type CreatureLibraryCreate,
  type CreatureLibraryUpdate,
  type CreatureSort,
  CurrentActor,
  type LibraryFilterValues,
  NotFound,
  type Page,
  type StatBlock,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, type SqlError, type Statement } from "effect/unstable/sql";
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
  corpusRowReadable,
  usableInCampaign,
  ensureCampaignReadable,
  libraryRowReadable,
  libraryRowWritable,
} from "./visibility.js";

interface CreatureRow extends ProvenanceColumns {
  readonly id: CreatureId;
  /** Null for a Library entity and for the bundled `system` corpus. */
  readonly campaign_id: CampaignId | null;
  /** Whose Library this is in; null for a campaign copy and for the bundle. */
  readonly account_id: AccountId | null;
  readonly derived_from: CreatureId | null;
  readonly name: string;
  readonly size: string | null;
  readonly type: string;
  readonly subtype: string | null;
  readonly alignment: string | null;
  readonly cr: string;
  readonly cr_sort: number;
  readonly ac: number;
  readonly hp: number;
  /** `text[]`; the pg driver hands these back as a real JS array. */
  readonly environments: ReadonlyArray<string>;
  readonly damage_vulnerabilities: ReadonlyArray<string>;
  readonly damage_resistances: ReadonlyArray<string>;
  readonly damage_immunities: ReadonlyArray<string>;
  readonly condition_immunities: ReadonlyArray<string>;
  readonly movement_modes: ReadonlyArray<string>;
  readonly spellcaster: boolean;
  readonly legendary: boolean;
  /** Minimal source key this row snapshots, when it came from an imported source. */
  readonly source_corpus: string | null;
  readonly source_family: string | null;
  readonly source_key: string | null;
  /** `jsonb`; the pg driver parses it, so this arrives as the document itself. */
  readonly body: StatBlock;
}

const toCreature = (row: CreatureRow): Creature =>
  new Creature({
    id: row.id,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    derivedFrom: row.derived_from,
    name: row.name,
    size: row.size,
    type: row.type,
    subtype: row.subtype,
    alignment: row.alignment,
    cr: row.cr,
    crSort: row.cr_sort,
    ac: row.ac,
    hp: row.hp,
    environments: row.environments,
    damageVulnerabilities: row.damage_vulnerabilities,
    damageResistances: row.damage_resistances,
    damageImmunities: row.damage_immunities,
    conditionImmunities: row.condition_immunities,
    movementModes: row.movement_modes,
    spellcaster: row.spellcaster,
    legendary: row.legendary,
    statBlock: row.body,
    ...provenanceOf(row),
  });

/**
 * The numeric sort key for a challenge rating written the way DMs write it.
 *
 * `"1/4"` is the case that forces this to exist at all (`data.js:38`): there is
 * no numeric column that can hold what the bestiary card prints. Derived on
 * write rather than asked for, so the two halves cannot disagree by accident —
 * a client that sends `cr: "1/4"` and `crSort: 30` is describing a creature
 * that sorts nowhere near where it reads.
 *
 * Total on purpose. A rating this does not recognise — `"—"`, `"Varies"` —
 * sorts first rather than failing the request: the DM asked to save a creature,
 * not to satisfy a parser, and `crSort` is there to be overridden when the
 * default is wrong.
 */
export const crSortFor = (cr: string): number => {
  const trimmed = cr.trim();
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(trimmed);
  if (fraction !== null) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? 0 : Math.min(1000, Number(fraction[1]) / denominator);
  }
  const whole = Number(trimmed);
  return Number.isFinite(whole) && whole >= 0 ? Math.min(1000, whole) : 0;
};

/**
 * The search clause.
 *
 * Two matchers, because one is not enough. `ILIKE` reproduces what the
 * prototype does — `name.toLowerCase().includes(q)` (`Bestiary.jsx:11-12`) — so
 * "gob" finds the Goblin Boss halfway through typing. Full text over the
 * generated `search` column finds what is only in the document, so "nimble
 * escape" finds it by a trait that is in no column at all. Neither subsumes the
 * other.
 *
 * `websearch_to_tsquery` rather than `to_tsquery`: it accepts whatever is in
 * the box, where `to_tsquery` raises a syntax error on a stray `&` and turns a
 * search field into a 500.
 */
const matchesQuery = (sql: SqlClient.SqlClient, query: string): Statement.Fragment =>
  sql.or([
    sql`creature.name ilike ${likeContains(query)}`,
    sql`creature.search @@ websearch_to_tsquery('english', ${query})`,
  ]);

/**
 * The clauses the search box and the environment chips contribute — everything
 * a client may vary about *which* creatures, as opposed to which corpus.
 *
 * Shared by the campaign bestiary and the Library rather than written twice, for
 * the reason `LibraryFilter` is spread into `CreatureFilter`: the two lists are
 * one screen's worth of behaviour read from two places, and the failure mode of
 * a second copy is a search box that quietly means something different at
 * `/library` than it does inside a campaign.
 *
 * It contributes **no** reach clause and cannot: what bounds the rows is the
 * predicate its caller puts beside these, and keeping the two apart is what
 * makes "the Library is anchored on `campaign_id is null`" a property of one
 * line in one method rather than of this helper being used correctly.
 */
const normalized = (values: ReadonlyArray<string> | undefined): ReadonlyArray<string> => [
  ...new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean)),
];

const textIn = (
  sql: SqlClient.SqlClient,
  column: Statement.Fragment,
  values: ReadonlyArray<string> | undefined,
): Statement.Fragment | undefined => {
  const choices = normalized(values);
  return choices.length === 0 ? undefined : sql`lower(${column}) = any(${choices})`;
};

const arrayOverlaps = (
  sql: SqlClient.SqlClient,
  column: Statement.Fragment,
  values: ReadonlyArray<string> | undefined,
): Statement.Fragment | undefined => {
  const choices = normalized(values);
  return choices.length === 0 ? undefined : sql`${column} && ${choices}`;
};

const narrowedBy = (
  sql: SqlClient.SqlClient,
  filter: LibraryFilterValues,
): ReadonlyArray<Statement.Fragment> => {
  const clauses: Array<Statement.Fragment> = [];
  if (filter.q !== undefined && filter.q.trim() !== "") {
    clauses.push(matchesQuery(sql, filter.q.trim()));
  }
  if (filter.environments !== undefined && filter.environments.length > 0) {
    // `&&` is array overlap: matches if the creature lives in any of them,
    // which is what a row of toggles means.
    clauses.push(sql`creature.environments && ${filter.environments}`);
  }
  if (filter.crMin !== undefined) clauses.push(sql`creature.cr_sort >= ${filter.crMin}`);
  if (filter.crMax !== undefined) clauses.push(sql`creature.cr_sort <= ${filter.crMax}`);
  for (const clause of [
    textIn(sql, sql`coalesce(creature.size, '')`, filter.sizes),
    textIn(sql, sql`creature.type`, filter.types),
    textIn(sql, sql`coalesce(creature.subtype, '')`, filter.subtypes),
    textIn(sql, sql`coalesce(creature.alignment, '')`, filter.alignments),
    arrayOverlaps(sql, sql`creature.damage_resistances`, filter.damageResistances),
    arrayOverlaps(sql, sql`creature.damage_immunities`, filter.damageImmunities),
    arrayOverlaps(sql, sql`creature.condition_immunities`, filter.conditionImmunities),
    arrayOverlaps(sql, sql`creature.movement_modes`, filter.movementModes),
  ]) {
    if (clause !== undefined) clauses.push(clause);
  }
  if (filter.legendary !== undefined) clauses.push(sql`creature.legendary = ${filter.legendary}`);
  if (filter.spellcaster !== undefined)
    clauses.push(sql`creature.spellcaster = ${filter.spellcaster}`);
  return clauses;
};

/**
 * The chip row's vocabulary: every environment named by a creature the given
 * predicate reaches.
 *
 * The predicate is the caller's — the campaign bestiary's or the Library's — so
 * there is exactly one place a reach clause is decided and this is not it. The
 * cap is a sanity bound rather than a page: this is a vocabulary, not a corpus,
 * and a table whose DM has typed two hundred distinct environments has a
 * different problem.
 */
const environmentsIn = (
  sql: SqlClient.SqlClient,
  readable: Statement.Fragment,
): Effect.Effect<ReadonlyArray<string>, SqlError.SqlError> =>
  Effect.map(
    sql<{ readonly environment: string }>`
      select distinct environment
      from creature, unnest(creature.environments) as environment
      where ${readable}
      order by environment asc
      limit 200
    `,
    (rows) => rows.map((row) => row.environment),
  );

const facetColumn = (
  sql: SqlClient.SqlClient,
  readable: Statement.Fragment,
  column: Statement.Fragment,
): Effect.Effect<ReadonlyArray<string>, SqlError.SqlError> =>
  Effect.map(
    sql<{ readonly value: string }>`
      select distinct ${column} as value
      from creature
      where ${readable}
        and ${column} is not null
        and btrim(${column}) <> ''
      order by value asc
      limit 200
    `,
    (rows) => rows.map((row) => row.value),
  );

const facetArray = (
  sql: SqlClient.SqlClient,
  readable: Statement.Fragment,
  column: Statement.Fragment,
): Effect.Effect<ReadonlyArray<string>, SqlError.SqlError> =>
  Effect.map(
    sql<{ readonly value: string }>`
      select distinct value
      from creature, unnest(${column}) as value
      where ${readable}
        and btrim(value) <> ''
      order by value asc
      limit 200
    `,
    (rows) => rows.map((row) => row.value),
  );

const facetsIn = (
  sql: SqlClient.SqlClient,
  readable: Statement.Fragment,
): Effect.Effect<CreatureFacets, SqlError.SqlError> =>
  Effect.gen(function* () {
    const [
      environments,
      sizes,
      types,
      subtypes,
      alignments,
      damageVulnerabilities,
      damageResistances,
      damageImmunities,
      conditionImmunities,
      movementModes,
      bounds,
      flags,
    ] = yield* Effect.all(
      [
        environmentsIn(sql, readable),
        facetColumn(sql, readable, sql`creature.size`),
        facetColumn(sql, readable, sql`creature.type`),
        facetColumn(sql, readable, sql`creature.subtype`),
        facetColumn(sql, readable, sql`creature.alignment`),
        facetArray(sql, readable, sql`creature.damage_vulnerabilities`),
        facetArray(sql, readable, sql`creature.damage_resistances`),
        facetArray(sql, readable, sql`creature.damage_immunities`),
        facetArray(sql, readable, sql`creature.condition_immunities`),
        facetArray(sql, readable, sql`creature.movement_modes`),
        sql<{ readonly min: number | null; readonly max: number | null }>`
          select min(creature.cr_sort) as min, max(creature.cr_sort) as max
          from creature
          where ${readable}
        `,
        sql<{ readonly legendary: boolean; readonly spellcaster: boolean }>`
          select bool_or(creature.legendary) as legendary,
                 bool_or(creature.spellcaster) as spellcaster
          from creature
          where ${readable}
        `,
      ],
      { concurrency: 4 },
    );

    return new CreatureFacets({
      environments,
      sizes,
      types,
      subtypes,
      alignments,
      damageVulnerabilities,
      damageResistances,
      damageImmunities,
      conditionImmunities,
      movementModes,
      crMin: bounds[0]?.min ?? null,
      crMax: bounds[0]?.max ?? null,
      legendary: flags[0]?.legendary ?? false,
      spellcaster: flags[0]?.spellcaster ?? false,
    });
  });

/**
 * `Bestiary.jsx:22-24`'s three orderings. Built from a closed literal union and
 * never from a client string, so there is no ordering to inject.
 *
 * CR and recent both fall back to the name, so a list of six creatures at CR 1
 * comes back in the same order every time — an unstable sort reads as the page
 * shuffling itself when nothing changed.
 *
 * **Every one of them ends in the id**, which paging requires rather than
 * prefers: none of the natural keys is unique — two campaigns hold a Goblin
 * Boss, a whole import shares one `created_at` — and a cursor over a
 * non-unique key names a position several rows wide, so a page boundary either
 * repeats a row or loses one. See `repo/paging.ts`.
 */
const orderingsOf = (sql: SqlClient.SqlClient): Record<CreatureSort, Ordering<CreatureRow>> => {
  const name = orderColumn<CreatureRow>(sql, sql`creature.name`, "text", (row) => row.name);
  const id = orderColumn<CreatureRow>(sql, sql`creature.id`, "uuid", (row) => row.id);
  return {
    name: [name, id],
    recent: [
      timeColumn<CreatureRow>(sql, sql`creature.created_at`, (row) => row.created_at, "desc"),
      name,
      id,
    ],
    cr: [
      orderColumn<CreatureRow>(
        sql,
        sql`creature.cr_sort`,
        "double precision",
        (row) => row.cr_sort,
      ),
      name,
      id,
    ],
  };
};

/**
 * The stat block on its way into a `jsonb` column, as text.
 *
 * Stringified rather than handed over as an object, because the same insert
 * also carries `environments`, a real `text[]`: a bare JS array becomes one
 * bind parameter that `pg` serialises to a Postgres *array literal*, and being
 * explicit about which of the two structured columns is which is cheaper than
 * remembering the rule at each call site.
 */
const encodeStatBlock = (statBlock: StatBlock): string => JSON.stringify(statBlock);

/**
 * The Library — where monsters are authored — **and the two campaign reads
 * that consume it**.
 *
 * A creature belongs to a campaign (an internal instance), or to an account (a
 * Library entity), or to nobody (the bundle). Since the instancing decision of
 * 2026-09-02 the campaign instances are plumbing: nothing here creates, edits,
 * removes or enumerates one. What is left splits so:
 *
 * | method              | reads through           | writes through        |
 * | ------------------- | ----------------------- | --------------------- |
 * | `list`              | `usableInCampaign`      |                       |
 * | `findById`          | `corpus OR usable`      |                       |
 * | `library*`          | `libraryRowReadable`    | `libraryRowWritable`  |
 *
 * `list` is the encounter picker: the bundle, the caller's own Library, and
 * group-shared originals — never a campaign instance. `findById` is wider
 * because a roster or a fight already names instances, and the stat block of a
 * creature on the table has to resolve whatever list it came from; an id is
 * not an enumeration. The instances themselves are minted by
 * `EncounterCreatures.create` at the point of use and by nothing else.
 *
 * **The bundle is immutable and no line here says so.** The write predicate
 * compares `account_id` to the account the credential resolved to; a bundled
 * row's is null, and a null never equals a uuid. `creature_system_is_unowned`
 * (`0015`) makes "a bundled row has no owner" a fact about the schema. So
 * there is still no `origin = 'system'` check anywhere in this file, and there
 * still does not need to be one. The shared corpus is provisioned by
 * `pnpm -F server bestiary:import` — see `src/bestiary/import.ts`.
 */
export class Creatures extends Context.Service<
  Creatures,
  {
    /**
     * What this campaign can build an encounter from: the bundle, the caller's
     * own Library, and group-shared originals (`usableInCampaign`) — never a
     * campaign instance.
     */
    readonly list: (
      campaignId: CampaignId,
      filter: CreatureFilterValues,
    ) => Effect.Effect<Page<Creature, CreatureSort>, NotFound, CurrentActor>;
    /**
     * The Library — **originals only**: the bundled corpus and the creatures
     * this account has authored, with no campaign in the path and no campaign
     * row in the answer.
     *
     * A campaign's creatures are copies (`derive` makes them), and the model is
     * that the Library shows the raw entity rather than anything a campaign is
     * holding. So this is not the union of `list` over every table — that is
     * what it used to be, and it was the wrong list.
     *
     * It cannot fail. There is no campaign in the path for a `NotFound` to be
     * about, so an account that has authored nothing gets the bundle rather than
     * a 404 — the shape `Memberships.mine` has, for the same reason.
     */
    readonly library: (
      filter: LibraryFilterValues,
    ) => Effect.Effect<Page<Creature, CreatureSort>, never, CurrentActor>;
    /** The chip row's vocabulary, over this Library — see `environments`. */
    readonly libraryEnvironments: () => Effect.Effect<ReadonlyArray<string>, never, CurrentActor>;
    readonly libraryFacets: () => Effect.Effect<CreatureFacets, never, CurrentActor>;
    readonly libraryFindById: (id: CreatureId) => Effect.Effect<Creature, NotFound, CurrentActor>;
    /**
     * Author a monster. **The only create in the product that names no
     * campaign**, which is the second of the captain's four statements: making a
     * monster is not an act inside a campaign.
     *
     * It cannot fail either — an account is the only thing it needs and the
     * credential already resolved to one, so there is no parent for a `NotFound`
     * to be about.
     */
    readonly libraryCreate: (
      payload: CreatureLibraryCreate,
    ) => Effect.Effect<Creature, never, CurrentActor>;
    readonly libraryUpdate: (
      id: CreatureId,
      patch: CreatureLibraryUpdate,
    ) => Effect.Effect<Creature, NotFound, CurrentActor>;
    readonly libraryRemove: (id: CreatureId) => Effect.Effect<void, NotFound, CurrentActor>;
    /**
     * One creature this campaign context can name: anything `list` offers,
     * plus the internal instances rosters and fights point at.
     */
    readonly findById: (
      campaignId: CampaignId,
      id: CreatureId,
    ) => Effect.Effect<Creature, NotFound, CurrentActor>;
  }
>()("Creatures") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // Built once: an ordering is a property of the table, not of a request.
      const orderings = orderingsOf(sql);

      /**
       * Which ordering a page is read in.
       *
       * **The cursor decides**, and `sort` beside it is ignored when one is
       * present — see `packages/api/src/Page.ts`. A key taken in one order and
       * compared against the columns of another is a coherent-looking answer
       * that is simply wrong, and the ordering name is on the cursor precisely
       * so this lookup is total.
       */
      const orderingFor = (filter: LibraryFilterValues): [CreatureSort, Ordering<CreatureRow>] => {
        const sort = filter.cursor?.o ?? filter.sort ?? "cr";
        return [sort, orderings[sort]];
      };

      /** For the Library: this account's own entities and the bundle. */
      const inLibrary = (id: CreatureId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<CreatureRow>`
            select * from creature
            where creature.id = ${id}
              and ${libraryRowReadable(sql, "creature", actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "creature", id });
          return rows[0]!;
        });

      /**
       * What a campaign context may name by id: anything the picker lists
       * (`usableInCampaign`, which keeps the bundle's row-visibility rule and
       * its campaign gate), plus the internal instances rosters and fights
       * already point at (`corpusRowReadable`, campaign-gated and
       * visibility-gated as it always was).
       *
       * **Not `copyableIntoCampaign`**: its `libraryRowReadable` disjunct
       * composes no campaign gate and no visibility test, which is right for a
       * write that has already proven the creator (the roster add) and a leak
       * on a read reached by path — a player would read a bundled stat block,
       * and a stranger's campaign id would answer instead of 404ing.
       */
      const reachable = (campaignId: CampaignId, id: CreatureId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<CreatureRow>`
            select * from creature
            where creature.id = ${id}
              and ${sql.or([
                corpusRowReadable(sql, "creature", campaignId, actor),
                usableInCampaign(sql, "creature", campaignId, actor),
              ])}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "creature", id });
          return rows[0]!;
        });

      return {
        list: (campaignId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // A 404 rather than an empty list, so an unreachable campaign
              // does not read as "nothing to pick from".
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const [sort, ordering] = orderingFor(filter);
              // Every one of these is a clause of the *same* `where`: the
              // visibility predicate, what the client narrowed, and where the
              // previous page stopped. Nothing is filtered after the query,
              // which is what makes a paged read neither a leak nor a short
              // page — see `repo/paging.ts`.
              const clauses = [
                usableInCampaign(sql, "creature", campaignId, actor),
                ...narrowedBy(sql, filter),
                ...pageClauses(sql, ordering, filter.cursor),
              ];
              const rows = yield* sql<CreatureRow>`
                select * from creature
                where ${sql.and(clauses)}
                order by ${orderClause(sql, ordering)}
                limit ${pageLimit(filter.limit)}
              `;
              return pageOfRows(rows, filter.limit, ordering, sort, toCreature);
            }),
          ),

        library: (filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const [sort, ordering] = orderingFor(filter);
              const rows = yield* sql<CreatureRow>`
                select * from creature
                where ${sql.and([
                  libraryRowReadable(sql, "creature", actor),
                  ...narrowedBy(sql, filter),
                  ...pageClauses(sql, ordering, filter.cursor),
                ])}
                order by ${orderClause(sql, ordering)}
                limit ${pageLimit(filter.limit)}
              `;
              return pageOfRows(rows, filter.limit, ordering, sort, toCreature);
            }),
          ),

        libraryEnvironments: () =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              return yield* environmentsIn(sql, libraryRowReadable(sql, "creature", actor));
            }),
          ),

        libraryFacets: () =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              return yield* facetsIn(sql, libraryRowReadable(sql, "creature", actor));
            }),
          ),

        libraryFindById: (id) => dieOnSqlError(Effect.map(inLibrary(id), toCreature)),

        /**
         * Author a monster into this account's Library.
         *
         * `account_id` comes from the actor and from nothing a caller supplied,
         * so there is no shape of request that authors into somebody else's
         * Library. `campaign_id` is not named at all — it takes the column
         * default, which is null, and that is what makes the row an original.
         *
         * No `ensure…` before it and nothing to check: an account is the only
         * thing this needs, and the credential already resolved to one. That
         * absence is the second of the captain's four statements written as
         * code.
         */
        libraryCreate: (payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<CreatureRow>`
                insert into creature ${sql.insert(
                  defined({
                    account_id: actor.accountId,
                    name: payload.name,
                    size: payload.size,
                    type: payload.type,
                    subtype: payload.subtype,
                    alignment: payload.alignment,
                    cr: payload.cr,
                    cr_sort: payload.crSort ?? crSortFor(payload.cr),
                    ac: payload.ac,
                    hp: payload.hp,
                    environments: payload.environments,
                    damage_vulnerabilities: payload.damageVulnerabilities,
                    damage_resistances: payload.damageResistances,
                    damage_immunities: payload.damageImmunities,
                    condition_immunities: payload.conditionImmunities,
                    movement_modes: payload.movementModes,
                    spellcaster: payload.spellcaster,
                    legendary: payload.legendary,
                    body: payload.statBlock && encodeStatBlock(payload.statBlock),
                  }),
                )}
                returning *
              `;
              return toCreature(rows[0]!);
            }),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({
                name: patch.name,
                size: patch.size,
                type: patch.type,
                subtype: patch.subtype,
                alignment: patch.alignment,
                cr: patch.cr,
                cr_sort: patch.crSort ?? (patch.cr === undefined ? undefined : crSortFor(patch.cr)),
                ac: patch.ac,
                hp: patch.hp,
                environments: patch.environments,
                damage_vulnerabilities: patch.damageVulnerabilities,
                damage_resistances: patch.damageResistances,
                damage_immunities: patch.damageImmunities,
                condition_immunities: patch.conditionImmunities,
                movement_modes: patch.movementModes,
                spellcaster: patch.spellcaster,
                legendary: patch.legendary,
                body: patch.statBlock && encodeStatBlock(patch.statBlock),
              });
              const rows = yield* sql<CreatureRow>`
                update creature set ${setClause(sql, columns)}
                where creature.id = ${id}
                  and ${libraryRowWritable(sql, "creature", actor)}
                returning *
              `;
              // A bundled creature lands here — readable in this Library and
              // owned by nobody — and so does another account's entity. Both get
              // the same refusal as "no such creature", on purpose.
              if (rows.length === 0) return yield* new NotFound({ resource: "creature", id });
              return toCreature(rows[0]!);
            }),
          ),

        /**
         * Delete one of this account's own Library entities.
         *
         * No `asConflict` here, unlike `remove`: the 409 there is
         * `encounter_creature.creature_id` refusing to lose a creature a roster
         * still names, and a roster can only ever name a row `corpusRowReadable`
         * returned — a campaign's own creature or the bundle, never an original.
         * A campaign holds copies. `library.test.ts` pins that a Library entity
         * cannot be put on a roster, so this stays a two-outcome endpoint.
         *
         * A campaign copy derived from this row keeps working: `derived_from` is
         * `on delete set null` and is read through by nothing, which is what the
         * copy being a snapshot means.
         */
        libraryRemove: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: CreatureId }>`
                delete from creature
                where creature.id = ${id}
                  and ${libraryRowWritable(sql, "creature", actor)}
                returning creature.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "creature", id });
            }),
          ),

        findById: (campaignId, id) =>
          dieOnSqlError(Effect.map(reachable(campaignId, id), toCreature)),
      };
    }),
  );
}
