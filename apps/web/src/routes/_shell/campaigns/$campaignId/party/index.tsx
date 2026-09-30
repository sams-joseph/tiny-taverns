import { createFileRoute } from "@tanstack/react-router";
import { PartyScreen } from "../../../../../party/PartyScreen";

/**
 * The party at one table, which is a question about one table.
 *
 * `members.list`, `invites.list` and `party.list` all hang off
 * `/campaigns/:campaignId`, and on the first two the path is what the `DmActor`
 * gate is checked against — so, like the bestiary and the Chronicle, there is
 * no campaign-less party to route to. Remounted per campaign: a card's
 * unsent − and + belong to the table they were pressed at.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/party/")({
  component: PartyScreen,
  remountDeps: ({ params }) => params.campaignId,
});
