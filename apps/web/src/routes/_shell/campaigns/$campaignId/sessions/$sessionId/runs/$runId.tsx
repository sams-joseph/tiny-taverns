import { createFileRoute } from "@tanstack/react-router";
import { runParams } from "../../../../../../-params";
import { RunScreen } from "../../../../../../../run/RunScreen";

/**
 * The fight, named by all three ids.
 *
 * **The runner names all three ids, and that is what makes a mid-fight reload
 * work.** A laptop lid closes, a browser updates, a tab is restored a day
 * later: the URL alone finds the fight again, with no local state and no
 * "which one was I running?" lookup. It is also the shape the API already has —
 * campaign, session, run — so the route decodes straight into the path params
 * every live endpoint takes.
 *
 * Remounted per run: the stream, the log and the optimistic hit points all
 * belong to one fight and none of them may survive into another.
 */
export const Route = createFileRoute(
  "/_shell/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
)({
  params: runParams,
  component: RunScreen,
  remountDeps: ({ params }) => params.runId,
});
