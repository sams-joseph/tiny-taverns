import type { CampaignId, SessionId } from "@taverns/api";
import { Loading } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { loadRecap } from "./load";
import { NightBody } from "./NightBody";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * One night, read back — **the DM's projection.**
 *
 * **Mounted only while its card is open**, which is what makes the recap a
 * per-card read rather than one of twenty fired to draw the list — see
 * `load.ts`. Closing the card unmounts this and the next open re-reads, which is
 * correct rather than wasteful: a recap is a view assembled per read and has no
 * stored version to go stale against.
 *
 * `recap.read` is behind the creator gate and answers every beat of the night,
 * shared or not, which is what lets `NightBody` put the kept ones in the DM's
 * box. The layout is `NightBody`'s, shared with `PlayerRecapBody`.
 */

/**
 * One night, read back — the DM's projection, keyed on the pair that names it.
 *
 * A **record** key, which `Atom.family` compares structurally (see
 * `api/atoms.ts`). Module scope, because an atom is its own identity: built in
 * the component it would be a fresh one every render and load forever.
 */
const recapAtom = Atom.family(
  ({ campaignId, sessionId }: { readonly campaignId: CampaignId; readonly sessionId: SessionId }) =>
    apiAtom(loadRecap(campaignId, sessionId), [reads.recap(sessionId)]),
);

export function RecapBody({
  campaignId,
  sessionId,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
}) {
  const [resource, reload] = useApiAtom(recapAtom({ campaignId, sessionId }));

  if (resource.state === "loading") return <Loading label="Reading the night back…" inline />;
  if (resource.state === "failed") {
    return <ApiFailureNotice failure={resource.failure} onRetry={reload} />;
  }

  const recap = resource.value;
  return (
    <NightBody
      audience={{ kind: "dm", campaignId }}
      beats={recap.beats}
      runs={recap.fights.map((fight) => fight.run)}
    />
  );
}
