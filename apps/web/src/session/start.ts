import type { CampaignId } from "@taverns/api";
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
 * 1. **The session**, numbered one past the highest that exists.
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
 * One past the highest session this campaign has had.
 *
 * The only thing `sessions.list` is read for, on either surface — which is why
 * it is a function here rather than a line in both dialogs.
 */
export const nextSessionNumber = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.map(
    client.sessions.list({ params: { campaignId } }),
    (rows) => rows.reduce((highest, row) => Math.max(highest, row.number), 0) + 1,
  );

/**
 * Open a night, and hand back the id of it.
 *
 * The created row is deliberately not what comes back: its `startedAt` is null,
 * because the stamp is the request after it, so returning the row would hand
 * every caller a session that says it has not started.
 */
export const startSession = (campaignId: CampaignId, number: number) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const session = yield* client.sessions.create({
      params: { campaignId },
      payload: { number },
    });

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
