import { CampaignId } from "@app/domain/api/campaign-rpc";
import * as Effect from "effect/Effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { CampaignApi } from "./campaign-api.js";

export const campaignRuntime = Atom.runtime(CampaignApi.layer);

export const campaignListAtom = campaignRuntime.atom(
  Effect.gen(function*() {
    const api = yield* CampaignApi;
    return yield* api.campaignList(null);
  }),
);

export const createCampaignAtom = campaignRuntime.fn(
  Effect.fnUntraced(function*(args: { readonly title: string; }) {
    const api = yield* CampaignApi;
    return yield* api.campaignCreate(args);
  }),
);

export const campaignDataFamily = Atom.family((campaignId: CampaignId) =>
  campaignRuntime.atom(
    Effect.gen(function*() {
      const api = yield* CampaignApi;
      return yield* api.campaignGet(campaignId);
    }),
  )
);
