import {
  Actor,
  CampaignId,
  type CharacterId,
  Combatant,
  type CombatantCreate,
  type CombatantDamage,
  type CombatantDeathSaveRoll,
  type CombatantDeathSaves,
  CombatantId,
  type CombatantMove,
  CombatantPosition,
  type CombatantTurn,
  type CombatantUpdate,
  concentrationDc,
  Conflict,
  deathSaveRolled,
  type DeathSaves,
  type DiagonalRule,
  EncounterRunId,
  feetBetween,
  type InitiativeSet,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlError, SqlSchema, type Statement } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import {
  type PortraitSigner,
  portraitFromId,
  portraitSigner,
  seatedPortraitColumn,
} from "./Characters.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { COMBATANT, freshTurn, initiativeOrder, RUN, RUNS, tokenShown } from "./liveTables.js";
import {
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  setClause,
  textArray,
  timestampColumns,
} from "./rows.js";
import { appendEvent, requestAlreadyApplied } from "./SessionEvents.js";
import {
  type CharacterVitals,
  clampedCombatantHp,
  combatantConditionsAfterDelta,
  combatantConditionsAfterSet,
  combatantDeathSavesAfterDelta,
  combatantDeathSavesAfterSet,
  type ConditionsChange,
  conditionsChange,
  conditionsMoved,
  writeThroughToCharacter,
} from "./vitals.js";
import {
  containedChildReadable,
  containedChildWritable,
  containedRowWritable,
  ensureNestedParentReadable,
  ensureNestedRowReadable,
  ensureNestedRowWritable,
} from "./visibility.js";

/**
 * The combatant's own columns, its square as one value (`position`, null while
 * the token is off the board — `0064_combatant_positions.ts`), its death saves
 * as one value (`death_saves`, null for an NPC, which makes none —
 * `0085_death_saves.ts`), and its character's portrait id, gated by the seat
 * (`seatedPortraitColumn`). **Every read that becomes a `Combatant` names
 * this** — {@link combatantRow} requires `position`, `death_saves` and
 * `portrait_id`, as `characterRow` requires `portraitColumns`, so a path that
 * forgot fails a test rather than dropping the picture.
 */
export const combatantColumns = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment => sql`
  combatant.*,
  case when combatant.board_column is not null and combatant.board_row is not null
    then jsonb_build_object('column', combatant.board_column, 'row', combatant.board_row)
  end as position,
  case when combatant.kind = 'pc'
    then jsonb_build_object('successes', combatant.death_save_successes,
                            'failures', combatant.death_save_failures)
  end as death_saves,
  ${seatedPortraitColumn(sql, sql("combatant.character_id"), campaignId, actor)}
`;

const combatantFields = (sign: PortraitSigner | undefined) =>
  ({ ...Combatant.fields, ...timestampColumns, portrait: portraitFromId(sign) }) as const;

/**
 * A `combatant` row as the wire reads it, decoded off {@link combatantColumns}
 * by `SqlSchema`, its portrait signed with the reading repository's signer.
 * `repo/Recap.ts` reads a night's fights through it too.
 */
export const combatantRow = (sign: PortraitSigner | undefined) =>
  classFromColumns(Combatant, combatantFields(sign), { portrait: "portrait_id" });

/** What every read of one fight's list is asked with: the proof's campaign and actor, and the run. */
const inFight = { campaignId: CampaignId, actor: Actor, runId: EncounterRunId } as const;

/** The written columns of an insert or a PATCH, as the method builds them. */
const Columns = Schema.Record(Schema.String, Schema.Unknown);

/**
 * The initiative list.
 *
 * Every method takes the campaign, the session *and* the run, and checks all
 * three. A run id in a path is a claim about which session it belongs to, and a
 * session id is a claim about which campaign — trusting either would let a
 * credential minted for one table reach another table's fight by naming its run
 * id, which is the same hole `PrepItems` closes for the checklist.
 *
 * **The campaign arrives as a `CampaignCreatorActor` rather than as an id**, because this is
 * one of the three tables whose player projection differs from its DM one: a
 * `Combatant` carries exact hit points, and a `shared` combatant would hand
 * them to a player through the ordinary predicate. See `repo/CampaignCreatorActor.ts` —
 * there is nothing to remember here, a method that read `CurrentActor` instead
 * would have no campaign to run its predicates against.
 */
export class Combatants extends Context.Service<
  Combatants,
  {
    readonly list: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
    ) => Effect.Effect<ReadonlyArray<Combatant>, NotFound>;
    readonly create: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      payload: CombatantCreate,
    ) => Effect.Effect<Combatant, NotFound>;
    readonly update: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
      patch: CombatantUpdate,
    ) => Effect.Effect<Combatant, NotFound>;
    readonly damage: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
      payload: CombatantDamage,
    ) => Effect.Effect<Combatant, NotFound>;
    readonly setDeathSaves: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
      payload: CombatantDeathSaves,
    ) => Effect.Effect<Combatant, NotFound | Conflict>;
    readonly rollDeathSave: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
      payload: CombatantDeathSaveRoll,
    ) => Effect.Effect<Combatant, NotFound | Conflict>;
    readonly move: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
      payload: CombatantMove,
    ) => Effect.Effect<Combatant, NotFound | Conflict>;
    readonly turn: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
      payload: CombatantTurn,
    ) => Effect.Effect<Combatant, NotFound>;
    readonly setInitiative: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      payload: InitiativeSet,
    ) => Effect.Effect<ReadonlyArray<Combatant>, NotFound>;
    readonly remove: (
      dm: CampaignCreatorActor,
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
      // A combatant row is not a character read, but its portrait is one: the
      // seat gate in `combatantColumns` is what lets the id reach the signer.
      const sign = yield* portraitSigner;
      const CombatantRow = combatantRow(sign);
      /**
       * A moved combatant, and whether its token is on a player's board — what
       * the move's log line is shared under.
       */
      const MovedRow = fromColumns(
        Schema.Struct({ ...combatantFields(sign), tokenShown: Schema.Boolean }),
        { portrait: "portrait_id" },
      );
      /** A damaged or healed combatant, and what it held before the hit. */
      const HitRow = fromColumns(
        Schema.Struct({
          ...combatantFields(sign),
          hpBefore: Schema.Int,
          wasConcentrating: Schema.Boolean,
          conditionsBefore: Schema.Array(Schema.String),
        }),
        { portrait: "portrait_id" },
      );

      /** One combatant of this fight, through the writer's predicate. */
      const one = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...inFight, id: CombatantId })),
        Result: CombatantRow,
        execute: ({ campaignId, actor, runId, id }) => sql`
          select ${combatantColumns(sql, campaignId, actor)} from combatant
          where combatant.id = ${id}
            and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
        `,
      });
      /** The whole list as the DM has it, in order. */
      const order = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(inFight)),
        Result: CombatantRow,
        execute: ({ campaignId, actor, runId }) => sql`
          select ${combatantColumns(sql, campaignId, actor)} from combatant
          where ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
          ${initiativeOrder(sql)}
        `,
      });
      /** The list through the reader's predicate, in order. */
      const readable = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(inFight)),
        Result: CombatantRow,
        execute: ({ campaignId, actor, runId }) => sql`
          select ${combatantColumns(sql, campaignId, actor)} from combatant
          where ${containedChildReadable(sql, COMBATANT, runId, campaignId, actor)}
          ${initiativeOrder(sql)}
        `,
      });
      /** A new combatant. What reaches its fight was checked by the method. */
      const insert = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...inFight, columns: Columns })),
        Result: CombatantRow,
        execute: ({ campaignId, actor, columns }) => sql`
          insert into combatant ${sql.insert(columns)}
          returning ${combatantColumns(sql, campaignId, actor)}
        `,
      });
      const edit = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...inFight, id: CombatantId, columns: Columns })),
        Result: CombatantRow,
        execute: ({ campaignId, actor, runId, id, columns }) => sql`
          update combatant set ${setClause(sql, columns)}
          where combatant.id = ${id}
            and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
          returning ${combatantColumns(sql, campaignId, actor)}
        `,
      });
      /**
       * Hit points moved by a delta, clamped in the statement that moves them,
       * with what the row held before: the clamp throws the old number away,
       * and the log line wants "31 → 19". `old` is Postgres 18's pre-update
       * row, so the before and the after are one statement's two halves rather
       * than a read another hit could land between. The death saves and the
       * zero-hit-point conditions move in the same statement (`vitals.ts`).
       */
      const hit = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            ...inFight,
            id: CombatantId,
            amount: Schema.Int,
            critical: Schema.Boolean,
          }),
        ),
        Result: HitRow,
        execute: ({ campaignId, actor, runId, id, amount, critical }) => sql`
          update combatant
          set hp_current = ${clampedCombatantHp(sql, amount)},
              ${combatantDeathSavesAfterDelta(sql, amount, critical)},
              conditions = ${combatantConditionsAfterDelta(sql, amount)},
              updated_at = now()
          where combatant.id = ${id}
            and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
          returning ${combatantColumns(sql, campaignId, actor)},
            old.hp_current as hp_before,
            'Concentrating' = any(old.conditions) as was_concentrating,
            old.conditions as conditions_before
        `,
      });
      /** A token to its square, and the feet it walked onto this turn's count. */
      const place = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            ...inFight,
            id: CombatantId,
            to: Schema.NullOr(CombatantPosition),
            feet: Schema.Int,
          }),
        ),
        Result: MovedRow,
        execute: ({ campaignId, actor, runId, id, to, feet }) => sql`
          update combatant
          set board_column = ${to?.column ?? null},
              board_row = ${to?.row ?? null},
              feet_moved = combatant.feet_moved + ${feet},
              updated_at = now()
          where combatant.id = ${id}
            and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
          returning ${combatantColumns(sql, campaignId, actor)},
            (select ${tokenShown(sql)} from encounter_run
              where encounter_run.id = combatant.encounter_run_id) as token_shown
        `,
      });

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
      ) => one({ campaignId, actor, runId, id }).pipe(orNotFound("combatant", id));

      const readOrder = (campaignId: CampaignId, runId: EncounterRunId, actor: Actor) =>
        order({ campaignId, actor, runId });

      /**
       * The row a death save is about, locked for the rest of the transaction,
       * so a roll reads the counts it adds to. An NPC makes no death saves:
       * it is in the fight and the DM can see it, so that is a `Conflict`
       * rather than a `NotFound`.
       */
      const lockedSaver = (
        campaignId: CampaignId,
        runId: EncounterRunId,
        id: CombatantId,
        actor: Actor,
      ) =>
        Effect.gen(function* () {
          const rows = yield* sql<{
            readonly kind: "pc" | "npc";
            readonly hp_current: number;
            readonly death_save_successes: number;
            readonly death_save_failures: number;
          }>`
            select combatant.kind, combatant.hp_current,
                   combatant.death_save_successes, combatant.death_save_failures
            from combatant
            where combatant.id = ${id}
              and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
            for update
          `;
          const row = rows[0];
          if (row === undefined) return yield* new NotFound({ resource: "combatant", id });
          if (row.kind !== "pc") {
            return yield* new Conflict({ message: "a monster makes no death saves" });
          }
          return {
            hpCurrent: row.hp_current,
            saves: {
              successes: row.death_save_successes,
              failures: row.death_save_failures,
            } satisfies DeathSaves,
          };
        });

      /**
       * Write a PC's death saves (and, for a natural 20, its one hit point),
       * log them, and copy both to the character, in the caller's transaction.
       */
      const writeDeathSaves = (
        campaignId: CampaignId,
        sessionId: SessionId,
        runId: EncounterRunId,
        id: CombatantId,
        actor: Actor,
        saves: DeathSaves,
        detail: { readonly face?: number; readonly revived?: boolean },
        requestId: string | undefined,
      ) =>
        Effect.gen(function* () {
          const revived = detail.revived === true;
          const combatant = yield* edit({
            campaignId,
            actor,
            runId,
            id,
            columns: {
              death_save_successes: saves.successes,
              death_save_failures: saves.failures,
            },
          }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
          // A natural 20 is healing from zero, so it wakes the PC as well.
          const { written, woke } = revived
            ? yield* hit({ campaignId, actor, runId, id, amount: -1, critical: false }).pipe(
                Effect.map(({ hpBefore: _b, wasConcentrating: _w, conditionsBefore, ...rest }) => {
                  const written = new Combatant(rest, { disableChecks: true });
                  return { written, woke: conditionsChange(conditionsBefore, written.conditions) };
                }),
                Effect.catchTag("NoSuchElementError", Effect.die),
              )
            : { written: combatant, woke: {} };
          yield* appendEvent(sql, {
            sessionId,
            kind: "death-save",
            encounterRunId: runId,
            combatantId: id,
            characterId: written.characterId ?? undefined,
            payload: {
              ...(detail.face === undefined ? {} : { face: detail.face }),
              ...saves,
              hpCurrent: written.hpCurrent,
              ...woke,
            },
            requestId,
            visibility: written.visibility,
          });
          yield* writeThrough(campaignId, actor, written, {
            hpCurrent: revived ? written.hpCurrent : undefined,
            conditions: conditionsMoved(woke) ? written.conditions : undefined,
            deathSaves: saves,
          });
          return written;
        });

      return {
        list: ({ actor, campaign: campaignId }, sessionId, runId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureNestedParentReadable(sql, RUNS, sessionId, campaignId, actor);
              yield* ensureNestedRowReadable(sql, RUNS, runId, sessionId, campaignId, actor);
              return yield* readable({ campaignId, actor, runId });
            }),
          ),

        /**
         * Several numbers in one write — *Roll for monsters*, or the totals the
         * table called out.
         *
         * All or nothing: a combatant id that is not in this fight is a 404 and
         * rolls every other line back, so a roll never lands half. The number
         * is the DM's (`initiative_set_by = 'dm'`) whoever entered it before,
         * which is what lets the DM overwrite what a player typed.
         *
         * One log line for the lot, shared only when the fight is and at least
         * one row it names is — a roll for hidden monsters alone rings no
         * player's doorbell.
         */
        setInitiative: ({ actor, campaign: campaignId }, sessionId, runId, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureRunWritable(campaignId, sessionId, runId, actor);
                  if (yield* requestAlreadyApplied(sql, runId, payload.requestId)) {
                    return yield* readOrder(campaignId, runId, actor);
                  }

                  let shared = false;
                  for (const entry of payload.entries) {
                    const rows = yield* sql<{ readonly visibility: "dm" | "shared" }>`
                      update combatant
                      set initiative = ${entry.initiative},
                          initiative_set_by = ${entry.initiative === null ? null : "dm"},
                          updated_at = now()
                      where combatant.id = ${entry.combatantId}
                        and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
                      returning combatant.visibility
                    `;
                    const row = rows[0];
                    if (row === undefined) {
                      return yield* new NotFound({ resource: "combatant", id: entry.combatantId });
                    }
                    shared = shared || row.visibility === "shared";
                  }

                  const runs = yield* sql<{ readonly visibility: "dm" | "shared" }>`
                    select encounter_run.visibility from encounter_run
                    where encounter_run.id = ${runId}
                  `;
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "run-updated",
                    encounterRunId: runId,
                    payload: { initiative: payload.entries },
                    requestId: payload.requestId,
                    visibility: shared && runs[0]?.visibility === "shared" ? "shared" : "dm",
                  });
                  return yield* readOrder(campaignId, runId, actor);
                }),
              )
              .pipe(
                // Two submits that raced past the idempotency check: the
                // unique index refuses the second, and the answer is the list
                // the first one produced.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? readOrder(campaignId, runId, actor)
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
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
                  // An insert answers with its row; not getting one is a defect.
                  const combatant = yield* insert({
                    campaignId,
                    actor,
                    runId,
                    columns: defined({
                      encounter_run_id: runId,
                      display_name: payload.displayName,
                      subtitle: payload.subtitle,
                      player_name: payload.playerName,
                      kind: payload.kind,
                      initiative: payload.initiative,
                      initiative_set_by: payload.initiative === undefined ? undefined : "dm",
                      initiative_bonus: payload.initiativeBonus,
                      hp_max: payload.hpMax,
                      hp_current: payload.hpCurrent ?? hpMax,
                      ac: payload.ac,
                      conditions: textArray(payload.conditions),
                      visibility: payload.visibility,
                    }),
                  }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "combatant-added",
                    encounterRunId: runId,
                    combatantId: combatant.id,
                    characterId: combatant.characterId ?? undefined,
                    payload: { displayName: combatant.displayName, kind: combatant.kind },
                    visibility: combatant.visibility,
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
                  // A total typed over zero is healing from zero, which clears
                  // the death saves and wakes a PC; a total of zero is the drop
                  // (`vitals.ts`). Read against the number before this write,
                  // so it runs first, and the row stays locked for the edit
                  // below. A patch that names its own conditions is the DM's
                  // list, and the rule leaves it alone.
                  let crossed: ConditionsChange = {};
                  if (patch.hpCurrent !== undefined) {
                    const rows = yield* sql<{
                      readonly conditions: ReadonlyArray<string>;
                      readonly conditions_before: ReadonlyArray<string>;
                    }>`
                      update combatant
                      set ${combatantDeathSavesAfterSet(sql, patch.hpCurrent)}
                        ${
                          patch.conditions === undefined
                            ? sql`, conditions = ${combatantConditionsAfterSet(sql, patch.hpCurrent)}`
                            : sql``
                        }
                      where combatant.id = ${id}
                        and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
                      returning combatant.conditions, old.conditions as conditions_before
                    `;
                    const row = rows[0];
                    if (row !== undefined) {
                      crossed = conditionsChange(row.conditions_before, row.conditions);
                    }
                  }
                  const columns = defined({
                    display_name: patch.displayName,
                    subtitle: patch.subtitle,
                    player_name: patch.playerName,
                    initiative: patch.initiative,
                    initiative_set_by: patch.initiative === undefined ? undefined : "dm",
                    initiative_bonus: patch.initiativeBonus,
                    hp_current: patch.hpCurrent,
                    hp_max: patch.hpMax,
                    ac: patch.ac,
                    conditions: textArray(patch.conditions),
                    visibility: patch.visibility,
                  });
                  const combatant = yield* edit({ campaignId, actor, runId, id, columns }).pipe(
                    orNotFound("combatant", id),
                  );
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "combatant-updated",
                    encounterRunId: runId,
                    combatantId: id,
                    characterId: combatant.characterId ?? undefined,
                    payload: { ...patch, ...crossed },
                    visibility: combatant.visibility,
                  });
                  // Only what the patch actually named, or moved. A PATCH that
                  // renamed a combatant must not write the fight's hit points
                  // back over a character somebody healed from the party list a
                  // moment ago.
                  yield* writeThrough(campaignId, actor, combatant, {
                    hpCurrent: patch.hpCurrent === undefined ? undefined : combatant.hpCurrent,
                    conditions:
                      patch.conditions === undefined && !conditionsMoved(crossed)
                        ? undefined
                        : combatant.conditions,
                    deathSaves:
                      patch.hpCurrent === undefined
                        ? undefined
                        : (combatant.deathSaves ?? undefined),
                  });
                  return combatant;
                }),
              )
              .pipe(Effect.tap(() => live.touched(sessionId))),
          ),

        /**
         * The `minus` button (`EncounterRunner.jsx:41`, `:103-110`).
         *
         * Two things this deliberately does **not** do, both because the
         * product says so rather than because they were forgotten:
         *
         * - It does not delete the combatant at zero. `:107` — "Still in
         *   initiative — remove them when you're ready." Removal is `remove`.
         * - It does not move the turn marker. A creature dropping does not end
         *   its turn.
         *
         * What it does move beside the number, by the rules in `vitals.ts`, is
         * written through to the character with the hit points:
         *
         * - A player character's death saves: a hit on a PC already at zero is
         *   a failure (two when `critical`), and healing one off zero clears
         *   both.
         * - The conditions zero brings. Dropping to zero ends `Concentrating`,
         *   and a PC falls `Unconscious`; a PC healed off zero wakes. Only the
         *   crossing writes, so the DM can toggle either back and the next hit
         *   at zero leaves the toggle alone. A monster gets no `Unconscious`
         *   (nor the prototype's `Downed`, `:108`): at zero it is out, which the
         *   number already says and `HpBar` (`:10`) draws.
         *
         * What it adds to the log line, for the DM's dock: the hit points
         * before the hit, which the clamp would otherwise lose; the
         * Constitution save's DC when a row holding `Concentrating` took damage
         * and is still standing, a note rather than a ruling, so the condition
         * stays until the DM clears it, whatever the die says; and the
         * conditions the hit added and removed.
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

                  const critical = payload.critical === true;
                  const { hpBefore, wasConcentrating, conditionsBefore, ...hurt } = yield* hit({
                    campaignId,
                    actor,
                    runId,
                    id,
                    amount: payload.amount,
                    critical,
                  }).pipe(orNotFound("combatant", id));
                  const combatant = new Combatant(hurt, { disableChecks: true });
                  // The save is owed only by a creature that was holding a
                  // spell, took damage, and is still up to make it.
                  const owesSave =
                    wasConcentrating && payload.amount > 0 && combatant.hpCurrent > 0;
                  const crossed = conditionsChange(conditionsBefore, combatant.conditions);
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "combatant-damaged",
                    encounterRunId: runId,
                    combatantId: id,
                    characterId: combatant.characterId ?? undefined,
                    payload: {
                      amount: payload.amount,
                      hpBefore,
                      hpCurrent: combatant.hpCurrent,
                      hpMax: combatant.hpMax,
                      ...(owesSave ? { concentrationDc: concentrationDc(payload.amount) } : {}),
                      ...(critical ? { critical } : {}),
                      ...(combatant.deathSaves === null
                        ? {}
                        : { deathSaves: combatant.deathSaves }),
                      ...crossed,
                    },
                    requestId: payload.requestId,
                    visibility: combatant.visibility,
                  });
                  yield* writeThrough(campaignId, actor, combatant, {
                    hpCurrent: combatant.hpCurrent,
                    conditions: conditionsMoved(crossed) ? combatant.conditions : undefined,
                    deathSaves: combatant.deathSaves ?? undefined,
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
         * The DM's dots: a player character's death saves, set as they are
         * pressed. Absolute, so a repeat is harmless, and it carries a
         * `requestId` all the same so a repeat is not a second log line.
         */
        setDeathSaves: ({ actor, campaign: campaignId }, sessionId, runId, id, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureRunWritable(campaignId, sessionId, runId, actor);
                  if (yield* requestAlreadyApplied(sql, runId, payload.requestId)) {
                    return yield* readCombatant(campaignId, runId, id, actor);
                  }
                  yield* lockedSaver(campaignId, runId, id, actor);
                  return yield* writeDeathSaves(
                    campaignId,
                    sessionId,
                    runId,
                    id,
                    actor,
                    { successes: payload.successes, failures: payload.failures },
                    {},
                    payload.requestId,
                  );
                }),
              )
              .pipe(
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? readCombatant(campaignId, runId, id, actor)
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          ),

        /**
         * A death save the DM rolled. The browser rolled the face; the rule is
         * `deathSaveRolled`, applied here to the counts the row holds, under
         * its lock. A natural 20 is one hit point and both counts cleared.
         *
         * Only a creature that is dying rolls: a PC at zero with fewer than
         * three of either. Anything else is a `Conflict` the DM can read —
         * stable and dead are both states the row already shows.
         */
        rollDeathSave: ({ actor, campaign: campaignId }, sessionId, runId, id, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureRunWritable(campaignId, sessionId, runId, actor);
                  if (yield* requestAlreadyApplied(sql, runId, payload.requestId)) {
                    return yield* readCombatant(campaignId, runId, id, actor);
                  }
                  const saver = yield* lockedSaver(campaignId, runId, id, actor);
                  if (saver.hpCurrent > 0) {
                    return yield* new Conflict({
                      message: "only a character at 0 hit points makes death saves",
                    });
                  }
                  if (saver.saves.successes >= 3) {
                    return yield* new Conflict({ message: "they are stable already" });
                  }
                  if (saver.saves.failures >= 3) {
                    return yield* new Conflict({ message: "they are dead" });
                  }
                  const rolled = deathSaveRolled(saver.saves, payload.face);
                  return yield* writeDeathSaves(
                    campaignId,
                    sessionId,
                    runId,
                    id,
                    actor,
                    rolled.saves,
                    { face: payload.face, revived: rolled.revived },
                    payload.requestId,
                  );
                }),
              )
              .pipe(
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? readCombatant(campaignId, runId, id, actor)
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          ),

        /**
         * Put a token on a square, move it, or take it off the board.
         *
         * The square is checked against **the fight's own board**
         * (`encounter_run_board`), the grid the fight was started on, which
         * nothing resizes afterwards — so a position once accepted stays on
         * the board. A fight with no board has nowhere to put a token, and a
         * square past its edge is not a square; both are a `Conflict`. Taking
         * a token off needs no board.
         *
         * No rule refuses a distance or a turn: the DM moves whoever they
         * like, wherever they like, whenever they like, as they would a
         * miniature. Two tokens may share a square for the same reason.
         *
         * **A move by whoever is up is counted.** While the fight is taking
         * turns and this combatant holds the marker, the squares from where
         * it stood to where it lands, at the board's feet per square under the
         * campaign's diagonal rule (`feetBetween`, the one measure the board
         * draws with), are added to its `feet_moved`. Putting a token down or
         * taking it off walks nowhere, and nothing counts for anyone else or
         * while initiative is being rolled. Going over its speed is not
         * refused; the runner says so.
         *
         * The log line is shared only while a player's board shows this
         * token: the fight and the combatant are both shared, the map is
         * shown, and it is not a monster while hostile tokens are hidden
         * (`liveTables.ts`'s `tokenShown`, which the player's table selects
         * positions under). So a move no player can see leaves no shared line.
         * It carries `from` and `to` for the DM's own log.
         */
        move: ({ actor, campaign: campaignId }, sessionId, runId, id, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureRunWritable(campaignId, sessionId, runId, actor);

                  if (yield* requestAlreadyApplied(sql, runId, payload.requestId)) {
                    return yield* readCombatant(campaignId, runId, id, actor);
                  }

                  // The fight as this move finds it: who is up, its board, and
                  // the table's diagonal rule. The run is held `for share` so
                  // the marker cannot move under the count; `nextTurn` waits.
                  const fights = yield* sql<{
                    readonly phase: "initiative" | "turns";
                    readonly active_combatant_id: CombatantId | null;
                    readonly diagonal_rule: DiagonalRule;
                    readonly board_columns: number | null;
                    readonly board_rows: number | null;
                    readonly feet_per_cell: number | null;
                  }>`
                    select encounter_run.phase, encounter_run.active_combatant_id,
                           campaign.diagonal_rule, encounter_run_board.board_columns,
                           encounter_run_board.board_rows, encounter_run_board.feet_per_cell
                    from encounter_run
                    join session on session.id = encounter_run.session_id
                    join campaign on campaign.id = session.campaign_id
                    left join encounter_run_board on encounter_run_board.run_id = encounter_run.id
                    where encounter_run.id = ${runId}
                    for share of encounter_run
                  `;
                  // Proved writable above, in this transaction.
                  const fight = fights[0]!;

                  const to = payload.position;
                  if (to !== null) {
                    if (fight.board_columns === null || fight.board_rows === null) {
                      return yield* new Conflict({ message: "this fight has no board" });
                    }
                    if (to.column >= fight.board_columns || to.row >= fight.board_rows) {
                      return yield* new Conflict({ message: "that square is off the board" });
                    }
                  }

                  // Where it stood, locked for the rest of this transaction, so
                  // the log's `from` is the square this move actually left.
                  const before = yield* sql<{
                    readonly board_column: number | null;
                    readonly board_row: number | null;
                  }>`
                    select combatant.board_column, combatant.board_row from combatant
                    where combatant.id = ${id}
                      and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
                    for update
                  `;
                  const from = before[0];
                  if (from === undefined) return yield* new NotFound({ resource: "combatant", id });

                  const feet =
                    to !== null &&
                    from.board_column !== null &&
                    from.board_row !== null &&
                    fight.feet_per_cell !== null &&
                    fight.phase === "turns" &&
                    fight.active_combatant_id === id
                      ? feetBetween({ column: from.board_column, row: from.board_row }, to, {
                          feetPerCell: fight.feet_per_cell,
                          diagonals: fight.diagonal_rule,
                        })
                      : 0;

                  const { tokenShown: shown, ...moved } = yield* place({
                    campaignId,
                    actor,
                    runId,
                    id,
                    to,
                    feet,
                  }).pipe(orNotFound("combatant", id));
                  const combatant = new Combatant(moved, { disableChecks: true });
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "combatant-moved",
                    encounterRunId: runId,
                    combatantId: id,
                    payload: {
                      from:
                        from.board_column === null || from.board_row === null
                          ? null
                          : { column: from.board_column, row: from.board_row },
                      to,
                    },
                    requestId: payload.requestId,
                    visibility: combatant.visibility === "shared" && shown ? "shared" : "dm",
                  });
                  return combatant;
                }),
              )
              .pipe(
                // Two sends of one move that raced past the idempotency check;
                // the unique index refuses the second, as for `damage`.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? readCombatant(campaignId, runId, id, actor)
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          ),

        /**
         * The DM's ticks on this turn's spending (`CombatantTurn`).
         *
         * Only what the payload names is written, and each is an absolute
         * value, so a repeat lands where the first did; the `requestId` keeps
         * the log to one line. The line is `dm` whatever the row's
         * visibility: a turn's spending is the creator's alone, so no player
         * doorbell rings for it.
         */
        turn: ({ actor, campaign: campaignId }, sessionId, runId, id, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureRunWritable(campaignId, sessionId, runId, actor);

                  if (yield* requestAlreadyApplied(sql, runId, payload.requestId)) {
                    return yield* readCombatant(campaignId, runId, id, actor);
                  }

                  const { requestId, ...ticks } = payload;
                  const columns = defined({
                    action_used: ticks.actionUsed,
                    bonus_used: ticks.bonusUsed,
                    reaction_used: ticks.reactionUsed,
                  });
                  if (Object.keys(columns).length === 0) {
                    return yield* readCombatant(campaignId, runId, id, actor);
                  }
                  const combatant = yield* edit({ campaignId, actor, runId, id, columns }).pipe(
                    orNotFound("combatant", id),
                  );
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "combatant-updated",
                    encounterRunId: runId,
                    combatantId: id,
                    characterId: combatant.characterId ?? undefined,
                    payload: { ...ticks },
                    requestId,
                    visibility: "dm",
                  });
                  return combatant;
                }),
              )
              .pipe(
                // Two presses that raced past the idempotency check, as for `damage`.
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
         * If they were the one up, the marker moves on first, and whoever it
         * lands on starts a fresh turn (`freshTurn`). The composite
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
                    if (next !== null) yield* freshTurn(sql, runId, next);
                  }

                  const rows = yield* sql<{
                    readonly id: CombatantId;
                    readonly character_id: CharacterId | null;
                    readonly visibility: "dm" | "shared";
                  }>`
                    delete from combatant
                    where combatant.id = ${id}
                      and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
                    returning combatant.id, combatant.character_id, combatant.visibility
                  `;
                  const removed = rows[0];
                  if (removed === undefined)
                    return yield* new NotFound({ resource: "combatant", id });
                  // `combatant_id` on the log is `on delete set null`, so this
                  // event is written *after* the delete and deliberately keeps
                  // the name in its payload: the log has to still say who left.
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "combatant-removed",
                    encounterRunId: runId,
                    characterId: removed.character_id ?? undefined,
                    payload: { combatantId: id },
                    visibility: removed.visibility,
                  });
                }),
              )
              .pipe(Effect.tap(() => live.touched(sessionId))),
          ),
      };
    }),
  );
}
