import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import { ModelFamily } from "../ai-models.js";
import { AuthMiddleware } from "../auth.js";
import { CampaignNotFoundError } from "./campaign-rpc.js";
import { CampaignId } from "./ids.js";
import { ChatId, RunId } from "./ids.js";

export { ChatId, RunId } from "./ids.js";

export class ChatNotFoundError extends Schema.TaggedErrorClass<ChatNotFoundError>()(
  "ChatNotFoundError",
  {
    id: ChatId,
  },
) {}

export class ChatRunNotFoundError extends Schema.TaggedErrorClass<ChatRunNotFoundError>()(
  "ChatRunNotFoundError",
  { runId: RunId },
) {}

export class GenerationInProgressError extends Schema.TaggedErrorClass<GenerationInProgressError>()(
  "GenerationInProgressError",
  { chatId: ChatId },
) {}

export const ChatWatchEvent = Schema.TaggedStruct("RunChanged", {
  runId: Schema.NullOr(RunId),
});
export type ChatWatchEvent = typeof ChatWatchEvent.Type;

export const ToolName = Schema.Literals(["createNpc", "fetchNpcs"]);
export type ToolName = typeof ToolName.Type;

export const ToolEvent = Schema.Union([
  Schema.TaggedStruct("ToolStart", {
    toolName: ToolName,
    input: Schema.String,
  }),
  Schema.TaggedStruct("ToolFailure", { toolName: ToolName }),
  Schema.TaggedStruct("ToolSuccess", {
    toolName: ToolName,
    output: Schema.String,
  }),
]);
export type ToolEvent = typeof ToolEvent.Type;

const TextPart = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
});
const ToolCallPart = Schema.Struct({
  type: Schema.Literal("tool-call"),
  id: Schema.String,
  name: ToolName,
  params: Schema.Json,
});
const ToolResultPart = Schema.Struct({
  type: Schema.Literal("tool-result"),
  id: Schema.String,
  name: ToolName,
  result: Schema.Json,
  isFailure: Schema.Boolean,
});
export const MessagePart = Schema.Union([
  TextPart,
  ToolCallPart,
  ToolResultPart,
]);
export type MessagePart = typeof MessagePart.Type;
const MessageContent = Schema.Union([Schema.String, Schema.Array(MessagePart)]);

export class Message extends Schema.Opaque<Message>()(
  Schema.Struct({
    role: Schema.Literals(["user", "assistant", "tool"]),
    content: MessageContent,
  }),
) {}

export class Chat extends Schema.Opaque<Chat>()(
  Schema.Struct({
    id: ChatId,
    campaignId: CampaignId,
    title: Schema.String,
    model: ModelFamily,
    createdAt: Schema.DateTimeUtcFromString,
    updatedAt: Schema.DateTimeUtcFromString,
  }),
) {
  static readonly WithMessages = class WithMessages extends Schema.Opaque<WithMessages>()(
    Schema.Struct({
      ...Chat.fields,
      messages: Schema.Array(Message),
      activeRunId: Schema.NullOr(RunId),
    }),
  ) {};
}

export const ChatEvent = Schema.Union([
  Schema.TaggedStruct("Chunk", { delta: Schema.String }),
  Schema.TaggedStruct("ReasoningChunk", { delta: Schema.String }),
  Schema.TaggedStruct("ToolStart", {
    toolName: ToolName,
    input: Schema.String,
  }),
  Schema.TaggedStruct("ToolFailure", { toolName: ToolName }),
  Schema.TaggedStruct("ToolSuccess", {
    toolName: ToolName,
    output: Schema.String,
  }),
]);
export type ChatEvent = typeof ChatEvent.Type;

const MessageEvent = Schema.Union([
  Schema.TaggedStruct("Chunk", { delta: Schema.String }),
  Schema.TaggedStruct("ReasoningChunk", { delta: Schema.String }),
  Schema.TaggedStruct("ToolStart", {
    toolName: ToolName,
    input: Schema.String,
  }),
  Schema.TaggedStruct("ToolFailure", { toolName: ToolName }),
  Schema.TaggedStruct("ToolSuccess", {
    toolName: ToolName,
    output: Schema.String,
  }),
  Schema.TaggedStruct("Error", { message: Schema.String }),
]);
export type MessageEvent = typeof MessageEvent.Type;

export class ChatAskRpc extends Rpc.make("chat_ask", {
  payload: {
    campaignId: CampaignId,
    chatId: ChatId,
    message: Schema.String,
  },
  success: Schema.Struct({ runId: RunId }),
  error: Schema.Union([ChatNotFoundError, GenerationInProgressError]),
}) {}

export class ChatEventsRpc extends Rpc.make("chat_events", {
  stream: true,
  payload: { campaignId: CampaignId, runId: RunId },
  success: ChatEvent,
  error: Schema.Union([ChatRunNotFoundError, CampaignNotFoundError]),
}) {}

export class ChatWatchRpc extends Rpc.make("chat_watch", {
  stream: true,
  payload: { campaignId: CampaignId, chatId: ChatId },
  success: ChatWatchEvent,
  error: ChatNotFoundError,
}) {}

export class ChatCreateRpc extends Rpc.make("chat_create", {
  payload: {
    campaignId: CampaignId,
    title: Schema.NonEmptyString,
    model: ModelFamily,
  },
  success: Chat,
  error: CampaignNotFoundError,
}) {}

export class ChatListRpc extends Rpc.make("chat_list", {
  payload: {
    campaignId: CampaignId,
    cursor: Schema.NullOr(Schema.DateTimeUtcFromString),
  },
  success: Schema.Struct({
    items: Schema.Array(Chat),
    hasMore: Schema.Boolean,
  }),
  error: CampaignNotFoundError,
}) {}

export class ChatGetRpc extends Rpc.make("chat_get", {
  payload: { campaignId: CampaignId, chatId: ChatId },
  success: Chat.WithMessages,
  error: ChatNotFoundError,
}) {}

export class ChatDeleteRpc extends Rpc.make("chat_delete", {
  payload: { campaignId: CampaignId, chatId: ChatId },
  success: Schema.Void,
  error: ChatNotFoundError,
}) {}

export class ChatInterruptRpc extends Rpc.make("chat_interrupt", {
  payload: { campaignId: CampaignId, chatId: ChatId },
  success: Schema.Void,
  error: ChatNotFoundError,
}) {}

export class ChatRpc extends RpcGroup.make(
  ChatEventsRpc,
  ChatWatchRpc,
  ChatAskRpc,
  ChatInterruptRpc,
  ChatCreateRpc,
  ChatListRpc,
  ChatGetRpc,
  ChatDeleteRpc,
).middleware(AuthMiddleware) {}
