import {
  type Actor,
  CampaignId,
  type CreatedOrder,
  createdPageFilter,
  type CreatedPageFilterValues,
  CurrentActor,
  type EncounterId,
  Note,
  type NoteAttachment,
  type NoteCreate,
  NoteId,
  type NoteLink,
  type NoteLinkKind,
  type NoteUpdate,
  NotFound,
  type Page,
  PlayerNote,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema, type Statement } from "effect/unstable/sql";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import { ensureLinkTarget, type LinkTargetId, linkColumn, linksAggregate } from "./links.js";
import { createdOrdering, orderClause, pageClauses, pageLimit, pageOfRows } from "./paging.js";
import {
  type AssistantOrigin,
  assistantColumns,
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  setClause,
  timestampColumns,
} from "./rows.js";
import {
  ensureCampaignReadable,
  ensureCampaignWritable,
  rowReadable,
  rowWritable,
} from "./visibility.js";

/**
 * The attachment as the wire spells it, built from the one nullable column
 * that holds it: `null`, or the encounter it names.
 */
const attachment = (sql: SqlClient.SqlClient, encounterId: Statement.Fragment) =>
  sql`case when ${encounterId} is not null
        then json_build_object('kind', 'encounter', 'id', ${encounterId}) end`;

/**
 * Every column of the creator's `Note`: the row, its attachment, and its links
 * as one `json` array in the order they were added. The links need no
 * predicate of their own — a row reaches this select only through the
 * note's, and every target is in the note's campaign by key
 * (`0069_note_links.ts`, `0074_npc_links.ts`). Usable in a `returning`, where
 * the subquery sees the note's links as they stand.
 */
export const noteColumns = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`note.*, ${attachment(sql, sql`note.encounter_id`)} as attached_to,
      ${linksAggregate(sql, "note_link", sql`note_link.note_id = note.id`)} as links`;

/**
 * A note as the creator reads it, decoded off `noteColumns` by `SqlSchema`.
 * Exported for `Recap`, which reads the notes a night read out.
 */
export const NoteRow = classFromColumns(Note, {
  ...Note.fields,
  pinnedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  ...timestampColumns,
});

/**
 * The select list of every player read of `note`: `listAsPlayer` and a
 * player's recap. None of the wide columns — no visibility, provenance or pin
 * — and the attachment kept only when the encounter it names passes the
 * encounter's own `rowReadable` (Shared and Ready for a player), so an
 * encounter the DM kept is not named, not even by id. `created_at` is selected
 * for the page cursor and goes no further.
 */
export const playerNoteColumns = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment => sql`
  note.id, note.campaign_id, note.title, note.body, note.kind, note.category,
  note.created_at, note.updated_at,
  ${attachment(
    sql,
    sql`case when exists (
      select 1 from encounter
      where encounter.id = note.encounter_id
        and ${rowReadable(sql, "encounter", campaignId, actor)}
    ) then note.encounter_id end`,
  )} as attached_to
`;

/** A note as a player is told it, decoded off `playerNoteColumns`. Exported for `Recap`. */
export const PlayerNoteRow = classFromColumns(PlayerNote, {
  ...PlayerNote.fields,
  updatedAt: timestampColumns.updatedAt,
});

/** The same, with the `created_at` a page's cursor keys on beside it. */
const PlayerNotePageRow = fromColumns(Schema.Struct({ ...PlayerNote.fields, ...timestampColumns }));

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));
const PageFilter = Schema.Struct(createdPageFilter);
const PageRequest = Schema.toType(Schema.Struct({ campaign: CampaignId, filter: PageFilter }));

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
      targetId: LinkTargetId,
    ) => Effect.Effect<Note, NotFound>;
  }
>()("Notes") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const ordering = createdOrdering<Note>(sql, "note");
      const playerOrdering = createdOrdering<typeof PlayerNotePageRow.Type>(sql, "note");

      const readablePage = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, filter: PageFilter })),
        Result: NoteRow,
        execute: ({ campaign, actor, filter }) => sql`
          select ${noteColumns(sql)} from note
          where ${sql.and([
            rowReadable(sql, "note", campaign, actor),
            ...pageClauses(sql, ordering, filter.cursor),
          ])}
          order by ${orderClause(sql, ordering)}
          limit ${pageLimit(filter.limit)}
        `,
      });
      const readable = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, id: NoteId })),
        Result: NoteRow,
        execute: ({ campaign, actor, id }) => sql`
          select ${noteColumns(sql)} from note
          where note.id = ${id} and ${rowReadable(sql, "note", campaign, actor)}
        `,
      });
      const readNote = (creator: CampaignCreatorActor, id: NoteId) =>
        readable({ ...asked(creator), id }).pipe(orNotFound("note", id));
      // The player projection: the same `rowReadable` as every read here,
      // and none of the wide columns (`playerNoteColumns`).
      const playerPage = SqlSchema.findAll({
        Request: PageRequest,
        Result: PlayerNotePageRow,
        execute: ({ campaign, filter }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${playerNoteColumns(sql, campaign, actor)}
              from note
              where ${sql.and([
                rowReadable(sql, "note", campaign, actor),
                ...pageClauses(sql, playerOrdering, filter.cursor),
              ])}
              order by ${orderClause(sql, playerOrdering)}
              limit ${pageLimit(filter.limit)}
            `,
          ),
      });
      /** A new note. What reaches its campaign was checked by the method that built the columns. */
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: NoteRow,
        execute: (columns) => sql`
          insert into note ${sql.insert(columns)}
          returning ${noteColumns(sql)}
        `,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ campaign: CampaignId, id: NoteId, columns: Columns }),
        ),
        Result: NoteRow,
        execute: ({ campaign, id, columns }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update note set ${setClause(sql, columns)}
              where note.id = ${id} and ${rowWritable(sql, "note", campaign, actor)}
              returning ${noteColumns(sql)}
            `,
          ),
      });
      // Not `setClause`: that stamps `updated_at`, and a pin is not an edit.
      const pin = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ campaign: CampaignId, id: NoteId, pinned: Schema.Boolean }),
        ),
        Result: NoteRow,
        execute: ({ campaign, id, pinned }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update note
              set pinned_at = ${pinned ? sql`coalesce(note.pinned_at, now())` : sql`null`}
              where note.id = ${id} and ${rowWritable(sql, "note", campaign, actor)}
              returning ${noteColumns(sql)}
            `,
          ),
      });
      const erase = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaign: CampaignId, id: NoteId })),
        Result: fromColumns(Schema.Struct({ id: NoteId })),
        execute: ({ campaign, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              delete from note
              where note.id = ${id} and ${rowWritable(sql, "note", campaign, actor)}
              returning note.id
            `,
          ),
      });
      /** The note the creator is linking or unlinking, if they may write it. */
      const writable = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, id: NoteId })),
        Result: fromColumns(Schema.Struct({ id: NoteId })),
        execute: ({ campaign, actor, id }) => sql`
          select note.id from note
          where note.id = ${id} and ${rowWritable(sql, "note", campaign, actor)}
        `,
      });

      return {
        list: (creator, filter) =>
          dieOnSqlError(
            Effect.map(readablePage({ ...asked(creator), filter }), (rows) =>
              pageOfRows(rows, filter.limit, ordering, "created", (note) => note),
            ),
          ),

        findById: (creator, id) => dieOnSqlError(readNote(creator, id)),

        listAsPlayer: (campaignId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* playerPage({ campaign: campaignId, filter });
              return pageOfRows(
                rows,
                filter.limit,
                playerOrdering,
                "created",
                ({ createdAt: _, ...note }) => new PlayerNote(note, { disableChecks: true }),
              );
            }),
          ),

        create: (campaignId, payload, from) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                yield* ensureEncounterWritable(sql, campaignId, payload.attachedTo);
                // An insert answers with its row; not getting one is a defect.
                return yield* insert(
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
                ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
              }),
            ),
          ),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* ensureEncounterWritable(sql, campaignId, patch.attachedTo);
                const columns = defined({
                  title: patch.title,
                  body: patch.body,
                  kind: patch.kind,
                  category: patch.category,
                  encounter_id: attachmentColumn(patch.attachedTo),
                  visibility: patch.visibility,
                });
                return yield* change({ campaign: campaignId, id, columns }).pipe(
                  orNotFound("note", id),
                );
              }),
            ),
          ),

        remove: (campaignId, id) =>
          dieOnSqlError(
            Effect.asVoid(erase({ campaign: campaignId, id }).pipe(orNotFound("note", id))),
          ),

        setPinned: (campaignId, id, pinned) =>
          dieOnSqlError(pin({ campaign: campaignId, id, pinned }).pipe(orNotFound("note", id))),

        addLink: (creator, id, link) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* writable({ ...asked(creator), id }).pipe(orNotFound("note", id));
                yield* ensureLinkTarget(sql, creator, link);
                yield* sql`
                  insert into note_link ${sql.insert({
                    note_id: id,
                    campaign_id: creator.campaign,
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
                yield* writable({ ...asked(creator), id }).pipe(orNotFound("note", id));
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
