import { MonsterRpc } from "./MonstersApi.js";
import { CampaignRpc } from "./CampaignsApi.js";
import { ChatRpc } from "./ChatApi.js";

export * from "./MonstersApi.js";
export * from "./CampaignsApi.js";
export * from "./ChatApi.js";

export const DomainRpc = MonsterRpc.merge(CampaignRpc).merge(ChatRpc);
