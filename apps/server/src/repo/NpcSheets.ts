import {
  type ChallengeRating,
  Conflict,
  NotFound,
  type NpcId,
  type NpcListFilter,
  NpcSheet,
  type NpcSheetPut,
  NpcSheetSummary,
  type NpcSheetUpdate,
  type SheetBody,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { defined, dieOnSqlError, setClause } from "./rows.js";
import { recomputeForLevel, validateSubrace } from "./sheetLevel.js";
import { rowWritable, type Vocabulary, vocabularyAt } from "./visibility.js";

/**
 * Reads and writes over `npc_sheet`, an NPC's character-style sheet
 * (`0076_npc_sheets.ts`) — **the creator's alone**, so every method takes a
 * `CampaignCreatorActor` and still composes the NPC's creator predicate
 * beneath it. There is no player read here, and no player path anywhere reads
 * this table.
 *
 * It is not `Npcs`, for `NpcPrep.ts`'s reason: `Npcs` answers a player too,
 * and an NPC read that could reach a sheet is the leak `CreatorActor.ts`'s
 * standing rule exists to make impossible.
 *
 * Every read and write walks the NPC, the sheet's only containment answer: the
 * NPC must be in the proof's campaign, so another campaign's NPC named in this
 * path, and a Library original, are the same `NotFound`.
 *
 * The document is a character's rules half, and so are its rules: a level or
 * class change runs the character's own `recomputeForLevel`, and a subrace is
 * checked by the character's own `validateSubrace`, both against **the NPC's
 * campaign's rules** ({@link npcVocabulary}).
 *
 * Nothing else writes it: Hob has no tool for it, no NPC prompt reads it, and
 * search does not index it. It rings no doorbell, as prep does not: nothing
 * live moved.
 */

interface NpcSheetRow {
  readonly npc_id: NpcId;
  readonly level: number | null;
  readonly race: string | null;
  readonly subrace: string | null;
  readonly class_name: string | null;
  readonly descriptor: string | null;
  readonly ac: number | null;
  readonly hp_max: number | null;
  readonly cr: ChallengeRating | null;
  readonly version: number;
  readonly updated_at: Date;
}

interface NpcSheetBodyRow extends NpcSheetRow {
  readonly body: SheetBody;
}

const summaryFields = (row: NpcSheetRow) => ({
  npcId: row.npc_id,
  level: row.level,
  race: row.race,
  subrace: row.subrace,
  className: row.class_name,
  descriptor: row.descriptor,
  ac: row.ac,
  hpMax: row.hp_max,
  cr: row.cr,
  version: row.version,
  updatedAt: DateTime.fromDateUnsafe(row.updated_at),
});

const toSummary = (row: NpcSheetRow): NpcSheetSummary => new NpcSheetSummary(summaryFields(row));

const toSheet = (row: NpcSheetBodyRow): NpcSheet =>
  new NpcSheet({ ...summaryFields(row), sheet: row.body });

const encodeBody = (body: SheetBody): string => JSON.stringify(body);

/** Where a campaign NPC's subrace is checked, as a refusal names it. */
const NPC_RULES = "in this campaign's rules";

const staleVersion = (expected: number, actual: number): Conflict =>
  new Conflict({
    message: `the NPC's sheet moved on while you were editing (version ${String(actual)}, you read ${String(expected)}). Reload it and make the change again.`,
  });

const missingVersion = (actual: number): Conflict =>
  new Conflict({
    message: `this NPC already has a sheet (version ${String(actual)}). Send the version you read to replace it.`,
  });

const goneSheet = (expected: number): Conflict =>
  new Conflict({
    message: `the NPC's sheet you read (version ${String(expected)}) was removed. Reload it and start again.`,
  });

/**
 * **Which rules a campaign NPC's sheet is written against: its campaign's**,
 * `vocabularyAt` with that one table — everything `usableInCampaign` reaches
 * there for its creator. A Library NPC's (a later slice) is the core rules,
 * exactly an unseated character's answer.
 */
const npcVocabulary = (sql: SqlClient.SqlClient, creator: CampaignCreatorActor): Vocabulary =>
  vocabularyAt(sql, [creator.campaign], creator.actor);

export class NpcSheets extends Context.Service<
  NpcSheets,
  {
    /**
     * Every NPC's sheet row on the shelf the filter names — live by default,
     * as `Npcs.list` answers — in that list's order, leaving out an NPC with
     * no sheet. The document is not in it: open one with {@link find}.
     */
    readonly list: (
      creator: CampaignCreatorActor,
      filter: NpcListFilter,
    ) => Effect.Effect<ReadonlyArray<NpcSheetSummary>>;
    /**
     * One NPC's sheet, live or archived, or `null` when it has none.
     * `NotFound` for an NPC not in this campaign.
     */
    readonly find: (
      creator: CampaignCreatorActor,
      id: NpcId,
    ) => Effect.Effect<NpcSheet | null, NotFound>;
    /**
     * Starts the sheet or replaces it whole. `Conflict` for a missing or stale
     * `expectedVersion` over an existing sheet, an `expectedVersion` when
     * there is none, and a subrace the race does not contain in the NPC's
     * rules.
     */
    readonly put: (
      creator: CampaignCreatorActor,
      id: NpcId,
      payload: NpcSheetPut,
    ) => Effect.Effect<NpcSheet, NotFound | Conflict>;
    /**
     * The PATCH: an absent key is untouched and `null` clears it. A level or
     * class change with no `sheet` recomputes the document's derived lines.
     * `NotFound` for an NPC with no sheet as for one not in this campaign.
     */
    readonly update: (
      creator: CampaignCreatorActor,
      id: NpcId,
      patch: NpcSheetUpdate,
    ) => Effect.Effect<NpcSheet, NotFound | Conflict>;
    /** Removes the sheet; an NPC with none is unchanged. `NotFound` for an NPC not in this campaign. */
    readonly remove: (creator: CampaignCreatorActor, id: NpcId) => Effect.Effect<void, NotFound>;
  }
>()("NpcSheets") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // The row's columns as every read names them — never `select *`, so a
      // column a later migration adds is chosen, not inherited.
      const summaryColumns = sql`
        npc_sheet.npc_id, npc_sheet.level, npc_sheet.race, npc_sheet.subrace,
        npc_sheet.class_name, npc_sheet.descriptor, npc_sheet.ac, npc_sheet.hp_max,
        npc_sheet.cr, npc_sheet.version, npc_sheet.updated_at
      `;
      const sheetColumns = sql`${summaryColumns}, npc_sheet.body`;

      /** The NPC, in this campaign, locked for the write that follows. */
      const lockedNpc = (
        creator: CampaignCreatorActor,
        id: NpcId,
      ): Effect.Effect<void, NotFound | SqlError.SqlError> =>
        Effect.gen(function* () {
          // Locked so a delete racing this write lands before or after it, and
          // strongly enough that two writes of one NPC's sheet take turns: the
          // first PUT of a sheet has no sheet row to lock, and a second PUT
          // must see the first one's sheet and its version, not insert past it.
          const npcs = yield* sql<{ readonly id: NpcId }>`
            select npc.id from npc
            where npc.id = ${id}
              and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
            for no key update
          `;
          if (npcs.length === 0) return yield* new NotFound({ resource: "npc", id });
        });

      /** The sheet as it stands, read under its NPC's lock, or `undefined` when there is none. */
      const sheetUnderLock = (id: NpcId) =>
        Effect.map(
          sql<NpcSheetBodyRow>`
            select ${sheetColumns} from npc_sheet where npc_id = ${id}
          `,
          (rows) => rows[0],
        );

      const one = (creator: CampaignCreatorActor, id: NpcId) =>
        Effect.gen(function* () {
          const rows = yield* sql<NpcSheetBodyRow>`
            select ${sheetColumns}
            from npc
            left join npc_sheet on npc_sheet.npc_id = npc.id
            where npc.id = ${id}
              and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
          `;
          const row = rows[0];
          if (row === undefined) return yield* new NotFound({ resource: "npc", id });
          // The left join's miss: the NPC is there and has no sheet.
          return (row.npc_id as NpcId | null) === null ? null : toSheet(row);
        });

      return {
        list: (creator, filter) =>
          dieOnSqlError(
            Effect.map(
              sql<NpcSheetRow>`
                select ${summaryColumns}
                from npc
                join npc_sheet on npc_sheet.npc_id = npc.id
                where ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
                  and ${filter.archived === true ? sql`npc.archived_at is not null` : sql`npc.archived_at is null`}
                order by lower(npc.name) asc, npc.id asc
              `,
              (rows) => rows.map(toSummary),
            ),
          ),

        find: (creator, id) => dieOnSqlError(one(creator, id)),

        put: (creator, id, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* lockedNpc(creator, id);
                const before = yield* sheetUnderLock(id);
                if (before === undefined) {
                  if (payload.expectedVersion !== undefined) {
                    return yield* goneSheet(payload.expectedVersion);
                  }
                } else if (payload.expectedVersion === undefined) {
                  return yield* missingVersion(before.version);
                } else if (payload.expectedVersion !== before.version) {
                  return yield* staleVersion(payload.expectedVersion, before.version);
                }
                yield* validateSubrace(
                  sql,
                  npcVocabulary(sql, creator)("character_option"),
                  payload.race,
                  payload.subrace,
                  NPC_RULES,
                );

                // Whole: an absent column is `null`, as on a character's create.
                const columns = {
                  level: payload.level ?? null,
                  race: payload.race ?? null,
                  subrace: payload.subrace ?? null,
                  class_name: payload.className ?? null,
                  ac: payload.ac ?? null,
                  hp_max: payload.hpMax ?? null,
                  cr: payload.cr ?? null,
                  body: encodeBody(payload.sheet),
                };
                const rows = yield* sql<NpcSheetBodyRow>`
                  insert into npc_sheet ${sql.insert({ npc_id: id, ...columns })}
                  on conflict (npc_id) do update
                    set ${setClause(sql, columns)}, version = npc_sheet.version + 1
                  returning ${sheetColumns}
                `;
                return toSheet(rows[0]!);
              }),
            ),
          ),

        update: (creator, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* lockedNpc(creator, id);
                const before = yield* sheetUnderLock(id);
                if (before === undefined) {
                  return yield* new NotFound({ resource: "npc_sheet", id });
                }
                if (
                  patch.expectedVersion !== undefined &&
                  patch.expectedVersion !== before.version
                ) {
                  return yield* staleVersion(patch.expectedVersion, before.version);
                }
                const vocabulary = npcVocabulary(sql, creator);
                const nextRace = patch.race === undefined ? before.race : patch.race;
                const nextSubrace = patch.subrace === undefined ? before.subrace : patch.subrace;
                if (nextRace !== before.race || nextSubrace !== before.subrace) {
                  yield* validateSubrace(
                    sql,
                    vocabulary("character_option"),
                    nextRace,
                    nextSubrace,
                    NPC_RULES,
                  );
                }
                const body =
                  patch.sheet !== undefined
                    ? patch.sheet
                    : patch.level !== undefined || patch.className !== undefined
                      ? yield* recomputeForLevel(sql, {
                          body: before.body,
                          level: patch.level === undefined ? before.level : patch.level,
                          className:
                            patch.className === undefined ? before.class_name : patch.className,
                          vocabulary,
                        })
                      : undefined;
                const columns = defined({
                  level: patch.level,
                  race: patch.race,
                  subrace: patch.subrace,
                  class_name: patch.className,
                  ac: patch.ac,
                  hp_max: patch.hpMax,
                  cr: patch.cr,
                  body: body === undefined ? undefined : encodeBody(body),
                });
                const rows = yield* sql<NpcSheetBodyRow>`
                  update npc_sheet
                  set ${setClause(sql, columns)}, version = npc_sheet.version + 1
                  where npc_id = ${id}
                  returning ${sheetColumns}
                `;
                return toSheet(rows[0]!);
              }),
            ),
          ),

        remove: (creator, id) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* lockedNpc(creator, id);
                yield* sql`delete from npc_sheet where npc_id = ${id}`;
              }),
            ),
          ),
      };
    }),
  );
}
