import type { CampaignAct, Session } from "@taverns/api";

/**
 * The nights under their acts: *"Act II · The salt road", Sessions 7–12*.
 *
 * An act is where it starts (`CampaignAct.ts`): a night belongs to the act
 * with the highest start at or below its number, and nights older than every
 * act belong to none — they are drawn without a heading, as a campaign with
 * no acts at all is. So this is arithmetic over what the reader was answered,
 * and the same function groups both Chronicles.
 *
 * **A player is answered only shared acts and shared nights**, and groups over
 * those. A night that sits in an act the DM kept back therefore reads, to a
 * player, as part of the shared act before it. Telling them otherwise would
 * need the unshared act's start, which is exactly what keeping it back hides.
 *
 * **An act holding none of the reader's nights is not drawn.** For a player
 * that is an act whose nights are all kept back; for the DM, one whose nights
 * were all deleted or renumbered away, which starts at a gap until a night
 * reaches its number again.
 */
export interface ActGroup {
  /** `undefined` for the nights older than every act. */
  readonly act: CampaignAct | undefined;
  /** Newest first, in the order the reader was answered them. */
  readonly sessions: ReadonlyArray<Session>;
}

/**
 * Groups nights answered newest first, newest group first. The acts may come
 * in any order: each night looks for its own.
 */
export const groupByAct = (
  sessions: ReadonlyArray<Session>,
  acts: ReadonlyArray<CampaignAct>,
): ReadonlyArray<ActGroup> => {
  const groups: Array<{ act: CampaignAct | undefined; sessions: Array<Session> }> = [];
  for (const session of sessions) {
    const act = actOf(session.number, acts);
    const last = groups.at(-1);
    if (last !== undefined && last.act?.id === act?.id) last.sessions.push(session);
    else groups.push({ act, sessions: [session] });
  }
  return groups;
};

/** The act a night numbered `number` falls in, if any. */
const actOf = (number: number, acts: ReadonlyArray<CampaignAct>): CampaignAct | undefined =>
  acts.reduce<CampaignAct | undefined>(
    (best, act) =>
      act.firstSessionNumber <= number &&
      (best === undefined || act.firstSessionNumber > best.firstSessionNumber)
        ? act
        : best,
    undefined,
  );

/**
 * The span an act's heading states, over the nights this reader holds in it:
 * *"Sessions 7–12"*, or *"Session 7"* for one.
 */
export const rangeOf = (sessions: ReadonlyArray<Session>): string => {
  const numbers = sessions.map((session) => session.number);
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  return low === high ? `Session ${String(low)}` : `Sessions ${String(low)}–${String(high)}`;
};

/** The act that starts at this night, if one does. */
export const actStartingAt = (
  session: Session,
  acts: ReadonlyArray<CampaignAct>,
): CampaignAct | undefined => acts.find((act) => act.firstSessionNumber === session.number);
