import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The keys that let a campaign change context, restated for every database
 * that was migrated before they were written.
 *
 * Connecting, moving and disconnecting a campaign all do one thing to it:
 * `update campaign set group_id`. Everything that pins a campaign by
 * `(id, group_id)` has to follow that update or refuse it, so those keys say
 * `on update cascade`. They were added by editing `0001_init`, `0013_group_invites`
 * and `0030_group_history` in place, and a ledger never runs an applied
 * migration twice: a database migrated before that edit kept the old keys, and
 * the first connect on it failed at `campaign_member_campaign_fkey`, because
 * every campaign has at least its creator's participation row.
 *
 * Each key is dropped and written again rather than altered, so the statement
 * is the same whichever shape a database holds — the old one here, the current
 * one on a database created since — and both end up with exactly what the
 * edited files declare. `if exists` covers the one key whose name changed.
 *
 * `group_history_entry.campaign_id` stops being composite. An accepted
 * Chronicle entry stays in the world that accepted it when its campaign leaves
 * (`0030`'s header), so it cannot share the campaign's `group_id`; it keeps the
 * pointer, which empties when the campaign is deleted.
 *
 * `group_invite.campaign_id` is left nullable on an older database. `0013` now
 * declares it `not null`, but a group-only invitation from before is a row
 * somebody made, and no read reaches it: every invitation read joins its
 * campaign. Deleting it to satisfy a constraint is not this migration's call.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table campaign_member
      drop constraint campaign_member_campaign_fkey,
      add constraint campaign_member_campaign_fkey
        foreign key (campaign_id, group_id)
        references campaign (id, group_id) on update cascade on delete cascade
  `;

  yield* sql`
    alter table campaign_character
      drop constraint campaign_character_campaign_fkey,
      add constraint campaign_character_campaign_fkey
        foreign key (campaign_id, group_id)
        references campaign (id, group_id) on update cascade on delete cascade
  `;

  yield* sql`
    alter table group_invite
      drop constraint group_invite_campaign_fkey,
      add constraint group_invite_campaign_fkey
        foreign key (campaign_id, group_id)
        references campaign (id, group_id) on update cascade on delete cascade
  `;

  yield* sql`
    alter table group_history_entry
      drop constraint if exists group_history_entry_campaign_fkey,
      drop constraint if exists group_history_entry_campaign_id_fkey,
      add constraint group_history_entry_campaign_id_fkey
        foreign key (campaign_id) references campaign (id) on delete set null
  `;
});
