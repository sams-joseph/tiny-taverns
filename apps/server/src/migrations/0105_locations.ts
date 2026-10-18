import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Locations: an account's places, put into a world by placement and shown to
 * a table by reveal.
 *
 * ### `location` — account-owned and top-level, like a character
 *
 * A place belongs to the account that made it and to no campaign or world; the
 * Library's Locations shelf is the owner's read of their own. It is never
 * copied into a table: a Shared World's campaigns share one atlas because they
 * point at the same rows.
 *
 * **Nested by a same-owner key.** `(parent_id, account_id)` references
 * `(id, account_id)` `on delete cascade`, so a child is always its parent's
 * owner's, a cross-owner tree is not a row Postgres will store, and deleting a
 * place deletes its whole subtree without ever reaching somebody else's place.
 * A cycle is refused by `Locations.update` under the row's lock; a self-parent
 * by the check here.
 *
 * **Provenance, no visibility.** Who may read a place is its owner, a member
 * of a world it is placed in, or a player of a campaign that revealed it — no
 * dm/shared switch answers that. It carries the provenance pair because a
 * person may keep a Hob draft of one, and the turn's key is `set null`, as
 * `character`'s is (`0056`): a place kept from a campaign's thread outlives
 * the campaign and its thread, so the pointer empties and the origin stays.
 *
 * Absent prose is `null`, never blank (`0052_descriptions.ts`). The bounds are
 * the wire's (`Location.ts` in `@taverns/api`).
 *
 * ### `context_location` — a placement
 *
 * One row puts a place, with every place under it, into a context: a Shared
 * World or a standalone campaign's hidden context. `(location_id, account_id)`
 * against the location's `(id, account_id)` makes the placer the place's
 * owner, so nobody can place another account's location; the generated
 * `placer_is_member` key makes the placer a live member of the context, with
 * the eligibility idiom `0001` gives the other "requires a live X" pairs.
 * Deleting a place, its context or the placer's membership's world cascades it.
 *
 * ### `campaign_location_reveal` — what one table has discovered
 *
 * Written by the campaign's creator. On its own it grants nothing: a player's
 * read also requires the place to be in the campaign's context, so a reveal
 * left behind by a move reaches nothing (`repo/visibility.ts`,
 * `locationShownToPlayer`). The moves delete stale ones anyway.
 *
 * All three are in `NOT_CONTENT` (`schema.test.ts`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table location (
      id                 uuid primary key default gen_random_uuid(),
      account_id         uuid not null references account (id) on delete cascade,
      parent_id          uuid,
      kind               text not null
                           constraint location_kind_check check (kind in (
                             'realm', 'region', 'wilderness', 'city', 'town', 'village',
                             'district', 'dungeon', 'landmark', 'building'
                           )),
      name               text not null
                           constraint location_name_shape
                           check (btrim(name) <> '' and char_length(name) <= 120),
      description        text
                           constraint location_description_shape
                           check (btrim(description) <> '' and char_length(description) <= 2000),
      appearance         text
                           constraint location_appearance_shape
                           check (btrim(appearance) <> '' and char_length(appearance) <= 400),
      notes              text
                           constraint location_notes_shape
                           check (btrim(notes) <> '' and char_length(notes) <= 4000),
      origin             text not null default 'authored'
                           constraint location_origin_check check (origin in ('authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint location_id_account_key unique (id, account_id),
      constraint location_not_own_parent check (parent_id <> id),
      constraint location_parent_fkey foreign key (parent_id, account_id)
        references location (id, account_id) on delete cascade,
      constraint location_assistant_turn_fkey foreign key (assistant_turn_id)
        references assistant_turn (id) on delete set null deferrable initially deferred,
      constraint location_assistant_provenance
        check (assistant_turn_id is null or origin = 'assistant')
    )
  `;
  yield* sql`create index location_account_idx on location (account_id)`;
  yield* sql`create index location_parent_idx on location (parent_id)`;

  yield* sql`
    create table context_location (
      group_id          uuid not null references play_group (id) on delete cascade,
      location_id       uuid not null,
      account_id        uuid not null,
      placed_at         timestamptz not null default now(),
      placer_is_member  boolean generated always as (true) stored,
      primary key (group_id, location_id),
      constraint context_location_owner_fkey foreign key (location_id, account_id)
        references location (id, account_id) on delete cascade,
      constraint context_location_placer_is_member foreign key (group_id, account_id, placer_is_member)
        references group_member (group_id, account_id, is_active)
        deferrable initially deferred
    )
  `;
  yield* sql`create index context_location_location_idx on context_location (location_id)`;

  yield* sql`
    create table campaign_location_reveal (
      campaign_id  uuid not null references campaign (id) on delete cascade,
      location_id  uuid not null references location (id) on delete cascade,
      revealed_at  timestamptz not null default now(),
      primary key (campaign_id, location_id)
    )
  `;
  yield* sql`create index campaign_location_reveal_location_idx on campaign_location_reveal (location_id)`;
});
