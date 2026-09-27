import type { Session } from "@taverns/api";

/**
 * The newest night that has ended, by number, of the nights this reader holds;
 * zero before any has. The server stamps a story with the same number when it
 * is written (`afterSessionNumber`), so the two compare directly.
 */
export const newestEnded = (sessions: ReadonlyArray<Session>): number =>
  sessions.reduce(
    (newest, session) =>
      session.endedAt !== null && session.number > newest ? session.number : newest,
    0,
  );

/**
 * Whether a newer night has ended than the story was written after — the DM's
 * *Update needed*, and the moment *Previously* stops opening the next night.
 *
 * A player holds only the nights their DM shared, so on their side this can
 * only err towards keeping a *Previously* for a night they cannot see yet.
 */
export const storyIsStale = (
  afterSessionNumber: number,
  sessions: ReadonlyArray<Session>,
): boolean => newestEnded(sessions) > afterSessionNumber;
