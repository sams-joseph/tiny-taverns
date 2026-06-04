import type { CampaignId } from "@app/domain/api/campaign-rpc";
import type { NpcId } from "@app/domain/api/npc-rpc";
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore";
import * as Atom from "effect/unstable/reactivity/Atom";
import { NpcApi } from "./npcs-api";

export const npcsRuntime = Atom.runtime(NpcApi.layer);
const preferencesLayer: Layer.Layer<KeyValueStore.KeyValueStore> =
  BrowserKeyValueStore.layerLocalStorage;
export const preferencesRuntime = Atom.runtime(preferencesLayer);

export const npcListFamily = Atom.family((campaignId: CampaignId) =>
  npcsRuntime
    .atom(
      Effect.gen(function*() {
        const api = yield* NpcApi;
        return yield* api.npcList({ campaignId, cursor: null });
      }),
    )
    .pipe(Atom.refreshOnWindowFocus)
);

export const npcDataFamily = Atom.family((input: { campaignId: CampaignId; npcId: NpcId; }) =>
  npcsRuntime
    .atom(
      Effect.gen(function*() {
        const api = yield* NpcApi;
        return yield* api.npcGet(input);
      }),
    )
    .pipe(Atom.withReactivity(["items"]))
);
