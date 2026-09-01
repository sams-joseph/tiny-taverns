/**
 * GENERATED FROM 5e-bits/5e-database 2014 data.
 *
 * Source: https://github.com/5e-bits/5e-database/tree/5a7ee5a0489b26655d343e4a41e8f7942a887af2/src/2014/en
 * Files: 5e-SRD-Ability-Scores.json, 5e-SRD-Languages.json,
 *   5e-SRD-Skills.json, 5e-SRD-Proficiencies.json, 5e-SRD-Traits.json.
 *
 * Rebuild recipe:
 *   python - <<'PY'
 *   # fetch those exact raw GitHub URLs at the commit above and write this file;
 *   # the runtime importer reads this checked-in snapshot and performs no network fetch.
 *   PY
 *
 * 5e-bits project data is MIT licensed; underlying Dungeons & Dragons 5th Edition
 * SRD 5.1 material is used under the Open Game License version 1.0a. See
 * THIRD_PARTY_NOTICES.md; ruleset:import stores stable source keys, not per-row
 * source-document provenance.
 */

export const ABILITY_SCORE_RAW = JSON.parse(String.raw`[
  {
    "index": "str",
    "name": "STR",
    "full_name": "Strength",
    "desc": [
      "Strength measures bodily power, athletic training, and the extent to which you can exert raw physical force.",
      "A Strength check can model any attempt to lift, push, pull, or break something, to force your body through a space, or to otherwise apply brute force to a situation. The Athletics skill reflects aptitude in certain kinds of Strength checks."
    ],
    "skills": [
      {
        "name": "Athletics",
        "index": "athletics",
        "url": "/api/2014/skills/athletics"
      }
    ],
    "url": "/api/2014/ability-scores/str"
  },
  {
    "index": "dex",
    "name": "DEX",
    "full_name": "Dexterity",
    "desc": [
      "Dexterity measures agility, reflexes, and balance.",
      "A Dexterity check can model any attempt to move nimbly, quickly, or quietly, or to keep from falling on tricky footing. The Acrobatics, Sleight of Hand, and Stealth skills reflect aptitude in certain kinds of Dexterity checks."
    ],
    "skills": [
      {
        "name": "Acrobatics",
        "index": "acrobatics",
        "url": "/api/2014/skills/acrobatics"
      },
      {
        "name": "Sleight of Hand",
        "index": "sleight-of-hand",
        "url": "/api/2014/skills/sleight-of-hand"
      },
      {
        "name": "Stealth",
        "index": "stealth",
        "url": "/api/2014/skills/stealth"
      }
    ],
    "url": "/api/2014/ability-scores/dex"
  },
  {
    "index": "con",
    "name": "CON",
    "full_name": "Constitution",
    "desc": [
      "Constitution measures health, stamina, and vital force.",
      "Constitution checks are uncommon, and no skills apply to Constitution checks, because the endurance this ability represents is largely passive rather than involving a specific effort on the part of a character or monster."
    ],
    "skills": [],
    "url": "/api/2014/ability-scores/con"
  },
  {
    "index": "int",
    "name": "INT",
    "full_name": "Intelligence",
    "desc": [
      "Intelligence measures mental acuity, accuracy of recall, and the ability to reason.",
      "An Intelligence check comes into play when you need to draw on logic, education, memory, or deductive reasoning. The Arcana, History, Investigation, Nature, and Religion skills reflect aptitude in certain kinds of Intelligence checks."
    ],
    "skills": [
      {
        "name": "Arcana",
        "index": "arcana",
        "url": "/api/2014/skills/arcana"
      },
      {
        "name": "History",
        "index": "history",
        "url": "/api/2014/skills/history"
      },
      {
        "name": "Investigation",
        "index": "investigation",
        "url": "/api/2014/skills/investigation"
      },
      {
        "name": "Nature",
        "index": "nature",
        "url": "/api/2014/skills/nature"
      },
      {
        "name": "Religion",
        "index": "religion",
        "url": "/api/2014/skills/religion"
      }
    ],
    "url": "/api/2014/ability-scores/int"
  },
  {
    "index": "wis",
    "name": "WIS",
    "full_name": "Wisdom",
    "desc": [
      "Wisdom reflects how attuned you are to the world around you and represents perceptiveness and intuition.",
      "A Wisdom check might reflect an effort to read body language, understand someone's feelings, notice things about the environment, or care for an injured person. The Animal Handling, Insight, Medicine, Perception, and Survival skills reflect aptitude in certain kinds of Wisdom checks."
    ],
    "skills": [
      {
        "name": "Animal Handling",
        "index": "animal-handling",
        "url": "/api/2014/skills/animal-handling"
      },
      {
        "name": "Insight",
        "index": "insight",
        "url": "/api/2014/skills/insight"
      },
      {
        "name": "Medicine",
        "index": "medicine",
        "url": "/api/2014/skills/medicine"
      },
      {
        "name": "Perception",
        "index": "perception",
        "url": "/api/2014/skills/perception"
      },
      {
        "name": "Survival",
        "index": "survival",
        "url": "/api/2014/skills/survival"
      }
    ],
    "url": "/api/2014/ability-scores/wis"
  },
  {
    "index": "cha",
    "name": "CHA",
    "full_name": "Charisma",
    "desc": [
      "Charisma measures your ability to interact effectively with others. It includes such factors as confidence and eloquence, and it can represent a charming or commanding personality.",
      "A Charisma check might arise when you try to influence or entertain others, when you try to make an impression or tell a convincing lie, or when you are navigating a tricky social situation. The Deception, Intimidation, Performance, and Persuasion skills reflect aptitude in certain kinds of Charisma checks."
    ],
    "skills": [
      {
        "name": "Deception",
        "index": "deception",
        "url": "/api/2014/skills/deception"
      },
      {
        "name": "Intimidation",
        "index": "intimidation",
        "url": "/api/2014/skills/intimidation"
      },
      {
        "name": "Performance",
        "index": "performance",
        "url": "/api/2014/skills/performance"
      },
      {
        "name": "Persuasion",
        "index": "persuasion",
        "url": "/api/2014/skills/persuasion"
      }
    ],
    "url": "/api/2014/ability-scores/cha"
  }
]`) as ReadonlyArray<Record<string, unknown>>;
export const LANGUAGE_RAW = JSON.parse(String.raw`[
  {
    "index": "common",
    "name": "Common",
    "type": "Standard",
    "typical_speakers": [
      "Humans"
    ],
    "script": "Common",
    "url": "/api/2014/languages/common"
  },
  {
    "index": "dwarvish",
    "name": "Dwarvish",
    "desc": "Dwarvish is full of hard consonants and guttural sounds.",
    "type": "Standard",
    "typical_speakers": [
      "Dwarves"
    ],
    "script": "Dwarvish",
    "url": "/api/2014/languages/dwarvish"
  },
  {
    "index": "elvish",
    "name": "Elvish",
    "desc": "Elvish is fluid, with subtle intonations and intricate grammar. Elven literature is rich and varied, and their songs and poems are famous among other races. Many bards learn their language so they can add Elvish ballads to their repertoires.",
    "type": "Standard",
    "typical_speakers": [
      "Elves"
    ],
    "script": "Elvish",
    "url": "/api/2014/languages/elvish"
  },
  {
    "index": "giant",
    "name": "Giant",
    "type": "Standard",
    "typical_speakers": [
      "Ogres",
      "Giants"
    ],
    "script": "Dwarvish",
    "url": "/api/2014/languages/giant"
  },
  {
    "index": "gnomish",
    "name": "Gnomish",
    "desc": "The Gnomish language, which uses the Dwarvish script, is renowned for its technical treatises and its catalogs of knowledge about the natural world.",
    "type": "Standard",
    "typical_speakers": [
      "Gnomes"
    ],
    "script": "Dwarvish",
    "url": "/api/2014/languages/gnomish"
  },
  {
    "index": "goblin",
    "name": "Goblin",
    "type": "Standard",
    "typical_speakers": [
      "Goblinoids"
    ],
    "script": "Dwarvish",
    "url": "/api/2014/languages/goblin"
  },
  {
    "index": "halfling",
    "name": "Halfling",
    "desc": "The Halfling language isn't secret, but halflings are loath to share it with others. They write very little, so they don't have a rich body of literature. Their oral tradition, however, is very strong.",
    "type": "Standard",
    "typical_speakers": [
      "Halflings"
    ],
    "script": "Common",
    "url": "/api/2014/languages/halfling"
  },
  {
    "index": "orc",
    "name": "Orc",
    "desc": "Orc is a harsh, grating language with hard consonants. It has no script of its own but is written in the Dwarvish script.",
    "type": "Standard",
    "typical_speakers": [
      "Orcs"
    ],
    "script": "Dwarvish",
    "url": "/api/2014/languages/orc"
  },
  {
    "index": "abyssal",
    "name": "Abyssal",
    "type": "Exotic",
    "typical_speakers": [
      "Demons"
    ],
    "script": "Infernal",
    "url": "/api/2014/languages/abyssal"
  },
  {
    "index": "celestial",
    "name": "Celestial",
    "type": "Exotic",
    "typical_speakers": [
      "Celestials"
    ],
    "script": "Celestial",
    "url": "/api/2014/languages/celestial"
  },
  {
    "index": "draconic",
    "name": "Draconic",
    "desc": "Draconic is thought to be one of the oldest languages and is often used in the study of magic. The language sounds harsh to most other creatures and includes numerous hard consonants and sibilants.",
    "type": "Exotic",
    "typical_speakers": [
      "Dragons",
      "Dragonborn"
    ],
    "script": "Draconic",
    "url": "/api/2014/languages/draconic"
  },
  {
    "index": "deep-speech",
    "name": "Deep Speech",
    "type": "Exotic",
    "typical_speakers": [
      "Aboleths",
      "Cloakers"
    ],
    "url": "/api/2014/languages/deep-speech"
  },
  {
    "index": "infernal",
    "name": "Infernal",
    "type": "Exotic",
    "typical_speakers": [
      "Devils"
    ],
    "script": "Infernal",
    "url": "/api/2014/languages/infernal"
  },
  {
    "index": "primordial",
    "name": "Primordial",
    "type": "Exotic",
    "typical_speakers": [
      "Elementals"
    ],
    "script": "Dwarvish",
    "url": "/api/2014/languages/primordial"
  },
  {
    "index": "sylvan",
    "name": "Sylvan",
    "type": "Exotic",
    "typical_speakers": [
      "Fey creatures"
    ],
    "script": "Elvish",
    "url": "/api/2014/languages/sylvan"
  },
  {
    "index": "undercommon",
    "name": "Undercommon",
    "type": "Exotic",
    "typical_speakers": [
      "Underdark traders"
    ],
    "script": "Elvish",
    "url": "/api/2014/languages/undercommon"
  }
]`) as ReadonlyArray<Record<string, unknown>>;
export const SKILL_RAW = JSON.parse(String.raw`[
  {
    "index": "acrobatics",
    "name": "Acrobatics",
    "desc": [
      "Your Dexterity (Acrobatics) check covers your attempt to stay on your feet in a tricky situation, such as when you're trying to run across a sheet of ice, balance on a tightrope, or stay upright on a rocking ship's deck. The GM might also call for a Dexterity (Acrobatics) check to see if you can perform acrobatic stunts, including dives, rolls, somersaults, and flips."
    ],
    "ability_score": {
      "index": "dex",
      "name": "DEX",
      "url": "/api/2014/ability-scores/dex"
    },
    "url": "/api/2014/skills/acrobatics"
  },
  {
    "index": "animal-handling",
    "name": "Animal Handling",
    "desc": [
      "When there is any question whether you can calm down a domesticated animal, keep a mount from getting spooked, or intuit an animal's intentions, the GM might call for a Wisdom (Animal Handling) check. You also make a Wisdom (Animal Handling) check to control your mount when you attempt a risky maneuver."
    ],
    "ability_score": {
      "index": "wis",
      "name": "WIS",
      "url": "/api/2014/ability-scores/wis"
    },
    "url": "/api/2014/skills/animal-handling"
  },
  {
    "index": "arcana",
    "name": "Arcana",
    "desc": [
      "Your Intelligence (Arcana) check measures your ability to recall lore about spells, magic items, eldritch symbols, magical traditions, the planes of existence, and the inhabitants of those planes."
    ],
    "ability_score": {
      "index": "int",
      "name": "INT",
      "url": "/api/2014/ability-scores/int"
    },
    "url": "/api/2014/skills/arcana"
  },
  {
    "index": "athletics",
    "name": "Athletics",
    "desc": [
      "Your Strength (Athletics) check covers difficult situations you encounter while climbing, jumping, or swimming."
    ],
    "ability_score": {
      "index": "str",
      "name": "STR",
      "url": "/api/2014/ability-scores/str"
    },
    "url": "/api/2014/skills/athletics"
  },
  {
    "index": "deception",
    "name": "Deception",
    "desc": [
      "Your Charisma (Deception) check determines whether you can convincingly hide the truth, either verbally or through your actions. This deception can encompass everything from misleading others through ambiguity to telling outright lies. Typical situations include trying to fast- talk a guard, con a merchant, earn money through gambling, pass yourself off in a disguise, dull someone's suspicions with false assurances, or maintain a straight face while telling a blatant lie."
    ],
    "ability_score": {
      "index": "cha",
      "name": "CHA",
      "url": "/api/2014/ability-scores/cha"
    },
    "url": "/api/2014/skills/deception"
  },
  {
    "index": "history",
    "name": "History",
    "desc": [
      "Your Intelligence (History) check measures your ability to recall lore about historical events, legendary people, ancient kingdoms, past disputes, recent wars, and lost civilizations."
    ],
    "ability_score": {
      "index": "int",
      "name": "INT",
      "url": "/api/2014/ability-scores/int"
    },
    "url": "/api/2014/skills/history"
  },
  {
    "index": "insight",
    "name": "Insight",
    "desc": [
      "Your Wisdom (Insight) check decides whether you can determine the true intentions of a creature, such as when searching out a lie or predicting someone's next move. Doing so involves gleaning clues from body language, speech habits, and changes in mannerisms."
    ],
    "ability_score": {
      "index": "wis",
      "name": "WIS",
      "url": "/api/2014/ability-scores/wis"
    },
    "url": "/api/2014/skills/insight"
  },
  {
    "index": "intimidation",
    "name": "Intimidation",
    "desc": [
      "When you attempt to influence someone through overt threats, hostile actions, and physical violence, the GM might ask you to make a Charisma (Intimidation) check. Examples include trying to pry information out of a prisoner, convincing street thugs to back down from a confrontation, or using the edge of a broken bottle to convince a sneering vizier to reconsider a decision."
    ],
    "ability_score": {
      "index": "cha",
      "name": "CHA",
      "url": "/api/2014/ability-scores/cha"
    },
    "url": "/api/2014/skills/intimidation"
  },
  {
    "index": "investigation",
    "name": "Investigation",
    "desc": [
      "When you look around for clues and make deductions based on those clues, you make an Intelligence (Investigation) check. You might deduce the location of a hidden object, discern from the appearance of a wound what kind of weapon dealt it, or determine the weakest point in a tunnel that could cause it to collapse. Poring through ancient scrolls in search of a hidden fragment of knowledge might also call for an Intelligence (Investigation) check."
    ],
    "ability_score": {
      "index": "int",
      "name": "INT",
      "url": "/api/2014/ability-scores/int"
    },
    "url": "/api/2014/skills/investigation"
  },
  {
    "index": "medicine",
    "name": "Medicine",
    "desc": [
      "A Wisdom (Medicine) check lets you try to stabilize a dying companion or diagnose an illness."
    ],
    "ability_score": {
      "index": "wis",
      "name": "WIS",
      "url": "/api/2014/ability-scores/wis"
    },
    "url": "/api/2014/skills/medicine"
  },
  {
    "index": "nature",
    "name": "Nature",
    "desc": [
      "Your Intelligence (Nature) check measures your ability to recall lore about terrain, plants and animals, the weather, and natural cycles."
    ],
    "ability_score": {
      "index": "int",
      "name": "INT",
      "url": "/api/2014/ability-scores/int"
    },
    "url": "/api/2014/skills/nature"
  },
  {
    "index": "perception",
    "name": "Perception",
    "desc": [
      "Your Wisdom (Perception) check lets you spot, hear, or otherwise detect the presence of something. It measures your general awareness of your surroundings and the keenness of your senses. For example, you might try to hear a conversation through a closed door, eavesdrop under an open window, or hear monsters moving stealthily in the forest. Or you might try to spot things that are obscured or easy to miss, whether they are orcs lying in ambush on a road, thugs hiding in the shadows of an alley, or candlelight under a closed secret door."
    ],
    "ability_score": {
      "index": "wis",
      "name": "WIS",
      "url": "/api/2014/ability-scores/wis"
    },
    "url": "/api/2014/skills/perception"
  },
  {
    "index": "performance",
    "name": "Performance",
    "desc": [
      "Your Charisma (Performance) check determines how well you can delight an audience with music, dance, acting, storytelling, or some other form of entertainment."
    ],
    "ability_score": {
      "index": "cha",
      "name": "CHA",
      "url": "/api/2014/ability-scores/cha"
    },
    "url": "/api/2014/skills/performance"
  },
  {
    "index": "persuasion",
    "name": "Persuasion",
    "desc": [
      "When you attempt to influence someone or a group of people with tact, social graces, or good nature, the GM might ask you to make a Charisma (Persuasion) check. Typically, you use persuasion when acting in good faith, to foster friendships, make cordial requests, or exhibit proper etiquette. Examples of persuading others include convincing a chamberlain to let your party see the king, negotiating peace between warring tribes, or inspiring a crowd of townsfolk."
    ],
    "ability_score": {
      "index": "cha",
      "name": "CHA",
      "url": "/api/2014/ability-scores/cha"
    },
    "url": "/api/2014/skills/persuasion"
  },
  {
    "index": "religion",
    "name": "Religion",
    "desc": [
      "Your Intelligence (Religion) check measures your ability to recall lore about deities, rites and prayers, religious hierarchies, holy symbols, and the practices of secret cults."
    ],
    "ability_score": {
      "index": "int",
      "name": "INT",
      "url": "/api/2014/ability-scores/int"
    },
    "url": "/api/2014/skills/religion"
  },
  {
    "index": "sleight-of-hand",
    "name": "Sleight of Hand",
    "desc": [
      "Whenever you attempt an act of legerdemain or manual trickery, such as planting something on someone else or concealing an object on your person, make a Dexterity (Sleight of Hand) check. The GM might also call for a Dexterity (Sleight of Hand) check to determine whether you can lift a coin purse off another person or slip something out of another person's pocket."
    ],
    "ability_score": {
      "index": "dex",
      "name": "DEX",
      "url": "/api/2014/ability-scores/dex"
    },
    "url": "/api/2014/skills/sleight-of-hand"
  },
  {
    "index": "stealth",
    "name": "Stealth",
    "desc": [
      "Make a Dexterity (Stealth) check when you attempt to conceal yourself from enemies, slink past guards, slip away without being noticed, or sneak up on someone without being seen or heard."
    ],
    "ability_score": {
      "index": "dex",
      "name": "DEX",
      "url": "/api/2014/ability-scores/dex"
    },
    "url": "/api/2014/skills/stealth"
  },
  {
    "index": "survival",
    "name": "Survival",
    "desc": [
      "The GM might ask you to make a Wisdom (Survival) check to follow tracks, hunt wild game, guide your group through frozen wastelands, identify signs that owlbears live nearby, predict the weather, or avoid quicksand and other natural hazards."
    ],
    "ability_score": {
      "index": "wis",
      "name": "WIS",
      "url": "/api/2014/ability-scores/wis"
    },
    "url": "/api/2014/skills/survival"
  }
]`) as ReadonlyArray<Record<string, unknown>>;
export const PROFICIENCY_RAW = JSON.parse(String.raw`[
  {
    "index": "light-armor",
    "type": "Armor",
    "name": "Light Armor",
    "classes": [
      {
        "index": "barbarian",
        "name": "Barbarian",
        "url": "/api/2014/classes/barbarian"
      },
      {
        "index": "bard",
        "name": "Bard",
        "url": "/api/2014/classes/bard"
      },
      {
        "index": "cleric",
        "name": "Cleric",
        "url": "/api/2014/classes/cleric"
      },
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      },
      {
        "index": "ranger",
        "name": "Ranger",
        "url": "/api/2014/classes/ranger"
      },
      {
        "index": "rogue",
        "name": "Rogue",
        "url": "/api/2014/classes/rogue"
      },
      {
        "index": "warlock",
        "name": "Warlock",
        "url": "/api/2014/classes/warlock"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/light-armor",
    "reference": {
      "index": "light-armor",
      "name": "Light Armor",
      "url": "/api/2014/equipment-categories/light-armor"
    }
  },
  {
    "index": "medium-armor",
    "type": "Armor",
    "name": "Medium Armor",
    "classes": [
      {
        "index": "barbarian",
        "name": "Barbarian",
        "url": "/api/2014/classes/barbarian"
      },
      {
        "index": "cleric",
        "name": "Cleric",
        "url": "/api/2014/classes/cleric"
      },
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      },
      {
        "index": "ranger",
        "name": "Ranger",
        "url": "/api/2014/classes/ranger"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/medium-armor",
    "reference": {
      "index": "medium-armor",
      "name": "Medium Armor",
      "url": "/api/2014/equipment-categories/medium-armor"
    }
  },
  {
    "index": "heavy-armor",
    "type": "Armor",
    "name": "Heavy Armor",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/heavy-armor",
    "reference": {
      "index": "heavy-armor",
      "name": "Heavy Armor",
      "url": "/api/2014/equipment-categories/heavy-armor"
    }
  },
  {
    "index": "all-armor",
    "type": "Armor",
    "name": "All armor",
    "classes": [
      {
        "index": "fighter",
        "name": "Fighter",
        "url": "/api/2014/classes/fighter"
      },
      {
        "index": "paladin",
        "name": "Paladin",
        "url": "/api/2014/classes/paladin"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/all-armor",
    "reference": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
    }
  },
  {
    "index": "padded-armor",
    "type": "Armor",
    "name": "Padded Armor",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/padded-armor",
    "reference": {
      "index": "padded-armor",
      "name": "Padded Armor",
      "url": "/api/2014/equipment/padded-armor"
    }
  },
  {
    "index": "leather-armor",
    "type": "Armor",
    "name": "Leather Armor",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/leather-armor",
    "reference": {
      "index": "leather-armor",
      "name": "Leather Armor",
      "url": "/api/2014/equipment/leather-armor"
    }
  },
  {
    "index": "studded-leather-armor",
    "type": "Armor",
    "name": "Studded Leather Armor",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/studded-leather-armor",
    "reference": {
      "index": "studded-leather-armor",
      "name": "Studded Leather Armor",
      "url": "/api/2014/equipment/studded-leather-armor"
    }
  },
  {
    "index": "hide-armor",
    "type": "Armor",
    "name": "Hide Armor",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/hide-armor",
    "reference": {
      "index": "hide-armor",
      "name": "Hide Armor",
      "url": "/api/2014/equipment/hide-armor"
    }
  },
  {
    "index": "chain-shirt",
    "type": "Armor",
    "name": "Chain Shirt",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/chain-shirt",
    "reference": {
      "index": "chain-shirt",
      "name": "Chain Shirt",
      "url": "/api/2014/equipment/chain-shirt"
    }
  },
  {
    "index": "scale-mail",
    "type": "Armor",
    "name": "Scale Mail",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/scale-mail",
    "reference": {
      "index": "scale-mail",
      "name": "Scale Mail",
      "url": "/api/2014/equipment/scale-mail"
    }
  },
  {
    "index": "breastplate",
    "type": "Armor",
    "name": "Breastplate",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/breastplate",
    "reference": {
      "index": "breastplate",
      "name": "Breastplate",
      "url": "/api/2014/equipment/breastplate"
    }
  },
  {
    "index": "half-plate-armor",
    "type": "Armor",
    "name": "Half Plate Armor",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/half-plate-armor",
    "reference": {
      "index": "half-plate-armor",
      "name": "Half Plate Armor",
      "url": "/api/2014/equipment/half-plate-armor"
    }
  },
  {
    "index": "ring-mail",
    "type": "Armor",
    "name": "Ring Mail",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/ring-mail",
    "reference": {
      "index": "ring-mail",
      "name": "Ring Mail",
      "url": "/api/2014/equipment/ring-mail"
    }
  },
  {
    "index": "chain-mail",
    "type": "Armor",
    "name": "Chain Mail",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/chain-mail",
    "reference": {
      "index": "chain-mail",
      "name": "Chain Mail",
      "url": "/api/2014/equipment/chain-mail"
    }
  },
  {
    "index": "splint-armor",
    "type": "Armor",
    "name": "Splint Armor",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/splint-armor",
    "reference": {
      "index": "splint-armor",
      "name": "Splint Armor",
      "url": "/api/2014/equipment/splint-armor"
    }
  },
  {
    "index": "plate-armor",
    "type": "Armor",
    "name": "Plate Armor",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/plate-armor",
    "reference": {
      "index": "plate-armor",
      "name": "Plate Armor",
      "url": "/api/2014/equipment/plate-armor"
    }
  },
  {
    "index": "shields",
    "type": "Armor",
    "name": "Shields",
    "classes": [
      {
        "index": "barbarian",
        "name": "Barbarian",
        "url": "/api/2014/classes/barbarian"
      },
      {
        "index": "cleric",
        "name": "Cleric",
        "url": "/api/2014/classes/cleric"
      },
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      },
      {
        "index": "fighter",
        "name": "Fighter",
        "url": "/api/2014/classes/fighter"
      },
      {
        "index": "paladin",
        "name": "Paladin",
        "url": "/api/2014/classes/paladin"
      },
      {
        "index": "ranger",
        "name": "Ranger",
        "url": "/api/2014/classes/ranger"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/shields",
    "reference": {
      "index": "shield",
      "name": "Shield",
      "url": "/api/2014/equipment/shield"
    }
  },
  {
    "index": "simple-weapons",
    "type": "Weapons",
    "name": "Simple Weapons",
    "classes": [
      {
        "index": "barbarian",
        "name": "Barbarian",
        "url": "/api/2014/classes/barbarian"
      },
      {
        "index": "bard",
        "name": "Bard",
        "url": "/api/2014/classes/bard"
      },
      {
        "index": "cleric",
        "name": "Cleric",
        "url": "/api/2014/classes/cleric"
      },
      {
        "index": "fighter",
        "name": "Fighter",
        "url": "/api/2014/classes/fighter"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/classes/monk"
      },
      {
        "index": "paladin",
        "name": "Paladin",
        "url": "/api/2014/classes/paladin"
      },
      {
        "index": "ranger",
        "name": "Ranger",
        "url": "/api/2014/classes/ranger"
      },
      {
        "index": "rogue",
        "name": "Rogue",
        "url": "/api/2014/classes/rogue"
      },
      {
        "index": "warlock",
        "name": "Warlock",
        "url": "/api/2014/classes/warlock"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/simple-weapons",
    "reference": {
      "index": "simple-weapons",
      "name": "Simple Weapons",
      "url": "/api/2014/equipment-categories/simple-weapons"
    }
  },
  {
    "index": "martial-weapons",
    "type": "Weapons",
    "name": "Martial Weapons",
    "classes": [
      {
        "index": "barbarian",
        "name": "Barbarian",
        "url": "/api/2014/classes/barbarian"
      },
      {
        "index": "fighter",
        "name": "Fighter",
        "url": "/api/2014/classes/fighter"
      },
      {
        "index": "paladin",
        "name": "Paladin",
        "url": "/api/2014/classes/paladin"
      },
      {
        "index": "ranger",
        "name": "Ranger",
        "url": "/api/2014/classes/ranger"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/martial-weapons",
    "reference": {
      "index": "martial-weapons",
      "name": "Martial Weapons",
      "url": "/api/2014/equipment-categories/martial-weapons"
    }
  },
  {
    "index": "clubs",
    "type": "Weapons",
    "name": "Clubs",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/clubs",
    "reference": {
      "index": "club",
      "name": "Club",
      "url": "/api/2014/equipment/club"
    }
  },
  {
    "index": "daggers",
    "type": "Weapons",
    "name": "Daggers",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      },
      {
        "index": "sorcerer",
        "name": "Sorcerer",
        "url": "/api/2014/classes/sorcerer"
      },
      {
        "index": "wizard",
        "name": "Wizard",
        "url": "/api/2014/classes/wizard"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/daggers",
    "reference": {
      "index": "dagger",
      "name": "Dagger",
      "url": "/api/2014/equipment/dagger"
    }
  },
  {
    "index": "greatclubs",
    "type": "Weapons",
    "name": "Greatclubs",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/greatclubs",
    "reference": {
      "index": "greatclub",
      "name": "Greatclub",
      "url": "/api/2014/equipment/greatclub"
    }
  },
  {
    "index": "handaxes",
    "type": "Weapons",
    "name": "Handaxes",
    "classes": [],
    "races": [
      {
        "index": "dwarf",
        "name": "Dwarf",
        "url": "/api/2014/races/dwarf"
      }
    ],
    "url": "/api/2014/proficiencies/handaxes",
    "reference": {
      "index": "handaxe",
      "name": "Handaxe",
      "url": "/api/2014/equipment/handaxe"
    }
  },
  {
    "index": "javelins",
    "type": "Weapons",
    "name": "Javelins",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/javelins",
    "reference": {
      "index": "javelin",
      "name": "Javelin",
      "url": "/api/2014/equipment/javelin"
    }
  },
  {
    "index": "light-hammers",
    "type": "Weapons",
    "name": "Light hammers",
    "classes": [],
    "races": [
      {
        "index": "dwarf",
        "name": "Dwarf",
        "url": "/api/2014/races/dwarf"
      }
    ],
    "url": "/api/2014/proficiencies/light-hammers",
    "reference": {
      "index": "light-hammer",
      "name": "Light hammer",
      "url": "/api/2014/equipment/light-hammer"
    }
  },
  {
    "index": "maces",
    "type": "Weapons",
    "name": "Maces",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/maces",
    "reference": {
      "index": "mace",
      "name": "Mace",
      "url": "/api/2014/equipment/mace"
    }
  },
  {
    "index": "quarterstaffs",
    "type": "Weapons",
    "name": "Quarterstaffs",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      },
      {
        "index": "sorcerer",
        "name": "Sorcerer",
        "url": "/api/2014/classes/sorcerer"
      },
      {
        "index": "wizard",
        "name": "Wizard",
        "url": "/api/2014/classes/wizard"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/quarterstaffs",
    "reference": {
      "index": "quarterstaff",
      "name": "Quarterstaff",
      "url": "/api/2014/equipment/quarterstaff"
    }
  },
  {
    "index": "sickles",
    "type": "Weapons",
    "name": "Sickles",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/sickles",
    "reference": {
      "index": "sickle",
      "name": "Sickle",
      "url": "/api/2014/equipment/sickle"
    }
  },
  {
    "index": "spears",
    "type": "Weapons",
    "name": "Spears",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/spears",
    "reference": {
      "index": "spear",
      "name": "Spear",
      "url": "/api/2014/equipment/spear"
    }
  },
  {
    "index": "crossbows-light",
    "type": "Weapons",
    "name": "Crossbows, light",
    "classes": [
      {
        "index": "sorcerer",
        "name": "Sorcerer",
        "url": "/api/2014/classes/sorcerer"
      },
      {
        "index": "wizard",
        "name": "Wizard",
        "url": "/api/2014/classes/wizard"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/crossbows-light",
    "reference": {
      "index": "crossbow-light",
      "name": "Crossbow, light",
      "url": "/api/2014/equipment/crossbow-light"
    }
  },
  {
    "index": "darts",
    "type": "Weapons",
    "name": "Darts",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      },
      {
        "index": "sorcerer",
        "name": "Sorcerer",
        "url": "/api/2014/classes/sorcerer"
      },
      {
        "index": "wizard",
        "name": "Wizard",
        "url": "/api/2014/classes/wizard"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/darts",
    "reference": {
      "index": "dart",
      "name": "Dart",
      "url": "/api/2014/equipment/dart"
    }
  },
  {
    "index": "shortbows",
    "type": "Weapons",
    "name": "Shortbows",
    "classes": [],
    "races": [
      {
        "index": "high-elf",
        "name": "High Elf",
        "url": "/api/2014/subraces/high-elf"
      }
    ],
    "url": "/api/2014/proficiencies/shortbows",
    "reference": {
      "index": "shortbow",
      "name": "Shortbow",
      "url": "/api/2014/equipment/shortbow"
    }
  },
  {
    "index": "slings",
    "type": "Weapons",
    "name": "Slings",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      },
      {
        "index": "sorcerer",
        "name": "Sorcerer",
        "url": "/api/2014/classes/sorcerer"
      },
      {
        "index": "wizard",
        "name": "Wizard",
        "url": "/api/2014/classes/wizard"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/slings",
    "reference": {
      "index": "sling",
      "name": "Sling",
      "url": "/api/2014/equipment/sling"
    }
  },
  {
    "index": "battleaxes",
    "type": "Weapons",
    "name": "Battleaxes",
    "classes": [],
    "races": [
      {
        "index": "dwarf",
        "name": "Dwarf",
        "url": "/api/2014/races/dwarf"
      }
    ],
    "url": "/api/2014/proficiencies/battleaxes",
    "reference": {
      "index": "battleaxe",
      "name": "Battleaxe",
      "url": "/api/2014/equipment/battleaxe"
    }
  },
  {
    "index": "flails",
    "type": "Weapons",
    "name": "Flails",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/flails",
    "reference": {
      "index": "flail",
      "name": "Flail",
      "url": "/api/2014/equipment/flail"
    }
  },
  {
    "index": "glaives",
    "type": "Weapons",
    "name": "Glaives",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/glaives",
    "reference": {
      "index": "glaive",
      "name": "Glaive",
      "url": "/api/2014/equipment/glaive"
    }
  },
  {
    "index": "greataxes",
    "type": "Weapons",
    "name": "Greataxes",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/greataxes",
    "reference": {
      "index": "greataxe",
      "name": "Greataxe",
      "url": "/api/2014/equipment/greataxe"
    }
  },
  {
    "index": "greatswords",
    "type": "Weapons",
    "name": "Greatswords",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/greatswords",
    "reference": {
      "index": "greatsword",
      "name": "Greatsword",
      "url": "/api/2014/equipment/greatsword"
    }
  },
  {
    "index": "halberds",
    "type": "Weapons",
    "name": "Halberds",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/halberds",
    "reference": {
      "index": "halberd",
      "name": "Halberd",
      "url": "/api/2014/equipment/halberd"
    }
  },
  {
    "index": "lances",
    "type": "Weapons",
    "name": "Lances",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/lances",
    "reference": {
      "index": "lance",
      "name": "Lance",
      "url": "/api/2014/equipment/lance"
    }
  },
  {
    "index": "longswords",
    "type": "Weapons",
    "name": "Longswords",
    "classes": [
      {
        "index": "bard",
        "name": "Bard",
        "url": "/api/2014/classes/bard"
      },
      {
        "index": "rogue",
        "name": "Rogue",
        "url": "/api/2014/classes/rogue"
      }
    ],
    "races": [
      {
        "index": "high-elf",
        "name": "High Elf",
        "url": "/api/2014/subraces/high-elf"
      }
    ],
    "url": "/api/2014/proficiencies/longswords",
    "reference": {
      "index": "longsword",
      "name": "Longsword",
      "url": "/api/2014/equipment/longsword"
    }
  },
  {
    "index": "mauls",
    "type": "Weapons",
    "name": "Mauls",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/mauls",
    "reference": {
      "index": "maul",
      "name": "Maul",
      "url": "/api/2014/equipment/maul"
    }
  },
  {
    "index": "morningstars",
    "type": "Weapons",
    "name": "Morningstars",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/morningstars",
    "reference": {
      "index": "morningstar",
      "name": "Morningstar",
      "url": "/api/2014/equipment/morningstar"
    }
  },
  {
    "index": "pikes",
    "type": "Weapons",
    "name": "Pikes",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/pikes",
    "reference": {
      "index": "pike",
      "name": "Pike",
      "url": "/api/2014/equipment/pike"
    }
  },
  {
    "index": "rapiers",
    "type": "Weapons",
    "name": "Rapiers",
    "classes": [
      {
        "index": "bard",
        "name": "Bard",
        "url": "/api/2014/classes/bard"
      },
      {
        "index": "rogue",
        "name": "Rogue",
        "url": "/api/2014/classes/rogue"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/rapiers",
    "reference": {
      "index": "rapier",
      "name": "Rapier",
      "url": "/api/2014/equipment/rapier"
    }
  },
  {
    "index": "scimitars",
    "type": "Weapons",
    "name": "Scimitars",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/scimitars",
    "reference": {
      "index": "scimitar",
      "name": "Scimitar",
      "url": "/api/2014/equipment/scimitar"
    }
  },
  {
    "index": "shortswords",
    "type": "Weapons",
    "name": "Shortswords",
    "classes": [
      {
        "index": "bard",
        "name": "Bard",
        "url": "/api/2014/classes/bard"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/classes/monk"
      },
      {
        "index": "rogue",
        "name": "Rogue",
        "url": "/api/2014/classes/rogue"
      }
    ],
    "races": [
      {
        "index": "high-elf",
        "name": "High Elf",
        "url": "/api/2014/subraces/high-elf"
      }
    ],
    "url": "/api/2014/proficiencies/shortswords",
    "reference": {
      "index": "shortsword",
      "name": "Shortsword",
      "url": "/api/2014/equipment/shortsword"
    }
  },
  {
    "index": "tridents",
    "type": "Weapons",
    "name": "Tridents",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/tridents",
    "reference": {
      "index": "trident",
      "name": "Trident",
      "url": "/api/2014/equipment/trident"
    }
  },
  {
    "index": "war-picks",
    "type": "Weapons",
    "name": "War picks",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/war-picks",
    "reference": {
      "index": "war-pick",
      "name": "War pick",
      "url": "/api/2014/equipment/war-pick"
    }
  },
  {
    "index": "warhammers",
    "type": "Weapons",
    "name": "Warhammers",
    "classes": [],
    "races": [
      {
        "index": "dwarf",
        "name": "Dwarf",
        "url": "/api/2014/races/dwarf"
      }
    ],
    "url": "/api/2014/proficiencies/warhammers",
    "reference": {
      "index": "warhammer",
      "name": "Warhammer",
      "url": "/api/2014/equipment/warhammer"
    }
  },
  {
    "index": "whips",
    "type": "Weapons",
    "name": "Whips",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/whips",
    "reference": {
      "index": "whip",
      "name": "Whip",
      "url": "/api/2014/equipment/whip"
    }
  },
  {
    "index": "blowguns",
    "type": "Weapons",
    "name": "Blowguns",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/blowguns",
    "reference": {
      "index": "blowgun",
      "name": "Blowgun",
      "url": "/api/2014/equipment/blowgun"
    }
  },
  {
    "index": "hand-crossbows",
    "type": "Weapons",
    "name": "Hand crossbows",
    "classes": [
      {
        "index": "bard",
        "name": "Bard",
        "url": "/api/2014/classes/bard"
      },
      {
        "index": "rogue",
        "name": "Rogue",
        "url": "/api/2014/classes/rogue"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/hand-crossbows",
    "reference": {
      "index": "crossbow-hand",
      "name": "Crossbow, hand",
      "url": "/api/2014/equipment/crossbow-hand"
    }
  },
  {
    "index": "crossbows-heavy",
    "type": "Weapons",
    "name": "Crossbows, heavy",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/crossbows-heavy",
    "reference": {
      "index": "crossbow-heavy",
      "name": "Crossbow, heavy",
      "url": "/api/2014/equipment/crossbow-heavy"
    }
  },
  {
    "index": "longbows",
    "type": "Weapons",
    "name": "Longbows",
    "classes": [],
    "races": [
      {
        "index": "high-elf",
        "name": "High Elf",
        "url": "/api/2014/subraces/high-elf"
      }
    ],
    "url": "/api/2014/proficiencies/longbows",
    "reference": {
      "index": "longbow",
      "name": "Longbow",
      "url": "/api/2014/equipment/longbow"
    }
  },
  {
    "index": "nets",
    "type": "Weapons",
    "name": "Nets",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/nets",
    "reference": {
      "index": "net",
      "name": "Net",
      "url": "/api/2014/equipment/net"
    }
  },
  {
    "index": "alchemists-supplies",
    "type": "Artisan's Tools",
    "name": "Alchemist's Supplies",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/alchemists-supplies",
    "reference": {
      "index": "alchemists-supplies",
      "name": "Alchemist's Supplies",
      "url": "/api/2014/equipment/alchemists-supplies"
    }
  },
  {
    "index": "brewers-supplies",
    "type": "Artisan's Tools",
    "name": "Brewer's Supplies",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/brewers-supplies",
    "reference": {
      "index": "brewers-supplies",
      "name": "Brewer's Supplies",
      "url": "/api/2014/equipment/brewers-supplies"
    }
  },
  {
    "index": "calligraphers-supplies",
    "type": "Artisan's Tools",
    "name": "Calligrapher's Supplies",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/calligraphers-supplies",
    "reference": {
      "index": "calligraphers-supplies",
      "name": "Calligrapher's Supplies",
      "url": "/api/2014/equipment/calligraphers-supplies"
    }
  },
  {
    "index": "carpenters-tools",
    "type": "Artisan's Tools",
    "name": "Carpenter's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/carpenters-tools",
    "reference": {
      "index": "carpenters-tools",
      "name": "Carpenter's Tools",
      "url": "/api/2014/equipment/carpenters-tools"
    }
  },
  {
    "index": "cartographers-tools",
    "type": "Artisan's Tools",
    "name": "Cartographer's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/cartographers-tools",
    "reference": {
      "index": "cartographers-tools",
      "name": "Cartographer's Tools",
      "url": "/api/2014/equipment/cartographers-tools"
    }
  },
  {
    "index": "cobblers-tools",
    "type": "Artisan's Tools",
    "name": "Cobbler's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/cobblers-tools",
    "reference": {
      "index": "cobblers-tools",
      "name": "Cobbler's Tools",
      "url": "/api/2014/equipment/cobblers-tools"
    }
  },
  {
    "index": "cooks-utensils",
    "type": "Artisan's Tools",
    "name": "Cook's utensils",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/cooks-utensils",
    "reference": {
      "index": "cooks-utensils",
      "name": "Cook's utensils",
      "url": "/api/2014/equipment/cooks-utensils"
    }
  },
  {
    "index": "glassblowers-tools",
    "type": "Artisan's Tools",
    "name": "Glassblower's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/glassblowers-tools",
    "reference": {
      "index": "glassblowers-tools",
      "name": "Glassblower's Tools",
      "url": "/api/2014/equipment/glassblowers-tools"
    }
  },
  {
    "index": "jewelers-tools",
    "type": "Artisan's Tools",
    "name": "Jeweler's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/jewelers-tools",
    "reference": {
      "index": "jewelers-tools",
      "name": "Jeweler's Tools",
      "url": "/api/2014/equipment/jewelers-tools"
    }
  },
  {
    "index": "leatherworkers-tools",
    "type": "Artisan's Tools",
    "name": "Leatherworker's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/leatherworkers-tools",
    "reference": {
      "index": "leatherworkers-tools",
      "name": "Leatherworker's Tools",
      "url": "/api/2014/equipment/leatherworkers-tools"
    }
  },
  {
    "index": "masons-tools",
    "type": "Artisan's Tools",
    "name": "Mason's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/masons-tools",
    "reference": {
      "index": "masons-tools",
      "name": "Mason's Tools",
      "url": "/api/2014/equipment/masons-tools"
    }
  },
  {
    "index": "painters-supplies",
    "type": "Artisan's Tools",
    "name": "Painter's Supplies",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/painters-supplies",
    "reference": {
      "index": "painters-supplies",
      "name": "Painter's Supplies",
      "url": "/api/2014/equipment/painters-supplies"
    }
  },
  {
    "index": "potters-tools",
    "type": "Artisan's Tools",
    "name": "Potter's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/potters-tools",
    "reference": {
      "index": "potters-tools",
      "name": "Potter's Tools",
      "url": "/api/2014/equipment/potters-tools"
    }
  },
  {
    "index": "smiths-tools",
    "type": "Artisan's Tools",
    "name": "Smith's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/smiths-tools",
    "reference": {
      "index": "smiths-tools",
      "name": "Smith's Tools",
      "url": "/api/2014/equipment/smiths-tools"
    }
  },
  {
    "index": "tinkers-tools",
    "type": "Artisan's Tools",
    "name": "Tinker's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/tinkers-tools",
    "reference": {
      "index": "tinkers-tools",
      "name": "Tinker's Tools",
      "url": "/api/2014/equipment/tinkers-tools"
    }
  },
  {
    "index": "weavers-tools",
    "type": "Artisan's Tools",
    "name": "Weaver's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/weavers-tools",
    "reference": {
      "index": "weavers-tools",
      "name": "Weaver's Tools",
      "url": "/api/2014/equipment/weavers-tools"
    }
  },
  {
    "index": "woodcarvers-tools",
    "type": "Artisan's Tools",
    "name": "Woodcarver's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/woodcarvers-tools",
    "reference": {
      "index": "woodcarvers-tools",
      "name": "Woodcarver's Tools",
      "url": "/api/2014/equipment/woodcarvers-tools"
    }
  },
  {
    "index": "disguise-kit",
    "type": "Artisan's Tools",
    "name": "Disguise Kit",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/disguise-kit",
    "reference": {
      "index": "disguise-kit",
      "name": "Disguise Kit",
      "url": "/api/2014/equipment/disguise-kit"
    }
  },
  {
    "index": "forgery-kit",
    "type": "Artisan's Tools",
    "name": "Forgery Kit",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/forgery-kit",
    "reference": {
      "index": "forgery-kit",
      "name": "Forgery Kit",
      "url": "/api/2014/equipment/forgery-kit"
    }
  },
  {
    "index": "dice-set",
    "type": "Gaming Sets",
    "name": "Dice Set",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/dice-set",
    "reference": {
      "index": "dice-set",
      "name": "Dice Set",
      "url": "/api/2014/equipment/dice-set"
    }
  },
  {
    "index": "playing-card-set",
    "type": "Gaming Sets",
    "name": "Playing Card Set",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/playing-card-set",
    "reference": {
      "index": "playing-card-set",
      "name": "Playing Card Set",
      "url": "/api/2014/equipment/playing-card-set"
    }
  },
  {
    "index": "bagpipes",
    "type": "Musical Instruments",
    "name": "Bagpipes",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/bagpipes",
    "reference": {
      "index": "bagpipes",
      "name": "Bagpipes",
      "url": "/api/2014/equipment/bagpipes"
    }
  },
  {
    "index": "drum",
    "type": "Musical Instruments",
    "name": "Drum",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/drum",
    "reference": {
      "index": "drum",
      "name": "Drum",
      "url": "/api/2014/equipment/drum"
    }
  },
  {
    "index": "dulcimer",
    "type": "Musical Instruments",
    "name": "Dulcimer",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/dulcimer",
    "reference": {
      "index": "dulcimer",
      "name": "Dulcimer",
      "url": "/api/2014/equipment/dulcimer"
    }
  },
  {
    "index": "flute",
    "type": "Musical Instruments",
    "name": "Flute",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/flute",
    "reference": {
      "index": "flute",
      "name": "Flute",
      "url": "/api/2014/equipment/flute"
    }
  },
  {
    "index": "lute",
    "type": "Musical Instruments",
    "name": "Lute",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/lute",
    "reference": {
      "index": "lute",
      "name": "Lute",
      "url": "/api/2014/equipment/lute"
    }
  },
  {
    "index": "lyre",
    "type": "Musical Instruments",
    "name": "Lyre",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/lyre",
    "reference": {
      "index": "lyre",
      "name": "Lyre",
      "url": "/api/2014/equipment/lyre"
    }
  },
  {
    "index": "horn",
    "type": "Musical Instruments",
    "name": "Horn",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/horn",
    "reference": {
      "index": "horn",
      "name": "Horn",
      "url": "/api/2014/equipment/horn"
    }
  },
  {
    "index": "pan-flute",
    "type": "Musical Instruments",
    "name": "Pan flute",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/pan-flute",
    "reference": {
      "index": "pan-flute",
      "name": "Pan flute",
      "url": "/api/2014/equipment/pan-flute"
    }
  },
  {
    "index": "shawm",
    "type": "Musical Instruments",
    "name": "Shawm",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/shawm",
    "reference": {
      "index": "shawm",
      "name": "Shawm",
      "url": "/api/2014/equipment/shawm"
    }
  },
  {
    "index": "viol",
    "type": "Musical Instruments",
    "name": "Viol",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/viol",
    "reference": {
      "index": "viol",
      "name": "Viol",
      "url": "/api/2014/equipment/viol"
    }
  },
  {
    "index": "herbalism-kit",
    "type": "Other",
    "name": "Herbalism Kit",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/herbalism-kit",
    "reference": {
      "index": "herbalism-kit",
      "name": "Herbalism Kit",
      "url": "/api/2014/equipment/herbalism-kit"
    }
  },
  {
    "index": "navigators-tools",
    "type": "Other",
    "name": "Navigator's Tools",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/navigators-tools",
    "reference": {
      "index": "navigators-tools",
      "name": "Navigator's Tools",
      "url": "/api/2014/equipment/navigators-tools"
    }
  },
  {
    "index": "poisoners-kit",
    "type": "Other",
    "name": "Poisoner's Kit",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/poisoners-kit",
    "reference": {
      "index": "poisoners-kit",
      "name": "Poisoner's Kit",
      "url": "/api/2014/equipment/poisoners-kit"
    }
  },
  {
    "index": "thieves-tools",
    "type": "Other",
    "name": "Thieves' Tools",
    "classes": [
      {
        "index": "rogue",
        "name": "Rogue",
        "url": "/api/2014/classes/rogue"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/thieves-tools",
    "reference": {
      "index": "thieves-tools",
      "name": "Thieves' Tools",
      "url": "/api/2014/equipment/thieves-tools"
    }
  },
  {
    "index": "land-vehicles",
    "type": "Vehicles",
    "name": "Land Vehicles",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/land-vehicles",
    "reference": {
      "index": "land-vehicles",
      "name": "Land Vehicles",
      "url": "/api/2014/equipment-categories/land-vehicles"
    }
  },
  {
    "index": "water-vehicles",
    "type": "Vehicles",
    "name": "Water Vehicles",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/water-vehicles",
    "reference": {
      "index": "waterborne-vehicles",
      "name": "Waterborne Vehicles",
      "url": "/api/2014/equipment-categories/waterborne-vehicles"
    }
  },
  {
    "index": "saving-throw-str",
    "type": "Saving Throws",
    "name": "Saving Throw: STR",
    "classes": [
      {
        "index": "barbarian",
        "name": "Barbarian",
        "url": "/api/2014/classes/barbarian"
      },
      {
        "index": "fighter",
        "name": "Fighter",
        "url": "/api/2014/classes/fighter"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/classes/monk"
      },
      {
        "index": "ranger",
        "name": "Ranger",
        "url": "/api/2014/classes/ranger"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/saving-throw-str",
    "reference": {
      "index": "str",
      "name": "STR",
      "url": "/api/2014/ability-scores/str"
    }
  },
  {
    "index": "saving-throw-dex",
    "type": "Saving Throws",
    "name": "Saving Throw: DEX",
    "classes": [
      {
        "index": "bard",
        "name": "Bard",
        "url": "/api/2014/classes/bard"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/classes/monk"
      },
      {
        "index": "ranger",
        "name": "Ranger",
        "url": "/api/2014/classes/ranger"
      },
      {
        "index": "rogue",
        "name": "Rogue",
        "url": "/api/2014/classes/rogue"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/saving-throw-dex",
    "reference": {
      "index": "dex",
      "name": "DEX",
      "url": "/api/2014/ability-scores/dex"
    }
  },
  {
    "index": "saving-throw-con",
    "type": "Saving Throws",
    "name": "Saving Throw: CON",
    "classes": [
      {
        "index": "barbarian",
        "name": "Barbarian",
        "url": "/api/2014/classes/barbarian"
      },
      {
        "index": "fighter",
        "name": "Fighter",
        "url": "/api/2014/classes/fighter"
      },
      {
        "index": "sorcerer",
        "name": "Sorcerer",
        "url": "/api/2014/classes/sorcerer"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/saving-throw-con",
    "reference": {
      "index": "con",
      "name": "CON",
      "url": "/api/2014/ability-scores/con"
    }
  },
  {
    "index": "saving-throw-int",
    "type": "Saving Throws",
    "name": "Saving Throw: INT",
    "classes": [
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      },
      {
        "index": "rogue",
        "name": "Rogue",
        "url": "/api/2014/classes/rogue"
      },
      {
        "index": "wizard",
        "name": "Wizard",
        "url": "/api/2014/classes/wizard"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/saving-throw-int",
    "reference": {
      "index": "int",
      "name": "INT",
      "url": "/api/2014/ability-scores/int"
    }
  },
  {
    "index": "saving-throw-wis",
    "type": "Saving Throws",
    "name": "Saving Throw: WIS",
    "classes": [
      {
        "index": "cleric",
        "name": "Cleric",
        "url": "/api/2014/classes/cleric"
      },
      {
        "index": "druid",
        "name": "Druid",
        "url": "/api/2014/classes/druid"
      },
      {
        "index": "paladin",
        "name": "Paladin",
        "url": "/api/2014/classes/paladin"
      },
      {
        "index": "warlock",
        "name": "Warlock",
        "url": "/api/2014/classes/warlock"
      },
      {
        "index": "wizard",
        "name": "Wizard",
        "url": "/api/2014/classes/wizard"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/saving-throw-wis",
    "reference": {
      "index": "wis",
      "name": "WIS",
      "url": "/api/2014/ability-scores/wis"
    }
  },
  {
    "index": "saving-throw-cha",
    "type": "Saving Throws",
    "name": "Saving Throw: CHA",
    "classes": [
      {
        "index": "bard",
        "name": "Bard",
        "url": "/api/2014/classes/bard"
      },
      {
        "index": "cleric",
        "name": "Cleric",
        "url": "/api/2014/classes/cleric"
      },
      {
        "index": "paladin",
        "name": "Paladin",
        "url": "/api/2014/classes/paladin"
      },
      {
        "index": "sorcerer",
        "name": "Sorcerer",
        "url": "/api/2014/classes/sorcerer"
      },
      {
        "index": "warlock",
        "name": "Warlock",
        "url": "/api/2014/classes/warlock"
      }
    ],
    "races": [],
    "url": "/api/2014/proficiencies/saving-throw-cha",
    "reference": {
      "index": "cha",
      "name": "CHA",
      "url": "/api/2014/ability-scores/cha"
    }
  },
  {
    "index": "skill-acrobatics",
    "type": "Skills",
    "name": "Skill: Acrobatics",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-acrobatics",
    "reference": {
      "index": "acrobatics",
      "name": "Acrobatics",
      "url": "/api/2014/skills/acrobatics"
    }
  },
  {
    "index": "skill-animal-handling",
    "type": "Skills",
    "name": "Skill: Animal Handling",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-animal-handling",
    "reference": {
      "index": "animal-handling",
      "name": "Animal Handling",
      "url": "/api/2014/skills/animal-handling"
    }
  },
  {
    "index": "skill-arcana",
    "type": "Skills",
    "name": "Skill: Arcana",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-arcana",
    "reference": {
      "index": "arcana",
      "name": "Arcana",
      "url": "/api/2014/skills/arcana"
    }
  },
  {
    "index": "skill-athletics",
    "type": "Skills",
    "name": "Skill: Athletics",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-athletics",
    "reference": {
      "index": "athletics",
      "name": "Athletics",
      "url": "/api/2014/skills/athletics"
    }
  },
  {
    "index": "skill-deception",
    "type": "Skills",
    "name": "Skill: Deception",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-deception",
    "reference": {
      "index": "deception",
      "name": "Deception",
      "url": "/api/2014/skills/deception"
    }
  },
  {
    "index": "skill-history",
    "type": "Skills",
    "name": "Skill: History",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-history",
    "reference": {
      "index": "history",
      "name": "History",
      "url": "/api/2014/skills/history"
    }
  },
  {
    "index": "skill-insight",
    "type": "Skills",
    "name": "Skill: Insight",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-insight",
    "reference": {
      "index": "insight",
      "name": "Insight",
      "url": "/api/2014/skills/insight"
    }
  },
  {
    "index": "skill-intimidation",
    "type": "Skills",
    "name": "Skill: Intimidation",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-intimidation",
    "reference": {
      "index": "intimidation",
      "name": "Intimidation",
      "url": "/api/2014/skills/intimidation"
    }
  },
  {
    "index": "skill-investigation",
    "type": "Skills",
    "name": "Skill: Investigation",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-investigation",
    "reference": {
      "index": "investigation",
      "name": "Investigation",
      "url": "/api/2014/skills/investigation"
    }
  },
  {
    "index": "skill-medicine",
    "type": "Skills",
    "name": "Skill: Medicine",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-medicine",
    "reference": {
      "index": "medicine",
      "name": "Medicine",
      "url": "/api/2014/skills/medicine"
    }
  },
  {
    "index": "skill-nature",
    "type": "Skills",
    "name": "Skill: Nature",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-nature",
    "reference": {
      "index": "nature",
      "name": "Nature",
      "url": "/api/2014/skills/nature"
    }
  },
  {
    "index": "skill-perception",
    "type": "Skills",
    "name": "Skill: Perception",
    "classes": [],
    "races": [
      {
        "index": "elf",
        "name": "Elf",
        "url": "/api/2014/races/elf"
      }
    ],
    "url": "/api/2014/proficiencies/skill-perception",
    "reference": {
      "index": "perception",
      "name": "Perception",
      "url": "/api/2014/skills/perception"
    }
  },
  {
    "index": "skill-performance",
    "type": "Skills",
    "name": "Skill: Performance",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-performance",
    "reference": {
      "index": "performance",
      "name": "Performance",
      "url": "/api/2014/skills/performance"
    }
  },
  {
    "index": "skill-persuasion",
    "type": "Skills",
    "name": "Skill: Persuasion",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-persuasion",
    "reference": {
      "index": "persuasion",
      "name": "Persuasion",
      "url": "/api/2014/skills/persuasion"
    }
  },
  {
    "index": "skill-religion",
    "type": "Skills",
    "name": "Skill: Religion",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-religion",
    "reference": {
      "index": "religion",
      "name": "Religion",
      "url": "/api/2014/skills/religion"
    }
  },
  {
    "index": "skill-sleight-of-hand",
    "type": "Skills",
    "name": "Skill: Sleight of Hand",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-sleight-of-hand",
    "reference": {
      "index": "sleight-of-hand",
      "name": "Sleight of Hand",
      "url": "/api/2014/skills/sleight-of-hand"
    }
  },
  {
    "index": "skill-stealth",
    "type": "Skills",
    "name": "Skill: Stealth",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-stealth",
    "reference": {
      "index": "stealth",
      "name": "Stealth",
      "url": "/api/2014/skills/stealth"
    }
  },
  {
    "index": "skill-survival",
    "type": "Skills",
    "name": "Skill: Survival",
    "classes": [],
    "races": [],
    "url": "/api/2014/proficiencies/skill-survival",
    "reference": {
      "index": "survival",
      "name": "Survival",
      "url": "/api/2014/skills/survival"
    }
  }
]`) as ReadonlyArray<Record<string, unknown>>;
export const TRAIT_RAW = JSON.parse(String.raw`[
  {
    "index": "darkvision",
    "races": [
      {
        "index": "dwarf",
        "name": "Dwarf",
        "url": "/api/2014/races/dwarf"
      },
      {
        "index": "elf",
        "name": "Elf",
        "url": "/api/2014/races/elf"
      },
      {
        "index": "gnome",
        "name": "Gnome",
        "url": "/api/2014/races/gnome"
      },
      {
        "index": "half-elf",
        "name": "Half-Elf",
        "url": "/api/2014/races/half-elf"
      },
      {
        "index": "half-orc",
        "name": "Half-Orc",
        "url": "/api/2014/races/half-orc"
      },
      {
        "index": "tiefling",
        "name": "Tiefling",
        "url": "/api/2014/races/tiefling"
      }
    ],
    "subraces": [],
    "name": "Darkvision",
    "desc": [
      "You have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You cannot discern color in darkness, only shades of gray."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/darkvision"
  },
  {
    "index": "dwarven-resilience",
    "races": [
      {
        "index": "dwarf",
        "name": "Dwarf",
        "url": "/api/2014/races/dwarf"
      }
    ],
    "subraces": [],
    "name": "Dwarven Resilience",
    "desc": [
      "You have advantage on saving throws against poison, and you have resistance against poison damage."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/dwarven-resilience"
  },
  {
    "index": "dwarven-combat-training",
    "races": [
      {
        "index": "dwarf",
        "name": "Dwarf",
        "url": "/api/2014/races/dwarf"
      }
    ],
    "subraces": [],
    "name": "Dwarven Combat Training",
    "desc": [
      "You have proficiency with the battleaxe, handaxe, light hammer, and warhammer."
    ],
    "proficiencies": [
      {
        "index": "battleaxes",
        "name": "Battleaxes",
        "url": "/api/2014/proficiencies/battleaxes"
      },
      {
        "index": "handaxes",
        "name": "Handaxes",
        "url": "/api/2014/proficiencies/handaxes"
      },
      {
        "index": "light-hammers",
        "name": "Light hammers",
        "url": "/api/2014/proficiencies/light-hammers"
      },
      {
        "index": "warhammers",
        "name": "Warhammers",
        "url": "/api/2014/proficiencies/warhammers"
      }
    ],
    "url": "/api/2014/traits/dwarven-combat-training"
  },
  {
    "index": "tool-proficiency",
    "races": [
      {
        "index": "dwarf",
        "name": "Dwarf",
        "url": "/api/2014/races/dwarf"
      }
    ],
    "subraces": [],
    "name": "Tool Proficiency",
    "desc": [
      "You gain proficiency with the artisan's tools of your choice: smith's tools, brewer's supplies, or mason's tools."
    ],
    "proficiencies": [],
    "proficiency_choices": {
      "choose": 1,
      "type": "proficiencies",
      "from": {
        "option_set_type": "options_array",
        "options": [
          {
            "option_type": "reference",
            "item": {
              "index": "smiths-tools",
              "name": "Smith's Tools",
              "url": "/api/2014/proficiencies/smiths-tools"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "brewers-supplies",
              "name": "Brewer's Supplies",
              "url": "/api/2014/proficiencies/brewers-supplies"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "masons-tools",
              "name": "Mason's Tools",
              "url": "/api/2014/proficiencies/masons-tools"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/tool-proficiency"
  },
  {
    "index": "stonecunning",
    "races": [
      {
        "index": "dwarf",
        "name": "Dwarf",
        "url": "/api/2014/races/dwarf"
      }
    ],
    "subraces": [],
    "name": "Stonecunning",
    "desc": [
      "Whenever you make an Intelligence (History) check related to the origin of stonework, you are considered proficient in the History skill and add double your proficiency bonus to the check, instead of your normal proficiency bonus."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/stonecunning"
  },
  {
    "index": "dwarven-toughness",
    "races": [],
    "subraces": [
      {
        "index": "hill-dwarf",
        "name": "Hill Dwarf",
        "url": "/api/2014/subraces/hill-dwarf"
      }
    ],
    "name": "Dwarven Toughness",
    "desc": [
      "Your hit point maximum increases by 1, and it increases by 1 every time you gain a level."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/dwarven-toughness"
  },
  {
    "index": "keen-senses",
    "races": [
      {
        "index": "elf",
        "name": "Elf",
        "url": "/api/2014/races/elf"
      }
    ],
    "subraces": [],
    "name": "Keen Senses",
    "desc": [
      "You have proficiency in the Perception skill."
    ],
    "proficiencies": [
      {
        "index": "skill-perception",
        "name": "Skill: Perception",
        "url": "/api/2014/proficiencies/skill-perception"
      }
    ],
    "url": "/api/2014/traits/keen-senses"
  },
  {
    "index": "fey-ancestry",
    "races": [
      {
        "index": "elf",
        "name": "Elf",
        "url": "/api/2014/races/elf"
      },
      {
        "index": "half-elf",
        "name": "Half-Elf",
        "url": "/api/2014/races/half-elf"
      }
    ],
    "subraces": [],
    "name": "Fey Ancestry",
    "desc": [
      "You have advantage on saving throws against being charmed, and magic cannot put you to sleep."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/fey-ancestry"
  },
  {
    "index": "trance",
    "races": [
      {
        "index": "elf",
        "name": "Elf",
        "url": "/api/2014/races/elf"
      }
    ],
    "subraces": [],
    "name": "Trance",
    "desc": [
      "Elves do not need to sleep. Instead, they meditate deeply, remaining semiconscious, for 4 hours a day. (The Common word for such meditation is \"trance.\") While meditating, you can dream after a fashion; such dreams are actually mental exercises that have become reflexive through years of practice. After resting this way, you gain the same benefit that a human does from 8 hours of sleep."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/trance"
  },
  {
    "index": "elf-weapon-training",
    "races": [],
    "subraces": [
      {
        "index": "high-elf",
        "name": "High Elf",
        "url": "/api/2014/subraces/high-elf"
      }
    ],
    "name": "Elf Weapon Training",
    "desc": [
      "You have proficiency with the longsword, shortsword, shortbow, and longbow."
    ],
    "proficiencies": [
      {
        "index": "longswords",
        "name": "Longswords",
        "url": "/api/2014/proficiencies/longswords"
      },
      {
        "index": "shortswords",
        "name": "Shortswords",
        "url": "/api/2014/proficiencies/shortswords"
      },
      {
        "index": "shortbows",
        "name": "Shortbows",
        "url": "/api/2014/proficiencies/shortbows"
      },
      {
        "index": "longbows",
        "name": "Longbows",
        "url": "/api/2014/proficiencies/longbows"
      }
    ],
    "url": "/api/2014/traits/elf-weapon-training"
  },
  {
    "index": "high-elf-cantrip",
    "races": [],
    "subraces": [
      {
        "index": "high-elf",
        "name": "High Elf",
        "url": "/api/2014/subraces/high-elf"
      }
    ],
    "name": "High Elf Cantrip",
    "desc": [
      "You know one cantrip of your choice form the wizard spell list. Intelligence is your spellcasting ability for it."
    ],
    "proficiencies": [],
    "trait_specific": {
      "spell_options": {
        "choose": 1,
        "from": {
          "option_set_type": "options_array",
          "options": [
            {
              "option_type": "reference",
              "item": {
                "index": "light",
                "name": "Light",
                "url": "/api/2014/spells/light"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "mage-hand",
                "name": "Mage Hand",
                "url": "/api/2014/spells/mage-hand"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "mending",
                "name": "Mending",
                "url": "/api/2014/spells/mending"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "message",
                "name": "Message",
                "url": "/api/2014/spells/message"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "minor-illusion",
                "name": "Minor Illusion",
                "url": "/api/2014/spells/minor-illusion"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "acid-splash",
                "name": "Acid Splash",
                "url": "/api/2014/spells/acid-splash"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "prestidigitation",
                "name": "Prestidigitation",
                "url": "/api/2014/spells/prestidigitation"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "ray-of-frost",
                "name": "Ray of Frost",
                "url": "/api/2014/spells/ray-of-frost"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "shocking-grasp",
                "name": "Shocking Grasp",
                "url": "/api/2014/spells/shocking-grasp"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "true-strike",
                "name": "True Strike",
                "url": "/api/2014/spells/true-strike"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "chill-touch",
                "name": "Chill Touch",
                "url": "/api/2014/spells/chill-touch"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "dancing-lights",
                "name": "Dancing Lights",
                "url": "/api/2014/spells/dancing-lights"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "fire-bolt",
                "name": "Fire Bolt",
                "url": "/api/2014/spells/fire-bolt"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "poison-spray",
                "name": "Poison Spray",
                "url": "/api/2014/spells/poison-spray"
              }
            }
          ]
        },
        "type": "spell"
      }
    },
    "url": "/api/2014/traits/high-elf-cantrip"
  },
  {
    "index": "extra-language",
    "races": [],
    "subraces": [
      {
        "index": "high-elf",
        "name": "High Elf",
        "url": "/api/2014/subraces/high-elf"
      }
    ],
    "name": "Extra Language",
    "desc": [
      "You can speak, read, and write one extra language of your choice."
    ],
    "proficiencies": [],
    "language_options": {
      "choose": 1,
      "type": "languages",
      "from": {
        "option_set_type": "options_array",
        "options": [
          {
            "option_type": "reference",
            "item": {
              "index": "dwarvish",
              "name": "Dwarvish",
              "url": "/api/2014/languages/dwarvish"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "giant",
              "name": "Giant",
              "url": "/api/2014/languages/giant"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "gnomish",
              "name": "Gnomish",
              "url": "/api/2014/languages/gnomish"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "goblin",
              "name": "Goblin",
              "url": "/api/2014/languages/goblin"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "halfling",
              "name": "Halfling",
              "url": "/api/2014/languages/halfling"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "orc",
              "name": "Orc",
              "url": "/api/2014/languages/orc"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "abyssal",
              "name": "Abyssal",
              "url": "/api/2014/languages/abyssal"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "celestial",
              "name": "Celestial",
              "url": "/api/2014/languages/celestial"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "draconic",
              "name": "Draconic",
              "url": "/api/2014/languages/draconic"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "deep-speech",
              "name": "Deep Speech",
              "url": "/api/2014/languages/deep-speech"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "infernal",
              "name": "Infernal",
              "url": "/api/2014/languages/infernal"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "primordial",
              "name": "Primordial",
              "url": "/api/2014/languages/primordial"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "sylvan",
              "name": "Sylvan",
              "url": "/api/2014/languages/sylvan"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "undercommon",
              "name": "Undercommon",
              "url": "/api/2014/languages/undercommon"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/extra-language"
  },
  {
    "index": "lucky",
    "races": [
      {
        "index": "halfling",
        "name": "Halfling",
        "url": "/api/2014/races/halfling"
      }
    ],
    "subraces": [],
    "name": "Lucky",
    "desc": [
      "When you roll a 1 on the d20 for an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/lucky"
  },
  {
    "index": "brave",
    "races": [
      {
        "index": "halfling",
        "name": "Halfling",
        "url": "/api/2014/races/halfling"
      }
    ],
    "subraces": [],
    "name": "Brave",
    "desc": [
      "You have advantage on saving throw against being frightened."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/brave"
  },
  {
    "index": "halfling-nimbleness",
    "races": [
      {
        "index": "halfling",
        "name": "Halfling",
        "url": "/api/2014/races/halfling"
      }
    ],
    "subraces": [],
    "name": "Halfling Nimbleness",
    "desc": [
      "You can move through the space of any creature that is of a size larger than yours."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/halfling-nimbleness"
  },
  {
    "index": "naturally-stealthy",
    "races": [],
    "subraces": [
      {
        "index": "lightfoot-halfling",
        "name": "Lightfoot Halfling",
        "url": "/api/2014/subraces/lightfoot-halfling"
      }
    ],
    "name": "Naturally Stealthy",
    "desc": [
      "You can attempt to hide even when you are obscured only by a creature that is at least one size larger than you."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/naturally-stealthy"
  },
  {
    "index": "draconic-ancestry",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Draconic Ancestry",
    "desc": [
      "You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table."
    ],
    "proficiencies": [],
    "trait_specific": {
      "subtrait_options": {
        "choose": 1,
        "from": {
          "option_set_type": "options_array",
          "options": [
            {
              "option_type": "reference",
              "item": {
                "index": "draconic-ancestry-black",
                "name": "Draconic Ancestry (Black)",
                "url": "/api/2014/traits/draconic-ancestry-black"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "draconic-ancestry-blue",
                "name": "Draconic Ancestry (Blue)",
                "url": "/api/2014/traits/draconic-ancestry-blue"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "draconic-ancestry-brass",
                "name": "Draconic Ancestry (Brass)",
                "url": "/api/2014/traits/draconic-ancestry-brass"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "draconic-ancestry-bronze",
                "name": "Draconic Ancestry (Bronze)",
                "url": "/api/2014/traits/draconic-ancestry-bronze"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "draconic-ancestry-copper",
                "name": "Draconic Ancestry (Copper)",
                "url": "/api/2014/traits/draconic-ancestry-copper"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "draconic-ancestry-gold",
                "name": "Draconic Ancestry (Gold)",
                "url": "/api/2014/traits/draconic-ancestry-gold"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "draconic-ancestry-green",
                "name": "Draconic Ancestry (Green)",
                "url": "/api/2014/traits/draconic-ancestry-green"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "draconic-ancestry-red",
                "name": "Draconic Ancestry (Red)",
                "url": "/api/2014/traits/draconic-ancestry-red"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "draconic-ancestry-silver",
                "name": "Draconic Ancestry (Silver)",
                "url": "/api/2014/traits/draconic-ancestry-silver"
              }
            },
            {
              "option_type": "reference",
              "item": {
                "index": "draconic-ancestry-white",
                "name": "Draconic Ancestry (White)",
                "url": "/api/2014/traits/draconic-ancestry-white"
              }
            }
          ]
        },
        "type": "trait"
      }
    },
    "url": "/api/2014/traits/draconic-ancestry"
  },
  {
    "index": "draconic-ancestry-black",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Draconic Ancestry (Black)",
    "desc": [
      "You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table."
    ],
    "parent": {
      "index": "draconic-ancestry",
      "name": "Draconic Ancestry",
      "url": "/api/2014/traits/draconic-ancestry"
    },
    "proficiencies": [],
    "trait_specific": {
      "damage_type": {
        "index": "acid",
        "name": "Acid",
        "url": "/api/2014/damage-types/acid"
      },
      "breath_weapon": {
        "name": "Breath Weapon",
        "desc": "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. After you use your breath weapon, you can't use it again until you complete a short or long rest.",
        "area_of_effect": {
          "size": 30,
          "type": "line"
        },
        "usage": {
          "type": "per rest",
          "times": 1
        },
        "dc": {
          "dc_type": {
            "index": "dex",
            "name": "DEX",
            "url": "/api/2014/ability-scores/dex"
          },
          "success_type": "half"
        },
        "damage": [
          {
            "damage_type": {
              "index": "acid",
              "name": "Acid",
              "url": "/api/2014/damage-types/acid"
            },
            "damage_at_character_level": {
              "1": "2d6",
              "6": "3d6",
              "11": "4d6",
              "16": "5d6"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/draconic-ancestry-black"
  },
  {
    "index": "draconic-ancestry-blue",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Draconic Ancestry (Blue)",
    "desc": [
      "You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table."
    ],
    "parent": {
      "index": "draconic-ancestry",
      "name": "Draconic Ancestry",
      "url": "/api/2014/traits/draconic-ancestry"
    },
    "proficiencies": [],
    "trait_specific": {
      "damage_type": {
        "index": "lightning",
        "name": "Lightning",
        "url": "/api/2014/damage-types/lightning"
      },
      "breath_weapon": {
        "name": "Breath Weapon",
        "desc": "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. After you use your breath weapon, you can't use it again until you complete a short or long rest.",
        "area_of_effect": {
          "size": 30,
          "type": "line"
        },
        "usage": {
          "type": "per rest",
          "times": 1
        },
        "dc": {
          "dc_type": {
            "index": "dex",
            "name": "DEX",
            "url": "/api/2014/ability-scores/dex"
          },
          "success_type": "half"
        },
        "damage": [
          {
            "damage_type": {
              "index": "lightning",
              "name": "Lightning",
              "url": "/api/2014/damage-types/lightning"
            },
            "damage_at_character_level": {
              "1": "2d6",
              "6": "3d6",
              "11": "4d6",
              "16": "5d6"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/draconic-ancestry-blue"
  },
  {
    "index": "draconic-ancestry-brass",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Draconic Ancestry (Brass)",
    "desc": [
      "You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table."
    ],
    "parent": {
      "index": "draconic-ancestry",
      "name": "Draconic Ancestry",
      "url": "/api/2014/traits/draconic-ancestry"
    },
    "proficiencies": [],
    "trait_specific": {
      "damage_type": {
        "index": "fire",
        "name": "Fire",
        "url": "/api/2014/damage-types/fire"
      },
      "breath_weapon": {
        "name": "Breath Weapon",
        "desc": "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. After you use your breath weapon, you can't use it again until you complete a short or long rest.",
        "area_of_effect": {
          "size": 30,
          "type": "line"
        },
        "usage": {
          "type": "per rest",
          "times": 1
        },
        "dc": {
          "dc_type": {
            "index": "dex",
            "name": "DEX",
            "url": "/api/2014/ability-scores/dex"
          },
          "success_type": "half"
        },
        "damage": [
          {
            "damage_type": {
              "index": "fire",
              "name": "Fire",
              "url": "/api/2014/damage-types/fire"
            },
            "damage_at_character_level": {
              "1": "2d6",
              "6": "3d6",
              "11": "4d6",
              "16": "5d6"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/draconic-ancestry-brass"
  },
  {
    "index": "draconic-ancestry-bronze",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Draconic Ancestry (Bronze)",
    "desc": [
      "You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table."
    ],
    "parent": {
      "index": "draconic-ancestry",
      "name": "Draconic Ancestry",
      "url": "/api/2014/traits/draconic-ancestry"
    },
    "proficiencies": [],
    "trait_specific": {
      "damage_type": {
        "index": "lightning",
        "name": "Lightning",
        "url": "/api/2014/damage-types/lightning"
      },
      "breath_weapon": {
        "name": "Breath Weapon",
        "desc": "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. After you use your breath weapon, you can't use it again until you complete a short or long rest.",
        "area_of_effect": {
          "size": 30,
          "type": "line"
        },
        "usage": {
          "type": "per rest",
          "times": 1
        },
        "dc": {
          "dc_type": {
            "index": "dex",
            "name": "DEX",
            "url": "/api/2014/ability-scores/dex"
          },
          "success_type": "half"
        },
        "damage": [
          {
            "damage_type": {
              "index": "lightning",
              "name": "Lightning",
              "url": "/api/2014/damage-types/lightning"
            },
            "damage_at_character_level": {
              "1": "2d6",
              "6": "3d6",
              "11": "4d6",
              "16": "5d6"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/draconic-ancestry-bronze"
  },
  {
    "index": "draconic-ancestry-copper",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Draconic Ancestry (Copper)",
    "desc": [
      "You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table."
    ],
    "parent": {
      "index": "draconic-ancestry",
      "name": "Draconic Ancestry",
      "url": "/api/2014/traits/draconic-ancestry"
    },
    "proficiencies": [],
    "trait_specific": {
      "damage_type": {
        "index": "acid",
        "name": "Acid",
        "url": "/api/2014/damage-types/acid"
      },
      "breath_weapon": {
        "name": "Breath Weapon",
        "desc": "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. After you use your breath weapon, you can't use it again until you complete a short or long rest.",
        "area_of_effect": {
          "size": 30,
          "type": "line"
        },
        "usage": {
          "type": "per rest",
          "times": 1
        },
        "dc": {
          "dc_type": {
            "index": "dex",
            "name": "DEX",
            "url": "/api/2014/ability-scores/dex"
          },
          "success_type": "half"
        },
        "damage": [
          {
            "damage_type": {
              "index": "acid",
              "name": "Acid",
              "url": "/api/2014/damage-types/acid"
            },
            "damage_at_character_level": {
              "1": "2d6",
              "6": "3d6",
              "11": "4d6",
              "16": "5d6"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/draconic-ancestry-copper"
  },
  {
    "index": "draconic-ancestry-gold",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Draconic Ancestry (Gold)",
    "desc": [
      "You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table."
    ],
    "parent": {
      "index": "draconic-ancestry",
      "name": "Draconic Ancestry",
      "url": "/api/2014/traits/draconic-ancestry"
    },
    "proficiencies": [],
    "trait_specific": {
      "damage_type": {
        "index": "fire",
        "name": "Fire",
        "url": "/api/2014/damage-types/fire"
      },
      "breath_weapon": {
        "name": "Breath Weapon",
        "desc": "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. After you use your breath weapon, you can't use it again until you complete a short or long rest.",
        "area_of_effect": {
          "size": 15,
          "type": "cone"
        },
        "usage": {
          "type": "per rest",
          "times": 1
        },
        "dc": {
          "dc_type": {
            "index": "dex",
            "name": "DEX",
            "url": "/api/2014/ability-scores/dex"
          },
          "success_type": "half"
        },
        "damage": [
          {
            "damage_type": {
              "index": "fire",
              "name": "Fire",
              "url": "/api/2014/damage-types/fire"
            },
            "damage_at_character_level": {
              "1": "2d6",
              "6": "3d6",
              "11": "4d6",
              "16": "5d6"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/draconic-ancestry-gold"
  },
  {
    "index": "draconic-ancestry-green",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Draconic Ancestry (Green)",
    "desc": [
      "You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table."
    ],
    "parent": {
      "index": "draconic-ancestry",
      "name": "Draconic Ancestry",
      "url": "/api/2014/traits/draconic-ancestry"
    },
    "proficiencies": [],
    "trait_specific": {
      "damage_type": {
        "index": "poison",
        "name": "Poison",
        "url": "/api/2014/damage-types/poison"
      },
      "breath_weapon": {
        "name": "Breath Weapon",
        "desc": "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. After you use your breath weapon, you can't use it again until you complete a short or long rest.",
        "area_of_effect": {
          "size": 15,
          "type": "cone"
        },
        "usage": {
          "type": "per rest",
          "times": 1
        },
        "dc": {
          "dc_type": {
            "index": "con",
            "name": "CON",
            "url": "/api/2014/ability-scores/con"
          },
          "success_type": "half"
        },
        "damage": [
          {
            "damage_type": {
              "index": "poison",
              "name": "Poison",
              "url": "/api/2014/damage-types/poison"
            },
            "damage_at_character_level": {
              "1": "2d6",
              "6": "3d6",
              "11": "4d6",
              "16": "5d6"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/draconic-ancestry-green"
  },
  {
    "index": "draconic-ancestry-red",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Draconic Ancestry (Red)",
    "desc": [
      "You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table."
    ],
    "parent": {
      "index": "draconic-ancestry",
      "name": "Draconic Ancestry",
      "url": "/api/2014/traits/draconic-ancestry"
    },
    "proficiencies": [],
    "trait_specific": {
      "damage_type": {
        "index": "fire",
        "name": "Fire",
        "url": "/api/2014/damage-types/fire"
      },
      "breath_weapon": {
        "name": "Breath Weapon",
        "desc": "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. After you use your breath weapon, you can't use it again until you complete a short or long rest.",
        "area_of_effect": {
          "size": 15,
          "type": "cone"
        },
        "usage": {
          "type": "per rest",
          "times": 1
        },
        "dc": {
          "dc_type": {
            "index": "dex",
            "name": "DEX",
            "url": "/api/2014/ability-scores/dex"
          },
          "success_type": "half"
        },
        "damage": [
          {
            "damage_type": {
              "index": "fire",
              "name": "Fire",
              "url": "/api/2014/damage-types/fire"
            },
            "damage_at_character_level": {
              "1": "2d6",
              "6": "3d6",
              "11": "4d6",
              "16": "5d6"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/draconic-ancestry-red"
  },
  {
    "index": "draconic-ancestry-silver",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Draconic Ancestry (Silver)",
    "desc": [
      "You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table."
    ],
    "parent": {
      "index": "draconic-ancestry",
      "name": "Draconic Ancestry",
      "url": "/api/2014/traits/draconic-ancestry"
    },
    "proficiencies": [],
    "trait_specific": {
      "damage_type": {
        "index": "cold",
        "name": "Cold",
        "url": "/api/2014/damage-types/cold"
      },
      "breath_weapon": {
        "name": "Breath Weapon",
        "desc": "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. After you use your breath weapon, you can't use it again until you complete a short or long rest.",
        "area_of_effect": {
          "size": 15,
          "type": "cone"
        },
        "usage": {
          "type": "per rest",
          "times": 1
        },
        "dc": {
          "dc_type": {
            "index": "con",
            "name": "CON",
            "url": "/api/2014/ability-scores/con"
          },
          "success_type": "half"
        },
        "damage": [
          {
            "damage_type": {
              "index": "cold",
              "name": "Cold",
              "url": "/api/2014/damage-types/cold"
            },
            "damage_at_character_level": {
              "1": "2d6",
              "6": "3d6",
              "11": "4d6",
              "16": "5d6"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/draconic-ancestry-silver"
  },
  {
    "index": "draconic-ancestry-white",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Draconic Ancestry (White)",
    "desc": [
      "You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table."
    ],
    "parent": {
      "index": "draconic-ancestry",
      "name": "Draconic Ancestry",
      "url": "/api/2014/traits/draconic-ancestry"
    },
    "proficiencies": [],
    "trait_specific": {
      "damage_type": {
        "index": "cold",
        "name": "Cold",
        "url": "/api/2014/damage-types/cold"
      },
      "breath_weapon": {
        "name": "Breath Weapon",
        "desc": "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. After you use your breath weapon, you can't use it again until you complete a short or long rest.",
        "area_of_effect": {
          "size": 15,
          "type": "cone"
        },
        "usage": {
          "type": "per rest",
          "times": 1
        },
        "dc": {
          "dc_type": {
            "index": "con",
            "name": "CON",
            "url": "/api/2014/ability-scores/con"
          },
          "success_type": "half"
        },
        "damage": [
          {
            "damage_type": {
              "index": "cold",
              "name": "Cold",
              "url": "/api/2014/damage-types/cold"
            },
            "damage_at_character_level": {
              "1": "2d6",
              "6": "3d6",
              "11": "4d6",
              "16": "5d6"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/draconic-ancestry-white"
  },
  {
    "index": "breath-weapon",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Breath Weapon",
    "desc": [
      "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation.",
      "When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level.",
      "After you use your breath weapon, you cannot use it again until you complete a short or long rest."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/breath-weapon"
  },
  {
    "index": "damage-resistance",
    "races": [
      {
        "index": "dragonborn",
        "name": "Dragonborn",
        "url": "/api/2014/races/dragonborn"
      }
    ],
    "subraces": [],
    "name": "Damage Resistance",
    "desc": [
      "You have resistance to the damage type associated with your draconic ancestry."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/damage-resistance"
  },
  {
    "index": "gnome-cunning",
    "races": [
      {
        "index": "gnome",
        "name": "Gnome",
        "url": "/api/2014/races/gnome"
      }
    ],
    "subraces": [],
    "name": "Gnome Cunning",
    "desc": [
      "You have advantage on all Intelligence, Wisdom, and Charisma saving throws against magic."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/gnome-cunning"
  },
  {
    "index": "artificers-lore",
    "races": [],
    "subraces": [
      {
        "index": "rock-gnome",
        "name": "Rock Gnome",
        "url": "/api/2014/subraces/rock-gnome"
      }
    ],
    "name": "Artificer's Lore",
    "desc": [
      "Whenever you make an Intelligence (History) check related to magic items, alchemical objects, or technological devices, you can add twice your proficiency bonus, instead of any proficiency bonus you normally apply."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/artificers-lore"
  },
  {
    "index": "tinker",
    "races": [],
    "subraces": [
      {
        "index": "rock-gnome",
        "name": "Rock Gnome",
        "url": "/api/2014/subraces/rock-gnome"
      }
    ],
    "name": "Tinker",
    "desc": [
      "You have proficiency with artisan's tools (tinker's tools). Using those tools, you can spend 1 hour and 10 gp worth of materials to construct a Tiny clockwork device (AC 5, 1 hp). The device ceases to function after 24 hours (unless you spend 1 hour repairing it to keep the device functioning), or when you use your action to dismantle it; at that time, you can reclaim the materials used to create it. You can have up to three such devices active at a time.",
      "When you create a device, choose one of the following options:",
      "Clockwork Toy: This toy is a clockwork animal, monster, or person, such as a frog, mouse, bird, dragon, or soldier. When placed on the ground, the toy moves 5 feet across the ground on each of your turns in a random direction. It makes noises as appropriate to the creature it represents.",
      "Fire Starter: The device produces a miniature flame, which you can use to light a candle, torch, or campfire. Using the device requires your action.",
      "Music Box: When opened, this music box plays a single song at a moderate volume. The box stops playing when it reaches the song's end or when it is closed."
    ],
    "proficiencies": [
      {
        "index": "tinkers-tools",
        "name": "Tinker's Tools",
        "url": "/api/2014/proficiencies/tinkers-tools"
      }
    ],
    "url": "/api/2014/traits/tinker"
  },
  {
    "index": "skill-versatility",
    "races": [
      {
        "index": "half-elf",
        "name": "Half-Elf",
        "url": "/api/2014/races/half-elf"
      }
    ],
    "subraces": [],
    "name": "Skill Versatility",
    "desc": [
      "You gain proficiency in two skills of your choice."
    ],
    "proficiencies": [],
    "proficiency_choices": {
      "choose": 2,
      "type": "proficiencies",
      "from": {
        "option_set_type": "options_array",
        "options": [
          {
            "option_type": "reference",
            "item": {
              "index": "skill-acrobatics",
              "name": "Skill: Acrobatics",
              "url": "/api/2014/proficiencies/skill-acrobatics"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-animal-handling",
              "name": "Skill: Animal Handling",
              "url": "/api/2014/proficiencies/skill-animal-handling"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-arcana",
              "name": "Skill: Arcana",
              "url": "/api/2014/proficiencies/skill-arcana"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-athletics",
              "name": "Skill: Athletics",
              "url": "/api/2014/proficiencies/skill-athletics"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-deception",
              "name": "Skill: Deception",
              "url": "/api/2014/proficiencies/skill-deception"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-history",
              "name": "Skill: History",
              "url": "/api/2014/proficiencies/skill-history"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-insight",
              "name": "Skill: Insight",
              "url": "/api/2014/proficiencies/skill-insight"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-intimidation",
              "name": "Skill: Intimidation",
              "url": "/api/2014/proficiencies/skill-intimidation"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-investigation",
              "name": "Skill: Investigation",
              "url": "/api/2014/proficiencies/skill-investigation"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-medicine",
              "name": "Skill: Medicine",
              "url": "/api/2014/proficiencies/skill-medicine"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-nature",
              "name": "Skill: Nature",
              "url": "/api/2014/proficiencies/skill-nature"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-perception",
              "name": "Skill: Perception",
              "url": "/api/2014/proficiencies/skill-perception"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-performance",
              "name": "Skill: Performance",
              "url": "/api/2014/proficiencies/skill-performance"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-persuasion",
              "name": "Skill: Persuasion",
              "url": "/api/2014/proficiencies/skill-persuasion"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-religion",
              "name": "Skill: Religion",
              "url": "/api/2014/proficiencies/skill-religion"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-sleight-of-hand",
              "name": "Skill: Sleight of Hand",
              "url": "/api/2014/proficiencies/skill-sleight-of-hand"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-stealth",
              "name": "Skill: Stealth",
              "url": "/api/2014/proficiencies/skill-stealth"
            }
          },
          {
            "option_type": "reference",
            "item": {
              "index": "skill-survival",
              "name": "Skill: Survival",
              "url": "/api/2014/proficiencies/skill-survival"
            }
          }
        ]
      }
    },
    "url": "/api/2014/traits/skill-versatility"
  },
  {
    "index": "menacing",
    "races": [
      {
        "index": "half-orc",
        "name": "Half-Orc",
        "url": "/api/2014/races/half-orc"
      }
    ],
    "subraces": [],
    "name": "Menacing",
    "desc": [
      "You gain proficiency in the Intimidation skill."
    ],
    "proficiencies": [
      {
        "index": "skill-intimidation",
        "name": "Skill: Intimidation",
        "url": "/api/2014/proficiencies/skill-intimidation"
      }
    ],
    "url": "/api/2014/traits/menacing"
  },
  {
    "index": "relentless-endurance",
    "races": [
      {
        "index": "half-orc",
        "name": "Half-Orc",
        "url": "/api/2014/races/half-orc"
      }
    ],
    "subraces": [],
    "name": "Relentless Endurance",
    "desc": [
      "When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. you cannot use this feature again until you finish a long rest."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/relentless-endurance"
  },
  {
    "index": "savage-attacks",
    "races": [
      {
        "index": "half-orc",
        "name": "Half-Orc",
        "url": "/api/2014/races/half-orc"
      }
    ],
    "subraces": [],
    "name": "Savage Attacks",
    "desc": [
      "When you score a critical hit with a melee weapon attack, you can roll one of the weapon's damage dice one additional time and add it to the extra damage of the critical hit."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/savage-attacks"
  },
  {
    "index": "hellish-resistance",
    "races": [
      {
        "index": "tiefling",
        "name": "Tiefling",
        "url": "/api/2014/races/tiefling"
      }
    ],
    "subraces": [],
    "name": "Hellish Resistance",
    "desc": [
      "You have resistance to fire damage."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/hellish-resistance"
  },
  {
    "index": "infernal-legacy",
    "races": [
      {
        "index": "tiefling",
        "name": "Tiefling",
        "url": "/api/2014/races/tiefling"
      }
    ],
    "subraces": [],
    "name": "Infernal Legacy",
    "desc": [
      "You know the thaumaturgy cantrip. When you reach 3rd level, you can cast the hellish rebuke spell as a 2nd-level spell once with this trait and regain the ability to do so when you finish a long rest. When you reach 5th level, you can cast the darkness spell once with this trait and regain the ability to do so when you finish a long rest. Charisma is your spellcasting ability for these spells."
    ],
    "proficiencies": [],
    "url": "/api/2014/traits/infernal-legacy"
  }
]`) as ReadonlyArray<Record<string, unknown>>;
