import {
  ChatRpc,
  CampaignRpc,
  MonsterRpc,
  UserRpc,
  CharacterRpc,
} from "@repo/domain";
import { Effect, Stream } from "effect";
import { AiChatService } from "./lib/AiChatService.js";
import { MonstersRepository } from "./MonstersRepository.js";
import { CampaignsRepository } from "./CampaignsRepository.js";
import { UsersRepository } from "./UsersRepository.js";
import { CharactersRepository } from "./CharactersRepository.js";

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

export const UserLive = UserRpc.toLayer(
  Effect.gen(function* () {
    const users = yield* UsersRepository;

    return {
      UserList: () =>
        Stream.fromIterableEffect(users.findAll({ search: undefined })),
      UserCreate: (payload) => users.create(payload),
    };
  }),
);

export const CharacterLive = CharacterRpc.toLayer(
  Effect.gen(function* () {
    const characters = yield* CharactersRepository;

    return {
      CharacterList: () =>
        Stream.fromIterableEffect(characters.findAll({ search: undefined })),
      CharacterCreate: (payload) => characters.create(payload),
    };
  }),
);
