import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";

export const UserId = Schema.UUID.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const UserIdFromString = Schema.UUID.pipe(Schema.compose(UserId));

export class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.NonEmptyTrimmedString,
  // createdAt: Schema.DateTimeUtcFromDate,
  // updatedAt: Schema.DateTimeUtcFromDate,
}) {}

export class CreateUserPayload extends Schema.Class<CreateUserPayload>(
  "CreateUserPayload",
)({
  name: Schema.NonEmptyTrimmedString,
}) {}

export class UserRpc extends RpcGroup.make(
  Rpc.make("UserList", {
    success: User,
    stream: true,
  }),
  Rpc.make("UserCreate", {
    success: User,
    payload: CreateUserPayload,
  }),
) {}
