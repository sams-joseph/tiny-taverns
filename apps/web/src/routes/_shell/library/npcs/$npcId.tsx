import { createFileRoute } from "@tanstack/react-router";
import { npcIdParam } from "../../../-params";
import { LibraryNpcScreen } from "../../../../cast/LibraryNpcScreen";

/**
 * One NPC source's stats page: the Library's twin of the NPC page's *Stats*
 * tab, the owner's alone through its read. A different source is a different
 * sheet, so the leaf remounts on the id; a bad id falls back to the shelf.
 */
export const Route = createFileRoute("/_shell/library/npcs/$npcId")({
  params: npcIdParam,
  component: LibraryNpcScreen,
  remountDeps: ({ params }) => params.npcId,
});
