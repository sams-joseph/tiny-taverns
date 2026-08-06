import { Schema } from "effect";
import { CampaignId, EncounterId, NoteId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * `read_aloud` is a kind of note, not a separate table: it is the same content
 * with different typography, and the fixtures show it both free-standing and
 * attached to a stat block.
 */
export const NoteKind = Schema.Literals(["note", "read_aloud"]);
export type NoteKind = typeof NoteKind.Type;

/**
 * What a note is attached to, or `null` for a free-standing one.
 *
 * The fixtures show read-aloud in both positions: free-standing on the Notes tab
 * (`CampaignHome.jsx:56-64`, "Read aloud at the water") and hanging off a stat
 * block (`data.js:33`, `StatBlock.jsx:39-41`). One `note` table with an optional
 * attachment is what keeps that from becoming a `read_aloud` column on three
 * tables, each with its own visibility rule to get wrong.
 *
 * Only `encounter` is attachable today because it is the only attachable thing
 * that exists — `creature` arrives with the bestiary. The `kind` tag is here
 * from the first version anyway, so adding `creature` is a new member of a
 * shape the client already branches on rather than a second nullable id beside
 * this one.
 *
 * In the database this is a real foreign key (`note.encounter_id`), not a
 * polymorphic `(kind, id)` pair. A polymorphic column cannot be a foreign key,
 * which means no referential integrity and read-aloud text left pointing at an
 * encounter that is gone.
 */
export const NoteAttachment = Schema.Struct({
  kind: Schema.Literals(["encounter"]),
  id: EncounterId,
});
export type NoteAttachment = typeof NoteAttachment.Type;

export class Note extends Schema.Class<Note>("Note")({
  id: NoteId,
  campaignId: CampaignId,
  title: Schema.String,
  body: Schema.String,
  kind: NoteKind,
  attachedTo: Schema.NullOr(NoteAttachment),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export const NoteCreate = Schema.Struct({
  title: Schema.NonEmptyString,
  body: Schema.optional(Schema.String),
  kind: Schema.optional(NoteKind),
  attachedTo: Schema.optional(NoteAttachment),
  visibility: Schema.optional(Visibility),
});
export type NoteCreate = typeof NoteCreate.Type;

export const NoteUpdate = Schema.Struct({
  title: Schema.optional(Schema.NonEmptyString),
  body: Schema.optional(Schema.String),
  kind: Schema.optional(NoteKind),
  /** `null` detaches the note; omitting the field leaves the attachment alone. */
  attachedTo: Schema.optional(Schema.NullOr(NoteAttachment)),
  visibility: Schema.optional(Visibility),
});
export type NoteUpdate = typeof NoteUpdate.Type;
