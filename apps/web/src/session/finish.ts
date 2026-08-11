import type { CampaignId, EncounterRun, Session } from "@taverns/api";
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
 * **The server owns the rest of the transition, and that is the point.**
 * `Sessions.releaseIfFinished` clears `campaign.current_session_id` in the same
 * transaction that stamps the end time, and `campaign_current_session_id_fkey`
 * refuses the two coming apart at all — see `apps/server/src/repo/Sessions.ts`
 * and `migrations/0006_session_finished.ts`. So there is nothing on this side but
 * the stamp, and a third surface added later inherits the whole transition by
 * calling this.
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

/**
 * The fight still on the table, if there is one — the single thing that stops
 * the night being finished.
 *
 * **Refusing is deliberate, and it is the safe half of an open question.**
 * Ending the run as a side effect would throw away the DM's turn marker and
 * round count without being asked; refusing throws away nothing, and the DM can
 * always end the fight and then the night. Whether a live fight should instead
 * be able to *carry across* into the next session is a real product question
 * nobody has answered — `AGENTS.md` records it as deferred. Nothing here should
 * quietly grow into that.
 *
 * `encounter_run_one_live_per_session` is a partial unique index, so "the
 * unended one" is at most one row — the same rule `campaign/load.ts` reads the
 * live fight by.
 */
export const liveRunIn = (runs: ReadonlyArray<EncounterRun>): EncounterRun | undefined =>
  runs.find((run) => run.endedAt === null);
