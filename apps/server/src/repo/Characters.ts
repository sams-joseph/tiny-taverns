import { randomInt } from "node:crypto";
import {
  Actor,
  CampaignId,
  Character,
  CharacterId,
  CharacterBannerImages,
  CharacterPortraitImages,
  type CharacterOwnCreate,
  type CharacterOwnUpdate,
  type CharacterResourceSpend,
  CharacterSeatRef,
  type CharacterRest,
  type CharacterSheet,
  CombatantId,
  Conflict,
  CurrentActor,
  EncounterRunId,
  NotFound,
  OwnedCharacter,
  SessionId,
  type SheetResource,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema, SchemaGetter, SchemaTransformation } from "effect";
import { type ImageSigner, imageSigner } from "../images/ImageUrls.js";
import { LiveEvents } from "../live/LiveEvents.js";
import { SqlClient, type SqlError, SqlSchema, type Statement } from "effect/sql";
import {
  assistantColumns,
  type AssistantOrigin,
  classFromColumns,
  defined,
  dieOnSqlError,
  fileUnder,
  fromColumns,
  orNotFound,
  setClause,
  textArray,
  timestampColumns,
  uuidArray,
} from "./rows.js";
import { levelOrClassMoved, recomputeForLevel, validateSubrace } from "./sheetLevel.js";
import { appendCharacterUpdated, clampedCharacterHp } from "./vitals.js";
import {
  characterSeatedAt,
  characterVocabulary,
  coreRulesUsable,
  ensureCampaignReadable,
  ownCharacter,
  usableInCampaign,
} from "./visibility.js";

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

/**
 * The portrait's and banner's facts beside a character row, as scalar
 * subqueries so they fit a `select` and a `returning` alike: each picture's id
 * once it is ready (`portrait_id`, `banner_id`), and whether either is still
 * being drawn (`portrait_pending`). **Every read that becomes a `Character`
 * names this fragment** — {@link characterRow} requires all three columns, so a
 * path that forgot is a failed test rather than a character whose portrait
 * silently vanished.
 */
export const portraitColumns = (sql: SqlClient.SqlClient) => sql`
  (select character_portrait.id from character_portrait
   where character_portrait.character_id = character.id
     and character_portrait.state = 'ready') as portrait_id,
  (select character_banner.id from character_banner
   where character_banner.character_id = character.id
     and character_banner.state = 'ready') as banner_id,
  (exists (select 1 from character_portrait
           where character_portrait.character_id = character.id
             and character_portrait.state = 'generating')
   or exists (select 1 from character_banner
              where character_banner.character_id = character.id
                and character_banner.state = 'generating')) as portrait_pending
`;

/**
 * A ready portrait's id for a row that only *points* at a character — a
 * combatant's `character_id` — as a scalar subquery aliased `portrait_id`.
 *
 * The pointer is provenance, not reach (`Combatant.characterId`). The id comes
 * back only when `characterSeatedAt` finds a live seat holding that character
 * which this actor may read at this campaign: the predicate that decides
 * whether they may read the character at this table at all. A hidden seat, a
 * retired one, or a character seated only at some other table answers `null`,
 * and there is then no id in memory to sign.
 *
 * @param characterId the pointing column, e.g. `sql("combatant.character_id")`.
 */
export const seatedPortraitColumn = (
  sql: SqlClient.SqlClient,
  characterId: Statement.Identifier,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment => sql`
  (select character_portrait.id from character_portrait
   join character on character.id = character_portrait.character_id
   where character_portrait.character_id = ${characterId}
     and character_portrait.state = 'ready'
     and ${characterSeatedAt(sql, campaignId, actor)}) as portrait_id
`;

/**
 * Signs a ready portrait's image paths; the character kind of
 * `ImageUrls.pathsFor`. Absent when a repository was built without the service
 * (most repository tests), which mints nothing — the same answer a server with
 * no URL secret gives.
 */
export interface PortraitSigner {
  (portraitId: string): Character["portrait"];
  /** The banner's paths, beside the portrait's and minted by the same reads. */
  readonly banner: (bannerId: string) => Character["banner"];
}

const portraitSignerOf = (sign: ImageSigner): PortraitSigner =>
  Object.assign(
    (portraitId: string) => {
      const paths = sign("character", portraitId);
      return paths === null
        ? null
        : new CharacterPortraitImages({
            thumbUrl: paths.thumb,
            cardUrl: paths.card,
            fullUrl: paths.full,
          });
    },
    {
      banner: (bannerId: string) => {
        const paths = sign("characterBanner", bannerId);
        return paths === null
          ? null
          : new CharacterBannerImages({ cardUrl: paths.card, fullUrl: paths.full });
      },
    },
  );

/** The signer a repository layer was built with, or `undefined`; see {@link PortraitSigner}. */
export const portraitSigner: Effect.Effect<PortraitSigner | undefined> = Effect.map(
  imageSigner,
  (sign) => (sign === undefined ? undefined : portraitSignerOf(sign)),
);

/**
 * **The only place a portrait URL is minted.** `portraitId` must come from a
 * read whose SQL already proved the reader may see the character — its own
 * predicate beside {@link portraitColumns}, or {@link seatedPortraitColumn} —
 * and that is what makes portrait visibility exactly character visibility.
 */
export const portraitImages = (
  portraitId: string | null,
  sign: PortraitSigner | undefined,
): Character["portrait"] => (portraitId !== null && sign !== undefined ? sign(portraitId) : null);

/**
 * A ready portrait's id, decoded into the images the wire carries: the
 * `portrait` of every row that selects {@link portraitColumns} or
 * {@link seatedPortraitColumn}. Minting is the decode's last step, so the id a
 * predicate let through is the only thing a URL is made from.
 */
export const portraitFromId = (sign: PortraitSigner | undefined) =>
  Schema.NullOr(Schema.String).pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.instanceOf(CharacterPortraitImages)),
      new SchemaTransformation.Transformation(
        SchemaGetter.transform((id: string | null) => portraitImages(id, sign)),
        SchemaGetter.forbidden(() => "a portrait is minted, never read back"),
      ),
    ),
  );

/** A ready banner's id, decoded into its images: the banner's {@link portraitFromId}. */
const bannerFromId = (sign: PortraitSigner | undefined) =>
  Schema.NullOr(Schema.String).pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.instanceOf(CharacterBannerImages)),
      new SchemaTransformation.Transformation(
        SchemaGetter.transform((id: string | null) =>
          id !== null && sign !== undefined ? sign.banner(id) : null,
        ),
        SchemaGetter.forbidden(() => "a banner is minted, never read back"),
      ),
    ),
  );

/**
 * A `character` row as the wire reads it, decoded off `character.*` and
 * {@link portraitColumns} by `SqlSchema`: the sheet is `body`, and the pictures
 * are signed with the signer the reading repository was built with.
 *
 * **One decode per table** — `repo/Party.ts` reads its seats' characters
 * through it rather than restating. Every read that returns a character returns
 * it through here, after its own predicate, so whoever can load the character
 * gets its picture and nobody else gets a URL. The row's `visibility` column is
 * inert — who at a table may see a character is the seat's question — and the
 * decode drops it, as `Character` has no field for it.
 */
export const characterRow = (sign: PortraitSigner | undefined) =>
  classFromColumns(
    Character,
    {
      ...Character.fields,
      ...timestampColumns,
      portrait: portraitFromId(sign),
      banner: bannerFromId(sign),
    },
    { sheet: "body", portrait: "portrait_id", banner: "banner_id" },
  );

const encodeSheet = (sheet: CharacterSheet): string => JSON.stringify(sheet);

/** The written columns of an insert or a PATCH, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/** Where a character's subrace is checked, as a refusal names it. */
const CHARACTER_RULES = "in a campaign this character is at";

const staleVersion = (expected: number, actual: number): Conflict =>
  new Conflict({
    message: `the sheet moved on while you were editing (version ${String(actual)}, you read ${String(expected)}). Reload it and make the change again.`,
  });

/** Where one of the reader's characters sits, beside the character it is for. */
const SeatRefRow = fromColumns(
  Schema.Struct({
    characterId: CharacterId,
    ...CharacterSeatRef.fields,
    joinedAt: Schema.DateTimeUtcFromDate,
  }),
  { campaignCharacterId: "id" },
);

/** A night one of the reader's seats of a character is at, and the character's place in its live fight. */
const OpenSeatSessionRow = fromColumns(
  Schema.Struct({
    sessionId: SessionId,
    combatantId: Schema.NullOr(CombatantId),
    runId: Schema.NullOr(EncounterRunId),
  }),
);
type OpenSeatSession = typeof OpenSeatSessionRow.Type;

/** The live fight a character is on the table in: which campaign's, and what it is called. */
const LiveFightRow = fromColumns(
  Schema.Struct({ characterId: CharacterId, campaignId: CampaignId, campaignName: Schema.String }),
);
const CharacterIds = Schema.toType(Schema.Array(CharacterId));

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

/**
 * Spend a resource or rest request id for one character, once. `false` means
 * it was spent already and the caller answers from the row as it stands.
 */
export const claimCharacterRequest = (
  sql: SqlClient.SqlClient,
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

/**
 * The live fight each of these characters is on the table in, at any campaign,
 * keyed by character: one statement however many are asked about. A rest is
 * refused while there is one: the combatant holds the fight's copy of the
 * character's hit points and conditions, and a rest would leave the two apart.
 * A character in two live fights answers the newest.
 */
export const liveFightsOf = (sql: SqlClient.SqlClient, characterIds: ReadonlyArray<CharacterId>) =>
  Effect.map(
    SqlSchema.findAll({
      Request: CharacterIds,
      Result: LiveFightRow,
      execute: (ids) => sql`
        select distinct on (combatant.character_id)
               combatant.character_id, campaign.id as campaign_id, campaign.name as campaign_name
        from combatant
        join encounter_run on encounter_run.id = combatant.encounter_run_id
        join session on session.id = encounter_run.session_id
        join campaign on campaign.id = session.campaign_id
        where combatant.character_id = any(${uuidArray([...ids])})
          and encounter_run.ended_at is null
        order by combatant.character_id, encounter_run.created_at desc, encounter_run.id desc
      `,
    })(characterIds),
    (fights) => new Map(fights.map((fight) => [fight.characterId, fight])),
  );

/**
 * **The rest rule**, as one statement over one character, whoever asks. The
 * owner rests their own character (`Characters.rest`, reach `ownCharacter`);
 * the creator rests the party (`Party.rest`, reach `characterVitalsWritable`).
 * Both call this, so the two cannot disagree about what a rest gives back.
 *
 * A long rest heals to full, zeroes temporary hit points, resets every
 * recharging counter, returns half the hit dice and ends concentration; other
 * conditions stay. A short rest resets short counters and spends up to the
 * requested hit dice on rolled healing.
 *
 * Runs inside the caller's transaction, after its fight check and retry claim.
 * `before` is the character the caller read under the same reach, and
 * `CharacterRow` the caller's own {@link characterRow}, which the rested
 * character is read back through.
 */
export const restCharacterRow = (
  sql: SqlClient.SqlClient,
  CharacterRow: ReturnType<typeof characterRow>,
  before: Character,
  kind: CharacterRest["kind"],
  hitDiceRequested: number,
  reach: Statement.Fragment,
): Effect.Effect<
  {
    readonly character: Character;
    readonly detail: {
      readonly rest: CharacterRest["kind"];
      readonly hitDiceSpent: number;
      readonly healing: number;
    };
  },
  SqlError.SqlError | Schema.SchemaError
> =>
  Effect.gen(function* () {
    const resources = before.sheet.resources ?? [];
    const { resources: nextResources, hitDiceSpent } = nextResourcesForRest(
      resources,
      kind,
      hitDiceRequested,
    );
    const hitDiceResource = resources.find((resource) => resource.id === "hit-dice");
    const healing =
      kind === "short"
        ? rollHitDiceHealing(
            hitDiceSpent,
            hitDieSides(hitDiceResource, before.sheet),
            conModifier(before.sheet),
          )
        : 0;
    const nextSheet: CharacterSheet = { ...before.sheet, resources: nextResources };
    const nextConditions =
      kind === "long" ? withoutConcentration(before.conditions) : before.conditions;
    const hpCurrent =
      kind === "long" ? sql`character.hp_max` : clampedCharacterHp(sql, healing > 0 ? -healing : 0);
    const tempHp = kind === "long" ? sql`0` : sql`character.temp_hp`;
    const rested = SqlSchema.findOne({
      Request: Schema.toType(CharacterId),
      Result: CharacterRow,
      execute: (id) => sql`
        update character
        set body = ${encodeSheet(nextSheet)}::jsonb,
            hp_current = ${hpCurrent},
            temp_hp = ${tempHp},
            conditions = ${textArray(nextConditions)},
            version = character.version + 1,
            updated_at = now()
        where character.id = ${id}
          and ${reach}
        returning character.*, ${portraitColumns(sql)}
      `,
    });
    // The caller read `before` under the same reach in this transaction, so
    // not getting the row back is a defect.
    const character = yield* rested(before.id).pipe(
      Effect.catchTag("NoSuchElementError", Effect.die),
    );
    return { character, detail: { rest: kind, hitDiceSpent, healing } };
  });

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
     * Writing one down, with a campaign as rules/Hob context only. The row is
     * top-level and account-owned; seating is the separate `party.join` act.
     * `ensureCampaignReadable` is the gate — a live participant at a shared
     * table, or the creator — so the context cannot be borrowed from a campaign
     * the caller cannot read.
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
     * The same insert with no campaign: the core rules (`coreRulesUsable`) are
     * the vocabulary and there is no gate, because nothing is named.
     */
    readonly createCore: (
      payload: CharacterOwnCreate,
      /**
       * The turn that drafted them, when the owner accepted a proposal from
       * their own account-scoped thread. `repo/Proposals.ts` is the only
       * caller that passes it.
       */
      from?: AssistantOrigin,
    ) => Effect.Effect<Character, Conflict, CurrentActor>;
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
      const CharacterRow = characterRow(yield* portraitSigner);

      /** One of this account's characters, by id. */
      const own = SqlSchema.findOne({
        Request: Schema.toType(CharacterId),
        Result: CharacterRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select character.*, ${portraitColumns(sql)} from character
              where character.id = ${id} and ${ownCharacter(sql, actor)}
            `,
          ),
      });
      const readOwn = (id: CharacterId) => own(id).pipe(orNotFound("character", id));
      /** Every character this account owns, oldest first. */
      const owned = SqlSchema.findAll({
        Request: Schema.Void,
        Result: CharacterRow,
        execute: () =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select character.*, ${portraitColumns(sql)} from character
              where ${ownCharacter(sql, actor)}
              order by character.created_at asc, character.id asc
            `,
          ),
      });
      /** Where this account's characters sit, earliest seat first. */
      const seatRefs = SqlSchema.findAll({
        Request: Schema.Void,
        Result: SeatRefRow,
        execute: () =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select campaign_character.character_id, campaign_character.id,
                     campaign_character.campaign_id, campaign_character.joined_at
              from campaign_character
              where campaign_character.account_id = ${actor.accountId}
                and campaign_character.left_at is null
                and campaign_character.character_id is not null
              order by campaign_character.joined_at asc
            `,
          ),
      });
      /**
       * A new character of this account's. `account_id` comes from the actor
       * and from nothing a caller supplied.
       */
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: CharacterRow,
        execute: (columns) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              insert into character ${sql.insert({ ...columns, account_id: actor.accountId })}
              returning character.*, ${portraitColumns(sql)}
            `,
          ),
      });
      /**
       * The owner's PATCH. `version = version + 1` rides in the same statement
       * as the check, so two racing writers cannot both pass one read: the
       * second UPDATE's `where` no longer matches the expected version and
       * returns no row.
       */
      const updateOwnRow = SqlSchema.findOneOption({
        Request: Schema.toType(
          Schema.Struct({
            id: CharacterId,
            columns: Columns,
            expectedVersion: Schema.optional(Schema.Int),
          }),
        ),
        Result: CharacterRow,
        execute: ({ id, columns, expectedVersion }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update character
              set ${setClause(sql, columns)}, version = character.version + 1
              where character.id = ${id}
                and ${ownCharacter(sql, actor)}
                and ${
                  expectedVersion === undefined
                    ? sql`true`
                    : sql`character.version = ${expectedVersion}`
                }
              returning character.*, ${portraitColumns(sql)}
            `,
          ),
      });
      /** One counted resource moved by a clamped delta, in one statement. */
      const spend = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ id: CharacterId, resourceId: Schema.String, amount: Schema.Int }),
        ),
        Result: CharacterRow,
        execute: ({ id, resourceId, amount }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
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
                  and resource.value ->> 'id' = ${resourceId}
              )
              update character
              set body = jsonb_set(
                    character.body,
                    array['resources', located.index::text, 'used'],
                    to_jsonb(greatest(0, least(located.max, located.used + ${amount}))),
                    false
                  ),
                  version = character.version + 1,
                  updated_at = now()
              from located
              where character.id = located.id
              returning character.*, ${portraitColumns(sql)}
            `,
          ),
      });

      /**
       * The one insert both creates make — `createOwn` against a campaign's
       * vocabulary behind that campaign's gate, `createCore` against the core
       * rules behind none — so the two cannot disagree about what a new row is.
       */
      const insertOwn = <E>(
        gate: (actor: Actor) => Effect.Effect<void, E>,
        vocabulary: (actor: Actor) => Statement.Fragment,
        payload: CharacterOwnCreate,
        from: AssistantOrigin | undefined,
      ) =>
        dieOnSqlError(
          sql.withTransaction(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* gate(actor);
              yield* validateSubrace(
                sql,
                vocabulary(actor),
                payload.race,
                payload.subrace,
                CHARACTER_RULES,
              );
              // An insert answers with its row; not getting one is a defect.
              return yield* insert(
                defined({
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
              ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
            }),
          ),
        );

      const seatSessions = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ characterId: CharacterId, actor: Actor })),
        Result: OpenSeatSessionRow,
        execute: ({ characterId, actor }) => sql`
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
        `,
      });
      const openSeatSessions = (
        characterId: CharacterId,
        actor: Actor,
      ): Effect.Effect<ReadonlyArray<OpenSeatSession>> =>
        seatSessions({ characterId, actor }).pipe(Effect.orDie);

      const ringSessions = (sessions: ReadonlyArray<OpenSeatSession>) =>
        Option.match(live, {
          onNone: () => Effect.void,
          onSome: (events) =>
            Effect.forEach(
              [...new Set(sessions.map((session) => session.sessionId))],
              (sessionId) => events.touched(sessionId),
              { discard: true },
            ),
        });

      const appendTouched = (
        characterId: CharacterId,
        sessions: ReadonlyArray<OpenSeatSession>,
        detail: Record<string, unknown>,
        requestId: string | undefined,
      ): Effect.Effect<void> =>
        Effect.forEach(
          sessions,
          (session) =>
            appendCharacterUpdated(sql, {
              sessionId: session.sessionId,
              characterId,
              live:
                session.combatantId === null || session.runId === null
                  ? undefined
                  : {
                      combatantId: session.combatantId,
                      runId: session.runId,
                      sessionId: session.sessionId,
                    },
              detail,
              requestId,
            }),
          { discard: true },
        );

      return {
        mine: dieOnSqlError(
          Effect.gen(function* () {
            const characters = yield* owned();
            if (characters.length === 0) return [];
            const seatsOf = fileUnder(yield* seatRefs(), "characterId");
            return characters.map(
              (character) =>
                new OwnedCharacter({
                  character,
                  seats: (seatsOf.get(character.id) ?? []).map(
                    (seat) => new CharacterSeatRef(seat),
                  ),
                }),
            );
          }),
        ),

        createOwn: (campaignId, payload, from) =>
          insertOwn(
            // The campaign is context only: it proves the caller may read the
            // table whose vocabulary/Hob prompt produced this sheet, and it
            // bounds subrace validation. Seating is the explicit `Party.join`
            // act and is not performed here.
            (actor) => ensureCampaignReadable(sql, campaignId, actor),
            (actor) => usableInCampaign(sql, "character_option", campaignId, actor),
            payload,
            from,
          ),

        // No gate: the caller named nothing but themselves.
        createCore: (payload, from) =>
          insertOwn(
            () => Effect.void,
            () => coreRulesUsable(sql, "character_option"),
            payload,
            from,
          ),

        updateOwn: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rowBefore = yield* readOwn(id);
              if (
                patch.expectedVersion !== undefined &&
                patch.expectedVersion !== rowBefore.version
              ) {
                return yield* staleVersion(patch.expectedVersion, rowBefore.version);
              }
              const nextRace = patch.race === undefined ? rowBefore.race : patch.race;
              const nextSubrace = patch.subrace === undefined ? rowBefore.subrace : patch.subrace;
              if (nextRace !== rowBefore.race || nextSubrace !== rowBefore.subrace) {
                const vocabulary = yield* characterVocabulary(sql, id, actor);
                yield* validateSubrace(
                  sql,
                  vocabulary("character_option"),
                  nextRace,
                  nextSubrace,
                  CHARACTER_RULES,
                );
              }
              // Only a real move recomputes: the Identity dialog resends every
              // column on every save, and a rename is not a level change.
              const nextLevel = patch.level === undefined ? rowBefore.level : patch.level;
              const nextClass =
                patch.className === undefined ? rowBefore.className : patch.className;
              const recomputedSheet =
                patch.sheet === undefined &&
                levelOrClassMoved(
                  { level: rowBefore.level, className: rowBefore.className },
                  { level: nextLevel, className: nextClass },
                )
                  ? yield* recomputeForLevel(sql, {
                      body: rowBefore.sheet,
                      level: nextLevel,
                      className: nextClass,
                      race: nextRace,
                      subrace: nextSubrace,
                      from: { level: rowBefore.level, className: rowBefore.className },
                      vocabulary: yield* characterVocabulary(sql, id, actor),
                      actor,
                    })
                  : undefined;
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
                body:
                  patch.sheet === undefined
                    ? recomputedSheet === undefined
                      ? undefined
                      : encodeSheet(recomputedSheet)
                    : encodeSheet(patch.sheet),
              });
              const updated = yield* updateOwnRow(
                patch.expectedVersion === undefined
                  ? { id, columns }
                  : { id, columns, expectedVersion: patch.expectedVersion },
              );
              if (Option.isNone(updated)) {
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
              return updated.value;
            }),
          ),

        spendResource: (id, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              return yield* sql
                .withTransaction(
                  Effect.gen(function* () {
                    yield* readOwn(id);
                    const claimed = yield* claimCharacterRequest(sql, id, payload.requestId);
                    if (!claimed) {
                      return { character: yield* readOwn(id), sessions: [] };
                    }

                    const character = yield* spend({
                      id,
                      resourceId: payload.resourceId,
                      amount: payload.amount,
                    }).pipe(
                      Effect.catchTag("NoSuchElementError", () =>
                        Effect.fail(resourceMissing(payload.resourceId)),
                      ),
                    );
                    const sessions = yield* openSeatSessions(id, actor);
                    yield* appendTouched(
                      id,
                      sessions,
                      { resourceId: payload.resourceId, amount: payload.amount },
                      payload.requestId,
                    );
                    return { character, sessions };
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
                    const before = yield* readOwn(id);
                    const liveFight = (yield* liveFightsOf(sql, [id])).get(id);
                    if (liveFight !== undefined) {
                      return yield* restWhileFighting(liveFight.campaignName);
                    }
                    const claimed = yield* claimCharacterRequest(sql, id, payload.requestId);
                    if (!claimed) {
                      return { character: yield* readOwn(id), sessions: [] };
                    }

                    const rested = yield* restCharacterRow(
                      sql,
                      CharacterRow,
                      before,
                      payload.kind,
                      payload.hitDice ?? 0,
                      ownCharacter(sql, actor),
                    );
                    const sessions = yield* openSeatSessions(id, actor);
                    yield* appendTouched(id, sessions, rested.detail, payload.requestId);
                    return { character: rested.character, sessions };
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
