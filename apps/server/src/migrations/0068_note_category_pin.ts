import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A note's category and its pin: `note.category` and `note.pinned_at`.
 *
 * ### The category is what a note is about, beside `kind`
 *
 * `kind` is the register the text is set in — plain, or read-aloud prose the
 * encounter builder, the runner and the Overview depend on. `category` is the
 * topic (an NPC, a place, lore, prep, a house rule) and is independent of it:
 * a read-aloud can be about a place. Nullable with **no backfill**, so every
 * note written before this starts uncategorised rather than carrying a guess.
 *
 * ### The pin is a time, and not an edit
 *
 * `pinned_at` is when the DM pinned the note, or null. Only the pin endpoints
 * write it, and they leave `updated_at` alone (`repo/Notes.ts`'s `setPinned`),
 * so pinning reorders the list without reading as the last edit.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table note
      add column category text
        check (category in ('npc', 'place', 'lore', 'prep', 'rules')),
      add column pinned_at timestamptz
  `;
});
