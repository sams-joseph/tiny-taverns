import { createFileRoute } from "@tanstack/react-router";
import { characterIdParam } from "../../-params";
import { CharacterSheetScreen } from "../../../characters/CharacterSheetScreen";

export const Route = createFileRoute("/_shell/characters/$characterId")({
  params: characterIdParam,
  component: CharacterSheetScreen,
  // A different character is a different sheet: which tab is open belongs to
  // the one being read.
  remountDeps: ({ params }) => params.characterId,
});
