import type { Combatant, DeathSaves } from "@taverns/api";

/**
 * Where a player character at zero hit points stands, from their death saves
 * (`Encounter Runner.dc.html`, `renderVals`): three failures is dead, three
 * successes stable, anything else dying. Dead wins when the DM's dots say
 * both, as the drawing's does.
 */
export type DeathStatus = "dying" | "stable" | "dead";

export const deathStatusOf = (saves: DeathSaves): DeathStatus =>
  saves.failures >= 3 ? "dead" : saves.successes >= 3 ? "stable" : "dying";

/**
 * A party member with three failed death saves. A dying one is not: they stay
 * drawn as they are until their saves say otherwise.
 */
export const isDead = (combatant: Combatant): boolean =>
  combatant.deathSaves !== null && deathStatusOf(combatant.deathSaves) === "dead";

/**
 * What pressing a dot sets its count to — the drawing's rule: a filled dot
 * empties itself and every dot after it, an empty one fills itself and every
 * dot before it. So the first dot of a full row takes it back to none.
 */
export const dotPressed = (count: number, index: number): number =>
  count > index ? index : index + 1;
