import {
  type Actor,
  type BoardDoorUpdate,
  BoardDoorUpdatedPayload,
  type BoardFogUpdate,
  type BoardLightUpdate,
  BoardLightUpdatedPayload,
  type BoardRegionUpdate,
  BoardRegionUpdatedPayload,
  type BoardSquare,
  type CampaignCharacterId,
  type CampaignId,
  Conflict,
  type LevelLayout,
  type LevelPartId,
  type LevelVisitOpen,
  type LevelVisitTokenMove,
  LevelVisit,
  LevelVisitId,
  LevelVisitSummary,
  lightPresetOf,
  NotFound,
  partyPathCost,
  partyWalk,
  PlayerLevelVisit,
  runLevelLayout,
  type PlayerMove,
  type SessionEventKind,
  type SessionId,
  standable,
  startingSquares,
  tableSight,
  VisitTabledPayload,
  VisitTokenMovedPayload,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, type SqlError, SqlSchema, type Statement } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { doorTold, writeDoor, writeFog, writeLight, writeRegion } from "./boardWrites.js";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import {
  boardLevel,
  boardLevelColumn,
  copyLevelParts,
  type PartyVisionRefresh,
  partSeen,
  partySeen,
  playerLevelColumn,
  refreshBoardVision,
  unstandable,
  VISIT_BOARD,
  type VisionViewer,
} from "./levelFights.js";
import {
  classFromColumns,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  timestampColumns,
  uuidArray,
} from "./rows.js";
import { boardColumns, fogColumn } from "./RunBoards.js";
import { appendEvent } from "./SessionEvents.js";
import {
  campaignWritableById,
  levelOwned,
  levelVisitAtPlayerTable,
  levelVisitWritable,
  ownVisitToken,
  rowReadable,
} from "./visibility.js";

/**
 * A campaign's visits of its creator's levels (`0113_level_visits.ts`): the
 * dungeon as the party left it, one per campaign and level, for good. **The
 * service is the creator's alone**: every method takes a
 * `CampaignCreatorActor` and still names `levelVisitWritable` beneath it, so
 * a player or a stranger is `NotFound` and never fetched.
 *
 * The DM explores a visit with no fight on it (`0114_level_visit_writes.ts`):
 * tokens, fog, doors, lights and secret regions, the last four through the
 * same statements a fight's board is written with (`boardWrites.ts`). A
 * seated player reads the visit on the table, narrowed (`playerVisitOnTable`),
 * and walks their own token on it (`playerVisitMove`), both through
 * `PlayerTable`, on predicates of their own (`levelVisitAtPlayerTable`).
 * Every write on a visit, the DM's or a player's, is one `visitWrite`: one
 * transaction holding the visit row, a `Conflict` while a live fight borrows
 * the visit, idempotent on its `requestId` through the visit's own ledger,
 * the party's vision recomputed over the visit (`refreshVisitVision`), and a
 * `visit-*` line logged on the night that is open, ringing its doorbell after
 * the commit. With no night open it logs nothing and rings nothing.
 *
 * **Which lines are the table's** mirrors a fight's (`0110_party_vision.ts`):
 * a token's move is shared when the table sees that token; a door's when it
 * is one the party has seen that opened or shut with no lock in it
 * (`doorTold`); a light's when it stands where the party has seen; a region's,
 * the fog's and a secret door's finding stay the DM's. Where the write's own
 * line is the DM's and the table draws something differently now, a
 * contentless shared `visit-vision-updated` rings the players' doorbell. A
 * line is the table's only while the visit is on the table.
 *
 * A visit is a live-play record: Hob does not open one (AGENTS.md, the
 * standing exceptions), so nothing here takes an `AssistantOrigin`.
 */

const VisitRow = classFromColumns(
  LevelVisit,
  { ...LevelVisit.fields, ...timestampColumns },
  boardColumns,
);
const SummaryRow = classFromColumns(
  LevelVisitSummary,
  { ...LevelVisitSummary.fields, ...timestampColumns },
  boardColumns,
);
const PlayerVisitRow = fromColumns(PlayerLevelVisit, boardColumns);
const decodePlayerVisit = Schema.decodeUnknownEffect(PlayerVisitRow);

const VisitRequest = Schema.toType(Schema.Struct({ ...creatorFields, id: LevelVisitId }));

/** Over `level_visit` joined to its `campaign`: whether it is the visit on the table. */
const onTableColumn = (sql: SqlClient.SqlClient) =>
  sql`(campaign.table_visit_id is not distinct from level_visit.id) as on_table`;

/** Over `level_visit`: a live fight borrows it, so the fight answers for the dungeon. */
export const borrowedBy = (sql: SqlClient.SqlClient) =>
  sql`exists (select 1 from encounter_run
              where encounter_run.level_visit_id = level_visit.id
                and encounter_run.ended_at is null)`;

/**
 * Over `encounter` and `level_visit`: the encounter is placed in the visit
 * (`EncounterSpots.ts` in `@taverns/api`), its spots aside: the campaign's,
 * on the visit's level, and never played, a fight in progress included (an
 * encounter is played once). Computed, never stored.
 */
const placedIn = (sql: SqlClient.SqlClient) => sql`
  encounter.campaign_id = level_visit.campaign_id
  and encounter.level_id = level_visit.level_id
  and not exists (select 1 from encounter_run where encounter_run.encounter_id = encounter.id)
`;

/**
 * The encounters placed in a visit as the DM's read has them
 * (`LevelVisit.encounters`), as one `json` column, `encounters`, over
 * `level_visit` in scope: each with a placed creature, in the DM's planned
 * order, its creatures by roster line and instance with a spot past the
 * copy's edge flagged `offBoard` (whether one inside it can be stood on is
 * the geometry's, asked by the read: `withSpotProblems`), and its trigger
 * area turned from squares of the level into squares of the copy, those past
 * its edge left out. **The creator's read only.**
 */
const placedEncountersColumn = (sql: SqlClient.SqlClient): Statement.Fragment => sql`
  coalesce((
    select json_agg(json_build_object(
      'id', encounter.id, 'name', encounter.name, 'kind', encounter.kind,
      'creatures', placed.creatures,
      'trigger', case when prep.trigger_squares is null then null else coalesce((
        select json_agg(json_build_object(
          'column', square % level.columns, 'row', square / level.columns
        ) order by square / level.columns, square % level.columns)
        from unnest(prep.trigger_squares) square
        where square % level.columns < level_visit.board_columns
          and square / level.columns < level_visit.board_rows
      ), '[]'::json) end
    ) order by prep.position, encounter.id)
    from encounter
    join encounter_prep prep on prep.encounter_id = encounter.id
    join level on level.id = encounter.level_id and level.account_id = encounter.level_owner_id
    cross join lateral (
      select json_agg(json_build_object(
        'encounterCreatureId', line.id, 'ordinal', spot.ordinal,
        'name', coalesce(npc.name, creature.name),
        'column', spot.board_column, 'row', spot.board_row,
        'problem', case when spot.board_column >= level_visit.board_columns
                          or spot.board_row >= level_visit.board_rows
                        then 'offBoard' end
      ) order by line.created_at, line.id, spot.ordinal) as creatures
      from encounter_creature line
      join encounter_creature_spot spot on spot.encounter_creature_id = line.id
      join creature on creature.id = line.creature_id
      left join npc on npc.id = line.npc_id
      where line.encounter_id = encounter.id
    ) placed
    where ${placedIn(sql)} and placed.creatures is not null
  ), '[]'::json) as encounters
`;

/**
 * The DM's visit with each placed creature on the copy that no token may
 * stand on there flagged `blocked` (`unstandable`, the rule a fight's start
 * seeds by): a wall or a prop the level gained since the creature was
 * placed, or a copy older than the placement.
 */
const withSpotProblems = (visit: LevelVisit): LevelVisit => {
  if (visit.encounters.length === 0) return visit;
  const layout = runLevelLayout(
    { columns: visit.columns, rows: visit.rows, feetPerCell: visit.feetPerCell },
    visit.level,
  );
  const blocked = new Set(
    unstandable(layout).map((square) => square.row * layout.columns + square.column),
  );
  return new LevelVisit({
    ...visit,
    encounters: visit.encounters.map((encounter) => ({
      ...encounter,
      creatures: encounter.creatures.map((creature) =>
        creature.problem === null && blocked.has(creature.row * layout.columns + creature.column)
          ? { ...creature, problem: "blocked" as const }
          : creature,
      ),
    })),
  });
};

/**
 * The placed creatures the party sees now on a visit (`PlayerLevelVisit
 * .creatures`), as one `json` column, `creatures`, over `level_visit` in
 * scope: each instance of an encounter placed in the visit whose square is on
 * the copy and in `party_sees` with the DM's fog taken out, as its name
 * (a member of the Cast's own, else the creature's: a fight's token's) and
 * its square, in reading order. Sight decides: the line's own `visibility`
 * is not asked, as a fight on a level does not ask it of a foe it shows. No
 * encounter, line, count or trigger is selected. Narrowed here, in SQL.
 */
export const seenPlacedColumn = (sql: SqlClient.SqlClient): Statement.Fragment => sql`
  coalesce((
    select json_agg(json_build_object(
      'name', coalesce(npc.name, creature.name),
      'column', spot.board_column, 'row', spot.board_row
    ) order by spot.board_row, spot.board_column, line.id, spot.ordinal)
    from encounter
    join encounter_creature line on line.encounter_id = encounter.id
    join encounter_creature_spot spot on spot.encounter_creature_id = line.id
    join creature on creature.id = line.creature_id
    left join npc on npc.id = line.npc_id
    where ${placedIn(sql)}
      and spot.board_column < level_visit.board_columns
      and spot.board_row < level_visit.board_rows
      and (spot.board_row * level_visit.board_columns + spot.board_column)
            = any(level_visit.party_sees)
      and not (spot.board_row * level_visit.board_columns + spot.board_column)
            = any(level_visit.fog_hidden)
  ), '[]'::json) as creatures
`;

/**
 * Where the party's eyes stand on a visit: each token whose seat is still
 * live and holds a character, with that character's sheet traits.
 */
const visitViewers = (sql: SqlClient.SqlClient, visitId: string) =>
  sql<VisionViewer>`
    select level_visit_token.board_column, level_visit_token.board_row,
           character.body -> 'traits' as traits
    from level_visit_token
    join campaign_character seat on seat.id = level_visit_token.seat_id
    join character on character.id = seat.character_id
    where level_visit_token.visit_id = ${visitId} and seat.left_at is null
  `;

/**
 * Recompute what the party sees of a visit (`refreshBoardVision` over the
 * visit's copy). In the caller's transaction, beneath its gate. `shown` is
 * whether the visit is on its campaign's table.
 */
export const refreshVisitVision = (sql: SqlClient.SqlClient, visitId: string) =>
  refreshBoardVision(sql, {
    tables: VISIT_BOARD,
    id: visitId,
    viewers: visitViewers(sql, visitId),
    shown: sql`exists (select 1 from campaign
                       where campaign.id = level_visit.campaign_id
                         and campaign.table_visit_id = level_visit.id)`,
  });

/**
 * The night open at a campaign: its current session, started and not ended,
 * or `null`. A visit's writes are logged on it (`0114_level_visit_writes.ts`).
 */
const openNight = (sql: SqlClient.SqlClient, campaign: CampaignId | string) =>
  Effect.map(
    sql<{ readonly id: SessionId }>`
      select session.id from campaign
      join session on session.id = campaign.current_session_id
      where campaign.id = ${campaign}
        and session.started_at is not null and session.ended_at is null
    `,
    (rows) => rows[0]?.id ?? null,
  );

/** What the table is told of a write: its line is theirs, or they are rung anyway. */
interface Told {
  readonly shared: boolean;
  readonly force: boolean;
}

const DM_LINE: Told = { shared: false, force: false };

/** A visit's line, as a write describes it. */
interface VisitLine {
  readonly kind: SessionEventKind;
  readonly payload: Record<string, unknown>;
  /**
   * What the table is told of it, asked once the party's vision is
   * recomputed for the write; absent for the DM's own line.
   */
  readonly told?: (vision: PartyVisionRefresh | null) => Effect.Effect<Told, SqlError.SqlError>;
}

/** A line as it is logged. */
export interface LoggedLine {
  readonly kind: SessionEventKind;
  readonly payload: Record<string, unknown>;
  readonly visibility: "dm" | "shared";
}

/**
 * The lines a write logs: its own, shared when it is the table's and the
 * visit is on the table, and, when it is not and the table draws something
 * differently now (the vision moved, or `force`), a contentless shared
 * `visit-vision-updated` that rings the players' doorbell.
 */
const linesOf = (
  line: VisitLine,
  vision: PartyVisionRefresh | null,
  told: Told,
): ReadonlyArray<LoggedLine> => {
  const shown = vision !== null && vision.shown;
  const shared = told.shared && shown;
  const own: LoggedLine = {
    kind: line.kind,
    payload: line.payload,
    visibility: shared ? "shared" : "dm",
  };
  const ring = !shared && shown && (vision.changed || told.force);
  return ring ? [own, { kind: "visit-vision-updated", payload: {}, visibility: "shared" }] : [own];
};

/**
 * Log a visit's lines on its campaign's open night, in the caller's
 * transaction, answering the night whose doorbell the caller rings once it
 * has committed, or `null` with no night open, when nothing is written.
 */
export const tellTheNight = (
  sql: SqlClient.SqlClient,
  campaign: CampaignId | string,
  visitId: string,
  lines: ReadonlyArray<LoggedLine>,
) =>
  Effect.gen(function* () {
    if (lines.length === 0) return null;
    const sessionId = yield* openNight(sql, campaign);
    if (sessionId === null) return null;
    for (const line of lines) {
      yield* appendEvent(sql, {
        sessionId,
        kind: line.kind,
        levelVisitId: visitId,
        payload: line.payload,
        visibility: line.visibility,
      });
    }
    return sessionId;
  });

/** A visit's `visit-tabled` line: the table's, since what it plays on changed. */
const tabledLine = (onTable: boolean): LoggedLine => ({
  kind: "visit-tabled",
  payload: { onTable } satisfies typeof VisitTabledPayload.Encoded,
  visibility: "shared",
});

/**
 * The squares new tokens stand on, as many as `count`: the level's entry
 * squares a token may stand on and no token holds (`taken`), in reading
 * order, then down the left edge (`startingSquares`, the left edge a fight
 * seeds) on squares a token may stand on and no token holds. A board with no
 * room left stands fewer.
 */
const seatSquares = (
  layout: LevelLayout,
  count: number,
  taken: ReadonlyArray<BoardSquare>,
): ReadonlyArray<BoardSquare> => {
  if (count <= 0) return [];
  const blocked = unstandable(layout);
  const index = (square: BoardSquare) => square.row * layout.columns + square.column;
  const unusable = new Set([...blocked, ...taken].map(index));
  const entries = [
    ...new Set(
      layout.regions
        .filter((region) => region.kind === "entry")
        .flatMap((region) => region.squares),
    ),
  ]
    .filter((square) => square < layout.columns * layout.rows && !unusable.has(square))
    .sort((a, b) => a - b)
    .slice(0, count)
    .map((square) => ({
      column: square % layout.columns,
      row: Math.floor(square / layout.columns),
    }));
  const rest = startingSquares(
    { columns: layout.columns, rows: layout.rows },
    "party",
    count - entries.length,
    [...blocked, ...taken, ...entries],
  );
  return [...entries, ...rest];
};

/**
 * Stand a token for every live seat holding a character that has none on the
 * visit (`seatSquares`, beside the tokens already there), in the order they
 * sat down; answers how many stood. In the caller's transaction, which holds
 * the visit row. A seat that left and came back is a new seat, so a new
 * token.
 */
const standMissingSeats = (
  sql: SqlClient.SqlClient,
  campaign: CampaignId | string,
  visitId: string,
) =>
  Effect.gen(function* () {
    const seats = yield* sql<{ readonly id: CampaignCharacterId }>`
      select campaign_character.id from campaign_character
      where campaign_character.campaign_id = ${campaign}
        and campaign_character.left_at is null
        and campaign_character.character_id is not null
        and not exists (
          select 1 from level_visit_token
          where level_visit_token.visit_id = ${visitId}
            and level_visit_token.seat_id = campaign_character.id
        )
      order by campaign_character.joined_at asc, campaign_character.id asc
    `;
    if (seats.length === 0) return 0;
    const level = yield* boardLevel(sql, VISIT_BOARD, visitId);
    if (level === null) return yield* Effect.die("a visit has no level");
    const standing = yield* sql<{ readonly board_column: number; readonly board_row: number }>`
      select level_visit_token.board_column, level_visit_token.board_row
      from level_visit_token where level_visit_token.visit_id = ${visitId}
    `;
    const squares = seatSquares(
      level.layout,
      seats.length,
      standing.map((token) => ({ column: token.board_column, row: token.board_row })),
    );
    const tokens = squares.map((square, index) => ({
      visit_id: visitId,
      campaign_id: campaign,
      seat_id: seats[index]!.id,
      board_columns: level.layout.columns,
      board_rows: level.layout.rows,
      board_column: square.column,
      board_row: square.row,
    }));
    if (tokens.length > 0) yield* sql`insert into level_visit_token ${sql.insert(tokens)}`;
    return tokens.length;
  });

/**
 * A seat sat down at the table (`Party.join`): it stands on the visit on the
 * table, if there is one and no fight borrows it (`standMissingSeats`), and
 * the party looks again, with a `visit-vision-updated` line on the open
 * night, shared, since the table draws a new token. In the joining write's
 * transaction; answers the night the caller rings once it has committed. A
 * visit off the table gives the seat its token when it is put on
 * (`LevelVisits.putOnTable`).
 */
export const standNewSeats = (
  sql: SqlClient.SqlClient,
  campaign: CampaignId,
): Effect.Effect<SessionId | null, SqlError.SqlError> =>
  Effect.gen(function* () {
    const visits = yield* sql<{ readonly id: string }>`
      select level_visit.id from campaign
      join level_visit on level_visit.id = campaign.table_visit_id
      where campaign.id = ${campaign} and not ${borrowedBy(sql)}
      for update of level_visit
    `;
    const visitId = visits[0]?.id;
    if (visitId === undefined) return null;
    const stood = yield* standMissingSeats(sql, campaign, visitId);
    if (stood === 0) return null;
    yield* refreshVisitVision(sql, visitId);
    return yield* tellTheNight(sql, campaign, visitId, [
      { kind: "visit-vision-updated", payload: {}, visibility: "shared" },
    ]);
  });

/**
 * A seat left its table (`Party.leave`, a revoked membership, a deleted
 * character): its token on every visit goes, and each of those visits, on
 * the table or not, looks again without it, with a `visit-vision-updated`
 * line on its campaign's open night: shared while the visit is on the table,
 * whose players draw one token fewer, else the DM's. In the retiring write's
 * transaction; answers the nights whose doorbell the caller rings once it has
 * committed. A seat retires rather than being deleted, so its token's key
 * does not cascade; this is the delete.
 */
export const dropSeatTokens = (
  sql: SqlClient.SqlClient,
  seatIds: ReadonlyArray<CampaignCharacterId | string>,
): Effect.Effect<ReadonlyArray<SessionId>, SqlError.SqlError> =>
  seatIds.length === 0
    ? Effect.succeed([])
    : Effect.gen(function* () {
        const gone = yield* sql<{ readonly visit_id: string; readonly campaign_id: string }>`
          delete from level_visit_token
          where level_visit_token.seat_id = any(${uuidArray([...seatIds])})
          returning level_visit_token.visit_id, level_visit_token.campaign_id
        `;
        // Every visit it stood on, on the table or not, so none keeps a
        // `party_sees` drawn from a token that is gone. Sorted, so two
        // retiring writes lock the boards in one order.
        const visits = [
          ...new Map(gone.map((row) => [row.visit_id, row.campaign_id] as const)).entries(),
        ].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        const nights = yield* Effect.forEach(visits, ([visitId, campaignId]) =>
          Effect.gen(function* () {
            const vision = yield* refreshVisitVision(sql, visitId);
            if (vision === null) return null;
            return yield* tellTheNight(sql, campaignId, visitId, [
              {
                kind: "visit-vision-updated",
                payload: {},
                visibility: vision.shown ? "shared" : "dm",
              },
            ]);
          }),
        );
        return [...new Set(nights.filter((night): night is SessionId => night !== null))];
      });

/**
 * One write on a visit, the DM's or a player's, in one transaction: the visit
 * held `for update` beneath `gate`, the caller's predicate over `level_visit`
 * (`NotFound` otherwise), so the writes on one visit land one after the
 * other; refused while a live fight borrows it; its `requestId` entered in
 * the visit's ledger, a repeat answering `answer` with nothing written; then
 * `body`, the party's vision recomputed, and `body`'s lines logged on the
 * open night (`linesOf`). Answers `answer` as the write leaves the visit, and
 * the night the caller rings once it has committed.
 */
const visitWrite = <A>(
  sql: SqlClient.SqlClient,
  args: {
    readonly campaign: CampaignId;
    readonly id: LevelVisitId;
    readonly requestId: string | undefined;
    readonly gate: Statement.Fragment;
    readonly body: Effect.Effect<VisitLine, NotFound | Conflict | SqlError.SqlError>;
    readonly answer: Effect.Effect<A, SqlError.SqlError>;
  },
): Effect.Effect<
  { readonly value: A; readonly night: SessionId | null },
  NotFound | Conflict | SqlError.SqlError
> =>
  sql.withTransaction(
    Effect.gen(function* () {
      const { campaign, id, requestId } = args;
      const locked = yield* sql<{ readonly borrowed: boolean }>`
        select ${borrowedBy(sql)} as borrowed from level_visit
        where level_visit.id = ${id} and ${args.gate}
        for update of level_visit
      `;
      const visit = locked[0];
      if (visit === undefined) return yield* new NotFound({ resource: "level_visit", id });
      // The fight's start holds the visit too (a later phase), so once a
      // fight borrows it nothing here writes until it ends.
      if (visit.borrowed) {
        return yield* new Conflict({
          message: "a fight is being played on this level: the board is the fight's until it ends",
        });
      }
      if (requestId !== undefined) {
        const entered = yield* sql`
          insert into level_visit_request (visit_id, request_id)
          values (${id}, ${requestId})
          on conflict (visit_id, request_id) do nothing
          returning level_visit_request.visit_id
        `;
        if (entered.length === 0) return { value: yield* args.answer, night: null };
      }
      const line = yield* args.body;
      yield* sql`update level_visit set updated_at = now() where level_visit.id = ${id}`;
      const vision = yield* refreshVisitVision(sql, id);
      const told = line.told === undefined ? DM_LINE : yield* line.told(vision);
      const night = yield* tellTheNight(sql, campaign, id, linesOf(line, vision, told));
      return { value: yield* args.answer, night };
    }),
  );

/**
 * Whether the table sees a seat's token on the visit: the seat is shared and
 * the DM's fog does not cover its square. Asked after the move, so a move's
 * line is shared by where the token stands once it is done; whose own token
 * it is matters only to that player's read, which always has it.
 */
const tokenSeen = (sql: SqlClient.SqlClient, visitId: string, seatId: string) =>
  Effect.map(
    sql<{ readonly seen: boolean }>`
      select (seat.visibility = 'shared'
              and not (level_visit_token.board_row * level_visit.board_columns
                         + level_visit_token.board_column) = any(level_visit.fog_hidden)) as seen
      from level_visit_token
      join level_visit on level_visit.id = level_visit_token.visit_id
      join campaign_character seat on seat.id = level_visit_token.seat_id
      where level_visit_token.visit_id = ${visitId} and level_visit_token.seat_id = ${seatId}
    `,
    (rows) => rows[0]?.seen === true,
  );

/**
 * Stand a seat's token on another square of the visit, beneath the caller's
 * `visitWrite` gate. `tokenGate`, over `level_visit_token`, narrows which
 * token may be moved (`NotFound` for any other). The DM places a token as a
 * miniature, on any square a token may stand on (`place`); a player walks
 * (`walk`): the square must be reachable step by step from where the token
 * stands over the visit's copy, through no wall, no door that is not open, no
 * secret door the DM has not revealed, no blocking prop (DM-only ones
 * included) and no void, and only over squares the party has seen, the DM's
 * fog taken out, ending at most one step into the dark beyond them
 * (`partyWalk`, the rule a player's move in a fight is held to). There is no
 * speed limit. Every refusal of a walk says the same thing, so none tells of
 * what the party has not seen.
 */
const moveVisitToken = (
  sql: SqlClient.SqlClient,
  args: {
    readonly id: LevelVisitId;
    readonly seatId: CampaignCharacterId;
    readonly to: BoardSquare;
    readonly mode: "place" | "walk";
    readonly tokenGate: Statement.Fragment;
  },
): Effect.Effect<VisitLine, NotFound | Conflict | SqlError.SqlError> =>
  Effect.gen(function* () {
    const { id, seatId, to } = args;
    const tokens = yield* sql<{ readonly board_column: number; readonly board_row: number }>`
      select level_visit_token.board_column, level_visit_token.board_row
      from level_visit_token
      where level_visit_token.visit_id = ${id} and level_visit_token.seat_id = ${seatId}
        and ${args.tokenGate}
      for update
    `;
    const token = tokens[0];
    if (token === undefined) {
      return yield* new NotFound({ resource: "campaign_character", id: seatId });
    }
    const level = yield* boardLevel(sql, VISIT_BOARD, id);
    if (level === null) return yield* Effect.die("a visit has no level");
    if (to.column >= level.layout.columns || to.row >= level.layout.rows) {
      return yield* new Conflict({ message: "that square is off the board" });
    }
    if (args.mode === "walk") {
      const walk = partyWalk(level.layout, yield* partySeen(sql, VISIT_BOARD, id));
      const walked = standable(level.layout, to)
        ? partyPathCost(
            walk,
            { column: token.board_column, row: token.board_row },
            to,
            tableSight(level.level),
          )
        : null;
      if (walked === null) return yield* new Conflict({ message: "No way there" });
    } else if (!standable(level.layout, to)) {
      return yield* new Conflict({ message: "no token can stand on that square" });
    }
    yield* sql`
      update level_visit_token
      set board_column = ${to.column}, board_row = ${to.row}
      where level_visit_token.visit_id = ${id} and level_visit_token.seat_id = ${seatId}
    `;
    return {
      kind: "visit-token-moved",
      payload: {
        seatId,
        from: { column: token.board_column, row: token.board_row },
        to: { column: to.column, row: to.row },
      } satisfies typeof VisitTokenMovedPayload.Encoded,
      told: () =>
        Effect.map(tokenSeen(sql, id, seatId), (seen) => ({ shared: seen, force: false })),
    } satisfies VisitLine;
  });

/**
 * The visit on the campaign's table as a seated player sees it
 * (`PlayerLevelVisit`), or `null`: beneath `levelVisitAtPlayerTable`, and not
 * while a live fight borrows it, when the table plays the fight. The level is
 * `playerLevelColumn` over the visit's copy, the narrowing a fight's player
 * board has; a token is a live seat the reader may see (shared, or their
 * own), and none the DM's fog covers but their own. No name, no level id, and
 * none of the copy's wide columns are selected.
 */
export const playerVisitOnTable = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<PlayerLevelVisit | null, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql`
      select level_visit.id, level_visit.board_columns, level_visit.board_rows,
             level_visit.feet_per_cell, ${playerLevelColumn(sql, VISIT_BOARD)},
             ${fogColumn(sql, "level_visit")},
             coalesce((
               select json_agg(json_build_object(
                 'seatId', seat.id, 'name', seat.display_name,
                 'own', seat.account_id = ${actor.accountId},
                 'column', level_visit_token.board_column, 'row', level_visit_token.board_row
               ) order by seat.joined_at, seat.id)
               from level_visit_token
               join campaign_character seat on seat.id = level_visit_token.seat_id
               where level_visit_token.visit_id = level_visit.id
                 and seat.left_at is null
                 and (seat.account_id = ${actor.accountId}
                   or (seat.visibility = 'shared'
                     and not (level_visit_token.board_row * level_visit.board_columns
                                + level_visit_token.board_column) = any(level_visit.fog_hidden)))
             ), '[]'::json) as tokens,
             ${seenPlacedColumn(sql)}
      from level_visit
      where ${levelVisitAtPlayerTable(sql, campaignId, actor)}
        and not ${borrowedBy(sql)}
    `;
    const row = rows[0];
    if (row === undefined) return null;
    return yield* decodePlayerVisit(row).pipe(Effect.orDie);
  });

/**
 * A seated player walks their own token on the visit on the table
 * (`moveVisitToken`'s walk): the visit beneath `levelVisitAtPlayerTable`, the
 * token beneath `ownVisitToken`, so another player's seat, a visit off the
 * table, a night that is not open and an asker with no seat are each
 * `NotFound`, as the read would be. Answers the night the caller rings once
 * it has committed.
 */
export const playerVisitMove = (
  sql: SqlClient.SqlClient,
  actor: Actor,
  campaignId: CampaignId,
  id: LevelVisitId,
  seatId: CampaignCharacterId,
  move: PlayerMove,
): Effect.Effect<SessionId | null, NotFound | Conflict | SqlError.SqlError> =>
  Effect.map(
    visitWrite(sql, {
      campaign: campaignId,
      id,
      requestId: move.requestId,
      gate: levelVisitAtPlayerTable(sql, campaignId, actor),
      body: moveVisitToken(sql, {
        id,
        seatId,
        to: move.position,
        mode: "walk",
        tokenGate: ownVisitToken(sql, campaignId, actor),
      }),
      answer: Effect.void,
    }),
    ({ night }) => night,
  );

export class LevelVisits extends Context.Service<
  LevelVisits,
  {
    /** The campaign's visits, by name. */
    readonly list: (
      creator: CampaignCreatorActor,
    ) => Effect.Effect<ReadonlyArray<LevelVisitSummary>>;
    readonly findById: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
    ) => Effect.Effect<LevelVisit, NotFound>;
    /**
     * Copy one of the creator's own levels into a new visit, in one
     * transaction holding the level `for share`, with a token for every live
     * seat on the level's entry squares, then down the left edge
     * (`seatSquares`), and the party's first look around. Another account's
     * level is `NotFound` before any write; a level the campaign already has a
     * visit of is a `Conflict`, and nothing is written.
     */
    readonly open: (
      creator: CampaignCreatorActor,
      payload: LevelVisitOpen,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
    /**
     * *Reset level*: deletes the visit, its parts and its tokens, and takes it
     * off the table, telling the table so when it was there. A fight that
     * borrowed it keeps its own copy and loses the pointer. `Conflict` while
     * a live fight is played on it.
     */
    readonly remove: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
    ) => Effect.Effect<void, NotFound | Conflict>;
    /**
     * Makes the visit the one on the campaign's table, in place of any other,
     * and stands a token for any live seat that has none on it
     * (`standMissingSeats`), unless a fight borrows it.
     */
    readonly putOnTable: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
    ) => Effect.Effect<LevelVisit, NotFound>;
    /** Leaves no visit on the campaign's table. */
    readonly takeOffTable: (creator: CampaignCreatorActor) => Effect.Effect<void>;
    /**
     * Stand a seat's token on a square of the visit, as the DM would a
     * miniature: any square on the board a token may stand on (`standable`),
     * with no walk and no speed. `NotFound` for a seat with no token on the
     * visit; `Conflict` for a square off the board or one no token may stand
     * on. Two tokens may share a square, as in a fight.
     */
    readonly moveToken: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
      seatId: CampaignCharacterId,
      move: LevelVisitTokenMove,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
    /** The DM's fog on the visit (`writeFog`); a `reset` clears it, as the visit opened unfogged. */
    readonly updateFog: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
      update: BoardFogUpdate,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
    /** A door of the visit (`writeDoor`). */
    readonly updateDoor: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
      wallId: LevelPartId,
      update: BoardDoorUpdate,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
    /** A light of the visit (`writeLight`). */
    readonly updateLight: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
      lightId: LevelPartId,
      update: BoardLightUpdate,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
    /** A secret region of the visit (`writeRegion`). */
    readonly updateRegion: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
      regionId: LevelPartId,
      update: BoardRegionUpdate,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
  }
>()("LevelVisits") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      const listed = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(creatorFields)),
        Result: SummaryRow,
        execute: ({ campaign, actor }) => sql`
          select level_visit.id, level_visit.level_id, level_visit.name,
                 level_visit.board_columns, level_visit.board_rows, level_visit.feet_per_cell,
                 ${onTableColumn(sql)}, level_visit.created_at, level_visit.updated_at
          from level_visit
          join campaign on campaign.id = level_visit.campaign_id
          where ${levelVisitWritable(sql, campaign, actor)}
          order by lower(level_visit.name), level_visit.id
        `,
      });

      const visit = SqlSchema.findOne({
        Request: VisitRequest,
        Result: VisitRow,
        execute: ({ campaign, actor, id }) => sql`
          select level_visit.id, level_visit.level_id, level_visit.name,
                 level_visit.board_columns, level_visit.board_rows, level_visit.feet_per_cell,
                 ${boardLevelColumn(sql, VISIT_BOARD)},
                 ${fogColumn(sql, "level_visit")},
                 level_visit.party_sees, level_visit.party_seen,
                 coalesce((
                   select json_agg(json_build_object(
                     'seatId', seat.id, 'name', seat.display_name,
                     'column', level_visit_token.board_column, 'row', level_visit_token.board_row
                   ) order by seat.joined_at, seat.id)
                   from level_visit_token
                   join campaign_character seat on seat.id = level_visit_token.seat_id
                   where level_visit_token.visit_id = level_visit.id
                 ), '[]'::json) as tokens,
                 ${placedEncountersColumn(sql)},
                 ${onTableColumn(sql)}, level_visit.created_at, level_visit.updated_at
          from level_visit
          join campaign on campaign.id = level_visit.campaign_id
          where level_visit.id = ${id} and ${levelVisitWritable(sql, campaign, actor)}
        `,
      });

      const read = (creator: CampaignCreatorActor, id: LevelVisitId) =>
        visit({ ...asked(creator), id }).pipe(
          orNotFound("level_visit", id),
          Effect.map(withSpotProblems),
        );

      /** Ring the night a write logged on, once its transaction has committed. */
      const ring = (night: SessionId | null) =>
        night === null ? Effect.void : live.touched(night);

      /** One of the DM's exploring writes (`visitWrite`), answering the visit. */
      const explore = (
        creator: CampaignCreatorActor,
        id: LevelVisitId,
        requestId: string | undefined,
        body: Effect.Effect<VisitLine, NotFound | Conflict | SqlError.SqlError>,
      ) =>
        dieOnSqlError(
          visitWrite(sql, {
            campaign: creator.campaign,
            id,
            requestId,
            gate: levelVisitWritable(sql, creator.campaign, creator.actor),
            body,
            answer: read(creator, id).pipe(Effect.orDie),
          }).pipe(Effect.flatMap(({ value, night }) => Effect.as(ring(night), value))),
        );

      return {
        list: (creator) => dieOnSqlError(listed(asked(creator))),

        findById: (creator, id) => dieOnSqlError(read(creator, id)),

        open: (creator, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const { actor, campaign } = creator;
                  // Held `for share` until the commit, as a fight's start holds
                  // it (`copyLevel`): a save or a delete of the level waits, so
                  // the copy below is of this one level, whole.
                  const levels = yield* sql<{ readonly id: string }>`
                    select level.id from level
                    where level.id = ${payload.levelId} and ${levelOwned(sql, actor)}
                    for share of level
                  `;
                  if (levels.length === 0) {
                    return yield* new NotFound({ resource: "level", id: payload.levelId });
                  }
                  // One visit per campaign and level, for good; the unique key
                  // answers a race the same way.
                  const made = yield* sql<{ readonly id: LevelVisitId; readonly name: string }>`
                    insert into level_visit (
                      campaign_id, level_id, level_owner_id, name,
                      board_columns, board_rows, feet_per_cell, ambient, floor
                    )
                    select ${campaign}, level.id, level.account_id, level.name,
                           level.columns, level.rows, level.feet_per_cell, level.ambient,
                           level.floor
                    from level
                    where level.id = ${payload.levelId} and ${levelOwned(sql, actor)}
                      and ${campaignWritableById(sql, campaign, actor)}
                    on conflict (campaign_id, level_id) do nothing
                    returning level_visit.id, level_visit.name
                  `;
                  const opened = made[0];
                  if (opened === undefined) {
                    return yield* new Conflict({
                      message:
                        "this campaign already has a visit of that level: put it on the table, or reset the level to start it again",
                    });
                  }
                  const visitId = opened.id;
                  yield* copyLevelParts(sql, VISIT_BOARD, visitId, payload.levelId, actor);

                  // The party on the level's way in: each live seat holding a
                  // character, in the order they sat down.
                  const seats = yield* sql<{ readonly id: CampaignCharacterId }>`
                    select campaign_character.id from campaign_character
                    join character on character.id = campaign_character.character_id
                    where campaign_character.left_at is null
                      and ${rowReadable(sql, "campaign_character", campaign, actor)}
                    order by campaign_character.joined_at asc, campaign_character.id asc
                  `;
                  const level = yield* boardLevel(sql, VISIT_BOARD, visitId);
                  if (level === null) return yield* Effect.die("a visit has no level");
                  const squares = seatSquares(level.layout, seats.length, []);
                  const tokens = squares.map((square, index) => ({
                    visit_id: visitId,
                    campaign_id: campaign,
                    seat_id: seats[index]!.id,
                    board_columns: level.layout.columns,
                    board_rows: level.layout.rows,
                    board_column: square.column,
                    board_row: square.row,
                  }));
                  if (tokens.length > 0) {
                    yield* sql`insert into level_visit_token ${sql.insert(tokens)}`;
                  }
                  yield* refreshVisitVision(sql, visitId);
                  const night = yield* tellTheNight(sql, campaign, visitId, [
                    { kind: "visit-opened", payload: { name: opened.name }, visibility: "dm" },
                  ]);
                  return { visit: yield* read(creator, visitId).pipe(Effect.orDie), night };
                }),
              )
              .pipe(Effect.flatMap(({ visit, night }) => Effect.as(ring(night), visit))),
          ),

        remove: (creator, id) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const { actor, campaign } = creator;
                  const locked = yield* sql<{
                    readonly borrowed: boolean;
                    readonly on_table: boolean;
                  }>`
                    select ${borrowedBy(sql)} as borrowed, ${onTableColumn(sql)}
                    from level_visit
                    join campaign on campaign.id = level_visit.campaign_id
                    where level_visit.id = ${id} and ${levelVisitWritable(sql, campaign, actor)}
                    for update of level_visit
                  `;
                  const found = locked[0];
                  if (found === undefined) {
                    return yield* new NotFound({ resource: "level_visit", id });
                  }
                  if (found.borrowed) {
                    return yield* new Conflict({
                      message:
                        "a fight is being played on this level: end it before resetting the level",
                    });
                  }
                  // The table it was on is told it came off, before the line's
                  // pointer goes with the visit.
                  const night = found.on_table
                    ? yield* tellTheNight(sql, campaign, id, [tabledLine(false)])
                    : null;
                  // The parts and tokens cascade; the table's pointer, every
                  // borrowing fight's and every line's empty (`on delete set
                  // null`).
                  yield* sql`
                    delete from level_visit
                    where level_visit.id = ${id} and ${levelVisitWritable(sql, campaign, actor)}
                  `;
                  return night;
                }),
              )
              .pipe(Effect.flatMap(ring)),
          ),

        putOnTable: (creator, id) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const { actor, campaign } = creator;
                  const locked = yield* sql<{ readonly borrowed: boolean }>`
                    select ${borrowedBy(sql)} as borrowed from level_visit
                    where level_visit.id = ${id} and ${levelVisitWritable(sql, campaign, actor)}
                    for update of level_visit
                  `;
                  const found = locked[0];
                  if (found === undefined) {
                    return yield* new NotFound({ resource: "level_visit", id });
                  }
                  const set = yield* sql<{ readonly was: string | null }>`
                    update campaign set table_visit_id = level_visit.id
                    from level_visit
                    where campaign.id = ${campaign}
                      and level_visit.id = ${id}
                      and ${levelVisitWritable(sql, campaign, actor)}
                    returning old.table_visit_id as was
                  `;
                  const row = set[0];
                  if (row === undefined)
                    return yield* new NotFound({ resource: "level_visit", id });
                  // Every seat at the table stands on the level it plays: one
                  // that sat down since the visit was opened gets its token.
                  if (!found.borrowed && (yield* standMissingSeats(sql, campaign, id)) > 0) {
                    yield* refreshVisitVision(sql, id);
                  }
                  // A visit put on in place of another: the other's line says it
                  // came off. Putting on the visit already there says nothing.
                  let night: SessionId | null = null;
                  if (row.was !== id) {
                    if (row.was !== null) {
                      night = yield* tellTheNight(sql, campaign, row.was, [tabledLine(false)]);
                    }
                    night = yield* tellTheNight(sql, campaign, id, [tabledLine(true)]);
                  }
                  return { visit: yield* read(creator, id).pipe(Effect.orDie), night };
                }),
              )
              .pipe(Effect.flatMap(({ visit, night }) => Effect.as(ring(night), visit))),
          ),

        takeOffTable: (creator) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const { actor, campaign } = creator;
                  const cleared = yield* sql<{ readonly was: string | null }>`
                    update campaign set table_visit_id = null
                    where campaign.id = ${campaign}
                      and ${campaignWritableById(sql, campaign, actor)}
                    returning old.table_visit_id as was
                  `;
                  const was = cleared[0]?.was ?? null;
                  return was === null
                    ? null
                    : yield* tellTheNight(sql, campaign, was, [tabledLine(false)]);
                }),
              )
              .pipe(Effect.flatMap(ring)),
          ),

        moveToken: (creator, id, seatId, move) =>
          explore(
            creator,
            id,
            move.requestId,
            moveVisitToken(sql, {
              id,
              seatId,
              to: move.position,
              mode: "place",
              tokenGate: sql`true`,
            }),
          ),

        updateFog: (creator, id, update) =>
          explore(
            creator,
            id,
            update.requestId,
            Effect.gen(function* () {
              const before = yield* sql<{ readonly fog_hidden: ReadonlyArray<number> }>`
                select level_visit.fog_hidden from level_visit where level_visit.id = ${id}
              `;
              const changed = yield* writeFog(sql, VISIT_BOARD, id, update, sql`false`);
              if (changed === null) return yield* Effect.die("a visit has no board row");
              return {
                kind: "visit-fog-updated",
                payload: { hidden: changed.hidden },
                // The DM's line; the table is rung when the fog came over or
                // off a square the party has seen, which it draws differently.
                told: () =>
                  Effect.map(
                    sql<{
                      readonly fog_hidden: ReadonlyArray<number>;
                      readonly party_seen: ReadonlyArray<number>;
                    }>`
                      select level_visit.fog_hidden, level_visit.party_seen
                      from level_visit where level_visit.id = ${id}
                    `,
                    (rows): Told => {
                      const was = new Set(before[0]?.fog_hidden ?? []);
                      const now = new Set(rows[0]?.fog_hidden ?? []);
                      const force = (rows[0]?.party_seen ?? []).some(
                        (square) => was.has(square) !== now.has(square),
                      );
                      return { shared: false, force };
                    },
                  ),
              } satisfies VisitLine;
            }),
          ),

        updateDoor: (creator, id, wallId, update) =>
          explore(
            creator,
            id,
            update.requestId,
            Effect.gen(function* () {
              const after = yield* writeDoor(sql, VISIT_BOARD, id, wallId, update);
              return {
                kind: "visit-door-updated",
                payload: {
                  wallId,
                  wallKind: after.kind,
                  doorState: after.door_state,
                  revealed: after.revealed,
                  wasDoorState: after.was_door_state,
                  wasRevealed: after.was_revealed,
                } satisfies typeof BoardDoorUpdatedPayload.Encoded,
                told: (vision) =>
                  Effect.map(partSeen(sql, VISIT_BOARD, id, { wallId }), (seen) =>
                    doorTold(after, seen, vision?.shown === true),
                  ),
              } satisfies VisitLine;
            }),
          ),

        updateLight: (creator, id, lightId, update) =>
          explore(
            creator,
            id,
            update.requestId,
            Effect.gen(function* () {
              const light = yield* writeLight(sql, VISIT_BOARD, id, lightId, update.lit);
              return {
                kind: "visit-light-updated",
                payload: {
                  lightId,
                  lit: update.lit,
                  preset: lightPresetOf(light),
                } satisfies typeof BoardLightUpdatedPayload.Encoded,
                // The table's line for a light standing where they have seen.
                told: () =>
                  Effect.map(partSeen(sql, VISIT_BOARD, id, { lightId }), (seen) => ({
                    shared: seen,
                    force: false,
                  })),
              } satisfies VisitLine;
            }),
          ),

        updateRegion: (creator, id, regionId, update) =>
          explore(
            creator,
            id,
            update.requestId,
            Effect.gen(function* () {
              const region = yield* writeRegion(sql, VISIT_BOARD, id, regionId, update.revealed);
              return {
                kind: "visit-region-updated",
                payload: {
                  regionId,
                  regionKind: region.kind,
                  revealed: update.revealed,
                  wasRevealed: region.wasRevealed,
                } satisfies typeof BoardRegionUpdatedPayload.Encoded,
                // The DM's line, which would say where a secret was; the table
                // is rung when it draws the region differently now: one it
                // has seen a square of, shown or hidden.
                told: () =>
                  Effect.map(partSeen(sql, VISIT_BOARD, id, { regionId }), (seen) => ({
                    shared: false,
                    force: seen && region.wasRevealed !== update.revealed,
                  })),
              } satisfies VisitLine;
            }),
          ),
      };
    }),
  );
}
