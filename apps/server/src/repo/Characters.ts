import {
  type AccountId,
  type Actor,
  type CampaignId,
  Character,
  type CharacterAssign,
  type CharacterCreate,
  type CharacterDamage,
  type CharacterId,
  type CharacterOwnUpdate,
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
  memberOfCampaign,
  ownedRowReadable,
  ownRowReadable,
  ownRowWritable,
  rowCampaign,
  rowWritable,
} from "./visibility.js";

interface CharacterRow extends ProvenanceColumns {
  readonly id: CharacterId;
  readonly campaign_id: CampaignId;
  /** Whose character it is — null until a DM assigns it. See `assign`. */
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
 * ### What has changed: `account_id` means something
 *
 * It is still absent from `CharacterCreate` and `CharacterUpdate`, and that has
 * become *more* load-bearing rather than less. `assign` is its own method
 * behind its own endpoint, so the DM-only act of saying whose character this is
 * cannot be reached from the PATCH — which is where a player will one day edit
 * their own sheet.
 *
 * The campaign-scoped reads are `ownedRowReadable` rather than `rowReadable`,
 * which is the whole of the read change: **the account a character names may
 * read it whatever its `visibility` says**, still inside a campaign they are a
 * live member of and still only while the DM has shared that campaign.
 *
 * `mine` is the third read and the only one with no campaign in its path. It
 * composes that same predicate conjoined with ownership, so it is narrower than
 * the other two rather than a way round them; see `repo/visibility.ts`'s
 * `ownRowReadable` and `rowCampaign`.
 *
 * ### And a player writes now, in exactly one place
 *
 * `updateOwn` — `PATCH /me/characters/:characterId` — is **the first write in
 * the product a non-DM may make.** Every other method in this file is
 * `rowWritable` and therefore DM-only, unchanged; this one is `ownRowWritable`,
 * which is ownership conjoined with the same campaign gate the reads use.
 *
 * Two boundaries hold it, and they are different kinds of thing on purpose.
 * **Which rows** is the predicate: yours, and nothing else. **Which columns** is
 * the payload: `CharacterOwnUpdate` has no field for `hpCurrent`, `tempHp`,
 * `conditions`, `visibility` or `accountId`, so the live half of a character
 * cannot be named by a player at all. A predicate cannot bound a column list and
 * a schema cannot bound a row set — reaching for one to do the other is how this
 * gets wide.
 */
export class Characters extends Context.Service<
  Characters,
  {
    readonly list: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<Character>, NotFound, CurrentActor>;
    /**
     * Every character this account plays, across every table it is at —
     * `GET /me/characters`.
     *
     * **The only read on this table that names no campaign**, and the second in
     * the product after `Memberships.mine`. It is the read a player's own
     * screen starts from: which characters are mine, and which table is each
     * one at.
     *
     * It cannot fail. An account that is a member of nothing, or of a campaign
     * nobody has shared, gets an empty list — the same honest emptiness
     * `GET /me/campaigns` gives, and for the same reason. There is no campaign
     * in the path for a `NotFound` to be about.
     *
     * `ownRowReadable` is `ownedRowReadable` conjoined with ownership, so this
     * cannot return a row `characters.list` would refuse in that row's own
     * campaign; what it adds is the narrowing to *mine*. Ordered like `list`,
     * so a character appears in the same relative position in both reads.
     */
    readonly mine: Effect.Effect<ReadonlyArray<Character>, never, CurrentActor>;
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
     * A player editing their own sheet — `PATCH /me/characters/:characterId`,
     * and **the first write in the product a non-DM may make.**
     *
     * The twin of `mine` and the mirror of `update`, and the differences from
     * `update` are all of it:
     *
     * - **No campaign id, for the reason `mine` has none.** The campaign is the
     *   row's own, so there is nothing for a caller to claim and nothing for a
     *   predicate to have to refuse. See `ownRowWritable` with
     *   `rowCampaign`.
     * - **A narrower payload.** `CharacterOwnUpdate` cannot express
     *   `hpCurrent`, `tempHp`, `conditions`, `visibility` or `accountId`, so
     *   the live half of a character and the disclosure seam are out of reach
     *   by shape rather than by a check here.
     * - **`ownRowWritable`, which is not `rowWritable`.** Writable because the
     *   row is theirs, not because they are the DM.
     *
     * `NotFound` covers every refusal, the same one a read gives.
     */
    readonly updateOwn: (
      id: CharacterId,
      patch: CharacterOwnUpdate,
    ) => Effect.Effect<Character, NotFound, CurrentActor>;
    /**
     * Whose character this is — the DM naming somebody at their own table.
     *
     * The account has to hold a live membership of *this* campaign, so the set
     * a DM can name is the set of people already there. `null` unassigns.
     */
    readonly assign: (
      campaignId: CampaignId,
      id: CharacterId,
      payload: CharacterAssign,
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
          where character.id = ${id} and ${ownedRowReadable(sql, "character", campaignId, actor)}
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
                where ${ownedRowReadable(sql, "character", campaignId, actor)}
                order by character.created_at asc
              `;
              return rows.map(toCharacter);
            }),
          ),

        mine: dieOnSqlError(
          Effect.gen(function* () {
            const actor = yield* CurrentActor;
            const rows = yield* sql<CharacterRow>`
              select * from character
              where ${ownRowReadable(sql, "character", rowCampaign(sql, "character"), actor)}
              order by character.created_at asc, character.id asc
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
                where character.id = ${id} and ${ownedRowReadable(sql, "character", campaignId, actor)}
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

        /**
         * The player's own PATCH — **one statement, and the only write in this
         * file that is not a transaction.**
         *
         * That is not an oversight, it is the reason the whole thing is safe:
         * every other write here may reach a second row, so it has to commit
         * with the first or not at all. This one cannot. `conditions` is the
         * only field `update` writes through to a fight and `CharacterOwnUpdate`
         * has no such field; a live combatant snapshots `display_name`,
         * `subtitle`, `player_name`, `ac` and `hp_max` at seed time and reads
         * none of them back. So a player's edit lands on exactly one row,
         * whether or not a fight is on the table — which is the strongest form
         * of *"never anything inside a live fight"* available: not a refusal at
         * fight time, but nothing a fight holds being expressible at all.
         *
         * **It rings no doorbell, and that is the same decision `vitals.ts`
         * already made one step out.** The bell exists to carry a live value to
         * a screen watching one, and nothing live moved. Ringing it would need a
         * player-reachable `currentSessionOf` — that helper composes
         * `campaignWritableById` and answers a player nothing — which is a new
         * read with a predicate of its own, for an event whose payload nothing
         * branches on. An open DM page stays stale until it refetches, exactly
         * as it does for a level-up typed between games.
         */
        updateOwn: (id, patch) =>
          dieOnSqlError(
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
                sheet_url: patch.sheetUrl,
                body: patch.sheet && encodeSheet(patch.sheet),
              });
              const rows = yield* sql<CharacterRow>`
                update character set ${setClause(sql, columns)}
                where character.id = ${id}
                  and ${ownRowWritable(sql, "character", rowCampaign(sql, "character"), actor)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "character", id });
              return toCharacter(rows[0]!);
            }),
          ),

        /**
         * Two statements, in this order, and the order is the disclosure
         * argument rather than a style.
         *
         * The write predicate is asked **first**, about the character the path
         * names. Anybody who is not the DM of this campaign is refused there,
         * with the ordinary `NotFound` naming the character, and learns nothing
         * at all about the account they named. Only a caller who has already
         * proved they may write this row reaches the membership question — and
         * that caller is the DM, who is entitled to a straight answer about who
         * is at their own table, which is why the second refusal names the
         * member rather than hiding behind the first.
         *
         * Folding both into one `WHERE` would collapse the two into a single
         * "no such character", which is safe and unhelpful: assigning to
         * somebody who has not accepted their invitation yet is a thing a DM
         * will do, and it deserves to say so.
         */
        assign: (campaignId, id, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  const writable = yield* sql<{ readonly id: CharacterId }>`
                    select character.id from character
                    where character.id = ${id}
                      and ${rowWritable(sql, "character", campaignId, actor)}
                  `;
                  if (writable.length === 0) {
                    return yield* new NotFound({ resource: "character", id });
                  }

                  // Not "any account". A character may only be handed to
                  // somebody who already holds a live membership here, which is
                  // what keeps `accountId` on the wire from being a way to name
                  // a stranger — and what makes the grant it carries no wider
                  // than the campaign it was granted in.
                  if (payload.accountId !== null) {
                    const member = yield* sql<{ readonly ok: boolean }>`
                      select ${memberOfCampaign(sql, campaignId, payload.accountId)} as ok
                    `;
                    if (member[0]?.ok !== true) {
                      return yield* new NotFound({ resource: "member", id: payload.accountId });
                    }
                  }

                  const rows = yield* sql<CharacterRow>`
                    update character set account_id = ${payload.accountId}
                    where character.id = ${id}
                      and ${rowWritable(sql, "character", campaignId, actor)}
                    returning *
                  `;
                  if (rows.length === 0) return yield* new NotFound({ resource: "character", id });
                  const character = toCharacter(rows[0]!);

                  // The same line `update` writes, for the same reason: the
                  // party changed while somebody's page is open. Nothing about
                  // a fight moves — `combatant` holds no owner — so there is
                  // nothing to write through.
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
