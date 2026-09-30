import { createFileRoute } from "@tanstack/react-router";
import { MyCharactersScreen } from "../../../characters/MyCharactersScreen";

/**
 * A half-typed sheet link still knows it meant the roster, which is the same
 * fall-back-one-level a broken run link takes to its campaign.
 */
export const Route = createFileRoute("/_shell/characters/$")({
  component: MyCharactersScreen,
});
