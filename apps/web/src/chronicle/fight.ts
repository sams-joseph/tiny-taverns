import type { EncounterRun, PlayerRecapFight, RecapFight, RecapRunLink } from "@taverns/api";

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
 * `RecapFight` and `PlayerRecapFight` differ only in their combatants — the run
 * and both links are the same values on both, by `PlayerRecap.ts`'s own decision
 * ("nothing on a run is a number the DM was keeping"). So `fightStory` takes the
 * three fields it actually reads and **the DM's Chronicle and the player's tell
 * a carried fight with the same code**. A second copy narrowed for the player
 * would be a second chance to swap the two rounds, and the swap is invisible:
 * both are `Int`s, both render, and only a fixture whose numbers differ can tell
 * them apart. `fight.test.ts` is that fixture, and it now covers both callers.
 */
export interface CarriedFight {
  readonly run: EncounterRun;
  readonly continuedFrom: RecapRunLink | null;
  readonly continuedInto: RecapRunLink | null;
}

export interface FightStory {
  /** What the fight was called that night — the snapshot, not the template's name now. */
  readonly name: string;
  /** Where it stands, as one sentence. */
  readonly state: string;
  /** Set when this fight was picked up from an earlier night. */
  readonly resumedFrom: string | null;
  /** Set when a later night picked this fight up. */
  readonly carriedInto: string | null;
  /** True while the fight is still on the table. */
  readonly live: boolean;
}

const rounds = (n: number): string => `round ${String(n)}`;

export const fightStory = (fight: CarriedFight): FightStory => {
  const { run, continuedFrom, continuedInto } = fight;
  const live = run.endedAt === null;

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
    state,
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
