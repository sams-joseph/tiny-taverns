import {
  Campaign,
  type CampaignCreate,
  type CampaignId,
  type CampaignUpdate,
  CurrentActor,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import { campaignReadable, campaignWritable } from "./visibility.js";

interface CampaignRow extends ProvenanceColumns {
  readonly id: CampaignId;
  readonly name: string;
  readonly party_name: string | null;
  readonly player_count: number;
  readonly current_session_id: SessionId | null;
  readonly archived_at: Date | null;
}

const toCampaign = (row: CampaignRow): Campaign =>
  new Campaign({
    id: row.id,
    name: row.name,
    partyName: row.party_name,
    playerCount: row.player_count,
    currentSessionId: row.current_session_id,
    archivedAt: row.archived_at === null ? null : DateTime.fromDateUnsafe(row.archived_at),
    ...provenanceOf(row),
  });

/**
 * Reads and writes over `campaign`.
 *
 * Every method carries `CurrentActor` in its requirements. That is the whole
 * point: an unscoped read is not something you have to remember not to write —
 * it does not typecheck.
 */
export class Campaigns extends Context.Service<
  Campaigns,
  {
    readonly list: Effect.Effect<ReadonlyArray<Campaign>, never, CurrentActor>;
    readonly findById: (id: CampaignId) => Effect.Effect<Campaign, NotFound, CurrentActor>;
    readonly create: (payload: CampaignCreate) => Effect.Effect<Campaign, never, CurrentActor>;
    readonly update: (
      id: CampaignId,
      patch: CampaignUpdate,
    ) => Effect.Effect<Campaign, NotFound, CurrentActor>;
    readonly archive: (id: CampaignId) => Effect.Effect<Campaign, NotFound, CurrentActor>;
  }
>()("Campaigns") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const one = (rows: ReadonlyArray<CampaignRow>, id: CampaignId) =>
        rows.length === 0
          ? Effect.fail(new NotFound({ resource: "campaign", id }))
          : Effect.succeed(toCampaign(rows[0]!));

      return {
        list: dieOnSqlError(
          Effect.gen(function* () {
            const actor = yield* CurrentActor;
            const rows = yield* sql<CampaignRow>`
              select * from campaign
              where ${campaignReadable(sql, actor)} and campaign.archived_at is null
              order by campaign.created_at desc
            `;
            return rows.map(toCampaign);
          }),
        ),

        findById: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<CampaignRow>`
                select * from campaign
                where campaign.id = ${id} and ${campaignReadable(sql, actor)}
              `;
              return yield* one(rows, id);
            }),
          ),

        create: (payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<CampaignRow>`
                insert into campaign ${sql.insert(
                  defined({
                    account_id: actor.accountId,
                    name: payload.name,
                    party_name: payload.partyName,
                    player_count: payload.playerCount,
                    visibility: payload.visibility,
                  }),
                )}
                returning *
              `;
              return toCampaign(rows[0]!);
            }),
          ),

        update: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({
                name: patch.name,
                party_name: patch.partyName,
                player_count: patch.playerCount,
                current_session_id: patch.currentSessionId,
                visibility: patch.visibility,
              });
              const rows = yield* sql<CampaignRow>`
                update campaign set ${setClause(sql, columns)}
                where campaign.id = ${id} and ${campaignWritable(sql, actor)}
                returning *
              `;
              return yield* one(rows, id);
            }),
          ),

        archive: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<CampaignRow>`
                update campaign set archived_at = now(), updated_at = now()
                where campaign.id = ${id} and ${campaignWritable(sql, actor)}
                returning *
              `;
              return yield* one(rows, id);
            }),
          ),
      };
    }),
  );
}
