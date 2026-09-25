import {
  type Actor,
  type CampaignId,
  type Conflict,
  type CreatedOrder,
  type CreatedPageFilterValues,
  creatureXp,
  CurrentActor,
  Encounter,
  type EncounterChallenge,
  type EncounterCreate,
  encounterDifficulty,
  type EncounterId,
  type EncounterRunEndedReason,
  type EncounterRunId,
  type EncounterKind,
  EncounterPrep,
  type EncounterUpdate,
  NotFound,
  type Page,
  PlayerEncounter,
  type PlayerEncounterCreature,
  type SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import { EncounterCreatures, statBlockXp } from "./EncounterCreatures.js";
import { RUN } from "./liveTables.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { createdOrdering, orderClause, pageClauses, pageLimit, pageOfRows } from "./paging.js";
import {
  type AssistantOrigin,
  assistantColumns,
  defined,
  dieOnSqlError,
  type ProvenanceColumns,
  proseColumn,
  provenanceOf,
  setClause,
} from "./rows.js";
import {
  containedRowReadable,
  ensureCampaignReadable,
  ensureCampaignWritable,
  type NestedTable,
  nestedRowReadableWithin,
  ownedRowReadable,
  rowReadable,
  rowWritable,
} from "./visibility.js";

/** One visible roster line, as the difficulty needs it — `json_agg`'d per encounter. */
interface RosterXpRow {
  readonly count: number;
  readonly cr: string;
  readonly stat_block_xp: number | null;
}

interface EncounterRow extends ProvenanceColumns {
  readonly id: EncounterId;
  readonly campaign_id: CampaignId;
  readonly name: string;
  readonly kind: EncounterKind;
  /** `text[]`; the pg driver hands these back as a real JS array. */
  readonly tags: ReadonlyArray<string>;
  readonly creature_count: number;
  /** `json`, which the pg driver parses. */
  readonly roster_xp: ReadonlyArray<RosterXpRow>;
  /** The last visible ended run's columns, all null when there is none. */
  readonly played_run_id: EncounterRunId | null;
  readonly played_session_id: SessionId | null;
  readonly played_session_number: number | null;
  readonly played_ended_at: Date | null;
  readonly played_ended_reason: EncounterRunEndedReason | null;
}

/**
 * The row, with its difficulty computed against `partyLevels` — the one read
 * of the party the whole statement's encounters share.
 */
const toEncounter =
  (partyLevels: ReadonlyArray<number | null>) =>
  (row: EncounterRow): Encounter =>
    new Encounter({
      id: row.id,
      campaignId: row.campaign_id,
      name: row.name,
      difficulty: encounterDifficulty(
        row.roster_xp.map((line) => ({
          count: line.count,
          xp: creatureXp({ cr: line.cr, statBlockXp: line.stat_block_xp }),
        })),
        partyLevels,
      ),
      kind: row.kind,
      tags: row.tags,
      creatureCount: row.creature_count,
      lastPlayed: playedOf(row),
      ...provenanceOf(row),
    });

type PlayedColumns = Pick<
  EncounterRow,
  | "played_run_id"
  | "played_session_id"
  | "played_session_number"
  | "played_ended_at"
  | "played_ended_reason"
>;

/**
 * The player projection's row: the encounter's own player-safe columns, the
 * visible roster as names and counts, and the last playing. No creature
 * number is selected, so none can reach `PlayerEncounter` by a forgotten drop.
 */
interface PlayerEncounterRow
  extends PlayedColumns, Pick<EncounterRow, "id" | "campaign_id" | "name" | "kind" | "tags"> {
  /** `json`, which the pg driver parses. */
  readonly creatures: ReadonlyArray<PlayerEncounterCreature>;
}

const playedOf = (row: PlayedColumns) =>
  row.played_run_id === null
    ? null
    : {
        runId: row.played_run_id,
        sessionId: row.played_session_id!,
        sessionNumber: row.played_session_number!,
        endedAt: DateTime.fromDateUnsafe(row.played_ended_at!),
        endedReason: row.played_ended_reason!,
      };

const toPlayerEncounter = (row: PlayerEncounterRow): PlayerEncounter =>
  new PlayerEncounter({
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    kind: row.kind,
    tags: row.tags,
    creatures: row.creatures,
    lastPlayed: playedOf(row),
  });

interface EncounterPrepRow {
  readonly encounter_id: EncounterId;
  /** `jsonb`; the pg driver parses it, so these arrive as the documents themselves. */
  readonly tactics: ReadonlyArray<string>;
  readonly treasure: string | null;
  readonly challenge: EncounterChallenge | null;
  readonly ready: boolean;
}

const toEncounterPrep = (row: EncounterPrepRow): EncounterPrep =>
  new EncounterPrep({
    encounterId: row.encounter_id,
    ready: row.ready,
    tactics: row.tactics,
    treasure: row.treasure,
    challenge: row.challenge,
  });

/**
 * The prep's columns from a payload. The documents go in as JSON text, which
 * Postgres casts to `jsonb` on the way in — `Creatures.ts`'s rule, and here for
 * the same reason: a bare JS array bound to a statement becomes a Postgres
 * array literal. Each line is trimmed, as the treasure is; the wire has
 * already refused a blank one.
 */
const prepColumns = (payload: {
  readonly tactics?: ReadonlyArray<string> | undefined;
  readonly treasure?: string | null | undefined;
  readonly challenge?: EncounterChallenge | null | undefined;
  readonly ready?: boolean | undefined;
}): Record<string, unknown> =>
  defined({
    tactics:
      payload.tactics === undefined
        ? undefined
        : JSON.stringify(payload.tactics.map((line) => line.trim())),
    treasure: proseColumn(payload.treasure),
    challenge:
      payload.challenge === undefined
        ? undefined
        : payload.challenge === null
          ? null
          : JSON.stringify(payload.challenge),
    ready: payload.ready,
  });

/** The roster hangs off the encounter. */
const ROSTER: NestedTable = {
  table: "encounter_creature",
  parent: "encounter",
  foreignKey: "encounter_id",
};

/**
 * The card's "6 creatures" (`data.js:10`), computed rather than stored.
 *
 * A stored total would be a second answer to a question the roster already
 * answers, and the two part company the first time a roster row goes away by a
 * cascade rather than through the endpoint that would have decremented it.
 *
 * It counts what *this actor* can see, through the same visibility rule a read
 * of the roster itself would apply — so the number on the card and the list
 * behind it always agree. `coalesce(..., 0)` because an empty roster sums to
 * null, and `::int` because Postgres widens `sum` to a bigint, which the pg
 * driver would hand back as a string.
 */
const creatureCount = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql`coalesce((
    select sum(encounter_creature.count) from encounter_creature
    where ${nestedRowReadableWithin(sql, ROSTER, campaignId, actor)}
  ), 0)::int as creature_count`;

/**
 * The roster the difficulty is computed from: each visible line's count, and
 * its creature's rating and stated XP — `creatureXp` turns those into XP in
 * `toEncounter`, the same function the roster read uses, so the band and the
 * roster table cannot disagree about a creature.
 *
 * The same visibility rule as `creatureCount`, and for the same reason: a
 * creature hidden from this reader moves neither the count nor the band.
 */
const rosterXp = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql`coalesce((
    select json_agg(json_build_object(
      'count', encounter_creature.count,
      'cr', creature.cr,
      'stat_block_xp', ${statBlockXp(sql)}
    ))
    from encounter_creature
    join creature on creature.id = encounter_creature.creature_id
    where ${nestedRowReadableWithin(sql, ROSTER, campaignId, actor)}
  ), '[]'::json) as roster_xp`;

/**
 * The roster as a player is told it: each visible line's creature name and
 * count, oldest line first. The same visibility rule as `creatureCount`, and
 * nothing else of the creature is selected — its numbers are the creator's.
 */
const rosterNames = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql`coalesce((
    select json_agg(json_build_object(
      'name', creature.name,
      'count', encounter_creature.count
    ) order by encounter_creature.created_at, encounter_creature.id)
    from encounter_creature
    join creature on creature.id = encounter_creature.creature_id
    where ${nestedRowReadableWithin(sql, ROSTER, campaignId, actor)}
  ), '[]'::json) as creatures`;

/**
 * The last time each encounter came off the table, among the runs this reader
 * can see — `containedRowReadable` over `RUN`, the predicate every run read
 * uses, so a fight the DM kept hidden, or one on a night the DM kept hidden,
 * is not played as far as a player knows.
 *
 * The session number is a correlated subquery rather than a join for
 * `Recap.ts`'s reason: the predicate names the unaliased `session` inside its
 * own scope.
 */
const lastPlayed = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql`left join lateral (
    select encounter_run.id as played_run_id,
           encounter_run.session_id as played_session_id,
           (select session.number from session
             where session.id = encounter_run.session_id) as played_session_number,
           encounter_run.ended_at as played_ended_at,
           encounter_run.ended_reason as played_ended_reason
    from encounter_run
    where encounter_run.encounter_id = encounter.id
      and encounter_run.ended_at is not null
      and ${containedRowReadable(sql, RUN, campaignId, actor)}
    order by encounter_run.ended_at desc, encounter_run.id desc
    limit 1
  ) as last_played on true`;

/**
 * Reads and writes over `encounter`, the authored template.
 *
 * `tags` is passed to `sql.insert` as a plain JS array: a bare array in a
 * statement becomes one bind parameter, which `pg` serialises to a Postgres
 * array literal. (`sql.in(...)` is the thing that turns an array into an
 * `(?, ?, ?)` list — do not reach for it here.)
 */
export class Encounters extends Context.Service<
  Encounters,
  {
    /**
     * Paged, oldest first — see `repo/paging.ts`. The creator's alone, so it
     * takes the proof: `Encounter` carries the difficulty, which no player is
     * told. A player's read is `listAsPlayer`.
     */
    readonly list: (
      creator: CampaignCreatorActor,
      filter: CreatedPageFilterValues,
    ) => Effect.Effect<Page<Encounter, CreatedOrder>>;
    readonly findById: (
      creator: CampaignCreatorActor,
      id: EncounterId,
    ) => Effect.Effect<Encounter, NotFound>;
    /**
     * The encounters this reader can see, as `PlayerEncounter`: no
     * difficulty, and the roster as names and counts. Oldest first, unpaged.
     */
    readonly listAsPlayer: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<PlayerEncounter>, NotFound, CurrentActor>;
    readonly findAsPlayer: (
      campaignId: CampaignId,
      id: EncounterId,
    ) => Effect.Effect<PlayerEncounter, NotFound, CurrentActor>;
    /**
     * The encounter, its map, its prep and its roster, in one transaction.
     * `from` is the accept path's, and only its — see `Notes.create`.
     */
    readonly create: (
      campaignId: CampaignId,
      payload: EncounterCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<Encounter, NotFound | Conflict, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      id: EncounterId,
      patch: EncounterUpdate,
    ) => Effect.Effect<Encounter, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      id: EncounterId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
    /**
     * The encounter's DM prep, or `NotFound` for an encounter this creator
     * does not hold. The creator's alone, so it takes the proof: no player
     * path reads `encounter_prep`.
     */
    readonly prep: (
      creator: CampaignCreatorActor,
      id: EncounterId,
    ) => Effect.Effect<EncounterPrep, NotFound>;
    /** Every encounter's DM prep in the creator's campaign, oldest encounter first. */
    readonly prepList: (
      creator: CampaignCreatorActor,
    ) => Effect.Effect<ReadonlyArray<EncounterPrep>>;
  }
>()("Encounters") {
  // The roster's create is the one way a roster line is written, so the
  // encounter's create holds it rather than a copy of its statements.
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const encounterCreatures = yield* EncounterCreatures;
      const ordering = createdOrdering<EncounterRow>(sql, "encounter");

      /**
       * The level of every live seat's character this reader can see — the
       * party the difficulty is rated for. `ownedRowReadable` over the seat is
       * `Party.list`'s own gate, so the party a band is computed against is
       * exactly the party this reader is shown. A seat whose character was
       * deleted holds nobody and is not in it; a character with no level is,
       * as a `null` the rule counts and leaves out.
       */
      const partyLevels = (campaignId: CampaignId, actor: Actor) =>
        Effect.map(
          sql<{ readonly level: number | null }>`
            select character.level from campaign_character
            join character on character.id = campaign_character.character_id
            where campaign_character.left_at is null
              and ${ownedRowReadable(sql, "campaign_character", campaignId, actor)}
          `,
          (rows) => rows.map((row) => row.level),
        );

      /**
       * Encounters with everything computed on read: the count, the roster
       * XP, the last playing. Every read goes through here, and a write reads
       * its row back through here, so no path answers a thinner `Encounter`.
       */
      const selectEncounters = (
        campaignId: CampaignId,
        actor: Actor,
        where: Statement.Fragment,
        tail: Statement.Fragment = sql``,
      ) =>
        Effect.gen(function* () {
          const rows = yield* sql<EncounterRow>`
            select encounter.*, ${creatureCount(sql, campaignId, actor)},
                   ${rosterXp(sql, campaignId, actor)}, last_played.*
            from encounter
            ${lastPlayed(sql, campaignId, actor)}
            where ${where}
            ${tail}
          `;
          const levels = rows.length === 0 ? [] : yield* partyLevels(campaignId, actor);
          return { rows, toEncounter: toEncounter(levels) };
        });

      /**
       * One row just written, read back the way every read reads it — through
       * `rowReadable` too, which the roster subqueries rely on the enclosing
       * query to have applied.
       */
      const readBack = (campaignId: CampaignId, actor: Actor, id: EncounterId) =>
        Effect.map(
          selectEncounters(
            campaignId,
            actor,
            sql.and([sql`encounter.id = ${id}`, rowReadable(sql, "encounter", campaignId, actor)]),
          ),
          ({ rows, toEncounter }) => toEncounter(rows[0]!),
        );

      /**
       * The player projection: the same `rowReadable` and the same roster
       * rule as every read here, and none of the numbers. `rowReadable` is
       * what holds a draft back: a player reads an encounter only when it is
       * Shared and Ready (`sharedWithPlayers`).
       */
      const selectPlayerEncounters = (
        campaignId: CampaignId,
        actor: Actor,
        where: Statement.Fragment,
      ) =>
        Effect.map(
          sql<PlayerEncounterRow>`
            select encounter.id, encounter.campaign_id, encounter.name, encounter.kind,
                   encounter.tags, ${rosterNames(sql, campaignId, actor)}, last_played.*
            from encounter
            ${lastPlayed(sql, campaignId, actor)}
            where ${sql.and([rowReadable(sql, "encounter", campaignId, actor), where])}
            order by encounter.created_at, encounter.id
          `,
          (rows) => rows.map(toPlayerEncounter),
        );

      return {
        list: (creator, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const { campaign, actor } = creator;
              const { rows, toEncounter } = yield* selectEncounters(
                campaign,
                actor,
                sql.and([
                  rowReadable(sql, "encounter", campaign, actor),
                  ...pageClauses(sql, ordering, filter.cursor),
                ]),
                sql`order by ${orderClause(sql, ordering)} limit ${pageLimit(filter.limit)}`,
              );
              return pageOfRows(rows, filter.limit, ordering, "created", toEncounter);
            }),
          ),

        findById: (creator, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const { campaign, actor } = creator;
              const { rows, toEncounter } = yield* selectEncounters(
                campaign,
                actor,
                sql.and([
                  sql`encounter.id = ${id}`,
                  rowReadable(sql, "encounter", campaign, actor),
                ]),
              );
              if (rows.length === 0) return yield* new NotFound({ resource: "encounter", id });
              return toEncounter(rows[0]!);
            }),
          ),

        listAsPlayer: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              return yield* selectPlayerEncounters(campaignId, actor, sql`true`);
            }),
          ),

        findAsPlayer: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* selectPlayerEncounters(
                campaignId,
                actor,
                sql`encounter.id = ${id}`,
              );
              if (rows.length === 0) return yield* new NotFound({ resource: "encounter", id });
              return rows[0]!;
            }),
          ),

        create: (campaignId, payload, from) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                const rows = yield* sql<{ readonly id: EncounterId; readonly kind: EncounterKind }>`
                  insert into encounter ${sql.insert(
                    defined({
                      campaign_id: campaignId,
                      name: payload.name,
                      kind: payload.kind,
                      tags: payload.tags,
                      visibility: payload.visibility,
                      ...assistantColumns(from),
                    }),
                  )}
                  returning encounter.id, encounter.kind
                `;
                const { id, kind } = rows[0]!;
                // Every encounter has its one battle map, made with it: a blank
                // board, and the setting line the picture is drawn from (or,
                // without one, the name, tags and roster types) after this
                // commits (`HobImages.drawBattleMap`). Every way an
                // encounter is made comes through here, so none can lack one.
                yield* sql`
                  insert into battle_map ${sql.insert(
                    defined({
                      encounter_id: id,
                      campaign_id: campaignId,
                      setting: proseColumn(payload.setting),
                    }),
                  )}
                `;
                // And its prep, the same way and for the same reason: the
                // creator's alone, on a row no player read touches.
                yield* sql`
                  insert into encounter_prep ${sql.insert({
                    encounter_id: id,
                    campaign_id: campaignId,
                    kind,
                    ...prepColumns(payload),
                  })}
                `;
                // The roster, line by line through the roster's own create —
                // its copy-in check, its instancing of a Library original and
                // its duplicate rule — so a roster made with the encounter is
                // the one a DM adding lines afterwards would have made. Any
                // line it refuses rolls the whole encounter back.
                for (const line of payload.creatures ?? []) {
                  yield* encounterCreatures.create(
                    campaignId,
                    id,
                    { creatureId: line.creatureId, count: line.count },
                    from,
                  );
                }
                // Read back last, so the count and the difficulty are the
                // roster's just written.
                return yield* readBack(campaignId, actor, id);
              }),
            ),
          ),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                // A new kind clears a challenge written for another, before the
                // kind moves: the prep row carries its encounter's kind through
                // its key, and its check would refuse the cascade otherwise
                // (`0060_encounter_prep.ts`). A challenge for the new kind, when
                // this patch has one, is written below.
                if (patch.kind !== undefined) {
                  yield* sql`
                    update encounter_prep set ${setClause(sql, { challenge: null })}
                    where encounter_prep.encounter_id = ${id}
                      and ${rowWritable(sql, "encounter_prep", campaignId, actor)}
                      and encounter_prep.challenge ->> 'kind' <> ${patch.kind}
                  `;
                }
                const columns = defined({
                  name: patch.name,
                  kind: patch.kind,
                  tags: patch.tags,
                  visibility: patch.visibility,
                });
                const rows = yield* sql<{ readonly id: EncounterId }>`
                  update encounter set ${setClause(sql, columns)}
                  where encounter.id = ${id}
                    and ${rowWritable(sql, "encounter", campaignId, actor)}
                  returning encounter.id
                `;
                if (rows.length === 0) return yield* new NotFound({ resource: "encounter", id });
                // The setting line lives on the map, the creator's alone; the
                // encounter row above is what a player may read. Editing it
                // redraws nothing: a picture is drawn once.
                if (patch.setting !== undefined) {
                  yield* sql`
                    update battle_map set ${setClause(sql, { setting: proseColumn(patch.setting) })}
                    where battle_map.encounter_id = ${id}
                      and ${rowWritable(sql, "battle_map", campaignId, actor)}
                  `;
                }
                const prep = prepColumns(patch);
                if (Object.keys(prep).length > 0) {
                  yield* sql`
                    update encounter_prep set ${setClause(sql, prep)}
                    where encounter_prep.encounter_id = ${id}
                      and ${rowWritable(sql, "encounter_prep", campaignId, actor)}
                  `;
                }
                return yield* readBack(campaignId, actor, id);
              }),
            ),
          ),

        // Its battle map goes with it (`on delete cascade`), and the map's
        // picture with the map; that row's trigger queues the picture's files
        // in `storage_deletion`, which the handler drains after this commits.
        //
        // Notes attached to this encounter are detached, not deleted — the
        // `on delete set null (encounter_id)` on `note_encounter_fkey` does it.
        // The DM wrote that read-aloud; losing the encounter should not lose it.
        //
        // The roster *is* deleted with it (`on delete cascade`), and the
        // difference is not inconsistency: a roster line is "four of these, in
        // this fight" and means nothing once the fight is gone, whereas the
        // read-aloud is prose that stands on its own. The creatures themselves
        // are untouched — the roster row is not the creature.
        remove: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: EncounterId }>`
                delete from encounter
                where encounter.id = ${id}
                  and ${rowWritable(sql, "encounter", campaignId, actor)}
                returning encounter.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "encounter", id });
            }),
          ),

        prep: (creator, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<EncounterPrepRow>`
                select encounter_prep.* from encounter_prep
                where encounter_prep.encounter_id = ${id}
                  and ${rowWritable(sql, "encounter_prep", creator.campaign, creator.actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "encounter", id });
              return toEncounterPrep(rows[0]!);
            }),
          ),

        prepList: (creator) =>
          dieOnSqlError(
            Effect.map(
              sql<EncounterPrepRow>`
                select encounter_prep.* from encounter_prep
                join encounter on encounter.id = encounter_prep.encounter_id
                where ${rowWritable(sql, "encounter_prep", creator.campaign, creator.actor)}
                order by encounter.created_at, encounter.id
              `,
              (rows) => rows.map(toEncounterPrep),
            ),
          ),
      };
    }),
  ).pipe(Layer.provide(EncounterCreatures.layer));
}
