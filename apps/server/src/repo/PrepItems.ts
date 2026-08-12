import {
  type CampaignId,
  CurrentActor,
  NotFound,
  PrepItem,
  type PrepItemCreate,
  type PrepItemId,
  type PrepItemUpdate,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import {
  ensureNestedParentReadable,
  ensureNestedParentWritable,
  type NestedTable,
  nestedRowReadable,
  nestedRowWritable,
} from "./visibility.js";

export interface PrepItemRow extends ProvenanceColumns {
  readonly id: PrepItemId;
  readonly session_id: SessionId;
  readonly label: string;
  readonly done: boolean;
}

export const toPrepItem = (row: PrepItemRow): PrepItem =>
  new PrepItem({
    id: row.id,
    sessionId: row.session_id,
    label: row.label,
    done: row.done,
    ...provenanceOf(row),
  });

/** `prep_item` hangs off `session`, which hangs off `campaign`. */
export const PREP: NestedTable = {
  table: "prep_item",
  parent: "session",
  foreignKey: "session_id",
};

/**
 * The per-session "Before you sit down" checklist.
 *
 * Every method takes the campaign as well as the session, and that is not
 * redundant. The session id arrives from the client, so it is a claim, not a
 * fact — `nestedRowReadable` is handed the campaign the caller says the session
 * is in and refuses if the session is somewhere else. Trusting the session id
 * alone would let a credential scoped to one table read another table's
 * checklist by guessing a session id.
 */
export class PrepItems extends Context.Service<
  PrepItems,
  {
    readonly list: (
      campaignId: CampaignId,
      sessionId: SessionId,
    ) => Effect.Effect<ReadonlyArray<PrepItem>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      sessionId: SessionId,
      id: PrepItemId,
    ) => Effect.Effect<PrepItem, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      sessionId: SessionId,
      payload: PrepItemCreate,
    ) => Effect.Effect<PrepItem, NotFound, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      sessionId: SessionId,
      id: PrepItemId,
      patch: PrepItemUpdate,
    ) => Effect.Effect<PrepItem, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      sessionId: SessionId,
      id: PrepItemId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("PrepItems") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        list: (campaignId, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureNestedParentReadable(sql, PREP, sessionId, campaignId, actor);
              const rows = yield* sql<PrepItemRow>`
                select * from prep_item
                where ${nestedRowReadable(sql, PREP, sessionId, campaignId, actor)}
                order by prep_item.created_at asc
              `;
              return rows.map(toPrepItem);
            }),
          ),

        findById: (campaignId, sessionId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<PrepItemRow>`
                select * from prep_item
                where prep_item.id = ${id}
                  and ${nestedRowReadable(sql, PREP, sessionId, campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "prep_item", id });
              return toPrepItem(rows[0]!);
            }),
          ),

        create: (campaignId, sessionId, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureNestedParentWritable(sql, PREP, sessionId, campaignId, actor);
                const rows = yield* sql<PrepItemRow>`
                  insert into prep_item ${sql.insert(
                    defined({
                      session_id: sessionId,
                      label: payload.label,
                      done: payload.done,
                      visibility: payload.visibility,
                    }),
                  )}
                  returning *
                `;
                return toPrepItem(rows[0]!);
              }),
            ),
          ),

        update: (campaignId, sessionId, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({
                label: patch.label,
                done: patch.done,
                visibility: patch.visibility,
              });
              const rows = yield* sql<PrepItemRow>`
                update prep_item set ${setClause(sql, columns)}
                where prep_item.id = ${id}
                  and ${nestedRowWritable(sql, PREP, sessionId, campaignId, actor)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "prep_item", id });
              return toPrepItem(rows[0]!);
            }),
          ),

        remove: (campaignId, sessionId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: PrepItemId }>`
                delete from prep_item
                where prep_item.id = ${id}
                  and ${nestedRowWritable(sql, PREP, sessionId, campaignId, actor)}
                returning prep_item.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "prep_item", id });
            }),
          ),
      };
    }),
  );
}
