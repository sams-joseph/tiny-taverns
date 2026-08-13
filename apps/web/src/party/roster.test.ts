import { CampaignInvite, CampaignMember, Character } from "@taverns/api";
import { DateTime, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  brannocOwned,
  dmMember,
  ilse,
  kofi,
  liveInvite,
  spareCharacter,
  takenInvite,
} from "./party.fixtures";
import { initialsOf, needsOf, nameOf, rosterOf, summaryOf, type RosterRow } from "./roster";

/**
 * The derivation, on its own — no rendering, and the clock as an argument.
 *
 * Everything the party screen claims about who is at the table is computed here
 * from three lists, so this is where the seat vocabulary's replacement is
 * pinned: the three statuses that derive, the fourth that does not exist, and
 * the fact that a spent invitation is a member rather than a second row about
 * the same person.
 */

const member = Schema.decodeUnknownSync(CampaignMember);
const invite = Schema.decodeUnknownSync(CampaignInvite);
const character = Schema.decodeUnknownSync(Character);

const dm = member(dmMember);
const withCharacter = member(ilse);
const withNone = member(kofi);
const brannoc = character(brannocOwned);
const sorrel = character(spareCharacter);
const waiting = invite(liveInvite);
const spent = invite(takenInvite);

const at = (iso: string): DateTime.Utc =>
  Schema.decodeUnknownSync(Schema.DateTimeUtcFromString)(iso);

describe("the roster", () => {
  it("derives the three statuses that exist, and no fourth", () => {
    const rows = rosterOf([dm, withCharacter, withNone], [brannoc, sorrel], [waiting, spent]);

    expect(rows.map((row) => row.kind)).toEqual(["dm", "playing", "no-character", "invited"]);
    // `open` is not a kind, because a membership cannot exist before an account
    // — there is no row a seat with nobody in it could be.
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

  it("keeps every character a member holds, not just the first", () => {
    const second = character({ ...spareCharacter, accountId: brannocOwned.accountId });
    const rows = rosterOf([withCharacter], [brannoc, second], []);
    const row = rows[0] as Extract<RosterRow, { kind: "playing" }>;
    expect(row.characters.map((entry) => entry.name)).toEqual(["Brannoc", "Sorrel Ash"]);
  });

  it("says what is true instead of counting seats", () => {
    expect(summaryOf(rosterOf([dm, withCharacter, withNone], [brannoc], [waiting]))).toBe(
      "2 players, 1 invitation outstanding",
    );
    expect(summaryOf(rosterOf([dm, withCharacter], [brannoc], []))).toBe("1 player");
    expect(summaryOf(rosterOf([dm], [], [waiting]))).toBe(
      "Nobody has joined yet, 1 invitation outstanding",
    );
    // Nothing to say: the empty state underneath is already saying it.
    expect(summaryOf(rosterOf([dm], [], []))).toBeUndefined();
  });

  it("cuts initials from a name, and copes with the default one", () => {
    expect(initialsOf("Ilse Vantar")).toBe("IV");
    expect(initialsOf("Someone")).toBe("S");
    expect(initialsOf("  ")).toBe("—");
  });
});

describe("needs you", () => {
  const now = at("2026-08-13T12:00:00.000Z");

  it("names a member who has joined and has no character", () => {
    const rows = rosterOf([dm, withNone], [], []);
    expect(needsOf(rows, [], now).map((nudge) => nudge.text)).toEqual([
      "Kofi Adeyemi has joined the table and has no character yet.",
    ]);
  });

  it("waits three days before an outstanding invitation is worth a line", () => {
    const fresh = rosterOf(
      [dm],
      [],
      [invite({ ...liveInvite, createdAt: "2026-08-11T12:00:00.000Z" })],
    );
    expect(needsOf(fresh, [], now)).toEqual([]);

    const stale = rosterOf(
      [dm],
      [],
      [invite({ ...liveInvite, createdAt: "2026-08-07T12:00:00.000Z" })],
    );
    expect(needsOf(stale, [], now).map((nudge) => nudge.text)).toEqual([
      "Hal has been waiting 6 days and runs out on 14 January 2099.",
    ]);
  });

  it("names a character the party has left behind, against the middle level", () => {
    const party = [
      character({ ...spareCharacter, id: spareCharacter.id, level: 1, name: "Sorrel Ash" }),
      character({ ...brannocOwned, level: 5 }),
      character({ ...brannocOwned, id: takenInvite.id, level: 5, name: "Wren" }),
    ];
    expect(needsOf(rosterOf([dm], party, []), party, now).map((nudge) => nudge.text)).toEqual([
      "Sorrel Ash is level 1 and the party is mostly level 5.",
    ]);
  });

  it("says nothing about levels when there is only one character to say it about", () => {
    const party = [character({ ...spareCharacter, level: 1 })];
    expect(needsOf(rosterOf([dm], party, []), party, now)).toEqual([]);
  });

  it("has nothing to say about a table that is up to date", () => {
    const rows = rosterOf([dm, withCharacter], [brannoc], []);
    expect(needsOf(rows, [brannoc], now)).toEqual([]);
  });
});
