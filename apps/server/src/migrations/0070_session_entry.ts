import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A night's entry in the Chronicle: the summary the DM keeps for it, and whose
 * night it was.
 *
 * ### A summary kept above the detail, not in place of it
 *
 * The recap stays a view over retained detail (`repo/Recap.ts`): beats word
 * for word, fights by kind, read-alouds, ticked prep. What this adds is the
 * DM's own few sentences about the night, stored on the night and read above
 * that detail, never instead of it. The captain's decision of 2026-09-27
 * (Chronicle revamp, Q1 c): Hob may draft it, and only the DM's accept or the
 * DM's own write keeps it.
 *
 * ### The summary has its own provenance
 *
 * `session.origin` and `session.assistant_turn_id` say where the *night* came
 * from, and a night is not an accepted draft because its summary was. So the
 * summary carries its own pair, with the invariant the content tables use
 * (`0001_init.ts`), spelled so a null origin forces a null turn:
 * `summary_origin` is set exactly when `summary` is, and is `assistant`
 * exactly when `summary_assistant_turn_id` is. The turn key is the deferrable
 * `no action` every content table's is (`0010_assistant_conversation.ts`), so
 * an accepted summary pins the turn that drafted it and a campaign delete can
 * still cascade both in one statement.
 *
 * ### The spotlight names a seat of this campaign, or nothing
 *
 * `(spotlight_seat_id, campaign_id)` references the seat's
 * `(id, campaign_id)` (`campaign_character_id_campaign_key`, `0069`), so a
 * seat of another campaign is unrepresentable rather than checked. A deleted
 * seat clears only the pointer: `on delete set null (spotlight_seat_id)`,
 * because the plain form would null `campaign_id` as well. A seat is retired
 * rather than deleted when its character leaves, so a past night keeps whose
 * it was.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table session
      add column summary text,
      add column summary_origin text,
      add column summary_assistant_turn_id uuid,
      add column spotlight_seat_id uuid,
      add constraint session_summary_length
        check (char_length(summary) between 1 and 8000),
      add constraint session_summary_origin_values
        check (summary_origin in ('authored', 'assistant')),
      add constraint session_summary_has_origin
        check ((summary is null) = (summary_origin is null)),
      add constraint session_summary_assistant_provenance
        check ((summary_origin is not distinct from 'assistant')
               = (summary_assistant_turn_id is not null)),
      add constraint session_summary_turn_fkey
        foreign key (summary_assistant_turn_id) references assistant_turn (id)
        deferrable initially deferred,
      add constraint session_spotlight_seat_fkey
        foreign key (spotlight_seat_id, campaign_id)
        references campaign_character (id, campaign_id)
        on delete set null (spotlight_seat_id)
  `;
  yield* sql`
    create index session_spotlight_seat_id_idx on session (spotlight_seat_id)
      where spotlight_seat_id is not null
  `;
});
