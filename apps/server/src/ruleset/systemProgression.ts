/**
 * GENERATED FROM 5e-bits/5e-database 2014 data.
 *
 * Source: https://github.com/5e-bits/5e-database/tree/5a7ee5a0489b26655d343e4a41e8f7942a887af2/src/2014/en
 * Files: 5e-SRD-Subclasses.json, 5e-SRD-Levels.json, 5e-SRD-Features.json
 *
 * Generated with:
 *   python tools/generate-class-progression.py
 *
 * 5e-bits project data is MIT licensed; underlying D&D 5th Edition SRD 5.1
 * material is used under the Open Game License version 1.0a. See
 * THIRD_PARTY_NOTICES.md.
 *
 * This is a transformed snapshot, not a stored source graph: URL-shaped
 * transport fields and raw upstream payloads are deliberately absent.
 */

export const SYSTEM_SUBCLASSES = [
  {
    sourceIndex: "berserker",
    name: "Berserker",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    desc: [
      "For some barbarians, rage is a means to an end--that end being violence. The Path of the Berserker is a path of untrammeled fury, slick with blood. As you enter the berserker's rage, you thrill in the chaos of battle, heedless of your own health or well-being.",
    ],
    flavor: "Primal Path",
  },
  {
    sourceIndex: "lore",
    name: "Lore",
    class: {
      index: "bard",
      name: "Bard",
    },
    desc: [
      "Bards of the College of Lore know something about most things, collecting bits of knowledge from sources as diverse as scholarly tomes and peasant tales. Whether singing folk ballads in taverns or elaborate compositions in royal courts, these bards use their gifts to hold audiences spellbound. When the applause dies down, the audience members might find themselves questioning everything they held to be true, from their faith in the priesthood of the local temple to their loyalty to the king. The loyalty of these bards lies in the pursuit of beauty and truth, not in fealty to a monarch or following the tenets of a deity. A noble who keeps such a bard as a herald or advisor knows that the bard would rather be honest than politic. The college's members gather in libraries and sometimes in actual colleges, complete with classrooms and dormitories, to share their lore with one another. They also meet at festivals or affairs of state, where they can expose corruption, unravel lies, and poke fun at self-important figures of authority.",
    ],
    flavor: "Bard College",
  },
  {
    sourceIndex: "life",
    name: "Life",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    desc: [
      "The Life domain focuses on the vibrant positive energy--one of the fundamental forces of the universe--that sustains all life. The gods of life promote vitality and health through healing the sick and wounded, caring for those in need, and driving away the forces of death and undeath. Almost any non-evil deity can claim influence over this domain, particularly agricultural deities, sun gods, gods of healing or endurance, and gods of home and community.",
    ],
    flavor: "Divine Domain",
  },
  {
    sourceIndex: "land",
    name: "Land",
    class: {
      index: "druid",
      name: "Druid",
    },
    desc: [
      "The Circle of the Land is made up of mystics and sages who safeguard ancient knowledge and rites through a vast oral tradition. These druids meet within sacred circles of trees or standing stones to whisper primal secrets in Druidic. The circle's wisest members preside as the chief priests of communities that hold to the Old Faith and serve as advisors to the rulers of those folk. As a member of this circle, your magic is influenced by the land where you were initiated into the circle's mysterious rites.",
    ],
    flavor: "Druid Circle",
  },
  {
    sourceIndex: "champion",
    name: "Champion",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    desc: [
      "The archetypal Champion focuses on the development of raw physical power honed to deadly perfection. Those who model themselves on this archetype combine rigorous training with physical excellence to deal devastating blows.",
    ],
    flavor: "Martial Archetype",
  },
  {
    sourceIndex: "open-hand",
    name: "Open Hand",
    class: {
      index: "monk",
      name: "Monk",
    },
    desc: [
      "Monks of the Way of the Open Hand are the ultimate masters of martial arts combat, whether armed or unarmed. They learn techniques to push and trip their opponents, manipulate ki to heal damage to their bodies, and practice advanced meditation that can protect them from harm.",
    ],
    flavor: "Monastic Tradition",
  },
  {
    sourceIndex: "devotion",
    name: "Devotion",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    desc: [
      "The Oath of Devotion binds a paladin to the loftiest ideals of justice, virtue, and order. Sometimes called cavaliers, white knights, or holy warriors, these paladins meet the ideal of the knight in shining armor, acting with honor in pursuit of justice and the greater good. They hold themselves to the highest standards of conduct, and some, for better or worse, hold the rest of the world to the same standards. Many who swear this oath are devoted to gods of law and good and use their gods' tenets as the measure of their devotion. They hold angels--the perfect servants of good--as their ideals, and incorporate images of angelic wings into their helmets or coats of arms.",
    ],
    flavor: "Sacred Oath",
  },
  {
    sourceIndex: "hunter",
    name: "Hunter",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    desc: [
      "Emulating the Hunter archetype means accepting your place as a bulwark between civilization and the terrors of the wilderness. As you walk the Hunter's path, you learn specialized techniques for fighting the threats you face, from rampaging ogres and hordes of orcs to towering giants and terrifying dragons.",
    ],
    flavor: "Ranger Archetype",
  },
  {
    sourceIndex: "thief",
    name: "Thief",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    desc: [
      "You hone your skills in the larcenous arts. Burglars, bandits, cutpurses, and other criminals typically follow this archetype, but so do rogues who prefer to think of themselves as professional treasure seekers, explorers, delvers, and investigators. In addition to improving your agility and stealth, you learn skills useful for delving into ancient ruins, reading unfamiliar languages, and using magic items you normally couldn't employ.",
    ],
    flavor: "Roguish Archetype",
  },
  {
    sourceIndex: "draconic",
    name: "Draconic",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    desc: [
      "Your innate magic comes from draconic magic that was mingled with your blood or that of your ancestors. Most often, sorcerers with this origin trace their descent back to a mighty sorcerer of ancient times who made a bargain with a dragon or who might even have claimed a dragon parent. Some of these bloodlines are well established in the world, but most are obscure. Any given sorcerer could be the first of a new bloodline, as a result of a pact or some other exceptional circumstance.",
    ],
    flavor: "Sorcerous Origin",
  },
  {
    sourceIndex: "fiend",
    name: "Fiend",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    desc: [
      "You have made a pact with a fiend from the lower planes of existence, a being whose aims are evil, even if you strive against those aims. Such beings desire the corruption or destruction of all things, ultimately including you. Fiends powerful enough to forge a pact include demon lords such as Demogorgon, Orcus, Fraz'Urb-luu, and Baphomet; archdevils such as Asmodeus, Dispater, Mephistopheles, and Belial; pit fiends and balors that are especially mighty; and ultroloths and other lords of the yugoloths.",
    ],
    flavor: "Otherworldly Patron",
  },
  {
    sourceIndex: "evocation",
    name: "Evocation",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    desc: [
      "You focus your study on magic that creates powerful elemental effects such as bitter cold, searing flame, rolling thunder, crackling lightning, and burning acid. Some evokers find employment in military forces, serving as artillery to blast enemy armies from afar. Others use their spectacular power to protect the weak, while some seek their own gain as bandits, adventurers, or aspiring tyrants.",
    ],
    flavor: "Arcane Tradition",
  },
] as const satisfies ReadonlyArray<SystemSubclass>;

export const SYSTEM_CLASS_LEVELS = [
  {
    sourceIndex: "barbarian-1",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 1,
    features: [
      {
        index: "rage",
        name: "Rage",
      },
      {
        index: "barbarian-unarmored-defense",
        name: "Unarmored Defense",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      rage_count: 2,
      rage_damage_bonus: 2,
      brutal_critical_dice: 0,
    },
  },
  {
    sourceIndex: "barbarian-2",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 2,
    features: [
      {
        index: "reckless-attack",
        name: "Reckless Attack",
      },
      {
        index: "danger-sense",
        name: "Danger Sense",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      rage_count: 2,
      rage_damage_bonus: 2,
      brutal_critical_dice: 0,
    },
  },
  {
    sourceIndex: "barbarian-3",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 3,
    features: [
      {
        index: "primal-path",
        name: "Primal Path",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      rage_count: 3,
      rage_damage_bonus: 2,
      brutal_critical_dice: 0,
    },
  },
  {
    sourceIndex: "barbarian-4",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 4,
    features: [
      {
        index: "barbarian-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      rage_count: 3,
      rage_damage_bonus: 2,
      brutal_critical_dice: 0,
    },
  },
  {
    sourceIndex: "barbarian-5",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 5,
    features: [
      {
        index: "barbarian-extra-attack",
        name: "Extra Attack",
      },
      {
        index: "fast-movement",
        name: "Fast Movement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      rage_count: 3,
      rage_damage_bonus: 2,
      brutal_critical_dice: 0,
    },
  },
  {
    sourceIndex: "barbarian-6",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 6,
    features: [
      {
        index: "primal-path-improvement-1",
        name: "Path feature",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      rage_count: 4,
      rage_damage_bonus: 2,
      brutal_critical_dice: 0,
    },
  },
  {
    sourceIndex: "barbarian-7",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 7,
    features: [
      {
        index: "feral-instinct",
        name: "Feral Instinct",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      rage_count: 4,
      rage_damage_bonus: 2,
      brutal_critical_dice: 0,
    },
  },
  {
    sourceIndex: "barbarian-8",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 8,
    features: [
      {
        index: "barbarian-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      rage_count: 4,
      rage_damage_bonus: 2,
      brutal_critical_dice: 0,
    },
  },
  {
    sourceIndex: "barbarian-9",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 9,
    features: [
      {
        index: "brutal-critical-1-die",
        name: "Brutal Critical (1 die)",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      rage_count: 4,
      rage_damage_bonus: 3,
      brutal_critical_dice: 1,
    },
  },
  {
    sourceIndex: "barbarian-10",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 10,
    features: [
      {
        index: "primal-path-improvement-2",
        name: "Path feature",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      rage_count: 4,
      rage_damage_bonus: 3,
      brutal_critical_dice: 1,
    },
  },
  {
    sourceIndex: "barbarian-11",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 11,
    features: [
      {
        index: "relentless-rage",
        name: "Relentless Rage",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      rage_count: 4,
      rage_damage_bonus: 3,
      brutal_critical_dice: 1,
    },
  },
  {
    sourceIndex: "barbarian-12",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 12,
    features: [
      {
        index: "barbarian-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      rage_count: 5,
      rage_damage_bonus: 3,
      brutal_critical_dice: 1,
    },
  },
  {
    sourceIndex: "barbarian-13",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 13,
    features: [
      {
        index: "brutal-critical-2-dice",
        name: "Brutal Critical (2 dice)",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      rage_count: 5,
      rage_damage_bonus: 3,
      brutal_critical_dice: 2,
    },
  },
  {
    sourceIndex: "barbarian-14",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 14,
    features: [
      {
        index: "primal-path-improvement-3",
        name: "Path feature",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      rage_count: 5,
      rage_damage_bonus: 3,
      brutal_critical_dice: 2,
    },
  },
  {
    sourceIndex: "barbarian-15",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 15,
    features: [
      {
        index: "persistent-rage",
        name: "Persistent Rage",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      rage_count: 5,
      rage_damage_bonus: 3,
      brutal_critical_dice: 2,
    },
  },
  {
    sourceIndex: "barbarian-16",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 16,
    features: [
      {
        index: "barbarian-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 5,
    classSpecific: {
      rage_count: 5,
      rage_damage_bonus: 4,
      brutal_critical_dice: 2,
    },
  },
  {
    sourceIndex: "barbarian-17",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 17,
    features: [
      {
        index: "brutal-critical-3-dice",
        name: "Brutal Critical (3 dice)",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      rage_count: 6,
      rage_damage_bonus: 4,
      brutal_critical_dice: 3,
    },
  },
  {
    sourceIndex: "barbarian-18",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 18,
    features: [
      {
        index: "indomitable-might",
        name: "Indomitable Might",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      rage_count: 6,
      rage_damage_bonus: 4,
      brutal_critical_dice: 3,
    },
  },
  {
    sourceIndex: "barbarian-19",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 19,
    features: [
      {
        index: "barbarian-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      rage_count: 6,
      rage_damage_bonus: 4,
      brutal_critical_dice: 3,
    },
  },
  {
    sourceIndex: "barbarian-20",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 20,
    features: [
      {
        index: "primal-champion",
        name: "Primal Champion",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      rage_count: 9999,
      rage_damage_bonus: 4,
      brutal_critical_dice: 3,
    },
  },
  {
    sourceIndex: "bard-1",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 1,
    features: [
      {
        index: "spellcasting-bard",
        name: "Spellcasting: Bard",
      },
      {
        index: "bardic-inspiration-d6",
        name: "Bardic Inspiration (d6)",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      bardic_inspiration_die: 6,
      song_of_rest_die: 0,
      magical_secrets_max_5: 0,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 2,
      spells_known: 4,
      spell_slots_level_1: 2,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-2",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 2,
    features: [
      {
        index: "jack-of-all-trades",
        name: "Jack of All Trades",
      },
      {
        index: "song-of-rest-d6",
        name: "Song of Rest (d6)",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      bardic_inspiration_die: 6,
      song_of_rest_die: 6,
      magical_secrets_max_5: 0,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 2,
      spells_known: 5,
      spell_slots_level_1: 3,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-3",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 3,
    features: [
      {
        index: "bard-expertise-1",
        name: "Expertise",
      },
      {
        index: "bard-college",
        name: "Bard College",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      bardic_inspiration_die: 6,
      song_of_rest_die: 6,
      magical_secrets_max_5: 0,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 2,
      spells_known: 6,
      spell_slots_level_1: 4,
      spell_slots_level_2: 2,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-4",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 4,
    features: [
      {
        index: "bard-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      bardic_inspiration_die: 6,
      song_of_rest_die: 6,
      magical_secrets_max_5: 0,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 7,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-5",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 5,
    features: [
      {
        index: "bardic-inspiration-d8",
        name: "Bardic Inspiration (d8)",
      },
      {
        index: "font-of-inspiration",
        name: "Font of Inspiration",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      bardic_inspiration_die: 8,
      song_of_rest_die: 6,
      magical_secrets_max_5: 0,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 8,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 2,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-6",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 6,
    features: [
      {
        index: "countercharm",
        name: "Countercharm",
      },
      {
        index: "bard-college-improvement-1",
        name: "Bard College feature",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      bardic_inspiration_die: 8,
      song_of_rest_die: 6,
      magical_secrets_max_5: 0,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 9,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-7",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 7,
    features: [],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      bardic_inspiration_die: 8,
      song_of_rest_die: 6,
      magical_secrets_max_5: 0,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 10,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 1,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-8",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 8,
    features: [
      {
        index: "bard-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      bardic_inspiration_die: 8,
      song_of_rest_die: 6,
      magical_secrets_max_5: 0,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 11,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 2,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-9",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 9,
    features: [
      {
        index: "song-of-rest-d8",
        name: "Song of Rest (d8)",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      bardic_inspiration_die: 8,
      song_of_rest_die: 8,
      magical_secrets_max_5: 0,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 12,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 1,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-10",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 10,
    features: [
      {
        index: "bard-expertise-2",
        name: "Expertise",
      },
      {
        index: "bardic-inspiration-d10",
        name: "Bardic Inspiration (d10)",
      },
      {
        index: "magical-secrets-1",
        name: "Magical Secrets",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      bardic_inspiration_die: 10,
      song_of_rest_die: 8,
      magical_secrets_max_5: 2,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 14,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-11",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 11,
    features: [],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      bardic_inspiration_die: 10,
      song_of_rest_die: 8,
      magical_secrets_max_5: 2,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 15,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-12",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 12,
    features: [
      {
        index: "bard-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      bardic_inspiration_die: 10,
      song_of_rest_die: 8,
      magical_secrets_max_5: 2,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 15,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-13",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 13,
    features: [
      {
        index: "song-of-rest-d10",
        name: "Song of Rest (d10)",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      bardic_inspiration_die: 10,
      song_of_rest_die: 10,
      magical_secrets_max_5: 2,
      magical_secrets_max_7: 0,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 16,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-14",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 14,
    features: [
      {
        index: "magical-secrets-2",
        name: "Magical Secrets",
      },
      {
        index: "bard-college-improvement-2",
        name: "Bard College feature",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      bardic_inspiration_die: 10,
      song_of_rest_die: 10,
      magical_secrets_max_5: 2,
      magical_secrets_max_7: 2,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 18,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-15",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 15,
    features: [
      {
        index: "bardic-inspiration-d12",
        name: "Bardic Inspiration (d12)",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      bardic_inspiration_die: 12,
      song_of_rest_die: 10,
      magical_secrets_max_5: 2,
      magical_secrets_max_7: 2,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 19,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-16",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 16,
    features: [
      {
        index: "bard-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 5,
    classSpecific: {
      bardic_inspiration_die: 12,
      song_of_rest_die: 10,
      magical_secrets_max_5: 2,
      magical_secrets_max_7: 2,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 19,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "bard-17",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 17,
    features: [
      {
        index: "song-of-rest-d12",
        name: "Song of Rest (d12)",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      bardic_inspiration_die: 12,
      song_of_rest_die: 12,
      magical_secrets_max_5: 2,
      magical_secrets_max_7: 2,
      magical_secrets_max_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 20,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "bard-18",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 18,
    features: [
      {
        index: "magical-secrets-3",
        name: "Magical Secrets",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      bardic_inspiration_die: 12,
      song_of_rest_die: 12,
      magical_secrets_max_5: 2,
      magical_secrets_max_7: 2,
      magical_secrets_max_9: 2,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 22,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "bard-19",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 19,
    features: [
      {
        index: "bard-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      bardic_inspiration_die: 12,
      song_of_rest_die: 12,
      magical_secrets_max_5: 2,
      magical_secrets_max_7: 2,
      magical_secrets_max_9: 2,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 22,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 2,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "bard-20",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 20,
    features: [
      {
        index: "superior-inspiration",
        name: "Superior Inspiration",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      bardic_inspiration_die: 12,
      song_of_rest_die: 12,
      magical_secrets_max_5: 2,
      magical_secrets_max_7: 2,
      magical_secrets_max_9: 2,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 22,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 2,
      spell_slots_level_7: 2,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "cleric-1",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 1,
    features: [
      {
        index: "spellcasting-cleric",
        name: "Spellcasting: Cleric",
      },
      {
        index: "divine-domain",
        name: "Divine Domain",
      },
      {
        index: "domain-spells-1",
        name: "Domain Spells",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      channel_divinity_charges: 0,
      destroy_undead_cr: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 2,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-2",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 2,
    features: [
      {
        index: "channel-divinity-1-rest",
        name: "Channel Divinity (1/rest)",
      },
      {
        index: "channel-divinity-turn-undead",
        name: "Channel Divinity: Turn Undead",
      },
      {
        index: "divine-domain-improvement-1",
        name: "Divine Domain feature",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      channel_divinity_charges: 1,
      destroy_undead_cr: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 3,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-3",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 3,
    features: [
      {
        index: "domain-spells-2",
        name: "Domain Spells",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      channel_divinity_charges: 1,
      destroy_undead_cr: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 4,
      spell_slots_level_2: 2,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-4",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 4,
    features: [
      {
        index: "cleric-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      channel_divinity_charges: 1,
      destroy_undead_cr: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-5",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 5,
    features: [
      {
        index: "domain-spells-3",
        name: "Domain Spells",
      },
      {
        index: "destroy-undead-cr-1-2-or-below",
        name: "Destroy Undead (CR 1/2 or below)",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      channel_divinity_charges: 1,
      destroy_undead_cr: 0.5,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 2,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-6",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 6,
    features: [
      {
        index: "channel-divinity-2-rest",
        name: "Channel Divinity (2/rest)",
      },
      {
        index: "divine-domain-improvement-2",
        name: "Divine Domain feature",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 0.5,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-7",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 7,
    features: [
      {
        index: "domain-spells-4",
        name: "Domain Spells",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 0.5,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 1,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-8",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 8,
    features: [
      {
        index: "cleric-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
      {
        index: "destroy-undead-cr-1-or-below",
        name: "Destroy Undead (CR 1 or below)",
      },
      {
        index: "divine-domain-improvement-3",
        name: "Divine Domain feature",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 1,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 2,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-9",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 9,
    features: [
      {
        index: "domain-spells-5",
        name: "Domain Spells",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 1,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 1,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-10",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 10,
    features: [
      {
        index: "divine-intervention",
        name: "Divine Intervention",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 1,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-11",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 11,
    features: [
      {
        index: "destroy-undead-cr-2-or-below",
        name: "Destroy Undead (CR 2 or below)",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 2,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-12",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 12,
    features: [
      {
        index: "cleric-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 2,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-13",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 13,
    features: [],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 2,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-14",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 14,
    features: [
      {
        index: "destroy-undead-cr-3-or-below",
        name: "Destroy Undead (CR 3 or below)",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 3,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-15",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 15,
    features: [],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 3,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-16",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 16,
    features: [
      {
        index: "cleric-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 5,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 3,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "cleric-17",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 17,
    features: [
      {
        index: "destroy-undead-cr-4-or-below",
        name: "Destroy Undead (CR 4 or below)",
      },
      {
        index: "divine-domain-improvement-4",
        name: "Divine Domain feature",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      channel_divinity_charges: 2,
      destroy_undead_cr: 4,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "cleric-18",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 18,
    features: [
      {
        index: "channel-divinity-3-rest",
        name: "Channel Divinity (3/rest)",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      channel_divinity_charges: 3,
      destroy_undead_cr: 4,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "cleric-19",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 19,
    features: [
      {
        index: "cleric-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      channel_divinity_charges: 3,
      destroy_undead_cr: 4,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 2,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "cleric-20",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 20,
    features: [
      {
        index: "divine-intervention-improvement",
        name: "Divine Intervention Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      channel_divinity_charges: 3,
      destroy_undead_cr: 4,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 2,
      spell_slots_level_7: 2,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "druid-1",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 1,
    features: [
      {
        index: "spellcasting-druid",
        name: "Spellcasting: Druid",
      },
      {
        index: "druidic",
        name: "Druidic",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      wild_shape_max_cr: 0,
      wild_shape_swim: false,
      wild_shape_fly: false,
    },
    spellcasting: {
      cantrips_known: 2,
      spell_slots_level_1: 2,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-2",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    features: [
      {
        index: "wild-shape-cr-1-4-or-below-no-flying-or-swim-speed",
        name: "Wild Shape (CR 1/4 or below, no flying or swim speed)",
      },
      {
        index: "druid-circle",
        name: "Druid Circle",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      wild_shape_max_cr: 0.25,
      wild_shape_swim: false,
      wild_shape_fly: false,
    },
    spellcasting: {
      cantrips_known: 2,
      spell_slots_level_1: 3,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-3",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 3,
    features: [],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      wild_shape_max_cr: 0.25,
      wild_shape_swim: false,
      wild_shape_fly: false,
    },
    spellcasting: {
      cantrips_known: 2,
      spell_slots_level_1: 4,
      spell_slots_level_2: 2,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-4",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 4,
    features: [
      {
        index: "wild-shape-cr-1-2-or-below-no-flying-speed",
        name: "Wild Shape (CR 1/2 or below, no flying speed)",
      },
      {
        index: "druid-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      wild_shape_max_cr: 0.5,
      wild_shape_swim: true,
      wild_shape_fly: false,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-5",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 5,
    features: [],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      wild_shape_max_cr: 0.5,
      wild_shape_swim: true,
      wild_shape_fly: false,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 2,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-6",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 6,
    features: [
      {
        index: "druid-circle-improvement-1",
        name: "Druid Circle feature",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      wild_shape_max_cr: 0.5,
      wild_shape_swim: true,
      wild_shape_fly: false,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-7",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 7,
    features: [],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: false,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 1,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-8",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 8,
    features: [
      {
        index: "wild-shape-cr-1-or-below",
        name: "Wild Shape (CR 1 or below)",
      },
      {
        index: "druid-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 2,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-9",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 9,
    features: [],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 1,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-10",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 10,
    features: [
      {
        index: "druid-circle-improvement-2",
        name: "Druid Circle feature",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-11",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 11,
    features: [],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-12",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 12,
    features: [
      {
        index: "druid-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-13",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 13,
    features: [],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-14",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 14,
    features: [
      {
        index: "druid-circle-improvement-3",
        name: "Druid Circle feature",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-15",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 15,
    features: [],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-16",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 16,
    features: [
      {
        index: "druid-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 5,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "druid-17",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 17,
    features: [],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "druid-18",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 18,
    features: [
      {
        index: "druid-timeless-body",
        name: "Timeless Body",
      },
      {
        index: "beast-spells",
        name: "Beast Spells",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "druid-19",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 19,
    features: [
      {
        index: "druid-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 2,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "druid-20",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 20,
    features: [
      {
        index: "archdruid",
        name: "Archdruid",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      wild_shape_max_cr: 1,
      wild_shape_swim: true,
      wild_shape_fly: true,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 2,
      spell_slots_level_7: 2,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "fighter-1",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 1,
    features: [
      {
        index: "fighter-fighting-style",
        name: "Fighting Style",
      },
      {
        index: "second-wind",
        name: "Second Wind",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      action_surges: 0,
      indomitable_uses: 0,
      extra_attacks: 0,
    },
  },
  {
    sourceIndex: "fighter-2",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 2,
    features: [
      {
        index: "action-surge-1-use",
        name: "Action Surge (1 use)",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 0,
      extra_attacks: 0,
    },
  },
  {
    sourceIndex: "fighter-3",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 3,
    features: [
      {
        index: "martial-archetype",
        name: "Martial Archetype",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 0,
      extra_attacks: 0,
    },
  },
  {
    sourceIndex: "fighter-4",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 4,
    features: [
      {
        index: "fighter-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 0,
      extra_attacks: 0,
    },
  },
  {
    sourceIndex: "fighter-5",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 5,
    features: [
      {
        index: "extra-attack-1",
        name: "Extra Attack",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 0,
      extra_attacks: 1,
    },
  },
  {
    sourceIndex: "fighter-6",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 6,
    features: [
      {
        index: "fighter-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 0,
      extra_attacks: 1,
    },
  },
  {
    sourceIndex: "fighter-7",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 7,
    features: [
      {
        index: "martial-archetype-improvement-1",
        name: "Martial Archetype feature",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 0,
      extra_attacks: 1,
    },
  },
  {
    sourceIndex: "fighter-8",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 8,
    features: [
      {
        index: "fighter-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 3,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 0,
      extra_attacks: 1,
    },
  },
  {
    sourceIndex: "fighter-9",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 9,
    features: [
      {
        index: "indomitable-1-use",
        name: "Indomitable (1 use)",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 1,
      extra_attacks: 1,
    },
  },
  {
    sourceIndex: "fighter-10",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 10,
    features: [
      {
        index: "martial-archetype-improvement-2",
        name: "Martial Archetype feature",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 1,
      extra_attacks: 1,
    },
  },
  {
    sourceIndex: "fighter-11",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 11,
    features: [
      {
        index: "extra-attack-2",
        name: "Extra Attack (2)",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 1,
      extra_attacks: 2,
    },
  },
  {
    sourceIndex: "fighter-12",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 12,
    features: [
      {
        index: "fighter-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 4,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 1,
      extra_attacks: 2,
    },
  },
  {
    sourceIndex: "fighter-13",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 13,
    features: [
      {
        index: "indomitable-2-uses",
        name: "Indomitable (2 uses)",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 5,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 2,
      extra_attacks: 2,
    },
  },
  {
    sourceIndex: "fighter-14",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 14,
    features: [
      {
        index: "fighter-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 5,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 2,
      extra_attacks: 2,
    },
  },
  {
    sourceIndex: "fighter-15",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 15,
    features: [
      {
        index: "martial-archetype-improvement-3",
        name: "Martial Archetype feature",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 5,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 2,
      extra_attacks: 2,
    },
  },
  {
    sourceIndex: "fighter-16",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 16,
    features: [
      {
        index: "fighter-ability-score-improvement-6",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 6,
    proficiencyBonus: 5,
    classSpecific: {
      action_surges: 1,
      indomitable_uses: 2,
      extra_attacks: 2,
    },
  },
  {
    sourceIndex: "fighter-17",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 17,
    features: [
      {
        index: "action-surge-2-uses",
        name: "Action Surge (2 uses)",
      },
      {
        index: "indomitable-3-uses",
        name: "Indomitable (3 uses)",
      },
    ],
    abilityScoreBonuses: 6,
    proficiencyBonus: 6,
    classSpecific: {
      action_surges: 2,
      indomitable_uses: 3,
      extra_attacks: 2,
    },
  },
  {
    sourceIndex: "fighter-18",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 18,
    features: [
      {
        index: "martial-archetype-improvement-4",
        name: "Martial Archetype feature",
      },
    ],
    abilityScoreBonuses: 6,
    proficiencyBonus: 6,
    classSpecific: {
      action_surges: 2,
      indomitable_uses: 3,
      extra_attacks: 2,
    },
  },
  {
    sourceIndex: "fighter-19",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 19,
    features: [
      {
        index: "fighter-ability-score-improvement-7",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 7,
    proficiencyBonus: 6,
    classSpecific: {
      action_surges: 2,
      indomitable_uses: 3,
      extra_attacks: 2,
    },
  },
  {
    sourceIndex: "fighter-20",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 20,
    features: [
      {
        index: "extra-attack-3",
        name: "Extra Attack (3)",
      },
    ],
    abilityScoreBonuses: 7,
    proficiencyBonus: 6,
    classSpecific: {
      action_surges: 2,
      indomitable_uses: 3,
      extra_attacks: 3,
    },
  },
  {
    sourceIndex: "monk-1",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 1,
    features: [
      {
        index: "monk-unarmored-defense",
        name: "Unarmored Defense",
      },
      {
        index: "martial-arts",
        name: "Martial Arts",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 4,
      },
      ki_points: 0,
      unarmored_movement: 0,
    },
  },
  {
    sourceIndex: "monk-2",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 2,
    features: [
      {
        index: "ki",
        name: "Ki",
      },
      {
        index: "flurry-of-blows",
        name: "Flurry of Blows",
      },
      {
        index: "patient-defense",
        name: "Patient Defense",
      },
      {
        index: "step-of-the-wind",
        name: "Step of the Wind",
      },
      {
        index: "unarmored-movement-1",
        name: "Unarmored Movement",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 4,
      },
      ki_points: 2,
      unarmored_movement: 10,
    },
  },
  {
    sourceIndex: "monk-3",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 3,
    features: [
      {
        index: "monastic-tradition",
        name: "Monastic Tradition",
      },
      {
        index: "deflect-missiles",
        name: "Deflect Missiles",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 4,
      },
      ki_points: 3,
      unarmored_movement: 10,
    },
  },
  {
    sourceIndex: "monk-4",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 4,
    features: [
      {
        index: "monk-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
      {
        index: "slow-fall",
        name: "Slow Fall",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 4,
      },
      ki_points: 4,
      unarmored_movement: 10,
    },
  },
  {
    sourceIndex: "monk-5",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 5,
    features: [
      {
        index: "monk-extra-attack",
        name: "Extra Attack",
      },
      {
        index: "stunning-strike",
        name: "Stunning Strike",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 6,
      },
      ki_points: 5,
      unarmored_movement: 10,
    },
  },
  {
    sourceIndex: "monk-6",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 6,
    features: [
      {
        index: "ki-empowered-strikes",
        name: "Ki Empowered Strikes",
      },
      {
        index: "monastic-tradition-improvement-1",
        name: "Monastic Tradition feature",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 6,
      },
      ki_points: 6,
      unarmored_movement: 15,
    },
  },
  {
    sourceIndex: "monk-7",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 7,
    features: [
      {
        index: "monk-evasion",
        name: "Evasion",
      },
      {
        index: "stillness-of-mind",
        name: "Stillness of Mind",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 6,
      },
      ki_points: 7,
      unarmored_movement: 15,
    },
  },
  {
    sourceIndex: "monk-8",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 8,
    features: [
      {
        index: "monk-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 6,
      },
      ki_points: 8,
      unarmored_movement: 15,
    },
  },
  {
    sourceIndex: "monk-9",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 9,
    features: [
      {
        index: "unarmored-movement-2",
        name: "Unarmored Movement",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 6,
      },
      ki_points: 9,
      unarmored_movement: 15,
    },
  },
  {
    sourceIndex: "monk-10",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 10,
    features: [
      {
        index: "purity-of-body",
        name: "Purity of Body",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 6,
      },
      ki_points: 10,
      unarmored_movement: 20,
    },
  },
  {
    sourceIndex: "monk-11",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 11,
    features: [
      {
        index: "monastic-tradition-improvement-2",
        name: "Monastic Tradition feature",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 8,
      },
      ki_points: 11,
      unarmored_movement: 20,
    },
  },
  {
    sourceIndex: "monk-12",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 12,
    features: [
      {
        index: "monk-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 8,
      },
      ki_points: 12,
      unarmored_movement: 20,
    },
  },
  {
    sourceIndex: "monk-13",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 13,
    features: [
      {
        index: "tongue-of-the-sun-and-moon",
        name: "Tongue of the Sun and Moon",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 8,
      },
      ki_points: 13,
      unarmored_movement: 20,
    },
  },
  {
    sourceIndex: "monk-14",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 14,
    features: [
      {
        index: "diamond-soul",
        name: "Diamond Soul",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 8,
      },
      ki_points: 14,
      unarmored_movement: 25,
    },
  },
  {
    sourceIndex: "monk-15",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 15,
    features: [
      {
        index: "monk-timeless-body",
        name: "Timeless Body",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 8,
      },
      ki_points: 15,
      unarmored_movement: 25,
    },
  },
  {
    sourceIndex: "monk-16",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 16,
    features: [
      {
        index: "monk-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 5,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 8,
      },
      ki_points: 16,
      unarmored_movement: 25,
    },
  },
  {
    sourceIndex: "monk-17",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 17,
    features: [
      {
        index: "monastic-tradition-improvement-3",
        name: "Monastic Tradition feature",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 10,
      },
      ki_points: 17,
      unarmored_movement: 25,
    },
  },
  {
    sourceIndex: "monk-18",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 18,
    features: [
      {
        index: "empty-body",
        name: "Empty Body",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 10,
      },
      ki_points: 18,
      unarmored_movement: 30,
    },
  },
  {
    sourceIndex: "monk-19",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 19,
    features: [
      {
        index: "monk-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 10,
      },
      ki_points: 19,
      unarmored_movement: 30,
    },
  },
  {
    sourceIndex: "monk-20",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 20,
    features: [
      {
        index: "perfect-self",
        name: "Perfect Self",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      martial_arts: {
        dice_count: 1,
        dice_value: 10,
      },
      ki_points: 20,
      unarmored_movement: 30,
    },
  },
  {
    sourceIndex: "paladin-1",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 1,
    features: [
      {
        index: "divine-sense",
        name: "Divine Sense",
      },
      {
        index: "lay-on-hands",
        name: "Lay on Hands",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      aura_range: 0,
    },
    spellcasting: {
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-2",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 2,
    features: [
      {
        index: "paladin-fighting-style",
        name: "Fighting Style",
      },
      {
        index: "spellcasting-paladin",
        name: "Spellcasting: Paladin",
      },
      {
        index: "divine-smite",
        name: "Divine Smite",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      aura_range: 0,
    },
    spellcasting: {
      spell_slots_level_1: 2,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-3",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 3,
    features: [
      {
        index: "divine-health",
        name: "Divine Health",
      },
      {
        index: "sacred-oath",
        name: "Sacred Oath",
      },
      {
        index: "oath-spells",
        name: "Oath Spells",
      },
      {
        index: "channel-divinity",
        name: "Channel Divinity",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      aura_range: 0,
    },
    spellcasting: {
      spell_slots_level_1: 3,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-4",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 4,
    features: [
      {
        index: "paladin-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      aura_range: 0,
    },
    spellcasting: {
      spell_slots_level_1: 3,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-5",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 5,
    features: [
      {
        index: "paladin-extra-attack",
        name: "Extra Attack",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      aura_range: 0,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 2,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-6",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 6,
    features: [
      {
        index: "aura-of-protection",
        name: "Aura of Protection",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 2,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-7",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 7,
    features: [
      {
        index: "sacred-oath-improvement-1",
        name: "Sacred Oath feature",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-8",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 8,
    features: [
      {
        index: "paladin-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-9",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 9,
    features: [],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 2,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-10",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 10,
    features: [
      {
        index: "aura-of-courage",
        name: "Aura of Courage",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 2,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-11",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 11,
    features: [
      {
        index: "improved-divine-smite",
        name: "Improved Divine Smite",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-12",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 12,
    features: [
      {
        index: "paladin-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-13",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 13,
    features: [],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 1,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-14",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 14,
    features: [
      {
        index: "cleansing-touch",
        name: "Cleansing Touch",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 1,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-15",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 15,
    features: [
      {
        index: "sacred-oath-improvement-2",
        name: "Sacred Oath feature",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 2,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-16",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 16,
    features: [
      {
        index: "paladin-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 5,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 2,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "paladin-17",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 17,
    features: [],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      aura_range: 10,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 1,
    },
  },
  {
    sourceIndex: "paladin-18",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 18,
    features: [
      {
        index: "aura-improvements",
        name: "Aura improvements",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      aura_range: 30,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 1,
    },
  },
  {
    sourceIndex: "paladin-19",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 19,
    features: [
      {
        index: "paladin-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      aura_range: 30,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
    },
  },
  {
    sourceIndex: "paladin-20",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 20,
    features: [
      {
        index: "sacred-oath-improvement-3",
        name: "Sacred Oath feature",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      aura_range: 30,
    },
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
    },
  },
  {
    sourceIndex: "ranger-1",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 1,
    features: [
      {
        index: "favored-enemy-1-type",
        name: "Favored Enemy (1 type)",
      },
      {
        index: "natural-explorer-1-terrain-type",
        name: "Natural Explorer (1 terrain type)",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      favored_enemies: 1,
      favored_terrain: 1,
    },
    spellcasting: {
      spells_known: 0,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-2",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 2,
    features: [
      {
        index: "ranger-fighting-style",
        name: "Fighting Style",
      },
      {
        index: "spellcasting-ranger",
        name: "Spellcasting: Ranger",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      favored_enemies: 1,
      favored_terrain: 1,
    },
    spellcasting: {
      spells_known: 2,
      spell_slots_level_1: 2,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-3",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 3,
    features: [
      {
        index: "ranger-archetype",
        name: "Ranger Archetype",
      },
      {
        index: "primeval-awareness",
        name: "Primeval Awareness",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      favored_enemies: 1,
      favored_terrain: 1,
    },
    spellcasting: {
      spells_known: 3,
      spell_slots_level_1: 3,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-4",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 4,
    features: [
      {
        index: "ranger-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      favored_enemies: 1,
      favored_terrain: 1,
    },
    spellcasting: {
      spells_known: 3,
      spell_slots_level_1: 3,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-5",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 5,
    features: [
      {
        index: "ranger-extra-attack",
        name: "Extra Attack",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      favored_enemies: 1,
      favored_terrain: 1,
    },
    spellcasting: {
      spells_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 2,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-6",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 6,
    features: [
      {
        index: "favored-enemy-2-types",
        name: "Favored Enemy (2 types)",
      },
      {
        index: "natural-explorer-2-terrain-types",
        name: "Natural Explorer (2 terrain types)",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      favored_enemies: 2,
      favored_terrain: 2,
    },
    spellcasting: {
      spells_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 2,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-7",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 7,
    features: [
      {
        index: "ranger-archetype-improvement-1",
        name: "Ranger Archetype feature",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      favored_enemies: 2,
      favored_terrain: 2,
    },
    spellcasting: {
      spells_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-8",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 8,
    features: [
      {
        index: "ranger-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
      {
        index: "ranger-lands-stride",
        name: "Land's Stride",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      favored_enemies: 2,
      favored_terrain: 2,
    },
    spellcasting: {
      spells_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-9",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 9,
    features: [],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      favored_enemies: 2,
      favored_terrain: 2,
    },
    spellcasting: {
      spells_known: 6,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 2,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-10",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 10,
    features: [
      {
        index: "natural-explorer-3-terrain-types",
        name: "Natural Explorer (3 terrain types)",
      },
      {
        index: "hide-in-plain-sight",
        name: "Hide in Plain Sight",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      favored_enemies: 2,
      favored_terrain: 3,
    },
    spellcasting: {
      spells_known: 6,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 2,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-11",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 11,
    features: [
      {
        index: "ranger-archetype-improvement-2",
        name: "Ranger Archetype feature",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      favored_enemies: 2,
      favored_terrain: 3,
    },
    spellcasting: {
      spells_known: 7,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-12",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 12,
    features: [
      {
        index: "ranger-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      favored_enemies: 2,
      favored_terrain: 3,
    },
    spellcasting: {
      spells_known: 7,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-13",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 13,
    features: [],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      favored_enemies: 2,
      favored_terrain: 3,
    },
    spellcasting: {
      spells_known: 8,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 1,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-14",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 14,
    features: [
      {
        index: "favored-enemy-3-enemies",
        name: "Favored Enemy (3 enemies)",
      },
      {
        index: "vanish",
        name: "Vanish",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      favored_enemies: 3,
      favored_terrain: 3,
    },
    spellcasting: {
      spells_known: 8,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 1,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-15",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 15,
    features: [
      {
        index: "ranger-archetype-improvement-3",
        name: "Ranger Archetype feature",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      favored_enemies: 3,
      favored_terrain: 3,
    },
    spellcasting: {
      spells_known: 9,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 2,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-16",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 16,
    features: [
      {
        index: "ranger-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 5,
    classSpecific: {
      favored_enemies: 3,
      favored_terrain: 3,
    },
    spellcasting: {
      spells_known: 9,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 2,
      spell_slots_level_5: 0,
    },
  },
  {
    sourceIndex: "ranger-17",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 17,
    features: [],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      favored_enemies: 3,
      favored_terrain: 3,
    },
    spellcasting: {
      spells_known: 10,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 1,
    },
  },
  {
    sourceIndex: "ranger-18",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 18,
    features: [
      {
        index: "feral-senses",
        name: "Feral Senses",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      favored_enemies: 3,
      favored_terrain: 3,
    },
    spellcasting: {
      spells_known: 10,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 1,
    },
  },
  {
    sourceIndex: "ranger-19",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 19,
    features: [
      {
        index: "ranger-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      favored_enemies: 3,
      favored_terrain: 3,
    },
    spellcasting: {
      spells_known: 11,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
    },
  },
  {
    sourceIndex: "ranger-20",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 20,
    features: [
      {
        index: "foe-slayer",
        name: "Foe Slayer",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      favored_enemies: 3,
      favored_terrain: 3,
    },
    spellcasting: {
      spells_known: 11,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
    },
  },
  {
    sourceIndex: "rogue-1",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 1,
    features: [
      {
        index: "rogue-expertise-1",
        name: "Expertise",
      },
      {
        index: "sneak-attack",
        name: "Sneak Attack",
      },
      {
        index: "thieves-cant",
        name: "Thieves' Cant",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      sneak_attack: {
        dice_count: 1,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-2",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 2,
    features: [
      {
        index: "cunning-action",
        name: "Cunning Action",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      sneak_attack: {
        dice_count: 1,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-3",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 3,
    features: [
      {
        index: "roguish-archetype",
        name: "Roguish Archetype",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      sneak_attack: {
        dice_count: 2,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-4",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 4,
    features: [
      {
        index: "rogue-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      sneak_attack: {
        dice_count: 2,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-5",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 5,
    features: [
      {
        index: "uncanny-dodge",
        name: "Uncanny Dodge",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      sneak_attack: {
        dice_count: 3,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-6",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 6,
    features: [
      {
        index: "rogue-expertise-2",
        name: "Expertise",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      sneak_attack: {
        dice_count: 3,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-7",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 7,
    features: [
      {
        index: "rogue-evasion",
        name: "Evasion",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      sneak_attack: {
        dice_count: 4,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-8",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 8,
    features: [
      {
        index: "rogue-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      sneak_attack: {
        dice_count: 4,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-9",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 9,
    features: [
      {
        index: "roguish-archetype-improvement-1",
        name: "Roguish Archetype feature",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      sneak_attack: {
        dice_count: 5,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-10",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 10,
    features: [
      {
        index: "rogue-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      sneak_attack: {
        dice_count: 5,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-11",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 11,
    features: [
      {
        index: "reliable-talent",
        name: "Reliable Talent",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      sneak_attack: {
        dice_count: 6,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-12",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 12,
    features: [
      {
        index: "rogue-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 4,
    classSpecific: {
      sneak_attack: {
        dice_count: 6,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-13",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 13,
    features: [
      {
        index: "roguish-archetype-improvement-2",
        name: "Roguish Archetype feature",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      sneak_attack: {
        dice_count: 7,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-14",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 14,
    features: [
      {
        index: "blindsense",
        name: "Blindsense",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      sneak_attack: {
        dice_count: 7,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-15",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 15,
    features: [
      {
        index: "slippery-mind",
        name: "Slippery Mind",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      sneak_attack: {
        dice_count: 8,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-16",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 16,
    features: [
      {
        index: "rogue-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 5,
    classSpecific: {
      sneak_attack: {
        dice_count: 8,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-17",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 17,
    features: [
      {
        index: "roguish-archetype-improvement-3",
        name: "Roguish Archetype feature",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      sneak_attack: {
        dice_count: 9,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-18",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 18,
    features: [
      {
        index: "elusive",
        name: "Elusive",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      sneak_attack: {
        dice_count: 9,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-19",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 19,
    features: [
      {
        index: "rogue-ability-score-improvement-6",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 6,
    proficiencyBonus: 6,
    classSpecific: {
      sneak_attack: {
        dice_count: 10,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "rogue-20",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 20,
    features: [
      {
        index: "stroke-of-luck",
        name: "Stroke of Luck",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      sneak_attack: {
        dice_count: 10,
        dice_value: 6,
      },
    },
  },
  {
    sourceIndex: "sorcerer-1",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    features: [
      {
        index: "spellcasting-sorcerer",
        name: "Spellcasting: Sorcerer",
      },
      {
        index: "sorcerous-origin",
        name: "Sorcerous Origin",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      sorcery_points: 0,
      metamagic_known: 0,
      creating_spell_slots: [],
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 2,
      spell_slots_level_1: 2,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-2",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 2,
    features: [
      {
        index: "font-of-magic",
        name: "Font of Magic",
      },
      {
        index: "flexible-casting-creating-spell-slots",
        name: "Flexible Casting: Creating Spell Slots",
      },
      {
        index: "flexible-casting-converting-spell-slot",
        name: "Flexible Casting: Converting Spell Slot",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      sorcery_points: 2,
      metamagic_known: 0,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 3,
      spell_slots_level_1: 3,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-3",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 3,
    features: [
      {
        index: "metamagic-1",
        name: "Metamagic",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      sorcery_points: 3,
      metamagic_known: 2,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 2,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-4",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 4,
    features: [
      {
        index: "sorcerer-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      sorcery_points: 4,
      metamagic_known: 2,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 5,
      spells_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-5",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 5,
    features: [],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      sorcery_points: 5,
      metamagic_known: 2,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 5,
      spells_known: 6,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 2,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-6",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 6,
    features: [
      {
        index: "sorcerous-origin-improvement-1",
        name: "Sorcerous Origin feature",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      sorcery_points: 6,
      metamagic_known: 2,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 5,
      spells_known: 7,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-7",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 7,
    features: [],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      sorcery_points: 7,
      metamagic_known: 2,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 5,
      spells_known: 8,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 1,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-8",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 8,
    features: [
      {
        index: "sorcerer-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      sorcery_points: 8,
      metamagic_known: 2,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 5,
      spells_known: 9,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 2,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-9",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 9,
    features: [],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      sorcery_points: 9,
      metamagic_known: 2,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 5,
      spells_known: 10,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 1,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-10",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 10,
    features: [
      {
        index: "metamagic-2",
        name: "Metamagic",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      sorcery_points: 10,
      metamagic_known: 3,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 6,
      spells_known: 11,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-11",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 11,
    features: [],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      sorcery_points: 11,
      metamagic_known: 3,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 6,
      spells_known: 12,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-12",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 12,
    features: [
      {
        index: "sorcerer-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      sorcery_points: 12,
      metamagic_known: 3,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 6,
      spells_known: 12,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-13",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 13,
    features: [],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      sorcery_points: 13,
      metamagic_known: 3,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 6,
      spells_known: 13,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-14",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 14,
    features: [
      {
        index: "sorcerous-origin-improvement-2",
        name: "Sorcerous Origin feature",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      sorcery_points: 14,
      metamagic_known: 3,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 6,
      spells_known: 13,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-15",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 15,
    features: [],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      sorcery_points: 15,
      metamagic_known: 3,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 6,
      spells_known: 14,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-16",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 16,
    features: [
      {
        index: "sorcerer-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 5,
    classSpecific: {
      sorcery_points: 16,
      metamagic_known: 4,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 6,
      spells_known: 14,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "sorcerer-17",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 17,
    features: [
      {
        index: "metamagic-3",
        name: "Metamagic",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      sorcery_points: 17,
      metamagic_known: 4,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 6,
      spells_known: 15,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "sorcerer-18",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 18,
    features: [
      {
        index: "sorcerous-origin-improvement-3",
        name: "Sorcerous Origin feature",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      sorcery_points: 18,
      metamagic_known: 4,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 6,
      spells_known: 15,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "sorcerer-19",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 19,
    features: [
      {
        index: "sorcerer-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      sorcery_points: 19,
      metamagic_known: 4,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 6,
      spells_known: 15,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 2,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "sorcerer-20",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 20,
    features: [
      {
        index: "sorcerous-restoration",
        name: "Sorcerous Restoration",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      sorcery_points: 20,
      metamagic_known: 4,
      creating_spell_slots: [
        {
          spell_slot_level: 1,
          sorcery_point_cost: 2,
        },
        {
          spell_slot_level: 2,
          sorcery_point_cost: 3,
        },
        {
          spell_slot_level: 3,
          sorcery_point_cost: 5,
        },
        {
          spell_slot_level: 4,
          sorcery_point_cost: 6,
        },
        {
          spell_slot_level: 5,
          sorcery_point_cost: 7,
        },
      ],
    },
    spellcasting: {
      cantrips_known: 6,
      spells_known: 15,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 2,
      spell_slots_level_7: 2,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "warlock-1",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 1,
    features: [
      {
        index: "otherworldly-patron",
        name: "Otherworldly Patron",
      },
      {
        index: "pact-magic",
        name: "Pact Magic",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      invocations_known: 0,
      mystic_arcanum_level_6: 0,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 2,
      spells_known: 2,
      spell_slots_level_1: 1,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-2",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    features: [
      {
        index: "eldritch-invocations",
        name: "Eldritch Invocations",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      invocations_known: 2,
      mystic_arcanum_level_6: 0,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 2,
      spells_known: 3,
      spell_slots_level_1: 2,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-3",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 3,
    features: [
      {
        index: "pact-boon",
        name: "Pact Boon",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      invocations_known: 2,
      mystic_arcanum_level_6: 0,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 2,
      spells_known: 4,
      spell_slots_level_1: 0,
      spell_slots_level_2: 2,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-4",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 4,
    features: [
      {
        index: "warlock-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      invocations_known: 3,
      mystic_arcanum_level_6: 0,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 5,
      spell_slots_level_1: 0,
      spell_slots_level_2: 2,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-5",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 5,
    features: [],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      invocations_known: 3,
      mystic_arcanum_level_6: 0,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 6,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 2,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-6",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 6,
    features: [
      {
        index: "otherworldly-patron-improvement-1",
        name: "Otherworldly Patron feature",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      invocations_known: 4,
      mystic_arcanum_level_6: 0,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 7,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 2,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-7",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 7,
    features: [],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      invocations_known: 4,
      mystic_arcanum_level_6: 0,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 8,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 2,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-8",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 8,
    features: [
      {
        index: "warlock-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      invocations_known: 4,
      mystic_arcanum_level_6: 0,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 9,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 2,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-9",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 9,
    features: [],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      invocations_known: 5,
      mystic_arcanum_level_6: 0,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 3,
      spells_known: 10,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 2,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-10",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 10,
    features: [
      {
        index: "otherworldly-patron-improvement-2",
        name: "Otherworldly Patron feature",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      invocations_known: 5,
      mystic_arcanum_level_6: 0,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 10,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 2,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-11",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 11,
    features: [
      {
        index: "mystic-arcanum-6th-level",
        name: "Mystic Arcanum (6th level)",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      invocations_known: 5,
      mystic_arcanum_level_6: 1,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 11,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 3,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-12",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 12,
    features: [
      {
        index: "warlock-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      invocations_known: 6,
      mystic_arcanum_level_6: 1,
      mystic_arcanum_level_7: 0,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 11,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 3,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-13",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 13,
    features: [
      {
        index: "mystic-arcanum-7th-level",
        name: "Mystic Arcanum (7th level)",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      invocations_known: 6,
      mystic_arcanum_level_6: 1,
      mystic_arcanum_level_7: 1,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 12,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 3,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-14",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 14,
    features: [
      {
        index: "otherworldly-patron-improvement-3",
        name: "Otherworldly Patron feature",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      invocations_known: 6,
      mystic_arcanum_level_6: 1,
      mystic_arcanum_level_7: 1,
      mystic_arcanum_level_8: 0,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 12,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 3,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-15",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 15,
    features: [
      {
        index: "mystic-arcanum-8th-level",
        name: "Mystic Arcanum (8th level)",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      invocations_known: 7,
      mystic_arcanum_level_6: 1,
      mystic_arcanum_level_7: 1,
      mystic_arcanum_level_8: 1,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 13,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 3,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-16",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 16,
    features: [
      {
        index: "warlock-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 5,
    classSpecific: {
      invocations_known: 7,
      mystic_arcanum_level_6: 1,
      mystic_arcanum_level_7: 1,
      mystic_arcanum_level_8: 1,
      mystic_arcanum_level_9: 0,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 13,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 3,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-17",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 17,
    features: [
      {
        index: "mystic-arcanum-9th-level",
        name: "Mystic Arcanum (9th level)",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      invocations_known: 7,
      mystic_arcanum_level_6: 1,
      mystic_arcanum_level_7: 1,
      mystic_arcanum_level_8: 1,
      mystic_arcanum_level_9: 1,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 14,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 4,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-18",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 18,
    features: [],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      invocations_known: 8,
      mystic_arcanum_level_6: 1,
      mystic_arcanum_level_7: 1,
      mystic_arcanum_level_8: 1,
      mystic_arcanum_level_9: 1,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 14,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 4,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-19",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 19,
    features: [
      {
        index: "warlock-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      invocations_known: 8,
      mystic_arcanum_level_6: 1,
      mystic_arcanum_level_7: 1,
      mystic_arcanum_level_8: 1,
      mystic_arcanum_level_9: 1,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 15,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 4,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "warlock-20",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 20,
    features: [
      {
        index: "eldritch-master",
        name: "Eldritch Master",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      invocations_known: 8,
      mystic_arcanum_level_6: 1,
      mystic_arcanum_level_7: 1,
      mystic_arcanum_level_8: 1,
      mystic_arcanum_level_9: 1,
    },
    spellcasting: {
      cantrips_known: 4,
      spells_known: 15,
      spell_slots_level_1: 0,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 4,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-1",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 1,
    features: [
      {
        index: "spellcasting-wizard",
        name: "Spellcasting: Wizard",
      },
      {
        index: "arcane-recovery",
        name: "Arcane Recovery",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      arcane_recovery_levels: 1,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 2,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-2",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 2,
    features: [
      {
        index: "arcane-tradition",
        name: "Arcane Tradition",
      },
    ],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      arcane_recovery_levels: 1,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 3,
      spell_slots_level_2: 0,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-3",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 3,
    features: [],
    abilityScoreBonuses: 0,
    proficiencyBonus: 2,
    classSpecific: {
      arcane_recovery_levels: 2,
    },
    spellcasting: {
      cantrips_known: 3,
      spell_slots_level_1: 4,
      spell_slots_level_2: 2,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-4",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 4,
    features: [
      {
        index: "wizard-ability-score-improvement-1",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 2,
    classSpecific: {
      arcane_recovery_levels: 2,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 0,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-5",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 5,
    features: [],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      arcane_recovery_levels: 3,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 2,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-6",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 6,
    features: [
      {
        index: "arcane-tradition-improvement-1",
        name: "Arcane Tradition feature",
      },
    ],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      arcane_recovery_levels: 3,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 0,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-7",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 7,
    features: [],
    abilityScoreBonuses: 1,
    proficiencyBonus: 3,
    classSpecific: {
      arcane_recovery_levels: 4,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 1,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-8",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 8,
    features: [
      {
        index: "wizard-ability-score-improvement-2",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 3,
    classSpecific: {
      arcane_recovery_levels: 4,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 2,
      spell_slots_level_5: 0,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-9",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 9,
    features: [],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      arcane_recovery_levels: 5,
    },
    spellcasting: {
      cantrips_known: 4,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 1,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-10",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 10,
    features: [
      {
        index: "arcane-tradition-improvement-2",
        name: "Arcane Tradition feature",
      },
    ],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      arcane_recovery_levels: 5,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 0,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-11",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 11,
    features: [],
    abilityScoreBonuses: 2,
    proficiencyBonus: 4,
    classSpecific: {
      arcane_recovery_levels: 6,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-12",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 12,
    features: [
      {
        index: "wizard-ability-score-improvement-3",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 4,
    classSpecific: {
      arcane_recovery_levels: 6,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 0,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-13",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 13,
    features: [],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      arcane_recovery_levels: 7,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-14",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 14,
    features: [
      {
        index: "arcane-tradition-improvement-3",
        name: "Arcane Tradition feature",
      },
    ],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      arcane_recovery_levels: 7,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 0,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-15",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 15,
    features: [],
    abilityScoreBonuses: 3,
    proficiencyBonus: 5,
    classSpecific: {
      arcane_recovery_levels: 8,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-16",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 16,
    features: [
      {
        index: "wizard-ability-score-improvement-4",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 5,
    classSpecific: {
      arcane_recovery_levels: 8,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 0,
    },
  },
  {
    sourceIndex: "wizard-17",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 17,
    features: [],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      arcane_recovery_levels: 9,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 2,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "wizard-18",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 18,
    features: [
      {
        index: "spell-mastery",
        name: "Spell Mastery",
      },
    ],
    abilityScoreBonuses: 4,
    proficiencyBonus: 6,
    classSpecific: {
      arcane_recovery_levels: 9,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 1,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "wizard-19",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 19,
    features: [
      {
        index: "wizard-ability-score-improvement-5",
        name: "Ability Score Improvement",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      arcane_recovery_levels: 10,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 2,
      spell_slots_level_7: 1,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "wizard-20",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 20,
    features: [
      {
        index: "signature-spell",
        name: "Signature Spell",
      },
    ],
    abilityScoreBonuses: 5,
    proficiencyBonus: 6,
    classSpecific: {
      arcane_recovery_levels: 10,
    },
    spellcasting: {
      cantrips_known: 5,
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 3,
      spell_slots_level_4: 3,
      spell_slots_level_5: 3,
      spell_slots_level_6: 2,
      spell_slots_level_7: 2,
      spell_slots_level_8: 1,
      spell_slots_level_9: 1,
    },
  },
  {
    sourceIndex: "berserker-3",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 3,
    features: [
      {
        index: "frenzy",
        name: "Frenzy",
      },
    ],
    subclass: {
      index: "berserker",
      name: "Berserker",
    },
  },
  {
    sourceIndex: "berserker-6",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 6,
    features: [
      {
        index: "mindless-rage",
        name: "Mindless Rage",
      },
    ],
    subclass: {
      index: "berserker",
      name: "Berserker",
    },
  },
  {
    sourceIndex: "berserker-10",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 10,
    features: [
      {
        index: "intimidating-presence",
        name: "Intimidating Presence",
      },
    ],
    subclass: {
      index: "berserker",
      name: "Berserker",
    },
  },
  {
    sourceIndex: "berserker-14",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 14,
    features: [
      {
        index: "retaliation",
        name: "Retaliation",
      },
    ],
    subclass: {
      index: "berserker",
      name: "Berserker",
    },
  },
  {
    sourceIndex: "lore-3",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 3,
    features: [
      {
        index: "bonus-proficiencies",
        name: "Bonus Proficiencies",
      },
      {
        index: "cutting-words",
        name: "Cutting Words",
      },
    ],
    subclass: {
      index: "lore",
      name: "Lore",
    },
    subclassSpecific: {
      additional_magical_secrets_max_lvl: 0,
    },
  },
  {
    sourceIndex: "lore-6",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 6,
    features: [
      {
        index: "additional-magical-secrets",
        name: "Additional Magical Secrets",
      },
    ],
    subclass: {
      index: "lore",
      name: "Lore",
    },
    subclassSpecific: {
      additional_magical_secrets_max_lvl: 3,
    },
  },
  {
    sourceIndex: "lore-14",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 14,
    features: [
      {
        index: "peerless-skill",
        name: "Peerless Skill",
      },
    ],
    subclass: {
      index: "lore",
      name: "Lore",
    },
    subclassSpecific: {
      additional_magical_secrets_max_lvl: 3,
    },
  },
  {
    sourceIndex: "life-1",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 1,
    features: [
      {
        index: "bonus-proficiency",
        name: "Bonus Proficiency",
      },
      {
        index: "disciple-of-life",
        name: "Disciple of Life",
      },
    ],
    subclass: {
      index: "life",
      name: "Life",
    },
  },
  {
    sourceIndex: "life-2",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 2,
    features: [
      {
        index: "channel-divinity-preserve-life",
        name: "Channel Divinity: Preserve Life",
      },
    ],
    subclass: {
      index: "life",
      name: "Life",
    },
  },
  {
    sourceIndex: "life-6",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 6,
    features: [
      {
        index: "blessed-healer",
        name: "Blessed Healer",
      },
    ],
    subclass: {
      index: "life",
      name: "Life",
    },
  },
  {
    sourceIndex: "life-8",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 8,
    features: [
      {
        index: "divine-strike",
        name: "Divine Strike",
      },
    ],
    subclass: {
      index: "life",
      name: "Life",
    },
  },
  {
    sourceIndex: "life-17",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 17,
    features: [
      {
        index: "supreme-healing",
        name: "Supreme Healing",
      },
    ],
    subclass: {
      index: "life",
      name: "Life",
    },
  },
  {
    sourceIndex: "land-2",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    features: [
      {
        index: "bonus-cantrip",
        name: "Bonus Cantrip",
      },
      {
        index: "natural-recovery",
        name: "Natural Recovery",
      },
    ],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "land-6",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 6,
    features: [
      {
        index: "druid-lands-stride",
        name: "Land's Stride",
      },
    ],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "land-10",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 10,
    features: [
      {
        index: "natures-ward",
        name: "Nature's Ward",
      },
    ],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "land-14",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 14,
    features: [
      {
        index: "natures-sanctuary",
        name: "Nature's Sanctuary",
      },
    ],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "champion-3",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 3,
    features: [
      {
        index: "improved-critical",
        name: "Improved Critical",
      },
    ],
    subclass: {
      index: "champion",
      name: "Champion",
    },
  },
  {
    sourceIndex: "champion-7",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 7,
    features: [
      {
        index: "remarkable-athlete",
        name: "Remarkable Athlete",
      },
    ],
    subclass: {
      index: "champion",
      name: "Champion",
    },
  },
  {
    sourceIndex: "champion-10",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 10,
    features: [
      {
        index: "additional-fighting-style",
        name: "Additional Fighting Style",
      },
    ],
    subclass: {
      index: "champion",
      name: "Champion",
    },
  },
  {
    sourceIndex: "champion-15",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 15,
    features: [
      {
        index: "superior-critical",
        name: "Superior Critical",
      },
    ],
    subclass: {
      index: "champion",
      name: "Champion",
    },
  },
  {
    sourceIndex: "champion-18",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 18,
    features: [
      {
        index: "survivor",
        name: "Survivor",
      },
    ],
    subclass: {
      index: "champion",
      name: "Champion",
    },
  },
  {
    sourceIndex: "open-hand-3",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 3,
    features: [
      {
        index: "open-hand-technique",
        name: "Open Hand Technique",
      },
    ],
    subclass: {
      index: "open-hand",
      name: "Open Hand",
    },
  },
  {
    sourceIndex: "open-hand-6",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 6,
    features: [
      {
        index: "wholeness-of-body",
        name: "Wholeness of Body",
      },
    ],
    subclass: {
      index: "open-hand",
      name: "Open Hand",
    },
  },
  {
    sourceIndex: "open-hand-11",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 11,
    features: [
      {
        index: "tranquility",
        name: "Tranquility",
      },
    ],
    subclass: {
      index: "open-hand",
      name: "Open Hand",
    },
  },
  {
    sourceIndex: "open-hand-17",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 17,
    features: [
      {
        index: "quivering-palm",
        name: "Quivering Palm",
      },
    ],
    subclass: {
      index: "open-hand",
      name: "Open Hand",
    },
  },
  {
    sourceIndex: "devotion-3",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 3,
    features: [
      {
        index: "channel-divinity-sacred-weapon",
        name: "Channel Divinity: Sacred Weapon",
      },
      {
        index: "channel-divinity-turn-the-unholy",
        name: "Channel Divinity: Turn the Unholy",
      },
    ],
    subclass: {
      index: "devotion",
      name: "Devotion",
    },
  },
  {
    sourceIndex: "devotion-7",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 7,
    features: [
      {
        index: "aura-of-devotion",
        name: "Aura of Devotion",
      },
    ],
    subclass: {
      index: "devotion",
      name: "Devotion",
    },
    subclassSpecific: {
      aura_range: 10,
    },
  },
  {
    sourceIndex: "devotion-15",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 15,
    features: [
      {
        index: "purity-of-spirit",
        name: "Purity of Spirit",
      },
    ],
    subclass: {
      index: "devotion",
      name: "Devotion",
    },
    subclassSpecific: {
      aura_range: 10,
    },
  },
  {
    sourceIndex: "devotion-18",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 18,
    features: [],
    subclass: {
      index: "devotion",
      name: "Devotion",
    },
    subclassSpecific: {
      aura_range: 30,
    },
  },
  {
    sourceIndex: "devotion-20",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 20,
    features: [
      {
        index: "holy-nimbus",
        name: "Holy Nimbus",
      },
    ],
    subclass: {
      index: "devotion",
      name: "Devotion",
    },
    subclassSpecific: {
      aura_range: 30,
    },
  },
  {
    sourceIndex: "hunter-3",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 3,
    features: [
      {
        index: "hunters-prey",
        name: "Hunter's Prey",
      },
    ],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
  },
  {
    sourceIndex: "hunter-7",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 7,
    features: [
      {
        index: "defensive-tactics",
        name: "Defensive Tactics",
      },
    ],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
  },
  {
    sourceIndex: "hunter-11",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 11,
    features: [
      {
        index: "multiattack",
        name: "Multiattack",
      },
    ],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
  },
  {
    sourceIndex: "hunter-15",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 15,
    features: [
      {
        index: "superior-hunters-defense",
        name: "Superior Hunter's Defense",
      },
    ],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
  },
  {
    sourceIndex: "thief-3",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 3,
    features: [
      {
        index: "fast-hands",
        name: "Fast Hands",
      },
      {
        index: "second-story-work",
        name: "Second-Story Work",
      },
    ],
    subclass: {
      index: "thief",
      name: "Thief",
    },
  },
  {
    sourceIndex: "thief-9",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 9,
    features: [
      {
        index: "supreme-sneak",
        name: "Supreme Sneak",
      },
    ],
    subclass: {
      index: "thief",
      name: "Thief",
    },
  },
  {
    sourceIndex: "thief-13",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 13,
    features: [
      {
        index: "use-magic-device",
        name: "Use Magic Device",
      },
    ],
    subclass: {
      index: "thief",
      name: "Thief",
    },
  },
  {
    sourceIndex: "thief-17",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 17,
    features: [
      {
        index: "thiefs-reflexes",
        name: "Thief's Reflexes",
      },
    ],
    subclass: {
      index: "thief",
      name: "Thief",
    },
  },
  {
    sourceIndex: "draconic-1",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    features: [
      {
        index: "dragon-ancestor",
        name: "Dragon Ancestor",
      },
      {
        index: "draconic-resilience",
        name: "Draconic Resilience",
      },
    ],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
  },
  {
    sourceIndex: "draconic-6",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 6,
    features: [
      {
        index: "elemental-affinity",
        name: "Elemental Affinity",
      },
    ],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
  },
  {
    sourceIndex: "draconic-14",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 14,
    features: [
      {
        index: "dragon-wings",
        name: "Dragon Wings",
      },
    ],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
  },
  {
    sourceIndex: "draconic-18",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 18,
    features: [
      {
        index: "draconic-presence",
        name: "Draconic Presence",
      },
    ],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
  },
  {
    sourceIndex: "fiend-1",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 1,
    features: [
      {
        index: "dark-ones-blessing",
        name: "Dark One's Blessing",
      },
    ],
    subclass: {
      index: "fiend",
      name: "Fiend",
    },
  },
  {
    sourceIndex: "fiend-6",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 6,
    features: [
      {
        index: "dark-ones-own-luck",
        name: "Dark One's Own Luck",
      },
    ],
    subclass: {
      index: "fiend",
      name: "Fiend",
    },
  },
  {
    sourceIndex: "fiend-10",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 10,
    features: [
      {
        index: "fiendish-resilience",
        name: "Fiendish Resilience",
      },
    ],
    subclass: {
      index: "fiend",
      name: "Fiend",
    },
  },
  {
    sourceIndex: "fiend-14",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 14,
    features: [
      {
        index: "hurl-through-hell",
        name: "Hurl Through Hell",
      },
    ],
    subclass: {
      index: "fiend",
      name: "Fiend",
    },
  },
  {
    sourceIndex: "evocation-2",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 2,
    features: [
      {
        index: "evocation-savant",
        name: "Evocation Savant",
      },
      {
        index: "sculpt-spells",
        name: "Sculpt Spells",
      },
    ],
    subclass: {
      index: "evocation",
      name: "Evocation",
    },
  },
  {
    sourceIndex: "evocation-6",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 6,
    features: [
      {
        index: "potent-cantrip",
        name: "Potent Cantrip",
      },
    ],
    subclass: {
      index: "evocation",
      name: "Evocation",
    },
  },
  {
    sourceIndex: "evocation-10",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 10,
    features: [
      {
        index: "empowered-evocation",
        name: "Empowered Evocation",
      },
    ],
    subclass: {
      index: "evocation",
      name: "Evocation",
    },
  },
  {
    sourceIndex: "evocation-14",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 14,
    features: [
      {
        index: "overchannel",
        name: "Overchannel",
      },
    ],
    subclass: {
      index: "evocation",
      name: "Evocation",
    },
  },
] as const satisfies ReadonlyArray<SystemClassLevel>;

export const SYSTEM_FEATURES = [
  {
    sourceIndex: "rage",
    name: "Rage",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 1,
    desc: [
      "In battle, you fight with primal ferocity. On your turn, you can enter a rage as a bonus action. While raging, you gain the following benefits if you aren't wearing heavy armor:",
      "- You have advantage on Strength checks and Strength saving throws.",
      "- When you make a melee weapon Attack using Strength, you gain a +2 bonus to the damage roll. This bonus increases as you level.",
      "- You have Resistance to bludgeoning, piercing, and slashing damage.",
      "If you are able to cast Spells, you can't cast them or concentrate on them while raging.",
      "Your rage lasts for 1 minute. It ends early if you are knocked Unconscious or if Your Turn ends and you haven't attacked a hostile creature since your last turn or taken damage since then. You can also end your rage on Your Turn as a Bonus Action.",
      "Once you have raged the maximum number of times for your barbarian level, you must finish a Long Rest before you can rage again. You may rage 2 times at 1st level, 3 at 3rd, 4 at 6th, 5 at 12th, and 6 at 17th.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "barbarian-unarmored-defense",
    name: "Unarmored Defense",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 1,
    desc: [
      "While you are not wearing any armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "reckless-attack",
    name: "Reckless Attack",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 2,
    desc: [
      "Starting at 2nd level, you can throw aside all concern for defense to attack with fierce desperation. When you make your first attack on your turn, you can decide to attack recklessly. Doing so gives you advantage on melee weapon attack rolls using Strength during this turn, but attack rolls against you have advantage until your next turn.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "danger-sense",
    name: "Danger Sense",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 2,
    desc: [
      "At 2nd level, you gain an uncanny sense of when things nearby aren't as they should be, giving you an edge when you dodge away from danger. You have advantage on Dexterity saving throws against effects that you can see, such as traps and spells. To gain this benefit, you can't be blinded, deafened, or incapacitated.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "primal-path",
    name: "Primal Path",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 3,
    desc: [
      "At 3rd level, you choose a path that shapes the nature of your rage. Choose the Path of the Berserker or the Path of the Totem Warrior, both detailed at the end of the class description. Your choice grants you features at 3rd level and again at 6th, 10th, and 14th levels.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "frenzy",
    name: "Frenzy",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 3,
    desc: [
      "Starting when you choose this path at 3rd level, you can go into a frenzy when you rage. If you do so, for the duration of your rage you can make a single melee weapon attack as a bonus action on each of your turns after this one. When your rage ends, you suffer one level of exhaustion (as described in appendix A).",
    ],
    prerequisites: [],
    subclass: {
      index: "berserker",
      name: "Berserker",
    },
  },
  {
    sourceIndex: "barbarian-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "barbarian-extra-attack",
    name: "Extra Attack",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 5,
    desc: [
      "Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "fast-movement",
    name: "Fast Movement",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 5,
    desc: [
      "Starting at 5th level, your speed increases by 10 feet while you aren't wearing heavy armor.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "mindless-rage",
    name: "Mindless Rage",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 6,
    desc: [
      "Beginning at 6th level, you can't be charmed or frightened while raging. If you are charmed or frightened when you enter your rage, the effect is suspended for the duration of the rage.",
    ],
    prerequisites: [],
    subclass: {
      index: "berserker",
      name: "Berserker",
    },
  },
  {
    sourceIndex: "primal-path-improvement-1",
    name: "Path feature",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 6,
    desc: [
      "At 3rd level, you choose a path that shapes the nature of your rage. Choose the Path of the Berserker or the Path of the Totem Warrior, both detailed at the end of the class description. Your choice grants you features at 3rd level and again at 6th, 10th, and 14th levels.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "feral-instinct",
    name: "Feral Instinct",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 7,
    desc: [
      "By 7th level, your instincts are so honed that you have advantage on initiative rolls.",
      "Additionally, if you are surprised at the beginning of combat and aren't incapacitated, you can act normally on your first turn, but only if you enter your rage before doing anything else on that turn.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "barbarian-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "brutal-critical-1-die",
    name: "Brutal Critical (1 die)",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 9,
    desc: [
      "Beginning at 9th level, you can roll one additional weapon damage die when determining the extra damage for a critical hit with a melee attack. This increases to two additional dice at 13th level and three additional dice at 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "intimidating-presence",
    name: "Intimidating Presence",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 10,
    desc: [
      "Beginning at 10th level, you can use your action to frighten someone with your menacing presence. When you do so, choose one creature that you can see within 30 feet of you. If the creature can see or hear you, it must succeed on a Wisdom saving throw (DC equal to 8 + your proficiency bonus + your Charisma modifier) or be frightened of you until the end of your next turn. On subsequent turns, you can use your action to extend the duration of this effect on the frightened creature until the end of your next turn. This effect ends if the creature ends its turn out of line of sight or more than 60 feet away from you.",
      " If the creature succeeds on its saving throw, you can't use this feature on that creature again for 24 hours.",
    ],
    prerequisites: [],
    subclass: {
      index: "berserker",
      name: "Berserker",
    },
  },
  {
    sourceIndex: "primal-path-improvement-2",
    name: "Path feature",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 10,
    desc: [
      "At 3rd level, you choose a path that shapes the nature of your rage. Choose the Path of the Berserker or the Path of the Totem Warrior, both detailed at the end of the class description. Your choice grants you features at 3rd level and again at 6th, 10th, and 14th levels.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "relentless-rage",
    name: "Relentless Rage",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 11,
    desc: [
      "Starting at 11th level, your rage can keep you fighting despite grievous wounds. If you drop to 0 hit points while you're raging and don't die outright, you can make a DC 10 Constitution saving throw. If you succeed, you drop to 1 hit point instead.",
      "Each time you use this feature after the first, the DC increases by 5. When you finish a short or long rest, the DC resets to 10.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "barbarian-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "brutal-critical-2-dice",
    name: "Brutal Critical (2 dice)",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 13,
    desc: [
      "Beginning at 9th level, you can roll one additional weapon damage die when determining the extra damage for a critical hit with a melee attack. This increases to two additional dice at 13th level and three additional dice at 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "retaliation",
    name: "Retaliation",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 14,
    desc: [
      "Starting at 14th level, when you take damage from a creature that is within 5 feet of you, you can use your reaction to make a melee weapon Attack against that creature.",
    ],
    prerequisites: [],
    subclass: {
      index: "berserker",
      name: "Berserker",
    },
  },
  {
    sourceIndex: "primal-path-improvement-3",
    name: "Path feature",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 14,
    desc: [
      "At 3rd level, you choose a path that shapes the nature of your rage. Choose the Path of the Berserker or the Path of the Totem Warrior, both detailed at the end of the class description. Your choice grants you features at 3rd level and again at 6th, 10th, and 14th levels.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "persistent-rage",
    name: "Persistent Rage",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 15,
    desc: [
      "Beginning at 15th level, your rage is so fierce that it ends early only if you fall unconscious or if you choose to end it.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "barbarian-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "brutal-critical-3-dice",
    name: "Brutal Critical (3 dice)",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 17,
    desc: [
      "Beginning at 9th level, you can roll one additional weapon damage die when determining the extra damage for a critical hit with a melee attack. This increases to two additional dice at 13th level and three additional dice at 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "indomitable-might",
    name: "Indomitable Might",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 18,
    desc: [
      "Beginning at 18th level, if your total for a Strength check is less than your Strength score, you can use that score in place of the total.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "barbarian-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "primal-champion",
    name: "Primal Champion",
    class: {
      index: "barbarian",
      name: "Barbarian",
    },
    level: 20,
    desc: [
      "At 20th level, you embody the power of the wilds. Your Strength and Constitution scores increase by 4. Your maximum for those scores is now 24.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "spellcasting-bard",
    name: "Spellcasting: Bard",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 1,
    desc: [
      "You have learned to untangle and reshape the fabric of reality in harmony with your wishes and music. Your spells are part of your vast repertoire, magic that you can tune to different situations.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bardic-inspiration-d6",
    name: "Bardic Inspiration (d6)",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 1,
    desc: [
      "You can inspire others through stirring words or music. To do so, you use a bonus action on your turn to choose one creature other than yourself within 60 feet of you who can hear you. That creature gains one Bardic Inspiration die, a d6. Once within the next 10 minutes, the creature can roll the die and add the number rolled to one ability check, attack roll, or saving throw it makes. The creature can wait until after it rolls the d20 before deciding to use the Bardic Inspiration die, but must decide before the GM says whether the roll succeeds or fails. Once the Bardic Inspiration die is rolled, it is lost. A creature can have only one Bardic Inspiration die at a time.",
      "You can use this feature a number of times equal to your Charisma modifier (a minimum of once). You regain any expended uses when you finish a long rest. ",
      "Your Bardic Inspiration die changes when you reach certain levels in this class. The die becomes a d8 at 5th level, a d10 at 10th level, and a d12 at 15th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "jack-of-all-trades",
    name: "Jack of All Trades",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 2,
    desc: [
      "Starting at 2nd level, you can add half your proficiency bonus, rounded down, to any ability check you make that doesn't already include your proficiency bonus.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "song-of-rest-d6",
    name: "Song of Rest (d6)",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 2,
    desc: [
      "Beginning at 2nd level, you can use soothing music or oration to help revitalize your wounded allies during a short rest. If you or any friendly creatures who can hear your performance regain hit points at the end of the short rest by spending one or more Hit Dice, each of those creatures regains an extra 1d6 hit points. ",
      "The extra hit points increase when you reach certain levels in this class: to 1d8 at 9th level, to 1d10 at 13th level, and to 1d12 at 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bard-college",
    name: "Bard College",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 3,
    desc: [
      "At 3rd level, you delve into the advanced techniques of a bard college of your choice, such as the College of Lore. Your choice grants you features at 3rd level and again at 6th and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bonus-proficiencies",
    name: "Bonus Proficiencies",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 3,
    desc: [
      "When you join the College of Lore at 3rd level, you gain proficiency with three skills of your choice.",
    ],
    prerequisites: [],
    subclass: {
      index: "lore",
      name: "Lore",
    },
  },
  {
    sourceIndex: "cutting-words",
    name: "Cutting Words",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 3,
    desc: [
      "Also at 3rd level, you learn how to use your wit to distract, confuse, and otherwise sap the confidence and competence of others.",
      "When a creature that you can see within 60 feet of you makes an attack roll, an ability check, or a damage roll, you can use your reaction to expend one of your uses of Bardic Inspiration, rolling a Bardic Inspiration die and subtracting the number rolled from the creature's roll.",
      "You can choose to use this feature after the creature makes its roll, but before the GM determines whether the attack roll or ability check succeeds or fails, or before the creature deals its damage. The creature is immune if it can't hear you or if it's immune to being charmed.",
    ],
    prerequisites: [],
    subclass: {
      index: "lore",
      name: "Lore",
    },
  },
  {
    sourceIndex: "bard-expertise-1",
    name: "Expertise",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 3,
    desc: [
      "At 3rd level, choose two of your skill proficiencies. Your proficiency bonus is doubled for any ability check you make that uses either of the chosen proficiencies. At 10th level, you can choose another two skill proficiencies to gain this benefit.",
    ],
    prerequisites: [],
    featureSpecific: {
      expertise_options: {
        choose: 2,
        type: "proficiency",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-acrobatics",
                name: "Skill: Acrobatics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-animal-handling",
                name: "Skill: Animal Handling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-arcana",
                name: "Skill: Arcana",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-athletics",
                name: "Skill: Athletics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-deception",
                name: "Skill: Deception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-history",
                name: "Skill: History",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-intimidation",
                name: "Skill: Intimidation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-investigation",
                name: "Skill: Investigation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-medicine",
                name: "Skill: Medicine",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-nature",
                name: "Skill: Nature",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-perception",
                name: "Skill: Perception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-performance",
                name: "Skill: Performance",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-persuasion",
                name: "Skill: Persuasion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-religion",
                name: "Skill: Religion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-sleight-of-hand",
                name: "Skill: Sleight of Hand",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-stealth",
                name: "Skill: Stealth",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-survival",
                name: "Skill: Survival",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "bard-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bardic-inspiration-d8",
    name: "Bardic Inspiration (d8)",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 5,
    desc: [
      "You can inspire others through stirring words or music. To do so, you use a bonus action on your turn to choose one creature other than yourself within 60 feet of you who can hear you. That creature gains one Bardic Inspiration die, a d6. Once within the next 10 minutes, the creature can roll the die and add the number rolled to one ability check, attack roll, or saving throw it makes. The creature can wait until after it rolls the d20 before deciding to use the Bardic Inspiration die, but must decide before the GM says whether the roll succeeds or fails. Once the Bardic Inspiration die is rolled, it is lost. A creature can have only one Bardic Inspiration die at a time.",
      "You can use this feature a number of times equal to your Charisma modifier (a minimum of once). You regain any expended uses when you finish a long rest. ",
      "Your Bardic Inspiration die changes when you reach certain levels in this class. The die becomes a d8 at 5th level, a d10 at 10th level, and a d12 at 15th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "font-of-inspiration",
    name: "Font of Inspiration",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 5,
    desc: [
      "Beginning when you reach 5th level, you regain all of your expended uses of Bardic Inspiration when you finish a short or long rest.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "countercharm",
    name: "Countercharm",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 6,
    desc: [
      "At 6th level, you gain the ability to use musical notes or words of power to disrupt mind-influencing effects. As an action, you can start a performance that lasts until the end of your next turn. During that time, you and any friendly creatures within 30 feet of you have advantage on saving throws against being frightened or charmed. A creature must be able to hear you to gain this benefit. The performance ends early if you are incapacitated or silenced or if you voluntarily end it (no action required).",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bard-college-improvement-1",
    name: "Bard College feature",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 6,
    desc: [
      "At 3rd level, you delve into the advanced techniques of a bard college of your choice, such as the College of Lore. Your choice grants you features at 3rd level and again at 6th and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "additional-magical-secrets",
    name: "Additional Magical Secrets",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 6,
    desc: [
      "At 6th level, you learn two spells of your choice from any class. A spell you choose must be of a level you can cast, as shown on the Bard table, or a cantrip. The chosen spells count as bard spells for you but don't count against the number of bard spells you know.",
    ],
    prerequisites: [],
    subclass: {
      index: "lore",
      name: "Lore",
    },
  },
  {
    sourceIndex: "bard-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "song-of-rest-d8",
    name: "Song of Rest (d8)",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 9,
    desc: [
      "Beginning at 2nd level, you can use soothing music or oration to help revitalize your wounded allies during a short rest. If you or any friendly creatures who can hear your performance regain hit points at the end of the short rest by spending one or more Hit Dice, each of those creatures regains an extra 1d6 hit points. ",
      "The extra hit points increase when you reach certain levels in this class: to 1d8 at 9th level, to 1d10 at 13th level, and to 1d12 at 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bardic-inspiration-d10",
    name: "Bardic Inspiration (d10)",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 10,
    desc: [
      "You can inspire others through stirring words or music. To do so, you use a bonus action on your turn to choose one creature other than yourself within 60 feet of you who can hear you. That creature gains one Bardic Inspiration die, a d6. Once within the next 10 minutes, the creature can roll the die and add the number rolled to one ability check, attack roll, or saving throw it makes. The creature can wait until after it rolls the d20 before deciding to use the Bardic Inspiration die, but must decide before the GM says whether the roll succeeds or fails. Once the Bardic Inspiration die is rolled, it is lost. A creature can have only one Bardic Inspiration die at a time.",
      "You can use this feature a number of times equal to your Charisma modifier (a minimum of once). You regain any expended uses when you finish a long rest. ",
      "Your Bardic Inspiration die changes when you reach certain levels in this class. The die becomes a d8 at 5th level, a d10 at 10th level, and a d12 at 15th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bard-expertise-2",
    name: "Expertise",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 10,
    desc: [
      "At 3rd level, choose two of your skill proficiencies. Your proficiency bonus is doubled for any ability check you make that uses either of the chosen proficiencies. At 10th level, you can choose another two skill proficiencies to gain this benefit.",
    ],
    prerequisites: [],
    featureSpecific: {
      expertise_options: {
        choose: 2,
        type: "proficiency",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-acrobatics",
                name: "Skill: Acrobatics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-animal-handling",
                name: "Skill: Animal Handling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-arcana",
                name: "Skill: Arcana",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-athletics",
                name: "Skill: Athletics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-deception",
                name: "Skill: Deception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-history",
                name: "Skill: History",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-intimidation",
                name: "Skill: Intimidation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-investigation",
                name: "Skill: Investigation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-medicine",
                name: "Skill: Medicine",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-nature",
                name: "Skill: Nature",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-perception",
                name: "Skill: Perception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-performance",
                name: "Skill: Performance",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-persuasion",
                name: "Skill: Persuasion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-religion",
                name: "Skill: Religion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-sleight-of-hand",
                name: "Skill: Sleight of Hand",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-stealth",
                name: "Skill: Stealth",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-survival",
                name: "Skill: Survival",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "magical-secrets-1",
    name: "Magical Secrets",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 10,
    desc: [
      "By 10th level, you have plundered magical knowledge from a wide spectrum of disciplines. Choose two spells from any class, including this one. A spell you choose must be of a level you can cast, as shown on the Bard table, or a cantrip. ",
      "The chosen spells count as bard spells for you and are included in the number in the Spells Known column of the Bard table. ",
      "You learn two additional spells from any class at 14th level and again at 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bard-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "song-of-rest-d10",
    name: "Song of Rest (d10)",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 13,
    desc: [
      "Beginning at 2nd level, you can use soothing music or oration to help revitalize your wounded allies during a short rest. If you or any friendly creatures who can hear your performance regain hit points at the end of the short rest by spending one or more Hit Dice, each of those creatures regains an extra 1d6 hit points. ",
      "The extra hit points increase when you reach certain levels in this class: to 1d8 at 9th level, to 1d10 at 13th level, and to 1d12 at 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "magical-secrets-2",
    name: "Magical Secrets",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 14,
    desc: [
      "By 10th level, you have plundered magical knowledge from a wide spectrum of disciplines. Choose two spells from any class, including this one. A spell you choose must be of a level you can cast, as shown on the Bard table, or a cantrip. ",
      "The chosen spells count as bard spells for you and are included in the number in the Spells Known column of the Bard table. ",
      "You learn two additional spells from any class at 14th level and again at 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bard-college-improvement-2",
    name: "Bard College feature",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 14,
    desc: [
      "At 3rd level, you delve into the advanced techniques of a bard college of your choice, such as the College of Lore. Your choice grants you features at 3rd level and again at 6th and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "peerless-skill",
    name: "Peerless Skill",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 14,
    desc: [
      "Starting at 14th level, when you make an ability check, you can expend one use of Bardic Inspiration. Roll a Bardic Inspiration die and add the number rolled to your ability check. You can choose to do so after you roll the die for the ability check, but before the GM tells you whether you succeed or fail.",
    ],
    prerequisites: [],
    subclass: {
      index: "lore",
      name: "Lore",
    },
  },
  {
    sourceIndex: "bardic-inspiration-d12",
    name: "Bardic Inspiration (d12)",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 15,
    desc: [
      "You can inspire others through stirring words or music. To do so, you use a bonus action on your turn to choose one creature other than yourself within 60 feet of you who can hear you. That creature gains one Bardic Inspiration die, a d6. Once within the next 10 minutes, the creature can roll the die and add the number rolled to one ability check, attack roll, or saving throw it makes. The creature can wait until after it rolls the d20 before deciding to use the Bardic Inspiration die, but must decide before the GM says whether the roll succeeds or fails. Once the Bardic Inspiration die is rolled, it is lost. A creature can have only one Bardic Inspiration die at a time.",
      "You can use this feature a number of times equal to your Charisma modifier (a minimum of once). You regain any expended uses when you finish a long rest. ",
      "Your Bardic Inspiration die changes when you reach certain levels in this class. The die becomes a d8 at 5th level, a d10 at 10th level, and a d12 at 15th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bard-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "song-of-rest-d12",
    name: "Song of Rest (d12)",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 17,
    desc: [
      "Beginning at 2nd level, you can use soothing music or oration to help revitalize your wounded allies during a short rest. If you or any friendly creatures who can hear your performance regain hit points at the end of the short rest by spending one or more Hit Dice, each of those creatures regains an extra 1d6 hit points. ",
      "The extra hit points increase when you reach certain levels in this class: to 1d8 at 9th level, to 1d10 at 13th level, and to 1d12 at 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "magical-secrets-3",
    name: "Magical Secrets",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 18,
    desc: [
      "By 10th level, you have plundered magical knowledge from a wide spectrum of disciplines. Choose two spells from any class, including this one. A spell you choose must be of a level you can cast, as shown on the Bard table, or a cantrip. ",
      "The chosen spells count as bard spells for you and are included in the number in the Spells Known column of the Bard table. ",
      "You learn two additional spells from any class at 14th level and again at 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bard-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "superior-inspiration",
    name: "Superior Inspiration",
    class: {
      index: "bard",
      name: "Bard",
    },
    level: 20,
    desc: [
      "At 20th level, when you roll initiative and have no uses of Bardic Inspiration left, you regain one use.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "spellcasting-cleric",
    name: "Spellcasting: Cleric",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 1,
    desc: ["As a conduit for divine power, you can cast cleric spells."],
    prerequisites: [],
  },
  {
    sourceIndex: "divine-domain",
    name: "Divine Domain",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 1,
    desc: [
      "Choose one domain related to your deity, such as Knowledge, Life, Light, Nature, Tempest, Trickery, or War. Only the Life domain is detailed in the Open Game Licensed SRD. Additional Domains are described in the official rulebooks or products from other publishers.",
      "Your domain grants you domain spells and other features when you choose it at 1st level. It also grants you additional ways to use Channel Divinity when you gain that feature at 2nd level, and additional benefits at 6th, 8th, and 17th levels.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "domain-spells-1",
    name: "Domain Spells",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 1,
    desc: [
      "Each domain has a list of spells--its domain spells--that you gain at the cleric levels noted in the domain description. Once you gain a domain spell, you always have it prepared, and it doesn't count against the number of spells you can prepare each day.",
      "If you have a domain spell that doesn't appear on the cleric spell list, the spell is nonetheless a cleric spell for you.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "bonus-proficiency",
    name: "Bonus Proficiency",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 1,
    desc: ["When you choose this domain at 1st level, you gain proficiency with heavy armor."],
    prerequisites: [],
    subclass: {
      index: "life",
      name: "Life",
    },
  },
  {
    sourceIndex: "disciple-of-life",
    name: "Disciple of Life",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 1,
    desc: [
      "Also starting at 1st level, your healing spells are more effective. Whenever you use a spell of 1st level or higher to restore hit points to a creature, the creature regains additional hit points equal to 2 + the spell's level.",
    ],
    prerequisites: [],
    subclass: {
      index: "life",
      name: "Life",
    },
  },
  {
    sourceIndex: "channel-divinity-1-rest",
    name: "Channel Divinity (1/rest)",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 2,
    desc: [
      "At 2nd level, you gain the ability to channel divine energy directly from your deity, using that energy to fuel magical effects. You start with two such effects: Turn Undead and an effect determined by your domain. Some domains grant you additional effects as you advance in levels, as noted in the domain description.",
      "When you use your Channel Divinity, you choose which effect to create. You must then finish a short or long rest to use your Channel Divinity again.",
      "Some Channel Divinity effects require saving throws. When you use such an effect from this class, the DC equals your cleric spell save DC.",
      "Beginning at 6th level, you can use your Channel Divinity twice between rests, and beginning at 18th level, you can use it three times between rests. When you finish a short or long rest, you regain your expended uses.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "channel-divinity-turn-undead",
    name: "Channel Divinity: Turn Undead",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 2,
    desc: [
      "As an action, you present your holy symbol and speak a prayer censuring the undead. Each undead that can see or hear you within 30 feet of you must make a Wisdom saving throw. If the creature fails its saving throw, it is turned for 1 minute or until it takes any damage.",
      "A turned creature must spend its turns trying to move as far away from you as it can, and it can't willingly move to a space within 30 feet of you. It also can't take reactions. For its action, it can use only the Dash action or try to escape from an effect that prevents it from moving. If there's nowhere to move, the creature can use the Dodge action.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "divine-domain-improvement-1",
    name: "Divine Domain feature",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 2,
    desc: [
      "Choose one domain related to your deity, such as Knowledge, Life, Light, Nature, Tempest, Trickery, or War. Only the Life domain is detailed in the Open Game Licensed SRD. Additional Domains are described in the official rulebooks or products from other publishers.",
      "Your domain grants you domain spells and other features when you choose it at 1st level. It also grants you additional ways to use Channel Divinity when you gain that feature at 2nd level, and additional benefits at 6th, 8th, and 17th levels.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "channel-divinity-preserve-life",
    name: "Channel Divinity: Preserve Life",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 2,
    desc: [
      "Starting at 2nd level, you can use your Channel Divinity to heal the badly injured.",
      "As an action, you present your holy symbol and evoke healing energy that can restore a number of hit points equal to five times your cleric level.",
      "Choose any creatures within 30 feet of you, and divide those hit points among them. This feature can restore a creature to no more than half of its hit point maximum. You can't use this feature on an undead or a construct.",
    ],
    prerequisites: [],
    subclass: {
      index: "life",
      name: "Life",
    },
  },
  {
    sourceIndex: "domain-spells-2",
    name: "Domain Spells",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 3,
    desc: [
      "Each domain has a list of spells--its domain spells--that you gain at the cleric levels noted in the domain description. Once you gain a domain spell, you always have it prepared, and it doesn't count against the number of spells you can prepare each day.",
      "If you have a domain spell that doesn't appear on the cleric spell list, the spell is nonetheless a cleric spell for you.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "cleric-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "domain-spells-3",
    name: "Domain Spells",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 5,
    desc: [
      "Each domain has a list of spells--its domain spells--that you gain at the cleric levels noted in the domain description. Once you gain a domain spell, you always have it prepared, and it doesn't count against the number of spells you can prepare each day.",
      "If you have a domain spell that doesn't appear on the cleric spell list, the spell is nonetheless a cleric spell for you.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "destroy-undead-cr-1-2-or-below",
    name: "Destroy Undead (CR 1/2 or below)",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 5,
    desc: [
      "Starting at 5th level, when an undead fails its saving throw against your Turn Undead feature, the creature is instantly destroyed if its challenge rating is at or below a certain threshold.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "channel-divinity-2-rest",
    name: "Channel Divinity (2/rest)",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 6,
    desc: [
      "Beginning at 6th level, you can use your Channel Divinity twice between rests, and beginning at 18th level, you can use it three times between rests. When you finish a short or long rest, you regain your expended uses.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "divine-domain-improvement-2",
    name: "Divine Domain feature",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 6,
    desc: [
      "Choose one domain related to your deity, such as Knowledge, Life, Light, Nature, Tempest, Trickery, or War. Only the Life domain is detailed in the Open Game Licensed SRD. Additional Domains are described in the official rulebooks or products from other publishers.",
      "Your domain grants you domain spells and other features when you choose it at 1st level. It also grants you additional ways to use Channel Divinity when you gain that feature at 2nd level, and additional benefits at 6th, 8th, and 17th levels.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "blessed-healer",
    name: "Blessed Healer",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 6,
    desc: [
      "Beginning at 6th level, the healing spells you cast on others heal you as well. When you cast a spell of 1st level or higher that restores hit points to a creature other than you, you regain hit points equal to 2 + the spell's level.",
    ],
    prerequisites: [],
    subclass: {
      index: "life",
      name: "Life",
    },
  },
  {
    sourceIndex: "domain-spells-4",
    name: "Domain Spells",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 7,
    desc: [
      "Each domain has a list of spells--its domain spells--that you gain at the cleric levels noted in the domain description. Once you gain a domain spell, you always have it prepared, and it doesn't count against the number of spells you can prepare each day.",
      "If you have a domain spell that doesn't appear on the cleric spell list, the spell is nonetheless a cleric spell for you.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "cleric-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "destroy-undead-cr-1-or-below",
    name: "Destroy Undead (CR 1 or below)",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 8,
    desc: [
      "Starting at 5th level, when an undead fails its saving throw against your Turn Undead feature, the creature is instantly destroyed if its challenge rating is at or below a certain threshold.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "divine-domain-improvement-3",
    name: "Divine Domain feature",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 8,
    desc: [
      "Choose one domain related to your deity, such as Knowledge, Life, Light, Nature, Tempest, Trickery, or War. Only the Life domain is detailed in the Open Game Licensed SRD. Additional Domains are described in the official rulebooks or products from other publishers.",
      "Your domain grants you domain spells and other features when you choose it at 1st level. It also grants you additional ways to use Channel Divinity when you gain that feature at 2nd level, and additional benefits at 6th, 8th, and 17th levels.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "divine-strike",
    name: "Divine Strike",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 8,
    desc: [
      "At 8th level, you gain the ability to infuse your weapon strikes with divine energy. Once on each of your turns when you hit a creature with a weapon attack, you can cause the attack to deal an extra 1d8 radiant damage to the target. When you reach 14th level, the extra damage increases to 2d8.",
    ],
    prerequisites: [],
    subclass: {
      index: "life",
      name: "Life",
    },
  },
  {
    sourceIndex: "domain-spells-5",
    name: "Domain Spells",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 9,
    desc: [
      "Each domain has a list of spells--its domain spells--that you gain at the cleric levels noted in the domain description. Once you gain a domain spell, you always have it prepared, and it doesn't count against the number of spells you can prepare each day.",
      "If you have a domain spell that doesn't appear on the cleric spell list, the spell is nonetheless a cleric spell for you.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "divine-intervention",
    name: "Divine Intervention",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 10,
    desc: [
      "Beginning at 10th level, you can call on your deity to intervene on your behalf when your need is great.",
      "Imploring your deity's aid requires you to use your action. Describe the assistance you seek, and roll percentile dice. If you roll a number equal to or lower than your cleric level, your deity intervenes. The GM chooses the nature of the intervention; the effect of any cleric spell or cleric domain spell would be appropriate.",
      "If your deity intervenes, you can't use this feature again for 7 days. Otherwise, you can use it again after you finish a long rest.",
      "At 20th level, your call for intervention succeeds automatically, no roll required.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "destroy-undead-cr-2-or-below",
    name: "Destroy Undead (CR 2 or below)",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 11,
    desc: [
      "Starting at 5th level, when an undead fails its saving throw against your Turn Undead feature, the creature is instantly destroyed if its challenge rating is at or below a certain threshold.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "cleric-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "destroy-undead-cr-3-or-below",
    name: "Destroy Undead (CR 3 or below)",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 14,
    desc: [
      "Starting at 5th level, when an undead fails its saving throw against your Turn Undead feature, the creature is instantly destroyed if its challenge rating is at or below a certain threshold.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "cleric-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "destroy-undead-cr-4-or-below",
    name: "Destroy Undead (CR 4 or below)",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 17,
    desc: [
      "Starting at 5th level, when an undead fails its saving throw against your Turn Undead feature, the creature is instantly destroyed if its challenge rating is at or below a certain threshold.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "divine-domain-improvement-4",
    name: "Divine Domain feature",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 17,
    desc: [
      "Choose one domain related to your deity, such as Knowledge, Life, Light, Nature, Tempest, Trickery, or War. Only the Life domain is detailed in the Open Game Licensed SRD. Additional Domains are described in the official rulebooks or products from other publishers.",
      "Your domain grants you domain spells and other features when you choose it at 1st level. It also grants you additional ways to use Channel Divinity when you gain that feature at 2nd level, and additional benefits at 6th, 8th, and 17th levels.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "supreme-healing",
    name: "Supreme Healing",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 17,
    desc: [
      "Starting at 17th level, when you would normally roll one or more dice to restore hit points with a spell, you instead use the highest number possible for each die. For example, instead of restoring 2d6 hit points to a creature, you restore 12.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "channel-divinity-3-rest",
    name: "Channel Divinity (3/rest)",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 18,
    desc: [
      "Beginning at 6th level, you can use your Channel Divinity twice between rests, and beginning at 18th level, you can use it three times between rests. When you finish a short or long rest, you regain your expended uses.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "cleric-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "divine-intervention-improvement",
    name: "Divine Intervention Improvement",
    class: {
      index: "cleric",
      name: "Cleric",
    },
    level: 20,
    desc: ["At 20th level, your call for intervention succeeds automatically, no roll required."],
    prerequisites: [],
  },
  {
    sourceIndex: "spellcasting-druid",
    name: "Spellcasting: Druid",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 1,
    desc: [
      "Drawing on the divine essence of nature itself, you can cast spells to shape that essence to your will.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "druidic",
    name: "Druidic",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 1,
    desc: [
      "You know Druidic, the secret language of druids. You can speak the language and use it to leave hidden messages. You and others who know this language automatically spot such a message. Others spot the message's presence with a successful DC 15 Wisdom (Perception) check but can't decipher it without magic.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "wild-shape-cr-1-4-or-below-no-flying-or-swim-speed",
    name: "Wild Shape (CR 1/4 or below, no flying or swim speed)",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "Starting at 2nd level, you can use your action to magically assume the shape of a beast that you have seen before. You can use this feature twice. You regain expended uses when you finish a short or long rest.",
      "Your druid level determines the beasts you can transform into, as shown in the Beast Shapes table. At 2nd level, for example, you can transform into any beast that has a challenge rating of 1/4 or lower that doesn't have a flying or swimming speed.",
      "You can stay in a beast shape for a number of hours equal to half your druid level (rounded down). You then revert to your normal form unless you expend another use of this feature. You can revert to your normal form earlier by using a bonus action on your turn. You automatically revert if you fall unconscious, drop to 0 hit points, or die.",
      "While you are transformed, the following rules apply:",
      "- Your game statistics are replaced by the statistics of the beast, but you retain your alignment, personality, and Intelligence, Wisdom, and Charisma scores. You also retain all of your skill and saving throw proficiencies, in addition to gaining those of the creature. If the creature has the same proficiency as you and the bonus in its stat block is higher than yours, use the creature's bonus instead of yours. If the creature has any legendary or lair actions, you can't use them.",
      "- When you transform, you assume the beast's hit points and Hit Dice. When you revert to your normal form, you return to the number of hit points you had before you transformed. However, if you revert as a result of dropping to 0 hit points, any excess damage carries over to your normal form. For example, if you take 10 damage in animal form and have only 1 hit point left, you revert and take 9 damage. As long as the excess damage doesn't reduce your normal form to 0 hit points, you aren't knocked unconscious.",
      "- You can't cast spells, and your ability to speak or take any action that requires hands is limited to the capabilities of your beast form. Transforming doesn't break your concentration on a spell you've already cast, however, or prevent you from taking actions that are part of a spell, such as call lightning, that you've already cast.",
      "- You retain the benefit of any features from your class, race, or other source and can use them if the new form is physically capable of doing so. However, you can't use any of your special senses, such as darkvision, unless your new form also has that sense.",
      "- You choose whether your equipment falls to the ground in your space, merges into your new form, or is worn by it. Worn equipment functions as normal, but the GM decides whether it is practical for the new form to wear a piece of equipment, based on the creature's shape and size. Your equipment doesn't change size or shape to match the new form, and any equipment that the new form can't wear must either fall to the ground or merge with it. Equipment that merges with the form has no effect until you leave the form.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "druid-circle",
    name: "Druid Circle",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "At 2nd level, you choose to identify with a circle of druids, such as the Circle of the Land. Your choice grants you features at 2nd level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "circle-of-the-land",
    name: "Circle of the Land",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "The Circle of the Land is made up of mystics and sages who safeguard ancient knowledge and rites through a vast oral tradition. These druids meet within sacred circles of trees or standing stones to whisper primal secrets in Druidic. The circle's wisest members preside as the chief priests of communities that hold to the Old Faith and serve as advisors to the rulers of those folk. As a member of this circle, your magic is influenced by the land where you were initiated into the circle's mysterious rites.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "circle-of-the-land-arctic",
                name: "Circle of the Land: Arctic",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "circle-of-the-land-coast",
                name: "Circle of the Land: Coast",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "circle-of-the-land-desert",
                name: "Circle of the Land: Desert",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "circle-of-the-land-forest",
                name: "Circle of the Land: Forest",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "circle-of-the-land-grassland",
                name: "Circle of the Land: Grassland",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "circle-of-the-land-mountain",
                name: "Circle of the Land: Mountain",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "circle-of-the-land-swamp",
                name: "Circle of the Land: Swamp",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "circle-of-the-land-arctic",
    name: "Circle of the Land: Arctic",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "The Circle of the Land is made up of mystics and sages who safeguard ancient knowledge and rites through a vast oral tradition. These druids meet within sacred circles of trees or standing stones to whisper primal secrets in Druidic. The circle's wisest members preside as the chief priests of communities that hold to the Old Faith and serve as advisors to the rulers of those folk. As a member of this circle, your magic is influenced by the land where you were initiated into the circle's mysterious rites.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
    parent: {
      index: "circle-of-the-land",
      name: "Circle of the Land",
    },
  },
  {
    sourceIndex: "circle-of-the-land-coast",
    name: "Circle of the Land: Coast",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "The Circle of the Land is made up of mystics and sages who safeguard ancient knowledge and rites through a vast oral tradition. These druids meet within sacred circles of trees or standing stones to whisper primal secrets in Druidic. The circle's wisest members preside as the chief priests of communities that hold to the Old Faith and serve as advisors to the rulers of those folk. As a member of this circle, your magic is influenced by the land where you were initiated into the circle's mysterious rites.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
    parent: {
      index: "circle-of-the-land",
      name: "Circle of the Land",
    },
  },
  {
    sourceIndex: "circle-of-the-land-desert",
    name: "Circle of the Land: Desert",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "The Circle of the Land is made up of mystics and sages who safeguard ancient knowledge and rites through a vast oral tradition. These druids meet within sacred circles of trees or standing stones to whisper primal secrets in Druidic. The circle's wisest members preside as the chief priests of communities that hold to the Old Faith and serve as advisors to the rulers of those folk. As a member of this circle, your magic is influenced by the land where you were initiated into the circle's mysterious rites.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
    parent: {
      index: "circle-of-the-land",
      name: "Circle of the Land",
    },
  },
  {
    sourceIndex: "circle-of-the-land-forest",
    name: "Circle of the Land: Forest",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "The Circle of the Land is made up of mystics and sages who safeguard ancient knowledge and rites through a vast oral tradition. These druids meet within sacred circles of trees or standing stones to whisper primal secrets in Druidic. The circle's wisest members preside as the chief priests of communities that hold to the Old Faith and serve as advisors to the rulers of those folk. As a member of this circle, your magic is influenced by the land where you were initiated into the circle's mysterious rites.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
    parent: {
      index: "circle-of-the-land",
      name: "Circle of the Land",
    },
  },
  {
    sourceIndex: "circle-of-the-land-grassland",
    name: "Circle of the Land: Grassland",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "The Circle of the Land is made up of mystics and sages who safeguard ancient knowledge and rites through a vast oral tradition. These druids meet within sacred circles of trees or standing stones to whisper primal secrets in Druidic. The circle's wisest members preside as the chief priests of communities that hold to the Old Faith and serve as advisors to the rulers of those folk. As a member of this circle, your magic is influenced by the land where you were initiated into the circle's mysterious rites.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
    parent: {
      index: "circle-of-the-land",
      name: "Circle of the Land",
    },
  },
  {
    sourceIndex: "circle-of-the-land-mountain",
    name: "Circle of the Land: Mountain",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "The Circle of the Land is made up of mystics and sages who safeguard ancient knowledge and rites through a vast oral tradition. These druids meet within sacred circles of trees or standing stones to whisper primal secrets in Druidic. The circle's wisest members preside as the chief priests of communities that hold to the Old Faith and serve as advisors to the rulers of those folk. As a member of this circle, your magic is influenced by the land where you were initiated into the circle's mysterious rites.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
    parent: {
      index: "circle-of-the-land",
      name: "Circle of the Land",
    },
  },
  {
    sourceIndex: "circle-of-the-land-swamp",
    name: "Circle of the Land: Swamp",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "The Circle of the Land is made up of mystics and sages who safeguard ancient knowledge and rites through a vast oral tradition. These druids meet within sacred circles of trees or standing stones to whisper primal secrets in Druidic. The circle's wisest members preside as the chief priests of communities that hold to the Old Faith and serve as advisors to the rulers of those folk. As a member of this circle, your magic is influenced by the land where you were initiated into the circle's mysterious rites.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
    parent: {
      index: "circle-of-the-land",
      name: "Circle of the Land",
    },
  },
  {
    sourceIndex: "bonus-cantrip",
    name: "Bonus Cantrip",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "When you choose this circle at 2nd level, you learn one additional druid cantrip of your choice.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "natural-recovery",
    name: "Natural Recovery",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 2,
    desc: [
      "Starting at 2nd level, you can regain some of your magical energy by sitting in meditation and communing with nature. During a short rest, you choose expended spell slots to recover. The spell slots can have a combined level that is equal to or less than half your druid level (rounded up), and none of the slots can be 6th level or higher. You can't use this feature again until you finish a long rest.",
      "For example, when you are a 4th-level druid, you can recover up to two levels worth of spell slots. You can recover either a 2nd-level slot or two 1st-level slots.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "circle-spells-1",
    name: "Circle Spells",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 3,
    desc: [
      "Your mystical connection to the land infuses you with the ability to cast certain spells. At 3rd, 5th, 7th, and 9th level you gain access to circle spells connected to the land where you became a druid.",
      "Choose that land--arctic, coast, desert, forest, grassland, mountain, or swamp--and consult the associated list of spells.",
      "Once you gain access to a circle spell, you always have it prepared, and it doesn't count against the number of spells you can prepare each day. If you gain access to a spell that doesn't appear on the druid spell list, the spell is nonetheless a druid spell for you.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "wild-shape-cr-1-2-or-below-no-flying-speed",
    name: "Wild Shape (CR 1/2 or below, no flying speed)",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 4,
    desc: [
      "Starting at 2nd level, you can use your action to magically assume the shape of a beast that you have seen before. You can use this feature twice. You regain expended uses when you finish a short or long rest.",
      "Your druid level determines the beasts you can transform into, as shown in the Beast Shapes table. At 2nd level, for example, you can transform into any beast that has a challenge rating of 1/4 or lower that doesn't have a flying or swimming speed.",
      "You can stay in a beast shape for a number of hours equal to half your druid level (rounded down). You then revert to your normal form unless you expend another use of this feature. You can revert to your normal form earlier by using a bonus action on your turn. You automatically revert if you fall unconscious, drop to 0 hit points, or die.",
      "While you are transformed, the following rules apply:",
      "- Your game statistics are replaced by the statistics of the beast, but you retain your alignment, personality, and Intelligence, Wisdom, and Charisma scores. You also retain all of your skill and saving throw proficiencies, in addition to gaining those of the creature. If the creature has the same proficiency as you and the bonus in its stat block is higher than yours, use the creature's bonus instead of yours. If the creature has any legendary or lair actions, you can't use them.",
      "- When you transform, you assume the beast's hit points and Hit Dice. When you revert to your normal form, you return to the number of hit points you had before you transformed. However, if you revert as a result of dropping to 0 hit points, any excess damage carries over to your normal form. For example, if you take 10 damage in animal form and have only 1 hit point left, you revert and take 9 damage. As long as the excess damage doesn't reduce your normal form to 0 hit points, you aren't knocked unconscious.",
      "- You can't cast spells, and your ability to speak or take any action that requires hands is limited to the capabilities of your beast form. Transforming doesn't break your concentration on a spell you've already cast, however, or prevent you from taking actions that are part of a spell, such as call lightning, that you've already cast.",
      "- You retain the benefit of any features from your class, race, or other source and can use them if the new form is physically capable of doing so. However, you can't use any of your special senses, such as darkvision, unless your new form also has that sense.",
      "- You choose whether your equipment falls to the ground in your space, merges into your new form, or is worn by it. Worn equipment functions as normal, but the GM decides whether it is practical for the new form to wear a piece of equipment, based on the creature's shape and size. Your equipment doesn't change size or shape to match the new form, and any equipment that the new form can't wear must either fall to the ground or merge with it. Equipment that merges with the form has no effect until you leave the form.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "druid-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "circle-spells-2",
    name: "Circle Spells",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 5,
    desc: [
      "Your mystical connection to the land infuses you with the ability to cast certain spells. At 3rd, 5th, 7th, and 9th level you gain access to circle spells connected to the land where you became a druid.",
      "Choose that land--arctic, coast, desert, forest, grassland, mountain, or swamp--and consult the associated list of spells.",
      "Once you gain access to a circle spell, you always have it prepared, and it doesn't count against the number of spells you can prepare each day. If you gain access to a spell that doesn't appear on the druid spell list, the spell is nonetheless a druid spell for you.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "druid-circle-improvement-1",
    name: "Druid Circle feature",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 6,
    desc: [
      "At 2nd level, you choose to identify with a circle of druids, such as the Circle of the Land. Your choice grants you features at 2nd level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "druid-lands-stride",
    name: "Land's Stride",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 6,
    desc: [
      "Starting at 6th level, moving through nonmagical difficult terrain costs you no extra movement. You can also pass through nonmagical plants without being slowed by them and without taking damage from them if they have thorns, spines, or a similar hazard.",
      "In addition, you have advantage on saving throws against plants that are magically created or manipulated to impede movement, such those created by the entangle spell.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "circle-spells-3",
    name: "Circle Spells",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 7,
    desc: [
      "Your mystical connection to the land infuses you with the ability to cast certain spells. At 3rd, 5th, 7th, and 9th level you gain access to circle spells connected to the land where you became a druid.",
      "Choose that land--arctic, coast, desert, forest, grassland, mountain, or swamp--and consult the associated list of spells.",
      "Once you gain access to a circle spell, you always have it prepared, and it doesn't count against the number of spells you can prepare each day. If you gain access to a spell that doesn't appear on the druid spell list, the spell is nonetheless a druid spell for you.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "wild-shape-cr-1-or-below",
    name: "Wild Shape (CR 1 or below)",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 8,
    desc: [
      "Starting at 2nd level, you can use your action to magically assume the shape of a beast that you have seen before. You can use this feature twice. You regain expended uses when you finish a short or long rest.",
      "Your druid level determines the beasts you can transform into, as shown in the Beast Shapes table. At 2nd level, for example, you can transform into any beast that has a challenge rating of 1/4 or lower that doesn't have a flying or swimming speed.",
      "You can stay in a beast shape for a number of hours equal to half your druid level (rounded down). You then revert to your normal form unless you expend another use of this feature. You can revert to your normal form earlier by using a bonus action on your turn. You automatically revert if you fall unconscious, drop to 0 hit points, or die.",
      "While you are transformed, the following rules apply:",
      "- Your game statistics are replaced by the statistics of the beast, but you retain your alignment, personality, and Intelligence, Wisdom, and Charisma scores. You also retain all of your skill and saving throw proficiencies, in addition to gaining those of the creature. If the creature has the same proficiency as you and the bonus in its stat block is higher than yours, use the creature's bonus instead of yours. If the creature has any legendary or lair actions, you can't use them.",
      "- When you transform, you assume the beast's hit points and Hit Dice. When you revert to your normal form, you return to the number of hit points you had before you transformed. However, if you revert as a result of dropping to 0 hit points, any excess damage carries over to your normal form. For example, if you take 10 damage in animal form and have only 1 hit point left, you revert and take 9 damage. As long as the excess damage doesn't reduce your normal form to 0 hit points, you aren't knocked unconscious.",
      "- You can't cast spells, and your ability to speak or take any action that requires hands is limited to the capabilities of your beast form. Transforming doesn't break your concentration on a spell you've already cast, however, or prevent you from taking actions that are part of a spell, such as call lightning, that you've already cast.",
      "- You retain the benefit of any features from your class, race, or other source and can use them if the new form is physically capable of doing so. However, you can't use any of your special senses, such as darkvision, unless your new form also has that sense.",
      "- You choose whether your equipment falls to the ground in your space, merges into your new form, or is worn by it. Worn equipment functions as normal, but the GM decides whether it is practical for the new form to wear a piece of equipment, based on the creature's shape and size. Your equipment doesn't change size or shape to match the new form, and any equipment that the new form can't wear must either fall to the ground or merge with it. Equipment that merges with the form has no effect until you leave the form.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "druid-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "circle-spells-4",
    name: "Circle Spells",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 9,
    desc: [
      "Your mystical connection to the land infuses you with the ability to cast certain spells. At 3rd, 5th, 7th, and 9th level you gain access to circle spells connected to the land where you became a druid.",
      "Choose that land--arctic, coast, desert, forest, grassland, mountain, or swamp--and consult the associated list of spells.",
      "Once you gain access to a circle spell, you always have it prepared, and it doesn't count against the number of spells you can prepare each day. If you gain access to a spell that doesn't appear on the druid spell list, the spell is nonetheless a druid spell for you.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "druid-circle-improvement-2",
    name: "Druid Circle feature",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 10,
    desc: [
      "At 2nd level, you choose to identify with a circle of druids, such as the Circle of the Land. Your choice grants you features at 2nd level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "natures-ward",
    name: "Nature's Ward",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 10,
    desc: [
      "When you reach 10th level, you can't be charmed or frightened by elementals or fey, and you are immune to poison and disease.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "druid-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "druid-circle-improvement-3",
    name: "Druid Circle feature",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 14,
    desc: [
      "At 2nd level, you choose to identify with a circle of druids, such as the Circle of the Land. Your choice grants you features at 2nd level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "natures-sanctuary",
    name: "Nature's Sanctuary",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 14,
    desc: [
      "When you reach 14th level, creatures of the natural world sense your connection to nature and become hesitant to attack you. When a beast or plant creature attacks you, that creature must make a Wisdom saving throw against your druid spell save DC. On a failed save, the creature must choose a different target, or the attack automatically misses. On a successful save, the creature is immune to this effect for 24 hours. The creature is aware of this effect before it makes its attack against you.",
    ],
    prerequisites: [],
    subclass: {
      index: "land",
      name: "Land",
    },
  },
  {
    sourceIndex: "druid-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "druid-timeless-body",
    name: "Timeless Body",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 18,
    desc: [
      "Starting at 18th level, the primal magic that you wield causes you to age more slowly. For every 10 years that pass, your body ages only 1 year.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "beast-spells",
    name: "Beast Spells",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 18,
    desc: [
      "Beginning at 18th level, you can cast many of your druid spells in any shape you assume using Wild Shape. You can perform the somatic and verbal components of a druid spell while in a beast shape, but you aren't able to provide material components.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "druid-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "archdruid",
    name: "Archdruid",
    class: {
      index: "druid",
      name: "Druid",
    },
    level: 20,
    desc: [
      "At 20th level, you can use your Wild Shape an unlimited number of times.",
      "Additionally, you can ignore the verbal and somatic components of your druid spells, as well as any material components that lack a cost and aren't consumed by a spell. You gain this benefit in both your normal shape and your beast shape from Wild Shape.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "fighter-fighting-style",
    name: "Fighting Style",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 1,
    desc: [
      "You adopt a particular style of fighting as your specialty. Choose one of the following options. You can't take a Fighting Style option more than once, even if you later get to choose again.",
    ],
    prerequisites: [],
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-archery",
                name: "Fighting Style: Archery",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-defense",
                name: "Fighting Style: Defense",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-dueling",
                name: "Fighting Style: Dueling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-great-weapon-fighting",
                name: "Fighting Style: Great Weapon Fighting",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-protection",
                name: "Fighting Style: Protection",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-two-weapon-fighting",
                name: "Fighting Style: Two-Weapon Fighting",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "fighter-fighting-style-archery",
    name: "Fighting Style: Archery",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 1,
    desc: ["You gain a +2 bonus to attack rolls you make with ranged weapons."],
    prerequisites: [],
    parent: {
      index: "fighter-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "fighter-fighting-style-defense",
    name: "Fighting Style: Defense",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 1,
    desc: ["While you are wearing armor, you gain a +1 bonus to AC."],
    prerequisites: [],
    parent: {
      index: "fighter-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "fighter-fighting-style-dueling",
    name: "Fighting Style: Dueling",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 1,
    desc: [
      "When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
    ],
    prerequisites: [],
    parent: {
      index: "fighter-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "fighter-fighting-style-great-weapon-fighting",
    name: "Fighting Style: Great Weapon Fighting",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 1,
    desc: [
      "When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll, even if the new roll is a 1 or a 2. The weapon must have the two-handed or versatile property for you to gain this benefit.",
    ],
    prerequisites: [],
    parent: {
      index: "fighter-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "fighter-fighting-style-protection",
    name: "Fighting Style: Protection",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 1,
    desc: [
      "When a creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to impose disadvantage on the attack roll. You must be wielding a shield.",
    ],
    prerequisites: [],
    parent: {
      index: "fighter-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "fighter-fighting-style-two-weapon-fighting",
    name: "Fighting Style: Two-Weapon Fighting",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 1,
    desc: [
      "When you engage in two-weapon fighting, you can add your ability modifier to the damage of the second attack.",
    ],
    prerequisites: [],
    parent: {
      index: "fighter-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "second-wind",
    name: "Second Wind",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 1,
    desc: [
      "You have a limited well of stamina that you can draw on to protect yourself from harm. On your turn, you can use a bonus action to regain hit points equal to 1d10 + your fighter level. Once you use this feature, you must finish a short or long rest before you can use it again.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "action-surge-1-use",
    name: "Action Surge (1 use)",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 2,
    desc: [
      "Starting at 2nd level, you can push yourself beyond your normal limits for a moment. On your turn, you can take one additional action on top of your regular action and a possible bonus action.",
      "Once you use this feature, you must finish a short or long rest before you can use it again. Starting at 17th level, you can use it twice before a rest, but only once on the same turn.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "martial-archetype",
    name: "Martial Archetype",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 3,
    desc: [
      "At 3rd level, you choose an archetype that you strive to emulate in your combat styles and techniques, such as Champion. The archetype you choose grants you features at 3rd level and again at 7th, 10th, 15th, and 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "improved-critical",
    name: "Improved Critical",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 3,
    desc: [
      "Beginning when you choose this archetype at 3rd level, your weapon attacks score a critical hit on a roll of 19 or 20.",
    ],
    prerequisites: [],
    subclass: {
      index: "champion",
      name: "Champion",
    },
  },
  {
    sourceIndex: "fighter-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 6th, 8th, 12th, 14th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "extra-attack-1",
    name: "Extra Attack",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 5,
    desc: [
      "Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn. The number of attacks increases to three when you reach 11th level in this class and to four when you reach 20th level in this class.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "fighter-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 6,
    desc: [
      "When you reach 4th level, and again at 6th, 8th, 12th, 14th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "remarkable-athlete",
    name: "Remarkable Athlete",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 7,
    desc: [
      "Starting at 7th level, you can add half your proficiency bonus (round up) to any Strength, Dexterity, or Constitution check you make that doesn't already use your proficiency bonus. In addition, when you make a running long jump, the distance you can cover increases by a number of feet equal to your Strength modifier.",
    ],
    prerequisites: [],
    subclass: {
      index: "champion",
      name: "Champion",
    },
  },
  {
    sourceIndex: "martial-archetype-improvement-1",
    name: "Martial Archetype feature",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 7,
    desc: [
      "At 3rd level, you choose an archetype that you strive to emulate in your combat styles and techniques, such as Champion. The archetype you choose grants you features at 3rd level and again at 7th, 10th, 15th, and 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "fighter-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 6th, 8th, 12th, 14th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "indomitable-1-use",
    name: "Indomitable (1 use)",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 9,
    desc: [
      "Beginning at 9th level, you can reroll a saving throw that you fail. If you do so, you must use the new roll, and you can't use this feature again until you finish a long rest. You can use this feature twice between long rests starting at 13th level and three times between long rests starting at 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "additional-fighting-style",
    name: "Additional Fighting Style",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 10,
    desc: ["At 10th level, you can choose a second option from the Fighting Style class feature."],
    prerequisites: [],
    subclass: {
      index: "champion",
      name: "Champion",
    },
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-archery",
                name: "Fighting Style: Archery",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-defense",
                name: "Fighting Style: Defense",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-dueling",
                name: "Fighting Style: Dueling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-great-weapon-fighting",
                name: "Fighting Style: Great Weapon Fighting",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-protection",
                name: "Fighting Style: Protection",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighter-fighting-style-two-weapon-fighting",
                name: "Fighting Style: Two-Weapon Fighting",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "martial-archetype-improvement-2",
    name: "Martial Archetype feature",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 10,
    desc: [
      "At 3rd level, you choose an archetype that you strive to emulate in your combat styles and techniques, such as Champion. The archetype you choose grants you features at 3rd level and again at 7th, 10th, 15th, and 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "extra-attack-2",
    name: "Extra Attack (2)",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 11,
    desc: [
      "Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn. The number of attacks increases to three when you reach 11th level in this class and to four when you reach 20th level in this class.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "fighter-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 6th, 8th, 12th, 14th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "indomitable-2-uses",
    name: "Indomitable (2 uses)",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 13,
    desc: [
      "Beginning at 9th level, you can reroll a saving throw that you fail. If you do so, you must use the new roll, and you can't use this feature again until you finish a long rest. You can use this feature twice between long rests starting at 13th level and three times between long rests starting at 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "fighter-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 14,
    desc: [
      "When you reach 4th level, and again at 6th, 8th, 12th, 14th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "superior-critical",
    name: "Superior Critical",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 15,
    desc: ["Starting at 15th level, your weapon attacks score a critical hit on a roll of 18-20."],
    prerequisites: [],
    subclass: {
      index: "champion",
      name: "Champion",
    },
  },
  {
    sourceIndex: "martial-archetype-improvement-3",
    name: "Martial Archetype feature",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 15,
    desc: [
      "At 3rd level, you choose an archetype that you strive to emulate in your combat styles and techniques, such as Champion. The archetype you choose grants you features at 3rd level and again at 7th, 10th, 15th, and 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "fighter-ability-score-improvement-6",
    name: "Ability Score Improvement",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 6th, 8th, 12th, 14th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "action-surge-2-uses",
    name: "Action Surge (2 uses)",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 17,
    desc: [
      "Starting at 2nd level, you can push yourself beyond your normal limits for a moment. On your turn, you can take one additional action on top of your regular action and a possible bonus action.",
      "Once you use this feature, you must finish a short or long rest before you can use it again. Starting at 17th level, you can use it twice before a rest, but only once on the same turn.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "indomitable-3-uses",
    name: "Indomitable (3 uses)",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 17,
    desc: [
      "Beginning at 9th level, you can reroll a saving throw that you fail. If you do so, you must use the new roll, and you can't use this feature again until you finish a long rest. You can use this feature twice between long rests starting at 13th level and three times between long rests starting at 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "martial-archetype-improvement-4",
    name: "Martial Archetype feature",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 18,
    desc: [
      "At 3rd level, you choose an archetype that you strive to emulate in your combat styles and techniques, such as Champion. The archetype you choose grants you features at 3rd level and again at 7th, 10th, 15th, and 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "survivor",
    name: "Survivor",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 18,
    desc: [
      "At 18th level, you attain the pinnacle of resilience in battle. At the start of each of your turns, you regain hit points equal to 5 + your Constitution modifier if you have no more than half of your hit points left. You don't gain this benefit if you have 0 hit points.",
    ],
    prerequisites: [],
    subclass: {
      index: "champion",
      name: "Champion",
    },
  },
  {
    sourceIndex: "fighter-ability-score-improvement-7",
    name: "Ability Score Improvement",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 6th, 8th, 12th, 14th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "extra-attack-3",
    name: "Extra Attack (3)",
    class: {
      index: "fighter",
      name: "Fighter",
    },
    level: 20,
    desc: [
      "Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn. The number of attacks increases to three when you reach 11th level in this class and to four when you reach 20th level in this class.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "monk-unarmored-defense",
    name: "Unarmored Defense",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 1,
    desc: [
      "Beginning at 1st level, while you are wearing no armor and not wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "martial-arts",
    name: "Martial Arts",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 1,
    desc: [
      "At 1st level, your practice of martial arts gives you mastery of combat styles that use unarmed strikes and monk weapons, which are shortswords and any simple melee weapons that don't have the two- handed or heavy property.",
      "You gain the following benefits while you are unarmed or wielding only monk weapons and you aren't wearing armor or wielding a shield:",
      "- You can use Dexterity instead of Strength for the attack and damage rolls of your unarmed strikes and monk weapons.",
      "- You can roll a d4 in place of the normal damage of your unarmed strike or monk weapon. This die changes as you gain monk levels, as shown in the Martial Arts column of Table: The Monk.",
      "- When you use the Attack action with an unarmed strike or a monk weapon on your turn, you can make one unarmed strike as a bonus action. For example, if you take the Attack action and attack with a quarterstaff, you can also make an unarmed strike as a bonus action, assuming you haven't already taken a bonus action this turn.",
      "Certain monasteries use specialized forms of the monk weapons. For example, you might use a club that is two lengths of wood connected by a short chain (called a nunchaku) or a sickle with a shorter, straighter blade (called a kama). Whatever name you use for a monk weapon, you can use the game statistics provided for the weapon.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "ki",
    name: "Ki",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 2,
    desc: [
      "Starting at 2nd level, your training allows you to harness the mystic energy of ki. Your access to this energy is represented by a number of ki points. Your monk level determines the number of points you have, as shown in the Ki Points column of Table: The Monk.",
      "You can spend these points to fuel various ki features. You start knowing three such features: Flurry of Blows, Patient Defense, and Step of the Wind. You learn more ki features as you gain levels in this class.",
      "When you spend a ki point, it is unavailable until you finish a short or long rest, at the end of which you draw all of your expended ki back into yourself. You must spend at least 30 minutes of the rest meditating to regain your ki points.",
      "Some of your ki features require your target to make a saving throw to resist the feature's effects. The saving throw DC is calculated as follows:",
      "Ki save DC = 8 + your proficiency bonus + your Wisdom modifier",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "flurry-of-blows",
    name: "Flurry of Blows",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 2,
    desc: [
      "Immediately after you take the Attack action on your turn, you can spend 1 ki point to make two unarmed strikes as a bonus action.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "patient-defense",
    name: "Patient Defense",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 2,
    desc: ["You can spend 1 ki point to take the Dodge action as a bonus action on your turn."],
    prerequisites: [],
  },
  {
    sourceIndex: "step-of-the-wind",
    name: "Step of the Wind",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 2,
    desc: [
      "You can spend 1 ki point to take the Disengage or Dash action as a bonus action on your turn, and your jump distance is doubled for the turn.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "unarmored-movement-1",
    name: "Unarmored Movement",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 2,
    desc: [
      "Starting at 2nd level, your speed increases by 10 feet while you are not wearing armor or wielding a shield. This bonus increases when you reach certain monk levels, as shown in Table: The Monk.",
      "At 9th level, you gain the ability to move along vertical surfaces and across liquids on your turn without falling during the move.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "monastic-tradition",
    name: "Monastic Tradition",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 3,
    desc: [
      "When you reach 3rd level, you commit yourself to a monastic tradition, such as the Way of the Open Hand. Your tradition grants you features at 3rd level and again at 6th, 11th, and 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "deflect-missiles",
    name: "Deflect Missiles",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 3,
    desc: [
      "Starting at 3rd level, you can use your reaction to deflect or catch the missile when you are hit by a ranged weapon attack. When you do so, the damage you take from the attack is reduced by 1d10 + your Dexterity modifier + your monk level.",
      "If you reduce the damage to 0, you can catch the missile if it is small enough for you to hold in one hand and you have at least one hand free. If you catch a missile in this way, you can spend 1 ki point to make a ranged attack with the weapon or piece of ammunition you just caught, as part of the same reaction. You make this attack with proficiency, regardless of your weapon proficiencies, and the missile counts as a monk weapon for the attack, which has a normal range of 20 feet and a long range of 60 feet.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "open-hand-technique",
    name: "Open Hand Technique",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 3,
    desc: [
      "Starting when you choose this tradition at 3rd level, you can manipulate your enemy's ki when you harness your own. Whenever you hit a creature with one of the attacks granted by your Flurry of Blows, you can impose one of the following effects on that target:",
      "- It must succeed on a Dexterity saving throw or be knocked prone.",
      "- It must make a Strength saving throw. If it fails, you can push it up to 15 feet away from you.",
      "- It can't take reactions until the end of your next turn.",
    ],
    prerequisites: [],
    subclass: {
      index: "open-hand",
      name: "Open Hand",
    },
  },
  {
    sourceIndex: "monk-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "slow-fall",
    name: "Slow Fall",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 4,
    desc: [
      "Beginning at 4th level, you can use your reaction when you fall to reduce any falling damage you take by an amount equal to five times your monk level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "monk-extra-attack",
    name: "Extra Attack",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 5,
    desc: [
      "Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "stunning-strike",
    name: "Stunning Strike",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 5,
    desc: [
      "Starting at 5th level, you can interfere with the flow of ki in an opponent's body. When you hit another creature with a melee weapon attack, you can spend 1 ki point to attempt a stunning strike. The target must succeed on a Constitution saving throw or be stunned until the end of your next turn.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "ki-empowered-strikes",
    name: "Ki Empowered Strikes",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 6,
    desc: [
      "Starting at 6th level, your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks and damage.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "monastic-tradition-improvement-1",
    name: "Monastic Tradition feature",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 6,
    desc: [
      "When you reach 3rd level, you commit yourself to a monastic tradition, such as the Way of the Open Hand. Your tradition grants you features at 3rd level and again at 6th, 11th, and 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "wholeness-of-body",
    name: "Wholeness of Body",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 6,
    desc: [
      "At 6th level, you gain the ability to heal yourself. As an action, you can regain hit points equal to three times your monk level. You must finish a long rest before you can use this feature again.",
    ],
    prerequisites: [],
    subclass: {
      index: "open-hand",
      name: "Open Hand",
    },
  },
  {
    sourceIndex: "monk-evasion",
    name: "Evasion",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 7,
    desc: [
      "At 7th level, your instinctive agility lets you dodge out of the way of certain area effects, such as a blue dragon's lightning breath or a fireball spell. When you are subjected to an effect that allows you to make a Dexterity saving throw to take only half damage, you instead take no damage if you succeed on the saving throw, and only half damage if you fail.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "stillness-of-mind",
    name: "Stillness of Mind",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 7,
    desc: [
      "Starting at 7th level, you can use your action to end one effect on yourself that is causing you to be charmed or frightened.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "monk-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "unarmored-movement-2",
    name: "Unarmored Movement",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 9,
    desc: [
      "Starting at 2nd level, your speed increases by 10 feet while you are not wearing armor or wielding a shield. This bonus increases when you reach certain monk levels, as shown in Table: The Monk.",
      "At 9th level, you gain the ability to move along vertical surfaces and across liquids on your turn without falling during the move.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "purity-of-body",
    name: "Purity of Body",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 10,
    desc: [
      "At 10th level, your mastery of the ki flowing through you makes you immune to disease and poison.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "monastic-tradition-improvement-2",
    name: "Monastic Tradition feature",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 11,
    desc: [
      "When you reach 3rd level, you commit yourself to a monastic tradition, such as the Way of the Open Hand. Your tradition grants you features at 3rd level and again at 6th, 11th, and 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "tranquility",
    name: "Tranquility",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 11,
    desc: [
      "Beginning at 11th level, you can enter a special meditation that surrounds you with an aura of peace. At the end of a long rest, you gain the effect of a sanctuary spell that lasts until the start of your next long rest (the spell can end early as normal). The saving throw DC for the spell equals 8 + your Wisdom modifier + your proficiency bonus.",
    ],
    prerequisites: [],
    subclass: {
      index: "open-hand",
      name: "Open Hand",
    },
  },
  {
    sourceIndex: "monk-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "tongue-of-the-sun-and-moon",
    name: "Tongue of the Sun and Moon",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 13,
    desc: [
      "Starting at 13th level, you learn to touch the ki of other minds so that you understand all spoken languages. Moreover, any creature that can understand a language can understand what you say.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "diamond-soul",
    name: "Diamond Soul",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 14,
    desc: [
      "Beginning at 14th level, your mastery of ki grants you proficiency in all saving throws.",
      "Additionally, whenever you make a saving throw and fail, you can spend 1 ki point to reroll it and take the second result.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "monk-timeless-body",
    name: "Timeless Body",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 15,
    desc: [
      "At 15th level, your ki sustains you so that you suffer none of the frailty of old age, and you can't be aged magically. You can still die of old age, however. In addition, you no longer need food or water.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "monk-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "monastic-tradition-improvement-3",
    name: "Monastic Tradition feature",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 17,
    desc: [
      "When you reach 3rd level, you commit yourself to a monastic tradition, such as the Way of the Open Hand. Your tradition grants you features at 3rd level and again at 6th, 11th, and 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "quivering-palm",
    name: "Quivering Palm",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 17,
    desc: [
      "At 17th level, you gain the ability to set up lethal vibrations in someone's body. When you hit a creature with an unarmed strike, you can spend 3 ki points to start these imperceptible vibrations, which last for a number of days equal to your monk level. The vibrations are harmless unless you use your action to end them. To do so, you and the target must be on the same plane of existence. When you use this action, the creature must make a Constitution saving throw. If it fails, it is reduced to 0 hit points. If it succeeds, it takes 10d10 necrotic damage.",
      "You can have only one creature under the effect of this feature at a time. You can choose to end the vibrations harmlessly without using an action.",
    ],
    prerequisites: [],
    subclass: {
      index: "open-hand",
      name: "Open Hand",
    },
  },
  {
    sourceIndex: "empty-body",
    name: "Empty Body",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 18,
    desc: [
      "Beginning at 18th level, you can use your action to spend 4 ki points to become invisible for 1 minute. During that time, you also have resistance to all damage but force damage.",
      "Additionally, you can spend 8 ki points to cast the astral projection spell, without needing material components. When you do so, you can't take any other creatures with you.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "monk-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "perfect-self",
    name: "Perfect Self",
    class: {
      index: "monk",
      name: "Monk",
    },
    level: 20,
    desc: [
      "At 20th level, when you roll for initiative and have no ki points remaining, you regain 4 ki points.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "divine-sense",
    name: "Divine Sense",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 1,
    desc: [
      "The presence of strong evil registers on your senses like a noxious odor, and powerful good rings like heavenly music in your ears. As an action, you can open your awareness to detect such forces. Until the end of your next turn, you know the location of any celestial, fiend, or undead within 60 feet of you that is not behind total cover. You know the type (celestial, fiend, or undead) of any being whose presence you sense, but not its identity. Within the same radius, you also detect the presence of any place or object that has been consecrated or desecrated, as with the hallow spell.",
      "You can use this feature a number of times equal to 1 + your Charisma modifier. When you finish a long rest, you regain all expended uses.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "lay-on-hands",
    name: "Lay on Hands",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 1,
    desc: [
      "Your blessed touch can heal wounds. You have a pool of healing power that replenishes when you take a long rest. With that pool, you can restore a total number of hit points equal to your paladin level x 5.",
      "As an action, you can touch a creature and draw power from the pool to restore a number of hit points to that creature, up to the maximum amount remaining in your pool.",
      "Alternatively, you can expend 5 hit points from your pool of healing to cure the target of one disease or neutralize one poison affecting it. You can cure multiple diseases and neutralize multiple poisons with a single use of Lay on Hands, expending hit points separately for each one.",
      "This feature has no effect on undead and constructs.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "paladin-fighting-style",
    name: "Fighting Style",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 2,
    desc: [
      "At 2nd level, you adopt a style of fighting as your specialty. Choose one of the following options. You can't take a Fighting Style option more than once, even if you later get to choose again.",
    ],
    prerequisites: [],
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "fighting-style-defense",
                name: "Fighting Style: Defense",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighting-style-dueling",
                name: "Fighting Style: Dueling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighting-style-great-weapon-fighting",
                name: "Fighting Style: Great Weapon Fighting",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "fighting-style-protection",
                name: "Fighting Style: Protection",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "fighting-style-defense",
    name: "Fighting Style: Defense",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 2,
    desc: ["While you are wearing armor, you gain a +1 bonus to AC."],
    prerequisites: [],
    parent: {
      index: "paladin-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "fighting-style-dueling",
    name: "Fighting Style: Dueling",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 2,
    desc: [
      "When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
    ],
    prerequisites: [],
    parent: {
      index: "paladin-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "fighting-style-great-weapon-fighting",
    name: "Fighting Style: Great Weapon Fighting",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 2,
    desc: [
      "When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll. The weapon must have the two-handed or versatile property for you to gain this benefit.",
    ],
    prerequisites: [],
    parent: {
      index: "paladin-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "fighting-style-protection",
    name: "Fighting Style: Protection",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 2,
    desc: [
      "When a creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to impose disadvantage on the attack roll. You must be wielding a shield.",
    ],
    prerequisites: [],
    parent: {
      index: "paladin-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "spellcasting-paladin",
    name: "Spellcasting: Paladin",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 2,
    desc: [
      "By 2nd level, you have learned to draw on divine magic through meditation and prayer to cast spells as a cleric does.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "divine-smite",
    name: "Divine Smite",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 2,
    desc: [
      "Starting at 2nd level, when you hit a creature with a melee weapon attack, you can expend one spell slot to deal radiant damage to the target, in addition to the weapon's damage. The extra damage is 2d8 for a 1st-level spell slot, plus 1d8 for each spell level higher than 1st, to a maximum of 5d8. The damage increases by 1d8 if the target is an undead or a fiend.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "divine-health",
    name: "Divine Health",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 3,
    desc: ["By 3rd level, the divine magic flowing through you makes you immune to disease."],
    prerequisites: [],
  },
  {
    sourceIndex: "sacred-oath",
    name: "Sacred Oath",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 3,
    desc: [
      "When you reach 3rd level, you swear the oath that binds you as a paladin forever. Up to this time you have been in a preparatory stage, committed to the path but not yet sworn to it. Now you choose an oath, such as the Oath of Devotion.",
      "Your choice grants you features at 3rd level and again at 7th, 15th, and 20th level. Those features include oath spells and the Channel Divinity feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "oath-spells",
    name: "Oath Spells",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 3,
    desc: [
      "Each oath has a list of associated spells. You gain access to these spells at the levels specified in the oath description. Once you gain access to an oath spell, you always have it prepared. Oath spells don't count against the number of spells you can prepare each day.",
      "If you gain an oath spell that doesn't appear on the paladin spell list, the spell is nonetheless a paladin spell for you.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "channel-divinity",
    name: "Channel Divinity",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 3,
    desc: [
      "Your oath allows you to channel divine energy to fuel magical effects. Each Channel Divinity option provided by your oath explains how to use it.",
      "When you use your Channel Divinity, you choose which option to use. You must then finish a short or long rest to use your Channel Divinity again.",
      "Some Channel Divinity effects require saving throws. When you use such an effect from this class, the DC equals your paladin spell save DC.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "channel-divinity-sacred-weapon",
    name: "Channel Divinity: Sacred Weapon",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 3,
    desc: [
      "As an action, you can imbue one weapon that you are holding with positive energy, using your Channel Divinity. For 1 minute, you add your Charisma modifier to attack rolls made with that weapon (with a minimum bonus of +1). The weapon also emits bright light in a 20-foot radius and dim light 20 feet beyond that. If the weapon is not already magical, it becomes magical for the duration.",
      "You can end this effect on your turn as part of any other action. If you are no longer holding or carrying this weapon, or if you fall unconscious, this effect ends.",
    ],
    prerequisites: [],
    subclass: {
      index: "devotion",
      name: "Devotion",
    },
  },
  {
    sourceIndex: "channel-divinity-turn-the-unholy",
    name: "Channel Divinity: Turn the Unholy",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 3,
    desc: [
      "As an action, you present your holy symbol and speak a prayer censuring fiends and undead, using your Channel Divinity. Each fiend or undead that can see or hear you within 30 feet of you must make a Wisdom saving throw. If the creature fails its saving throw, it is turned for 1 minute or until it takes damage.",
      "A turned creature must spend its turns trying to move as far away from you as it can, and it can't willingly move to a space within 30 feet of you. It also can't take reactions. For its action, it can use only the Dash action or try to escape from an effect that prevents it from moving. If there's nowhere to move, the creature can use the Dodge action.",
    ],
    prerequisites: [],
    subclass: {
      index: "devotion",
      name: "Devotion",
    },
  },
  {
    sourceIndex: "paladin-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "paladin-extra-attack",
    name: "Extra Attack",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 5,
    desc: [
      "Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "aura-of-protection",
    name: "Aura of Protection",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 6,
    desc: [
      "Starting at 6th level, whenever you or a friendly creature within 10 feet of you must make a saving throw, the creature gains a bonus to the saving throw equal to your Charisma modifier (with a minimum bonus of +1). You must be conscious to grant this bonus.",
      "At 18th level, the range of this aura increases to 30 feet.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "sacred-oath-improvement-1",
    name: "Sacred Oath feature",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 7,
    desc: [
      "When you reach 3rd level, you swear the oath that binds you as a paladin forever. Up to this time you have been in a preparatory stage, committed to the path but not yet sworn to it. Now you choose an oath, such as the Oath of Devotion.",
      "Your choice grants you features at 3rd level and again at 7th, 15th, and 20th level. Those features include oath spells and the Channel Divinity feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "aura-of-devotion",
    name: "Aura of Devotion",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 7,
    desc: [
      "Starting at 7th level, you and friendly creatures within 10 feet of you can't be charmed while you are conscious.",
      "At 18th level, the range of this aura increases to 30 feet.",
    ],
    prerequisites: [],
    subclass: {
      index: "devotion",
      name: "Devotion",
    },
  },
  {
    sourceIndex: "paladin-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "aura-of-courage",
    name: "Aura of Courage",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 10,
    desc: [
      "Starting at 10th level, you and friendly creatures within 10 feet of you can't be frightened while you are conscious.",
      "At 18th level, the range of this aura increases to 30 feet.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "improved-divine-smite",
    name: "Improved Divine Smite",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 11,
    desc: [
      "By 11th level, you are so suffused with righteous might that all your melee weapon strikes carry divine power with them. Whenever you hit a creature with a melee weapon, the creature takes an extra 1d8 radiant damage. If you also use your Divine Smite with an attack, you add this damage to the extra damage of your Divine Smite.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "paladin-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "cleansing-touch",
    name: "Cleansing Touch",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 14,
    desc: [
      "Beginning at 14th level, you can use your action to end one spell on yourself or on one willing creature that you touch.",
      "You can use this feature a number of times equal to your Charisma modifier (a minimum of once). You regain expended uses when you finish a long rest.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "sacred-oath-improvement-2",
    name: "Sacred Oath feature",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 15,
    desc: [
      "When you reach 3rd level, you swear the oath that binds you as a paladin forever. Up to this time you have been in a preparatory stage, committed to the path but not yet sworn to it. Now you choose an oath, such as the Oath of Devotion.",
      "Your choice grants you features at 3rd level and again at 7th, 15th, and 20th level. Those features include oath spells and the Channel Divinity feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "purity-of-spirit",
    name: "Purity of Spirit",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 15,
    desc: [
      "Beginning at 15th level, you are always under the effects of a protection from evil and good spell.",
    ],
    prerequisites: [],
    subclass: {
      index: "devotion",
      name: "Devotion",
    },
  },
  {
    sourceIndex: "paladin-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "aura-improvements",
    name: "Aura improvements",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 18,
    desc: ["At 18th level, the range of your auras increase to 30 feet."],
    prerequisites: [],
  },
  {
    sourceIndex: "paladin-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "sacred-oath-improvement-3",
    name: "Sacred Oath feature",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 20,
    desc: [
      "When you reach 3rd level, you swear the oath that binds you as a paladin forever. Up to this time you have been in a preparatory stage, committed to the path but not yet sworn to it. Now you choose an oath, such as the Oath of Devotion.",
      "Your choice grants you features at 3rd level and again at 7th, 15th, and 20th level. Those features include oath spells and the Channel Divinity feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "holy-nimbus",
    name: "Holy Nimbus",
    class: {
      index: "paladin",
      name: "Paladin",
    },
    level: 20,
    desc: [
      "At 20th level, as an action, you can emanate an aura of sunlight. For 1 minute, bright light shines from you in a 30-foot radius, and dim light shines 30 feet beyond that.",
      "Whenever an enemy creature starts its turn in the bright light, the creature takes 10 radiant damage.",
      "In addition, for the duration, you have advantage on saving throws against spells cast by fiends or undead.",
    ],
    prerequisites: [],
    subclass: {
      index: "devotion",
      name: "Devotion",
    },
  },
  {
    sourceIndex: "favored-enemy-1-type",
    name: "Favored Enemy (1 type)",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 1,
    desc: [
      "Beginning at 1st level, you have significant experience studying, tracking, hunting, and even talking to a certain type of enemy.",
      "Choose a type of favored enemy: aberrations, beasts, celestials, constructs, dragons, elementals, fey, fiends, giants, monstrosities, oozes, plants, or undead. Alternatively, you can select two races of humanoid (such as gnolls and orcs) as favored enemies.",
      "You have advantage on Wisdom (Survival) checks to track your favored enemies, as well as on Intelligence checks to recall information about them.",
      "When you gain this feature, you also learn one language of your choice that is spoken by your favored enemies, if they speak one at all.",
      "You choose one additional favored enemy, as well as an associated language, at 6th and 14th level. As you gain levels, your choices should reflect the types of monsters you have encountered on your adventures.",
    ],
    prerequisites: [],
    featureSpecific: {
      enemy_type_options: {
        desc: "one enemy type",
        choose: 1,
        type: "string",
        from: {
          option_set_type: "options_array",
          options: [
            "aberrations",
            "beasts",
            "celestials",
            "constructs",
            "dragons",
            "elementals",
            "fey",
            "fiends",
            "giants",
            "monstrosities",
            "oozes",
            "plants",
            "undead",
            "humanoids",
          ],
        },
      },
    },
  },
  {
    sourceIndex: "natural-explorer-1-terrain-type",
    name: "Natural Explorer (1 terrain type)",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 1,
    desc: [
      "You are particularly familiar with one type of natural environment and are adept at traveling and surviving in such regions. Choose one type of favored terrain: arctic, coast, desert, forest, grassland, mountain, or swamp. When you make an Intelligence or Wisdom check related to your favored terrain, your proficiency bonus is doubled if you are using a skill that you're proficient in.",
      "While traveling for an hour or more in your favored terrain, you gain the following benefits:",
      "- Difficult terrain doesn't slow your group's travel.",
      "- Your group can't become lost except by magical means.",
      "- Even when you are engaged in another activity while traveling (such as foraging, navigating, or tracking), you remain alert to danger.",
      "- If you are traveling alone, you can move stealthily at a normal pace.",
      "- When you forage, you find twice as much food as you normally would.",
      "- While tracking other creatures, you also learn their exact number, their sizes, and how long ago they passed through the area.",
      "You choose additional favored terrain types at 6th and 10th level.",
    ],
    prerequisites: [],
    featureSpecific: {
      terrain_type_options: {
        desc: "one terrain type",
        choose: 1,
        type: "string",
        from: {
          option_set_type: "options_array",
          options: ["arctic", "coast", "desert", "forest", "grassland", "mountain", "swamp"],
        },
      },
    },
  },
  {
    sourceIndex: "ranger-fighting-style",
    name: "Fighting Style",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 2,
    desc: [
      "At 2nd level, you adopt a particular style of fighting as your specialty. Choose one of the following options. You can't take a Fighting Style option more than once, even if you later get to choose again.",
    ],
    prerequisites: [],
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "ranger-fighting-style-archery",
                name: "Fighting Style: Archery",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "ranger-fighting-style-defense",
                name: "Fighting Style: Defense",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "ranger-fighting-style-dueling",
                name: "Fighting Style: Dueling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "ranger-fighting-style-two-weapon-fighting",
                name: "Fighting Style: Two-Weapon Fighting",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "ranger-fighting-style-archery",
    name: "Fighting Style: Archery",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 2,
    desc: ["You gain a +2 bonus to attack rolls you make with ranged weapons."],
    prerequisites: [],
    parent: {
      index: "ranger-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "ranger-fighting-style-defense",
    name: "Fighting Style: Defense",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 2,
    desc: ["While you are wearing armor, you gain a +1 bonus to AC."],
    prerequisites: [],
    parent: {
      index: "ranger-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "ranger-fighting-style-dueling",
    name: "Fighting Style: Dueling",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 2,
    desc: [
      "When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
    ],
    prerequisites: [],
    parent: {
      index: "ranger-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "ranger-fighting-style-two-weapon-fighting",
    name: "Fighting Style: Two-Weapon Fighting",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 2,
    desc: [
      "When you engage in two-weapon fighting, you can add your ability modifier to the damage of the second attack.",
    ],
    prerequisites: [],
    parent: {
      index: "ranger-fighting-style",
      name: "Fighting Style",
    },
  },
  {
    sourceIndex: "spellcasting-ranger",
    name: "Spellcasting: Ranger",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 2,
    desc: [
      "By the time you reach 2nd level, you have learned to use the magical essence of nature to cast spells, much as a druid does.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "ranger-archetype",
    name: "Ranger Archetype",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 3,
    desc: [
      "At 3rd level, you choose an archetype that you strive to emulate, such as the Hunter. Your choice grants you features at 3rd level and again at 7th, 11th, and 15th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "hunters-prey",
    name: "Hunter's Prey",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 3,
    desc: [
      "At 3rd level, you gain one of the following features of your choice.",
      "Colossus Slayer",
      "Giant Killer",
      "Horde Breaker",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "hunters-prey-colossus-slayer",
                name: "Hunter's Prey: Colossus Slayer",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "hunters-prey-giant-killer",
                name: "Hunter's Prey: Giant Killer",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "hunters-prey-horde-breaker",
                name: "Hunter's Prey: Horde Breaker",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "hunters-prey-colossus-slayer",
    name: "Hunter's Prey: Colossus Slayer",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 3,
    desc: [
      "Your tenacity can wear down the most potent foes. When you hit a creature with a weapon attack, the creature takes an extra 1d8 damage if it's below its hit point maximum. You can deal this extra damage only once per turn.",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    parent: {
      index: "hunters-prey",
      name: "Hunter's Prey",
    },
  },
  {
    sourceIndex: "hunters-prey-giant-killer",
    name: "Hunter's Prey: Giant Killer",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 3,
    desc: [
      "When a Large or larger creature within 5 feet of you hits or misses you with an attack, you can use your reaction to attack that creature immediately after its attack, provided that you can see the creature.",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    parent: {
      index: "hunters-prey",
      name: "Hunter's Prey",
    },
  },
  {
    sourceIndex: "hunters-prey-horde-breaker",
    name: "Hunter's Prey: Horde Breaker",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 3,
    desc: [
      "Once on each of your turns when you make a weapon attack, you can make another attack with the same weapon against a different creature that is within 5 feet of the original target and within range of your weapon.",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    parent: {
      index: "hunters-prey",
      name: "Hunter's Prey",
    },
  },
  {
    sourceIndex: "primeval-awareness",
    name: "Primeval Awareness",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 3,
    desc: [
      "Beginning at 3rd level, you can use your action and expend one ranger spell slot to focus your awareness on the region around you. For 1 minute per level of the spell slot you expend, you can sense whether the following types of creatures are present within 1 mile of you (or within up to 6 miles if you are in your favored terrain): aberrations, celestials, dragons, elementals, fey, fiends, and undead. This feature doesn't reveal the creatures' location or number.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "ranger-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "ranger-extra-attack",
    name: "Extra Attack",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 5,
    desc: [
      "Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "favored-enemy-2-types",
    name: "Favored Enemy (2 types)",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 6,
    desc: [
      "Beginning at 1st level, you have significant experience studying, tracking, hunting, and even talking to a certain type of enemy.",
      "Choose a type of favored enemy: aberrations, beasts, celestials, constructs, dragons, elementals, fey, fiends, giants, monstrosities, oozes, plants, or undead. Alternatively, you can select two races of humanoid (such as gnolls and orcs) as favored enemies.",
      "You have advantage on Wisdom (Survival) checks to track your favored enemies, as well as on Intelligence checks to recall information about them.",
      "When you gain this feature, you also learn one language of your choice that is spoken by your favored enemies, if they speak one at all.",
      "You choose one additional favored enemy, as well as an associated language, at 6th and 14th level. As you gain levels, your choices should reflect the types of monsters you have encountered on your adventures.",
    ],
    prerequisites: [],
    featureSpecific: {
      enemy_type_options: {
        desc: "one enemy type",
        choose: 1,
        type: "string",
        from: {
          option_set_type: "options_array",
          options: [
            "aberrations",
            "beasts",
            "celestials",
            "constructs",
            "dragons",
            "elementals",
            "fey",
            "fiends",
            "giants",
            "monstrosities",
            "oozes",
            "plants",
            "undead",
            "humanoids",
          ],
        },
      },
    },
  },
  {
    sourceIndex: "natural-explorer-2-terrain-types",
    name: "Natural Explorer (2 terrain types)",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 6,
    desc: [
      "You are particularly familiar with one type of natural environment and are adept at traveling and surviving in such regions. Choose one type of favored terrain: arctic, coast, desert, forest, grassland, mountain, or swamp. When you make an Intelligence or Wisdom check related to your favored terrain, your proficiency bonus is doubled if you are using a skill that you're proficient in.",
      "While traveling for an hour or more in your favored terrain, you gain the following benefits:",
      "- Difficult terrain doesn't slow your group's travel.",
      "- Your group can't become lost except by magical means.",
      "- Even when you are engaged in another activity while traveling (such as foraging, navigating, or tracking), you remain alert to danger.",
      "- If you are traveling alone, you can move stealthily at a normal pace.",
      "- When you forage, you find twice as much food as you normally would.",
      "- While tracking other creatures, you also learn their exact number, their sizes, and how long ago they passed through the area.",
      "You choose additional favored terrain types at 6th and 10th level.",
    ],
    prerequisites: [],
    featureSpecific: {
      terrain_type_options: {
        desc: "one terrain type",
        choose: 1,
        type: "string",
        from: {
          option_set_type: "options_array",
          options: ["arctic", "coast", "desert", "forest", "grassland", "mountain", "swamp"],
        },
      },
    },
  },
  {
    sourceIndex: "ranger-archetype-improvement-1",
    name: "Ranger Archetype feature",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 7,
    desc: [
      "At 3rd level, you choose an archetype that you strive to emulate, such as the Hunter. Your choice grants you features at 3rd level and again at 7th, 11th, and 15th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "defensive-tactics",
    name: "Defensive Tactics",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 7,
    desc: [
      "At 7th level, you gain one of the following features of your choice.",
      "Escape the Horde",
      "Multiattack Defense",
      "Steel Will",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "defensive-tactics-escape-the-horde",
                name: "Defensive Tactics: Escape the Horde",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "defensive-tactics-multiattack-defense",
                name: "Defensive Tactics: Multiattack Defense",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "defensive-tactics-steel-will",
                name: "Defensive Tactics: Steel Will",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "defensive-tactics-escape-the-horde",
    name: "Defensive Tactics: Escape the Horde",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 7,
    desc: ["Opportunity attacks against you are made with disadvantage."],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    parent: {
      index: "defensive-tactics",
      name: "Defensive Tactics",
    },
  },
  {
    sourceIndex: "defensive-tactics-multiattack-defense",
    name: "Defensive Tactics: Multiattack Defense",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 7,
    desc: [
      "When a creature hits you with an attack, you gain a +4 bonus to AC against all subsequent attacks made by that creature for the rest of the turn.",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    parent: {
      index: "defensive-tactics",
      name: "Defensive Tactics",
    },
  },
  {
    sourceIndex: "defensive-tactics-steel-will",
    name: "Defensive Tactics: Steel Will",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 7,
    desc: ["You have advantage on saving throws against being frightened."],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    parent: {
      index: "defensive-tactics",
      name: "Defensive Tactics",
    },
  },
  {
    sourceIndex: "ranger-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "ranger-lands-stride",
    name: "Land's Stride",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 8,
    desc: [
      "Starting at 8th level, moving through nonmagical difficult terrain costs you no extra movement. You can also pass through nonmagical plants without being slowed by them and without taking damage from them if they have thorns, spines, or a similar hazard.",
      "In addition, you have advantage on saving throws against plants that are magically created or manipulated to impede movement, such those created by the entangle spell.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "natural-explorer-3-terrain-types",
    name: "Natural Explorer (3 terrain types)",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 10,
    desc: [
      "You are particularly familiar with one type of natural environment and are adept at traveling and surviving in such regions. Choose one type of favored terrain: arctic, coast, desert, forest, grassland, mountain, or swamp. When you make an Intelligence or Wisdom check related to your favored terrain, your proficiency bonus is doubled if you are using a skill that you're proficient in.",
      "While traveling for an hour or more in your favored terrain, you gain the following benefits:",
      "- Difficult terrain doesn't slow your group's travel.",
      "- Your group can't become lost except by magical means.",
      "- Even when you are engaged in another activity while traveling (such as foraging, navigating, or tracking), you remain alert to danger.",
      "- If you are traveling alone, you can move stealthily at a normal pace.",
      "- When you forage, you find twice as much food as you normally would.",
      "- While tracking other creatures, you also learn their exact number, their sizes, and how long ago they passed through the area.",
      "You choose additional favored terrain types at 6th and 10th level.",
    ],
    prerequisites: [],
    featureSpecific: {
      terrain_type_options: {
        desc: "one terrain type",
        choose: 1,
        type: "string",
        from: {
          option_set_type: "options_array",
          options: ["arctic", "coast", "desert", "forest", "grassland", "mountain", "swamp"],
        },
      },
    },
  },
  {
    sourceIndex: "hide-in-plain-sight",
    name: "Hide in Plain Sight",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 10,
    desc: [
      "Starting at 10th level, you can spend 1 minute creating camouflage for yourself. You must have access to fresh mud, dirt, plants, soot, and other naturally occurring materials with which to create your camouflage.",
      "Once you are camouflaged in this way, you can try to hide by pressing yourself up against a solid surface, such as a tree or wall, that is at least as tall and wide as you are. You gain a +10 bonus to Dexterity (Stealth) checks as long as you remain there without moving or taking actions. Once you move or take an action or a reaction, you must camouflage yourself again to gain this benefit.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "ranger-archetype-improvement-2",
    name: "Ranger Archetype feature",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 11,
    desc: [
      "At 3rd level, you choose an archetype that you strive to emulate, such as the Hunter. Your choice grants you features at 3rd level and again at 7th, 11th, and 15th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "multiattack",
    name: "Multiattack",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 11,
    desc: [
      "At 11th level, you gain one of the following features of your choice.",
      "Volley",
      "Whirlwind Attack",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "multiattack-volley",
                name: "Multiattack: Volley",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "multiattack-whirlwind-attack",
                name: "Multiattack: Whirlwind Attack",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "multiattack-volley",
    name: "Multiattack: Volley",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 11,
    desc: [
      "You can use your action to make a ranged attack against any number of creatures within 10 feet of a point you can see within your weapon's range. You must have ammunition for each target, as normal, and you make a separate attack roll for each target.",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    parent: {
      index: "multiattack",
      name: "Multiattack",
    },
  },
  {
    sourceIndex: "multiattack-whirlwind-attack",
    name: "Multiattack: Whirlwind Attack",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 11,
    desc: [
      "You can use your action to make a melee attack against any number of creatures within 5 feet of you, with a separate attack roll for each target.",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    parent: {
      index: "multiattack",
      name: "Multiattack",
    },
  },
  {
    sourceIndex: "ranger-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "favored-enemy-3-enemies",
    name: "Favored Enemy (3 enemies)",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 14,
    desc: [
      "Beginning at 1st level, you have significant experience studying, tracking, hunting, and even talking to a certain type of enemy.",
      "Choose a type of favored enemy: aberrations, beasts, celestials, constructs, dragons, elementals, fey, fiends, giants, monstrosities, oozes, plants, or undead. Alternatively, you can select two races of humanoid (such as gnolls and orcs) as favored enemies.",
      "You have advantage on Wisdom (Survival) checks to track your favored enemies, as well as on Intelligence checks to recall information about them.",
      "When you gain this feature, you also learn one language of your choice that is spoken by your favored enemies, if they speak one at all.",
      "You choose one additional favored enemy, as well as an associated language, at 6th and 14th level. As you gain levels, your choices should reflect the types of monsters you have encountered on your adventures.",
    ],
    prerequisites: [],
    featureSpecific: {
      enemy_type_options: {
        desc: "one enemy type",
        choose: 1,
        type: "string",
        from: {
          option_set_type: "options_array",
          options: [
            "aberrations",
            "beasts",
            "celestials",
            "constructs",
            "dragons",
            "elementals",
            "fey",
            "fiends",
            "giants",
            "monstrosities",
            "oozes",
            "plants",
            "undead",
            "humanoids",
          ],
        },
      },
    },
  },
  {
    sourceIndex: "vanish",
    name: "Vanish",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 14,
    desc: [
      "Starting at 14th level, you can use the Hide action as a bonus action on your turn. Also, you can't be tracked by nonmagical means, unless you choose to leave a trail.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "ranger-archetype-improvement-3",
    name: "Ranger Archetype feature",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 15,
    desc: [
      "At 3rd level, you choose an archetype that you strive to emulate, such as the Hunter. Your choice grants you features at 3rd level and again at 7th, 11th, and 15th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "superior-hunters-defense",
    name: "Superior Hunter's Defense",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 15,
    desc: [
      "At 15th level, you gain one of the following features of your choice.",
      "Evasion",
      "Stand Against the Tide",
      "Uncanny Dodge",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "superior-hunters-defense-evasion",
                name: "Superior Hunter's Defense: Evasion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "superior-hunters-defense-stand-against-the-tide",
                name: "Superior Hunter's Defense: Stand Against the Tide",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "superior-hunters-defense-uncanny-dodge",
                name: "Superior Hunter's Defense: Uncanny Dodge",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "superior-hunters-defense-evasion",
    name: "Superior Hunter's Defense: Evasion",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 15,
    desc: [
      "When you are subjected to an effect, such as a red dragon's fiery breath or a lightning bolt spell, that allows you to make a Dexterity saving throw to take only half damage, you instead take no damage if you succeed on the saving throw, and only half damage if you fail.",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    parent: {
      index: "superior-hunters-defense",
      name: "Superior Hunter's Defense",
    },
  },
  {
    sourceIndex: "superior-hunters-defense-stand-against-the-tide",
    name: "Superior Hunter's Defense: Stand Against the Tide",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 15,
    desc: [
      "When a hostile creature misses you with a melee attack, you can use your reaction to force that creature to repeat the same attack against another creature (other than itself) of your choice.",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    parent: {
      index: "superior-hunters-defense",
      name: "Superior Hunter's Defense",
    },
  },
  {
    sourceIndex: "superior-hunters-defense-uncanny-dodge",
    name: "Superior Hunter's Defense: Uncanny Dodge",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 15,
    desc: [
      "When an attacker that you can see hits you with an attack, you can use your reaction to halve the attack's damage against you.",
    ],
    prerequisites: [],
    subclass: {
      index: "hunter",
      name: "Hunter",
    },
    parent: {
      index: "superior-hunters-defense",
      name: "Superior Hunter's Defense",
    },
  },
  {
    sourceIndex: "ranger-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "feral-senses",
    name: "Feral Senses",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 18,
    desc: [
      "At 18th level, you gain preternatural senses that help you fight creatures you can't see. When you attack a creature you can't see, your inability to see it doesn't impose disadvantage on your attack rolls against it.",
      "You are also aware of the location of any invisible creature within 30 feet of you, provided that the creature isn't hidden from you and you aren't blinded or deafened.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "ranger-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "foe-slayer",
    name: "Foe Slayer",
    class: {
      index: "ranger",
      name: "Ranger",
    },
    level: 20,
    desc: [
      "At 20th level, you become an unparalleled hunter of your enemies. Once on each of your turns, you can add your Wisdom modifier to the attack roll or the damage roll of an attack you make against one of your favored enemies. You can choose to use this feature before or after the roll, but before any effects of the roll are applied.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "rogue-expertise-1",
    name: "Expertise",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 1,
    desc: [
      "At 1st level, choose two of your skill proficiencies, or one of your skill proficiencies and your proficiency with thieves' tools. Your proficiency bonus is doubled for any ability check you make that uses either of the chosen proficiencies.",
      "At 6th level, you can choose two more of your proficiencies (in skills or with thieves' tools) to gain this benefit",
    ],
    prerequisites: [],
    featureSpecific: {
      expertise_options: {
        choose: 1,
        type: "proficiency",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "choice",
              choice: {
                choose: 2,
                type: "proficiency",
                from: {
                  option_set_type: "options_array",
                  options: [
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-acrobatics",
                        name: "Skill: Acrobatics",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-animal-handling",
                        name: "Skill: Animal Handling",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-arcana",
                        name: "Skill: Arcana",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-athletics",
                        name: "Skill: Athletics",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-deception",
                        name: "Skill: Deception",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-history",
                        name: "Skill: History",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-insight",
                        name: "Skill: Insight",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-intimidation",
                        name: "Skill: Intimidation",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-investigation",
                        name: "Skill: Investigation",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-medicine",
                        name: "Skill: Medicine",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-nature",
                        name: "Skill: Nature",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-perception",
                        name: "Skill: Perception",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-performance",
                        name: "Skill: Performance",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-persuasion",
                        name: "Skill: Persuasion",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-religion",
                        name: "Skill: Religion",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-sleight-of-hand",
                        name: "Skill: Sleight of Hand",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-stealth",
                        name: "Skill: Stealth",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "skill-survival",
                        name: "Skill: Survival",
                      },
                    },
                  ],
                },
              },
            },
            {
              option_type: "multiple",
              items: [
                {
                  option_type: "choice",
                  choice: {
                    choose: 1,
                    type: "proficiency",
                    from: {
                      option_set_type: "options_array",
                      options: [
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-acrobatics",
                            name: "Skill: Acrobatics",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-animal-handling",
                            name: "Skill: Animal Handling",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-arcana",
                            name: "Skill: Arcana",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-athletics",
                            name: "Skill: Athletics",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-deception",
                            name: "Skill: Deception",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-history",
                            name: "Skill: History",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-insight",
                            name: "Skill: Insight",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-intimidation",
                            name: "Skill: Intimidation",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-investigation",
                            name: "Skill: Investigation",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-medicine",
                            name: "Skill: Medicine",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-nature",
                            name: "Skill: Nature",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-perception",
                            name: "Skill: Perception",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-performance",
                            name: "Skill: Performance",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-persuasion",
                            name: "Skill: Persuasion",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-religion",
                            name: "Skill: Religion",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-sleight-of-hand",
                            name: "Skill: Sleight of Hand",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-stealth",
                            name: "Skill: Stealth",
                          },
                        },
                        {
                          option_type: "reference",
                          item: {
                            index: "skill-survival",
                            name: "Skill: Survival",
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "thieves-tools",
                    name: "Thieves' Tools",
                  },
                },
              ],
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "sneak-attack",
    name: "Sneak Attack",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 1,
    desc: [
      "Beginning at 1st level, you know how to strike subtly and exploit a foe's distraction. Once per turn, you can deal an extra 1d6 damage to one creature you hit with an attack if you have advantage on the attack roll. The attack must use a finesse or a ranged weapon.",
      "You don't need advantage on the attack roll if another enemy of the target is within 5 feet of it, that enemy isn't incapacitated, and you don't have disadvantage on the attack roll.",
      "The amount of the extra damage increases as you gain levels in this class, as shown in the Sneak Attack column of the Rogue table.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "thieves-cant",
    name: "Thieves' Cant",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 1,
    desc: [
      "During your rogue training you learned thieves' cant, a secret mix of dialect, jargon, and code that allows you to hide messages in seemingly normal conversation. Only another creature that knows thieves' cant understands such messages. It takes four times longer to convey such a message than it does to speak the same idea plainly.",
      "In addition, you understand a set of secret signs and symbols used to convey short, simple messages, such as whether an area is dangerous or the territory of a thieves' guild, whether loot is nearby, or whether the people in an area are easy marks or will provide a safe house for thieves on the run.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "cunning-action",
    name: "Cunning Action",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 2,
    desc: [
      "Starting at 2nd level, your quick thinking and agility allow you to move and act quickly. You can take a bonus action on each of your turns in combat. This action can be used only to take the Dash, Disengage, or Hide action.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "roguish-archetype",
    name: "Roguish Archetype",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 3,
    desc: [
      "At 3rd level, you choose an archetype that you emulate in the exercise of your rogue abilities, such as Thief. Additional archetypes are available in the original source material. Your archetype choice grants you features at 3rd level and then again at 9th, 13th, and 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "fast-hands",
    name: "Fast Hands",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 3,
    desc: [
      "Starting at 3rd level, you can use the bonus action granted by your Cunning Action to make a Dexterity (Sleight of Hand) check, use your thieves' tools to disarm a trap or open a lock, or take the Use an Object action.",
    ],
    prerequisites: [],
    subclass: {
      index: "thief",
      name: "Thief",
    },
  },
  {
    sourceIndex: "second-story-work",
    name: "Second-Story Work",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 3,
    desc: [
      "When you choose this archetype at 3rd level, you gain the ability to climb faster than normal; climbing no longer costs you extra movement.",
      "In addition, when you make a running jump, the distance you cover increases by a number of feet equal to your Dexterity modifier.",
    ],
    prerequisites: [],
    subclass: {
      index: "thief",
      name: "Thief",
    },
  },
  {
    sourceIndex: "rogue-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 8th, 10th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "uncanny-dodge",
    name: "Uncanny Dodge",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 5,
    desc: [
      "Starting at 5th level, when an attacker that you can see hits you with an attack, you can use your reaction to halve the attack's damage against you.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "rogue-expertise-2",
    name: "Expertise",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 6,
    desc: [
      "At 1st level, choose two of your skill proficiencies, or one of your skill proficiencies and your proficiency with thieves' tools. Your proficiency bonus is doubled for any ability check you make that uses either of the chosen proficiencies.",
      "At 6th level, you can choose two more of your proficiencies (in skills or with thieves' tools) to gain this benefit",
    ],
    prerequisites: [],
    featureSpecific: {
      expertise_options: {
        choose: 2,
        type: "proficiency",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-acrobatics",
                name: "Skill: Acrobatics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-animal-handling",
                name: "Skill: Animal Handling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-arcana",
                name: "Skill: Arcana",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-athletics",
                name: "Skill: Athletics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-deception",
                name: "Skill: Deception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-history",
                name: "Skill: History",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-intimidation",
                name: "Skill: Intimidation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-investigation",
                name: "Skill: Investigation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-medicine",
                name: "Skill: Medicine",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-nature",
                name: "Skill: Nature",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-perception",
                name: "Skill: Perception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-performance",
                name: "Skill: Performance",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-persuasion",
                name: "Skill: Persuasion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-religion",
                name: "Skill: Religion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-sleight-of-hand",
                name: "Skill: Sleight of Hand",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-stealth",
                name: "Skill: Stealth",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-survival",
                name: "Skill: Survival",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "thieves-tools",
                name: "Thieves' Tools",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "rogue-evasion",
    name: "Evasion",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 7,
    desc: [
      "Beginning at 7th level, you can nimbly dodge out of the way of certain area effects, such as a red dragon's fiery breath or an ice storm spell. When you are subjected to an effect that allows you to make a Dexterity saving throw to take only half damage, you instead take no damage if you succeed on the saving throw, and only half damage if you fail.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "rogue-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 8th, 10th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "roguish-archetype-improvement-1",
    name: "Roguish Archetype feature",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 9,
    desc: [
      "At 3rd level, you choose an archetype that you emulate in the exercise of your rogue abilities, such as Thief. Additional archetypes are available in the original source material. Your archetype choice grants you features at 3rd level and then again at 9th, 13th, and 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "supreme-sneak",
    name: "Supreme Sneak",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 9,
    desc: [
      "Starting at 9th level, you have advantage on a Dexterity (Stealth) check if you move no more than half your speed on the same turn.",
    ],
    prerequisites: [],
    subclass: {
      index: "thief",
      name: "Thief",
    },
  },
  {
    sourceIndex: "rogue-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 10,
    desc: [
      "When you reach 4th level, and again at 8th, 10th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "reliable-talent",
    name: "Reliable Talent",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 11,
    desc: [
      "By 11th level, you have refined your chosen skills until they approach perfection. Whenever you make an ability check that lets you add your proficiency bonus, you can treat a d20 roll of 9 or lower as a 10.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "rogue-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 8th, 10th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "roguish-archetype-improvement-2",
    name: "Roguish Archetype feature",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 13,
    desc: [
      "At 3rd level, you choose an archetype that you emulate in the exercise of your rogue abilities, such as Thief. Additional archetypes are available in the original source material. Your archetype choice grants you features at 3rd level and then again at 9th, 13th, and 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "use-magic-device",
    name: "Use Magic Device",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 13,
    desc: [
      "By 13th level, you have learned enough about the workings of magic that you can improvise the use of items even when they are not intended for you. You ignore all class, race, and level requirements on the use of magic items.",
    ],
    prerequisites: [],
    subclass: {
      index: "thief",
      name: "Thief",
    },
  },
  {
    sourceIndex: "blindsense",
    name: "Blindsense",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 14,
    desc: [
      "Starting at 14th level, if you are able to hear, you are aware of the location of any hidden or invisible creature within 10 feet of you.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "slippery-mind",
    name: "Slippery Mind",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 15,
    desc: [
      "By 15th level, you have acquired greater mental strength. You gain proficiency in Wisdom saving throws.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "rogue-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 8th, 10th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "roguish-archetype-improvement-3",
    name: "Roguish Archetype feature",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 17,
    desc: [
      "At 3rd level, you choose an archetype that you emulate in the exercise of your rogue abilities, such as Thief. Additional archetypes are available in the original source material. Your archetype choice grants you features at 3rd level and then again at 9th, 13th, and 17th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "thiefs-reflexes",
    name: "Thief's Reflexes",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 17,
    desc: [
      "When you reach 17th level, you have become adept at laying ambushes and quickly escaping danger. You can take two turns during the first round of any combat. You take your first turn at your normal initiative and your second turn at your initiative minus 10. You can't use this feature when you are surprised.",
    ],
    prerequisites: [],
    subclass: {
      index: "thief",
      name: "Thief",
    },
  },
  {
    sourceIndex: "elusive",
    name: "Elusive",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 18,
    desc: [
      "Beginning at 18th level, you are so evasive that attackers rarely gain the upper hand against you. No attack roll has advantage against you while you aren't incapacitated.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "rogue-ability-score-improvement-6",
    name: "Ability Score Improvement",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 8th, 10th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "stroke-of-luck",
    name: "Stroke of Luck",
    class: {
      index: "rogue",
      name: "Rogue",
    },
    level: 20,
    desc: [
      "At 20th level, you have an uncanny knack for succeeding when you need to. If your attack misses a target within range, you can turn the miss into a hit. Alternatively, if you fail an ability check, you can treat the d20 roll as a 20.",
      "Once you use this feature, you can't use it again until you finish a short or long rest.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "spellcasting-sorcerer",
    name: "Spellcasting: Sorcerer",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "An event in your past, or in the life of a parent or ancestor, left an indelible mark on you, infusing you with arcane magic. This font of magic, whatever its origin, fuels your spells.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "sorcerous-origin",
    name: "Sorcerous Origin",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "Choose a sorcerous origin, which describes the source of your innate magical power, such as Draconic Bloodline.",
      "Your choice grants you features when you choose it at 1st level and again at 6th, 14th, and 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "dragon-ancestor",
    name: "Dragon Ancestor",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "At 1st level, you choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later.",
      "You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "dragon-ancestor-black---acid-damage",
                name: "Dragon Ancestor: Black - Acid Damage",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "dragon-ancestor-blue---lightning-damage",
                name: "Dragon Ancestor: Blue - Lightning Damage",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "dragon-ancestor-brass---fire-damage",
                name: "Dragon Ancestor: Brass - Fire Damage",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "dragon-ancestor-bronze---lightning-damage",
                name: "Dragon Ancestor: Bronze - Lightning Damage",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "dragon-ancestor-copper---acid-damage",
                name: "Dragon Ancestor: Copper - Acid Damage",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "dragon-ancestor-gold---fire-damage",
                name: "Dragon Ancestor: Gold - Fire Damage",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "dragon-ancestor-green---poison-damage",
                name: "Dragon Ancestor: Green - Poison Damage",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "dragon-ancestor-red---fire-damage",
                name: "Dragon Ancestor: Red - Fire Damage",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "dragon-ancestor-silver---cold-damage",
                name: "Dragon Ancestor: Silver - Cold Damage",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "dragon-ancestor-white---cold-damage",
                name: "Dragon Ancestor: White - Cold Damage",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "dragon-ancestor-black---acid-damage",
    name: "Dragon Ancestor: Black - Acid Damage",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "At 1st level, you choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later.",
      "You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
    parent: {
      index: "dragon-ancestor",
      name: "Dragon Ancestor",
    },
  },
  {
    sourceIndex: "dragon-ancestor-blue---lightning-damage",
    name: "Dragon Ancestor: Blue - Lightning Damage",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "At 1st level, you choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later.",
      "You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
    parent: {
      index: "dragon-ancestor",
      name: "Dragon Ancestor",
    },
  },
  {
    sourceIndex: "dragon-ancestor-brass---fire-damage",
    name: "Dragon Ancestor: Brass - Fire Damage",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "At 1st level, you choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later.",
      "You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
    parent: {
      index: "dragon-ancestor",
      name: "Dragon Ancestor",
    },
  },
  {
    sourceIndex: "dragon-ancestor-bronze---lightning-damage",
    name: "Dragon Ancestor: Bronze - Lightning Damage",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "At 1st level, you choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later.",
      "You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
    parent: {
      index: "dragon-ancestor",
      name: "Dragon Ancestor",
    },
  },
  {
    sourceIndex: "dragon-ancestor-copper---acid-damage",
    name: "Dragon Ancestor: Copper - Acid Damage",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "At 1st level, you choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later.",
      "You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
    parent: {
      index: "dragon-ancestor",
      name: "Dragon Ancestor",
    },
  },
  {
    sourceIndex: "dragon-ancestor-gold---fire-damage",
    name: "Dragon Ancestor: Gold - Fire Damage",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "At 1st level, you choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later.",
      "You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
    parent: {
      index: "dragon-ancestor",
      name: "Dragon Ancestor",
    },
  },
  {
    sourceIndex: "dragon-ancestor-green---poison-damage",
    name: "Dragon Ancestor: Green - Poison Damage",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "At 1st level, you choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later.",
      "You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
    parent: {
      index: "dragon-ancestor",
      name: "Dragon Ancestor",
    },
  },
  {
    sourceIndex: "dragon-ancestor-red---fire-damage",
    name: "Dragon Ancestor: Red - Fire Damage",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "At 1st level, you choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later.",
      "You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
    parent: {
      index: "dragon-ancestor",
      name: "Dragon Ancestor",
    },
  },
  {
    sourceIndex: "dragon-ancestor-silver---cold-damage",
    name: "Dragon Ancestor: Silver - Cold Damage",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "At 1st level, you choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later.",
      "You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
    parent: {
      index: "dragon-ancestor",
      name: "Dragon Ancestor",
    },
  },
  {
    sourceIndex: "dragon-ancestor-white---cold-damage",
    name: "Dragon Ancestor: White - Cold Damage",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "At 1st level, you choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later.",
      "You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
    parent: {
      index: "dragon-ancestor",
      name: "Dragon Ancestor",
    },
  },
  {
    sourceIndex: "draconic-resilience",
    name: "Draconic Resilience",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 1,
    desc: [
      "As magic flows through your body, it causes physical traits of your dragon ancestors to emerge. At 1st level, your hit point maximum increases by 1 and increases by 1 again whenever you gain a level in this class.",
      "Additionally, parts of your skin are covered by a thin sheen of dragon-like scales. When you aren't wearing armor, your AC equals 13 + your Dexterity modifier.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
  },
  {
    sourceIndex: "font-of-magic",
    name: "Font of Magic",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 2,
    desc: [
      "At 2nd level, you tap into a deep wellspring of magic within yourself. This wellspring is represented by sorcery points, which allow you to create a variety of magical effects.",
      "Sorcery Points",
      "You have 2 sorcery points, and you gain more as you reach higher levels, as shown in the Sorcery Points column of the Sorcerer table. You can never have more sorcery points than shown on the table for your level. You regain all spent sorcery points when you finish a long rest.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "flexible-casting-creating-spell-slots",
    name: "Flexible Casting: Creating Spell Slots",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 2,
    desc: [
      "You can transform unexpended sorcery points into one spell slot as a bonus action on your turn. The Creating Spell Slots table shows the cost of creating a spell slot of a given level. You can create spell slots no higher in level than 5th. ",
      "Any spell slot you create with this feature vanishes when you finish a long rest.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "flexible-casting-converting-spell-slot",
    name: "Flexible Casting: Converting Spell Slot",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 2,
    desc: [
      "As a bonus action on your turn, you can expend one spell slot and gain a number of sorcery points equal to the slot's level..",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "metamagic-1",
    name: "Metamagic",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 3,
    desc: [
      "At 3rd level, you gain the ability to twist your spells to suit your needs. You gain two of the following Metamagic options of your choice. You gain another one at 10th and 17th level.",
      "You can use only one Metamagic option on a spell when you cast it, unless otherwise noted.",
    ],
    prerequisites: [],
    featureSpecific: {
      subfeature_options: {
        choose: 2,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "metamagic-careful-spell",
                name: "Metamagic: Careful Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-distant-spell",
                name: "Metamagic: Distant Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-empowered-spell",
                name: "Metamagic: Empowered Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-extended-spell",
                name: "Metamagic: Extended Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-heightened-spell",
                name: "Metamagic: Heightened Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-quickened-spell",
                name: "Metamagic: Quickened Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-subtle-spell",
                name: "Metamagic: Subtle Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-twinned-spell",
                name: "Metamagic: Twinned Spell",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "metamagic-careful-spell",
    name: "Metamagic: Careful Spell",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 3,
    desc: [
      "When you cast a spell that forces other creatures to make a saving throw, you can protect some of those creatures from the spell's full force. To do so, you spend 1 sorcery point and choose a number of those creatures up to your Charisma modifier (minimum of one creature). A chosen creature automatically succeeds on its saving throw against the spell.",
    ],
    prerequisites: [],
    parent: {
      index: "metamagic-1",
      name: "Metamagic",
    },
  },
  {
    sourceIndex: "metamagic-distant-spell",
    name: "Metamagic: Distant Spell",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 3,
    desc: [
      "When you cast a spell that has a range of 5 feet or greater, you can spend 1 sorcery point to double the range of the spell.",
      "When you cast a spell that has a range of touch, you can spend 1 sorcery point to make the range of the spell 30 feet.",
    ],
    prerequisites: [],
    parent: {
      index: "metamagic-1",
      name: "Metamagic",
    },
  },
  {
    sourceIndex: "metamagic-empowered-spell",
    name: "Metamagic: Empowered Spell",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 3,
    desc: [
      "When you roll damage for a spell, you can spend 1 sorcery point to reroll a number of the damage dice up to your Charisma modifier (minimum of one). You must use the new rolls.",
      "You can use Empowered Spell even if you have already used a different Metamagic option during the casting of the spell.",
    ],
    prerequisites: [],
    parent: {
      index: "metamagic-1",
      name: "Metamagic",
    },
  },
  {
    sourceIndex: "metamagic-extended-spell",
    name: "Metamagic: Extended Spell",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 3,
    desc: [
      "When you cast a spell that has a duration of 1 minute or longer, you can spend 1 sorcery point to double its duration, to a maximum duration of 24 hours.",
    ],
    prerequisites: [],
    parent: {
      index: "metamagic-1",
      name: "Metamagic",
    },
  },
  {
    sourceIndex: "metamagic-heightened-spell",
    name: "Metamagic: Heightened Spell",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 3,
    desc: [
      "When you cast a spell that forces a creature to make a saving throw to resist its effects, you can spend 3 sorcery points to give one target of the spell disadvantage on its first saving throw made against the spell.",
    ],
    prerequisites: [],
    parent: {
      index: "metamagic-1",
      name: "Metamagic",
    },
  },
  {
    sourceIndex: "metamagic-quickened-spell",
    name: "Metamagic: Quickened Spell",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 3,
    desc: [
      "When you cast a spell that has a casting time of 1 action, you can spend 2 sorcery points to change the casting time to 1 bonus action for this casting.",
    ],
    prerequisites: [],
    parent: {
      index: "metamagic-1",
      name: "Metamagic",
    },
  },
  {
    sourceIndex: "metamagic-subtle-spell",
    name: "Metamagic: Subtle Spell",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 3,
    desc: [
      "When you cast a spell, you can spend 1 sorcery point to cast it without any somatic or verbal components.",
    ],
    prerequisites: [],
    parent: {
      index: "metamagic-1",
      name: "Metamagic",
    },
  },
  {
    sourceIndex: "metamagic-twinned-spell",
    name: "Metamagic: Twinned Spell",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 3,
    desc: [
      "When you cast a spell that targets only one creature and doesn't have a range of self, you can spend a number of sorcery points equal to the spell's level to target a second creature in range with the same spell (1 sorcery point if the spell is a cantrip).",
      "To be eligible, a spell must be incapable of targeting more than one creature at the spell's current level. For example, magic missile and scorching ray aren't eligible, but ray of frost is.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "sorcerer-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "sorcerous-origin-improvement-1",
    name: "Sorcerous Origin feature",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 6,
    desc: [
      "Choose a sorcerous origin, which describes the source of your innate magical power, such as Draconic Bloodline.",
      "Your choice grants you features when you choose it at 1st level and again at 6th, 14th, and 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "elemental-affinity",
    name: "Elemental Affinity",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 6,
    desc: [
      "Starting at 6th level, when you cast a spell that deals damage of the type associated with your draconic ancestry, you can add your Charisma modifier to one damage roll of that spell. At the same time, you can spend 1 sorcery point to gain resistance to that damage type for 1 hour.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
  },
  {
    sourceIndex: "sorcerer-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "metamagic-2",
    name: "Metamagic",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 10,
    desc: [
      "At 3rd level, you gain the ability to twist your spells to suit your needs. You gain two of the following Metamagic options of your choice. You gain another one at 10th and 17th level.",
      "You can use only one Metamagic option on a spell when you cast it, unless otherwise noted.",
    ],
    prerequisites: [],
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "metamagic-careful-spell",
                name: "Metamagic: Careful Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-distant-spell",
                name: "Metamagic: Distant Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-empowered-spell",
                name: "Metamagic: Empowered Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-extended-spell",
                name: "Metamagic: Extended Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-heightened-spell",
                name: "Metamagic: Heightened Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-quickened-spell",
                name: "Metamagic: Quickened Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-subtle-spell",
                name: "Metamagic: Subtle Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-twinned-spell",
                name: "Metamagic: Twinned Spell",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "sorcerer-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "sorcerous-origin-improvement-2",
    name: "Sorcerous Origin feature",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 14,
    desc: [
      "Choose a sorcerous origin, which describes the source of your innate magical power, such as Draconic Bloodline.",
      "Your choice grants you features when you choose it at 1st level and again at 6th, 14th, and 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "dragon-wings",
    name: "Dragon Wings",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 14,
    desc: [
      "At 14th level, you gain the ability to sprout a pair of dragon wings from your back, gaining a flying speed equal to your current speed. You can create these wings as a bonus action on your turn. They last until you dismiss them as a bonus action on your turn.",
      "You can't manifest your wings while wearing armor unless the armor is made to accommodate them, and clothing not made to accommodate your wings might be destroyed when you manifest them.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
  },
  {
    sourceIndex: "sorcerer-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "metamagic-3",
    name: "Metamagic",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 17,
    desc: [
      "At 3rd level, you gain the ability to twist your spells to suit your needs. You gain two of the following Metamagic options of your choice. You gain another one at 10th and 17th level.",
      "You can use only one Metamagic option on a spell when you cast it, unless otherwise noted.",
    ],
    prerequisites: [],
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "metamagic-careful-spell",
                name: "Metamagic: Careful Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-distant-spell",
                name: "Metamagic: Distant Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-empowered-spell",
                name: "Metamagic: Empowered Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-extended-spell",
                name: "Metamagic: Extended Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-heightened-spell",
                name: "Metamagic: Heightened Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-quickened-spell",
                name: "Metamagic: Quickened Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-subtle-spell",
                name: "Metamagic: Subtle Spell",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "metamagic-twinned-spell",
                name: "Metamagic: Twinned Spell",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "sorcerous-origin-improvement-3",
    name: "Sorcerous Origin feature",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 18,
    desc: [
      "Choose a sorcerous origin, which describes the source of your innate magical power, such as Draconic Bloodline.",
      "Your choice grants you features when you choose it at 1st level and again at 6th, 14th, and 18th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "draconic-presence",
    name: "Draconic Presence",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 18,
    desc: [
      "Beginning at 18th level, you can channel the dread presence of your dragon ancestor, causing those around you to become awestruck or frightened. As an action, you can spend 5 sorcery points to draw on this power and exude an aura of awe or fear (your choice) to a distance of 60 feet. For 1 minute or until you lose your concentration (as if you were casting a concentration spell), each hostile creature that starts its turn in this aura must succeed on a Wisdom saving throw or be charmed (if you chose awe) or frightened (if you chose fear) until the aura ends. A creature that succeeds on this saving throw is immune to your aura for 24 hours.",
    ],
    prerequisites: [],
    subclass: {
      index: "draconic",
      name: "Draconic",
    },
  },
  {
    sourceIndex: "sorcerer-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "sorcerous-restoration",
    name: "Sorcerous Restoration",
    class: {
      index: "sorcerer",
      name: "Sorcerer",
    },
    level: 20,
    desc: ["At 20th level, you regain 4 expended sorcery points whenever you finish a short rest."],
    prerequisites: [],
  },
  {
    sourceIndex: "otherworldly-patron",
    name: "Otherworldly Patron",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 1,
    desc: [
      "At 1st level, you have struck a bargain with an otherworldly being of your choice, such as the Fiend. Your choice grants you features at 1st level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "dark-ones-blessing",
    name: "Dark One's Blessing",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 1,
    desc: [
      "Starting at 1st level, when you reduce a hostile creature to 0 hit points, you gain temporary hit points equal to your Charisma modifier + your warlock level (minimum of 1).",
    ],
    prerequisites: [],
    subclass: {
      index: "fiend",
      name: "Fiend",
    },
  },
  {
    sourceIndex: "pact-magic",
    name: "Pact Magic",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 1,
    desc: [
      "Your arcane research and the magic bestowed on you by your patron have given you facility with spells.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "eldritch-invocations",
    name: "Eldritch Invocations",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: [
      "In your study of occult lore, you have unearthed eldritch invocations, fragments of forbidden knowledge that imbue you with an abiding magical ability.",
      "At 2nd level, you gain two eldritch invocations of your choice. Your invocation options are detailed at the end of the class description. When you gain certain warlock levels, you gain additional invocations of your choice, as shown in the Invocations Known column of the Warlock table.",
      "Additionally, when you gain a level in this class, you can choose one of the invocations you know and replace it with another invocation that you could learn at that level.",
    ],
    prerequisites: [],
    featureSpecific: {
      invocations: [
        {
          index: "eldritch-invocation-agonizing-blast",
          name: "Eldritch Invocation: Agonizing Blast",
        },
        {
          index: "eldritch-invocation-armor-of-shadows",
          name: "Eldritch Invocation: Armor of Shadows",
        },
        {
          index: "eldritch-invocation-beast-speech",
          name: "Eldritch Invocation: Beast Speech",
        },
        {
          index: "eldritch-invocation-beguiling-influence",
          name: "Eldritch Invocation: Beguiling Influence",
        },
        {
          index: "eldritch-invocation-book-of-ancient-secrets",
          name: "Eldritch Invocation: Book of Ancient Secrets",
        },
        {
          index: "eldritch-invocation-devils-sight",
          name: "Eldritch Invocation: Devil's Sight",
        },
        {
          index: "eldritch-invocation-eldritch-sight",
          name: "Eldritch Invocation: Eldritch Sight",
        },
        {
          index: "eldritch-invocation-eldritch-spear",
          name: "Eldritch Invocation: Eldritch Spear",
        },
        {
          index: "eldritch-invocation-eyes-of-the-rune-keeper",
          name: "Eldritch Invocation: Eyes of the Rune Keeper",
        },
        {
          index: "eldritch-invocation-fiendish-vigor",
          name: "Eldritch Invocation: Fiendish Vigor",
        },
        {
          index: "eldritch-invocation-gaze-of-two-minds",
          name: "Eldritch Invocation: Gaze of Two Minds",
        },
        {
          index: "eldritch-invocation-mask-of-many-faces",
          name: "Eldritch Invocation: Mask of Many Faces",
        },
        {
          index: "eldritch-invocation-misty-visions",
          name: "Eldritch Invocation: Misty Visions",
        },
        {
          index: "eldritch-invocation-repelling-blast",
          name: "Eldritch Invocation: Repelling Blast",
        },
        {
          index: "eldritch-invocation-thief-of-five-fates",
          name: "Eldritch Invocation: Thief of Five Fates",
        },
        {
          index: "eldritch-invocation-voice-of-the-chain-master",
          name: "Eldritch Invocation: Voice of the Chain Master",
        },
        {
          index: "eldritch-invocation-mire-the-mind",
          name: "Eldritch Invocation: Mire the Mind",
        },
        {
          index: "eldritch-invocation-one-with-shadows",
          name: "Eldritch Invocation: One with Shadows",
        },
        {
          index: "eldritch-invocation-sign-of-ill-omen",
          name: "Eldritch Invocation: Sign of Ill Omen",
        },
        {
          index: "eldritch-invocation-thirsting-blade",
          name: "Eldritch Invocation: Thirsting Blade",
        },
        {
          index: "eldritch-invocation-bewitching-whispers",
          name: "Eldritch Invocation: Bewitching Whispers",
        },
        {
          index: "eldritch-invocation-dreadful-word",
          name: "Eldritch Invocation: Dreadful Word",
        },
        {
          index: "eldritch-invocation-sculptor-of-flesh",
          name: "Eldritch Invocation: Sculptor of Flesh",
        },
        {
          index: "eldritch-invocation-ascendant-step",
          name: "Eldritch Invocation: Ascendant Step",
        },
        {
          index: "eldritch-invocation-minions-of-chaos",
          name: "Eldritch Invocation: Minions of Chaos",
        },
        {
          index: "eldritch-invocation-otherworldly-leap",
          name: "Eldritch Invocation: Otherworldly Leap",
        },
        {
          index: "eldritch-invocation-whispers-of-the-grave",
          name: "Eldritch Invocation: Whispers of the Grave",
        },
        {
          index: "eldritch-invocation-lifedrinker",
          name: "Eldritch Invocation: Lifedrinker",
        },
        {
          index: "eldritch-invocation-chains-of-carceri",
          name: "Eldritch Invocation: Chains of Carceri",
        },
        {
          index: "eldritch-invocation-master-of-myriad-forms",
          name: "Eldritch Invocation: Master of Myriad Forms",
        },
        {
          index: "eldritch-invocation-visions-of-distant-realms",
          name: "Eldritch Invocation: Visions of Distant Realms",
        },
        {
          index: "eldritch-invocation-witch-sight",
          name: "Eldritch Invocation: Witch Sight",
        },
      ],
    },
  },
  {
    sourceIndex: "eldritch-invocation-agonizing-blast",
    name: "Eldritch Invocation: Agonizing Blast",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: [
      "When you cast eldritch blast, add your Charisma modifier to the damage it deals on a hit.",
    ],
    prerequisites: [
      {
        type: "spell",
        spell: "/api/2014/spells/eldritch-blast",
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-armor-of-shadows",
    name: "Eldritch Invocation: Armor of Shadows",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: [
      "You can cast mage armor on yourself at will, without expending a spell slot or material components.",
    ],
    prerequisites: [],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-beast-speech",
    name: "Eldritch Invocation: Beast Speech",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: ["You can cast speak with animals at will, without expending a spell slot."],
    prerequisites: [],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-beguiling-influence",
    name: "Eldritch Invocation: Beguiling Influence",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: ["You gain proficiency in the Deception and Persuasion skills."],
    prerequisites: [],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-book-of-ancient-secrets",
    name: "Eldritch Invocation: Book of Ancient Secrets",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: [
      "You can now inscribe magical rituals in your Book of Shadows. Choose two 1st-level spells that have the ritual tag from any class's spell list (the two needn't be from the same list). The spells appear in the book and don't count against the number of spells you know. With your Book of Shadows in hand, you can cast the chosen spells as rituals. You can't cast the spells except as rituals, unless you've learned them by some other means. You can also cast a warlock spell you know as a ritual if it has the ritual tag.",
      "On your adventures, you can add other ritual spells to your Book of Shadows. When you find such a spell, you can add it to the book if the spell's level is equal to or less than half your warlock level (rounded up) and if you can spare the time to transcribe the spell. For each level of the spell, the transcription process takes 2 hours and costs 50 gp for the rare inks needed to inscribe it.",
    ],
    prerequisites: [
      {
        type: "feature",
        feature: "/api/2014/features/pact-of-the-tome",
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-devils-sight",
    name: "Eldritch Invocation: Devil's Sight",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: [
      "You can see normally in darkness, both magical and nonmagical, to a distance of 120 feet.",
    ],
    prerequisites: [],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-eldritch-sight",
    name: "Eldritch Invocation: Eldritch Sight",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: ["You can cast detect magic at will, without expending a spell slot."],
    prerequisites: [],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-eldritch-spear",
    name: "Eldritch Invocation: Eldritch Spear",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: ["When you cast eldritch blast, its range is 300 feet."],
    prerequisites: [
      {
        type: "spell",
        spell: "/api/2014/spells/eldritch-blast",
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-eyes-of-the-rune-keeper",
    name: "Eldritch Invocation: Eyes of the Rune Keeper",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: ["You can read all writing."],
    prerequisites: [],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-fiendish-vigor",
    name: "Eldritch Invocation: Fiendish Vigor",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: [
      "You can cast false life on yourself at will as a 1st-level spell, without expending a spell slot or material components.",
    ],
    prerequisites: [],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-gaze-of-two-minds",
    name: "Eldritch Invocation: Gaze of Two Minds",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: [
      "You can use your action to touch a willing humanoid and perceive through its senses until the end of your next turn. As long as the creature is on the same plane of existence as you, you can use your action on subsequent turns to maintain this connection, extending the duration until the end of your next turn. While perceiving through the other creature's senses, you benefit from any special senses possessed by that creature, and you are blinded and deafened to your own surroundings.",
    ],
    prerequisites: [],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-mask-of-many-faces",
    name: "Eldritch Invocation: Mask of Many Faces",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: ["You can cast disguise self at will, without expending a spell slot."],
    prerequisites: [],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-misty-visions",
    name: "Eldritch Invocation: Misty Visions",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: [
      "You can cast silent image at will, without expending a spell slot or material components.",
    ],
    prerequisites: [],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-repelling-blast",
    name: "Eldritch Invocation: Repelling Blast",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: [
      "When you hit a creature with eldritch blast, you can push the creature up to 10 feet away from you in a straight line.",
    ],
    prerequisites: [
      {
        type: "spell",
        spell: "/api/2014/spells/eldritch-blast",
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-thief-of-five-fates",
    name: "Eldritch Invocation: Thief of Five Fates",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: [
      "You can cast bane once using a warlock spell slot. You can't do so again until you finish a long rest.",
    ],
    prerequisites: [],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-voice-of-the-chain-master",
    name: "Eldritch Invocation: Voice of the Chain Master",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 2,
    desc: [
      "You can communicate telepathically with your familiar and perceive through your familiar's senses as long as you are on the same plane of existence.",
      "Additionally, while perceiving through your familiar's senses, you can also speak through your familiar in your own voice, even if your familiar is normally incapable of speech.",
    ],
    prerequisites: [
      {
        type: "feature",
        feature: "/api/2014/features/pact-of-the-chain",
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-mire-the-mind",
    name: "Eldritch Invocation: Mire the Mind",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 5,
    desc: [
      "You can cast slow once using a warlock spell slot. You can't do so again until you finish a long rest.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 5,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-one-with-shadows",
    name: "Eldritch Invocation: One with Shadows",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 5,
    desc: [
      "When you are in an area of dim light or darkness, you can use your action to become invisible until you move or take an action or a reaction.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 5,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-sign-of-ill-omen",
    name: "Eldritch Invocation: Sign of Ill Omen",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 5,
    desc: [
      "You can cast bestow curse once using a warlock spell slot. You can't do so again until you finish a long rest.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 5,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-thirsting-blade",
    name: "Eldritch Invocation: Thirsting Blade",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 5,
    desc: [
      "You can attack with your pact weapon twice, instead of once, whenever you take the Attack action on your turn.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 5,
      },
      {
        type: "feature",
        feature: "/api/2014/features/pact-of-the-blade",
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "otherworldly-patron-improvement-1",
    name: "Otherworldly Patron feature",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 6,
    desc: [
      "At 1st level, you have struck a bargain with an otherworldly being of your choice, such as the Fiend. Your choice grants you features at 1st level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "eldritch-invocation-bewitching-whispers",
    name: "Eldritch Invocation: Bewitching Whispers",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 7,
    desc: [
      "You can cast compulsion once using a warlock spell slot. You can't do so again until you finish a long rest.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 7,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-dreadful-word",
    name: "Eldritch Invocation: Dreadful Word",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 7,
    desc: [
      "You can cast confusion once using a warlock spell slot. You can't do so again until you finish a long rest.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 7,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-sculptor-of-flesh",
    name: "Eldritch Invocation: Sculptor of Flesh",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 7,
    desc: [
      "You can cast polymorph once using a warlock spell slot. You can't do so again until you finish a long rest.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 7,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-ascendant-step",
    name: "Eldritch Invocation: Ascendant Step",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 9,
    desc: [
      "You can cast levitate on yourself at will, without expending a spell slot or material components.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 9,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-minions-of-chaos",
    name: "Eldritch Invocation: Minions of Chaos",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 9,
    desc: [
      "You can cast conjure elemental once using a warlock spell slot. You can't do so again until you finish a long rest.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 9,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-otherworldly-leap",
    name: "Eldritch Invocation: Otherworldly Leap",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 9,
    desc: [
      "You can cast jump on yourself at will, without expending a spell slot or material components.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 9,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-whispers-of-the-grave",
    name: "Eldritch Invocation: Whispers of the Grave",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 9,
    desc: ["You can cast speak with dead at will, without expending a spell slot."],
    prerequisites: [
      {
        type: "level",
        level: 9,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "otherworldly-patron-improvement-2",
    name: "Otherworldly Patron feature",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 10,
    desc: [
      "At 1st level, you have struck a bargain with an otherworldly being of your choice, such as the Fiend. Your choice grants you features at 1st level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "eldritch-invocation-lifedrinker",
    name: "Eldritch Invocation: Lifedrinker",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 12,
    desc: [
      "When you hit a creature with your pact weapon, the creature takes extra necrotic damage equal to your Charisma modifier (minimum 1).",
    ],
    prerequisites: [
      {
        type: "level",
        level: 12,
      },
      {
        type: "feature",
        feature: "/api/2014/features/pact-of-the-blade",
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "otherworldly-patron-improvement-3",
    name: "Otherworldly Patron feature",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 14,
    desc: [
      "At 1st level, you have struck a bargain with an otherworldly being of your choice, such as the Fiend. Your choice grants you features at 1st level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "eldritch-invocation-chains-of-carceri",
    name: "Eldritch Invocation: Chains of Carceri",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 15,
    desc: [
      "You can cast hold monster at will--targeting a celestial, fiend, or elemental--without expending a spell slot or material components. You must finish a long rest before you can use this invocation on the same creature again.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 15,
      },
      {
        type: "feature",
        feature: "/api/2014/features/pact-of-the-chain",
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-master-of-myriad-forms",
    name: "Eldritch Invocation: Master of Myriad Forms",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 15,
    desc: ["You can cast alter self at will, without expending a spell slot."],
    prerequisites: [
      {
        type: "level",
        level: 15,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-visions-of-distant-realms",
    name: "Eldritch Invocation: Visions of Distant Realms",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 15,
    desc: ["You can cast arcane eye at will, without expending a spell slot."],
    prerequisites: [
      {
        type: "level",
        level: 15,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "eldritch-invocation-witch-sight",
    name: "Eldritch Invocation: Witch Sight",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 15,
    desc: [
      "You can see the true form of any shapechanger or creature concealed by illusion or transmutation magic while the creature is within 30 feet of you and within line of sight.",
    ],
    prerequisites: [
      {
        type: "level",
        level: 15,
      },
    ],
    parent: {
      index: "eldritch-invocations",
      name: "Eldritch Invocations",
    },
  },
  {
    sourceIndex: "pact-boon",
    name: "Pact Boon",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 3,
    desc: [
      "At 3rd level, your otherworldly patron bestows a gift upon you for your loyal service. You gain one of the following features of your choice.",
    ],
    prerequisites: [],
    featureSpecific: {
      subfeature_options: {
        choose: 1,
        type: "feature",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "pact-of-the-chain",
                name: "Pact of the Chain",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "pact-of-the-blade",
                name: "Pact of the Blade",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "pact-of-the-tome",
                name: "Pact of the Tome",
              },
            },
          ],
        },
      },
    },
  },
  {
    sourceIndex: "pact-of-the-chain",
    name: "Pact of the Chain",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 3,
    desc: [
      "You learn the find familiar spell and can cast it as a ritual. The spell doesn't count against your number of spells known.",
      "When you cast the spell, you can choose one of the normal forms for your familiar or one of the following special forms: imp, pseudodragon, quasit, or sprite.",
      "Additionally, when you take the Attack action, you can forgo one of your own attacks to allow your familiar to make one attack of its own with its reaction.",
      "Your familiar is more cunning than a typical familiar. Its default form can be a reflection of your patron, with imps and quasits tied to the Fiend.",
    ],
    prerequisites: [],
    parent: {
      index: "pact-boon",
      name: "Pact Boon",
    },
  },
  {
    sourceIndex: "pact-of-the-blade",
    name: "Pact of the Blade",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 3,
    desc: [
      "You can use your action to create a pact weapon in your empty hand. You can choose the form that this melee weapon takes each time you create it. You are proficient with it while you wield it. This weapon counts as magical for the purpose of overcoming resistance and immunity to nonmagical attacks and damage.",
      "Your pact weapon disappears if it is more than 5 feet away from you for 1 minute or more. It also disappears if you use this feature again, if you dismiss the weapon (no action required), or if you die.",
      "You can transform one magic weapon into your pact weapon by performing a special ritual while you hold the weapon. You perform the ritual over the course of 1 hour, which can be done during a short rest. You can then dismiss the weapon, shunting it into an extradimensional space, and it appears whenever you create your pact weapon thereafter. You can't affect an artifact or a sentient weapon in this way. The weapon ceases being your pact weapon if you die, if you perform the 1-hour ritual on a different weapon, or if you use a 1-hour ritual to break your bond to it. The weapon appears at your feet if it is in the extradimensional space when the bond breaks.",
      "If you serve the Fiend, your weapon could be an axe made of black metal and adorned with decorative flames.",
    ],
    prerequisites: [],
    parent: {
      index: "pact-boon",
      name: "Pact Boon",
    },
  },
  {
    sourceIndex: "pact-of-the-tome",
    name: "Pact of the Tome",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 3,
    desc: [
      "Your patron gives you a grimoire called a Book of Shadows. When you gain this feature, choose three cantrips from any class's spell list (the three needn't be from the same list). While the book is on your person, you can cast those cantrips at will. They don't count against your number of cantrips known. If they don't appear on the warlock spell list, they are nonetheless warlock spells for you.",
      "If you lose your Book of Shadows, you can perform a 1-hour ceremony to receive a replacement from your patron. This ceremony can be performed during a short or long rest, and it destroys the previous book. The book turns to ash when you die.",
      "Your Book of Shadows could be a weighty tome bound in demon hide studded with iron, holding spells of conjuration and a wealth of forbidden lore about the sinister regions of the cosmos, a gift of the Fiend.",
    ],
    prerequisites: [],
    parent: {
      index: "pact-boon",
      name: "Pact Boon",
    },
  },
  {
    sourceIndex: "warlock-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "dark-ones-own-luck",
    name: "Dark One's Own Luck",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 6,
    desc: [
      "Starting at 6th level, you can call on your patron to alter fate in your favor. When you make an ability check or a saving throw, you can use this feature to add a d10 to your roll. You can do so after seeing the initial roll but before any of the roll's effects occur.",
      "Once you use this feature, you can't use it again until you finish a short or long rest.",
    ],
    prerequisites: [],
    subclass: {
      index: "fiend",
      name: "Fiend",
    },
  },
  {
    sourceIndex: "warlock-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "fiendish-resilience",
    name: "Fiendish Resilience",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 10,
    desc: [
      "Starting at 10th level, you can choose one damage type when you finish a short or long rest. You gain resistance to that damage type until you choose a different one with this feature. Damage from magical weapons or silver weapons ignores this resistance.",
    ],
    prerequisites: [],
    subclass: {
      index: "fiend",
      name: "Fiend",
    },
  },
  {
    sourceIndex: "mystic-arcanum-6th-level",
    name: "Mystic Arcanum (6th level)",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 11,
    desc: [
      "At 11th level, your patron bestows upon you a magical secret called an arcanum. Choose one 6th- level spell from the warlock spell list as this arcanum.",
      "You can cast your arcanum spell once without expending a spell slot. You must finish a long rest before you can do so again.",
      "At higher levels, you gain more warlock spells of your choice that can be cast in this way: one 7th- level spell at 13th level, one 8th-level spell at 15th level, and one 9th-level spell at 17th level. You regain all uses of your Mystic Arcanum when you finish a long rest.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "warlock-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "mystic-arcanum-7th-level",
    name: "Mystic Arcanum (7th level)",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 13,
    desc: [
      "At 11th level, your patron bestows upon you a magical secret called an arcanum. Choose one 6th- level spell from the warlock spell list as this arcanum.",
      "You can cast your arcanum spell once without expending a spell slot. You must finish a long rest before you can do so again.",
      "At higher levels, you gain more warlock spells of your choice that can be cast in this way: one 7th- level spell at 13th level, one 8th-level spell at 15th level, and one 9th-level spell at 17th level. You regain all uses of your Mystic Arcanum when you finish a long rest.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "hurl-through-hell",
    name: "Hurl Through Hell",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 14,
    desc: [
      "Starting at 14th level, when you hit a creature with an attack, you can use this feature to instantly transport the target through the lower planes. The creature disappears and hurtles through a nightmare landscape.",
      "At the end of your next turn, the target returns to the space it previously occupied, or the nearest unoccupied space. If the target is not a fiend, it takes 10d10 psychic damage as it reels from its horrific experience.",
      "Once you use this feature, you can't use it again until you finish a long rest.",
    ],
    prerequisites: [],
    subclass: {
      index: "fiend",
      name: "Fiend",
    },
  },
  {
    sourceIndex: "mystic-arcanum-8th-level",
    name: "Mystic Arcanum (8th level)",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 15,
    desc: [
      "At 11th level, your patron bestows upon you a magical secret called an arcanum. Choose one 6th- level spell from the warlock spell list as this arcanum.",
      "You can cast your arcanum spell once without expending a spell slot. You must finish a long rest before you can do so again.",
      "At higher levels, you gain more warlock spells of your choice that can be cast in this way: one 7th- level spell at 13th level, one 8th-level spell at 15th level, and one 9th-level spell at 17th level. You regain all uses of your Mystic Arcanum when you finish a long rest.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "warlock-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "mystic-arcanum-9th-level",
    name: "Mystic Arcanum (9th level)",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 17,
    desc: [
      "At 11th level, your patron bestows upon you a magical secret called an arcanum. Choose one 6th- level spell from the warlock spell list as this arcanum.",
      "You can cast your arcanum spell once without expending a spell slot. You must finish a long rest before you can do so again.",
      "At higher levels, you gain more warlock spells of your choice that can be cast in this way: one 7th- level spell at 13th level, one 8th-level spell at 15th level, and one 9th-level spell at 17th level. You regain all uses of your Mystic Arcanum when you finish a long rest.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "warlock-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "eldritch-master",
    name: "Eldritch Master",
    class: {
      index: "warlock",
      name: "Warlock",
    },
    level: 20,
    desc: [
      "At 20th level, you can draw on your inner reserve of mystical power while entreating your patron to regain expended spell slots. You can spend 1 minute entreating your patron for aid to regain all your expended spell slots from your Pact Magic feature.",
      "Once you regain spell slots with this feature, you must finish a long rest before you can do so again.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "spellcasting-wizard",
    name: "Spellcasting: Wizard",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 1,
    desc: [
      "As a student of arcane magic, you have a spellbook containing spells that show the first glimmerings of your true power.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "arcane-recovery",
    name: "Arcane Recovery",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 1,
    desc: [
      "You have learned to regain some of your magical energy by studying your spellbook. Once per day when you finish a short rest, you can choose expended spell slots to recover. The spell slots can have a combined level that is equal to or less than half your wizard level (rounded up), and none of the slots can be 6th level or higher.",
      "For example, if you're a 4th-level wizard, you can recover up to two levels worth of spell slots. You can recover either a 2nd-level spell slot or two 1st-level spell slots.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "arcane-tradition",
    name: "Arcane Tradition",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 2,
    desc: [
      "When you reach 2nd level, you choose an arcane tradition, shaping your practice of magic through one of eight schools, such as Evocation.",
      "Your choice grants you features at 2nd level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "evocation-savant",
    name: "Evocation Savant",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 2,
    desc: [
      "Beginning when you select this school at 2nd level, the gold and time you must spend to copy an evocation spell into your spellbook is halved.",
    ],
    prerequisites: [],
    subclass: {
      index: "evocation",
      name: "Evocation",
    },
  },
  {
    sourceIndex: "sculpt-spells",
    name: "Sculpt Spells",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 2,
    desc: [
      "Beginning at 2nd level, you can create pockets of relative safety within the effects of your evocation spells. When you cast an evocation spell that affects other creatures that you can see, you can choose a number of them equal to 1 + the spell's level. The chosen creatures automatically succeed on their saving throws against the spell, and they take no damage if they would normally take half damage on a successful save.",
    ],
    prerequisites: [],
    subclass: {
      index: "evocation",
      name: "Evocation",
    },
  },
  {
    sourceIndex: "wizard-ability-score-improvement-1",
    name: "Ability Score Improvement",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 4,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "arcane-tradition-improvement-1",
    name: "Arcane Tradition feature",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 6,
    desc: [
      "When you reach 2nd level, you choose an arcane tradition, shaping your practice of magic through one of eight schools, such as Evocation.",
      "Your choice grants you features at 2nd level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "potent-cantrip",
    name: "Potent Cantrip",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 6,
    desc: [
      "Starting at 6th level, your damaging cantrips affect even creatures that avoid the brunt of the effect. When a creature succeeds on a saving throw against your cantrip, the creature takes half the cantrip's damage (if any) but suffers no additional effect from the cantrip.",
    ],
    prerequisites: [],
    subclass: {
      index: "evocation",
      name: "Evocation",
    },
  },
  {
    sourceIndex: "wizard-ability-score-improvement-2",
    name: "Ability Score Improvement",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 8,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "arcane-tradition-improvement-2",
    name: "Arcane Tradition feature",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 10,
    desc: [
      "When you reach 2nd level, you choose an arcane tradition, shaping your practice of magic through one of eight schools, such as Evocation.",
      "Your choice grants you features at 2nd level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "empowered-evocation",
    name: "Empowered Evocation",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 10,
    desc: [
      "Beginning at 10th level, you can add your Intelligence modifier to one damage roll of any wizard evocation spell you cast.",
    ],
    prerequisites: [],
    subclass: {
      index: "evocation",
      name: "Evocation",
    },
  },
  {
    sourceIndex: "wizard-ability-score-improvement-3",
    name: "Ability Score Improvement",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 12,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "arcane-tradition-improvement-3",
    name: "Arcane Tradition feature",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 14,
    desc: [
      "When you reach 2nd level, you choose an arcane tradition, shaping your practice of magic through one of eight schools, such as Evocation.",
      "Your choice grants you features at 2nd level and again at 6th, 10th, and 14th level.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "overchannel",
    name: "Overchannel",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 14,
    desc: [
      "Starting at 14th level, you can increase the power of your simpler spells. When you cast a wizard spell of 1st through 5th level that deals damage, you can deal maximum damage with that spell.",
      "The first time you do so, you suffer no adverse effect. If you use this feature again before you finish a long rest, you take 2d12 necrotic damage for each level of the spell, immediately after you cast it. Each time you use this feature again before finishing a long rest, the necrotic damage per spell level increases by 1d12. This damage ignores resistance and immunity.",
    ],
    prerequisites: [],
    subclass: {
      index: "evocation",
      name: "Evocation",
    },
  },
  {
    sourceIndex: "wizard-ability-score-improvement-4",
    name: "Ability Score Improvement",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 16,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "spell-mastery",
    name: "Spell Mastery",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 18,
    desc: [
      "At 18th level, you have achieved such mastery over certain spells that you can cast them at will. Choose a 1st-level wizard spell and a 2nd-level wizard spell that are in your spellbook. You can cast those spells at their lowest level without expending a spell slot when you have them prepared. If you want to cast either spell at a higher level, you must expend a spell slot as normal.",
      "By spending 8 hours in study, you can exchange one or both of the spells you chose for different spells of the same levels.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "wizard-ability-score-improvement-5",
    name: "Ability Score Improvement",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 19,
    desc: [
      "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
    ],
    prerequisites: [],
  },
  {
    sourceIndex: "signature-spell",
    name: "Signature Spell",
    class: {
      index: "wizard",
      name: "Wizard",
    },
    level: 20,
    desc: [
      "When you reach 20th level, you gain mastery over two powerful spells and can cast them with little effort. Choose two 3rd-level wizard spells in your spellbook as your signature spells. You always have these spells prepared, they don't count against the number of spells you have prepared, and you can cast each of them once at 3rd level without expending a spell slot. When you do so, you can't do so again until you finish a short or long rest.",
      "If you want to cast either spell at a higher level, you must expend a spell slot as normal.",
    ],
    prerequisites: [],
  },
] as const satisfies ReadonlyArray<SystemFeature>;

export interface SourceReference {
  readonly index: string;
  readonly name: string;
}

export interface SystemSubclass {
  readonly sourceIndex: string;
  readonly name: string;
  readonly class: SourceReference;
  readonly flavor?: string;
  readonly desc: ReadonlyArray<string>;
}

export interface SystemClassLevel {
  readonly sourceIndex: string;
  readonly class: SourceReference;
  readonly subclass?: SourceReference;
  readonly level: number;
  readonly abilityScoreBonuses?: number;
  readonly proficiencyBonus?: number;
  readonly classSpecific?: unknown;
  readonly subclassSpecific?: unknown;
  readonly spellcasting?: unknown;
  readonly features: ReadonlyArray<SourceReference>;
}

export interface SystemFeature {
  readonly sourceIndex: string;
  readonly name: string;
  readonly class: SourceReference;
  readonly subclass?: SourceReference;
  readonly parent?: SourceReference;
  readonly reference?: SourceReference;
  readonly level: number;
  readonly desc: ReadonlyArray<string>;
  readonly prerequisites: unknown;
  readonly featureSpecific?: unknown;
}
