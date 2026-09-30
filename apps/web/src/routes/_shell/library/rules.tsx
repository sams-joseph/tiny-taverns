import { createFileRoute } from "@tanstack/react-router";
import { OptionLibraryScreen } from "../../../rules/OptionLibraryScreen";

/**
 * The other half of the same shelf: **the classes, races and backgrounds this
 * account has written**, in no campaign either.
 *
 * A second shelf under the global Library destination: the two read different
 * tables through the same predicate, and neither list can ever contain a row of
 * the other's. The global bar therefore stays on *Library* while this screen's
 * own tabs name the shelf.
 *
 * `/library/rules` and not `/library/options`, though the endpoint is
 * `GET /library/options`: the web routes have called this vocabulary *rules*
 * since the campaign screen shipped at `/campaigns/$campaignId/rules`, and one
 * word for one thing across the two levels is worth more than matching the
 * wire.
 *
 * No `remountDeps`, for the Library index's reason: there is no id for a
 * different one of to exist.
 */
export const Route = createFileRoute("/_shell/library/rules")({
  component: OptionLibraryScreen,
});
