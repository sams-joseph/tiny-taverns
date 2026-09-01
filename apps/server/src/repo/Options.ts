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
  type OptionDerive,
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
import { copyClassProgression } from "./ClassProgression.js";
import {
  campaignVocabulary,
  copyOptionRelationships,
  libraryVocabulary,
  optionDetailsFor,
  syncOptionRelationsInput,
} from "../ruleset/vocabularies.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import {
  copyableIntoCampaign,
  corpusRowReadable,
  ensureCampaignReadable,
  ensureCampaignWritable,
  libraryRowReadable,
  libraryRowWritable,
  rowWritable,
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
 * | `list` / `findById`  | `corpusRowReadable`    |                      |
 * | `update` / `remove`  | `corpusRowReadable`    | `rowWritable`        |
 * | `library*`           | `libraryRowReadable`   | `libraryRowWritable` |
 * | `derive`             | `copyableIntoCampaign` | `rowWritable`        |
 *
 * **The bundle is immutable and no line here says so.** Both write predicates
 * compare an ownership column to a value the request carries — `rowWritable`
 * the campaign in the path, `libraryRowWritable` the account the credential
 * resolved to — and a bundled row has neither, so a null is compared to a uuid
 * and matches nothing. `character_option_system_is_unowned` is what makes that
 * a fact about the schema rather than about how the seeder happens to be
 * written. There is no `origin = 'system'` check in this file and there does
 * not need to be one.
 *
 * ### There is no campaign-scoped `create`, and that is the model
 *
 * Authoring happens in the Library — the captain's second statement — so a
 * campaign gets an option through `derive` and through nothing else. That is
 * the one place this file deliberately differs from `Creatures.ts`, which does
 * have a campaign `create` and which `AGENTS.md` already records as the
 * endpoint contradicting the model.
 *
 * ### And the one thing that is genuinely different from a monster
 *
 * A monster is used *in a campaign*; a class is used *by a character*, and a
 * character may be a player's. `libraryRowReadable` compares `account_id` to
 * the **reader's** account, so a player can never read their DM's Library —
 * which makes `derive` load-bearing rather than convenient. Without the copy
 * there is no way for a player to pick a homebrew class at all.
 */
export class Options extends Context.Service<
  Options,
  {
    /** Concrete abilities, languages, skills, proficiencies and traits a campaign author can attach. */
    readonly vocabulary: (
      campaignId: CampaignId,
    ) => Effect.Effect<OptionVocabulary, NotFound, CurrentActor>;
    /**
     * This campaign's vocabulary: what it has copied in, plus the bundle.
     *
     * **Not paged.** A vocabulary is bounded by what it hangs off, like a
     * campaign's members and a night's checklist — the reads `Page.ts` names as
     * deliberately unpaged. `OPTION_LIMIT` is a sanity bound, not a page.
     *
     * This is the read the **create form's pickers** make, which is the only
     * list in the product a player reads to fill in a control. So the last
     * clause of `corpusRowReadable` — `isDm OR visibility = 'shared'` — is what
     * decides whether a class is pickable, and the copy-in dialog is where that
     * is answered out loud.
     */
    readonly list: (
      campaignId: CampaignId,
      filter: OptionFilterValues,
    ) => Effect.Effect<ReadonlyArray<CharacterOption>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      id: CharacterOptionId,
    ) => Effect.Effect<CharacterOption, NotFound, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      id: CharacterOptionId,
      patch: OptionUpdate,
    ) => Effect.Effect<CharacterOption, NotFound | Conflict, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      id: CharacterOptionId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
    /**
     * **Bring an option into this campaign** — the copy, and the only way a row
     * gets here.
     *
     * A **snapshot**: nothing is read through `derived_from`, so editing the
     * original afterwards does not reach the copy and deleting the original
     * leaves it standing with a null pointer. The same rule a derived creature
     * follows, and the same rule a character follows one hop further on.
     */
    readonly derive: (
      campaignId: CampaignId,
      id: CharacterOptionId,
      patch: OptionDerive,
    ) => Effect.Effect<CharacterOption, NotFound | Conflict, CurrentActor>;
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

      /** One row of this campaign's vocabulary, or a 404 that says nothing more. */
      const readable = (campaignId: CampaignId, id: CharacterOptionId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<OptionRow>`
            select * from character_option
            where character_option.id = ${id}
              and ${corpusRowReadable(sql, "character_option", campaignId, actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "option", id });
          return rows[0]!;
        });

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

      /**
       * What `derive` may copy: this campaign's vocabulary, the bundle, or the
       * caller's own Library — and nothing else.
       *
       * A separate reader rather than a flag on `readable`, so the wider
       * predicate is reachable from exactly one method, which is the rule
       * `Creatures.ts` states for the identical function.
       */
      const copyable = (campaignId: CampaignId, id: CharacterOptionId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<OptionRow>`
            select * from character_option
            where character_option.id = ${id}
              and ${copyableIntoCampaign(sql, "character_option", campaignId, actor)}
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
        vocabulary: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignWritable(sql, campaignId, actor);
              return yield* campaignVocabulary(sql, campaignId);
            }),
          ),

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
                  corpusRowReadable(sql, "character_option", campaignId, actor),
                  ...ofKind(sql, filter.kind),
                ])}
                order by ${readOrder(sql)}
                limit ${OPTION_LIMIT}
              `;
              return yield* hydrateAll(rows);
            }),
          ),

        findById: (campaignId, id) =>
          dieOnSqlError(Effect.flatMap(readable(campaignId, id), hydrate)),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                // Read first, so the kind is known before the body is judged —
                // and so a caller who may not write the row learns nothing more
                // than that it is not there.
                const row = yield* readable(campaignId, id);
                const columns = yield* columnsFor(row, patch, patch.visibility);
                const rows = yield* sql<OptionRow>`
                  update character_option set ${setClause(sql, columns)}
                  where character_option.id = ${id}
                    and ${rowWritable(sql, "character_option", campaignId, actor)}
                  returning *
                `;
                // A bundled option lands here: readable through this campaign,
                // not writable, and the refusal says the same thing as "no such
                // option" on purpose.
                if (rows.length === 0) return yield* new NotFound({ resource: "option", id });
                const updated = rows[0]!;
                yield* syncOptionRelationsInput(sql, updated.id, patch.relations);
                return yield* hydrate(updated);
              }),
            ),
          ),

        remove: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: CharacterOptionId }>`
                delete from character_option
                where character_option.id = ${id}
                  and ${rowWritable(sql, "character_option", campaignId, actor)}
                returning character_option.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "option", id });
            }),
          ),

        derive: (campaignId, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                const source = yield* copyable(campaignId, id);
                if (patch.body !== undefined && bodyKind(patch.body) !== source.kind) {
                  return yield* wrongKind(source.kind, bodyKind(patch.body));
                }
                const rows = yield* sql<OptionRow>`
                  insert into character_option ${sql.insert(
                    defined({
                      campaign_id: campaignId,
                      derived_from: source.id,
                      source_corpus: source.source_corpus,
                      source_family: source.source_family,
                      source_key: source.source_key,
                      // Not from the patch, and there is no field for it: a
                      // class that arrived as a race would carry a document
                      // its own column contradicts. What a copy is, is what the
                      // original was.
                      kind: source.kind,
                      name: patch.name ?? source.name,
                      body: encodeBody(patch.body ?? source.body),
                      // **Not copied**, and this is the field the feature turns
                      // on. A copy is a new row and a new row fails closed, so
                      // it takes the column default (`dm`) unless the payload
                      // says otherwise — and for a *class* the shipped dialog
                      // does say otherwise, out loud, because a rules entry no
                      // player can pick is not a rules entry. Inheriting the
                      // original's would make the safe default depend on what
                      // you happened to copy from; a Library original has no
                      // visibility to inherit in the first place.
                      visibility: patch.visibility,
                    }),
                  )}
                  returning *
                `;
                const copy = rows[0]!;
                if (source.kind === "class") {
                  yield* copyClassProgression(
                    sql,
                    source.id,
                    copy.id,
                    { campaign_id: campaignId },
                    patch.visibility,
                  );
                }
                yield* copyOptionRelationships(sql, source.id, copy.id, {
                  campaign_id: campaignId,
                });
                yield* syncOptionRelationsInput(sql, copy.id, patch.relations);
                return yield* hydrate(copy);
              }),
            ),
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
