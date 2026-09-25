import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * An encounter's kind, and its DM prep: the tactics, the treasure, and the
 * numbers a skill challenge or a hazard is run by.
 *
 * ### `encounter.kind`
 *
 * Combat, social, challenge or hazard. Every encounter made before this
 * was a fight — nothing else could be written — so the default is `combat`,
 * and that is the backfill. It is on `encounter` because it is what the list
 * is filtered by and a player reading a shared encounter may see it.
 *
 * ### `encounter_prep` — one per encounter, its own row
 *
 * `0057_battle_maps.ts`'s first reason, for the same kind of data: a player
 * reads a shared encounter (`rowReadable`), and the DM's plan for the scene is
 * the creator's alone. Columns on `encounter` would put the treasure and the
 * tactics on a row a player's read selects, one forgotten column list away
 * from the wire. On their own table no player read touches them. Like the map,
 * every encounter has one: `Encounters.create` inserts both in one
 * transaction, and every encounter made before this gets an empty one here.
 *
 * **The challenge's shape follows the kind, structurally.** The row carries
 * its encounter's kind through the foreign key `(encounter_id, campaign_id,
 * kind)`, `on update cascade`, so it is the encounter's kind and cannot be
 * another; the check then refuses a challenge tagged with any other kind. A
 * fight or a conversation therefore holds no challenge, and changing an
 * encounter's kind fails unless its challenge was cleared first — which
 * `Encounters.update` does, in the same transaction. (`unique (id,
 * campaign_id, kind)` on `encounter` is what the key references; `id` alone is
 * already unique, so it constrains nothing new.)
 *
 * **The shapes are the wire's.** `tactics` is a JSON array of short lines, in
 * order, bounded at `ENCOUNTER_TACTICS_MAX`; `challenge` is the wire's
 * `EncounterChallenge` document, whose fields `@taverns/api` validates on the
 * way in. `treasure` is prose: absent is `null`, never blank, as
 * `0052_descriptions.ts` does.
 *
 * **Not campaign content.** No `visibility` or `origin` of its own: who may
 * read it is the campaign's creator, through `CampaignCreatorActor`, and where
 * it came from is its encounter's provenance — an accepted Hob proposal writes
 * both in one transaction. It is in `NOT_CONTENT` (`schema.test.ts`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter
      add column kind text not null default 'combat'
        constraint encounter_kind_known
        check (kind in ('combat', 'social', 'challenge', 'hazard')),
      add constraint encounter_id_campaign_kind_key unique (id, campaign_id, kind)
  `;

  yield* sql`
    create table encounter_prep (
      encounter_id      uuid primary key,
      campaign_id       uuid not null,
      kind              text not null,
      tactics           jsonb not null default '[]'::jsonb
                          constraint encounter_prep_tactics_shape
                          check (jsonb_typeof(tactics) = 'array'
                                 and jsonb_array_length(tactics) <= 12),
      treasure          text
                          constraint encounter_prep_treasure_shape
                          check (btrim(treasure) <> '' and char_length(treasure) <= 500),
      challenge         jsonb
                          constraint encounter_prep_challenge_kind
                          check (challenge is null
                                 or (jsonb_typeof(challenge) = 'object'
                                     and challenge ->> 'kind' in ('challenge', 'hazard')
                                     and challenge ->> 'kind' = kind)),
      created_at        timestamptz not null default now(),
      updated_at        timestamptz not null default now(),
      constraint encounter_prep_encounter_fkey foreign key (encounter_id, campaign_id, kind)
        references encounter (id, campaign_id, kind) on delete cascade on update cascade
    )
  `;
  // The creator's list read is every encounter's prep in one campaign.
  yield* sql`create index encounter_prep_campaign on encounter_prep (campaign_id)`;

  // Every encounter already made gets its empty prep, so "every encounter has
  // one" holds from here on. Nothing is invented: no tactics, no treasure.
  yield* sql`
    insert into encounter_prep (encounter_id, campaign_id, kind)
    select encounter.id, encounter.campaign_id, encounter.kind from encounter
  `;
});
