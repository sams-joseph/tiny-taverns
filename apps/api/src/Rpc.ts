import { ChatRpcs, MonsterRpc } from "@repo/domain";
import { Effect, Stream } from "effect";
import { AiChatService } from "./lib/AiChatService.js";
import { MonstersRepository } from "./MonstersRepository.js";

export const ChatLive = ChatRpcs.toLayer(
  Effect.gen(function* () {
    const chat = yield* AiChatService;

    return {
      ChatStream: (payload) => chat.send(payload),
    };
  }),
);

export const MonsterLive = MonsterRpc.toLayer(
  Effect.gen(function* () {
    const monsters = yield* MonstersRepository;

    return {
      MonsterList: () =>
        Stream.fromIterableEffect(monsters.findAll({ search: undefined })),
    };
  }),
);
