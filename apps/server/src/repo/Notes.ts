import {
  type CampaignId,
  CurrentActor,
  type EncounterId,
  Note,
  type NoteAttachment,
  type NoteCreate,
  type NoteId,
  type NoteKind,
  type NoteUpdate,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
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
  readonly encounter_id: EncounterId | null;
}

export const toNote = (row: NoteRow): Note =>
  new Note({
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    attachedTo: row.encounter_id === null ? null : { kind: "encounter", id: row.encounter_id },
    ...provenanceOf(row),
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
    readonly list: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<Note>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      id: NoteId,
    ) => Effect.Effect<Note, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      payload: NoteCreate,
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
  }
>()("Notes") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* sql<NoteRow>`
                select * from note
                where ${rowReadable(sql, "note", campaignId, actor)}
                order by note.created_at asc
              `;
              return rows.map(toNote);
            }),
          ),

        findById: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<NoteRow>`
                select * from note
                where note.id = ${id} and ${rowReadable(sql, "note", campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "note", id });
              return toNote(rows[0]!);
            }),
          ),

        create: (campaignId, payload) =>
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
                      encounter_id: attachmentColumn(payload.attachedTo),
                      visibility: payload.visibility,
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
      };
    }),
  );
}
