import {
  type Actor,
  type CampaignCharacterId,
  type CampaignId,
  type CreatedOrder,
  type CreatedPageFilterValues,
  CurrentActor,
  type EncounterId,
  Note,
  type NoteAttachment,
  type NoteCreate,
  type NoteId,
  type NoteKind,
  type NoteLink,
  type NoteLinkKind,
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
  ownedRowReadable,
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
  /** `json`, which the pg driver parses: `noteColumns`' aggregate. */
  readonly links: ReadonlyArray<NoteLink>;
}

/**
 * Every column of the creator's `Note`: the row, and its links as one `json`
 * array in the order they were added. The links need no predicate of their
 * own — a row reaches this select only through the note's, and every target
 * is in the note's campaign by key (`0068_note_links.ts`). Usable in a
 * `returning`, where the subquery sees the note's links as they stand.
 */
export const noteColumns = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`note.*, coalesce((
    select json_agg(json_build_object(
      'kind', case when note_link.encounter_id is null then 'seat' else 'encounter' end,
      'id', coalesce(note_link.encounter_id, note_link.campaign_character_id)
    ) order by note_link.created_at, note_link.id)
    from note_link
    where note_link.note_id = note.id
  ), '[]'::json) as links`;

export const toNote = (row: NoteRow): Note =>
  new Note({
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    attachedTo: row.encounter_id === null ? null : { kind: "encounter", id: row.encounter_id },
    links: row.links,
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
  readonly encounter_id: EncounterId | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * The player projection's select list: none of the wide columns, and the
 * attachment kept only when the encounter it names passes the encounter's own
 * `rowReadable` — Shared and Ready for a player — so an encounter the DM kept
 * is not named, not even by id. `Recap.readAsPlayer` selects a night's notes
 * with this too.
 */
export const playerNoteColumns = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql`note.id, note.campaign_id, note.title, note.body, note.kind,
      note.created_at, note.updated_at,
      case when exists (
        select 1 from encounter
        where encounter.id = note.encounter_id
          and ${rowReadable(sql, "encounter", campaignId, actor)}
      ) then note.encounter_id end as encounter_id`;

export const toPlayerNote = (row: PlayerNoteRow): PlayerNote =>
  new PlayerNote({
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    body: row.body,
    kind: row.kind,
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

/**
 * Fails with `NotFound` unless the link's target is in this campaign and the
 * creator reaches it: an encounter they may write, or a seat whose character
 * is still at the table. The composite keys already refuse another campaign's
 * target, as a 500; this is the same refusal as the 404 the surface answers
 * with, and it also refuses a retired seat, whose page a chip could not open.
 */
const ensureLinkTarget = (
  sql: SqlClient.SqlClient,
  creator: CampaignCreatorActor,
  link: NoteLink,
) =>
  Effect.gen(function* () {
    const { campaign, actor } = creator;
    const rows =
      link.kind === "encounter"
        ? yield* sql<{ readonly id: EncounterId }>`
            select encounter.id from encounter
            where encounter.id = ${link.id}
              and ${rowWritable(sql, "encounter", campaign, actor)}
          `
        : yield* sql<{ readonly id: CampaignCharacterId }>`
            select campaign_character.id from campaign_character
            where campaign_character.id = ${link.id}
              and campaign_character.campaign_id = ${campaign}
              and campaign_character.left_at is null
              and ${ownedRowReadable(sql, "campaign_character", campaign, actor)}
          `;
    if (rows.length === 0) {
      return yield* new NotFound({
        resource: link.kind === "encounter" ? "encounter" : "seat",
        id: link.id,
      });
    }
  });

/** The `note_link` column a link of this kind sets. */
const linkColumn = (kind: NoteLinkKind) =>
  kind === "encounter" ? "encounter_id" : "campaign_character_id";

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
     * The creator's alone, as the links are theirs to read. Answer the note
     * with its links. Neither moves `updatedAt`: linking says what a note is
     * about, and is not an edit of what it says. Both are idempotent.
     */
    readonly addLink: (
      creator: CampaignCreatorActor,
      id: NoteId,
      link: NoteLink,
    ) => Effect.Effect<Note, NotFound>;
    readonly removeLink: (
      creator: CampaignCreatorActor,
      id: NoteId,
      kind: NoteLinkKind,
      targetId: EncounterId | CampaignCharacterId,
    ) => Effect.Effect<Note, NotFound>;
  }
>()("Notes") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const ordering = createdOrdering<NoteRow>(sql, "note");
      const playerOrdering = createdOrdering<PlayerNoteRow>(sql, "note");

      const readNote = (creator: CampaignCreatorActor, id: NoteId) =>
        Effect.gen(function* () {
          const { campaign, actor } = creator;
          const rows = yield* sql<NoteRow>`
            select ${noteColumns(sql)} from note
            where note.id = ${id} and ${rowReadable(sql, "note", campaign, actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "note", id });
          return toNote(rows[0]!);
        });

      return {
        list: (creator, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const { campaign, actor } = creator;
              const rows = yield* sql<NoteRow>`
                select ${noteColumns(sql)} from note
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

        findById: (creator, id) => dieOnSqlError(readNote(creator, id)),

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
                      encounter_id: attachmentColumn(payload.attachedTo),
                      visibility: payload.visibility,
                      ...assistantColumns(from),
                    }),
                  )}
                  returning ${noteColumns(sql)}
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
                  returning ${noteColumns(sql)}
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

        addLink: (creator, id, link) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const { campaign, actor } = creator;
                const notes = yield* sql<{ readonly id: NoteId }>`
                  select note.id from note
                  where note.id = ${id} and ${rowWritable(sql, "note", campaign, actor)}
                `;
                if (notes.length === 0) return yield* new NotFound({ resource: "note", id });
                yield* ensureLinkTarget(sql, creator, link);
                yield* sql`
                  insert into note_link ${sql.insert({
                    note_id: id,
                    campaign_id: campaign,
                    [linkColumn(link.kind)]: link.id,
                  })}
                  on conflict do nothing
                `;
                return yield* readNote(creator, id);
              }),
            ),
          ),

        removeLink: (creator, id, kind, targetId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const { campaign, actor } = creator;
                const notes = yield* sql<{ readonly id: NoteId }>`
                  select note.id from note
                  where note.id = ${id} and ${rowWritable(sql, "note", campaign, actor)}
                `;
                if (notes.length === 0) return yield* new NotFound({ resource: "note", id });
                yield* sql`
                  delete from note_link
                  where note_link.note_id = ${id}
                    and ${sql(`note_link.${linkColumn(kind)}`)} = ${targetId}
                `;
                return yield* readNote(creator, id);
              }),
            ),
          ),
      };
    }),
  );
}
