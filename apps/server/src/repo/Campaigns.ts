import {
  type AccountId,
  type Actor,
  Campaign,
  type CampaignCreate,
  type CampaignId,
  type CampaignUpdate,
  Conflict,
  CurrentActor,
  type GroupId,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { addCreator } from "./Memberships.js";
import { foundGroup } from "./Groups.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import {
  campaignReadable,
  campaignWritable,
  ensureGroupReadable,
  rowWritable,
} from "./visibility.js";

/**
 * Exported for `repo/Memberships.ts`, which selects `campaign.*` beside the
 * actor's own membership row — the same rule `Recap.ts` follows, and the reason
 * it is a rule: **one mapper per table**, imported where a second read needs it
 * rather than restated. A second `toCampaign` is a second answer to what a
 * campaign is on the wire.
 */
export interface CampaignRow extends ProvenanceColumns {
  readonly id: CampaignId;
  readonly group_id: GroupId;
  readonly creator_account_id: AccountId;
  readonly name: string;
  readonly party_name: string | null;
  readonly player_count: number;
  readonly current_session_id: SessionId | null;
  readonly archived_at: Date | null;
}

export const toCampaign = (row: CampaignRow): Campaign =>
  new Campaign({
    id: row.id,
    groupId: row.group_id,
    creatorAccountId: row.creator_account_id,
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
    readonly create: (
      groupId: GroupId,
      payload: CampaignCreate,
    ) => Effect.Effect<Campaign, NotFound, CurrentActor>;
    /** Campaign-first creation; its private group is transitional plumbing. */
    readonly createStandalone: (
      payload: CampaignCreate,
    ) => Effect.Effect<Campaign, never, CurrentActor>;
    readonly update: (
      id: CampaignId,
      patch: CampaignUpdate,
    ) => Effect.Effect<Campaign, NotFound | Conflict, CurrentActor>;
    readonly archive: (id: CampaignId) => Effect.Effect<Campaign, NotFound, CurrentActor>;
    readonly restore: (id: CampaignId) => Effect.Effect<Campaign, NotFound, CurrentActor>;
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

      const insert = (groupId: GroupId, payload: CampaignCreate, actor: Actor) =>
        Effect.gen(function* () {
          const rows = yield* sql<CampaignRow>`
            insert into campaign ${sql.insert(
              defined({
                group_id: groupId,
                creator_account_id: actor.accountId,
                name: payload.name,
                party_name: payload.partyName,
                player_count: payload.playerCount,
                visibility: payload.visibility,
              }),
            )}
            returning *
          `;
          yield* addCreator(sql, rows[0]!.id, groupId, actor.accountId);
          return toCampaign(rows[0]!);
        });

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
         * Any live member of the group may create a campaign in it — the
         * governance decision — and becomes its creator and sole DM.
         *
         * Three facts written in one transaction, each pinned by a deferred
         * key: the campaign names its group and creator
         * (`campaign_creator_in_group` proves the creator is a live group
         * member), and the creator's own participation row goes in beside it
         * (`campaign_creator_is_campaign_member` refuses a campaign without
         * one). `ensureGroupReadable` fronts the typed refusal — a group this
         * credential does not reach is a 404 naming the group, not a defect
         * at COMMIT.
         */
        create: (groupId, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureGroupReadable(sql, groupId, actor);
                return yield* insert(groupId, payload, actor);
              }),
            ),
          ),

        /**
         * The campaign-first path. The private group is deliberately named
         * after the campaign: it is hidden by the new surface, and old group
         * routes remain an honest fallback while Shared Worlds are built.
         */
        createStandalone: (payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const group = yield* foundGroup(sql, payload.name, actor.accountId);
                return yield* insert(group.id, payload, actor);
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

        /**
         * Off the list, and nothing else.
         *
         * **One column moves, and that is the whole design.** Nothing here
         * clears `current_session_id`, ends a live fight, unshares the campaign
         * or touches a row hanging off it — so a night in progress is still in
         * progress and `restore` below can put the campaign back *exactly* where
         * it was rather than approximately. The alternative, finishing the night
         * on the way out, is the one thing that could not be undone:
         * `campaign_current_session_id_fkey` (`0006_session_finished.ts`) makes
         * a finished session unpointable, so an archive that ended the night
         * would be a reversible act with an irreversible side effect. The
         * confirmation names the open night instead — see
         * `apps/web/src/campaign/ArchiveDialog.tsx`.
         *
         * No predicate in `repo/visibility.ts` consults `archived_at`, so an
         * archived campaign stays readable and writable at its own URL. That is
         * a soft delete working rather than a gap: the two lists that answer
         * *"what am I running"* — `list` above and `Memberships.mine` — are what
         * the column narrows, and pushing it into the seam instead would put a
         * second question into every predicate in the product for a shelf.
         *
         * Idempotent in the harmless direction: archiving an archived campaign
         * re-stamps `archived_at`, which is the same shelf a moment later.
         */
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

        /**
         * Back on the list — `archive` read backwards, deliberately down to the
         * shape of the statement.
         *
         * Same predicate, same `one`, same `NotFound`: a campaign somebody else
         * runs matches no row here for exactly the reason it matches none there,
         * so the refusal is not a second rule that could come to disagree with
         * the first. `campaignWritable` does not test `archived_at`, which is
         * what makes an archived campaign reachable by the one act that is about
         * being archived.
         *
         * Restoring one that is not archived is a no-op success. There is
         * nothing for a DM to reconcile — the campaign is on the list, which is
         * what they asked for — and a `Conflict` here would be an error for
         * pressing a button twice.
         */
        restore: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<CampaignRow>`
                update campaign set archived_at = null, updated_at = now()
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
