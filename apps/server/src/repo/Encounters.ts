import {
  type Actor,
  CampaignId,
  type Conflict,
  creatureXp,
  CurrentActor,
  Encounter,
  type EncounterChallenge,
  type EncounterCreate,
  encounterDifficulty,
  EncounterId,
  EncounterKind,
  EncounterPlayed,
  type EncounterPlacement,
  EncounterPrep,
  type EncounterUpdate,
  NotFound,
  type Page,
  type PlannedOrder,
  plannedPageFilter,
  type PlannedPageFilterValues,
  PlayerEncounter,
} from "@taverns/api";
import { Context, Effect, Layer, Schema, Struct } from "effect";
import { SqlClient, SqlSchema, type Statement } from "effect/sql";
import { EncounterCreatures, statBlockXp } from "./EncounterCreatures.js";
import { RUN } from "./liveTables.js";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import {
  orderClause,
  orderColumn,
  type Ordering,
  pageClauses,
  pageLimit,
  pageOfRows,
} from "./paging.js";
import {
  assistantColumns,
  type AssistantOrigin,
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  proseColumn,
  setClause,
  textArray,
  timestampColumns,
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

/**
 * The last playing as `lastPlayed` builds it: `EncounterPlayed`, with the end
 * as epoch milliseconds — the resolution the driver reads a `timestamptz` at.
 */
const PlayedColumn = Schema.NullOr(
  Schema.Struct({ ...EncounterPlayed.fields, endedAt: Schema.DateTimeUtcFromMillis }),
);

/**
 * An `encounter` row as the creator reads it, decoded by `SqlSchema` off
 * `encounterColumns`: everything but the difficulty, which is computed, and
 * the two things it and the order are computed from.
 *
 * `roster_xp` is one visible roster line each, as the difficulty needs it
 * (`rosterXp`). `planned_position` is the encounter's slot in the DM's planned
 * order (`encounter_prep.position`, `0078_encounter_order.ts`): what the list
 * sorts by and its cursor keys on, and never a field of `Encounter` — the
 * array order is the answer.
 */
const EncounterRow = fromColumns(
  Schema.Struct({
    ...Struct.omit(Encounter.fields, ["difficulty"]),
    lastPlayed: PlayedColumn,
    rosterXp: Schema.Array(
      Schema.Struct({
        count: Schema.Int,
        cr: Schema.String,
        statBlockXp: Schema.NullOr(Schema.Number),
      }),
    ),
    plannedPosition: Schema.Int,
    ...timestampColumns,
  }),
);
type EncounterRow = typeof EncounterRow.Type;

/**
 * The encounter, with its difficulty computed against `partyLevels` — the one
 * read of the party the whole statement's encounters share — through
 * `creatureXp`, the same function the roster read uses, so the band and the
 * roster table cannot disagree about a creature.
 */
const rated =
  (partyLevels: ReadonlyArray<number | null>) =>
  ({ rosterXp, plannedPosition: _, ...encounter }: EncounterRow): Encounter =>
    new Encounter({
      ...encounter,
      difficulty: encounterDifficulty(
        rosterXp.map((line) => ({ count: line.count, xp: creatureXp(line) })),
        partyLevels,
      ),
    });

/**
 * The player projection's row: the encounter's own player-safe columns, the
 * visible roster as names and counts, and the last playing. No creature
 * number is selected, so none can reach `PlayerEncounter` by a forgotten drop.
 */
const PlayerEncounterRow = classFromColumns(PlayerEncounter, {
  ...PlayerEncounter.fields,
  lastPlayed: PlayedColumn,
});

/** An `encounter_prep` row, decoded off `encounter_prep.*` by `SqlSchema`. */
const EncounterPrepRow = classFromColumns(EncounterPrep, EncounterPrep.fields);

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/**
 * The prep's columns from a payload. The documents go in as JSON text, which
 * Postgres casts to `jsonb` on the way in — `Creatures.ts`'s rule, and here for
 * the same reason: the driver binds a bare JS array as a Postgres array, not
 * as JSON. Each line is trimmed, as the treasure is; the wire has
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
 * null, and `::int` because Postgres widens `sum` to a bigint, which the
 * driver would hand back as a JS `bigint`.
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
 * its creature's rating and stated XP, which `rated` turns into XP.
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
      'statBlockXp', ${statBlockXp(sql)}
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
 * is not played as far as a player knows. `null` when there is none.
 *
 * The session number is a correlated subquery rather than a join for
 * `Recap.ts`'s reason: the predicate names the unaliased `session` inside its
 * own scope. The end is epoch milliseconds, truncated as the driver truncates
 * a `timestamptz` it reads, so it is the same instant a column read would be.
 */
const lastPlayed = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql`left join lateral (
    select json_build_object(
             'runId', encounter_run.id,
             'sessionId', encounter_run.session_id,
             'sessionNumber', (select session.number from session
                                where session.id = encounter_run.session_id),
             'endedAt', (extract(epoch from date_trunc('milliseconds', encounter_run.ended_at))
                          * 1000)::bigint,
             'endedReason', encounter_run.ended_reason
           ) as last_played
    from encounter_run
    where encounter_run.encounter_id = encounter.id
      and encounter_run.ended_at is not null
      and ${containedRowReadable(sql, RUN, campaignId, actor)}
    order by encounter_run.ended_at desc, encounter_run.id desc
    limit 1
  ) as played on true`;

/**
 * Reads and writes over `encounter`, the authored template.
 *
 * `tags` is passed to `sql.insert` through `textArray`: one typed `text[]` bind
 * parameter. (`sql.in(...)` is the thing that turns an array into an
 * `(?, ?, ?)` list — do not reach for it here.)
 */
export class Encounters extends Context.Service<
  Encounters,
  {
    /**
     * Paged, in the DM's planned order — see `repo/paging.ts`. The creator's
     * alone, so it takes the proof: `Encounter` carries the difficulty, which
     * no player is told. A player's read is `listAsPlayer`.
     *
     * A cursor keys on a slot a move can change, so a move landing between
     * two page fetches can repeat or skip a row. The web client collects the
     * whole list in one request of up to `MAX_PAGE_SIZE`, where that cannot
     * arise; a longer list re-reads after the move anyway.
     */
    readonly list: (
      creator: CampaignCreatorActor,
      filter: PlannedPageFilterValues,
    ) => Effect.Effect<Page<Encounter, PlannedOrder>>;
    readonly findById: (
      creator: CampaignCreatorActor,
      id: EncounterId,
    ) => Effect.Effect<Encounter, NotFound>;
    /**
     * The encounters this reader can see, as `PlayerEncounter`: no
     * difficulty, and the roster as names and counts. Unpaged, in the DM's
     * planned order, which reaches the wire only as the array's order.
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
     * `from` is the accept path's, and only its — see `Notes.create`. It
     * lands at the end of the DM's planned order, however it was made.
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
     * Put the encounter just before or just after another in the DM's planned
     * order, renumbering the campaign's slots `0..n-1` in one statement.
     * `NotFound` unless this actor may write both — a player, a Shared World
     * member and a stranger never can — and both are this campaign's.
     */
    readonly move: (
      campaignId: CampaignId,
      id: EncounterId,
      placement: EncounterPlacement,
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
    /** Every encounter's DM prep in the creator's campaign, in the DM's planned order. */
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
      /**
       * The DM's planned order, then the id — the tiebreak `Ordering`
       * requires, though the unique slot leaves nothing for it to break.
       */
      const ordering: Ordering<EncounterRow> = [
        orderColumn<EncounterRow>(
          sql,
          sql`planned.position`,
          "integer",
          (row) => row.plannedPosition,
        ),
        orderColumn<EncounterRow>(sql, sql`encounter.id`, "uuid", (row) => row.id),
      ];

      /**
       * Every order write — an append and a move — first takes this lock on
       * the campaign's row, so two of them never read the same slots. `no key
       * update` leaves the `key share` a foreign-key insert takes free, so
       * nothing else in the campaign waits on it.
       */
      const lockOrder = (campaignId: CampaignId) =>
        sql`select 1 from campaign where campaign.id = ${campaignId} for no key update`;

      /**
       * The level of every live seat's character this reader can see — the
       * party the difficulty is rated for. `ownedRowReadable` over the seat is
       * `Party.list`'s own gate, so the party a band is computed against is
       * exactly the party this reader is shown. A seat whose character was
       * deleted holds nobody and is not in it; a character with no level is,
       * as a `null` the rule counts and leaves out.
       */
      const party = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(creatorFields)),
        Result: fromColumns(Schema.Struct({ level: Schema.NullOr(Schema.Int) })),
        execute: ({ campaign, actor }) => sql`
          select character.level from campaign_character
          join character on character.id = campaign_character.character_id
          where campaign_character.left_at is null
            and ${ownedRowReadable(sql, "campaign_character", campaign, actor)}
        `,
      });

      /**
       * Encounters with everything computed on read: the count, the roster
       * XP, the last playing. Every read goes through here, and a write reads
       * its row back through here, so no path answers a thinner `Encounter`.
       */
      const encounterColumns = (campaignId: CampaignId, actor: Actor) => sql`
        select encounter.*, ${creatureCount(sql, campaignId, actor)},
               ${rosterXp(sql, campaignId, actor)}, played.last_played,
               planned.position as planned_position
        from encounter
        join encounter_prep as planned on planned.encounter_id = encounter.id
        ${lastPlayed(sql, campaignId, actor)}
      `;
      const encounterPage = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, filter: Schema.Struct(plannedPageFilter) }),
        ),
        Result: EncounterRow,
        execute: ({ campaign, actor, filter }) => sql`
          ${encounterColumns(campaign, actor)}
          where ${sql.and([
            rowReadable(sql, "encounter", campaign, actor),
            ...pageClauses(sql, ordering, filter.cursor),
          ])}
          order by ${orderClause(sql, ordering)} limit ${pageLimit(filter.limit)}
        `,
      });
      /**
       * One encounter by id — also how a row just written is read back the
       * way every read reads it, through `rowReadable` too, which the roster
       * subqueries rely on the enclosing query to have applied.
       */
      const encounterById = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, id: EncounterId })),
        Result: EncounterRow,
        execute: ({ campaign, actor, id }) => sql`
          ${encounterColumns(campaign, actor)}
          where encounter.id = ${id} and ${rowReadable(sql, "encounter", campaign, actor)}
        `,
      });
      /** The rows, rated against the party this reader is shown — read once, and only for rows. */
      const ratedAll = (
        reader: { readonly campaign: CampaignId; readonly actor: Actor },
        rows: ReadonlyArray<EncounterRow>,
      ) =>
        rows.length === 0
          ? Effect.succeed(rated([]))
          : Effect.map(party(reader), (levels) => rated(levels.map((row) => row.level)));
      const readOne = (
        reader: { readonly campaign: CampaignId; readonly actor: Actor },
        id: EncounterId,
      ) =>
        Effect.gen(function* () {
          const row = yield* encounterById({ ...reader, id }).pipe(orNotFound("encounter", id));
          return (yield* ratedAll(reader, [row]))(row);
        });

      /**
       * The player projection: the same `rowReadable` and the same roster
       * rule as every read here, and none of the numbers. `rowReadable` is
       * what holds a draft back: a player reads an encounter only when it is
       * Shared and Ready (`sharedWithPlayers`).
       *
       * In the DM's planned order. The slot is sorted by and never selected,
       * so what a player learns is only which of the encounters they can read
       * comes first — a gap left by one they cannot is not there to count.
       */
      const playerEncounters = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({ campaignId: CampaignId, id: Schema.optionalKey(EncounterId) }),
        ),
        Result: PlayerEncounterRow,
        execute: ({ campaignId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select encounter.id, encounter.campaign_id, encounter.name, encounter.kind,
                     encounter.tags, ${rosterNames(sql, campaignId, actor)}, played.last_played
              from encounter
              join encounter_prep as planned on planned.encounter_id = encounter.id
              ${lastPlayed(sql, campaignId, actor)}
              where ${sql.and([
                rowReadable(sql, "encounter", campaignId, actor),
                id === undefined ? sql`true` : sql`encounter.id = ${id}`,
              ])}
              order by planned.position, encounter.id
            `,
          ),
      });

      /** The slot after the campaign's last, read under the order lock. */
      const nextSlot = SqlSchema.findOne({
        Request: Schema.toType(CampaignId),
        Result: fromColumns(Schema.Struct({ next: Schema.Int })),
        execute: (campaignId) => sql`
          select coalesce(max(encounter_prep.position) + 1, 0)::int as next
          from encounter_prep where encounter_prep.campaign_id = ${campaignId}
        `,
      });
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: fromColumns(Schema.Struct({ id: EncounterId, kind: EncounterKind })),
        execute: (columns) => sql`
          insert into encounter ${sql.insert(columns)}
          returning encounter.id, encounter.kind
        `,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ campaignId: CampaignId, id: EncounterId, columns: Columns }),
        ),
        Result: fromColumns(Schema.Struct({ id: EncounterId })),
        execute: ({ campaignId, id, columns }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update encounter set ${setClause(sql, columns)}
              where encounter.id = ${id}
                and ${rowWritable(sql, "encounter", campaignId, actor)}
              returning encounter.id
            `,
          ),
      });
      const erase = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, id: EncounterId })),
        Result: fromColumns(Schema.Struct({ id: EncounterId })),
        execute: ({ campaignId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              delete from encounter
              where encounter.id = ${id}
                and ${rowWritable(sql, "encounter", campaignId, actor)}
              returning encounter.id
            `,
          ),
      });
      /**
       * The campaign's encounters this actor may write, and only those, in
       * the DM's planned order.
       */
      const writableOrder = SqlSchema.findAll({
        Request: Schema.toType(CampaignId),
        Result: fromColumns(Schema.Struct({ encounterId: EncounterId })),
        execute: (campaignId) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select encounter_prep.encounter_id from encounter_prep
              where ${rowWritable(sql, "encounter_prep", campaignId, actor)}
              order by encounter_prep.position, encounter_prep.encounter_id
            `,
          ),
      });
      const prepOf = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, id: EncounterId })),
        Result: EncounterPrepRow,
        execute: ({ campaign, actor, id }) => sql`
          select encounter_prep.* from encounter_prep
          where encounter_prep.encounter_id = ${id}
            and ${rowWritable(sql, "encounter_prep", campaign, actor)}
        `,
      });
      const preps = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(creatorFields)),
        Result: EncounterPrepRow,
        execute: ({ campaign, actor }) => sql`
          select encounter_prep.* from encounter_prep
          where ${rowWritable(sql, "encounter_prep", campaign, actor)}
          order by encounter_prep.position, encounter_prep.encounter_id
        `,
      });

      return {
        list: (creator, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const reader = asked(creator);
              const rows = yield* encounterPage({ ...reader, filter });
              return pageOfRows(
                rows,
                filter.limit,
                ordering,
                "planned",
                yield* ratedAll(reader, rows),
              );
            }),
          ),

        findById: (creator, id) => dieOnSqlError(readOne(asked(creator), id)),

        listAsPlayer: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              return yield* playerEncounters({ campaignId });
            }),
          ),

        findAsPlayer: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* playerEncounters({ campaignId, id });
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
                // At the end of the DM's order: the slot after the last, read
                // under the order lock so a racing create or move cannot take
                // it. No payload names a slot, as none names an origin, so
                // Hob's accepted encounters land here through the same lines.
                yield* lockOrder(campaignId);
                // An aggregate answers one row, and an insert its own; not
                // getting one is a defect.
                const { next } = yield* nextSlot(campaignId).pipe(
                  Effect.catchTag("NoSuchElementError", Effect.die),
                );
                const { id, kind } = yield* insert(
                  defined({
                    campaign_id: campaignId,
                    name: payload.name,
                    kind: payload.kind,
                    tags: textArray(payload.tags),
                    visibility: payload.visibility,
                    ...assistantColumns(from),
                  }),
                ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
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
                    position: next,
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
                return yield* readOne({ campaign: campaignId, actor }, id).pipe(
                  Effect.catchTag("NotFound", Effect.die),
                );
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
                  tags: textArray(patch.tags),
                  visibility: patch.visibility,
                });
                yield* change({ campaignId, id, columns }).pipe(orNotFound("encounter", id));
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
                return yield* readOne({ campaign: campaignId, actor }, id).pipe(
                  Effect.catchTag("NotFound", Effect.die),
                );
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
          dieOnSqlError(Effect.asVoid(erase({ campaignId, id }).pipe(orNotFound("encounter", id)))),

        // Not an edit, so no `setClause`: that stamps `updated_at`, and moving
        // an encounter changes nothing about it — the note pin's rule
        // (`Notes.setPinned`). A played encounter keeps its slot and moves
        // with the rest, so if its night is deleted it is back where the DM
        // put it.
        move: (campaignId, id, placement) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const anchor = "before" in placement ? placement.before : placement.after;
                // Only the campaign's writer takes its lock.
                yield* ensureCampaignWritable(sql, campaignId, actor);
                yield* lockOrder(campaignId);
                // The campaign's encounters this actor may write, and only
                // those, so a reader who cannot write one is told nothing of
                // it: an id or an anchor outside the list is `NotFound`,
                // whether it is another campaign's, deleted, or never was.
                const order = (yield* writableOrder(campaignId)).map((row) => row.encounterId);
                for (const named of [id, anchor]) {
                  if (!order.includes(named)) {
                    return yield* new NotFound({ resource: "encounter", id: named });
                  }
                }
                if (id === anchor) return;
                const rest = order.filter((each) => each !== id);
                const at = rest.indexOf(anchor) + ("before" in placement ? 0 : 1);
                const placed = [...rest.slice(0, at), id, ...rest.slice(at)];
                // One statement, so the deferrable unique slot is checked once
                // every row has its new number; rows already in place are not
                // rewritten.
                yield* sql`
                  update encounter_prep set position = moved.position
                  from (values ${sql.csv(
                    placed.map((each, position) => sql`(${each}::uuid, ${position}::int)`),
                  )}) as moved (encounter_id, position)
                  where encounter_prep.encounter_id = moved.encounter_id
                    and encounter_prep.campaign_id = ${campaignId}
                    and encounter_prep.position <> moved.position
                `;
              }),
            ),
          ),

        prep: (creator, id) =>
          dieOnSqlError(prepOf({ ...asked(creator), id }).pipe(orNotFound("encounter", id))),

        prepList: (creator) => dieOnSqlError(preps(asked(creator))),
      };
    }),
  ).pipe(Layer.provide(EncounterCreatures.layer));
}
