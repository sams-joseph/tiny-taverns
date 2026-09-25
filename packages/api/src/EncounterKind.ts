import { Schema } from "effect";

/**
 * What sort of scene the encounter is: a fight, a conversation, a skill
 * challenge or a hazard. Every encounter has one; an encounter made before
 * there was a choice is a fight, which is all an encounter could hold then.
 *
 * On the `encounter` row itself, so a player reading a shared encounter
 * (`PlayerEncounter`) sees it: it says what kind of scene is coming, which the
 * encounter's name already does.
 *
 * A module of its own because a run snapshots it (`EncounterRun.mode`) and
 * `Encounter.ts` already imports `EncounterRun.ts`.
 */
export const EncounterKind = Schema.Literals(["combat", "social", "challenge", "hazard"]);
export type EncounterKind = typeof EncounterKind.Type;

/** The kinds in the order a picker lists them, and the word each is said as. */
export const ENCOUNTER_KINDS: ReadonlyArray<readonly [EncounterKind, string]> = [
  ["combat", "Combat"],
  ["social", "Social"],
  ["challenge", "Challenge"],
  ["hazard", "Hazard"],
];

export const encounterKindLabel = (kind: EncounterKind): string =>
  ENCOUNTER_KINDS.find(([value]) => value === kind)?.[1] ?? kind;
