import type { CampaignId, SessionId } from "@taverns/api";
import { Loading } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { loadPlayerRecap } from "./load";
import { NightBody } from "./NightBody";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * One night, as somebody who played in it is told it.
 *
 * **`recap.readAsPlayer`, and there is no path from this file to the DM's
 * read.** That is the whole safety property of this screen: `recap.read` is
 * behind the creator gate — reaching for it here would 404 rather than leak,
 * but the narrow endpoint exists precisely so nothing has to rely on that. Its
 * beats are only the ones the DM shared, and a run it answers carries the
 * encounter's name only when that encounter is Shared and Ready, so
 * `NightBody` draws what arrived and decides nothing about who may see it.
 */

/**
 * One night, read back — the player's projection, keyed on the pair that names it.
 *
 * A **record** key, which `Atom.family` compares structurally (see
 * `api/atoms.ts`). Module scope, because an atom is its own identity: built in
 * the component it would be a fresh one every render and load forever.
 */
const playerRecapAtom = Atom.family(
  ({ campaignId, sessionId }: { readonly campaignId: CampaignId; readonly sessionId: SessionId }) =>
    apiAtom(loadPlayerRecap(campaignId, sessionId), [reads.recap(sessionId)]),
);

export function PlayerRecapBody({
  campaignId,
  sessionId,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
}) {
  const [resource, reload] = useApiAtom(playerRecapAtom({ campaignId, sessionId }));

  if (resource.state === "loading") return <Loading label="Reading the night back…" inline />;
  if (resource.state === "failed") {
    return <ApiFailureNotice failure={resource.failure} onRetry={reload} />;
  }

  const recap = resource.value;
  return (
    <NightBody
      audience={{ kind: "player" }}
      beats={recap.beats}
      runs={recap.fights.map((fight) => fight.run)}
    />
  );
}
