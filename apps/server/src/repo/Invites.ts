import {
  AccountId,
  CampaignId,
  type CampaignInviteCreate,
  CampaignInvite,
  CampaignInvitePreview,
  CampaignInviteRedeemed,
  CampaignInviteId,
  CampaignSharedWorld,
  CurrentActor,
  SharedWorldId,
  type InvitePreview,
  type InviteRedeemed,
  InviteStatus,
  IssuedInvite,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { randomBytes } from "node:crypto";
import { hashToken } from "../Accounts.js";
import { admitToGroup } from "./Groups.js";
import { admitTo, revokeMemberAt } from "./Memberships.js";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import { classFromColumns, dieOnSqlError, fromColumns, orNotFound } from "./rows.js";
import { campaignWritableById } from "./visibility.js";

/**
 * Campaign invitations, with one single-use token lifecycle.
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
 * make go through `admitToGroup` and `admitTo`, and campaign revocation goes
 * through `revokeMemberAt` — all inside this file's transactions.
 *
 * **Authority follows the campaign.** Management requires a
 * `CampaignCreatorActor`, so a creator never needs ownership of the hidden
 * group to invite their players.
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

/**
 * Where an invitation is in its life, as a column the database computes, so
 * one clock decides. Precedence is `revoked` → `redeemed` → `expired` →
 * `live`: a withdrawal is an act somebody took, and it is what the owner must
 * see on a line they revoked *after* it was accepted.
 */
const statusColumn = (sql: SqlClient.SqlClient) => sql`
  case
    when group_invite.revoked_at is not null then 'revoked'
    when group_invite.redeemed_at is not null then 'redeemed'
    when now() >= group_invite.expires_at then 'expired'
    else 'live'
  end as status
`;

/**
 * The columns every read of this table selects. Written once because `status`
 * is not a column and a read that forgot it would be refused by its decode.
 */
const INVITE_COLUMNS = (sql: SqlClient.SqlClient) => sql`group_invite.*, ${statusColumn(sql)}`;

/**
 * A `group_invite` row as its creator's list reads it, with the name of the
 * account that accepted it (`redeemed_by_name`, `null` when nobody has).
 */
const InviteRow = classFromColumns(CampaignInvite, {
  ...CampaignInvite.fields,
  expiresAt: Schema.DateTimeUtcFromDate,
  revokedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  redeemedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  createdAt: Schema.DateTimeUtcFromDate,
});

/** What the redeeming side needs of the invitation a token names. */
const TokenRow = fromColumns(
  Schema.Struct({
    id: CampaignInviteId,
    groupId: SharedWorldId,
    campaignId: CampaignId,
    status: InviteStatus,
    redeemedBy: Schema.NullOr(AccountId),
    expiresAt: Schema.DateTimeUtcFromDate,
  }),
);

/**
 * The names an invitation may disclose: the Shared World only when the
 * campaign's context is one, as `json_build_object` builds it.
 */
const NamedRow = fromColumns(
  Schema.Struct({
    sharedWorld: Schema.NullOr(CampaignSharedWorld),
    campaignId: CampaignId,
    campaignName: Schema.String,
    creatorName: Schema.String,
    campaignShared: Schema.Boolean,
  }),
);

const Token = Schema.toType(Schema.String);

export class Invites extends Context.Service<
  Invites,
  {
    /** Campaign creator's list, containing only invitations to this table. */
    readonly listForCampaign: (
      creator: CampaignCreatorActor,
    ) => Effect.Effect<ReadonlyArray<CampaignInvite>, never>;
    /** Mints a campaign seat; its group is an internal fact on the proof. */
    readonly createForCampaign: (
      creator: CampaignCreatorActor,
      payload: CampaignInviteCreate,
    ) => Effect.Effect<IssuedInvite, NotFound>;
    /** Withdraws only this campaign invitation and the seat it granted. */
    readonly revokeForCampaign: (
      creator: CampaignCreatorActor,
      inviteId: CampaignInviteId,
    ) => Effect.Effect<CampaignInvite, NotFound>;
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
      const namedByInvite = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ groupId: SharedWorldId, campaignId: CampaignId })),
        Result: NamedRow,
        execute: ({ groupId, campaignId }) => sql`
          select case when play_group.is_shared_world
                   then json_build_object('id', play_group.id, 'name', play_group.name)
                 end as shared_world,
                 campaign.id as campaign_id,
                 campaign.name as campaign_name,
                 campaign_creator.name as creator_name,
                 (campaign.visibility = 'shared') as campaign_shared
          from play_group
          join campaign on campaign.id = ${campaignId} and campaign.group_id = play_group.id
          join account as campaign_creator
            on campaign_creator.id = campaign.creator_account_id
          where play_group.id = ${groupId}
        `,
      });

      /** The invitation a token names, for the preview. */
      const byToken = SqlSchema.findOne({
        Request: Token,
        Result: TokenRow,
        execute: (token) => sql`
          select ${INVITE_COLUMNS(sql)} from group_invite
          where group_invite.token_hash = ${hashToken(token)}
        `,
      });

      /**
       * The invitation a token names, locked for the write that follows it.
       * `for update` is the whole of the single-use story: two clients racing
       * on one link serialise here.
       */
      const lockByToken = SqlSchema.findOne({
        Request: Token,
        Result: TokenRow,
        execute: (token) => sql`
          select ${INVITE_COLUMNS(sql)} from group_invite
          where group_invite.token_hash = ${hashToken(token)}
          for update
        `,
      });

      const listed = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, group: SharedWorldId })),
        Result: InviteRow,
        execute: ({ campaign, group, actor }) => sql`
          select ${INVITE_COLUMNS(sql)}, account.name as redeemed_by_name
          from group_invite
          left join account on account.id = group_invite.redeemed_by
          where group_invite.campaign_id = ${campaign}
            and group_invite.group_id = ${group}
            and ${campaignWritableById(sql, campaign, actor)}
          order by group_invite.created_at desc
        `,
      });

      /** A new invitation, which nobody has accepted yet. */
      const insert = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            campaign: CampaignId,
            group: SharedWorldId,
            tokenHash: Schema.String,
            label: Schema.String,
            expiresAt: Schema.Date,
          }),
        ),
        Result: InviteRow,
        execute: ({ campaign, group, tokenHash, label, expiresAt }) => sql`
          insert into group_invite (group_id, campaign_id, token_hash, label, expires_at)
          values (${group}, ${campaign}, ${tokenHash}, ${label}, ${expiresAt})
          returning ${INVITE_COLUMNS(sql)}, null::text as redeemed_by_name
        `,
      });

      /** Withdraws one of this creator's invitations, answering what it had granted. */
      const withdraw = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, group: SharedWorldId, id: CampaignInviteId }),
        ),
        Result: fromColumns(
          Schema.Struct({
            redeemedBy: Schema.NullOr(AccountId),
            grantedCampaignMembership: Schema.Boolean,
          }),
        ),
        execute: ({ campaign, group, actor, id }) => sql`
          update group_invite
          set revoked_at = coalesce(group_invite.revoked_at, now())
          where group_invite.id = ${id}
            and group_invite.campaign_id = ${campaign}
            and group_invite.group_id = ${group}
            and ${campaignWritableById(sql, campaign, actor)}
          returning group_invite.redeemed_by, group_invite.granted_campaign_membership
        `,
      });

      /**
       * An invitation this transaction has just withdrawn, read back by the id
       * it withdrew, with the name of whoever had accepted it.
       */
      const withdrawn = SqlSchema.findOne({
        Request: Schema.toType(CampaignInviteId),
        Result: InviteRow,
        execute: (id) => sql`
          select ${INVITE_COLUMNS(sql)}, account.name as redeemed_by_name
          from group_invite
          left join account on account.id = group_invite.redeemed_by
          where group_invite.id = ${id}
        `,
      });

      /**
       * Every refusal on the redeeming side, and there is only one of them:
       * unknown, expired, withdrawn, already spent by somebody else — the same
       * `NotFound`, because telling the holder of a dead token which kind of
       * dead it is discloses that it was ever alive.
       */
      const noSuchInvitation = () => new NotFound({ resource: "invite", id: "" });

      return {
        listForCampaign: (creator) =>
          dieOnSqlError(listed({ ...asked(creator), group: creator.group })),

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
              // An insert answers with its row; not getting one is a defect.
              const invite = yield* insert({
                campaign: creator.campaign,
                group: creator.group,
                tokenHash: hashToken(token),
                label: payload.label ?? "",
                expiresAt,
              }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
              return new IssuedInvite({ invite, token });
            }),
          ),

        revokeForCampaign: (creator, inviteId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const granted = yield* withdraw({
                  ...asked(creator),
                  group: creator.group,
                  id: inviteId,
                }).pipe(orNotFound("invite", inviteId));

                if (granted.redeemedBy !== null && granted.grantedCampaignMembership) {
                  yield* revokeMemberAt(sql, creator.campaign, granted.redeemedBy);
                }

                // Withdrawn above, in this transaction; not reading it back is a defect.
                return yield* withdrawn(inviteId).pipe(
                  Effect.catchTag("NoSuchElementError", Effect.die),
                );
              }),
            ),
          ),

        preview: (token) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const invite = yield* byToken(token).pipe(
                Effect.catchTag("NoSuchElementError", () => Effect.fail(noSuchInvitation())),
              );
              // Live only. An expired, withdrawn or already-accepted
              // invitation is the same nothing an invented token is.
              if (invite.status !== "live") {
                return yield* noSuchInvitation();
              }

              const named = yield* namedByInvite(invite).pipe(
                Effect.catchTag("NoSuchElementError", () => Effect.fail(noSuchInvitation())),
              );

              return new CampaignInvitePreview({
                kind: "campaign",
                campaignName: named.campaignName,
                creatorName: named.creatorName,
                sharedWorldName: named.sharedWorld?.name ?? null,
                expiresAt: invite.expiresAt,
              });
            }),
          ),

        redeem: (token) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const invite = yield* lockByToken(token).pipe(
                  Effect.catchTag("NoSuchElementError", () => Effect.fail(noSuchInvitation())),
                );
                if (invite.status === "revoked") {
                  return yield* noSuchInvitation();
                }

                if (invite.status === "redeemed") {
                  // Already spent. By this account it is the same success — a
                  // double-tapped *Join* is one person joining once. By
                  // anybody else it is gone.
                  if (invite.redeemedBy !== actor.accountId) return yield* noSuchInvitation();
                } else {
                  if (invite.status === "expired") return yield* noSuchInvitation();

                  // The grant, and the whole of it: a group membership for
                  // the account `Authorization` resolved, and a participation
                  // at the named table when the invitation names one. No
                  // account id from a payload, no ids from a path, no role
                  // from anywhere.
                  yield* admitToGroup(sql, invite.groupId, actor.accountId);
                  const grantedCampaignMembership = yield* admitTo(
                    sql,
                    invite.campaignId,
                    invite.groupId,
                    actor.accountId,
                  );
                  yield* sql`
                    update group_invite
                    set redeemed_by = ${actor.accountId},
                        redeemed_at = now(),
                        granted_campaign_membership = ${grantedCampaignMembership}
                    where group_invite.id = ${invite.id}
                  `;
                }

                const named = yield* namedByInvite(invite).pipe(
                  Effect.catchTag("NoSuchElementError", () => Effect.fail(noSuchInvitation())),
                );

                return new CampaignInviteRedeemed({
                  kind: "campaign",
                  campaignId: named.campaignId,
                  campaignName: named.campaignName,
                  sharedWorld: named.sharedWorld,
                  // The ordinary answer is `false`, and saying so here is what
                  // keeps "the creator has not shared this table yet" from
                  // reading as "this product is broken".
                  shared: named.campaignShared,
                });
              }),
            ),
          ),
      };
    }),
  );
}
