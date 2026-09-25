import { describeParty, type EncounterDifficulty, type UnratedReason } from "@taverns/api";

/** The band as a word, `"Unrated"` when there is none — for text and filters. */
export const difficultyWord = (difficulty: EncounterDifficulty): string =>
  difficulty._tag === "rated" ? difficulty.band : "Unrated";

const UNRATED_BECAUSE: Readonly<Record<UnratedReason, string>> = {
  "no-creatures": "No creatures to rate",
  "missing-xp": "A creature on the roster has no XP",
  "no-party": "Nobody seated has a level",
};

/**
 * Where the band came from, in one line — `"1,500 adj. XP · party of 4, lvl 5"`
 * — or what is missing for there to be one.
 */
export const describeDifficulty = (difficulty: EncounterDifficulty): string =>
  difficulty._tag === "rated"
    ? `${difficulty.adjustedXp.toLocaleString("en")} adj. XP · ${describeParty(difficulty.party)}`
    : UNRATED_BECAUSE[difficulty.reason];
