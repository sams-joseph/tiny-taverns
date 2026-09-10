import type {
  SharedWorld,
  SharedWorldCampaignCard,
  SharedWorldId,
  SharedWorldMember,
} from "@taverns/api";
import { Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom } from "../api/atoms";
import { reads } from "../api/keys";

/**
 * The Shared World reads, cut the way the screens want them.
 *
 * `sharedWorldsAtom` is every explicit world this account is a live member of,
 * with `isOwner` on each row. `sharedWorldViewAtom` is one world's whole screen:
 * the row, the campaign directory and the roster, one value with three states,
 * because founding a campaign moves the directory and — for the founder — the
 * relation on its card. The roster is informational; campaign invitations are
 * the product's onboarding surface.
 */

export const sharedWorldsAtom = apiAtom(
  (client) => client.sharedWorlds.list(),
  [reads.mySharedWorlds],
);

export interface SharedWorldView {
  readonly sharedWorld: SharedWorld;
  readonly campaigns: ReadonlyArray<SharedWorldCampaignCard>;
  readonly members: ReadonlyArray<SharedWorldMember>;
}

export const sharedWorldViewAtom = Atom.family((worldId: SharedWorldId) =>
  apiAtom(
    (client) =>
      Effect.map(
        Effect.all(
          {
            sharedWorld: client.sharedWorlds.findById({ params: { worldId } }),
            campaigns: client.sharedWorlds.campaigns({ params: { worldId } }),
            members: client.sharedWorldMembers.list({ params: { worldId } }),
          },
          { concurrency: "unbounded" },
        ),
        ({ sharedWorld, campaigns, members }): SharedWorldView => ({
          sharedWorld,
          campaigns,
          members,
        }),
      ),
    [reads.sharedWorld(worldId), reads.mySharedWorlds],
  ),
);
