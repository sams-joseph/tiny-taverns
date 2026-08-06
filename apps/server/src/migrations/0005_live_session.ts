import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The live session: the running fight, the creatures in it, and the log of
 * everything that happened.
 *
 * Forward-only, like every migration here, and the three-column
 * `visibility` / `origin` / `assistant_turn_id` tail is written out literally on
 * each new table rather than factored into a helper — a migration file is a
 * record of what ran, and `apps/server/test/schema.test.ts` fails if a table
 * omits any of it.
 *
 * Two composite foreign keys appear below and both are doing the same job the
 * one on `note.encounter_id` does: making "this pointer names a row in someone
 * else's container" unrepresentable rather than merely unlikely. They work here
 * — unlike on `encounter_creature.creature_id` — because both ends of each
 * pointer really do carry the container's id.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // One playing of an encounter.
  //
  // Separate from `encounter` because the template is reusable and a run is
  // not: `data.js:9-13` is three named templates and `:14-22` is one list of
  // instances with hit points, and damaging a goblin must never write to the
  // encounter the DM will run again next month.
  //
  // `encounter_id` detaches rather than cascades, and `encounter_name` is
  // snapshotted beside it. The run is a record of a night that happened;
  // deleting a template a month later should lose the template, not the
  // history — the same call `note.encounter_id` makes, for the same reason.
  // The snapshot is not a duplicate of `encounter.name` either: that column is
  // what the template is called now, this one is what the fight was called
  // then, and a rename must not rewrite the log.
  //
  // `active_combatant_id` is a **pointer, not an index into initiative order**.
  // The report proposed `turn_index` and the prototype holds one
  // (`EncounterRunner.jsx:88`), but that prototype never adds a combatant
  // (`:137`), removes one (`:107`) or rerolls initiative (`:138`) — and all
  // three reorder the list, after which an index quietly refers to a different
  // creature while the screen still says whose turn it is. A pointer survives
  // every one of them.
  //
  // There is no `player_view_enabled`. `visibility` *is* the runner's `Share`
  // switch (`:122`): the nested read predicate already gates every combatant on
  // its run being readable, so a second boolean meaning "shared" next to a
  // column called `visibility` would be one question with two answers.
  yield* sql`
    create table encounter_run (
      id                   uuid primary key default gen_random_uuid(),
      session_id           uuid not null references session (id) on delete cascade,
      encounter_id         uuid,
      encounter_name       text not null,
      round                integer not null default 1 check (round between 1 and 10000),
      active_combatant_id  uuid,
      started_at           timestamptz not null default now(),
      ended_at             timestamptz,
      visibility           text not null default 'dm'
                             check (visibility in ('dm', 'shared')),
      origin               text not null default 'authored'
                             check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id    uuid,
      created_at           timestamptz not null default now(),
      updated_at           timestamptz not null default now(),
      constraint encounter_run_ended_after_started
        check (ended_at is null or ended_at >= started_at),
      constraint encounter_run_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index encounter_run_session_id_idx on encounter_run (session_id)`;
  yield* sql`create index encounter_run_encounter_id_idx on encounter_run (encounter_id) where encounter_id is not null`;

  // The run's encounter must belong to the run's campaign, and there is no
  // column here to say which campaign that is — `encounter_run` hangs off
  // `session`, and a nested table gets no denormalised `campaign_id` (see
  // `prep_item`, `encounter_creature`). So the containment is enforced in
  // `EncounterRuns`, against the same predicate an encounter read uses. This
  // foreign key is only about the row existing.
  yield* sql`
    alter table encounter_run
      add constraint encounter_run_encounter_fkey
      foreign key (encounter_id) references encounter (id) on delete set null
  `;

  // **Exactly one encounter is live.** The pointer that says *which* lives on
  // `session` below; this is what stops there being two candidates for it.
  //
  // A partial unique index rather than a trigger or a repository check: it
  // holds against `psql`, against a future endpoint nobody has written yet, and
  // against two clients racing to start a fight — none of which a check in
  // TypeScript survives. Ending a run sets `ended_at`, which drops it out of
  // the index and frees the session for the next one, so "a fight interrupted
  // and resumed" (§1.4) is a second row here rather than an exception to this.
  yield* sql`
    create unique index encounter_run_one_live_per_session
      on encounter_run (session_id) where ended_at is null
  `;

  // One creature instance in one fight.
  //
  // `data.js:18-19` is the whole argument for this table existing: two
  // `Goblin Archer` rows, different ids, `hp: 4` and `hp: 0`. The bestiary entry
  // is a template and the roster line says how many; these are the ones on the
  // table, and they are damaged one at a time.
  //
  // Every displayable field is **snapshotted at seed time**, not joined.
  // `character_id`/`creature_id` are `on delete set null` and are read by
  // nothing — they are provenance, the same shape as `creature.derived_from`.
  // A combatant whose name came from a join would go blank mid-fight the moment
  // someone tidied the bestiary in another tab.
  //
  // `hp_current >= 0` and nothing more. Zero is a legal, frequent, deliberate
  // state — `EncounterRunner.jsx:107` says "Still in initiative — remove them
  // when you're ready" — so there is no constraint, cascade or default anywhere
  // that treats it as removal. Removal is a `delete`, and only ever an explicit
  // one.
  //
  // At most one source, and it has to agree with `kind`: a row seeded from a
  // character is a `pc` and one seeded from a creature is an `npc`. Not
  // *exactly* one, because the runner can add a combatant by hand (`:137`) and
  // a wolf the DM summoned in the moment has no row to point at.
  yield* sql`
    create table combatant (
      id                 uuid primary key default gen_random_uuid(),
      encounter_run_id   uuid not null references encounter_run (id) on delete cascade,
      character_id       uuid references character (id) on delete set null,
      creature_id        uuid references creature (id) on delete set null,
      display_name       text not null,
      subtitle           text,
      player_name        text,
      initiative         integer not null default 0 check (initiative between -50 and 100),
      hp_current         integer not null default 0 check (hp_current between 0 and 10000),
      hp_max             integer not null default 0 check (hp_max between 0 and 10000),
      ac                 integer check (ac between 0 and 40),
      kind               text not null default 'npc' check (kind in ('pc', 'npc')),
      conditions         text[] not null default '{}',
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint combatant_single_source
        check (character_id is null or creature_id is null),
      constraint combatant_source_matches_kind
        check ((character_id is null or kind = 'pc') and (creature_id is null or kind = 'npc')),
      constraint combatant_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  // The initiative list, in the order it is read: highest first, then oldest,
  // then by id so two combatants rolling the same number (`data.js:18-19`, both
  // at 14) still have one settled order rather than whichever the planner felt
  // like. Turn advance walks this, so "deterministic" is not cosmetic.
  yield* sql`create index combatant_run_order_idx on combatant (encounter_run_id, initiative desc, created_at asc, id asc)`;
  yield* sql`create index combatant_character_id_idx on combatant (character_id) where character_id is not null`;
  yield* sql`create index combatant_creature_id_idx on combatant (creature_id) where creature_id is not null`;

  // The turn marker may only name a combatant **in this run**.
  //
  // Composite, and here the trick genuinely applies: both ends carry the run
  // id, which is exactly what `encounter_creature.creature_id` could not do
  // (half the creatures it may name are global and have no campaign). Postgres
  // matches a composite key only when every column is non-null, so a run with
  // nobody up is simply unconstrained.
  //
  // `set null (active_combatant_id)` — the trailing column list is Postgres 15+
  // and load-bearing for the same reason it is on `note_encounter_fkey`: a bare
  // `set null` would null `id` too, which is the primary key. The repository
  // advances the marker before removing whoever it is on, so this is the
  // backstop rather than the normal path.
  yield* sql`alter table combatant add constraint combatant_id_run_key unique (id, encounter_run_id)`;
  yield* sql`
    alter table encounter_run
      add constraint encounter_run_active_combatant_fkey
      foreign key (active_combatant_id, id) references combatant (id, encounter_run_id)
      on delete set null (active_combatant_id)
  `;

  // "On the table now" (`data.js:10`, `CampaignHome.jsx:23`).
  //
  // A pointer on the session, not a flag per encounter — a boolean on each
  // encounter would let two rows both claim the table, and would also be a
  // property of a *template* rather than of a night. Composite again, so a
  // session cannot point at another session's fight.
  //
  // Nothing sets this directly: there is no endpoint or payload field for it.
  // It is written only by starting and ending a run, in the same transaction,
  // which is what stops it naming a fight that is already over.
  yield* sql`alter table encounter_run add constraint encounter_run_id_session_key unique (id, session_id)`;
  yield* sql`alter table session add column active_encounter_run_id uuid`;
  yield* sql`
    alter table session
      add constraint session_active_encounter_run_fkey
      foreign key (active_encounter_run_id, id) references encounter_run (id, session_id)
      on delete set null (active_encounter_run_id)
  `;

  // The cursor every live event carries, and the thing reconnect resumes from.
  //
  // **One global sequence, not `max(seq) + 1` per session.** Two concurrent
  // writers reading the same maximum is a genuine race under `read committed`,
  // and repairing it costs a lock or a retry loop around a unique violation. A
  // cursor only has to increase — nothing counts it, nothing renders it, and
  // `since=<seq>` is a `>` comparison — so the gaps left where another session
  // wrote in between are invisible to every consumer. Monotonic within a
  // session falls out for free.
  yield* sql`create sequence session_event_seq as bigint`;

  // The append-only log. Nothing updates a row here and nothing deletes one;
  // the repository exposes only `list`, and there is no endpoint that could.
  //
  // Written in the same transaction as the mutation it describes — one extra
  // insert per live write, which §3.4 argues pays for itself three times over:
  // the stream's reconnect replay, the end-of-session recap, and the
  // assistant's grounding. It is not event sourcing; the state tables remain
  // the source of truth and this is never replayed to rebuild them.
  //
  // `encounter_run_id` and `combatant_id` are columns rather than payload keys
  // because they are what a reader filters on — the live stream is scoped to
  // one run — and a `jsonb ->>` filter is neither indexable here nor honest
  // about the foreign key. Both detach rather than cascade: the log outlives
  // what it is about, which is the point of a log.
  yield* sql`
    create table session_event (
      id                 uuid primary key default gen_random_uuid(),
      session_id         uuid not null references session (id) on delete cascade,
      seq                bigint not null default nextval('session_event_seq'),
      kind               text not null check (kind in (
                           'run-started', 'run-updated', 'run-ended',
                           'combatant-added', 'combatant-updated', 'combatant-removed',
                           'combatant-damaged', 'turn-advanced'
                         )),
      encounter_run_id   uuid references encounter_run (id) on delete set null,
      combatant_id       uuid references combatant (id) on delete set null,
      payload            jsonb not null default '{}'::jsonb,
      request_id         text,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint session_event_seq_unique unique (session_id, seq),
      constraint session_event_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  // The two reads this table has: the whole session's log from a cursor, and
  // one run's from a cursor. Both are `seq > ? order by seq`, which is what the
  // live stream tails and what a reconnect replays — the same query, which is
  // why reconnect is not a separate code path that could rot.
  yield* sql`create index session_event_session_seq_idx on session_event (session_id, seq)`;
  yield* sql`create index session_event_run_seq_idx on session_event (encounter_run_id, seq) where encounter_run_id is not null`;

  // Idempotency, as one index (§4.3).
  //
  // Live mutations carry a client-generated `request_id`; a repeat of one
  // already recorded for this run returns the current state without applying
  // anything a second time. This is not offline-first design — it is what stops
  // a double-tapped damage button taking ten hit points instead of five, on a
  // touch screen, in a dark room. Scoped to the run rather than globally so two
  // fights cannot collide on a client's counter.
  yield* sql`
    create unique index session_event_request_id_key
      on session_event (encounter_run_id, request_id)
      where request_id is not null and encounter_run_id is not null
  `;
});
