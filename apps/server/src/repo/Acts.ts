import {
  CampaignAct,
  type CampaignActCreate,
  type CampaignActId,
  type CampaignActUpdate,
  type CampaignId,
  Conflict,
  CurrentActor,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import {
  type AssistantOrigin,
  assistantColumns,
  defined,
  dieOnSqlError,
  type ProvenanceColumns,
  provenanceOf,
  setClause,
} from "./rows.js";
import { ensureCampaignReadable, rowReadable, rowWritable } from "./visibility.js";

interface ActRow extends ProvenanceColumns {
  readonly id: CampaignActId;
  readonly campaign_id: CampaignId;
  readonly title: string;
  readonly first_session_number: number;
}

const toAct = (row: ActRow): CampaignAct =>
  new CampaignAct({
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    firstSessionNumber: row.first_session_number,
    ...provenanceOf(row),
  });

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

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // A campaign this actor cannot read is `NotFound`, not an empty
              // list, like `sessions.list`.
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* sql<ActRow>`
                select campaign_act.* from campaign_act
                where ${rowReadable(sql, "campaign_act", campaignId, actor)}
                order by campaign_act.first_session_number asc
              `;
              return rows.map(toAct);
            }),
          ),

        create: (creator, payload, from) =>
          dieOnSqlError(
            asConflict(
              sql.withTransaction(
                Effect.gen(function* () {
                  // The night is locked for the insert below, so a delete
                  // racing this write lands before it (and refuses it) or
                  // after it, which leaves the act at a gap as any delete does.
                  const nights = yield* sql<{ readonly id: string }>`
                    select session.id from session
                    where session.number = ${payload.firstSessionNumber}
                      and ${rowWritable(sql, "session", creator.campaign, creator.actor)}
                    for share
                  `;
                  if (nights.length === 0) {
                    return yield* new NotFound({
                      resource: "session",
                      id: String(payload.firstSessionNumber),
                    });
                  }
                  const rows = yield* sql<ActRow>`
                    insert into campaign_act ${sql.insert(
                      defined({
                        campaign_id: creator.campaign,
                        title: payload.title.trim(),
                        first_session_number: payload.firstSessionNumber,
                        visibility: payload.visibility,
                        ...assistantColumns(from),
                      }),
                    )}
                    returning *
                  `;
                  return toAct(rows[0]!);
                }),
              ),
            ),
          ),

        update: (creator, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const columns = defined({ title: patch.title?.trim(), visibility: patch.visibility });
              const rows = yield* sql<ActRow>`
                update campaign_act set ${setClause(sql, columns)}
                where campaign_act.id = ${id}
                  and ${rowWritable(sql, "campaign_act", creator.campaign, creator.actor)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "campaign_act", id });
              return toAct(rows[0]!);
            }),
          ),

        remove: (creator, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<{ readonly id: CampaignActId }>`
                delete from campaign_act
                where campaign_act.id = ${id}
                  and ${rowWritable(sql, "campaign_act", creator.campaign, creator.actor)}
                returning campaign_act.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "campaign_act", id });
            }),
          ),
      };
    }),
  );
}
