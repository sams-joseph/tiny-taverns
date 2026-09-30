import { createFileRoute } from "@tanstack/react-router";
import { CoreCharacterCreateScreen } from "../../../characters/CharacterCreateScreen";

/**
 * Writing down a character with **no campaign** — the core rules, and Hob
 * through the account's own thread (`/me/hob`). The static segment outranks
 * `$characterId` beside it, and `new` is not a character id anyway.
 */
export const Route = createFileRoute("/_shell/characters/new")({
  component: CoreCharacterCreateScreen,
});
