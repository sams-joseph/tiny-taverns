import {
  type Actor,
  CurrentActor,
  Conflict,
  NotFound,
  NpcId,
  type NpcListFilter,
  NpcSheet,
  type NpcSheetPut,
  NpcSheetSummary,
  type NpcSheetUpdate,
  type NpcSpellbook,
  type SheetBody,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, type SqlError, SqlSchema, type Statement } from "effect/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import {
  type AssistantOrigin,
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  setClause,
} from "./rows.js";
import { levelOrClassMoved, recomputeForLevel, validateSubrace } from "./sheetLevel.js";
import { spellbookRulesFor } from "./Spells.js";
import {
  libraryRowReadable,
  libraryRowWritable,
  rowWritable,
  type Vocabulary,
  vocabularyAt,
} from "./visibility.js";

/**
 * Reads and writes over `npc_sheet`, an NPC's character-style sheet
 * (`0076_npc_sheets.ts`) — **its NPC's owner's alone**: a campaign NPC's
 * creator, through a `CampaignCreatorActor`, or a Library original's owner,
 * through `CurrentActor` and the Library's own predicates. There is no player
 * read here, and no player path anywhere reads this table.
 *
 * It is not `Npcs`, for `NpcPrep.ts`'s reason: `Npcs` answers a player too,
 * and an NPC read that could reach a sheet is the leak `CreatorActor.ts`'s
 * standing rule exists to make impossible.
 *
 * Every read and write walks the NPC, the sheet's only containment answer,
 * under one {@link Reach}: the campaign's methods reach only an NPC in the
 * proof's campaign, so another campaign's NPC and a Library original named in
 * that path are the same `NotFound`; the Library's reach only the actor's own
 * originals, so a campaign NPC and another account's original are `NotFound`
 * there.
 *
 * The document is a character's rules half, and so are its rules: a level or
 * class change runs the character's own `recomputeForLevel`, and a subrace is
 * checked by the character's own `validateSubrace`, and the spell picker's
 * rules are the character's own `spellbookRulesFor`, all against the rules
 * the reach names — a campaign NPC's campaign's, a Library original's the
 * core rules.
 *
 * Nothing else writes it but the copy of a Library original into a campaign
 * (`Npcs.copyFromSource`), which takes the source's sheet beside its persona,
 * and the creator's accept of a sheet their Hob drafted (`repo/Proposals.ts`),
 * which goes through {@link put} with the turn, stamping `origin = 'assistant'`.
 * No NPC prompt reads it and search does not index it. It rings no doorbell,
 * as prep does not: nothing live moved.
 */

/** An `npc_sheet` row's summary, decoded off the summary columns by `SqlSchema`. */
const NpcSheetSummaryRow = classFromColumns(NpcSheetSummary, {
  ...NpcSheetSummary.fields,
  updatedAt: Schema.DateTimeUtcFromDate,
});

/** An `npc_sheet` row with its document, which the wire calls `sheet` and the table `body`. */
const NpcSheetRow = classFromColumns(
  NpcSheet,
  { ...NpcSheet.fields, updatedAt: Schema.DateTimeUtcFromDate },
  { sheet: "body" },
);

/**
 * The left join's miss: the NPC is there and has no sheet, so every sheet
 * column, `npc_id` among them, reads `null`.
 */
const NoSheetRow = fromColumns(Schema.Struct({ npcId: Schema.Null }));

const encodeBody = (body: SheetBody): string => JSON.stringify(body);

/** The written columns of a PUT or a PATCH, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

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
 * Which NPCs one reader's sheet methods reach, and **which rules those sheets
 * are written against** — the one place both are decided.
 */
interface Reach {
  /** The NPCs whose sheets this reader may read, as a `where` over `npc`. */
  readonly readable: Statement.Fragment;
  /** The NPCs whose sheets this reader may write; never wider than `readable`. */
  readonly writable: Statement.Fragment;
  readonly vocabulary: Vocabulary;
  /** Where a subrace is checked, as a refusal names it. */
  readonly rules: string;
}

/**
 * A campaign NPC's sheet: the NPC in the proof's campaign, written against
 * **its campaign's rules**, `vocabularyAt` with that one table — everything
 * `usableInCampaign` reaches there for its creator.
 */
const campaignReach = (sql: SqlClient.SqlClient, creator: CampaignCreatorActor): Reach => {
  const npc = rowWritable(sql, "npc", creator.campaign, creator.actor);
  return {
    readable: npc,
    writable: npc,
    vocabulary: vocabularyAt(sql, [creator.campaign], creator.actor),
    rules: "in this campaign's rules",
  };
};

/**
 * A Library original's sheet: read as `Npcs.libraryFindById` reads the NPC
 * and written as `libraryUpdate` writes it — the owner's, since an NPC has no
 * bundle (`npc_one_owner`) — and written against **the core rules**, exactly
 * an unseated character's answer. A copy rewrites nothing: its next level-up
 * reads its campaign's rules.
 */
const libraryReach = (sql: SqlClient.SqlClient, actor: Actor): Reach => ({
  readable: libraryRowReadable(sql, "npc", actor),
  writable: libraryRowWritable(sql, "npc", actor),
  vocabulary: vocabularyAt(sql, [], actor),
  rules: "in the core rules",
});

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
     *
     * `from` is the Hob turn a kept draft came from, and only
     * `repo/Proposals.ts` passes one: the sheet is then `assistant`'s with
     * that turn. Without it the sheet is `authored`, since a PUT replaces the
     * whole of whatever was there.
     */
    readonly put: (
      creator: CampaignCreatorActor,
      id: NpcId,
      payload: NpcSheetPut,
      from?: AssistantOrigin,
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
    /**
     * The spell picker's rules for the sheet, a character's picker against
     * this campaign's rules. `NotFound` for an NPC with no sheet as for one
     * not in this campaign.
     */
    readonly spells: (
      creator: CampaignCreatorActor,
      id: NpcId,
    ) => Effect.Effect<NpcSpellbook, NotFound>;
    /** {@link list} over the actor's own Library originals, in `Npcs.library`'s order. */
    readonly libraryList: (
      filter: NpcListFilter,
    ) => Effect.Effect<ReadonlyArray<NpcSheetSummary>, never, CurrentActor>;
    /** {@link find} for a Library original. `NotFound` for anything but the actor's own. */
    readonly libraryFind: (id: NpcId) => Effect.Effect<NpcSheet | null, NotFound, CurrentActor>;
    /** {@link put} for a Library original, checked against the core rules. */
    readonly libraryPut: (
      id: NpcId,
      payload: NpcSheetPut,
    ) => Effect.Effect<NpcSheet, NotFound | Conflict, CurrentActor>;
    /** {@link update} for a Library original, recomputed against the core rules. */
    readonly libraryUpdate: (
      id: NpcId,
      patch: NpcSheetUpdate,
    ) => Effect.Effect<NpcSheet, NotFound | Conflict, CurrentActor>;
    /** {@link remove} for a Library original; every copy's own sheet stands. */
    readonly libraryRemove: (id: NpcId) => Effect.Effect<void, NotFound, CurrentActor>;
    /** {@link spells} for a Library original, against the core rules. */
    readonly librarySpells: (id: NpcId) => Effect.Effect<NpcSpellbook, NotFound, CurrentActor>;
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
      const sheetColumns = sql`
        ${summaryColumns}, npc_sheet.body, npc_sheet.origin, npc_sheet.assistant_turn_id
      `;

      /** The NPC, in reach, locked for the write that follows. */
      const lockedNpc = (
        reach: Reach,
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
              and ${reach.writable}
            for no key update
          `;
          if (npcs.length === 0) return yield* new NotFound({ resource: "npc", id });
        });

      /** The sheet as it stands, read under its NPC's lock, or `None` when there is none. */
      const sheetUnderLock = SqlSchema.findOneOption({
        Request: Schema.toType(NpcId),
        Result: NpcSheetRow,
        execute: (id) => sql`
          select ${sheetColumns} from npc_sheet where npc_id = ${id}
        `,
      });

      // A reach is a predicate the read is built around, as `restCharacterRow`'s is.
      const summaries = (reach: Reach) =>
        SqlSchema.findAll({
          Request: Schema.Boolean,
          Result: NpcSheetSummaryRow,
          execute: (archived) => sql`
          select ${summaryColumns}
          from npc
          join npc_sheet on npc_sheet.npc_id = npc.id
          where ${reach.readable}
            and ${archived ? sql`npc.archived_at is not null` : sql`npc.archived_at is null`}
          order by lower(npc.name) asc, npc.id asc
        `,
        });
      const list = (reach: Reach, filter: NpcListFilter) =>
        dieOnSqlError(summaries(reach)(filter.archived === true));

      /** The NPC in reach and its sheet, or the join's miss when it has none. */
      const npcSheet = (reach: Reach) =>
        SqlSchema.findOne({
          Request: Schema.toType(NpcId),
          Result: Schema.Union([NpcSheetRow, NoSheetRow]),
          execute: (id) => sql`
          select ${sheetColumns}
          from npc
          left join npc_sheet on npc_sheet.npc_id = npc.id
          where npc.id = ${id}
            and ${reach.readable}
        `,
        });
      /** The sheet, `null` when the NPC has none; `NotFound` for an NPC out of reach. */
      const sheetRow = (reach: Reach, id: NpcId) =>
        Effect.map(npcSheet(reach)(id).pipe(orNotFound("npc", id)), (row) =>
          row.npcId === null ? null : row,
        );

      const find = (reach: Reach, id: NpcId) => dieOnSqlError(sheetRow(reach, id));

      const spells = (reach: Reach, id: NpcId) =>
        dieOnSqlError(
          Effect.gen(function* () {
            const row = yield* sheetRow(reach, id);
            if (row === null) return yield* new NotFound({ resource: "npc_sheet", id });
            const rules = yield* spellbookRulesFor(sql, {
              className: row.className ?? undefined,
              subclassName: row.sheet.identity?.subclass,
              level: Math.max(1, row.level ?? 1),
              body: row.sheet,
              vocabulary: reach.vocabulary,
            });
            return { npcId: id, ...rules };
          }),
        );

      const SheetWrite = Schema.toType(Schema.Struct({ id: NpcId, columns: Columns }));
      const upsert = SqlSchema.findOne({
        Request: SheetWrite,
        Result: NpcSheetRow,
        execute: ({ id, columns }) => sql`
          insert into npc_sheet ${sql.insert({ npc_id: id, ...columns })}
          on conflict (npc_id) do update
            set ${setClause(sql, columns)}, version = npc_sheet.version + 1
          returning ${sheetColumns}
        `,
      });
      const change = SqlSchema.findOne({
        Request: SheetWrite,
        Result: NpcSheetRow,
        execute: ({ id, columns }) => sql`
          update npc_sheet
          set ${setClause(sql, columns)}, version = npc_sheet.version + 1
          where npc_id = ${id}
          returning ${sheetColumns}
        `,
      });

      const put = (
        reach: Reach,
        id: NpcId,
        payload: NpcSheetPut,
        from: AssistantOrigin | undefined,
      ) =>
        dieOnSqlError(
          sql.withTransaction(
            Effect.gen(function* () {
              yield* lockedNpc(reach, id);
              const before = Option.getOrUndefined(yield* sheetUnderLock(id));
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
                reach.vocabulary("character_option"),
                payload.race,
                payload.subrace,
                reach.rules,
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
                // Whole, so the provenance too: a kept draft is the turn's,
                // and a hand-written PUT over one is the creator's own again.
                origin: from === undefined ? "authored" : "assistant",
                assistant_turn_id: from?.assistantTurnId ?? null,
              };
              // An upsert answers with its row; not getting one is a defect.
              return yield* upsert({ id, columns }).pipe(
                Effect.catchTag("NoSuchElementError", Effect.die),
              );
            }),
          ),
        );

      const update = (reach: Reach, id: NpcId, patch: NpcSheetUpdate) =>
        dieOnSqlError(
          sql.withTransaction(
            Effect.gen(function* () {
              yield* lockedNpc(reach, id);
              const before = Option.getOrUndefined(yield* sheetUnderLock(id));
              if (before === undefined) {
                return yield* new NotFound({ resource: "npc_sheet", id });
              }
              if (patch.expectedVersion !== undefined && patch.expectedVersion !== before.version) {
                return yield* staleVersion(patch.expectedVersion, before.version);
              }
              const nextRace = patch.race === undefined ? before.race : patch.race;
              const nextSubrace = patch.subrace === undefined ? before.subrace : patch.subrace;
              if (nextRace !== before.race || nextSubrace !== before.subrace) {
                yield* validateSubrace(
                  sql,
                  reach.vocabulary("character_option"),
                  nextRace,
                  nextSubrace,
                  reach.rules,
                );
              }
              const nextLevel = patch.level === undefined ? before.level : patch.level;
              const nextClass = patch.className === undefined ? before.className : patch.className;
              const body =
                patch.sheet !== undefined
                  ? patch.sheet
                  : levelOrClassMoved(
                        { level: before.level, className: before.className },
                        { level: nextLevel, className: nextClass },
                      )
                    ? yield* recomputeForLevel(sql, {
                        body: before.sheet,
                        level: nextLevel,
                        className: nextClass,
                        race: nextRace,
                        subrace: nextSubrace,
                        from: { level: before.level, className: before.className },
                        vocabulary: reach.vocabulary,
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
              // The sheet is locked under its NPC; not getting it back is a defect.
              return yield* change({ id, columns }).pipe(
                Effect.catchTag("NoSuchElementError", Effect.die),
              );
            }),
          ),
        );

      const remove = (reach: Reach, id: NpcId) =>
        dieOnSqlError(
          sql.withTransaction(
            Effect.gen(function* () {
              yield* lockedNpc(reach, id);
              yield* sql`delete from npc_sheet where npc_id = ${id}`;
            }),
          ),
        );

      /** The Library's reach, for the actor the request resolved to. */
      const library = <A, E>(body: (reach: Reach) => Effect.Effect<A, E>) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          return yield* body(libraryReach(sql, actor));
        });

      return {
        list: (creator, filter) => list(campaignReach(sql, creator), filter),
        find: (creator, id) => find(campaignReach(sql, creator), id),
        put: (creator, id, payload, from) => put(campaignReach(sql, creator), id, payload, from),
        update: (creator, id, patch) => update(campaignReach(sql, creator), id, patch),
        remove: (creator, id) => remove(campaignReach(sql, creator), id),
        spells: (creator, id) => spells(campaignReach(sql, creator), id),
        libraryList: (filter) => library((reach) => list(reach, filter)),
        libraryFind: (id) => library((reach) => find(reach, id)),
        libraryPut: (id, payload) => library((reach) => put(reach, id, payload, undefined)),
        libraryUpdate: (id, patch) => library((reach) => update(reach, id, patch)),
        libraryRemove: (id) => library((reach) => remove(reach, id)),
        librarySpells: (id) => library((reach) => spells(reach, id)),
      };
    }),
  );
}
