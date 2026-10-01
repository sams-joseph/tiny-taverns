import {
  CampaignId,
  CurrentActor,
  NotFound,
  PrepItem,
  type PrepItemCreate,
  PrepItemId,
  type PrepItemUpdate,
  SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import {
  type AssistantOrigin,
  assistantColumns,
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  setClause,
  timestampColumns,
} from "./rows.js";
import {
  ensureNestedParentReadable,
  ensureNestedParentWritable,
  type NestedTable,
  nestedRowReadable,
  nestedRowWritable,
} from "./visibility.js";

/**
 * A `prep_item` row as the wire reads it, decoded off `prep_item.*` by
 * `SqlSchema`. Exported for `Recap`, which reads a night's ticked lines.
 */
export const PrepItemRow = classFromColumns(PrepItem, { ...PrepItem.fields, ...timestampColumns });

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/** The session a line is under, and the campaign the caller says that session is in. */
const parentFields = { campaignId: CampaignId, sessionId: SessionId } as const;

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
    /** `from` is the accept path's, and only its — see `Notes.create`. */
    readonly create: (
      campaignId: CampaignId,
      sessionId: SessionId,
      payload: PrepItemCreate,
      from?: AssistantOrigin,
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

      const readable = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(parentFields)),
        Result: PrepItemRow,
        execute: ({ campaignId, sessionId }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select * from prep_item
              where ${nestedRowReadable(sql, PREP, sessionId, campaignId, actor)}
              order by prep_item.created_at asc
            `,
          ),
      });
      const readableById = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...parentFields, id: PrepItemId })),
        Result: PrepItemRow,
        execute: ({ campaignId, sessionId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select * from prep_item
              where prep_item.id = ${id}
                and ${nestedRowReadable(sql, PREP, sessionId, campaignId, actor)}
            `,
          ),
      });
      /** A new line. What reaches its session was checked by the method that built the columns. */
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: PrepItemRow,
        execute: (columns) => sql`insert into prep_item ${sql.insert(columns)} returning *`,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...parentFields, id: PrepItemId, columns: Columns }),
        ),
        Result: PrepItemRow,
        execute: ({ campaignId, sessionId, id, columns }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update prep_item set ${setClause(sql, columns)}
              where prep_item.id = ${id}
                and ${nestedRowWritable(sql, PREP, sessionId, campaignId, actor)}
              returning *
            `,
          ),
      });
      const erase = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...parentFields, id: PrepItemId })),
        Result: fromColumns(Schema.Struct({ id: PrepItemId })),
        execute: ({ campaignId, sessionId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              delete from prep_item
              where prep_item.id = ${id}
                and ${nestedRowWritable(sql, PREP, sessionId, campaignId, actor)}
              returning prep_item.id
            `,
          ),
      });

      return {
        list: (campaignId, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureNestedParentReadable(sql, PREP, sessionId, campaignId, actor);
              return yield* readable({ campaignId, sessionId });
            }),
          ),

        findById: (campaignId, sessionId, id) =>
          dieOnSqlError(
            readableById({ campaignId, sessionId, id }).pipe(orNotFound("prep_item", id)),
          ),

        create: (campaignId, sessionId, payload, from) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureNestedParentWritable(sql, PREP, sessionId, campaignId, actor);
                // An insert answers with its row; not getting one is a defect.
                return yield* insert(
                  defined({
                    session_id: sessionId,
                    label: payload.label,
                    done: payload.done,
                    visibility: payload.visibility,
                    ...assistantColumns(from),
                  }),
                ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
              }),
            ),
          ),

        update: (campaignId, sessionId, id, patch) =>
          dieOnSqlError(
            change({
              campaignId,
              sessionId,
              id,
              columns: defined({
                label: patch.label,
                done: patch.done,
                visibility: patch.visibility,
              }),
            }).pipe(orNotFound("prep_item", id)),
          ),

        remove: (campaignId, sessionId, id) =>
          dieOnSqlError(
            Effect.asVoid(erase({ campaignId, sessionId, id }).pipe(orNotFound("prep_item", id))),
          ),
      };
    }),
  );
}
