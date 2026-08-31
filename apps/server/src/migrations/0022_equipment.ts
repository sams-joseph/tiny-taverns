import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The 2014 SRD mundane equipment corpus as its own copyable table.
 *
 * Equipment is neither a character option nor a magic item: its list needs
 * category, armor, weapon, tool, vehicle, property, cost and weight keys, while
 * its display document is the heterogeneous 5e-bits equipment shape. The table
 * follows the established Library ownership model exactly — unowned immutable
 * system rows, account-owned originals, and campaign snapshot copies.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table equipment (
      id                           uuid primary key default gen_random_uuid(),
      campaign_id                  uuid references campaign (id) on delete cascade,
      account_id                   uuid references account (id) on delete cascade,
      derived_from                 uuid references equipment (id) on delete set null,
      source_entity_id             uuid,
      source_revision_id           uuid,
      name                         text not null,
      category_index               text not null,
      category_name                text not null,
      cost_quantity                double precision not null check (cost_quantity >= 0),
      cost_unit                    text not null,
      cost_gp                      double precision not null check (cost_gp >= 0),
      weight                       double precision check (weight is null or weight >= 0),
      weight_sort                  double precision not null default 0 check (weight_sort >= 0),
      gear_category_index          text,
      gear_category_name           text,
      armor_category               text,
      weapon_category              text,
      weapon_range                 text,
      category_range               text,
      tool_category                text,
      vehicle_category             text,
      armor_class_base             integer check (armor_class_base is null or armor_class_base >= 0),
      armor_class_dex_bonus        boolean,
      armor_class_max_bonus        integer check (armor_class_max_bonus is null or armor_class_max_bonus >= 0),
      strength_minimum             integer check (strength_minimum is null or strength_minimum >= 0),
      stealth_disadvantage         boolean,
      damage_dice                  text,
      damage_type_index            text,
      damage_type_name             text,
      two_handed_damage_dice       text,
      two_handed_damage_type_index text,
      two_handed_damage_type_name  text,
      range_normal                 integer check (range_normal is null or range_normal >= 0),
      range_long                   integer check (range_long is null or range_long >= 0),
      throw_range_normal           integer check (throw_range_normal is null or throw_range_normal >= 0),
      throw_range_long             integer check (throw_range_long is null or throw_range_long >= 0),
      property_indexes             text[] not null default '{}'::text[],
      property_names               text[] not null default '{}'::text[],
      body                         jsonb not null default '{}'::jsonb,
      search                       tsvector generated always as (
        setweight(to_tsvector('english', name), 'A') ||
        setweight(to_tsvector('english', category_name || ' ' ||
          coalesce(gear_category_name, '') || ' ' ||
          coalesce(armor_category, '') || ' ' ||
          coalesce(weapon_category, '') || ' ' ||
          coalesce(weapon_range, '') || ' ' ||
          coalesce(tool_category, '') || ' ' ||
          coalesce(vehicle_category, '')), 'B') ||
        setweight(jsonb_to_tsvector('english', body, '["string"]'), 'C')
      ) stored,
      visibility                   text not null default 'dm'
                                     check (visibility in ('dm', 'shared')),
      origin                       text not null default 'authored'
                                     check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id            uuid,
      created_at                   timestamptz not null default now(),
      updated_at                   timestamptz not null default now(),
      constraint equipment_nonempty
        check (btrim(name) <> '' and btrim(category_index) <> '' and btrim(category_name) <> '' and btrim(cost_unit) <> ''),
      constraint equipment_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint equipment_one_owner
        check (campaign_id is null or account_id is null),
      constraint equipment_system_is_unowned
        check ((origin = 'system') = (campaign_id is null and account_id is null)),
      constraint equipment_source_provenance_pair
        check ((source_entity_id is null) = (source_revision_id is null)),
      constraint equipment_gear_category_pair
        check ((gear_category_index is null) = (gear_category_name is null)),
      constraint equipment_damage_type_pair
        check ((damage_type_index is null) = (damage_type_name is null)),
      constraint equipment_two_handed_damage_type_pair
        check ((two_handed_damage_type_index is null) = (two_handed_damage_type_name is null))
    )
  `;

  yield* sql`
    alter table equipment
      add constraint equipment_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;

  yield* sql`
    alter table equipment
      add constraint equipment_source_entity_fkey
      foreign key (source_entity_id) references rules_source_entity (id)
  `;

  yield* sql`
    alter table equipment
      add constraint equipment_source_revision_pair_fkey
      foreign key (source_revision_id, source_entity_id)
      references rules_source_entity_revision (id, entity_id)
  `;

  yield* sql`create index equipment_campaign_id_idx on equipment (campaign_id)`;
  yield* sql`
    create index equipment_account_id_idx on equipment (account_id)
      where account_id is not null
  `;
  yield* sql`
    create index equipment_derived_from_idx on equipment (derived_from)
      where derived_from is not null
  `;
  yield* sql`
    create index equipment_source_revision_id_idx on equipment (source_revision_id)
      where source_revision_id is not null
  `;
  yield* sql`
    create index equipment_source_entity_id_idx on equipment (source_entity_id)
      where source_entity_id is not null
  `;
  yield* sql`
    create unique index equipment_system_source_entity_key
      on equipment (source_entity_id)
      where campaign_id is null and account_id is null and source_entity_id is not null
  `;

  yield* sql`create index equipment_search_idx on equipment using gin (search)`;
  yield* sql`create index equipment_category_index_idx on equipment (category_index)`;
  yield* sql`create index equipment_gear_category_index_idx on equipment (gear_category_index)`;
  yield* sql`create index equipment_armor_category_idx on equipment (armor_category)`;
  yield* sql`create index equipment_weapon_category_idx on equipment (weapon_category)`;
  yield* sql`create index equipment_weapon_range_idx on equipment (weapon_range)`;
  yield* sql`create index equipment_tool_category_idx on equipment (tool_category)`;
  yield* sql`create index equipment_vehicle_category_idx on equipment (vehicle_category)`;
  yield* sql`create index equipment_property_indexes_idx on equipment using gin (property_indexes)`;
  yield* sql`create index equipment_cost_gp_idx on equipment (cost_gp)`;
  yield* sql`create index equipment_weight_sort_idx on equipment (weight_sort)`;
});
