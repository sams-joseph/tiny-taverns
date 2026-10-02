import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A character's level-ups: one row per level gained through the level-up
 * write (`POST /me/characters/:id/level-up`, `repo/Advancement.ts`).
 *
 * ### A row, not a line of the sheet
 *
 * The sheet has had a `levelUps` log since it was drawn, and nothing writes
 * it. The record is read by more than a renderer: an undo reads the latest
 * one and reverses exactly what it applied, and a level-up Hob proposed and
 * the owner kept is stamped with the turn it came from like every accepted
 * row. In the document it would race every other sheet write, and anybody
 * with a whole-sheet PATCH could rewrite what an undo trusts.
 *
 * - `level` is the level reached, one per character (`unique (character_id,
 *   level)`), so the latest is the one an undo names. A record above the
 *   character's level describes a level the Level box has since taken away;
 *   gaining that level again replaces it (`Advancement.levelUp`).
 * - `class_name` is a snapshot of the class it was reached in, which is the
 *   door multiclassing would come through.
 * - `hp_method`, `hp_die` and `hp_gain`: fixed or rolled, the die's part, and
 *   what was added to `hp_max` (CON, the race's bonus, and any CON change
 *   carried back over earlier levels).
 * - `choices` is `AdvancementChoices` (`packages/api/src/Advancement.ts`), what
 *   the owner chose, by id and by name; `applied` is `AdvancementApplied`, the
 *   deltas the server wrote, never on the wire.
 *
 * ### Account-owned, with the whole tail
 *
 * Deleting the character takes its records (`on delete cascade`). Who may
 * read one is exactly who may read its character, so `visibility` is inert
 * like `character.visibility` is (`schema.test.ts` requires the column on
 * every content table, and nothing reads it). The provenance pair takes
 * `0056`'s treatment, `character`'s own: the record outlives any one
 * conversation, so a deleted turn empties the pointer (`on delete set null`)
 * and the check is the direction that still holds, a turn means the row is
 * the assistant's.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table character_advancement (
      id                uuid primary key default gen_random_uuid(),
      character_id      uuid not null references character (id) on delete cascade,
      level             integer not null,
      class_name        text not null,
      hp_method         text not null,
      hp_die            integer not null,
      hp_gain           integer not null,
      choices           jsonb not null,
      applied           jsonb not null,
      note              text,
      visibility        text not null default 'dm' check (visibility in ('dm', 'shared')),
      origin            text not null default 'authored'
                          check (origin in ('authored', 'assistant')),
      assistant_turn_id uuid,
      created_at        timestamptz not null default now(),
      constraint character_advancement_level_range check (level between 2 and 100),
      constraint character_advancement_hp_method check (hp_method in ('fixed', 'rolled')),
      constraint character_advancement_hp_die_positive check (hp_die >= 1),
      constraint character_advancement_note_length check (length(note) <= 2000),
      constraint character_advancement_one_per_level unique (character_id, level),
      constraint character_advancement_assistant_provenance
        check (assistant_turn_id is null or origin = 'assistant')
    )
  `;
  yield* sql`
    alter table character_advancement
      add constraint character_advancement_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      on delete set null
      deferrable initially deferred
  `;
});
