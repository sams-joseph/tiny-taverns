import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Collapse the imported 2014 corpus provenance to the only identity the product
 * needs: a stable source key on the concrete domain row. Relationships observed
 * in the source are represented by concrete join tables rather than by the old
 * generic source revision/link graph, and no raw source payloads, content hashes,
 * URLs or import runs remain in the application schema.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table creature add column source_corpus text`;
  yield* sql`alter table creature add column source_family text`;
  yield* sql`alter table creature add column source_key text`;
  yield* sql`alter table character_option add column source_corpus text`;
  yield* sql`alter table character_option add column source_family text`;
  yield* sql`alter table character_option add column source_key text`;
  yield* sql`alter table spell add column source_corpus text`;
  yield* sql`alter table spell add column source_family text`;
  yield* sql`alter table spell add column source_key text`;
  yield* sql`alter table equipment add column source_corpus text`;
  yield* sql`alter table equipment add column source_family text`;
  yield* sql`alter table equipment add column source_key text`;
  yield* sql`alter table magic_item add column source_corpus text`;
  yield* sql`alter table magic_item add column source_family text`;
  yield* sql`alter table magic_item add column source_key text`;

  yield* sql`
    update creature
    set source_corpus = case
          when rules_source_document.system = 'taverns' and rules_source_document.edition = 'project'
            then 'taverns-starter'
          when rules_source_document.system = 'dnd-5e-srd' and rules_source_document.edition = '2014'
            then '5e-bits-2014'
          else rules_source_document.system || ':' || rules_source_document.edition || ':' || rules_source_document.document_version
        end,
        source_family = rules_source_entity.family,
        source_key    = rules_source_entity.source_index
    from rules_source_entity
    join rules_source_document on rules_source_document.id = rules_source_entity.document_id
    where creature.source_entity_id = rules_source_entity.id
  `;
  yield* sql`
    update character_option
    set source_corpus = case
          when rules_source_document.system = 'taverns' and rules_source_document.edition = 'project'
            then 'taverns-starter'
          when rules_source_document.system = 'dnd-5e-srd' and rules_source_document.edition = '2014'
            then '5e-bits-2014'
          else rules_source_document.system || ':' || rules_source_document.edition || ':' || rules_source_document.document_version
        end,
        source_family = rules_source_entity.family,
        source_key    = rules_source_entity.source_index
    from rules_source_entity
    join rules_source_document on rules_source_document.id = rules_source_entity.document_id
    where character_option.source_entity_id = rules_source_entity.id
  `;
  yield* sql`
    update spell
    set source_corpus = case
          when rules_source_document.system = 'taverns' and rules_source_document.edition = 'project'
            then 'taverns-starter'
          when rules_source_document.system = 'dnd-5e-srd' and rules_source_document.edition = '2014'
            then '5e-bits-2014'
          else rules_source_document.system || ':' || rules_source_document.edition || ':' || rules_source_document.document_version
        end,
        source_family = rules_source_entity.family,
        source_key    = rules_source_entity.source_index
    from rules_source_entity
    join rules_source_document on rules_source_document.id = rules_source_entity.document_id
    where spell.source_entity_id = rules_source_entity.id
  `;
  yield* sql`
    update equipment
    set source_corpus = case
          when rules_source_document.system = 'taverns' and rules_source_document.edition = 'project'
            then 'taverns-starter'
          when rules_source_document.system = 'dnd-5e-srd' and rules_source_document.edition = '2014'
            then '5e-bits-2014'
          else rules_source_document.system || ':' || rules_source_document.edition || ':' || rules_source_document.document_version
        end,
        source_family = rules_source_entity.family,
        source_key    = rules_source_entity.source_index
    from rules_source_entity
    join rules_source_document on rules_source_document.id = rules_source_entity.document_id
    where equipment.source_entity_id = rules_source_entity.id
  `;
  yield* sql`
    update magic_item
    set source_corpus = case
          when rules_source_document.system = 'taverns' and rules_source_document.edition = 'project'
            then 'taverns-starter'
          when rules_source_document.system = 'dnd-5e-srd' and rules_source_document.edition = '2014'
            then '5e-bits-2014'
          else rules_source_document.system || ':' || rules_source_document.edition || ':' || rules_source_document.document_version
        end,
        source_family = rules_source_entity.family,
        source_key    = rules_source_entity.source_index
    from rules_source_entity
    join rules_source_document on rules_source_document.id = rules_source_entity.document_id
    where magic_item.source_entity_id = rules_source_entity.id
  `;

  yield* sql`drop index creature_source_revision_id_idx`;
  yield* sql`drop index creature_source_entity_id_idx`;
  yield* sql`drop index creature_system_source_entity_key`;
  yield* sql`drop index character_option_source_revision_id_idx`;
  yield* sql`drop index character_option_source_entity_id_idx`;
  yield* sql`drop index character_option_system_source_entity_key`;
  yield* sql`drop index spell_source_revision_id_idx`;
  yield* sql`drop index spell_source_entity_id_idx`;
  yield* sql`drop index spell_system_source_entity_key`;
  yield* sql`drop index equipment_source_revision_id_idx`;
  yield* sql`drop index equipment_source_entity_id_idx`;
  yield* sql`drop index equipment_system_source_entity_key`;
  yield* sql`drop index magic_item_source_revision_id_idx`;
  yield* sql`drop index magic_item_source_entity_id_idx`;
  yield* sql`drop index magic_item_system_source_entity_key`;

  yield* sql`alter table creature drop constraint creature_source_revision_pair_fkey`;
  yield* sql`alter table creature drop constraint creature_source_entity_fkey`;
  yield* sql`alter table creature drop constraint creature_source_provenance_pair`;
  yield* sql`alter table character_option drop constraint character_option_source_revision_pair_fkey`;
  yield* sql`alter table character_option drop constraint character_option_source_entity_fkey`;
  yield* sql`alter table character_option drop constraint character_option_source_provenance_pair`;
  yield* sql`alter table spell drop constraint spell_source_revision_pair_fkey`;
  yield* sql`alter table spell drop constraint spell_source_entity_fkey`;
  yield* sql`alter table spell drop constraint spell_source_provenance_pair`;
  yield* sql`alter table equipment drop constraint equipment_source_revision_pair_fkey`;
  yield* sql`alter table equipment drop constraint equipment_source_entity_fkey`;
  yield* sql`alter table equipment drop constraint equipment_source_provenance_pair`;
  yield* sql`alter table magic_item drop constraint magic_item_source_revision_pair_fkey`;
  yield* sql`alter table magic_item drop constraint magic_item_source_entity_fkey`;
  yield* sql`alter table magic_item drop constraint magic_item_source_provenance_pair`;

  yield* sql`alter table creature drop column source_revision_id`;
  yield* sql`alter table creature drop column source_entity_id`;
  yield* sql`alter table character_option drop column source_revision_id`;
  yield* sql`alter table character_option drop column source_entity_id`;
  yield* sql`alter table spell drop column source_revision_id`;
  yield* sql`alter table spell drop column source_entity_id`;
  yield* sql`alter table equipment drop column source_revision_id`;
  yield* sql`alter table equipment drop column source_entity_id`;
  yield* sql`alter table magic_item drop column source_revision_id`;
  yield* sql`alter table magic_item drop column source_entity_id`;

  yield* sql`
    alter table creature add constraint creature_source_key_triplet
      check (
        (source_corpus is null and source_family is null and source_key is null)
        or (
          source_corpus is not null and source_family is not null and source_key is not null
          and btrim(source_corpus) <> '' and btrim(source_family) <> '' and btrim(source_key) <> ''
        )
      )
  `;
  yield* sql`
    alter table character_option add constraint character_option_source_key_triplet
      check (
        (source_corpus is null and source_family is null and source_key is null)
        or (
          source_corpus is not null and source_family is not null and source_key is not null
          and btrim(source_corpus) <> '' and btrim(source_family) <> '' and btrim(source_key) <> ''
        )
      )
  `;
  yield* sql`
    alter table spell add constraint spell_source_key_triplet
      check (
        (source_corpus is null and source_family is null and source_key is null)
        or (
          source_corpus is not null and source_family is not null and source_key is not null
          and btrim(source_corpus) <> '' and btrim(source_family) <> '' and btrim(source_key) <> ''
        )
      )
  `;
  yield* sql`
    alter table equipment add constraint equipment_source_key_triplet
      check (
        (source_corpus is null and source_family is null and source_key is null)
        or (
          source_corpus is not null and source_family is not null and source_key is not null
          and btrim(source_corpus) <> '' and btrim(source_family) <> '' and btrim(source_key) <> ''
        )
      )
  `;
  yield* sql`
    alter table magic_item add constraint magic_item_source_key_triplet
      check (
        (source_corpus is null and source_family is null and source_key is null)
        or (
          source_corpus is not null and source_family is not null and source_key is not null
          and btrim(source_corpus) <> '' and btrim(source_family) <> '' and btrim(source_key) <> ''
        )
      )
  `;

  yield* sql`
    create unique index creature_system_source_key
      on creature (source_corpus, source_family, source_key)
      where campaign_id is null and account_id is null and source_key is not null
  `;
  yield* sql`
    create unique index character_option_system_source_key
      on character_option (source_corpus, source_family, source_key)
      where campaign_id is null and account_id is null and source_key is not null
  `;
  yield* sql`
    create unique index spell_system_source_key
      on spell (source_corpus, source_family, source_key)
      where campaign_id is null and account_id is null and source_key is not null
  `;
  yield* sql`
    create unique index equipment_system_source_key
      on equipment (source_corpus, source_family, source_key)
      where campaign_id is null and account_id is null and source_key is not null
  `;
  yield* sql`
    create unique index magic_item_system_source_key
      on magic_item (source_corpus, source_family, source_key)
      where campaign_id is null and account_id is null and source_key is not null
  `;

  yield* sql`
    create function taverns_strip_source_urls(value jsonb) returns jsonb
    language sql immutable as $$
      select case jsonb_typeof(value)
        when 'object' then coalesce(
          (
            select jsonb_object_agg(key, taverns_strip_source_urls(val))
            from jsonb_each(value) as entries(key, val)
            where key not in ('url', 'sourceUrl')
          ),
          '{}'::jsonb
        )
        when 'array' then coalesce(
          (
            select jsonb_agg(taverns_strip_source_urls(element))
            from jsonb_array_elements(value) as elements(element)
          ),
          '[]'::jsonb
        )
        else value
      end
    $$
  `;
  yield* sql`update creature set body = taverns_strip_source_urls(body)`;
  yield* sql`update character_option set body = taverns_strip_source_urls(body)`;
  yield* sql`update spell set body = taverns_strip_source_urls(body)`;
  yield* sql`update equipment set body = taverns_strip_source_urls(body)`;
  yield* sql`update magic_item set body = taverns_strip_source_urls(body)`;
  yield* sql`drop function taverns_strip_source_urls(jsonb)`;

  const concreteSourceTable = (name: string): string => `
    create table ${name} (
      id            uuid primary key default gen_random_uuid(),
      source_corpus text not null,
      source_key    text not null,
      name          text not null,
      created_at    timestamptz not null default now(),
      updated_at    timestamptz not null default now(),
      constraint ${name}_nonempty
        check (
          btrim(source_corpus) <> ''
          and btrim(source_key) <> ''
          and btrim(name) <> ''
        ),
      constraint ${name}_source_key unique (source_corpus, source_key)
    )
  `;

  yield* sql.unsafe(concreteSourceTable("magic_school"));
  yield* sql.unsafe(concreteSourceTable("ability_score"));
  yield* sql.unsafe(concreteSourceTable("damage_type"));
  yield* sql.unsafe(concreteSourceTable("equipment_category"));
  yield* sql.unsafe(concreteSourceTable("weapon_property"));
  yield* sql.unsafe(concreteSourceTable("magic_item_rarity"));
  yield* sql.unsafe(concreteSourceTable("proficiency"));
  yield* sql.unsafe(concreteSourceTable("condition"));

  yield* sql`alter table spell add column school_id uuid references magic_school (id)`;
  yield* sql`alter table spell add column dc_ability_id uuid references ability_score (id)`;
  yield* sql`alter table character_option add constraint character_option_id_kind_key unique (id, kind)`;
  yield* sql`
    create table spell_class (
      spell_id        uuid not null references spell (id) on delete cascade,
      class_option_id uuid not null,
      class_kind      text not null default 'class' check (class_kind = 'class'),
      ordinal         integer not null default 0,
      primary key (spell_id, class_option_id),
      constraint spell_class_option_fkey
        foreign key (class_option_id, class_kind) references character_option (id, kind),
      constraint spell_class_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index spell_class_class_option_id_idx on spell_class (class_option_id)`;
  yield* sql`
    create table spell_damage_type (
      spell_id       uuid not null references spell (id) on delete cascade,
      damage_type_id uuid not null references damage_type (id),
      relation       text not null,
      ordinal        integer not null default 0,
      primary key (spell_id, relation, damage_type_id),
      constraint spell_damage_type_relation check (relation in ('damage')),
      constraint spell_damage_type_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index spell_damage_type_damage_type_id_idx on spell_damage_type (damage_type_id)`;

  yield* sql`alter table equipment add column category_id uuid references equipment_category (id)`;
  yield* sql`alter table equipment add column gear_category_id uuid references equipment_category (id)`;
  yield* sql`alter table equipment add column damage_type_id uuid references damage_type (id)`;
  yield* sql`alter table equipment add column two_handed_damage_type_id uuid references damage_type (id)`;
  yield* sql`
    create table equipment_property (
      equipment_id       uuid not null references equipment (id) on delete cascade,
      weapon_property_id uuid not null references weapon_property (id),
      ordinal            integer not null default 0,
      primary key (equipment_id, weapon_property_id),
      constraint equipment_property_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index equipment_property_weapon_property_id_idx on equipment_property (weapon_property_id)`;
  yield* sql`
    create table equipment_content (
      equipment_id           uuid not null references equipment (id) on delete cascade,
      contained_equipment_id uuid not null references equipment (id),
      quantity               double precision not null,
      ordinal                integer not null default 0,
      primary key (equipment_id, contained_equipment_id, ordinal),
      constraint equipment_content_quantity_positive check (quantity > 0),
      constraint equipment_content_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index equipment_content_contained_equipment_id_idx on equipment_content (contained_equipment_id)`;

  yield* sql`alter table magic_item add column category_id uuid references equipment_category (id)`;
  yield* sql`alter table magic_item add column rarity_id uuid references magic_item_rarity (id)`;
  yield* sql`
    create table magic_item_variant (
      base_item_id    uuid not null references magic_item (id) on delete cascade,
      variant_item_id uuid not null references magic_item (id) on delete cascade,
      ordinal         integer not null default 0,
      primary key (base_item_id, variant_item_id),
      constraint magic_item_variant_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create unique index magic_item_variant_variant_item_id_key on magic_item_variant (variant_item_id)`;

  yield* sql`
    create table character_option_equipment_reference (
      option_id    uuid not null references character_option (id) on delete cascade,
      equipment_id uuid not null references equipment (id),
      quantity     double precision not null,
      ordinal      integer not null default 0,
      primary key (option_id, equipment_id, ordinal),
      constraint character_option_equipment_reference_quantity_positive check (quantity > 0),
      constraint character_option_equipment_reference_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index character_option_equipment_reference_equipment_id_idx on character_option_equipment_reference (equipment_id)`;

  yield* sql`
    create table creature_proficiency (
      creature_id    uuid not null references creature (id) on delete cascade,
      proficiency_id uuid not null references proficiency (id),
      value          integer not null,
      ordinal        integer not null default 0,
      primary key (creature_id, proficiency_id),
      constraint creature_proficiency_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index creature_proficiency_proficiency_id_idx on creature_proficiency (proficiency_id)`;
  yield* sql`
    create table creature_condition_immunity (
      creature_id  uuid not null references creature (id) on delete cascade,
      condition_id uuid not null references condition (id),
      ordinal      integer not null default 0,
      primary key (creature_id, condition_id),
      constraint creature_condition_immunity_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index creature_condition_immunity_condition_id_idx on creature_condition_immunity (condition_id)`;
  yield* sql`
    create table creature_damage_type (
      creature_id     uuid not null references creature (id) on delete cascade,
      damage_type_id  uuid not null references damage_type (id),
      relation        text not null,
      ordinal         integer not null default 0,
      primary key (creature_id, relation, damage_type_id),
      constraint creature_damage_type_relation
        check (relation in ('vulnerability', 'resistance', 'immunity', 'feature')),
      constraint creature_damage_type_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index creature_damage_type_damage_type_id_idx on creature_damage_type (damage_type_id)`;
  yield* sql`
    create table creature_armor_equipment (
      creature_id  uuid not null references creature (id) on delete cascade,
      equipment_id uuid not null references equipment (id),
      ordinal      integer not null default 0,
      primary key (creature_id, equipment_id, ordinal),
      constraint creature_armor_equipment_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index creature_armor_equipment_equipment_id_idx on creature_armor_equipment (equipment_id)`;
  yield* sql`
    create table creature_spell (
      creature_id uuid not null references creature (id) on delete cascade,
      spell_id    uuid not null references spell (id),
      ordinal     integer not null default 0,
      primary key (creature_id, spell_id, ordinal),
      constraint creature_spell_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index creature_spell_spell_id_idx on creature_spell (spell_id)`;
  yield* sql`
    create table creature_form (
      creature_id uuid not null references creature (id) on delete cascade,
      form_id     uuid not null references creature (id),
      ordinal     integer not null default 0,
      primary key (creature_id, form_id, ordinal),
      constraint creature_form_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index creature_form_form_id_idx on creature_form (form_id)`;

  yield* sql`drop table rules_source_link`;
  yield* sql`drop table rules_source_entity_revision`;
  yield* sql`drop table rules_import_run`;
  yield* sql`drop table rules_source_entity`;
  yield* sql`drop table rules_source_document`;
});
