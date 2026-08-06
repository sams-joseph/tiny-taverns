import { Schema } from "effect";
import { CampaignId, NoteId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * `read_aloud` is a kind of note, not a separate table: it is the same content
 * with different typography, and the fixtures show it both free-standing and
 * attached to a stat block.
 */
export const NoteKind = Schema.Literals(["note", "read_aloud"]);
export type NoteKind = typeof NoteKind.Type;

export class Note extends Schema.Class<Note>("Note")({
  id: NoteId,
  campaignId: CampaignId,
  title: Schema.String,
  body: Schema.String,
  kind: NoteKind,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export const NoteCreate = Schema.Struct({
  title: Schema.NonEmptyString,
  body: Schema.optional(Schema.String),
  kind: Schema.optional(NoteKind),
  visibility: Schema.optional(Visibility),
});
export type NoteCreate = typeof NoteCreate.Type;

export const NoteUpdate = Schema.Struct({
  title: Schema.optional(Schema.NonEmptyString),
  body: Schema.optional(Schema.String),
  kind: Schema.optional(NoteKind),
  visibility: Schema.optional(Visibility),
});
export type NoteUpdate = typeof NoteUpdate.Type;
