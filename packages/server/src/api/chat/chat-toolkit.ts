import type * as Chat from "@app/domain/api/chat-rpc";
import { CampaignId } from "@app/domain/api/ids";
import { Npc } from "@app/domain/api/npc-rpc";
import { CurrentUser } from "@app/domain/auth";
import * as Context from "effect/Context";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import type * as Take from "effect/Take";
import * as Tool from "effect/unstable/ai/Tool";
import * as Toolkit from "effect/unstable/ai/Toolkit";

export class ChatMailbox extends Context.Service<
  ChatMailbox,
  PubSub.PubSub<Take.Take<Chat.ChatEvent>>
>()("ChatMailbox") {}

export class ChatRunContext extends Context.Service<ChatRunContext, {
  readonly campaignId: CampaignId;
}>()("ChatRunContext") {}

export const fetchNpcs = Tool.make("fetchNpcs", {
  description: "Fetch the list of NPCs in the active Campaign.",
  failureMode: "return",
  parameters: Tool.EmptyParams,
  success: Schema.Array(Npc),
  failure: Schema.String,
  dependencies: [ChatMailbox, ChatRunContext, CurrentUser],
});

export const createNpc = Tool.make("createNpc", {
  description: "Create a new NPC in the active Campaign. Returns the new NPC.",
  failureMode: "return",
  parameters: Schema.Struct({
    title: Schema.String,
  }),
  success: Npc,
  failure: Schema.String,
  dependencies: [ChatMailbox, ChatRunContext, CurrentUser],
});

export const ChatToolkit = Toolkit.make(fetchNpcs, createNpc);
