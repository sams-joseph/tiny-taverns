import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Columns the complete 2014 monster corpus actually needs for list filters.
 *
 * The rich stat block still lives in `creature.body`; these are the pieces the
 * Library and campaign Bestiary can narrow in SQL without reading a page and
 * filtering it in React. Existing project-written and homebrew creatures get
 * empty/default values, so their snapshot behaviour is unchanged.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table creature add column subtype text`;
  yield* sql`alter table creature add column alignment text`;
  yield* sql`alter table creature add column damage_vulnerabilities text[] not null default '{}'`;
  yield* sql`alter table creature add column damage_resistances text[] not null default '{}'`;
  yield* sql`alter table creature add column damage_immunities text[] not null default '{}'`;
  yield* sql`alter table creature add column condition_immunities text[] not null default '{}'`;
  yield* sql`alter table creature add column movement_modes text[] not null default '{}'`;
  yield* sql`alter table creature add column spellcaster boolean not null default false`;

  yield* sql`drop index creature_search_idx`;
  yield* sql`alter table creature drop column search`;
  yield* sql`
    alter table creature
      add column search tsvector generated always as (
        setweight(to_tsvector('english', name), 'A') ||
        setweight(to_tsvector('english',
          coalesce(size, '') || ' ' ||
          type || ' ' ||
          coalesce(subtype, '') || ' ' ||
          coalesce(alignment, '')
        ), 'B') ||
        setweight(jsonb_to_tsvector('english', body, '["string"]'), 'C')
      ) stored
  `;

  yield* sql`create index creature_search_idx on creature using gin (search)`;
  yield* sql`create index creature_cr_sort_idx on creature (cr_sort, name, id)`;
  yield* sql`create index creature_size_lower_idx on creature (lower(size)) where size is not null`;
  yield* sql`create index creature_type_lower_idx on creature (lower(type))`;
  yield* sql`create index creature_subtype_lower_idx on creature (lower(subtype)) where subtype is not null`;
  yield* sql`create index creature_alignment_lower_idx on creature (lower(alignment)) where alignment is not null`;
  yield* sql`create index creature_damage_vulnerabilities_idx on creature using gin (damage_vulnerabilities)`;
  yield* sql`create index creature_damage_resistances_idx on creature using gin (damage_resistances)`;
  yield* sql`create index creature_damage_immunities_idx on creature using gin (damage_immunities)`;
  yield* sql`create index creature_condition_immunities_idx on creature using gin (condition_immunities)`;
  yield* sql`create index creature_movement_modes_idx on creature using gin (movement_modes)`;
  yield* sql`create index creature_legendary_idx on creature (legendary)`;
  yield* sql`create index creature_spellcaster_idx on creature (spellcaster)`;
});
