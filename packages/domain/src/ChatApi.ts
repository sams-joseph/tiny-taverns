import { Rpc, RpcGroup } from "@effect/rpc";
import { StreamPart } from "@effect/ai/Response";
import { toolkit } from "./Toolkit.js";
import { AiError } from "@effect/ai/AiError";
import { Prompt } from "@effect/ai";

export class ChatRpc extends RpcGroup.make(
  Rpc.make("ChatStream", {
    success: StreamPart(toolkit),
    payload: {
      messages: Prompt.Prompt,
    },
    error: AiError,
    stream: true,
  }),
) {}
