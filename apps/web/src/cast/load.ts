import type { CampaignId, NpcId } from "@taverns/api";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom } from "../api/atoms";
import { reads } from "../api/keys";

/**
 * The cast's reads, as atoms — `Atom.family` at module scope, keyed on what
 * each read closes over, exactly as `campaign/load.ts` does.
 *
 * Two atoms and no combination: the list is the Cast screen's `extra` and one
 * row is the NPC screen's, and neither needs the other. The rehearsal
 * transcript is deliberately *not* an atom — like Hob's it is read by the hook
 * that streams into it (`cast/rehearsal.ts`), because a refresh would replace
 * the reply the creator is watching arrive.
 */

export const npcsAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.npcs.list({ params: { campaignId }, query: {} }),
    [reads.npcs(campaignId)],
  ),
);

interface OneNpc {
  readonly campaignId: CampaignId;
  readonly npcId: NpcId;
}

/**
 * One NPC. Named on both its own key and the list's, so an edit made on the
 * detail screen redraws the card behind it and an archive made on the list
 * redraws the detail — a write names `reads.npc` and `reads.npcs` together.
 */
export const npcAtom = Atom.family((at: OneNpc) =>
  apiAtom(
    (client) => client.npcs.findById({ params: at }),
    [reads.npc(at.npcId), reads.npcs(at.campaignId)],
  ),
);
