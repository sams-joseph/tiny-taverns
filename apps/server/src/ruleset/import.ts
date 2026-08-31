import { Effect } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import { beginRulesImport, sourceRevisionFor, TAVERNS_STARTER_SOURCE } from "./source.js";
import { SYSTEM_OPTIONS, type SystemOption } from "./systemOptions.js";

/** What one run of the import did. */
export interface ImportResult {
  readonly inserted: number;
  readonly updated: number;
}

/**
 * Writes the bundled classes, species and backgrounds into `character_option`
 * as global `system` rows.
 *
 * **The second writer of `origin = 'system'`, and it is deliberately not an
 * HTTP endpoint** — `bestiary/import.ts` states the reasoning at length and it
 * transfers unchanged: global content has no owning campaign, so there is no
 * campaign in a path to scope it, no `CurrentActor` that could be checked
 * against it, and nothing for the visibility predicates to contain it with. An
 * endpoint that could mint one would be an endpoint that writes rows every
 * campaign can read.
 *
 * So this and the bestiary importer are the only two places in `src/` that
 * touch campaign content without `CurrentActor` in their requirements, and that
 * exception is why each is confined to one file behind one bin script.
 *
 * Idempotent: upserts on `character_option_system_source_entity_key`, the
 * partial unique index over a stable source identity rather than over the
 * display name. A source rename therefore updates one row instead of inserting
 * another, and two future source entities may share a name without one
 * overwriting the other. The source document this importer writes is Taverns'
 * own starter bundle — not 5e-bits and not SRD content.
 *
 * Existing development data is disposable for this foundation slice, so there
 * is deliberately no `(kind, name)` adoption path. A database that needs the
 * new identity starts fresh and imports by source key from the first row.
 *
 * ### It writes `visibility = 'shared'` on insert, and the bestiary importer
 * does not. That difference is the whole reason this comment is long.
 *
 * **Confirmed by the captain on 2026-08-27 as a rule, not as a historical
 * note.** The `insert`-names-it / `do update`-does-not asymmetry below is
 * deliberate and is the settled answer; it is not an oversight to tidy. Pinned
 * by `apps/server/test/options.test.ts`'s *"says `shared` on insert and nothing
 * on update, so an upgrade never re-shares"*, which fails if the `do update`
 * clause gains a `visibility` line.
 *
 * `corpusRowReadable` ends in `isDm OR visibility = 'shared'`, and the column
 * default is `dm`. For a **creature** that is exactly right and is the point of
 * the feature: a stat block is precisely the thing the product says a player
 * must not have, so the bundled bestiary is DM-only until a DM shares a row.
 *
 * For a **class** it is the difference between working and not. This list is
 * what the create form's pickers read, and the create form is a *player's*
 * screen — so a bundle that landed `dm` would give every player in the product
 * an empty class picker, at every table, until each DM went and shared twelve
 * rows by hand. That is not a fail-closed default protecting anything; there is
 * nothing secret about the existence of the word "Druid".
 *
 * The rule this follows is the one the copy-in dialog follows: **the column
 * default does not change, and a writer that means `shared` says so out loud.**
 * No predicate moves, `dm` is still what an unstated visibility means, and a DM
 * who wants a class off their table's list un-shares it.
 *
 * Which is why the `do update` clause **does not touch `visibility`**, exactly
 * as the bestiary importer's does not: a DM who un-shared a bundled class does
 * not have it re-shared by an upgrade. `insert` says `shared`, `update` says
 * nothing, and between them the DM's choice is the one that survives.
 */
export const importSystemOptions = (
  corpus: ReadonlyArray<SystemOption> = SYSTEM_OPTIONS,
): Effect.Effect<ImportResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        let inserted = 0;
        let updated = 0;

        const context = yield* beginRulesImport(sql, TAVERNS_STARTER_SOURCE);

        for (const option of corpus) {
          const source = yield* sourceRevisionFor(sql, context, {
            family:
              option.kind === "class"
                ? "classes"
                : option.kind === "species"
                  ? "species"
                  : "backgrounds",
            sourceIndex: option.sourceIndex,
            name: option.name,
            raw: {
              kind: option.kind,
              sourceIndex: option.sourceIndex,
              name: option.name,
              body: option.body,
            },
          });

          // `xmax = 0` is true only for a tuple this statement inserted, which
          // is how an upsert reports which of the two things it did.
          // `visibility` is named in the `values` list and deliberately absent
          // from the `do update set` list below — the confirmed rule, stated at
          // length in this function's doc block.
          const rows = yield* sql<{ readonly inserted: boolean }>`
            insert into character_option (
              campaign_id, account_id, origin, source_entity_id, source_revision_id,
              kind, name, body, visibility
            )
            values (
              null,
              null,
              'system',
              ${source.sourceEntityId},
              ${source.sourceRevisionId},
              ${option.kind},
              ${option.name},
              ${JSON.stringify(option.body)},
              'shared'
            )
            on conflict (source_entity_id)
              where campaign_id is null and account_id is null and source_entity_id is not null
            do update set
              -- visibility is deliberately NOT set here, and IS named on the
              -- insert above. See this function's doc block: a DM who
              -- un-shared a bundled class must not have it re-shared by an
              -- upgrade. Not an omission; do not make the two consistent.
              source_revision_id = excluded.source_revision_id,
              kind       = excluded.kind,
              name       = excluded.name,
              body       = excluded.body,
              updated_at = now()
            returning (xmax = 0) as inserted
          `;
          if (rows[0]?.inserted === true) inserted += 1;
          else updated += 1;
        }

        return { inserted, updated };
      }),
    );
  });
