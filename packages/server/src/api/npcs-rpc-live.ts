import { NpcRepo } from "@/db/npc-repo";
import { ensureOwnership } from "@/lib/ensureOwnership";
import * as Npc from "@app/domain/api/npc-rpc";
import { CurrentUser } from "@app/domain/auth";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Rpc from "effect/unstable/rpc/Rpc";

export const NpcRpcHandler = Npc.NpcRpc.toLayer(
  Effect.gen(function*() {
    const npcRepo = yield* NpcRepo;

    return Npc.NpcRpc.of({
      npc_list: Effect.fnUntraced(function*(payload) {
        const currentUser = yield* CurrentUser;
        const cursor = payload.cursor === null ? Option.none() : Option.some(payload.cursor);
        return yield* npcRepo.fetch(currentUser.id, cursor);
      }),

      npc_get: Effect.fnUntraced(function*(payload) {
        const currentUser = yield* CurrentUser;
        return yield* npcRepo.findById(payload.npcId).pipe(
          Effect.flatMap(ensureOwnership(currentUser.id)),
          Effect.catchTags({
            SqlError: (err) => Effect.die(err),
            SchemaError: (err) => Effect.die(err),
          }),
          Effect.mapError(
            () => new Npc.NpcNotFoundError({ id: payload.npcId }),
          ),
        );
      }),
    });
  }),
);

export const NpcRpcLive: Layer.Layer<
  Rpc.Handler<"npc_list"> | Rpc.Handler<"npc_get">
> = NpcRpcHandler.pipe(Layer.provide(NpcRepo.layer));
