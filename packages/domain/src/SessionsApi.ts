import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { UserId } from "./UsersApi.js";

export const SessionId = Schema.UUID.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

export const SessionIdFromString = Schema.UUID.pipe(Schema.compose(SessionId));

// A single note entry in a session
export class SessionNote extends Schema.Class<SessionNote>("SessionNote")({
  timestamp: Schema.String, // ISO timestamp
  type: Schema.Literal("user", "assistant", "tool", "tool_result"),
  content: Schema.String,
  metadata: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  ),
}) {}

export class Session extends Schema.Class<Session>("Session")({
  id: SessionId,
  userId: Schema.optional(UserId),
  title: Schema.optional(Schema.String),
  notes: Schema.Array(SessionNote),
}) {}

export class CreateSessionPayload extends Schema.Class<CreateSessionPayload>(
  "CreateSessionPayload",
)({
  userId: Schema.optional(UserId),
  title: Schema.optional(Schema.String),
}) {}

export class AddSessionNotePayload extends Schema.Class<AddSessionNotePayload>(
  "AddSessionNotePayload",
)({
  sessionId: SessionId,
  note: SessionNote,
}) {}

export class SessionRpc extends RpcGroup.make(
  Rpc.make("SessionList", {
    success: Session,
    stream: true,
  }),
  Rpc.make("SessionCreate", {
    success: Session,
    payload: CreateSessionPayload,
  }),
  Rpc.make("SessionGet", {
    success: Session,
    payload: Schema.Struct({ id: SessionId }),
  }),
  Rpc.make("SessionAddNote", {
    success: Session,
    payload: AddSessionNotePayload,
  }),
) {}
