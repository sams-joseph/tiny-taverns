window.TT_DATA = {
  campaign: { name: "The Salt Road", session: 12, party: "The Gilded Spoon", players: 4 },
  prep: [
    { id: "p1", label: "Reread the reeds ambush", done: true },
    { id: "p2", label: "Pick a name for the ferryman", done: true },
    { id: "p3", label: "Decide what the crate contains", done: false },
    { id: "p4", label: "Print the harbour map", done: false },
  ],
  encounters: [
    { id: "e1", name: "Ambush in the reeds", cr: "Medium", count: 6, tags: ["Marsh", "Night"], active: true },
    { id: "e2", name: "The ferryman's price", cr: "Easy", count: 2, tags: ["Social"], active: false },
    { id: "e3", name: "Whatever is in the crate", cr: "Deadly", count: 1, tags: ["Boss", "Aberration"], active: false },
  ],
  initiative: [
    { id: "c1", name: "Brannoc", sub: "Half-orc paladin · Ilse", init: 21, hp: 44, max: 52, ac: 18, kind: "pc", conditions: [] },
    { id: "c2", name: "Goblin Boss", sub: "Small humanoid", init: 19, hp: 21, max: 21, ac: 17, kind: "npc", conditions: ["Hostile"] },
    { id: "c3", name: "Wren", sub: "Tiefling bard · Kofi", init: 16, hp: 31, max: 31, ac: 14, kind: "pc", conditions: ["Concentrating"] },
    { id: "c4", name: "Goblin Archer", sub: "Small humanoid", init: 14, hp: 4, max: 7, ac: 15, kind: "npc", conditions: ["Prone"] },
    { id: "c5", name: "Goblin Archer", sub: "Small humanoid", init: 14, hp: 0, max: 7, ac: 15, kind: "npc", conditions: ["Downed"] },
    { id: "c6", name: "Sister Pell", sub: "Human cleric · Dara", init: 11, hp: 27, max: 33, ac: 16, kind: "pc", conditions: [] },
    { id: "c7", name: "Marsh Hag", sub: "Medium fey", init: 8, hp: 82, max: 82, ac: 17, kind: "npc", conditions: ["Hostile", "Legendary"] },
  ],
  statblock: {
    name: "Goblin Boss", meta: "Small humanoid (goblinoid), neutral evil",
    ac: "17 (chain shirt, shield)", hp: "21 (6d6)", speed: "30 ft.", cr: "1 (200 XP)",
    abilities: [["STR","10","+0"],["DEX","14","+2"],["CON","10","+0"],["INT","10","+0"],["WIS","8","-1"],["CHA","10","+0"]],
    traits: [
      { name: "Nimble Escape", text: "The boss takes the Disengage or Hide action as a bonus action on each of its turns." },
      { name: "Multiattack", text: "The boss makes two attacks with its scimitar. The second has disadvantage." },
      { name: "Scimitar", text: "Melee weapon attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) slashing damage.", dice: "1d6+2" },
      { name: "Redirect Attack", text: "When a creature the boss can see targets it with an attack, it chooses another goblin within 5 feet to be the target instead." },
    ],
    readAloud: "He is wearing three cloaks, none of them his, and he has not stopped grinning since you stepped into the water.",
  },
  bestiary: [
    { name: "Goblin Boss", type: "Humanoid", cr: "1", ac: 17, hp: 21, env: ["Marsh","Cave"] },
    { name: "Marsh Hag", type: "Fey", cr: "5", ac: 17, hp: 82, env: ["Marsh"], legendary: true },
    { name: "Bullywug Croaker", type: "Humanoid", cr: "1/4", ac: 15, hp: 11, env: ["Marsh"] },
    { name: "Will-o'-Wisp", type: "Undead", cr: "2", ac: 19, hp: 22, env: ["Marsh","Night"] },
    { name: "Giant Toad", type: "Beast", cr: "1", ac: 11, hp: 39, env: ["Marsh"] },
    { name: "Ferryman's Shade", type: "Undead", cr: "3", ac: 12, hp: 45, env: ["River","Night"] },
  ],
};
