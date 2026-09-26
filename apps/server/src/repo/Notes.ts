import {
  type Actor,
  type CampaignId,
  type CreatedOrder,
  type CreatedPageFilterValues,
  CurrentActor,
  type EncounterId,
  Note,
  type NoteAttachment,
  type NoteCategory,
  type NoteCreate,
  type NoteId,
  type NoteKind,
  type NoteUpdate,
  NotFound,
  type Page,
  PlayerNote,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { createdOrdering, orderClause, pageClauses, pageLimit, pageOfRows } from "./paging.js";
import {
  type AssistantOrigin,
  assistantColumns,
  defined,
  dieOnSqlError,
  type ProvenanceColumns,
  provenanceOf,
  setClause,
} from "./rows.js";
import {
  ensureCampaignReadable,
  ensureCampaignWritable,
  rowReadable,
  rowWritable,
} from "./visibility.js";

export interface NoteRow extends ProvenanceColumns {
  readonly id: NoteId;
  readonly campaign_id: CampaignId;
  readonly title: string;
  readonly body: string;
  readonly kind: NoteKind;
  readonly category: NoteCategory | null;
  readonly encounter_id: EncounterId | null;
  readonly pinned_at: Date | null;
}

export const toNote = (row: NoteRow): Note =>
  new Note({
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    category: row.category,
    attachedTo: row.encounter_id === null ? null : { kind: "encounter", id: row.encounter_id },
    pinnedAt: row.pinned_at === null ? null : DateTime.fromDateUnsafe(row.pinned_at),
    ...provenanceOf(row),
  });

/**
 * A note as a player is told it — only the columns `PlayerNote` has, and
 * `encounter_id` already narrowed to an encounter this reader may read.
 * `created_at` is selected for the page cursor and goes no further.
 */
export interface PlayerNoteRow {
  readonly id: NoteId;
  readonly campaign_id: CampaignId;
  readonly title: string;
  readonly body: string;
  readonly kind: NoteKind;
  readonly category: NoteCategory | null;
  readonly encounter_id: EncounterId | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * The select list of every player read of `note`: `listAsPlayer` and a
 * player's recap. None of the wide columns — no visibility, provenance or pin
 * — and the attachment kept only when the encounter it names passes the
 * encounter's own `rowReadable` (Shared and Ready for a player), so an
 * encounter the DM kept is not named, not even by id.
 */
export const playerNoteColumns = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment => sql`
  note.id, note.campaign_id, note.title, note.body, note.kind, note.category,
  note.created_at, note.updated_at,
  case when exists (
    select 1 from encounter
    where encounter.id = note.encounter_id
      and ${rowReadable(sql, "encounter", campaignId, actor)}
  ) then note.encounter_id end as encounter_id
`;

export const toPlayerNote = (row: PlayerNoteRow): PlayerNote =>
  new PlayerNote({
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    category: row.category,
    attachedTo: row.encounter_id === null ? null : { kind: "encounter", id: row.encounter_id },
    updatedAt: DateTime.fromDateUnsafe(row.updated_at),
  });

/**
 * The attachment, as the single nullable column that holds it.
 *
 * `undefined` in, `undefined` out: an absent `attachedTo` leaves the column
 * alone on a PATCH and falls through to the default on an INSERT, while an
 * explicit `null` detaches. `defined()` downstream is what turns that
 * distinction into "column omitted" rather than "bound as SQL NULL".
 */
const attachmentColumn = (attachedTo: NoteAttachment | null | undefined) =>
  attachedTo === undefined ? undefined : attachedTo === null ? null : attachedTo.id;

/**
 * Fails with `NotFound` unless the encounter exists in this campaign and this
 * actor may write to it.
 *
 * The composite `note_encounter_fkey` already makes a cross-campaign attachment
 * impossible, but a constraint violation is a defect and a 500. This turns the
 * same refusal into the 404 the rest of the surface answers with, and it also
 * covers what the key cannot see: whether the *actor* reaches that encounter.
 */
const ensureEncounterWritable = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  attachedTo: NoteAttachment | null | undefined,
) =>
  Effect.gen(function* () {
    if (attachedTo === undefined || attachedTo === null) return;
    const actor = yield* CurrentActor;
    const rows = yield* sql<{ readonly id: EncounterId }>`
      select encounter.id from encounter
      where encounter.id = ${attachedTo.id}
        and ${rowWritable(sql, "encounter", campaignId, actor)}
    `;
    if (rows.length === 0) {
      return yield* new NotFound({ resource: "encounter", id: attachedTo.id });
    }
  });

export class Notes extends Context.Service<
  Notes,
  {
    /**
     * Paged, oldest first. See `repo/paging.ts` — the cursor is a clause of the
     * same `where` the visibility predicate is in, never a slice of what came
     * back. The creator's alone, so it takes the proof: `Note` is the working
     * record, and a player's read is `listAsPlayer`.
     */
    readonly list: (
      creator: CampaignCreatorActor,
      filter: CreatedPageFilterValues,
    ) => Effect.Effect<Page<Note, CreatedOrder>>;
    readonly findById: (creator: CampaignCreatorActor, id: NoteId) => Effect.Effect<Note, NotFound>;
    /**
     * The notes this reader can see, as `PlayerNote`: no visibility, no
     * provenance, and the attachment only to an encounter they may read.
     * Paged, oldest first, as `list` is.
     */
    readonly listAsPlayer: (
      campaignId: CampaignId,
      filter: CreatedPageFilterValues,
    ) => Effect.Effect<Page<PlayerNote, CreatedOrder>, NotFound, CurrentActor>;
    /**
     * `from` is set by `repo/Proposals.ts` and by nothing else — it is the
     * accept path saying which assistant turn produced this row. There is no
     * `origin` on `NoteCreate`, so it cannot arrive from a client.
     */
    readonly create: (
      campaignId: CampaignId,
      payload: NoteCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<Note, NotFound, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      id: NoteId,
      patch: NoteUpdate,
    ) => Effect.Effect<Note, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      id: NoteId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
    /**
     * Pins the note, or unpins it with `pinned: false`. Neither touches
     * `updated_at`: pinning orders the DM's list and is not an edit. Pinning
     * a pinned note keeps the time it was first pinned, so both are
     * idempotent.
     */
    readonly setPinned: (
      campaignId: CampaignId,
      id: NoteId,
      pinned: boolean,
    ) => Effect.Effect<Note, NotFound, CurrentActor>;
  }
>()("Notes") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const ordering = createdOrdering<NoteRow>(sql, "note");
      const playerOrdering = createdOrdering<PlayerNoteRow>(sql, "note");

      return {
        list: (creator, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const { campaign, actor } = creator;
              const rows = yield* sql<NoteRow>`
                select * from note
                where ${sql.and([
                  rowReadable(sql, "note", campaign, actor),
                  ...pageClauses(sql, ordering, filter.cursor),
                ])}
                order by ${orderClause(sql, ordering)}
                limit ${pageLimit(filter.limit)}
              `;
              return pageOfRows(rows, filter.limit, ordering, "created", toNote);
            }),
          ),

        findById: (creator, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const { campaign, actor } = creator;
              const rows = yield* sql<NoteRow>`
                select * from note
                where note.id = ${id} and ${rowReadable(sql, "note", campaign, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "note", id });
              return toNote(rows[0]!);
            }),
          ),

        // The player projection: the same `rowReadable` as every read here,
        // and none of the wide columns (`playerNoteColumns`).
        listAsPlayer: (campaignId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* sql<PlayerNoteRow>`
                select ${playerNoteColumns(sql, campaignId, actor)}
                from note
                where ${sql.and([
                  rowReadable(sql, "note", campaignId, actor),
                  ...pageClauses(sql, playerOrdering, filter.cursor),
                ])}
                order by ${orderClause(sql, playerOrdering)}
                limit ${pageLimit(filter.limit)}
              `;
              return pageOfRows(rows, filter.limit, playerOrdering, "created", toPlayerNote);
            }),
          ),

        create: (campaignId, payload, from) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                yield* ensureEncounterWritable(sql, campaignId, payload.attachedTo);
                const rows = yield* sql<NoteRow>`
                  insert into note ${sql.insert(
                    defined({
                      campaign_id: campaignId,
                      title: payload.title,
                      body: payload.body,
                      kind: payload.kind,
                      category: payload.category,
                      encounter_id: attachmentColumn(payload.attachedTo),
                      visibility: payload.visibility,
                      ...assistantColumns(from),
                    }),
                  )}
                  returning *
                `;
                return toNote(rows[0]!);
              }),
            ),
          ),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureEncounterWritable(sql, campaignId, patch.attachedTo);
                const columns = defined({
                  title: patch.title,
                  body: patch.body,
                  kind: patch.kind,
                  category: patch.category,
                  encounter_id: attachmentColumn(patch.attachedTo),
                  visibility: patch.visibility,
                });
                const rows = yield* sql<NoteRow>`
                  update note set ${setClause(sql, columns)}
                  where note.id = ${id} and ${rowWritable(sql, "note", campaignId, actor)}
                  returning *
                `;
                if (rows.length === 0) return yield* new NotFound({ resource: "note", id });
                return toNote(rows[0]!);
              }),
            ),
          ),

        remove: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: NoteId }>`
                delete from note
                where note.id = ${id} and ${rowWritable(sql, "note", campaignId, actor)}
                returning note.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "note", id });
            }),
          ),

        // Not `setClause`: that stamps `updated_at`, and a pin is not an edit.
        setPinned: (campaignId, id, pinned) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<NoteRow>`
                update note
                set pinned_at = ${pinned ? sql`coalesce(note.pinned_at, now())` : sql`null`}
                where note.id = ${id} and ${rowWritable(sql, "note", campaignId, actor)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "note", id });
              return toNote(rows[0]!);
            }),
          ),
      };
    }),
  );
}
