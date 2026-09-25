import type { CampaignInvite, CampaignMember, PartySeat } from "@taverns/api";
import { DateTime } from "effect";
import { dayOf } from "../chronicle/format";

/**
 * The seat vocabulary, derived — and the whole of what this screen knows.
 *
 * `ui_kits/dm-screen/Party.jsx` draws a chair per person with four statuses, an
 * *"Add seat"* button and an *"N of M seats"* subtitle. The seat **exists**
 * now — `campaign_character`, since the continuity decision of 2026-09-01 —
 * but the half of the 2026-08-12 ruling that mattered still holds: a seat's
 * deferred key requires a live member, so an *open* seat with nobody in it is
 * still not representable, and *"Add seat"* and the *"4 of 6"* denominator
 * still come out of the drawing. What changed is only the middle column of
 * the table below: `playing` is read off seats rather than off an assignment
 * column that no longer exists.
 *
 * So three of the drawn statuses are computed here from rows that exist, and the
 * fourth comes out of the drawing. Under the continuity architecture the middle
 * column is the **seat** — `campaign_character`, a campaign's join to a shared
 * account-owned character — which is, pleasingly, the word the drawing wanted
 * all along, now naming a row that really exists:
 *
 * | drawn          | here                                                          |
 * | -------------- | ------------------------------------------------------------- |
 * | `playing`      | a `player` member with a live seat at this table              |
 * | `no-character` | the same member with none                                     |
 * | `invited`      | a `CampaignInvite` whose `status` is `live`                   |
 * | `open`         | nothing — a seat cannot exist before a member                 |
 *
 * **Each line is a person**, which is what the single-use invitation contract
 * buys: one invitation grants one membership and names who took it, so a live
 * invitation is somebody who has not arrived rather than a share of a reusable
 * link. The drawing's *"used 2 of 6"* is the model this product does not have.
 *
 * Everything here is pure and takes its clock as an argument, so the one thing
 * on the screen that ages — an invitation that has been waiting — is testable
 * rather than dependent on the day the suite runs.
 */

/**
 * A row of the roster.
 *
 * Discriminated rather than one shape with a `status` string and nullable
 * fields, for the reason `SearchHit` is: a `no-character` row has no character
 * to render and an invitation has no account, and a union says so where a
 * nullable field only hopes.
 */
export type RosterRow =
  /**
   * The DM. Exactly one exists — `Campaigns.create` writes it and nothing else
   * mints a `dm` membership — and it is here rather than filtered out because
   * the endpoint returns it and a roster that silently drops a person is a
   * roster you cannot trust. It carries no character status: a DM without a
   * character is not a state anybody needs to act on.
   */
  | { readonly kind: "dm"; readonly member: CampaignMember }
  /**
   * A player with at least one live seat at this table.
   *
   * Plural because nothing in the schema stops two seats: one person running a
   * pair is expressible, and showing only the first would be this screen
   * quietly disagreeing with the party list one screen over. The seats carry
   * their characters; a seat whose character has been deleted still counts —
   * the person is seated, and the display snapshot says as what.
   */
  | {
      readonly kind: "playing";
      readonly member: CampaignMember;
      readonly seats: ReadonlyArray<PartySeat>;
    }
  | { readonly kind: "no-character"; readonly member: CampaignMember }
  | { readonly kind: "invited"; readonly invite: CampaignInvite };

/** The key a row is rendered under, and the id it is really about. */
export const keyOf = (row: RosterRow): string =>
  row.kind === "invited" ? row.invite.id : row.member.accountId;

/** Who the row is about, in words. */
export const nameOf = (row: RosterRow): string =>
  row.kind === "invited"
    ? row.invite.label === ""
      ? "Unnamed invitation"
      : row.invite.label
    : row.member.name;

/**
 * The roster: the DM, then the players, then whoever has been invited and has
 * not arrived.
 *
 * **Only `live` invitations become rows.** A `redeemed` one is already a member
 * and would appear twice; a `revoked` or `expired` one is nobody at the table.
 * The full lifecycle is `InviteDialog`'s list, which this screen opens rather
 * than redraws — the report's own instruction, and it is also where the
 * withdrawn-before-taken precedence is written exactly once.
 *
 * Member order is the server's, untouched: `members.list` orders by `joined_at`,
 * which is the order the table filled up, and a second sort here could only
 * disagree with it.
 */
export const rosterOf = (
  members: ReadonlyArray<CampaignMember>,
  party: ReadonlyArray<PartySeat>,
  invites: ReadonlyArray<CampaignInvite>,
): ReadonlyArray<RosterRow> => {
  const dms = members.filter((member) => member.relation === "creator");
  const players = members.filter((member) => member.relation === "player");

  const playerRows = players.map((member): RosterRow => {
    const theirs = party.filter((row) => row.seat.accountId === member.accountId);
    return theirs.length === 0
      ? { kind: "no-character", member }
      : { kind: "playing", member, seats: theirs };
  });

  return [
    ...dms.map((member): RosterRow => ({ kind: "dm", member })),
    ...playerRows,
    ...invites
      .filter((invite) => invite.status === "live")
      .map((invite): RosterRow => ({ kind: "invited", invite })),
  ];
};

/**
 * *Not playing yet*: the people at the table, or invited to it, who have no
 * character in the party — each with the one sentence worth saying about them.
 *
 * It is *Needs you* folded into the list it was always about. A member who has
 * joined with no character is the nudge itself; an invitation says when it runs
 * out, and once it has sat for a few days, how long it has been waiting. The
 * third kind of line *Needs you* drew — a character the party has out-levelled —
 * is about somebody who is playing, and every card already says its level.
 *
 * Empty for a table where everyone has a character and nothing is outstanding,
 * which is when the screen draws no list at all.
 */
export interface NotPlaying {
  readonly key: string;
  readonly kind: "no-character" | "invited";
  readonly name: string;
  readonly detail: string;
}

/**
 * How long an invitation may sit before its line says how long it has waited.
 *
 * Not *"hasn't opened it"* — the drawing says that and nothing records whether a
 * link was followed; what is recorded is that it is still live, which after a
 * few days means the same thing to the DM and claims less.
 */
const STALE_INVITE_DAYS = 3;

const DAY_MS = 86_400_000;

export const notPlayingYet = (
  rows: ReadonlyArray<RosterRow>,
  now: DateTime.Utc,
): ReadonlyArray<NotPlaying> =>
  rows.flatMap((row): ReadonlyArray<NotPlaying> => {
    if (row.kind === "no-character") {
      return [
        {
          key: keyOf(row),
          kind: row.kind,
          name: nameOf(row),
          detail: "Joined the table, and has no character yet.",
        },
      ];
    }
    if (row.kind !== "invited") return [];
    const waiting = Math.floor(
      (DateTime.toEpochMillis(now) - DateTime.toEpochMillis(row.invite.createdAt)) / DAY_MS,
    );
    const runsOut = dayOf(row.invite.expiresAt);
    return [
      {
        key: keyOf(row),
        kind: row.kind,
        name: nameOf(row),
        detail:
          waiting >= STALE_INVITE_DAYS
            ? `Invited ${String(waiting)} days ago, and it runs out on ${runsOut}.`
            : `Invited, and it runs out on ${runsOut}.`,
      },
    ];
  });
