import type { Character, PlayerLiveTable } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { brannoc, sorrel } from "./characters.fixtures";
import { liveBanner } from "./live";

/**
 * The banner's sentence, in every state it has.
 *
 * Separately tested for the reason `chronicle/fight.ts` is: **every branch here
 * renders plausible English**, so picking the wrong one produces a banner that
 * reads perfectly and says something false. A fixture is the only thing that
 * can tell *"it's your turn"* from *"Brannoc is up"* when both are true
 * sentences about the same row.
 */

const yours = brannoc as unknown as Character;
const elsewhere = sorrel as unknown as Character;

const mySeat = { characterId: brannoc.id, combatantId: "c-mine" };
const theirSeat = { characterId: sorrel.id, combatantId: "c-theirs" };

const table = (fight: PlayerLiveTable["fight"]): PlayerLiveTable =>
  ({
    campaignId: brannoc.campaignId,
    sessionId: "s-1",
    sessionNumber: 12,
    fight,
  }) as unknown as PlayerLiveTable;

describe("the live banner", () => {
  it("says nothing at all when nothing is running", () => {
    // The commonest state by a long way, and it covers **both** silences the
    // endpoint deliberately does not tell apart: nobody is playing, and the DM
    // has not shared tonight. The screen draws no card and no action for it.
    expect(liveBanner(null, yours, "The Salt Road")).toBeUndefined();
  });

  it("names the table and the night when the night is open with nothing on the table", () => {
    const banner = liveBanner(table(null), yours, "The Salt Road");

    expect(banner?.headline).toBe("The Salt Road is playing right now");
    // Not "no fight yet" — an evening may be entirely a tavern, and `Session`
    // stopped meaning "a fight is on the table" when the two acts were split.
    expect(banner?.detail).toBe("Session 12 · nothing on the table");
    expect(banner?.inTheFight).toBe(false);
    expect(banner?.yourTurn).toBe(false);
  });

  it("says it is your turn when the marker is on your own seat", () => {
    const banner = liveBanner(
      table({
        id: "r-1",
        round: 3,
        upNext: { combatantId: "c-mine", displayName: "Brannoc Duskharrow" },
        seats: [mySeat],
      } as unknown as PlayerLiveTable["fight"]),
      yours,
      "The Salt Road",
    );

    // *"it's your turn"* rather than the name, though the name would be true:
    // the comparison is between the seat and the marker, both of which are in
    // the answer, and nothing here claims ownership on its own.
    expect(banner?.detail).toBe("Session 12 · round 3 · it's your turn");
    expect(banner?.yourTurn).toBe(true);
    expect(banner?.inTheFight).toBe(true);
  });

  it("names whoever is up when it is not you, and still knows you are in the fight", () => {
    const banner = liveBanner(
      table({
        id: "r-1",
        round: 3,
        upNext: { combatantId: "c-hag", displayName: "Marsh Hag" },
        seats: [mySeat],
      } as unknown as PlayerLiveTable["fight"]),
      yours,
      "The Salt Road",
    );

    expect(banner?.detail).toBe("Session 12 · round 3 · Marsh Hag is up");
    expect(banner?.yourTurn).toBe(false);
    expect(banner?.inTheFight).toBe(true);
  });

  it("says so when the table is mid-fight and this character is not in it", () => {
    const banner = liveBanner(
      table({
        id: "r-1",
        round: 3,
        upNext: { combatantId: "c-theirs", displayName: "Sorrel Ash" },
        seats: [theirSeat],
      } as unknown as PlayerLiveTable["fight"]),
      yours,
      "The Salt Road",
    );

    // Said out loud rather than left to be inferred from an absent turn line: a
    // player looking at their own sheet has every reason to assume the fight on
    // it is theirs.
    expect(banner?.detail).toBe(
      "Session 12 · round 3 · Sorrel Ash is up · Brannoc Duskharrow is not in this fight",
    );
    expect(banner?.inTheFight).toBe(false);
    expect(banner?.yourTurn).toBe(false);
  });

  it("says the round and stops when the DM has set no marker, or hidden the row it names", () => {
    const banner = liveBanner(
      table({
        id: "r-1",
        round: 3,
        upNext: null,
        seats: [mySeat],
      } as unknown as PlayerLiveTable["fight"]),
      yours,
      "The Salt Road",
    );

    // The two are indistinguishable here on purpose — the server answers `null`
    // for both, because *"there is somebody up but you may not know who"* is the
    // disclosure the seam exists to refuse.
    expect(banner?.detail).toBe("Session 12 · round 3");
    expect(banner?.yourTurn).toBe(false);
  });

  it("falls back to a headline that is still true when the campaign has no name", () => {
    // `PlayerLiveTable` carries no campaign name by decision — `GET /me/campaigns`
    // is the read that names campaigns — so a membership that arrived between the
    // two reads leaves this undefined rather than wrong.
    expect(liveBanner(table(null), elsewhere, undefined)?.headline).toBe(
      "Your table is playing right now",
    );
  });
});
