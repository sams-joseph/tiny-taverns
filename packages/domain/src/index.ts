import { HttpApi } from "@effect/platform";
import { MonsterRpc, MonstersApiGroup } from "./MonstersApi.js";
import { ChatRpcs } from "./ChatRpc.js";
import { CampaignsApiGroup } from "./CampaignsApi.js";
import { RpcGroup } from "@effect/rpc";

export * from "./MonstersApi.js";
export * from "./CampaignsApi.js";
export * from "./ChatRpc.js";

export class DomainApi extends HttpApi.make("api")
  .add(MonstersApiGroup)
  .add(CampaignsApiGroup) {}

export const DomainRpc = MonsterRpc.merge(ChatRpcs);
