import type { BackgroundBody, ClassBody, RaceBody } from "@taverns/api";

export const FIVE_E_BITS_2014_COMMIT = "5a7ee5a0489b26655d343e4a41e8f7942a887af2";
export const FIVE_E_BITS_2014_VERSION = "5e-database 5.10.0";

export interface SourceReference {
  readonly family: string;
  readonly index: string;
  readonly name: string;
  readonly url?: string;
  readonly raw?: unknown;
}

interface SourceOptionFields {
  readonly sourceFamily: string;
  readonly sourceIndex: string;
  readonly sourceUrl?: string;
  readonly name: string;
  readonly raw: unknown;
}

export type SystemOption =
  | ({ readonly kind: "class"; readonly body: ClassBody } & SourceOptionFields)
  | ({ readonly kind: "race"; readonly body: RaceBody } & SourceOptionFields)
  | ({ readonly kind: "background"; readonly body: BackgroundBody } & SourceOptionFields);

const CLASS_RAW = [
  {
    index: "barbarian",
    name: "Barbarian",
    hit_die: 12,
    proficiency_choices: [
      {
        desc: "Choose two from Animal Handling, Athletics, Intimidation, Nature, Perception, and Survival",
        choose: 2,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-animal-handling",
                name: "Skill: Animal Handling",
                url: "/api/2014/proficiencies/skill-animal-handling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-athletics",
                name: "Skill: Athletics",
                url: "/api/2014/proficiencies/skill-athletics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-intimidation",
                name: "Skill: Intimidation",
                url: "/api/2014/proficiencies/skill-intimidation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-nature",
                name: "Skill: Nature",
                url: "/api/2014/proficiencies/skill-nature",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-perception",
                name: "Skill: Perception",
                url: "/api/2014/proficiencies/skill-perception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-survival",
                name: "Skill: Survival",
                url: "/api/2014/proficiencies/skill-survival",
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "light-armor",
        name: "Light Armor",
        url: "/api/2014/proficiencies/light-armor",
      },
      {
        index: "medium-armor",
        name: "Medium Armor",
        url: "/api/2014/proficiencies/medium-armor",
      },
      {
        index: "shields",
        name: "Shields",
        url: "/api/2014/proficiencies/shields",
      },
      {
        index: "simple-weapons",
        name: "Simple Weapons",
        url: "/api/2014/proficiencies/simple-weapons",
      },
      {
        index: "martial-weapons",
        name: "Martial Weapons",
        url: "/api/2014/proficiencies/martial-weapons",
      },
      {
        index: "saving-throw-str",
        name: "Saving Throw: STR",
        url: "/api/2014/proficiencies/saving-throw-str",
      },
      {
        index: "saving-throw-con",
        name: "Saving Throw: CON",
        url: "/api/2014/proficiencies/saving-throw-con",
      },
    ],
    saving_throws: [
      {
        index: "str",
        name: "STR",
        url: "/api/2014/ability-scores/str",
      },
      {
        index: "con",
        name: "CON",
        url: "/api/2014/ability-scores/con",
      },
    ],
    starting_equipment: [
      {
        equipment: {
          index: "explorers-pack",
          name: "Explorer's Pack",
          url: "/api/2014/equipment/explorers-pack",
        },
        quantity: 1,
      },
      {
        equipment: {
          index: "javelin",
          name: "Javelin",
          url: "/api/2014/equipment/javelin",
        },
        quantity: 4,
      },
    ],
    starting_equipment_options: [
      {
        desc: "(a) a greataxe or (b) any martial melee weapon",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "greataxe",
                name: "Greataxe",
                url: "/api/2014/equipment/greataxe",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "any martial melee weapon",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "martial-melee-weapons",
                    name: "Martial Melee Weapons",
                    url: "/api/2014/equipment-categories/martial-melee-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) two handaxes or (b) any simple weapon",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 2,
              of: {
                index: "handaxe",
                name: "Handaxe",
                url: "/api/2014/equipment/handaxe",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "any simple weapon",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "simple-weapons",
                    name: "Simple Weapons",
                    url: "/api/2014/equipment-categories/simple-weapons",
                  },
                },
              },
            },
          ],
        },
      },
    ],
    class_levels: "/api/2014/classes/barbarian/levels",
    multi_classing: {
      prerequisites: [
        {
          ability_score: {
            index: "str",
            name: "STR",
            url: "/api/2014/ability-scores/str",
          },
          minimum_score: 13,
        },
      ],
      proficiencies: [
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "martial-weapons",
          name: "Martial Weapons",
          url: "/api/2014/proficiencies/martial-weapons",
        },
      ],
    },
    subclasses: [
      {
        index: "berserker",
        name: "Berserker",
        url: "/api/2014/subclasses/berserker",
      },
    ],
    url: "/api/2014/classes/barbarian",
  },
  {
    index: "bard",
    name: "Bard",
    hit_die: 8,
    proficiency_choices: [
      {
        desc: "Choose any three",
        choose: 3,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-acrobatics",
                name: "Skill: Acrobatics",
                url: "/api/2014/proficiencies/skill-acrobatics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-animal-handling",
                name: "Skill: Animal Handling",
                url: "/api/2014/proficiencies/skill-animal-handling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-arcana",
                name: "Skill: Arcana",
                url: "/api/2014/proficiencies/skill-arcana",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-athletics",
                name: "Skill: Athletics",
                url: "/api/2014/proficiencies/skill-athletics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-deception",
                name: "Skill: Deception",
                url: "/api/2014/proficiencies/skill-deception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-history",
                name: "Skill: History",
                url: "/api/2014/proficiencies/skill-history",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
                url: "/api/2014/proficiencies/skill-insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-intimidation",
                name: "Skill: Intimidation",
                url: "/api/2014/proficiencies/skill-intimidation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-investigation",
                name: "Skill: Investigation",
                url: "/api/2014/proficiencies/skill-investigation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-medicine",
                name: "Skill: Medicine",
                url: "/api/2014/proficiencies/skill-medicine",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-nature",
                name: "Skill: Nature",
                url: "/api/2014/proficiencies/skill-nature",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-perception",
                name: "Skill: Perception",
                url: "/api/2014/proficiencies/skill-perception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-performance",
                name: "Skill: Performance",
                url: "/api/2014/proficiencies/skill-performance",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-persuasion",
                name: "Skill: Persuasion",
                url: "/api/2014/proficiencies/skill-persuasion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-religion",
                name: "Skill: Religion",
                url: "/api/2014/proficiencies/skill-religion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-sleight-of-hand",
                name: "Skill: Sleight of Hand",
                url: "/api/2014/proficiencies/skill-sleight-of-hand",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-stealth",
                name: "Skill: Stealth",
                url: "/api/2014/proficiencies/skill-stealth",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-survival",
                name: "Skill: Survival",
                url: "/api/2014/proficiencies/skill-survival",
              },
            },
          ],
        },
      },
      {
        desc: "Three musical instruments of your choice",
        choose: 3,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "bagpipes",
                name: "Bagpipes",
                url: "/api/2014/proficiencies/bagpipes",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "drum",
                name: "Drum",
                url: "/api/2014/proficiencies/drum",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "dulcimer",
                name: "Dulcimer",
                url: "/api/2014/proficiencies/dulcimer",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "flute",
                name: "Flute",
                url: "/api/2014/proficiencies/flute",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "lute",
                name: "Lute",
                url: "/api/2014/proficiencies/lute",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "lyre",
                name: "Lyre",
                url: "/api/2014/proficiencies/lyre",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "horn",
                name: "Horn",
                url: "/api/2014/proficiencies/horn",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "pan-flute",
                name: "Pan flute",
                url: "/api/2014/proficiencies/pan-flute",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "shawm",
                name: "Shawm",
                url: "/api/2014/proficiencies/shawm",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "viol",
                name: "Viol",
                url: "/api/2014/proficiencies/viol",
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "light-armor",
        name: "Light Armor",
        url: "/api/2014/proficiencies/light-armor",
      },
      {
        index: "simple-weapons",
        name: "Simple Weapons",
        url: "/api/2014/proficiencies/simple-weapons",
      },
      {
        index: "longswords",
        name: "Longswords",
        url: "/api/2014/proficiencies/longswords",
      },
      {
        index: "rapiers",
        name: "Rapiers",
        url: "/api/2014/proficiencies/rapiers",
      },
      {
        index: "shortswords",
        name: "Shortswords",
        url: "/api/2014/proficiencies/shortswords",
      },
      {
        index: "hand-crossbows",
        name: "Hand crossbows",
        url: "/api/2014/proficiencies/hand-crossbows",
      },
      {
        index: "saving-throw-dex",
        name: "Saving Throw: DEX",
        url: "/api/2014/proficiencies/saving-throw-dex",
      },
      {
        index: "saving-throw-cha",
        name: "Saving Throw: CHA",
        url: "/api/2014/proficiencies/saving-throw-cha",
      },
    ],
    saving_throws: [
      {
        index: "dex",
        name: "DEX",
        url: "/api/2014/ability-scores/dex",
      },
      {
        index: "cha",
        name: "CHA",
        url: "/api/2014/ability-scores/cha",
      },
    ],
    starting_equipment: [
      {
        equipment: {
          index: "leather-armor",
          name: "Leather Armor",
          url: "/api/2014/equipment/leather-armor",
        },
        quantity: 1,
      },
      {
        equipment: {
          index: "dagger",
          name: "Dagger",
          url: "/api/2014/equipment/dagger",
        },
        quantity: 1,
      },
    ],
    starting_equipment_options: [
      {
        desc: "(a) a rapier, (b) a longsword, or (c) any simple weapon",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "rapier",
                name: "Rapier",
                url: "/api/2014/equipment/rapier",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "longsword",
                name: "Longsword",
                url: "/api/2014/equipment/longsword",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "any simple weapon",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "simple-weapons",
                    name: "Simple Weapons",
                    url: "/api/2014/equipment-categories/simple-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a diplomat’s pack or (b) an entertainer’s pack",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "diplomats-pack",
                name: "Diplomat's Pack",
                url: "/api/2014/equipment/diplomats-pack",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "entertainers-pack",
                name: "Entertainer's Pack",
                url: "/api/2014/equipment/entertainers-pack",
              },
            },
          ],
        },
      },
      {
        desc: "(a) a lute or (b) any other musical instrument",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "lute",
                name: "Lute",
                url: "/api/2014/equipment/lute",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "any other musical instrument",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "musical-instruments",
                    name: "Musical Instruments",
                    url: "/api/2014/equipment-categories/musical-instruments",
                  },
                },
              },
            },
          ],
        },
      },
    ],
    class_levels: "/api/2014/classes/bard/levels",
    multi_classing: {
      prerequisites: [
        {
          ability_score: {
            index: "cha",
            name: "CHA",
            url: "/api/2014/ability-scores/cha",
          },
          minimum_score: 13,
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
      ],
      proficiency_choices: [
        {
          desc: "skill",
          choose: 1,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-acrobatics",
                  name: "Skill: Acrobatics",
                  url: "/api/2014/proficiencies/skill-acrobatics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-animal-handling",
                  name: "Skill: Animal Handling",
                  url: "/api/2014/proficiencies/skill-animal-handling",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-arcana",
                  name: "Skill: Arcana",
                  url: "/api/2014/proficiencies/skill-arcana",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-athletics",
                  name: "Skill: Athletics",
                  url: "/api/2014/proficiencies/skill-athletics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-deception",
                  name: "Skill: Deception",
                  url: "/api/2014/proficiencies/skill-deception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-history",
                  name: "Skill: History",
                  url: "/api/2014/proficiencies/skill-history",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-intimidation",
                  name: "Skill: Intimidation",
                  url: "/api/2014/proficiencies/skill-intimidation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-investigation",
                  name: "Skill: Investigation",
                  url: "/api/2014/proficiencies/skill-investigation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-medicine",
                  name: "Skill: Medicine",
                  url: "/api/2014/proficiencies/skill-medicine",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-nature",
                  name: "Skill: Nature",
                  url: "/api/2014/proficiencies/skill-nature",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-perception",
                  name: "Skill: Perception",
                  url: "/api/2014/proficiencies/skill-perception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-performance",
                  name: "Skill: Performance",
                  url: "/api/2014/proficiencies/skill-performance",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-persuasion",
                  name: "Skill: Persuasion",
                  url: "/api/2014/proficiencies/skill-persuasion",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-religion",
                  name: "Skill: Religion",
                  url: "/api/2014/proficiencies/skill-religion",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-sleight-of-hand",
                  name: "Skill: Sleight of Hand",
                  url: "/api/2014/proficiencies/skill-sleight-of-hand",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-stealth",
                  name: "Skill: Stealth",
                  url: "/api/2014/proficiencies/skill-stealth",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-survival",
                  name: "Skill: Survival",
                  url: "/api/2014/proficiencies/skill-survival",
                },
              },
            ],
          },
        },
        {
          desc: "musical instrument",
          choose: 1,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "bagpipes",
                  name: "Bagpipes",
                  url: "/api/2014/proficiencies/bagpipes",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "drum",
                  name: "Drum",
                  url: "/api/2014/proficiencies/drum",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "dulcimer",
                  name: "Dulcimer",
                  url: "/api/2014/proficiencies/dulcimer",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "flute",
                  name: "Flute",
                  url: "/api/2014/proficiencies/flute",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "lute",
                  name: "Lute",
                  url: "/api/2014/proficiencies/lute",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "lyre",
                  name: "Lyre",
                  url: "/api/2014/proficiencies/lyre",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "horn",
                  name: "Horn",
                  url: "/api/2014/proficiencies/horn",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "pan-flute",
                  name: "Pan flute",
                  url: "/api/2014/proficiencies/pan-flute",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "shawm",
                  name: "Shawm",
                  url: "/api/2014/proficiencies/shawm",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "viol",
                  name: "Viol",
                  url: "/api/2014/proficiencies/viol",
                },
              },
            ],
          },
        },
      ],
    },
    subclasses: [
      {
        index: "lore",
        name: "Lore",
        url: "/api/2014/subclasses/lore",
      },
    ],
    spellcasting: {
      level: 1,
      spellcasting_ability: {
        index: "cha",
        name: "CHA",
        url: "/api/2014/ability-scores/cha",
      },
      info: [
        {
          name: "Cantrips",
          desc: [
            "You know two cantrips of your choice from the bard spell list. You learn additional bard cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Bard table.",
          ],
        },
        {
          name: "Spell Slots",
          desc: [
            "The Bard table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
            "For example, if you know the 1st-level spell cure wounds and have a 1st-level and a 2nd-level spell slot available, you can cast cure wounds using either slot.",
          ],
        },
        {
          name: "Spells Known of 1st Level and Higher",
          desc: [
            "You know four 1st-level spells of your choice from the bard spell list.",
            "The Spells Known column of the Bard table shows when you learn more bard spells of your choice.",
            "Each of these spells must be of a level for which you have spell slots, as shown on the table. For instance, when you reach 3rd level in this class, you can learn one new spell of 1st or 2nd level.",
            "Additionally, when you gain a level in this class, you can choose one of the bard spells you know and replace it with another spell from the bard spell list, which also must be of a level for which you have spell slots.",
          ],
        },
        {
          name: "Spellcasting Ability",
          desc: [
            "Charisma is your spellcasting ability for your bard spells. Your magic comes from the heart and soul you pour into the performance of your music or oration. You use your Charisma whenever a spell refers to your spellcasting ability. In addition, you use your Charisma modifier when setting the saving throw DC for a bard spell you cast and when making an attack roll with one.",
            "Spell save DC = 8 + your proficiency bonus + your Charisma modifier.",
            "Spell attack modifier = your proficiency bonus + your Charisma modifier.",
          ],
        },
        {
          name: "Ritual Casting",
          desc: [
            "You can cast any bard spell you know as a ritual if that spell has the ritual tag.",
          ],
        },
        {
          name: "Spellcasting Focus",
          desc: [
            "You can use a musical instrument (see Equipment) as a spellcasting focus for your bard spells.",
          ],
        },
      ],
    },
    spells: "/api/2014/classes/bard/spells",
    url: "/api/2014/classes/bard",
  },
  {
    index: "cleric",
    name: "Cleric",
    hit_die: 8,
    proficiency_choices: [
      {
        desc: "Choose two from History, Insight, Medicine, Persuasion, and Religion",
        choose: 2,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-history",
                name: "Skill: History",
                url: "/api/2014/proficiencies/skill-history",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
                url: "/api/2014/proficiencies/skill-insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-medicine",
                name: "Skill: Medicine",
                url: "/api/2014/proficiencies/skill-medicine",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-persuasion",
                name: "Skill: Persuasion",
                url: "/api/2014/proficiencies/skill-persuasion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-religion",
                name: "Skill: Religion",
                url: "/api/2014/proficiencies/skill-religion",
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "light-armor",
        name: "Light Armor",
        url: "/api/2014/proficiencies/light-armor",
      },
      {
        index: "medium-armor",
        name: "Medium Armor",
        url: "/api/2014/proficiencies/medium-armor",
      },
      {
        index: "shields",
        name: "Shields",
        url: "/api/2014/proficiencies/shields",
      },
      {
        index: "simple-weapons",
        name: "Simple Weapons",
        url: "/api/2014/proficiencies/simple-weapons",
      },
      {
        index: "saving-throw-wis",
        name: "Saving Throw: WIS",
        url: "/api/2014/proficiencies/saving-throw-wis",
      },
      {
        index: "saving-throw-cha",
        name: "Saving Throw: CHA",
        url: "/api/2014/proficiencies/saving-throw-cha",
      },
    ],
    saving_throws: [
      {
        index: "wis",
        name: "WIS",
        url: "/api/2014/ability-scores/wis",
      },
      {
        index: "cha",
        name: "CHA",
        url: "/api/2014/ability-scores/cha",
      },
    ],
    starting_equipment: [
      {
        equipment: {
          index: "shield",
          name: "Shield",
          url: "/api/2014/equipment/shield",
        },
        quantity: 1,
      },
    ],
    starting_equipment_options: [
      {
        desc: "(a) a mace or (b) a warhammer (if proficient)",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "mace",
                name: "Mace",
                url: "/api/2014/equipment/mace",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "warhammer",
                name: "Warhammer",
                url: "/api/2014/equipment/warhammer",
              },
              prerequisites: [
                {
                  type: "proficiency",
                  proficiency: {
                    index: "warhammers",
                    name: "Warhammers",
                    url: "/api/2014/proficiencies/warhammers",
                  },
                },
              ],
            },
          ],
        },
      },
      {
        desc: "(a) scale mail, (b) leather armor, or (c) chain mail (if proficient)",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "scale-mail",
                name: "Scale Mail",
                url: "/api/2014/equipment/scale-mail",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "leather-armor",
                name: "Leather Armor",
                url: "/api/2014/equipment/leather-armor",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "chain-mail",
                name: "Chain Mail",
                url: "/api/2014/equipment/chain-mail",
              },
              prerequisites: [
                {
                  type: "proficiency",
                  proficiency: {
                    index: "chain-mail",
                    name: "Chain Mail",
                    url: "/api/2014/proficiencies/chain-mail",
                  },
                },
              ],
            },
          ],
        },
      },
      {
        desc: "(a) a light crossbow and 20 bolts or (b) any simple weapon",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "multiple",
              items: [
                {
                  option_type: "counted_reference",
                  count: 1,
                  of: {
                    index: "crossbow-light",
                    name: "Crossbow, light",
                    url: "/api/2014/equipment/crossbow-light",
                  },
                },
                {
                  option_type: "counted_reference",
                  count: 20,
                  of: {
                    index: "crossbow-bolt",
                    name: "Crossbow bolt",
                    url: "/api/2014/equipment/crossbow-bolt",
                  },
                },
              ],
            },
            {
              option_type: "choice",
              choice: {
                desc: "any simple weapon",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "simple-weapons",
                    name: "Simple Weapons",
                    url: "/api/2014/equipment-categories/simple-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a priest’s pack or (b) an explorer’s pack",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "priests-pack",
                name: "Priest's Pack",
                url: "/api/2014/equipment/priests-pack",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "explorers-pack",
                name: "Explorer's Pack",
                url: "/api/2014/equipment/explorers-pack",
              },
            },
          ],
        },
      },
      {
        desc: "holy symbol",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "equipment_category",
          equipment_category: {
            index: "holy-symbols",
            name: "Holy Symbols",
            url: "/api/2014/equipment-categories/holy-symbols",
          },
        },
      },
    ],
    class_levels: "/api/2014/classes/cleric/levels",
    multi_classing: {
      prerequisites: [
        {
          ability_score: {
            index: "wis",
            name: "WIS",
            url: "/api/2014/ability-scores/wis",
          },
          minimum_score: 13,
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "medium-armor",
          name: "Medium Armor",
          url: "/api/2014/proficiencies/medium-armor",
        },
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
      ],
    },
    subclasses: [
      {
        index: "life",
        name: "Life",
        url: "/api/2014/subclasses/life",
      },
    ],
    spellcasting: {
      level: 1,
      spellcasting_ability: {
        index: "wis",
        name: "WIS",
        url: "/api/2014/ability-scores/wis",
      },
      info: [
        {
          name: "Cantrips",
          desc: [
            "At 1st level, you know three cantrips of your choice from the cleric spell list. You learn additional cleric cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Cleric table.",
          ],
        },
        {
          name: "Preparing and Casting Spells",
          desc: [
            "The Cleric table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
            "You prepare the list of cleric spells that are available for you to cast, choosing from the cleric spell list. When you do so, choose a number of cleric spells equal to your Wisdom modifier + your cleric level (minimum of one spell). The spells must be of a level for which you have spell slots.",
            "For example, if you are a 3rd-level cleric, you have four 1st-level and two 2nd-level spell slots. With a Wisdom of 16, your list of prepared spells can include six spells of 1st or 2nd level, in any combination. If you prepare the 1st-level spell cure wounds, you can cast it using a 1st-level or 2nd-level slot. Casting the spell doesn't remove it from your list of prepared spells.",
            "You can change your list of prepared spells when you finish a long rest. Preparing a new list of cleric spells requires time spent in prayer and meditation: at least 1 minute per spell level for each spell on your list.",
          ],
        },
        {
          name: "Spellcasting Ability",
          desc: [
            "Wisdom is your spellcasting ability for your cleric spells. The power of your spells comes from your devotion to your deity. You use your Wisdom whenever a cleric spell refers to your spellcasting ability. In addition, you use your Wisdom modifier when setting the saving throw DC for a cleric spell you cast and when making an attack roll with one.",
            "Spell save DC = 8 + your proficiency bonus + your Wisdom modifier",
            "Spell attack modifier = your proficiency bonus + your Wisdom modifier",
          ],
        },
        {
          name: "Ritual Casting",
          desc: [
            "You can cast a cleric spell as a ritual if that spell has the ritual tag and you have the spell prepared.",
          ],
        },
        {
          name: "Spellcasting Focus",
          desc: [
            "You can use a holy symbol (see Equipment) as a spellcasting focus for your cleric spells.",
          ],
        },
      ],
    },
    spells: "/api/2014/classes/cleric/spells",
    url: "/api/2014/classes/cleric",
  },
  {
    index: "druid",
    name: "Druid",
    hit_die: 8,
    proficiency_choices: [
      {
        desc: "Choose two from Arcana, Animal Handling, Insight, Medicine, Nature, Perception, Religion, and Survival",
        choose: 2,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-arcana",
                name: "Skill: Arcana",
                url: "/api/2014/proficiencies/skill-arcana",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-animal-handling",
                name: "Skill: Animal Handling",
                url: "/api/2014/proficiencies/skill-animal-handling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
                url: "/api/2014/proficiencies/skill-insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-medicine",
                name: "Skill: Medicine",
                url: "/api/2014/proficiencies/skill-medicine",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-nature",
                name: "Skill: Nature",
                url: "/api/2014/proficiencies/skill-nature",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-perception",
                name: "Skill: Perception",
                url: "/api/2014/proficiencies/skill-perception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-religion",
                name: "Skill: Religion",
                url: "/api/2014/proficiencies/skill-religion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-survival",
                name: "Skill: Survival",
                url: "/api/2014/proficiencies/skill-survival",
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "light-armor",
        name: "Light Armor",
        url: "/api/2014/proficiencies/light-armor",
      },
      {
        index: "medium-armor",
        name: "Medium Armor",
        url: "/api/2014/proficiencies/medium-armor",
      },
      {
        index: "shields",
        name: "Shields",
        url: "/api/2014/proficiencies/shields",
      },
      {
        index: "clubs",
        name: "Clubs",
        url: "/api/2014/proficiencies/clubs",
      },
      {
        index: "daggers",
        name: "Daggers",
        url: "/api/2014/proficiencies/daggers",
      },
      {
        index: "javelins",
        name: "Javelins",
        url: "/api/2014/proficiencies/javelins",
      },
      {
        index: "maces",
        name: "Maces",
        url: "/api/2014/proficiencies/maces",
      },
      {
        index: "quarterstaffs",
        name: "Quarterstaffs",
        url: "/api/2014/proficiencies/quarterstaffs",
      },
      {
        index: "sickles",
        name: "Sickles",
        url: "/api/2014/proficiencies/sickles",
      },
      {
        index: "spears",
        name: "Spears",
        url: "/api/2014/proficiencies/spears",
      },
      {
        index: "darts",
        name: "Darts",
        url: "/api/2014/proficiencies/darts",
      },
      {
        index: "slings",
        name: "Slings",
        url: "/api/2014/proficiencies/slings",
      },
      {
        index: "scimitars",
        name: "Scimitars",
        url: "/api/2014/proficiencies/scimitars",
      },
      {
        index: "herbalism-kit",
        name: "Herbalism Kit",
        url: "/api/2014/proficiencies/herbalism-kit",
      },
      {
        index: "saving-throw-int",
        name: "Saving Throw: INT",
        url: "/api/2014/proficiencies/saving-throw-int",
      },
      {
        index: "saving-throw-wis",
        name: "Saving Throw: WIS",
        url: "/api/2014/proficiencies/saving-throw-wis",
      },
    ],
    saving_throws: [
      {
        index: "int",
        name: "INT",
        url: "/api/2014/ability-scores/int",
      },
      {
        index: "wis",
        name: "WIS",
        url: "/api/2014/ability-scores/wis",
      },
    ],
    starting_equipment: [
      {
        equipment: {
          index: "leather-armor",
          name: "Leather Armor",
          url: "/api/2014/equipment/leather-armor",
        },
        quantity: 1,
      },
      {
        equipment: {
          index: "explorers-pack",
          name: "Explorer's Pack",
          url: "/api/2014/equipment/explorers-pack",
        },
        quantity: 1,
      },
    ],
    starting_equipment_options: [
      {
        desc: "(a) a wooden shield or (b) any simple weapon",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "shield",
                name: "Shield",
                url: "/api/2014/equipment/shield",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "any simple weapon",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "simple-weapons",
                    name: "Simple Weapons",
                    url: "/api/2014/equipment-categories/simple-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a scimitar or (b) any simple melee weapon",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "scimitar",
                name: "Scimitar",
                url: "/api/2014/equipment/scimitar",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "any simple melee weapon",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "simple-melee-weapons",
                    name: "Simple Melee Weapons",
                    url: "/api/2014/equipment-categories/simple-melee-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "druidic focus",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "equipment_category",
          equipment_category: {
            index: "druidic-foci",
            name: "Druidic Foci",
            url: "/api/2014/equipment-categories/druidic-foci",
          },
        },
      },
    ],
    class_levels: "/api/2014/classes/druid/levels",
    multi_classing: {
      prerequisites: [
        {
          ability_score: {
            index: "wis",
            name: "WIS",
            url: "/api/2014/ability-scores/wis",
          },
          minimum_score: 13,
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "medium-armor",
          name: "Medium Armor",
          url: "/api/2014/proficiencies/medium-armor",
        },
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
      ],
    },
    subclasses: [
      {
        index: "land",
        name: "Land",
        url: "/api/2014/subclasses/land",
      },
    ],
    spellcasting: {
      level: 1,
      spellcasting_ability: {
        index: "wis",
        name: "WIS",
        url: "/api/2014/ability-scores/wis",
      },
      info: [
        {
          name: "Cantrips",
          desc: [
            "At 1st level, you know two cantrips of your choice from the druid spell list. You learn additional druid cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Druid table.",
          ],
        },
        {
          name: "Preparing and Casting Spells",
          desc: [
            "The Druid table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these druid spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
            "You prepare the list of druid spells that are available for you to cast, choosing from the druid spell list. When you do so, choose a number of druid spells equal to your Wisdom modifier + your druid level (minimum of one spell). The spells must be of a level for which you have spell slots.",
            "For example, if you are a 3rd-level druid, you have four 1st-level and two 2nd-level spell slots. With a Wisdom of 16, your list of prepared spells can include six spells of 1st or 2nd level, in any combination. If you prepare the 1st-level spell cure wounds, you can cast it using a 1st-level or 2nd-level slot. Casting the spell doesn't remove it from your list of prepared spells.",
            "You can also change your list of prepared spells when you finish a long rest. Preparing a new list of druid spells requires time spent in prayer and meditation: at least 1 minute per spell level for each spell on your list.",
          ],
        },
        {
          name: "Spellcasting Ability",
          desc: [
            "Wisdom is your spellcasting ability for your druid spells, since your magic draws upon your devotion and attunement to nature. You use your Wisdom whenever a spell refers to your spellcasting ability. In addition, you use your Wisdom modifier when setting the saving throw DC for a druid spell you cast and when making an attack roll with one.",
            "Spell save DC = 8 + your proficiency bonus + your Wisdom modifier.",
            "Spell attack modifier = your proficiency bonus + your Wisdom modifier.",
          ],
        },
        {
          name: "Ritual Casting",
          desc: [
            "You can cast a druid spell as a ritual if that spell has the ritual tag and you have the spell prepared.",
          ],
        },
        {
          name: "Spellcasting Focus",
          desc: [
            'You can use a druidic focus (see chapter 5, "Equipment") as a spellcasting focus for your druid spells.',
          ],
        },
      ],
    },
    spells: "/api/2014/classes/druid/spells",
    url: "/api/2014/classes/druid",
  },
  {
    index: "fighter",
    name: "Fighter",
    hit_die: 10,
    proficiency_choices: [
      {
        desc: "Choose two skills from Acrobatics, Animal Handling, Athletics, History, Insight, Intimidation, Perception, and Survival",
        choose: 2,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-acrobatics",
                name: "Skill: Acrobatics",
                url: "/api/2014/proficiencies/skill-acrobatics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-animal-handling",
                name: "Skill: Animal Handling",
                url: "/api/2014/proficiencies/skill-animal-handling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-athletics",
                name: "Skill: Athletics",
                url: "/api/2014/proficiencies/skill-athletics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-history",
                name: "Skill: History",
                url: "/api/2014/proficiencies/skill-history",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
                url: "/api/2014/proficiencies/skill-insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-intimidation",
                name: "Skill: Intimidation",
                url: "/api/2014/proficiencies/skill-intimidation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-perception",
                name: "Skill: Perception",
                url: "/api/2014/proficiencies/skill-perception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-survival",
                name: "Skill: Survival",
                url: "/api/2014/proficiencies/skill-survival",
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "all-armor",
        name: "All armor",
        url: "/api/2014/proficiencies/all-armor",
      },
      {
        index: "shields",
        name: "Shields",
        url: "/api/2014/proficiencies/shields",
      },
      {
        index: "simple-weapons",
        name: "Simple Weapons",
        url: "/api/2014/proficiencies/simple-weapons",
      },
      {
        index: "martial-weapons",
        name: "Martial Weapons",
        url: "/api/2014/proficiencies/martial-weapons",
      },
      {
        index: "saving-throw-str",
        name: "Saving Throw: STR",
        url: "/api/2014/proficiencies/saving-throw-str",
      },
      {
        index: "saving-throw-con",
        name: "Saving Throw: CON",
        url: "/api/2014/proficiencies/saving-throw-con",
      },
    ],
    saving_throws: [
      {
        index: "str",
        name: "STR",
        url: "/api/2014/ability-scores/str",
      },
      {
        index: "con",
        name: "CON",
        url: "/api/2014/ability-scores/con",
      },
    ],
    starting_equipment: [],
    starting_equipment_options: [
      {
        desc: "(a) chain mail or (b) leather armor, longbow, and 20 arrows",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "chain-mail",
                name: "Chain Mail",
                url: "/api/2014/equipment/chain-mail",
              },
            },
            {
              option_type: "multiple",
              items: [
                {
                  option_type: "counted_reference",
                  count: 1,
                  of: {
                    index: "leather-armor",
                    name: "Leather Armor",
                    url: "/api/2014/equipment/leather-armor",
                  },
                },
                {
                  option_type: "counted_reference",
                  count: 1,
                  of: {
                    index: "longbow",
                    name: "Longbow",
                    url: "/api/2014/equipment/longbow",
                  },
                },
                {
                  option_type: "counted_reference",
                  count: 20,
                  of: {
                    index: "arrow",
                    name: "Arrow",
                    url: "/api/2014/equipment/arrow",
                  },
                },
              ],
            },
          ],
        },
      },
      {
        desc: "(a) a martial weapon and a shield or (b) two martial weapons",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "multiple",
              items: [
                {
                  option_type: "choice",
                  choice: {
                    desc: "a martial weapon",
                    choose: 1,
                    type: "equipment",
                    from: {
                      option_set_type: "equipment_category",
                      equipment_category: {
                        index: "martial-weapons",
                        name: "Martial Weapons",
                        url: "/api/2014/equipment-categories/martial-weapons",
                      },
                    },
                  },
                },
                {
                  option_type: "counted_reference",
                  count: 1,
                  of: {
                    index: "shield",
                    name: "Shield",
                    url: "/api/2014/equipment/shield",
                  },
                },
              ],
            },
            {
              option_type: "choice",
              choice: {
                desc: "two martial weapons",
                choose: 2,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "martial-weapons",
                    name: "Martial Weapons",
                    url: "/api/2014/equipment-categories/martial-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a light crossbow and 20 bolts or (b) two handaxes",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "multiple",
              items: [
                {
                  option_type: "counted_reference",
                  count: 1,
                  of: {
                    index: "crossbow-light",
                    name: "Crossbow, light",
                    url: "/api/2014/equipment/crossbow-light",
                  },
                },
                {
                  option_type: "counted_reference",
                  count: 20,
                  of: {
                    index: "crossbow-bolt",
                    name: "Crossbow bolt",
                    url: "/api/2014/equipment/crossbow-bolt",
                  },
                },
              ],
            },
            {
              option_type: "counted_reference",
              count: 2,
              of: {
                index: "handaxe",
                name: "Handaxe",
                url: "/api/2014/equipment/handaxe",
              },
            },
          ],
        },
      },
      {
        desc: "(a) a dungeoneer’s pack or (b) an explorer’s pack",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "dungeoneers-pack",
                name: "Dungeoneer's Pack",
                url: "/api/2014/equipment/dungeoneers-pack",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "explorers-pack",
                name: "Explorer's Pack",
                url: "/api/2014/equipment/explorers-pack",
              },
            },
          ],
        },
      },
    ],
    class_levels: "/api/2014/classes/fighter/levels",
    multi_classing: {
      prerequisite_options: {
        type: "ability-scores",
        choose: 1,
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "score_prerequisite",
              ability_score: {
                index: "str",
                name: "STR",
                url: "/api/2014/ability-scores/str",
              },
              minimum_score: 13,
            },
            {
              option_type: "score_prerequisite",
              ability_score: {
                index: "dex",
                name: "DEX",
                url: "/api/2014/ability-scores/dex",
              },
              minimum_score: 13,
            },
          ],
        },
      },
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "medium-armor",
          name: "Medium Armor",
          url: "/api/2014/proficiencies/medium-armor",
        },
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "martial-weapons",
          name: "Martial Weapons",
          url: "/api/2014/proficiencies/martial-weapons",
        },
      ],
    },
    subclasses: [
      {
        index: "champion",
        name: "Champion",
        url: "/api/2014/subclasses/champion",
      },
    ],
    url: "/api/2014/classes/fighter",
  },
  {
    index: "monk",
    name: "Monk",
    hit_die: 8,
    proficiency_choices: [
      {
        desc: "Choose two from Acrobatics, Athletics, History, Insight, Religion, and Stealth",
        choose: 2,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-acrobatics",
                name: "Skill: Acrobatics",
                url: "/api/2014/proficiencies/skill-acrobatics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-athletics",
                name: "Skill: Athletics",
                url: "/api/2014/proficiencies/skill-athletics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-history",
                name: "Skill: History",
                url: "/api/2014/proficiencies/skill-history",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
                url: "/api/2014/proficiencies/skill-insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-religion",
                name: "Skill: Religion",
                url: "/api/2014/proficiencies/skill-religion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-stealth",
                name: "Skill: Stealth",
                url: "/api/2014/proficiencies/skill-stealth",
              },
            },
          ],
        },
      },
      {
        desc: "Choose one type of artisan’s tools or one musical instrument",
        type: "proficiencies",
        choose: 1,
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "choice",
              choice: {
                desc: "artisan's tools",
                type: "proficiencies",
                choose: 1,
                from: {
                  option_set_type: "options_array",
                  options: [
                    {
                      option_type: "reference",
                      item: {
                        index: "alchemists-supplies",
                        name: "Alchemist's Supplies",
                        url: "/api/2014/proficiencies/alchemists-supplies",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "brewers-supplies",
                        name: "Brewer's Supplies",
                        url: "/api/2014/proficiencies/brewers-supplies",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "calligraphers-supplies",
                        name: "Calligrapher's Supplies",
                        url: "/api/2014/proficiencies/calligraphers-supplies",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "carpenters-tools",
                        name: "Carpenter's Tools",
                        url: "/api/2014/proficiencies/carpenters-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "cartographers-tools",
                        name: "Cartographer's Tools",
                        url: "/api/2014/proficiencies/cartographers-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "cobblers-tools",
                        name: "Cobbler's Tools",
                        url: "/api/2014/proficiencies/cobblers-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "cooks-utensils",
                        name: "Cook's utensils",
                        url: "/api/2014/proficiencies/cooks-utensils",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "glassblowers-tools",
                        name: "Glassblower's Tools",
                        url: "/api/2014/proficiencies/glassblowers-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "jewelers-tools",
                        name: "Jeweler's Tools",
                        url: "/api/2014/proficiencies/jewelers-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "leatherworkers-tools",
                        name: "Leatherworker's Tools",
                        url: "/api/2014/proficiencies/leatherworkers-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "masons-tools",
                        name: "Mason's Tools",
                        url: "/api/2014/proficiencies/masons-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "painters-supplies",
                        name: "Painter's Supplies",
                        url: "/api/2014/proficiencies/painters-supplies",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "potters-tools",
                        name: "Potter's Tools",
                        url: "/api/2014/proficiencies/potters-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "smiths-tools",
                        name: "Smith's Tools",
                        url: "/api/2014/proficiencies/smiths-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "tinkers-tools",
                        name: "Tinker's Tools",
                        url: "/api/2014/proficiencies/tinkers-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "weavers-tools",
                        name: "Weaver's Tools",
                        url: "/api/2014/proficiencies/weavers-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "woodcarvers-tools",
                        name: "Woodcarver's Tools",
                        url: "/api/2014/proficiencies/woodcarvers-tools",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "disguise-kit",
                        name: "Disguise Kit",
                        url: "/api/2014/proficiencies/disguise-kit",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "forgery-kit",
                        name: "Forgery Kit",
                        url: "/api/2014/proficiencies/forgery-kit",
                      },
                    },
                  ],
                },
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "musical instrument",
                type: "proficiencies",
                choose: 1,
                from: {
                  option_set_type: "options_array",
                  options: [
                    {
                      option_type: "reference",
                      item: {
                        index: "bagpipes",
                        name: "Bagpipes",
                        url: "/api/2014/proficiencies/bagpipes",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "drum",
                        name: "Drum",
                        url: "/api/2014/proficiencies/drum",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "dulcimer",
                        name: "Dulcimer",
                        url: "/api/2014/proficiencies/dulcimer",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "flute",
                        name: "Flute",
                        url: "/api/2014/proficiencies/flute",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "lute",
                        name: "Lute",
                        url: "/api/2014/proficiencies/lute",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "lyre",
                        name: "Lyre",
                        url: "/api/2014/proficiencies/lyre",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "horn",
                        name: "Horn",
                        url: "/api/2014/proficiencies/horn",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "pan-flute",
                        name: "Pan flute",
                        url: "/api/2014/proficiencies/pan-flute",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "shawm",
                        name: "Shawm",
                        url: "/api/2014/proficiencies/shawm",
                      },
                    },
                    {
                      option_type: "reference",
                      item: {
                        index: "viol",
                        name: "Viol",
                        url: "/api/2014/proficiencies/viol",
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "simple-weapons",
        name: "Simple Weapons",
        url: "/api/2014/proficiencies/simple-weapons",
      },
      {
        index: "shortswords",
        name: "Shortswords",
        url: "/api/2014/proficiencies/shortswords",
      },
      {
        index: "saving-throw-dex",
        name: "Saving Throw: DEX",
        url: "/api/2014/proficiencies/saving-throw-dex",
      },
      {
        index: "saving-throw-str",
        name: "Saving Throw: STR",
        url: "/api/2014/proficiencies/saving-throw-str",
      },
    ],
    saving_throws: [
      {
        index: "str",
        name: "STR",
        url: "/api/2014/ability-scores/str",
      },
      {
        index: "dex",
        name: "DEX",
        url: "/api/2014/ability-scores/dex",
      },
    ],
    starting_equipment: [
      {
        equipment: {
          index: "dart",
          name: "Dart",
          url: "/api/2014/equipment/dart",
        },
        quantity: 10,
      },
    ],
    starting_equipment_options: [
      {
        desc: "(a) a shortsword or (b) any simple weapon",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "shortsword",
                name: "Shortsword",
                url: "/api/2014/equipment/shortsword",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "any simple weapon",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "simple-weapons",
                    name: "Simple Weapons",
                    url: "/api/2014/equipment-categories/simple-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a dungeoneer’s pack or (b) an explorer’s pack",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "dungeoneers-pack",
                name: "Dungeoneer's Pack",
                url: "/api/2014/equipment/dungeoneers-pack",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "explorers-pack",
                name: "Explorer's Pack",
                url: "/api/2014/equipment/explorers-pack",
              },
            },
          ],
        },
      },
    ],
    class_levels: "/api/2014/classes/monk/levels",
    multi_classing: {
      prerequisites: [
        {
          ability_score: {
            index: "dex",
            name: "DEX",
            url: "/api/2014/ability-scores/dex",
          },
          minimum_score: 13,
        },
        {
          ability_score: {
            index: "wis",
            name: "WIS",
            url: "/api/2014/ability-scores/wis",
          },
          minimum_score: 13,
        },
      ],
      proficiencies: [
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "shortswords",
          name: "Shortswords",
          url: "/api/2014/proficiencies/shortswords",
        },
      ],
    },
    subclasses: [
      {
        index: "open-hand",
        name: "Open Hand",
        url: "/api/2014/subclasses/open-hand",
      },
    ],
    url: "/api/2014/classes/monk",
  },
  {
    index: "paladin",
    name: "Paladin",
    hit_die: 10,
    proficiency_choices: [
      {
        desc: "Choose two from Athletics, Insight, Intimidation, Medicine, Persuasion, and Religion",
        choose: 2,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-athletics",
                name: "Skill: Athletics",
                url: "/api/2014/proficiencies/skill-athletics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
                url: "/api/2014/proficiencies/skill-insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-intimidation",
                name: "Skill: Intimidation",
                url: "/api/2014/proficiencies/skill-intimidation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-medicine",
                name: "Skill: Medicine",
                url: "/api/2014/proficiencies/skill-medicine",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-persuasion",
                name: "Skill: Persuasion",
                url: "/api/2014/proficiencies/skill-persuasion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-religion",
                name: "Skill: Religion",
                url: "/api/2014/proficiencies/skill-religion",
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "all-armor",
        name: "All armor",
        url: "/api/2014/proficiencies/all-armor",
      },
      {
        index: "shields",
        name: "Shields",
        url: "/api/2014/proficiencies/shields",
      },
      {
        index: "simple-weapons",
        name: "Simple Weapons",
        url: "/api/2014/proficiencies/simple-weapons",
      },
      {
        index: "martial-weapons",
        name: "Martial Weapons",
        url: "/api/2014/proficiencies/martial-weapons",
      },
      {
        index: "saving-throw-wis",
        name: "Saving Throw: WIS",
        url: "/api/2014/proficiencies/saving-throw-wis",
      },
      {
        index: "saving-throw-cha",
        name: "Saving Throw: CHA",
        url: "/api/2014/proficiencies/saving-throw-cha",
      },
    ],
    saving_throws: [
      {
        index: "wis",
        name: "WIS",
        url: "/api/2014/ability-scores/wis",
      },
      {
        index: "cha",
        name: "CHA",
        url: "/api/2014/ability-scores/cha",
      },
    ],
    starting_equipment: [
      {
        equipment: {
          index: "chain-mail",
          name: "Chain Mail",
          url: "/api/2014/equipment/chain-mail",
        },
        quantity: 1,
      },
    ],
    starting_equipment_options: [
      {
        desc: "(a) a martial weapon and a shield or (b) two martial weapons",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "multiple",
              items: [
                {
                  option_type: "choice",
                  choice: {
                    desc: "a martial weapon",
                    choose: 1,
                    type: "equipment",
                    from: {
                      option_set_type: "equipment_category",
                      equipment_category: {
                        name: "Martial Weapons",
                        index: "martial-weapons",
                        url: "/api/2014/equipment-categories/martial-weapons",
                      },
                    },
                  },
                },
                {
                  option_type: "counted_reference",
                  count: 1,
                  of: {
                    index: "shield",
                    name: "Shield",
                    url: "/api/2014/equipment/shield",
                  },
                },
              ],
            },
            {
              option_type: "choice",
              choice: {
                desc: "two martial weapons",
                choose: 2,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "martial-weapons",
                    name: "Martial Weapons",
                    url: "/api/2014/equipment-categories/martial-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) five javelins or (b) any simple melee weapon",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 5,
              of: {
                index: "javelin",
                name: "Javelin",
                url: "/api/2014/equipment/javelin",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "any simple weapon",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "simple-weapons",
                    name: "Simple Weapons",
                    url: "/api/2014/equipment-categories/simple-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a priest’s pack or (b) an explorer’s pack",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "priests-pack",
                name: "Priest's Pack",
                url: "/api/2014/equipment/priests-pack",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "explorers-pack",
                name: "Explorer's Pack",
                url: "/api/2014/equipment/explorers-pack",
              },
            },
          ],
        },
      },
      {
        desc: "holy symbol",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "equipment_category",
          equipment_category: {
            index: "holy-symbols",
            name: "Holy Symbols",
            url: "/api/2014/equipment-categories/holy-symbols",
          },
        },
      },
    ],
    class_levels: "/api/2014/classes/paladin/levels",
    multi_classing: {
      prerequisites: [
        {
          ability_score: {
            index: "str",
            name: "STR",
            url: "/api/2014/ability-scores/str",
          },
          minimum_score: 13,
        },
        {
          ability_score: {
            index: "cha",
            name: "CHA",
            url: "/api/2014/ability-scores/cha",
          },
          minimum_score: 13,
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "medium-armor",
          name: "Medium Armor",
          url: "/api/2014/proficiencies/medium-armor",
        },
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "martial-weapons",
          name: "Martial Weapons",
          url: "/api/2014/proficiencies/martial-weapons",
        },
      ],
    },
    subclasses: [
      {
        index: "devotion",
        name: "Devotion",
        url: "/api/2014/subclasses/devotion",
      },
    ],
    spellcasting: {
      level: 2,
      spellcasting_ability: {
        index: "cha",
        name: "CHA",
        url: "/api/2014/ability-scores/cha",
      },
      info: [
        {
          name: "Preparing and Casting Spells",
          desc: [
            "The Paladin table shows how many spell slots you have to cast your spells. To cast one of your paladin spells of 1st level or higher, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
            "You prepare the list of paladin spells that are available for you to cast, choosing from the paladin spell list. When you do so, choose a number of paladin spells equal to your Charisma modifier + half your paladin level, rounded down (minimum of one spell). The spells must be of a level for which you have spell slots.",
            "For example, if you are a 5th-level paladin, you have four 1st-level and two 2nd-level spell slots. With a Charisma of 14, your list of prepared spells can include four spells of 1st or 2nd level, in any combination. If you prepare the 1st-level spell cure wounds, you can cast it using a 1st-level or a 2nd- level slot. Casting the spell doesn't remove it from your list of prepared spells.",
            "You can change your list of prepared spells when you finish a long rest. Preparing a new list of paladin spells requires time spent in prayer and meditation: at least 1 minute per spell level for each spell on your list.",
          ],
        },
        {
          name: "Spellcasting Ability",
          desc: [
            "Charisma is your spellcasting ability for your paladin spells, since their power derives from the strength of your convictions. You use your Charisma whenever a spell refers to your spellcasting ability. In addition, you use your Charisma modifier when setting the saving throw DC for a paladin spell you cast and when making an attack roll with one.",
            "Spell save DC = 8 + your proficiency bonus + your Charisma modifier.",
            "Spell attack modifier = your proficiency bonus + your Charisma modifier.",
          ],
        },
        {
          name: "Spellcasting Focus",
          desc: ["You can use a holy symbol as a spellcasting focus for your paladin spells."],
        },
      ],
    },
    spells: "/api/2014/classes/paladin/spells",
    url: "/api/2014/classes/paladin",
  },
  {
    index: "ranger",
    name: "Ranger",
    hit_die: 10,
    proficiency_choices: [
      {
        desc: "Choose three from Animal Handling, Athletics, Insight, Investigation, Nature, Perception, Stealth, and Survival",
        choose: 3,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-animal-handling",
                name: "Skill: Animal Handling",
                url: "/api/2014/proficiencies/skill-animal-handling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-athletics",
                name: "Skill: Athletics",
                url: "/api/2014/proficiencies/skill-athletics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
                url: "/api/2014/proficiencies/skill-insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-investigation",
                name: "Skill: Investigation",
                url: "/api/2014/proficiencies/skill-investigation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-nature",
                name: "Skill: Nature",
                url: "/api/2014/proficiencies/skill-nature",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-perception",
                name: "Skill: Perception",
                url: "/api/2014/proficiencies/skill-perception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-stealth",
                name: "Skill: Stealth",
                url: "/api/2014/proficiencies/skill-stealth",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-survival",
                name: "Skill: Survival",
                url: "/api/2014/proficiencies/skill-survival",
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "light-armor",
        name: "Light Armor",
        url: "/api/2014/proficiencies/light-armor",
      },
      {
        index: "medium-armor",
        name: "Medium Armor",
        url: "/api/2014/proficiencies/medium-armor",
      },
      {
        index: "shields",
        name: "Shields",
        url: "/api/2014/proficiencies/shields",
      },
      {
        index: "simple-weapons",
        name: "Simple Weapons",
        url: "/api/2014/proficiencies/simple-weapons",
      },
      {
        index: "martial-weapons",
        name: "Martial Weapons",
        url: "/api/2014/proficiencies/martial-weapons",
      },
      {
        index: "saving-throw-dex",
        name: "Saving Throw: DEX",
        url: "/api/2014/proficiencies/saving-throw-dex",
      },
      {
        index: "saving-throw-str",
        name: "Saving Throw: STR",
        url: "/api/2014/proficiencies/saving-throw-str",
      },
    ],
    saving_throws: [
      {
        index: "str",
        name: "STR",
        url: "/api/2014/ability-scores/str",
      },
      {
        index: "dex",
        name: "DEX",
        url: "/api/2014/ability-scores/dex",
      },
    ],
    starting_equipment: [
      {
        equipment: {
          index: "longbow",
          name: "Longbow",
          url: "/api/2014/equipment/longbow",
        },
        quantity: 1,
      },
      {
        equipment: {
          index: "arrow",
          name: "Arrow",
          url: "/api/2014/equipment/arrow",
        },
        quantity: 20,
      },
    ],
    starting_equipment_options: [
      {
        desc: "(a) scale mail or (b) leather armor",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "scale-mail",
                name: "Scale Mail",
                url: "/api/2014/equipment/scale-mail",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "leather-armor",
                name: "Leather Armor",
                url: "/api/2014/equipment/leather-armor",
              },
            },
          ],
        },
      },
      {
        desc: "(a) two shortswords or (b) two simple melee weapons",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 2,
              of: {
                index: "shortsword",
                name: "Shortsword",
                url: "/api/2014/equipment/shortsword",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "two simple melee weapons",
                choose: 2,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "simple-melee-weapons",
                    name: "Simple Melee Weapons",
                    url: "/api/2014/equipment-categories/simple-melee-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a dungeoneer’s pack or (b) an explorer’s pack",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "dungeoneers-pack",
                name: "Dungeoneer's Pack",
                url: "/api/2014/equipment/dungeoneers-pack",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "explorers-pack",
                name: "Explorer's Pack",
                url: "/api/2014/equipment/explorers-pack",
              },
            },
          ],
        },
      },
    ],
    class_levels: "/api/2014/classes/ranger/levels",
    multi_classing: {
      prerequisites: [
        {
          ability_score: {
            index: "dex",
            name: "DEX",
            url: "/api/2014/ability-scores/dex",
          },
          minimum_score: 13,
        },
        {
          ability_score: {
            index: "wis",
            name: "WIS",
            url: "/api/2014/ability-scores/wis",
          },
          minimum_score: 13,
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "medium-armor",
          name: "Medium Armor",
          url: "/api/2014/proficiencies/medium-armor",
        },
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "martial-weapons",
          name: "Martial Weapons",
          url: "/api/2014/proficiencies/martial-weapons",
        },
      ],
      proficiency_choices: [
        {
          choose: 1,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-animal-handling",
                  name: "Skill: Animal Handling",
                  url: "/api/2014/proficiencies/skill-animal-handling",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-athletics",
                  name: "Skill: Athletics",
                  url: "/api/2014/proficiencies/skill-athletics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-investigation",
                  name: "Skill: Investigation",
                  url: "/api/2014/proficiencies/skill-investigation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-nature",
                  name: "Skill: Nature",
                  url: "/api/2014/proficiencies/skill-nature",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-perception",
                  name: "Skill: Perception",
                  url: "/api/2014/proficiencies/skill-perception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-stealth",
                  name: "Skill: Stealth",
                  url: "/api/2014/proficiencies/skill-stealth",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-survival",
                  name: "Skill: Survival",
                  url: "/api/2014/proficiencies/skill-survival",
                },
              },
            ],
          },
        },
      ],
    },
    subclasses: [
      {
        index: "hunter",
        name: "Hunter",
        url: "/api/2014/subclasses/hunter",
      },
    ],
    spellcasting: {
      level: 2,
      spellcasting_ability: {
        index: "wis",
        name: "WIS",
        url: "/api/2014/ability-scores/wis",
      },
      info: [
        {
          name: "Spell Slots",
          desc: [
            "The Ranger table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
            "For example, if you know the 1st-level spell animal friendship and have a 1st-level and a 2nd-level spell slot available, you can cast animal friendship using either slot.",
          ],
        },
        {
          name: "Spells Known of 1st Level and Higher",
          desc: [
            "You know two 1st-level spells of your choice from the ranger spell list.",
            "The Spells Known column of the Ranger table shows when you learn more ranger spells of your choice. Each of these spells must be of a level for which you have spell slots. For instance, when you reach 5th level in this class, you can learn one new spell of 1st or 2nd level.",
            "Additionally, when you gain a level in this class, you can choose one of the ranger spells you know and replace it with another spell from the ranger spell list, which also must be of a level for which you have spell slots.",
          ],
        },
        {
          name: "Spellcasting Ability",
          desc: [
            "Wisdom is your spellcasting ability for your ranger spells, since your magic draws on your attunement to nature. You use your Wisdom whenever a spell refers to your spellcasting ability. In addition, you use your Wisdom modifier when setting the saving throw DC for a ranger spell you cast and when making an attack roll with one.",
            "Spell save DC = 8 + your proficiency bonus + your Wisdom modifier.",
            "Spell attack modifier = your proficiency bonus + your Wisdom modifier.",
          ],
        },
      ],
    },
    spells: "/api/2014/classes/ranger/spells",
    url: "/api/2014/classes/ranger",
  },
  {
    index: "rogue",
    name: "Rogue",
    hit_die: 8,
    proficiency_choices: [
      {
        desc: "Choose four from Acrobatics, Athletics, Deception, Insight, Intimidation, Investigation, Perception, Performance, Persuasion, Sleight of Hand, and Stealth",
        choose: 4,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-acrobatics",
                name: "Skill: Acrobatics",
                url: "/api/2014/proficiencies/skill-acrobatics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-athletics",
                name: "Skill: Athletics",
                url: "/api/2014/proficiencies/skill-athletics",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-deception",
                name: "Skill: Deception",
                url: "/api/2014/proficiencies/skill-deception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
                url: "/api/2014/proficiencies/skill-insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-intimidation",
                name: "Skill: Intimidation",
                url: "/api/2014/proficiencies/skill-intimidation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-investigation",
                name: "Skill: Investigation",
                url: "/api/2014/proficiencies/skill-investigation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-perception",
                name: "Skill: Perception",
                url: "/api/2014/proficiencies/skill-perception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-performance",
                name: "Skill: Performance",
                url: "/api/2014/proficiencies/skill-performance",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-persuasion",
                name: "Skill: Persuasion",
                url: "/api/2014/proficiencies/skill-persuasion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-sleight-of-hand",
                name: "Skill: Sleight of Hand",
                url: "/api/2014/proficiencies/skill-sleight-of-hand",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-stealth",
                name: "Skill: Stealth",
                url: "/api/2014/proficiencies/skill-stealth",
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "light-armor",
        name: "Light Armor",
        url: "/api/2014/proficiencies/light-armor",
      },
      {
        index: "simple-weapons",
        name: "Simple Weapons",
        url: "/api/2014/proficiencies/simple-weapons",
      },
      {
        index: "longswords",
        name: "Longswords",
        url: "/api/2014/proficiencies/longswords",
      },
      {
        index: "rapiers",
        name: "Rapiers",
        url: "/api/2014/proficiencies/rapiers",
      },
      {
        index: "shortswords",
        name: "Shortswords",
        url: "/api/2014/proficiencies/shortswords",
      },
      {
        index: "hand-crossbows",
        name: "Hand crossbows",
        url: "/api/2014/proficiencies/hand-crossbows",
      },
      {
        index: "thieves-tools",
        name: "Thieves' Tools",
        url: "/api/2014/proficiencies/thieves-tools",
      },
      {
        index: "saving-throw-dex",
        name: "Saving Throw: DEX",
        url: "/api/2014/proficiencies/saving-throw-dex",
      },
      {
        index: "saving-throw-int",
        name: "Saving Throw: INT",
        url: "/api/2014/proficiencies/saving-throw-int",
      },
    ],
    saving_throws: [
      {
        index: "dex",
        name: "DEX",
        url: "/api/2014/ability-scores/dex",
      },
      {
        index: "int",
        name: "INT",
        url: "/api/2014/ability-scores/int",
      },
    ],
    starting_equipment: [
      {
        equipment: {
          index: "leather-armor",
          name: "Leather Armor",
          url: "/api/2014/equipment/leather-armor",
        },
        quantity: 1,
      },
      {
        equipment: {
          index: "dagger",
          name: "Dagger",
          url: "/api/2014/equipment/dagger",
        },
        quantity: 2,
      },
      {
        equipment: {
          index: "thieves-tools",
          name: "Thieves' Tools",
          url: "/api/2014/equipment/thieves-tools",
        },
        quantity: 1,
      },
    ],
    starting_equipment_options: [
      {
        desc: "(a) a rapier or (b) a shortsword",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "rapier",
                name: "Rapier",
                url: "/api/2014/equipment/rapier",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "shortsword",
                name: "Shortsword",
                url: "/api/2014/equipment/shortsword",
              },
            },
          ],
        },
      },
      {
        desc: "(a) a shortbow and quiver of 20 arrows or (b) a shortsword",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "multiple",
              items: [
                {
                  option_type: "counted_reference",
                  count: 1,
                  of: {
                    index: "shortbow",
                    name: "Shortbow",
                    url: "/api/2014/equipment/shortbow",
                  },
                },
                {
                  option_type: "counted_reference",
                  count: 20,
                  of: {
                    index: "arrow",
                    name: "Arrow",
                    url: "/api/2014/equipment/arrow",
                  },
                },
              ],
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "shortsword",
                name: "Shortsword",
                url: "/api/2014/equipment/shortsword",
              },
            },
          ],
        },
      },
      {
        desc: "(a) a burglar’s pack, (b) a dungeoneer’s pack, or (c) an explorer’s pack",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "burglars-pack",
                name: "Burglar's Pack",
                url: "/api/2014/equipment/burglars-pack",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "dungeoneers-pack",
                name: "Dungeoneer's Pack",
                url: "/api/2014/equipment/dungeoneers-pack",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "explorers-pack",
                name: "Explorer's Pack",
                url: "/api/2014/equipment/explorers-pack",
              },
            },
          ],
        },
      },
    ],
    class_levels: "/api/2014/classes/rogue/levels",
    multi_classing: {
      prerequisites: [
        {
          ability_score: {
            index: "dex",
            name: "DEX",
            url: "/api/2014/ability-scores/dex",
          },
          minimum_score: 13,
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "thieves-tools",
          name: "Thieves' Tools",
          url: "/api/2014/proficiencies/thieves-tools",
        },
      ],
      proficiency_choices: [
        {
          choose: 1,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-acrobatics",
                  name: "Skill: Acrobatics",
                  url: "/api/2014/proficiencies/skill-acrobatics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-athletics",
                  name: "Skill: Athletics",
                  url: "/api/2014/proficiencies/skill-athletics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-deception",
                  name: "Skill: Deception",
                  url: "/api/2014/proficiencies/skill-deception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-intimidation",
                  name: "Skill: Intimidation",
                  url: "/api/2014/proficiencies/skill-intimidation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-investigation",
                  name: "Skill: Investigation",
                  url: "/api/2014/proficiencies/skill-investigation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-perception",
                  name: "Skill: Perception",
                  url: "/api/2014/proficiencies/skill-perception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-performance",
                  name: "Skill: Performance",
                  url: "/api/2014/proficiencies/skill-performance",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-persuasion",
                  name: "Skill: Persuasion",
                  url: "/api/2014/proficiencies/skill-persuasion",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-sleight-of-hand",
                  name: "Skill: Sleight of Hand",
                  url: "/api/2014/proficiencies/skill-sleight-of-hand",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-stealth",
                  name: "Skill: Stealth",
                  url: "/api/2014/proficiencies/skill-stealth",
                },
              },
            ],
          },
        },
      ],
    },
    subclasses: [
      {
        index: "thief",
        name: "Thief",
        url: "/api/2014/subclasses/thief",
      },
    ],
    url: "/api/2014/classes/rogue",
  },
  {
    index: "sorcerer",
    name: "Sorcerer",
    hit_die: 6,
    proficiency_choices: [
      {
        desc: "Choose two from Arcana, Deception, Insight, Intimidation, Persuasion, and Religion",
        choose: 2,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-arcana",
                name: "Skill: Arcana",
                url: "/api/2014/proficiencies/skill-arcana",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-deception",
                name: "Skill: Deception",
                url: "/api/2014/proficiencies/skill-deception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
                url: "/api/2014/proficiencies/skill-insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-intimidation",
                name: "Skill: Intimidation",
                url: "/api/2014/proficiencies/skill-intimidation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-persuasion",
                name: "Skill: Persuasion",
                url: "/api/2014/proficiencies/skill-persuasion",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-religion",
                name: "Skill: Religion",
                url: "/api/2014/proficiencies/skill-religion",
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "daggers",
        name: "Daggers",
        url: "/api/2014/proficiencies/daggers",
      },
      {
        index: "darts",
        name: "Darts",
        url: "/api/2014/proficiencies/darts",
      },
      {
        index: "slings",
        name: "Slings",
        url: "/api/2014/proficiencies/slings",
      },
      {
        index: "quarterstaffs",
        name: "Quarterstaffs",
        url: "/api/2014/proficiencies/quarterstaffs",
      },
      {
        index: "crossbows-light",
        name: "Crossbows, light",
        url: "/api/2014/proficiencies/crossbows-light",
      },
      {
        index: "saving-throw-con",
        name: "Saving Throw: CON",
        url: "/api/2014/proficiencies/saving-throw-con",
      },
      {
        index: "saving-throw-cha",
        name: "Saving Throw: CHA",
        url: "/api/2014/proficiencies/saving-throw-cha",
      },
    ],
    saving_throws: [
      {
        index: "con",
        name: "CON",
        url: "/api/2014/ability-scores/con",
      },
      {
        index: "cha",
        name: "CHA",
        url: "/api/2014/ability-scores/cha",
      },
    ],
    starting_equipment: [
      {
        equipment: {
          index: "dagger",
          name: "Dagger",
          url: "/api/2014/equipment/dagger",
        },
        quantity: 2,
      },
    ],
    starting_equipment_options: [
      {
        desc: "(a) a light crossbow and 20 bolts or (b) any simple weapon",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "multiple",
              items: [
                {
                  option_type: "counted_reference",
                  count: 1,
                  of: {
                    index: "crossbow-light",
                    name: "Crossbow, light",
                    url: "/api/2014/equipment/crossbow-light",
                  },
                },
                {
                  option_type: "counted_reference",
                  count: 20,
                  of: {
                    index: "crossbow-bolt",
                    name: "Crossbow bolt",
                    url: "/api/2014/equipment/crossbow-bolt",
                  },
                },
              ],
            },
            {
              option_type: "choice",
              choice: {
                desc: "any simple weapon",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "simple-weapons",
                    name: "Simple Weapons",
                    url: "/api/2014/equipment-categories/simple-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a component pouch or (b) an arcane focus",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "component-pouch",
                name: "Component pouch",
                url: "/api/2014/equipment/component-pouch",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "arcane focus",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "arcane-foci",
                    name: "Arcane Foci",
                    url: "/api/2014/equipment-categories/arcane-foci",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a dungeoneer’s pack or (b) an explorer’s pack",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "dungeoneers-pack",
                name: "Dungeoneer's Pack",
                url: "/api/2014/equipment/dungeoneers-pack",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "explorers-pack",
                name: "Explorer's Pack",
                url: "/api/2014/equipment/explorers-pack",
              },
            },
          ],
        },
      },
    ],
    class_levels: "/api/2014/classes/sorcerer/levels",
    multi_classing: {
      prerequisites: [
        {
          ability_score: {
            index: "cha",
            name: "CHA",
            url: "/api/2014/ability-scores/cha",
          },
          minimum_score: 13,
        },
      ],
      proficiencies: [],
    },
    subclasses: [
      {
        index: "draconic",
        name: "Draconic",
        url: "/api/2014/subclasses/draconic",
      },
    ],
    spellcasting: {
      level: 1,
      spellcasting_ability: {
        index: "cha",
        name: "CHA",
        url: "/api/2014/ability-scores/cha",
      },
      info: [
        {
          name: "Cantrips",
          desc: [
            "At 1st level, you know four cantrips of your choice from the sorcerer spell list. You learn additional sorcerer cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Sorcerer table.",
          ],
        },
        {
          name: "Spell Slots",
          desc: [
            "The Sorcerer table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these sorcerer spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
            "For example, if you know the 1st-level spell burning hands and have a 1st-level and a 2nd-level spell slot available, you can cast burning hands using either slot.",
          ],
        },
        {
          name: "Spells Known of 1st Level and Higher",
          desc: [
            "You know two 1st-level spells of your choice from the sorcerer spell list.",
            "The Spells Known column of the Sorcerer table shows when you learn more sorcerer spells of your choice. Each of these spells must be of a level for which you have spell slots. For instance, when you reach 3rd level in this class, you can learn one new spell of 1st or 2nd level. ",
            "Additionally, when you gain a level in this class, you can choose one of the sorcerer spells you know and replace it with another spell from the sorcerer spell list, which also must be of a level for which you have spell slots.",
          ],
        },
        {
          name: "Spellcasting Ability",
          desc: [
            "Charisma is your spellcasting ability for your sorcerer spells, since the power of your magic relies on your ability to project your will into the world. You use your Charisma whenever a spell refers to your spellcasting ability. In addition, you use your Charisma modifier when setting the saving throw DC for a sorcerer spell you cast and when making an attack roll with one.",
            "Spell save DC = 8 + your proficiency bonus + your Charisma modifier.",
            "Spell attack modifier = your proficiency bonus + your Charisma modifier.",
          ],
        },
        {
          name: "Spellcasting Focus",
          desc: ["You can use an arcane focus as a spellcasting focus for your sorcerer spells."],
        },
      ],
    },
    spells: "/api/2014/classes/sorcerer/spells",
    url: "/api/2014/classes/sorcerer",
  },
  {
    index: "warlock",
    name: "Warlock",
    hit_die: 8,
    proficiency_choices: [
      {
        desc: "Choose two skills from Arcana, Deception, History, Intimidation, Investigation, Nature, and Religion",
        choose: 2,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-arcana",
                name: "Skill: Arcana",
                url: "/api/2014/proficiencies/skill-arcana",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-deception",
                name: "Skill: Deception",
                url: "/api/2014/proficiencies/skill-deception",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-history",
                name: "Skill: History",
                url: "/api/2014/proficiencies/skill-history",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-intimidation",
                name: "Skill: Intimidation",
                url: "/api/2014/proficiencies/skill-intimidation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-investigation",
                name: "Skill: Investigation",
                url: "/api/2014/proficiencies/skill-investigation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-nature",
                name: "Skill: Nature",
                url: "/api/2014/proficiencies/skill-nature",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-religion",
                name: "Skill: Religion",
                url: "/api/2014/proficiencies/skill-religion",
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "light-armor",
        name: "Light Armor",
        url: "/api/2014/proficiencies/light-armor",
      },
      {
        index: "simple-weapons",
        name: "Simple Weapons",
        url: "/api/2014/proficiencies/simple-weapons",
      },
      {
        index: "saving-throw-wis",
        name: "Saving Throw: WIS",
        url: "/api/2014/proficiencies/saving-throw-wis",
      },
      {
        index: "saving-throw-cha",
        name: "Saving Throw: CHA",
        url: "/api/2014/proficiencies/saving-throw-cha",
      },
    ],
    saving_throws: [
      {
        index: "wis",
        name: "WIS",
        url: "/api/2014/ability-scores/wis",
      },
      {
        index: "cha",
        name: "CHA",
        url: "/api/2014/ability-scores/cha",
      },
    ],
    starting_equipment: [
      {
        equipment: {
          index: "dagger",
          name: "Dagger",
          url: "/api/2014/equipment/dagger",
        },
        quantity: 2,
      },
      {
        equipment: {
          index: "leather-armor",
          name: "Leather Armor",
          url: "/api/2014/equipment/leather-armor",
        },
        quantity: 1,
      },
    ],
    starting_equipment_options: [
      {
        desc: "(a) a light crossbow and 20 bolts or (b) any simple weapon",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "multiple",
              items: [
                {
                  option_type: "counted_reference",
                  count: 1,
                  of: {
                    index: "crossbow-light",
                    name: "Crossbow, light",
                    url: "/api/2014/equipment/crossbow-light",
                  },
                },
                {
                  option_type: "counted_reference",
                  count: 20,
                  of: {
                    index: "crossbow-bolt",
                    name: "Crossbow bolt",
                    url: "/api/2014/equipment/crossbow-bolt",
                  },
                },
              ],
            },
            {
              option_type: "choice",
              choice: {
                desc: "any simple weapon",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "simple-weapons",
                    name: "Simple Weapons",
                    url: "/api/2014/equipment-categories/simple-weapons",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a component pouch or (b) an arcane focus",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "component-pouch",
                name: "Component pouch",
                url: "/api/2014/equipment/component-pouch",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "arcane focus",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "arcane-foci",
                    name: "Arcane Foci",
                    url: "/api/2014/equipment-categories/arcane-foci",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a scholar’s pack or (b) a dungeoneer’s pack",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "scholars-pack",
                name: "Scholar's Pack",
                url: "/api/2014/equipment/scholars-pack",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "dungeoneers-pack",
                name: "Dungeoneer's Pack",
                url: "/api/2014/equipment/dungeoneers-pack",
              },
            },
          ],
        },
      },
      {
        desc: "any simple weapon",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "equipment_category",
          equipment_category: {
            index: "simple-weapons",
            name: "Simple Weapons",
            url: "/api/2014/equipment-categories/simple-weapons",
          },
        },
      },
    ],
    class_levels: "/api/2014/classes/warlock/levels",
    multi_classing: {
      prerequisites: [
        {
          ability_score: {
            index: "cha",
            name: "CHA",
            url: "/api/2014/ability-scores/cha",
          },
          minimum_score: 13,
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
      ],
    },
    subclasses: [
      {
        index: "fiend",
        name: "Fiend",
        url: "/api/2014/subclasses/fiend",
      },
    ],
    spellcasting: {
      level: 1,
      spellcasting_ability: {
        index: "cha",
        name: "CHA",
        url: "/api/2014/ability-scores/cha",
      },
      info: [
        {
          name: "Cantrips",
          desc: [
            "You know two cantrips of your choice from the warlock spell list. You learn additional warlock cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Warlock table.",
          ],
        },
        {
          name: "Spell Slots",
          desc: [
            "The Warlock table shows how many spell slots you have. The table also shows what the level of those slots is; all of your spell slots are the same level. To cast one of your warlock spells of 1st level or higher, you must expend a spell slot. You regain all expended spell slots when you finish a short or long rest.",
            "For example, when you are 5th level, you have two 3rd-level spell slots. To cast the 1st-level spell thunderwave, you must spend one of those slots, and you cast it as a 3rd-level spell.",
          ],
        },
        {
          name: "Spells Known of 1st Level and Higher",
          desc: [
            "At 1st level, you know two 1st-level spells of your choice from the warlock spell list.",
            "The Spells Known column of the Warlock table shows when you learn more warlock spells of your choice of 1st level and higher. ",
            "A spell you choose must be of a level no higher than what's shown in the table's Slot Level column for your level. When you reach 6th level, for example, you learn a new warlock spell, which can be 1st, 2nd, or 3rd level.",
            "Additionally, when you gain a level in this class, you can choose one of the warlock spells you know and replace it with another spell from the warlock spell list, which also must be of a level for which you have spell slots.",
          ],
        },
        {
          name: "Spellcasting Ability",
          desc: [
            "Charisma is your spellcasting ability for your warlock spells, so you use your Charisma whenever a spell refers to your spellcasting ability. In addition, you use your Charisma modifier when setting the saving throw DC for a warlock spell you cast and when making an attack roll with one.",
            "Spell save DC = 8 + your proficiency bonus + your Charisma modifier.",
            "Spell attack modifier = your proficiency bonus + your Charisma modifier.",
          ],
        },
        {
          name: "Spellcasting Focus",
          desc: ["You can use an arcane focus as a spellcasting focus for your warlock spells."],
        },
      ],
    },
    spells: "/api/2014/classes/warlock/spells",
    url: "/api/2014/classes/warlock",
  },
  {
    index: "wizard",
    name: "Wizard",
    hit_die: 6,
    proficiency_choices: [
      {
        desc: "Choose two from Arcana, History, Insight, Investigation, Medicine, and Religion",
        choose: 2,
        type: "proficiencies",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "skill-arcana",
                name: "Skill: Arcana",
                url: "/api/2014/proficiencies/skill-arcana",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-history",
                name: "Skill: History",
                url: "/api/2014/proficiencies/skill-history",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-insight",
                name: "Skill: Insight",
                url: "/api/2014/proficiencies/skill-insight",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-investigation",
                name: "Skill: Investigation",
                url: "/api/2014/proficiencies/skill-investigation",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-medicine",
                name: "Skill: Medicine",
                url: "/api/2014/proficiencies/skill-medicine",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "skill-religion",
                name: "Skill: Religion",
                url: "/api/2014/proficiencies/skill-religion",
              },
            },
          ],
        },
      },
    ],
    proficiencies: [
      {
        index: "daggers",
        name: "Daggers",
        url: "/api/2014/proficiencies/daggers",
      },
      {
        index: "darts",
        name: "Darts",
        url: "/api/2014/proficiencies/darts",
      },
      {
        index: "slings",
        name: "Slings",
        url: "/api/2014/proficiencies/slings",
      },
      {
        index: "quarterstaffs",
        name: "Quarterstaffs",
        url: "/api/2014/proficiencies/quarterstaffs",
      },
      {
        index: "crossbows-light",
        name: "Crossbows, light",
        url: "/api/2014/proficiencies/crossbows-light",
      },
      {
        index: "saving-throw-int",
        name: "Saving Throw: INT",
        url: "/api/2014/proficiencies/saving-throw-int",
      },
      {
        index: "saving-throw-wis",
        name: "Saving Throw: WIS",
        url: "/api/2014/proficiencies/saving-throw-wis",
      },
    ],
    saving_throws: [
      {
        index: "int",
        name: "INT",
        url: "/api/2014/ability-scores/int",
      },
      {
        index: "wis",
        name: "WIS",
        url: "/api/2014/ability-scores/wis",
      },
    ],
    starting_equipment: [
      {
        equipment: {
          index: "spellbook",
          name: "Spellbook",
          url: "/api/2014/equipment/spellbook",
        },
        quantity: 1,
      },
    ],
    starting_equipment_options: [
      {
        desc: "(a) a quarterstaff or (b) a dagger",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "quarterstaff",
                name: "Quarterstaff",
                url: "/api/2014/equipment/quarterstaff",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "dagger",
                name: "Dagger",
                url: "/api/2014/equipment/dagger",
              },
            },
          ],
        },
      },
      {
        desc: "(a) a component pouch or (b) an arcane focus",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "component-pouch",
                name: "Component pouch",
                url: "/api/2014/equipment/component-pouch",
              },
            },
            {
              option_type: "choice",
              choice: {
                desc: "arcane focus",
                choose: 1,
                type: "equipment",
                from: {
                  option_set_type: "equipment_category",
                  equipment_category: {
                    index: "arcane-foci",
                    name: "Arcane Foci",
                    url: "/api/2014/equipment-categories/arcane-foci",
                  },
                },
              },
            },
          ],
        },
      },
      {
        desc: "(a) a scholar’s pack or (b) an explorer’s pack",
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "scholars-pack",
                name: "Scholar's Pack",
                url: "/api/2014/equipment/scholars-pack",
              },
            },
            {
              option_type: "counted_reference",
              count: 1,
              of: {
                index: "explorers-pack",
                name: "Explorer's Pack",
                url: "/api/2014/equipment/explorers-pack",
              },
            },
          ],
        },
      },
    ],
    class_levels: "/api/2014/classes/wizard/levels",
    multi_classing: {
      prerequisites: [
        {
          ability_score: {
            index: "int",
            name: "INT",
            url: "/api/2014/ability-scores/int",
          },
          minimum_score: 13,
        },
      ],
      proficiencies: [],
    },
    subclasses: [
      {
        index: "evocation",
        name: "Evocation",
        url: "/api/2014/subclasses/evocation",
      },
    ],
    spellcasting: {
      level: 1,
      spellcasting_ability: {
        index: "int",
        name: "INT",
        url: "/api/2014/ability-scores/int",
      },
      info: [
        {
          name: "Cantrips",
          desc: [
            "At 1st level, you know three cantrips of your choice from the wizard spell list. You learn additional wizard cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Wizard table.",
          ],
        },
        {
          name: "Spellbook",
          desc: [
            "At 1st level, you have a spellbook containing six 1st- level wizard spells of your choice. Your spellbook is the repository of the wizard spells you know, except your cantrips, which are fixed in your mind.",
          ],
        },
        {
          name: "Preparing and Casting Spells",
          desc: [
            "The Wizard table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
            "You prepare the list of wizard spells that are available for you to cast. To do so, choose a number of wizard spells from your spellbook equal to your Intelligence modifier + your wizard level (minimum of one spell). The spells must be of a level for which you have spell slots.",
            "For example, if you're a 3rd-level wizard, you have four 1st-level and two 2nd-level spell slots. With an Intelligence of 16, your list of prepared spells can include six spells of 1st or 2nd level, in any combination, chosen from your spellbook. If you prepare the 1st-level spell magic missile, you can cast it using a 1st-level or a 2nd-level slot. Casting the spell doesn't remove it from your list of prepared spells.",
            "You can change your list of prepared spells when you finish a long rest. Preparing a new list of wizard spells requires time spent studying your spellbook and memorizing the incantations and gestures you must make to cast the spell: at least 1 minute per spell level for each spell on your list.",
          ],
        },
        {
          name: "Spellcasting Ability",
          desc: [
            "Intelligence is your spellcasting ability for your wizard spells, since you learn your spells through dedicated study and memorization. You use your Intelligence whenever a spell refers to your spellcasting ability. In addition, you use your Intelligence modifier when setting the saving throw DC for a wizard spell you cast and when making an attack roll with one.",
            "Spell save DC = 8 + your proficiency bonus + your Intelligence modifier.",
            "Spell attack modifier = your proficiency bonus + your Intelligence modifier.",
          ],
        },
        {
          name: "Ritual Casting",
          desc: [
            "You can cast a wizard spell as a ritual if that spell has the ritual tag and you have the spell in your spellbook. You don't need to have the spell prepared.",
          ],
        },
        {
          name: "Spellcasting Focus",
          desc: ["You can use an arcane focus as a spellcasting focus for your wizard spells."],
        },
      ],
    },
    spells: "/api/2014/classes/wizard/spells",
    url: "/api/2014/classes/wizard",
  },
] satisfies ReadonlyArray<Record<string, unknown>>;

const RACE_RAW = [
  {
    index: "dwarf",
    name: "Dwarf",
    speed: 25,
    ability_bonuses: [
      {
        ability_score: {
          index: "con",
          name: "CON",
          url: "/api/2014/ability-scores/con",
        },
        bonus: 2,
      },
    ],
    alignment:
      "Most dwarves are lawful, believing firmly in the benefits of a well-ordered society. They tend toward good as well, with a strong sense of fair play and a belief that everyone deserves to share in the benefits of a just order.",
    age: "Dwarves mature at the same rate as humans, but they're considered young until they reach the age of 50. On average, they live about 350 years.",
    size: "Medium",
    size_description:
      "Dwarves stand between 4 and 5 feet tall and average about 150 pounds. Your size is Medium.",
    languages: [
      {
        index: "common",
        name: "Common",
        url: "/api/2014/languages/common",
      },
      {
        index: "dwarvish",
        name: "Dwarvish",
        url: "/api/2014/languages/dwarvish",
      },
    ],
    language_desc:
      "You can speak, read, and write Common and Dwarvish. Dwarvish is full of hard consonants and guttural sounds, and those characteristics spill over into whatever other language a dwarf might speak.",
    traits: [
      {
        index: "darkvision",
        name: "Darkvision",
        url: "/api/2014/traits/darkvision",
      },
      {
        index: "dwarven-resilience",
        name: "Dwarven Resilience",
        url: "/api/2014/traits/dwarven-resilience",
      },
      {
        index: "stonecunning",
        name: "Stonecunning",
        url: "/api/2014/traits/stonecunning",
      },
      {
        index: "dwarven-combat-training",
        name: "Dwarven Combat Training",
        url: "/api/2014/traits/dwarven-combat-training",
      },
      {
        index: "tool-proficiency",
        name: "Tool Proficiency",
        url: "/api/2014/traits/tool-proficiency",
      },
    ],
    subraces: [
      {
        index: "hill-dwarf",
        name: "Hill Dwarf",
        url: "/api/2014/subraces/hill-dwarf",
      },
    ],
    url: "/api/2014/races/dwarf",
  },
  {
    index: "elf",
    name: "Elf",
    speed: 30,
    ability_bonuses: [
      {
        ability_score: {
          index: "dex",
          name: "DEX",
          url: "/api/2014/ability-scores/dex",
        },
        bonus: 2,
      },
    ],
    age: "Although elves reach physical maturity at about the same age as humans, the elven understanding of adulthood goes beyond physical growth to encompass worldly experience. An elf typically claims adulthood and an adult name around the age of 100 and can live to be 750 years old.",
    alignment:
      "Elves love freedom, variety, and self-expression, so they lean strongly toward the gentler aspects of chaos. They value and protect others' freedom as well as their own, and they are more often good than not.",
    size: "Medium",
    size_description:
      "Elves range from under 5 to over 6 feet tall and have slender builds. Your size is Medium.",
    languages: [
      {
        index: "common",
        name: "Common",
        url: "/api/2014/languages/common",
      },
      {
        index: "elvish",
        name: "Elvish",
        url: "/api/2014/languages/elvish",
      },
    ],
    language_desc:
      "You can speak, read, and write Common and Elvish. Elvish is fluid, with subtle intonations and intricate grammar. Elven literature is rich and varied, and their songs and poems are famous among other races. Many bards learn their language so they can add Elvish ballads to their repertoires.",
    traits: [
      {
        index: "darkvision",
        name: "Darkvision",
        url: "/api/2014/traits/darkvision",
      },
      {
        index: "fey-ancestry",
        name: "Fey Ancestry",
        url: "/api/2014/traits/fey-ancestry",
      },
      {
        index: "trance",
        name: "Trance",
        url: "/api/2014/traits/trance",
      },
      {
        index: "keen-senses",
        name: "Keen Senses",
        url: "/api/2014/traits/keen-senses",
      },
    ],
    subraces: [
      {
        index: "high-elf",
        name: "High Elf",
        url: "/api/2014/subraces/high-elf",
      },
    ],
    url: "/api/2014/races/elf",
  },
  {
    index: "halfling",
    name: "Halfling",
    speed: 25,
    ability_bonuses: [
      {
        ability_score: {
          index: "dex",
          name: "DEX",
          url: "/api/2014/ability-scores/dex",
        },
        bonus: 2,
      },
    ],
    age: "A halfling reaches adulthood at the age of 20 and generally lives into the middle of his or her second century.",
    alignment:
      "Most halflings are lawful good. As a rule, they are good-hearted and kind, hate to see others in pain, and have no tolerance for oppression. They are also very orderly and traditional, leaning heavily on the support of their community and the comfort of their old ways.",
    size: "Small",
    size_description:
      "Halflings average about 3 feet tall and weigh about 40 pounds. Your size is Small.",
    languages: [
      {
        index: "common",
        name: "Common",
        url: "/api/2014/languages/common",
      },
      {
        index: "halfling",
        name: "Halfling",
        url: "/api/2014/languages/halfling",
      },
    ],
    language_desc:
      "You can speak, read, and write Common and Halfling. The Halfling language isn't secret, but halflings are loath to share it with others. They write very little, so they don't have a rich body of literature. Their oral tradition, however, is very strong. Almost all halflings speak Common to converse with the people in whose lands they dwell or through which they are traveling.",
    traits: [
      {
        index: "brave",
        name: "Brave",
        url: "/api/2014/traits/brave",
      },
      {
        index: "halfling-nimbleness",
        name: "Halfling Nimbleness",
        url: "/api/2014/traits/halfling-nimbleness",
      },
      {
        index: "lucky",
        name: "Lucky",
        url: "/api/2014/traits/lucky",
      },
    ],
    subraces: [
      {
        index: "lightfoot-halfling",
        name: "Lightfoot Halfling",
        url: "/api/2014/subraces/lightfoot-halfling",
      },
    ],
    url: "/api/2014/races/halfling",
  },
  {
    index: "human",
    name: "Human",
    speed: 30,
    ability_bonuses: [
      {
        ability_score: {
          index: "str",
          name: "STR",
          url: "/api/2014/ability-scores/str",
        },
        bonus: 1,
      },
      {
        ability_score: {
          index: "dex",
          name: "DEX",
          url: "/api/2014/ability-scores/dex",
        },
        bonus: 1,
      },
      {
        ability_score: {
          index: "con",
          name: "CON",
          url: "/api/2014/ability-scores/con",
        },
        bonus: 1,
      },
      {
        ability_score: {
          index: "int",
          name: "INT",
          url: "/api/2014/ability-scores/int",
        },
        bonus: 1,
      },
      {
        ability_score: {
          index: "wis",
          name: "WIS",
          url: "/api/2014/ability-scores/wis",
        },
        bonus: 1,
      },
      {
        ability_score: {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
        bonus: 1,
      },
    ],
    age: "Humans reach adulthood in their late teens and live less than a century.",
    alignment:
      "Humans tend toward no particular alignment. The best and the worst are found among them.",
    size: "Medium",
    size_description:
      "Humans vary widely in height and build, from barely 5 feet to well over 6 feet tall. Regardless of your position in that range, your size is Medium.",
    languages: [
      {
        index: "common",
        name: "Common",
        url: "/api/2014/languages/common",
      },
    ],
    language_options: {
      choose: 1,
      type: "languages",
      from: {
        option_set_type: "options_array",
        options: [
          {
            option_type: "reference",
            item: {
              index: "dwarvish",
              name: "Dwarvish",
              url: "/api/2014/languages/dwarvish",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "elvish",
              name: "Elvish",
              url: "/api/2014/languages/elvish",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "giant",
              name: "Giant",
              url: "/api/2014/languages/giant",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "gnomish",
              name: "Gnomish",
              url: "/api/2014/languages/gnomish",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "goblin",
              name: "Goblin",
              url: "/api/2014/languages/goblin",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "halfling",
              name: "Halfling",
              url: "/api/2014/languages/halfling",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "orc",
              name: "Orc",
              url: "/api/2014/languages/orc",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "abyssal",
              name: "Abyssal",
              url: "/api/2014/languages/abyssal",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "celestial",
              name: "Celestial",
              url: "/api/2014/languages/celestial",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "draconic",
              name: "Draconic",
              url: "/api/2014/languages/draconic",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "deep-speech",
              name: "Deep Speech",
              url: "/api/2014/languages/deep-speech",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "infernal",
              name: "Infernal",
              url: "/api/2014/languages/infernal",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "primordial",
              name: "Primordial",
              url: "/api/2014/languages/primordial",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "sylvan",
              name: "Sylvan",
              url: "/api/2014/languages/sylvan",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "undercommon",
              name: "Undercommon",
              url: "/api/2014/languages/undercommon",
            },
          },
        ],
      },
    },
    language_desc:
      "You can speak, read, and write Common and one extra language of your choice. Humans typically learn the languages of other peoples they deal with, including obscure dialects. They are fond of sprinkling their speech with words borrowed from other tongues: Orc curses, Elvish musical expressions, Dwarvish military phrases, and so on.",
    traits: [],
    subraces: [],
    url: "/api/2014/races/human",
  },
  {
    index: "dragonborn",
    name: "Dragonborn",
    speed: 30,
    ability_bonuses: [
      {
        ability_score: {
          index: "str",
          name: "STR",
          url: "/api/2014/ability-scores/str",
        },
        bonus: 2,
      },
      {
        ability_score: {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
        bonus: 1,
      },
    ],
    alignment:
      "Dragonborn tend to extremes, making a conscious choice for one side or the other in the cosmic war between good and evil. Most dragonborn are good, but those who side with evil can be terrible villains.",
    age: "Young dragonborn grow quickly. They walk hours after hatching, attain the size and development of a 10-year-old human child by the age of 3, and reach adulthood by 15. They live to be around 80.",
    size: "Medium",
    size_description:
      "Dragonborn are taller and heavier than humans, standing well over 6 feet tall and averaging almost 250 pounds. Your size is Medium.",
    languages: [
      {
        index: "common",
        name: "Common",
        url: "/api/2014/languages/common",
      },
      {
        index: "draconic",
        name: "Draconic",
        url: "/api/2014/languages/draconic",
      },
    ],
    language_desc:
      "You can speak, read, and write Common and Draconic. Draconic is thought to be one of the oldest languages and is often used in the study of magic. The language sounds harsh to most other creatures and includes numerous hard consonants and sibilants.",
    traits: [
      {
        index: "draconic-ancestry",
        name: "Draconic Ancestry",
        url: "/api/2014/traits/draconic-ancestry",
      },
      {
        index: "breath-weapon",
        name: "Breath Weapon",
        url: "/api/2014/traits/breath-weapon",
      },
      {
        index: "damage-resistance",
        name: "Damage Resistance",
        url: "/api/2014/traits/damage-resistance",
      },
    ],
    subraces: [],
    url: "/api/2014/races/dragonborn",
  },
  {
    index: "gnome",
    name: "Gnome",
    speed: 25,
    ability_bonuses: [
      {
        ability_score: {
          index: "int",
          name: "INT",
          url: "/api/2014/ability-scores/int",
        },
        bonus: 2,
      },
    ],
    alignment:
      "Gnomes are most often good. Those who tend toward law are sages, engineers, researchers, scholars, investigators, or inventors. Those who tend toward chaos are minstrels, tricksters, wanderers, or fanciful jewelers. Gnomes are good-hearted, and even the tricksters among them are more playful than vicious.",
    age: "Gnomes mature at the same rate humans do, and most are expected to settle down into an adult life by around age 40. They can live 350 to almost 500 years.",
    size: "Small",
    size_description:
      "Gnomes are between 3 and 4 feet tall and average about 40 pounds. Your size is Small.",
    languages: [
      {
        index: "common",
        name: "Common",
        url: "/api/2014/languages/common",
      },
      {
        index: "gnomish",
        name: "Gnomish",
        url: "/api/2014/languages/gnomish",
      },
    ],
    language_desc:
      "You can speak, read, and write Common and Gnomish. The Gnomish language, which uses the Dwarvish script, is renowned for its technical treatises and its catalogs of knowledge about the natural world.",
    traits: [
      {
        index: "darkvision",
        name: "Darkvision",
        url: "/api/2014/traits/darkvision",
      },
      {
        index: "gnome-cunning",
        name: "Gnome Cunning",
        url: "/api/2014/traits/gnome-cunning",
      },
    ],
    subraces: [
      {
        index: "rock-gnome",
        name: "Rock Gnome",
        url: "/api/2014/subraces/rock-gnome",
      },
    ],
    url: "/api/2014/races/gnome",
  },
  {
    index: "half-elf",
    name: "Half-Elf",
    speed: 30,
    ability_bonuses: [
      {
        ability_score: {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
        bonus: 2,
      },
    ],
    ability_bonus_options: {
      choose: 2,
      type: "ability_bonuses",
      from: {
        option_set_type: "options_array",
        options: [
          {
            option_type: "ability_bonus",
            ability_score: {
              index: "str",
              name: "STR",
              url: "/api/2014/ability-scores/str",
            },
            bonus: 1,
          },
          {
            option_type: "ability_bonus",
            ability_score: {
              index: "dex",
              name: "DEX",
              url: "/api/2014/ability-scores/dex",
            },
            bonus: 1,
          },
          {
            option_type: "ability_bonus",
            ability_score: {
              index: "con",
              name: "CON",
              url: "/api/2014/ability-scores/con",
            },
            bonus: 1,
          },
          {
            option_type: "ability_bonus",
            ability_score: {
              index: "int",
              name: "INT",
              url: "/api/2014/ability-scores/int",
            },
            bonus: 1,
          },
          {
            option_type: "ability_bonus",
            ability_score: {
              index: "wis",
              name: "WIS",
              url: "/api/2014/ability-scores/wis",
            },
            bonus: 1,
          },
        ],
      },
    },
    alignment:
      "Half-elves share the chaotic bent of their elven heritage. They value both personal freedom and creative expression, demonstrating neither love of leaders nor desire for followers. They chafe at rules, resent others' demands, and sometimes prove unreliable, or at least unpredictable.",
    age: "Half-elves mature at the same rate humans do and reach adulthood around the age of 20. They live much longer than humans, however, often exceeding 180 years.",
    size: "Medium",
    size_description:
      "Half-elves are about the same size as humans, ranging from 5 to 6 feet tall. Your size is Medium.",
    languages: [
      {
        index: "common",
        name: "Common",
        url: "/api/2014/languages/common",
      },
      {
        index: "elvish",
        name: "Elvish",
        url: "/api/2014/languages/elvish",
      },
    ],
    language_options: {
      choose: 1,
      type: "languages",
      from: {
        option_set_type: "options_array",
        options: [
          {
            option_type: "reference",
            item: {
              index: "dwarvish",
              name: "Dwarvish",
              url: "/api/2014/languages/dwarvish",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "giant",
              name: "Giant",
              url: "/api/2014/languages/giant",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "gnomish",
              name: "Gnomish",
              url: "/api/2014/languages/gnomish",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "goblin",
              name: "Goblin",
              url: "/api/2014/languages/goblin",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "halfling",
              name: "Halfling",
              url: "/api/2014/languages/halfling",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "orc",
              name: "Orc",
              url: "/api/2014/languages/orc",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "abyssal",
              name: "Abyssal",
              url: "/api/2014/languages/abyssal",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "celestial",
              name: "Celestial",
              url: "/api/2014/languages/celestial",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "draconic",
              name: "Draconic",
              url: "/api/2014/languages/draconic",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "deep-speech",
              name: "Deep Speech",
              url: "/api/2014/languages/deep-speech",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "infernal",
              name: "Infernal",
              url: "/api/2014/languages/infernal",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "primordial",
              name: "Primordial",
              url: "/api/2014/languages/primordial",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "sylvan",
              name: "Sylvan",
              url: "/api/2014/languages/sylvan",
            },
          },
          {
            option_type: "reference",
            item: {
              index: "undercommon",
              name: "Undercommon",
              url: "/api/2014/languages/undercommon",
            },
          },
        ],
      },
    },
    language_desc:
      "You can speak, read, and write Common, Elvish, and one extra language of your choice.",
    traits: [
      {
        index: "darkvision",
        name: "Darkvision",
        url: "/api/2014/traits/darkvision",
      },
      {
        index: "fey-ancestry",
        name: "Fey Ancestry",
        url: "/api/2014/traits/fey-ancestry",
      },
      {
        index: "skill-versatility",
        name: "Skill Versatility",
        url: "/api/2014/traits/skill-versatility",
      },
    ],
    subraces: [],
    url: "/api/2014/races/half-elf",
  },
  {
    index: "half-orc",
    name: "Half-Orc",
    speed: 30,
    ability_bonuses: [
      {
        ability_score: {
          index: "str",
          name: "STR",
          url: "/api/2014/ability-scores/str",
        },
        bonus: 2,
      },
      {
        ability_score: {
          index: "con",
          name: "CON",
          url: "/api/2014/ability-scores/con",
        },
        bonus: 1,
      },
    ],
    alignment:
      "Half-orcs inherit a tendency toward chaos from their orc parents and are not strongly inclined toward good. Half-orcs raised among orcs and willing to live out their lives among them are usually evil.",
    age: "Half-orcs mature a little faster than humans, reaching adulthood around age 14. They age noticeably faster and rarely live longer than 75 years.",
    size: "Medium",
    size_description:
      "Half-orcs are somewhat larger and bulkier than humans, and they range from 5 to well over 6 feet tall. Your size is Medium.",
    languages: [
      {
        index: "common",
        name: "Common",
        url: "/api/2014/languages/common",
      },
      {
        index: "orc",
        name: "Orc",
        url: "/api/2014/languages/orc",
      },
    ],
    language_desc:
      "You can speak, read, and write Common and Orc. Orc is a harsh, grating language with hard consonants. It has no script of its own but is written in the Dwarvish script.",
    traits: [
      {
        index: "darkvision",
        name: "Darkvision",
        url: "/api/2014/traits/darkvision",
      },
      {
        index: "savage-attacks",
        name: "Savage Attacks",
        url: "/api/2014/traits/savage-attacks",
      },
      {
        index: "relentless-endurance",
        name: "Relentless Endurance",
        url: "/api/2014/traits/relentless-endurance",
      },
      {
        index: "menacing",
        name: "Menacing",
        url: "/api/2014/traits/menacing",
      },
    ],
    subraces: [],
    url: "/api/2014/races/half-orc",
  },
  {
    index: "tiefling",
    name: "Tiefling",
    speed: 30,
    ability_bonuses: [
      {
        ability_score: {
          index: "int",
          name: "INT",
          url: "/api/2014/ability-scores/int",
        },
        bonus: 1,
      },
      {
        ability_score: {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
        bonus: 2,
      },
    ],
    alignment:
      "Tieflings might not have an innate tendency toward evil, but many of them end up there. Evil or not, an independent nature inclines many tieflings toward a chaotic alignment.",
    age: "Tieflings mature at the same rate as humans but live a few years longer.",
    size: "Medium",
    size_description: "Tieflings are about the same size and build as humans. Your size is Medium.",
    languages: [
      {
        index: "common",
        name: "Common",
        url: "/api/2014/languages/common",
      },
      {
        index: "infernal",
        name: "Infernal",
        url: "/api/2014/languages/infernal",
      },
    ],
    language_desc: "You can speak, read, and write Common and Infernal.",
    traits: [
      {
        index: "darkvision",
        name: "Darkvision",
        url: "/api/2014/traits/darkvision",
      },
      {
        index: "hellish-resistance",
        name: "Hellish Resistance",
        url: "/api/2014/traits/hellish-resistance",
      },
      {
        index: "infernal-legacy",
        name: "Infernal Legacy",
        url: "/api/2014/traits/infernal-legacy",
      },
    ],
    subraces: [],
    url: "/api/2014/races/tiefling",
  },
] satisfies ReadonlyArray<Record<string, unknown>>;

const SUBRACE_RAW = [
  {
    index: "hill-dwarf",
    name: "Hill Dwarf",
    race: {
      index: "dwarf",
      name: "Dwarf",
      url: "/api/2014/races/dwarf",
    },
    desc: "As a hill dwarf, you have keen senses, deep intuition, and remarkable resilience.",
    ability_bonuses: [
      {
        ability_score: {
          index: "wis",
          name: "WIS",
          url: "/api/2014/ability-scores/wis",
        },
        bonus: 1,
      },
    ],
    racial_traits: [
      {
        index: "dwarven-toughness",
        name: "Dwarven Toughness",
        url: "/api/2014/traits/dwarven-toughness",
      },
    ],
    url: "/api/2014/subraces/hill-dwarf",
  },
  {
    index: "high-elf",
    name: "High Elf",
    race: {
      index: "elf",
      name: "Elf",
      url: "/api/2014/races/elf",
    },
    desc: "As a high elf, you have a keen mind and a mastery of at least the basics of magic. In many fantasy gaming worlds, there are two kinds of high elves. One type is haughty and reclusive, believing themselves to be superior to non-elves and even other elves. The other type is more common and more friendly, and often encountered among humans and other races.",
    ability_bonuses: [
      {
        ability_score: {
          index: "int",
          name: "INT",
          url: "/api/2014/ability-scores/int",
        },
        bonus: 1,
      },
    ],
    racial_traits: [
      {
        index: "elf-weapon-training",
        name: "Elf Weapon Training",
        url: "/api/2014/traits/elf-weapon-training",
      },
      {
        index: "high-elf-cantrip",
        name: "High Elf Cantrip",
        url: "/api/2014/traits/high-elf-cantrip",
      },
      {
        index: "extra-language",
        name: "Extra Language",
        url: "/api/2014/traits/extra-language",
      },
    ],
    url: "/api/2014/subraces/high-elf",
  },
  {
    index: "lightfoot-halfling",
    name: "Lightfoot Halfling",
    race: {
      index: "halfling",
      name: "Halfling",
      url: "/api/2014/races/halfling",
    },
    desc: "As a lightfoot halfling, you can easily hide from notice, even using other people as cover. You're inclined to be affable and get along well with others. Lightfoots are more prone to wanderlust than other halflings, and often dwell alongside other races or take up a nomadic life.",
    ability_bonuses: [
      {
        ability_score: {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
        bonus: 1,
      },
    ],
    racial_traits: [
      {
        index: "naturally-stealthy",
        name: "Naturally Stealthy",
        url: "/api/2014/traits/naturally-stealthy",
      },
    ],
    url: "/api/2014/subraces/lightfoot-halfling",
  },
  {
    index: "rock-gnome",
    name: "Rock Gnome",
    race: {
      index: "gnome",
      name: "Gnome",
      url: "/api/2014/races/gnome",
    },
    desc: "As a rock gnome, you have a natural inventiveness and hardiness beyond that of other gnomes.",
    ability_bonuses: [
      {
        ability_score: {
          index: "con",
          name: "CON",
          url: "/api/2014/ability-scores/con",
        },
        bonus: 1,
      },
    ],
    racial_traits: [
      {
        index: "artificers-lore",
        name: "Artificer's Lore",
        url: "/api/2014/traits/artificers-lore",
      },
      {
        index: "tinker",
        name: "Tinker",
        url: "/api/2014/traits/tinker",
      },
    ],
    url: "/api/2014/subraces/rock-gnome",
  },
] satisfies ReadonlyArray<Record<string, unknown>>;

const BACKGROUND_RAW = [
  {
    index: "acolyte",
    name: "Acolyte",
    starting_proficiencies: [
      {
        index: "skill-insight",
        name: "Skill: Insight",
        url: "/api/2014/proficiencies/skill-insight",
      },
      {
        index: "skill-religion",
        name: "Skill: Religion",
        url: "/api/2014/proficiencies/skill-religion",
      },
    ],
    language_options: {
      choose: 2,
      type: "languages",
      from: {
        option_set_type: "resource_list",
        resource_list_url: "/api/2014/languages",
      },
    },
    starting_equipment: [
      {
        equipment: {
          index: "clothes-common",
          name: "Clothes, common",
          url: "/api/2014/equipment/clothes-common",
        },
        quantity: 1,
      },
      {
        equipment: {
          index: "pouch",
          name: "Pouch",
          url: "/api/2014/equipment/pouch",
        },
        quantity: 1,
      },
    ],
    starting_gold: {
      quantity: 15,
      unit: "gp",
    },
    starting_equipment_options: [
      {
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "equipment_category",
          equipment_category: {
            index: "holy-symbols",
            name: "Holy Symbols",
            url: "/api/2014/equipment-categories/holy-symbols",
          },
        },
      },
    ],
    feature: {
      name: "Shelter of the Faithful",
      desc: [
        "As an acolyte, you command the respect of those who share your faith, and you can perform the religious ceremonies of your deity. You and your adventuring companions can expect to receive free healing and care at a temple, shrine, or other established presence of your faith, though you must provide any material components needed for spells. Those who share your religion will support you (but only you) at a modest lifestyle.",
        "You might also have ties to a specific temple dedicated to your chosen deity or pantheon, and you have a residence there. This could be the temple where you used to serve, if you remain on good terms with it, or a temple where you have found a new home. While near your temple, you can call upon the priests for assistance, provided the assistance you ask for is not hazardous and you remain in good standing with your temple.",
      ],
    },
    personality_traits: {
      choose: 2,
      type: "personality_traits",
      from: {
        option_set_type: "options_array",
        options: [
          {
            option_type: "string",
            string:
              "I idolize a particular hero of my faith, and constantly refer to that person's deeds and example.",
          },
          {
            option_type: "string",
            string:
              "I can find common ground between the fiercest enemies, empathizing with them and always working toward peace.",
          },
          {
            option_type: "string",
            string:
              "I see omens in every event and action. The gods try to speak to us, we just need to listen.",
          },
          {
            option_type: "string",
            string: "Nothing can shake my optimistic attitude.",
          },
          {
            option_type: "string",
            string: "I quote (or misquote) sacred texts and proverbs in almost every situation.",
          },
          {
            option_type: "string",
            string:
              "I am tolerant (or intolerant) of other faiths and respect (or condemn) the worship of other gods.",
          },
          {
            option_type: "string",
            string:
              "I've enjoyed fine food, drink, and high society among my temple's elite. Rough living grates on me.",
          },
          {
            option_type: "string",
            string:
              "I've spent so long in the temple that I have little practical experience dealing with people in the outside world.",
          },
        ],
      },
    },
    ideals: {
      choose: 1,
      type: "ideals",
      from: {
        option_set_type: "options_array",
        options: [
          {
            option_type: "ideal",
            desc: "Tradition. The ancient traditions of worship and sacrifice must be preserved and upheld.",
            alignments: [
              {
                index: "lawful-good",
                name: "Lawful Good",
                url: "/api/2014/alignments/lawful-good",
              },
              {
                index: "lawful-neutral",
                name: "Lawful Neutral",
                url: "/api/2014/alignments/lawful-neutral",
              },
              {
                index: "lawful-evil",
                name: "Lawful Evil",
                url: "/api/2014/alignments/lawful-evil",
              },
            ],
          },
          {
            option_type: "ideal",
            desc: "Charity. I always try to help those in need, no matter what the personal cost.",
            alignments: [
              {
                index: "lawful-good",
                name: "Lawful Good",
                url: "/api/2014/alignments/lawful-good",
              },
              {
                index: "neutral-good",
                name: "Neutral Good",
                url: "/api/2014/alignments/neutral-good",
              },
              {
                index: "chaotic-good",
                name: "Chaotic Good",
                url: "/api/2014/alignments/chaotic-good",
              },
            ],
          },
          {
            option_type: "ideal",
            desc: "Change. We must help bring about the changes the gods are constantly working in the world.",
            alignments: [
              {
                index: "chaotic-good",
                name: "Chaotic Good",
                url: "/api/2014/alignments/chaotic-good",
              },
              {
                index: "chaotic-neutral",
                name: "Chaotic Neutral",
                url: "/api/2014/alignments/chaotic-neutral",
              },
              {
                index: "chaotic-evil",
                name: "Chaotic Evil",
                url: "/api/2014/alignments/chaotic-evil",
              },
            ],
          },
          {
            option_type: "ideal",
            desc: "Power. I hope to one day rise to the top of my faith's religious hierarchy.",
            alignments: [
              {
                index: "lawful-good",
                name: "Lawful Good",
                url: "/api/2014/alignments/lawful-good",
              },
              {
                index: "lawful-neutral",
                name: "Lawful Neutral",
                url: "/api/2014/alignments/lawful-neutral",
              },
              {
                index: "lawful-evil",
                name: "Lawful Evil",
                url: "/api/2014/alignments/lawful-evil",
              },
            ],
          },
          {
            option_type: "ideal",
            desc: "Faith. I trust that my deity will guide my actions. I have faith that if I work hard, things will go well.",
            alignments: [
              {
                index: "lawful-good",
                name: "Lawful Good",
                url: "/api/2014/alignments/lawful-good",
              },
              {
                index: "lawful-neutral",
                name: "Lawful Neutral",
                url: "/api/2014/alignments/lawful-neutral",
              },
              {
                index: "lawful-evil",
                name: "Lawful Evil",
                url: "/api/2014/alignments/lawful-evil",
              },
            ],
          },
          {
            option_type: "ideal",
            desc: "Aspiration. I seek to prove myself worthy of my god's favor by matching my actions against his or her teachings.",
            alignments: [
              {
                index: "lawful-good",
                name: "Lawful Good",
                url: "/api/2014/alignments/lawful-good",
              },
              {
                index: "neutral-good",
                name: "Neutral Good",
                url: "/api/2014/alignments/neutral-good",
              },
              {
                index: "chaotic-good",
                name: "Chaotic Good",
                url: "/api/2014/alignments/chaotic-good",
              },
              {
                index: "lawful-neutral",
                name: "Lawful Neutral",
                url: "/api/2014/alignments/lawful-neutral",
              },
              {
                index: "neutral",
                name: "Neutral",
                url: "/api/2014/alignments/neutral",
              },
              {
                index: "chaotic-neutral",
                name: "Chaotic Neutral",
                url: "/api/2014/alignments/chaotic-neutral",
              },
              {
                index: "lawful-evil",
                name: "Lawful Evil",
                url: "/api/2014/alignments/lawful-evil",
              },
              {
                index: "neutral-evil",
                name: "Neutral Evil",
                url: "/api/2014/alignments/neutral-evil",
              },
              {
                index: "chaotic-evil",
                name: "Chaotic Evil",
                url: "/api/2014/alignments/chaotic-evil",
              },
            ],
          },
        ],
      },
    },
    bonds: {
      choose: 1,
      type: "bonds",
      from: {
        option_set_type: "options_array",
        options: [
          {
            option_type: "string",
            string: "I would die to recover an ancient relic of my faith that was lost long ago.",
          },
          {
            option_type: "string",
            string:
              "I will someday get revenge on the corrupt temple hierarchy who branded me a heretic.",
          },
          {
            option_type: "string",
            string: "I owe my life to the priest who took me in when my parents died.",
          },
          {
            option_type: "string",
            string: "Everything I do is for the common people.",
          },
          {
            option_type: "string",
            string: "I will do anything to protect the temple where I served.",
          },
          {
            option_type: "string",
            string:
              "I seek to preserve a sacred text that my enemies consider heretical and seek to destroy.",
          },
        ],
      },
    },
    flaws: {
      choose: 1,
      type: "flaws",
      from: {
        option_set_type: "options_array",
        options: [
          {
            option_type: "string",
            string: "I judge others harshly, and myself even more severely.",
          },
          {
            option_type: "string",
            string: "I put too much trust in those who wield power within my temple's hierarchy.",
          },
          {
            option_type: "string",
            string:
              "My piety sometimes leads me to blindly trust those that profess faith in my god.",
          },
          {
            option_type: "string",
            string: "I am inflexible in my thinking.",
          },
          {
            option_type: "string",
            string: "I am suspicious of strangers and expect the worst of them.",
          },
          {
            option_type: "string",
            string:
              "Once I pick a goal, I become obsessed with it to the detriment of everything else in my life.",
          },
        ],
      },
    },
    url: "/api/2014/backgrounds/acolyte",
  },
] satisfies ReadonlyArray<Record<string, unknown>>;

export const SOURCE_RAW = {
  classes: CLASS_RAW,
  races: RACE_RAW,
  subraces: SUBRACE_RAW,
  backgrounds: BACKGROUND_RAW,
} as const;

export const SYSTEM_OPTIONS: ReadonlyArray<SystemOption> = [
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "barbarian",
    sourceUrl: "/api/2014/classes/barbarian",
    name: "Barbarian",
    body: {
      hitDie: 12,
      unarmouredAc: ["DEX", "CON"],
      proficiencies: [
        "Light Armor",
        "Medium Armor",
        "Shields",
        "Simple Weapons",
        "Martial Weapons",
        "Saving Throw: STR",
        "Saving Throw: CON",
        "Choose two from Animal Handling, Athletics, Intimidation, Nature, Perception, and Survival",
      ],
      savingThrows: ["STR", "CON"],
      summary:
        "Starting equipment: 1 × Explorer's Pack; 4 × Javelin; (a) a greataxe or (b) any martial melee weapon; (a) two handaxes or (b) any simple weapon",
    },
    raw: {
      index: "barbarian",
      name: "Barbarian",
      hit_die: 12,
      proficiency_choices: [
        {
          desc: "Choose two from Animal Handling, Athletics, Intimidation, Nature, Perception, and Survival",
          choose: 2,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-animal-handling",
                  name: "Skill: Animal Handling",
                  url: "/api/2014/proficiencies/skill-animal-handling",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-athletics",
                  name: "Skill: Athletics",
                  url: "/api/2014/proficiencies/skill-athletics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-intimidation",
                  name: "Skill: Intimidation",
                  url: "/api/2014/proficiencies/skill-intimidation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-nature",
                  name: "Skill: Nature",
                  url: "/api/2014/proficiencies/skill-nature",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-perception",
                  name: "Skill: Perception",
                  url: "/api/2014/proficiencies/skill-perception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-survival",
                  name: "Skill: Survival",
                  url: "/api/2014/proficiencies/skill-survival",
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "medium-armor",
          name: "Medium Armor",
          url: "/api/2014/proficiencies/medium-armor",
        },
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "martial-weapons",
          name: "Martial Weapons",
          url: "/api/2014/proficiencies/martial-weapons",
        },
        {
          index: "saving-throw-str",
          name: "Saving Throw: STR",
          url: "/api/2014/proficiencies/saving-throw-str",
        },
        {
          index: "saving-throw-con",
          name: "Saving Throw: CON",
          url: "/api/2014/proficiencies/saving-throw-con",
        },
      ],
      saving_throws: [
        {
          index: "str",
          name: "STR",
          url: "/api/2014/ability-scores/str",
        },
        {
          index: "con",
          name: "CON",
          url: "/api/2014/ability-scores/con",
        },
      ],
      starting_equipment: [
        {
          equipment: {
            index: "explorers-pack",
            name: "Explorer's Pack",
            url: "/api/2014/equipment/explorers-pack",
          },
          quantity: 1,
        },
        {
          equipment: {
            index: "javelin",
            name: "Javelin",
            url: "/api/2014/equipment/javelin",
          },
          quantity: 4,
        },
      ],
      starting_equipment_options: [
        {
          desc: "(a) a greataxe or (b) any martial melee weapon",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "greataxe",
                  name: "Greataxe",
                  url: "/api/2014/equipment/greataxe",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "any martial melee weapon",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "martial-melee-weapons",
                      name: "Martial Melee Weapons",
                      url: "/api/2014/equipment-categories/martial-melee-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) two handaxes or (b) any simple weapon",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 2,
                of: {
                  index: "handaxe",
                  name: "Handaxe",
                  url: "/api/2014/equipment/handaxe",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "any simple weapon",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "simple-weapons",
                      name: "Simple Weapons",
                      url: "/api/2014/equipment-categories/simple-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
      ],
      class_levels: "/api/2014/classes/barbarian/levels",
      multi_classing: {
        prerequisites: [
          {
            ability_score: {
              index: "str",
              name: "STR",
              url: "/api/2014/ability-scores/str",
            },
            minimum_score: 13,
          },
        ],
        proficiencies: [
          {
            index: "shields",
            name: "Shields",
            url: "/api/2014/proficiencies/shields",
          },
          {
            index: "simple-weapons",
            name: "Simple Weapons",
            url: "/api/2014/proficiencies/simple-weapons",
          },
          {
            index: "martial-weapons",
            name: "Martial Weapons",
            url: "/api/2014/proficiencies/martial-weapons",
          },
        ],
      },
      subclasses: [
        {
          index: "berserker",
          name: "Berserker",
          url: "/api/2014/subclasses/berserker",
        },
      ],
      url: "/api/2014/classes/barbarian",
    },
  },
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "bard",
    sourceUrl: "/api/2014/classes/bard",
    name: "Bard",
    body: {
      hitDie: 8,
      unarmouredAc: ["DEX"],
      proficiencies: [
        "Light Armor",
        "Simple Weapons",
        "Longswords",
        "Rapiers",
        "Shortswords",
        "Hand crossbows",
        "Saving Throw: DEX",
        "Saving Throw: CHA",
        "Choose any three",
        "Three musical instruments of your choice",
      ],
      savingThrows: ["DEX", "CHA"],
      summary:
        "Starting equipment: 1 × Leather Armor; 1 × Dagger; (a) a rapier, (b) a longsword, or (c) any simple weapon; (a) a diplomat’s pack or (b) an entertainer’s pack; (a) a lute or (b) any other musical instrument",
    },
    raw: {
      index: "bard",
      name: "Bard",
      hit_die: 8,
      proficiency_choices: [
        {
          desc: "Choose any three",
          choose: 3,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-acrobatics",
                  name: "Skill: Acrobatics",
                  url: "/api/2014/proficiencies/skill-acrobatics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-animal-handling",
                  name: "Skill: Animal Handling",
                  url: "/api/2014/proficiencies/skill-animal-handling",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-arcana",
                  name: "Skill: Arcana",
                  url: "/api/2014/proficiencies/skill-arcana",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-athletics",
                  name: "Skill: Athletics",
                  url: "/api/2014/proficiencies/skill-athletics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-deception",
                  name: "Skill: Deception",
                  url: "/api/2014/proficiencies/skill-deception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-history",
                  name: "Skill: History",
                  url: "/api/2014/proficiencies/skill-history",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-intimidation",
                  name: "Skill: Intimidation",
                  url: "/api/2014/proficiencies/skill-intimidation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-investigation",
                  name: "Skill: Investigation",
                  url: "/api/2014/proficiencies/skill-investigation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-medicine",
                  name: "Skill: Medicine",
                  url: "/api/2014/proficiencies/skill-medicine",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-nature",
                  name: "Skill: Nature",
                  url: "/api/2014/proficiencies/skill-nature",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-perception",
                  name: "Skill: Perception",
                  url: "/api/2014/proficiencies/skill-perception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-performance",
                  name: "Skill: Performance",
                  url: "/api/2014/proficiencies/skill-performance",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-persuasion",
                  name: "Skill: Persuasion",
                  url: "/api/2014/proficiencies/skill-persuasion",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-religion",
                  name: "Skill: Religion",
                  url: "/api/2014/proficiencies/skill-religion",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-sleight-of-hand",
                  name: "Skill: Sleight of Hand",
                  url: "/api/2014/proficiencies/skill-sleight-of-hand",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-stealth",
                  name: "Skill: Stealth",
                  url: "/api/2014/proficiencies/skill-stealth",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-survival",
                  name: "Skill: Survival",
                  url: "/api/2014/proficiencies/skill-survival",
                },
              },
            ],
          },
        },
        {
          desc: "Three musical instruments of your choice",
          choose: 3,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "bagpipes",
                  name: "Bagpipes",
                  url: "/api/2014/proficiencies/bagpipes",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "drum",
                  name: "Drum",
                  url: "/api/2014/proficiencies/drum",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "dulcimer",
                  name: "Dulcimer",
                  url: "/api/2014/proficiencies/dulcimer",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "flute",
                  name: "Flute",
                  url: "/api/2014/proficiencies/flute",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "lute",
                  name: "Lute",
                  url: "/api/2014/proficiencies/lute",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "lyre",
                  name: "Lyre",
                  url: "/api/2014/proficiencies/lyre",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "horn",
                  name: "Horn",
                  url: "/api/2014/proficiencies/horn",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "pan-flute",
                  name: "Pan flute",
                  url: "/api/2014/proficiencies/pan-flute",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "shawm",
                  name: "Shawm",
                  url: "/api/2014/proficiencies/shawm",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "viol",
                  name: "Viol",
                  url: "/api/2014/proficiencies/viol",
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "longswords",
          name: "Longswords",
          url: "/api/2014/proficiencies/longswords",
        },
        {
          index: "rapiers",
          name: "Rapiers",
          url: "/api/2014/proficiencies/rapiers",
        },
        {
          index: "shortswords",
          name: "Shortswords",
          url: "/api/2014/proficiencies/shortswords",
        },
        {
          index: "hand-crossbows",
          name: "Hand crossbows",
          url: "/api/2014/proficiencies/hand-crossbows",
        },
        {
          index: "saving-throw-dex",
          name: "Saving Throw: DEX",
          url: "/api/2014/proficiencies/saving-throw-dex",
        },
        {
          index: "saving-throw-cha",
          name: "Saving Throw: CHA",
          url: "/api/2014/proficiencies/saving-throw-cha",
        },
      ],
      saving_throws: [
        {
          index: "dex",
          name: "DEX",
          url: "/api/2014/ability-scores/dex",
        },
        {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
      ],
      starting_equipment: [
        {
          equipment: {
            index: "leather-armor",
            name: "Leather Armor",
            url: "/api/2014/equipment/leather-armor",
          },
          quantity: 1,
        },
        {
          equipment: {
            index: "dagger",
            name: "Dagger",
            url: "/api/2014/equipment/dagger",
          },
          quantity: 1,
        },
      ],
      starting_equipment_options: [
        {
          desc: "(a) a rapier, (b) a longsword, or (c) any simple weapon",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "rapier",
                  name: "Rapier",
                  url: "/api/2014/equipment/rapier",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "longsword",
                  name: "Longsword",
                  url: "/api/2014/equipment/longsword",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "any simple weapon",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "simple-weapons",
                      name: "Simple Weapons",
                      url: "/api/2014/equipment-categories/simple-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a diplomat’s pack or (b) an entertainer’s pack",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "diplomats-pack",
                  name: "Diplomat's Pack",
                  url: "/api/2014/equipment/diplomats-pack",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "entertainers-pack",
                  name: "Entertainer's Pack",
                  url: "/api/2014/equipment/entertainers-pack",
                },
              },
            ],
          },
        },
        {
          desc: "(a) a lute or (b) any other musical instrument",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "lute",
                  name: "Lute",
                  url: "/api/2014/equipment/lute",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "any other musical instrument",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "musical-instruments",
                      name: "Musical Instruments",
                      url: "/api/2014/equipment-categories/musical-instruments",
                    },
                  },
                },
              },
            ],
          },
        },
      ],
      class_levels: "/api/2014/classes/bard/levels",
      multi_classing: {
        prerequisites: [
          {
            ability_score: {
              index: "cha",
              name: "CHA",
              url: "/api/2014/ability-scores/cha",
            },
            minimum_score: 13,
          },
        ],
        proficiencies: [
          {
            index: "light-armor",
            name: "Light Armor",
            url: "/api/2014/proficiencies/light-armor",
          },
        ],
        proficiency_choices: [
          {
            desc: "skill",
            choose: 1,
            type: "proficiencies",
            from: {
              option_set_type: "options_array",
              options: [
                {
                  option_type: "reference",
                  item: {
                    index: "skill-acrobatics",
                    name: "Skill: Acrobatics",
                    url: "/api/2014/proficiencies/skill-acrobatics",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-animal-handling",
                    name: "Skill: Animal Handling",
                    url: "/api/2014/proficiencies/skill-animal-handling",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-arcana",
                    name: "Skill: Arcana",
                    url: "/api/2014/proficiencies/skill-arcana",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-athletics",
                    name: "Skill: Athletics",
                    url: "/api/2014/proficiencies/skill-athletics",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-deception",
                    name: "Skill: Deception",
                    url: "/api/2014/proficiencies/skill-deception",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-history",
                    name: "Skill: History",
                    url: "/api/2014/proficiencies/skill-history",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-insight",
                    name: "Skill: Insight",
                    url: "/api/2014/proficiencies/skill-insight",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-intimidation",
                    name: "Skill: Intimidation",
                    url: "/api/2014/proficiencies/skill-intimidation",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-investigation",
                    name: "Skill: Investigation",
                    url: "/api/2014/proficiencies/skill-investigation",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-medicine",
                    name: "Skill: Medicine",
                    url: "/api/2014/proficiencies/skill-medicine",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-nature",
                    name: "Skill: Nature",
                    url: "/api/2014/proficiencies/skill-nature",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-perception",
                    name: "Skill: Perception",
                    url: "/api/2014/proficiencies/skill-perception",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-performance",
                    name: "Skill: Performance",
                    url: "/api/2014/proficiencies/skill-performance",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-persuasion",
                    name: "Skill: Persuasion",
                    url: "/api/2014/proficiencies/skill-persuasion",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-religion",
                    name: "Skill: Religion",
                    url: "/api/2014/proficiencies/skill-religion",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-sleight-of-hand",
                    name: "Skill: Sleight of Hand",
                    url: "/api/2014/proficiencies/skill-sleight-of-hand",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-stealth",
                    name: "Skill: Stealth",
                    url: "/api/2014/proficiencies/skill-stealth",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-survival",
                    name: "Skill: Survival",
                    url: "/api/2014/proficiencies/skill-survival",
                  },
                },
              ],
            },
          },
          {
            desc: "musical instrument",
            choose: 1,
            type: "proficiencies",
            from: {
              option_set_type: "options_array",
              options: [
                {
                  option_type: "reference",
                  item: {
                    index: "bagpipes",
                    name: "Bagpipes",
                    url: "/api/2014/proficiencies/bagpipes",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "drum",
                    name: "Drum",
                    url: "/api/2014/proficiencies/drum",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "dulcimer",
                    name: "Dulcimer",
                    url: "/api/2014/proficiencies/dulcimer",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "flute",
                    name: "Flute",
                    url: "/api/2014/proficiencies/flute",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "lute",
                    name: "Lute",
                    url: "/api/2014/proficiencies/lute",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "lyre",
                    name: "Lyre",
                    url: "/api/2014/proficiencies/lyre",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "horn",
                    name: "Horn",
                    url: "/api/2014/proficiencies/horn",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "pan-flute",
                    name: "Pan flute",
                    url: "/api/2014/proficiencies/pan-flute",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "shawm",
                    name: "Shawm",
                    url: "/api/2014/proficiencies/shawm",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "viol",
                    name: "Viol",
                    url: "/api/2014/proficiencies/viol",
                  },
                },
              ],
            },
          },
        ],
      },
      subclasses: [
        {
          index: "lore",
          name: "Lore",
          url: "/api/2014/subclasses/lore",
        },
      ],
      spellcasting: {
        level: 1,
        spellcasting_ability: {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
        info: [
          {
            name: "Cantrips",
            desc: [
              "You know two cantrips of your choice from the bard spell list. You learn additional bard cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Bard table.",
            ],
          },
          {
            name: "Spell Slots",
            desc: [
              "The Bard table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
              "For example, if you know the 1st-level spell cure wounds and have a 1st-level and a 2nd-level spell slot available, you can cast cure wounds using either slot.",
            ],
          },
          {
            name: "Spells Known of 1st Level and Higher",
            desc: [
              "You know four 1st-level spells of your choice from the bard spell list.",
              "The Spells Known column of the Bard table shows when you learn more bard spells of your choice.",
              "Each of these spells must be of a level for which you have spell slots, as shown on the table. For instance, when you reach 3rd level in this class, you can learn one new spell of 1st or 2nd level.",
              "Additionally, when you gain a level in this class, you can choose one of the bard spells you know and replace it with another spell from the bard spell list, which also must be of a level for which you have spell slots.",
            ],
          },
          {
            name: "Spellcasting Ability",
            desc: [
              "Charisma is your spellcasting ability for your bard spells. Your magic comes from the heart and soul you pour into the performance of your music or oration. You use your Charisma whenever a spell refers to your spellcasting ability. In addition, you use your Charisma modifier when setting the saving throw DC for a bard spell you cast and when making an attack roll with one.",
              "Spell save DC = 8 + your proficiency bonus + your Charisma modifier.",
              "Spell attack modifier = your proficiency bonus + your Charisma modifier.",
            ],
          },
          {
            name: "Ritual Casting",
            desc: [
              "You can cast any bard spell you know as a ritual if that spell has the ritual tag.",
            ],
          },
          {
            name: "Spellcasting Focus",
            desc: [
              "You can use a musical instrument (see Equipment) as a spellcasting focus for your bard spells.",
            ],
          },
        ],
      },
      spells: "/api/2014/classes/bard/spells",
      url: "/api/2014/classes/bard",
    },
  },
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "cleric",
    sourceUrl: "/api/2014/classes/cleric",
    name: "Cleric",
    body: {
      hitDie: 8,
      unarmouredAc: ["DEX"],
      proficiencies: [
        "Light Armor",
        "Medium Armor",
        "Shields",
        "Simple Weapons",
        "Saving Throw: WIS",
        "Saving Throw: CHA",
        "Choose two from History, Insight, Medicine, Persuasion, and Religion",
      ],
      savingThrows: ["WIS", "CHA"],
      summary:
        "Starting equipment: 1 × Shield; (a) a mace or (b) a warhammer (if proficient); (a) scale mail, (b) leather armor, or (c) chain mail (if proficient); (a) a light crossbow and 20 bolts or (b) any simple weapon; (a) a priest’s pack or (b) an explorer’s pack; holy symbol",
    },
    raw: {
      index: "cleric",
      name: "Cleric",
      hit_die: 8,
      proficiency_choices: [
        {
          desc: "Choose two from History, Insight, Medicine, Persuasion, and Religion",
          choose: 2,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-history",
                  name: "Skill: History",
                  url: "/api/2014/proficiencies/skill-history",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-medicine",
                  name: "Skill: Medicine",
                  url: "/api/2014/proficiencies/skill-medicine",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-persuasion",
                  name: "Skill: Persuasion",
                  url: "/api/2014/proficiencies/skill-persuasion",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-religion",
                  name: "Skill: Religion",
                  url: "/api/2014/proficiencies/skill-religion",
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "medium-armor",
          name: "Medium Armor",
          url: "/api/2014/proficiencies/medium-armor",
        },
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "saving-throw-wis",
          name: "Saving Throw: WIS",
          url: "/api/2014/proficiencies/saving-throw-wis",
        },
        {
          index: "saving-throw-cha",
          name: "Saving Throw: CHA",
          url: "/api/2014/proficiencies/saving-throw-cha",
        },
      ],
      saving_throws: [
        {
          index: "wis",
          name: "WIS",
          url: "/api/2014/ability-scores/wis",
        },
        {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
      ],
      starting_equipment: [
        {
          equipment: {
            index: "shield",
            name: "Shield",
            url: "/api/2014/equipment/shield",
          },
          quantity: 1,
        },
      ],
      starting_equipment_options: [
        {
          desc: "(a) a mace or (b) a warhammer (if proficient)",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "mace",
                  name: "Mace",
                  url: "/api/2014/equipment/mace",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "warhammer",
                  name: "Warhammer",
                  url: "/api/2014/equipment/warhammer",
                },
                prerequisites: [
                  {
                    type: "proficiency",
                    proficiency: {
                      index: "warhammers",
                      name: "Warhammers",
                      url: "/api/2014/proficiencies/warhammers",
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          desc: "(a) scale mail, (b) leather armor, or (c) chain mail (if proficient)",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "scale-mail",
                  name: "Scale Mail",
                  url: "/api/2014/equipment/scale-mail",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "leather-armor",
                  name: "Leather Armor",
                  url: "/api/2014/equipment/leather-armor",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "chain-mail",
                  name: "Chain Mail",
                  url: "/api/2014/equipment/chain-mail",
                },
                prerequisites: [
                  {
                    type: "proficiency",
                    proficiency: {
                      index: "chain-mail",
                      name: "Chain Mail",
                      url: "/api/2014/proficiencies/chain-mail",
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          desc: "(a) a light crossbow and 20 bolts or (b) any simple weapon",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "multiple",
                items: [
                  {
                    option_type: "counted_reference",
                    count: 1,
                    of: {
                      index: "crossbow-light",
                      name: "Crossbow, light",
                      url: "/api/2014/equipment/crossbow-light",
                    },
                  },
                  {
                    option_type: "counted_reference",
                    count: 20,
                    of: {
                      index: "crossbow-bolt",
                      name: "Crossbow bolt",
                      url: "/api/2014/equipment/crossbow-bolt",
                    },
                  },
                ],
              },
              {
                option_type: "choice",
                choice: {
                  desc: "any simple weapon",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "simple-weapons",
                      name: "Simple Weapons",
                      url: "/api/2014/equipment-categories/simple-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a priest’s pack or (b) an explorer’s pack",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "priests-pack",
                  name: "Priest's Pack",
                  url: "/api/2014/equipment/priests-pack",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "explorers-pack",
                  name: "Explorer's Pack",
                  url: "/api/2014/equipment/explorers-pack",
                },
              },
            ],
          },
        },
        {
          desc: "holy symbol",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "equipment_category",
            equipment_category: {
              index: "holy-symbols",
              name: "Holy Symbols",
              url: "/api/2014/equipment-categories/holy-symbols",
            },
          },
        },
      ],
      class_levels: "/api/2014/classes/cleric/levels",
      multi_classing: {
        prerequisites: [
          {
            ability_score: {
              index: "wis",
              name: "WIS",
              url: "/api/2014/ability-scores/wis",
            },
            minimum_score: 13,
          },
        ],
        proficiencies: [
          {
            index: "light-armor",
            name: "Light Armor",
            url: "/api/2014/proficiencies/light-armor",
          },
          {
            index: "medium-armor",
            name: "Medium Armor",
            url: "/api/2014/proficiencies/medium-armor",
          },
          {
            index: "shields",
            name: "Shields",
            url: "/api/2014/proficiencies/shields",
          },
        ],
      },
      subclasses: [
        {
          index: "life",
          name: "Life",
          url: "/api/2014/subclasses/life",
        },
      ],
      spellcasting: {
        level: 1,
        spellcasting_ability: {
          index: "wis",
          name: "WIS",
          url: "/api/2014/ability-scores/wis",
        },
        info: [
          {
            name: "Cantrips",
            desc: [
              "At 1st level, you know three cantrips of your choice from the cleric spell list. You learn additional cleric cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Cleric table.",
            ],
          },
          {
            name: "Preparing and Casting Spells",
            desc: [
              "The Cleric table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
              "You prepare the list of cleric spells that are available for you to cast, choosing from the cleric spell list. When you do so, choose a number of cleric spells equal to your Wisdom modifier + your cleric level (minimum of one spell). The spells must be of a level for which you have spell slots.",
              "For example, if you are a 3rd-level cleric, you have four 1st-level and two 2nd-level spell slots. With a Wisdom of 16, your list of prepared spells can include six spells of 1st or 2nd level, in any combination. If you prepare the 1st-level spell cure wounds, you can cast it using a 1st-level or 2nd-level slot. Casting the spell doesn't remove it from your list of prepared spells.",
              "You can change your list of prepared spells when you finish a long rest. Preparing a new list of cleric spells requires time spent in prayer and meditation: at least 1 minute per spell level for each spell on your list.",
            ],
          },
          {
            name: "Spellcasting Ability",
            desc: [
              "Wisdom is your spellcasting ability for your cleric spells. The power of your spells comes from your devotion to your deity. You use your Wisdom whenever a cleric spell refers to your spellcasting ability. In addition, you use your Wisdom modifier when setting the saving throw DC for a cleric spell you cast and when making an attack roll with one.",
              "Spell save DC = 8 + your proficiency bonus + your Wisdom modifier",
              "Spell attack modifier = your proficiency bonus + your Wisdom modifier",
            ],
          },
          {
            name: "Ritual Casting",
            desc: [
              "You can cast a cleric spell as a ritual if that spell has the ritual tag and you have the spell prepared.",
            ],
          },
          {
            name: "Spellcasting Focus",
            desc: [
              "You can use a holy symbol (see Equipment) as a spellcasting focus for your cleric spells.",
            ],
          },
        ],
      },
      spells: "/api/2014/classes/cleric/spells",
      url: "/api/2014/classes/cleric",
    },
  },
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "druid",
    sourceUrl: "/api/2014/classes/druid",
    name: "Druid",
    body: {
      hitDie: 8,
      unarmouredAc: ["DEX"],
      proficiencies: [
        "Light Armor",
        "Medium Armor",
        "Shields",
        "Clubs",
        "Daggers",
        "Javelins",
        "Maces",
        "Quarterstaffs",
        "Sickles",
        "Spears",
        "Darts",
        "Slings",
        "Scimitars",
        "Herbalism Kit",
        "Saving Throw: INT",
        "Saving Throw: WIS",
        "Choose two from Arcana, Animal Handling, Insight, Medicine, Nature, Perception, Religion, and Survival",
      ],
      savingThrows: ["INT", "WIS"],
      summary:
        "Starting equipment: 1 × Leather Armor; 1 × Explorer's Pack; (a) a wooden shield or (b) any simple weapon; (a) a scimitar or (b) any simple melee weapon; druidic focus",
    },
    raw: {
      index: "druid",
      name: "Druid",
      hit_die: 8,
      proficiency_choices: [
        {
          desc: "Choose two from Arcana, Animal Handling, Insight, Medicine, Nature, Perception, Religion, and Survival",
          choose: 2,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-arcana",
                  name: "Skill: Arcana",
                  url: "/api/2014/proficiencies/skill-arcana",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-animal-handling",
                  name: "Skill: Animal Handling",
                  url: "/api/2014/proficiencies/skill-animal-handling",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-medicine",
                  name: "Skill: Medicine",
                  url: "/api/2014/proficiencies/skill-medicine",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-nature",
                  name: "Skill: Nature",
                  url: "/api/2014/proficiencies/skill-nature",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-perception",
                  name: "Skill: Perception",
                  url: "/api/2014/proficiencies/skill-perception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-religion",
                  name: "Skill: Religion",
                  url: "/api/2014/proficiencies/skill-religion",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-survival",
                  name: "Skill: Survival",
                  url: "/api/2014/proficiencies/skill-survival",
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "medium-armor",
          name: "Medium Armor",
          url: "/api/2014/proficiencies/medium-armor",
        },
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
        {
          index: "clubs",
          name: "Clubs",
          url: "/api/2014/proficiencies/clubs",
        },
        {
          index: "daggers",
          name: "Daggers",
          url: "/api/2014/proficiencies/daggers",
        },
        {
          index: "javelins",
          name: "Javelins",
          url: "/api/2014/proficiencies/javelins",
        },
        {
          index: "maces",
          name: "Maces",
          url: "/api/2014/proficiencies/maces",
        },
        {
          index: "quarterstaffs",
          name: "Quarterstaffs",
          url: "/api/2014/proficiencies/quarterstaffs",
        },
        {
          index: "sickles",
          name: "Sickles",
          url: "/api/2014/proficiencies/sickles",
        },
        {
          index: "spears",
          name: "Spears",
          url: "/api/2014/proficiencies/spears",
        },
        {
          index: "darts",
          name: "Darts",
          url: "/api/2014/proficiencies/darts",
        },
        {
          index: "slings",
          name: "Slings",
          url: "/api/2014/proficiencies/slings",
        },
        {
          index: "scimitars",
          name: "Scimitars",
          url: "/api/2014/proficiencies/scimitars",
        },
        {
          index: "herbalism-kit",
          name: "Herbalism Kit",
          url: "/api/2014/proficiencies/herbalism-kit",
        },
        {
          index: "saving-throw-int",
          name: "Saving Throw: INT",
          url: "/api/2014/proficiencies/saving-throw-int",
        },
        {
          index: "saving-throw-wis",
          name: "Saving Throw: WIS",
          url: "/api/2014/proficiencies/saving-throw-wis",
        },
      ],
      saving_throws: [
        {
          index: "int",
          name: "INT",
          url: "/api/2014/ability-scores/int",
        },
        {
          index: "wis",
          name: "WIS",
          url: "/api/2014/ability-scores/wis",
        },
      ],
      starting_equipment: [
        {
          equipment: {
            index: "leather-armor",
            name: "Leather Armor",
            url: "/api/2014/equipment/leather-armor",
          },
          quantity: 1,
        },
        {
          equipment: {
            index: "explorers-pack",
            name: "Explorer's Pack",
            url: "/api/2014/equipment/explorers-pack",
          },
          quantity: 1,
        },
      ],
      starting_equipment_options: [
        {
          desc: "(a) a wooden shield or (b) any simple weapon",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "shield",
                  name: "Shield",
                  url: "/api/2014/equipment/shield",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "any simple weapon",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "simple-weapons",
                      name: "Simple Weapons",
                      url: "/api/2014/equipment-categories/simple-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a scimitar or (b) any simple melee weapon",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "scimitar",
                  name: "Scimitar",
                  url: "/api/2014/equipment/scimitar",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "any simple melee weapon",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "simple-melee-weapons",
                      name: "Simple Melee Weapons",
                      url: "/api/2014/equipment-categories/simple-melee-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "druidic focus",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "equipment_category",
            equipment_category: {
              index: "druidic-foci",
              name: "Druidic Foci",
              url: "/api/2014/equipment-categories/druidic-foci",
            },
          },
        },
      ],
      class_levels: "/api/2014/classes/druid/levels",
      multi_classing: {
        prerequisites: [
          {
            ability_score: {
              index: "wis",
              name: "WIS",
              url: "/api/2014/ability-scores/wis",
            },
            minimum_score: 13,
          },
        ],
        proficiencies: [
          {
            index: "light-armor",
            name: "Light Armor",
            url: "/api/2014/proficiencies/light-armor",
          },
          {
            index: "medium-armor",
            name: "Medium Armor",
            url: "/api/2014/proficiencies/medium-armor",
          },
          {
            index: "shields",
            name: "Shields",
            url: "/api/2014/proficiencies/shields",
          },
        ],
      },
      subclasses: [
        {
          index: "land",
          name: "Land",
          url: "/api/2014/subclasses/land",
        },
      ],
      spellcasting: {
        level: 1,
        spellcasting_ability: {
          index: "wis",
          name: "WIS",
          url: "/api/2014/ability-scores/wis",
        },
        info: [
          {
            name: "Cantrips",
            desc: [
              "At 1st level, you know two cantrips of your choice from the druid spell list. You learn additional druid cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Druid table.",
            ],
          },
          {
            name: "Preparing and Casting Spells",
            desc: [
              "The Druid table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these druid spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
              "You prepare the list of druid spells that are available for you to cast, choosing from the druid spell list. When you do so, choose a number of druid spells equal to your Wisdom modifier + your druid level (minimum of one spell). The spells must be of a level for which you have spell slots.",
              "For example, if you are a 3rd-level druid, you have four 1st-level and two 2nd-level spell slots. With a Wisdom of 16, your list of prepared spells can include six spells of 1st or 2nd level, in any combination. If you prepare the 1st-level spell cure wounds, you can cast it using a 1st-level or 2nd-level slot. Casting the spell doesn't remove it from your list of prepared spells.",
              "You can also change your list of prepared spells when you finish a long rest. Preparing a new list of druid spells requires time spent in prayer and meditation: at least 1 minute per spell level for each spell on your list.",
            ],
          },
          {
            name: "Spellcasting Ability",
            desc: [
              "Wisdom is your spellcasting ability for your druid spells, since your magic draws upon your devotion and attunement to nature. You use your Wisdom whenever a spell refers to your spellcasting ability. In addition, you use your Wisdom modifier when setting the saving throw DC for a druid spell you cast and when making an attack roll with one.",
              "Spell save DC = 8 + your proficiency bonus + your Wisdom modifier.",
              "Spell attack modifier = your proficiency bonus + your Wisdom modifier.",
            ],
          },
          {
            name: "Ritual Casting",
            desc: [
              "You can cast a druid spell as a ritual if that spell has the ritual tag and you have the spell prepared.",
            ],
          },
          {
            name: "Spellcasting Focus",
            desc: [
              'You can use a druidic focus (see chapter 5, "Equipment") as a spellcasting focus for your druid spells.',
            ],
          },
        ],
      },
      spells: "/api/2014/classes/druid/spells",
      url: "/api/2014/classes/druid",
    },
  },
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "fighter",
    sourceUrl: "/api/2014/classes/fighter",
    name: "Fighter",
    body: {
      hitDie: 10,
      unarmouredAc: ["DEX"],
      proficiencies: [
        "All armor",
        "Shields",
        "Simple Weapons",
        "Martial Weapons",
        "Saving Throw: STR",
        "Saving Throw: CON",
        "Choose two skills from Acrobatics, Animal Handling, Athletics, History, Insight, Intimidation, Perception, and Survival",
      ],
      savingThrows: ["STR", "CON"],
      summary:
        "Starting equipment: (a) chain mail or (b) leather armor, longbow, and 20 arrows; (a) a martial weapon and a shield or (b) two martial weapons; (a) a light crossbow and 20 bolts or (b) two handaxes; (a) a dungeoneer’s pack or (b) an explorer’s pack",
    },
    raw: {
      index: "fighter",
      name: "Fighter",
      hit_die: 10,
      proficiency_choices: [
        {
          desc: "Choose two skills from Acrobatics, Animal Handling, Athletics, History, Insight, Intimidation, Perception, and Survival",
          choose: 2,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-acrobatics",
                  name: "Skill: Acrobatics",
                  url: "/api/2014/proficiencies/skill-acrobatics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-animal-handling",
                  name: "Skill: Animal Handling",
                  url: "/api/2014/proficiencies/skill-animal-handling",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-athletics",
                  name: "Skill: Athletics",
                  url: "/api/2014/proficiencies/skill-athletics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-history",
                  name: "Skill: History",
                  url: "/api/2014/proficiencies/skill-history",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-intimidation",
                  name: "Skill: Intimidation",
                  url: "/api/2014/proficiencies/skill-intimidation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-perception",
                  name: "Skill: Perception",
                  url: "/api/2014/proficiencies/skill-perception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-survival",
                  name: "Skill: Survival",
                  url: "/api/2014/proficiencies/skill-survival",
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "all-armor",
          name: "All armor",
          url: "/api/2014/proficiencies/all-armor",
        },
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "martial-weapons",
          name: "Martial Weapons",
          url: "/api/2014/proficiencies/martial-weapons",
        },
        {
          index: "saving-throw-str",
          name: "Saving Throw: STR",
          url: "/api/2014/proficiencies/saving-throw-str",
        },
        {
          index: "saving-throw-con",
          name: "Saving Throw: CON",
          url: "/api/2014/proficiencies/saving-throw-con",
        },
      ],
      saving_throws: [
        {
          index: "str",
          name: "STR",
          url: "/api/2014/ability-scores/str",
        },
        {
          index: "con",
          name: "CON",
          url: "/api/2014/ability-scores/con",
        },
      ],
      starting_equipment: [],
      starting_equipment_options: [
        {
          desc: "(a) chain mail or (b) leather armor, longbow, and 20 arrows",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "chain-mail",
                  name: "Chain Mail",
                  url: "/api/2014/equipment/chain-mail",
                },
              },
              {
                option_type: "multiple",
                items: [
                  {
                    option_type: "counted_reference",
                    count: 1,
                    of: {
                      index: "leather-armor",
                      name: "Leather Armor",
                      url: "/api/2014/equipment/leather-armor",
                    },
                  },
                  {
                    option_type: "counted_reference",
                    count: 1,
                    of: {
                      index: "longbow",
                      name: "Longbow",
                      url: "/api/2014/equipment/longbow",
                    },
                  },
                  {
                    option_type: "counted_reference",
                    count: 20,
                    of: {
                      index: "arrow",
                      name: "Arrow",
                      url: "/api/2014/equipment/arrow",
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          desc: "(a) a martial weapon and a shield or (b) two martial weapons",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "multiple",
                items: [
                  {
                    option_type: "choice",
                    choice: {
                      desc: "a martial weapon",
                      choose: 1,
                      type: "equipment",
                      from: {
                        option_set_type: "equipment_category",
                        equipment_category: {
                          index: "martial-weapons",
                          name: "Martial Weapons",
                          url: "/api/2014/equipment-categories/martial-weapons",
                        },
                      },
                    },
                  },
                  {
                    option_type: "counted_reference",
                    count: 1,
                    of: {
                      index: "shield",
                      name: "Shield",
                      url: "/api/2014/equipment/shield",
                    },
                  },
                ],
              },
              {
                option_type: "choice",
                choice: {
                  desc: "two martial weapons",
                  choose: 2,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "martial-weapons",
                      name: "Martial Weapons",
                      url: "/api/2014/equipment-categories/martial-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a light crossbow and 20 bolts or (b) two handaxes",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "multiple",
                items: [
                  {
                    option_type: "counted_reference",
                    count: 1,
                    of: {
                      index: "crossbow-light",
                      name: "Crossbow, light",
                      url: "/api/2014/equipment/crossbow-light",
                    },
                  },
                  {
                    option_type: "counted_reference",
                    count: 20,
                    of: {
                      index: "crossbow-bolt",
                      name: "Crossbow bolt",
                      url: "/api/2014/equipment/crossbow-bolt",
                    },
                  },
                ],
              },
              {
                option_type: "counted_reference",
                count: 2,
                of: {
                  index: "handaxe",
                  name: "Handaxe",
                  url: "/api/2014/equipment/handaxe",
                },
              },
            ],
          },
        },
        {
          desc: "(a) a dungeoneer’s pack or (b) an explorer’s pack",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "dungeoneers-pack",
                  name: "Dungeoneer's Pack",
                  url: "/api/2014/equipment/dungeoneers-pack",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "explorers-pack",
                  name: "Explorer's Pack",
                  url: "/api/2014/equipment/explorers-pack",
                },
              },
            ],
          },
        },
      ],
      class_levels: "/api/2014/classes/fighter/levels",
      multi_classing: {
        prerequisite_options: {
          type: "ability-scores",
          choose: 1,
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "score_prerequisite",
                ability_score: {
                  index: "str",
                  name: "STR",
                  url: "/api/2014/ability-scores/str",
                },
                minimum_score: 13,
              },
              {
                option_type: "score_prerequisite",
                ability_score: {
                  index: "dex",
                  name: "DEX",
                  url: "/api/2014/ability-scores/dex",
                },
                minimum_score: 13,
              },
            ],
          },
        },
        proficiencies: [
          {
            index: "light-armor",
            name: "Light Armor",
            url: "/api/2014/proficiencies/light-armor",
          },
          {
            index: "medium-armor",
            name: "Medium Armor",
            url: "/api/2014/proficiencies/medium-armor",
          },
          {
            index: "shields",
            name: "Shields",
            url: "/api/2014/proficiencies/shields",
          },
          {
            index: "simple-weapons",
            name: "Simple Weapons",
            url: "/api/2014/proficiencies/simple-weapons",
          },
          {
            index: "martial-weapons",
            name: "Martial Weapons",
            url: "/api/2014/proficiencies/martial-weapons",
          },
        ],
      },
      subclasses: [
        {
          index: "champion",
          name: "Champion",
          url: "/api/2014/subclasses/champion",
        },
      ],
      url: "/api/2014/classes/fighter",
    },
  },
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "monk",
    sourceUrl: "/api/2014/classes/monk",
    name: "Monk",
    body: {
      hitDie: 8,
      unarmouredAc: ["DEX", "WIS"],
      proficiencies: [
        "Simple Weapons",
        "Shortswords",
        "Saving Throw: DEX",
        "Saving Throw: STR",
        "Choose two from Acrobatics, Athletics, History, Insight, Religion, and Stealth",
        "Choose one type of artisan’s tools or one musical instrument",
      ],
      savingThrows: ["STR", "DEX"],
      summary:
        "Starting equipment: 10 × Dart; (a) a shortsword or (b) any simple weapon; (a) a dungeoneer’s pack or (b) an explorer’s pack",
    },
    raw: {
      index: "monk",
      name: "Monk",
      hit_die: 8,
      proficiency_choices: [
        {
          desc: "Choose two from Acrobatics, Athletics, History, Insight, Religion, and Stealth",
          choose: 2,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-acrobatics",
                  name: "Skill: Acrobatics",
                  url: "/api/2014/proficiencies/skill-acrobatics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-athletics",
                  name: "Skill: Athletics",
                  url: "/api/2014/proficiencies/skill-athletics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-history",
                  name: "Skill: History",
                  url: "/api/2014/proficiencies/skill-history",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-religion",
                  name: "Skill: Religion",
                  url: "/api/2014/proficiencies/skill-religion",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-stealth",
                  name: "Skill: Stealth",
                  url: "/api/2014/proficiencies/skill-stealth",
                },
              },
            ],
          },
        },
        {
          desc: "Choose one type of artisan’s tools or one musical instrument",
          type: "proficiencies",
          choose: 1,
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "choice",
                choice: {
                  desc: "artisan's tools",
                  type: "proficiencies",
                  choose: 1,
                  from: {
                    option_set_type: "options_array",
                    options: [
                      {
                        option_type: "reference",
                        item: {
                          index: "alchemists-supplies",
                          name: "Alchemist's Supplies",
                          url: "/api/2014/proficiencies/alchemists-supplies",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "brewers-supplies",
                          name: "Brewer's Supplies",
                          url: "/api/2014/proficiencies/brewers-supplies",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "calligraphers-supplies",
                          name: "Calligrapher's Supplies",
                          url: "/api/2014/proficiencies/calligraphers-supplies",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "carpenters-tools",
                          name: "Carpenter's Tools",
                          url: "/api/2014/proficiencies/carpenters-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "cartographers-tools",
                          name: "Cartographer's Tools",
                          url: "/api/2014/proficiencies/cartographers-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "cobblers-tools",
                          name: "Cobbler's Tools",
                          url: "/api/2014/proficiencies/cobblers-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "cooks-utensils",
                          name: "Cook's utensils",
                          url: "/api/2014/proficiencies/cooks-utensils",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "glassblowers-tools",
                          name: "Glassblower's Tools",
                          url: "/api/2014/proficiencies/glassblowers-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "jewelers-tools",
                          name: "Jeweler's Tools",
                          url: "/api/2014/proficiencies/jewelers-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "leatherworkers-tools",
                          name: "Leatherworker's Tools",
                          url: "/api/2014/proficiencies/leatherworkers-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "masons-tools",
                          name: "Mason's Tools",
                          url: "/api/2014/proficiencies/masons-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "painters-supplies",
                          name: "Painter's Supplies",
                          url: "/api/2014/proficiencies/painters-supplies",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "potters-tools",
                          name: "Potter's Tools",
                          url: "/api/2014/proficiencies/potters-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "smiths-tools",
                          name: "Smith's Tools",
                          url: "/api/2014/proficiencies/smiths-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "tinkers-tools",
                          name: "Tinker's Tools",
                          url: "/api/2014/proficiencies/tinkers-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "weavers-tools",
                          name: "Weaver's Tools",
                          url: "/api/2014/proficiencies/weavers-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "woodcarvers-tools",
                          name: "Woodcarver's Tools",
                          url: "/api/2014/proficiencies/woodcarvers-tools",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "disguise-kit",
                          name: "Disguise Kit",
                          url: "/api/2014/proficiencies/disguise-kit",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "forgery-kit",
                          name: "Forgery Kit",
                          url: "/api/2014/proficiencies/forgery-kit",
                        },
                      },
                    ],
                  },
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "musical instrument",
                  type: "proficiencies",
                  choose: 1,
                  from: {
                    option_set_type: "options_array",
                    options: [
                      {
                        option_type: "reference",
                        item: {
                          index: "bagpipes",
                          name: "Bagpipes",
                          url: "/api/2014/proficiencies/bagpipes",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "drum",
                          name: "Drum",
                          url: "/api/2014/proficiencies/drum",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "dulcimer",
                          name: "Dulcimer",
                          url: "/api/2014/proficiencies/dulcimer",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "flute",
                          name: "Flute",
                          url: "/api/2014/proficiencies/flute",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "lute",
                          name: "Lute",
                          url: "/api/2014/proficiencies/lute",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "lyre",
                          name: "Lyre",
                          url: "/api/2014/proficiencies/lyre",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "horn",
                          name: "Horn",
                          url: "/api/2014/proficiencies/horn",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "pan-flute",
                          name: "Pan flute",
                          url: "/api/2014/proficiencies/pan-flute",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "shawm",
                          name: "Shawm",
                          url: "/api/2014/proficiencies/shawm",
                        },
                      },
                      {
                        option_type: "reference",
                        item: {
                          index: "viol",
                          name: "Viol",
                          url: "/api/2014/proficiencies/viol",
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "shortswords",
          name: "Shortswords",
          url: "/api/2014/proficiencies/shortswords",
        },
        {
          index: "saving-throw-dex",
          name: "Saving Throw: DEX",
          url: "/api/2014/proficiencies/saving-throw-dex",
        },
        {
          index: "saving-throw-str",
          name: "Saving Throw: STR",
          url: "/api/2014/proficiencies/saving-throw-str",
        },
      ],
      saving_throws: [
        {
          index: "str",
          name: "STR",
          url: "/api/2014/ability-scores/str",
        },
        {
          index: "dex",
          name: "DEX",
          url: "/api/2014/ability-scores/dex",
        },
      ],
      starting_equipment: [
        {
          equipment: {
            index: "dart",
            name: "Dart",
            url: "/api/2014/equipment/dart",
          },
          quantity: 10,
        },
      ],
      starting_equipment_options: [
        {
          desc: "(a) a shortsword or (b) any simple weapon",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "shortsword",
                  name: "Shortsword",
                  url: "/api/2014/equipment/shortsword",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "any simple weapon",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "simple-weapons",
                      name: "Simple Weapons",
                      url: "/api/2014/equipment-categories/simple-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a dungeoneer’s pack or (b) an explorer’s pack",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "dungeoneers-pack",
                  name: "Dungeoneer's Pack",
                  url: "/api/2014/equipment/dungeoneers-pack",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "explorers-pack",
                  name: "Explorer's Pack",
                  url: "/api/2014/equipment/explorers-pack",
                },
              },
            ],
          },
        },
      ],
      class_levels: "/api/2014/classes/monk/levels",
      multi_classing: {
        prerequisites: [
          {
            ability_score: {
              index: "dex",
              name: "DEX",
              url: "/api/2014/ability-scores/dex",
            },
            minimum_score: 13,
          },
          {
            ability_score: {
              index: "wis",
              name: "WIS",
              url: "/api/2014/ability-scores/wis",
            },
            minimum_score: 13,
          },
        ],
        proficiencies: [
          {
            index: "simple-weapons",
            name: "Simple Weapons",
            url: "/api/2014/proficiencies/simple-weapons",
          },
          {
            index: "shortswords",
            name: "Shortswords",
            url: "/api/2014/proficiencies/shortswords",
          },
        ],
      },
      subclasses: [
        {
          index: "open-hand",
          name: "Open Hand",
          url: "/api/2014/subclasses/open-hand",
        },
      ],
      url: "/api/2014/classes/monk",
    },
  },
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "paladin",
    sourceUrl: "/api/2014/classes/paladin",
    name: "Paladin",
    body: {
      hitDie: 10,
      unarmouredAc: ["DEX"],
      proficiencies: [
        "All armor",
        "Shields",
        "Simple Weapons",
        "Martial Weapons",
        "Saving Throw: WIS",
        "Saving Throw: CHA",
        "Choose two from Athletics, Insight, Intimidation, Medicine, Persuasion, and Religion",
      ],
      savingThrows: ["WIS", "CHA"],
      summary:
        "Starting equipment: 1 × Chain Mail; (a) a martial weapon and a shield or (b) two martial weapons; (a) five javelins or (b) any simple melee weapon; (a) a priest’s pack or (b) an explorer’s pack; holy symbol",
    },
    raw: {
      index: "paladin",
      name: "Paladin",
      hit_die: 10,
      proficiency_choices: [
        {
          desc: "Choose two from Athletics, Insight, Intimidation, Medicine, Persuasion, and Religion",
          choose: 2,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-athletics",
                  name: "Skill: Athletics",
                  url: "/api/2014/proficiencies/skill-athletics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-intimidation",
                  name: "Skill: Intimidation",
                  url: "/api/2014/proficiencies/skill-intimidation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-medicine",
                  name: "Skill: Medicine",
                  url: "/api/2014/proficiencies/skill-medicine",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-persuasion",
                  name: "Skill: Persuasion",
                  url: "/api/2014/proficiencies/skill-persuasion",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-religion",
                  name: "Skill: Religion",
                  url: "/api/2014/proficiencies/skill-religion",
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "all-armor",
          name: "All armor",
          url: "/api/2014/proficiencies/all-armor",
        },
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "martial-weapons",
          name: "Martial Weapons",
          url: "/api/2014/proficiencies/martial-weapons",
        },
        {
          index: "saving-throw-wis",
          name: "Saving Throw: WIS",
          url: "/api/2014/proficiencies/saving-throw-wis",
        },
        {
          index: "saving-throw-cha",
          name: "Saving Throw: CHA",
          url: "/api/2014/proficiencies/saving-throw-cha",
        },
      ],
      saving_throws: [
        {
          index: "wis",
          name: "WIS",
          url: "/api/2014/ability-scores/wis",
        },
        {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
      ],
      starting_equipment: [
        {
          equipment: {
            index: "chain-mail",
            name: "Chain Mail",
            url: "/api/2014/equipment/chain-mail",
          },
          quantity: 1,
        },
      ],
      starting_equipment_options: [
        {
          desc: "(a) a martial weapon and a shield or (b) two martial weapons",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "multiple",
                items: [
                  {
                    option_type: "choice",
                    choice: {
                      desc: "a martial weapon",
                      choose: 1,
                      type: "equipment",
                      from: {
                        option_set_type: "equipment_category",
                        equipment_category: {
                          name: "Martial Weapons",
                          index: "martial-weapons",
                          url: "/api/2014/equipment-categories/martial-weapons",
                        },
                      },
                    },
                  },
                  {
                    option_type: "counted_reference",
                    count: 1,
                    of: {
                      index: "shield",
                      name: "Shield",
                      url: "/api/2014/equipment/shield",
                    },
                  },
                ],
              },
              {
                option_type: "choice",
                choice: {
                  desc: "two martial weapons",
                  choose: 2,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "martial-weapons",
                      name: "Martial Weapons",
                      url: "/api/2014/equipment-categories/martial-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) five javelins or (b) any simple melee weapon",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 5,
                of: {
                  index: "javelin",
                  name: "Javelin",
                  url: "/api/2014/equipment/javelin",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "any simple weapon",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "simple-weapons",
                      name: "Simple Weapons",
                      url: "/api/2014/equipment-categories/simple-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a priest’s pack or (b) an explorer’s pack",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "priests-pack",
                  name: "Priest's Pack",
                  url: "/api/2014/equipment/priests-pack",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "explorers-pack",
                  name: "Explorer's Pack",
                  url: "/api/2014/equipment/explorers-pack",
                },
              },
            ],
          },
        },
        {
          desc: "holy symbol",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "equipment_category",
            equipment_category: {
              index: "holy-symbols",
              name: "Holy Symbols",
              url: "/api/2014/equipment-categories/holy-symbols",
            },
          },
        },
      ],
      class_levels: "/api/2014/classes/paladin/levels",
      multi_classing: {
        prerequisites: [
          {
            ability_score: {
              index: "str",
              name: "STR",
              url: "/api/2014/ability-scores/str",
            },
            minimum_score: 13,
          },
          {
            ability_score: {
              index: "cha",
              name: "CHA",
              url: "/api/2014/ability-scores/cha",
            },
            minimum_score: 13,
          },
        ],
        proficiencies: [
          {
            index: "light-armor",
            name: "Light Armor",
            url: "/api/2014/proficiencies/light-armor",
          },
          {
            index: "medium-armor",
            name: "Medium Armor",
            url: "/api/2014/proficiencies/medium-armor",
          },
          {
            index: "shields",
            name: "Shields",
            url: "/api/2014/proficiencies/shields",
          },
          {
            index: "simple-weapons",
            name: "Simple Weapons",
            url: "/api/2014/proficiencies/simple-weapons",
          },
          {
            index: "martial-weapons",
            name: "Martial Weapons",
            url: "/api/2014/proficiencies/martial-weapons",
          },
        ],
      },
      subclasses: [
        {
          index: "devotion",
          name: "Devotion",
          url: "/api/2014/subclasses/devotion",
        },
      ],
      spellcasting: {
        level: 2,
        spellcasting_ability: {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
        info: [
          {
            name: "Preparing and Casting Spells",
            desc: [
              "The Paladin table shows how many spell slots you have to cast your spells. To cast one of your paladin spells of 1st level or higher, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
              "You prepare the list of paladin spells that are available for you to cast, choosing from the paladin spell list. When you do so, choose a number of paladin spells equal to your Charisma modifier + half your paladin level, rounded down (minimum of one spell). The spells must be of a level for which you have spell slots.",
              "For example, if you are a 5th-level paladin, you have four 1st-level and two 2nd-level spell slots. With a Charisma of 14, your list of prepared spells can include four spells of 1st or 2nd level, in any combination. If you prepare the 1st-level spell cure wounds, you can cast it using a 1st-level or a 2nd- level slot. Casting the spell doesn't remove it from your list of prepared spells.",
              "You can change your list of prepared spells when you finish a long rest. Preparing a new list of paladin spells requires time spent in prayer and meditation: at least 1 minute per spell level for each spell on your list.",
            ],
          },
          {
            name: "Spellcasting Ability",
            desc: [
              "Charisma is your spellcasting ability for your paladin spells, since their power derives from the strength of your convictions. You use your Charisma whenever a spell refers to your spellcasting ability. In addition, you use your Charisma modifier when setting the saving throw DC for a paladin spell you cast and when making an attack roll with one.",
              "Spell save DC = 8 + your proficiency bonus + your Charisma modifier.",
              "Spell attack modifier = your proficiency bonus + your Charisma modifier.",
            ],
          },
          {
            name: "Spellcasting Focus",
            desc: ["You can use a holy symbol as a spellcasting focus for your paladin spells."],
          },
        ],
      },
      spells: "/api/2014/classes/paladin/spells",
      url: "/api/2014/classes/paladin",
    },
  },
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "ranger",
    sourceUrl: "/api/2014/classes/ranger",
    name: "Ranger",
    body: {
      hitDie: 10,
      unarmouredAc: ["DEX"],
      proficiencies: [
        "Light Armor",
        "Medium Armor",
        "Shields",
        "Simple Weapons",
        "Martial Weapons",
        "Saving Throw: DEX",
        "Saving Throw: STR",
        "Choose three from Animal Handling, Athletics, Insight, Investigation, Nature, Perception, Stealth, and Survival",
      ],
      savingThrows: ["STR", "DEX"],
      summary:
        "Starting equipment: 1 × Longbow; 20 × Arrow; (a) scale mail or (b) leather armor; (a) two shortswords or (b) two simple melee weapons; (a) a dungeoneer’s pack or (b) an explorer’s pack",
    },
    raw: {
      index: "ranger",
      name: "Ranger",
      hit_die: 10,
      proficiency_choices: [
        {
          desc: "Choose three from Animal Handling, Athletics, Insight, Investigation, Nature, Perception, Stealth, and Survival",
          choose: 3,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-animal-handling",
                  name: "Skill: Animal Handling",
                  url: "/api/2014/proficiencies/skill-animal-handling",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-athletics",
                  name: "Skill: Athletics",
                  url: "/api/2014/proficiencies/skill-athletics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-investigation",
                  name: "Skill: Investigation",
                  url: "/api/2014/proficiencies/skill-investigation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-nature",
                  name: "Skill: Nature",
                  url: "/api/2014/proficiencies/skill-nature",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-perception",
                  name: "Skill: Perception",
                  url: "/api/2014/proficiencies/skill-perception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-stealth",
                  name: "Skill: Stealth",
                  url: "/api/2014/proficiencies/skill-stealth",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-survival",
                  name: "Skill: Survival",
                  url: "/api/2014/proficiencies/skill-survival",
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "medium-armor",
          name: "Medium Armor",
          url: "/api/2014/proficiencies/medium-armor",
        },
        {
          index: "shields",
          name: "Shields",
          url: "/api/2014/proficiencies/shields",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "martial-weapons",
          name: "Martial Weapons",
          url: "/api/2014/proficiencies/martial-weapons",
        },
        {
          index: "saving-throw-dex",
          name: "Saving Throw: DEX",
          url: "/api/2014/proficiencies/saving-throw-dex",
        },
        {
          index: "saving-throw-str",
          name: "Saving Throw: STR",
          url: "/api/2014/proficiencies/saving-throw-str",
        },
      ],
      saving_throws: [
        {
          index: "str",
          name: "STR",
          url: "/api/2014/ability-scores/str",
        },
        {
          index: "dex",
          name: "DEX",
          url: "/api/2014/ability-scores/dex",
        },
      ],
      starting_equipment: [
        {
          equipment: {
            index: "longbow",
            name: "Longbow",
            url: "/api/2014/equipment/longbow",
          },
          quantity: 1,
        },
        {
          equipment: {
            index: "arrow",
            name: "Arrow",
            url: "/api/2014/equipment/arrow",
          },
          quantity: 20,
        },
      ],
      starting_equipment_options: [
        {
          desc: "(a) scale mail or (b) leather armor",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "scale-mail",
                  name: "Scale Mail",
                  url: "/api/2014/equipment/scale-mail",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "leather-armor",
                  name: "Leather Armor",
                  url: "/api/2014/equipment/leather-armor",
                },
              },
            ],
          },
        },
        {
          desc: "(a) two shortswords or (b) two simple melee weapons",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 2,
                of: {
                  index: "shortsword",
                  name: "Shortsword",
                  url: "/api/2014/equipment/shortsword",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "two simple melee weapons",
                  choose: 2,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "simple-melee-weapons",
                      name: "Simple Melee Weapons",
                      url: "/api/2014/equipment-categories/simple-melee-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a dungeoneer’s pack or (b) an explorer’s pack",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "dungeoneers-pack",
                  name: "Dungeoneer's Pack",
                  url: "/api/2014/equipment/dungeoneers-pack",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "explorers-pack",
                  name: "Explorer's Pack",
                  url: "/api/2014/equipment/explorers-pack",
                },
              },
            ],
          },
        },
      ],
      class_levels: "/api/2014/classes/ranger/levels",
      multi_classing: {
        prerequisites: [
          {
            ability_score: {
              index: "dex",
              name: "DEX",
              url: "/api/2014/ability-scores/dex",
            },
            minimum_score: 13,
          },
          {
            ability_score: {
              index: "wis",
              name: "WIS",
              url: "/api/2014/ability-scores/wis",
            },
            minimum_score: 13,
          },
        ],
        proficiencies: [
          {
            index: "light-armor",
            name: "Light Armor",
            url: "/api/2014/proficiencies/light-armor",
          },
          {
            index: "medium-armor",
            name: "Medium Armor",
            url: "/api/2014/proficiencies/medium-armor",
          },
          {
            index: "shields",
            name: "Shields",
            url: "/api/2014/proficiencies/shields",
          },
          {
            index: "simple-weapons",
            name: "Simple Weapons",
            url: "/api/2014/proficiencies/simple-weapons",
          },
          {
            index: "martial-weapons",
            name: "Martial Weapons",
            url: "/api/2014/proficiencies/martial-weapons",
          },
        ],
        proficiency_choices: [
          {
            choose: 1,
            type: "proficiencies",
            from: {
              option_set_type: "options_array",
              options: [
                {
                  option_type: "reference",
                  item: {
                    index: "skill-animal-handling",
                    name: "Skill: Animal Handling",
                    url: "/api/2014/proficiencies/skill-animal-handling",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-athletics",
                    name: "Skill: Athletics",
                    url: "/api/2014/proficiencies/skill-athletics",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-insight",
                    name: "Skill: Insight",
                    url: "/api/2014/proficiencies/skill-insight",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-investigation",
                    name: "Skill: Investigation",
                    url: "/api/2014/proficiencies/skill-investigation",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-nature",
                    name: "Skill: Nature",
                    url: "/api/2014/proficiencies/skill-nature",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-perception",
                    name: "Skill: Perception",
                    url: "/api/2014/proficiencies/skill-perception",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-stealth",
                    name: "Skill: Stealth",
                    url: "/api/2014/proficiencies/skill-stealth",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-survival",
                    name: "Skill: Survival",
                    url: "/api/2014/proficiencies/skill-survival",
                  },
                },
              ],
            },
          },
        ],
      },
      subclasses: [
        {
          index: "hunter",
          name: "Hunter",
          url: "/api/2014/subclasses/hunter",
        },
      ],
      spellcasting: {
        level: 2,
        spellcasting_ability: {
          index: "wis",
          name: "WIS",
          url: "/api/2014/ability-scores/wis",
        },
        info: [
          {
            name: "Spell Slots",
            desc: [
              "The Ranger table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
              "For example, if you know the 1st-level spell animal friendship and have a 1st-level and a 2nd-level spell slot available, you can cast animal friendship using either slot.",
            ],
          },
          {
            name: "Spells Known of 1st Level and Higher",
            desc: [
              "You know two 1st-level spells of your choice from the ranger spell list.",
              "The Spells Known column of the Ranger table shows when you learn more ranger spells of your choice. Each of these spells must be of a level for which you have spell slots. For instance, when you reach 5th level in this class, you can learn one new spell of 1st or 2nd level.",
              "Additionally, when you gain a level in this class, you can choose one of the ranger spells you know and replace it with another spell from the ranger spell list, which also must be of a level for which you have spell slots.",
            ],
          },
          {
            name: "Spellcasting Ability",
            desc: [
              "Wisdom is your spellcasting ability for your ranger spells, since your magic draws on your attunement to nature. You use your Wisdom whenever a spell refers to your spellcasting ability. In addition, you use your Wisdom modifier when setting the saving throw DC for a ranger spell you cast and when making an attack roll with one.",
              "Spell save DC = 8 + your proficiency bonus + your Wisdom modifier.",
              "Spell attack modifier = your proficiency bonus + your Wisdom modifier.",
            ],
          },
        ],
      },
      spells: "/api/2014/classes/ranger/spells",
      url: "/api/2014/classes/ranger",
    },
  },
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "rogue",
    sourceUrl: "/api/2014/classes/rogue",
    name: "Rogue",
    body: {
      hitDie: 8,
      unarmouredAc: ["DEX"],
      proficiencies: [
        "Light Armor",
        "Simple Weapons",
        "Longswords",
        "Rapiers",
        "Shortswords",
        "Hand crossbows",
        "Thieves' Tools",
        "Saving Throw: DEX",
        "Saving Throw: INT",
        "Choose four from Acrobatics, Athletics, Deception, Insight, Intimidation, Investigation, Perception, Performance, Persuasion, Sleight of Hand, and Stealth",
      ],
      savingThrows: ["DEX", "INT"],
      summary:
        "Starting equipment: 1 × Leather Armor; 2 × Dagger; 1 × Thieves' Tools; (a) a rapier or (b) a shortsword; (a) a shortbow and quiver of 20 arrows or (b) a shortsword; (a) a burglar’s pack, (b) a dungeoneer’s pack, or (c) an explorer’s pack",
    },
    raw: {
      index: "rogue",
      name: "Rogue",
      hit_die: 8,
      proficiency_choices: [
        {
          desc: "Choose four from Acrobatics, Athletics, Deception, Insight, Intimidation, Investigation, Perception, Performance, Persuasion, Sleight of Hand, and Stealth",
          choose: 4,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-acrobatics",
                  name: "Skill: Acrobatics",
                  url: "/api/2014/proficiencies/skill-acrobatics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-athletics",
                  name: "Skill: Athletics",
                  url: "/api/2014/proficiencies/skill-athletics",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-deception",
                  name: "Skill: Deception",
                  url: "/api/2014/proficiencies/skill-deception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-intimidation",
                  name: "Skill: Intimidation",
                  url: "/api/2014/proficiencies/skill-intimidation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-investigation",
                  name: "Skill: Investigation",
                  url: "/api/2014/proficiencies/skill-investigation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-perception",
                  name: "Skill: Perception",
                  url: "/api/2014/proficiencies/skill-perception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-performance",
                  name: "Skill: Performance",
                  url: "/api/2014/proficiencies/skill-performance",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-persuasion",
                  name: "Skill: Persuasion",
                  url: "/api/2014/proficiencies/skill-persuasion",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-sleight-of-hand",
                  name: "Skill: Sleight of Hand",
                  url: "/api/2014/proficiencies/skill-sleight-of-hand",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-stealth",
                  name: "Skill: Stealth",
                  url: "/api/2014/proficiencies/skill-stealth",
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "longswords",
          name: "Longswords",
          url: "/api/2014/proficiencies/longswords",
        },
        {
          index: "rapiers",
          name: "Rapiers",
          url: "/api/2014/proficiencies/rapiers",
        },
        {
          index: "shortswords",
          name: "Shortswords",
          url: "/api/2014/proficiencies/shortswords",
        },
        {
          index: "hand-crossbows",
          name: "Hand crossbows",
          url: "/api/2014/proficiencies/hand-crossbows",
        },
        {
          index: "thieves-tools",
          name: "Thieves' Tools",
          url: "/api/2014/proficiencies/thieves-tools",
        },
        {
          index: "saving-throw-dex",
          name: "Saving Throw: DEX",
          url: "/api/2014/proficiencies/saving-throw-dex",
        },
        {
          index: "saving-throw-int",
          name: "Saving Throw: INT",
          url: "/api/2014/proficiencies/saving-throw-int",
        },
      ],
      saving_throws: [
        {
          index: "dex",
          name: "DEX",
          url: "/api/2014/ability-scores/dex",
        },
        {
          index: "int",
          name: "INT",
          url: "/api/2014/ability-scores/int",
        },
      ],
      starting_equipment: [
        {
          equipment: {
            index: "leather-armor",
            name: "Leather Armor",
            url: "/api/2014/equipment/leather-armor",
          },
          quantity: 1,
        },
        {
          equipment: {
            index: "dagger",
            name: "Dagger",
            url: "/api/2014/equipment/dagger",
          },
          quantity: 2,
        },
        {
          equipment: {
            index: "thieves-tools",
            name: "Thieves' Tools",
            url: "/api/2014/equipment/thieves-tools",
          },
          quantity: 1,
        },
      ],
      starting_equipment_options: [
        {
          desc: "(a) a rapier or (b) a shortsword",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "rapier",
                  name: "Rapier",
                  url: "/api/2014/equipment/rapier",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "shortsword",
                  name: "Shortsword",
                  url: "/api/2014/equipment/shortsword",
                },
              },
            ],
          },
        },
        {
          desc: "(a) a shortbow and quiver of 20 arrows or (b) a shortsword",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "multiple",
                items: [
                  {
                    option_type: "counted_reference",
                    count: 1,
                    of: {
                      index: "shortbow",
                      name: "Shortbow",
                      url: "/api/2014/equipment/shortbow",
                    },
                  },
                  {
                    option_type: "counted_reference",
                    count: 20,
                    of: {
                      index: "arrow",
                      name: "Arrow",
                      url: "/api/2014/equipment/arrow",
                    },
                  },
                ],
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "shortsword",
                  name: "Shortsword",
                  url: "/api/2014/equipment/shortsword",
                },
              },
            ],
          },
        },
        {
          desc: "(a) a burglar’s pack, (b) a dungeoneer’s pack, or (c) an explorer’s pack",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "burglars-pack",
                  name: "Burglar's Pack",
                  url: "/api/2014/equipment/burglars-pack",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "dungeoneers-pack",
                  name: "Dungeoneer's Pack",
                  url: "/api/2014/equipment/dungeoneers-pack",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "explorers-pack",
                  name: "Explorer's Pack",
                  url: "/api/2014/equipment/explorers-pack",
                },
              },
            ],
          },
        },
      ],
      class_levels: "/api/2014/classes/rogue/levels",
      multi_classing: {
        prerequisites: [
          {
            ability_score: {
              index: "dex",
              name: "DEX",
              url: "/api/2014/ability-scores/dex",
            },
            minimum_score: 13,
          },
        ],
        proficiencies: [
          {
            index: "light-armor",
            name: "Light Armor",
            url: "/api/2014/proficiencies/light-armor",
          },
          {
            index: "thieves-tools",
            name: "Thieves' Tools",
            url: "/api/2014/proficiencies/thieves-tools",
          },
        ],
        proficiency_choices: [
          {
            choose: 1,
            type: "proficiencies",
            from: {
              option_set_type: "options_array",
              options: [
                {
                  option_type: "reference",
                  item: {
                    index: "skill-acrobatics",
                    name: "Skill: Acrobatics",
                    url: "/api/2014/proficiencies/skill-acrobatics",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-athletics",
                    name: "Skill: Athletics",
                    url: "/api/2014/proficiencies/skill-athletics",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-deception",
                    name: "Skill: Deception",
                    url: "/api/2014/proficiencies/skill-deception",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-insight",
                    name: "Skill: Insight",
                    url: "/api/2014/proficiencies/skill-insight",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-intimidation",
                    name: "Skill: Intimidation",
                    url: "/api/2014/proficiencies/skill-intimidation",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-investigation",
                    name: "Skill: Investigation",
                    url: "/api/2014/proficiencies/skill-investigation",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-perception",
                    name: "Skill: Perception",
                    url: "/api/2014/proficiencies/skill-perception",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-performance",
                    name: "Skill: Performance",
                    url: "/api/2014/proficiencies/skill-performance",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-persuasion",
                    name: "Skill: Persuasion",
                    url: "/api/2014/proficiencies/skill-persuasion",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-sleight-of-hand",
                    name: "Skill: Sleight of Hand",
                    url: "/api/2014/proficiencies/skill-sleight-of-hand",
                  },
                },
                {
                  option_type: "reference",
                  item: {
                    index: "skill-stealth",
                    name: "Skill: Stealth",
                    url: "/api/2014/proficiencies/skill-stealth",
                  },
                },
              ],
            },
          },
        ],
      },
      subclasses: [
        {
          index: "thief",
          name: "Thief",
          url: "/api/2014/subclasses/thief",
        },
      ],
      url: "/api/2014/classes/rogue",
    },
  },
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "sorcerer",
    sourceUrl: "/api/2014/classes/sorcerer",
    name: "Sorcerer",
    body: {
      hitDie: 6,
      unarmouredAc: ["DEX"],
      proficiencies: [
        "Daggers",
        "Darts",
        "Slings",
        "Quarterstaffs",
        "Crossbows, light",
        "Saving Throw: CON",
        "Saving Throw: CHA",
        "Choose two from Arcana, Deception, Insight, Intimidation, Persuasion, and Religion",
      ],
      savingThrows: ["CON", "CHA"],
      summary:
        "Starting equipment: 2 × Dagger; (a) a light crossbow and 20 bolts or (b) any simple weapon; (a) a component pouch or (b) an arcane focus; (a) a dungeoneer’s pack or (b) an explorer’s pack",
    },
    raw: {
      index: "sorcerer",
      name: "Sorcerer",
      hit_die: 6,
      proficiency_choices: [
        {
          desc: "Choose two from Arcana, Deception, Insight, Intimidation, Persuasion, and Religion",
          choose: 2,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-arcana",
                  name: "Skill: Arcana",
                  url: "/api/2014/proficiencies/skill-arcana",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-deception",
                  name: "Skill: Deception",
                  url: "/api/2014/proficiencies/skill-deception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-intimidation",
                  name: "Skill: Intimidation",
                  url: "/api/2014/proficiencies/skill-intimidation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-persuasion",
                  name: "Skill: Persuasion",
                  url: "/api/2014/proficiencies/skill-persuasion",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-religion",
                  name: "Skill: Religion",
                  url: "/api/2014/proficiencies/skill-religion",
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "daggers",
          name: "Daggers",
          url: "/api/2014/proficiencies/daggers",
        },
        {
          index: "darts",
          name: "Darts",
          url: "/api/2014/proficiencies/darts",
        },
        {
          index: "slings",
          name: "Slings",
          url: "/api/2014/proficiencies/slings",
        },
        {
          index: "quarterstaffs",
          name: "Quarterstaffs",
          url: "/api/2014/proficiencies/quarterstaffs",
        },
        {
          index: "crossbows-light",
          name: "Crossbows, light",
          url: "/api/2014/proficiencies/crossbows-light",
        },
        {
          index: "saving-throw-con",
          name: "Saving Throw: CON",
          url: "/api/2014/proficiencies/saving-throw-con",
        },
        {
          index: "saving-throw-cha",
          name: "Saving Throw: CHA",
          url: "/api/2014/proficiencies/saving-throw-cha",
        },
      ],
      saving_throws: [
        {
          index: "con",
          name: "CON",
          url: "/api/2014/ability-scores/con",
        },
        {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
      ],
      starting_equipment: [
        {
          equipment: {
            index: "dagger",
            name: "Dagger",
            url: "/api/2014/equipment/dagger",
          },
          quantity: 2,
        },
      ],
      starting_equipment_options: [
        {
          desc: "(a) a light crossbow and 20 bolts or (b) any simple weapon",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "multiple",
                items: [
                  {
                    option_type: "counted_reference",
                    count: 1,
                    of: {
                      index: "crossbow-light",
                      name: "Crossbow, light",
                      url: "/api/2014/equipment/crossbow-light",
                    },
                  },
                  {
                    option_type: "counted_reference",
                    count: 20,
                    of: {
                      index: "crossbow-bolt",
                      name: "Crossbow bolt",
                      url: "/api/2014/equipment/crossbow-bolt",
                    },
                  },
                ],
              },
              {
                option_type: "choice",
                choice: {
                  desc: "any simple weapon",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "simple-weapons",
                      name: "Simple Weapons",
                      url: "/api/2014/equipment-categories/simple-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a component pouch or (b) an arcane focus",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "component-pouch",
                  name: "Component pouch",
                  url: "/api/2014/equipment/component-pouch",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "arcane focus",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "arcane-foci",
                      name: "Arcane Foci",
                      url: "/api/2014/equipment-categories/arcane-foci",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a dungeoneer’s pack or (b) an explorer’s pack",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "dungeoneers-pack",
                  name: "Dungeoneer's Pack",
                  url: "/api/2014/equipment/dungeoneers-pack",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "explorers-pack",
                  name: "Explorer's Pack",
                  url: "/api/2014/equipment/explorers-pack",
                },
              },
            ],
          },
        },
      ],
      class_levels: "/api/2014/classes/sorcerer/levels",
      multi_classing: {
        prerequisites: [
          {
            ability_score: {
              index: "cha",
              name: "CHA",
              url: "/api/2014/ability-scores/cha",
            },
            minimum_score: 13,
          },
        ],
        proficiencies: [],
      },
      subclasses: [
        {
          index: "draconic",
          name: "Draconic",
          url: "/api/2014/subclasses/draconic",
        },
      ],
      spellcasting: {
        level: 1,
        spellcasting_ability: {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
        info: [
          {
            name: "Cantrips",
            desc: [
              "At 1st level, you know four cantrips of your choice from the sorcerer spell list. You learn additional sorcerer cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Sorcerer table.",
            ],
          },
          {
            name: "Spell Slots",
            desc: [
              "The Sorcerer table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these sorcerer spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
              "For example, if you know the 1st-level spell burning hands and have a 1st-level and a 2nd-level spell slot available, you can cast burning hands using either slot.",
            ],
          },
          {
            name: "Spells Known of 1st Level and Higher",
            desc: [
              "You know two 1st-level spells of your choice from the sorcerer spell list.",
              "The Spells Known column of the Sorcerer table shows when you learn more sorcerer spells of your choice. Each of these spells must be of a level for which you have spell slots. For instance, when you reach 3rd level in this class, you can learn one new spell of 1st or 2nd level. ",
              "Additionally, when you gain a level in this class, you can choose one of the sorcerer spells you know and replace it with another spell from the sorcerer spell list, which also must be of a level for which you have spell slots.",
            ],
          },
          {
            name: "Spellcasting Ability",
            desc: [
              "Charisma is your spellcasting ability for your sorcerer spells, since the power of your magic relies on your ability to project your will into the world. You use your Charisma whenever a spell refers to your spellcasting ability. In addition, you use your Charisma modifier when setting the saving throw DC for a sorcerer spell you cast and when making an attack roll with one.",
              "Spell save DC = 8 + your proficiency bonus + your Charisma modifier.",
              "Spell attack modifier = your proficiency bonus + your Charisma modifier.",
            ],
          },
          {
            name: "Spellcasting Focus",
            desc: ["You can use an arcane focus as a spellcasting focus for your sorcerer spells."],
          },
        ],
      },
      spells: "/api/2014/classes/sorcerer/spells",
      url: "/api/2014/classes/sorcerer",
    },
  },
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "warlock",
    sourceUrl: "/api/2014/classes/warlock",
    name: "Warlock",
    body: {
      hitDie: 8,
      unarmouredAc: ["DEX"],
      proficiencies: [
        "Light Armor",
        "Simple Weapons",
        "Saving Throw: WIS",
        "Saving Throw: CHA",
        "Choose two skills from Arcana, Deception, History, Intimidation, Investigation, Nature, and Religion",
      ],
      savingThrows: ["WIS", "CHA"],
      summary:
        "Starting equipment: 2 × Dagger; 1 × Leather Armor; (a) a light crossbow and 20 bolts or (b) any simple weapon; (a) a component pouch or (b) an arcane focus; (a) a scholar’s pack or (b) a dungeoneer’s pack; any simple weapon",
    },
    raw: {
      index: "warlock",
      name: "Warlock",
      hit_die: 8,
      proficiency_choices: [
        {
          desc: "Choose two skills from Arcana, Deception, History, Intimidation, Investigation, Nature, and Religion",
          choose: 2,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-arcana",
                  name: "Skill: Arcana",
                  url: "/api/2014/proficiencies/skill-arcana",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-deception",
                  name: "Skill: Deception",
                  url: "/api/2014/proficiencies/skill-deception",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-history",
                  name: "Skill: History",
                  url: "/api/2014/proficiencies/skill-history",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-intimidation",
                  name: "Skill: Intimidation",
                  url: "/api/2014/proficiencies/skill-intimidation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-investigation",
                  name: "Skill: Investigation",
                  url: "/api/2014/proficiencies/skill-investigation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-nature",
                  name: "Skill: Nature",
                  url: "/api/2014/proficiencies/skill-nature",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-religion",
                  name: "Skill: Religion",
                  url: "/api/2014/proficiencies/skill-religion",
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "light-armor",
          name: "Light Armor",
          url: "/api/2014/proficiencies/light-armor",
        },
        {
          index: "simple-weapons",
          name: "Simple Weapons",
          url: "/api/2014/proficiencies/simple-weapons",
        },
        {
          index: "saving-throw-wis",
          name: "Saving Throw: WIS",
          url: "/api/2014/proficiencies/saving-throw-wis",
        },
        {
          index: "saving-throw-cha",
          name: "Saving Throw: CHA",
          url: "/api/2014/proficiencies/saving-throw-cha",
        },
      ],
      saving_throws: [
        {
          index: "wis",
          name: "WIS",
          url: "/api/2014/ability-scores/wis",
        },
        {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
      ],
      starting_equipment: [
        {
          equipment: {
            index: "dagger",
            name: "Dagger",
            url: "/api/2014/equipment/dagger",
          },
          quantity: 2,
        },
        {
          equipment: {
            index: "leather-armor",
            name: "Leather Armor",
            url: "/api/2014/equipment/leather-armor",
          },
          quantity: 1,
        },
      ],
      starting_equipment_options: [
        {
          desc: "(a) a light crossbow and 20 bolts or (b) any simple weapon",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "multiple",
                items: [
                  {
                    option_type: "counted_reference",
                    count: 1,
                    of: {
                      index: "crossbow-light",
                      name: "Crossbow, light",
                      url: "/api/2014/equipment/crossbow-light",
                    },
                  },
                  {
                    option_type: "counted_reference",
                    count: 20,
                    of: {
                      index: "crossbow-bolt",
                      name: "Crossbow bolt",
                      url: "/api/2014/equipment/crossbow-bolt",
                    },
                  },
                ],
              },
              {
                option_type: "choice",
                choice: {
                  desc: "any simple weapon",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "simple-weapons",
                      name: "Simple Weapons",
                      url: "/api/2014/equipment-categories/simple-weapons",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a component pouch or (b) an arcane focus",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "component-pouch",
                  name: "Component pouch",
                  url: "/api/2014/equipment/component-pouch",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "arcane focus",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "arcane-foci",
                      name: "Arcane Foci",
                      url: "/api/2014/equipment-categories/arcane-foci",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a scholar’s pack or (b) a dungeoneer’s pack",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "scholars-pack",
                  name: "Scholar's Pack",
                  url: "/api/2014/equipment/scholars-pack",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "dungeoneers-pack",
                  name: "Dungeoneer's Pack",
                  url: "/api/2014/equipment/dungeoneers-pack",
                },
              },
            ],
          },
        },
        {
          desc: "any simple weapon",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "equipment_category",
            equipment_category: {
              index: "simple-weapons",
              name: "Simple Weapons",
              url: "/api/2014/equipment-categories/simple-weapons",
            },
          },
        },
      ],
      class_levels: "/api/2014/classes/warlock/levels",
      multi_classing: {
        prerequisites: [
          {
            ability_score: {
              index: "cha",
              name: "CHA",
              url: "/api/2014/ability-scores/cha",
            },
            minimum_score: 13,
          },
        ],
        proficiencies: [
          {
            index: "light-armor",
            name: "Light Armor",
            url: "/api/2014/proficiencies/light-armor",
          },
          {
            index: "simple-weapons",
            name: "Simple Weapons",
            url: "/api/2014/proficiencies/simple-weapons",
          },
        ],
      },
      subclasses: [
        {
          index: "fiend",
          name: "Fiend",
          url: "/api/2014/subclasses/fiend",
        },
      ],
      spellcasting: {
        level: 1,
        spellcasting_ability: {
          index: "cha",
          name: "CHA",
          url: "/api/2014/ability-scores/cha",
        },
        info: [
          {
            name: "Cantrips",
            desc: [
              "You know two cantrips of your choice from the warlock spell list. You learn additional warlock cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Warlock table.",
            ],
          },
          {
            name: "Spell Slots",
            desc: [
              "The Warlock table shows how many spell slots you have. The table also shows what the level of those slots is; all of your spell slots are the same level. To cast one of your warlock spells of 1st level or higher, you must expend a spell slot. You regain all expended spell slots when you finish a short or long rest.",
              "For example, when you are 5th level, you have two 3rd-level spell slots. To cast the 1st-level spell thunderwave, you must spend one of those slots, and you cast it as a 3rd-level spell.",
            ],
          },
          {
            name: "Spells Known of 1st Level and Higher",
            desc: [
              "At 1st level, you know two 1st-level spells of your choice from the warlock spell list.",
              "The Spells Known column of the Warlock table shows when you learn more warlock spells of your choice of 1st level and higher. ",
              "A spell you choose must be of a level no higher than what's shown in the table's Slot Level column for your level. When you reach 6th level, for example, you learn a new warlock spell, which can be 1st, 2nd, or 3rd level.",
              "Additionally, when you gain a level in this class, you can choose one of the warlock spells you know and replace it with another spell from the warlock spell list, which also must be of a level for which you have spell slots.",
            ],
          },
          {
            name: "Spellcasting Ability",
            desc: [
              "Charisma is your spellcasting ability for your warlock spells, so you use your Charisma whenever a spell refers to your spellcasting ability. In addition, you use your Charisma modifier when setting the saving throw DC for a warlock spell you cast and when making an attack roll with one.",
              "Spell save DC = 8 + your proficiency bonus + your Charisma modifier.",
              "Spell attack modifier = your proficiency bonus + your Charisma modifier.",
            ],
          },
          {
            name: "Spellcasting Focus",
            desc: ["You can use an arcane focus as a spellcasting focus for your warlock spells."],
          },
        ],
      },
      spells: "/api/2014/classes/warlock/spells",
      url: "/api/2014/classes/warlock",
    },
  },
  {
    kind: "class",
    sourceFamily: "classes",
    sourceIndex: "wizard",
    sourceUrl: "/api/2014/classes/wizard",
    name: "Wizard",
    body: {
      hitDie: 6,
      unarmouredAc: ["DEX"],
      proficiencies: [
        "Daggers",
        "Darts",
        "Slings",
        "Quarterstaffs",
        "Crossbows, light",
        "Saving Throw: INT",
        "Saving Throw: WIS",
        "Choose two from Arcana, History, Insight, Investigation, Medicine, and Religion",
      ],
      savingThrows: ["INT", "WIS"],
      summary:
        "Starting equipment: 1 × Spellbook; (a) a quarterstaff or (b) a dagger; (a) a component pouch or (b) an arcane focus; (a) a scholar’s pack or (b) an explorer’s pack",
    },
    raw: {
      index: "wizard",
      name: "Wizard",
      hit_die: 6,
      proficiency_choices: [
        {
          desc: "Choose two from Arcana, History, Insight, Investigation, Medicine, and Religion",
          choose: 2,
          type: "proficiencies",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "reference",
                item: {
                  index: "skill-arcana",
                  name: "Skill: Arcana",
                  url: "/api/2014/proficiencies/skill-arcana",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-history",
                  name: "Skill: History",
                  url: "/api/2014/proficiencies/skill-history",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-insight",
                  name: "Skill: Insight",
                  url: "/api/2014/proficiencies/skill-insight",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-investigation",
                  name: "Skill: Investigation",
                  url: "/api/2014/proficiencies/skill-investigation",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-medicine",
                  name: "Skill: Medicine",
                  url: "/api/2014/proficiencies/skill-medicine",
                },
              },
              {
                option_type: "reference",
                item: {
                  index: "skill-religion",
                  name: "Skill: Religion",
                  url: "/api/2014/proficiencies/skill-religion",
                },
              },
            ],
          },
        },
      ],
      proficiencies: [
        {
          index: "daggers",
          name: "Daggers",
          url: "/api/2014/proficiencies/daggers",
        },
        {
          index: "darts",
          name: "Darts",
          url: "/api/2014/proficiencies/darts",
        },
        {
          index: "slings",
          name: "Slings",
          url: "/api/2014/proficiencies/slings",
        },
        {
          index: "quarterstaffs",
          name: "Quarterstaffs",
          url: "/api/2014/proficiencies/quarterstaffs",
        },
        {
          index: "crossbows-light",
          name: "Crossbows, light",
          url: "/api/2014/proficiencies/crossbows-light",
        },
        {
          index: "saving-throw-int",
          name: "Saving Throw: INT",
          url: "/api/2014/proficiencies/saving-throw-int",
        },
        {
          index: "saving-throw-wis",
          name: "Saving Throw: WIS",
          url: "/api/2014/proficiencies/saving-throw-wis",
        },
      ],
      saving_throws: [
        {
          index: "int",
          name: "INT",
          url: "/api/2014/ability-scores/int",
        },
        {
          index: "wis",
          name: "WIS",
          url: "/api/2014/ability-scores/wis",
        },
      ],
      starting_equipment: [
        {
          equipment: {
            index: "spellbook",
            name: "Spellbook",
            url: "/api/2014/equipment/spellbook",
          },
          quantity: 1,
        },
      ],
      starting_equipment_options: [
        {
          desc: "(a) a quarterstaff or (b) a dagger",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "quarterstaff",
                  name: "Quarterstaff",
                  url: "/api/2014/equipment/quarterstaff",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "dagger",
                  name: "Dagger",
                  url: "/api/2014/equipment/dagger",
                },
              },
            ],
          },
        },
        {
          desc: "(a) a component pouch or (b) an arcane focus",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "component-pouch",
                  name: "Component pouch",
                  url: "/api/2014/equipment/component-pouch",
                },
              },
              {
                option_type: "choice",
                choice: {
                  desc: "arcane focus",
                  choose: 1,
                  type: "equipment",
                  from: {
                    option_set_type: "equipment_category",
                    equipment_category: {
                      index: "arcane-foci",
                      name: "Arcane Foci",
                      url: "/api/2014/equipment-categories/arcane-foci",
                    },
                  },
                },
              },
            ],
          },
        },
        {
          desc: "(a) a scholar’s pack or (b) an explorer’s pack",
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "options_array",
            options: [
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "scholars-pack",
                  name: "Scholar's Pack",
                  url: "/api/2014/equipment/scholars-pack",
                },
              },
              {
                option_type: "counted_reference",
                count: 1,
                of: {
                  index: "explorers-pack",
                  name: "Explorer's Pack",
                  url: "/api/2014/equipment/explorers-pack",
                },
              },
            ],
          },
        },
      ],
      class_levels: "/api/2014/classes/wizard/levels",
      multi_classing: {
        prerequisites: [
          {
            ability_score: {
              index: "int",
              name: "INT",
              url: "/api/2014/ability-scores/int",
            },
            minimum_score: 13,
          },
        ],
        proficiencies: [],
      },
      subclasses: [
        {
          index: "evocation",
          name: "Evocation",
          url: "/api/2014/subclasses/evocation",
        },
      ],
      spellcasting: {
        level: 1,
        spellcasting_ability: {
          index: "int",
          name: "INT",
          url: "/api/2014/ability-scores/int",
        },
        info: [
          {
            name: "Cantrips",
            desc: [
              "At 1st level, you know three cantrips of your choice from the wizard spell list. You learn additional wizard cantrips of your choice at higher levels, as shown in the Cantrips Known column of the Wizard table.",
            ],
          },
          {
            name: "Spellbook",
            desc: [
              "At 1st level, you have a spellbook containing six 1st- level wizard spells of your choice. Your spellbook is the repository of the wizard spells you know, except your cantrips, which are fixed in your mind.",
            ],
          },
          {
            name: "Preparing and Casting Spells",
            desc: [
              "The Wizard table shows how many spell slots you have to cast your spells of 1st level and higher. To cast one of these spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.",
              "You prepare the list of wizard spells that are available for you to cast. To do so, choose a number of wizard spells from your spellbook equal to your Intelligence modifier + your wizard level (minimum of one spell). The spells must be of a level for which you have spell slots.",
              "For example, if you're a 3rd-level wizard, you have four 1st-level and two 2nd-level spell slots. With an Intelligence of 16, your list of prepared spells can include six spells of 1st or 2nd level, in any combination, chosen from your spellbook. If you prepare the 1st-level spell magic missile, you can cast it using a 1st-level or a 2nd-level slot. Casting the spell doesn't remove it from your list of prepared spells.",
              "You can change your list of prepared spells when you finish a long rest. Preparing a new list of wizard spells requires time spent studying your spellbook and memorizing the incantations and gestures you must make to cast the spell: at least 1 minute per spell level for each spell on your list.",
            ],
          },
          {
            name: "Spellcasting Ability",
            desc: [
              "Intelligence is your spellcasting ability for your wizard spells, since you learn your spells through dedicated study and memorization. You use your Intelligence whenever a spell refers to your spellcasting ability. In addition, you use your Intelligence modifier when setting the saving throw DC for a wizard spell you cast and when making an attack roll with one.",
              "Spell save DC = 8 + your proficiency bonus + your Intelligence modifier.",
              "Spell attack modifier = your proficiency bonus + your Intelligence modifier.",
            ],
          },
          {
            name: "Ritual Casting",
            desc: [
              "You can cast a wizard spell as a ritual if that spell has the ritual tag and you have the spell in your spellbook. You don't need to have the spell prepared.",
            ],
          },
          {
            name: "Spellcasting Focus",
            desc: ["You can use an arcane focus as a spellcasting focus for your wizard spells."],
          },
        ],
      },
      spells: "/api/2014/classes/wizard/spells",
      url: "/api/2014/classes/wizard",
    },
  },
  {
    kind: "race",
    sourceFamily: "races",
    sourceIndex: "dwarf",
    sourceUrl: "/api/2014/races/dwarf",
    name: "Dwarf",
    body: {
      speed: 25,
      size: "Medium",
      abilityBonuses: [
        {
          ability: "CON",
          amount: 2,
        },
      ],
      hpPerLevel: 0,
      traits: [
        "Darkvision",
        "Dwarven Resilience",
        "Stonecunning",
        "Dwarven Combat Training",
        "Tool Proficiency",
      ],
      subraces: [
        {
          name: "Hill Dwarf",
          abilityBonuses: [
            {
              ability: "WIS",
              amount: 1,
            },
          ],
          hpPerLevel: 1,
          traits: ["Dwarven Toughness"],
          summary:
            "As a hill dwarf, you have keen senses, deep intuition, and remarkable resilience.",
        },
      ],
      summary:
        "Dwarves stand between 4 and 5 feet tall and average about 150 pounds. Your size is Medium. You can speak, read, and write Common and Dwarvish. Dwarvish is full of hard consonants and guttural sounds, and those characteristics spill over into whatever other language a dwarf might speak.",
    },
    raw: {
      index: "dwarf",
      name: "Dwarf",
      speed: 25,
      ability_bonuses: [
        {
          ability_score: {
            index: "con",
            name: "CON",
            url: "/api/2014/ability-scores/con",
          },
          bonus: 2,
        },
      ],
      alignment:
        "Most dwarves are lawful, believing firmly in the benefits of a well-ordered society. They tend toward good as well, with a strong sense of fair play and a belief that everyone deserves to share in the benefits of a just order.",
      age: "Dwarves mature at the same rate as humans, but they're considered young until they reach the age of 50. On average, they live about 350 years.",
      size: "Medium",
      size_description:
        "Dwarves stand between 4 and 5 feet tall and average about 150 pounds. Your size is Medium.",
      languages: [
        {
          index: "common",
          name: "Common",
          url: "/api/2014/languages/common",
        },
        {
          index: "dwarvish",
          name: "Dwarvish",
          url: "/api/2014/languages/dwarvish",
        },
      ],
      language_desc:
        "You can speak, read, and write Common and Dwarvish. Dwarvish is full of hard consonants and guttural sounds, and those characteristics spill over into whatever other language a dwarf might speak.",
      traits: [
        {
          index: "darkvision",
          name: "Darkvision",
          url: "/api/2014/traits/darkvision",
        },
        {
          index: "dwarven-resilience",
          name: "Dwarven Resilience",
          url: "/api/2014/traits/dwarven-resilience",
        },
        {
          index: "stonecunning",
          name: "Stonecunning",
          url: "/api/2014/traits/stonecunning",
        },
        {
          index: "dwarven-combat-training",
          name: "Dwarven Combat Training",
          url: "/api/2014/traits/dwarven-combat-training",
        },
        {
          index: "tool-proficiency",
          name: "Tool Proficiency",
          url: "/api/2014/traits/tool-proficiency",
        },
      ],
      subraces: [
        {
          index: "hill-dwarf",
          name: "Hill Dwarf",
          url: "/api/2014/subraces/hill-dwarf",
        },
      ],
      url: "/api/2014/races/dwarf",
    },
  },
  {
    kind: "race",
    sourceFamily: "races",
    sourceIndex: "elf",
    sourceUrl: "/api/2014/races/elf",
    name: "Elf",
    body: {
      speed: 30,
      size: "Medium",
      abilityBonuses: [
        {
          ability: "DEX",
          amount: 2,
        },
      ],
      hpPerLevel: 0,
      traits: ["Darkvision", "Fey Ancestry", "Trance", "Keen Senses"],
      subraces: [
        {
          name: "High Elf",
          abilityBonuses: [
            {
              ability: "INT",
              amount: 1,
            },
          ],
          traits: ["Elf Weapon Training", "High Elf Cantrip", "Extra Language"],
          summary:
            "As a high elf, you have a keen mind and a mastery of at least the basics of magic. In many fantasy gaming worlds, there are two kinds of high elves. One type is haughty and reclusive, believing themselves to be superior to non-elves and even other elves. The other type is more common and more friendly, and often encountered among humans and other races.",
        },
      ],
      summary:
        "Elves range from under 5 to over 6 feet tall and have slender builds. Your size is Medium. You can speak, read, and write Common and Elvish. Elvish is fluid, with subtle intonations and intricate grammar. Elven literature is rich and varied, and their songs and poems are famous among other races. Many bards learn their language so they can add Elvish ballads to their repertoires.",
    },
    raw: {
      index: "elf",
      name: "Elf",
      speed: 30,
      ability_bonuses: [
        {
          ability_score: {
            index: "dex",
            name: "DEX",
            url: "/api/2014/ability-scores/dex",
          },
          bonus: 2,
        },
      ],
      age: "Although elves reach physical maturity at about the same age as humans, the elven understanding of adulthood goes beyond physical growth to encompass worldly experience. An elf typically claims adulthood and an adult name around the age of 100 and can live to be 750 years old.",
      alignment:
        "Elves love freedom, variety, and self-expression, so they lean strongly toward the gentler aspects of chaos. They value and protect others' freedom as well as their own, and they are more often good than not.",
      size: "Medium",
      size_description:
        "Elves range from under 5 to over 6 feet tall and have slender builds. Your size is Medium.",
      languages: [
        {
          index: "common",
          name: "Common",
          url: "/api/2014/languages/common",
        },
        {
          index: "elvish",
          name: "Elvish",
          url: "/api/2014/languages/elvish",
        },
      ],
      language_desc:
        "You can speak, read, and write Common and Elvish. Elvish is fluid, with subtle intonations and intricate grammar. Elven literature is rich and varied, and their songs and poems are famous among other races. Many bards learn their language so they can add Elvish ballads to their repertoires.",
      traits: [
        {
          index: "darkvision",
          name: "Darkvision",
          url: "/api/2014/traits/darkvision",
        },
        {
          index: "fey-ancestry",
          name: "Fey Ancestry",
          url: "/api/2014/traits/fey-ancestry",
        },
        {
          index: "trance",
          name: "Trance",
          url: "/api/2014/traits/trance",
        },
        {
          index: "keen-senses",
          name: "Keen Senses",
          url: "/api/2014/traits/keen-senses",
        },
      ],
      subraces: [
        {
          index: "high-elf",
          name: "High Elf",
          url: "/api/2014/subraces/high-elf",
        },
      ],
      url: "/api/2014/races/elf",
    },
  },
  {
    kind: "race",
    sourceFamily: "races",
    sourceIndex: "halfling",
    sourceUrl: "/api/2014/races/halfling",
    name: "Halfling",
    body: {
      speed: 25,
      size: "Small",
      abilityBonuses: [
        {
          ability: "DEX",
          amount: 2,
        },
      ],
      hpPerLevel: 0,
      traits: ["Brave", "Halfling Nimbleness", "Lucky"],
      subraces: [
        {
          name: "Lightfoot Halfling",
          abilityBonuses: [
            {
              ability: "CHA",
              amount: 1,
            },
          ],
          traits: ["Naturally Stealthy"],
          summary:
            "As a lightfoot halfling, you can easily hide from notice, even using other people as cover. You're inclined to be affable and get along well with others. Lightfoots are more prone to wanderlust than other halflings, and often dwell alongside other races or take up a nomadic life.",
        },
      ],
      summary:
        "Halflings average about 3 feet tall and weigh about 40 pounds. Your size is Small. You can speak, read, and write Common and Halfling. The Halfling language isn't secret, but halflings are loath to share it with others. They write very little, so they don't have a rich body of literature. Their oral tradition, however, is very strong. Almost all halflings speak Common to converse with the people in whose lands they dwell or through which they are traveling.",
    },
    raw: {
      index: "halfling",
      name: "Halfling",
      speed: 25,
      ability_bonuses: [
        {
          ability_score: {
            index: "dex",
            name: "DEX",
            url: "/api/2014/ability-scores/dex",
          },
          bonus: 2,
        },
      ],
      age: "A halfling reaches adulthood at the age of 20 and generally lives into the middle of his or her second century.",
      alignment:
        "Most halflings are lawful good. As a rule, they are good-hearted and kind, hate to see others in pain, and have no tolerance for oppression. They are also very orderly and traditional, leaning heavily on the support of their community and the comfort of their old ways.",
      size: "Small",
      size_description:
        "Halflings average about 3 feet tall and weigh about 40 pounds. Your size is Small.",
      languages: [
        {
          index: "common",
          name: "Common",
          url: "/api/2014/languages/common",
        },
        {
          index: "halfling",
          name: "Halfling",
          url: "/api/2014/languages/halfling",
        },
      ],
      language_desc:
        "You can speak, read, and write Common and Halfling. The Halfling language isn't secret, but halflings are loath to share it with others. They write very little, so they don't have a rich body of literature. Their oral tradition, however, is very strong. Almost all halflings speak Common to converse with the people in whose lands they dwell or through which they are traveling.",
      traits: [
        {
          index: "brave",
          name: "Brave",
          url: "/api/2014/traits/brave",
        },
        {
          index: "halfling-nimbleness",
          name: "Halfling Nimbleness",
          url: "/api/2014/traits/halfling-nimbleness",
        },
        {
          index: "lucky",
          name: "Lucky",
          url: "/api/2014/traits/lucky",
        },
      ],
      subraces: [
        {
          index: "lightfoot-halfling",
          name: "Lightfoot Halfling",
          url: "/api/2014/subraces/lightfoot-halfling",
        },
      ],
      url: "/api/2014/races/halfling",
    },
  },
  {
    kind: "race",
    sourceFamily: "races",
    sourceIndex: "human",
    sourceUrl: "/api/2014/races/human",
    name: "Human",
    body: {
      speed: 30,
      size: "Medium",
      abilityBonuses: [
        {
          ability: "STR",
          amount: 1,
        },
        {
          ability: "DEX",
          amount: 1,
        },
        {
          ability: "CON",
          amount: 1,
        },
        {
          ability: "INT",
          amount: 1,
        },
        {
          ability: "WIS",
          amount: 1,
        },
        {
          ability: "CHA",
          amount: 1,
        },
      ],
      hpPerLevel: 0,
      traits: [],
      subraces: [],
      summary:
        "Humans vary widely in height and build, from barely 5 feet to well over 6 feet tall. Regardless of your position in that range, your size is Medium. You can speak, read, and write Common and one extra language of your choice. Humans typically learn the languages of other peoples they deal with, including obscure dialects. They are fond of sprinkling their speech with words borrowed from other tongues: Orc curses, Elvish musical expressions, Dwarvish military phrases, and so on.",
    },
    raw: {
      index: "human",
      name: "Human",
      speed: 30,
      ability_bonuses: [
        {
          ability_score: {
            index: "str",
            name: "STR",
            url: "/api/2014/ability-scores/str",
          },
          bonus: 1,
        },
        {
          ability_score: {
            index: "dex",
            name: "DEX",
            url: "/api/2014/ability-scores/dex",
          },
          bonus: 1,
        },
        {
          ability_score: {
            index: "con",
            name: "CON",
            url: "/api/2014/ability-scores/con",
          },
          bonus: 1,
        },
        {
          ability_score: {
            index: "int",
            name: "INT",
            url: "/api/2014/ability-scores/int",
          },
          bonus: 1,
        },
        {
          ability_score: {
            index: "wis",
            name: "WIS",
            url: "/api/2014/ability-scores/wis",
          },
          bonus: 1,
        },
        {
          ability_score: {
            index: "cha",
            name: "CHA",
            url: "/api/2014/ability-scores/cha",
          },
          bonus: 1,
        },
      ],
      age: "Humans reach adulthood in their late teens and live less than a century.",
      alignment:
        "Humans tend toward no particular alignment. The best and the worst are found among them.",
      size: "Medium",
      size_description:
        "Humans vary widely in height and build, from barely 5 feet to well over 6 feet tall. Regardless of your position in that range, your size is Medium.",
      languages: [
        {
          index: "common",
          name: "Common",
          url: "/api/2014/languages/common",
        },
      ],
      language_options: {
        choose: 1,
        type: "languages",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "dwarvish",
                name: "Dwarvish",
                url: "/api/2014/languages/dwarvish",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "elvish",
                name: "Elvish",
                url: "/api/2014/languages/elvish",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "giant",
                name: "Giant",
                url: "/api/2014/languages/giant",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "gnomish",
                name: "Gnomish",
                url: "/api/2014/languages/gnomish",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "goblin",
                name: "Goblin",
                url: "/api/2014/languages/goblin",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "halfling",
                name: "Halfling",
                url: "/api/2014/languages/halfling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "orc",
                name: "Orc",
                url: "/api/2014/languages/orc",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "abyssal",
                name: "Abyssal",
                url: "/api/2014/languages/abyssal",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "celestial",
                name: "Celestial",
                url: "/api/2014/languages/celestial",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "draconic",
                name: "Draconic",
                url: "/api/2014/languages/draconic",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "deep-speech",
                name: "Deep Speech",
                url: "/api/2014/languages/deep-speech",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "infernal",
                name: "Infernal",
                url: "/api/2014/languages/infernal",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "primordial",
                name: "Primordial",
                url: "/api/2014/languages/primordial",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "sylvan",
                name: "Sylvan",
                url: "/api/2014/languages/sylvan",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "undercommon",
                name: "Undercommon",
                url: "/api/2014/languages/undercommon",
              },
            },
          ],
        },
      },
      language_desc:
        "You can speak, read, and write Common and one extra language of your choice. Humans typically learn the languages of other peoples they deal with, including obscure dialects. They are fond of sprinkling their speech with words borrowed from other tongues: Orc curses, Elvish musical expressions, Dwarvish military phrases, and so on.",
      traits: [],
      subraces: [],
      url: "/api/2014/races/human",
    },
  },
  {
    kind: "race",
    sourceFamily: "races",
    sourceIndex: "dragonborn",
    sourceUrl: "/api/2014/races/dragonborn",
    name: "Dragonborn",
    body: {
      speed: 30,
      size: "Medium",
      abilityBonuses: [
        {
          ability: "STR",
          amount: 2,
        },
        {
          ability: "CHA",
          amount: 1,
        },
      ],
      hpPerLevel: 0,
      traits: ["Draconic Ancestry", "Breath Weapon", "Damage Resistance"],
      subraces: [],
      summary:
        "Dragonborn are taller and heavier than humans, standing well over 6 feet tall and averaging almost 250 pounds. Your size is Medium. You can speak, read, and write Common and Draconic. Draconic is thought to be one of the oldest languages and is often used in the study of magic. The language sounds harsh to most other creatures and includes numerous hard consonants and sibilants.",
    },
    raw: {
      index: "dragonborn",
      name: "Dragonborn",
      speed: 30,
      ability_bonuses: [
        {
          ability_score: {
            index: "str",
            name: "STR",
            url: "/api/2014/ability-scores/str",
          },
          bonus: 2,
        },
        {
          ability_score: {
            index: "cha",
            name: "CHA",
            url: "/api/2014/ability-scores/cha",
          },
          bonus: 1,
        },
      ],
      alignment:
        "Dragonborn tend to extremes, making a conscious choice for one side or the other in the cosmic war between good and evil. Most dragonborn are good, but those who side with evil can be terrible villains.",
      age: "Young dragonborn grow quickly. They walk hours after hatching, attain the size and development of a 10-year-old human child by the age of 3, and reach adulthood by 15. They live to be around 80.",
      size: "Medium",
      size_description:
        "Dragonborn are taller and heavier than humans, standing well over 6 feet tall and averaging almost 250 pounds. Your size is Medium.",
      languages: [
        {
          index: "common",
          name: "Common",
          url: "/api/2014/languages/common",
        },
        {
          index: "draconic",
          name: "Draconic",
          url: "/api/2014/languages/draconic",
        },
      ],
      language_desc:
        "You can speak, read, and write Common and Draconic. Draconic is thought to be one of the oldest languages and is often used in the study of magic. The language sounds harsh to most other creatures and includes numerous hard consonants and sibilants.",
      traits: [
        {
          index: "draconic-ancestry",
          name: "Draconic Ancestry",
          url: "/api/2014/traits/draconic-ancestry",
        },
        {
          index: "breath-weapon",
          name: "Breath Weapon",
          url: "/api/2014/traits/breath-weapon",
        },
        {
          index: "damage-resistance",
          name: "Damage Resistance",
          url: "/api/2014/traits/damage-resistance",
        },
      ],
      subraces: [],
      url: "/api/2014/races/dragonborn",
    },
  },
  {
    kind: "race",
    sourceFamily: "races",
    sourceIndex: "gnome",
    sourceUrl: "/api/2014/races/gnome",
    name: "Gnome",
    body: {
      speed: 25,
      size: "Small",
      abilityBonuses: [
        {
          ability: "INT",
          amount: 2,
        },
      ],
      hpPerLevel: 0,
      traits: ["Darkvision", "Gnome Cunning"],
      subraces: [
        {
          name: "Rock Gnome",
          abilityBonuses: [
            {
              ability: "CON",
              amount: 1,
            },
          ],
          traits: ["Artificer's Lore", "Tinker"],
          summary:
            "As a rock gnome, you have a natural inventiveness and hardiness beyond that of other gnomes.",
        },
      ],
      summary:
        "Gnomes are between 3 and 4 feet tall and average about 40 pounds. Your size is Small. You can speak, read, and write Common and Gnomish. The Gnomish language, which uses the Dwarvish script, is renowned for its technical treatises and its catalogs of knowledge about the natural world.",
    },
    raw: {
      index: "gnome",
      name: "Gnome",
      speed: 25,
      ability_bonuses: [
        {
          ability_score: {
            index: "int",
            name: "INT",
            url: "/api/2014/ability-scores/int",
          },
          bonus: 2,
        },
      ],
      alignment:
        "Gnomes are most often good. Those who tend toward law are sages, engineers, researchers, scholars, investigators, or inventors. Those who tend toward chaos are minstrels, tricksters, wanderers, or fanciful jewelers. Gnomes are good-hearted, and even the tricksters among them are more playful than vicious.",
      age: "Gnomes mature at the same rate humans do, and most are expected to settle down into an adult life by around age 40. They can live 350 to almost 500 years.",
      size: "Small",
      size_description:
        "Gnomes are between 3 and 4 feet tall and average about 40 pounds. Your size is Small.",
      languages: [
        {
          index: "common",
          name: "Common",
          url: "/api/2014/languages/common",
        },
        {
          index: "gnomish",
          name: "Gnomish",
          url: "/api/2014/languages/gnomish",
        },
      ],
      language_desc:
        "You can speak, read, and write Common and Gnomish. The Gnomish language, which uses the Dwarvish script, is renowned for its technical treatises and its catalogs of knowledge about the natural world.",
      traits: [
        {
          index: "darkvision",
          name: "Darkvision",
          url: "/api/2014/traits/darkvision",
        },
        {
          index: "gnome-cunning",
          name: "Gnome Cunning",
          url: "/api/2014/traits/gnome-cunning",
        },
      ],
      subraces: [
        {
          index: "rock-gnome",
          name: "Rock Gnome",
          url: "/api/2014/subraces/rock-gnome",
        },
      ],
      url: "/api/2014/races/gnome",
    },
  },
  {
    kind: "race",
    sourceFamily: "races",
    sourceIndex: "half-elf",
    sourceUrl: "/api/2014/races/half-elf",
    name: "Half-Elf",
    body: {
      speed: 30,
      size: "Medium",
      abilityBonuses: [
        {
          ability: "CHA",
          amount: 2,
        },
      ],
      abilityBonusChoice: {
        choose: 2,
        bonuses: [
          {
            ability: "STR",
            amount: 1,
          },
          {
            ability: "DEX",
            amount: 1,
          },
          {
            ability: "CON",
            amount: 1,
          },
          {
            ability: "INT",
            amount: 1,
          },
          {
            ability: "WIS",
            amount: 1,
          },
        ],
      },
      hpPerLevel: 0,
      traits: ["Darkvision", "Fey Ancestry", "Skill Versatility"],
      subraces: [],
      summary:
        "Half-elves are about the same size as humans, ranging from 5 to 6 feet tall. Your size is Medium. You can speak, read, and write Common, Elvish, and one extra language of your choice.",
    },
    raw: {
      index: "half-elf",
      name: "Half-Elf",
      speed: 30,
      ability_bonuses: [
        {
          ability_score: {
            index: "cha",
            name: "CHA",
            url: "/api/2014/ability-scores/cha",
          },
          bonus: 2,
        },
      ],
      ability_bonus_options: {
        choose: 2,
        type: "ability_bonuses",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "ability_bonus",
              ability_score: {
                index: "str",
                name: "STR",
                url: "/api/2014/ability-scores/str",
              },
              bonus: 1,
            },
            {
              option_type: "ability_bonus",
              ability_score: {
                index: "dex",
                name: "DEX",
                url: "/api/2014/ability-scores/dex",
              },
              bonus: 1,
            },
            {
              option_type: "ability_bonus",
              ability_score: {
                index: "con",
                name: "CON",
                url: "/api/2014/ability-scores/con",
              },
              bonus: 1,
            },
            {
              option_type: "ability_bonus",
              ability_score: {
                index: "int",
                name: "INT",
                url: "/api/2014/ability-scores/int",
              },
              bonus: 1,
            },
            {
              option_type: "ability_bonus",
              ability_score: {
                index: "wis",
                name: "WIS",
                url: "/api/2014/ability-scores/wis",
              },
              bonus: 1,
            },
          ],
        },
      },
      alignment:
        "Half-elves share the chaotic bent of their elven heritage. They value both personal freedom and creative expression, demonstrating neither love of leaders nor desire for followers. They chafe at rules, resent others' demands, and sometimes prove unreliable, or at least unpredictable.",
      age: "Half-elves mature at the same rate humans do and reach adulthood around the age of 20. They live much longer than humans, however, often exceeding 180 years.",
      size: "Medium",
      size_description:
        "Half-elves are about the same size as humans, ranging from 5 to 6 feet tall. Your size is Medium.",
      languages: [
        {
          index: "common",
          name: "Common",
          url: "/api/2014/languages/common",
        },
        {
          index: "elvish",
          name: "Elvish",
          url: "/api/2014/languages/elvish",
        },
      ],
      language_options: {
        choose: 1,
        type: "languages",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "reference",
              item: {
                index: "dwarvish",
                name: "Dwarvish",
                url: "/api/2014/languages/dwarvish",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "giant",
                name: "Giant",
                url: "/api/2014/languages/giant",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "gnomish",
                name: "Gnomish",
                url: "/api/2014/languages/gnomish",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "goblin",
                name: "Goblin",
                url: "/api/2014/languages/goblin",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "halfling",
                name: "Halfling",
                url: "/api/2014/languages/halfling",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "orc",
                name: "Orc",
                url: "/api/2014/languages/orc",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "abyssal",
                name: "Abyssal",
                url: "/api/2014/languages/abyssal",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "celestial",
                name: "Celestial",
                url: "/api/2014/languages/celestial",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "draconic",
                name: "Draconic",
                url: "/api/2014/languages/draconic",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "deep-speech",
                name: "Deep Speech",
                url: "/api/2014/languages/deep-speech",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "infernal",
                name: "Infernal",
                url: "/api/2014/languages/infernal",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "primordial",
                name: "Primordial",
                url: "/api/2014/languages/primordial",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "sylvan",
                name: "Sylvan",
                url: "/api/2014/languages/sylvan",
              },
            },
            {
              option_type: "reference",
              item: {
                index: "undercommon",
                name: "Undercommon",
                url: "/api/2014/languages/undercommon",
              },
            },
          ],
        },
      },
      language_desc:
        "You can speak, read, and write Common, Elvish, and one extra language of your choice.",
      traits: [
        {
          index: "darkvision",
          name: "Darkvision",
          url: "/api/2014/traits/darkvision",
        },
        {
          index: "fey-ancestry",
          name: "Fey Ancestry",
          url: "/api/2014/traits/fey-ancestry",
        },
        {
          index: "skill-versatility",
          name: "Skill Versatility",
          url: "/api/2014/traits/skill-versatility",
        },
      ],
      subraces: [],
      url: "/api/2014/races/half-elf",
    },
  },
  {
    kind: "race",
    sourceFamily: "races",
    sourceIndex: "half-orc",
    sourceUrl: "/api/2014/races/half-orc",
    name: "Half-Orc",
    body: {
      speed: 30,
      size: "Medium",
      abilityBonuses: [
        {
          ability: "STR",
          amount: 2,
        },
        {
          ability: "CON",
          amount: 1,
        },
      ],
      hpPerLevel: 0,
      traits: ["Darkvision", "Savage Attacks", "Relentless Endurance", "Menacing"],
      subraces: [],
      summary:
        "Half-orcs are somewhat larger and bulkier than humans, and they range from 5 to well over 6 feet tall. Your size is Medium. You can speak, read, and write Common and Orc. Orc is a harsh, grating language with hard consonants. It has no script of its own but is written in the Dwarvish script.",
    },
    raw: {
      index: "half-orc",
      name: "Half-Orc",
      speed: 30,
      ability_bonuses: [
        {
          ability_score: {
            index: "str",
            name: "STR",
            url: "/api/2014/ability-scores/str",
          },
          bonus: 2,
        },
        {
          ability_score: {
            index: "con",
            name: "CON",
            url: "/api/2014/ability-scores/con",
          },
          bonus: 1,
        },
      ],
      alignment:
        "Half-orcs inherit a tendency toward chaos from their orc parents and are not strongly inclined toward good. Half-orcs raised among orcs and willing to live out their lives among them are usually evil.",
      age: "Half-orcs mature a little faster than humans, reaching adulthood around age 14. They age noticeably faster and rarely live longer than 75 years.",
      size: "Medium",
      size_description:
        "Half-orcs are somewhat larger and bulkier than humans, and they range from 5 to well over 6 feet tall. Your size is Medium.",
      languages: [
        {
          index: "common",
          name: "Common",
          url: "/api/2014/languages/common",
        },
        {
          index: "orc",
          name: "Orc",
          url: "/api/2014/languages/orc",
        },
      ],
      language_desc:
        "You can speak, read, and write Common and Orc. Orc is a harsh, grating language with hard consonants. It has no script of its own but is written in the Dwarvish script.",
      traits: [
        {
          index: "darkvision",
          name: "Darkvision",
          url: "/api/2014/traits/darkvision",
        },
        {
          index: "savage-attacks",
          name: "Savage Attacks",
          url: "/api/2014/traits/savage-attacks",
        },
        {
          index: "relentless-endurance",
          name: "Relentless Endurance",
          url: "/api/2014/traits/relentless-endurance",
        },
        {
          index: "menacing",
          name: "Menacing",
          url: "/api/2014/traits/menacing",
        },
      ],
      subraces: [],
      url: "/api/2014/races/half-orc",
    },
  },
  {
    kind: "race",
    sourceFamily: "races",
    sourceIndex: "tiefling",
    sourceUrl: "/api/2014/races/tiefling",
    name: "Tiefling",
    body: {
      speed: 30,
      size: "Medium",
      abilityBonuses: [
        {
          ability: "INT",
          amount: 1,
        },
        {
          ability: "CHA",
          amount: 2,
        },
      ],
      hpPerLevel: 0,
      traits: ["Darkvision", "Hellish Resistance", "Infernal Legacy"],
      subraces: [],
      summary:
        "Tieflings are about the same size and build as humans. Your size is Medium. You can speak, read, and write Common and Infernal.",
    },
    raw: {
      index: "tiefling",
      name: "Tiefling",
      speed: 30,
      ability_bonuses: [
        {
          ability_score: {
            index: "int",
            name: "INT",
            url: "/api/2014/ability-scores/int",
          },
          bonus: 1,
        },
        {
          ability_score: {
            index: "cha",
            name: "CHA",
            url: "/api/2014/ability-scores/cha",
          },
          bonus: 2,
        },
      ],
      alignment:
        "Tieflings might not have an innate tendency toward evil, but many of them end up there. Evil or not, an independent nature inclines many tieflings toward a chaotic alignment.",
      age: "Tieflings mature at the same rate as humans but live a few years longer.",
      size: "Medium",
      size_description:
        "Tieflings are about the same size and build as humans. Your size is Medium.",
      languages: [
        {
          index: "common",
          name: "Common",
          url: "/api/2014/languages/common",
        },
        {
          index: "infernal",
          name: "Infernal",
          url: "/api/2014/languages/infernal",
        },
      ],
      language_desc: "You can speak, read, and write Common and Infernal.",
      traits: [
        {
          index: "darkvision",
          name: "Darkvision",
          url: "/api/2014/traits/darkvision",
        },
        {
          index: "hellish-resistance",
          name: "Hellish Resistance",
          url: "/api/2014/traits/hellish-resistance",
        },
        {
          index: "infernal-legacy",
          name: "Infernal Legacy",
          url: "/api/2014/traits/infernal-legacy",
        },
      ],
      subraces: [],
      url: "/api/2014/races/tiefling",
    },
  },
  {
    kind: "background",
    sourceFamily: "backgrounds",
    sourceIndex: "acolyte",
    sourceUrl: "/api/2014/backgrounds/acolyte",
    name: "Acolyte",
    body: {
      proficiencies: ["Insight", "Religion"],
      languages: ["Choose 2 languages"],
      equipment: ["1 × Clothes, common", "1 × Pouch", "Choose 1 equipment"],
      gold: "15 gp",
      feature: {
        name: "Shelter of the Faithful",
        text: "As an acolyte, you command the respect of those who share your faith, and you can perform the religious ceremonies of your deity. You and your adventuring companions can expect to receive free healing and care at a temple, shrine, or other established presence of your faith, though you must provide any material components needed for spells. Those who share your religion will support you (but only you) at a modest lifestyle.\n\nYou might also have ties to a specific temple dedicated to your chosen deity or pantheon, and you have a residence there. This could be the temple where you used to serve, if you remain on good terms with it, or a temple where you have found a new home. While near your temple, you can call upon the priests for assistance, provided the assistance you ask for is not hazardous and you remain in good standing with your temple.",
      },
      choices: ["2 personality_traits", "1 ideals", "1 bonds", "1 flaws"],
    },
    raw: {
      index: "acolyte",
      name: "Acolyte",
      starting_proficiencies: [
        {
          index: "skill-insight",
          name: "Skill: Insight",
          url: "/api/2014/proficiencies/skill-insight",
        },
        {
          index: "skill-religion",
          name: "Skill: Religion",
          url: "/api/2014/proficiencies/skill-religion",
        },
      ],
      language_options: {
        choose: 2,
        type: "languages",
        from: {
          option_set_type: "resource_list",
          resource_list_url: "/api/2014/languages",
        },
      },
      starting_equipment: [
        {
          equipment: {
            index: "clothes-common",
            name: "Clothes, common",
            url: "/api/2014/equipment/clothes-common",
          },
          quantity: 1,
        },
        {
          equipment: {
            index: "pouch",
            name: "Pouch",
            url: "/api/2014/equipment/pouch",
          },
          quantity: 1,
        },
      ],
      starting_gold: {
        quantity: 15,
        unit: "gp",
      },
      starting_equipment_options: [
        {
          choose: 1,
          type: "equipment",
          from: {
            option_set_type: "equipment_category",
            equipment_category: {
              index: "holy-symbols",
              name: "Holy Symbols",
              url: "/api/2014/equipment-categories/holy-symbols",
            },
          },
        },
      ],
      feature: {
        name: "Shelter of the Faithful",
        desc: [
          "As an acolyte, you command the respect of those who share your faith, and you can perform the religious ceremonies of your deity. You and your adventuring companions can expect to receive free healing and care at a temple, shrine, or other established presence of your faith, though you must provide any material components needed for spells. Those who share your religion will support you (but only you) at a modest lifestyle.",
          "You might also have ties to a specific temple dedicated to your chosen deity or pantheon, and you have a residence there. This could be the temple where you used to serve, if you remain on good terms with it, or a temple where you have found a new home. While near your temple, you can call upon the priests for assistance, provided the assistance you ask for is not hazardous and you remain in good standing with your temple.",
        ],
      },
      personality_traits: {
        choose: 2,
        type: "personality_traits",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "string",
              string:
                "I idolize a particular hero of my faith, and constantly refer to that person's deeds and example.",
            },
            {
              option_type: "string",
              string:
                "I can find common ground between the fiercest enemies, empathizing with them and always working toward peace.",
            },
            {
              option_type: "string",
              string:
                "I see omens in every event and action. The gods try to speak to us, we just need to listen.",
            },
            {
              option_type: "string",
              string: "Nothing can shake my optimistic attitude.",
            },
            {
              option_type: "string",
              string: "I quote (or misquote) sacred texts and proverbs in almost every situation.",
            },
            {
              option_type: "string",
              string:
                "I am tolerant (or intolerant) of other faiths and respect (or condemn) the worship of other gods.",
            },
            {
              option_type: "string",
              string:
                "I've enjoyed fine food, drink, and high society among my temple's elite. Rough living grates on me.",
            },
            {
              option_type: "string",
              string:
                "I've spent so long in the temple that I have little practical experience dealing with people in the outside world.",
            },
          ],
        },
      },
      ideals: {
        choose: 1,
        type: "ideals",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "ideal",
              desc: "Tradition. The ancient traditions of worship and sacrifice must be preserved and upheld.",
              alignments: [
                {
                  index: "lawful-good",
                  name: "Lawful Good",
                  url: "/api/2014/alignments/lawful-good",
                },
                {
                  index: "lawful-neutral",
                  name: "Lawful Neutral",
                  url: "/api/2014/alignments/lawful-neutral",
                },
                {
                  index: "lawful-evil",
                  name: "Lawful Evil",
                  url: "/api/2014/alignments/lawful-evil",
                },
              ],
            },
            {
              option_type: "ideal",
              desc: "Charity. I always try to help those in need, no matter what the personal cost.",
              alignments: [
                {
                  index: "lawful-good",
                  name: "Lawful Good",
                  url: "/api/2014/alignments/lawful-good",
                },
                {
                  index: "neutral-good",
                  name: "Neutral Good",
                  url: "/api/2014/alignments/neutral-good",
                },
                {
                  index: "chaotic-good",
                  name: "Chaotic Good",
                  url: "/api/2014/alignments/chaotic-good",
                },
              ],
            },
            {
              option_type: "ideal",
              desc: "Change. We must help bring about the changes the gods are constantly working in the world.",
              alignments: [
                {
                  index: "chaotic-good",
                  name: "Chaotic Good",
                  url: "/api/2014/alignments/chaotic-good",
                },
                {
                  index: "chaotic-neutral",
                  name: "Chaotic Neutral",
                  url: "/api/2014/alignments/chaotic-neutral",
                },
                {
                  index: "chaotic-evil",
                  name: "Chaotic Evil",
                  url: "/api/2014/alignments/chaotic-evil",
                },
              ],
            },
            {
              option_type: "ideal",
              desc: "Power. I hope to one day rise to the top of my faith's religious hierarchy.",
              alignments: [
                {
                  index: "lawful-good",
                  name: "Lawful Good",
                  url: "/api/2014/alignments/lawful-good",
                },
                {
                  index: "lawful-neutral",
                  name: "Lawful Neutral",
                  url: "/api/2014/alignments/lawful-neutral",
                },
                {
                  index: "lawful-evil",
                  name: "Lawful Evil",
                  url: "/api/2014/alignments/lawful-evil",
                },
              ],
            },
            {
              option_type: "ideal",
              desc: "Faith. I trust that my deity will guide my actions. I have faith that if I work hard, things will go well.",
              alignments: [
                {
                  index: "lawful-good",
                  name: "Lawful Good",
                  url: "/api/2014/alignments/lawful-good",
                },
                {
                  index: "lawful-neutral",
                  name: "Lawful Neutral",
                  url: "/api/2014/alignments/lawful-neutral",
                },
                {
                  index: "lawful-evil",
                  name: "Lawful Evil",
                  url: "/api/2014/alignments/lawful-evil",
                },
              ],
            },
            {
              option_type: "ideal",
              desc: "Aspiration. I seek to prove myself worthy of my god's favor by matching my actions against his or her teachings.",
              alignments: [
                {
                  index: "lawful-good",
                  name: "Lawful Good",
                  url: "/api/2014/alignments/lawful-good",
                },
                {
                  index: "neutral-good",
                  name: "Neutral Good",
                  url: "/api/2014/alignments/neutral-good",
                },
                {
                  index: "chaotic-good",
                  name: "Chaotic Good",
                  url: "/api/2014/alignments/chaotic-good",
                },
                {
                  index: "lawful-neutral",
                  name: "Lawful Neutral",
                  url: "/api/2014/alignments/lawful-neutral",
                },
                {
                  index: "neutral",
                  name: "Neutral",
                  url: "/api/2014/alignments/neutral",
                },
                {
                  index: "chaotic-neutral",
                  name: "Chaotic Neutral",
                  url: "/api/2014/alignments/chaotic-neutral",
                },
                {
                  index: "lawful-evil",
                  name: "Lawful Evil",
                  url: "/api/2014/alignments/lawful-evil",
                },
                {
                  index: "neutral-evil",
                  name: "Neutral Evil",
                  url: "/api/2014/alignments/neutral-evil",
                },
                {
                  index: "chaotic-evil",
                  name: "Chaotic Evil",
                  url: "/api/2014/alignments/chaotic-evil",
                },
              ],
            },
          ],
        },
      },
      bonds: {
        choose: 1,
        type: "bonds",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "string",
              string: "I would die to recover an ancient relic of my faith that was lost long ago.",
            },
            {
              option_type: "string",
              string:
                "I will someday get revenge on the corrupt temple hierarchy who branded me a heretic.",
            },
            {
              option_type: "string",
              string: "I owe my life to the priest who took me in when my parents died.",
            },
            {
              option_type: "string",
              string: "Everything I do is for the common people.",
            },
            {
              option_type: "string",
              string: "I will do anything to protect the temple where I served.",
            },
            {
              option_type: "string",
              string:
                "I seek to preserve a sacred text that my enemies consider heretical and seek to destroy.",
            },
          ],
        },
      },
      flaws: {
        choose: 1,
        type: "flaws",
        from: {
          option_set_type: "options_array",
          options: [
            {
              option_type: "string",
              string: "I judge others harshly, and myself even more severely.",
            },
            {
              option_type: "string",
              string: "I put too much trust in those who wield power within my temple's hierarchy.",
            },
            {
              option_type: "string",
              string:
                "My piety sometimes leads me to blindly trust those that profess faith in my god.",
            },
            {
              option_type: "string",
              string: "I am inflexible in my thinking.",
            },
            {
              option_type: "string",
              string: "I am suspicious of strangers and expect the worst of them.",
            },
            {
              option_type: "string",
              string:
                "Once I pick a goal, I become obsessed with it to the detriment of everything else in my life.",
            },
          ],
        },
      },
      url: "/api/2014/backgrounds/acolyte",
    },
  },
];

const ref = (value: unknown): SourceReference | undefined => {
  if (value === null || typeof value !== "object") return undefined;
  const row = value as {
    readonly index?: unknown;
    readonly name?: unknown;
    readonly url?: unknown;
  };
  if (typeof row.index !== "string" || typeof row.name !== "string") return undefined;
  return {
    family: familyFromUrl(typeof row.url === "string" ? row.url : undefined),
    index: row.index,
    name: row.name,
    ...(typeof row.url === "string" ? { url: row.url } : {}),
    raw: value,
  };
};

const familyFromUrl = (url: string | undefined): string => {
  const match = url?.match(/^\/api\/2014\/([^/]+)\//);
  return match?.[1] ?? "unknown";
};

const walk = (value: unknown, into: Map<string, SourceReference>): void => {
  const found = ref(value);
  if (found !== undefined && found.family !== "unknown") {
    into.set(`${found.family}:${found.index}`, found);
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, into);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) walk(item, into);
  }
};

/** Referenced source entities needed to validate parentage and creation-facing grants. */
export const SOURCE_REFERENCES = (() => {
  const refs = new Map<string, SourceReference>();
  for (const option of SYSTEM_OPTIONS) walk(option.raw, refs);
  for (const subrace of SUBRACE_RAW) walk(subrace, refs);
  return [...refs.values()].sort((left, right) =>
    left.family === right.family
      ? left.index.localeCompare(right.index)
      : left.family.localeCompare(right.family),
  );
})();

export const SOURCE_SUBRACES = SUBRACE_RAW;
