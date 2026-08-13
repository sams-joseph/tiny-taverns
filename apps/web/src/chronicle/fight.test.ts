import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { PlayerRecapFight, RecapFight } from "@taverns/api";
import { fightStory, playerStanding, standing } from "./fight";
import { recap11, recap12 } from "./chronicle.fixtures";
import { playerRecap11, playerRecap12 } from "./player.fixtures";

/**
 * The one thing on this screen that is wrong in a way nobody notices.
 *
 * A carried fight is two runs, and each end carries the *other* run's round.
 * Those two numbers mean different things (`fight.ts`, `Recap.ts`) and both are
 * `Int`s on the same shape, so swapping them typechecks, renders, and reads
 * plausibly. The fixture makes them differ — paused at 4, since reached 7 — which
 * is the only reason these assertions say anything at all.
 *
 * Decoded through the real schema rather than hand-built, so a rename upstream
 * fails here rather than being asserted over an object literal nobody checks.
 */
const decode = Schema.decodeUnknownSync(RecapFight);
const paused = decode(recap11.fights[0]);
const resumed = decode(recap12.fights[0]);

describe("a fight that paused when the night ended", () => {
  it("reports the round it paused on — its own, not the successor's", () => {
    const story = fightStory(paused);
    expect(paused.run.round).toBe(4);
    expect(story.state).toBe("Paused at round 4 when the night ended.");
    // The successor is at round 7. Reporting that as the pause is the bug.
    expect(story.state).not.toContain("7");
  });

  it("says where the fight has got to since, without claiming that is where it paused", () => {
    const story = fightStory(paused);
    expect(story.carriedInto).toBe("Session 12 picked it up, and it has reached round 7 there.");
    expect(story.resumedFrom).toBeNull();
  });
});

describe("the fight, picked up on the next night", () => {
  it("resumes from the predecessor's frozen round, not from its own", () => {
    const story = fightStory(resumed);
    expect(resumed.run.round).toBe(7);
    expect(story.resumedFrom).toBe("Resumed from round 4 of session 11.");
    // Its own round is 7. "Resumed from round 7" would be the mirror-image bug.
    expect(story.resumedFrom).not.toContain("7");
  });

  it("is still on the table, and says so from endedAt rather than from a guess", () => {
    const story = fightStory(resumed);
    expect(story.live).toBe(true);
    expect(story.state).toBe("On the table now, at round 7.");
    expect(story.carriedInto).toBeNull();
  });
});

describe("a fight the DM finished", () => {
  it("reads as resolved, from endedReason and never from endedAt", () => {
    const finished = decode({
      ...recap11.fights[0],
      run: { ...recap11.fights[0]!.run, endedReason: "resolved", round: 5 },
      continuedInto: null,
    });
    expect(fightStory(finished).state).toBe("Fought to a finish, in round 5.");
  });
});

describe("who was standing", () => {
  it("counts a combatant at zero as down, and counts nobody as removed", () => {
    expect(standing(paused)).toEqual({ total: 1, down: 0 });
    const dropped = decode({
      ...recap11.fights[0],
      combatants: [{ ...recap11.fights[0]!.combatants[0], hpCurrent: 0 }],
    });
    expect(standing(dropped)).toEqual({ total: 1, down: 1 });
  });
});

/**
 * The same fight, through the narrow projection.
 *
 * `PlayerRecapFight` carries the same `run` and the same two links — that is
 * `PlayerRecap.ts`'s own decision — so it goes through the *same* `fightStory`,
 * and these assertions are what say so rather than merely hoping. A second copy
 * narrowed for the player would be a second chance to swap the two rounds, and
 * the swap is invisible in every way but this one.
 */
const decodePlayer = Schema.decodeUnknownSync(PlayerRecapFight);
const playerPaused = decodePlayer(playerRecap11.fights[0]);
const playerResumed = decodePlayer(playerRecap12.fights[0]);

describe("a carried fight, as a player is told it", () => {
  it("tells both ends exactly as the DM's Chronicle does", () => {
    expect(fightStory(playerPaused)).toEqual(fightStory(paused));
    expect(fightStory(playerResumed)).toEqual(fightStory(resumed));
  });

  it("still names the pause from its own round and the pickup from the link's", () => {
    expect(fightStory(playerPaused).state).toBe("Paused at round 4 when the night ended.");
    expect(fightStory(playerPaused).state).not.toContain("7");
    expect(fightStory(playerResumed).resumedFrom).toBe("Resumed from round 4 of session 11.");
    expect(fightStory(playerResumed).resumedFrom).not.toContain("7");
  });
});

describe("who was standing, counted from a band", () => {
  it("reads a monster's `down` and a character's zero, and nothing else", () => {
    // Brannoc at 6/52, a bloodied hag, and a stalker the night finished.
    expect(playerStanding(playerPaused)).toEqual({ total: 3, down: 1 });
    expect(playerStanding(playerResumed)).toEqual({ total: 0, down: 0 });

    const wiped = decodePlayer({
      ...playerRecap11.fights[0],
      combatants: playerRecap11.fights[0]!.combatants.map((combatant) =>
        combatant.kind === "pc" ? { ...combatant, hpCurrent: 0 } : { ...combatant, hpBand: "down" },
      ),
    });
    expect(playerStanding(wiped)).toEqual({ total: 3, down: 3 });
  });
});
