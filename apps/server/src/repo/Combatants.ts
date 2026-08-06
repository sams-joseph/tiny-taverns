import {
  type Actor,
  type CampaignId,
  type CharacterId,
  Combatant,
  type CombatantCreate,
  type CombatantDamage,
  type CombatantId,
  type CombatantKind,
  type CombatantUpdate,
  type CreatureId,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { COMBATANT, initiativeOrder, RUN, RUNS } from "./liveTables.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import { appendEvent, requestAlreadyApplied } from "./SessionEvents.js";
import {
  containedChildReadable,
  containedChildWritable,
  containedRowWritable,
  ensureNestedParentReadable,
  ensureNestedRowReadable,
  ensureNestedRowWritable,
} from "./visibility.js";

interface CombatantRow extends ProvenanceColumns {
  readonly id: CombatantId;
  readonly encounter_run_id: EncounterRunId;
  readonly character_id: CharacterId | null;
  readonly creature_id: CreatureId | null;
  readonly display_name: string;
  readonly subtitle: string | null;
  readonly player_name: string | null;
  readonly initiative: number;
  readonly hp_current: number;
  readonly hp_max: number;
  readonly ac: number | null;
  readonly kind: CombatantKind;
  /** `text[]`; the pg driver hands these back as a real JS array. */
  readonly conditions: ReadonlyArray<string>;
}

const toCombatant = (row: CombatantRow): Combatant =>
  new Combatant({
    id: row.id,
    encounterRunId: row.encounter_run_id,
    characterId: row.character_id,
    creatureId: row.creature_id,
    displayName: row.display_name,
    subtitle: row.subtitle,
    playerName: row.player_name,
    initiative: row.initiative,
    hpCurrent: row.hp_current,
    hpMax: row.hp_max,
    ac: row.ac,
    kind: row.kind,
    conditions: row.conditions,
    ...provenanceOf(row),
  });

/**
 * The initiative list.
 *
 * Every method takes the campaign, the session *and* the run, and checks all
 * three. A run id in a path is a claim about which session it belongs to, and a
 * session id is a claim about which campaign — trusting either would let a
 * credential minted for one table reach another table's fight by naming its run
 * id, which is the same hole `PrepItems` closes for the checklist.
 */
export class Combatants extends Context.Service<
  Combatants,
  {
    readonly list: (
      campaignId: CampaignId,
      sessionId: SessionId,
      runId: EncounterRunId,
    ) => Effect.Effect<ReadonlyArray<Combatant>, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      sessionId: SessionId,
      runId: EncounterRunId,
      payload: CombatantCreate,
    ) => Effect.Effect<Combatant, NotFound, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
      patch: CombatantUpdate,
    ) => Effect.Effect<Combatant, NotFound, CurrentActor>;
    readonly damage: (
      campaignId: CampaignId,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
      payload: CombatantDamage,
    ) => Effect.Effect<Combatant, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Combatants") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      /**
       * Both claims in the path, checked together rather than one at a time.
       *
       * `ensureNestedRowWritable` binds `encounter_run.session_id` to the
       * session in the path. Asking the two questions separately — "is this
       * session writable" and "is this run writable" — is satisfied by a run in
       * a *different* session of the same campaign, which is a fight the DM did
       * not name and, once a share credential exists, one belonging to another
       * table entirely.
       */
      const ensureRunWritable = (
        campaignId: CampaignId,
        sessionId: SessionId,
        runId: EncounterRunId,
        actor: Actor,
      ) => ensureNestedRowWritable(sql, RUNS, runId, sessionId, campaignId, actor);

      const readCombatant = (
        campaignId: CampaignId,
        runId: EncounterRunId,
        id: CombatantId,
        actor: Actor,
      ): Effect.Effect<Combatant, NotFound, never> =>
        sql<CombatantRow>`
          select combatant.* from combatant
          where combatant.id = ${id}
            and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
        `.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows.length === 0
              ? new NotFound({ resource: "combatant", id })
              : Effect.succeed(toCombatant(rows[0]!)),
          ),
        );

      return {
        list: (campaignId, sessionId, runId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureNestedParentReadable(sql, RUNS, sessionId, campaignId, actor);
              yield* ensureNestedRowReadable(sql, RUNS, runId, sessionId, campaignId, actor);
              const rows = yield* sql<CombatantRow>`
                select combatant.* from combatant
                where ${containedChildReadable(sql, COMBATANT, runId, campaignId, actor)}
                ${initiativeOrder(sql)}
              `;
              return rows.map(toCombatant);
            }),
          ),

        /**
         * Add one by hand — `EncounterRunner.jsx:137`.
         *
         * No `characterId` or `creatureId`: a combatant seeded *from* something
         * is created by starting the run, and letting a client name a source it
         * did not seed from would be one more id in a payload to have to
         * contain. What this is for is the wolf the druid just summoned.
         */
        create: (campaignId, sessionId, runId, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureRunWritable(campaignId, sessionId, runId, actor);
                  const hpMax = payload.hpMax ?? 0;
                  const rows = yield* sql<CombatantRow>`
                    insert into combatant ${sql.insert(
                      defined({
                        encounter_run_id: runId,
                        display_name: payload.displayName,
                        subtitle: payload.subtitle,
                        player_name: payload.playerName,
                        kind: payload.kind,
                        initiative: payload.initiative,
                        hp_max: payload.hpMax,
                        hp_current: payload.hpCurrent ?? hpMax,
                        ac: payload.ac,
                        conditions: payload.conditions,
                        visibility: payload.visibility,
                      }),
                    )}
                    returning *
                  `;
                  const combatant = toCombatant(rows[0]!);
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "combatant-added",
                    encounterRunId: runId,
                    combatantId: combatant.id,
                    payload: { displayName: combatant.displayName, kind: combatant.kind },
                  });
                  return combatant;
                }),
              )
              .pipe(Effect.tap(() => live.touched(sessionId))),
          ),

        update: (campaignId, sessionId, runId, id, patch) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureRunWritable(campaignId, sessionId, runId, actor);
                  const columns = defined({
                    display_name: patch.displayName,
                    subtitle: patch.subtitle,
                    player_name: patch.playerName,
                    initiative: patch.initiative,
                    hp_current: patch.hpCurrent,
                    hp_max: patch.hpMax,
                    ac: patch.ac,
                    conditions: patch.conditions,
                    visibility: patch.visibility,
                  });
                  const rows = yield* sql<CombatantRow>`
                    update combatant set ${setClause(sql, columns)}
                    where combatant.id = ${id}
                      and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
                    returning *
                  `;
                  if (rows.length === 0) return yield* new NotFound({ resource: "combatant", id });
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "combatant-updated",
                    encounterRunId: runId,
                    combatantId: id,
                    payload: { ...patch },
                  });
                  return toCombatant(rows[0]!);
                }),
              )
              .pipe(Effect.tap(() => live.touched(sessionId))),
          ),

        /**
         * The `minus` button (`EncounterRunner.jsx:41`, `:103-110`).
         *
         * Three things this deliberately does **not** do, all of them because
         * the product says so rather than because they were forgotten:
         *
         * - It does not delete the combatant at zero. `:107` — "Still in
         *   initiative — remove them when you're ready." Removal is `remove`.
         * - It does not add a `Downed` condition. The prototype does (`:108`),
         *   but a condition the server invents is one the DM cannot clear
         *   without the server putting it back; "at zero hit points" is already
         *   derivable from the two numbers on the row, and `HpBar` (`:10`)
         *   colours itself from exactly that.
         * - It does not move the turn marker. A creature dropping does not end
         *   its turn.
         *
         * `greatest`/`least` in SQL rather than in TypeScript so the clamp is
         * atomic with the read: two hits landing together must total both, and
         * a read-modify-write here would lose one.
         */
        damage: (campaignId, sessionId, runId, id, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureRunWritable(campaignId, sessionId, runId, actor);

                  if (yield* requestAlreadyApplied(sql, runId, payload.requestId)) {
                    return yield* readCombatant(campaignId, runId, id, actor);
                  }

                  const rows = yield* sql<CombatantRow>`
                    update combatant
                    set hp_current = greatest(0, least(combatant.hp_max,
                                       combatant.hp_current - ${payload.amount})),
                        updated_at = now()
                    where combatant.id = ${id}
                      and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
                    returning *
                  `;
                  if (rows.length === 0) return yield* new NotFound({ resource: "combatant", id });
                  const combatant = toCombatant(rows[0]!);
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "combatant-damaged",
                    encounterRunId: runId,
                    combatantId: id,
                    payload: {
                      amount: payload.amount,
                      hpCurrent: combatant.hpCurrent,
                      hpMax: combatant.hpMax,
                    },
                    requestId: payload.requestId,
                  });
                  return combatant;
                }),
              )
              .pipe(
                // Two taps that raced past the idempotency check together. The
                // unique index refuses the second, and the honest answer is the
                // state the first one produced.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? Effect.flatMap(CurrentActor, (actor) =>
                        readCombatant(campaignId, runId, id, actor),
                      )
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          ),

        /**
         * Take someone out of the order. The only thing that ever does.
         *
         * If they were the one up, the marker moves on first. The composite
         * `encounter_run_active_combatant_fkey` would otherwise null it, which
         * is a correct database state and a bad one to hand a DM mid-fight —
         * "nobody is up" is not a turn anyone can take.
         */
        remove: (campaignId, sessionId, runId, id) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureRunWritable(campaignId, sessionId, runId, actor);

                  const order = yield* sql<{ readonly id: CombatantId }>`
                    select combatant.id from combatant
                    where ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
                    ${initiativeOrder(sql)}
                  `;
                  const runs = yield* sql<{ readonly active_combatant_id: CombatantId | null }>`
                    select encounter_run.active_combatant_id from encounter_run
                    where encounter_run.id = ${runId}
                      and ${containedRowWritable(sql, RUN, campaignId, actor)}
                  `;
                  if (runs[0]?.active_combatant_id === id) {
                    const at = order.findIndex((row) => row.id === id);
                    const remaining = order.filter((row) => row.id !== id);
                    const next =
                      remaining.length === 0 ? null : remaining[at % remaining.length]!.id;
                    yield* sql`
                      update encounter_run
                      set active_combatant_id = ${next}, updated_at = now()
                      where encounter_run.id = ${runId}
                    `;
                  }

                  const rows = yield* sql<{ readonly id: CombatantId }>`
                    delete from combatant
                    where combatant.id = ${id}
                      and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
                    returning combatant.id
                  `;
                  if (rows.length === 0) return yield* new NotFound({ resource: "combatant", id });
                  // `combatant_id` on the log is `on delete set null`, so this
                  // event is written *after* the delete and deliberately keeps
                  // the name in its payload: the log has to still say who left.
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "combatant-removed",
                    encounterRunId: runId,
                    payload: { combatantId: id },
                  });
                }),
              )
              .pipe(Effect.tap(() => live.touched(sessionId))),
          ),
      };
    }),
  );
}
