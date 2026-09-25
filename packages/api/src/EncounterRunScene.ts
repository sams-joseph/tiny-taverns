import { Schema } from "effect";
import { EncounterChallenge } from "./Encounter.js";
import { CombatantId, EncounterRunCheckId, EncounterRunId } from "./Ids.js";
import { AbilityKey } from "./Ruleset.js";

/**
 * How the NPC the party is talking to feels about them right now — the DM's
 * own note, and nothing more. It sets no DC: the SRD has no table from
 * attitude to DC, so each check carries the DC the DM called for it.
 */
export const SceneAttitude = Schema.Literals(["hostile", "indifferent", "friendly"]);
export type SceneAttitude = typeof SceneAttitude.Type;

/** The attitudes in the order a picker lists them, and the word each is said as. */
export const SCENE_ATTITUDES: ReadonlyArray<readonly [SceneAttitude, string]> = [
  ["hostile", "Hostile"],
  ["indifferent", "Indifferent"],
  ["friendly", "Friendly"],
];

/** One of the encounter's tactic lines, as a beat the DM ticks off while running it. */
export const SceneBeat = Schema.Struct({
  text: Schema.String,
  done: Schema.Boolean,
});
export type SceneBeat = typeof SceneBeat.Type;

/** How many stages a hazard may be set to last — hours, days, whatever the DM counts. */
export const SCENE_STAGES_MAX = 100;
const Stage = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: SCENE_STAGES_MAX }));

export const CheckOutcome = Schema.Literals(["success", "failure"]);
export type CheckOutcome = typeof CheckOutcome.Type;

/**
 * A check made against a DC succeeds when it meets it — the SRD's "if the
 * total equals or exceeds the DC". The one spelling, for the server's log and
 * any screen that shows what a total would come to.
 */
export const checkOutcome = (total: number, dc: number): CheckOutcome =>
  total >= dc ? "success" : "failure";

/** A skill's name as a check is logged with it — an open vocabulary, as on a sheet. */
export const CHECK_SKILL_MAX = 40;

/**
 * One check or saving throw the DM logged while running a scene: who made it,
 * with what, the total and the DC when there were numbers, and how it went.
 *
 * Exactly one of `skill` and `save` is set: a check names its skill
 * (`"Persuasion"`, or `"Strength"` for a plain ability check), a saving throw
 * names its ability. A hazard's save is stamped with the stage it was made in,
 * and the table allows one per creature per stage — the DM removes a wrong one
 * rather than logging a second beside it.
 */
export class EncounterRunCheck extends Schema.Class<EncounterRunCheck>("EncounterRunCheck")({
  id: EncounterRunCheckId,
  runId: EncounterRunId,
  /** Who made it; `null` once that combatant has been removed from the run. */
  combatantId: Schema.NullOr(CombatantId),
  /** Their name when it was logged, so the log still reads after a removal. */
  displayName: Schema.String,
  skill: Schema.NullOr(Schema.String),
  save: Schema.NullOr(AbilityKey),
  /** `null` for a pass or a fail the DM called without a number. */
  total: Schema.NullOr(Schema.Int),
  /** The DC it was made against, as it stood then; `null` when none was set. */
  dc: Schema.NullOr(Schema.Int),
  outcome: CheckOutcome,
  /** The hazard's stage, for a save made in one; `null` otherwise. */
  stage: Schema.NullOr(Schema.Int),
  createdAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * A running scene's state — **the creator's alone**, like the prep it was
 * copied from.
 *
 * `beats` and `challenge` are snapshots of the encounter's prep taken when the
 * run started, so editing the template mid-scene changes the next run and
 * never this one (`encounter_run.encounter_name`'s rule). The rest is what the
 * DM has done since: the beats ticked, the attitude noted, the hazard's stages,
 * and the checks and saves logged, oldest first.
 *
 * Whether a skill challenge is won or lost is not stored: it is the log
 * counted against the snapshot (`challengeTally`), and removing a check that
 * was logged by mistake reopens it.
 */
export class EncounterRunScene extends Schema.Class<EncounterRunScene>("EncounterRunScene")({
  runId: EncounterRunId,
  beats: Schema.Array(SceneBeat),
  /** The skill challenge's or the hazard's numbers, or `null` for any other scene. */
  challenge: Schema.NullOr(EncounterChallenge),
  /** `null` until the DM notes one. */
  attitude: Schema.NullOr(SceneAttitude),
  /** The hazard's current stage, from 1; `null` until the DM sets how long it lasts. */
  stage: Schema.NullOr(Schema.Int),
  /** How many stages the hazard lasts, as the DM set it when it began. */
  stages: Schema.NullOr(Schema.Int),
  checks: Schema.Array(EncounterRunCheck),
}) {}

/**
 * A change to a running scene. Every field is optional and absent leaves it
 * alone. `attitude` is a conversation's; `stage` and `stages` are a hazard's —
 * and `stage` must lie within `stages`, which the scene refuses otherwise.
 */
export const EncounterRunSceneUpdate = Schema.Struct({
  attitude: Schema.optional(Schema.NullOr(SceneAttitude)),
  /** Tick or untick one beat, by its place in the list. */
  beat: Schema.optional(
    Schema.Struct({
      index: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 })),
      done: Schema.Boolean,
    }),
  ),
  stages: Schema.optional(Schema.NullOr(Stage)),
  stage: Schema.optional(Schema.NullOr(Stage)),
});
export type EncounterRunSceneUpdate = typeof EncounterRunSceneUpdate.Type;

const requestId = Schema.optional(Schema.NonEmptyString.check(Schema.isLengthBetween(1, 128)));

/**
 * Log a check or a save.
 *
 * `dc` absent takes the scene's own — a skill challenge's DC, or a hazard's
 * save DC — and a conversation has none, so there the DM sends it. `outcome`
 * absent is worked out from the total and the DC (`checkOutcome`); a pass or
 * a fail called without a number sends it instead.
 */
export const EncounterRunCheckCreate = Schema.Struct({
  combatantId: CombatantId,
  skill: Schema.optional(
    Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(CHECK_SKILL_MAX)),
  ),
  save: Schema.optional(AbilityKey),
  total: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: -20, maximum: 99 }))),
  dc: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 30 }))),
  outcome: Schema.optional(CheckOutcome),
  requestId,
}).check(
  Schema.makeFilter((payload: { readonly skill?: string; readonly save?: AbilityKey }) =>
    (payload.skill === undefined) !== (payload.save === undefined)
      ? undefined
      : { path: ["skill"], issue: "a check names a skill or a save, not both" },
  ),
);
export type EncounterRunCheckCreate = typeof EncounterRunCheckCreate.Type;

/** A skill challenge's progress: its logged checks counted against its numbers. */
export interface ChallengeTally {
  readonly successes: number;
  readonly failures: number;
  /** `won` at the successes it needs, `lost` at the failures it allows. */
  readonly settled: "won" | "lost" | null;
}

/**
 * Counts a skill challenge's log. The one rule for when it is won or lost, so
 * the server that refuses a check on a settled challenge and the screen that
 * draws the pips cannot disagree.
 */
export const challengeTally = (
  challenge: { readonly successes: number; readonly failures: number },
  checks: ReadonlyArray<{ readonly outcome: CheckOutcome }>,
): ChallengeTally => {
  const successes = checks.filter((check) => check.outcome === "success").length;
  const failures = checks.length - successes;
  return {
    successes,
    failures,
    settled:
      successes >= challenge.successes ? "won" : failures >= challenge.failures ? "lost" : null,
  };
};
