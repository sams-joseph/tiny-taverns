import { createFileRoute } from "@tanstack/react-router";
import { levelIdParam } from "../../../-params";
import { LevelScreen } from "../../../../levels/LevelScreen";

/**
 * One of the owner's levels. A different level is a different page, so the
 * leaf remounts on the id; a bad id falls back to the shelf.
 */
export const Route = createFileRoute("/_shell/library/levels/$levelId")({
  params: levelIdParam,
  component: LevelScreen,
  remountDeps: ({ params }) => params.levelId,
});
