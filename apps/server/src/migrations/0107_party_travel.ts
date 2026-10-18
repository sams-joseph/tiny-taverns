import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Where the party is, as the record of where it has been.
 *
 * ### `campaign_party_move`
 *
 * One row per move the table made: the place, its name as it was then, and
 * the night it happened on. Where the party is now is the newest row; there
 * is no position column to disagree with the log. Deleting a move is its
 * undo, and deleting the newest puts the party back where it was before.
 *
 * - **The place is a pointer, not a reach.** `location_id` is `set null` when
 *   the place is deleted, and `location_name` keeps the record readable; who
 *   may read the place is still the place's own predicate.
 * - **The night** is bound in the campaign by `(session_id, campaign_id)`, and
 *   deleting the night clears it alone (`set null (session_id)`), as an NPC's
 *   first meeting does (`0073`).
 * - **Provenance, no visibility.** The party's travels are the table's: its
 *   creator writes them and every member reads them, so no dm/shared switch
 *   answers that (`NOT_CONTENT`, `schema.test.ts`). The provenance pair is
 *   there because the creator may keep a move Hob proposed; the turn key is
 *   `set null` like `character`'s, so a deleted conversation leaves the move.
 *
 * `session_event.kind` gains `party-moved`: a move during an open night rings
 * the table's doorbell, so a player's map re-reads.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table campaign_party_move (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid not null references campaign (id) on delete cascade,
      location_id        uuid references location (id) on delete set null,
      location_name      text not null
                           constraint campaign_party_move_name_shape
                           check (btrim(location_name) <> '' and char_length(location_name) <= 120),
      session_id         uuid,
      moved_at           timestamptz not null default now(),
      origin             text not null default 'authored'
                           constraint campaign_party_move_origin_check
                           check (origin in ('authored', 'assistant')),
      assistant_turn_id  uuid,
      constraint campaign_party_move_session_fkey foreign key (session_id, campaign_id)
        references session (id, campaign_id) on delete set null (session_id),
      constraint campaign_party_move_assistant_turn_fkey foreign key (assistant_turn_id)
        references assistant_turn (id) on delete set null deferrable initially deferred,
      constraint campaign_party_move_assistant_provenance
        check (assistant_turn_id is null or origin = 'assistant')
    )
  `;
  yield* sql`
    create index campaign_party_move_campaign_idx
      on campaign_party_move (campaign_id, moved_at desc)
  `;
  yield* sql`create index campaign_party_move_location_idx on campaign_party_move (location_id)`;

  yield* sql`alter table session_event drop constraint session_event_kind_check`;
  yield* sql`
    alter table session_event
      add constraint session_event_kind_check check (kind in (
        'run-started', 'run-updated', 'run-ended', 'run-carried', 'run-resumed',
        'run-escalated',
        'combatant-added', 'combatant-updated', 'combatant-removed',
        'combatant-damaged', 'combatant-moved', 'turn-advanced', 'death-save',
        'beat-added', 'character-updated', 'roll-made',
        'hob-resource-spent', 'hob-resource-undone', 'hob-turn-kept', 'hob-turn-undone',
        'scene-updated', 'check-logged', 'check-removed',
        'board-fog-updated', 'board-area-updated',
        'party-moved'
      ))
  `;
});
