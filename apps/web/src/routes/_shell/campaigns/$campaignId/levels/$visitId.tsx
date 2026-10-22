import { createFileRoute } from "@tanstack/react-router";
import { visitIdParam } from "../../../../-params";
import { creatorOnly } from "../../../../../campaign/CreatorOnly";
import { VisitScreen } from "../../../../../visits/VisitScreen";

/**
 * One level visit's stage: the DM exploring the dungeon with no fight on. A
 * bad id falls back to the table's levels (`levels/$.tsx`). Remounted per
 * visit: the stream and the board's line belong to one visit and none of it
 * may survive into another.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/levels/$visitId")({
  params: visitIdParam,
  component: creatorOnly("Level", VisitScreen),
  remountDeps: ({ params }) => params.visitId,
});
