import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Switch the active character-rules vocabulary from the disposable 2024-style
 * `species` rows to 2014 `race` rows, with an optional subrace label on a
 * character. Historical migrations stay as they were; old disposable
 * `character_option.kind = 'species'` rows are removed before the constraint is
 * narrowed, and the 2014 importer seeds the replacement vocabulary.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table character drop column search`;
  yield* sql`alter table character drop column descriptor`;
  yield* sql`alter table character rename column species to race`;
  yield* sql`alter table character add column subrace text`;

  yield* sql`
    alter table character
      add column descriptor text generated always as (
        nullif(
          btrim(
            coalesce('Level ' || level::text || ' ', '') ||
            coalesce(subrace || ' ', coalesce(race || ' ', '')) ||
            coalesce(class_name, '')
          ),
        '')
      ) stored
  `;

  yield* sql`
    alter table character
      add column search tsvector generated always as (
        setweight(to_tsvector('english', name), 'A') ||
        setweight(to_tsvector('english',
          coalesce(player_name, '') || ' ' ||
          coalesce(race, '') || ' ' ||
          coalesce(subrace, '') || ' ' ||
          coalesce(class_name, '')), 'B') ||
        setweight(jsonb_to_tsvector('english', body, '["string"]'), 'C')
      ) stored
  `;
  yield* sql`create index character_search_idx on character using gin (search)`;

  yield* sql`delete from character_option where kind = 'species'`;
  yield* sql`alter table character_option drop constraint character_option_kind_check`;
  yield* sql`
    alter table character_option
      add constraint character_option_kind_check
      check (kind in ('class', 'race', 'background'))
  `;
});
