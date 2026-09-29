import type { CampaignId, Session, SessionId } from "@taverns/api";
import { DateTime, Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * Opening the night — the one transition, written once. The mirror of
 * `finish.ts`, and here for the same reason it is.
 *
 * Two surfaces reach it. `campaign/StartSessionDialog.tsx` is the plain one: the
 * night starts in a tavern, there is no fight in sight, and there may not even be
 * an encounter built yet. `campaign/StartRunDialog.tsx` is the other, for the DM
 * who goes straight from a cold campaign to a fight — putting an encounter on the
 * table needs a night to hang it off, so it opens one on the way.
 *
 * **Starting the night and putting a fight on the table are two acts.** They used
 * to be one, and a session could not be started at all without choosing an
 * encounter; an evening that opens over roleplay could not be recorded. So the
 * second door exists, and this is what both of them go through — a client that
 * opened a night its own way would be a second answer to which night it is, and
 * the first place the two would disagree is the campaign's pointer.
 *
 * ### Three statements, in this order, and only the last is best effort
 *
 * 1. **The session**: the planned night when there is one (a night Hob planned
 *    and the DM kept, which nothing points at and nobody has played), or else
 *    a new one, numbered one past the highest that exists. A planned night is
 *    opened, never passed over, so its checklist is the one the DM sits down
 *    with.
 * 2. **`campaign.currentSessionId`**, pointed at it. Fatal on purpose: the prep
 *    checklist, the session card and the campaign row all read the night off the
 *    campaign, so a session nothing points at is a night the DM cannot find
 *    again.
 * 3. **`startedAt`**, stamped. `Effect.ignore`, so a timestamp that will not save
 *    is never why a DM is told their session did not start — it is a record of
 *    something that has already happened, and anything that would genuinely deny
 *    this write has already denied the two above it.
 *
 * `SessionCreate` carries no `startedAt`, which is why the stamp is a second
 * request rather than a field.
 */

/**
 * The night *Start the night* opens: its number, and its id when it already
 * exists because it was planned.
 */
export interface NightToOpen {
  readonly number: number;
  /** The planned night this opens; absent when opening makes a new one. */
  readonly planned?: SessionId;
}

/**
 * The planned nights, earliest first: every night that has neither started nor
 * ended. Hob's kept nights are these (`proposeNight`); the Next session card
 * lists each with its checklist while no night is open.
 */
export const plannedNightsOf = (sessions: ReadonlyArray<Session>): ReadonlyArray<Session> =>
  sessions
    .filter((row) => row.startedAt === null && row.endedAt === null)
    .sort((a, b) => a.number - b.number);

/**
 * The planned night *Start the night* opens: the earliest of
 * {@link plannedNightsOf}, so the card and the opening cannot disagree.
 */
export const plannedNightOf = (sessions: ReadonlyArray<Session>): Session | undefined =>
  plannedNightsOf(sessions)[0];

/**
 * The night opening would open: the planned one, or one past the highest
 * session this campaign has had.
 *
 * The only thing `sessions.list` is read for, on either surface — which is why
 * it is a function here rather than a line in both dialogs.
 */
export const nightToOpen = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.map(client.sessions.list({ params: { campaignId } }), (rows): NightToOpen => {
    const planned = plannedNightOf(rows);
    return planned === undefined
      ? { number: rows.reduce((highest, row) => Math.max(highest, row.number), 0) + 1 }
      : { number: planned.number, planned: planned.id };
  });

/**
 * Open a night, and hand back the id of it.
 *
 * The created row is deliberately not what comes back: its `startedAt` is null,
 * because the stamp is the request after it, so returning the row would hand
 * every caller a session that says it has not started.
 */
export const startSession =
  (campaignId: CampaignId, night: NightToOpen) => (client: TavernsClient) =>
    Effect.gen(function* () {
      const session =
        night.planned === undefined
          ? yield* client.sessions.create({
              params: { campaignId },
              payload: { number: night.number },
            })
          : { id: night.planned };

      yield* client.campaigns.update({
        params: { campaignId },
        payload: { currentSessionId: session.id },
      });

      const now = yield* DateTime.now;
      yield* Effect.ignore(
        client.sessions.update({
          params: { campaignId, sessionId: session.id },
          payload: { startedAt: now },
        }),
      );

      return session.id;
    });
