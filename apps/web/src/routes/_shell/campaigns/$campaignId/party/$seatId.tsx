import { createFileRoute } from "@tanstack/react-router";
import { seatIdParam } from "../../../../-params";
import { SeatScreen } from "../../../../../party/SeatScreen";

/**
 * One seat, the creator's: the seat's settings and the character's sheet read
 * through it (`party/SeatScreen.tsx`). Named by the seat rather than the
 * character, because the seat is what this table owns — a deleted character
 * leaves a seat standing, and one character seated at two tables is two pages.
 * Creator-only through its read, like the Party tab it sits under. A different
 * seat is a different set of drafts, so the leaf remounts on the id; a bad id
 * falls back to the Party tab.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/party/$seatId")({
  params: seatIdParam,
  component: SeatScreen,
  remountDeps: ({ params }) => params.seatId,
});
