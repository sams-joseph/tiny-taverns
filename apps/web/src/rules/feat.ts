import type { Feat } from "@taverns/api";

export const isLibraryFeatOriginal = (feat: Feat): boolean =>
  feat.accountId !== null && feat.campaignId === null;

export const isCampaignFeatCopy = (feat: Feat): boolean => feat.campaignId !== null;

export const featPrerequisiteLine = (feat: Feat): string =>
  feat.prerequisites.length === 0
    ? "No prerequisites"
    : feat.prerequisites
        .map((prerequisite) => `${prerequisite.ability.name} ${String(prerequisite.minimumScore)}`)
        .join(", ");
