import type { Campaign } from "@taverns/api";
import type { ReactNode } from "react";
import { monthOf } from "../chronicle/format";
import { OverviewHero } from "./OverviewParts";

/**
 * The top of the campaign's Overview: `OverviewHero` over the campaign's row.
 *
 * **One hero for both audiences; only the actions differ.** The creator's are
 * the campaign's management as outline buttons (`CampaignSettingsButtons`); a
 * player's is the one door they have from here, *New character*
 * (`play/PlayerCampaignScreen.tsx`). Everything else it reads is `Campaign`,
 * which a player is answered whole, so there is no narrower header to draw.
 *
 * ### What the drawing's header asks for that the data does not have
 *
 * Its meta line reads *"D&D 5e · Every other Thursday · Since March 2026"*. The
 * ruleset is the only one the product plays, so it is a constant, not a fact
 * about this campaign, and was left out (the captain's answer to the plan's
 * question 7); nothing stores a schedule. What the line carries is the party's
 * name, which the per-screen subtitle used to, and how long the table has been
 * running, from `createdAt`.
 */
export function CampaignHero({
  campaign,
  children,
}: {
  readonly campaign: Campaign;
  /** The header's actions, at its far end. */
  readonly children: ReactNode;
}) {
  return (
    <OverviewHero
      image={campaign.image}
      imagePending={campaign.imagePending}
      meta={[campaign.partyName, `Since ${monthOf(campaign.createdAt)}`]}
      name={campaign.name}
      description={campaign.description}
    >
      {children}
    </OverviewHero>
  );
}
