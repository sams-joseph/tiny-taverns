import {
  type CampaignId,
  Conflict,
  type CreatureId,
  CurrentActor,
  EncounterCreature,
  type EncounterCreatureCreate,
  type EncounterCreatureId,
  type EncounterCreatureUpdate,
  type EncounterId,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import {
  corpusRowReadable,
  ensureNestedParentReadable,
  ensureNestedParentWritable,
  type NestedTable,
  nestedRowReadable,
  nestedRowWritable,
} from "./visibility.js";

interface EncounterCreatureRow extends ProvenanceColumns {
  readonly id: EncounterCreatureId;
  readonly encounter_id: EncounterId;
  readonly creature_id: CreatureId;
  readonly count: number;
}

const toEncounterCreature = (row: EncounterCreatureRow): EncounterCreature =>
  new EncounterCreature({
    id: row.id,
    encounterId: row.encounter_id,
    creatureId: row.creature_id,
    count: row.count,
    ...provenanceOf(row),
  });

/** `encounter_creature` hangs off `encounter`, which hangs off `campaign`. */
const ROSTER: NestedTable = {
  table: "encounter_creature",
  parent: "encounter",
  foreignKey: "encounter_id",
};

/**
 * The `(encounter_id, creature_id)` unique index, as the 409 it means.
 *
 * A repeat is a conflict rather than a silent merge into the existing row's
 * count: merging turns a double-tapped "Add" into a doubled roster with nothing
 * said, and the DM finds out by counting goblins.
 */
const asConflict = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Conflict, R> =>
  Effect.catch(effect, (error): Effect.Effect<A, E | Conflict> =>
    SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
      ? Effect.fail(
          new Conflict({ message: "that creature is already on this encounter's roster" }),
        )
      : Effect.fail(error),
  );

/**
 * The encounter roster: which creatures an encounter contains, and how many.
 *
 * Two containment checks, not one, and they guard different things.
 *
 * The *encounter* is contained by the campaign in the path, exactly as a prep
 * item's session is — `nestedRowReadable` walks the parent rather than trusting
 * the id, so naming another table's encounter is a 404 and not a cross-campaign
 * write.
 *
 * The *creature* is checked separately, against `corpusRowReadable`. It cannot
 * ride on a composite foreign key the way `note.encounter_id` does, because half
 * the rows it may legally point at are global and have no campaign to name in
 * such a key. So the same predicate that decides whether the DM may see a
 * creature at all decides whether they may put it on a roster — one rule applied
 * twice rather than a second rule that could disagree with the first.
 */
export class EncounterCreatures extends Context.Service<
  EncounterCreatures,
  {
    readonly list: (
      campaignId: CampaignId,
      encounterId: EncounterId,
    ) => Effect.Effect<ReadonlyArray<EncounterCreature>, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      encounterId: EncounterId,
      payload: EncounterCreatureCreate,
    ) => Effect.Effect<EncounterCreature, NotFound | Conflict, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      encounterId: EncounterId,
      id: EncounterCreatureId,
      patch: EncounterCreatureUpdate,
    ) => Effect.Effect<EncounterCreature, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      encounterId: EncounterId,
      id: EncounterCreatureId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("EncounterCreatures") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      /**
       * Fails with `NotFound` unless this actor can reach that creature from
       * this campaign — its own, or one from the global `system` corpus.
       *
       * The failure names the *creature*, because that is what the caller asked
       * for and could not have.
       */
      const ensureCreatureReachable = (campaignId: CampaignId, creatureId: CreatureId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<{ readonly id: CreatureId }>`
            select creature.id from creature
            where creature.id = ${creatureId}
              and ${corpusRowReadable(sql, "creature", campaignId, actor)}
          `;
          if (rows.length === 0) {
            return yield* new NotFound({ resource: "creature", id: creatureId });
          }
        });

      return {
        list: (campaignId, encounterId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureNestedParentReadable(sql, ROSTER, encounterId, campaignId, actor);
              const rows = yield* sql<EncounterCreatureRow>`
                select * from encounter_creature
                where ${nestedRowReadable(sql, ROSTER, encounterId, campaignId, actor)}
                order by encounter_creature.created_at asc
              `;
              return rows.map(toEncounterCreature);
            }),
          ),

        create: (campaignId, encounterId, payload) =>
          dieOnSqlError(
            asConflict(
              sql.withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureNestedParentWritable(sql, ROSTER, encounterId, campaignId, actor);
                  yield* ensureCreatureReachable(campaignId, payload.creatureId);
                  const rows = yield* sql<EncounterCreatureRow>`
                    insert into encounter_creature ${sql.insert(
                      defined({
                        encounter_id: encounterId,
                        creature_id: payload.creatureId,
                        count: payload.count,
                        visibility: payload.visibility,
                      }),
                    )}
                    returning *
                  `;
                  return toEncounterCreature(rows[0]!);
                }),
              ),
            ),
          ),

        update: (campaignId, encounterId, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({ count: patch.count, visibility: patch.visibility });
              const rows = yield* sql<EncounterCreatureRow>`
                update encounter_creature set ${setClause(sql, columns)}
                where encounter_creature.id = ${id}
                  and ${nestedRowWritable(sql, ROSTER, encounterId, campaignId, actor)}
                returning *
              `;
              if (rows.length === 0) {
                return yield* new NotFound({ resource: "encounter_creature", id });
              }
              return toEncounterCreature(rows[0]!);
            }),
          ),

        remove: (campaignId, encounterId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: EncounterCreatureId }>`
                delete from encounter_creature
                where encounter_creature.id = ${id}
                  and ${nestedRowWritable(sql, ROSTER, encounterId, campaignId, actor)}
                returning encounter_creature.id
              `;
              if (rows.length === 0) {
                return yield* new NotFound({ resource: "encounter_creature", id });
              }
            }),
          ),
      };
    }),
  );
}
