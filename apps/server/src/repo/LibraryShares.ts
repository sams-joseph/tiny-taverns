import {
  type Actor,
  CurrentActor,
  GroupLibraryShare,
  type GroupId,
  type LibraryShareCreate,
  type LibraryShareKind,
  NotFound,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import { dieOnSqlError } from "./rows.js";
import { ensureGroupReadable } from "./visibility.js";

/**
 * The group's shared Library shelf — the explicit share/copy layer of the
 * captain's decision of 2026-09-01, as a repository.
 *
 * A share is a **grant to copy** and nothing else. This file writes no
 * content table, reads no original beyond its name, and widens no Library
 * predicate: the grant's whole effect is `groupSharedIntoCampaign`, the third
 * disjunct of `copyableIntoCampaign` in `repo/visibility.ts`, which is what
 * lets a creator in the group `derive` the shared original into their
 * campaign as the ordinary snapshot. Group membership alone never widens
 * Library visibility — a member's own Library still answers their originals
 * and the bundle, and `group-library.test.ts` pins that from both sides.
 *
 * ### Sharing is the owner's act, structurally
 *
 * `share` inserts only when the named resource is a Library original of the
 * **caller's own** (`campaign_id is null and account_id = me`, checked in the
 * insert's own `select`), so sharing somebody else's — or a campaign copy —
 * is the ordinary `NotFound` about the resource, and there is no payload
 * field that could name another owner. `unshare` is the same comparison on
 * the way out. The legal kinds are the copyable corpora; the check constraint
 * holds the list and the type restates it.
 */

interface ShareRow {
  readonly group_id: GroupId;
  readonly owner_account_id: string;
  readonly resource_kind: LibraryShareKind;
  readonly resource_id: string;
  readonly name: string | null;
  readonly shared_by_name: string;
  readonly created_at: Date;
}

const toShare = (row: ShareRow): GroupLibraryShare =>
  new GroupLibraryShare({
    groupId: row.group_id,
    ownerAccountId: row.owner_account_id as GroupLibraryShare["ownerAccountId"],
    kind: row.resource_kind,
    resourceId: row.resource_id,
    name: row.name,
    sharedByName: row.shared_by_name,
    createdAt: DateTime.fromDateUnsafe(row.created_at),
  });

/**
 * The share list's name join: one arm per corpus, resolved to the original's
 * display name **only while it is still the recorded owner's Library
 * original** — the same three clauses the reach predicate requires, so a name
 * in this list and a copyable row are the same fact.
 */
const KINDS: ReadonlyArray<LibraryShareKind> = [
  "creature",
  "character_option",
  "spell",
  "equipment",
  "magic_item",
  "rule_article",
  "feat",
  "npc",
];

const nameColumn = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`case ${KINDS.reduce<Statement.Fragment | undefined>((acc, kind) => {
    const arm = sql`when group_library_share.resource_kind = ${kind} then
          (select ${sql(`${kind}.name`)} from ${sql(kind)}
           where ${sql(`${kind}.id`)} = group_library_share.resource_id
             and ${sql(`${kind}.campaign_id`)} is null
             and ${sql(`${kind}.account_id`)} = group_library_share.owner_account_id)`;
    return acc === undefined ? arm : sql`${acc} ${arm}`;
  }, undefined)!} end`;

/** The live half of an ownership check, spelled once for both writes. */
const ownOriginal = (
  sql: SqlClient.SqlClient,
  kind: LibraryShareKind,
  resourceId: string,
  actor: Actor,
): Statement.Fragment =>
  sql`exists (select 1 from ${sql(kind)}
              where ${sql(`${kind}.id`)} = ${resourceId}
                and ${sql(`${kind}.campaign_id`)} is null
                and ${sql(`${kind}.account_id`)} = ${actor.accountId})`;

export class LibraryShares extends Context.Service<
  LibraryShares,
  {
    /** Every grant in the group, newest first, with resolved names. */
    readonly list: (
      groupId: GroupId,
    ) => Effect.Effect<ReadonlyArray<GroupLibraryShare>, NotFound, CurrentActor>;
    /** The owner grants their own original. Granting twice is the same success. */
    readonly share: (
      groupId: GroupId,
      payload: LibraryShareCreate,
    ) => Effect.Effect<GroupLibraryShare, NotFound, CurrentActor>;
    /** The owner withdraws the grant. Copies already made are snapshots and stand. */
    readonly unshare: (
      groupId: GroupId,
      payload: LibraryShareCreate,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("LibraryShares") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const readShare = (groupId: GroupId, payload: LibraryShareCreate) =>
        sql<ShareRow>`
          select group_library_share.*,
                 account.name as shared_by_name,
                 ${nameColumn(sql)} as name
          from group_library_share
          join account on account.id = group_library_share.shared_by_account_id
          where group_library_share.group_id = ${groupId}
            and group_library_share.resource_kind = ${payload.kind}
            and group_library_share.resource_id = ${payload.resourceId}
        `;

      return {
        list: (groupId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              const rows = yield* sql<ShareRow>`
                select group_library_share.*,
                       account.name as shared_by_name,
                       ${nameColumn(sql)} as name
                from group_library_share
                join account on account.id = group_library_share.shared_by_account_id
                where group_library_share.group_id = ${groupId}
                order by group_library_share.created_at desc
              `;
              return rows.map(toShare);
            }),
          ),

        share: (groupId, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              // Insert-if-owner, one statement: the ownership test is in the
              // `select`, so a resource that is not the caller's own Library
              // original inserts nothing and answers the ordinary NotFound —
              // which deliberately does not say whether it exists at all.
              yield* sql`
                insert into group_library_share
                  (group_id, owner_account_id, resource_kind, resource_id, shared_by_account_id)
                select ${groupId}, ${actor.accountId}, ${payload.kind}, ${payload.resourceId},
                       ${actor.accountId}
                where ${ownOriginal(sql, payload.kind, payload.resourceId, actor)}
                on conflict (group_id, resource_kind, resource_id) do nothing
              `;
              const rows = yield* readShare(groupId, payload);
              if (rows.length === 0 || rows[0]!.owner_account_id !== actor.accountId) {
                return yield* new NotFound({
                  resource: payload.kind,
                  id: payload.resourceId,
                });
              }
              return toShare(rows[0]!);
            }),
          ),

        unshare: (groupId, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              const rows = yield* sql<{ readonly resource_id: string }>`
                delete from group_library_share
                where group_library_share.group_id = ${groupId}
                  and group_library_share.resource_kind = ${payload.kind}
                  and group_library_share.resource_id = ${payload.resourceId}
                  and group_library_share.owner_account_id = ${actor.accountId}
                returning group_library_share.resource_id
              `;
              if (rows.length === 0) {
                return yield* new NotFound({
                  resource: payload.kind,
                  id: payload.resourceId,
                });
              }
            }),
          ),
      };
    }),
  );
}
