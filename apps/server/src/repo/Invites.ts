import {
  type AccountId,
  CampaignInvite,
  type CampaignId,
  CurrentActor,
  type InviteCreate,
  type InviteId,
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
import { admitPlayer, dmNameOf, revokePlayerAt } from "./Memberships.js";
import { dieOnSqlError } from "./rows.js";
import { ensureCampaignWritable } from "./visibility.js";

/**
 * Invitations: how an account that owns no campaign comes to reach one.
 *
 * **A link is an invitation to join, not a way in.** Redeeming grants an
 * ordinary `campaign_member` row to the account that is signed in, and from that
 * moment the member is indistinguishable from one invited any other way — no new
 * predicate, no new base case, no change to `Authorization`.
 * `packages/api/src/Invite.ts` states the four lifetime rules and why each is the
 * choice that fails safe; `migrations/0013_invites.ts` states what the table
 * deliberately does not have.
 *
 * ### Three things about this file that are not obvious from reading it
 *
 * **It writes no `campaign_member` SQL.** `repo/Memberships.ts` and
 * `repo/visibility.ts` are still the only two modules in `src` that name that
 * table, which `apps/server/test/membership.test.ts` enforces — so the grant
 * this file exists to make goes through `admitPlayer`, which takes no role and
 * spells `'player'` as a literal. "An invitation cannot become a DM membership"
 * is therefore a property of what exists rather than a check here.
 *
 * **The DM side is gated by `campaignWritable` and nothing new.** Listing,
 * minting and revoking are DM acts on an ordinary campaign-scoped resource, so
 * they compose `ensureCampaignWritable` exactly as `Notes.create` does. A player
 * at the table gets the ordinary `NotFound`.
 *
 * **`preview` and `redeem` read the campaign's name outside the visibility
 * seam, and the token is what scopes them.** They have to: the whole point of an
 * invitation page is that it works before the reader has an account, and the
 * ordinary outcome of joining is a campaign the DM has not shared yet — which
 * `campaignReadable` refuses, correctly. So both read two scalar columns of *the
 * campaign the invitation names*, never one a caller named, having first proved
 * the caller holds a live token for it. That is a bounded disclosure to the
 * holder of a capability, which is the same trade the invitation itself is, and
 * it is confined to this file for the reason `bestiary/import.ts` is confined to
 * its own.
 */

/**
 * How long an invitation lives.
 *
 * Server-set and not client-supplied, so an eternal invitation is not something
 * a caller may ask for. Two weeks is chosen against the way tables actually
 * work: a DM sends links after one Thursday and expects everyone in before the
 * next one or two, and a link found in a group chat months later should be dead
 * rather than dormant. Shortening it is the safe direction if it ever moves.
 */
export const INVITE_TTL_DAYS = 14;

const TOKEN_BYTES = 32;

interface InviteRow {
  readonly id: InviteId;
  readonly campaign_id: CampaignId;
  readonly label: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
  readonly redeemed_by: AccountId | null;
  readonly redeemed_at: Date | null;
  /**
   * Computed by the database rather than by comparing `expires_at` here, so one
   * clock decides — the same one the redemption's own liveness test uses.
   */
  readonly expired: boolean;
}

interface ListedInviteRow extends InviteRow {
  readonly redeemed_by_name: string | null;
}

/**
 * Where an invitation is in its life.
 *
 * Precedence is `revoked` → `redeemed` → `expired` → `live`: a withdrawal is an
 * act somebody took, and it is what the DM must see on a line they revoked
 * *after* it was accepted — which is the case where the membership was taken
 * away too, and so the one where "redeemed" would read as a lie.
 */
const statusOf = (row: InviteRow): InviteStatus =>
  row.revoked_at !== null
    ? "revoked"
    : row.redeemed_at !== null
      ? "redeemed"
      : row.expired
        ? "expired"
        : "live";

const toInvite = (row: ListedInviteRow): CampaignInvite =>
  new CampaignInvite({
    id: row.id,
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
 * The columns every read of this table selects.
 *
 * Written once because `expired` is not a column and a read that forgot it would
 * silently report an expired invitation as live — the shape of bug that is
 * invisible for exactly as long as the fixtures are fresh.
 */
const INVITE_COLUMNS = (sql: SqlClient.SqlClient) =>
  sql`campaign_invite.*, now() >= campaign_invite.expires_at as expired`;

export class Invites extends Context.Service<
  Invites,
  {
    /** The DM's list, newest first. Never carries a token — there is none to carry. */
    readonly list: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<CampaignInvite>, NotFound, CurrentActor>;
    /** Mints one. The only response in the product that contains a secret. */
    readonly create: (
      campaignId: CampaignId,
      payload: InviteCreate,
    ) => Effect.Effect<IssuedInvite, NotFound, CurrentActor>;
    /**
     * Withdraws one — and, if it has already been accepted, revokes the
     * membership it granted, in the same transaction.
     */
    readonly revoke: (
      campaignId: CampaignId,
      inviteId: InviteId,
    ) => Effect.Effect<CampaignInvite, NotFound, CurrentActor>;
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
       * The campaign an invitation names, read by the invitation rather than by
       * the actor.
       *
       * Two scalar columns, and the id is never a caller's — it comes off the
       * invite row, so this cannot be pointed at a campaign the token does not
       * belong to. See the note at the top of this file.
       */
      const campaignNamedByInvite = (campaignId: CampaignId) =>
        Effect.map(
          sql<{ readonly name: string; readonly visibility: string }>`
            select campaign.name, campaign.visibility from campaign
            where campaign.id = ${campaignId}
          `,
          (rows) => rows[0],
        );

      /**
       * The invitation a token names, locked for the write that follows it.
       *
       * `for update` is the whole of the single-use story: two clients racing on
       * one link serialise here, the second sees `redeemed_at` already set, and
       * exactly one membership is written. Same shape as
       * `HobThreads.lockTurnForAccept`.
       */
      const lockByToken = (token: string) =>
        Effect.map(
          sql<InviteRow>`
            select ${INVITE_COLUMNS(sql)} from campaign_invite
            where campaign_invite.token_hash = ${hashToken(token)}
            for update
          `,
          (rows) => rows[0],
        );

      /**
       * Every refusal on the redeeming side, and there is only one of them.
       *
       * Unknown, expired, withdrawn, already spent by somebody else: the same
       * `NotFound`, because telling the holder of a dead token which kind of
       * dead it is discloses that it was ever alive. The resource is named for
       * the invitation rather than the campaign, so nothing about which
       * campaigns exist leaks either. There is no id to give — the only
       * identifier the caller has is the secret.
       */
      const noSuchInvitation = () => new NotFound({ resource: "invite", id: "" });

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // An invitation is a credential, so reading the list is a DM act
              // and not merely a read of the campaign.
              yield* ensureCampaignWritable(sql, campaignId, actor);
              const rows = yield* sql<ListedInviteRow>`
                select ${INVITE_COLUMNS(sql)}, account.name as redeemed_by_name
                from campaign_invite
                left join account on account.id = campaign_invite.redeemed_by
                where campaign_invite.campaign_id = ${campaignId}
                order by campaign_invite.created_at desc
              `;
              return rows.map(toInvite);
            }),
          ),

        create: (campaignId, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignWritable(sql, campaignId, actor);

              // The same 32 bytes of `randomBytes` a machine token is, stored
              // the same way: the column is a lookup key, not a recoverable
              // secret. The plaintext exists in this function and in the one
              // response, and nowhere else ever again.
              const token = randomBytes(TOKEN_BYTES).toString("base64url");
              const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

              const rows = yield* sql<InviteRow>`
                insert into campaign_invite (campaign_id, token_hash, label, expires_at)
                values (${campaignId}, ${hashToken(token)}, ${payload.label ?? ""}, ${expiresAt})
                returning ${INVITE_COLUMNS(sql)}
              `;
              return new IssuedInvite({
                invite: toInvite({ ...rows[0]!, redeemed_by_name: null }),
                token,
              });
            }),
          ),

        revoke: (campaignId, inviteId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);

                // Idempotent: revoking a withdrawn invitation keeps the first
                // `revoked_at`, so the DM's list does not quietly restate when
                // it happened every time the button is pressed.
                const rows = yield* sql<InviteRow>`
                  update campaign_invite
                  set revoked_at = coalesce(campaign_invite.revoked_at, now())
                  where campaign_invite.id = ${inviteId}
                    and campaign_invite.campaign_id = ${campaignId}
                  returning ${INVITE_COLUMNS(sql)}
                `;
                const row = rows[0];
                if (row === undefined) {
                  return yield* new NotFound({ resource: "invite", id: inviteId });
                }

                // **Revoking an accepted invitation takes the membership back.**
                // A button that withdrew a spent invitation and left the person
                // at the table would do nothing at all, which is worse than no
                // button — and it is the only remedy the DM has for a link that
                // reached somebody they did not mean. It can touch a `player`
                // row and nothing else; see `revokePlayerAt`.
                if (row.redeemed_by !== null) {
                  yield* revokePlayerAt(sql, campaignId, row.redeemed_by);
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
                select ${INVITE_COLUMNS(sql)} from campaign_invite
                where campaign_invite.token_hash = ${hashToken(token)}
              `;
              const invite = rows[0];
              // Live only. An expired, withdrawn or already-accepted invitation
              // is the same nothing an invented token is.
              if (invite === undefined || statusOf(invite) !== "live") {
                return yield* noSuchInvitation();
              }

              const campaign = yield* campaignNamedByInvite(invite.campaign_id);
              const dm = yield* dmNameOf(sql, invite.campaign_id);
              // Unreachable while `campaign_owner_is_dm_member` holds — a
              // campaign always has a live DM member — but the invitation page
              // has no honest thing to say without a name, so it refuses rather
              // than inventing one.
              if (campaign === undefined || dm === undefined) {
                return yield* noSuchInvitation();
              }

              return new InvitePreview({
                campaignName: campaign.name,
                dmName: dm,
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
                  // Already spent. By this account it is the same success —
                  // a double-tapped *Join* is one person joining once, and a
                  // second tap that answered "no such invitation" would read as
                  // somebody having stolen it. By anybody else it is gone.
                  if (invite.redeemed_by !== actor.accountId) return yield* noSuchInvitation();
                } else {
                  if (invite.expired) return yield* noSuchInvitation();

                  // The grant, and the whole of it: a `player` row for the
                  // account `Authorization` resolved. No account id from a
                  // payload, no campaign id from a path, no role from anywhere.
                  yield* admitPlayer(sql, invite.campaign_id, actor.accountId);
                  yield* sql`
                    update campaign_invite
                    set redeemed_by = ${actor.accountId}, redeemed_at = now()
                    where campaign_invite.id = ${invite.id}
                  `;
                }

                const campaign = yield* campaignNamedByInvite(invite.campaign_id);
                if (campaign === undefined) return yield* noSuchInvitation();

                return new InviteRedeemed({
                  campaignId: invite.campaign_id,
                  campaignName: campaign.name,
                  // The ordinary answer is `false`, and saying so here is what
                  // keeps "the DM has not shared this table yet" from reading as
                  // "this product is broken". See `Memberships.mine`.
                  shared: campaign.visibility === "shared",
                });
              }),
            ),
          ),
      };
    }),
  );
}
