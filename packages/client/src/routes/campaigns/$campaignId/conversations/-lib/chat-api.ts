import { DomainRpcClient } from "@/services/rpc-client.js";
import type { ModelFamily } from "@app/domain/ai-models";
import type { CampaignId } from "@app/domain/api/campaign-rpc";
import type { ChatId, RunId } from "@app/domain/api/chat-rpc";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class ChatApi extends Context.Service<ChatApi>()("@app/chat/ChatApi", {
  make: Effect.gen(function*() {
    const rpc = yield* DomainRpcClient;
    return {
      chatList: (args: {
        readonly campaignId: CampaignId;
        readonly cursor: Parameters<typeof rpc.chat_list>[0]["cursor"];
      }) => rpc.chat_list(args),
      chatGet: (args: { readonly campaignId: CampaignId; readonly chatId: ChatId; }) =>
        rpc.chat_get(args),
      chatCreate: (args: {
        readonly campaignId: CampaignId;
        readonly title: string;
        readonly model: ModelFamily;
      }) => rpc.chat_create(args),
      chatDelete: (args: { readonly campaignId: CampaignId; readonly chatId: ChatId; }) =>
        rpc.chat_delete(args),
      chatAsk: (args: {
        readonly campaignId: CampaignId;
        readonly chatId: ChatId;
        readonly message: string;
      }) => rpc.chat_ask(args),
      chatEvents: (args: { readonly campaignId: CampaignId; readonly runId: RunId; }) =>
        rpc.chat_events(args),
      chatWatch: (args: { readonly campaignId: CampaignId; readonly chatId: ChatId; }) =>
        rpc.chat_watch(args),
      chatInterrupt: (args: { readonly campaignId: CampaignId; readonly chatId: ChatId; }) =>
        rpc.chat_interrupt(args),
    };
  }),
}) {
  static layer: Layer.Layer<ChatApi> = Layer.effect(this, this.make).pipe(
    Layer.provide(DomainRpcClient.layer),
  );
}
