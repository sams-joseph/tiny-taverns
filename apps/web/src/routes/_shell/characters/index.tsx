import { createFileRoute } from "@tanstack/react-router";
import { MyCharactersScreen } from "../../../characters/MyCharactersScreen";

/**
 * The characters this account plays, and one of them — top-level, because the
 * endpoint is: `GET /me/characters` is the one read on `character` with no
 * campaign in its path. The question *"which characters are mine"* is asked
 * across every table at once, and a player at three tables has one list.
 *
 * The sheet (`$characterId.tsx`) names the character alone for the same
 * reason. `GET /me/campaigns` is what turns that row's `campaignId` into a
 * name — the join key travels, the name is looked up.
 */
export const Route = createFileRoute("/_shell/characters/")({
  component: MyCharactersScreen,
});
