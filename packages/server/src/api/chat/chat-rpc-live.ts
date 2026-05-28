import { CampaignRepo } from "@/db/campaign-repo.js";
import { ChatModel } from "@/db/chat-model.js";
import { ChatRepo } from "@/db/chat-repo.js";
import * as Campaign from "@app/domain/api/campaign-rpc";
import * as Chat from "@app/domain/api/chat-rpc";
import { CurrentUser } from "@app/domain/auth";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import type * as Rpc from "effect/unstable/rpc/Rpc";
import { ChatRunManager } from "./chat-run-manager.js";

export const ChatRpcHandler = Chat.ChatRpc.toLayer(
  Effect.gen(function*() {
    const chatRepo = yield* ChatRepo;
    const campaignRepo = yield* CampaignRepo;
    const runManager = yield* ChatRunManager;

    const asCampaignChat = (
      chat: typeof ChatModel.Type,
      campaignId: Campaign.CampaignId,
    ) => ({
      ...chat,
      campaignId,
    });

    return Chat.ChatRpc.of({
      chat_events: (payload) =>
        Stream.unwrap(
          Effect.gen(function*() {
            const currentUser = yield* CurrentUser;
            yield* campaignRepo.findById(payload.campaignId, currentUser.id);
            return runManager.subscribe(payload.runId, currentUser.id, payload.campaignId);
          }),
        ),

      chat_watch: (payload) =>
        Stream.unwrap(
          Effect.gen(function*() {
            const currentUser = yield* CurrentUser;
            const chat = yield* chatRepo.findById(
              payload.chatId,
              currentUser.id,
              payload.campaignId,
            );
            return Stream.fromIterable<Chat.ChatWatchEvent>([{
              _tag: "RunChanged",
              runId: chat.activeRunId,
            }]).pipe(Stream.concat(runManager.watch(payload.chatId)));
          }),
        ),

      chat_ask: Effect.fnUntraced(function*(payload) {
        const currentUser = yield* CurrentUser;
        const chat = yield* chatRepo.findById(
          payload.chatId,
          currentUser.id,
          payload.campaignId,
        );

        return yield* runManager.startGeneration({
          chat,
          message: payload.message,
          currentUser,
        });
      }),

      chat_interrupt: Effect.fnUntraced(function*(payload) {
        const currentUser = yield* CurrentUser;
        yield* chatRepo.findById(payload.chatId, currentUser.id, payload.campaignId);
        yield* runManager.interrupt(payload.chatId);
      }),

      chat_create: Effect.fnUntraced(function*(payload) {
        const currentUser = yield* CurrentUser;
        yield* campaignRepo.findById(payload.campaignId, currentUser.id);
        const chat = yield* chatRepo.create({
          userId: currentUser.id,
          campaignId: payload.campaignId,
          title: payload.title,
          model: payload.model,
        });
        return asCampaignChat(chat, payload.campaignId);
      }),

      chat_list: Effect.fnUntraced(function*(payload) {
        const currentUser = yield* CurrentUser;
        yield* campaignRepo.findById(payload.campaignId, currentUser.id);
        const cursor = payload.cursor === null ? Option.none() : Option.some(payload.cursor);
        const result = yield* chatRepo.listByCampaign(currentUser.id, payload.campaignId, cursor);
        return {
          ...result,
          items: result.items.map((chat) => asCampaignChat(chat, payload.campaignId)),
        };
      }),

      chat_get: Effect.fnUntraced(function*(payload) {
        const currentUser = yield* CurrentUser;
        const chat = yield* chatRepo.findById(payload.chatId, currentUser.id, payload.campaignId);
        return asCampaignChat(chat, payload.campaignId);
      }),

      chat_delete: Effect.fnUntraced(function*(payload) {
        const currentUser = yield* CurrentUser;
        yield* chatRepo.delete(payload.chatId, currentUser.id, payload.campaignId);
      }),
    });
  }),
);

export const ChatRpcLive: Layer.Layer<
  | Rpc.Handler<"chat_events">
  | Rpc.Handler<"chat_watch">
  | Rpc.Handler<"chat_ask">
  | Rpc.Handler<"chat_interrupt">
  | Rpc.Handler<"chat_create">
  | Rpc.Handler<"chat_list">
  | Rpc.Handler<"chat_get">
  | Rpc.Handler<"chat_delete">
> = ChatRpcHandler.pipe(
  Layer.provide(ChatRunManager.layer),
  Layer.provide(CampaignRepo.layer),
  Layer.provide(ChatRepo.layer),
);
