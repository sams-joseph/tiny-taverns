import { createFileRoute } from "@tanstack/react-router";
import { npcSearch } from "../../../../-params";
import { CastScreen } from "../../../../../cast/CastScreen";

/**
 * The campaign's cast — the structured NPCs a creator builds and rehearses
 * with (the NPC builder decisions of 2026-09-04). A campaign destination like
 * Notes, for the same reason: an NPC is campaign content, and every read hangs
 * off `/campaigns/:campaignId/npcs`. One NPC is its own screen, named by id,
 * because the rehearsal beside it is a conversation worth bookmarking; a bad
 * id falls back to the cast list rather than to the campaign.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/cast/")({
  /**
   * Which NPC the drawer holds, so a reload, a shared link and *Add NPC* land
   * on it. A bad id, or one the cast does not list, is no choice — see
   * `CastScreen`.
   */
  validateSearch: npcSearch,
  component: CastScreen,
  remountDeps: ({ params }) => params.campaignId,
});
