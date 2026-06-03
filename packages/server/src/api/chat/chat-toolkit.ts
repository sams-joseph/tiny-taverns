import type * as Chat from "@app/domain/api/chat-rpc";
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

export const fetchNpcs = Tool.make("fetchNpcs", {
  description: "Fetch a list of NPCs for the current user",
  failureMode: "return",
  parameters: Tool.EmptyParams,
  success: Schema.Array(Npc),
  failure: Schema.String,
  dependencies: [ChatMailbox, CurrentUser],
});

export const createNpc = Tool.make("createNpc", {
  description: "Create a new NPC for the current user",
  failureMode: "return",
  parameters: Schema.Struct({
    title: Schema.String,
  }),
  success: Npc,
  failure: Schema.String,
  dependencies: [ChatMailbox, CurrentUser],
});

export const ChatToolkit = Toolkit.make(fetchNpcs, createNpc);
