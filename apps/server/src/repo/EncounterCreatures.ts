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
import {
  type AssistantOrigin,
  assistantColumns,
  defined,
  dieOnSqlError,
  type ProvenanceColumns,
  provenanceOf,
  setClause,
} from "./rows.js";
import {
  copyableIntoCampaign,
  ensureNestedParentReadable,
  ensureNestedParentWritable,
  type NestedTable,
  nestedRowReadable,
  nestedRowWritable,
} from "./visibility.js";

/** The row, joined with the creature's display name — see `list`. */
interface EncounterCreatureRow extends ProvenanceColumns {
  readonly id: EncounterCreatureId;
  readonly encounter_id: EncounterId;
  readonly creature_id: CreatureId;
  readonly name: string;
  readonly count: number;
}

const toEncounterCreature = (row: EncounterCreatureRow): EncounterCreature =>
  new EncounterCreature({
    id: row.id,
    encounterId: row.encounter_id,
    creatureId: row.creature_id,
    name: row.name,
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
const alreadyRostered = new Conflict({
  message: "that creature is already on this encounter's roster",
});

const asConflict = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Conflict, R> =>
  Effect.catch(effect, (error): Effect.Effect<A, E | Conflict> =>
    SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
      ? Effect.fail(alreadyRostered)
      : Effect.fail(error),
  );

/**
 * The encounter roster: which creatures an encounter contains, and how many —
 * and, since the instancing decision of 2026-09-02, **the one place a campaign
 * instance of a Library creature is minted.**
 *
 * ### Point-of-use instancing
 *
 * `create` accepts any creature the actor could use in this campaign —
 * `copyableIntoCampaign`: the campaign's own internal instances, the bundle,
 * the caller's own Library, and group-shared originals. When the source is an
 * **owned original** (`campaign_id` null, `account_id` not null), the roster
 * cannot point at it directly: the roster is prep the DM built, and a Library
 * edit or delete after the fact must not rewrite or break it. So the row is
 * copied into the campaign inside the same transaction — one `insert … select`,
 * `derived_from` kept as provenance — and the roster line points at the copy.
 * The copy is plumbing: no list returns it, no endpoint edits it, and the user
 * only ever sees "the creature" on the roster. A bundled row is referenced
 * directly (it is immutable and never deleted), and a row already the
 * campaign's is used as it stands.
 *
 * Duplicate protection has to see through the instancing: adding the same
 * Library creature twice would otherwise mint a second instance with a fresh
 * id and sail past the unique index. So `create` refuses when the encounter
 * already holds the source itself *or* an instance derived from it, with the
 * same 409 the index produces for a direct repeat.
 *
 * ### Two containment checks, not one
 *
 * The *encounter* is contained by the campaign in the path, exactly as a prep
 * item's session is — `nestedRowReadable` walks the parent rather than trusting
 * the id, so naming another table's encounter is a 404 and not a cross-campaign
 * write. The *creature* is checked separately, against `copyableIntoCampaign`;
 * it cannot ride on a composite foreign key the way `note.encounter_id` does,
 * because half the rows it may legally point at are global and have no campaign
 * to name in such a key.
 */
export class EncounterCreatures extends Context.Service<
  EncounterCreatures,
  {
    readonly list: (
      campaignId: CampaignId,
      encounterId: EncounterId,
    ) => Effect.Effect<ReadonlyArray<EncounterCreature>, NotFound, CurrentActor>;
    /** `from` is the accept path's, and only its — see `Notes.create`. */
    readonly create: (
      campaignId: CampaignId,
      encounterId: EncounterId,
      payload: EncounterCreatureCreate,
      from?: AssistantOrigin,
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

      interface SourceRow {
        readonly id: CreatureId;
        readonly campaign_id: CampaignId | null;
        readonly account_id: string | null;
      }

      /**
       * The creature this roster line will be built from, or the `NotFound`
       * that names it — anything `copyableIntoCampaign` reaches, so an old
       * campaign instance a Hob proposal recorded is as valid a source as a
       * fresh Library pick.
       */
      const usableSource = (campaignId: CampaignId, creatureId: CreatureId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<SourceRow>`
            select creature.id, creature.campaign_id, creature.account_id from creature
            where creature.id = ${creatureId}
              and ${copyableIntoCampaign(sql, "creature", campaignId, actor)}
          `;
          if (rows.length === 0) {
            return yield* new NotFound({ resource: "creature", id: creatureId });
          }
          return rows[0]!;
        });

      /**
       * The instancing-aware half of the duplicate rule: a roster line already
       * pointing at this source, or at an instance derived from it, is the
       * same creature already on the roster. The unique index still backs the
       * direct case against a race; this check is what keeps "add it twice"
       * from minting a second invisible instance.
       */
      const ensureNotRostered = (encounterId: EncounterId, sourceId: CreatureId) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ readonly id: EncounterCreatureId }>`
            select encounter_creature.id from encounter_creature
            join creature on creature.id = encounter_creature.creature_id
            where encounter_creature.encounter_id = ${encounterId}
              and (creature.id = ${sourceId} or creature.derived_from = ${sourceId})
          `;
          if (rows.length > 0) return yield* Effect.fail(alreadyRostered);
        });

      /**
       * Mint the campaign's internal instance of an owned original — the whole
       * of what `derive` used to be, with no patch and no caller to see it.
       * One `insert … select` so the snapshot is exactly the source row;
       * `origin` and `visibility` fall to their column defaults, which is the
       * fail-closed answer every new row gets.
       */
      const instanceOf = (campaignId: CampaignId, sourceId: CreatureId) =>
        Effect.map(
          sql<{ readonly id: CreatureId }>`
            insert into creature (
              campaign_id, derived_from, source_corpus, source_family, source_key,
              name, size, type, subtype, alignment, cr, cr_sort, ac, hp,
              environments, damage_vulnerabilities, damage_resistances,
              damage_immunities, condition_immunities, movement_modes,
              spellcaster, legendary, body
            )
            select
              ${campaignId}, creature.id, creature.source_corpus, creature.source_family,
              creature.source_key, creature.name, creature.size, creature.type,
              creature.subtype, creature.alignment, creature.cr, creature.cr_sort,
              creature.ac, creature.hp, creature.environments,
              creature.damage_vulnerabilities, creature.damage_resistances,
              creature.damage_immunities, creature.condition_immunities,
              creature.movement_modes, creature.spellcaster, creature.legendary,
              creature.body
            from creature where creature.id = ${sourceId}
            returning creature.id
          `,
          (rows) => rows[0]!.id,
        );

      /** The read half of a roster row: joined with its creature's name. */
      const rosterRows = (clause: ReturnType<typeof sql.and>) => sql<EncounterCreatureRow>`
        select encounter_creature.*, creature.name from encounter_creature
        join creature on creature.id = encounter_creature.creature_id
        where ${clause}
        order by encounter_creature.created_at asc
      `;

      return {
        list: (campaignId, encounterId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureNestedParentReadable(sql, ROSTER, encounterId, campaignId, actor);
              const rows = yield* rosterRows(
                sql.and([nestedRowReadable(sql, ROSTER, encounterId, campaignId, actor)]),
              );
              return rows.map(toEncounterCreature);
            }),
          ),

        create: (campaignId, encounterId, payload, from) =>
          dieOnSqlError(
            asConflict(
              sql.withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureNestedParentWritable(sql, ROSTER, encounterId, campaignId, actor);
                  const source = yield* usableSource(campaignId, payload.creatureId);
                  yield* ensureNotRostered(encounterId, source.id);
                  // An owned original never lands on a roster directly — the
                  // campaign gets its own internal instance, and the roster
                  // points at that. The bundle and the campaign's own rows are
                  // referenced as they are.
                  const creatureId =
                    source.campaign_id === null && source.account_id !== null
                      ? yield* instanceOf(campaignId, source.id)
                      : source.id;
                  const rows = yield* sql<{ readonly id: EncounterCreatureId }>`
                    insert into encounter_creature ${sql.insert(
                      defined({
                        encounter_id: encounterId,
                        creature_id: creatureId,
                        count: payload.count,
                        visibility: payload.visibility,
                        ...assistantColumns(from),
                      }),
                    )}
                    returning encounter_creature.id
                  `;
                  const readBack = yield* rosterRows(
                    sql.and([sql`encounter_creature.id = ${rows[0]!.id}`]),
                  );
                  return toEncounterCreature(readBack[0]!);
                }),
              ),
            ),
          ),

        update: (campaignId, encounterId, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({ count: patch.count, visibility: patch.visibility });
              const rows = yield* sql<{ readonly id: EncounterCreatureId }>`
                update encounter_creature set ${setClause(sql, columns)}
                where encounter_creature.id = ${id}
                  and ${nestedRowWritable(sql, ROSTER, encounterId, campaignId, actor)}
                returning encounter_creature.id
              `;
              if (rows.length === 0) {
                return yield* new NotFound({ resource: "encounter_creature", id });
              }
              const readBack = yield* rosterRows(sql.and([sql`encounter_creature.id = ${id}`]));
              return toEncounterCreature(readBack[0]!);
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
