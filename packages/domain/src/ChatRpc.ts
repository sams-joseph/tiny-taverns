import { Rpc, RpcGroup } from "@effect/rpc";
import { StreamPart } from "@effect/ai/Response";
import { toolkit } from "./Toolkit.js";
import { AiError } from "@effect/ai/AiError";
import { Schema } from "effect";
import { Prompt } from "@effect/ai";

export class ChatRpcs extends RpcGroup.make(
  Rpc.make("ChatStream", {
    success: StreamPart(toolkit),
    payload: {
      text: Schema.String,
      history: Prompt.Prompt,
    },
    error: AiError,
    stream: true,
  }),
) {}
