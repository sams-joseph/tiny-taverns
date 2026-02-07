import { HttpApi } from "@effect/platform";
import { TodosApiGroup } from "./TodosApi.js";
import { MonstersApiGroup } from "./MonstersApi.js";

export * from "./TodosApi.js";
export * from "./MonstersApi.js";
export * from "./ChatRpc.js";

export class DomainApi extends HttpApi.make("api")
  .add(TodosApiGroup)
  .add(MonstersApiGroup) {}
