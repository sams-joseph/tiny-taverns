import {
  type AccountId,
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
  NpcSource,
  type NpcUpdate,
  NotFound,
  PlayerNpc,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import {
  ensureCampaignWritable,
  libraryRowReadable,
  libraryRowWritable,
  rowReadable,
  rowWritable,
  usableInCampaign,
} from "./visibility.js";

/**
 * The campaign's cast and the reusable NPC Library source shelf.
 *
 * Campaign methods still take a `CampaignCreatorActor`, because a campaign NPC
 * carries creator-only private material. Slice 4 adds the account-owned source
 * half: Library sources are originals in no campaign, group shares grant only
 * future copying, and copying into a campaign produces an independent snapshot.
 */

interface NpcRow extends ProvenanceColumns {
  readonly id: NpcId;
  readonly campaign_id: CampaignId;
  readonly account_id: AccountId | null;
  readonly derived_from: NpcId | null;
  readonly derived_from_version: number | null;
  readonly derived_from_name: string | null;
  readonly name: string;
  readonly role: string;
  /** `jsonb`; the pg driver parses it, so this arrives as the document itself. */
  readonly persona: NpcPersona;
  readonly private_material: NpcPrivateMaterial;
  readonly version: number;
  readonly archived_at: Date | null;
}

interface NpcSourceRow extends ProvenanceColumns {
  readonly id: NpcId;
  readonly account_id: AccountId;
  readonly name: string;
  readonly role: string;
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
    derivedFromVersion: row.derived_from_version,
    derivedFromName: row.derived_from_name,
    name: row.name,
    role: row.role,
    persona: row.persona,
    privateMaterial: row.private_material,
    version: row.version,
    archivedAt: row.archived_at === null ? null : DateTime.fromDateUnsafe(row.archived_at),
    ...provenanceOf(row),
  });

export const toNpcSource = (row: NpcSourceRow): NpcSource =>
  new NpcSource({
    id: row.id,
    accountId: row.account_id,
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
    /** Live campaign rows by default, by name; `archived: true` is the other shelf. */
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
    readonly sourcesForCampaign: (
      creator: CampaignCreatorActor,
    ) => Effect.Effect<ReadonlyArray<NpcSource>, NotFound, never>;
    readonly copyFromSource: (
      creator: CampaignCreatorActor,
      sourceId: NpcId,
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
    /** Account-owned source shelf: originals only, never groupmates' shares. */
    readonly library: (
      filter: NpcListFilter,
    ) => Effect.Effect<ReadonlyArray<NpcSource>, never, CurrentActor>;
    readonly libraryFindById: (id: NpcId) => Effect.Effect<NpcSource, NotFound, CurrentActor>;
    readonly libraryCreate: (payload: NpcCreate) => Effect.Effect<NpcSource, never, CurrentActor>;
    readonly libraryUpdate: (
      id: NpcId,
      patch: NpcUpdate,
    ) => Effect.Effect<NpcSource, NotFound | Conflict, CurrentActor>;
    readonly libraryArchive: (id: NpcId) => Effect.Effect<NpcSource, NotFound, CurrentActor>;
    readonly libraryRestore: (id: NpcId) => Effect.Effect<NpcSource, NotFound, CurrentActor>;
    readonly libraryRemove: (id: NpcId) => Effect.Effect<void, NotFound, CurrentActor>;
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

      const sourceOne = (id: NpcId, writable: boolean) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<NpcSourceRow>`
            select * from npc
            where npc.id = ${id}
              and ${
                writable
                  ? libraryRowWritable(sql, "npc", actor)
                  : libraryRowReadable(sql, "npc", actor)
              }
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "npc", id });
          return toNpcSource(rows[0]!);
        });

      const sourcePatchColumns = (patch: NpcUpdate) =>
        defined({
          name: patch.name,
          role: patch.role,
          persona: patch.persona === undefined ? undefined : JSON.stringify(patch.persona),
          private_material:
            patch.privateMaterial === undefined ? undefined : JSON.stringify(patch.privateMaterial),
          visibility: patch.visibility,
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

        sourcesForCampaign: (creator) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureCampaignWritable(sql, creator.campaign, creator.actor);
              const rows = yield* sql<NpcSourceRow>`
                select * from npc
                where npc.archived_at is null
                  and ${usableInCampaign(sql, "npc", creator.campaign, creator.actor)}
                order by lower(npc.name) asc, npc.id asc
              `;
              return rows.map(toNpcSource);
            }),
          ),

        copyFromSource: (creator, sourceId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* ensureCampaignWritable(sql, creator.campaign, creator.actor);
                const inserted = yield* sql<NpcRow>`
                  insert into npc
                    (campaign_id, derived_from, derived_from_version, derived_from_name,
                     name, role, persona, private_material)
                  select ${creator.campaign}, npc.id, npc.version, npc.name,
                         npc.name, npc.role, npc.persona,
                         case when npc.account_id = ${creator.actor.accountId}
                              then npc.private_material else '{}'::jsonb end
                  from npc
                  where npc.id = ${sourceId}
                    and npc.archived_at is null
                    and ${usableInCampaign(sql, "npc", creator.campaign, creator.actor)}
                  returning *
                `;
                if (inserted.length === 0)
                  return yield* new NotFound({ resource: "npc", id: sourceId });
                const copy = inserted[0]!;
                const canCopyPrivate = yield* sql<{ readonly owner: boolean }>`
                  select exists (select 1 from npc where npc.id = ${sourceId} and npc.account_id = ${creator.actor.accountId}) as owner
                `;
                const sourceVisible =
                  canCopyPrivate[0]?.owner === true ? sql`true` : sql`visibility = 'shared'`;
                yield* sql`
                  insert into npc_knowledge_fact
                    (npc_id, body, source_kind, source_id, source_label, visibility)
                  select ${copy.id}, body, source_kind, source_id, source_label, visibility
                  from npc_knowledge_fact
                  where npc_id = ${sourceId}
                    and retired_at is null
                    and ${sourceVisible}
                  order by created_at asc, id asc
                `;
                yield* sql`
                  insert into npc_memory
                    (npc_id, body, status, approved_at, visibility)
                  select ${copy.id}, body, status, approved_at, visibility
                  from npc_memory
                  where npc_id = ${sourceId}
                    and status = 'approved'
                    and retired_at is null
                    and ${sourceVisible}
                  order by approved_at asc, id asc
                `;
                return toNpc(copy);
              }),
            ),
          ),

        update: (creator, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const before = yield* one(creator, id);
                if (
                  patch.expectedVersion !== undefined &&
                  patch.expectedVersion !== before.version
                ) {
                  return yield* staleVersion(patch.expectedVersion, before.version);
                }
                const rows = yield* sql<NpcRow>`
                  update npc set ${setClause(sql, sourcePatchColumns(patch))}, version = npc.version + 1
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

        library: (filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<NpcSourceRow>`
                select * from npc
                where ${libraryRowReadable(sql, "npc", actor)}
                  and ${filter.archived === true ? sql`npc.archived_at is not null` : sql`npc.archived_at is null`}
                order by lower(npc.name) asc, npc.id asc
              `;
              return rows.map(toNpcSource);
            }),
          ),

        libraryFindById: (id) => dieOnSqlError(sourceOne(id, false)),

        libraryCreate: (payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<NpcSourceRow>`
                insert into npc ${sql.insert(
                  defined({
                    account_id: actor.accountId,
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
              return toNpcSource(rows[0]!);
            }),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const before = yield* sourceOne(id, true);
                if (
                  patch.expectedVersion !== undefined &&
                  patch.expectedVersion !== before.version
                ) {
                  return yield* staleVersion(patch.expectedVersion, before.version);
                }
                const actor = yield* CurrentActor;
                const rows = yield* sql<NpcSourceRow>`
                  update npc set ${setClause(sql, sourcePatchColumns(patch))}, version = npc.version + 1
                  where npc.id = ${id}
                    and ${libraryRowWritable(sql, "npc", actor)}
                    and npc.version = ${before.version}
                  returning *
                `;
                if (rows.length === 0) {
                  const now = yield* sourceOne(id, true);
                  return yield* staleVersion(before.version, now.version);
                }
                return toNpcSource(rows[0]!);
              }),
            ),
          ),

        libraryArchive: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<NpcSourceRow>`
                update npc set archived_at = coalesce(npc.archived_at, now()), updated_at = now()
                where npc.id = ${id} and ${libraryRowWritable(sql, "npc", actor)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc", id });
              return toNpcSource(rows[0]!);
            }),
          ),

        libraryRestore: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<NpcSourceRow>`
                update npc set archived_at = null, updated_at = now()
                where npc.id = ${id} and ${libraryRowWritable(sql, "npc", actor)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc", id });
              return toNpcSource(rows[0]!);
            }),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: NpcId }>`
                delete from npc
                where npc.id = ${id} and ${libraryRowWritable(sql, "npc", actor)}
                returning npc.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc", id });
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
