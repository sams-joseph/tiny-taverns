import {
  type Actor,
  type BeatId,
  type CampaignId,
  type CharacterId,
  type CreatureId,
  CurrentActor,
  type NoteId,
  NotFound,
  type SearchFilterValues,
  type SearchHit,
  type SearchSource,
  type SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import { BEATS } from "./Beats.js";
import { dieOnSqlError, likeContains } from "./rows.js";
import {
  containedRowReadable,
  corpusRowReadable,
  ensureCampaignReadable,
  inCampaign,
  rowReadable,
  under,
} from "./visibility.js";

/**
 * Campaign search: one query over the DM's prose and their bestiary.
 *
 * **This is the only place in the product where a `tsvector` is queried**, and
 * keeping it that way is the point of the file. The assistant's `searchCampaign`
 * tool will be a `Tool.make` wrapper around `search` below — it writes no SQL,
 * declares no predicate and gets no privilege, because the method already
 * returns `Effect<…, NotFound, CurrentActor>` and therefore cannot be called
 * without an actor to scope it. Two search paths over one corpus would become
 * permanent; there is one.
 *
 * ### Four arms, each carrying its own predicate
 *
 * The arms are unioned in SQL rather than merged in TypeScript, so the ordering
 * and the limit are applied once, over the whole result, by the database.
 *
 * | arm         | predicate                     | why that one            |
 * | ----------- | ----------------------------- | ----------------------- |
 * | `note`      | `rowReadable`                 | campaign-scoped rows    |
 * | `beat`      | the `beat → session` chain    | nested, no `campaign_id`|
 * | `creature`  | `corpusRowReadable`           | half the rows are global|
 * | `character` | `rowReadable`                 | campaign-scoped rows    |
 *
 * The fourth arm is what `0009_search_index.ts` advertised as "about eight
 * lines", spent — and it is the arm that makes the people the campaign is about
 * findable at all.
 *
 * **The campaign gate is inside every arm, never outside a bare `OR`.** That is
 * the `corpusRowReadable` lesson (`visibility.ts`) applied to a union: written
 * the natural way, one arm forgetting its `exists (select 1 from campaign …)`
 * is a row returned for any authenticated request naming any campaign id. The
 * arms below never restate a predicate — they compose the shipped ones — and
 * `test/search.test.ts` mints a campaign-scoped actor and proves a search from
 * the wrong campaign is empty.
 *
 * ### Two matchers, because one is not enough
 *
 * `ILIKE` reproduces mid-type behaviour — "ferry" finds the ferryman before the
 * word is finished — and full text finds what is only in a document, such as a
 * creature trait that is in no column at all. Neither subsumes the other, and
 * this is the same pairing `Creatures.list` already uses.
 *
 * `websearch_to_tsquery`, never `to_tsquery`: the latter raises a syntax error
 * on a stray `&` and turns a search box into a 500.
 */

/** `beat` reaches its campaign through its session, and says so once. */
const BEAT = under(BEATS.table, BEATS.foreignKey, inCampaign(BEATS.parent));

/**
 * The shape every arm of the union produces.
 *
 * Heterogeneous by construction: `title` is null for a beat and `session_id` is
 * null for everything else, because those are the fields that genuinely do not
 * exist on those rows. The wire type is a union discriminated on `source`, so
 * the nullability stops at this boundary and never reaches a client.
 */
interface HitRow {
  readonly source: SearchSource;
  /** Carries whichever of the three brands `source` names. */
  readonly id: string;
  readonly title: string | null;
  readonly session_id: SessionId | null;
  readonly snippet: string;
  /** `ts_rank`, which Postgres returns as `real`. Zero for an `ILIKE`-only hit. */
  readonly rank: number;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const toHit = (row: HitRow): SearchHit => {
  const common = {
    rank: row.rank,
    snippet: row.snippet,
    createdAt: DateTime.fromDateUnsafe(row.created_at),
    updatedAt: DateTime.fromDateUnsafe(row.updated_at),
  };
  switch (row.source) {
    // The casts are the union's cost, paid once and here: the id column holds
    // one of three brands and the discriminant is the only thing that says
    // which. Everything downstream gets the branded id it expects.
    case "note":
      return { source: "note", id: row.id as NoteId, title: row.title ?? "", ...common };
    case "beat":
      return { source: "beat", id: row.id as BeatId, sessionId: row.session_id!, ...common };
    case "creature":
      return { source: "creature", id: row.id as CreatureId, title: row.title ?? "", ...common };
    case "character":
      return { source: "character", id: row.id as CharacterId, title: row.title ?? "", ...common };
  }
};

/**
 * The excerpt options, as one string because that is the interface
 * `ts_headline` has.
 *
 * `StartSel` and `StopSel` are set to the **quoted** empty string, which is not
 * a detail that can be skipped: written bare as `StartSel=,StopSel=`, the
 * option parser swallows the following option and the snippet comes back
 * reading `,StopSel=ferryman</b> is called Cazril` — measured. Quoted, the
 * markup disappears and the excerpt is plain text, which is what the wire type
 * promises.
 *
 * A query that matches no lexeme — an `ILIKE`-only hit — yields the opening of
 * the document instead of nothing, which is the right fallback for a result
 * line.
 */
const HEADLINE = 'StartSel="", StopSel="", MaxWords=28, MinWords=8, MaxFragments=1';

/**
 * One arm of the union.
 *
 * Every arm selects the same columns in the same order, because that is what a
 * `UNION ALL` requires, and the `null::` casts are what let Postgres resolve a
 * type for a column one arm never fills.
 */
const arm = (
  sql: SqlClient.SqlClient,
  parts: {
    readonly source: SearchSource;
    readonly table: string;
    readonly title: Statement.Fragment;
    readonly sessionId: Statement.Fragment;
    readonly snippet: Statement.Fragment;
    readonly readable: Statement.Fragment;
    readonly matches: Statement.Fragment;
  },
  query: string,
): Statement.Fragment =>
  sql`
    select
      ${parts.source} as source,
      ${sql(`${parts.table}.id`)} as id,
      ${parts.title} as title,
      ${parts.sessionId} as session_id,
      ${parts.snippet} as snippet,
      ts_rank(${sql(`${parts.table}.search`)}, websearch_to_tsquery('english', ${query})) as rank,
      ${sql(`${parts.table}.created_at`)} as created_at,
      ${sql(`${parts.table}.updated_at`)} as updated_at
    from ${sql(parts.table)}
    where ${parts.readable} and ${parts.matches}
  `;

const noteArm = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
  query: string,
): Statement.Fragment =>
  arm(
    sql,
    {
      source: "note",
      table: "note",
      title: sql`note.title`,
      sessionId: sql`null::uuid`,
      snippet: sql`ts_headline('english', note.body, websearch_to_tsquery('english', ${query}), ${HEADLINE})`,
      readable: rowReadable(sql, "note", campaignId, actor),
      matches: sql.or([
        sql`note.title ilike ${likeContains(query)}`,
        sql`note.body ilike ${likeContains(query)}`,
        sql`note.search @@ websearch_to_tsquery('english', ${query})`,
      ]),
    },
    query,
  );

const beatArm = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
  query: string,
): Statement.Fragment =>
  arm(
    sql,
    {
      source: "beat",
      table: "beat",
      // A beat has no title, and an empty string here would be the schema
      // pretending otherwise. The wire union leaves the field out entirely.
      title: sql`null::text`,
      sessionId: sql`beat.session_id`,
      snippet: sql`ts_headline('english', beat.body, websearch_to_tsquery('english', ${query}), ${HEADLINE})`,
      // Not `nestedRowReadable`: that binds one parent id, and this asks about
      // every night in the campaign. The chain carries the campaign scope down
      // either way — it is the same recursion, without the id.
      readable: containedRowReadable(sql, BEAT, campaignId, actor),
      matches: sql.or([
        sql`beat.body ilike ${likeContains(query)}`,
        sql`beat.search @@ websearch_to_tsquery('english', ${query})`,
      ]),
    },
    query,
  );

const creatureArm = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
  query: string,
): Statement.Fragment =>
  arm(
    sql,
    {
      source: "creature",
      table: "creature",
      title: sql`creature.name`,
      sessionId: sql`null::uuid`,
      // The stat block is a `jsonb` document, not a paragraph, so there is
      // nothing for `ts_headline` to centre on. Its own meta line — "Small
      // humanoid (goblinoid), neutral evil" — is what the bestiary card shows
      // under the name, and it is the honest subtitle for a result row.
      snippet: sql`coalesce(creature.body ->> 'meta', '')`,
      // The one predicate that returns rows with no campaign of their own. The
      // campaign gate is still outside the null/equals branch, which is what
      // keeps a global creature reachable only through a campaign this actor
      // can read.
      readable: corpusRowReadable(sql, "creature", campaignId, actor),
      matches: sql.or([
        sql`creature.name ilike ${likeContains(query)}`,
        sql`creature.search @@ websearch_to_tsquery('english', ${query})`,
      ]),
    },
    query,
  );

const characterArm = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
  query: string,
): Statement.Fragment =>
  arm(
    sql,
    {
      source: "character",
      table: "character",
      title: sql`character.name`,
      sessionId: sql`null::uuid`,
      // The sheet's opening prose is the one paragraph a character has, so it
      // is what gets excerpted — and when there is none, the derived
      // `"Level 3 Half-orc Paladin"` line stands in, exactly as a creature's
      // meta line does. `ts_headline` over an empty string is an empty string,
      // which is why the fallback is a `nullif` rather than a `coalesce` on the
      // column alone.
      snippet: sql`coalesce(
        nullif(
          ts_headline('english', coalesce(character.body ->> 'notes', ''),
                      websearch_to_tsquery('english', ${query}), ${HEADLINE}),
          ''),
        character.descriptor,
        '')`,
      // The ordinary campaign-scoped predicate. A character is not a corpus
      // row: there is no global party, so nothing here needs the null branch
      // that makes `corpusRowReadable` the delicate one.
      readable: rowReadable(sql, "character", campaignId, actor),
      matches: sql.or([
        sql`character.name ilike ${likeContains(query)}`,
        // The player's own name, because "who is Ilse running" is a question a
        // DM asks out loud. It is indexed at weight B as well; the `ILIKE` is
        // what makes it work halfway through typing.
        sql`character.player_name ilike ${likeContains(query)}`,
        sql`character.search @@ websearch_to_tsquery('english', ${query})`,
      ]),
    },
    query,
  );

/** Enough for a results panel; a DM refines rather than scrolls. */
const DEFAULT_LIMIT = 50;

export class Search extends Context.Service<
  Search,
  {
    readonly search: (
      campaignId: CampaignId,
      filter: SearchFilterValues,
    ) => Effect.Effect<ReadonlyArray<SearchHit>, NotFound, CurrentActor>;
  }
>()("Search") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        search: (campaignId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // A 404 rather than an empty list, so an unreachable campaign
              // does not read as "nothing in your record matches" — which is
              // the answer a cross-campaign probe would most like to receive.
              yield* ensureCampaignReadable(sql, campaignId, actor);

              const query = filter.q.trim();
              if (query === "") return [];

              const arms = [
                filter.source === undefined || filter.source === "note"
                  ? noteArm(sql, campaignId, actor, query)
                  : undefined,
                filter.source === undefined || filter.source === "beat"
                  ? beatArm(sql, campaignId, actor, query)
                  : undefined,
                filter.source === undefined || filter.source === "creature"
                  ? creatureArm(sql, campaignId, actor, query)
                  : undefined,
                filter.source === undefined || filter.source === "character"
                  ? characterArm(sql, campaignId, actor, query)
                  : undefined,
              ].filter((fragment) => fragment !== undefined);

              // Ordering is `rank` first and then recency, with the id as a
              // total order — an unstable sort reads as the results reshuffling
              // themselves when nothing changed. `created_at` and not
              // `updated_at`: a beat's identity is the night it happened on,
              // and correcting a typo should not move it to the top.
              const rows = yield* sql<HitRow>`
                ${sql.join(" union all ", false)(arms)}
                order by rank desc, created_at desc, id asc
                limit ${filter.limit ?? DEFAULT_LIMIT}
              `;
              return rows.map(toHit);
            }),
          ),
      };
    }),
  );
}
