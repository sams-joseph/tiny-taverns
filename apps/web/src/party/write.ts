import type { CampaignId } from "@taverns/api";
import { reads, type Invalidation } from "../api/keys";

/**
 * What the party's long rest changed: every seat's numbers, and the creator's
 * own *My characters*, since their own seated character rests too and that
 * roster is not on the Party screen to notice.
 */
export const partyRestWrites = (campaignId: CampaignId): Invalidation => [
  reads.party(campaignId),
  reads.myCharacters,
];
