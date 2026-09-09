import {
  type AccountId,
  type CampaignId,
  type CampaignInviteCreate,
  Conflict,
  CurrentActor,
  type GroupId,
  GroupInvite,
  type GroupInviteId,
  type InviteCreate,
  InvitePreview,
  InviteRedeemed,
  type InviteStatus,
  IssuedInvite,
  NotFound,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomBytes } from "node:crypto";
import { hashToken } from "../Accounts.js";
import { admitToGroup, removeFromGroup } from "./Groups.js";
import { admitTo, revokeMemberAt } from "./Memberships.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { dieOnSqlError } from "./rows.js";
import { campaignWritableById, ensureGroupWritable } from "./visibility.js";

/**
 * Invitations: group-owner links for a world and campaign-creator links for a
 * table, sharing one single-use token lifecycle.
 *
 * **A link is an invitation to join, not a way in.** Redeeming grants an
 * ordinary `group_member` row (and, when the invitation names a campaign, an
 * ordinary `campaign_member` row) to the account that is signed in, and from
 * that moment the member is indistinguishable from one admitted any other way
 * — no new predicate, no new base case, no change to `Authorization`.
 * `packages/api/src/Invite.ts` states the four lifetime rules;
 * `migrations/0013_group_invites.ts` states what the table deliberately does
 * not have.
 *
 * ### Three things about this file that are not obvious from reading it
 *
 * **It writes no `group_member` or `campaign_member` SQL.** `repo/Groups.ts`
 * and `repo/Memberships.ts` own those tables; the grants this file exists to
 * make go through `admitToGroup` and `admitTo`, and the revocation through
 * `removeFromGroup` — all inside this file's transactions.
 *
 * **Authority follows the surface.** Group operations use `groupWritable`;
 * campaign operations require a `CampaignCreatorActor`. A creator therefore
 * never needs ownership of the hidden group to invite their players.
 *
 * **`preview` and `redeem` read names outside the visibility seam, and the
 * token is what scopes them.** They have to: the whole point of an invitation
 * page is that it works before the reader has an account. Both read scalar
 * columns of *the group (and campaign) the invitation names*, never one a
 * caller named, having first proved the caller holds a live token. That is a
 * bounded disclosure to the holder of a capability — the same trade the
 * invitation itself is — and it is confined to this file.
 */

/**
 * How long an invitation lives. Server-set and not client-supplied, so an
 * eternal invitation is not expressible.
 */
export const INVITE_TTL_DAYS = 14;

const TOKEN_BYTES = 32;

interface InviteRow {
  readonly id: GroupInviteId;
  readonly group_id: GroupId;
  readonly campaign_id: CampaignId | null;
  readonly label: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
  readonly redeemed_by: AccountId | null;
  readonly redeemed_at: Date | null;
  /** Computed by the database, so one clock decides. */
  readonly expired: boolean;
  readonly granted_campaign_membership: boolean;
}

interface ListedInviteRow extends InviteRow {
  readonly redeemed_by_name: string | null;
}

/**
 * Where an invitation is in its life. Precedence is `revoked` → `redeemed` →
 * `expired` → `live`: a withdrawal is an act somebody took, and it is what the
 * owner must see on a line they revoked *after* it was accepted.
 */
const statusOf = (row: InviteRow): InviteStatus =>
  row.revoked_at !== null
    ? "revoked"
    : row.redeemed_at !== null
      ? "redeemed"
      : row.expired
        ? "expired"
        : "live";

const toInvite = (row: ListedInviteRow): GroupInvite =>
  new GroupInvite({
    id: row.id,
    groupId: row.group_id,
    campaignId: row.campaign_id,
    label: row.label,
    status: statusOf(row),
    expiresAt: DateTime.fromDateUnsafe(row.expires_at),
    revokedAt: row.revoked_at === null ? null : DateTime.fromDateUnsafe(row.revoked_at),
    redeemedAt: row.redeemed_at === null ? null : DateTime.fromDateUnsafe(row.redeemed_at),
    redeemedByName: row.redeemed_by_name,
    createdAt: DateTime.fromDateUnsafe(row.created_at),
  });

/**
 * The columns every read of this table selects. Written once because
 * `expired` is not a column and a read that forgot it would silently report an
 * expired invitation as live.
 */
const INVITE_COLUMNS = (sql: SqlClient.SqlClient) =>
  sql`group_invite.*, now() >= group_invite.expires_at as expired`;

export class Invites extends Context.Service<
  Invites,
  {
    /** The owner's list, newest first. Never carries a token — there is none to carry. */
    readonly list: (
      groupId: GroupId,
    ) => Effect.Effect<ReadonlyArray<GroupInvite>, NotFound, CurrentActor>;
    /** Mints one. The only response in the product that contains a secret. */
    readonly create: (
      groupId: GroupId,
      payload: InviteCreate,
    ) => Effect.Effect<IssuedInvite, NotFound, CurrentActor>;
    /**
     * Withdraws one — and, if it has already been accepted, ends the
     * membership it granted (campaign participations included), in the same
     * transaction. `Conflict` when the redeemer cannot be removed — they
     * created a campaign in the group since, which pins their membership.
     */
    readonly revoke: (
      groupId: GroupId,
      inviteId: GroupInviteId,
    ) => Effect.Effect<GroupInvite, NotFound | Conflict, CurrentActor>;
    /** Campaign creator's list, containing only invitations to this table. */
    readonly listForCampaign: (
      creator: CampaignCreatorActor,
    ) => Effect.Effect<ReadonlyArray<GroupInvite>, never>;
    /** Mints a campaign seat; its group is an internal fact on the proof. */
    readonly createForCampaign: (
      creator: CampaignCreatorActor,
      payload: CampaignInviteCreate,
    ) => Effect.Effect<IssuedInvite, NotFound>;
    /** Withdraws only this campaign invitation and the seat it granted. */
    readonly revokeForCampaign: (
      creator: CampaignCreatorActor,
      inviteId: GroupInviteId,
    ) => Effect.Effect<GroupInvite, NotFound>;
    /** What the holder of a live invitation is told before signing in. */
    readonly preview: (token: string) => Effect.Effect<InvitePreview, NotFound>;
    /** Accepts one, for the account that is signed in and no other. */
    readonly redeem: (token: string) => Effect.Effect<InviteRedeemed, NotFound, CurrentActor>;
  }
>()("Invites") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      /**
       * The names an invitation may disclose, read by the invitation rather
       * than by the actor — the ids come off the invite row, so this cannot
       * be pointed at a group or campaign the token does not belong to.
       */
      const namedByInvite = (groupId: GroupId, campaignId: CampaignId | null) =>
        Effect.map(
          sql<{
            readonly group_name: string;
            readonly owner_name: string;
            readonly campaign_name: string | null;
            readonly campaign_shared: boolean | null;
          }>`
            select play_group.name as group_name,
                   account.name as owner_name,
                   campaign.name as campaign_name,
                   (campaign.visibility = 'shared') as campaign_shared
            from play_group
            join account on account.id = play_group.owner_account_id
            left join campaign on campaign.id = ${campaignId}
            where play_group.id = ${groupId}
          `,
          (rows) => rows[0],
        );

      /**
       * The invitation a token names, locked for the write that follows it.
       * `for update` is the whole of the single-use story: two clients racing
       * on one link serialise here.
       */
      const lockByToken = (token: string) =>
        Effect.map(
          sql<InviteRow>`
            select ${INVITE_COLUMNS(sql)} from group_invite
            where group_invite.token_hash = ${hashToken(token)}
            for update
          `,
          (rows) => rows[0],
        );

      /**
       * Every refusal on the redeeming side, and there is only one of them:
       * unknown, expired, withdrawn, already spent by somebody else — the same
       * `NotFound`, because telling the holder of a dead token which kind of
       * dead it is discloses that it was ever alive.
       */
      const noSuchInvitation = () => new NotFound({ resource: "invite", id: "" });

      return {
        list: (groupId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // An invitation is a credential, so reading the list is the
              // owner's act and not merely a read of the group.
              yield* ensureGroupWritable(sql, groupId, actor);
              const rows = yield* sql<ListedInviteRow>`
                select ${INVITE_COLUMNS(sql)}, account.name as redeemed_by_name
                from group_invite
                left join account on account.id = group_invite.redeemed_by
                where group_invite.group_id = ${groupId}
                order by group_invite.created_at desc
              `;
              return rows.map(toInvite);
            }),
          ),

        create: (groupId, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupWritable(sql, groupId, actor);

              // A named campaign is a claim, bound to this group before it is
              // written: the composite foreign key would refuse it anyway,
              // but a typed 404 naming the campaign beats a defect.
              if (payload.campaignId !== undefined) {
                const inGroup = yield* sql<{ readonly ok: boolean }>`
                  select exists (select 1 from campaign
                                 where campaign.id = ${payload.campaignId}
                                   and campaign.group_id = ${groupId}) as ok
                `;
                if (inGroup[0]?.ok !== true) {
                  return yield* new NotFound({ resource: "campaign", id: payload.campaignId });
                }
              }

              // The same 32 bytes of `randomBytes` a machine token is, stored
              // the same way. The plaintext exists in this function and in the
              // one response, and nowhere else ever again.
              const token = randomBytes(TOKEN_BYTES).toString("base64url");
              const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

              const rows = yield* sql<InviteRow>`
                insert into group_invite (group_id, campaign_id, token_hash, label, expires_at)
                values (${groupId}, ${payload.campaignId ?? null}, ${hashToken(token)},
                        ${payload.label ?? ""}, ${expiresAt})
                returning ${INVITE_COLUMNS(sql)}
              `;
              return new IssuedInvite({
                invite: toInvite({ ...rows[0]!, redeemed_by_name: null }),
                token,
              });
            }),
          ),

        revoke: (groupId, inviteId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureGroupWritable(sql, groupId, actor);

                // Idempotent: revoking a withdrawn invitation keeps the first
                // `revoked_at`.
                const rows = yield* sql<InviteRow>`
                  update group_invite
                  set revoked_at = coalesce(group_invite.revoked_at, now())
                  where group_invite.id = ${inviteId}
                    and group_invite.group_id = ${groupId}
                  returning ${INVITE_COLUMNS(sql)}
                `;
                const row = rows[0];
                if (row === undefined) {
                  return yield* new NotFound({ resource: "invite", id: inviteId });
                }

                // **Revoking an accepted invitation takes the membership
                // back** — group membership and every campaign participation
                // under it, in this same transaction. It is the owner's only
                // remedy for a link that reached the wrong person. It cannot
                // touch the owner's own row, and it refuses (Conflict) when
                // the redeemer created a campaign in the group since.
                if (row.redeemed_by !== null) {
                  yield* removeFromGroup(sql, groupId, row.redeemed_by);
                }

                const named = yield* sql<{ readonly name: string }>`
                  select account.name from account where account.id = ${row.redeemed_by}
                `;
                return toInvite({ ...row, redeemed_by_name: named[0]?.name ?? null });
              }),
            ),
          ),

        listForCampaign: (creator) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<ListedInviteRow>`
                select ${INVITE_COLUMNS(sql)}, account.name as redeemed_by_name
                from group_invite
                left join account on account.id = group_invite.redeemed_by
                where group_invite.campaign_id = ${creator.campaign}
                  and group_invite.group_id = ${creator.group}
                  and ${campaignWritableById(sql, creator.campaign, creator.actor)}
                order by group_invite.created_at desc
              `;
              return rows.map(toInvite);
            }),
          ),

        createForCampaign: (creator, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const writable = yield* sql<{ readonly ok: boolean }>`
                select ${campaignWritableById(sql, creator.campaign, creator.actor)} as ok
              `;
              if (writable[0]?.ok !== true) {
                return yield* new NotFound({ resource: "campaign", id: creator.campaign });
              }

              const token = randomBytes(TOKEN_BYTES).toString("base64url");
              const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
              const rows = yield* sql<InviteRow>`
                insert into group_invite (group_id, campaign_id, token_hash, label, expires_at)
                values (${creator.group}, ${creator.campaign}, ${hashToken(token)},
                        ${payload.label ?? ""}, ${expiresAt})
                returning ${INVITE_COLUMNS(sql)}
              `;
              return new IssuedInvite({
                invite: toInvite({ ...rows[0]!, redeemed_by_name: null }),
                token,
              });
            }),
          ),

        revokeForCampaign: (creator, inviteId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const rows = yield* sql<InviteRow>`
                  update group_invite
                  set revoked_at = coalesce(group_invite.revoked_at, now())
                  where group_invite.id = ${inviteId}
                    and group_invite.campaign_id = ${creator.campaign}
                    and group_invite.group_id = ${creator.group}
                    and ${campaignWritableById(sql, creator.campaign, creator.actor)}
                  returning ${INVITE_COLUMNS(sql)}
                `;
                const row = rows[0];
                if (row === undefined) {
                  return yield* new NotFound({ resource: "invite", id: inviteId });
                }

                if (row.redeemed_by !== null && row.granted_campaign_membership) {
                  yield* revokeMemberAt(sql, creator.campaign, row.redeemed_by);
                }

                const named = yield* sql<{ readonly name: string }>`
                  select account.name from account where account.id = ${row.redeemed_by}
                `;
                return toInvite({ ...row, redeemed_by_name: named[0]?.name ?? null });
              }),
            ),
          ),

        preview: (token) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<InviteRow>`
                select ${INVITE_COLUMNS(sql)} from group_invite
                where group_invite.token_hash = ${hashToken(token)}
              `;
              const invite = rows[0];
              // Live only. An expired, withdrawn or already-accepted
              // invitation is the same nothing an invented token is.
              if (invite === undefined || statusOf(invite) !== "live") {
                return yield* noSuchInvitation();
              }

              const named = yield* namedByInvite(invite.group_id, invite.campaign_id);
              if (named === undefined) {
                return yield* noSuchInvitation();
              }

              return new InvitePreview({
                groupName: named.group_name,
                ownerName: named.owner_name,
                campaignName: named.campaign_name,
                expiresAt: DateTime.fromDateUnsafe(invite.expires_at),
              });
            }),
          ),

        redeem: (token) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const invite = yield* lockByToken(token);
                if (invite === undefined || invite.revoked_at !== null) {
                  return yield* noSuchInvitation();
                }

                if (invite.redeemed_at !== null) {
                  // Already spent. By this account it is the same success — a
                  // double-tapped *Join* is one person joining once. By
                  // anybody else it is gone.
                  if (invite.redeemed_by !== actor.accountId) return yield* noSuchInvitation();
                } else {
                  if (invite.expired) return yield* noSuchInvitation();

                  // The grant, and the whole of it: a group membership for
                  // the account `Authorization` resolved, and a participation
                  // at the named table when the invitation names one. No
                  // account id from a payload, no ids from a path, no role
                  // from anywhere.
                  yield* admitToGroup(sql, invite.group_id, actor.accountId);
                  const grantedCampaignMembership =
                    invite.campaign_id === null
                      ? false
                      : yield* admitTo(sql, invite.campaign_id, invite.group_id, actor.accountId);
                  yield* sql`
                    update group_invite
                    set redeemed_by = ${actor.accountId},
                        redeemed_at = now(),
                        granted_campaign_membership = ${grantedCampaignMembership}
                    where group_invite.id = ${invite.id}
                  `;
                }

                const named = yield* namedByInvite(invite.group_id, invite.campaign_id);
                if (named === undefined) return yield* noSuchInvitation();

                return new InviteRedeemed({
                  groupId: invite.group_id,
                  groupName: named.group_name,
                  campaignId: invite.campaign_id,
                  campaignName: named.campaign_name,
                  // The ordinary answer is `false`, and saying so here is what
                  // keeps "the creator has not shared this table yet" from
                  // reading as "this product is broken".
                  shared: named.campaign_shared === true,
                });
              }),
            ),
          ),
      };
    }),
  );
}
