import type {
  AbilityKey,
  CharacterSheet,
  CombatantId,
  EncounterKind,
  EncounterRunCheck,
  EncounterRunScene,
} from "@taverns/api";
import { challengeTally, NEUTRAL_RUN_NAMES } from "@taverns/api";
import { Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { parseDiceExpression } from "../characters/rolls";
import { STANDARD_SKILLS } from "../characters/skills";
import type { RunPath } from "./load";

/**
 * A run that is not a fight — a conversation, a skill challenge or a hazard —
 * as the runner reads and words it. The pure half of `SceneRunner.tsx`.
 *
 * A scene's state is the creator's alone (`EncounterRunScene`): the beats
 * copied from the prep, the DM's attitude note, a hazard's stages, and the log
 * of checks and saves. Nothing here invents a number the record does not hold:
 * a conversation has no DC but the one the DM types (the captain's call on
 * attitude), a hazard lasts as many stages as the DM sets when it begins, and a
 * modifier is read off the character's sheet or is absent.
 */

/** The run's scene, or `null` when the run is a fight and has none to show. */
export const runSceneAtom = Atom.family((key: RunPath & { readonly open: boolean }) =>
  key.open
    ? apiAtom(
        (client): Effect.Effect<EncounterRunScene | null, unknown> =>
          client.runs.scene({
            params: { campaignId: key.campaignId, sessionId: key.sessionId, runId: key.runId },
          }),
        [reads.runScene(key.runId)],
      )
    : apiAtom((): Effect.Effect<EncounterRunScene | null, unknown> => Effect.succeed(null), []),
);

/**
 * What the DM calls this kind of scene in a sentence — "End the conversation"
 * — spelled from the same table that names a run to a player
 * (`NEUTRAL_RUN_NAMES`, "A conversation"), so the two cannot drift.
 */
export const sceneNoun = (mode: EncounterKind): string =>
  NEUTRAL_RUN_NAMES[mode].replace(/^an? /i, "");

/** The header's badge for a scene: the drawn "Social", "Skill challenge", "Hazard". */
export const sceneBadge = (mode: Exclude<EncounterKind, "combat">): string =>
  mode === "social" ? "Social" : mode === "challenge" ? "Skill challenge" : "Hazard";

const counted = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? "" : "s"}`;

/** `"CON save DC 13"` */
export const saveLabel = (save: { readonly ability: AbilityKey; readonly dc: number }): string =>
  `${save.ability} save DC ${String(save.dc)}`;

/**
 * The line under the scene's name, as the drawing words it — less the numbers
 * the record does not hold: a conversation's attitude sets no DC, and a hazard
 * counts stages rather than guessing they are hours.
 */
export const sceneUpLine = (mode: EncounterKind, scene: EncounterRunScene): string | undefined => {
  const challenge = scene.challenge;
  if (mode === "social") {
    const attitude = scene.attitude === null ? "No attitude noted" : `Attitude: ${scene.attitude}`;
    return scene.checks.length === 0
      ? attitude
      : `${attitude} · ${counted(scene.checks.length, "check")}`;
  }
  if (mode === "challenge" && challenge?.kind === "challenge") {
    const tally = challengeTally(challenge, scene.checks);
    if (tally.settled !== null) {
      return `Challenge ${tally.settled} · ${counted(scene.checks.length, "check")}`;
    }
    return `${String(tally.successes)} of ${String(challenge.successes)} successes · ${String(
      tally.failures,
    )} of ${String(challenge.failures)} failures`;
  }
  if (mode === "hazard" && challenge?.kind === "hazard") {
    const save = saveLabel(challenge.save);
    return scene.stage === null || scene.stages === null
      ? `${save} · not begun`
      : `Stage ${String(scene.stage)} of ${String(scene.stages)} · ${save}`;
  }
  return undefined;
};

/** What a logged line was made with: `"Persuasion"`, or `"CON save"`. */
export const checkWhat = (check: EncounterRunCheck): string =>
  check.skill ?? `${check.save ?? ""} save`;

/**
 * The DC the next conversation check starts from: the last one the DM set
 * (the captain's call — each check takes a DC, pre-filled from the last).
 */
export const lastDc = (checks: ReadonlyArray<EncounterRunCheck>): number | undefined =>
  [...checks].reverse().find((check) => check.dc !== null)?.dc ?? undefined;

/** Each combatant's save in the hazard's current stage — one each, by the table's rule. */
export const savesThisStage = (
  scene: EncounterRunScene,
): ReadonlyMap<CombatantId, EncounterRunCheck> =>
  new Map(
    scene.stage === null
      ? []
      : scene.checks
          .filter(
            (check) =>
              check.save !== null && check.stage === scene.stage && check.combatantId !== null,
          )
          .map((check) => [check.combatantId!, check] as const),
  );

/**
 * The dice a hazard's written duration opens with — `"1d4 hours"` is `1d4` —
 * so the DM can roll how many stages it lasts. `undefined` when it opens with
 * anything else: "until dawn" is the DM's to count.
 */
export const leadingDice = (duration: string | undefined): string | undefined => {
  const match = /^\s*(\d+\s*d\s*\d+(?:\s*[+-]\s*\d+)?)/i.exec(duration ?? "");
  return match === null ? undefined : parseDiceExpression(match[1]!)?.notation;
};

// ------------------------------------------------------------------ exhaustion

const EXHAUSTION = /^exhaustion\s*(\d+)$/i;
export const EXHAUSTION_MAX = 6;

/**
 * The level of exhaustion a combatant's conditions say they have: the SRD's
 * one levelled condition, held as the word `"Exhaustion 2"` like any other
 * condition (the captain's call — the DM applies a hazard's cost with the
 * condition chips, and it reaches the character the way every condition does).
 */
export const exhaustionOf = (conditions: ReadonlyArray<string>): number =>
  conditions.reduce((level, condition) => {
    const match = EXHAUSTION.exec(condition.trim());
    return match === null ? level : Math.max(level, Number(match[1]));
  }, 0);

/** The conditions with the exhaustion word set to this level, in its place; none at 0. */
export const withExhaustion = (
  conditions: ReadonlyArray<string>,
  level: number,
): ReadonlyArray<string> => {
  const word = `Exhaustion ${String(level)}`;
  const at = conditions.findIndex((condition) => EXHAUSTION.test(condition.trim()));
  const rest = conditions.filter((condition) => !EXHAUSTION.test(condition.trim()));
  if (level <= 0) return rest;
  return at === -1 ? [...rest, word] : [...rest.slice(0, at), word, ...rest.slice(at)];
};

// ------------------------------------------------------------------ modifiers

const ABILITY_NAMES: Readonly<Record<string, string>> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

/** `"+3"`, `"-1"`, `"2"` → the number; anything else is absent. */
const signedNumber = (text: string | undefined): number | undefined => {
  const trimmed = text?.trim().replace(/^\+/, "");
  return trimmed !== undefined && /^-?\d+$/.test(trimmed) ? Number(trimmed) : undefined;
};

const abilityCell = (sheet: CharacterSheet, ability: string) =>
  sheet.abilities.find((cell) => cell.label.trim().toUpperCase() === ability.toUpperCase());

/**
 * What a character adds to a check with this skill, off their sheet: the
 * bonus written on its row, else the modifier of the ability it keys off (the
 * row's, or the standard list's) — an unpractised skill is the plain ability
 * check. A skill that names an ability (`"Strength"`) is that ability's check.
 * `undefined` when the sheet does not say.
 */
export const skillModifier = (sheet: CharacterSheet, skill: string): number | undefined => {
  const name = skill.trim().toLowerCase();
  const held = sheet.skills?.find((row) => row.name.trim().toLowerCase() === name);
  const bonus = signedNumber(held?.bonus);
  if (bonus !== undefined) return bonus;
  const keyed =
    held?.ability ??
    STANDARD_SKILLS.find(([standard]) => standard.toLowerCase() === name)?.[1] ??
    ABILITY_NAMES[name] ??
    (name.length === 3 ? name : undefined);
  if (keyed === undefined) return undefined;
  return signedNumber(abilityCell(sheet, keyed)?.modifier);
};

/** A character's saving throw with this ability: the save written on the sheet, else the modifier. */
export const saveModifier = (sheet: CharacterSheet, ability: AbilityKey): number | undefined => {
  const cell = abilityCell(sheet, ability);
  return signedNumber(cell?.save) ?? signedNumber(cell?.modifier);
};
