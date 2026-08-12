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
  type EncounterRunId,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import type { DmActor } from "./DmActor.js";
import { COMBATANT, initiativeOrder, RUN, RUNS } from "./liveTables.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import { appendEvent, requestAlreadyApplied } from "./SessionEvents.js";
import { type CharacterVitals, clampedCombatantHp, writeThroughToCharacter } from "./vitals.js";
import {
  containedChildReadable,
  containedChildWritable,
  containedRowWritable,
  ensureNestedParentReadable,
  ensureNestedRowReadable,
  ensureNestedRowWritable,
} from "./visibility.js";

export interface CombatantRow extends ProvenanceColumns {
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

export const toCombatant = (row: CombatantRow): Combatant =>
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
 *
 * **The campaign arrives as a `DmActor` rather than as an id**, because this is
 * one of the three tables whose player projection differs from its DM one: a
 * `Combatant` carries exact hit points, and a `shared` combatant would hand
 * them to a player through the ordinary predicate. See `repo/DmActor.ts` —
 * there is nothing to remember here, a method that read `CurrentActor` instead
 * would have no campaign to run its predicates against.
 */
export class Combatants extends Context.Service<
  Combatants,
  {
    readonly list: (
      dm: DmActor,
      sessionId: SessionId,
      runId: EncounterRunId,
    ) => Effect.Effect<ReadonlyArray<Combatant>, NotFound>;
    readonly create: (
      dm: DmActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      payload: CombatantCreate,
    ) => Effect.Effect<Combatant, NotFound>;
    readonly update: (
      dm: DmActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
      patch: CombatantUpdate,
    ) => Effect.Effect<Combatant, NotFound>;
    readonly damage: (
      dm: DmActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
      payload: CombatantDamage,
    ) => Effect.Effect<Combatant, NotFound>;
    readonly remove: (
      dm: DmActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
    ) => Effect.Effect<void, NotFound>;
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

      /**
       * The fight's copy, written back to the character it belongs to.
       *
       * **In the caller's transaction, always** — that is the whole property:
       * two rows hold one person's hit points and they move together or not at
       * all. A failure here rolls the combatant's own update back with it, so
       * there is no state in which the fight says 14 and the party list says
       * 26. See `repo/vitals.ts`.
       *
       * It fires only for a row seeded from a character — `character_id` is
       * null for every NPC and for the wolf the druid summoned mid-fight.
       *
       * **It appends no `character-updated` event, deliberately.** The plan
       * proposed one carrying `combatant_id` "when the write came through a
       * fight"; that case is real and it is `Characters.damage` reaching a live
       * combatant, which does append one. Here the caller has *already*
       * appended `combatant-damaged` or `combatant-updated` naming the same
       * combatant with the same number, so a second line would be one write
       * with two entries in the campaign's memory, doubling the DM's own log
       * panel for the most frequent write in the product — for a consumer that
       * does not exist yet. The doorbell rings from the caller either way, and
       * every consumer of it re-reads state rather than reading the event.
       */
      const writeThrough = (
        campaignId: CampaignId,
        actor: Actor,
        combatant: Combatant,
        vitals: CharacterVitals,
      ): Effect.Effect<void, never> =>
        combatant.characterId === null
          ? Effect.void
          : writeThroughToCharacter(sql, combatant.characterId, campaignId, actor, vitals);

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
        list: ({ actor, campaign: campaignId }, sessionId, runId) =>
          dieOnSqlError(
            Effect.gen(function* () {
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
        create: ({ actor, campaign: campaignId }, sessionId, runId, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
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

        update: ({ actor, campaign: campaignId }, sessionId, runId, id, patch) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
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
                  const combatant = toCombatant(rows[0]!);
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "combatant-updated",
                    encounterRunId: runId,
                    combatantId: id,
                    payload: { ...patch },
                  });
                  // Only what the patch actually named. A PATCH that renamed a
                  // combatant must not write the fight's hit points back over a
                  // character somebody healed from the party list a moment ago.
                  yield* writeThrough(campaignId, actor, combatant, {
                    hpCurrent: patch.hpCurrent === undefined ? undefined : combatant.hpCurrent,
                    conditions: patch.conditions === undefined ? undefined : combatant.conditions,
                  });
                  return combatant;
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
        damage: ({ actor, campaign: campaignId }, sessionId, runId, id, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureRunWritable(campaignId, sessionId, runId, actor);

                  if (yield* requestAlreadyApplied(sql, runId, payload.requestId)) {
                    return yield* readCombatant(campaignId, runId, id, actor);
                  }

                  const rows = yield* sql<CombatantRow>`
                    update combatant
                    set hp_current = ${clampedCombatantHp(sql, payload.amount)},
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
                  yield* writeThrough(campaignId, actor, combatant, {
                    hpCurrent: combatant.hpCurrent,
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
                    ? readCombatant(campaignId, runId, id, actor)
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
        remove: ({ actor, campaign: campaignId }, sessionId, runId, id) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
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
