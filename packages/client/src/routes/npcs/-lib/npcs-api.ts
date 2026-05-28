import { DomainRpcClient } from "@/services/rpc-client.js";
import type { NpcId } from "@app/domain/api/npc-rpc";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class NpcApi extends Context.Service<NpcApi>()("@app/npcs/NpcApi", {
  make: Effect.gen(function* () {
    const rpc = yield* DomainRpcClient;
    return {
      npcList: (cursor: Parameters<typeof rpc.npc_list>[0]["cursor"]) =>
        rpc.npc_list({ cursor }),
      npcGet: (npcId: NpcId) => rpc.npc_get({ npcId }),
    };
  }),
}) {
  static layer: Layer.Layer<NpcApi> = Layer.effect(this, this.make).pipe(
    Layer.provide(DomainRpcClient.layer),
  );
}
