import {
  type AbilityKey,
  type Creature,
  creatureXp,
  type CreatureId,
  type Encounter,
  type EncounterChallenge,
  type EncounterCreate,
  type EncounterCreature,
  type EncounterCreatureId,
  type EncounterDifficulty,
  encounterDifficulty,
  type EncounterId,
  type EncounterKind,
  type EncounterPrep,
  type EncounterUpdate,
  ENCOUNTER_ROSTER_MAX,
  ENCOUNTER_SETTING_MAX,
  ENCOUNTER_SKILL_MAX,
  ENCOUNTER_SKILLS_MAX,
  ENCOUNTER_TACTIC_MAX,
  ENCOUNTER_TACTICS_MAX,
  ENCOUNTER_TREASURE_MAX,
  type Note,
  type NoteCreate,
  type NoteId,
  type Visibility,
} from "@taverns/api";
import { DateTime } from "effect";
import { STANDARD_SKILLS } from "../characters/skills";

/**
 * An encounter as it is being written — **the pure half of the encounter
 * builder** (`EncounterBuilderScreen.tsx`), tested on its own
 * (`encounterDraft.test.ts`) so what an encounter reads and sends is decided
 * apart from how the page draws it.
 *
 * ### One draft, four tables
 *
 * What a DM thinks of as the encounter is four stores: the `Encounter` row, its
 * creator-only `EncounterPrep`, its roster (`encounter_creature`, one row per
 * creature) and two lines that live elsewhere — the battle map's setting line
 * and the oldest `read_aloud` note attached to it. {@link draftFrom} reads all
 * of them into one value the screen edits; {@link createPayload},
 * {@link updatePayload}, {@link rosterDiff} and {@link readAloudWrite} say what
 * each store is sent on save. None of them issues a request.
 *
 * ### A kind switch loses nothing
 *
 * The roster is kept whatever the kind, and the server keeps it too: switching
 * a fight to a hazard only stops a challenge being sent for the old kind, and
 * the server clears a mismatched one (`repo/Encounters.ts`). A skill challenge
 * and a hazard each keep **their own** numbers, so a hazard never inherits a
 * DC as its save, and switching back finds what was typed.
 *
 * ### Blank is not a guess
 *
 * A new encounter's challenge boxes are empty, never a DC somebody might save
 * as their own. Every box empty is a challenge not yet set out, sent as `null`.
 */

/** The prep the draft edits: `EncounterPrep` without its key. */
export type Prep = Pick<EncounterPrep, "ready" | "tactics" | "treasure" | "challenge">;

export const NO_PREP: Prep = { ready: false, tactics: [], treasure: null, challenge: null };

/** A saved roster row, as far as the draft reads it. */
export type SavedLine = Pick<
  EncounterCreature,
  "id" | "creatureId" | "name" | "count" | "cr" | "ac" | "hp" | "xp"
>;

/** A read-aloud note, as far as the draft reads it. */
export type SavedReadAloud = Pick<Note, "id" | "body">;

/** Everything a draft is made from, and what a save is measured against. */
export interface SavedEncounter {
  readonly encounter: Pick<Encounter, "id" | "name" | "kind" | "tags" | "visibility"> | undefined;
  readonly prep: Prep;
  readonly roster: ReadonlyArray<SavedLine>;
  /** The map's setting line as stored; `""` for none. */
  readonly setting: string;
  readonly readAloud: SavedReadAloud | undefined;
}

/** A new encounter: nothing written anywhere yet. */
export const NEW_ENCOUNTER: SavedEncounter = {
  encounter: undefined,
  prep: NO_PREP,
  roster: [],
  setting: "",
  readAloud: undefined,
};

/**
 * One line of the roster. Keyed by the creature — the server holds one row per
 * creature per encounter — so adding a creature already on it raises its count
 * rather than making a second line.
 */
export interface RosterLine {
  readonly creatureId: CreatureId;
  readonly name: string;
  readonly cr: string;
  readonly ac: number;
  readonly hp: number;
  /** XP for one of it, or `null` when it has none (`creatureXp`). */
  readonly xp: number | null;
  readonly count: number;
}

/**
 * A skill challenge's numbers as typed: strings, so a cleared box is a blank
 * rather than `NaN`.
 */
export interface SkillChallengeDraft {
  readonly dc: string;
  readonly successes: string;
  readonly failures: string;
  /** In the order the DM pressed them. */
  readonly skills: ReadonlyArray<string>;
  /** The chips offered: the standard list, then any stored skill it lacks. */
  readonly offered: ReadonlyArray<string>;
}

export interface HazardDraft {
  /** `""` until the DM picks one. */
  readonly ability: AbilityKey | "";
  readonly dc: string;
  readonly onFail: string;
  readonly duration: string;
  readonly skills: ReadonlyArray<string>;
  readonly offered: ReadonlyArray<string>;
}

export interface EncounterDraft {
  readonly name: string;
  readonly kind: EncounterKind;
  /**
   * *Ready to run*: the DM's own word that it is ready, the list's Ready/Draft.
   * Prep, so read from and sent with the rest of the prep; a new encounter is
   * a draft until the DM says otherwise.
   */
  readonly ready: boolean;
  /** The map's setting line — the builder's *Location*. */
  readonly setting: string;
  readonly readAloud: string;
  /** As typed: `"Marsh, Night"`. */
  readonly tags: string;
  readonly visibility: Visibility;
  /** One textarea, one beat per line. */
  readonly tactics: string;
  readonly treasure: string;
  readonly skillChallenge: SkillChallengeDraft;
  readonly hazard: HazardDraft;
  readonly roster: ReadonlyArray<RosterLine>;
}

export const MIN_COUNT = 1;
export const MAX_COUNT = 999;
const MAX_TAGS = 16;
const MAX_TAG_LENGTH = 40;

/** `"Marsh, Night"` ⇄ `["Marsh", "Night"]`. Blanks and repeats fall out. */
export const parseTags = (raw: string): ReadonlyArray<string> => {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = part.trim();
    if (tag !== "") seen.add(tag);
  }
  return [...seen];
};

/** The textarea's lines: trimmed, with the blank ones left out. */
export const tacticsOf = (text: string): ReadonlyArray<string> =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

/** The stored tactics as the textarea opens with them. */
export const tacticsText = (tactics: ReadonlyArray<string>): string => tactics.join("\n");

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const STANDARD_SKILL_NAMES: ReadonlyArray<string> = STANDARD_SKILLS.map(([name]) => name);

/**
 * The chips a challenge offers: the standard eighteen, then any stored skill
 * outside them. A challenge naming thieves' tools keeps that chip, pressed,
 * and it stays offered after the DM unpresses it — the rule `skills.ts` states
 * for a sheet's own rows.
 */
export const skillOptions = (stored: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...STANDARD_SKILL_NAMES,
  ...stored.filter((skill) => !STANDARD_SKILL_NAMES.includes(skill)),
];

export interface SkillChip {
  readonly name: string;
  readonly pressed: boolean;
  /** Eight are pressed and this is not one of them. */
  readonly disabled: boolean;
}

export const skillChips = (draft: {
  readonly skills: ReadonlyArray<string>;
  readonly offered: ReadonlyArray<string>;
}): ReadonlyArray<SkillChip> => {
  const full = draft.skills.length >= ENCOUNTER_SKILLS_MAX;
  return draft.offered.map((name) => {
    const pressed = draft.skills.includes(name);
    return { name, pressed, disabled: full && !pressed };
  });
};

/** Presses or releases one chip. A ninth is refused, as the wire would. */
export const toggleSkill = (skills: ReadonlyArray<string>, name: string): ReadonlyArray<string> =>
  skills.includes(name)
    ? skills.filter((skill) => skill !== name)
    : skills.length >= ENCOUNTER_SKILLS_MAX
      ? skills
      : [...skills, name];

// ---------------------------------------------------------------------------
// From the stores
// ---------------------------------------------------------------------------

const skillChallengeDraft = (challenge: EncounterChallenge | null): SkillChallengeDraft =>
  challenge?.kind === "challenge"
    ? {
        dc: String(challenge.dc),
        successes: String(challenge.successes),
        failures: String(challenge.failures),
        skills: challenge.skills,
        offered: skillOptions(challenge.skills),
      }
    : { dc: "", successes: "", failures: "", skills: [], offered: skillOptions([]) };

const hazardDraft = (challenge: EncounterChallenge | null): HazardDraft =>
  challenge?.kind === "hazard"
    ? {
        ability: challenge.save.ability,
        dc: String(challenge.save.dc),
        onFail: challenge.onFail ?? "",
        duration: challenge.duration ?? "",
        skills: challenge.skills,
        offered: skillOptions(challenge.skills),
      }
    : { ability: "", dc: "", onFail: "", duration: "", skills: [], offered: skillOptions([]) };

const lineFromRow = (row: SavedLine): RosterLine => ({
  creatureId: row.creatureId,
  name: row.name,
  cr: row.cr,
  ac: row.ac,
  hp: row.hp,
  xp: row.xp,
  count: row.count,
});

export const draftFrom = (saved: SavedEncounter): EncounterDraft => ({
  name: saved.encounter?.name ?? "",
  kind: saved.encounter?.kind ?? "combat",
  ready: saved.prep.ready,
  setting: saved.setting,
  readAloud: saved.readAloud?.body ?? "",
  tags: saved.encounter?.tags.join(", ") ?? "",
  // `dm` for a new encounter: the column default, and the only safe one to fail to.
  visibility: saved.encounter?.visibility ?? "dm",
  tactics: tacticsText(saved.prep.tactics),
  treasure: saved.prep.treasure ?? "",
  skillChallenge: skillChallengeDraft(saved.prep.challenge),
  hazard: hazardDraft(saved.prep.challenge),
  roster: saved.roster.map(lineFromRow),
});

/**
 * The read-aloud the encounter's form edits: the **oldest** `read_aloud` note
 * attached to it. An encounter may have several; the others are left alone.
 */
export const readAloudOf = (
  notes: ReadonlyArray<Pick<Note, "id" | "body" | "kind" | "attachedTo" | "createdAt">>,
  encounterId: EncounterId,
): SavedReadAloud | undefined =>
  notes
    .filter((note) => note.kind === "read_aloud" && note.attachedTo?.id === encounterId)
    .reduce<(typeof notes)[number] | undefined>(
      (oldest, note) =>
        oldest === undefined ||
        DateTime.toEpochMillis(note.createdAt) < DateTime.toEpochMillis(oldest.createdAt)
          ? note
          : oldest,
      undefined,
    );

// ---------------------------------------------------------------------------
// The roster
// ---------------------------------------------------------------------------

/** A bestiary creature as a new line of one. The column default is one; nothing guesses more. */
export const lineFor = (
  creature: Pick<Creature, "id" | "name" | "cr" | "ac" | "hp" | "statBlock">,
): RosterLine => ({
  creatureId: creature.id,
  name: creature.name,
  cr: creature.cr,
  ac: creature.ac,
  hp: creature.hp,
  xp: creatureXp({ cr: creature.cr, statBlockXp: creature.statBlock.xp ?? null }),
  count: 1,
});

/** Adds the line, or one more of it when the creature is already on the roster. */
export const addCreature = (
  roster: ReadonlyArray<RosterLine>,
  line: RosterLine,
): ReadonlyArray<RosterLine> =>
  roster.some((other) => other.creatureId === line.creatureId)
    ? roster.map((other) =>
        other.creatureId === line.creatureId
          ? { ...other, count: Math.min(other.count + line.count, MAX_COUNT) }
          : other,
      )
    : [...roster, line];

/** A count as typed into a box. Out of range is kept for {@link validate} to name. */
export const withCount = (
  roster: ReadonlyArray<RosterLine>,
  creatureId: CreatureId,
  count: number,
): ReadonlyArray<RosterLine> =>
  roster.map((line) => (line.creatureId === creatureId ? { ...line, count } : line));

/** A stepper press. Stepping below one removes the line. */
export const stepCount = (
  roster: ReadonlyArray<RosterLine>,
  creatureId: CreatureId,
  by: -1 | 1,
): ReadonlyArray<RosterLine> =>
  roster.flatMap((line) => {
    if (line.creatureId !== creatureId) return [line];
    const count = Math.min(line.count + by, MAX_COUNT);
    return count < MIN_COUNT ? [] : [{ ...line, count }];
  });

export const removeLine = (
  roster: ReadonlyArray<RosterLine>,
  creatureId: CreatureId,
): ReadonlyArray<RosterLine> => roster.filter((line) => line.creatureId !== creatureId);

export interface RosterDiff {
  readonly remove: ReadonlyArray<EncounterCreatureId>;
  readonly create: ReadonlyArray<{ readonly creatureId: CreatureId; readonly count: number }>;
  readonly update: ReadonlyArray<{ readonly id: EncounterCreatureId; readonly count: number }>;
}

/**
 * What the roster half of a save sends: a saved row no longer on the draft is
 * deleted, a new creature is created, a changed count is updated, and an
 * untouched line costs nothing.
 *
 * Matched by creature, not by line, so a line removed and the same creature
 * added back in one sitting is the row it always was — an update, not a
 * delete and a create that would race each other to a 409.
 */
export const rosterDiff = (
  saved: ReadonlyArray<SavedLine>,
  roster: ReadonlyArray<RosterLine>,
): RosterDiff => {
  const drafted = new Map(roster.map((line) => [line.creatureId, line]));
  const stored = new Set(saved.map((row) => row.creatureId));
  return {
    remove: saved.filter((row) => !drafted.has(row.creatureId)).map((row) => row.id),
    create: roster
      .filter((line) => !stored.has(line.creatureId))
      .map((line) => ({ creatureId: line.creatureId, count: line.count })),
    update: saved.flatMap((row) => {
      const line = drafted.get(row.creatureId);
      return line === undefined || line.count === row.count
        ? []
        : [{ id: row.id, count: line.count }];
    }),
  };
};

// ---------------------------------------------------------------------------
// The challenge
// ---------------------------------------------------------------------------

/** A whole number in range, or `undefined` for anything else a box can hold. */
const wholeIn = (raw: string, minimum: number, maximum: number): number | undefined => {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return value >= minimum && value <= maximum ? value : undefined;
};

const skillsProblem = (skills: ReadonlyArray<string>): string | undefined =>
  skills.length > ENCOUNTER_SKILLS_MAX
    ? `Eight skills is the most a challenge names. That is ${skills.length}.`
    : skills.some((skill) => skill.length > ENCOUNTER_SKILL_MAX)
      ? `Keep each skill under ${ENCOUNTER_SKILL_MAX + 1} characters.`
      : undefined;

export interface ChallengeOf {
  readonly challenge: EncounterChallenge | null;
  readonly problem?: string;
}

/**
 * The challenge the draft would send for its kind, or what is wrong with it.
 *
 * Every box blank is a challenge not yet set out — `null`, which the DM can
 * fill in later. Anything typed means the DM is setting one out, and then the
 * numbers the kind needs are needed. A fight or a conversation has none, and
 * only the current kind's draft is read: the other one is kept, never sent.
 */
export const challengeOf = (draft: EncounterDraft): ChallengeOf => {
  switch (draft.kind) {
    case "challenge": {
      const skill = draft.skillChallenge;
      if ([skill.dc, skill.successes, skill.failures].every((box) => box.trim() === "")) {
        return skill.skills.length === 0
          ? { challenge: null }
          : { challenge: null, problem: "Give the DC, the successes and the failures too." };
      }
      const dc = wholeIn(skill.dc, 1, 30);
      const successes = wholeIn(skill.successes, 1, 20);
      const failures = wholeIn(skill.failures, 1, 20);
      if (dc === undefined || successes === undefined || failures === undefined) {
        return {
          challenge: null,
          problem: "A DC runs from 1 to 30, and successes and failures from 1 to 20.",
        };
      }
      const problem = skillsProblem(skill.skills);
      return {
        challenge: { kind: "challenge", dc, successes, failures, skills: skill.skills },
        ...(problem === undefined ? {} : { problem }),
      };
    }
    case "hazard": {
      const hazard = draft.hazard;
      const onFail = hazard.onFail.trim();
      const duration = hazard.duration.trim();
      if (
        hazard.ability === "" &&
        hazard.dc.trim() === "" &&
        onFail === "" &&
        duration === "" &&
        hazard.skills.length === 0
      ) {
        return { challenge: null };
      }
      const dc = wholeIn(hazard.dc, 1, 30);
      if (hazard.ability === "" || dc === undefined) {
        return {
          challenge: null,
          problem: "A hazard needs the save it forces: an ability, and a DC from 1 to 30.",
        };
      }
      const problem = skillsProblem(hazard.skills);
      return {
        challenge: {
          kind: "hazard",
          save: { ability: hazard.ability, dc },
          ...(onFail === "" ? {} : { onFail }),
          ...(duration === "" ? {} : { duration }),
          skills: hazard.skills,
        },
        ...(problem === undefined ? {} : { problem }),
      };
    }
    default:
      return { challenge: null };
  }
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface Problems {
  readonly name?: string;
  readonly setting?: string;
  readonly tags?: string;
  readonly roster?: string;
  readonly challenge?: string;
  readonly tactics?: string;
  readonly treasure?: string;
}

/**
 * What the DM is told before anything is sent.
 *
 * The contract would catch every one of these on its own — the derived client
 * encodes through the same schema the handler decodes with, so a bad payload
 * fails locally with a `SchemaError` and never reaches the network. But
 * "Expected a value with a length of at least 1 at [\"name\"]" is a sentence
 * for whoever wrote the schema, not for whoever is naming an encounter. These
 * are the same rules, said in the room they are broken in; `SaveFailure` is
 * what renders the backstop if one is ever missed.
 */
export const validate = (draft: EncounterDraft): Problems => {
  const problems: { -readonly [K in keyof Problems]: Problems[K] } = {};

  if (draft.name.trim() === "") problems.name = "Give it a name.";

  if (draft.setting.trim().length > ENCOUNTER_SETTING_MAX) {
    problems.setting = `Keep it to one line, ${ENCOUNTER_SETTING_MAX} characters at most.`;
  }

  const tags = parseTags(draft.tags);
  if (tags.length > MAX_TAGS) {
    problems.tags = `Sixteen tags is the most an encounter carries. That is ${tags.length}.`;
  } else if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    problems.tags = `Keep each tag under ${MAX_TAG_LENGTH + 1} characters.`;
  }

  const { problem } = challengeOf(draft);
  if (problem !== undefined) problems.challenge = problem;

  const tactics = tacticsOf(draft.tactics);
  if (tactics.length > ENCOUNTER_TACTICS_MAX) {
    problems.tactics = `Twelve lines is the most the tactics hold. That is ${tactics.length}.`;
  } else if (tactics.some((line) => line.length > ENCOUNTER_TACTIC_MAX)) {
    problems.tactics = `Keep each line to ${ENCOUNTER_TACTIC_MAX} characters.`;
  }

  if (draft.treasure.trim().length > ENCOUNTER_TREASURE_MAX) {
    problems.treasure = `Keep it to ${ENCOUNTER_TREASURE_MAX} characters.`;
  }

  if (draft.roster.length > ENCOUNTER_ROSTER_MAX) {
    problems.roster = `Fifty creatures is the most a roster names. That is ${draft.roster.length}.`;
  } else if (draft.roster.some((line) => !Number.isInteger(line.count))) {
    problems.roster = "A count is a whole number of creatures.";
  } else if (draft.roster.some((line) => line.count < MIN_COUNT || line.count > MAX_COUNT)) {
    problems.roster = `A count runs from ${MIN_COUNT} to ${MAX_COUNT}.`;
  }

  return problems;
};

// ---------------------------------------------------------------------------
// To the stores
// ---------------------------------------------------------------------------

/**
 * The encounter's create, roster included: the server makes the encounter and
 * its lines in one transaction, so a creature it refuses leaves no half of an
 * encounter behind. Assumes {@link validate} passed: a challenge with a
 * problem is not sent.
 */
export const createPayload = (draft: EncounterDraft): EncounterCreate => {
  const setting = draft.setting.trim();
  const tactics = tacticsOf(draft.tactics);
  const treasure = draft.treasure.trim();
  const { challenge } = challengeOf(draft);
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    tags: parseTags(draft.tags),
    visibility: draft.visibility,
    ready: draft.ready,
    ...(setting === "" ? {} : { setting }),
    ...(tactics.length === 0 ? {} : { tactics }),
    ...(treasure === "" ? {} : { treasure }),
    ...(challenge === null ? {} : { challenge }),
    ...(draft.roster.length === 0
      ? {}
      : {
          creatures: draft.roster.map((line) => ({
            creatureId: line.creatureId,
            count: line.count,
          })),
        }),
  };
};

/**
 * The encounter's update.
 *
 * The setting line is sent only when it changed, `null` when emptied: it is
 * the map's, and an untouched line is not a write. The prep is sent whole, as
 * the form shows it, with the kind beside it — a challenge travels with its
 * kind, and a kind switched away sends `null` so the server clears it.
 */
export const updatePayload = (draft: EncounterDraft, saved: SavedEncounter): EncounterUpdate => {
  const setting = draft.setting.trim();
  const treasure = draft.treasure.trim();
  return {
    name: draft.name.trim(),
    tags: parseTags(draft.tags),
    visibility: draft.visibility,
    ...(setting === saved.setting.trim() ? {} : { setting: setting === "" ? null : setting }),
    kind: draft.kind,
    ready: draft.ready,
    tactics: tacticsOf(draft.tactics),
    treasure: treasure === "" ? null : treasure,
    challenge: challengeOf(draft).challenge,
  };
};

/** What the read-aloud half of a save sends, if anything. */
export type ReadAloudWrite =
  | { readonly _tag: "none" }
  | { readonly _tag: "create"; readonly payload: NoteCreate }
  | { readonly _tag: "update"; readonly noteId: NoteId; readonly body: string }
  | { readonly _tag: "detach"; readonly noteId: NoteId };

/**
 * The read-aloud box against the note it came from.
 *
 * Text with no note becomes a new `read_aloud` note on the encounter, titled
 * with its name — a note's title is required and the encounter's name is what
 * the Notes tab would call it. Emptying the box **detaches** the note rather
 * than deleting it, so what was written stays in Notes.
 */
export const readAloudWrite = (
  draft: EncounterDraft,
  saved: SavedReadAloud | undefined,
  encounterId: EncounterId,
): ReadAloudWrite => {
  const body = draft.readAloud.trim();
  if (saved === undefined) {
    return body === ""
      ? { _tag: "none" }
      : {
          _tag: "create",
          payload: {
            title: draft.name.trim(),
            body,
            kind: "read_aloud",
            attachedTo: { kind: "encounter", id: encounterId },
          },
        };
  }
  if (body === "") return { _tag: "detach", noteId: saved.id };
  return body === saved.body.trim() ? { _tag: "none" } : { _tag: "update", noteId: saved.id, body };
};

// ---------------------------------------------------------------------------
// The bestiary's CR pills
// ---------------------------------------------------------------------------

export type CrPill = "any" | "low" | "mid" | "high";

export const CR_PILLS: ReadonlyArray<readonly [CrPill, string]> = [
  ["any", "Any CR"],
  ["low", "CR 1 and under"],
  ["mid", "CR 2–4"],
  ["high", "CR 5+"],
];

/** The pill as `creatures.list`'s range over `cr_sort`, where ¼ is `0.25`. */
export const crRange = (pill: CrPill): { readonly crMin?: number; readonly crMax?: number } => {
  switch (pill) {
    case "any":
      return {};
    case "low":
      return { crMax: 1 };
    case "mid":
      return { crMin: 2, crMax: 4 };
    case "high":
      return { crMin: 5 };
  }
};

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

export interface DraftDifficulty {
  readonly difficulty: EncounterDifficulty;
  /**
   * `"450 more adjusted XP tips this into medium."`, or what past Deadly
   * means; nothing when the draft is unrated.
   */
  readonly hint?: string;
  /** `"600 base XP · ×2.5 for group size · 150 xp each"`; nothing when unrated. */
  readonly breakdown?: string;
}

const xpWords = (xp: number): string => xp.toLocaleString("en");

/**
 * The draft's band, by the rule the server rates a saved encounter with
 * (`encounterDifficulty`), over the draft's roster and every seated
 * character's level — the same seats `party.list` answers and the server
 * counts, so the meter and the saved row cannot disagree.
 */
export const draftDifficulty = (
  roster: ReadonlyArray<RosterLine>,
  partyLevels: ReadonlyArray<number | null>,
): DraftDifficulty => {
  const difficulty = encounterDifficulty(
    roster.map((line) => ({ count: line.count, xp: line.xp })),
    partyLevels,
  );
  if (difficulty._tag === "unrated") return { difficulty };

  const { adjustedXp, thresholds } = difficulty;
  const next = (
    [
      ["easy", thresholds.easy],
      ["medium", thresholds.medium],
      ["hard", thresholds.hard],
      ["deadly", thresholds.deadly],
    ] as const
  ).find(([, threshold]) => threshold > adjustedXp);
  return {
    difficulty,
    hint:
      next === undefined
        ? "Past deadly. Someone likely drops. Give them a way out, or cut a creature."
        : `${xpWords(next[1] - adjustedXp)} more adjusted XP tips this into ${next[0]}.`,
    breakdown: `${xpWords(difficulty.xp)} base XP · ×${String(difficulty.multiplier)} for group size · ${xpWords(Math.floor(difficulty.xp / difficulty.party.size))} xp each`,
  };
};
