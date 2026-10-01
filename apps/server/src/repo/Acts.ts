import {
  CampaignAct,
  type CampaignActCreate,
  CampaignActId,
  type CampaignActUpdate,
  CampaignId,
  Conflict,
  CurrentActor,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlError, SqlSchema } from "effect/sql";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
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
import { ensureCampaignReadable, rowReadable, rowWritable } from "./visibility.js";

/** A `campaign_act` row as the wire reads it, decoded off `campaign_act.*` by `SqlSchema`. */
const ActRow = classFromColumns(CampaignAct, { ...CampaignAct.fields, ...timestampColumns });

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/**
 * `(campaign_id, first_session_number)` is unique, so a second act at a night
 * that already starts one is a 409 rather than a 500 — `Sessions`' reason, and
 * the database is the arbiter for the same one.
 */
const asConflict = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Conflict, R> =>
  Effect.catch(effect, (error): Effect.Effect<A, E | Conflict> =>
    SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
      ? Effect.fail(new Conflict({ message: "an act already starts at that session" }))
      : Effect.fail(error),
  );

/**
 * A campaign's acts (`0071_campaign_act.ts`).
 *
 * The list is an ordinary actor-scoped read through `rowReadable`: the creator
 * and a player read the same schema, and what narrows a player's answer is the
 * act's own Share switch, as it is for a night. There is no player projection
 * to diverge from, so the read takes no proof (`Party`'s reason).
 *
 * The writes are the creator's alone and take a `CampaignCreatorActor`, with
 * `rowWritable` still composed beneath it. Creating one asks for the night it
 * starts at through that night's own creator predicate, so an act can only be
 * started at a night of this campaign that exists.
 *
 * Nothing else reads this table but the creator's Hob, whose `proposeAct`
 * reads the list to say which night already starts one; its accept writes
 * through `create`. Search does not index it, and a Shared World is told
 * nothing of it.
 */
export class Acts extends Context.Service<
  Acts,
  {
    /** Every act this actor may read, oldest start first. */
    readonly list: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<CampaignAct>, NotFound, CurrentActor>;
    /**
     * Starts an act at a night. `NotFound` for a night this campaign does not
     * have; `Conflict` for a night that already starts one. `from` is the
     * accept path's, and only its — see `Notes.create`.
     */
    readonly create: (
      creator: CampaignCreatorActor,
      payload: CampaignActCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<CampaignAct, NotFound | Conflict>;
    /** Renames, shares or unshares one. */
    readonly update: (
      creator: CampaignCreatorActor,
      id: CampaignActId,
      patch: CampaignActUpdate,
    ) => Effect.Effect<CampaignAct, NotFound>;
    /** Removes one; its nights fall under the act before it. */
    readonly remove: (
      creator: CampaignCreatorActor,
      id: CampaignActId,
    ) => Effect.Effect<void, NotFound>;
  }
>()("Acts") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const readable = SqlSchema.findAll({
        Request: Schema.toType(CampaignId),
        Result: ActRow,
        execute: (campaignId) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select campaign_act.* from campaign_act
              where ${rowReadable(sql, "campaign_act", campaignId, actor)}
              order by campaign_act.first_session_number asc
            `,
          ),
      });
      /**
       * The night an act starts at, locked for the insert that follows, so a
       * delete racing that write lands before it (and refuses it) or after it,
       * which leaves the act at a gap as any delete does.
       */
      const startingNight = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, number: Schema.Int })),
        Result: fromColumns(Schema.Struct({ id: Schema.String })),
        execute: ({ campaign, actor, number }) => sql`
          select session.id from session
          where session.number = ${number}
            and ${rowWritable(sql, "session", campaign, actor)}
          for share
        `,
      });
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: ActRow,
        execute: (columns) => sql`insert into campaign_act ${sql.insert(columns)} returning *`,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, id: CampaignActId, columns: Columns }),
        ),
        Result: ActRow,
        execute: ({ campaign, actor, id, columns }) => sql`
          update campaign_act set ${setClause(sql, columns)}
          where campaign_act.id = ${id}
            and ${rowWritable(sql, "campaign_act", campaign, actor)}
          returning *
        `,
      });
      const erase = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, id: CampaignActId })),
        Result: fromColumns(Schema.Struct({ id: CampaignActId })),
        execute: ({ campaign, actor, id }) => sql`
          delete from campaign_act
          where campaign_act.id = ${id}
            and ${rowWritable(sql, "campaign_act", campaign, actor)}
          returning campaign_act.id
        `,
      });

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // A campaign this actor cannot read is `NotFound`, not an empty
              // list, like `sessions.list`.
              yield* ensureCampaignReadable(sql, campaignId, actor);
              return yield* readable(campaignId);
            }),
          ),

        create: (creator, payload, from) =>
          dieOnSqlError(
            asConflict(
              sql.withTransaction(
                Effect.gen(function* () {
                  yield* startingNight({
                    ...asked(creator),
                    number: payload.firstSessionNumber,
                  }).pipe(orNotFound("session", String(payload.firstSessionNumber)));
                  // An insert answers with its row; not getting one is a defect.
                  return yield* insert(
                    defined({
                      campaign_id: creator.campaign,
                      title: payload.title.trim(),
                      first_session_number: payload.firstSessionNumber,
                      visibility: payload.visibility,
                      ...assistantColumns(from),
                    }),
                  ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                }),
              ),
            ),
          ),

        update: (creator, id, patch) =>
          dieOnSqlError(
            change({
              ...asked(creator),
              id,
              columns: defined({ title: patch.title?.trim(), visibility: patch.visibility }),
            }).pipe(orNotFound("campaign_act", id)),
          ),

        remove: (creator, id) =>
          dieOnSqlError(
            Effect.asVoid(erase({ ...asked(creator), id }).pipe(orNotFound("campaign_act", id))),
          ),
      };
    }),
  );
}
