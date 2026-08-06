import {
  type CampaignId,
  Conflict,
  CurrentActor,
  NotFound,
  Session,
  type SessionCreate,
  type SessionId,
  type SessionUpdate,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import {
  ensureCampaignReadable,
  ensureCampaignWritable,
  rowReadable,
  rowWritable,
} from "./visibility.js";

interface SessionRow extends ProvenanceColumns {
  readonly id: SessionId;
  readonly campaign_id: CampaignId;
  readonly number: number;
  readonly title: string | null;
  readonly started_at: Date | null;
  readonly ended_at: Date | null;
}

const toSession = (row: SessionRow): Session =>
  new Session({
    id: row.id,
    campaignId: row.campaign_id,
    number: row.number,
    title: row.title,
    startedAt: row.started_at === null ? null : DateTime.fromDateUnsafe(row.started_at),
    endedAt: row.ended_at === null ? null : DateTime.fromDateUnsafe(row.ended_at),
    ...provenanceOf(row),
  });

/**
 * `(campaign_id, number)` is unique, so a repeated session number surfaces as a
 * 409 rather than a 500. The database is the arbiter — checking first and then
 * inserting would race.
 */
const asConflict = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Conflict, R> =>
  Effect.catch(effect, (error): Effect.Effect<A, E | Conflict> =>
    SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
      ? Effect.fail(new Conflict({ message: "that session number is already used" }))
      : Effect.fail(error),
  );

export class Sessions extends Context.Service<
  Sessions,
  {
    readonly list: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<Session>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      id: SessionId,
    ) => Effect.Effect<Session, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      payload: SessionCreate,
    ) => Effect.Effect<Session, NotFound | Conflict, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      id: SessionId,
      patch: SessionUpdate,
    ) => Effect.Effect<Session, NotFound | Conflict, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      id: SessionId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Sessions") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* sql<SessionRow>`
                select * from session
                where ${rowReadable(sql, "session", campaignId, actor)}
                order by session.number desc
              `;
              return rows.map(toSession);
            }),
          ),

        findById: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<SessionRow>`
                select * from session
                where session.id = ${id} and ${rowReadable(sql, "session", campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "session", id });
              return toSession(rows[0]!);
            }),
          ),

        create: (campaignId, payload) =>
          dieOnSqlError(
            asConflict(
              sql.withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureCampaignWritable(sql, campaignId, actor);
                  const rows = yield* sql<SessionRow>`
                    insert into session ${sql.insert(
                      defined({
                        campaign_id: campaignId,
                        number: payload.number,
                        title: payload.title,
                        visibility: payload.visibility,
                      }),
                    )}
                    returning *
                  `;
                  return toSession(rows[0]!);
                }),
              ),
            ),
          ),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            asConflict(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const columns = defined({
                  number: patch.number,
                  title: patch.title,
                  started_at: patch.startedAt && DateTime.toDateUtc(patch.startedAt),
                  ended_at: patch.endedAt && DateTime.toDateUtc(patch.endedAt),
                  visibility: patch.visibility,
                });
                const rows = yield* sql<SessionRow>`
                  update session set ${setClause(sql, columns)}
                  where session.id = ${id} and ${rowWritable(sql, "session", campaignId, actor)}
                  returning *
                `;
                if (rows.length === 0) return yield* new NotFound({ resource: "session", id });
                return toSession(rows[0]!);
              }),
            ),
          ),

        remove: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: SessionId }>`
                delete from session
                where session.id = ${id} and ${rowWritable(sql, "session", campaignId, actor)}
                returning session.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "session", id });
            }),
          ),
      };
    }),
  );
}
