import { Rpc, RpcGroup } from "@effect/rpc";
import { StreamPart } from "@effect/ai/Response";
import { toolkit } from "./Toolkit.js";
import { AiError } from "@effect/ai/AiError";
import { Prompt } from "@effect/ai";
import { Schema } from "effect";
import { SessionId } from "./SessionsApi.js";

// Session metadata chunk that is emitted first in the stream
export class SessionMetadataChunk extends Schema.Class<SessionMetadataChunk>(
  "SessionMetadataChunk",
)({
  type: Schema.Literal("session-metadata"),
  sessionId: SessionId,
}) {}

// Combined stream type: session metadata + AI response parts
export const ChatStreamPart = Schema.Union(
  SessionMetadataChunk,
  StreamPart(toolkit),
);

export class ChatRpc extends RpcGroup.make(
  Rpc.make("ChatStream", {
    success: ChatStreamPart,
    payload: Schema.Struct({
      messages: Prompt.Prompt,
      sessionId: Schema.optional(SessionId),
    }),
    error: AiError,
    stream: true,
  }),
) {}
