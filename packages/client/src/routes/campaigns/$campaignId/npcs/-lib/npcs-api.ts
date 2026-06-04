import { DomainRpcClient } from "@/services/rpc-client.js";
import type { CampaignId } from "@app/domain/api/campaign-rpc";
import type { NpcId } from "@app/domain/api/npc-rpc";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class NpcApi extends Context.Service<NpcApi>()("@app/npcs/NpcApi", {
  make: Effect.gen(function*() {
    const rpc = yield* DomainRpcClient;
    return {
      npcList: (
        args: {
          readonly campaignId: CampaignId;
          readonly cursor: Parameters<typeof rpc.npc_list>[0]["cursor"];
        },
      ) => rpc.npc_list(args),
      npcGet: (args: { readonly campaignId: CampaignId; readonly npcId: NpcId; }) =>
        rpc.npc_get(args),
    };
  }),
}) {
  static layer: Layer.Layer<NpcApi> = Layer.effect(this, this.make).pipe(
    Layer.provide(DomainRpcClient.layer),
  );
}
