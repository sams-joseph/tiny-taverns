import * as Effect from "effect/Effect";
import { dmToolkit } from "@repo/domain/DmToolkit";
import { QuestsRepository } from "../QuestsRepository.js";

export const DmToolkitLayer = dmToolkit.toLayer(
  Effect.gen(function* () {
    const quests = yield* QuestsRepository;

    return dmToolkit.of({
      CreateQuest: Effect.fnUntraced(function* ({ quest }) {
        const created = yield* quests.create(quest);
        return { _tag: "Transient", value: created } as const;
      }),
    });
  }),
);
