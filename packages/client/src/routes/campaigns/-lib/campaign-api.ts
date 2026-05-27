import { DomainRpcClient } from "@/services/rpc-client.js";
import type { CampaignId } from "@app/domain/api/campaign-rpc";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class CampaignApi extends Context.Service<CampaignApi>()("@app/campaign/CampaignApi", {
  make: Effect.gen(function*() {
    const rpc = yield* DomainRpcClient;
    return {
      campaignList: (cursor: Parameters<typeof rpc.campaign_list>[0]["cursor"]) =>
        rpc.campaign_list({ cursor }),
      campaignCreate: (args: { readonly title: string; }) => rpc.campaign_create(args),
      campaignGet: (campaignId: CampaignId) => rpc.campaign_get({ campaignId }),
    };
  }),
}) {
  static layer: Layer.Layer<CampaignApi> = Layer.effect(this, this.make).pipe(
    Layer.provide(DomainRpcClient.layer),
  );
}
