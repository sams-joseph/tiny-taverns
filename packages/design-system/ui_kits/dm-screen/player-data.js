/* Player-side fixtures. Rules language is 5e-shaped but unbranded:
   ancestry (not race), class, background, ability scores, proficiency bonus. */
window.TT_PLAYER = {
  account: { name: "Ilse Vantar", email: "ilse@vantar.co", initials: "IV", plays: 2, runs: 0 },

  /* A seat is a chair at a campaign table. It exists before a character does —
     that is what makes an invite claimable. */
  seats: [
    { id: "s1", player: "Ilse Vantar", initials: "IV", status: "playing", character: "Brannoc Duskharrow", you: true },
    { id: "s2", player: "Kofi Adeyemi", initials: "KA", status: "playing", character: "Wren" },
    { id: "s3", player: "Dara Nix", initials: "DN", status: "playing", character: "Sister Pell" },
    { id: "s4", player: "Marta Ruiz", initials: "MR", status: "no-character", character: null },
    { id: "s5", player: "hal@blackmoor.net", initials: "H", status: "invited", character: null },
    { id: "s6", player: null, initials: null, status: "open", character: null },
  ],
  invite: { link: "tinytaverns.app/join/salt-road-9F2K", expires: "in 7 days", uses: 2, max: 6 },

  characters: [
    { id: "ch1", name: "Brannoc Duskharrow", ancestry: "Half-orc", cls: "Paladin", level: 5,
      campaign: "The Salt Road", hp: 44, max: 52, ac: 18, status: "active" },
    { id: "ch2", name: "Sorrel Ash", ancestry: "Wood elf", cls: "Druid", level: 1,
      campaign: null, hp: 9, max: 9, ac: 13, status: "unassigned" },
  ],

  /* The full sheet for Brannoc — every section the sheet renders. */
  sheet: {
    id: "ch1",
    name: "Brannoc Duskharrow",
    tagline: "Half-orc paladin 5 · Oath of the Open Road",
    background: "Temple foundling",
    alignment: "Lawful neutral",
    player: "Ilse Vantar",
    campaign: "The Salt Road",
    xp: 6500, xpNext: 14000,
    proficiency: 3,
    speed: 30, initiative: 1, ac: 18, hp: 44, hpMax: 52, temp: 0, hitDice: "3/5 d10",
    abilities: [
      { key: "STR", score: 18, mod: 4, save: 7, prof: true },
      { key: "DEX", score: 12, mod: 1, save: 1, prof: false },
      { key: "CON", score: 16, mod: 3, save: 3, prof: false },
      { key: "INT", score: 9, mod: -1, save: -1, prof: false },
      { key: "WIS", score: 13, mod: 1, save: 4, prof: true },
      { key: "CHA", score: 16, mod: 3, save: 6, prof: true },
    ],
    skills: [
      { name: "Athletics", ability: "STR", bonus: 7, prof: true },
      { name: "Intimidation", ability: "CHA", bonus: 6, prof: true },
      { name: "Insight", ability: "WIS", bonus: 4, prof: true },
      { name: "Religion", ability: "INT", bonus: 2, prof: true },
      { name: "Acrobatics", ability: "DEX", bonus: 1, prof: false },
      { name: "Arcana", ability: "INT", bonus: -1, prof: false },
      { name: "Deception", ability: "CHA", bonus: 3, prof: false },
      { name: "History", ability: "INT", bonus: -1, prof: false },
      { name: "Medicine", ability: "WIS", bonus: 1, prof: false },
      { name: "Nature", ability: "INT", bonus: -1, prof: false },
      { name: "Perception", ability: "WIS", bonus: 1, prof: false },
      { name: "Performance", ability: "CHA", bonus: 3, prof: false },
      { name: "Persuasion", ability: "CHA", bonus: 3, prof: false },
      { name: "Sleight of Hand", ability: "DEX", bonus: 1, prof: false },
      { name: "Stealth", ability: "DEX", bonus: 1, prof: false },
      { name: "Survival", ability: "WIS", bonus: 1, prof: false },
    ],
    proficiencies: ["All armour", "Shields", "Simple weapons", "Martial weapons", "Orcish", "Common", "Smith's tools"],
    attacks: [
      { name: "Halberd", hit: "+7", dice: "1d10+4", kind: "Slashing", note: "Reach 10 ft." },
      { name: "Handaxe", hit: "+7", dice: "1d6+4", kind: "Slashing", note: "Thrown 20/60" },
      { name: "Divine Smite", hit: "—", dice: "2d8", kind: "Radiant", note: "On hit, expend a slot. +1d8 per slot above 1st." },
    ],
    spellcasting: {
      ability: "CHA", save: 14, attack: "+6",
      slots: [{ level: 1, used: 1, total: 4 }, { level: 2, used: 0, total: 2 }],
      known: [
        { name: "Bless", level: 1, note: "Concentration · 1 min", prepared: true },
        { name: "Cure Wounds", level: 1, note: "Touch · 1d8+3", prepared: true },
        { name: "Compelled Duel", level: 1, note: "Concentration · 1 min", prepared: false },
        { name: "Zone of Truth", level: 2, note: "Concentration · 10 min", prepared: true },
        { name: "Find Steed", level: 2, note: "Ritual · 10 min", prepared: false },
      ],
    },
    features: [
      { name: "Lay on Hands", note: "25 hp pool · 15 remaining", text: "Touch a creature and restore hit points from the pool, or spend 5 to end one disease or poison." },
      { name: "Channel Divinity: Turn the Unholy", note: "1/short rest", text: "Each undead or fiend within 30 ft. that fails a Wisdom save is turned for 1 minute." },
      { name: "Aura of Protection", note: "10 ft.", text: "You and friendly creatures in the aura add your Charisma modifier to saving throws." },
      { name: "Relentless Endurance", note: "1/long rest", text: "When reduced to 0 hit points but not killed outright, drop to 1 instead." },
      { name: "Extra Attack", note: "", text: "Attack twice when you take the Attack action." },
    ],
    inventory: [
      { name: "Halberd", qty: 1, weight: 6 },
      { name: "Handaxe", qty: 2, weight: 2 },
      { name: "Chain mail", qty: 1, weight: 55, equipped: true },
      { name: "Shield, dented", qty: 1, weight: 6, equipped: true },
      { name: "Holy symbol — a road marker in iron", qty: 1, weight: 1 },
      { name: "Rope, hempen (50 ft.)", qty: 1, weight: 10 },
      { name: "Rations", qty: 6, weight: 12 },
      { name: "Ferryman's token, unspent", qty: 1, weight: 0, note: "From session 11" },
    ],
    currency: { pp: 0, gp: 84, ep: 0, sp: 12, cp: 40 },
    backstory: "The temple on the salt road takes in what the road leaves behind, and in the spring of a bad year that was a half-orc infant in a fish crate. They named him for the sound the crate made when it hit the step. He swept the floor of that temple for nineteen years and left the morning after the abbot died, carrying a halberd nobody had told him he could take.\n\nHe is not looking for the people who left him. He has been very clear about this, to anyone who asks, at some length.",
    traits: {
      bond: "The temple's road marker. Wherever he sets it down, that place is under his protection until he picks it up again.",
      ideal: "A road is a promise between two towns. Somebody has to keep it.",
      flaw: "He cannot let a debt stand, including the ones nobody is asking him to pay.",
      personality: "Answers questions slower than people expect, and more honestly than they want.",
    },
    conditions: [],
    deathSaves: { success: 0, fail: 0 },
    levelUps: [
      { level: 5, session: 10, note: "Extra Attack. Took Oath of the Open Road at the ferry crossing." },
      { level: 4, session: 7, note: "+2 Charisma. Started speaking for the party at gates." },
      { level: 3, session: 4, note: "Sacred Oath. Aura came in during the fire at Rell." },
      { level: 2, session: 2, note: "Divine Smite, Lay on Hands." },
    ],
    journal: [
      { session: 11, text: "The ferryman took the coin and gave back a token. Did not say what it was for. Kofi thinks it's a debt marker. I think he's right and I don't like it." },
      { session: 10, text: "Swore the oath at the crossing with nobody watching but Pell. She said it counted. It counted." },
    ],
  },

  /* What the player sees at the table. Mirrors TT_DATA.initiative but from
     Brannoc's chair — no monster hit points, only what the DM shares. */
  table: {
    encounter: "Ambush in the reeds",
    round: 3,
    order: [
      { id: "c1", name: "Brannoc", sub: "You", init: 21, kind: "you" },
      { id: "c2", name: "Goblin Boss", sub: "Bloodied", init: 19, kind: "npc" },
      { id: "c3", name: "Wren", sub: "Kofi", init: 16, kind: "ally" },
      { id: "c4", name: "Goblin Archer", sub: "Hurt", init: 14, kind: "npc" },
      { id: "c5", name: "Goblin Archer", sub: "Down", init: 14, kind: "npc", down: true },
      { id: "c6", name: "Sister Pell", sub: "Dara", init: 11, kind: "ally" },
      { id: "c7", name: "Marsh Hag", sub: "Unhurt", init: 8, kind: "npc" },
    ],
    readAloud: "The reeds are taller than you are and they are not moving, even though there is a wind.",
    log: [
      { who: "Wren", text: "cast Faerie Fire — two goblins lit" },
      { who: "Goblin Boss", text: "hit Brannoc for 8" },
      { who: "Sister Pell", text: "rolled a 3 on the save. Prone." },
    ],
  },

  /* Hob's draft, produced from the prose in CharacterCreate. */
  draft: {
    prose: "A wood elf who grew up in a river town, apprenticed to a herbalist who turned out to be feeding something in the cellar. She left with the herbal and a bad opinion of basements. Quiet, watches everything, terrible liar.",
    name: "Sorrel Ash",
    ancestry: "Wood elf",
    cls: "Druid",
    subclass: "Circle of the Land (Marsh)",
    background: "Herbalist's apprentice",
    level: 1,
    abilities: [
      { key: "STR", score: 8, mod: -1 }, { key: "DEX", score: 14, mod: 2 },
      { key: "CON", score: 14, mod: 2 }, { key: "INT", score: 12, mod: 1 },
      { key: "WIS", score: 16, mod: 3 }, { key: "CHA", score: 10, mod: 0 },
    ],
    skills: ["Nature", "Perception", "Medicine", "Survival"],
    kit: ["Leather armour", "Wooden shield", "Scimitar", "Herbalism kit", "Druidic focus — a river stone"],
    traits: {
      bond: "The herbal. It is half in a hand that is not hers and she wants to know whose.",
      ideal: "Things grow back. Give them the room.",
      flaw: "Will not go underground without an argument first.",
    },
    backstory: "Sorrel came up in Ashfen where the river bends, and was apprenticed at eleven to a herbalist named Coll who was kind, patient, and taking something down to the cellar every third night. She never saw it. She heard it eat. She left at nineteen with the herbal under her coat and has been slowly filling in the pages Coll tore out.",
    why: [
      "Wisdom is your highest score because druid casting keys off it, and you described someone who watches.",
      "Circle of the Land (Marsh) because your DM's campaign is on the salt road and half of it is marsh.",
      "\"Terrible liar\" is why Charisma sits at 10 and Deception is not on your skill list.",
    ],
  },

  starters: [
    "A dwarf who quit the guard after a bad order",
    "Someone raised by the road, not by people",
    "A cleric whose god has stopped answering",
    "The party's least dangerous member, on purpose",
  ],
};
