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

/**
 * A scene that was not a fight, told by its kind.
 *
 * The DM's recap carries the scene and its log, and the story is counted from
 * them; the player's carries neither, and the same `fightStory` says only the
 * kind and that it ended. Built from the fight above with the mode swapped, so
 * the round (4) is there to be wrongly reported.
 */
const ended = { ...recap11.fights[0]!.run, endedReason: "resolved", round: 4 };
const check = (n: number, outcome: "success" | "failure", extra: Record<string, unknown> = {}) => ({
  id: `2b1f2a1e-0000-4000-8000-00000000c0${String(n).padStart(2, "0")}`,
  runId: ended.id,
  combatantId: null,
  displayName: "Brannoc",
  skill: "Athletics",
  save: null,
  total: outcome === "success" ? 15 : 8,
  dc: 13,
  outcome,
  stage: null,
  createdAt: "2026-07-19T22:00:00.000Z",
  ...extra,
});
const scene = (mode: string, sceneState: Record<string, unknown> | null, checks: unknown[] = []) =>
  decode({
    ...recap11.fights[0],
    run: { ...ended, mode },
    continuedInto: null,
    checks,
    scene: sceneState,
  });
const challenge = {
  kind: "challenge",
  dc: 13,
  successes: 2,
  failures: 2,
  skills: ["Athletics"],
  onSuccess: "They find the buried cache.",
  onFailure: "The rope snaps.",
};
const quiet = { challenge: null, attitude: null, stage: null, stages: null };

describe("a skill challenge, as the DM's Chronicle tells it", () => {
  it("says they made it, with the prep's line for it, and counts the log against its numbers", () => {
    const story = fightStory(
      scene("challenge", { ...quiet, challenge }, [check(1, "success"), check(2, "success")]),
    );
    expect(story.kind).toBe("Skill challenge");
    expect(story.state).toBe("They made it.");
    expect(story.outcome).toBe("They find the buried cache.");
    expect(story.tally).toBe("2 of 2 successes and 0 of 2 failures, at DC 13.");
    expect(story.state).not.toContain("round");
  });

  it("says it went wrong with the other line, and nothing borrowed when none was written", () => {
    const lost = [check(1, "failure"), check(2, "failure")];
    expect(fightStory(scene("challenge", { ...quiet, challenge }, lost))).toMatchObject({
      state: "It went wrong.",
      outcome: "The rope snaps.",
    });
    const { onSuccess: _s, onFailure: _f, ...unwritten } = challenge;
    expect(fightStory(scene("challenge", { ...quiet, challenge: unwritten }, lost))).toMatchObject({
      state: "It went wrong.",
      outcome: null,
    });
  });

  it("does not claim an ending the log never reached", () => {
    expect(
      fightStory(scene("challenge", { ...quiet, challenge }, [check(1, "success")])).state,
    ).toBe("Ended before it was settled.");
  });
});

describe("a hazard, as the DM's Chronicle tells it", () => {
  const hazard = {
    kind: "hazard",
    save: { ability: "CON", dc: 13 },
    skills: [],
  };
  const saves = [
    check(1, "success", { skill: null, save: "CON", stage: 1 }),
    check(2, "failure", { skill: null, save: "CON", stage: 2 }),
  ];

  it("counts the stages it lasted and the saves made in it", () => {
    const story = fightStory(
      scene("hazard", { ...quiet, challenge: hazard, stage: 2, stages: 2 }, saves),
    );
    expect(story.kind).toBe("Hazard");
    expect(story.state).toBe("Lasted 2 stages.");
    expect(story.tally).toBe("CON save DC 13. 2 saves: 1 passed, 1 failed.");
  });

  it("says where it stopped when the DM ended it early, and when it never began", () => {
    expect(
      fightStory(scene("hazard", { ...quiet, challenge: hazard, stage: 2, stages: 4 }, saves))
        .state,
    ).toBe("Ended at stage 2 of 4.");
    expect(fightStory(scene("hazard", { ...quiet, challenge: hazard })).state).toBe(
      "Ended before it began.",
    );
  });

  it("tells a hazard paused by the night's end by its stage, not a round", () => {
    const paused_ = decode({
      ...recap11.fights[0],
      run: { ...recap11.fights[0]!.run, mode: "hazard" },
      checks: [],
      scene: { ...quiet, challenge: hazard, stage: 3, stages: 4 },
    });
    const story = fightStory(paused_);
    expect(story.state).toBe("Paused at stage 3 of 4 when the night ended.");
    expect(story.carriedInto).toBe("Session 12 picked it up.");
  });
});

describe("a conversation, as the DM's Chronicle tells it", () => {
  it("counts its checks and the attitude last noted", () => {
    const story = fightStory(
      scene("social", { ...quiet, attitude: "friendly" }, [
        check(1, "success", { skill: "Persuasion" }),
        check(2, "failure", { skill: "Deception" }),
      ]),
    );
    expect(story.kind).toBe("Social");
    expect(story.state).toBe("Talked through to its end.");
    expect(story.tally).toBe("2 checks: 1 succeeded, 1 failed. Last noted as friendly.");
  });
});

describe("a scene, as a player is told it", () => {
  it("says its kind and that it ended, and nothing it was counted by", () => {
    const told = decodePlayer({
      ...playerRecap11.fights[0],
      run: {
        ...playerRecap11.fights[0]!.run,
        mode: "challenge",
        endedReason: "resolved",
        encounterName: "A skill challenge",
      },
      combatants: [],
      continuedInto: null,
    });
    const story = fightStory(told);
    expect(story).toMatchObject({
      name: "A skill challenge",
      kind: "Skill challenge",
      state: "Played to its end.",
      outcome: null,
      tally: null,
    });
  });
});
