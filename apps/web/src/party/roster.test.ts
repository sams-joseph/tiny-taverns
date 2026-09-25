import { CampaignInvite, CampaignMember, PartySeat } from "@taverns/api";
import { DateTime, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  brannocSeat,
  dmMember,
  ilse,
  kofi,
  liveInvite,
  sorrelSeat,
  takenInvite,
} from "./party.fixtures";
import { nameOf, notPlayingYet, rosterOf, type RosterRow } from "./roster";

/**
 * The derivation, on its own — no rendering, and the clock as an argument.
 *
 * Everything the party screen claims about who is at the table is computed here
 * from three lists. Since the continuity decision of 2026-09-01 the middle list
 * is the **seats** — `campaign_character`, a campaign's join to shared
 * account-owned characters — so what is pinned is: `playing` is a member a live
 * seat names, `no-character` is a member no seat names, an *open* seat is still
 * not a thing, and a spent invitation is a member rather than a second row
 * about the same person.
 */

const member = Schema.decodeUnknownSync(CampaignMember);
const invite = Schema.decodeUnknownSync(CampaignInvite);
const seat = Schema.decodeUnknownSync(PartySeat);

const dm = member(dmMember);
const withCharacter = member(ilse);
const withNone = member(kofi);
const brannoc = seat(brannocSeat);
const sorrel = seat(sorrelSeat);
const waiting = invite(liveInvite);
const spent = invite(takenInvite);

/** The raw fixture shape, structurally — the three seat fixtures differ in
 * literal types (levels, nulled fields), so `typeof brannocSeat` would refuse
 * the other two while meaning the same wire shape. */
interface RawSeat {
  readonly seat: Record<string, unknown> & {
    readonly id: string;
    readonly accountId: string;
    readonly displayName: string;
  };
  readonly character:
    | (Record<string, unknown> & {
        readonly accountId: string;
        readonly level: number | null;
        readonly name: string;
      })
    | null;
}

/** The same seat, re-owned and re-levelled — for the derivations that count. */
const seatWith = (
  base: RawSeat,
  changes: {
    readonly seatId?: string;
    readonly accountId?: string;
    readonly level?: number | null;
    readonly name?: string;
    readonly character?: null;
  },
): PartySeat =>
  seat({
    seat: {
      ...base.seat,
      id: changes.seatId ?? base.seat.id,
      accountId: changes.accountId ?? base.seat.accountId,
      displayName: changes.name ?? base.seat.displayName,
    },
    character:
      changes.character === null
        ? null
        : base.character === null
          ? null
          : {
              ...base.character,
              accountId: changes.accountId ?? base.character.accountId,
              level: changes.level === undefined ? base.character.level : changes.level,
              name: changes.name ?? base.character.name,
            },
  });

const at = (iso: string): DateTime.Utc =>
  Schema.decodeUnknownSync(Schema.DateTimeUtcFromString)(iso);

describe("the roster", () => {
  it("derives the three statuses that exist, and no fourth", () => {
    const rows = rosterOf([dm, withCharacter, withNone], [brannoc, sorrel], [waiting, spent]);

    expect(rows.map((row) => row.kind)).toEqual(["dm", "playing", "no-character", "invited"]);
    // `open` is still not a kind: the seat exists as a row now, but its
    // deferred key requires a live member, so a chair with nobody in it is
    // as unrepresentable as it was when there was no seat table at all.
    expect(rows.some((row) => (row.kind as string) === "open")).toBe(false);
  });

  it("counts a spent invitation once, as the member it granted", () => {
    // Ilse is in the roster because she is a member, not because an invitation
    // names her. Listing the redeemed one too would draw the same person twice.
    const rows = rosterOf([dm, withCharacter], [brannoc], [spent]);
    expect(rows).toHaveLength(2);
    expect(rows.map(nameOf)).toEqual(["Wren Alderby", "Ilse Vantar"]);
  });

  it("leaves a withdrawn or expired invitation out of the roster entirely", () => {
    const dead = [
      invite({ ...liveInvite, status: "revoked" }),
      invite({ ...liveInvite, id: takenInvite.id, status: "expired" }),
    ];
    expect(rosterOf([dm], [], dead)).toHaveLength(1);
  });

  it("keeps every seat a member holds, not just the first", () => {
    // Two seats naming one account: one person running a pair is expressible,
    // and showing only the first would be this screen quietly disagreeing with
    // the party list one screen over.
    const second = seatWith(sorrelSeat, {
      seatId: "2b1f2a1e-0000-4000-8000-00000000095e",
      accountId: brannocSeat.seat.accountId,
    });
    const rows = rosterOf([withCharacter], [brannoc, second], []);
    const row = rows[0] as Extract<RosterRow, { kind: "playing" }>;
    expect(row.seats.map((entry) => entry.character?.name)).toEqual(["Brannoc", "Sorrel Ash"]);
  });

  it("counts a member whose seat lost its character as playing, by the seat", () => {
    // A live seat whose character has been deleted still seats the person —
    // the display snapshot is the campaign's history of who sat here.
    const emptied = seatWith(brannocSeat, { character: null });
    const rows = rosterOf([withCharacter], [emptied], []);
    expect(rows[0]?.kind).toBe("playing");
  });
});

describe("not playing yet", () => {
  const now = at("2026-08-13T12:00:00.000Z");

  it("lists a member with no character and a live invitation, and nobody who is playing", () => {
    const rows = rosterOf([dm, withCharacter, withNone], [brannoc], [waiting, spent]);
    const people = notPlayingYet(rows, now);
    expect(people.map((person) => [person.kind, person.name])).toEqual([
      ["no-character", "Kofi Adeyemi"],
      ["invited", "Hal"],
    ]);
    expect(people[0]?.detail).toBe("Joined the table, and has no character yet.");
  });

  it("says how long an invitation has waited only once it is three days old", () => {
    const fresh = rosterOf(
      [dm],
      [],
      [invite({ ...liveInvite, createdAt: "2026-08-11T12:00:00.000Z" })],
    );
    expect(notPlayingYet(fresh, now).map((person) => person.detail)).toEqual([
      "Invited, and it runs out on 14 January 2099.",
    ]);

    const stale = rosterOf(
      [dm],
      [],
      [invite({ ...liveInvite, createdAt: "2026-08-07T12:00:00.000Z" })],
    );
    expect(notPlayingYet(stale, now).map((person) => person.detail)).toEqual([
      "Invited 6 days ago, and it runs out on 14 January 2099.",
    ]);
  });

  it("is empty for a table where everyone has a character and nothing is outstanding", () => {
    // Levels 1 and 5: out-levelled is about somebody who is playing, and the
    // card says its level, so it is no line here.
    const party = [seatWith(sorrelSeat, { level: 1 }), seatWith(brannocSeat, { level: 5 })];
    expect(notPlayingYet(rosterOf([dm, withCharacter], party, [spent]), now)).toEqual([]);
  });
});
