import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * The order the DM means to play a campaign's encounters in.
 *
 * ### `encounter_prep.position`, not `encounter.position`
 *
 * The play order is the DM's plan for the table, the same kind of thing as
 * the tactics and the Ready switch, so it goes on the creator-only prep row
 * (`0060_encounter_prep.ts`). There is a sharper reason too: a player who
 * could see positions 1, 2 and 5 would learn that two encounters exist which
 * they cannot read. No number reaches the wire; a list's array order is the
 * whole answer, the player's included (`repo/Encounters.ts`).
 *
 * ### Dense, and one slot per encounter
 *
 * `0..n-1` within a campaign, rewritten whole by a move (`Encounters.move`):
 * a campaign has tens of encounters, and the unique key makes two encounters
 * in one slot unrepresentable rather than a tie something must break. A delete
 * leaves a gap, which is harmless — order is all a reader takes from it — and
 * the next move closes it. The key is `deferrable` because Postgres checks a
 * non-deferrable unique key row by row, so a one-statement renumber would fail
 * partway through a swap; `initially immediate` still checks at the end of
 * each statement. Its index also serves `order by position` in a campaign.
 *
 * The backfill is creation order, the order every list had until now, so
 * nothing moves for anybody when this runs.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table encounter_prep add column position integer`;
  yield* sql`
    update encounter_prep set position = ranked.n
    from (
      select encounter_prep.encounter_id,
             (row_number() over (partition by encounter_prep.campaign_id
                                 order by encounter.created_at, encounter.id) - 1)::int as n
      from encounter_prep
      join encounter on encounter.id = encounter_prep.encounter_id
    ) as ranked
    where ranked.encounter_id = encounter_prep.encounter_id
  `;
  yield* sql`
    alter table encounter_prep
      alter column position set not null,
      add constraint encounter_prep_position_nonnegative check (position >= 0),
      add constraint encounter_prep_campaign_position_key
        unique (campaign_id, position) deferrable initially immediate
  `;
});
