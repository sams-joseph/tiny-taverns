import { ChatRpcs } from "@repo/domain";
import { Effect } from "effect";
import { AiChatService } from "./lib/AiChatService.js";

export const ChatLive = ChatRpcs.toLayer(
  Effect.gen(function* () {
    const chat = yield* AiChatService;

    return {
      ChatStream: (payload) => chat.send(payload),
    };
  }),
);
