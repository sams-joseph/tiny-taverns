import type {
  CombatantId,
  CombatantKind,
  EncounterRunId,
  HpBand,
  PlayerCombatant,
} from "@taverns/api";
import type { SqlClient, Statement } from "effect/unstable/sql";

/**
 * A combatant as a player is allowed to have it — the select list, the row, and
 * the one mapper.
 *
 * **This file is the only place the narrow projection is spelled**, the same
 * rule as one mapper per table: a second one written for the player fight view
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
 * value in memory for a mapper to forget to drop, and adding one would mean
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

/** What comes back. `hp_current`/`hp_max` are null exactly when `kind` is `npc`. */
export interface PlayerCombatantRow {
  readonly id: CombatantId;
  readonly encounter_run_id: EncounterRunId;
  readonly display_name: string;
  readonly subtitle: string | null;
  readonly player_name: string | null;
  readonly initiative: number;
  readonly kind: CombatantKind;
  readonly conditions: ReadonlyArray<string>;
  readonly hp_current: number | null;
  readonly hp_max: number | null;
  readonly hp_band: HpBand | null;
}

/**
 * The select list, banded in SQL.
 *
 * `down` at zero, `bloodied` at half or below, `healthy` above it — integer
 * arithmetic (`hp_current * 2 <= hp_max`) rather than a division, so there is
 * no rounding rule to get wrong and a creature at exactly half is bloodied,
 * which is what the word has always meant at a table. A combatant with
 * `hp_max = 0` reads `down`, which is the honest answer for a row nobody gave
 * hit points to.
 */
export const playerCombatantColumns = (sql: SqlClient.SqlClient): Statement.Fragment => sql`
  combatant.id, combatant.encounter_run_id, combatant.display_name,
  combatant.subtitle, combatant.player_name, combatant.initiative,
  combatant.kind, combatant.conditions,
  case when combatant.kind = 'pc' then combatant.hp_current end as hp_current,
  case when combatant.kind = 'pc' then combatant.hp_max end as hp_max,
  case
    when combatant.kind = 'pc' then null
    when combatant.hp_current <= 0 then 'down'
    when combatant.hp_current * 2 <= combatant.hp_max then 'bloodied'
    else 'healthy'
  end as hp_band
`;

/**
 * The row, as the union.
 *
 * The two arms are built separately rather than one object with optional keys,
 * so the `pc` branch is the only expression in the product that puts an exact
 * hit-point total into a player's response, and it is four lines long.
 */
export const toPlayerCombatant = (row: PlayerCombatantRow): PlayerCombatant => {
  const shared = {
    id: row.id,
    encounterRunId: row.encounter_run_id,
    displayName: row.display_name,
    subtitle: row.subtitle,
    playerName: row.player_name,
    initiative: row.initiative,
    conditions: row.conditions,
  };
  return row.kind === "pc"
    ? { kind: "pc" as const, ...shared, hpCurrent: row.hp_current ?? 0, hpMax: row.hp_max ?? 0 }
    : { kind: "npc" as const, ...shared, hpBand: row.hp_band ?? "down" };
};
