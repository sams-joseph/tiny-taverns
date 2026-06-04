import { CampaignRepo } from "@/db/campaign-repo.js";
import { NpcModel } from "@/db/npc-model.js";
import { NpcRepo } from "@/db/npc-repo.js";
import { ensureOwnership } from "@/lib/ensureOwnership.js";
import * as Campaign from "@app/domain/api/campaign-rpc";
import * as Npc from "@app/domain/api/npc-rpc";
import { CurrentUser } from "@app/domain/auth";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Rpc from "effect/unstable/rpc/Rpc";

const asCampaignNpc = (
  npc: typeof NpcModel.Type,
  campaignId: Campaign.CampaignId,
) => ({
  ...npc,
  campaignId,
});

export const NpcRpcHandler = Npc.NpcRpc.toLayer(
  Effect.gen(function*() {
    const npcRepo = yield* NpcRepo;
    const campaignRepo = yield* CampaignRepo;

    return Npc.NpcRpc.of({
      npc_list: Effect.fnUntraced(function*(payload) {
        const currentUser = yield* CurrentUser;
        yield* campaignRepo.findById(payload.campaignId).pipe(
          Effect.flatMap(ensureOwnership(currentUser.id)),
          Effect.mapError(
            () => new Campaign.CampaignNotFoundError({ id: payload.campaignId }),
          ),
        );
        const cursor = payload.cursor === null ? Option.none() : Option.some(payload.cursor);
        const result = yield* npcRepo.fetch(currentUser.id, payload.campaignId, cursor);
        return {
          ...result,
          items: result.items.map((npc) => asCampaignNpc(npc, payload.campaignId)),
        };
      }),

      npc_get: Effect.fnUntraced(function*(payload) {
        const currentUser = yield* CurrentUser;
        const npc = yield* npcRepo.findById(payload.npcId, currentUser.id, payload.campaignId);
        return asCampaignNpc(npc, payload.campaignId);
      }),
    });
  }),
);

export const NpcRpcLive: Layer.Layer<
  Rpc.Handler<"npc_list"> | Rpc.Handler<"npc_get">
> = NpcRpcHandler.pipe(
  Layer.provide(NpcRepo.layer),
  Layer.provide(CampaignRepo.layer),
);
