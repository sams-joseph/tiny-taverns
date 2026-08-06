import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The prep surface: authored encounters, the per-session checklist, and the
 * attachment that lets a read-aloud note hang off an encounter.
 *
 * Forward-only, like every migration here. The three-column tail —
 * `visibility` / `origin` / `assistant_turn_id` — is repeated literally on each
 * new table rather than factored into a helper: a migration file is a record of
 * what ran, and `apps/server/test/schema.test.ts` fails if a table omits any of
 * it.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // The authored template. Reusable and independent of any session — running it
  // will produce a separate `encounter_run` rather than mutating this row.
  //
  // `difficulty` is the DMG encounter band, not a creature's challenge rating.
  // The fixtures name the field `cr` and then fill it with `Easy`/`Medium`/
  // `Deadly` and branch on those strings, so the column is named for what it
  // holds. Nullable: a sketched encounter has not been rated yet.
  //
  // `tags` is a `text[]` and not a join table. The vocabulary is genuinely open
  // — "Marsh", "Night", "Boss" — and the encounter grid is the first thing
  // `CampaignHome` renders, so a join there is paid on every page load. If tags
  // ever need per-tag metadata the column becomes `jsonb`, which is one
  // migration, not a redesign.
  yield* sql`
    create table encounter (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid not null references campaign (id) on delete cascade,
      name               text not null,
      difficulty         text check (difficulty in ('Easy', 'Medium', 'Hard', 'Deadly')),
      tags               text[] not null default '{}',
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint encounter_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index encounter_campaign_id_idx on encounter (campaign_id)`;
  yield* sql`create index encounter_tags_idx on encounter using gin (tags)`;

  // "Before you sit down". Hangs off the session, not the campaign — settled;
  // see `decisions/prep-scope.md`. There is deliberately no `campaign_id` copy:
  // the read predicate walks session → campaign, so there is no second answer to
  // "which campaign is this in" that could drift from the first.
  yield* sql`
    create table prep_item (
      id                 uuid primary key default gen_random_uuid(),
      session_id         uuid not null references session (id) on delete cascade,
      label              text not null,
      done               boolean not null default false,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint prep_item_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index prep_item_session_id_idx on prep_item (session_id)`;

  // A read-aloud attached to an encounter. Nullable, so the free-standing note
  // the Notes tab shows is the same row shape with nothing in this column.
  yield* sql`alter table note add column encounter_id uuid`;

  // The foreign key is *composite*, and that is the whole point of the extra
  // unique constraint above it. A plain `references encounter (id)` would let a
  // note in campaign A attach to an encounter in campaign B: both belong to the
  // same DM, so nothing rejects it, and the note then reads as part of a
  // campaign it is not in. Naming `campaign_id` in the key makes that
  // unrepresentable rather than merely unlikely.
  //
  // Postgres matches a composite key only when every column is non-null, so an
  // unattached note (`encounter_id is null`) is simply not constrained — which
  // is exactly the wanted behaviour and the reason no partial index or trigger
  // is needed.
  //
  // `set null (encounter_id)` — the trailing column list is Postgres 15+ and is
  // load-bearing: a bare `set null` would null `campaign_id` too and hit its
  // not-null. Detach rather than cascade because the DM wrote that read-aloud.
  // Deleting an encounter should lose the encounter, not the prose; the note
  // reappears free-standing on the Notes tab.
  yield* sql`alter table encounter add constraint encounter_id_campaign_key unique (id, campaign_id)`;
  yield* sql`
    alter table note
      add constraint note_encounter_fkey
      foreign key (encounter_id, campaign_id) references encounter (id, campaign_id)
      on delete set null (encounter_id)
  `;
  yield* sql`create index note_encounter_id_idx on note (encounter_id) where encounter_id is not null`;
});
