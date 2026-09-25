import type { Conflict, EncounterRun, EncounterRunStart, NotFound, SessionId } from "@taverns/api";
import { Effect } from "effect";
import { Combatants } from "../../src/repo/Combatants.js";
import type { CampaignCreatorActor } from "../../src/repo/CreatorActor.js";
import { EncounterRuns } from "../../src/repo/EncounterRuns.js";

/**
 * A fight taking turns: started, every combatant without a number given 0, and
 * round 1 begun — what `start` alone produced before fights had an initiative
 * phase, for tests about what happens once turns are being taken.
 *
 * Every row at 0 leaves the order to the tie rule (`initiativeOrderKeys`):
 * bonus, then the players, then seed order. A test that cares about the order
 * sets the numbers itself.
 */
export const aFightUnderWay = (
  dm: CampaignCreatorActor,
  sessionId: SessionId,
  payload: EncounterRunStart,
): Effect.Effect<EncounterRun, NotFound | Conflict, EncounterRuns | Combatants> =>
  Effect.gen(function* () {
    const runs = yield* EncounterRuns;
    const combatants = yield* Combatants;
    const run = yield* runs.start(dm, sessionId, payload);
    if (run.phase === "turns") return run;
    const unset = (yield* combatants.list(dm, sessionId, run.id)).filter(
      (combatant) => combatant.initiative === null,
    );
    if (unset.length > 0) {
      yield* combatants.setInitiative(dm, sessionId, run.id, {
        entries: unset.map((combatant) => ({ combatantId: combatant.id, initiative: 0 })),
      });
    }
    return yield* runs.begin(dm, sessionId, run.id, {});
  });
