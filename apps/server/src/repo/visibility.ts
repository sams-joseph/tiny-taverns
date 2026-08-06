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

const ensure = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  predicate: Statement.Fragment,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly allowed: boolean }>`select ${predicate} as allowed`;
    if (rows[0]?.allowed !== true) {
      return yield* new NotFound({ resource: "campaign", id: campaignId });
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
  ensure(sql, campaignId, campaignWritableById(sql, campaignId, actor));

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
    campaignId,
    sql`exists (select 1 from campaign where campaign.id = ${campaignId} and ${campaignReadable(sql, actor)})`,
  );
