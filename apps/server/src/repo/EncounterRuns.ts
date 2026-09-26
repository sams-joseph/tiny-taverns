import {
  type Actor,
  type AssistantTurnId,
  type CampaignId,
  type CharacterId,
  type CharacterSheet,
  type CombatantId,
  type CombatantKind,
  Conflict,
  type CreatureId,
  EncounterRun,
  type EncounterRunEndedReason,
  type EncounterRunId,
  type EncounterRunPhase,
  type EncounterRunResume,
  type EncounterRunStart,
  type EncounterRunUpdate,
  type BeginTurns,
  type EncounterId,
  type EncounterKind,
  encounterKindLabel,
  type InitiativeSetBy,
  initiativeBonusOf,
  type NextTurn,
  NEUTRAL_RUN_NAMES,
  NotFound,
  type Origin,
  type RerollInitiative,
  type SessionId,
  type StatBlock,
  statBlockInitiativeBonus,
  type Visibility,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, SqlError, type Statement } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { COMBATANT, initiativeOrder, ROSTER, RUN, RUNS } from "./liveTables.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import { appendEvent, requestAlreadyApplied } from "./SessionEvents.js";
import {
  campaignWritableById,
  containedChildWritable,
  containedRowReadable,
  corpusRowReadable,
  ensureNestedParentReadable,
  ensureNestedParentWritable,
  ensureNestedRowWritable,
  nestedRowReadable,
  nestedRowWritable,
  rowReadable,
  rowWritable,
  runEncounterReadable,
} from "./visibility.js";

export interface EncounterRunRow extends ProvenanceColumns {
  readonly id: EncounterRunId;
  readonly session_id: SessionId;
  readonly encounter_id: EncounterId | null;
  readonly encounter_name: string;
  readonly mode: EncounterKind;
  readonly round: number;
  readonly phase: EncounterRunPhase;
  readonly active_combatant_id: CombatantId | null;
  readonly started_at: Date;
  readonly ended_at: Date | null;
  readonly ended_reason: EncounterRunEndedReason;
  readonly allow_hob_direct_writes: boolean;
  readonly map_shown: boolean;
  readonly hostile_tokens_hidden: boolean;
  readonly continued_from: EncounterRunId | null;
}

export const toEncounterRun = (row: EncounterRunRow): EncounterRun =>
  new EncounterRun({
    id: row.id,
    sessionId: row.session_id,
    encounterId: row.encounter_id,
    encounterName: row.encounter_name,
    mode: row.mode,
    round: row.round,
    phase: row.phase,
    activeCombatantId: row.active_combatant_id,
    startedAt: DateTime.fromDateUnsafe(row.started_at),
    endedAt: row.ended_at === null ? null : DateTime.fromDateUnsafe(row.ended_at),
    endedReason: row.ended_reason,
    allowHobDirectWrites: row.allow_hob_direct_writes,
    mapShown: row.map_shown,
    hostileTokensHidden: row.hostile_tokens_hidden,
    continuedFrom: row.continued_from,
    ...provenanceOf(row),
  });

/**
 * The correlated run's name to a reader for whom `named` says whether its
 * encounter may be named: the snapshot, or the kind of scene it was
 * (`NEUTRAL_RUN_NAMES`, by the run's `mode`) — "A fight", "A conversation".
 * The one spelling of the fallback, for the table's reads (`runColumns`) and
 * the Shared World's (`GroupHistory`).
 */
export const fightName = (
  sql: SqlClient.SqlClient,
  named: Statement.Fragment,
): Statement.Fragment => {
  const neutral = Object.entries(NEUTRAL_RUN_NAMES).map(
    ([mode, name]) => sql`when ${mode} then ${name}`,
  );
  return sql`case when ${named} then encounter_run.encounter_name
    else case encounter_run.mode ${sql.join(" ", false)(neutral)} end end`;
};

/**
 * An `encounter_run` row as this actor may read it, for every read that is not
 * the creator's alone — the recap and the player's table.
 *
 * Every column of the row, listed rather than `encounter_run.*`, because two of
 * them are narrowed and the wide ones must not be selected beside them: to a
 * reader who may not read the encounter (`runEncounterReadable`), the fight has
 * no `encounter_id` and is called by its kind (`fightName`). The creator is named
 * the snapshot whatever became of the template — `campaignWritableById` is the
 * creator's test — so nothing a DM reads changes, a deleted template included.
 */
export const runColumns = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment => {
  const known = runEncounterReadable(sql, campaignId, actor);
  return sql`encounter_run.id, encounter_run.session_id,
    case when ${known} then encounter_run.encounter_id end as encounter_id,
    ${fightName(sql, sql.or([known, campaignWritableById(sql, campaignId, actor)]))} as encounter_name,
    encounter_run.mode, encounter_run.round, encounter_run.phase,
    encounter_run.active_combatant_id,
    encounter_run.started_at,
    encounter_run.ended_at, encounter_run.ended_reason, encounter_run.allow_hob_direct_writes,
    encounter_run.map_shown, encounter_run.hostile_tokens_hidden, encounter_run.continued_from, encounter_run.visibility, encounter_run.origin,
    encounter_run.assistant_turn_id, encounter_run.created_at, encounter_run.updated_at`;
};

/**
 * Everything about a combatant that is *not* its identity or its timestamps.
 *
 * Named as one list because `resume` copies exactly this set, and the rule it
 * embodies is worth being able to state: **a resumed fight is the same fight,
 * so everything but identity and when-the-row-was-made carries.** A column
 * added to `combatant` and forgotten here would be silently dropped by a
 * carry-over — hit points restored and a condition lost — so
 * `apps/server/test/carryover.test.ts` sets every one of them and compares the
 * two rows field by field.
 *
 * `origin` and `assistant_turn_id` are in the list on purpose. A combatant Hob
 * proposed and the DM accepted is still that combatant next week; nothing was
 * newly authored by continuing the fight. (This is the opposite call from
 * `Creatures.derive`, and the difference is real: a derive applies the DM's
 * edits, and a resume applies nothing.)
 */
interface CarriedCombatantRow {
  readonly id: CombatantId;
  readonly character_id: CharacterId | null;
  readonly creature_id: CreatureId | null;
  readonly display_name: string;
  readonly subtitle: string | null;
  readonly player_name: string | null;
  readonly initiative: number | null;
  readonly initiative_bonus: number | null;
  readonly initiative_set_by: InitiativeSetBy | null;
  readonly hp_current: number;
  readonly hp_max: number;
  readonly ac: number | null;
  readonly kind: CombatantKind;
  readonly conditions: ReadonlyArray<string>;
  readonly board_column: number | null;
  readonly board_row: number | null;
  readonly visibility: Visibility;
  readonly origin: Origin;
  readonly assistant_turn_id: AssistantTurnId | null;
}

/**
 * The two partial unique indexes on `encounter_run`, as the 409s they mean.
 *
 * `encounter_run_one_live_per_session` — starting a second fight while one is on
 * the table is refused rather than silently switching, because the first one's
 * initiative order is still on screen and its hit points are still the truth
 * about six creatures. The DM ends the first fight, deliberately.
 *
 * `encounter_run_one_successor` — two nights both continuing the same carried
 * fight. Racing clients get here; so does a DM with the campaign open in two
 * tabs. The index is the arbiter rather than a check-then-insert, which would
 * lose the race it exists to settle.
 */
const asConflict = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Conflict, R> =>
  Effect.catch(effect, (error): Effect.Effect<A, E | Conflict> => {
    if (!SqlError.isSqlError(error) || error.reason._tag !== "UniqueViolation") {
      return Effect.fail(error);
    }
    if (error.reason.constraint.includes("one_live_per_session")) {
      return Effect.fail(
        new Conflict({
          message: "this session already has an encounter on the table; end it first",
        }),
      );
    }
    if (error.reason.constraint.includes("one_successor")) {
      return Effect.fail(
        new Conflict({ message: "that fight has already been picked up on another night" }),
      );
    }
    return Effect.fail(error);
  });

/** A logged check, copied onto a resumed run's log. */
interface CarriedCheckRow {
  readonly combatant_id: CombatantId | null;
  readonly display_name: string;
  readonly skill: string | null;
  readonly save_ability: string | null;
  readonly total: number | null;
  readonly dc: number | null;
  readonly outcome: string;
  readonly stage: number | null;
  readonly created_at: Date;
}

/** Why a scene that is not a fight refuses a turn. */
const notAFight = (mode: EncounterKind): string =>
  `a ${encounterKindLabel(mode).toLowerCase()} scene takes no turns`;

interface PartyRow {
  readonly id: CharacterId;
  readonly name: string;
  readonly player_name: string | null;
  readonly descriptor: string | null;
  readonly ac: number | null;
  readonly hp_max: number | null;
  /** Null means nobody has said, which a seed reads as full. See `0014`. */
  readonly hp_current: number | null;
  readonly conditions: ReadonlyArray<string>;
  /** `character.body`, the sheet — read for its initiative bonus and nothing else. */
  readonly sheet: CharacterSheet;
}

interface RosterRow {
  readonly count: number;
  readonly creature_id: CreatureId;
  readonly name: string;
  readonly size: string | null;
  readonly type: string;
  readonly ac: number;
  readonly hp: number;
  /** `creature.body`, the stat block — read for its initiative bonus and nothing else. */
  readonly stat_block: StatBlock;
}

/**
 * The NPC half of the fixtures' `sub` line: `"Small humanoid"` (`data.js:16`)
 * from `size: "Small"` and `type: "Humanoid"` (`data.js:36`).
 *
 * The type is lower-cased because the fixture's own two forms differ in exactly
 * that way — the bestiary row capitalises it as a column heading would, and the
 * initiative row reads it as prose. This is the only transformation between
 * them, and doing it once at seed time beats a display rule the client has to
 * remember.
 */
const npcSubtitle = (size: string | null, type: string): string =>
  size === null || size === "" ? type : `${size} ${type.toLowerCase()}`;

/**
 * A document's ability cells, or none. `body` is `jsonb` and every writer puts
 * `abilities` in it, but a seed is the wrong place to find out one did not.
 */
const abilityCells = (body: { readonly abilities?: unknown } | null): StatBlock["abilities"] =>
  body !== null && Array.isArray(body.abilities) ? body.abilities : [];

/**
 * The live session.
 *
 * Everything in here writes **straight through to Postgres, transactionally**.
 * There is no in-memory copy of a fight and no write-behind buffer, because
 * `EncounterRunner.jsx:164` makes the DM a promise — "initiative order and hit
 * points are saved to Session 12" — and the moment that promise matters most is
 * a crash mid-combat. §3.4 measured the cost of keeping it: a four-hour session
 * is order 10³ writes, which is a rounding error for Postgres. What actually
 * differs about the live surface is the *read* pattern, and that is the stream.
 *
 * **Every method here takes a `CampaignCreatorActor` in place of a campaign id.** A run is
 * the whole fight — the round, the turn marker, whether it is shared at all —
 * and what a player is eventually shown of one is a narrower thing than this.
 * See `repo/CampaignCreatorActor.ts` for why the proof carries the campaign rather than
 * sitting beside it.
 */
export class EncounterRuns extends Context.Service<
  EncounterRuns,
  {
    readonly list: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
    ) => Effect.Effect<ReadonlyArray<EncounterRun>, NotFound>;
    readonly findById: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      id: EncounterRunId,
    ) => Effect.Effect<EncounterRun, NotFound>;
    readonly start: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      payload: EncounterRunStart,
    ) => Effect.Effect<EncounterRun, NotFound | Conflict>;
    readonly resume: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      payload: EncounterRunResume,
    ) => Effect.Effect<EncounterRun, NotFound | Conflict>;
    readonly update: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      id: EncounterRunId,
      patch: EncounterRunUpdate,
    ) => Effect.Effect<EncounterRun, NotFound | Conflict>;
    readonly nextTurn: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      id: EncounterRunId,
      payload: NextTurn,
    ) => Effect.Effect<EncounterRun, NotFound | Conflict>;
    readonly escalate: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      id: EncounterRunId,
    ) => Effect.Effect<EncounterRun, NotFound | Conflict>;
    readonly begin: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      id: EncounterRunId,
      payload: BeginTurns,
    ) => Effect.Effect<EncounterRun, NotFound | Conflict>;
    readonly reroll: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      id: EncounterRunId,
      payload: RerollInitiative,
    ) => Effect.Effect<EncounterRun, NotFound | Conflict>;
    readonly end: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      id: EncounterRunId,
    ) => Effect.Effect<EncounterRun, NotFound>;
  }
>()("EncounterRuns") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      /**
       * The run named by the path, for a writer.
       *
       * Takes the session as well as the run, and `nestedRowWritable` binds the
       * foreign key between them. Reading it by id alone would be satisfied by
       * a run in another session of the same campaign — each id checks out on
       * its own, and nothing in the pair says one contains the other.
       */
      const readRun = (
        campaignId: CampaignId,
        sessionId: SessionId,
        id: EncounterRunId,
        actor: Actor,
      ): Effect.Effect<EncounterRun, NotFound, never> =>
        sql<EncounterRunRow>`
          select encounter_run.* from encounter_run
          where encounter_run.id = ${id}
            and ${nestedRowWritable(sql, RUNS, sessionId, campaignId, actor)}
        `.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows.length === 0
              ? new NotFound({ resource: "encounter_run", id })
              : Effect.succeed(toEncounterRun(rows[0]!)),
          ),
        );

      /**
       * The turn marker's next resting place.
       *
       * Reads the whole list through the *writable* predicate rather than the
       * readable one, which matters: turn order must not depend on who is
       * watching. Only a DM reaches this code, and a combatant hidden from
       * players still takes their turn.
       */
      const advance = (
        campaignId: CampaignId,
        runId: EncounterRunId,
        actor: Actor,
        from: CombatantId | null,
      ) =>
        Effect.gen(function* () {
          const rows = yield* sql<{
            readonly id: CombatantId;
            readonly kind: CombatantKind;
            readonly hp_current: number;
          }>`
            select combatant.id, combatant.kind, combatant.hp_current from combatant
            where ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
            ${initiativeOrder(sql)}
          `;
          if (rows.length === 0) return { activeCombatantId: null, wrapped: false };
          const at = from === null ? -1 : rows.findIndex((row) => row.id === from);
          // A monster at zero hit points has no turn to take, so the marker
          // passes over it; a character at zero still gets one, for death
          // saves (the captain's call). Nothing is removed and nothing is
          // marked — the row stays where it is, and healing it back above zero
          // gives it its turns again. When every row would be passed over,
          // nobody is: the marker moves one step, as it always did.
          const takesATurn = (index: number) =>
            rows[index]!.kind === "pc" || rows[index]!.hp_current > 0;
          let next = (at + 1) % rows.length;
          for (let step = 1; step < rows.length && !takesATurn(next); step += 1) {
            next = (at + 1 + step) % rows.length;
          }
          if (!takesATurn(next)) next = (at + 1) % rows.length;
          // Wrapping past the bottom of the order is what ends a round —
          // `EncounterRunner.jsx:112-116`. Starting from nobody does not.
          return { activeCombatantId: rows[next]!.id, wrapped: at >= 0 && next <= at };
        });

      return {
        list: ({ actor, campaign: campaignId }, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureNestedParentReadable(sql, RUNS, sessionId, campaignId, actor);
              const rows = yield* sql<EncounterRunRow>`
                select encounter_run.* from encounter_run
                where ${nestedRowReadable(sql, RUNS, sessionId, campaignId, actor)}
                order by encounter_run.started_at desc
              `;
              return rows.map(toEncounterRun);
            }),
          ),

        findById: ({ actor, campaign: campaignId }, sessionId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              // The session in the path is a claim about which session contains
              // this run, so it is checked rather than trusted — naming another
              // table's session id must not reach this run.
              yield* ensureNestedParentReadable(sql, RUNS, sessionId, campaignId, actor);
              const rows = yield* sql<EncounterRunRow>`
                select encounter_run.* from encounter_run
                where encounter_run.id = ${id}
                  and ${nestedRowReadable(sql, RUNS, sessionId, campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "encounter_run", id });
              return toEncounterRun(rows[0]!);
            }),
          ),

        /**
         * Start a fight, and seed it.
         *
         * One transaction, because a half-seeded fight is worse than none: a
         * run with the party in it and no goblins looks like a fight that has
         * begun, and the DM would have to notice. Seven statements commit or none
         * do.
         */
        start: ({ actor, campaign: campaignId }, sessionId, payload) =>
          dieOnSqlError(
            asConflict(
              sql
                .withTransaction(
                  Effect.gen(function* () {
                    yield* ensureNestedParentWritable(sql, RUNS, sessionId, campaignId, actor);

                    // The encounter id is a claim like any other. It must be one
                    // this actor can reach *from this campaign* — the same
                    // predicate a read of it would apply.
                    const encounters = yield* sql<{
                      readonly id: EncounterId;
                      readonly name: string;
                      readonly kind: EncounterKind;
                    }>`
                      select encounter.id, encounter.name, encounter.kind from encounter
                      where encounter.id = ${payload.encounterId}
                        and ${rowReadable(sql, "encounter", campaignId, actor)}
                    `;
                    if (encounters.length === 0) {
                      return yield* new NotFound({
                        resource: "encounter",
                        id: payload.encounterId,
                      });
                    }
                    const encounter = encounters[0]!;
                    // A fight opens on rolling initiative. The other modes take
                    // no turns and so have nothing to roll; `phase` means
                    // nothing to them until one becomes a fight (`escalate`),
                    // which rolls then.
                    const phase: EncounterRunPhase =
                      encounter.kind === "combat" ? "initiative" : "turns";

                    const runs = yield* sql<EncounterRunRow>`
                      insert into encounter_run ${sql.insert(
                        defined({
                          session_id: sessionId,
                          encounter_id: encounter.id,
                          encounter_name: encounter.name,
                          mode: encounter.kind,
                          phase,
                          visibility: payload.visibility,
                        }),
                      )}
                      returning *
                    `;
                    const run = runs[0]!;

                    // The fight's board: a copy of the encounter's grid, so a
                    // later edit to the encounter's map is the next fight's and
                    // never this one's (`0058_encounter_run_boards.ts`). The map
                    // is read through the creator's predicate, beneath the
                    // proof, and every encounter has one — `insert … select`
                    // simply copies none if it somehow does not.
                    yield* sql`
                      insert into encounter_run_board (
                        run_id, map_id, grid, board_columns, board_rows, feet_per_cell,
                        cell_px, offset_x_px, offset_y_px
                      )
                      select ${run.id}, battle_map.id, battle_map.grid, battle_map.board_columns,
                             battle_map.board_rows, battle_map.feet_per_cell, battle_map.cell_px,
                             battle_map.offset_x_px, battle_map.offset_y_px
                      from battle_map
                      where battle_map.encounter_id = ${encounter.id}
                        and ${rowWritable(sql, "battle_map", campaignId, actor)}
                    `;

                    // The scene: the prep's tactic lines as beats, none ticked,
                    // and its challenge, copied so a later edit to the prep is
                    // the next run's (`0065_run_scenes.ts`). Every run has one,
                    // so it is inserted empty and filled from the prep, read
                    // through the creator's predicate beneath the proof.
                    yield* sql`insert into encounter_run_scene (run_id) values (${run.id})`;
                    yield* sql`
                      update encounter_run_scene
                      set challenge = encounter_prep.challenge,
                          beats = coalesce(
                            (select jsonb_agg(jsonb_build_object('text', line.text, 'done', false)
                                              order by line.at)
                             from jsonb_array_elements_text(encounter_prep.tactics)
                                    with ordinality as line(text, at)),
                            '[]'::jsonb)
                      from encounter_prep
                      where encounter_run_scene.run_id = ${run.id}
                        and encounter_prep.encounter_id = ${encounter.id}
                        and ${rowWritable(sql, "encounter_prep", campaignId, actor)}
                    `;

                    // Seed the party. `data.js:15,17,20` — the PCs are in
                    // initiative alongside the monsters, and a fight without
                    // them is not a fight.
                    // The party is the campaign's **seats**, joined to the
                    // shared characters they hold. Display comes from the
                    // seat's snapshot (the table's word for who sits here);
                    // the numbers come from the one shared character, which
                    // is what "walked in at half health" means when the half
                    // health was taken at another table last night.
                    const party =
                      payload.includeParty === false
                        ? []
                        : yield* sql<PartyRow>`
                            select character.id, campaign_character.display_name as name,
                                   character.player_name,
                                   character.descriptor, character.ac, character.hp_max,
                                   character.hp_current, character.conditions,
                                   character.body as sheet
                            from campaign_character
                            join character on character.id = campaign_character.character_id
                            where campaign_character.left_at is null
                              and ${rowReadable(sql, "campaign_character", campaignId, actor)}
                            order by campaign_character.joined_at asc, campaign_character.id asc
                          `;

                    // Seed the monsters, `count` instances each. This is where
                    // `data.js:18-19`'s two `Goblin Archer` rows come from: the
                    // roster line says how many, and each one becomes a row
                    // that can be damaged on its own. They are not numbered,
                    // because the fixture does not number them.
                    //
                    // The creature is filtered by `corpusRowReadable`, not by a
                    // join alone — half the creatures a roster may name are
                    // global `system` rows, and they are reachable only through
                    // a campaign this actor can read.
                    const roster = yield* sql<RosterRow>`
                      select encounter_creature.count as count,
                             creature.id as creature_id, creature.name, creature.size,
                             creature.type, creature.ac, creature.hp,
                             creature.body as stat_block
                      from encounter_creature
                      join creature on creature.id = encounter_creature.creature_id
                      where ${nestedRowReadable(sql, ROSTER, encounter.id, campaignId, actor)}
                        and ${corpusRowReadable(sql, "creature", campaignId, actor)}
                      order by creature.cr_sort desc, creature.name asc
                    `;
                    // The two orderings above are for the *insert*, and they
                    // do not survive into the initiative list: everything a
                    // seed inserts shares one `created_at`, so reads fall
                    // through to `id`. See `initiativeOrder`. They are kept
                    // because a deterministic insert order is what makes the
                    // seed reproducible for a given roster.

                    const seeded: Array<Record<string, unknown>> = [];
                    for (const member of party) {
                      seeded.push({
                        encounter_run_id: run.id,
                        character_id: member.id,
                        creature_id: null,
                        display_name: member.name,
                        subtitle: member.descriptor,
                        player_name: member.player_name,
                        // Nobody has rolled yet. The bonus is what a roll for
                        // them adds, snapshotted like every field here.
                        initiative: null,
                        initiative_bonus:
                          initiativeBonusOf({
                            abilities: abilityCells(member.sheet),
                            identity: member.sheet?.identity,
                          }) ?? null,
                        initiative_set_by: null,
                        // Where they actually are, not where they started the
                        // campaign. A party that walked in at half health is in
                        // initiative at half health — a seed from `hp_max`
                        // would silently heal everyone at the top of every
                        // fight, which is the stale-prep-data behaviour the
                        // live columns exist to end.
                        hp_current: member.hp_current ?? member.hp_max ?? 0,
                        hp_max: member.hp_max ?? 0,
                        ac: member.ac,
                        conditions: member.conditions,
                        kind: "pc",
                      });
                    }
                    for (const line of roster) {
                      for (let index = 0; index < line.count; index += 1) {
                        seeded.push({
                          encounter_run_id: run.id,
                          character_id: null,
                          creature_id: line.creature_id,
                          display_name: line.name,
                          subtitle: npcSubtitle(line.size, line.type),
                          player_name: null,
                          initiative: null,
                          initiative_bonus:
                            statBlockInitiativeBonus({
                              abilities: abilityCells(line.stat_block),
                            }) ?? null,
                          initiative_set_by: null,
                          hp_current: line.hp,
                          hp_max: line.hp,
                          ac: line.ac,
                          // Present, and empty. `sql.insert` takes its column
                          // list from the *first* row of the array, so a key on
                          // the party's rows and not on the monsters' would
                          // either be dropped or bound as null depending on
                          // which end the seed started at.
                          conditions: [],
                          kind: "npc",
                        });
                      }
                    }
                    if (seeded.length > 0) {
                      yield* sql`insert into combatant ${sql.insert(seeded)}`;
                    }

                    // Put it on the table. Nobody is up yet in any run: a fight
                    // opens rolling initiative and `begin` puts the marker on
                    // whoever is first; a conversation, a challenge or a hazard
                    // takes no turns until one turns into a fight (`escalate`).
                    const activeCombatantId = null;
                    const started = yield* sql<EncounterRunRow>`
                      update encounter_run
                      set active_combatant_id = ${activeCombatantId}, updated_at = now()
                      where encounter_run.id = ${run.id}
                      returning *
                    `;
                    yield* sql`
                      update session set active_encounter_run_id = ${run.id}, updated_at = now()
                      where session.id = ${sessionId}
                    `;

                    yield* appendEvent(sql, {
                      sessionId,
                      kind: "run-started",
                      encounterRunId: run.id,
                      payload: {
                        encounterId: encounter.id,
                        encounterName: encounter.name,
                        combatants: seeded.length,
                      },
                      visibility: run.visibility,
                    });

                    return toEncounterRun(started[0]!);
                  }),
                )
                .pipe(Effect.tap(() => live.touched(sessionId))),
            ),
          ),

        /**
         * Pick a carried fight back up, on a new night.
         *
         * The successor is a **second row** — see `0007_run_carryover.ts` for
         * the four reasons that beats moving the predecessor — seeded by
         * copying it rather than by rolling the roster again: the party's hit
         * points, the monsters that are already down, the conditions and the
         * round are the state the DM was promised is saved.
         *
         * Three things about the copy are not obvious:
         *
         * - **The combatant ids are generated here, in TypeScript, before the
         *   insert.** That is what makes the turn marker carryable at all:
         *   `encounter_run_active_combatant_fkey` is composite, so it refuses a
         *   marker naming a combatant from another run, and a bulk
         *   `insert … select` would not know the new ids until afterwards.
         *   Whose turn it was is part of "initiative order is saved", so it is
         *   worth one loop.
         * - **The predecessor is read through the ordinary containment
         *   predicate**, so a run id smuggled in from another campaign is a 404
         *   by the same rule everything else is. Write authority comes from
         *   `ensureNestedParentWritable` on the *destination* session, which is
         *   also what refuses every non-DM.
         * - **A `resolved` fight is refused as a `Conflict`, not resumed.** It
         *   is not missing; it is over, and the DM can see that. Reopening one
         *   would put "resolved" in one night's recap and "resumed" in the
         *   next's — which is exactly the contradiction `ended_reason` exists
         *   to prevent. Running that encounter again is `start`, and it is
         *   honestly a new fight.
         */
        resume: ({ actor, campaign: campaignId }, sessionId, payload) =>
          dieOnSqlError(
            asConflict(
              sql
                .withTransaction(
                  Effect.gen(function* () {
                    yield* ensureNestedParentWritable(sql, RUNS, sessionId, campaignId, actor);

                    const previous = yield* sql<EncounterRunRow>`
                      select encounter_run.* from encounter_run
                      where encounter_run.id = ${payload.continuedFrom}
                        and ${containedRowReadable(sql, RUN, campaignId, actor)}
                    `;
                    if (previous.length === 0) {
                      return yield* new NotFound({
                        resource: "encounter_run",
                        id: payload.continuedFrom,
                      });
                    }
                    const from = previous[0]!;
                    if (from.ended_reason !== "carried") {
                      return yield* new Conflict({
                        message:
                          from.ended_at === null
                            ? "that fight is still on the table"
                            : "that fight was ended rather than carried; start it again instead",
                      });
                    }

                    const runs = yield* sql<EncounterRunRow>`
                      insert into encounter_run ${sql.insert({
                        session_id: sessionId,
                        encounter_id: from.encounter_id,
                        encounter_name: from.encounter_name,
                        mode: from.mode,
                        round: from.round,
                        phase: from.phase,
                        visibility: from.visibility,
                        map_shown: from.map_shown,
                        hostile_tokens_hidden: from.hostile_tokens_hidden,
                        origin: from.origin,
                        assistant_turn_id: from.assistant_turn_id,
                        continued_from: from.id,
                      })}
                      returning *
                    `;
                    const run = runs[0]!;

                    // The same fight on the same board: the predecessor's own
                    // copy, not the encounter's map as it stands tonight. The
                    // predecessor was proved this campaign's above, and its
                    // board is what it was played on.
                    yield* sql`
                      insert into encounter_run_board (
                        run_id, map_id, grid, board_columns, board_rows, feet_per_cell,
                        cell_px, offset_x_px, offset_y_px
                      )
                      select ${run.id}, map_id, grid, board_columns, board_rows, feet_per_cell,
                             cell_px, offset_x_px, offset_y_px
                      from encounter_run_board
                      where encounter_run_board.run_id = ${from.id}
                    `;

                    // The writable predicate, not the readable one, for the
                    // reason `advance` uses it: what carries across must not
                    // depend on who is watching. A combatant hidden from
                    // players is still in the fight.
                    const carried = yield* sql<CarriedCombatantRow>`
                      select combatant.id, combatant.character_id, combatant.creature_id,
                             combatant.display_name, combatant.subtitle, combatant.player_name,
                             combatant.initiative, combatant.initiative_bonus,
                             combatant.initiative_set_by, combatant.hp_current, combatant.hp_max,
                             combatant.ac, combatant.kind, combatant.conditions,
                             combatant.board_column, combatant.board_row,
                             combatant.visibility, combatant.origin, combatant.assistant_turn_id
                      from combatant
                      where ${containedChildWritable(sql, COMBATANT, from.id, campaignId, actor)}
                      ${initiativeOrder(sql)}
                    `;

                    const idFor = new Map<CombatantId, CombatantId>();
                    const copies: Array<Record<string, unknown>> = [];
                    for (const row of carried) {
                      const id = crypto.randomUUID() as CombatantId;
                      idFor.set(row.id, id);
                      copies.push({
                        id,
                        encounter_run_id: run.id,
                        character_id: row.character_id,
                        creature_id: row.creature_id,
                        display_name: row.display_name,
                        subtitle: row.subtitle,
                        player_name: row.player_name,
                        initiative: row.initiative,
                        initiative_bonus: row.initiative_bonus,
                        initiative_set_by: row.initiative_set_by,
                        hp_current: row.hp_current,
                        hp_max: row.hp_max,
                        ac: row.ac,
                        kind: row.kind,
                        conditions: row.conditions,
                        board_column: row.board_column,
                        board_row: row.board_row,
                        visibility: row.visibility,
                        origin: row.origin,
                        assistant_turn_id: row.assistant_turn_id,
                      });
                    }
                    if (copies.length > 0) {
                      yield* sql`insert into combatant ${sql.insert(copies)}`;
                    }

                    // The same scene: its beats as ticked, its snapshot, the
                    // DM's notes and the hazard's stage, and its log of checks,
                    // each pointing at the same combatant's new row. A skill
                    // challenge picked up next week is two successes in, not
                    // back at none.
                    yield* sql`
                      insert into encounter_run_scene (run_id, beats, challenge, attitude, stages, stage)
                      select ${run.id}, beats, challenge, attitude, stages, stage
                      from encounter_run_scene
                      where encounter_run_scene.run_id = ${from.id}
                    `;
                    yield* sql`
                      insert into encounter_run_scene (run_id) values (${run.id})
                      on conflict (run_id) do nothing
                    `;
                    const checks = yield* sql<CarriedCheckRow>`
                      select combatant_id, display_name, skill, save_ability, total, dc,
                             outcome, stage, created_at
                      from encounter_run_check
                      where encounter_run_check.encounter_run_id = ${from.id}
                      order by encounter_run_check.created_at asc, encounter_run_check.id asc
                    `;
                    if (checks.length > 0) {
                      yield* sql`insert into encounter_run_check ${sql.insert(
                        checks.map((check) => ({
                          encounter_run_id: run.id,
                          combatant_id:
                            check.combatant_id === null
                              ? null
                              : (idFor.get(check.combatant_id) ?? null),
                          display_name: check.display_name,
                          skill: check.skill,
                          save_ability: check.save_ability,
                          total: check.total,
                          dc: check.dc,
                          outcome: check.outcome,
                          stage: check.stage,
                          created_at: check.created_at,
                        })),
                      )}`;
                    }

                    // The marker, remapped. Null when the predecessor had
                    // nobody up, or when whoever was up is no longer there —
                    // which cannot happen through the copy above, but the map
                    // lookup is the honest way to say "the same combatant".
                    const active =
                      from.active_combatant_id === null
                        ? null
                        : (idFor.get(from.active_combatant_id) ?? null);
                    const resumed = yield* sql<EncounterRunRow>`
                      update encounter_run
                      set active_combatant_id = ${active}, updated_at = now()
                      where encounter_run.id = ${run.id}
                      returning *
                    `;
                    yield* sql`
                      update session set active_encounter_run_id = ${run.id}, updated_at = now()
                      where session.id = ${sessionId}
                    `;

                    yield* appendEvent(sql, {
                      sessionId,
                      kind: "run-resumed",
                      encounterRunId: run.id,
                      payload: {
                        continuedFrom: from.id,
                        encounterName: from.encounter_name,
                        round: from.round,
                        combatants: copies.length,
                      },
                      visibility: run.visibility,
                    });

                    return toEncounterRun(resumed[0]!);
                  }),
                )
                .pipe(Effect.tap(() => live.touched(sessionId))),
            ),
          ),

        update: ({ actor, campaign: campaignId }, sessionId, id, patch) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureNestedParentWritable(sql, RUNS, sessionId, campaignId, actor);
                  // Nobody is up while initiative is being rolled — the schema
                  // holds it (`encounter_run_nobody_up_while_rolling`), and this
                  // says it as a refusal the DM can read rather than a 404.
                  if (patch.activeCombatantId !== undefined && patch.activeCombatantId !== null) {
                    const current = yield* readRun(campaignId, sessionId, id, actor);
                    if (current.phase === "initiative") {
                      return yield* new Conflict({
                        message:
                          "nobody is up while initiative is being rolled; start round 1 first",
                      });
                    }
                  }
                  const columns = defined({
                    round: patch.round,
                    active_combatant_id: patch.activeCombatantId,
                    visibility: patch.visibility,
                    allow_hob_direct_writes: patch.allowHobDirectWrites,
                    map_shown: patch.mapShown,
                    hostile_tokens_hidden: patch.hostileTokensHidden,
                  });
                  const rows = yield* sql<EncounterRunRow>`
                    update encounter_run set ${setClause(sql, columns)}
                    where encounter_run.id = ${id}
                      and ${containedChildWritable(sql, RUN, sessionId, campaignId, actor)}
                    returning *
                  `;
                  if (rows.length === 0) {
                    return yield* new NotFound({ resource: "encounter_run", id });
                  }
                  const run = toEncounterRun(rows[0]!);
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "run-updated",
                    encounterRunId: id,
                    payload: { ...patch },
                    visibility: run.visibility,
                  });
                  return run;
                }),
              )
              .pipe(
                // A turn marker naming a combatant in another fight is refused
                // by `encounter_run_active_combatant_fkey`, which is composite.
                // The repository turns that into the 404 the rest of the surface
                // answers with rather than letting it become a 500.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "ConstraintError"
                    ? new NotFound({
                        resource: "combatant",
                        id: patch.activeCombatantId ?? id,
                      })
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          ),

        /**
         * Advance initiative — `EncounterRunner.jsx:112-116`, round roll-over
         * included.
         *
         * Carries a `requestId` because "Next turn" is bound to the space bar
         * and to a button, and a repeat of one already applied returns the run
         * unchanged rather than skipping a creature's turn.
         */
        nextTurn: ({ actor, campaign: campaignId }, sessionId, id, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureNestedRowWritable(sql, RUNS, id, sessionId, campaignId, actor);

                  if (yield* requestAlreadyApplied(sql, id, payload.requestId)) {
                    return yield* readRun(campaignId, sessionId, id, actor);
                  }

                  const current = yield* readRun(campaignId, sessionId, id, actor);
                  if (current.mode !== "combat") {
                    return yield* new Conflict({ message: notAFight(current.mode) });
                  }
                  if (current.phase === "initiative") {
                    return yield* new Conflict({
                      message: "this fight is still rolling initiative; start round 1 first",
                    });
                  }
                  const { activeCombatantId, wrapped } = yield* advance(
                    campaignId,
                    id,
                    actor,
                    current.activeCombatantId,
                  );
                  if (activeCombatantId === null) return current;

                  const round = current.round + (wrapped ? 1 : 0);
                  const rows = yield* sql<EncounterRunRow>`
                    update encounter_run
                    set active_combatant_id = ${activeCombatantId},
                        round = ${round},
                        updated_at = now()
                    where encounter_run.id = ${id}
                    returning *
                  `;
                  const run = toEncounterRun(rows[0]!);
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "turn-advanced",
                    encounterRunId: id,
                    combatantId: activeCombatantId,
                    payload: { round, wrapped },
                    requestId: payload.requestId,
                    visibility: run.visibility,
                  });
                  return run;
                }),
              )
              .pipe(
                // Two taps that raced past the check together: the unique index
                // on `(encounter_run_id, request_id)` refuses the second, and
                // the honest answer is the state the first one produced.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? readRun(campaignId, sessionId, id, actor)
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          ),

        /**
         * A conversation turns into a fight.
         *
         * The same run, so the same night's log, the same combatants — the
         * NPC and whoever came with them were seeded when it started — and the
         * checks already logged stay its history. It opens on rolling
         * initiative at round 1, as `start` opens a fight: nobody is up until
         * every row has a number and the DM starts the round (`begin`).
         */
        escalate: ({ actor, campaign: campaignId }, sessionId, id) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const current = yield* readRun(campaignId, sessionId, id, actor);
                  if (current.endedAt !== null) {
                    return yield* new Conflict({ message: "that scene is over" });
                  }
                  if (current.mode !== "social") {
                    return yield* new Conflict({
                      message: "only a conversation turns into a fight",
                    });
                  }
                  const rows = yield* sql<EncounterRunRow>`
                    update encounter_run
                    set mode = 'combat', phase = 'initiative', round = 1,
                        active_combatant_id = null, updated_at = now()
                    where encounter_run.id = ${id} and encounter_run.mode = 'social'
                    returning *
                  `;
                  // A second press raced past the check above and found the
                  // mode already moved: the answer is the fight it became.
                  if (rows.length === 0) return yield* readRun(campaignId, sessionId, id, actor);
                  const run = toEncounterRun(rows[0]!);
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "run-escalated",
                    encounterRunId: id,
                    visibility: run.visibility,
                  });
                  return run;
                }),
              )
              .pipe(Effect.tap(() => live.touched(sessionId))),
          ),

        /**
         * *Start round 1* — out of the initiative phase.
         *
         * Every combatant needs a number first, hidden ones included: they take
         * turns too, and a row with no number has no place in the order to
         * take them from. The marker goes on the first in the order that takes
         * a turn (`advance` from nobody). The round is left alone — a fresh
         * fight is at 1, and one that went back to rolling keeps the round it
         * was in.
         *
         * A fight already taking turns is answered as it is and nothing is
         * logged, so a repeated press cannot restart anybody's turn.
         */
        begin: ({ actor, campaign: campaignId }, sessionId, id, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureNestedRowWritable(sql, RUNS, id, sessionId, campaignId, actor);
                  const current = yield* readRun(campaignId, sessionId, id, actor);
                  if (current.mode !== "combat") {
                    return yield* new Conflict({ message: notAFight(current.mode) });
                  }
                  // Over, or already under way: nothing to start.
                  if (current.endedAt !== null || current.phase === "turns") return current;
                  if (yield* requestAlreadyApplied(sql, id, payload.requestId)) return current;

                  const unset = yield* sql<{ readonly count: number }>`
                    select count(*)::int as count from combatant
                    where ${containedChildWritable(sql, COMBATANT, id, campaignId, actor)}
                      and combatant.initiative is null
                  `;
                  const missing = unset[0]?.count ?? 0;
                  if (missing > 0) {
                    return yield* new Conflict({
                      message:
                        missing === 1
                          ? "one combatant has no initiative yet"
                          : `${String(missing)} combatants have no initiative yet`,
                    });
                  }

                  const { activeCombatantId } = yield* advance(campaignId, id, actor, null);
                  const rows = yield* sql<EncounterRunRow>`
                    update encounter_run
                    set phase = 'turns', active_combatant_id = ${activeCombatantId},
                        updated_at = now()
                    where encounter_run.id = ${id}
                    returning *
                  `;
                  const run = toEncounterRun(rows[0]!);
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "run-updated",
                    encounterRunId: id,
                    combatantId: activeCombatantId ?? undefined,
                    payload: { phase: "turns", round: run.round },
                    requestId: payload.requestId,
                    visibility: run.visibility,
                  });
                  return run;
                }),
              )
              .pipe(
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? readRun(campaignId, sessionId, id, actor)
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          ),

        /**
         * *Reroll initiative* — back to the initiative phase.
         *
         * **Every number is kept**, and so is the round. The drawing clears
         * them all, which throws away what the table called out; keeping them
         * means the DM changes only what changed (`setInitiative`) and starts
         * the round again. The marker comes off, because nobody is up while
         * initiative is being rolled.
         */
        reroll: ({ actor, campaign: campaignId }, sessionId, id, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureNestedRowWritable(sql, RUNS, id, sessionId, campaignId, actor);
                  const current = yield* readRun(campaignId, sessionId, id, actor);
                  if (current.mode !== "combat") {
                    return yield* new Conflict({ message: notAFight(current.mode) });
                  }
                  if (current.endedAt !== null || current.phase === "initiative") return current;
                  if (yield* requestAlreadyApplied(sql, id, payload.requestId)) return current;

                  const rows = yield* sql<EncounterRunRow>`
                    update encounter_run
                    set phase = 'initiative', active_combatant_id = null, updated_at = now()
                    where encounter_run.id = ${id}
                    returning *
                  `;
                  const run = toEncounterRun(rows[0]!);
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "run-updated",
                    encounterRunId: id,
                    payload: { phase: "initiative", round: run.round },
                    requestId: payload.requestId,
                    visibility: run.visibility,
                  });
                  return run;
                }),
              )
              .pipe(
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? readRun(campaignId, sessionId, id, actor)
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          ),

        /**
         * Take the fight off the table.
         *
         * Nothing is deleted. The run, its combatants and its log all stay —
         * `EncounterRunner.jsx:164` promises the DM they are "saved to Session
         * 12", and §1.4's interrupted-and-resumed fight is a second run of the
         * same encounter next week rather than a resurrection of this one.
         *
         * Idempotent: ending an ended run is a no-op that appends no second
         * event, so a retried request cannot put two endings in the log.
         */
        end: ({ actor, campaign: campaignId }, sessionId, id) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const current = yield* readRun(campaignId, sessionId, id, actor);
                  if (current.endedAt !== null) return current;

                  const rows = yield* sql<EncounterRunRow>`
                    update encounter_run set ended_at = now(), updated_at = now()
                    where encounter_run.id = ${id} and encounter_run.ended_at is null
                    returning *
                  `;
                  // Clearing the pointer is the same statement's job as setting
                  // `ended_at`, in the same transaction — that is what stops
                  // the session naming a fight that is over. The `and` on the
                  // current value keeps this from clobbering a pointer that has
                  // already moved on.
                  yield* sql`
                    update session
                    set active_encounter_run_id = null, updated_at = now()
                    where session.id = ${sessionId} and session.active_encounter_run_id = ${id}
                  `;
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "run-ended",
                    encounterRunId: id,
                    payload: { round: current.round },
                    visibility: current.visibility,
                  });
                  return toEncounterRun(rows[0]!);
                }),
              )
              .pipe(Effect.tap(() => live.touched(sessionId))),
          ),
      };
    }),
  );
}
