import { PlayerCharacterCombatant, PlayerMonsterCombatant } from "@taverns/api";
import { Schema } from "effect";
import type { SqlClient, Statement } from "effect/sql";
import { fromColumns } from "./rows.js";

/**
 * A combatant as a player is allowed to have it — the select list and the one
 * decode.
 *
 * **This file is the only place the narrow projection is spelled**, the same
 * rule as one decode per table: the recap and the live table both select
 * through it, and a second one written beside them would be a second answer
 * to "what may a player know about a combatant", and the day the two disagree the wrong one is the one nobody is reading. The
 * shape is settled — see `PlayerSessionRecap` and the captain's decision of
 * 2026-08-12 — and this is its implementation.
 *
 * ### The wide columns are not selected, which is the point
 *
 * No select list here asks Postgres for `ac`, and each asks for `hp_current` and
 * `hp_max` **only where the player may know them**: any player character in a
 * recap, the asker's own character alone at the live table. So a monster's exact
 * hit points and its armour class are not in the result set at all: there is no
 * value in memory for a decode to forget to drop, and adding one would mean
 * editing this SQL as well as the schema.
 *
 * That is the same discipline `repo/visibility.ts` states for row visibility,
 * applied one level down to fields. Selecting the wide row and banding it in
 * TypeScript would work today and would be the post-filtering pattern the
 * product refuses everywhere else — the DM-only number already in memory, one
 * forgotten line from the wire.
 *
 * The predicate is *not* here. Which rows a player may see at all is still
 * `repo/visibility.ts`'s containment chain, unchanged and composed by the
 * caller; this narrows what a row that already passed says.
 */

/**
 * A player's band for a monster's hit points, computed in SQL, `null` for a
 * player character.
 *
 * `down` at zero, `bloodied` at half or below, `hurt` above half, `unhurt` at
 * full, and `unknown` when the row has no maximum — integer arithmetic
 * (`hp_current * 2 <= hp_max`) rather than a division, so there is no rounding
 * rule to get wrong and a creature at exactly half is bloodied.
 */
const hpBandColumn = (sql: SqlClient.SqlClient): Statement.Fragment => sql`
  case
    when combatant.kind = 'pc' then null
    when combatant.hp_max <= 0 then 'unknown'
    when combatant.hp_current <= 0 then 'down'
    when combatant.hp_current >= combatant.hp_max then 'unhurt'
    when combatant.hp_current * 2 <= combatant.hp_max then 'bloodied'
    else 'hurt'
  end as hp_band
`;

/**
 * A row's hit points, exact only where `known` holds and `null` everywhere
 * else, beside its band. `known` names a player character: the recap's is any
 * PC, the live table's the asker's own seat alone.
 */
const hitPointColumns = (
  sql: SqlClient.SqlClient,
  known: Statement.Fragment,
): Statement.Fragment => sql`
  case when ${known} then combatant.hp_current end as hp_current,
  case when ${known} then combatant.hp_max end as hp_max,
  ${hpBandColumn(sql)}
`;

/** The select list, for a fight's recap: every PC's exact hit points, a monster's band. */
export const playerCombatantColumns = (sql: SqlClient.SqlClient): Statement.Fragment => sql`
  combatant.id, combatant.encounter_run_id, combatant.display_name,
  combatant.subtitle, combatant.player_name, combatant.initiative,
  combatant.kind, combatant.conditions,
  ${hitPointColumns(sql, sql`combatant.kind = 'pc'`)}
`;

/**
 * The hit points of a row of a player's live order: exact, with the
 * character's temporary hit points, only on the asker's own row, where
 * `ownSeat` (the caller's join to the asker's live seat) is not null; a
 * monster's band; nothing for anybody else's character. `character` is the
 * caller's join to the row's character.
 */
export const playerLiveHitPointColumns = (
  sql: SqlClient.SqlClient,
  ownSeat: Statement.Identifier,
): Statement.Fragment => sql`
  ${hitPointColumns(sql, sql`${ownSeat} is not null`)},
  case when ${ownSeat} is not null then coalesce(character.temp_hp, 0) end as temp_hp
`;

/**
 * The row, as the union: `hp_current`/`hp_max` are null exactly when `kind` is
 * `npc` and `hp_band` exactly when it is `pc`, and each arm names only its own.
 *
 * The two arms are the wire's two schemas rather than one struct with optional
 * keys, so the `pc` arm and the live table's `you` arm are the only decodes in
 * the product that put an exact hit-point total into a player's response.
 */
export const PlayerCombatantRow = Schema.Union([
  fromColumns(PlayerCharacterCombatant),
  fromColumns(PlayerMonsterCombatant),
]);
