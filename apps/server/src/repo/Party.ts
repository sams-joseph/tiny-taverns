import {
  type Actor,
  CampaignCharacter,
  type CampaignCharacterId,
  type CampaignId,
  Character,
  type CharacterDamage,
  type CharacterId,
  CurrentActor,
  NotFound,
  PartySeat,
  type PartyJoin,
  type PartySeatUpdate,
  type SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { type CharacterRow, toCharacter } from "./Characters.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf } from "./rows.js";
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
  ownCharacter,
  ownedRowReadable,
  ownRowWritable,
  rowWritable,
} from "./visibility.js";

/**
 * The party: the seats at one campaign's table — `campaign_character`, the
 * join between a campaign and the shared, account-owned characters sitting at
 * it. See `packages/api/src/Party.ts` for the model and `repo/Characters.ts`
 * for the other half; between them they are the continuity decision of
 * 2026-09-01 in repositories.
 *
 * What the seat owns is the campaign's facts — when it joined and left, the
 * display snapshots, and the campaign-scoped `visibility`. What it reaches is
 * the shared character, and it reaches the character's **live trio only**: the
 * seat PATCH writes conditions through and the delta moves hit points, both
 * exactly the writes the old campaign-scoped DM PATCH made, now confined to a
 * row the campaign actually holds. The durable half of the sheet is the
 * owner's and is not writable from here at all — there is no payload field
 * for it, which is the boundary's stronger form.
 *
 * **Retiring is the only removal.** A seat is never deleted while its
 * campaign stands: `left_at` stamps it, the roster line survives as campaign
 * history, and every reach through the seat (reads, deltas, condition writes)
 * requires `left_at is null` — so a retired seat is inert everywhere at once.
 */

interface SeatRow extends ProvenanceColumns {
  readonly id: CampaignCharacterId;
  readonly campaign_id: CampaignId;
  readonly character_id: CharacterId | null;
  readonly account_id: string;
  readonly display_name: string;
  readonly player_display_name: string | null;
  readonly joined_at: Date;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const toSeat = (row: SeatRow): CampaignCharacter =>
  new CampaignCharacter({
    id: row.id,
    campaignId: row.campaign_id,
    characterId: row.character_id,
    accountId: row.account_id as CampaignCharacter["accountId"],
    displayName: row.display_name,
    playerDisplayName: row.player_display_name,
    ...provenanceOf(row),
    joinedAt: DateTime.fromDateUnsafe(row.joined_at),
    createdAt: DateTime.fromDateUnsafe(row.created_at),
    updatedAt: DateTime.fromDateUnsafe(row.updated_at),
  });

/** A seat row with its character alongside, when the character still exists. */
type SeatWithCharacterRow = SeatRow & {
  readonly [K in keyof CharacterRow as `character_${K & string}`]: CharacterRow[K] | null;
};

/**
 * The character's columns, prefixed so they can share a row object with the
 * seat's. The character's own `id` needs no alias: the seat's `character_id`
 * *is* the pointer, and the join condition makes the two one value.
 */
const characterColumns = (sql: SqlClient.SqlClient) => sql`
  character.account_id as character_account_id,
  character.name as character_name, character.player_name as character_player_name,
  character.level as character_level, character.race as character_race,
  character.subrace as character_subrace, character.class_name as character_class_name,
  character.descriptor as character_descriptor, character.ac as character_ac,
  character.hp_max as character_hp_max, character.hp_current as character_hp_current,
  character.temp_hp as character_temp_hp, character.conditions as character_conditions,
  character.sheet_url as character_sheet_url, character.body as character_body,
  character.version as character_version, character.visibility as character_visibility,
  character.origin as character_origin,
  character.assistant_turn_id as character_assistant_turn_id,
  character.created_at as character_created_at, character.updated_at as character_updated_at
`;

const characterOf = (row: SeatWithCharacterRow): Character | null => {
  if (row.character_id === null || row.character_name === null) return null;
  return toCharacter({
    id: row.character_id,
    account_id: row.character_account_id!,
    name: row.character_name,
    player_name: row.character_player_name,
    level: row.character_level,
    race: row.character_race,
    subrace: row.character_subrace,
    class_name: row.character_class_name,
    descriptor: row.character_descriptor,
    ac: row.character_ac,
    hp_max: row.character_hp_max,
    hp_current: row.character_hp_current,
    temp_hp: row.character_temp_hp!,
    conditions: row.character_conditions!,
    sheet_url: row.character_sheet_url,
    body: row.character_body!,
    version: row.character_version!,
    visibility: row.character_visibility!,
    origin: row.character_origin!,
    assistant_turn_id: row.character_assistant_turn_id,
    created_at: row.character_created_at!,
    updated_at: row.character_updated_at!,
  });
};

const toPartySeat = (row: SeatWithCharacterRow): PartySeat =>
  new PartySeat({ seat: toSeat(row), character: characterOf(row) });

export class Party extends Context.Service<
  Party,
  {
    /**
     * The roster: every live seat this actor may see, with the shared
     * character each holds. `ownedRowReadable` over the seat is the whole
     * gate — a `shared` seat, or your own — so a `dm` seat is absent from a
     * player's answer, character and all.
     */
    readonly list: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<PartySeat>, NotFound, CurrentActor>;
    /**
     * The owner seats their own character. Seating one already seated here is
     * the same success — a double-tapped Join is one person joining once.
     */
    readonly join: (
      campaignId: CampaignId,
      payload: PartyJoin,
    ) => Effect.Effect<PartySeat, NotFound, CurrentActor>;
    /**
     * The creator's seat PATCH: `visibility` and the display line on the seat
     * itself, and `conditions` written through to the shared character and to
     * every live combatant of this campaign's fights — one transaction, the
     * `vitals.ts` rule.
     */
    readonly update: (
      campaignId: CampaignId,
      id: CampaignCharacterId,
      patch: PartySeatUpdate,
    ) => Effect.Effect<PartySeat, NotFound, CurrentActor>;
    /** Retire a seat — the owner's own, or any seat for the creator. */
    readonly leave: (
      campaignId: CampaignId,
      id: CampaignCharacterId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
    /**
     * The delta, through the seat: the creator moving the shared character's
     * hit points, routed through the live combatant when a fight is on the
     * table so there is one clamp — `Combatants.damage`'s twin, exactly as
     * the old character-scoped delta was.
     */
    readonly damage: (
      campaignId: CampaignId,
      id: CampaignCharacterId,
      payload: CharacterDamage,
    ) => Effect.Effect<Character, NotFound, CurrentActor>;
  }
>()("Party") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      const ring = ({ sessionId }: { readonly sessionId: SessionId | undefined }) =>
        sessionId === undefined ? Effect.void : live.touched(sessionId);

      /** One seat with its character, through the reader's own predicate. */
      const readSeat = (
        campaignId: CampaignId,
        id: CampaignCharacterId,
        actor: Actor,
      ): Effect.Effect<PartySeat, NotFound> =>
        sql<SeatWithCharacterRow>`
          select campaign_character.*, ${characterColumns(sql)}
          from campaign_character
          left join character on character.id = campaign_character.character_id
          where campaign_character.id = ${id}
            and campaign_character.left_at is null
            and ${ownedRowReadable(sql, "campaign_character", campaignId, actor)}
        `.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows.length === 0
              ? new NotFound({ resource: "campaign_character", id })
              : Effect.succeed(toPartySeat(rows[0]!)),
          ),
        );

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* sql<SeatWithCharacterRow>`
                select campaign_character.*, ${characterColumns(sql)}
                from campaign_character
                left join character on character.id = campaign_character.character_id
                where campaign_character.left_at is null
                  and ${ownedRowReadable(sql, "campaign_character", campaignId, actor)}
                order by campaign_character.joined_at asc, campaign_character.id asc
              `;
              return rows.map(toPartySeat);
            }),
          ),

        join: (campaignId, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignReadable(sql, campaignId, actor);
                // The character must be the caller's own — `ownCharacter`, so
                // the refusal for somebody else's is the ordinary `NotFound`
                // and discloses nothing about whose it is.
                const owned = yield* sql<{
                  readonly id: CharacterId;
                  readonly name: string;
                  readonly player_name: string | null;
                }>`
                  select character.id, character.name, character.player_name from character
                  where character.id = ${payload.characterId} and ${ownCharacter(sql, actor)}
                `;
                if (owned.length === 0) {
                  return yield* new NotFound({ resource: "character", id: payload.characterId });
                }
                // Already seated here is the same success. The partial unique
                // index (`campaign_character_one_active`) holds the race two
                // tabs can run; the read below answers the survivor.
                const seated = yield* sql<{ readonly id: CampaignCharacterId }>`
                  select campaign_character.id from campaign_character
                  where campaign_character.campaign_id = ${campaignId}
                    and campaign_character.character_id = ${payload.characterId}
                    and campaign_character.left_at is null
                `;
                if (seated.length === 1) return yield* readSeat(campaignId, seated[0]!.id, actor);

                const inserted = yield* sql<{ readonly id: CampaignCharacterId }>`
                  insert into campaign_character
                    (campaign_id, group_id, character_id, account_id,
                     display_name, player_display_name)
                  select ${campaignId}, campaign.group_id, ${payload.characterId},
                         ${actor.accountId}, ${owned[0]!.name}, ${owned[0]!.player_name}
                  from campaign where campaign.id = ${campaignId}
                  returning campaign_character.id
                `;
                return yield* readSeat(campaignId, inserted[0]!.id, actor);
              }),
            ),
          ),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              return yield* sql
                .withTransaction(
                  Effect.gen(function* () {
                    const columns = defined({
                      visibility: patch.visibility,
                      player_display_name: patch.playerDisplayName,
                    });
                    const rows = yield* sql<{ readonly character_id: CharacterId | null }>`
                      update campaign_character
                      set ${
                        Object.keys(columns).length === 0
                          ? sql`updated_at = now()`
                          : sql`${sql.update(columns)}, updated_at = now()`
                      }
                      where campaign_character.id = ${id}
                        and campaign_character.left_at is null
                        and ${rowWritable(sql, "campaign_character", campaignId, actor)}
                      returning campaign_character.character_id
                    `;
                    if (rows.length === 0) {
                      return yield* Effect.fail(
                        new NotFound({ resource: "campaign_character", id }),
                      );
                    }

                    const characterId = rows[0]!.character_id;
                    // Conditions are the live write-through: the shared
                    // character and every live combatant of *this* campaign
                    // move in this transaction, or none of them do. Temporary
                    // hit points are live on the shared character only — there
                    // is deliberately no combatant copy — and ride the same
                    // creator-owned seat PATCH. A seat whose character has
                    // been deleted has nothing live to write, and the seat edit
                    // stands alone.
                    let sessionId: SessionId | undefined = undefined;
                    if (
                      (patch.conditions !== undefined || patch.tempHp !== undefined) &&
                      characterId !== null
                    ) {
                      const characterColumns = defined({
                        conditions: patch.conditions,
                        temp_hp: patch.tempHp,
                      });
                      yield* sql`
                        update character set ${sql.update(characterColumns)}, updated_at = now()
                        where character.id = ${characterId}
                      `;
                      if (patch.conditions !== undefined) {
                        yield* writeThroughToLiveCombatants(
                          sql,
                          characterId,
                          campaignId,
                          actor,
                          patch.conditions,
                        );
                      }
                      const inFight = yield* liveCombatantOf(sql, characterId, campaignId, actor);
                      sessionId =
                        inFight?.sessionId ?? (yield* currentSessionOf(sql, campaignId, actor));
                      if (sessionId !== undefined) {
                        yield* appendCharacterUpdated(sql, {
                          sessionId,
                          characterId,
                          live: inFight,
                          detail: {
                            ...(patch.conditions === undefined
                              ? {}
                              : { conditions: patch.conditions }),
                            ...(patch.tempHp === undefined ? {} : { tempHp: patch.tempHp }),
                          },
                        });
                      }
                    }
                    return { seat: yield* readSeat(campaignId, id, actor), sessionId };
                  }),
                )
                .pipe(
                  Effect.tap(ring),
                  Effect.map(({ seat }) => seat),
                );
            }),
          ),

        leave: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // The owner retires their own seat; the creator retires any.
              // `or` of two complete predicates, `copyableIntoCampaign`'s
              // shape — neither half is a fragment of the other.
              const rows = yield* sql<{ readonly id: CampaignCharacterId }>`
                update campaign_character set left_at = now(), updated_at = now()
                where campaign_character.id = ${id}
                  and campaign_character.left_at is null
                  and ${sql.or([
                    ownRowWritable(sql, "campaign_character", campaignId, actor),
                    rowWritable(sql, "campaign_character", campaignId, actor),
                  ])}
                returning campaign_character.id
              `;
              if (rows.length === 0) {
                return yield* Effect.fail(new NotFound({ resource: "campaign_character", id }));
              }
            }),
          ),

        damage: (campaignId, id, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;

              const characterBehind = (
                characterId: CharacterId,
              ): Effect.Effect<Character, NotFound> =>
                sql<CharacterRow>`
                  select * from character where character.id = ${characterId}
                `.pipe(
                  Effect.orDie,
                  Effect.flatMap((rows) =>
                    rows.length === 0
                      ? new NotFound({ resource: "character", id: characterId })
                      : Effect.succeed(toCharacter(rows[0]!)),
                  ),
                );

              return yield* sql
                .withTransaction(
                  Effect.gen(function* () {
                    // The delta lands through a seat this actor may write —
                    // the creator's predicate — and the refusal is the
                    // ordinary `NotFound` naming the seat the path named.
                    const seats = yield* sql<{ readonly character_id: CharacterId | null }>`
                      select campaign_character.character_id from campaign_character
                      where campaign_character.id = ${id}
                        and campaign_character.left_at is null
                        and ${rowWritable(sql, "campaign_character", campaignId, actor)}
                    `;
                    if (seats.length === 0) {
                      return yield* Effect.fail(
                        new NotFound({ resource: "campaign_character", id }),
                      );
                    }
                    const characterId = seats[0]!.character_id;
                    // A seat whose character is gone holds no hit points; the
                    // honest refusal names the character the seat lost.
                    if (characterId === null) {
                      return yield* Effect.fail(new NotFound({ resource: "character", id }));
                    }

                    const inFight = yield* liveCombatantOf(sql, characterId, campaignId, actor);
                    const sessionId =
                      inFight?.sessionId ?? (yield* currentSessionOf(sql, campaignId, actor));

                    const repeat =
                      inFight !== undefined
                        ? yield* requestAlreadyApplied(sql, inFight.runId, payload.requestId)
                        : sessionId !== undefined
                          ? yield* sessionRequestAlreadyApplied(sql, sessionId, payload.requestId)
                          : false;
                    if (repeat) {
                      return { character: yield* characterBehind(characterId), sessionId };
                    }

                    const applied = yield* applyCharacterDelta(
                      sql,
                      characterId,
                      campaignId,
                      actor,
                      payload.amount,
                      inFight,
                    );
                    if (sessionId !== undefined) {
                      yield* appendCharacterUpdated(sql, {
                        sessionId,
                        characterId,
                        live: applied.live,
                        detail: { amount: payload.amount, hpCurrent: applied.hpCurrent },
                        requestId: payload.requestId,
                      });
                    }
                    return { character: yield* characterBehind(characterId), sessionId };
                  }),
                )
                .pipe(
                  // Two taps that raced past the idempotency check together:
                  // the unique index refuses the second, and the honest answer
                  // is the state the first produced — re-read through the seat.
                  Effect.catch((error) =>
                    SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                      ? Effect.map(readSeat(campaignId, id, actor), (seat) =>
                          seat.character === null
                            ? { character: undefined, sessionId: undefined }
                            : { character: seat.character, sessionId: undefined },
                        )
                      : Effect.fail(error),
                  ),
                  Effect.tap(ring),
                  Effect.flatMap(({ character }) =>
                    character === undefined
                      ? Effect.fail(new NotFound({ resource: "character", id }))
                      : Effect.succeed(character),
                  ),
                );
            }),
          ),
      };
    }),
  );
}
