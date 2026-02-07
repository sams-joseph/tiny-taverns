import { HttpApi } from "@effect/platform";
import { MonstersApiGroup } from "./MonstersApi.js";
import { CampaignsApiGroup } from "./CampaignsApi.js";

export * from "./MonstersApi.js";
export * from "./CampaignsApi.js";
export * from "./ChatRpc.js";

export class DomainApi extends HttpApi.make("api")
  .add(MonstersApiGroup)
  .add(CampaignsApiGroup) {}
