import { randomInt } from "node:crypto";
import {
  type Actor,
  type CampaignId,
  Character,
  type CharacterId,
  type CharacterOwnCreate,
  type CharacterOwnUpdate,
  type CharacterResourceSpend,
  CharacterSeatRef,
  type CharacterRest,
  type CharacterSheet,
  type CombatantId,
  Conflict,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  OwnedCharacter,
  type RaceBody,
  type SessionId,
  type SheetResource,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Option } from "effect";
import { LiveEvents } from "../live/LiveEvents.js";
import { SqlClient } from "effect/unstable/sql";
import {
  type AssistantOrigin,
  assistantColumns,
  defined,
  dieOnSqlError,
  type ProvenanceColumns,
  setClause,
} from "./rows.js";
import { appendCharacterUpdated, clampedCharacterHp } from "./vitals.js";
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

interface OpenSeatSessionRow {
  readonly session_id: SessionId;
  readonly combatant_id: CombatantId | null;
  readonly run_id: EncounterRunId | null;
}

interface LiveFightRow {
  readonly campaign_name: string;
}

const resourceMissing = (resourceId: string): NotFound =>
  new NotFound({ resource: "character_resource", id: resourceId });

const restWhileFighting = (campaignName: string): Conflict =>
  new Conflict({
    message: `Rest after the fight at ${campaignName}; this character is on the table there.`,
  });

const conModifier = (sheet: CharacterSheet): number => {
  const raw = sheet.abilities.find((ability) => ability.label.toUpperCase() === "CON")?.modifier;
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hitDieSides = (resource: SheetResource | undefined, sheet: CharacterSheet): number => {
  const raw =
    [resource?.unit, sheet.identity?.hitDice].find(
      (value): value is string => value !== undefined && /d\d+/i.test(value),
    ) ?? "";
  const parsed = /d(\d+)/i.exec(raw)?.[1];
  const sides = Number.parseInt(parsed ?? "0", 10);
  return Number.isFinite(sides) && sides > 0 ? sides : 0;
};

const rollHitDiceHealing = (count: number, sides: number, constitution: number): number => {
  if (count <= 0 || sides <= 0) return 0;
  let total = 0;
  for (let i = 0; i < count; i += 1) total += Math.max(0, randomInt(1, sides + 1) + constitution);
  return total;
};

const restsOnLong = (resource: SheetResource): boolean =>
  resource.recharge === "short" || resource.recharge === "long";

const nextResourcesForRest = (
  resources: ReadonlyArray<SheetResource>,
  kind: CharacterRest["kind"],
  hitDiceRequested: number,
): { readonly resources: ReadonlyArray<SheetResource>; readonly hitDiceSpent: number } => {
  const hitDice = resources.find((resource) => resource.id === "hit-dice");
  const availableHitDice = hitDice === undefined ? 0 : Math.max(0, hitDice.max - hitDice.used);
  const hitDiceSpent =
    kind === "short" ? Math.min(Math.max(0, hitDiceRequested), availableHitDice) : 0;

  return {
    hitDiceSpent,
    resources: resources.map((resource) => {
      if (resource.id === "hit-dice") {
        if (kind === "long") {
          return { ...resource, used: Math.max(0, resource.used - Math.ceil(resource.max / 2)) };
        }
        return { ...resource, used: Math.min(resource.max, resource.used + hitDiceSpent) };
      }
      if (kind === "short") {
        return resource.recharge === "short" ? { ...resource, used: 0 } : resource;
      }
      return restsOnLong(resource) ? { ...resource, used: 0 } : resource;
    }),
  };
};

const withoutConcentration = (conditions: ReadonlyArray<string>): ReadonlyArray<string> =>
  conditions.filter((condition) => !condition.trim().toLowerCase().startsWith("concentrating"));

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
    /** Move one counted resource by an atomic, idempotent delta. */
    readonly spendResource: (
      id: CharacterId,
      payload: CharacterResourceSpend,
    ) => Effect.Effect<Character, NotFound | Conflict, CurrentActor>;
    /** Reset resources and rules-defined rest healing for the owner. */
    readonly rest: (
      id: CharacterId,
      payload: CharacterRest,
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
      const live = yield* Effect.serviceOption(LiveEvents);

      const claimRequest = (
        characterId: CharacterId,
        requestId: string | undefined,
      ): Effect.Effect<boolean> =>
        requestId === undefined
          ? Effect.succeed(true)
          : sql<{ readonly request_id: string }>`
              insert into character_resource_request (character_id, request_id)
              values (${characterId}, ${requestId})
              on conflict do nothing
              returning request_id
            `.pipe(
              Effect.map((rows) => rows.length === 1),
              Effect.orDie,
            );

      const readOwn = (id: CharacterId, actor: Actor): Effect.Effect<CharacterRow, NotFound> =>
        sql<CharacterRow>`
          select * from character where character.id = ${id} and ${ownCharacter(sql, actor)}
        `.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows.length === 0
              ? new NotFound({ resource: "character", id })
              : Effect.succeed(rows[0]!),
          ),
        );

      const openSeatSessions = (
        characterId: CharacterId,
        actor: Actor,
      ): Effect.Effect<ReadonlyArray<OpenSeatSessionRow>> =>
        sql<OpenSeatSessionRow>`
          select campaign.current_session_id as session_id,
                 combatant.id as combatant_id,
                 encounter_run.id as run_id
          from campaign_character
          join campaign on campaign.id = campaign_character.campaign_id
          left join session on session.id = campaign.current_session_id
          left join encounter_run on encounter_run.id = session.active_encounter_run_id
          left join combatant on combatant.encounter_run_id = encounter_run.id
                             and combatant.character_id = ${characterId}
          where campaign_character.character_id = ${characterId}
            and campaign_character.account_id = ${actor.accountId}
            and campaign_character.left_at is null
            and campaign.current_session_id is not null
        `.pipe(Effect.orDie);

      const ringSessions = (sessions: ReadonlyArray<OpenSeatSessionRow>) =>
        Option.match(live, {
          onNone: () => Effect.void,
          onSome: (events) =>
            Effect.forEach(
              [...new Set(sessions.map((session) => session.session_id))],
              (sessionId) => events.touched(sessionId),
              { discard: true },
            ),
        });

      const appendTouched = (
        characterId: CharacterId,
        sessions: ReadonlyArray<OpenSeatSessionRow>,
        detail: Record<string, unknown>,
        requestId: string | undefined,
      ): Effect.Effect<void> =>
        Effect.forEach(
          sessions,
          (session) =>
            appendCharacterUpdated(sql, {
              sessionId: session.session_id,
              characterId,
              live:
                session.combatant_id === null || session.run_id === null
                  ? undefined
                  : {
                      combatantId: session.combatant_id,
                      runId: session.run_id,
                      sessionId: session.session_id,
                    },
              detail,
              requestId,
            }),
          { discard: true },
        );

      const liveFightOf = (characterId: CharacterId): Effect.Effect<string | undefined> =>
        sql<LiveFightRow>`
          select campaign.name as campaign_name
          from combatant
          join encounter_run on encounter_run.id = combatant.encounter_run_id
          join session on session.id = encounter_run.session_id
          join campaign on campaign.id = session.campaign_id
          where combatant.character_id = ${characterId}
            and encounter_run.ended_at is null
          order by encounter_run.created_at desc, encounter_run.id desc
          limit 1
        `.pipe(
          Effect.map((rows) => rows[0]?.campaign_name),
          Effect.orDie,
        );

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

        spendResource: (id, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              return yield* sql
                .withTransaction(
                  Effect.gen(function* () {
                    yield* readOwn(id, actor);
                    const claimed = yield* claimRequest(id, payload.requestId);
                    if (!claimed) {
                      return { character: toCharacter(yield* readOwn(id, actor)), sessions: [] };
                    }

                    const rows = yield* sql<CharacterRow>`
                      with located as (
                        select character.id,
                               (resource.value ->> 'used')::integer as used,
                               (resource.value ->> 'max')::integer as max,
                               resource.ordinality - 1 as index
                        from character
                        cross join lateral jsonb_array_elements(coalesce(character.body -> 'resources', '[]'::jsonb))
                          with ordinality as resource(value, ordinality)
                        where character.id = ${id}
                          and ${ownCharacter(sql, actor)}
                          and resource.value ->> 'id' = ${payload.resourceId}
                      )
                      update character
                      set body = jsonb_set(
                            character.body,
                            array['resources', located.index::text, 'used'],
                            to_jsonb(greatest(0, least(located.max, located.used + ${payload.amount}))),
                            false
                          ),
                          version = character.version + 1,
                          updated_at = now()
                      from located
                      where character.id = located.id
                      returning character.*
                    `;
                    if (rows.length === 0) return yield* resourceMissing(payload.resourceId);
                    const sessions = yield* openSeatSessions(id, actor);
                    yield* appendTouched(
                      id,
                      sessions,
                      { resourceId: payload.resourceId, amount: payload.amount },
                      payload.requestId,
                    );
                    return { character: toCharacter(rows[0]!), sessions };
                  }),
                )
                .pipe(
                  Effect.tap(({ sessions }) => ringSessions(sessions)),
                  Effect.map(({ character }) => character),
                );
            }),
          ),

        rest: (id, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              return yield* sql
                .withTransaction(
                  Effect.gen(function* () {
                    const before = yield* readOwn(id, actor);
                    const liveFight = yield* liveFightOf(id);
                    if (liveFight !== undefined) return yield* restWhileFighting(liveFight);
                    const claimed = yield* claimRequest(id, payload.requestId);
                    if (!claimed) {
                      return { character: toCharacter(yield* readOwn(id, actor)), sessions: [] };
                    }

                    const resources = before.body.resources ?? [];
                    const { resources: nextResources, hitDiceSpent } = nextResourcesForRest(
                      resources,
                      payload.kind,
                      payload.hitDice ?? 0,
                    );
                    const hitDiceResource = resources.find(
                      (resource) => resource.id === "hit-dice",
                    );
                    const healing =
                      payload.kind === "short"
                        ? rollHitDiceHealing(
                            hitDiceSpent,
                            hitDieSides(hitDiceResource, before.body),
                            conModifier(before.body),
                          )
                        : 0;
                    const nextSheet: CharacterSheet = { ...before.body, resources: nextResources };
                    const nextConditions =
                      payload.kind === "long"
                        ? withoutConcentration(before.conditions)
                        : before.conditions;
                    const hpCurrent =
                      payload.kind === "long"
                        ? sql`character.hp_max`
                        : clampedCharacterHp(sql, healing > 0 ? -healing : 0);
                    const tempHp = payload.kind === "long" ? sql`0` : sql`character.temp_hp`;
                    const rows = yield* sql<CharacterRow>`
                      update character
                      set body = ${encodeSheet(nextSheet)}::jsonb,
                          hp_current = ${hpCurrent},
                          temp_hp = ${tempHp},
                          conditions = ${nextConditions},
                          version = character.version + 1,
                          updated_at = now()
                      where character.id = ${id}
                        and ${ownCharacter(sql, actor)}
                      returning *
                    `;
                    const sessions = yield* openSeatSessions(id, actor);
                    yield* appendTouched(
                      id,
                      sessions,
                      { rest: payload.kind, hitDiceSpent, healing },
                      payload.requestId,
                    );
                    return { character: toCharacter(rows[0]!), sessions };
                  }),
                )
                .pipe(
                  Effect.tap(({ sessions }) => ringSessions(sessions)),
                  Effect.map(({ character }) => character),
                );
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
