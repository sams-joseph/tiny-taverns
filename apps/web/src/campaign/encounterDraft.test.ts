import {
  type CreatureId,
  type EncounterCreatureId,
  type EncounterId,
  ENCOUNTER_SKILLS_MAX,
  type NoteId,
} from "@taverns/api";
import { DateTime } from "effect";
import { describe, expect, it } from "vitest";
import { STANDARD_SKILLS } from "../characters/skills";
import { encounter as fixtureEncounter } from "./campaign.fixtures";
import {
  addCreature,
  challengeOf,
  crRange,
  createPayload,
  draftDifficulty,
  draftFrom,
  type EncounterDraft,
  lineFor,
  NEW_ENCOUNTER,
  readAloudOf,
  readAloudWrite,
  rosterDiff,
  type RosterLine,
  type SavedEncounter,
  type SavedLine,
  skillChips,
  stepCount,
  tacticsOf,
  toggleSkill,
  updatePayload,
  validate,
} from "./encounterDraft";

/**
 * The encounter form's pure half. The failures it exists to catch are the
 * quiet ones: a hazard that saves a skill challenge's DC as its own, a kind
 * switch that deletes a roster, a new encounter that sends numbers nobody
 * typed, and a meter that says one band while the saved row says another.
 */

const encounterId = "0a000000-0000-4000-8000-000000000001" as EncounterId;
const goblinId = "0c000000-0000-4000-8000-000000000001" as CreatureId;
const bossId = "0c000000-0000-4000-8000-000000000002" as CreatureId;
const hagId = "0c000000-0000-4000-8000-000000000003" as CreatureId;
const bossRowId = "0e000000-0000-4000-8000-000000000001" as EncounterCreatureId;
const goblinRowId = "0e000000-0000-4000-8000-000000000002" as EncounterCreatureId;
const noteId = "0d000000-0000-4000-8000-000000000001" as NoteId;

const bossRow: SavedLine = {
  id: bossRowId,
  creatureId: bossId,
  name: "Goblin Boss",
  count: 6,
  cr: "1",
  ac: 17,
  hp: 21,
  xp: 200,
};

const goblinRow: SavedLine = {
  id: goblinRowId,
  creatureId: goblinId,
  name: "Goblin",
  count: 2,
  cr: "1/4",
  ac: 15,
  hp: 7,
  xp: 50,
};

const line = (creatureId: CreatureId, count: number, xp: number | null = 50): RosterLine => ({
  creatureId,
  name: "Someone",
  cr: "1/4",
  ac: 12,
  hp: 7,
  xp,
  count,
});

const savedAmbush: SavedEncounter = {
  encounter: {
    id: encounterId,
    name: "Ambush in the reeds",
    kind: "combat",
    tags: ["Marsh", "Night"],
    visibility: "dm",
  },
  prep: {
    ready: true,
    tactics: ["Archers open from the reeds.", "The boss hangs back."],
    treasure: "28 sp",
    challenge: null,
  },
  roster: [bossRow, goblinRow],
  setting: "A boardwalk over black water",
  readAloud: undefined,
};

const blank = (patch: Partial<EncounterDraft> = {}): EncounterDraft => ({
  ...draftFrom(NEW_ENCOUNTER),
  name: "The dry well",
  ...patch,
});

describe("a draft from what is stored", () => {
  it("opens a new encounter as a fight with nothing guessed", () => {
    const draft = draftFrom(NEW_ENCOUNTER);
    expect(draft).toMatchObject({
      name: "",
      kind: "combat",
      ready: false,
      setting: "",
      readAloud: "",
      tags: "",
      visibility: "dm",
      tactics: "",
      treasure: "",
      roster: [],
    });
    // Blank boxes, not the drawing's 14 / 3 / 2.
    expect(draft.skillChallenge).toMatchObject({ dc: "", successes: "", failures: "", skills: [] });
    expect(draft.hazard).toMatchObject({
      ability: "",
      dc: "",
      onFail: "",
      duration: "",
      skills: [],
    });
  });

  it("reads every store into one draft", () => {
    const draft = draftFrom({
      ...savedAmbush,
      readAloud: { id: noteId, body: "The reeds close in." },
    });
    expect(draft).toMatchObject({
      name: "Ambush in the reeds",
      tags: "Marsh, Night",
      setting: "A boardwalk over black water",
      readAloud: "The reeds close in.",
      tactics: "Archers open from the reeds.\nThe boss hangs back.",
      treasure: "28 sp",
    });
    expect(draft.roster.map((l) => [l.name, l.count, l.xp])).toEqual([
      ["Goblin Boss", 6, 200],
      ["Goblin", 2, 50],
    ]);
  });

  it("round-trips the stored tactics through the textarea", () => {
    const draft = draftFrom(savedAmbush);
    expect(updatePayload(draft, savedAmbush).tactics).toEqual(savedAmbush.prep.tactics);
  });

  it("files a stored challenge under its own kind only", () => {
    const draft = draftFrom({
      ...savedAmbush,
      prep: {
        ...savedAmbush.prep,
        challenge: { kind: "challenge", dc: 14, successes: 3, failures: 2, skills: ["Athletics"] },
      },
    });
    expect(draft.skillChallenge).toMatchObject({ dc: "14", successes: "3", failures: "2" });
    expect(draft.hazard).toMatchObject({ ability: "", dc: "", skills: [] });
  });
});

describe("the challenge", () => {
  it("sends null for every box blank", () => {
    expect(challengeOf(blank({ kind: "challenge" }))).toEqual({ challenge: null });
    expect(challengeOf(blank({ kind: "hazard" }))).toEqual({ challenge: null });
  });

  it("asks for the numbers once a skill is chosen", () => {
    const draft = blank({
      kind: "challenge",
      skillChallenge: { ...blank().skillChallenge, skills: ["Athletics"] },
    });
    expect(challengeOf(draft).problem).toBe("Give the DC, the successes and the failures too.");
  });

  /** The drawing's defect D3: one array under both kinds. */
  it("never lets a skill challenge's numbers become a hazard's", () => {
    const typed = blank({
      kind: "challenge",
      skillChallenge: { ...blank().skillChallenge, dc: "14", successes: "3", failures: "2" },
    });
    expect(challengeOf(typed).challenge).toMatchObject({ kind: "challenge", dc: 14 });

    const switched = { ...typed, kind: "hazard" as const };
    expect(challengeOf(switched)).toEqual({ challenge: null });
    expect(createPayload(switched)).not.toHaveProperty("challenge");

    // And back again finds what was typed.
    expect(challengeOf({ ...switched, kind: "challenge" }).challenge).toMatchObject({
      dc: 14,
      successes: 3,
      failures: 2,
    });
  });

  it("sends what the runner says at the end, trimmed, and leaves a blank one out", () => {
    const typed = blank({
      kind: "challenge",
      skillChallenge: {
        ...blank().skillChallenge,
        dc: "14",
        successes: "3",
        failures: "2",
        onSuccess: "  They find the buried cache  ",
        onFailure: "   ",
      },
    });
    const challenge = challengeOf(typed).challenge;
    expect(challenge).toMatchObject({ onSuccess: "They find the buried cache" });
    expect(challenge).not.toHaveProperty("onFailure");

    // An outcome line with no numbers is a challenge being set out.
    const unnumbered = blank({
      kind: "challenge",
      skillChallenge: { ...blank().skillChallenge, onFailure: "The well is lost" },
    });
    expect(challengeOf(unnumbered).problem).toBe(
      "Give the DC, the successes and the failures too.",
    );
  });

  it("opens a stored challenge's outcome lines for editing", () => {
    const draft = draftFrom({
      ...savedAmbush,
      prep: {
        ...savedAmbush.prep,
        challenge: {
          kind: "challenge",
          dc: 14,
          successes: 3,
          failures: 2,
          skills: [],
          onSuccess: "They find the buried cache",
        },
      },
    });
    expect(draft.skillChallenge).toMatchObject({
      onSuccess: "They find the buried cache",
      onFailure: "",
    });
  });

  it("keeps a hazard's save out of a skill challenge", () => {
    const hazard = blank({
      kind: "hazard",
      hazard: { ...blank().hazard, ability: "CON", dc: "13", onFail: "1 level of exhaustion" },
    });
    expect(challengeOf(hazard).challenge).toEqual({
      kind: "hazard",
      save: { ability: "CON", dc: 13 },
      onFail: "1 level of exhaustion",
      skills: [],
    });
    expect(challengeOf({ ...hazard, kind: "challenge" })).toEqual({ challenge: null });
  });

  it("refuses a hazard with no save", () => {
    const draft = blank({ kind: "hazard", hazard: { ...blank().hazard, duration: "1d4 hours" } });
    expect(challengeOf(draft).problem).toMatch(/needs the save it forces/);
  });
});

describe("a kind switch", () => {
  it("keeps the roster and sends no challenge", () => {
    const draft = {
      ...draftFrom({
        ...savedAmbush,
        prep: {
          ...savedAmbush.prep,
          challenge: { kind: "challenge", dc: 14, successes: 3, failures: 2, skills: [] },
        },
      }),
      kind: "social" as const,
    };
    expect(updatePayload(draft, savedAmbush)).toMatchObject({ kind: "social", challenge: null });
    expect(rosterDiff(savedAmbush.roster, draft.roster)).toEqual({
      remove: [],
      create: [],
      update: [],
    });
  });

  it("keeps the roster of a fight saved as a hazard", () => {
    const draft = { ...draftFrom(savedAmbush), kind: "hazard" as const };
    expect(rosterDiff(savedAmbush.roster, draft.roster).remove).toEqual([]);
  });
});

describe("tactics", () => {
  it("splits the textarea on newlines, trims, and drops blanks", () => {
    expect(tacticsOf("  Archers first \n\n   \nThen the boss\r\n")).toEqual([
      "Archers first",
      "Then the boss",
    ]);
  });

  it("refuses a thirteenth line and a line past 300 characters", () => {
    const thirteen = Array.from({ length: 13 }, (_, i) => `Beat ${i}`).join("\n");
    expect(validate(blank({ tactics: thirteen })).tactics).toBe(
      "Twelve lines is the most the tactics hold. That is 13.",
    );
    expect(validate(blank({ tactics: "x".repeat(301) })).tactics).toBe(
      "Keep each line to 300 characters.",
    );
    expect(validate(blank({ tactics: "x".repeat(300) })).tactics).toBeUndefined();
  });
});

describe("skill chips", () => {
  it("offers the standard eighteen and keeps a stored skill outside them", () => {
    const draft = draftFrom({
      ...NEW_ENCOUNTER,
      prep: {
        ...NEW_ENCOUNTER.prep,
        challenge: {
          kind: "hazard",
          save: { ability: "DEX", dc: 12 },
          skills: ["Thieves' tools", "Athletics"],
        },
      },
    });
    const chips = skillChips(draft.hazard);
    expect(chips).toHaveLength(STANDARD_SKILLS.length + 1);
    expect(chips.at(-1)).toEqual({ name: "Thieves' tools", pressed: true, disabled: false });
    expect(chips.find((chip) => chip.name === "Athletics")?.pressed).toBe(true);

    // Released, it is still offered, so it can be pressed again.
    const released = {
      ...draft.hazard,
      skills: toggleSkill(draft.hazard.skills, "Thieves' tools"),
    };
    expect(skillChips(released).at(-1)).toEqual({
      name: "Thieves' tools",
      pressed: false,
      disabled: false,
    });
  });

  it("caps the pressed chips at eight", () => {
    const eight = STANDARD_SKILLS.slice(0, ENCOUNTER_SKILLS_MAX).map(([name]) => name);
    expect(toggleSkill(eight, "Stealth")).toBe(eight);
    const chips = skillChips({ skills: eight, offered: STANDARD_SKILLS.map(([name]) => name) });
    expect(chips.find((chip) => chip.name === "Stealth")?.disabled).toBe(true);
    expect(chips.find((chip) => chip.name === eight[0])?.disabled).toBe(false);
    expect(toggleSkill(eight, eight[0]!)).toHaveLength(7);
  });
});

describe("the roster", () => {
  it("raises the count when a creature already on it is added again", () => {
    const creature = {
      id: goblinId,
      name: "Goblin",
      cr: "1/4",
      ac: 15,
      hp: 7,
      statBlock: {} as Parameters<typeof lineFor>[0]["statBlock"],
    };
    const once = addCreature([], lineFor(creature));
    expect(once).toEqual([
      { creatureId: goblinId, name: "Goblin", cr: "1/4", ac: 15, hp: 7, xp: 50, count: 1 },
    ]);
    expect(addCreature(once, lineFor(creature))).toMatchObject([{ count: 2 }]);
  });

  it("takes a stat block's own XP over the table's", () => {
    const statBlock = { xp: 0 } as Parameters<typeof lineFor>[0]["statBlock"];
    expect(lineFor({ id: goblinId, name: "Rat", cr: "0", ac: 10, hp: 1, statBlock }).xp).toBe(0);
  });

  it("removes a line stepped below one", () => {
    const roster = [line(goblinId, 1), line(bossId, 2)];
    expect(stepCount(roster, goblinId, -1).map((l) => l.creatureId)).toEqual([bossId]);
    expect(stepCount(roster, bossId, 1)).toMatchObject([{ count: 1 }, { count: 3 }]);
  });

  it("sends only what changed", () => {
    const roster = [{ ...draftFrom(savedAmbush).roster[0]!, count: 4 }, line(hagId, 1)];
    expect(rosterDiff(savedAmbush.roster, roster)).toEqual({
      remove: [goblinRowId],
      create: [{ creatureId: hagId, count: 1 }],
      update: [{ id: bossRowId, count: 4 }],
    });
  });

  it("matches a creature removed and added back to the row it was", () => {
    const withoutBoss = draftFrom(savedAmbush).roster.filter((l) => l.creatureId !== bossId);
    const back = addCreature(withoutBoss, { ...line(bossId, 1), name: "Goblin Boss" });
    expect(rosterDiff(savedAmbush.roster, back)).toEqual({
      remove: [],
      create: [],
      update: [{ id: bossRowId, count: 1 }],
    });
  });

  it("refuses a count out of range", () => {
    expect(validate(blank({ roster: [line(goblinId, 0)] })).roster).toBe(
      "A count runs from 1 to 999.",
    );
    expect(validate(blank({ roster: [line(goblinId, Number.NaN)] })).roster).toBe(
      "A count is a whole number of creatures.",
    );
  });
});

describe("the payloads", () => {
  it("creates with only what was written", () => {
    expect(createPayload(blank({ tags: "Desert, , Desert" }))).toEqual({
      name: "The dry well",
      kind: "combat",
      tags: ["Desert"],
      visibility: "dm",
      // A draft until the DM says otherwise, said out loud.
      ready: false,
    });
  });

  it("creates the roster with the encounter, one line per creature", () => {
    expect(
      createPayload(blank({ roster: [line(bossId, 1), line(goblinId, 4)] })).creatures,
    ).toEqual([
      { creatureId: bossId, count: 1 },
      { creatureId: goblinId, count: 4 },
    ]);
  });

  it("reads Ready from the prep and sends it back on both payloads", () => {
    const draft = draftFrom(savedAmbush);
    expect(draft.ready).toBe(true);
    expect(updatePayload({ ...draft, ready: false }, savedAmbush)).toMatchObject({ ready: false });
    expect(createPayload(blank({ ready: true }))).toMatchObject({ ready: true });
  });

  it("sends the setting line only when it changed, and null when emptied", () => {
    const draft = draftFrom(savedAmbush);
    expect(updatePayload(draft, savedAmbush)).not.toHaveProperty("setting");
    expect(updatePayload({ ...draft, setting: "  " }, savedAmbush)).toMatchObject({
      setting: null,
    });
    expect(updatePayload({ ...draft, treasure: "" }, savedAmbush)).toMatchObject({
      treasure: null,
    });
  });

  it("names a blank name before anything is sent", () => {
    expect(validate(blank({ name: "   " })).name).toBe("Give it a name.");
    expect(validate(blank())).toEqual({});
  });
});

describe("read aloud", () => {
  const at = (iso: string) => DateTime.makeUnsafe(iso);
  const otherId = "0d000000-0000-4000-8000-000000000002" as NoteId;

  it("edits the oldest read-aloud attached to the encounter", () => {
    const notes = [
      {
        id: otherId,
        body: "Second",
        kind: "read_aloud" as const,
        attachedTo: { kind: "encounter" as const, id: encounterId },
        createdAt: at("2026-09-02T00:00:00Z"),
      },
      {
        id: noteId,
        body: "First",
        kind: "read_aloud" as const,
        attachedTo: { kind: "encounter" as const, id: encounterId },
        createdAt: at("2026-09-01T00:00:00Z"),
      },
      {
        id: "0d000000-0000-4000-8000-000000000003" as NoteId,
        body: "A plain note",
        kind: "note" as const,
        attachedTo: { kind: "encounter" as const, id: encounterId },
        createdAt: at("2026-08-01T00:00:00Z"),
      },
    ];
    expect(readAloudOf(notes, encounterId)).toMatchObject({ id: noteId, body: "First" });
  });

  it("writes nothing for an empty box and no note", () => {
    expect(readAloudWrite(blank(), undefined, encounterId)).toEqual({ _tag: "none" });
  });

  it("creates a note titled with the encounter's name", () => {
    expect(
      readAloudWrite(blank({ readAloud: " The well is dry. " }), undefined, encounterId),
    ).toEqual({
      _tag: "create",
      payload: {
        title: "The dry well",
        body: "The well is dry.",
        kind: "read_aloud",
        attachedTo: { kind: "encounter", id: encounterId },
      },
    });
  });

  it("updates a changed body, and leaves an unchanged one alone", () => {
    const saved = { id: noteId, body: "The well is dry." };
    expect(readAloudWrite(blank({ readAloud: "The well is dry." }), saved, encounterId)).toEqual({
      _tag: "none",
    });
    expect(readAloudWrite(blank({ readAloud: "It hums." }), saved, encounterId)).toEqual({
      _tag: "update",
      noteId,
      body: "It hums.",
    });
  });

  it("detaches rather than deletes when the box is emptied", () => {
    expect(readAloudWrite(blank(), { id: noteId, body: "Gone" }, encounterId)).toEqual({
      _tag: "detach",
      noteId,
    });
  });
});

describe("the CR pills", () => {
  it("say the range to the creature search", () => {
    expect(crRange("any")).toEqual({});
    expect(crRange("low")).toEqual({ crMax: 1 });
    expect(crRange("mid")).toEqual({ crMin: 2, crMax: 4 });
    expect(crRange("high")).toEqual({ crMin: 5 });
  });
});

describe("the difficulty", () => {
  const fourAtFive = [5, 5, 5, 5];

  it("agrees with the server's band for the fixture party", () => {
    const rated = draftDifficulty(
      draftFrom({ ...savedAmbush, roster: [bossRow] }).roster,
      fourAtFive,
    );
    expect(rated.difficulty).toEqual(fixtureEncounter.difficulty);
  });

  it("says how much more tips it into the next band", () => {
    const rated = draftDifficulty([line(bossId, 6, 200)], fourAtFive);
    expect(rated.hint).toBe("600 more adjusted XP tips this into hard.");
    expect(rated.breakdown).toEqual(["1,200 base XP", "×2 for group size", "300 xp each"]);
  });

  it("says what past deadly means", () => {
    const rated = draftDifficulty([line(hagId, 4, 700)], fourAtFive);
    expect(rated.difficulty).toMatchObject({ band: "Deadly" });
    expect(rated.hint).toBe(
      "Past deadly. Someone likely drops. Give them a way out, or cut a creature.",
    );
  });

  it("names Easy as the next band from Trivial", () => {
    expect(draftDifficulty([line(goblinId, 1, 50)], fourAtFive).hint).toBe(
      "950 more adjusted XP tips this into easy.",
    );
  });

  it("is unrated with nobody levelled, with no tiers to draw and the reason in words", () => {
    const hint =
      "Nobody seated has a level, so there is nothing to rate this against. The band appears once a player sets one.";
    expect(draftDifficulty([line(goblinId, 2)], [null, null])).toEqual({
      difficulty: { _tag: "unrated", reason: "no-party" },
      hint,
    });
    expect(draftDifficulty([line(goblinId, 2)], [])).toEqual({
      difficulty: { _tag: "unrated", reason: "no-party" },
      hint,
    });
  });

  it("draws the party's tiers before there is a creature to rate", () => {
    const empty = draftDifficulty([], [5, 5, 5, null]);
    expect(empty.difficulty).toEqual({ _tag: "unrated", reason: "no-creatures" });
    // The same party the rated band would name, the unlevelled one counted.
    expect(empty.party).toEqual({
      counted: { size: 3, minLevel: 5, maxLevel: 5, unlevelled: 1 },
      thresholds: { easy: 750, medium: 1500, hard: 2250, deadly: 3300 },
    });
    expect(empty.breakdown).toBeUndefined();
    expect(empty.hint).toBe(
      "No creatures to rate yet. Add them from the bestiary and the band follows.",
    );
  });

  it("says a creature with no XP is why there is no band", () => {
    expect(draftDifficulty([line(goblinId, 1, null)], fourAtFive)).toMatchObject({
      difficulty: { _tag: "unrated", reason: "missing-xp" },
      hint: expect.stringMatching(/^A creature on the roster has no XP/),
    });
  });
});
