import { createFileRoute } from "@tanstack/react-router";
import { noteSearch } from "../../../-params";
import { creatorOnly } from "../../../../campaign/CreatorOnly";
import { NotesScreen } from "../../../../campaign/NotesScreen";

/**
 * The Notes beside the encounters, remounted per campaign for the same reason
 * (`encounters/index.tsx`).
 *
 * The encounter screens and Notes are the creator's. The server refuses every
 * read behind them to a player, and that is the gate; `creatorOnly` is what a
 * player who types one of these URLs reads instead of the refusal. A player
 * reads the shared notes on their own Overview.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/notes")({
  /**
   * Which note the pane holds, so a reload, a shared link and *New note* land
   * on it. A bad or missing id is no choice, and the screen shows the first
   * note it lists — see `NotesScreen`.
   */
  validateSearch: noteSearch,
  component: creatorOnly("Notes", NotesScreen),
  remountDeps: ({ params }) => params.campaignId,
});
