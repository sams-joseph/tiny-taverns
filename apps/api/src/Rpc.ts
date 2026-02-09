import { ChatRpc, CampaignRpc, MonsterRpc } from "@repo/domain";
import { Effect, Stream } from "effect";
import { AiChatService } from "./lib/AiChatService.js";
import { MonstersRepository } from "./MonstersRepository.js";
import { CampaignsRepository } from "./CampaignsRepository.js";

export const ChatLive = ChatRpc.toLayer(
  Effect.gen(function* () {
    const chat = yield* AiChatService;

    return {
      ChatStream: (payload) => chat.send(payload),
    };
  }),
);

export const CampaignLive = CampaignRpc.toLayer(
  Effect.gen(function* () {
    const campaigns = yield* CampaignsRepository;

    return {
      CampaignList: () =>
        Stream.fromIterableEffect(campaigns.findAll({ search: undefined })),
      CampaignCreate: (payload) => campaigns.create(payload),
    };
  }),
);

export const MonsterLive = MonsterRpc.toLayer(
  Effect.gen(function* () {
    const monsters = yield* MonstersRepository;

    return {
      MonsterList: () =>
        Stream.fromIterableEffect(monsters.findAll({ search: undefined })),
      MonsterCreate: (payload) => monsters.create(payload),
    };
  }),
);
