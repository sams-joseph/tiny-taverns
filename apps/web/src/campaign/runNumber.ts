import type { CampaignId } from "@taverns/api";
import { Effect } from "effect";
import { Atom } from "effect/reactivity";
import { apiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { nightToOpen, type NightToOpen } from "../session/start";

/**
 * The night a fight goes on, and the number it will carry — `StartRunDialog`'s
 * and `PickUpRunDialog`'s, which may each have to open one (the planned night
 * when there is one, `nightToOpen`).
 *
 * **Read from the server only when a session has to be invented**, because that
 * is the only thing the answer is for; with one already open it is that
 * session's, and no request. That branch is in the *key* rather than in the
 * component, so "already known" and "must be asked" are two different atoms
 * rather than one atom that changes its mind.
 */
export const runNumberAtom = Atom.family(
  ({
    campaignId,
    known,
  }: {
    readonly campaignId: CampaignId;
    readonly known: number | undefined;
  }) =>
    apiAtom(
      (client) =>
        known === undefined
          ? nightToOpen(campaignId)(client)
          : Effect.succeed<NightToOpen>({ number: known }),
      [reads.sessions(campaignId)],
    ),
);
