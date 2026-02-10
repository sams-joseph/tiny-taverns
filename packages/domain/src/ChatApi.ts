import { Rpc, RpcGroup } from "@effect/rpc";
import { StreamPart } from "@effect/ai/Response";
import { toolkit } from "./Toolkit.js";
import { AiError } from "@effect/ai/AiError";
import { Prompt } from "@effect/ai";
import { Schema } from "effect";
import { SessionId } from "./SessionsApi.js";

export class ChatRpc extends RpcGroup.make(
  Rpc.make("ChatStream", {
    success: StreamPart(toolkit),
    payload: Schema.Struct({
      messages: Prompt.Prompt,
      sessionId: Schema.optional(SessionId),
    }),
    error: AiError,
    stream: true,
  }),
) {}
