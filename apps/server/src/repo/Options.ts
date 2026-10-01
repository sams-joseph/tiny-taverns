import {
  BackgroundOption,
  type BackgroundBody,
  CampaignId,
  type CharacterOption,
  CharacterOptionId,
  type ClassBody,
  ClassOption,
  Conflict,
  CurrentActor,
  NotFound,
  OptionFilter,
  type OptionFilterValues,
  type OptionKind,
  OPTION_LIMIT,
  OptionLibraryCreate,
  type OptionLibraryUpdate,
  type OptionUpdate,
  type OptionVocabulary,
  RaceOption,
  type RaceBody,
} from "@taverns/api";
import { Context, Effect, Layer, Schema, Struct } from "effect";
import { SqlClient, SqlSchema, type Statement } from "effect/sql";
import {
  libraryVocabulary,
  optionDetailsReader,
  syncOptionRelationsInput,
} from "../ruleset/vocabularies.js";
import {
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  setClause,
  timestampColumns,
} from "./rows.js";
import {
  coreRulesUsable,
  ensureCampaignReadable,
  usableInCampaign,
  libraryRowReadable,
  libraryRowWritable,
} from "./visibility.js";

/**
 * A `character_option` row as the wire's option reads it — everything but
 * `details`, which is hydrated from the child tables — decoded off
 * `select *` by `SqlSchema`. `source_*` columns are not on the wire and the
 * decode drops them.
 *
 * A union on `kind`, because the three arms carry different documents, and
 * the decode is what pairs the column with its `jsonb` body: a class row whose
 * body is not a `ClassBody` is a defect here rather than a lie on the wire.
 * Every write already goes through a schema that pairs them, and `update`
 * refuses a body whose shape contradicts the row's own kind.
 */
const optionRow = <Fields extends Schema.Struct.Fields & { readonly details: Schema.Top }>(
  schema: Schema.Struct<Fields>,
) =>
  fromColumns(Schema.Struct({ ...Struct.omit(schema.fields, ["details"]), ...timestampColumns }));
const OptionRow = Schema.Union([
  optionRow(ClassOption),
  optionRow(RaceOption),
  optionRow(BackgroundOption),
]);
type OptionRow = typeof OptionRow.Type;

const OptionListRequest = Schema.toType(Schema.Struct(OptionFilter));
const CampaignListRequest = Schema.toType(
  Schema.Struct({ campaignId: CampaignId, ...OptionFilter }),
);

/** The document on its way into a `jsonb` column, as text — `Creatures.ts`'s rule. */
const encodeBody = (body: ClassBody | RaceBody | BackgroundBody): string => JSON.stringify(body);

/**
 * Which kind of document this is, from its shape alone.
 *
 * The **one** place a body is told apart by its shape rather than by a `kind`
 * beside it, and it exists for exactly one caller: a PATCH carries a body but
 * no kind — `kind` is what a row *is* and is chosen once, when it is authored —
 * so the only way to refuse a race document landing on a class row is to
 * look at what arrived.
 *
 * **It works because each of the three documents has required keys the other
 * two lack** — `hitDie`, `hpPerLevel`, and the background's 2014
 * proficiency/language/equipment lists. A body with no required key would be
 * indistinguishable from every other body *and* would swallow them inside
 * `Schema.Union`, which takes the first member that matches.
 */
const bodyKind = (body: ClassBody | RaceBody | BackgroundBody): OptionKind =>
  "hitDie" in body ? "class" : "hpPerLevel" in body ? "race" : "background";

/**
 * A PATCH whose body does not match the row it is patching.
 *
 * A `Conflict` rather than a `NotFound`, and the difference is honest: the row
 * exists, the caller may write it, and what is wrong is the payload. It is also
 * not something a shipped screen can produce — `OptionDialog` sends the body of
 * the kind it opened on — so this is the contract's backstop rather than a
 * sentence anybody reads.
 */
const wrongKind = (kind: OptionKind, sent: OptionKind): Conflict =>
  new Conflict({ message: `that is a ${kind}, and the change describes a ${sent}` });

/**
 * Which kinds a list answers, as a clause.
 *
 * Omitted means every kind, which is what the two shipped readers want: the
 * create form draws three pickers and the Rules screen draws three sections,
 * and one request beats three for a vocabulary of a few dozen rows.
 */
const ofKind = (
  sql: SqlClient.SqlClient,
  kind: OptionKind | undefined,
): ReadonlyArray<Statement.Fragment> =>
  kind === undefined ? [] : [sql`character_option.kind = ${kind}`];

/**
 * The order a vocabulary is read in: **the kind, then the name.**
 *
 * Grouped by kind because both readers draw the three separately, and by name
 * within it because that is the order a picker is read down. No id tiebreak and
 * no cursor: this is not a paged read (see `OPTION_LIMIT`), so there is no page
 * boundary for two rows sharing a name to fall across — and two options with
 * one name in one campaign is legal, deliberately.
 */
const readOrder = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`character_option.kind asc, lower(character_option.name) asc`;

/**
 * The classes, races and backgrounds a character is built from — **the
 * campaign's vocabulary and the Library's originals, one table and one
 * mapper.**
 *
 * This is `Creatures.ts` with a different document and one fewer create, and
 * that is the finding rather than a coincidence: the four Library predicates
 * are generic over a table name, so the whole ownership model transfers with no
 * new SQL.
 *
 * | method               | reads through          | writes through       |
 * | -------------------- | ---------------------- | -------------------- |
 * | `list`               | `usableInCampaign`     |                      |
 * | `library*`           | `libraryRowReadable`   | `libraryRowWritable` |
 * | `core`               | `coreRulesUsable`      |                      |
 *
 * **The bundle is immutable and no line here says so.** The write predicate
 * compares `account_id` to the account the credential resolved to; a bundled
 * row's is null, and a null never equals a uuid.
 * `character_option_system_is_unowned` is what makes that a fact about the
 * schema. There is no `origin = 'system'` check in this file and there does
 * not need to be one.
 *
 * ### There are no campaign-copy methods, and that is the model
 *
 * Since the instancing decision of 2026-09-02 a campaign holds no managed
 * option copies at all: authoring happens in the Library, and what a table
 * offers its players is decided by the **group share** — `usableInCampaign`'s
 * third disjunct. A character seeded from an option stores labels, never
 * pointers, so no per-campaign instance is needed anywhere; existing campaign
 * rows in old data are inert and unlisted.
 *
 * ### And the one thing that is genuinely different from a monster
 *
 * A monster is used *in a campaign*; a class is used *by a character*, and a
 * character may be a player's. `libraryRowReadable` compares `account_id` to
 * the **reader's** account, so a player can never read their DM's Library —
 * which is what makes the group share load-bearing rather than convenient:
 * sharing the original to the group is the one act that puts a homebrew class
 * in front of the table's players.
 */
export class Options extends Context.Service<
  Options,
  {
    /**
     * This campaign's vocabulary: the shared bundle, the reader's own Library,
     * and originals explicitly shared to the campaign's group
     * (`usableInCampaign`) — never a campaign row.
     *
     * **Not paged.** A vocabulary is bounded by what it hangs off, like a
     * campaign's members and a night's checklist — the reads `Page.ts` names as
     * deliberately unpaged. `OPTION_LIMIT` is a sanity bound, not a page.
     *
     * This is the read the **create form's pickers** make, which is the only
     * list in the product a player reads to fill in a control. The bundle keeps
     * the row-visibility rule (`isCreator OR visibility = 'shared'`), so what a
     * player sees of it is unchanged; the group share is what decides whether a
     * homebrew class is pickable.
     */
    readonly list: (
      campaignId: CampaignId,
      filter: OptionFilterValues,
    ) => Effect.Effect<ReadonlyArray<CharacterOption>, NotFound, CurrentActor>;
    /**
     * The Library — **originals only**: the bundle and what this account has
     * authored, with no campaign in the path and no campaign row in the answer.
     *
     * It cannot fail: there is no campaign for a `NotFound` to be about, so an
     * account that has authored nothing gets the bundle and an account that is
     * a member of nothing still has a Library. Authoring is not an act inside a
     * campaign, so it cannot require one.
     */
    readonly libraryVocabulary: () => Effect.Effect<OptionVocabulary, never, CurrentActor>;
    readonly library: (
      filter: OptionFilterValues,
    ) => Effect.Effect<ReadonlyArray<CharacterOption>, never, CurrentActor>;
    /**
     * **The core rules**: the bundle as a campaign's players see it, and
     * nothing anybody authored. What a character with no campaign context is
     * written against. It cannot fail, for `library`'s reason.
     */
    readonly core: (
      filter: OptionFilterValues,
    ) => Effect.Effect<ReadonlyArray<CharacterOption>, never, CurrentActor>;
    readonly libraryFindById: (
      id: CharacterOptionId,
    ) => Effect.Effect<CharacterOption, NotFound, CurrentActor>;
    /**
     * Write a class, race or background into this account's Library.
     *
     * `account_id` comes from the actor and from nothing a caller supplied, and
     * `campaign_id` is not named at all — it takes the column default, which is
     * null, and that is what makes the row an original.
     */
    readonly libraryCreate: (
      payload: OptionLibraryCreate,
    ) => Effect.Effect<CharacterOption, never, CurrentActor>;
    readonly libraryUpdate: (
      id: CharacterOptionId,
      patch: OptionLibraryUpdate,
    ) => Effect.Effect<CharacterOption, NotFound | Conflict, CurrentActor>;
    /**
     * Delete one of this account's originals.
     *
     * **No `Conflict`, and nothing refuses it.** A campaign's copy is a
     * separate row and keeps working — `derived_from` is `on delete set null`
     * and is read through by nothing — and a character stores its class as a
     * label rather than as a pointer, so no character loses anything either.
     */
    readonly libraryRemove: (id: CharacterOptionId) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Options") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const detailsFor = optionDetailsReader(sql);

      /** One option this Library reads — its own originals and the bundle — by id. */
      const inLibrary = SqlSchema.findOne({
        Request: Schema.toType(CharacterOptionId),
        Result: OptionRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select * from character_option
              where character_option.id = ${id}
                and ${libraryRowReadable(sql, "character_option", actor)}
            `,
          ),
      });
      const findInLibrary = (id: CharacterOptionId) => inLibrary(id).pipe(orNotFound("option", id));

      /** One vocabulary read: whole rows under the caller's predicate, in `readOrder`. */
      const vocabulary = (where: Statement.Fragment) => sql`
        select * from character_option
        where ${where}
        order by ${readOrder(sql)}
        limit ${OPTION_LIMIT}
      `;
      const usable = SqlSchema.findAll({
        Request: CampaignListRequest,
        Result: OptionRow,
        execute: ({ campaignId, kind }) =>
          Effect.flatMap(Effect.service(CurrentActor), (actor) =>
            vocabulary(
              sql.and([
                usableInCampaign(sql, "character_option", campaignId, actor),
                ...ofKind(sql, kind),
              ]),
            ),
          ),
      });
      const inLibraryList = SqlSchema.findAll({
        Request: OptionListRequest,
        Result: OptionRow,
        execute: ({ kind }) =>
          Effect.flatMap(Effect.service(CurrentActor), (actor) =>
            vocabulary(
              sql.and([libraryRowReadable(sql, "character_option", actor), ...ofKind(sql, kind)]),
            ),
          ),
      });
      const coreList = SqlSchema.findAll({
        Request: OptionListRequest,
        Result: OptionRow,
        execute: ({ kind }) =>
          vocabulary(sql.and([coreRulesUsable(sql, "character_option"), ...ofKind(sql, kind)])),
      });
      /**
       * A new original in this account's Library. `account_id` comes from the
       * actor and from nothing a caller supplied, and `campaign_id` is not
       * named at all — it takes the column default, which is null.
       */
      const insertOriginal = SqlSchema.findOne({
        Request: Schema.toType(OptionLibraryCreate),
        Result: OptionRow,
        execute: (payload) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              insert into character_option ${sql.insert({
                account_id: actor.accountId,
                kind: payload.kind,
                name: payload.name,
                body: encodeBody(payload.body),
              })}
              returning *
            `,
          ),
      });
      const updateOriginal = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            id: CharacterOptionId,
            columns: Schema.Record(Schema.String, Schema.Unknown),
          }),
        ),
        Result: OptionRow,
        execute: ({ id, columns }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update character_option set ${setClause(sql, columns)}
              where character_option.id = ${id}
                and ${libraryRowWritable(sql, "character_option", actor)}
              returning *
            `,
          ),
      });

      const removeOriginal = SqlSchema.findOne({
        Request: Schema.toType(CharacterOptionId),
        Result: fromColumns(Schema.Struct({ id: CharacterOptionId })),
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              delete from character_option
              where character_option.id = ${id}
                and ${libraryRowWritable(sql, "character_option", actor)}
              returning character_option.id
            `,
          ),
      });

      /** Rows with their `details`, hydrated in one fixed set of statements. */
      const hydrateAll = (rows: ReadonlyArray<OptionRow>) =>
        Effect.map(detailsFor(rows.map((row) => row.id)), (details) =>
          rows.map((row): CharacterOption => ({ ...row, details: details.get(row.id)! })),
        );
      const hydrate = (row: OptionRow) => Effect.map(hydrateAll([row]), (options) => options[0]!);

      /**
       * A patch's columns, with the body refused when it contradicts the row.
       *
       * The check is here rather than in the schema because a payload cannot
       * see the row it is patching — see `bodyKind`. It runs for both update
       * paths, so a Library original and a campaign copy answer the same way.
       */
      const columnsFor = (
        row: OptionRow,
        patch: OptionLibraryUpdate,
        visibility?: OptionUpdate["visibility"],
      ): Effect.Effect<Record<string, unknown>, Conflict> =>
        patch.body !== undefined && bodyKind(patch.body) !== row.kind
          ? Effect.fail(wrongKind(row.kind, bodyKind(patch.body)))
          : Effect.succeed(
              defined({
                name: patch.name,
                body: patch.body && encodeBody(patch.body),
                visibility,
              }),
            );

      return {
        list: (campaignId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // A 404 rather than an empty list, so an unreachable campaign does
              // not read as "this table has no classes" on a picker.
              yield* ensureCampaignReadable(sql, campaignId, actor);
              return yield* hydrateAll(yield* usable({ campaignId, ...filter }));
            }),
          ),

        libraryVocabulary: () =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              return yield* libraryVocabulary(sql, actor.accountId);
            }),
          ),

        library: (filter) => dieOnSqlError(Effect.flatMap(inLibraryList(filter), hydrateAll)),

        core: (filter) => dieOnSqlError(Effect.flatMap(coreList(filter), hydrateAll)),

        libraryFindById: (id) => dieOnSqlError(Effect.flatMap(findInLibrary(id), hydrate)),

        libraryCreate: (payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                // An insert answers with its row; not getting one is a defect.
                const created = yield* insertOriginal(payload).pipe(
                  Effect.catchTag("NoSuchElementError", Effect.die),
                );
                yield* syncOptionRelationsInput(sql, created.id, payload.relations);
                return yield* hydrate(created);
              }),
            ),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const row = yield* findInLibrary(id);
                const columns = yield* columnsFor(row, patch);
                // A bundled option lands here — readable in this Library and
                // owned by nobody — and so does another account's original.
                // Both get the same refusal as "no such option", on purpose.
                const updated = yield* updateOriginal({ id, columns }).pipe(
                  orNotFound("option", id),
                );
                yield* syncOptionRelationsInput(sql, updated.id, patch.relations);
                return yield* hydrate(updated);
              }),
            ),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(Effect.asVoid(removeOriginal(id).pipe(orNotFound("option", id)))),
      };
    }),
  );
}
