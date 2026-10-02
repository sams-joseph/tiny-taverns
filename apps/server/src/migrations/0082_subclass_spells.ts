import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * The spells a subclass grants, and when: a Life cleric's *Bless* at cleric 1,
 * a Land druid's *Hold Person* at druid 3 when the circle is Arctic.
 *
 * `spell_subclass` (`0026`) answers which subclass lists a spell is on, which
 * is what the spell picker reads. It cannot say when a subclass spell is
 * gained, and it cannot hold a spell twice under one subclass, which the Land
 * druid needs: *Spike Growth* is an Arctic spell and a Mountain one. So this is
 * a table of its own, one row per line of the source's subclass spell list.
 *
 * `level` is the class level the spell is gained at. `feature_id` is the
 * feature that further gates it, the circle's terrain, and null when every
 * member of the subclass gains it. The importer writes it from the pinned
 * snapshot; nothing authors it, so it holds the bundle's rows only and takes
 * its reach from the subclass, as the other join tables do.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table subclass_spell (
      subclass_id uuid not null references subclass (id) on delete cascade,
      ordinal     integer not null,
      spell_id    uuid not null references spell (id) on delete cascade,
      level       integer not null,
      feature_id  uuid references feature (id) on delete cascade,
      primary key (subclass_id, ordinal),
      constraint subclass_spell_ordinal_nonnegative check (ordinal >= 0),
      constraint subclass_spell_level_range check (level between 1 and 100),
      constraint subclass_spell_once unique nulls not distinct (subclass_id, spell_id, feature_id)
    )
  `;
  yield* sql`create index subclass_spell_spell_id_idx on subclass_spell (spell_id)`;
  yield* sql`
    create index subclass_spell_feature_id_idx on subclass_spell (feature_id)
      where feature_id is not null
  `;
});
