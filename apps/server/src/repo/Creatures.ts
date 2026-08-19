import {
  type AccountId,
  type CampaignId,
  Conflict,
  Creature,
  type CreatureCreate,
  type CreatureFilterValues,
  type CreatureId,
  type CreatureLibraryCreate,
  type CreatureLibraryUpdate,
  type CreatureScope,
  type CreatureSort,
  type CreatureUpdate,
  CurrentActor,
  type LibraryFilterValues,
  NotFound,
  type Page,
  type StatBlock,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, SqlError, type Statement } from "effect/unstable/sql";
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
  copyableIntoCampaign,
  corpusRowReadable,
  ensureCampaignReadable,
  ensureCampaignWritable,
  libraryRowReadable,
  libraryRowWritable,
  rowWritable,
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
  readonly cr: string;
  readonly cr_sort: number;
  readonly ac: number;
  readonly hp: number;
  /** `text[]`; the pg driver hands these back as a real JS array. */
  readonly environments: ReadonlyArray<string>;
  readonly legendary: boolean;
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
    cr: row.cr,
    crSort: row.cr_sort,
    ac: row.ac,
    hp: row.hp,
    environments: row.environments,
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
 * `all` is the default because `Site.jsx:86` — "Save your own creatures next to
 * the official ones" — describes one list, not two tabs.
 */
const inScope = (sql: SqlClient.SqlClient, scope: CreatureScope): Statement.Fragment => {
  switch (scope) {
    case "campaign":
      return sql`creature.campaign_id is not null`;
    case "system":
      return sql`creature.campaign_id is null`;
    case "all":
      return sql`true`;
  }
};

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
 * A `ConstraintError` here means the roster still points at this creature.
 *
 * `encounter_creature.creature_id` refuses the delete rather than cascading, so
 * losing a creature an encounter contains is a 409 instead of a roster that
 * quietly got shorter. The DM finds out now, not by recounting the card later.
 */
const asConflict = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Conflict, R> =>
  Effect.catch(effect, (error): Effect.Effect<A, E | Conflict> =>
    SqlError.isSqlError(error) && error.reason._tag === "ConstraintError"
      ? Effect.fail(new Conflict({ message: "that creature is still on an encounter's roster" }))
      : Effect.fail(error),
  );

/**
 * The bestiary **and** the Library — one table, two worlds, and one mapper.
 *
 * A creature belongs to a campaign, or to an account (a Library entity, which is
 * where monsters are authored), or to nobody (the bundle). The methods split the
 * same way, and each half has its own pair of predicates:
 *
 * | method                   | reads through           | writes through        |
 * | ------------------------ | ----------------------- | --------------------- |
 * | `list` / `findById`      | `corpusRowReadable`     |                       |
 * | `create` / `update` / `remove` | `corpusRowReadable` | `rowWritable`       |
 * | `library*`               | `libraryRowReadable`    | `libraryRowWritable`  |
 * | `derive`                 | `copyableIntoCampaign`  | `rowWritable`         |
 *
 * **The bundle is immutable and no line here says so.** Both write predicates
 * compare an ownership column to a value the request carries — `rowWritable` the
 * campaign in the path, `libraryRowWritable` the account the credential resolved
 * to — and a bundled row has neither, so a null is compared to a uuid and
 * matches nothing. `creature_system_is_unowned` (`0015`) is what makes "a
 * bundled row has no owner" a fact about the schema rather than about how the
 * importer happens to be written. So there is still no `origin = 'system'` check
 * anywhere in this file, and there still does not need to be one.
 *
 * Nothing here can *mint* a bundled row either: neither create sets `origin`, so
 * the column default (`authored`) decides, and both set an owner — which the
 * same check refuses to pair with `system`. The shared corpus is provisioned by
 * `pnpm -F server bestiary:import` — see `src/bestiary/import.ts`, which
 * explains why that is a shell command and not an endpoint.
 *
 * The two lists share every part a client varies (`narrowedBy`, `orderBy`), so a
 * search box cannot come to mean something different at `/library` than it does
 * inside a campaign. What they never share is a row: a campaign holds copies and
 * the Library holds originals, and `derive` is the one seam between them.
 */
export class Creatures extends Context.Service<
  Creatures,
  {
    readonly list: (
      campaignId: CampaignId,
      filter: CreatureFilterValues,
    ) => Effect.Effect<Page<Creature, CreatureSort>, NotFound, CurrentActor>;
    /**
     * Every environment the creatures this campaign can reach are tagged with.
     *
     * A read of its own because the chip row is a fact about the corpus and a
     * page is a fact about fifty rows of it — see `Api.ts`. Same predicate as
     * `list`, so a chip can never name something the list will not return.
     */
    readonly environments: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<string>, NotFound, CurrentActor>;
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
    readonly findById: (
      campaignId: CampaignId,
      id: CreatureId,
    ) => Effect.Effect<Creature, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      payload: CreatureCreate,
    ) => Effect.Effect<Creature, NotFound, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      id: CreatureId,
      patch: CreatureUpdate,
    ) => Effect.Effect<Creature, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      id: CreatureId,
    ) => Effect.Effect<void, NotFound | Conflict, CurrentActor>;
    readonly derive: (
      campaignId: CampaignId,
      id: CreatureId,
      patch: CreatureUpdate,
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

      const readable = (campaignId: CampaignId, id: CreatureId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<CreatureRow>`
            select * from creature
            where creature.id = ${id}
              and ${corpusRowReadable(sql, "creature", campaignId, actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "creature", id });
          return rows[0]!;
        });

      /** The same, for the Library: this account's own entities and the bundle. */
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
       * What `derive` may copy: this campaign's bestiary, the bundle, or the
       * caller's own Library — and nothing else.
       *
       * A separate reader rather than an argument to `readable`, so the wider
       * predicate is reachable from exactly one method and a future read cannot
       * pick it up by passing a flag.
       */
      const copyable = (campaignId: CampaignId, id: CreatureId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<CreatureRow>`
            select * from creature
            where creature.id = ${id}
              and ${copyableIntoCampaign(sql, "creature", campaignId, actor)}
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
              // does not read as "your bestiary is empty".
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const [sort, ordering] = orderingFor(filter);
              // Every one of these is a clause of the *same* `where`: the
              // visibility predicate, what the client narrowed, and where the
              // previous page stopped. Nothing is filtered after the query,
              // which is what makes a paged read neither a leak nor a short
              // page — see `repo/paging.ts`.
              const clauses = [
                corpusRowReadable(sql, "creature", campaignId, actor),
                inScope(sql, filter.scope ?? "all"),
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

        environments: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              return yield* environmentsIn(
                sql,
                corpusRowReadable(sql, "creature", campaignId, actor),
              );
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
                    cr: payload.cr,
                    cr_sort: payload.crSort ?? crSortFor(payload.cr),
                    ac: payload.ac,
                    hp: payload.hp,
                    environments: payload.environments,
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
                cr: patch.cr,
                cr_sort: patch.crSort ?? (patch.cr === undefined ? undefined : crSortFor(patch.cr)),
                ac: patch.ac,
                hp: patch.hp,
                environments: patch.environments,
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
          dieOnSqlError(Effect.map(readable(campaignId, id), toCreature)),

        create: (campaignId, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                const rows = yield* sql<CreatureRow>`
                  insert into creature ${sql.insert(
                    defined({
                      campaign_id: campaignId,
                      name: payload.name,
                      size: payload.size,
                      type: payload.type,
                      cr: payload.cr,
                      cr_sort: payload.crSort ?? crSortFor(payload.cr),
                      ac: payload.ac,
                      hp: payload.hp,
                      environments: payload.environments,
                      legendary: payload.legendary,
                      body: payload.statBlock && encodeStatBlock(payload.statBlock),
                      visibility: payload.visibility,
                    }),
                  )}
                  returning *
                `;
                return toCreature(rows[0]!);
              }),
            ),
          ),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({
                name: patch.name,
                size: patch.size,
                type: patch.type,
                cr: patch.cr,
                // A new rating re-derives the sort key unless the patch names
                // one, so editing `"1"` to `"1/4"` cannot leave it sorting at 1.
                cr_sort: patch.crSort ?? (patch.cr === undefined ? undefined : crSortFor(patch.cr)),
                ac: patch.ac,
                hp: patch.hp,
                environments: patch.environments,
                legendary: patch.legendary,
                body: patch.statBlock && encodeStatBlock(patch.statBlock),
                visibility: patch.visibility,
              });
              const rows = yield* sql<CreatureRow>`
                update creature set ${setClause(sql, columns)}
                where creature.id = ${id}
                  and ${rowWritable(sql, "creature", campaignId, actor)}
                returning *
              `;
              // A `system` creature lands here: readable, not writable, and the
              // refusal says the same thing as "no such creature" on purpose.
              if (rows.length === 0) return yield* new NotFound({ resource: "creature", id });
              return toCreature(rows[0]!);
            }),
          ),

        remove: (campaignId, id) =>
          dieOnSqlError(
            asConflict(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const rows = yield* sql<{ readonly id: CreatureId }>`
                  delete from creature
                  where creature.id = ${id}
                    and ${rowWritable(sql, "creature", campaignId, actor)}
                  returning creature.id
                `;
                if (rows.length === 0) return yield* new NotFound({ resource: "creature", id });
              }),
            ),
          ),

        /**
         * **Using a monster in a campaign: the copy.** A creature this actor may
         * copy goes into this campaign, the edits are applied, and where it came
         * from is remembered.
         *
         * This is the third of the captain's four statements, and the words that
         * settle it are *copied state*: the campaign's row is a **snapshot**.
         * Nothing is ever read through `derived_from`, so editing the original
         * afterwards does not reach the copy and deleting the original leaves it
         * standing with a null pointer. That is the same rule `combatant`
         * already follows for a fight.
         *
         * The source is `copyableIntoCampaign` — this campaign's bestiary, the
         * bundle, or the caller's own Library. The Library half is what makes
         * authoring-then-using a real path; it is the *only* widening, and in
         * particular a creature in another of this DM's own campaigns is still a
         * 404 (see `AGENTS.md`).
         *
         * The copy is `authored` whatever the original was — the DM wrote the
         * changes, so they are the author — and `campaign_id` is what makes it
         * the campaign's rather than anybody's Library entity. `account_id` is
         * not copied and could not be: `creature_one_owner` refuses a row that
         * is a campaign's and an account's at once, which is the constraint
         * saying "a copy has left the Library".
         *
         * Its visibility is **not** copied. It falls to the column default
         * (`dm`) unless the patch names one, because a copy is a new row and a
         * new row fails closed. Inheriting `shared` from the original would
         * make the safe default depend on what you happened to derive from —
         * and a Library entity has no visibility to inherit in the first place.
         */
        derive: (campaignId, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                const source = yield* copyable(campaignId, id);
                const cr = patch.cr ?? source.cr;
                const rows = yield* sql<CreatureRow>`
                  insert into creature ${sql.insert(
                    defined({
                      campaign_id: campaignId,
                      derived_from: source.id,
                      name: patch.name ?? source.name,
                      size: patch.size === undefined ? source.size : patch.size,
                      type: patch.type ?? source.type,
                      cr,
                      cr_sort:
                        patch.crSort ?? (patch.cr === undefined ? source.cr_sort : crSortFor(cr)),
                      ac: patch.ac ?? source.ac,
                      hp: patch.hp ?? source.hp,
                      environments: patch.environments ?? source.environments,
                      legendary: patch.legendary ?? source.legendary,
                      body: encodeStatBlock(patch.statBlock ?? source.body),
                      visibility: patch.visibility,
                    }),
                  )}
                  returning *
                `;
                return toCreature(rows[0]!);
              }),
            ),
          ),
      };
    }),
  );
}
