import {
  type AccountId,
  type Actor,
  type CampaignId,
  Character,
  type CharacterCreate,
  type CharacterDamage,
  type CharacterId,
  type CharacterSheet,
  type CharacterUpdate,
  CurrentActor,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import { requestAlreadyApplied, sessionRequestAlreadyApplied } from "./SessionEvents.js";
import {
  appendCharacterUpdated,
  applyCharacterDelta,
  currentSessionOf,
  liveCombatantOf,
  writeThroughToLiveCombatants,
} from "./vitals.js";
import {
  ensureCampaignReadable,
  ensureCampaignWritable,
  rowReadable,
  rowWritable,
} from "./visibility.js";

interface CharacterRow extends ProvenanceColumns {
  readonly id: CharacterId;
  readonly campaign_id: CampaignId;
  /** Null for every row today — nothing mints a player credential yet. */
  readonly account_id: AccountId | null;
  readonly name: string;
  readonly player_name: string | null;
  readonly level: number | null;
  readonly species: string | null;
  readonly class_name: string | null;
  /**
   * `generated always as … stored`, so it arrives like any other column and is
   * refused by Postgres on the way in. Nothing below writes it, and nothing
   * could.
   */
  readonly descriptor: string | null;
  readonly ac: number | null;
  readonly hp_max: number | null;
  /** Null until somebody says. Not zero, and not full. See `0014`. */
  readonly hp_current: number | null;
  readonly temp_hp: number;
  /** `text[]`; the pg driver hands these back as a real JS array. */
  readonly conditions: ReadonlyArray<string>;
  readonly sheet_url: string | null;
  /** `jsonb`; the pg driver parses it, so this arrives as the document itself. */
  readonly body: CharacterSheet;
}

const toCharacter = (row: CharacterRow): Character =>
  new Character({
    id: row.id,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    name: row.name,
    playerName: row.player_name,
    level: row.level,
    species: row.species,
    className: row.class_name,
    descriptor: row.descriptor,
    ac: row.ac,
    hpMax: row.hp_max,
    hpCurrent: row.hp_current,
    tempHp: row.temp_hp,
    conditions: row.conditions,
    sheetUrl: row.sheet_url,
    sheet: row.body,
    ...provenanceOf(row),
  });

/**
 * Stringified for the same reason `Creatures.encodeStatBlock` is: a bare JS
 * object handed to `sql.insert` is one bind parameter whose serialisation
 * depends on the driver's guess, and being explicit about which structured
 * column is which is cheaper than remembering the rule at each call site.
 */
const encodeSheet = (sheet: CharacterSheet): string => JSON.stringify(sheet);

/**
 * The party — and since `0014`, a live table.
 *
 * ### Where a hit point lives
 *
 * The character owns it, the combatant holds the fight's copy, and one
 * transaction writes both. `repo/vitals.ts` is where that is written down and
 * the only place either copy moves; this file composes it. Two consequences
 * are worth reading before changing anything here:
 *
 * - **Every write in this file is now a transaction**, including the PATCH,
 *   because a character write may reach a live combatant and the two have to
 *   commit together or not at all.
 * - **A write during a session appends `character-updated` and rings the
 *   doorbell; a write with no session open rings nothing.** That second half is
 *   the settled decision, not an omission — a level-up typed on a Tuesday
 *   updates nobody live and an open page stays stale until it refetches. See
 *   `currentSessionOf`.
 *
 * ### What has not changed
 *
 * **There is no `descriptor` in either payload, and that is the whole shape of
 * this file since `0012`.** The `"Level 3 Half-orc Paladin"` line is derived
 * from `level`, `species` and `class_name` by a generated column, so the only
 * way to change it is to change one of those — a label stored beside the three
 * fields it summarises is a second answer waiting to disagree with the first.
 *
 * `account_id` is likewise absent from both payloads. It is the hook the invite
 * will use and nothing reads through it; an endpoint that accepted one would be
 * letting a client name an account it has no business naming, and the predicate
 * that will make it mean something belongs with the step that mints a player
 * actor.
 */
export class Characters extends Context.Service<
  Characters,
  {
    readonly list: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<Character>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      id: CharacterId,
    ) => Effect.Effect<Character, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      payload: CharacterCreate,
    ) => Effect.Effect<Character, NotFound, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      id: CharacterId,
      patch: CharacterUpdate,
    ) => Effect.Effect<Character, NotFound, CurrentActor>;
    /**
     * A signed delta on the one number two rows both hold.
     *
     * `Combatants.damage`'s twin, met from the character's side: the trap in
     * the corridor, the poison between rounds, the long rest. If the character
     * is in a fight that is still on the table, this goes *through* that fight
     * — one clamp, both rows — so the two entry points cannot produce different
     * answers to the same hit.
     */
    readonly damage: (
      campaignId: CampaignId,
      id: CharacterId,
      payload: CharacterDamage,
    ) => Effect.Effect<Character, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      id: CharacterId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Characters") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      /**
       * Ring the doorbell — after the transaction has committed, and only when
       * the write happened during a session.
       *
       * `sessionId === undefined` is the settled decision rather than a missing
       * case: character liveness is tied to the session doorbell, so an edit
       * between games updates nobody live. `vitals.ts`'s `currentSessionOf`
       * carries the argument in full.
       */
      const ring = ({ sessionId }: { readonly sessionId: SessionId | undefined }) =>
        sessionId === undefined ? Effect.void : live.touched(sessionId);

      const readCharacter = (
        campaignId: CampaignId,
        id: CharacterId,
        actor: Actor,
      ): Effect.Effect<Character, NotFound> =>
        sql<CharacterRow>`
          select * from character
          where character.id = ${id} and ${rowReadable(sql, "character", campaignId, actor)}
        `.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows.length === 0
              ? new NotFound({ resource: "character", id })
              : Effect.succeed(toCharacter(rows[0]!)),
          ),
        );

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* sql<CharacterRow>`
                select * from character
                where ${rowReadable(sql, "character", campaignId, actor)}
                order by character.created_at asc
              `;
              return rows.map(toCharacter);
            }),
          ),

        findById: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<CharacterRow>`
                select * from character
                where character.id = ${id} and ${rowReadable(sql, "character", campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "character", id });
              return toCharacter(rows[0]!);
            }),
          ),

        /**
         * `hpCurrent` is accepted here and nowhere else after this point: a row
         * that does not exist yet is in no fight, so there is no second copy to
         * keep in step. See `CharacterCreate`.
         */
        create: (campaignId, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureCampaignWritable(sql, campaignId, actor);
                  const rows = yield* sql<CharacterRow>`
                  insert into character ${sql.insert(
                    defined({
                      campaign_id: campaignId,
                      name: payload.name,
                      player_name: payload.playerName,
                      level: payload.level,
                      species: payload.species,
                      class_name: payload.className,
                      ac: payload.ac,
                      hp_max: payload.hpMax,
                      hp_current: payload.hpCurrent,
                      temp_hp: payload.tempHp,
                      conditions: payload.conditions,
                      sheet_url: payload.sheetUrl,
                      body: payload.sheet && encodeSheet(payload.sheet),
                      visibility: payload.visibility,
                    }),
                  )}
                  returning *
                `;
                  const character = toCharacter(rows[0]!);
                  const sessionId = yield* currentSessionOf(sql, campaignId, actor);
                  if (sessionId !== undefined) {
                    yield* appendCharacterUpdated(sql, {
                      sessionId,
                      characterId: character.id,
                      detail: { name: character.name },
                    });
                  }
                  return { character, sessionId };
                }),
              )
              .pipe(
                Effect.tap(ring),
                Effect.map(({ character }) => character),
              ),
          ),

        /**
         * The PATCH, which may now reach the fight.
         *
         * `conditions` is the one field here both tables hold, so setting it
         * writes through to every live combatant seeded from this character —
         * in this transaction. `hpCurrent` is deliberately not a field: it
         * moves by delta, through `damage` below.
         */
        update: (campaignId, id, patch) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  const columns = defined({
                    name: patch.name,
                    player_name: patch.playerName,
                    level: patch.level,
                    species: patch.species,
                    class_name: patch.className,
                    ac: patch.ac,
                    hp_max: patch.hpMax,
                    temp_hp: patch.tempHp,
                    conditions: patch.conditions,
                    sheet_url: patch.sheetUrl,
                    body: patch.sheet && encodeSheet(patch.sheet),
                    visibility: patch.visibility,
                  });
                  const rows = yield* sql<CharacterRow>`
                update character set ${setClause(sql, columns)}
                where character.id = ${id} and ${rowWritable(sql, "character", campaignId, actor)}
                returning *
              `;
                  if (rows.length === 0) return yield* new NotFound({ resource: "character", id });
                  const character = toCharacter(rows[0]!);

                  if (patch.conditions !== undefined) {
                    yield* writeThroughToLiveCombatants(
                      sql,
                      id,
                      campaignId,
                      actor,
                      patch.conditions,
                    );
                  }

                  const sessionId = yield* currentSessionOf(sql, campaignId, actor);
                  if (sessionId !== undefined) {
                    yield* appendCharacterUpdated(sql, {
                      sessionId,
                      characterId: id,
                      live: yield* liveCombatantOf(sql, id, campaignId, actor),
                      detail: { name: character.name },
                    });
                  }
                  return { character, sessionId };
                }),
              )
              .pipe(
                Effect.tap(ring),
                Effect.map(({ character }) => character),
              ),
          ),

        damage: (campaignId, id, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              return yield* sql
                .withTransaction(
                  Effect.gen(function* () {
                    // The delta has to land on a row this actor may write, and
                    // it is the *character* the request names — so the refusal
                    // is the ordinary one before anything is looked up in the
                    // fight.
                    const before = yield* sql<{ readonly id: CharacterId }>`
                      select character.id from character
                      where character.id = ${id}
                        and ${rowWritable(sql, "character", campaignId, actor)}
                    `;
                    if (before.length === 0) {
                      return yield* new NotFound({ resource: "character", id });
                    }

                    const live = yield* liveCombatantOf(sql, id, campaignId, actor);
                    const sessionId =
                      live?.sessionId ?? (yield* currentSessionOf(sql, campaignId, actor));

                    // A repeat is recorded where the write was: against the run
                    // when it went through a fight, against the session when it
                    // did not. With neither there is nothing to have recorded
                    // it, and the delta applies as given — `CharacterDamage`
                    // says so rather than leaving it to be discovered.
                    const repeat =
                      live !== undefined
                        ? yield* requestAlreadyApplied(sql, live.runId, payload.requestId)
                        : sessionId !== undefined
                          ? yield* sessionRequestAlreadyApplied(sql, sessionId, payload.requestId)
                          : false;
                    if (repeat) {
                      return { character: yield* readCharacter(campaignId, id, actor), sessionId };
                    }

                    const applied = yield* applyCharacterDelta(
                      sql,
                      id,
                      campaignId,
                      actor,
                      payload.amount,
                      live,
                    );
                    if (sessionId !== undefined) {
                      yield* appendCharacterUpdated(sql, {
                        sessionId,
                        characterId: id,
                        live: applied.live,
                        detail: { amount: payload.amount, hpCurrent: applied.hpCurrent },
                        requestId: payload.requestId,
                      });
                    }
                    return { character: yield* readCharacter(campaignId, id, actor), sessionId };
                  }),
                )
                .pipe(
                  // Two taps that raced past the idempotency check together.
                  // The unique index refuses the second, and the honest answer
                  // is the state the first one produced.
                  Effect.catch((error) =>
                    SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                      ? Effect.map(readCharacter(campaignId, id, actor), (character) => ({
                          character,
                          sessionId: undefined,
                        }))
                      : Effect.fail(error),
                  ),
                  Effect.tap(ring),
                  Effect.map(({ character }) => character),
                );
            }),
          ),

        remove: (campaignId, id) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  const rows = yield* sql<{ readonly id: CharacterId }>`
                delete from character
                where character.id = ${id} and ${rowWritable(sql, "character", campaignId, actor)}
                returning character.id
              `;
                  if (rows.length === 0) return yield* new NotFound({ resource: "character", id });
                  const sessionId = yield* currentSessionOf(sql, campaignId, actor);
                  if (sessionId !== undefined) {
                    // Written *after* the delete, like `combatant-removed`: the
                    // row is gone and the log still has to say the party
                    // changed. Any live combatant seeded from them keeps its
                    // snapshot and loses only `character_id`, which is
                    // `on delete set null` and read by nothing.
                    yield* appendCharacterUpdated(sql, { sessionId, characterId: id });
                  }
                  return { character: undefined, sessionId };
                }),
              )
              .pipe(Effect.tap(ring), Effect.asVoid),
          ),
      };
    }),
  );
}
