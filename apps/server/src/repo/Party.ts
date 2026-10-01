import {
  Actor,
  CampaignCharacter,
  CampaignCharacterId,
  CampaignId,
  type Character,
  type CharacterDamage,
  CharacterId,
  Conflict,
  CurrentActor,
  NotFound,
  PartySeat,
  type PartyJoin,
  type PartyRest,
  type PartySeatUpdate,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlError, SqlSchema } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import {
  characterRow,
  claimCharacterRequest,
  liveFightsOf,
  portraitColumns,
  portraitSigner,
  restCharacterRow,
} from "./Characters.js";
import {
  classFromColumns,
  defined,
  dieOnSqlError,
  orNotFound,
  textArray,
  timestampColumns,
  uuidArray,
} from "./rows.js";
import { requestAlreadyApplied, sessionRequestAlreadyApplied } from "./SessionEvents.js";
import {
  appendCharacterUpdated,
  applyCharacterDelta,
  currentSessionOf,
  liveCombatantOf,
  writeThroughToLiveCombatants,
} from "./vitals.js";
import {
  campaignWritableById,
  characterVitalsWritable,
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
 * the shared character, and it reaches the character's **live trio**: the
 * seat PATCH writes conditions through and the delta moves hit points, both
 * exactly the writes the old campaign-scoped DM PATCH made, now confined to a
 * row the campaign actually holds. The one wider reach is the party's long
 * rest, which also resets the sheet's counted resources — through the owner's
 * own rest rule (`restCharacterRow`), never a second one. The rest of the
 * durable sheet is the owner's and is not writable from here at all — there is
 * no payload field for it, which is the boundary's stronger form.
 *
 * **Retiring is the only removal.** A seat is never deleted while its
 * campaign stands: `left_at` stamps it, the roster line survives as campaign
 * history, and every reach through the seat (reads, deltas, condition writes)
 * requires `left_at is null` — so a retired seat is inert everywhere at once.
 */

/** A `campaign_character` row as the wire reads it, decoded off `campaign_character.*`. */
const SeatRow = classFromColumns(CampaignCharacter, {
  ...CampaignCharacter.fields,
  ...timestampColumns,
  joinedAt: Schema.DateTimeUtcFromDate,
});

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
    /**
     * The creator's long rest for the table: every live seat's character, by
     * the owner's own rest rule (`restCharacterRow`), in one transaction, and
     * the roster as it then stands. Refused with `Conflict` while any of them
     * is in a live fight, at this table or another; a retired seat or a
     * deleted character is not rested. `requestId` is claimed per character,
     * so a retry rests nobody twice.
     */
    readonly rest: (
      campaignId: CampaignId,
      payload: PartyRest,
    ) => Effect.Effect<ReadonlyArray<PartySeat>, NotFound | Conflict, CurrentActor>;
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
      // The seat read is a character read, so it signs portraits exactly as the
      // owner's does: whoever may see the character sees its picture.
      const CharacterRow = characterRow(yield* portraitSigner);

      const ring = ({ sessionId }: { readonly sessionId: SessionId | undefined }) =>
        sessionId === undefined ? Effect.void : live.touched(sessionId);

      /** One live seat, through the reader's own predicate. */
      const seat = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ campaignId: CampaignId, id: CampaignCharacterId, actor: Actor }),
        ),
        Result: SeatRow,
        execute: ({ campaignId, id, actor }) => sql`
          select campaign_character.* from campaign_character
          where campaign_character.id = ${id}
            and campaign_character.left_at is null
            and ${ownedRowReadable(sql, "campaign_character", campaignId, actor)}
        `,
      });
      /** Every live seat this actor may see, in the order they sat down. */
      const seats = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, actor: Actor })),
        Result: SeatRow,
        execute: ({ campaignId, actor }) => sql`
          select campaign_character.* from campaign_character
          where campaign_character.left_at is null
            and ${ownedRowReadable(sql, "campaign_character", campaignId, actor)}
          order by campaign_character.joined_at asc, campaign_character.id asc
        `,
      });
      /**
       * The characters these seats hold. No predicate of its own: the reach is
       * the seat, and every id came out of a seat read that applied one.
       */
      const seated = SqlSchema.findAll({
        Request: Schema.toType(Schema.Array(CharacterId)),
        Result: CharacterRow,
        execute: (ids) => sql`
          select character.*, ${portraitColumns(sql)} from character
          where character.id = any(${uuidArray([...ids])})
        `,
      });

      /**
       * Seats with the character each holds, when it still exists: the seats,
       * then one statement for every seat's character, filed back by id.
       */
      const withCharacters = (read: ReadonlyArray<CampaignCharacter>) =>
        Effect.gen(function* () {
          const ids = read.flatMap((one) => (one.characterId === null ? [] : [one.characterId]));
          const characters = ids.length === 0 ? [] : yield* seated(ids);
          const byId = new Map(characters.map((character) => [character.id, character]));
          return read.map(
            (one) =>
              new PartySeat({
                seat: one,
                character: one.characterId === null ? null : (byId.get(one.characterId) ?? null),
              }),
          );
        });

      /** One seat with its character, through the reader's own predicate. */
      const readSeat = (campaignId: CampaignId, id: CampaignCharacterId, actor: Actor) =>
        seat({ campaignId, id, actor }).pipe(
          orNotFound("campaign_character", id),
          Effect.flatMap((one) => withCharacters([one])),
          Effect.map((read) => read[0]!),
        );

      /** Every live seat this actor may see, with its character. */
      const readSeats = (campaignId: CampaignId, actor: Actor) =>
        Effect.flatMap(seats({ campaignId, actor }), withCharacters);

      /**
       * Every character at a live seat here, locked in id order so two rests
       * (or a rest and a seat write) queue rather than interleave. The reach is
       * the seat-side vitals predicate, the same one the delta and conditions
       * use.
       */
      const party = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, actor: Actor })),
        Result: CharacterRow,
        execute: ({ campaignId, actor }) => sql`
          select character.*, ${portraitColumns(sql)} from character
          where ${characterVitalsWritable(sql, campaignId, actor)}
          order by character.id
          for update
        `,
      });

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              return yield* readSeats(campaignId, actor);
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
                    // hit points and inspiration are live on the shared
                    // character only — there is deliberately no combatant copy
                    // — and ride the same creator-owned seat PATCH. A seat
                    // whose character has been deleted has nothing live to
                    // write, and the seat edit stands alone.
                    let sessionId: SessionId | undefined = undefined;
                    const liveColumns = defined({
                      conditions: textArray(patch.conditions),
                      temp_hp: patch.tempHp,
                      inspiration: patch.inspiration,
                    });
                    if (Object.keys(liveColumns).length > 0 && characterId !== null) {
                      yield* sql`
                        update character set ${sql.update(liveColumns)}, updated_at = now()
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
                            ...(patch.inspiration === undefined
                              ? {}
                              : { inspiration: patch.inspiration }),
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

        rest: (campaignId, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              return yield* sql
                .withTransaction(
                  Effect.gen(function* () {
                    // The creator's act: anybody else is refused as if the
                    // table were not there, the ordinary `NotFound`.
                    const creator = yield* sql`
                      select 1 where ${campaignWritableById(sql, campaignId, actor)}
                    `;
                    if (creator.length === 0) {
                      return yield* new NotFound({ resource: "campaign", id: campaignId });
                    }

                    const reach = characterVitalsWritable(sql, campaignId, actor);
                    const before = yield* party({ campaignId, actor });

                    // The owner's rule refuses a rest mid-fight anywhere; so
                    // does this, before anything is written, with one read for
                    // the whole party. Another table's fight is not named — its
                    // campaign is not this creator's.
                    const fights = yield* liveFightsOf(
                      sql,
                      before.map((character) => character.id),
                    );
                    for (const character of before) {
                      const fight = fights.get(character.id);
                      if (fight === undefined) continue;
                      return yield* new Conflict({
                        message:
                          fight.campaignId === campaignId
                            ? "Rest after the fight; the party is on the table."
                            : `Rest after the fight; ${character.name} is on another table right now.`,
                      });
                    }

                    const sessionId = yield* currentSessionOf(sql, campaignId, actor);
                    let rested = 0;
                    for (const character of before) {
                      if (!(yield* claimCharacterRequest(sql, character.id, payload.requestId))) {
                        continue;
                      }
                      const { detail } = yield* restCharacterRow(
                        sql,
                        CharacterRow,
                        character,
                        payload.kind,
                        0,
                        reach,
                      );
                      rested += 1;
                      if (sessionId !== undefined) {
                        yield* appendCharacterUpdated(sql, {
                          sessionId,
                          characterId: character.id,
                          live: undefined,
                          detail,
                        });
                      }
                    }
                    return {
                      seats: yield* readSeats(campaignId, actor),
                      sessionId: rested === 0 ? undefined : sessionId,
                    };
                  }),
                )
                .pipe(
                  Effect.tap(ring),
                  Effect.map(({ seats }) => seats),
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

              const characterBehind = (characterId: CharacterId) =>
                Effect.flatMap(seated([characterId]), ([character]) =>
                  character === undefined
                    ? Effect.fail(new NotFound({ resource: "character", id: characterId }))
                    : Effect.succeed(character),
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
