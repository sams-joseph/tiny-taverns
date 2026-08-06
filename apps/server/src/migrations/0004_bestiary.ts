import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The bestiary: creature templates, and the roster that lets an encounter
 * contain them.
 *
 * Forward-only, like every migration here, and the three-column
 * `visibility` / `origin` / `assistant_turn_id` tail is written out literally
 * on each new table rather than factored into a helper — a migration file is a
 * record of what ran, and `apps/server/test/schema.test.ts` fails if a table
 * omits any of it.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // The bestiary entry. A **template**, never an instance: `data.js:18-19` has
  // two `Goblin Archer` combatants with different hit points and different ids,
  // which is what a running encounter looks like. Nothing on this row changes
  // when a goblin takes damage.
  //
  // ### Row form and document form, both stored
  //
  // The same creature carries display strings (`data.js:23-33` — `ac: "17
  // (chain shirt, shield)"`, `hp: "21 (6d6)"`, `cr: "1 (200 XP)"`) *and*
  // filterable values (`data.js:36` — `ac: 17, hp: 21, cr: "1"`). Neither
  // derives from the other: normalising "17 (chain shirt, shield)" loses the
  // parenthetical the DM reads, and no rule reconstructs it from `17`. So the
  // filterable half is columns — which is what `Bestiary.jsx:11-12` searches and
  // what an encounter-difficulty calculation would need — and the display half
  // is one `jsonb` document that nothing queries into except full text.
  //
  // ### `campaign_id` is nullable, and that is the whole provenance story
  //
  // A `system` creature is global: bundled content, shared by every campaign,
  // and immutable. `creature_system_is_global` makes `origin = 'system'` and
  // `campaign_id is null` the same statement, so there is no such thing as a
  // campaign-scoped system row or a global authored one.
  //
  // Immutability is then **structural rather than a rule**: every write goes
  // through a predicate that requires `campaign_id` to equal the campaign named
  // in the request path, and a null never equals a uuid. There is no trigger and
  // no `is_immutable` flag to forget. A DM who wants to change a system creature
  // gets a campaign-scoped copy with `derived_from` set — see the endpoint —
  // which costs one nullable foreign key and keeps the shared corpus honest.
  //
  // ### `cr` is a string, `cr_sort` is a number
  //
  // `data.js:38` is `cr: "1/4"`. There is no numeric column that can hold what
  // the card prints, and no string column a database can order by, so both
  // exist. `double precision` rather than `numeric` for the sort key on purpose:
  // the pg driver hands `numeric` back as a *string* to protect precision it
  // does not need here — every challenge rating is an integer or one of 1/8,
  // 1/4, 1/2, all of which are exact in binary floating point.
  yield* sql`
    create table creature (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid references campaign (id) on delete cascade,
      derived_from       uuid references creature (id) on delete set null,
      name               text not null,
      size               text,
      type               text not null,
      cr                 text not null,
      cr_sort            double precision not null default 0
                           check (cr_sort >= 0 and cr_sort <= 1000),
      ac                 integer not null check (ac between 0 and 40),
      hp                 integer not null check (hp between 0 and 10000),
      environments       text[] not null default '{}',
      legendary          boolean not null default false,
      body               jsonb not null
                           default '{"meta":"","ac":"","hp":"","speed":"","cr":"","abilities":[],"traits":[]}'::jsonb,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      search             tsvector generated always as (
                           setweight(to_tsvector('english', name), 'A') ||
                           setweight(to_tsvector('english', coalesce(size, '') || ' ' || type), 'B') ||
                           setweight(jsonb_to_tsvector('english', body, '["string"]'), 'C')
                         ) stored,
      constraint creature_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint creature_system_is_global
        check ((origin = 'system') = (campaign_id is null))
    )
  `;
  yield* sql`create index creature_campaign_id_idx on creature (campaign_id)`;
  yield* sql`create index creature_environments_idx on creature using gin (environments)`;
  // Full text over the name, the size/type line and every string in the
  // document, so "nimble escape" finds the Goblin Boss by a trait nobody
  // thought to put in a column. Lexical search only — no embeddings, no second
  // vendor: a campaign's corpus is hundreds of rows and DMs search for the
  // words they wrote.
  yield* sql`create index creature_search_idx on creature using gin (search)`;
  yield* sql`create index creature_derived_from_idx on creature (derived_from) where derived_from is not null`;

  // One `Goblin Boss` in the shared corpus. Partial, so a campaign may still
  // author a creature with the same name as a system one — which is exactly
  // what a reskin does, and refusing it would make `derive` fail on the most
  // ordinary case there is.
  //
  // Also the conflict target the system-corpus importer upserts against, which
  // is what makes re-running the import an update rather than a duplicate.
  yield* sql`
    create unique index creature_system_name_key
      on creature (lower(name)) where campaign_id is null
  `;

  // What an encounter contains, and where the card's "6 creatures"
  // (`data.js:10`) comes from: `sum(count)` over these rows.
  //
  // Nested under `encounter`, with no `campaign_id` of its own — same reasoning
  // as `prep_item` under `session`. A denormalised copy is a second answer to
  // "which campaign is this in", and a child whose copy disagreed with its
  // parent's would be readable in a campaign it is not part of with nothing in
  // a `WHERE` clause to notice.
  //
  // `creature_id` is a plain foreign key and **not** the composite
  // `(id, campaign_id)` trick that guards `note.encounter_id`. It cannot be:
  // half the rows it may legally point at are global and have no campaign to
  // name. The containment is enforced in the repository instead, against the
  // same read predicate every other creature read uses — so it is one rule
  // applied twice, not a second rule.
  //
  // `creature_id` refuses the delete rather than cascading: losing a creature
  // that is on a roster would silently change what an encounter contains, and
  // the DM would find out by recounting the card. It is a 409 instead.
  //
  // **`deferrable initially deferred` is load-bearing, and this was measured.**
  // The check has to survive `delete from campaign`, which cascades into
  // `creature` and (through `encounter`) into `encounter_creature` in the same
  // statement. A plain `restrict` fires immediately and an *immediate* `no
  // action` fires as an after-trigger that Postgres runs before the roster rows
  // are gone — both reject a campaign delete that should have been fine.
  // Deferring moves the check to the end of the transaction, by which point the
  // roster is empty. Under autocommit, "end of the transaction" is still the
  // end of that one statement, so a lone `delete from creature` is refused on
  // the spot and the endpoint gets its 409 rather than a surprise at commit.
  yield* sql`
    create table encounter_creature (
      id                 uuid primary key default gen_random_uuid(),
      encounter_id       uuid not null references encounter (id) on delete cascade,
      creature_id        uuid not null references creature (id)
                           deferrable initially deferred,
      count              integer not null default 1 check (count between 1 and 999),
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint encounter_creature_unique unique (encounter_id, creature_id),
      constraint encounter_creature_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index encounter_creature_creature_id_idx on encounter_creature (creature_id)`;
});
