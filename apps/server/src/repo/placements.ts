import {
  type Actor,
  type CampaignId,
  Conflict,
  type EncounterCreatureId,
  type EncounterId,
  LevelProp,
  NotFound,
  type SessionId,
  standable,
  VisitPlacementUpdatedPayload,
} from "@taverns/api";
import { Effect, Schema } from "effect";
import type { SqlClient, SqlError, Statement } from "effect/sql";
import {
  placedOnLevel,
  holdVisits,
  type LoggedLine,
  seenPlacedColumn,
  tellTheNight,
  watchNotice,
} from "./LevelVisits.js";
import { intArray, uuidArray } from "./rows.js";
import { levelOwned, rowWritable } from "./visibility.js";

/**
 * Writing an encounter's placement on its level (`EncounterSpots.ts` in
 * `@taverns/api`): its creatures' squares (`encounter_creature_spot`,
 * `0113_level_visits.ts`) and its trigger area (`encounter_prep
 * .trigger_squares`, `0115_encounter_placement.ts`), replaced whole. The one
 * implementation: the DM's `Encounters.place` and an encounter made with a
 * placement (a kept Hob proposal, `Encounters.create`) both come through
 * `writePlacement`.
 */

/** A placed instance as the write takes it: the roster line by id. */
export interface PlacementSpot {
  readonly encounterCreatureId: EncounterCreatureId;
  readonly ordinal: number;
  readonly column: number;
  readonly row: number;
}

export interface PlacementWrite {
  readonly spots: ReadonlyArray<PlacementSpot>;
  readonly trigger: ReadonlyArray<number> | null;
}

const decodeProps = Schema.decodeUnknownEffect(Schema.Array(LevelProp));

const at = (spot: { readonly column: number; readonly row: number }) =>
  `column ${String(spot.column + 1)}, row ${String(spot.row + 1)}`;

/**
 * The visits a change to an encounter's placement shows on: the campaign's
 * visits of `levelIds` (the level it is placed on; for a change of level, the
 * one it had), held as a visit write holds them (`holdVisits`), and what
 * each one's party sees placed there and has noticed, asked now, before the
 * change. Answers the effect to run once the change is written, in the same
 * transaction: given whether the placement changed at all (`false` logs
 * nothing), each visit's log on the open night gains the DM's
 * `visit-placement-updated` line naming the encounter, a contentless shared
 * `visit-vision-updated` when the placed creatures the table sees there
 * changed (the visit on the table and no fight holding it), and the DM's
 * `visit-encounter-noticed` for what the party newly notices (`watchNotice`).
 * Answers the night the caller rings once it has committed, or `null`.
 *
 * The one before-and-after compare for every write that moves a placement:
 * `writePlacement`, an encounter's level changing (`Encounters.update`), a
 * roster line counted down or removed (`EncounterCreatures`), an encounter
 * deleted (`Encounters.remove`), and its level deleted from the Library
 * (`Levels.remove`, for each encounter naming it). Each caller holds the
 * encounter `for no key update` first (`placementOf`, or `writePlacement`'s
 * and `Levels.remove`'s own read), as a fight's start does, and any lock on
 * the level after it, so the locks are taken encounter, then level, then
 * visit, on every path.
 */
export const watchPlacement = (
  sql: SqlClient.SqlClient,
  args: {
    readonly campaignId: CampaignId;
    readonly encounter: { readonly id: EncounterId; readonly name: string };
    readonly levelIds: ReadonlyArray<string | null>;
  },
): Effect.Effect<
  (changed: boolean) => Effect.Effect<SessionId | null, SqlError.SqlError>,
  SqlError.SqlError
> =>
  Effect.gen(function* () {
    const { campaignId, encounter } = args;
    const levels = [...new Set(args.levelIds.filter((level): level is string => level !== null))];
    const none = () => Effect.succeed(null);
    if (levels.length === 0) return none;
    const visits = yield* holdVisits(
      sql,
      sql`level_visit.campaign_id = ${campaignId}
          and level_visit.level_id = any(${uuidArray(levels)})`,
    );
    if (visits.length === 0) return none;
    const seen = (visitId: string) =>
      Effect.map(
        sql<{ readonly creatures: unknown }>`
          select ${seenPlacedColumn(sql)} from level_visit where level_visit.id = ${visitId}
        `,
        (rows) => JSON.stringify(rows[0]?.creatures),
      );
    const before = yield* Effect.forEach(visits, (visit) => seen(visit.id));
    const watched = yield* Effect.forEach(visits, (visit) => watchNotice(sql, visit.id));
    return (changed: boolean) =>
      Effect.gen(function* () {
        if (!changed) return null;
        let night: SessionId | null = null;
        for (const [index, visit] of visits.entries()) {
          const lines: Array<LoggedLine> = [
            {
              kind: "visit-placement-updated",
              payload: {
                encounterId: encounter.id,
                name: encounter.name,
              } satisfies typeof VisitPlacementUpdatedPayload.Encoded,
              visibility: "dm",
            },
          ];
          const shown = visit.on_table && !visit.held;
          if (shown && (yield* seen(visit.id)) !== before[index]) {
            lines.push({ kind: "visit-vision-updated", payload: {}, visibility: "shared" });
          }
          lines.push(...(yield* watched[index]!));
          night = (yield* tellTheNight(sql, campaignId, visit.id, lines)) ?? night;
        }
        return night;
      });
  });

/**
 * An encounter as a change to its placement finds it, held `for no key
 * update` until the commit beneath `gate`, a predicate over `encounter`: its
 * name, its level, and whether a visit of that level shows it placed now (a
 * spot or a trigger, and never played: `placedOnLevel`), or `null` beneath no
 * gate.
 */
export const placementOf = (sql: SqlClient.SqlClient, id: string, gate: Statement.Fragment) =>
  Effect.map(
    sql<{
      readonly id: EncounterId;
      readonly name: string;
      readonly level_id: string | null;
      readonly placed: boolean;
    }>`
      select encounter.id, encounter.name, encounter.level_id,
             (${placedOnLevel(sql)}) as placed
      from encounter
      where encounter.id = ${id} and ${gate}
      for no key update of encounter
    `,
    (rows) => rows[0] ?? null,
  );

/**
 * Replace an encounter's placement, in the caller's transaction, beneath
 * `rowWritable` over the encounter (`NotFound` for any other asker). Every
 * square is checked against the encounter's level as it is now: on its board,
 * and one a token may stand on there (`standable`, the level's own floor and
 * props), with no two creatures on one square; each spot names a line of this
 * encounter (`NotFound` otherwise) and an instance it has. A played encounter,
 * or one with no level, is a worded `Conflict`. The trigger is written
 * ascending and distinct, and an empty one as none.
 *
 * While a night is open and the campaign has a visit of the level, the
 * visit's log tells of it (`watchPlacement`). Answers the night the caller
 * rings once it has committed, or `null`.
 */
export const writePlacement = (
  sql: SqlClient.SqlClient,
  args: {
    readonly campaignId: CampaignId;
    readonly actor: Actor;
    readonly encounterId: EncounterId;
    readonly placement: PlacementWrite;
  },
): Effect.Effect<SessionId | null, NotFound | Conflict | SqlError.SqlError> =>
  Effect.gen(function* () {
    const { campaignId, actor, encounterId, placement } = args;
    const found = yield* sql<{
      readonly name: string;
      readonly level_id: string | null;
      readonly played: boolean;
    }>`
      select encounter.name, encounter.level_id,
             exists (select 1 from encounter_run
                     where encounter_run.encounter_id = encounter.id) as played
      from encounter
      where encounter.id = ${encounterId} and ${rowWritable(sql, "encounter", campaignId, actor)}
      for no key update of encounter
    `;
    const encounter = found[0];
    if (encounter === undefined) {
      return yield* new NotFound({ resource: "encounter", id: encounterId });
    }
    if (encounter.played) {
      return yield* new Conflict({
        message: "this encounter has been played: a placement is for a fight still to come",
      });
    }
    if (encounter.level_id === null) {
      return yield* new Conflict({
        message: "this encounter has no level to place it on: pick one first",
      });
    }
    // Held `for share` until the commit, as a fight's start holds it: a save
    // of the level waits, so every square is asked of one level.
    const levels = yield* sql<{
      readonly columns: number;
      readonly rows: number;
      readonly floor: ReadonlyArray<number>;
      readonly props: unknown;
    }>`
      select level.columns, level.rows, level.floor,
             coalesce((
               select json_agg(json_build_object(
                 'id', p.id, 'kind', p.kind, 'x', p.x, 'y', p.y, 'rotation', p.rotation,
                 'blocksMovement', p.blocks_movement, 'blocksSight', p.blocks_sight,
                 'cover', p.cover, 'difficult', p.difficult, 'dmOnly', p.dm_only
               ) order by p.ordinal)
               from level_prop p where p.level_id = level.id
             ), '[]'::json) as props
      from encounter
      join level on level.id = encounter.level_id and level.account_id = encounter.level_owner_id
      where encounter.id = ${encounterId} and ${levelOwned(sql, actor)}
      for share of level
    `;
    const level = levels[0];
    if (level === undefined) return yield* Effect.die("an encounter's level is not its creator's");
    const props = yield* decodeProps(level.props).pipe(Effect.orDie);
    const geometry = { columns: level.columns, rows: level.rows, floor: level.floor, props };

    const lines = yield* sql<{ readonly id: EncounterCreatureId; readonly count: number }>`
      select encounter_creature.id, encounter_creature.count from encounter_creature
      where encounter_creature.encounter_id = ${encounterId}
    `;
    const counts = new Map(lines.map((line) => [line.id, line.count] as const));
    const instances = new Set<string>();
    const squares = new Set<string>();
    for (const spot of placement.spots) {
      const count = counts.get(spot.encounterCreatureId);
      if (count === undefined) {
        return yield* new NotFound({
          resource: "encounter_creature",
          id: spot.encounterCreatureId,
        });
      }
      if (spot.ordinal < 0 || spot.ordinal >= count) {
        return yield* new Conflict({
          message: `that roster line has ${String(count)}: there is no number ${String(spot.ordinal + 1)} to place`,
        });
      }
      const instance = `${spot.encounterCreatureId}:${String(spot.ordinal)}`;
      if (instances.has(instance)) {
        return yield* new Conflict({ message: "each creature stands on one square" });
      }
      instances.add(instance);
      if (
        spot.column < 0 ||
        spot.row < 0 ||
        spot.column >= level.columns ||
        spot.row >= level.rows
      ) {
        return yield* new Conflict({ message: `${at(spot)} is off the level` });
      }
      if (!standable(geometry, spot)) {
        return yield* new Conflict({ message: `nothing can stand at ${at(spot)} on the level` });
      }
      const square = `${String(spot.column)}:${String(spot.row)}`;
      if (squares.has(square)) {
        return yield* new Conflict({
          message: `two creatures cannot stand on one square (${at(spot)})`,
        });
      }
      squares.add(square);
    }
    const area = [...new Set(placement.trigger ?? [])].sort((a, b) => a - b);
    if (area.some((square) => square < 0 || square >= level.columns * level.rows)) {
      return yield* new Conflict({ message: "the trigger area is on the level's squares" });
    }

    // The campaign's visit of the level, if it has one, and what its party
    // sees placed there before this.
    const told = yield* watchPlacement(sql, {
      campaignId,
      encounter: { id: encounterId, name: encounter.name },
      levelIds: [encounter.level_id],
    });

    yield* sql`
      delete from encounter_creature_spot
      using encounter_creature
      where encounter_creature_spot.encounter_creature_id = encounter_creature.id
        and encounter_creature.encounter_id = ${encounterId}
    `;
    if (placement.spots.length > 0) {
      yield* sql`
        insert into encounter_creature_spot ${sql.insert(
          placement.spots.map((spot) => ({
            encounter_creature_id: spot.encounterCreatureId,
            count: counts.get(spot.encounterCreatureId)!,
            ordinal: spot.ordinal,
            board_column: spot.column,
            board_row: spot.row,
          })),
        )}
      `;
    }
    yield* sql`
      update encounter_prep
      set trigger_squares = ${area.length === 0 ? null : intArray(area)}, updated_at = now()
      where encounter_prep.encounter_id = ${encounterId}
        and ${rowWritable(sql, "encounter_prep", campaignId, actor)}
    `;

    return yield* told(true);
  });
