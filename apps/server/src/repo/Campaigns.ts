import {
  type Actor,
  Campaign,
  type CampaignCreate,
  type CampaignId,
  type CampaignUpdate,
  Conflict,
  CurrentActor,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { addOwner } from "./Memberships.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import { campaignReadable, campaignWritable, rowWritable } from "./visibility.js";

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
    ) => Effect.Effect<Campaign, NotFound | Conflict, CurrentActor>;
    readonly archive: (id: CampaignId) => Effect.Effect<Campaign, NotFound, CurrentActor>;
  }
>()("Campaigns") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      /**
       * Whether a session may become this campaign's current one.
       *
       * Two refusals, and they are deliberately different errors. A session
       * this credential cannot write — someone else's, or another campaign's,
       * since the id in a payload is a client claim exactly as one in a path is
       * — is `NotFound`, because saying "it exists but is not yours" is itself
       * a disclosure. A session of this campaign that is **finished** is a
       * `Conflict`: the caller can see it perfectly well, and the honest answer
       * is that the night is over. That is the invariant §1.4 asks for, read
       * from the other end — `Sessions.update` clears the pointer when a
       * session ends, and this refuses to point it back.
       *
       * Neither is the last word. `campaign_current_session_id_fkey`
       * (`0006_session_finished.ts`) refuses the same pair structurally, which
       * is what closes the window between this check and the write: a session
       * ending concurrently makes the foreign key's own row lock the arbiter,
       * not this `select`.
       */
      const ensureEligible = (
        id: CampaignId,
        sessionId: SessionId | null | undefined,
        actor: Actor,
      ) =>
        Effect.gen(function* () {
          if (sessionId === null || sessionId === undefined) return;
          const rows = yield* sql<{ readonly ended_at: Date | null }>`
            select session.ended_at from session
            where session.id = ${sessionId} and ${rowWritable(sql, "session", id, actor)}
          `;
          if (rows.length === 0) {
            return yield* new NotFound({ resource: "session", id: sessionId });
          }
          if (rows[0]!.ended_at !== null) {
            return yield* new Conflict({
              message: "that session is finished, so it cannot be the current session",
            });
          }
        });

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
                where campaign.id = ${id} and ${campaignReadable(sql, actor, id)}
              `;
              return yield* one(rows, id);
            }),
          ),

        /**
         * `account_id` and the owner's membership are two answers to two
         * different questions and both are written here.
         *
         * `campaign.account_id` is whose account this is — the cascade parent,
         * and the only place in `src` outside `repo/visibility.ts` that names
         * it. The `campaign_member` row is who *reaches* it, which since
         * `0011_membership.ts` is a different thing entirely: no predicate
         * consults the column any more.
         *
         * One transaction, because it has to be. `campaign_owner_is_dm_member`
         * is deferred to COMMIT exactly so these can be two statements, and a
         * campaign inserted without its owner's row is refused at the end of
         * its own transaction rather than left as a campaign nobody can write
         * to.
         */
        create: (payload) =>
          dieOnSqlError(
            sql.withTransaction(
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
                yield* addOwner(sql, rows[0]!.id, actor.accountId);
                return toCampaign(rows[0]!);
              }),
            ),
          ),

        update: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureEligible(id, patch.currentSessionId, actor);
              const columns = defined({
                name: patch.name,
                party_name: patch.partyName,
                player_count: patch.playerCount,
                current_session_id: patch.currentSessionId,
                visibility: patch.visibility,
              });
              const rows = yield* sql<CampaignRow>`
                update campaign set ${setClause(sql, columns)}
                where campaign.id = ${id} and ${campaignWritable(sql, actor, id)}
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
                where campaign.id = ${id} and ${campaignWritable(sql, actor, id)}
                returning *
              `;
              return yield* one(rows, id);
            }),
          ),
      };
    }),
  );
}
