import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { UserId } from "./UsersApi.js";

export const CharacterId = Schema.UUID.pipe(Schema.brand("CharacterId"));
export type CharacterId = typeof CharacterId.Type;

export const CharacterIdFromString = Schema.UUID.pipe(
  Schema.compose(CharacterId),
);

export class Character extends Schema.Class<Character>("Character")({
  id: CharacterId,
  name: Schema.NonEmptyTrimmedString,
  userId: Schema.optional(UserId),
  // TODO: Fix this throws a parse error when decoding from postgres TIMESTAMP
  // createdAt: Schema.DateTimeUtcFromDate,
  // updatedAt: Schema.DateTimeUtcFromDate,
}) {}

export class CreateCharacterPayload extends Schema.Class<CreateCharacterPayload>(
  "CreateCharacterPayload",
)({
  name: Schema.NonEmptyTrimmedString,
  userId: Schema.optional(UserId),
}) {}

export class CharacterRpc extends RpcGroup.make(
  Rpc.make("CharacterList", {
    success: Character,
    stream: true,
  }),
  Rpc.make("CharacterCreate", {
    success: Character,
    payload: CreateCharacterPayload,
  }),
) {}
