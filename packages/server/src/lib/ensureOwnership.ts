import { UserId } from "@app/domain/auth";
import { Effect, Schema } from "effect";

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  "Unauthorized",
  {
    actorId: UserId,
    entity: Schema.String,
  },
) {}

export const ensureOwnership = (userId: UserId) => <T extends { userId: string; }>(record: T) =>
  record.userId === userId
    ? Effect.succeed(record)
    : Effect.fail(new Unauthorized({ actorId: userId, entity: "NPC" }));
