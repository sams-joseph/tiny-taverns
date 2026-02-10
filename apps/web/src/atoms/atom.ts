import { Atom, AtomRpc, Registry } from "@effect-atom/atom-react";
import { Prompt } from "@effect/ai";
import { type AnyPart } from "@effect/ai/Response";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as EffectRpcClient from "@effect/rpc/RpcClient";
import * as RpcSerialization from "@effect/rpc/RpcSerialization";
import { DomainRpc, SessionId } from "@repo/domain";
import { Chunk, Option } from "effect";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

// TODO: Move this to env
const ProtocolLive = EffectRpcClient.layerProtocolHttp({
  url: "http://localhost:4001/rpc",
}).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(RpcSerialization.layerNdjson),
);

export class DomainRpcClient extends AtomRpc.Tag<DomainRpcClient>()(
  "DomainRpcClient",
  {
    group: DomainRpc,
    protocol: ProtocolLive,
  },
) {}

export const chatHistoryAtom = Atom.make<Prompt.Prompt>(Prompt.empty);
export const currentSessionIdAtom = Atom.make<Option.Option<SessionId>>(
  Option.none(),
);

export const chatAtom = DomainRpcClient.runtime.fn(
  ({ text }: { readonly text: string }) =>
    Effect.gen(function* () {
      const parts: AnyPart[] = [];

      const registry = yield* Registry.AtomRegistry;

      return yield* Stream.unwrap(
        Effect.gen(function* () {
          const rpc = yield* DomainRpcClient;

          const history = registry.get(chatHistoryAtom);
          const sessionId = registry.get(currentSessionIdAtom);

          const message = makeMessage(text);
          const prompt = Prompt.merge(history, [message]);

          registry.set(chatHistoryAtom, prompt);

          // Include sessionId if we have one
          const payload = Option.isSome(sessionId)
            ? { messages: prompt, sessionId: sessionId.value }
            : { messages: prompt };

          return rpc("ChatStream", payload);
        }),
      ).pipe(
        Stream.catchTags({
          RpcClientError: Effect.die,
        }),
        Stream.mapChunks((chunk) => {
          // Filter and handle session metadata chunks
          const aiParts: AnyPart[] = [];
          for (const part of chunk) {
            if (part.type === "session-metadata") {
              // Store sessionId for future requests
              registry.set(currentSessionIdAtom, Option.some(part.sessionId));
            } else {
              // AI response parts
              aiParts.push(part as AnyPart);
            }
          }
          parts.push(...aiParts);
          return Chunk.of(Prompt.fromResponseParts(parts));
        }),
        Stream.runForEach((prompt) =>
          Effect.sync(() => {
            // TODO: Haven't cared to fix this yet, but this causes a lot of duplicate entries,
            // because we keep appending as the chunks come in which merges partial
            // prompts with history
            registry.modify(chatHistoryAtom, (curr) => [
              prompt,
              Prompt.merge(curr, prompt),
            ]);

            return Effect.void;
          }),
        ),
      );
    }),
);

const makeMessage = (text: string) => {
  const content: Array<Prompt.UserMessagePart> = [];
  content.push(Prompt.textPart({ text }));
  return Prompt.makeMessage("user", {
    content,
  });
};
