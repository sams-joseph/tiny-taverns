import {
  type CampaignId,
  Conflict,
  Creature,
  type CreatureCreate,
  type CreatureFilterValues,
  type CreatureId,
  type CreatureScope,
  type CreatureSort,
  type CreatureUpdate,
  CurrentActor,
  type LibraryFilterValues,
  NotFound,
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
  corpusRowReadable,
  ensureCampaignReadable,
  ensureCampaignWritable,
  rowWritable,
  sharedCorpusRowReadable,
} from "./visibility.js";

interface CreatureRow extends ProvenanceColumns {
  readonly id: CreatureId;
  /** Null for the global `system` corpus. */
  readonly campaign_id: CampaignId | null;
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
 * `Bestiary.jsx:22-24`'s three orderings. Built from a closed literal union and
 * never from a client string, so there is no ordering to inject.
 *
 * CR and name both fall back to the name, so a list of six creatures at CR 1
 * comes back in the same order every time — an unstable sort reads as the page
 * shuffling itself when nothing changed.
 */
const orderBy = (sql: SqlClient.SqlClient, sort: CreatureSort): Statement.Fragment => {
  switch (sort) {
    case "name":
      return sql`creature.name asc`;
    case "recent":
      return sql`creature.created_at desc, creature.name asc`;
    case "cr":
      return sql`creature.cr_sort asc, creature.name asc`;
  }
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
 * The bestiary.
 *
 * Every read goes through `corpusRowReadable`, which is the only predicate in
 * the product that returns rows with no campaign of their own. Every write goes
 * through `rowWritable`, which is the ordinary campaign-scoped one — and that
 * asymmetry *is* the immutability of the `system` corpus, because `rowWritable`
 * requires `campaign_id` to equal the campaign in the path and a global row's is
 * null. There is no `origin = 'system'` check anywhere in this file, and there
 * does not need to be one.
 *
 * `library` is the third predicate in the file and the only read that names no
 * campaign: the shared corpus read on its own, for the nav's global *Library*
 * item. It is not a special case of `list` — `list` answers *this campaign's
 * creatures plus the corpus*, which is a different question with a different
 * gate — so it composes `sharedCorpusRowReadable` rather than passing a scope,
 * and shares only the parts a client varies (`narrowedBy`, `orderBy`).
 *
 * Nothing here can write a `system` row either: `create` never sets `origin`, so
 * the column default (`authored`) decides, and the database's
 * `creature_system_is_global` check would refuse a global row from a path that
 * always has a campaign. The shared corpus is provisioned by
 * `pnpm -F server bestiary:import` — see `src/bestiary/import.ts`, which
 * explains why that is a shell command and not an endpoint.
 */
export class Creatures extends Context.Service<
  Creatures,
  {
    readonly list: (
      campaignId: CampaignId,
      filter: CreatureFilterValues,
    ) => Effect.Effect<ReadonlyArray<Creature>, NotFound, CurrentActor>;
    /**
     * The Library — the shared corpus, with no campaign to read it through.
     *
     * **`CurrentActor` is required and never read, and that is the point.** The
     * rule this endpoint implements is *any authenticated account*, and the
     * requirement is what makes the word "authenticated" a fact the compiler
     * checks: a caller with no actor — `bestiary/import.ts`, a bin script, a
     * future group somebody forgets to put `Authorization` on — cannot reach
     * this method at all. Which rows come back is `sharedCorpusRowReadable`'s
     * answer and does not depend on who is asking; *that* somebody is asking
     * does, and this is where it is enforced.
     *
     * It cannot fail. There is no campaign in the path for a `NotFound` to be
     * about, so an account that is a member of nothing gets a list rather than a
     * 404 — the same shape as `Memberships.mine`.
     */
    readonly library: (
      filter: LibraryFilterValues,
    ) => Effect.Effect<ReadonlyArray<Creature>, never, CurrentActor>;
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

      return {
        list: (campaignId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // A 404 rather than an empty list, so an unreachable campaign
              // does not read as "your bestiary is empty".
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const clauses = [
                corpusRowReadable(sql, "creature", campaignId, actor),
                inScope(sql, filter.scope ?? "all"),
                ...narrowedBy(sql, filter),
              ];
              const rows = yield* sql<CreatureRow>`
                select * from creature
                where ${sql.and(clauses)}
                order by ${orderBy(sql, filter.sort ?? "cr")}
              `;
              return rows.map(toCreature);
            }),
          ),

        library: (filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              // Named and discarded. It is not a filter — see the doc on this
              // method's signature for why requiring it is the whole of the
              // "authenticated" half of the reach rule.
              yield* CurrentActor;
              const rows = yield* sql<CreatureRow>`
                select * from creature
                where ${sql.and([sharedCorpusRowReadable(sql, "creature"), ...narrowedBy(sql, filter)])}
                order by ${orderBy(sql, filter.sort ?? "cr")}
              `;
              return rows.map(toCreature);
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
         * The reskin: copy a creature this actor can read into this campaign,
         * apply the edits, and remember where it came from.
         *
         * The copy is `authored` whatever the original was — the DM wrote the
         * changes, so they are the author — and `derived_from` is the only
         * record that the Ferryman's Wife started life as a Marsh Hag.
         *
         * Its visibility is **not** copied. It falls to the column default
         * (`dm`) unless the patch names one, because a copy is a new row and a
         * new row fails closed. Inheriting `shared` from the original would
         * make the safe default depend on what you happened to derive from.
         */
        derive: (campaignId, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                const source = yield* readable(campaignId, id);
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
