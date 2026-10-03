import {
  Actor,
  CampaignId,
  type CharacterId,
  Combatant,
  type CombatantCreate,
  type CombatantDamage,
  CombatantId,
  type CombatantMove,
  CombatantPosition,
  type CombatantUpdate,
  concentrationDc,
  Conflict,
  EncounterRunId,
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
import { COMBATANT, initiativeOrder, RUN, RUNS, tokenShown } from "./liveTables.js";
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
import { type CharacterVitals, clampedCombatantHp, writeThroughToCharacter } from "./vitals.js";
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
 * the token is off the board — `0064_combatant_positions.ts`), and its
 * character's portrait id, gated by the seat (`seatedPortraitColumn`). **Every
 * read that becomes a `Combatant` names this** — {@link combatantRow} requires
 * `position` and `portrait_id`, as `characterRow` requires `portraitColumns`,
 * so a path that forgot fails a test rather than dropping the picture.
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
    readonly move: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: CombatantId,
      payload: CombatantMove,
    ) => Effect.Effect<Combatant, NotFound | Conflict>;
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
      /** A damaged or healed combatant, and the two facts about it before the hit. */
      const HitRow = fromColumns(
        Schema.Struct({
          ...combatantFields(sign),
          hpBefore: Schema.Int,
          wasConcentrating: Schema.Boolean,
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
       * than a read another hit could land between.
       */
      const hit = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...inFight, id: CombatantId, amount: Schema.Int })),
        Result: HitRow,
        execute: ({ campaignId, actor, runId, id, amount }) => sql`
          update combatant
          set hp_current = ${clampedCombatantHp(sql, amount)},
              updated_at = now()
          where combatant.id = ${id}
            and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
          returning ${combatantColumns(sql, campaignId, actor)},
            old.hp_current as hp_before,
            'Concentrating' = any(old.conditions) as was_concentrating
        `,
      });
      const place = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...inFight, id: CombatantId, to: Schema.NullOr(CombatantPosition) }),
        ),
        Result: MovedRow,
        execute: ({ campaignId, actor, runId, id, to }) => sql`
          update combatant
          set board_column = ${to?.column ?? null},
              board_row = ${to?.row ?? null},
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
                    payload: { ...patch },
                    visibility: combatant.visibility,
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
         * What it does add is to the log line, for the DM's dock: the hit
         * points before the hit, which the clamp would otherwise lose, and the
         * Constitution save's DC when a row holding `Concentrating` took damage
         * and is still standing. The DC is a note, not a ruling: the condition
         * stays until the DM clears it, whatever the die says.
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

                  const { hpBefore, wasConcentrating, ...hurt } = yield* hit({
                    campaignId,
                    actor,
                    runId,
                    id,
                    amount: payload.amount,
                  }).pipe(orNotFound("combatant", id));
                  const combatant = new Combatant(hurt, { disableChecks: true });
                  // The save is owed only by a creature that was holding a
                  // spell, took damage, and is still up to make it.
                  const owesSave =
                    wasConcentrating && payload.amount > 0 && combatant.hpCurrent > 0;
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
                    },
                    requestId: payload.requestId,
                    visibility: combatant.visibility,
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
         * Put a token on a square, move it, or take it off the board.
         *
         * The square is checked against **the fight's own board**
         * (`encounter_run_board`), the grid the fight was started on, which
         * nothing resizes afterwards — so a position once accepted stays on
         * the board. A fight with no board has nowhere to put a token, and a
         * square past its edge is not a square; both are a `Conflict`. Taking
         * a token off needs no board.
         *
         * No rule about distance or turns: the DM moves whoever they like,
         * wherever they like, whenever they like, as they would a miniature.
         * Two tokens may share a square for the same reason.
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

                  const to = payload.position;
                  if (to !== null) {
                    const boards = yield* sql<{
                      readonly board_columns: number;
                      readonly board_rows: number;
                    }>`
                      select encounter_run_board.board_columns, encounter_run_board.board_rows
                      from encounter_run_board
                      where encounter_run_board.run_id = ${runId}
                    `;
                    const board = boards[0];
                    if (board === undefined) {
                      return yield* new Conflict({ message: "this fight has no board" });
                    }
                    if (to.column >= board.board_columns || to.row >= board.board_rows) {
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

                  const { tokenShown: shown, ...moved } = yield* place({
                    campaignId,
                    actor,
                    runId,
                    id,
                    to,
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
