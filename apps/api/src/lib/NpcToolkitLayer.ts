import * as Effect from "effect/Effect";
import { npcToolkit } from "@repo/domain/NpcToolkit";
import { CharactersRepository } from "../CharactersRepository.js";

export const NpcToolkitLayer = npcToolkit.toLayer(
  Effect.gen(function* () {
    const characters = yield* CharactersRepository;

    return npcToolkit.of({
      GetNpcProfile: Effect.fnUntraced(function* () {
        const npc = yield* characters.findFirstNpc();
        console.log(npc);
        return { _tag: "Transient", value: npc } as const;
      }),
      GetLocationContext: Effect.fnUntraced(function* () {
        return {
          _tag: "Transient",
          value: {
            name: "The Ember & Oak",
            description:
              "A warm, crowded tavern with a low hearth and the smell of spiced cider.",
            notableNpcs: [],
            rumors: [],
            events: [],
          },
        } as const;
      }),
    });
  }),
);
