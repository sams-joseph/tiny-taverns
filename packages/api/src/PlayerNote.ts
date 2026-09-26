import { Schema } from "effect";
import { CampaignId, NoteId } from "./Ids.js";
import { NoteAttachment, NoteKind } from "./Note.js";

/**
 * A note the DM shared, told to somebody sitting at the table.
 *
 * **A distinct type on a distinct path, not a filtered `Note`** — the
 * `PlayerEncounter` decision, for the same reason. `Note` is the creator's
 * working record and grows with the Notes screen; a player reading it would
 * read every field it gains. This cannot spell `visibility`, provenance or the
 * creator's links, so a row can only reach a player because the SQL chose it,
 * never because a handler forgot to drop a column. It is also what a player's
 * recap says of a note (`PlayerSessionRecap.notes`).
 *
 * `kind` stays because it is the register the text is set in: read-aloud is
 * read aloud at the table, and a player sees it in serif like the DM does.
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
  attachedTo: Schema.NullOr(NoteAttachment),
  updatedAt: Schema.DateTimeUtcFromString,
}) {}
