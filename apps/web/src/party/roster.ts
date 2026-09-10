import type { CampaignInvite, CampaignMember, Character, PartySeat } from "@taverns/api";
import type { IconName } from "@taverns/ui";
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
 * Two letters for the avatar, or one, or a dash.
 *
 * `PlayerParts.jsx`'s `Seat` takes them ready-made from the fixture; nothing on
 * the wire carries initials, so they are cut from the name here. An account
 * provisioned just-in-time is called *"Someone"*, which yields `S` — correct,
 * and the reason `DEFAULT_ACCOUNT_NAME` is not *"DM"*.
 */
export const initialsOf = (name: string): string => {
  const words = name.split(/\s+/).filter((word) => word !== "");
  const letters = words.slice(0, 2).map((word) => word[0] ?? "");
  return letters.join("").toUpperCase() || "—";
};

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
 * The subtitle, which is what is true rather than *"4 of 6 seats"*.
 *
 * The drawn subtitle counts a denominator that does not exist. This counts the
 * two things that do — people at the table, and invitations still outstanding —
 * and says nothing at all when there is neither, because the empty state under
 * it is already saying it.
 */
export const summaryOf = (rows: ReadonlyArray<RosterRow>): string | undefined => {
  const players = rows.filter(
    (row) => row.kind === "playing" || row.kind === "no-character",
  ).length;
  const invited = rows.filter((row) => row.kind === "invited").length;
  if (players === 0 && invited === 0) return undefined;

  const parts = [
    players === 0
      ? "Nobody has joined yet"
      : `${String(players)} player${players === 1 ? "" : "s"}`,
    ...(invited === 0
      ? []
      : [`${String(invited)} invitation${invited === 1 ? "" : "s"} outstanding`]),
  ];
  return parts.join(", ");
};

/**
 * *Needs you* — the aside, and the best thing on the drawn screen.
 *
 * Three lines, each derived from rows that already exist and none of them a new
 * source. The drawing's fourth kind of urgency is a date (*"session 13 is in
 * four days"*) and there is no column anywhere that holds when a night will be
 * played, so it is absent rather than invented.
 */
export interface Nudge {
  readonly key: string;
  readonly icon: IconName;
  /** A theme colour name, never a value — `styles.css` §2 owns what these are. */
  readonly tone: "text-danger-ink" | "text-accent-ink" | "text-faint";
  readonly text: string;
}

/**
 * How long an invitation may sit before it is worth a line.
 *
 * Not *"hasn't opened it"* — the drawing says that and nothing records whether a
 * link was followed; what is recorded is that it is still live, which after a
 * few days means the same thing to the DM and claims less.
 */
const STALE_INVITE_DAYS = 3;

const DAY_MS = 86_400_000;

/**
 * The middle level of the party, taking the lower of the two when there is an
 * even number.
 *
 * The lower median rather than their mean, so the sentence names a level
 * somebody is actually at: *"the party is mostly level 4.5"* is not a thing a DM
 * can act on.
 */
const medianLevel = (levels: ReadonlyArray<number>): number | undefined => {
  if (levels.length < 2) return undefined;
  const sorted = [...levels].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

export const needsOf = (
  rows: ReadonlyArray<RosterRow>,
  party: ReadonlyArray<PartySeat>,
  now: DateTime.Utc,
): ReadonlyArray<Nudge> => {
  const nudges: Array<Nudge> = [];

  for (const row of rows) {
    if (row.kind === "no-character") {
      nudges.push({
        key: `no-character:${row.member.accountId}`,
        icon: "user-round-x",
        tone: "text-danger-ink",
        text: `${row.member.name} has joined the table and has no character yet.`,
      });
    }
  }

  for (const row of rows) {
    if (row.kind !== "invited") continue;
    const waiting = Math.floor(
      (DateTime.toEpochMillis(now) - DateTime.toEpochMillis(row.invite.createdAt)) / DAY_MS,
    );
    if (waiting < STALE_INVITE_DAYS) continue;
    nudges.push({
      key: `stale-invite:${row.invite.id}`,
      icon: "mail",
      tone: "text-faint",
      text: `${nameOf(row)} has been waiting ${String(waiting)} days and runs out on ${dayOf(
        row.invite.expiresAt,
      )}.`,
    });
  }

  // Levelling is measured over every seated character — the shared row's
  // level, which is the same number every other table seating them reads.
  const levelled = party
    .map((row) => row.character)
    .filter(
      (character): character is Character & { readonly level: number } =>
        character !== null && character.level !== null,
    );
  const median = medianLevel(levelled.map((character) => character.level));
  if (median !== undefined) {
    for (const character of levelled) {
      if (character.level >= median) continue;
      nudges.push({
        key: `behind:${character.id}`,
        icon: "arrow-big-up-dash",
        tone: "text-accent-ink",
        text: `${character.name} is level ${String(character.level)} and the party is mostly level ${String(median)}.`,
      });
    }
  }

  return nudges;
};
