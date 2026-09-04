import type { CampaignMembership, OwnedCharacter } from "@taverns/api";

/** Campaigns where this owned character is not already seated. */
export const campaignsAvailableToJoin = (
  owned: OwnedCharacter,
  memberships: ReadonlyArray<CampaignMembership>,
): ReadonlyArray<CampaignMembership> => {
  const seated = new Set(owned.seats.map((seat) => seat.campaignId));
  return memberships.filter((membership) => !seated.has(membership.campaign.id));
};
