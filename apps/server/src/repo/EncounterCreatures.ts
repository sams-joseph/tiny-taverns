import {
  CampaignId,
  Conflict,
  CreatureId,
  creatureXp,
  CurrentActor,
  EncounterCreature,
  type EncounterCreatureCreate,
  EncounterCreatureId,
  type EncounterCreatureUpdate,
  EncounterId,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer, Schema, Struct } from "effect";
import { SqlClient, SqlError, SqlSchema } from "effect/unstable/sql";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import {
  type AssistantOrigin,
  assistantColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  setClause,
  timestampColumns,
} from "./rows.js";
import {
  copyableIntoCampaign,
  ensureNestedParentReadable,
  ensureNestedParentWritable,
  type NestedTable,
  nestedRowReadable,
  nestedRowWritable,
} from "./visibility.js";

/**
 * A roster line joined with its creature's name and numbers, decoded off
 * `rosterRows` by `SqlSchema`: everything but `xp`, which is computed, and the
 * stat block's own figure it is computed from (`body->'xp'`, a jsonb number
 * when the stat block says, else null).
 */
const RosterLineRow = fromColumns(
  Schema.Struct({
    ...Struct.omit(EncounterCreature.fields, ["xp"]),
    statBlockXp: Schema.NullOr(Schema.Number),
    ...timestampColumns,
  }),
);

/** The line with its XP: `creatureXp`, the rule the difficulty reads too. */
const withXp = ({ statBlockXp, ...line }: typeof RosterLineRow.Type): EncounterCreature =>
  new EncounterCreature({ ...line, xp: creatureXp({ cr: line.cr, statBlockXp }) });

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/**
 * The XP a creature's stat block states, or null when it states none — the
 * input `creatureXp` takes beside `cr`. One statement of it, because
 * `repo/Encounters.ts` reads it again for the difficulty and the roster table
 * and the band must be reading one creature the same way. `double precision`
 * because the pg driver hands `numeric` back as a string.
 */
export const statBlockXp = (sql: SqlClient.SqlClient) =>
  sql`case when jsonb_typeof(creature.body->'xp') = 'number'
        then (creature.body->>'xp')::double precision end`;

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
    /**
     * The creator's alone, so it takes the proof: a line carries its
     * creature's numbers. A player is told a shared encounter's shared lines
     * as names and counts, on `PlayerEncounter` (`Encounters.listAsPlayer`).
     */
    readonly list: (
      creator: CampaignCreatorActor,
      encounterId: EncounterId,
    ) => Effect.Effect<ReadonlyArray<EncounterCreature>, NotFound>;
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

      /**
       * The creature this roster line will be built from, or the `NotFound`
       * that names it — anything `copyableIntoCampaign` reaches, so an old
       * campaign instance a Hob proposal recorded is as valid a source as a
       * fresh Library pick.
       */
      const source = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, creatureId: CreatureId })),
        Result: fromColumns(
          Schema.Struct({
            id: CreatureId,
            campaignId: Schema.NullOr(CampaignId),
            accountId: Schema.NullOr(Schema.String),
          }),
        ),
        execute: ({ campaignId, creatureId }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select creature.id, creature.campaign_id, creature.account_id from creature
              where creature.id = ${creatureId}
                and ${copyableIntoCampaign(sql, "creature", campaignId, actor)}
            `,
          ),
      });
      const usableSource = (campaignId: CampaignId, creatureId: CreatureId) =>
        source({ campaignId, creatureId }).pipe(orNotFound("creature", creatureId));

      /**
       * The instancing-aware half of the duplicate rule: a roster line already
       * pointing at this source, or at an instance derived from it, is the
       * same creature already on the roster. The unique index still backs the
       * direct case against a race; this check is what keeps "add it twice"
       * from minting a second invisible instance.
       */
      const rostered = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ encounterId: EncounterId, sourceId: CreatureId })),
        Result: fromColumns(Schema.Struct({ id: EncounterCreatureId })),
        execute: ({ encounterId, sourceId }) => sql`
          select encounter_creature.id from encounter_creature
          join creature on creature.id = encounter_creature.creature_id
          where encounter_creature.encounter_id = ${encounterId}
            and (creature.id = ${sourceId} or creature.derived_from = ${sourceId})
        `,
      });
      const ensureNotRostered = (encounterId: EncounterId, sourceId: CreatureId) =>
        Effect.gen(function* () {
          const rows = yield* rostered({ encounterId, sourceId });
          if (rows.length > 0) return yield* Effect.fail(alreadyRostered);
        });

      /**
       * Mint the campaign's internal instance of an owned original — the whole
       * of what `derive` used to be, with no patch and no caller to see it.
       * One `insert … select` so the snapshot is exactly the source row;
       * `origin` and `visibility` fall to their column defaults, which is the
       * fail-closed answer every new row gets.
       */
      const instance = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, sourceId: CreatureId })),
        Result: fromColumns(Schema.Struct({ id: CreatureId })),
        execute: ({ campaignId, sourceId }) => sql`
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
      });
      // The source was just read under its predicate; an insert that answers
      // nothing is a defect.
      const instanceOf = (campaignId: CampaignId, sourceId: CreatureId) =>
        instance({ campaignId, sourceId }).pipe(
          Effect.map((row) => row.id),
          Effect.catchTag("NoSuchElementError", Effect.die),
        );

      /** The read half of a roster row: joined with its creature's name and numbers. */
      const rosterRows = (clause: ReturnType<typeof sql.and>) => sql`
        select encounter_creature.*, creature.name, creature.cr, creature.ac, creature.hp,
               ${statBlockXp(sql)} as stat_block_xp
        from encounter_creature
        join creature on creature.id = encounter_creature.creature_id
        where ${clause}
        order by encounter_creature.created_at asc
      `;
      const roster = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, encounterId: EncounterId })),
        Result: RosterLineRow,
        execute: ({ campaign, actor, encounterId }) =>
          rosterRows(sql.and([nestedRowReadable(sql, ROSTER, encounterId, campaign, actor)])),
      });
      /** One line just written, read back the way the roster reads it. */
      const line = SqlSchema.findOne({
        Request: Schema.toType(EncounterCreatureId),
        Result: RosterLineRow,
        execute: (id) => rosterRows(sql.and([sql`encounter_creature.id = ${id}`])),
      });
      const readBack = (id: EncounterCreatureId) =>
        line(id).pipe(Effect.map(withXp), Effect.catchTag("NoSuchElementError", Effect.die));
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: fromColumns(Schema.Struct({ id: EncounterCreatureId })),
        execute: (columns) => sql`
          insert into encounter_creature ${sql.insert(columns)}
          returning encounter_creature.id
        `,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            campaignId: CampaignId,
            encounterId: EncounterId,
            id: EncounterCreatureId,
            columns: Columns,
          }),
        ),
        Result: fromColumns(Schema.Struct({ id: EncounterCreatureId })),
        execute: ({ campaignId, encounterId, id, columns }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update encounter_creature set ${setClause(sql, columns)}
              where encounter_creature.id = ${id}
                and ${nestedRowWritable(sql, ROSTER, encounterId, campaignId, actor)}
              returning encounter_creature.id
            `,
          ),
      });
      const erase = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            campaignId: CampaignId,
            encounterId: EncounterId,
            id: EncounterCreatureId,
          }),
        ),
        Result: fromColumns(Schema.Struct({ id: EncounterCreatureId })),
        execute: ({ campaignId, encounterId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              delete from encounter_creature
              where encounter_creature.id = ${id}
                and ${nestedRowWritable(sql, ROSTER, encounterId, campaignId, actor)}
              returning encounter_creature.id
            `,
          ),
      });

      return {
        list: (creator, encounterId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const { campaign, actor } = creator;
              yield* ensureNestedParentReadable(sql, ROSTER, encounterId, campaign, actor);
              const rows = yield* roster({ ...asked(creator), encounterId });
              return rows.map(withXp);
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
                    source.campaignId === null && source.accountId !== null
                      ? yield* instanceOf(campaignId, source.id)
                      : source.id;
                  // An insert answers with its row; not getting one is a defect.
                  const written = yield* insert(
                    defined({
                      encounter_id: encounterId,
                      creature_id: creatureId,
                      count: payload.count,
                      visibility: payload.visibility,
                      ...assistantColumns(from),
                    }),
                  ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                  return yield* readBack(written.id);
                }),
              ),
            ),
          ),

        update: (campaignId, encounterId, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const columns = defined({ count: patch.count, visibility: patch.visibility });
              yield* change({ campaignId, encounterId, id, columns }).pipe(
                orNotFound("encounter_creature", id),
              );
              return yield* readBack(id);
            }),
          ),

        remove: (campaignId, encounterId, id) =>
          dieOnSqlError(
            Effect.asVoid(
              erase({ campaignId, encounterId, id }).pipe(orNotFound("encounter_creature", id)),
            ),
          ),
      };
    }),
  );
}
