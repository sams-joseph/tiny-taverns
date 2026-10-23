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
import type { SqlClient, SqlError } from "effect/sql";
import {
  heldBy,
  type LoggedLine,
  seenPlacedColumn,
  tellTheNight,
  watchNotice,
} from "./LevelVisits.js";
import { intArray } from "./rows.js";
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
 * visit's log gains the DM's `visit-placement-updated` line and, when the
 * placed creatures the party sees there changed (the visit on the table and
 * no fight holding it), a contentless shared `visit-vision-updated` that
 * rings the players' doorbell, and the DM's `visit-encounter-noticed` when
 * the encounter's new squares are ones the party notices (`watchNotice`). Answers the night the caller rings once it
 * has committed, or `null`.
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

    // The campaign's visit of the level, if it has one, held as a visit
    // write holds it, and what its party sees placed there before this.
    const visits = yield* sql<{
      readonly id: string;
      readonly shown: boolean;
      readonly creatures: unknown;
    }>`
      select level_visit.id,
             (campaign.table_visit_id is not distinct from level_visit.id
              and not ${heldBy(sql)}) as shown,
             ${seenPlacedColumn(sql)}
      from level_visit
      join campaign on campaign.id = level_visit.campaign_id
      where level_visit.campaign_id = ${campaignId}
        and level_visit.level_id = ${encounter.level_id}
      for update of level_visit
    `;
    const before = visits.map((visit) => JSON.stringify(visit.creatures));
    const watched = yield* Effect.forEach(visits, (visit) => watchNotice(sql, visit.id));

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

    let night: SessionId | null = null;
    for (const [index, visit] of visits.entries()) {
      const after = yield* sql<{ readonly creatures: unknown }>`
        select ${seenPlacedColumn(sql)} from level_visit where level_visit.id = ${visit.id}
      `;
      const changed = JSON.stringify(after[0]?.creatures) !== before[index];
      const lines: Array<LoggedLine> = [
        {
          kind: "visit-placement-updated",
          payload: {
            encounterId,
            name: encounter.name,
          } satisfies typeof VisitPlacementUpdatedPayload.Encoded,
          visibility: "dm",
        },
      ];
      if (visit.shown && changed) {
        lines.push({ kind: "visit-vision-updated", payload: {}, visibility: "shared" });
      }
      lines.push(...(yield* watched[index]!));
      night = (yield* tellTheNight(sql, campaignId, visit.id, lines)) ?? night;
    }
    return night;
  });
