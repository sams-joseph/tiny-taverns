import type { SessionEventKind } from "@taverns/api";

/**
 * Each log line as a sentence, from its `kind` and the combatant it names —
 * a scene's log (`SessionLog.tsx`) and the fight's *Rolls* dock
 * (`rollsLog.ts`) for every line it has no numbers for.
 *
 * `noun` is what the run is played as now (`sceneNoun`): a conversation that
 * went on the table is not "the fight" until it turns into one.
 */
export const SENTENCE: Record<SessionEventKind, (who: string | undefined, noun: string) => string> =
  {
    "run-started": (_, noun) => `The ${noun} went on the table`,
    "run-updated": (_, noun) => `The ${noun} changed`,
    "run-ended": (_, noun) => `The ${noun} came off the table`,
    // The night finished over this fight, so it came off the table and is waiting
    // for the next one. Distinct from `run-ended` on purpose — a recap that
    // conflated them would report a fight the party is still standing in as over.
    "run-carried": (_, noun) => `The night ended — the ${noun} carries over`,
    "run-resumed": (_, noun) => `The ${noun} was picked up from last time`,
    "combatant-added": (who) => `${who ?? "Someone"} joined the order`,
    "combatant-updated": (who) => `${who ?? "A combatant"} changed`,
    // The foreign key is `on delete set null`, so by the time this row is read
    // the combatant it names is gone and there is no name to resolve.
    "combatant-removed": () => "Someone left the order",
    "combatant-damaged": (who) => `${who ?? "A combatant"} took a hit`,
    "combatant-moved": (who) => `${who ?? "A combatant"} moved on the board`,
    "death-save": (who) => `Death saves for ${who ?? "someone"} changed`,
    "board-fog-updated": () => "The fog on the board shifted",
    "turn-advanced": (who) => `${who ?? "Nobody"} is up`,
    "run-escalated": () => "The conversation turned into a fight",
    // The scene is the DM's alone; these say only that it moved, never how.
    "scene-updated": () => "The scene changed",
    "check-logged": (who) => `${who ?? "Someone"} made a check`,
    "check-removed": () => "A check was taken back",
    // A character changed while the night was running — the party list, not the
    // initiative order. It names a combatant only when the write reached the
    // fight from outside it, which is why the name resolves here at all; a hit
    // taken *in* initiative is a `combatant-damaged` line and nothing else, so
    // this never doubles up with one.
    "character-updated": (who) => `${who ?? "Someone in the party"} changed`,
    "hob-resource-spent": (who) => `Hob spent ${who ?? "someone's"} resource`,
    "hob-resource-undone": (who) => `Hob's resource spend for ${who ?? "someone"} was undone`,
    // The prose is a `beat` row, not this event's payload — see `Beat`. The log
    // says only that one was jotted, and at what point in the fight.
    "beat-added": () => "A beat was jotted down",
    // The row is in `character_roll`; this marker is only the doorbell.
    "roll-made": () => "A roll hit the tray",
  };
