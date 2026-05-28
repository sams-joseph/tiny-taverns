import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore";
import * as Atom from "effect/unstable/reactivity/Atom";
import { NpcApi } from "./npcs-api";
import type { NpcId } from "@app/domain/api/npc-rpc";

export const npcsRuntime = Atom.runtime(NpcApi.layer);
const preferencesLayer: Layer.Layer<KeyValueStore.KeyValueStore> =
  BrowserKeyValueStore.layerLocalStorage;
export const preferencesRuntime = Atom.runtime(preferencesLayer);

export const npcListAtom = npcsRuntime.atom(
  Effect.gen(function* () {
    const api = yield* NpcApi;
    return yield* api.npcList(null);
  }),
);

export const npcDataFamily = Atom.family((npcId: NpcId) =>
  npcsRuntime.atom(
    Effect.gen(function* () {
      const api = yield* NpcApi;
      return yield* api.npcGet(npcId);
    }),
  ),
);
