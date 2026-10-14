import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A member of the Cast in a fight as itself: `encounter_creature.npc_id` puts
 * one on an encounter's roster, and `combatant.npc_id` is the row `start`
 * seeds from that line.
 *
 * ### The roster line names the NPC and the stat block it fights as
 *
 * What a creature may do in a fight is read from a stat block alone
 * (`npcTurnOptions`); an NPC's character-style sheet has no structured reach,
 * range, area or DC to read. So a Cast line carries both keys: `creature_id`
 * is the block it fights as ("Sildar, as a Veteran"), minted into the
 * campaign by the roster's create exactly as any line's is, and `npc_id` is
 * who it is. A Cast member is one creature, so its line's count is one.
 *
 * ### One line per creature, and one per NPC
 *
 * `encounter_creature_unique (encounter_id, creature_id)` held a creature to
 * one line. A Cast member fighting as a Veteran beside three plain Veterans is
 * two lines naming one creature, so the creature unique narrows to the lines
 * that name no NPC, and the NPC gets its own.
 *
 * ### Lines made together keep their order
 *
 * The roster reads oldest line first, and the lines an encounter is made with
 * are written in one transaction, where `now()` is one instant. The old
 * creature unique happened to hand them back in the order they were added;
 * the partial one does not. `created_at` (and `updated_at` beside it) default
 * to `clock_timestamp()`, so each line is stamped as it is written and the
 * order is the DM's.
 *
 * ### What a delete does
 *
 * Deleting the NPC deletes its roster lines: "Sildar, as a Veteran" without
 * Sildar is not a Veteran nobody asked for. A combatant already seeded keeps
 * its snapshot and its `npc_id` goes null, as `character_id` and
 * `creature_id` do: the pointer is provenance and grants no reach. Archiving
 * the NPC touches neither.
 *
 * ### Containment is the repository's
 *
 * Neither table carries the campaign, so no composite key can name it, as
 * `encounter_creature.creature_id` cannot. The roster's create reads the NPC
 * under the campaign in its path, and `start` copies only what its own roster
 * read returns.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter_creature
      add column npc_id uuid references npc (id) on delete cascade,
      add constraint encounter_creature_npc_one check (npc_id is null or count = 1)
  `;
  yield* sql`alter table encounter_creature drop constraint encounter_creature_unique`;
  yield* sql`
    create unique index encounter_creature_unique
      on encounter_creature (encounter_id, creature_id) where npc_id is null
  `;
  yield* sql`
    create unique index encounter_creature_npc_unique
      on encounter_creature (encounter_id, npc_id) where npc_id is not null
  `;
  yield* sql`
    alter table encounter_creature
      alter column created_at set default clock_timestamp(),
      alter column updated_at set default clock_timestamp()
  `;
  yield* sql`create index encounter_creature_npc_id_idx on encounter_creature (npc_id) where npc_id is not null`;

  yield* sql`
    alter table combatant
      add column npc_id uuid references npc (id) on delete set null,
      add constraint combatant_npc_is_npc check (npc_id is null or kind = 'npc')
  `;
  yield* sql`create index combatant_npc_id_idx on combatant (npc_id) where npc_id is not null`;
});
