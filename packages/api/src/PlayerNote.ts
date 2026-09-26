import { Schema } from "effect";
import { CampaignId, NoteId } from "./Ids.js";
import { NoteAttachment, NoteCategory, NoteKind } from "./Note.js";

/**
 * A note the DM shared, told to somebody sitting at the table.
 *
 * **A distinct type on a distinct path, not a filtered `Note`** — the
 * `PlayerEncounter` decision, for the same reason. `Note` is the creator's
 * working record and grows with the Notes screen; a player reading it would
 * read every field it gains. This cannot spell `visibility` or provenance, so
 * a row can only reach a player because the SQL chose it, never because a
 * handler forgot to drop a column.
 *
 * `kind` stays because it is the register the text is set in: read-aloud is
 * read aloud at the table, and a player sees it in serif like the DM does.
 * `category` stays because it is what the note is about, which the text
 * already tells them. The pin does not: it is how the DM orders their desk.
 *
 * `attachedTo` is **narrowed in SQL**: it names the encounter only when this
 * reader may read that encounter (Shared and Ready), and is `null` otherwise —
 * the rule `PlayerLiveFight.encounterId` answers by, so the live table can find
 * a fight's read-aloud and a player learns nothing of an encounter the DM kept.
 */
export class PlayerNote extends Schema.Class<PlayerNote>("PlayerNote")({
  id: NoteId,
  campaignId: CampaignId,
  title: Schema.String,
  body: Schema.String,
  kind: NoteKind,
  category: Schema.NullOr(NoteCategory),
  attachedTo: Schema.NullOr(NoteAttachment),
  updatedAt: Schema.DateTimeUtcFromString,
}) {}
