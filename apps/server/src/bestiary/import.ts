import { emptyStatBlock } from "@taverns/api";
import { Effect } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import { crSortFor } from "../repo/Creatures.js";
import { SYSTEM_CREATURES, type SystemCreature } from "./systemCreatures.js";

/** What one run of the import did. */
export interface ImportResult {
  readonly inserted: number;
  readonly updated: number;
}

/**
 * Writes the bundled corpus into `creature` as global `system` rows.
 *
 * **This is the only writer of `origin = 'system'`, and it is deliberately not
 * an HTTP endpoint.** Global content has no owning campaign, so there is no
 * campaign in a path to scope it, no `CurrentActor` that could be checked
 * against it, and nothing for the visibility predicates to contain it with. An
 * endpoint that could mint one would be an endpoint that writes rows every
 * campaign can read — which is exactly the thing the whole seam exists to make
 * impossible. Provisioning the shared corpus is an operator's job, run from a
 * shell, and this function is what `src/bin/import-bestiary.ts` calls.
 *
 * It is therefore also the one place in `src/` that reads or writes campaign
 * content without `CurrentActor` in its requirements. That exception is the
 * *reason* it is confined to this file and to a bin script, and a second one
 * should be argued for rather than added.
 *
 * Idempotent: upserts on `creature_system_name_key`, the partial unique index
 * over `lower(name)` where the row is owned by nobody. Re-running it after
 * editing this corpus updates the rows in place, so a DM's reskins — which point
 * at these rows through `derived_from` — survive.
 *
 * **The inference clause has to name both ownership columns**, and that is a
 * requirement of Postgres rather than tidiness: `0015_library_creatures.ts`
 * narrowed the index to `campaign_id is null and account_id is null` when a null
 * campaign stopped meaning "nobody's", and an arbiter index is inferred only
 * from an inference predicate that *implies* the index's own. `where campaign_id
 * is null` no longer does, so it would fail to infer any index at all.
 *
 * `visibility` is never written, so the column default (`dm`) decides on
 * insert and an existing row's value is left alone on update. A DM who shared a
 * system creature with their table does not have it un-shared by an upgrade.
 */
export const importSystemCreatures = (
  corpus: ReadonlyArray<SystemCreature> = SYSTEM_CREATURES,
): Effect.Effect<ImportResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        let inserted = 0;
        let updated = 0;

        for (const creature of corpus) {
          // `xmax = 0` is true only for a tuple this statement inserted, which
          // is how an upsert reports which of the two things it did.
          const rows = yield* sql<{ readonly inserted: boolean }>`
            insert into creature (
              campaign_id, origin, name, size, type, cr, cr_sort,
              ac, hp, environments, legendary, body
            )
            values (
              null,
              'system',
              ${creature.name},
              ${creature.size ?? null},
              ${creature.type},
              ${creature.cr},
              ${creature.crSort ?? crSortFor(creature.cr)},
              ${creature.ac},
              ${creature.hp},
              ${creature.environments ?? []},
              ${creature.legendary ?? false},
              ${JSON.stringify(creature.statBlock ?? emptyStatBlock)}
            )
            on conflict (lower(name)) where campaign_id is null and account_id is null
            do update set
              size         = excluded.size,
              type         = excluded.type,
              cr           = excluded.cr,
              cr_sort      = excluded.cr_sort,
              ac           = excluded.ac,
              hp           = excluded.hp,
              environments = excluded.environments,
              legendary    = excluded.legendary,
              body         = excluded.body,
              updated_at   = now()
            returning (xmax = 0) as inserted
          `;
          if (rows[0]?.inserted === true) inserted += 1;
          else updated += 1;
        }

        return { inserted, updated };
      }),
    );
  });
