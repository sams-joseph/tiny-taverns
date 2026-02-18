import * as Effect from "effect/Effect";
import { dmToolkit } from "@repo/domain/DmToolkit";
import { QuestsRepository } from "../QuestsRepository.js";
import { EncountersRepository } from "../EncountersRepository.js";

export const DmToolkitLayer = dmToolkit.toLayer(
  Effect.gen(function* () {
    const quests = yield* QuestsRepository;
    const encounters = yield* EncountersRepository;

    return dmToolkit.of({
      CreateQuest: Effect.fnUntraced(function* ({ quest }) {
        const created = yield* quests.create(quest);
        return { _tag: "Transient", value: created } as const;
      }),
      CreateEncounter: Effect.fnUntraced(function* ({ encounter }) {
        const created = yield* encounters.create(encounter);
        return { _tag: "Transient", value: created } as const;
      }),
      QuestEncounterLink: Effect.fnUntraced(function* ({ link }) {
        const created = yield* quests.linkEncounter(link);
        return { _tag: "Transient", value: created } as const;
      }),
    });
  }),
);
