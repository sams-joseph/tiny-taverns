import { Schema } from "effect";

/**
 * How hard an encounter is for the party at this table, computed by the DMG's
 * method (2014, "Creating a Combat Encounter") — never typed by the DM.
 *
 * The captain's call of 2026-09-25 was *computed only*: a band the DM picks is
 * a second answer to a question the roster and the party already answer, and
 * the two disagree the first time a goblin is added. So there is no stored
 * difficulty anywhere, and this file is the one implementation of the rule.
 * The server runs it on every encounter read (`repo/Encounters.ts`) over the
 * roster and the party the reader can see; a client draws what it was sent.
 *
 * `Trivial` is the band below `Easy`, which the DMG leaves unnamed.
 */
export const DifficultyBand = Schema.Literals(["Trivial", "Easy", "Medium", "Hard", "Deadly"]);
export type DifficultyBand = typeof DifficultyBand.Type;

/**
 * The party's XP thresholds, each the sum of every counted character's own —
 * the edges of the meter the encounter's adjusted XP is placed against.
 */
export const DifficultyThresholds = Schema.Struct({
  easy: Schema.Int,
  medium: Schema.Int,
  hard: Schema.Int,
  deadly: Schema.Int,
});
export type DifficultyThresholds = typeof DifficultyThresholds.Type;

/**
 * The party the thresholds were summed over: the seated characters this reader
 * can see that have a level.
 *
 * **A seated character with no level is left out, and counted.** Levels are
 * the player's to set and the DM cannot write them, so refusing to rate
 * anything until every sheet has one would let one unfinished sheet blank the
 * meter on every encounter. Leaving them out rates the fight for the characters
 * the table has described; `unlevelled` says how many were not, so a client
 * never passes off "party of 3" as the whole table.
 */
export const DifficultyParty = Schema.Struct({
  size: Schema.Int,
  minLevel: Schema.Int,
  maxLevel: Schema.Int,
  unlevelled: Schema.Int,
});
export type DifficultyParty = typeof DifficultyParty.Type;

/**
 * Why an encounter has no band. Each is something the DM can see and fix:
 *
 * - `no-creatures` — the roster is empty (or none of it is visible to this
 *   reader). A social scene or a skill challenge is not rated by XP.
 * - `missing-xp` — a creature on the roster has no XP: its stat block does not
 *   say and its challenge rating is not one the XP table knows.
 * - `no-party` — nobody seated has a level to take thresholds from.
 */
export const UnratedReason = Schema.Literals(["no-creatures", "missing-xp", "no-party"]);
export type UnratedReason = typeof UnratedReason.Type;

export const EncounterDifficulty = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag("rated"),
    band: DifficultyBand,
    /** `sum(xp × count)` — what the party earns for the fight. */
    xp: Schema.Int,
    /** `xp × multiplier` — what the band is decided by. */
    adjustedXp: Schema.Int,
    multiplier: Schema.Finite,
    party: DifficultyParty,
    thresholds: DifficultyThresholds,
  }),
  Schema.Struct({ _tag: Schema.tag("unrated"), reason: UnratedReason }),
]);
export type EncounterDifficulty = typeof EncounterDifficulty.Type;

/** DMG p.82, "XP Thresholds by Character Level": easy, medium, hard, deadly. */
const THRESHOLDS: ReadonlyArray<readonly [number, number, number, number]> = [
  [25, 50, 75, 100],
  [50, 100, 150, 200],
  [75, 150, 225, 400],
  [125, 250, 375, 500],
  [250, 500, 750, 1100],
  [300, 600, 900, 1400],
  [350, 750, 1100, 1700],
  [450, 900, 1400, 2100],
  [550, 1100, 1600, 2400],
  [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600],
  [1000, 2000, 3000, 4500],
  [1100, 2200, 3400, 5100],
  [1250, 2500, 3800, 5700],
  [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200],
  [2000, 3900, 5900, 8800],
  [2100, 4200, 6300, 9500],
  [2400, 4900, 7300, 10900],
  [2800, 5700, 8500, 12700],
];

/**
 * One character's thresholds. The table stops at 20 and a sheet may say more
 * (`character.level` allows 100), so a level past it takes level 20's row
 * rather than no row: the 2014 rules have nothing above 20 to compute from.
 */
const thresholdsAt = (level: number): readonly [number, number, number, number] =>
  THRESHOLDS[Math.min(Math.max(level, 1), THRESHOLDS.length) - 1]!;

/** The party's thresholds: every counted character's row, summed. */
export const partyThresholds = (levels: ReadonlyArray<number>): DifficultyThresholds =>
  levels.reduce<DifficultyThresholds>(
    (sum, level) => {
      const [easy, medium, hard, deadly] = thresholdsAt(level);
      return {
        easy: sum.easy + easy,
        medium: sum.medium + medium,
        hard: sum.hard + hard,
        deadly: sum.deadly + deadly,
      };
    },
    { easy: 0, medium: 0, hard: 0, deadly: 0 },
  );

/**
 * DMG p.82, "Encounter Multipliers", with the two ends the party-size rule
 * steps onto: ×0.5 below one creature's ×1, and ×5 past fifteen's ×4.
 */
const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5] as const;

/**
 * The multiplier for this many creatures against a party this size.
 *
 * A party of fewer than three steps one row up the table, and a party of six
 * or more one row down — the DMG's "Party Size" adjustment.
 *
 * The DMG also suggests ignoring creatures far below the group's average CR
 * when counting. That is a judgement ("significantly lower"), not a rule, so it
 * is not applied: every creature on the roster counts.
 */
export const encounterMultiplier = (creatures: number, partySize: number): number => {
  const row =
    creatures <= 1
      ? 1
      : creatures === 2
        ? 2
        : creatures <= 6
          ? 3
          : creatures <= 10
            ? 4
            : creatures <= 14
              ? 5
              : 6;
  const step = partySize < 3 ? 1 : partySize >= 6 ? -1 : 0;
  return MULTIPLIERS[row + step]!;
};

/** DMG p.275 / the SRD, "Experience Points by Challenge Rating". */
const XP_BY_CR: Readonly<Record<string, number>> = {
  "0": 10,
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
};

/** The fractional ratings as the decimals a sheet sometimes writes instead. */
const DECIMAL_CR: Readonly<Record<string, string>> = {
  "0.125": "1/8",
  "0.25": "1/4",
  "0.5": "1/2",
};

/**
 * A creature's XP: what its stat block says, else what the XP table gives its
 * challenge rating, else `null`.
 *
 * XP in 5e *is* a function of CR, so the table is the rule and not a guess; the
 * stat block wins when it says, because the one place the table is ambiguous —
 * CR 0 is "0 or 10" — is where a stat block says 0. A rating the table does
 * not know (`"—"`, a homebrew `"1/3"`) has no XP, and an encounter holding it
 * is unrated rather than rated on a number nobody wrote.
 */
export const creatureXp = (creature: {
  readonly cr: string;
  readonly statBlockXp: number | null;
}): number | null => {
  if (
    creature.statBlockXp !== null &&
    Number.isInteger(creature.statBlockXp) &&
    creature.statBlockXp >= 0
  ) {
    return creature.statBlockXp;
  }
  const cr = creature.cr.trim();
  return XP_BY_CR[DECIMAL_CR[cr] ?? cr] ?? null;
};

/** One roster line, as the rule needs it. */
export interface RosterXp {
  readonly count: number;
  /** Each creature's XP, or `null` when it has none — see {@link creatureXp}. */
  readonly xp: number | null;
}

/**
 * The band, by the DMG's method: total the XP, multiply by the creature count's
 * multiplier, and place the result against the party's summed thresholds.
 *
 * `partyLevels` is every seated character's level, `null` where the sheet has
 * none — those are left out and counted (see {@link DifficultyParty}).
 */
export const encounterDifficulty = (
  roster: ReadonlyArray<RosterXp>,
  partyLevels: ReadonlyArray<number | null>,
): EncounterDifficulty => {
  const creatures = roster.reduce((total, line) => total + line.count, 0);
  if (creatures === 0) return { _tag: "unrated", reason: "no-creatures" };
  if (roster.some((line) => line.xp === null)) return { _tag: "unrated", reason: "missing-xp" };
  const levels = partyLevels.filter((level): level is number => level !== null);
  if (levels.length === 0) return { _tag: "unrated", reason: "no-party" };

  const xp = roster.reduce((total, line) => total + line.count * line.xp!, 0);
  const multiplier = encounterMultiplier(creatures, levels.length);
  const adjustedXp = Math.floor(xp * multiplier);
  const thresholds = partyThresholds(levels);
  const band: DifficultyBand =
    adjustedXp >= thresholds.deadly
      ? "Deadly"
      : adjustedXp >= thresholds.hard
        ? "Hard"
        : adjustedXp >= thresholds.medium
          ? "Medium"
          : adjustedXp >= thresholds.easy
            ? "Easy"
            : "Trivial";
  return {
    _tag: "rated",
    band,
    xp,
    adjustedXp,
    multiplier,
    party: {
      size: levels.length,
      minLevel: Math.min(...levels),
      maxLevel: Math.max(...levels),
      unlevelled: partyLevels.length - levels.length,
    },
    thresholds,
  };
};

/**
 * The party as the meter's caption says it: `"party of 4, lvl 5"`, or
 * `"party of 4, lvl 3–5"` for a mixed table, with the characters left out
 * named as a count so the size is never mistaken for the whole table.
 */
export const describeParty = (party: DifficultyParty): string => {
  const levels =
    party.minLevel === party.maxLevel
      ? `lvl ${String(party.minLevel)}`
      : `lvl ${String(party.minLevel)}–${String(party.maxLevel)}`;
  const left = party.unlevelled === 0 ? "" : ` · ${String(party.unlevelled)} without a level`;
  return `party of ${String(party.size)}, ${levels}${left}`;
};
