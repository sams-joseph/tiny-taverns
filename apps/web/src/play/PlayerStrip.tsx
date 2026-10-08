import type { CombatantId, PlayerLiveCombatant, PlayerLiveFight } from "@taverns/api";
import { StripFrame, type StripRow } from "../run/InitiativeStrip";
import { BAND_WORDS, tableRowState } from "./tableRows";

/**
 * The fight's initiative on a seated player's table: the DM's strip
 * (`run/InitiativeStrip.tsx`), read-only, over the rows the table sent. A
 * chip selects, as on the DM's; nothing else on it writes.
 *
 * Each chip says what the player is told and no more: exact hit points for
 * themselves and their allies, a creature's band, and an armour class only on
 * their own row. A creature the DM hid, or one standing under fog, is not in
 * the order at all (`PlayerLiveFight.order`), so it has no chip; an ally
 * under fog keeps theirs.
 */
export function PlayerStrip({
  fight,
  labels,
  selectedId,
  floating,
  onSelect,
}: {
  readonly fight: PlayerLiveFight;
  readonly labels: ReadonlyMap<CombatantId, string>;
  readonly selectedId: CombatantId | undefined;
  readonly floating: boolean;
  readonly onSelect: (row: PlayerLiveCombatant) => void;
}) {
  const board = fight.board;
  const placed = new Set(board?.tokens.map((token) => token.combatantId));
  const rows = fight.order.map((row): StripRow => ({
    id: row.combatantId,
    displayName: row.displayName,
    initiative: row.initiative,
    party: row.kind !== "npc",
    health:
      row.kind === "npc"
        ? { band: BAND_WORDS[row.hpBand], down: row.hpBand === "down" }
        : { hp: row.hpCurrent, max: row.hpMax },
    ac: row.kind === "you" ? row.ac : null,
    conditions: row.conditions,
    portrait: row.kind !== "npc" && row.portrait !== null ? row.portrait.thumbUrl : undefined,
    out: tableRowState(row).out,
    hidden: false,
    // Only your own token is yours to find a square for.
    unplaced: board !== null && row.kind === "you" && !placed.has(row.combatantId),
    ...(row.kind === "you" ? { note: "you" } : {}),
  }));
  const byId = new Map(fight.order.map((row) => [row.combatantId, row]));
  return (
    <StripFrame
      round={fight.round}
      rows={rows}
      labels={labels}
      activeId={fight.upNext?.kind === "visible" ? fight.upNext.combatantId : null}
      selectedId={selectedId}
      floating={floating}
      empty="Nobody in this fight is on your table yet."
      onSelect={(row) => {
        const found = byId.get(row.id);
        if (found !== undefined) onSelect(found);
      }}
    />
  );
}
