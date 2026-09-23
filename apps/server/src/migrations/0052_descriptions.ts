import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A player-facing description on a campaign and on a Shared World: the pitch
 * every reader of the row reads, and what its one cover is drawn from
 * (`CampaignImage.ts`, `SharedWorldImage.ts`).
 *
 * **Columns, not a document key**, because neither table has a document: a
 * campaign and a world are rows of columns, and one line of prose does not
 * earn a `jsonb` body. An NPC's appearance line needed no migration for the
 * opposite reason: it is a key of the `persona` document the NPC already has.
 *
 * **Absent is `null`, never blank.** The server stores a blank as `null`, and
 * the check refuses anything else, so a reader has one test for "none was
 * written". The bound is the wire's (`CAMPAIGN_DESCRIPTION_MAX`,
 * `SHARED_WORLD_DESCRIPTION_MAX`), restated here so a write that went round
 * the API is refused too.
 *
 * Nullable with no default and no backfill: a campaign or world made before
 * this has no description, and inventing one would be a guess.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table campaign add column description text
      constraint campaign_description_shape
        check (btrim(description) <> '' and char_length(description) <= 600)
  `;

  yield* sql`
    alter table play_group add column description text
      constraint play_group_description_shape
        check (btrim(description) <> '' and char_length(description) <= 600)
  `;
});
