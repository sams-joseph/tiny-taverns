import {
  BoardDoorUpdatedPayload,
  BoardLightUpdatedPayload,
  type LightPreset,
  type SessionEventKind,
} from "@taverns/api";
import { Option, Schema } from "effect";

/**
 * Each log line as a sentence, from its `kind` and the combatant it names —
 * a scene's log (`SessionLog.tsx`) and the fight's *Rolls* dock
 * (`rollsLog.ts`) for every line it has no numbers for.
 *
 * `noun` is what the run is played as now (`sceneNoun`): a conversation that
 * went on the table is not "the fight" until it turns into one. `payload` is
 * the line's own, which a level's door and light lines read to say which and
 * what ("A door was locked", "A torch was lit"); there are no room names to
 * say where.
 */
export const SENTENCE: Record<
  SessionEventKind,
  (who: string | undefined, noun: string, payload?: unknown) => string
> = {
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
  "board-area-updated": () => "An area on the board was pinned or cleared",
  "board-door-updated": (_who, _noun, payload) => doorSentence(payload),
  "board-light-updated": (_who, _noun, payload) => lightSentence(payload),
  "board-vision-updated": () => "What the party sees of the level changed",
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
  "hob-turn-kept": (who) => `Hob took ${who ?? "a monster"}'s turn`,
  "hob-turn-undone": (who) => `Hob's turn for ${who ?? "a monster"} was undone`,
  // The prose is a `beat` row, not this event's payload — see `Beat`. The log
  // says only that one was jotted, and at what point in the fight.
  "beat-added": () => "A beat was jotted down",
  "party-moved": () => "The party moved",
  // The row is in `character_roll`; this marker is only the doorbell.
  "roll-made": () => "A roll hit the tray",
};

const decodeDoor = Schema.decodeUnknownOption(BoardDoorUpdatedPayload);
const decodeLight = Schema.decodeUnknownOption(BoardLightUpdatedPayload);

const DOOR_VERB = { open: "opened", closed: "closed", locked: "locked" } as const;

/**
 * A door's line: a secret door's finding or hiding first, since that is the
 * news, else what its state became. A line from before the payload said
 * which (no `wallKind`) is the old general sentence.
 */
export const doorSentence = (payload: unknown): string =>
  Option.match(decodeDoor(payload), {
    onNone: () => "A door on the level changed",
    onSome: (door) => {
      const noun = door.wallKind === "secretDoor" ? "A secret door" : "A door";
      if (door.revealed !== door.wasRevealed) {
        return door.revealed ? "A secret door was found" : "A secret door was hidden again";
      }
      if (door.doorState === door.wasDoorState) return `${noun} was left as it was`;
      if (door.wasDoorState === "locked" && door.doorState === "closed") {
        return `${noun} was unlocked`;
      }
      return `${noun} was ${DOOR_VERB[door.doorState]}`;
    },
  });

const LIGHT_NOUN: Record<LightPreset, string> = {
  candle: "A candle",
  torch: "A torch",
  lamp: "A lamp",
  brazier: "A brazier",
  arcane: "An arcane light",
  moonbeam: "A moonbeam",
};

/** A light's line, named by the preset it matches, else "A light". */
export const lightSentence = (payload: unknown): string =>
  Option.match(decodeLight(payload), {
    onNone: () => "A light on the level was lit or snuffed",
    onSome: (light) =>
      `${light.preset === null ? "A light" : LIGHT_NOUN[light.preset]} was ${light.lit ? "lit" : "snuffed"}`,
  });
