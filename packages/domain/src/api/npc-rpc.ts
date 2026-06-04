import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { AuthMiddleware } from "../auth.js";
import { CampaignId } from "./ids.js";
import { NpcId } from "./ids.js";

export { NpcId } from "./ids.js";

export class NpcNotFoundError extends Schema.TaggedErrorClass<NpcNotFoundError>()(
  "NpcNotFoundError",
  {
    id: NpcId,
  },
) {}

export class Npc extends Schema.Opaque<Npc>()(
  Schema.Struct({
    id: NpcId,
    campaignId: CampaignId,
    title: Schema.String,
    createdAt: Schema.DateTimeUtcFromString,
    updatedAt: Schema.DateTimeUtcFromString,
  }),
) {}

export class NpcListRpc extends Rpc.make("npc_list", {
  payload: {
    campaignId: CampaignId,
    cursor: Schema.NullOr(Schema.DateTimeUtcFromString),
  },
  success: Schema.Struct({
    items: Schema.Array(Npc),
    hasMore: Schema.Boolean,
  }),
}) {}

export class NpcGetRpc extends Rpc.make("npc_get", {
  payload: { campaignId: CampaignId, npcId: NpcId },
  success: Npc,
  error: NpcNotFoundError,
}) {}

export class NpcRpc extends RpcGroup.make(NpcListRpc, NpcGetRpc).middleware(
  AuthMiddleware,
) {}
