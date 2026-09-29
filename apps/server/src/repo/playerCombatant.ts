import { PlayerCharacterCombatant, PlayerMonsterCombatant } from "@taverns/api";
import { Schema } from "effect";
import type { SqlClient, Statement } from "effect/unstable/sql";
import { fromColumns } from "./rows.js";

/**
 * A combatant as a player is allowed to have it — the select list and the one
 * decode.
 *
 * **This file is the only place the narrow projection is spelled**, the same
 * rule as one decode per table: a second one written for the player fight view
 * would be a second answer to "what may a player know about a combatant", and
 * the day the two disagree the wrong one is the one nobody is reading. The
 * shape is settled — see `PlayerSessionRecap` and the captain's decision of
 * 2026-08-12 — and this is its implementation.
 *
 * ### The wide columns are not selected, which is the point
 *
 * `columns` below never asks Postgres for `ac`, and asks for `hp_current` and
 * `hp_max` **only where the row is a player character**. So a monster's exact
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
 * The select list, banded in SQL.
 *
 * `down` at zero, `bloodied` at half or below, `hurt` above half, `unhurt` at
 * full, and `unknown` when the row has no maximum — integer arithmetic
 * (`hp_current * 2 <= hp_max`) rather than a division, so there is no rounding
 * rule to get wrong and a creature at exactly half is bloodied.
 */
export const playerCombatantColumns = (sql: SqlClient.SqlClient): Statement.Fragment => sql`
  combatant.id, combatant.encounter_run_id, combatant.display_name,
  combatant.subtitle, combatant.player_name, combatant.initiative,
  combatant.kind, combatant.conditions,
  case when combatant.kind = 'pc' then combatant.hp_current end as hp_current,
  case when combatant.kind = 'pc' then combatant.hp_max end as hp_max,
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
 * The row, as the union: `hp_current`/`hp_max` are null exactly when `kind` is
 * `npc` and `hp_band` exactly when it is `pc`, and each arm names only its own.
 *
 * The two arms are the wire's two schemas rather than one struct with optional
 * keys, so the `pc` arm is the only decode in the product that puts an exact
 * hit-point total into a player's response.
 */
export const PlayerCombatantRow = Schema.Union([
  fromColumns(PlayerCharacterCombatant),
  fromColumns(PlayerMonsterCombatant),
]);
