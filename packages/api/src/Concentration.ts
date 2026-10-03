/**
 * The Constitution save a concentrating creature makes when it takes damage
 * (2014 SRD, "Concentration"): DC 10 or half the damage taken, rounded down,
 * whichever is higher.
 *
 * Shared because the server stamps it on a `combatant-damaged` line and a
 * client that prints the save from that line must not compute a second one.
 */
export const concentrationDc = (damage: number): number => Math.max(10, Math.floor(damage / 2));
