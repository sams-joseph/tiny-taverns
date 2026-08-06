import {
  type CampaignId,
  CurrentActor,
  Note,
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

interface NoteRow extends ProvenanceColumns {
  readonly id: NoteId;
  readonly campaign_id: CampaignId;
  readonly title: string;
  readonly body: string;
  readonly kind: NoteKind;
}

const toNote = (row: NoteRow): Note =>
  new Note({
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    ...provenanceOf(row),
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
                const rows = yield* sql<NoteRow>`
                  insert into note ${sql.insert(
                    defined({
                      campaign_id: campaignId,
                      title: payload.title,
                      body: payload.body,
                      kind: payload.kind,
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
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({
                title: patch.title,
                body: patch.body,
                kind: patch.kind,
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
