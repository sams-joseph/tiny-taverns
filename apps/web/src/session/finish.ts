import type { CampaignId, Session } from "@taverns/api";
import { DateTime, Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * Finishing the night — the one transition, written once.
 *
 * Two surfaces reach it: `run/EndRunDialog.tsx`, where it is the larger of the
 * two endings a DM can choose while taking a fight off the table, and
 * `campaign/FinishSessionDialog.tsx`, for the night that ends without a fight to
 * end it through — prep, notes and roleplay all happen outside an encounter, and
 * a fight that finished at nine o'clock does not finish the evening.
 *
 * It is a module of its own rather than a helper inside either screen because
 * those two are the *first* two, not the last: a client that stamped `endedAt`
 * its own way would be a second answer to a question the server already answers,
 * and the place the two would first disagree is a night that half-ended.
 *
 * **The server owns the rest of the transition, and that is the point.** In the
 * same transaction that stamps the end time, `apps/server/src/repo/Sessions.ts`
 * clears `campaign.current_session_id` (`releaseIfFinished`) *and* takes a fight
 * still on the table off it, as `carried` (`carryLiveRun`).
 * `campaign_current_session_id_fkey` refuses the first pair coming apart at all
 * — see `migrations/0006_session_finished.ts`. So there is nothing on this side
 * but the stamp, and a third surface added later inherits the whole transition
 * by calling this.
 *
 * **A live fight no longer stops the night, and this file used to be where it
 * did.** `liveRunIn` lived here and both callers checked it — once from the run
 * the screen had already loaded, once by re-reading at submit time for a fight
 * started in another tab. Its own doc said the refusal was standing in for a
 * product question nobody had answered. The captain answered it: a fight can
 * carry across nights. So the refusal is gone, and with it the tab-race
 * re-read — a client cannot forget a step the server performs, and a second
 * client would never have seen the first one do it.
 *
 * **A session already finished is not written again.** Both callers can reach a
 * night that ended in another tab, and re-stamping it would move the end time to
 * now for no reason the DM asked for.
 */
export const finishSession =
  (campaignId: CampaignId, session: Session) => (client: TavernsClient) =>
    session.endedAt !== null
      ? Effect.succeed(session)
      : Effect.gen(function* () {
          const endedAt = yield* DateTime.now;
          return yield* client.sessions.update({
            params: { campaignId, sessionId: session.id },
            payload: { endedAt },
          });
        });
