import {
  type Actor,
  type CampaignId,
  Character,
  type CharacterId,
  type CharacterOwnCreate,
  type CharacterOwnUpdate,
  CharacterSeatRef,
  type CharacterSheet,
  Conflict,
  CurrentActor,
  NotFound,
  OwnedCharacter,
  type RaceBody,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import {
  type AssistantOrigin,
  assistantColumns,
  defined,
  dieOnSqlError,
  type ProvenanceColumns,
  setClause,
} from "./rows.js";
import { ensureCampaignReadable, ownCharacter, usableInCampaign } from "./visibility.js";

/**
 * The character: **account-owned, top-level, one copy of playable state** —
 * the captain's continuity decision of 2026-09-01, in a repository.
 *
 * Everything here is the owner's: reads and writes compare
 * `character.account_id` to the actor's own account and to nothing a caller
 * supplied, the Library's shape rather than the campaign predicates'. The
 * campaign side — the party — is `repo/Party.ts`, which reaches the shared
 * character *through a seat* and moves nothing but the live trio.
 *
 * ### Concurrent campaigns write one row, and the answer is explicit
 *
 * The decision requires the concurrency to be handled rather than accepted:
 *
 * - **The live trio is atomic in SQL.** `vitals.ts` clamps hit points in the
 *   statement that moves them, so two deltas landing together total both —
 *   from two tabs, or from two campaigns' fights.
 * - **The durable half is versioned.** Every UPDATE here bumps
 *   `character.version`; a caller that read the sheet may send
 *   `expectedVersion` back and is refused with a `Conflict` when the row has
 *   moved on. Omitted, the write is last-writer-wins — the old behaviour,
 *   opted into rather than silently the only option.
 *
 * ### History is snapshots, not freezes
 *
 * Nothing here rewrites what a campaign recorded: a `combatant` copies display
 * fields at seed time, a seat snapshots `display_name` at join, and deleting a
 * character leaves both standing (`combatant.character_id` and
 * `campaign_character.character_id` are `on delete set null`).
 */

interface CharacterRow extends ProvenanceColumns {
  readonly id: CharacterId;
  readonly account_id: string;
  readonly name: string;
  readonly player_name: string | null;
  readonly level: number | null;
  readonly race: string | null;
  readonly subrace: string | null;
  readonly class_name: string | null;
  /** `generated always as … stored` — refused by Postgres on the way in. */
  readonly descriptor: string | null;
  readonly ac: number | null;
  readonly hp_max: number | null;
  /** Null until somebody says. Not zero, and not full. See `0014`. */
  readonly hp_current: number | null;
  readonly temp_hp: number;
  readonly conditions: ReadonlyArray<string>;
  readonly sheet_url: string | null;
  readonly body: CharacterSheet;
  readonly version: number;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** One mapper per table — `repo/Party.ts` imports it rather than restating. */
export const toCharacter = (row: CharacterRow): Character =>
  new Character({
    id: row.id,
    accountId: row.account_id as Character["accountId"],
    name: row.name,
    playerName: row.player_name,
    level: row.level,
    race: row.race,
    subrace: row.subrace,
    className: row.class_name,
    descriptor: row.descriptor,
    ac: row.ac,
    hpMax: row.hp_max,
    hpCurrent: row.hp_current,
    tempHp: row.temp_hp,
    conditions: row.conditions,
    sheetUrl: row.sheet_url,
    sheet: row.body,
    version: row.version,
    // Not `provenanceOf`: the shared character carries no `visibility` — who
    // at a table may see it is the seat's question now — so the row's inert
    // column must not reach the wire.
    origin: row.origin,
    assistantTurnId: row.assistant_turn_id,
    createdAt: DateTime.fromDateUnsafe(row.created_at),
    updatedAt: DateTime.fromDateUnsafe(row.updated_at),
  });

export type { CharacterRow };

const encodeSheet = (sheet: CharacterSheet): string => JSON.stringify(sheet);

const present = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

const subraceMismatch = (race: string, subrace: string): Conflict =>
  new Conflict({
    message: `"${subrace}" is not a subrace of "${race}" in a campaign this character is at. Pick one contained by that race or leave subrace blank.`,
  });

const missingRaceForSubrace = (subrace: string): Conflict =>
  new Conflict({
    message: `"${subrace}" needs a race before it can be checked. Pick the race it belongs to or leave subrace blank.`,
  });

const staleVersion = (expected: number, actual: number): Conflict =>
  new Conflict({
    message: `the sheet moved on while you were editing (version ${String(actual)}, you read ${String(expected)}). Reload it and make the change again.`,
  });

/**
 * Resolve a race/subrace pair against one campaign's vocabulary — the same
 * check the create form and Hob make, composed over `usableInCampaign` — the
 * same predicate `Options.list` fills the pickers from, so what is pickable is
 * exactly what validates.
 * Answers whether it resolved rather than failing, so a shared character can
 * be checked against every table it sits at.
 */
const subraceResolves = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
  race: string,
  subrace: string,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly name: string; readonly body: RaceBody }>`
      select name, body from character_option
      where kind = 'race'
        and lower(name) = lower(${race})
        and ${usableInCampaign(sql, "character_option", campaignId, actor)}
    `.pipe(Effect.orDie);
    return rows.some((row) =>
      row.body.subraces.some((candidate) => candidate.name.toLowerCase() === subrace.toLowerCase()),
    );
  });

/**
 * A named subrace must be contained by the named race in **some** campaign the
 * character can be checked against. At creation that is the one campaign the
 * seat goes into; on the shared sheet it is every table the character sits at,
 * because one character crossing campaigns cannot be bound to one table's
 * vocabulary — the continuity decision's own consequence. With no readable
 * campaign to check against, the label is free text, exactly as a race with no
 * vocabulary entry always was.
 */
const validateSubrace = (
  sql: SqlClient.SqlClient,
  campaignIds: ReadonlyArray<CampaignId>,
  actor: Actor,
  race: string | null | undefined,
  subrace: string | null | undefined,
): Effect.Effect<void, Conflict> =>
  Effect.gen(function* () {
    const namedSubrace = present(subrace);
    if (namedSubrace === undefined) return;
    const namedRace = present(race);
    if (namedRace === undefined) return yield* missingRaceForSubrace(namedSubrace);
    if (campaignIds.length === 0) return;

    for (const campaignId of campaignIds) {
      if (yield* subraceResolves(sql, campaignId, actor, namedRace, namedSubrace)) return;
    }
    return yield* subraceMismatch(namedRace, namedSubrace);
  });

/** The campaigns a character is currently seated at — the validation targets. */
const seatedCampaignsOf = (
  sql: SqlClient.SqlClient,
  characterId: CharacterId,
): Effect.Effect<ReadonlyArray<CampaignId>> =>
  sql<{ readonly campaign_id: CampaignId }>`
    select campaign_character.campaign_id from campaign_character
    where campaign_character.character_id = ${characterId}
      and campaign_character.left_at is null
  `.pipe(
    Effect.map((rows) => rows.map((row) => row.campaign_id)),
    Effect.orDie,
  );

interface SeatRefRow {
  readonly character_id: CharacterId;
  readonly id: string;
  readonly campaign_id: CampaignId;
  readonly joined_at: Date;
}

export class Characters extends Context.Service<
  Characters,
  {
    /**
     * Every character this account owns, with everywhere each is seated —
     * `GET /me/characters`. Cannot fail: an account that owns nothing gets an
     * empty list, and there is no campaign in the path for a `NotFound` to be
     * about.
     */
    readonly mine: Effect.Effect<ReadonlyArray<OwnedCharacter>, never, CurrentActor>;
    /**
     * Writing one down, campaign-first: the top-level character and its seat
     * at the named campaign, one transaction. `ensureCampaignReadable` is the
     * gate — a live participant at a shared table, or the creator — and the
     * seat's deferred key holds the participation structurally underneath.
     */
    readonly createOwn: (
      campaignId: CampaignId,
      payload: CharacterOwnCreate,
      /**
       * The turn that drafted them, when the owner accepted a Hob proposal.
       * `repo/Proposals.ts` is the only caller that passes it.
       */
      from?: AssistantOrigin,
    ) => Effect.Effect<Character, NotFound | Conflict, CurrentActor>;
    /**
     * The owner's PATCH over the shared sheet. `expectedVersion`, when sent,
     * is the optimistic-concurrency check; see the header.
     */
    readonly updateOwn: (
      id: CharacterId,
      patch: CharacterOwnUpdate,
    ) => Effect.Effect<Character, NotFound | Conflict, CurrentActor>;
    /**
     * Deleting a character retires its live seats in the same transaction —
     * the deferred participation key allows a retired seat to keep standing —
     * and every snapshot survives: the seats keep their display names with
     * `character_id` nulled, and combatants keep everything they copied.
     */
    readonly removeOwn: (id: CharacterId) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Characters") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        mine: dieOnSqlError(
          Effect.gen(function* () {
            const actor = yield* CurrentActor;
            const rows = yield* sql<CharacterRow>`
              select * from character
              where ${ownCharacter(sql, actor)}
              order by character.created_at asc, character.id asc
            `;
            if (rows.length === 0) return [];
            const seats = yield* sql<SeatRefRow>`
              select campaign_character.character_id, campaign_character.id,
                     campaign_character.campaign_id, campaign_character.joined_at
              from campaign_character
              where campaign_character.account_id = ${actor.accountId}
                and campaign_character.left_at is null
                and campaign_character.character_id is not null
              order by campaign_character.joined_at asc
            `;
            return rows.map(
              (row) =>
                new OwnedCharacter({
                  character: toCharacter(row),
                  seats: seats
                    .filter((seat) => seat.character_id === row.id)
                    .map(
                      (seat) =>
                        new CharacterSeatRef({
                          campaignCharacterId: seat.id as CharacterSeatRef["campaignCharacterId"],
                          campaignId: seat.campaign_id,
                          joinedAt: DateTime.fromDateUnsafe(seat.joined_at),
                        }),
                    ),
                }),
            );
          }),
        ),

        createOwn: (campaignId, payload, from) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignReadable(sql, campaignId, actor);
                yield* validateSubrace(sql, [campaignId], actor, payload.race, payload.subrace);
                const rows = yield* sql<CharacterRow>`
                  insert into character ${sql.insert(
                    defined({
                      account_id: actor.accountId,
                      name: payload.name,
                      player_name: payload.playerName,
                      level: payload.level,
                      race: payload.race,
                      subrace: payload.subrace,
                      class_name: payload.className,
                      ac: payload.ac,
                      hp_max: payload.hpMax,
                      sheet_url: payload.sheetUrl,
                      body: payload.sheet && encodeSheet(payload.sheet),
                      ...assistantColumns(from),
                    }),
                  )}
                  returning *
                `;
                const character = toCharacter(rows[0]!);
                // The seat, in the same transaction: campaign-first means the
                // character exists *at a table* from its first moment, exactly
                // as the old campaign-scoped row did. The group id is read off
                // the campaign's own row — never the payload — so the seat's
                // composite key into `campaign` cannot be lied to, and the
                // display name is snapshotted from what was just written. The
                // deferred participation key underneath holds "seated means a
                // live member (or the creator)" structurally at COMMIT.
                yield* sql`
                  insert into campaign_character
                    (campaign_id, group_id, character_id, account_id,
                     display_name, player_display_name, origin, assistant_turn_id)
                  select ${campaignId}, campaign.group_id, ${character.id}, ${actor.accountId},
                         ${character.name}, ${character.playerName},
                         ${from === undefined ? "authored" : "assistant"},
                         ${from?.assistantTurnId ?? null}
                  from campaign where campaign.id = ${campaignId}
                `;
                return character;
              }),
            ),
          ),

        updateOwn: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const before = yield* sql<{
                readonly race: string | null;
                readonly subrace: string | null;
                readonly version: number;
              }>`
                select race, subrace, version from character
                where character.id = ${id} and ${ownCharacter(sql, actor)}
              `;
              if (before.length === 0) return yield* new NotFound({ resource: "character", id });
              if (
                patch.expectedVersion !== undefined &&
                patch.expectedVersion !== before[0]!.version
              ) {
                return yield* staleVersion(patch.expectedVersion, before[0]!.version);
              }
              const nextRace = patch.race === undefined ? before[0]!.race : patch.race;
              const nextSubrace = patch.subrace === undefined ? before[0]!.subrace : patch.subrace;
              if (nextRace !== before[0]!.race || nextSubrace !== before[0]!.subrace) {
                const campaigns = yield* seatedCampaignsOf(sql, id);
                yield* validateSubrace(sql, campaigns, actor, nextRace, nextSubrace);
              }
              const columns = defined({
                name: patch.name,
                player_name: patch.playerName,
                level: patch.level,
                race: patch.race,
                subrace: patch.subrace,
                class_name: patch.className,
                ac: patch.ac,
                hp_max: patch.hpMax,
                sheet_url: patch.sheetUrl,
                body: patch.sheet && encodeSheet(patch.sheet),
              });
              // `version = version + 1` rides in the same statement as the
              // check, so two racing writers cannot both pass one read: the
              // second UPDATE's `where` no longer matches the expected
              // version and returns no row.
              const rows = yield* sql<CharacterRow>`
                update character
                set ${setClause(sql, columns)}, version = character.version + 1
                where character.id = ${id}
                  and ${ownCharacter(sql, actor)}
                  and ${
                    patch.expectedVersion === undefined
                      ? sql`true`
                      : sql`character.version = ${patch.expectedVersion}`
                  }
                returning *
              `;
              if (rows.length === 0) {
                if (patch.expectedVersion !== undefined) {
                  const now = yield* sql<{ readonly version: number }>`
                    select version from character
                    where character.id = ${id} and ${ownCharacter(sql, actor)}
                  `;
                  if (now.length === 1) {
                    return yield* staleVersion(patch.expectedVersion, now[0]!.version);
                  }
                }
                return yield* new NotFound({ resource: "character", id });
              }
              return toCharacter(rows[0]!);
            }),
          ),

        removeOwn: (id) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                // Retire the live seats first: the roster lines stay, saying
                // who sat here, and `on delete set null (character_id)` clears
                // the pointer in the delete below.
                yield* sql`
                  update campaign_character set left_at = now(), updated_at = now()
                  where campaign_character.character_id = ${id}
                    and campaign_character.account_id = ${actor.accountId}
                    and campaign_character.left_at is null
                `;
                const rows = yield* sql<{ readonly id: CharacterId }>`
                  delete from character
                  where character.id = ${id} and ${ownCharacter(sql, actor)}
                  returning character.id
                `;
                if (rows.length === 0) return yield* new NotFound({ resource: "character", id });
              }),
            ),
          ),
      };
    }),
  );
}
