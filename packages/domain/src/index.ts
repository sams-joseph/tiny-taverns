import { MonsterRpc } from "./MonstersApi.js";
import { CampaignRpc } from "./CampaignsApi.js";
import { ChatRpc } from "./ChatApi.js";
import { CharacterRpc } from "./CharactersApi.js";
import { UserRpc } from "./UsersApi.js";

export * from "./MonstersApi.js";
export * from "./CampaignsApi.js";
export * from "./ChatApi.js";
export * from "./CharactersApi.js";
export * from "./UsersApi.js";

export const DomainRpc = MonsterRpc.merge(CampaignRpc)
  .merge(ChatRpc)
  .merge(CharacterRpc)
  .merge(UserRpc);
