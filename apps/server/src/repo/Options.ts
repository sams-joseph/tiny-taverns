import {
  type AccountId,
  type BackgroundBody,
  type CampaignId,
  type CharacterOption,
  type CharacterOptionId,
  type ClassBody,
  Conflict,
  CurrentActor,
  NotFound,
  type OptionDetails,
  type OptionFilterValues,
  type OptionKind,
  OPTION_LIMIT,
  type OptionLibraryCreate,
  type OptionLibraryUpdate,
  type OptionUpdate,
  type OptionVocabulary,
  type RaceBody,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import {
  libraryVocabulary,
  optionDetailsFor,
  syncOptionRelationsInput,
} from "../ruleset/vocabularies.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import {
  ensureCampaignReadable,
  usableInCampaign,
  libraryRowReadable,
  libraryRowWritable,
} from "./visibility.js";

interface OptionRow extends ProvenanceColumns {
  readonly id: CharacterOptionId;
  /** Null for a Library original and for the bundle. */
  readonly campaign_id: CampaignId | null;
  /** Whose Library this is in; null for a campaign copy and for the bundle. */
  readonly account_id: AccountId | null;
  readonly derived_from: CharacterOptionId | null;
  readonly kind: OptionKind;
  readonly name: string;
  /** Minimal source key this row snapshots, when it came from an imported source. */
  readonly source_corpus: string | null;
  readonly source_family: string | null;
  readonly source_key: string | null;
  /** `jsonb`; the pg driver parses it, so this arrives as the document itself. */
  readonly body: ClassBody | RaceBody | BackgroundBody;
}

/**
 * The row as the wire sees it.
 *
 * A `switch` rather than one object literal, because `CharacterOption` is a
 * union discriminated on `kind` and the three arms carry different documents.
 * That the column and the document agree is a property of the **write** side —
 * every create and every update goes through a schema that pairs them, and
 * `update` refuses a body whose shape contradicts the row's own kind — exactly
 * as `Creatures.ts` trusts `body` to be a `StatBlock` because only a
 * `StatBlock` was ever put there.
 */
const toOption = (row: OptionRow, details?: OptionDetails): CharacterOption => {
  const shared = {
    id: row.id,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    derivedFrom: row.derived_from,
    name: row.name,
    ...(details === undefined ? {} : { details }),
    ...provenanceOf(row),
  };
  switch (row.kind) {
    case "class":
      return { ...shared, kind: "class", body: row.body as ClassBody };
    case "race":
      return { ...shared, kind: "race", body: row.body as RaceBody };
    case "background":
      return { ...shared, kind: "background", body: row.body as BackgroundBody };
  }
};

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

      /** The same, for the Library: this account's own originals and the bundle. */
      const inLibrary = (id: CharacterOptionId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<OptionRow>`
            select * from character_option
            where character_option.id = ${id}
              and ${libraryRowReadable(sql, "character_option", actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "option", id });
          return rows[0]!;
        });

      const hydrate = (row: OptionRow): Effect.Effect<CharacterOption, never> =>
        Effect.map(Effect.orDie(optionDetailsFor(sql, row.id)), (details) =>
          toOption(row, details),
        );

      const hydrateAll = (
        rows: ReadonlyArray<OptionRow>,
      ): Effect.Effect<ReadonlyArray<CharacterOption>, never> =>
        Effect.all(rows.map((row) => hydrate(row)));

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
              const rows = yield* sql<OptionRow>`
                select * from character_option
                where ${sql.and([
                  usableInCampaign(sql, "character_option", campaignId, actor),
                  ...ofKind(sql, filter.kind),
                ])}
                order by ${readOrder(sql)}
                limit ${OPTION_LIMIT}
              `;
              return yield* hydrateAll(rows);
            }),
          ),

        libraryVocabulary: () =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              return yield* libraryVocabulary(sql, actor.accountId);
            }),
          ),

        library: (filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<OptionRow>`
                select * from character_option
                where ${sql.and([
                  libraryRowReadable(sql, "character_option", actor),
                  ...ofKind(sql, filter.kind),
                ])}
                order by ${readOrder(sql)}
                limit ${OPTION_LIMIT}
              `;
              return yield* hydrateAll(rows);
            }),
          ),

        libraryFindById: (id) => dieOnSqlError(Effect.flatMap(inLibrary(id), hydrate)),

        libraryCreate: (payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const rows = yield* sql<OptionRow>`
                  insert into character_option ${sql.insert({
                    account_id: actor.accountId,
                    kind: payload.kind,
                    name: payload.name,
                    body: encodeBody(payload.body),
                  })}
                  returning *
                `;
                const created = rows[0]!;
                yield* syncOptionRelationsInput(sql, created.id, payload.relations);
                return yield* hydrate(created);
              }),
            ),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const row = yield* inLibrary(id);
                const columns = yield* columnsFor(row, patch);
                const rows = yield* sql<OptionRow>`
                  update character_option set ${setClause(sql, columns)}
                  where character_option.id = ${id}
                    and ${libraryRowWritable(sql, "character_option", actor)}
                  returning *
                `;
                // A bundled option lands here — readable in this Library and
                // owned by nobody — and so does another account's original.
                // Both get the same refusal as "no such option", on purpose.
                if (rows.length === 0) return yield* new NotFound({ resource: "option", id });
                const updated = rows[0]!;
                yield* syncOptionRelationsInput(sql, updated.id, patch.relations);
                return yield* hydrate(updated);
              }),
            ),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: CharacterOptionId }>`
                delete from character_option
                where character_option.id = ${id}
                  and ${libraryRowWritable(sql, "character_option", actor)}
                returning character_option.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "option", id });
            }),
          ),
      };
    }),
  );
}
