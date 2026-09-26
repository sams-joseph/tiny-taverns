import type {
  EncounterRun,
  EncounterRunCheck,
  PlayerRecapFight,
  RecapFight,
  RecapRunLink,
  RecapScene,
} from "@taverns/api";
import { challengeTally } from "@taverns/api";
import { saveLabel, sceneBadge } from "../run/scene";

/**
 * How a fight is told, and the one number in this screen that is easy to get
 * wrong.
 *
 * ### A carried fight is two runs, and each end reads a different round
 *
 * A fight that crossed a night is two `encounter_run` rows joined by
 * `continuedFrom` (`0007_run_carryover.ts`), and `RecapRunLink` carries the
 * **other** run's round because neither end can see it otherwise. `Recap.ts`
 * spells out what that round means, and it is not the same thing at the two
 * ends:
 *
 * - **Looking back**, from the night that picked the fight up, the predecessor
 *   is ended and its round is frozen at the moment the night finished — the
 *   round the fight *paused* on. That is `continuedFrom.round`, and it is what
 *   *"resumed from round 4 of session 12"* means.
 * - **Looking forward**, from the night the fight paused on, the successor is a
 *   fight that may still be going, so its round is wherever it has got to
 *   *since*. That is `continuedInto.round`, and it is emphatically **not** the
 *   round this night's fight paused at.
 *
 * So the round a predecessor's card reports as the pause is `run.round`, its
 * own — never the link's. Reaching for `continuedInto.round` there compiles, is
 * an `Int`, renders, and is wrong by however many rounds the fight has run
 * since: on the night it paused it would report a round that had not happened
 * yet. `fight.test.ts` pins both directions with numbers that differ, which is
 * the only way that assertion says anything.
 *
 * The state itself is read from `run.endedReason` and never guessed from
 * `endedAt` — `EncounterRun.ts` records why that column exists, and a recap that
 * guessed would report a fight the party is still standing in as concluded.
 *
 * ### One implementation, two audiences
 *
 * `RecapFight` and `PlayerRecapFight` differ in their combatants and in a
 * scene's log — the run and both links are the same values on both, by
 * `PlayerRecap.ts`'s own decision ("nothing on a run is a number the DM was
 * keeping"). So `fightStory` takes the fields it actually reads, the scene and
 * its checks only where the reader's recap has them, and **the DM's Chronicle
 * and the player's tell a carried fight with the same code**. A second copy narrowed for the player
 * would be a second chance to swap the two rounds, and the swap is invisible:
 * both are `Int`s, both render, and only a fixture whose numbers differ can tell
 * them apart. `fight.test.ts` is that fixture, and it now covers both callers.
 *
 * ### A scene is told by its kind
 *
 * A conversation, a skill challenge or a hazard (`run.mode`) takes no turns, so
 * it is never told by a round. To the DM it ends the way its log counts: a
 * challenge made or lost against its own numbers (with the prep's "If they
 * make it" line, only when written), a hazard by the stages it lasted. A
 * player is told its kind and that it ended — the scene's numbers are the
 * creator's (the captain's decision of 2026-09-25).
 */
export interface CarriedFight {
  readonly run: EncounterRun;
  readonly continuedFrom: RecapRunLink | null;
  readonly continuedInto: RecapRunLink | null;
  /**
   * A scene's state and its log — the DM's recap has them (`RecapFight`), and
   * a player's has no field for either (`PlayerRecapFight`), so the same
   * `fightStory` tells a player a scene's kind and how it ended and nothing it
   * was counted by.
   */
  readonly scene?: RecapScene | null;
  readonly checks?: ReadonlyArray<EncounterRunCheck>;
}

export interface FightStory {
  /** What the fight was called that night — the snapshot, not the template's name now. */
  readonly name: string;
  /** The kind of scene, `"Skill challenge"`; `null` for a fight, which is the default. */
  readonly kind: string | null;
  /** Where it stands, as one sentence. */
  readonly state: string;
  /**
   * The skill challenge's authored "If they make it" or "If it goes wrong"
   * line, once it settled that way. Never borrowed from anywhere else.
   */
  readonly outcome: string | null;
  /**
   * A scene's log counted — the DM's alone, and `null` whenever there is no
   * log to count (a fight, or a player's recap).
   */
  readonly tally: string | null;
  /** Set when this fight was picked up from an earlier night. */
  readonly resumedFrom: string | null;
  /** Set when a later night picked this fight up. */
  readonly carriedInto: string | null;
  /** True while the fight is still on the table. */
  readonly live: boolean;
}

const rounds = (n: number): string => `round ${String(n)}`;

const counted = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? "" : "s"}`;

/** `"stage 2 of 4"`, when the hazard began; `null` when its length was never set. */
const stageOf = (scene: RecapScene | null | undefined): string | null =>
  scene?.stage == null || scene.stages === null
    ? null
    : `stage ${String(scene.stage)} of ${String(scene.stages)}`;

/**
 * How a scene that was not a fight ended, from what the reader's recap holds.
 * A player's holds no scene, so they are told it ended and not how it went.
 */
const sceneEnd = (
  fight: CarriedFight,
): { readonly state: string; readonly outcome: string | null } => {
  const { run, scene } = fight;
  const challenge = scene?.challenge ?? null;
  if (run.mode === "challenge" && challenge?.kind === "challenge") {
    const { settled } = challengeTally(challenge, fight.checks ?? []);
    if (settled === "won") return { state: "They made it.", outcome: challenge.onSuccess ?? null };
    if (settled === "lost")
      return { state: "It went wrong.", outcome: challenge.onFailure ?? null };
    return { state: "Ended before it was settled.", outcome: null };
  }
  if (run.mode === "hazard" && scene != null) {
    if (scene.stage === null || scene.stages === null) {
      return { state: "Ended before it began.", outcome: null };
    }
    return {
      state:
        scene.stage >= scene.stages
          ? `Lasted ${counted(scene.stages, "stage")}.`
          : `Ended at ${stageOf(scene) ?? ""}.`,
      outcome: null,
    };
  }
  return {
    state: run.mode === "social" ? "Talked through to its end." : "Played to its end.",
    outcome: null,
  };
};

/**
 * A scene's log, counted for the DM: a challenge against its numbers, a
 * hazard's saves against its DC, a conversation's checks and the attitude the
 * DM last noted. `null` for a fight and for a recap with no log on it.
 */
const sceneTally = (fight: CarriedFight): string | null => {
  const { run, scene, checks } = fight;
  if (run.mode === "combat" || checks === undefined) return null;
  const passed = checks.filter((check) => check.outcome === "success").length;
  const failed = checks.length - passed;
  const challenge = scene?.challenge ?? null;
  if (run.mode === "challenge" && challenge?.kind === "challenge") {
    return `${String(passed)} of ${String(challenge.successes)} successes and ${String(
      failed,
    )} of ${String(challenge.failures)} failures, at DC ${String(challenge.dc)}.`;
  }
  const noun = run.mode === "hazard" ? "save" : "check";
  const log =
    checks.length === 0
      ? `No ${noun}s logged.`
      : run.mode === "hazard"
        ? `${counted(checks.length, noun)}: ${String(passed)} passed, ${String(failed)} failed.`
        : `${counted(checks.length, noun)}: ${String(passed)} succeeded, ${String(failed)} failed.`;
  if (run.mode === "hazard" && challenge?.kind === "hazard") {
    return `${saveLabel(challenge.save)}. ${log}`;
  }
  if (run.mode === "social" && scene?.attitude != null) {
    return `${log} Last noted as ${scene.attitude}.`;
  }
  return log;
};

export const fightStory = (fight: CarriedFight): FightStory => {
  const { run, continuedFrom, continuedInto } = fight;
  const live = run.endedAt === null;

  // A conversation, a skill challenge or a hazard has no rounds to tell:
  // `run.round` is never advanced in one, so saying it would be a number
  // nothing happened by.
  if (run.mode !== "combat") {
    const stage = run.mode === "hazard" ? stageOf(fight.scene) : null;
    const end = live || run.endedReason === "carried" ? null : sceneEnd(fight);
    return {
      name: run.encounterName,
      kind: sceneBadge(run.mode),
      state: live
        ? stage === null
          ? "On the table now."
          : `On the table now, at ${stage}.`
        : end === null
          ? stage === null
            ? "Paused when the night ended."
            : `Paused at ${stage} when the night ended.`
          : end.state,
      outcome: end?.outcome ?? null,
      tally: sceneTally(fight),
      live,
      resumedFrom:
        continuedFrom === null
          ? null
          : `Resumed from session ${String(continuedFrom.sessionNumber)}.`,
      carriedInto:
        continuedInto === null
          ? null
          : `Session ${String(continuedInto.sessionNumber)} picked it up.`,
    };
  }

  const state = live
    ? `On the table now, at ${rounds(run.round)}.`
    : run.endedReason === "carried"
      ? // `run.round` — this run's own, frozen when the night ended. The round
        // the fight paused on is a fact about *this* night, and the successor's
        // round says nothing about it.
        `Paused at ${rounds(run.round)} when the night ended.`
      : `Fought to a finish, in ${rounds(run.round)}.`;

  return {
    name: run.encounterName,
    kind: null,
    state,
    outcome: null,
    tally: null,
    live,
    // The predecessor's frozen round: what "resumed from" has always meant.
    resumedFrom:
      continuedFrom === null
        ? null
        : `Resumed from ${rounds(continuedFrom.round)} of session ${String(continuedFrom.sessionNumber)}.`,
    // "has reached", not "is at": the successor may have ended too, and the
    // link carries no end time to tell them apart. What is true either way is
    // that the fight got that far.
    carriedInto:
      continuedInto === null
        ? null
        : `Session ${String(continuedInto.sessionNumber)} picked it up, and it has reached ${rounds(continuedInto.round)} there.`,
  };
};

/**
 * Who was left standing, as the recap counts it.
 *
 * A combatant at zero hit points is one who ended the fight down — `hpCurrent`
 * says that without a derived flag beside it to disagree with (`Recap.ts`).
 * Nobody is counted as removed: those rows are really deleted, and the recap
 * deliberately does not reconstruct them.
 */
export const standing = (fight: RecapFight): { readonly total: number; readonly down: number } => ({
  total: fight.combatants.length,
  down: fight.combatants.filter((combatant) => combatant.hpCurrent === 0).length,
});

/**
 * The same count, from what a player is told.
 *
 * **Not the DM's `standing` with a cast.** A player's monster carries an
 * `hpBand` and no number at all (`PlayerRecap.ts` — armour class and exact hit
 * points are absent from the type, not optional), so "how many ended the night
 * down" is a different expression over a different shape: `down` for a monster,
 * zero for one of the party. Writing it as one function over a widened type is
 * how a screen ends up reaching for a field the player projection refuses to
 * carry.
 */
export const playerStanding = (
  fight: PlayerRecapFight,
): { readonly total: number; readonly down: number } => ({
  total: fight.combatants.length,
  down: fight.combatants.filter((combatant) =>
    combatant.kind === "pc" ? combatant.hpCurrent === 0 : combatant.hpBand === "down",
  ).length,
});
