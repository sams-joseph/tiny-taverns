import type { CreatureCreate } from "@taverns/api";

/**
 * One entry in the bundled corpus.
 *
 * The same shape a DM's own creature is created from, minus `visibility` — a
 * system creature is `dm` like everything else and there is no reason for this
 * file to be the place that says so.
 */
export type SystemCreature = Omit<CreatureCreate, "visibility">;

/**
 * The bundled bestiary: global, immutable, shared by every campaign.
 *
 * This is `data.js:35-41`, the fixture bestiary, and nothing more. Every value
 * here is one the fixtures state — the size of the Goblin Boss and the Marsh
 * Hag come from the initiative rows (`data.js:16`, `:21`, "Small humanoid" and
 * "Medium fey"), and the others have no size in the fixtures, so they have none
 * here. The Goblin Boss's stat block is `data.js:23-32` transcribed.
 *
 * **Nothing is invented to fill a gap.** A sparse document is what a real
 * import produces when the source is sparse, and a plausible-looking speed
 * nobody wrote down is worse than an empty string: one is missing data, the
 * other is wrong data that reads as right.
 *
 * The fixture's `readAloud` (`data.js:33`) is deliberately absent. Read-aloud
 * is a `note` with an attachment, not a field on whatever it describes — see
 * `Note.NoteAttachment` — and a system creature has no campaign to hold a note
 * for anyway.
 */
export const SYSTEM_CREATURES: ReadonlyArray<SystemCreature> = [
  {
    name: "Goblin Boss",
    size: "Small",
    type: "Humanoid",
    cr: "1",
    ac: 17,
    hp: 21,
    environments: ["Marsh", "Cave"],
    statBlock: {
      meta: "Small humanoid (goblinoid), neutral evil",
      ac: "17 (chain shirt, shield)",
      hp: "21 (6d6)",
      speed: "30 ft.",
      cr: "1 (200 XP)",
      abilities: [
        { label: "STR", score: "10", modifier: "+0" },
        { label: "DEX", score: "14", modifier: "+2" },
        { label: "CON", score: "10", modifier: "+0" },
        { label: "INT", score: "10", modifier: "+0" },
        { label: "WIS", score: "8", modifier: "-1" },
        { label: "CHA", score: "10", modifier: "+0" },
      ],
      traits: [
        {
          name: "Nimble Escape",
          text: "The boss takes the Disengage or Hide action as a bonus action on each of its turns.",
        },
        {
          name: "Multiattack",
          text: "The boss makes two attacks with its scimitar. The second has disadvantage.",
        },
        {
          name: "Scimitar",
          text: "Melee weapon attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) slashing damage.",
          dice: "1d6+2",
        },
        {
          name: "Redirect Attack",
          text: "When a creature the boss can see targets it with an attack, it chooses another goblin within 5 feet to be the target instead.",
        },
      ],
    },
  },
  {
    name: "Marsh Hag",
    size: "Medium",
    type: "Fey",
    cr: "5",
    ac: 17,
    hp: 82,
    environments: ["Marsh"],
    legendary: true,
    statBlock: {
      meta: "Medium fey",
      ac: "17",
      hp: "82",
      speed: "",
      cr: "5",
      abilities: [],
      traits: [],
    },
  },
  {
    name: "Bullywug Croaker",
    type: "Humanoid",
    cr: "1/4",
    ac: 15,
    hp: 11,
    environments: ["Marsh"],
  },
  {
    name: "Will-o'-Wisp",
    type: "Undead",
    cr: "2",
    ac: 19,
    hp: 22,
    environments: ["Marsh", "Night"],
  },
  {
    name: "Giant Toad",
    type: "Beast",
    cr: "1",
    ac: 11,
    hp: 39,
    environments: ["Marsh"],
  },
  {
    name: "Ferryman's Shade",
    type: "Undead",
    cr: "3",
    ac: 12,
    hp: 45,
    environments: ["River", "Night"],
  },
];
