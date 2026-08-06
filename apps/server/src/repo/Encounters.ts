import {
  type CampaignId,
  CurrentActor,
  type Difficulty,
  Encounter,
  type EncounterCreate,
  type EncounterId,
  type EncounterUpdate,
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

interface EncounterRow extends ProvenanceColumns {
  readonly id: EncounterId;
  readonly campaign_id: CampaignId;
  readonly name: string;
  readonly difficulty: Difficulty | null;
  /** `text[]`; the pg driver hands these back as a real JS array. */
  readonly tags: ReadonlyArray<string>;
}

const toEncounter = (row: EncounterRow): Encounter =>
  new Encounter({
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    difficulty: row.difficulty,
    tags: row.tags,
    ...provenanceOf(row),
  });

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
    readonly list: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<Encounter>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      id: EncounterId,
    ) => Effect.Effect<Encounter, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      payload: EncounterCreate,
    ) => Effect.Effect<Encounter, NotFound, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      id: EncounterId,
      patch: EncounterUpdate,
    ) => Effect.Effect<Encounter, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      id: EncounterId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Encounters") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* sql<EncounterRow>`
                select * from encounter
                where ${rowReadable(sql, "encounter", campaignId, actor)}
                order by encounter.created_at asc
              `;
              return rows.map(toEncounter);
            }),
          ),

        findById: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<EncounterRow>`
                select * from encounter
                where encounter.id = ${id}
                  and ${rowReadable(sql, "encounter", campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "encounter", id });
              return toEncounter(rows[0]!);
            }),
          ),

        create: (campaignId, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                const rows = yield* sql<EncounterRow>`
                  insert into encounter ${sql.insert(
                    defined({
                      campaign_id: campaignId,
                      name: payload.name,
                      difficulty: payload.difficulty,
                      tags: payload.tags,
                      visibility: payload.visibility,
                    }),
                  )}
                  returning *
                `;
                return toEncounter(rows[0]!);
              }),
            ),
          ),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({
                name: patch.name,
                difficulty: patch.difficulty,
                tags: patch.tags,
                visibility: patch.visibility,
              });
              const rows = yield* sql<EncounterRow>`
                update encounter set ${setClause(sql, columns)}
                where encounter.id = ${id}
                  and ${rowWritable(sql, "encounter", campaignId, actor)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "encounter", id });
              return toEncounter(rows[0]!);
            }),
          ),

        // Notes attached to this encounter are detached, not deleted — the
        // `on delete set null (encounter_id)` on `note_encounter_fkey` does it.
        // The DM wrote that read-aloud; losing the encounter should not lose it.
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
      };
    }),
  );
}
