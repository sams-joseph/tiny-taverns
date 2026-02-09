import { Atom, AtomRpc, Registry } from "@effect-atom/atom-react";
import { Prompt } from "@effect/ai";
import type { AnyPart } from "@effect/ai/Response";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as EffectRpcClient from "@effect/rpc/RpcClient";
import * as RpcSerialization from "@effect/rpc/RpcSerialization";
import { DomainRpc } from "@repo/domain";
import { Chunk } from "effect";

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

export const chatPartsAtom = Atom.make<Prompt.Prompt>(Prompt.empty);

export const chatAtom = DomainRpcClient.runtime.fn(
  ({ text }: { readonly text: string }) =>
    Effect.gen(function* () {
      const parts: AnyPart[] = [];
      return yield* Stream.unwrap(
        Effect.gen(function* () {
          const rpc = yield* DomainRpcClient;

          const registry = yield* Registry.AtomRegistry;
          const history = registry.get(chatPartsAtom);

          return rpc("ChatStream", { text, history });
        }),
      ).pipe(
        Stream.catchTags({
          RpcClientError: Effect.die,
        }),
        Stream.mapChunks((chunk) => {
          parts.push(...chunk);
          return Chunk.of(Prompt.fromResponseParts(parts));
        }),
        Stream.runForEach((part) =>
          Effect.gen(function* () {
            const registry = yield* Registry.AtomRegistry;
            registry.set(chatPartsAtom, part);
          }),
        ),
      );
    }),
);
