import * as Npc from "@app/domain/api/npc-rpc";
import * as Schema from "effect/Schema";
import { Model } from "effect/unstable/schema";

export class NpcModel extends Model.Class<NpcModel>("NpcModel")({
  id: Model.Generated(Npc.NpcId),
  userId: Schema.String,
  title: Schema.NonEmptyString,
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}
