import { CampaignCharacterId, PartySeat } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { character, characterSeat } from "../campaign/campaign.fixtures";
import { spotlightTally } from "./spotlight";

/**
 * The Spotlight aside's counts and its one sentence. The words are fixed, so
 * they are pinned whole: one name, two, three, and the ties that say nothing.
 */

const seatId = Schema.decodeSync(CampaignCharacterId);
const ids = {
  brannoc: seatId("2b1f2a1e-0000-4000-8000-000000000961"),
  wren: seatId("2b1f2a1e-0000-4000-8000-000000000962"),
  tamsin: seatId("2b1f2a1e-0000-4000-8000-000000000963"),
  odo: seatId("2b1f2a1e-0000-4000-8000-000000000964"),
  retired: seatId("2b1f2a1e-0000-4000-8000-000000000965"),
};

/** A seat whose character has gone, so the seat's own name is the one said. */
const seat = (id: CampaignCharacterId, displayName: string): PartySeat =>
  Schema.decodeUnknownSync(PartySeat)({
    seat: { ...characterSeat, id, displayName },
    character: null,
    levelUps: [],
  });

const party = [
  seat(ids.brannoc, "Brannoc"),
  seat(ids.wren, "Wren"),
  seat(ids.tamsin, "Tamsin"),
  seat(ids.odo, "Odo"),
];

/** Nights by whose they were; `null` for a night with no spotlight. */
const nights = (...spots: ReadonlyArray<CampaignCharacterId | null>) =>
  spots.map((spotlightSeatId) => ({ spotlightSeatId }));

describe("the counts", () => {
  it("counts each seat's nights, in the roster's order, with bars against the most", () => {
    const tally = spotlightTally(
      party,
      nights(ids.wren, ids.brannoc, ids.wren, null, ids.tamsin, ids.wren, ids.brannoc),
    );

    expect(tally.rows.map((row) => [row.name, row.count, row.share])).toEqual([
      ["Brannoc", 2, 2 / 3],
      ["Wren", 3, 1],
      ["Tamsin", 1, 1 / 3],
      ["Odo", 0, 0],
    ]);
    expect(tally.any).toBe(true);
  });

  it("counts nobody for a night whose seat has left the table", () => {
    const tally = spotlightTally(party, nights(ids.retired, ids.retired, ids.odo));

    expect(tally.rows.map((row) => row.name)).toEqual(["Brannoc", "Wren", "Tamsin", "Odo"]);
    expect(tally.rows.map((row) => row.count)).toEqual([0, 0, 0, 1]);
  });

  it("has nothing to say when no night names anybody at the table", () => {
    const tally = spotlightTally(party, nights(null, ids.retired, null));

    expect(tally.any).toBe(false);
    expect(tally.rows.every((row) => row.share === 0 && !row.fewest)).toBe(true);
    expect(tally.hint).toBeUndefined();
  });

  it("names a seat by its character, and by the seat's own name once that is gone", () => {
    const kept = Schema.decodeUnknownSync(PartySeat)({
      seat: { ...characterSeat, id: ids.brannoc, displayName: "Bran" },
      character,
      levelUps: [],
    });
    const tally = spotlightTally([kept, seat(ids.odo, "Odo")], nights(ids.brannoc));

    expect(tally.rows.map((row) => row.name)).toEqual(["Brannoc", "Odo"]);
  });
});

describe("the fewest", () => {
  it("marks and names the one seat behind", () => {
    const tally = spotlightTally(party, nights(ids.brannoc, ids.wren, ids.tamsin));

    expect(tally.rows.filter((row) => row.fewest).map((row) => row.name)).toEqual(["Odo"]);
    expect(tally.hint).toBe(
      "Odo has had the fewest sessions in the spotlight. Worth giving them a beat next time.",
    );
  });

  it("names two with one 'and'", () => {
    const tally = spotlightTally(party, nights(ids.brannoc, ids.wren));

    expect(tally.hint).toBe(
      "Tamsin and Odo have had the fewest sessions in the spotlight. Worth giving them a beat next time.",
    );
  });

  it("names three with commas and one 'and'", () => {
    const tally = spotlightTally(party, nights(ids.wren, ids.wren));

    expect(tally.rows.filter((row) => row.fewest).map((row) => row.name)).toEqual([
      "Brannoc",
      "Tamsin",
      "Odo",
    ]);
    expect(tally.hint).toBe(
      "Brannoc, Tamsin and Odo have had the fewest sessions in the spotlight. Worth giving them a beat next time.",
    );
  });

  it("marks nobody and says nothing when everyone is level", () => {
    const tally = spotlightTally(
      party,
      nights(
        ids.brannoc,
        ids.wren,
        ids.tamsin,
        ids.odo,
        ids.odo,
        ids.tamsin,
        ids.wren,
        ids.brannoc,
      ),
    );

    expect(tally.rows.every((row) => row.count === 2 && row.share === 1)).toBe(true);
    expect(tally.rows.some((row) => row.fewest)).toBe(false);
    expect(tally.hint).toBeUndefined();
  });

  it("says nothing of a table of one", () => {
    const tally = spotlightTally([seat(ids.odo, "Odo")], nights(ids.odo));

    expect(tally.rows).toEqual([
      { seatId: ids.odo, name: "Odo", count: 1, share: 1, fewest: false },
    ]);
    expect(tally.hint).toBeUndefined();
  });

  it("has no rows for a table with nobody seated", () => {
    expect(spotlightTally([], nights(ids.odo))).toEqual({
      rows: [],
      any: false,
      hint: undefined,
    });
  });
});
