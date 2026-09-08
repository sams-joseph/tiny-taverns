import {
  type CampaignId,
  Conflict,
  type Actor,
  CurrentActor,
  Npc,
  type NpcCreate,
  type NpcId,
  type NpcListFilter,
  type NpcPersona,
  type NpcPrivateMaterial,
  type NpcUpdate,
  NotFound,
  PlayerNpc,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import { ensureCampaignWritable, rowReadable, rowWritable } from "./visibility.js";

/**
 * The campaign's cast — `npc` rows, as the creator reads and writes them.
 *
 * **Every method takes a `CampaignCreatorActor`**, and that is the standing
 * rule applied on the day rather than after a disclosure: an NPC row carries
 * creator-only private material, so the creator read is gated and the player
 * read below is a distinct projection. The proof is
 * a precondition on top of the seam, not a replacement for it — every read
 * here still composes `rowWritable`, the creator-only predicate, so a bug in
 * the gate degrades to the same refusal rather than to an open door. There is
 * deliberately no `rowReadable` in the creator methods: the player projection
 * is `PlayerNpc`, a distinct schema on distinct paths.
 *
 * `version` is `character`'s optimistic-concurrency counter and works the same
 * way: every UPDATE bumps it in the same statement it writes, and a caller who
 * sends `expectedVersion` is refused with a `Conflict` when the row moved on.
 * `archive`/`restore` move one column, so a restore is exact.
 */

interface NpcRow extends ProvenanceColumns {
  readonly id: NpcId;
  readonly campaign_id: CampaignId;
  readonly derived_from: NpcId | null;
  readonly name: string;
  readonly role: string;
  /** `jsonb`; the pg driver parses it, so this arrives as the document itself. */
  readonly persona: NpcPersona;
  readonly private_material: NpcPrivateMaterial;
  readonly version: number;
  readonly archived_at: Date | null;
}

export const toNpc = (row: NpcRow): Npc =>
  new Npc({
    id: row.id,
    campaignId: row.campaign_id,
    derivedFrom: row.derived_from,
    name: row.name,
    role: row.role,
    persona: row.persona,
    privateMaterial: row.private_material,
    version: row.version,
    archivedAt: row.archived_at === null ? null : DateTime.fromDateUnsafe(row.archived_at),
    ...provenanceOf(row),
  });

interface PlayerNpcRow {
  readonly id: NpcId;
  readonly campaign_id: CampaignId;
  readonly name: string;
  readonly role: string;
  readonly persona: NpcPersona;
}

const toPlayerNpc = (row: PlayerNpcRow): PlayerNpc =>
  new PlayerNpc({
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    role: row.role,
    persona: row.persona,
  });

export const playerNpcReadable = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([rowReadable(sql, "npc", campaignId, actor), sql`npc.archived_at is null`]);

const staleVersion = (expected: number, actual: number): Conflict =>
  new Conflict({
    message: `the NPC moved on while you were editing (version ${String(actual)}, you read ${String(expected)}). Reload it and make the change again.`,
  });

export class Npcs extends Context.Service<
  Npcs,
  {
    /** Live rows by default, by name; `archived: true` is the other shelf. */
    readonly list: (
      creator: CampaignCreatorActor,
      filter: NpcListFilter,
    ) => Effect.Effect<ReadonlyArray<Npc>, NotFound, never>;
    readonly findById: (
      creator: CampaignCreatorActor,
      id: NpcId,
    ) => Effect.Effect<Npc, NotFound, never>;
    readonly create: (
      creator: CampaignCreatorActor,
      payload: NpcCreate,
    ) => Effect.Effect<Npc, NotFound, never>;
    readonly update: (
      creator: CampaignCreatorActor,
      id: NpcId,
      patch: NpcUpdate,
    ) => Effect.Effect<Npc, NotFound | Conflict, never>;
    readonly archive: (
      creator: CampaignCreatorActor,
      id: NpcId,
    ) => Effect.Effect<Npc, NotFound, never>;
    readonly restore: (
      creator: CampaignCreatorActor,
      id: NpcId,
    ) => Effect.Effect<Npc, NotFound, never>;
    /** Player-safe discovery: public profile only, shared live NPCs only. */
    readonly playerList: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<PlayerNpc>, NotFound, CurrentActor>;
    readonly playerFindById: (
      campaignId: CampaignId,
      id: NpcId,
    ) => Effect.Effect<PlayerNpc, NotFound, CurrentActor>;
  }
>()("Npcs") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const one = (creator: CampaignCreatorActor, id: NpcId) =>
        Effect.gen(function* () {
          const rows = yield* sql<NpcRow>`
            select * from npc
            where npc.id = ${id} and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "npc", id });
          return toNpc(rows[0]!);
        });

      return {
        list: (creator, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<NpcRow>`
                select * from npc
                where ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
                  and ${filter.archived === true ? sql`npc.archived_at is not null` : sql`npc.archived_at is null`}
                order by lower(npc.name) asc, npc.id asc
              `;
              return rows.map(toNpc);
            }),
          ),

        findById: (creator, id) => dieOnSqlError(one(creator, id)),

        create: (creator, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* ensureCampaignWritable(sql, creator.campaign, creator.actor);
                const rows = yield* sql<NpcRow>`
                  insert into npc ${sql.insert(
                    defined({
                      campaign_id: creator.campaign,
                      name: payload.name,
                      role: payload.role,
                      persona:
                        payload.persona === undefined ? undefined : JSON.stringify(payload.persona),
                      private_material:
                        payload.privateMaterial === undefined
                          ? undefined
                          : JSON.stringify(payload.privateMaterial),
                      visibility: payload.visibility,
                    }),
                  )}
                  returning *
                `;
                return toNpc(rows[0]!);
              }),
            ),
          ),

        update: (creator, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                // Read first, under the same creator-only predicate, so a stale
                // version is a `Conflict` the creator can read rather than an
                // update that quietly matched no row.
                const before = yield* one(creator, id);
                if (
                  patch.expectedVersion !== undefined &&
                  patch.expectedVersion !== before.version
                ) {
                  return yield* staleVersion(patch.expectedVersion, before.version);
                }
                const columns = defined({
                  name: patch.name,
                  role: patch.role,
                  persona: patch.persona === undefined ? undefined : JSON.stringify(patch.persona),
                  private_material:
                    patch.privateMaterial === undefined
                      ? undefined
                      : JSON.stringify(patch.privateMaterial),
                  visibility: patch.visibility,
                });
                // `version = version + 1` rides in the same statement as the
                // change, and the `where` re-checks the version the caller read
                // so two writers racing past the read above still cannot both
                // win.
                const rows = yield* sql<NpcRow>`
                  update npc set ${setClause(sql, columns)}, version = npc.version + 1
                  where npc.id = ${id}
                    and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
                    and npc.version = ${before.version}
                  returning *
                `;
                if (rows.length === 0) {
                  const now = yield* one(creator, id);
                  return yield* staleVersion(before.version, now.version);
                }
                return toNpc(rows[0]!);
              }),
            ),
          ),

        archive: (creator, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<NpcRow>`
                update npc set archived_at = coalesce(npc.archived_at, now()), updated_at = now()
                where npc.id = ${id} and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc", id });
              return toNpc(rows[0]!);
            }),
          ),

        restore: (creator, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<NpcRow>`
                update npc set archived_at = null, updated_at = now()
                where npc.id = ${id} and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc", id });
              return toNpc(rows[0]!);
            }),
          ),

        playerList: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<PlayerNpcRow>`
                select npc.id, npc.campaign_id, npc.name, npc.role, npc.persona
                from npc
                where ${playerNpcReadable(sql, campaignId, actor)}
                order by lower(npc.name) asc, npc.id asc
              `;
              return rows.map(toPlayerNpc);
            }),
          ),

        playerFindById: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<PlayerNpcRow>`
                select npc.id, npc.campaign_id, npc.name, npc.role, npc.persona
                from npc
                where npc.id = ${id} and ${playerNpcReadable(sql, campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc", id });
              return toPlayerNpc(rows[0]!);
            }),
          ),
      };
    }),
  );
}
