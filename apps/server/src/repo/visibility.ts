import { type Actor, type CampaignId, NotFound } from "@taverns/api";
import { Effect } from "effect";
import type { SqlClient, SqlError, Statement } from "effect/unstable/sql";

/**
 * The visibility seam, in SQL.
 *
 * Every read composes one of these fragments into its `WHERE` clause, so rows
 * the actor may not see are never fetched. Post-filtering in a handler is the
 * leak pattern: the DM-only text is already in memory and one forgotten
 * `.filter` ships it. Filtering here means the bytes never leave Postgres.
 *
 * Four conditions, all required:
 *
 *   ownership   the campaign belongs to the actor's account
 *   scope       the campaign is the one this credential was minted for, unless
 *               the credential covers the whole account
 *   the campaign is itself readable — for a player, `campaign.visibility`
 *               has to be `shared`
 *   the row is itself readable — for a player, `visibility` has to be `shared`
 *
 * The middle one is the master toggle, and it is why a `shared` note inside an
 * unshared campaign stays invisible. The fixtures show the same two levels for
 * a live encounter: a `Share` switch over the whole run plus a per-combatant
 * `Hide from players` override. Sharing one note must not open the campaign,
 * and closing the campaign must close everything under it.
 *
 * There is no player credential yet, so nothing produces a `player` actor over
 * HTTP today. The branch exists from the first query because adding it later
 * means auditing every read in the product instead of adding a token table.
 */

/**
 * The campaigns this actor's credential reaches at all, before any question of
 * what it may then do with them.
 *
 * Ownership is not scope. A DM token is minted for an account and carries
 * `campaignId: null`, so it reaches every campaign in it and this is one
 * redundant `true` in the plan. A credential minted for a single table carries
 * that table's id — and without this clause it would reach every `shared`
 * campaign under the same account, so a DM running two tables would leak table
 * A's shared rows to table B's players.
 *
 * Deliberately not keyed on the role: a scoped credential minted later for
 * something other than a player must not reach past its campaign either.
 */
const campaignInScope = (sql: SqlClient.SqlClient, actor: Actor): Statement.Fragment =>
  sql.and([
    sql`campaign.account_id = ${actor.accountId}`,
    actor.campaignId === null ? sql`true` : sql`campaign.id = ${actor.campaignId}`,
  ]);

/** Rows of `campaign` this actor may read. */
export const campaignReadable = (sql: SqlClient.SqlClient, actor: Actor): Statement.Fragment =>
  sql.and([
    campaignInScope(sql, actor),
    actor.seesDmContent ? sql`true` : sql`campaign.visibility = 'shared'`,
  ]);

/**
 * Rows of `campaign` this actor may write.
 *
 * A player matches nothing rather than being rejected with a distinct error:
 * telling a reader that a campaign exists but is not theirs to edit is itself
 * a disclosure, and the caller turns "no rows" into a plain 404.
 */
export const campaignWritable = (sql: SqlClient.SqlClient, actor: Actor): Statement.Fragment =>
  sql.and([campaignInScope(sql, actor), actor.role === "dm" ? sql`true` : sql`false`]);

/** Rows of a campaign-scoped table (`session`, `character`, `note`) this actor may read. */
export const rowReadable = (
  sql: SqlClient.SqlClient,
  table: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`${sql(table)}.campaign_id = ${campaignId}`,
    sql`exists (select 1 from campaign where campaign.id = ${sql(table)}.campaign_id and ${campaignReadable(sql, actor)})`,
    actor.seesDmContent ? sql`true` : sql`${sql(table)}.visibility = 'shared'`,
  ]);

/**
 * Rows of a table whose content is *either* campaign-scoped or global — today
 * only `creature`, where an `origin = 'system'` row has `campaign_id is null`
 * and belongs to every campaign at once.
 *
 * Two things about this are easy to get wrong, and both are the difference
 * between a shared corpus and a leak.
 *
 * **The campaign gate is not inside the branch.** A global row is reachable
 * *through a campaign this actor can read*, and through nothing else — the
 * `exists (…)` clause below applies to both halves of the union. Written the
 * other way round, as `campaign_id is null or rowReadable(…)`, a global row
 * would be readable by any authenticated request naming any campaign id at all,
 * including one belonging to somebody else. There is no separate check to lean
 * on: `findById` on this table is reached by path, and the path is a claim.
 *
 * **The row's own visibility still applies.** System creatures default to `dm`
 * like everything else, so "global" means shared between a DM's campaigns, not
 * shared with their players. A stat block is exactly the thing the product says
 * a player must not have.
 *
 * There is deliberately no `corpusRowWritable`. Writes use `rowWritable`
 * unchanged, which requires `campaign_id` to equal the campaign in the path —
 * and a null never equals a uuid, so the immutability of the global corpus is a
 * consequence of the predicate rather than a rule someone has to remember.
 */
export const corpusRowReadable = (
  sql: SqlClient.SqlClient,
  table: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql.or([
      sql`${sql(table)}.campaign_id = ${campaignId}`,
      sql`${sql(table)}.campaign_id is null`,
    ]),
    sql`exists (select 1 from campaign where campaign.id = ${campaignId} and ${campaignReadable(sql, actor)})`,
    actor.seesDmContent ? sql`true` : sql`${sql(table)}.visibility = 'shared'`,
  ]);

/** Whether the named campaign accepts writes from this actor. */
export const campaignWritableById = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql`exists (select 1 from campaign where campaign.id = ${campaignId} and ${campaignWritable(sql, actor)})`;

/**
 * Rows of a campaign-scoped table this actor may write.
 *
 * Note this is *not* `rowReadable`: a player can read a `shared` note, and must
 * still not be able to edit or delete it.
 */
export const rowWritable = (
  sql: SqlClient.SqlClient,
  table: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`${sql(table)}.campaign_id = ${campaignId}`,
    campaignWritableById(sql, campaignId, actor),
  ]);

/**
 * A table whose rows hang off another campaign-scoped row rather than off the
 * campaign directly — today only `prep_item` under `session`.
 *
 * The alternative is a denormalised `campaign_id` on the child, which would let
 * the existing `rowReadable` apply unchanged. It is rejected because it stores
 * the answer to "which campaign is this in" twice: a child whose copy disagrees
 * with its parent's is then readable in a campaign it is not part of, and
 * nothing in a `WHERE` clause would notice. Walking the parent means there is
 * one answer.
 */
export interface NestedTable {
  /** The child table, e.g. `prep_item`. */
  readonly table: string;
  /** The parent table, e.g. `session`. */
  readonly parent: string;
  /** The child's column pointing at the parent, e.g. `session_id`. */
  readonly foreignKey: string;
}

/**
 * Rows of a nested table this actor may read.
 *
 * Three levels now rather than two: the campaign has to be readable, *and* the
 * parent row, *and* the child. Composing `rowReadable(parent)` rather than
 * restating it is what carries the campaign-scope containment down — a
 * credential minted for one table cannot reach a prep item through a session in
 * another, because the clause it inherits already refused the session.
 */
export const nestedRowReadable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`${sql(`${nested.table}.${nested.foreignKey}`)} = ${parentId}`,
    sql`exists (select 1 from ${sql(nested.parent)} where ${sql(`${nested.parent}.id`)} = ${sql(`${nested.table}.${nested.foreignKey}`)} and ${rowReadable(sql, nested.parent, campaignId, actor)})`,
    actor.seesDmContent ? sql`true` : sql`${sql(`${nested.table}.visibility`)} = 'shared'`,
  ]);

/**
 * Rows of a nested table this actor may read, correlated to the parent row of
 * an *enclosing* query rather than to a parent id a caller supplied.
 *
 * This exists for one shape: an aggregate over the children computed alongside
 * the parent, such as an encounter's creature count. `nestedRowReadable` binds
 * the parent id as a value, which a correlated subquery cannot do — it has to
 * join to the outer row.
 *
 * **The parent's own readability is the enclosing query's job here, and this
 * function does not check it.** That is safe only because the enclosing query
 * is already selecting the parent through `rowReadable`, which is the thing
 * that carries campaign scope and ownership. Used anywhere else it would be a
 * child read with no containment at all — so it belongs in a subquery whose
 * `FROM` is the parent table, and nowhere else.
 */
export const nestedRowReadableWithin = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`${sql(`${nested.table}.${nested.foreignKey}`)} = ${sql(`${nested.parent}.id`)}`,
    actor.seesDmContent ? sql`true` : sql`${sql(`${nested.table}.visibility`)} = 'shared'`,
  ]);

/** Rows of a nested table this actor may write. Not `nestedRowReadable`. */
export const nestedRowWritable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`${sql(`${nested.table}.${nested.foreignKey}`)} = ${parentId}`,
    nestedParentWritable(sql, nested, parentId, campaignId, actor),
  ]);

/** Whether the named parent row exists and accepts writes from this actor. */
const nestedParentWritable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql`exists (select 1 from ${sql(nested.parent)} where ${sql(`${nested.parent}.id`)} = ${parentId} and ${rowWritable(sql, nested.parent, campaignId, actor)})`;

const ensure = (
  sql: SqlClient.SqlClient,
  resource: string,
  id: string,
  predicate: Statement.Fragment,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly allowed: boolean }>`select ${predicate} as allowed`;
    if (rows[0]?.allowed !== true) {
      return yield* new NotFound({ resource, id });
    }
  });

/**
 * Fails with `NotFound` unless the campaign exists and accepts writes from this
 * actor. Used before an insert, where there is no row yet to constrain.
 */
export const ensureCampaignWritable = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(sql, "campaign", campaignId, campaignWritableById(sql, campaignId, actor));

/**
 * Fails with `NotFound` unless the campaign is visible to this actor. Used by
 * list endpoints, so an unreachable campaign is a 404 rather than an empty list
 * that reads as "you have no notes".
 */
export const ensureCampaignReadable = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(
    sql,
    "campaign",
    campaignId,
    sql`exists (select 1 from campaign where campaign.id = ${campaignId} and ${campaignReadable(sql, actor)})`,
  );

/**
 * Fails with `NotFound` unless the nested table's parent row exists, sits in
 * this campaign, and accepts writes from this actor. Used before inserting a
 * child, where there is no row yet to constrain.
 *
 * The failure names the *parent* — `NotFound { resource: "session" }` — because
 * that is the thing the caller asked about and could not have.
 */
export const ensureNestedParentWritable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(
    sql,
    nested.parent,
    parentId,
    nestedParentWritable(sql, nested, parentId, campaignId, actor),
  );

/**
 * Fails with `NotFound` unless the nested table's parent row is visible to this
 * actor. Used by list endpoints, so an unreachable session is a 404 rather than
 * an empty checklist that reads as "you have nothing to prepare".
 */
export const ensureNestedParentReadable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(
    sql,
    nested.parent,
    parentId,
    sql`exists (select 1 from ${sql(nested.parent)} where ${sql(`${nested.parent}.id`)} = ${parentId} and ${rowReadable(sql, nested.parent, campaignId, actor)})`,
  );
