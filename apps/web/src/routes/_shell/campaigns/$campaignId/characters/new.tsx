import { createFileRoute } from "@tanstack/react-router";
import { CharacterCreateScreen } from "../../../../../characters/CharacterCreateScreen";

/**
 * Writing down a character of your own — under the campaign used as creation
 * context, when there is one, because the campaign is *step one*: the character row is
 * account-owned and top-level, creation seats it nowhere, but the form and Hob
 * draft against that table's vocabulary and Hob's drafting thread is
 * campaign-scoped (`assistant_thread.campaign_id`). Putting the id in the URL
 * is what makes that choice a thing you can bookmark and reload.
 *
 * Remounted on the campaign: a form half-typed for one table must not survive
 * into another.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/characters/new")({
  component: CharacterCreateScreen,
  remountDeps: ({ params }) => params.campaignId,
});
