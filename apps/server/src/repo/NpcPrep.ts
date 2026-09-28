import {
  NotFound,
  type NpcAttitude,
  type NpcId,
  type NpcListFilter,
  NpcPrep,
  type NpcPrepUpdate,
  type NpcStatus,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { defined, dieOnSqlError, proseColumn, setClause } from "./rows.js";
import { rowWritable } from "./visibility.js";

/**
 * Reads and writes over `npc_prep`, each NPC's attitude, status, whereabouts
 * and first meeting (`0073_npc_prep.ts`), and the nights it was at the table
 * — **the creator's alone**, so every method takes a `CampaignCreatorActor`
 * and still composes the NPC's creator predicate beneath it. There is no
 * player read here, and no player path anywhere reads this table.
 *
 * It is not `Npcs`, on purpose, for `SeatPrep.ts`'s reason: `Npcs` answers a
 * player too (`playerList`, `playerFindById`), and an NPC read that could reach
 * these columns is the leak `CreatorActor.ts`'s standing rule exists to make
 * impossible.
 *
 * Every read walks the NPC, which is the prep's only containment answer: the
 * NPC must be in the proof's campaign, so another campaign's NPC named in this
 * path, and a Library original, are the same `NotFound`.
 *
 * Hob reads it through the creator's `getNpc` and nothing else: no toolkit has
 * a tool that writes it, the NPC agent's prompt never reads it, and search does
 * not index it.
 */

interface NpcPrepRow {
  readonly npc_id: NpcId;
  readonly attitude: NpcAttitude | null;
  readonly status: NpcStatus | null;
  readonly whereabouts: string | null;
  readonly met_session_id: SessionId | null;
  readonly table_nights: ReadonlyArray<SessionId>;
}

const toNpcPrep = (row: NpcPrepRow): NpcPrep =>
  new NpcPrep({
    npcId: row.npc_id,
    attitude: row.attitude,
    status: row.status,
    whereabouts: row.whereabouts,
    metSessionId: row.met_session_id,
    tableNights: row.table_nights,
  });

export class NpcPreps extends Context.Service<
  NpcPreps,
  {
    /**
     * Every NPC's prep on the shelf the filter names — live by default, as
     * `Npcs.list` answers — in that list's order. An NPC nothing was written
     * for answers nulls and the nights it was at the table.
     */
    readonly list: (
      creator: CampaignCreatorActor,
      filter: NpcListFilter,
    ) => Effect.Effect<ReadonlyArray<NpcPrep>>;
    /** One NPC's prep, live or archived. `NotFound` for an NPC not in this campaign. */
    readonly find: (creator: CampaignCreatorActor, id: NpcId) => Effect.Effect<NpcPrep, NotFound>;
    /**
     * The creator's PATCH: an absent field is untouched, `null` (or a blank
     * whereabouts) clears it. `NotFound` for an NPC not in this campaign, and
     * for a first-met night that is not one of this campaign's.
     */
    readonly update: (
      creator: CampaignCreatorActor,
      id: NpcId,
      patch: NpcPrepUpdate,
    ) => Effect.Effect<NpcPrep, NotFound>;
  }
>()("NpcPreps") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      /**
       * The creator's campaign NPCs, each with its prep when it has one and the
       * nights it was opened at the table: its `session_shared` threads, by the
       * night's number. The session is walked in the NPC's campaign as well as
       * through the thread's key, so a night can only ever be one of this
       * table's.
       */
      const npcsWithPrep = (creator: CampaignCreatorActor) => sql`
        select npc.id as npc_id,
               npc_prep.attitude, npc_prep.status, npc_prep.whereabouts, npc_prep.met_session_id,
               coalesce(
                 (select jsonb_agg(session.id order by session.number asc, session.id asc)
                  from npc_thread
                  join session
                    on session.id = npc_thread.session_id
                   and session.campaign_id = npc.campaign_id
                  where npc_thread.npc_id = npc.id
                    and npc_thread.channel = 'session_shared'),
                 '[]'::jsonb
               ) as table_nights
        from npc
        left join npc_prep on npc_prep.npc_id = npc.id
        where ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
      `;

      const one = (creator: CampaignCreatorActor, id: NpcId) =>
        Effect.gen(function* () {
          const rows = yield* sql<NpcPrepRow>`${npcsWithPrep(creator)} and npc.id = ${id}`;
          if (rows.length === 0) return yield* new NotFound({ resource: "npc", id });
          return toNpcPrep(rows[0]!);
        });

      return {
        list: (creator, filter) =>
          dieOnSqlError(
            Effect.map(
              sql<NpcPrepRow>`
                ${npcsWithPrep(creator)}
                  and ${filter.archived === true ? sql`npc.archived_at is not null` : sql`npc.archived_at is null`}
                order by lower(npc.name) asc, npc.id asc
              `,
              (rows) => rows.map(toNpcPrep),
            ),
          ),

        find: (creator, id) => dieOnSqlError(one(creator, id)),

        update: (creator, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                // The NPC is locked for the insert below, as a seat is for its
                // prep, so a delete racing this write lands before or after it.
                const npcs = yield* sql<{ readonly id: NpcId }>`
                  select npc.id from npc
                  where npc.id = ${id}
                    and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
                  for share
                `;
                if (npcs.length === 0) return yield* new NotFound({ resource: "npc", id });

                // The key refuses a night of another campaign; asking first makes
                // that the ordinary `NotFound` rather than a failed statement,
                // and the lock keeps the night there until the write lands.
                const met = patch.metSessionId;
                if (met !== undefined && met !== null) {
                  const nights = yield* sql<{ readonly id: SessionId }>`
                    select session.id from session
                    where session.id = ${met} and session.campaign_id = ${creator.campaign}
                    for share
                  `;
                  if (nights.length === 0) {
                    return yield* new NotFound({ resource: "session", id: met });
                  }
                }

                const columns = defined({
                  attitude: patch.attitude,
                  status: patch.status,
                  whereabouts: proseColumn(patch.whereabouts),
                  met_session_id: met,
                });
                yield* sql`
                  insert into npc_prep
                    ${sql.insert({ npc_id: id, campaign_id: creator.campaign, ...columns })}
                  on conflict (npc_id) do update set ${setClause(sql, columns)}
                `;

                return yield* one(creator, id);
              }),
            ),
          ),
      };
    }),
  );
}
