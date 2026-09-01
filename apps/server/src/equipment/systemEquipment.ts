/**
 * GENERATED FROM 5e-bits/5e-database 2014 data.
 *
 * Source: https://github.com/5e-bits/5e-database/tree/5a7ee5a0489b26655d343e4a41e8f7942a887af2/src/2014/en
 * Files: 5e-SRD-Equipment.json, 5e-SRD-Equipment-Categories.json,
 * 5e-SRD-Weapon-Properties.json, 5e-SRD-Damage-Types.json.
 *
 * Rebuild recipe:
 *   python - <<'PY'
 *   # fetch those exact raw GitHub URLs at the commit above and write this file;
 *   # the runtime importer reads this checked-in snapshot and performs no network fetch.
 *   PY
 *
 * 5e-bits project data is MIT licensed; underlying D&D 5th Edition SRD 5.1
 * material is used under the Open Game License version 1.0a. See
 * THIRD_PARTY_NOTICES.md; equipment:import stores stable source keys, not per-row
 * source-document provenance.
 */

export const FIVE_E_BITS_2014_COMMIT = "5a7ee5a0489b26655d343e4a41e8f7942a887af2";
export const FIVE_E_BITS_2014_VERSION = "5e-database 5.10.0";

type SourceRow = Record<string, unknown>;

export const EQUIPMENT_RAW = JSON.parse(String.raw`[
  {
    "index": "club",
    "name": "Club",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Melee",
    "category_range": "Simple Melee",
    "cost": {
      "quantity": 1,
      "unit": "sp"
    },
    "damage": {
      "damage_dice": "1d4",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "light",
        "name": "Light"
      },
      {
        "index": "monk",
        "name": "Monk"
      }
    ]
  },
  {
    "index": "dagger",
    "name": "Dagger",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Melee",
    "category_range": "Simple Melee",
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d4",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 1,
    "properties": [
      {
        "index": "finesse",
        "name": "Finesse"
      },
      {
        "index": "light",
        "name": "Light"
      },
      {
        "index": "thrown",
        "name": "Thrown"
      },
      {
        "index": "monk",
        "name": "Monk"
      }
    ],
    "throw_range": {
      "normal": 20,
      "long": 60
    }
  },
  {
    "index": "greatclub",
    "name": "Greatclub",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Melee",
    "category_range": "Simple Melee",
    "cost": {
      "quantity": 2,
      "unit": "sp"
    },
    "damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 10,
    "properties": [
      {
        "index": "two-handed",
        "name": "Two-Handed"
      }
    ]
  },
  {
    "index": "handaxe",
    "name": "Handaxe",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Melee",
    "category_range": "Simple Melee",
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d6",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "light",
        "name": "Light"
      },
      {
        "index": "thrown",
        "name": "Thrown"
      },
      {
        "index": "monk",
        "name": "Monk"
      }
    ],
    "throw_range": {
      "normal": 20,
      "long": 60
    }
  },
  {
    "index": "javelin",
    "name": "Javelin",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Melee",
    "category_range": "Simple Melee",
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "damage": {
      "damage_dice": "1d6",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "thrown",
        "name": "Thrown"
      },
      {
        "index": "monk",
        "name": "Monk"
      }
    ],
    "throw_range": {
      "normal": 30,
      "long": 120
    }
  },
  {
    "index": "light-hammer",
    "name": "Light hammer",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Melee",
    "category_range": "Simple Melee",
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d4",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "light",
        "name": "Light"
      },
      {
        "index": "thrown",
        "name": "Thrown"
      },
      {
        "index": "monk",
        "name": "Monk"
      }
    ],
    "throw_range": {
      "normal": 20,
      "long": 60
    }
  },
  {
    "index": "mace",
    "name": "Mace",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Melee",
    "category_range": "Simple Melee",
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d6",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 4,
    "properties": [
      {
        "index": "monk",
        "name": "Monk"
      }
    ]
  },
  {
    "index": "quarterstaff",
    "name": "Quarterstaff",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Melee",
    "category_range": "Simple Melee",
    "cost": {
      "quantity": 2,
      "unit": "sp"
    },
    "damage": {
      "damage_dice": "1d6",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 4,
    "properties": [
      {
        "index": "versatile",
        "name": "Versatile"
      },
      {
        "index": "monk",
        "name": "Monk"
      }
    ],
    "two_handed_damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning"
      }
    }
  },
  {
    "index": "sickle",
    "name": "Sickle",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Melee",
    "category_range": "Simple Melee",
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d4",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "light",
        "name": "Light"
      },
      {
        "index": "monk",
        "name": "Monk"
      }
    ]
  },
  {
    "index": "spear",
    "name": "Spear",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Melee",
    "category_range": "Simple Melee",
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d6",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 3,
    "properties": [
      {
        "index": "thrown",
        "name": "Thrown"
      },
      {
        "index": "versatile",
        "name": "Versatile"
      },
      {
        "index": "monk",
        "name": "Monk"
      }
    ],
    "throw_range": {
      "normal": 20,
      "long": 60
    },
    "two_handed_damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    }
  },
  {
    "index": "crossbow-light",
    "name": "Crossbow, light",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Ranged",
    "category_range": "Simple Ranged",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 80,
      "long": 320
    },
    "weight": 5,
    "properties": [
      {
        "index": "ammunition",
        "name": "Ammunition"
      },
      {
        "index": "loading",
        "name": "Loading"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed"
      }
    ]
  },
  {
    "index": "dart",
    "name": "Dart",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Ranged",
    "category_range": "Simple Ranged",
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "damage": {
      "damage_dice": "1d4",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 20,
      "long": 60
    },
    "weight": 0.25,
    "properties": [
      {
        "index": "finesse",
        "name": "Finesse"
      },
      {
        "index": "thrown",
        "name": "Thrown"
      }
    ],
    "throw_range": {
      "normal": 20,
      "long": 60
    }
  },
  {
    "index": "shortbow",
    "name": "Shortbow",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Ranged",
    "category_range": "Simple Ranged",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d6",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 80,
      "long": 320
    },
    "weight": 2,
    "properties": [
      {
        "index": "ammunition",
        "name": "Ammunition"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed"
      }
    ]
  },
  {
    "index": "sling",
    "name": "Sling",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Simple",
    "weapon_range": "Ranged",
    "category_range": "Simple Ranged",
    "cost": {
      "quantity": 1,
      "unit": "sp"
    },
    "damage": {
      "damage_dice": "1d4",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning"
      }
    },
    "range": {
      "normal": 30,
      "long": 120
    },
    "weight": 0,
    "properties": [
      {
        "index": "ammunition",
        "name": "Ammunition"
      }
    ]
  },
  {
    "index": "battleaxe",
    "name": "Battleaxe",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 4,
    "properties": [
      {
        "index": "versatile",
        "name": "Versatile"
      }
    ],
    "two_handed_damage": {
      "damage_dice": "1d10",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    }
  },
  {
    "index": "flail",
    "name": "Flail",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": []
  },
  {
    "index": "glaive",
    "name": "Glaive",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d10",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 6,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy"
      },
      {
        "index": "reach",
        "name": "Reach"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed"
      }
    ]
  },
  {
    "index": "greataxe",
    "name": "Greataxe",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 30,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d12",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 7,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed"
      }
    ]
  },
  {
    "index": "greatsword",
    "name": "Greatsword",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "2d6",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 6,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed"
      }
    ]
  },
  {
    "index": "halberd",
    "name": "Halberd",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d10",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 6,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy"
      },
      {
        "index": "reach",
        "name": "Reach"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed"
      }
    ]
  },
  {
    "index": "lance",
    "name": "Lance",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d12",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 6,
    "properties": [
      {
        "index": "reach",
        "name": "Reach"
      },
      {
        "index": "special",
        "name": "Special"
      }
    ],
    "special": [
      "You have disadvantage when you use a lance to attack a target within 5 feet of you. Also, a lance requires two hands to wield when you aren't mounted."
    ]
  },
  {
    "index": "longsword",
    "name": "Longsword",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 15,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 3,
    "properties": [
      {
        "index": "versatile",
        "name": "Versatile"
      }
    ],
    "two_handed_damage": {
      "damage_dice": "1d10",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    }
  },
  {
    "index": "maul",
    "name": "Maul",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "2d6",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 10,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed"
      }
    ]
  },
  {
    "index": "morningstar",
    "name": "Morningstar",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 15,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 4,
    "properties": []
  },
  {
    "index": "pike",
    "name": "Pike",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d10",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 18,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy"
      },
      {
        "index": "reach",
        "name": "Reach"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed"
      }
    ]
  },
  {
    "index": "rapier",
    "name": "Rapier",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "finesse",
        "name": "Finesse"
      }
    ]
  },
  {
    "index": "scimitar",
    "name": "Scimitar",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d6",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 3,
    "properties": [
      {
        "index": "finesse",
        "name": "Finesse"
      },
      {
        "index": "light",
        "name": "Light"
      }
    ]
  },
  {
    "index": "shortsword",
    "name": "Shortsword",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d6",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "finesse",
        "name": "Finesse"
      },
      {
        "index": "light",
        "name": "Light"
      },
      {
        "index": "monk",
        "name": "Monk"
      }
    ]
  },
  {
    "index": "trident",
    "name": "Trident",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d6",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 4,
    "properties": [
      {
        "index": "thrown",
        "name": "Thrown"
      },
      {
        "index": "versatile",
        "name": "Versatile"
      }
    ],
    "throw_range": {
      "normal": 20,
      "long": 60
    },
    "two_handed_damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    }
  },
  {
    "index": "war-pick",
    "name": "War pick",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": []
  },
  {
    "index": "warhammer",
    "name": "Warhammer",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 15,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "versatile",
        "name": "Versatile"
      }
    ],
    "two_handed_damage": {
      "damage_dice": "1d10",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning"
      }
    }
  },
  {
    "index": "whip",
    "name": "Whip",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Melee",
    "category_range": "Martial Melee",
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d4",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 3,
    "properties": [
      {
        "index": "finesse",
        "name": "Finesse"
      },
      {
        "index": "reach",
        "name": "Reach"
      }
    ]
  },
  {
    "index": "blowgun",
    "name": "Blowgun",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Ranged",
    "category_range": "Martial Ranged",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 25,
      "long": 100
    },
    "weight": 1,
    "properties": [
      {
        "index": "ammunition",
        "name": "Ammunition"
      },
      {
        "index": "loading",
        "name": "Loading"
      }
    ]
  },
  {
    "index": "crossbow-hand",
    "name": "Crossbow, hand",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Ranged",
    "category_range": "Martial Ranged",
    "cost": {
      "quantity": 75,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d6",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 30,
      "long": 120
    },
    "weight": 3,
    "properties": [
      {
        "index": "ammunition",
        "name": "Ammunition"
      },
      {
        "index": "light",
        "name": "Light"
      },
      {
        "index": "loading",
        "name": "Loading"
      }
    ]
  },
  {
    "index": "crossbow-heavy",
    "name": "Crossbow, heavy",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Ranged",
    "category_range": "Martial Ranged",
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d10",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 100,
      "long": 400
    },
    "weight": 18,
    "properties": [
      {
        "index": "ammunition",
        "name": "Ammunition"
      },
      {
        "index": "heavy",
        "name": "Heavy"
      },
      {
        "index": "loading",
        "name": "Loading"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed"
      }
    ],
    "image": "/api/images/equipment/crossbow-heavy.png"
  },
  {
    "index": "longbow",
    "name": "Longbow",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Ranged",
    "category_range": "Martial Ranged",
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "piercing",
        "name": "Piercing"
      }
    },
    "range": {
      "normal": 150,
      "long": 600
    },
    "weight": 2,
    "properties": [
      {
        "index": "ammunition",
        "name": "Ammunition"
      },
      {
        "index": "heavy",
        "name": "Heavy"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed"
      }
    ]
  },
  {
    "index": "net",
    "name": "Net",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon"
    },
    "weapon_category": "Martial",
    "weapon_range": "Ranged",
    "category_range": "Martial Ranged",
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "range": {
      "normal": 5,
      "long": 15
    },
    "weight": 3,
    "properties": [
      {
        "index": "thrown",
        "name": "Thrown"
      },
      {
        "index": "special",
        "name": "Special"
      }
    ],
    "special": [
      "A Large or smaller creature hit by a net is restrained until it is freed. A net has no effect on creatures that are formless, or creatures that are Huge or larger. A creature can use its action to make a DC 10 Strength check, freeing itself or another creature within its reach on a success. Dealing 5 slashing damage to the net (AC 10) also frees the creature without harming it, ending the effect and destroying the net. When you use an action, bonus action, or reaction to attack with a net, you can make only one attack regardless of the number of attacks you can normally make."
    ],
    "throw_range": {
      "normal": 5,
      "long": 15
    }
  },
  {
    "index": "padded-armor",
    "name": "Padded Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Light",
    "armor_class": {
      "base": 11,
      "dex_bonus": true
    },
    "str_minimum": 0,
    "stealth_disadvantage": true,
    "weight": 8,
    "cost": {
      "quantity": 5,
      "unit": "gp"
    }
  },
  {
    "index": "leather-armor",
    "name": "Leather Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Light",
    "armor_class": {
      "base": 11,
      "dex_bonus": true
    },
    "str_minimum": 0,
    "stealth_disadvantage": false,
    "weight": 10,
    "cost": {
      "quantity": 10,
      "unit": "gp"
    }
  },
  {
    "index": "studded-leather-armor",
    "name": "Studded Leather Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Light",
    "armor_class": {
      "base": 12,
      "dex_bonus": true
    },
    "str_minimum": 0,
    "stealth_disadvantage": false,
    "weight": 13,
    "cost": {
      "quantity": 45,
      "unit": "gp"
    }
  },
  {
    "index": "hide-armor",
    "name": "Hide Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Medium",
    "armor_class": {
      "base": 12,
      "dex_bonus": true,
      "max_bonus": 2
    },
    "str_minimum": 0,
    "stealth_disadvantage": false,
    "weight": 12,
    "cost": {
      "quantity": 10,
      "unit": "gp"
    }
  },
  {
    "index": "chain-shirt",
    "name": "Chain Shirt",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Medium",
    "armor_class": {
      "base": 13,
      "dex_bonus": true,
      "max_bonus": 2
    },
    "str_minimum": 0,
    "stealth_disadvantage": false,
    "weight": 20,
    "cost": {
      "quantity": 50,
      "unit": "gp"
    }
  },
  {
    "index": "scale-mail",
    "name": "Scale Mail",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Medium",
    "armor_class": {
      "base": 14,
      "dex_bonus": true,
      "max_bonus": 2
    },
    "str_minimum": 0,
    "stealth_disadvantage": true,
    "weight": 45,
    "cost": {
      "quantity": 50,
      "unit": "gp"
    }
  },
  {
    "index": "breastplate",
    "name": "Breastplate",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Medium",
    "armor_class": {
      "base": 14,
      "dex_bonus": true,
      "max_bonus": 2
    },
    "str_minimum": 0,
    "stealth_disadvantage": false,
    "weight": 20,
    "cost": {
      "quantity": 400,
      "unit": "gp"
    }
  },
  {
    "index": "half-plate-armor",
    "name": "Half Plate Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Medium",
    "armor_class": {
      "base": 15,
      "dex_bonus": true,
      "max_bonus": 2
    },
    "str_minimum": 0,
    "stealth_disadvantage": true,
    "weight": 40,
    "cost": {
      "quantity": 750,
      "unit": "gp"
    }
  },
  {
    "index": "ring-mail",
    "name": "Ring Mail",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Heavy",
    "armor_class": {
      "base": 14,
      "dex_bonus": false
    },
    "str_minimum": 0,
    "stealth_disadvantage": true,
    "weight": 40,
    "cost": {
      "quantity": 30,
      "unit": "gp"
    }
  },
  {
    "index": "chain-mail",
    "name": "Chain Mail",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Heavy",
    "armor_class": {
      "base": 16,
      "dex_bonus": false
    },
    "str_minimum": 13,
    "stealth_disadvantage": true,
    "weight": 55,
    "cost": {
      "quantity": 75,
      "unit": "gp"
    }
  },
  {
    "index": "splint-armor",
    "name": "Splint Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Heavy",
    "armor_class": {
      "base": 17,
      "dex_bonus": false
    },
    "str_minimum": 15,
    "stealth_disadvantage": true,
    "weight": 60,
    "cost": {
      "quantity": 200,
      "unit": "gp"
    }
  },
  {
    "index": "plate-armor",
    "name": "Plate Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Heavy",
    "armor_class": {
      "base": 18,
      "dex_bonus": false
    },
    "str_minimum": 15,
    "stealth_disadvantage": true,
    "weight": 65,
    "cost": {
      "quantity": 1500,
      "unit": "gp"
    }
  },
  {
    "index": "shield",
    "name": "Shield",
    "equipment_category": {
      "index": "armor",
      "name": "Armor"
    },
    "armor_category": "Shield",
    "armor_class": {
      "base": 2,
      "dex_bonus": false
    },
    "str_minimum": 0,
    "stealth_disadvantage": false,
    "weight": 6,
    "cost": {
      "quantity": 10,
      "unit": "gp"
    }
  },
  {
    "index": "abacus",
    "name": "Abacus",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 2
  },
  {
    "index": "acid-vial",
    "name": "Acid (vial)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "As an action, you can splash the contents of this vial onto a creature within 5 feet of you or throw the vial up to 20 feet, shattering it on impact. In either case, make a ranged attack against a creature or object, treating the acid as an improvised weapon.",
      "On a hit, the target takes 2d6 acid damage."
    ]
  },
  {
    "index": "alchemists-fire-flask",
    "name": "Alchemist's fire (flask)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "desc": [
      "This sticky, adhesive fluid ignites when exposed to air.",
      "As an action, you can throw this flask up to 20 feet, shattering it on impact. Make a ranged attack against a creature or object, treating the alchemist's fire as an improvised weapon.",
      "On a hit, the target takes 1d4 fire damage at the start of each of its turns. A creature can end this damage by using its action to make a DC 10 Dexterity check to extinguish the flames."
    ],
    "weight": 1
  },
  {
    "index": "alms-box",
    "name": "Alms box",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A small box for alms, typically found in a priest's pack."
    ]
  },
  {
    "index": "arrow",
    "name": "Arrow",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "ammunition",
      "name": "Ammunition"
    },
    "quantity": 20,
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1
  },
  {
    "index": "block-of-incense",
    "name": "Block of incense",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A block of incense, typically found in a priest's pack."
    ]
  },
  {
    "index": "blowgun-needle",
    "name": "Blowgun needle",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "ammunition",
      "name": "Ammunition"
    },
    "quantity": 50,
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1
  },
  {
    "index": "censer",
    "name": "Censer",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A censer, typically found in a priest's pack."
    ]
  },
  {
    "index": "crossbow-bolt",
    "name": "Crossbow bolt",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "ammunition",
      "name": "Ammunition"
    },
    "quantity": 20,
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1.5
  },
  {
    "index": "sling-bullet",
    "name": "Sling bullet",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "ammunition",
      "name": "Ammunition"
    },
    "quantity": 20,
    "cost": {
      "quantity": 4,
      "unit": "cp"
    },
    "weight": 1.5
  },
  {
    "index": "amulet",
    "name": "Amulet",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "holy-symbols",
      "name": "Holy Symbols"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "A holy symbol is a representation of a god or pantheon. It might be an amulet depicting a symbol representing a deity, the same symbol carefully engraved or inlaid as an emblem on a shield, or a tiny box holding a fragment of a sacred relic.",
      "Appendix B lists the symbols commonly associated with many gods in the multiverse. A cleric or paladin can use a holy symbol as a spellcasting focus. To use the symbol in this way, the caster must hold it in hand, wear it visibly, or bear it on a shield."
    ]
  },
  {
    "index": "antitoxin-vial",
    "name": "Antitoxin (vial)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "A creature that drinks this vial of liquid gains advantage on saving throws against poison for 1 hour. It confers no benefit to undead or constructs."
    ]
  },
  {
    "index": "crystal",
    "name": "Crystal",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "arcane-foci",
      "name": "Arcane Foci"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus."
    ]
  },
  {
    "index": "orb",
    "name": "Orb",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "arcane-foci",
      "name": "Arcane Foci"
    },
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus."
    ]
  },
  {
    "index": "rod",
    "name": "Rod",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "arcane-foci",
      "name": "Arcane Foci"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus."
    ]
  },
  {
    "index": "staff",
    "name": "Staff",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "arcane-foci",
      "name": "Arcane Foci"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 4,
    "desc": [
      "An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus."
    ]
  },
  {
    "index": "wand",
    "name": "Wand",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "arcane-foci",
      "name": "Arcane Foci"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus."
    ]
  },
  {
    "index": "backpack",
    "name": "Backpack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 5
  },
  {
    "index": "ball-bearings-bag-of-1000",
    "name": "Ball bearings (bag of 1,000)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "As an action, you can spill these tiny metal balls from their pouch to cover a level, square area that is 10 feet on a side.",
      "A creature moving across the covered area must succeed on a DC 10 Dexterity saving throw or fall prone.",
      "A creature moving through the area at half speed doesn't need to make the save."
    ],
    "image": "/api/images/equipment/ball-bearings-bag-of-1000.png"
  },
  {
    "index": "barrel",
    "name": "Barrel",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 70
  },
  {
    "index": "basket",
    "name": "Basket",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 4,
      "unit": "sp"
    },
    "weight": 2
  },
  {
    "index": "bedroll",
    "name": "Bedroll",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 7
  },
  {
    "index": "bell",
    "name": "Bell",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 0
  },
  {
    "index": "blanket",
    "name": "Blanket",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 3
  },
  {
    "index": "block-and-tackle",
    "name": "Block and tackle",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "A set of pulleys with a cable threaded through them and a hook to attach to objects, a block and tackle allows you to hoist up to four times the weight you can normally lift."
    ]
  },
  {
    "index": "book",
    "name": "Book",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "A book might contain poetry, historical accounts, information pertaining to a particular field of lore, diagrams and notes on gnomish contraptions, or just about anything else that can be represented using text or pictures. A book of spells is a spellbook (described later in this section)."
    ]
  },
  {
    "index": "bottle-glass",
    "name": "Bottle, glass",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 2
  },
  {
    "index": "bucket",
    "name": "Bucket",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "weight": 2
  },
  {
    "index": "caltrops",
    "name": "Caltrops",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "weight": 2,
    "desc": [
      "As an action, you can spread a bag of caltrops to cover a square area that is 5 feet on a side.",
      "Any creature that enters the area must succeed on a DC 15 Dexterity saving throw or stop moving this turn and take 1 piercing damage.",
      "Taking this damage reduces the creature's walking speed by 10 feet until the creature regains at least 1 hit point.",
      "A creature moving through the area at half speed doesn't need to make the save."
    ]
  },
  {
    "index": "candle",
    "name": "Candle",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "For 1 hour, a candle sheds bright light in a 5-foot radius and dim light for an additional 5 feet."
    ]
  },
  {
    "index": "case-crossbow-bolt",
    "name": "Case, crossbow bolt",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "This wooden case can hold up to twenty crossbow bolts."
    ]
  },
  {
    "index": "case-map-or-scroll",
    "name": "Case, map or scroll",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "This cylindrical leather case can hold up to ten rolled-up sheets of paper or five rolled-up sheets of parchment."
    ]
  },
  {
    "index": "chain-10-feet",
    "name": "Chain (10 feet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 10,
    "desc": [
      "A chain has 10 hit points. It can be burst with a successful DC 20 Strength check."
    ]
  },
  {
    "index": "chalk-1-piece",
    "name": "Chalk (1 piece)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "cp"
    },
    "weight": 0
  },
  {
    "index": "chest",
    "name": "Chest",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 25
  },
  {
    "index": "clothes-common",
    "name": "Clothes, common",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 3
  },
  {
    "index": "clothes-costume",
    "name": "Clothes, costume",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 4
  },
  {
    "index": "clothes-fine",
    "name": "Clothes, fine",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 15,
      "unit": "gp"
    },
    "weight": 6
  },
  {
    "index": "clothes-travelers",
    "name": "Clothes, traveler's",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 4
  },
  {
    "index": "component-pouch",
    "name": "Component pouch",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "A component pouch is a small, watertight leather belt pouch that has compartments to hold all the material components and other special items you need to cast your spells, except for those components that have a specific cost (as indicated in a spell's description)."
    ]
  },
  {
    "index": "crowbar",
    "name": "Crowbar",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "Using a crowbar grants advantage to Strength checks where the crowbar's leverage can be applied."
    ]
  },
  {
    "index": "sprig-of-mistletoe",
    "name": "Sprig of mistletoe",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "druidic-foci",
      "name": "Druidic Foci"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus."
    ]
  },
  {
    "index": "totem",
    "name": "Totem",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "druidic-foci",
      "name": "Druidic Foci"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus."
    ]
  },
  {
    "index": "wooden-staff",
    "name": "Wooden staff",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "druidic-foci",
      "name": "Druidic Foci"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 4,
    "desc": [
      "A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus."
    ]
  },
  {
    "index": "yew-wand",
    "name": "Yew wand",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "druidic-foci",
      "name": "Druidic Foci"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus."
    ]
  },
  {
    "index": "emblem",
    "name": "Emblem",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "holy-symbols",
      "name": "Holy Symbols"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "A holy symbol is a representation of a god or pantheon. It might be an amulet depicting a symbol representing a deity, the same symbol carefully engraved or inlaid as an emblem on a shield, or a tiny box holding a fragment of a sacred relic.",
      "Appendix B lists the symbols commonly associated with many gods in the multiverse. A cleric or paladin can use a holy symbol as a spellcasting focus. To use the symbol in this way, the caster must hold it in hand, wear it visibly, or bear it on a shield."
    ]
  },
  {
    "index": "fishing-tackle",
    "name": "Fishing tackle",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 4,
    "desc": [
      "This kit includes a wooden rod, silken line, corkwood bobbers, steel hooks, lead sinkers, velvet lures, and narrow netting."
    ]
  },
  {
    "index": "flask-or-tankard",
    "name": "Flask or tankard",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "cp"
    },
    "weight": 1
  },
  {
    "index": "grappling-hook",
    "name": "Grappling hook",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 4
  },
  {
    "index": "hammer",
    "name": "Hammer",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 3
  },
  {
    "index": "hammer-sledge",
    "name": "Hammer, sledge",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 10
  },
  {
    "index": "holy-water-flask",
    "name": "Holy water (flask)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "As an action, you can splash the contents of this flask onto a creature within 5 feet of you or throw it up to 20 feet, shattering it on impact. In either case, make a ranged attack against a target creature, treating the holy water as an improvised weapon.",
      "If the target is a fiend or undead, it takes 2d6 radiant damage.",
      "A cleric or paladin may create holy water by performing a special ritual.",
      "The ritual takes 1 hour to perform, uses 25 gp worth of powdered silver, and requires the caster to expend a 1st-level spell slot."
    ]
  },
  {
    "index": "hourglass",
    "name": "Hourglass",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 1
  },
  {
    "index": "hunting-trap",
    "name": "Hunting trap",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "desc": [
      "When you use your action to set it, this trap forms a saw-toothed steel ring that snaps shut when a creature steps on a pressure plate in the center. The trap is affixed by a heavy chain to an immobile object, such as a tree or a spike driven into the ground.",
      "A creature that steps on the plate must succeed on a DC 13 Dexterity saving throw or take 1d4 piercing damage and stop moving. Thereafter, until the creature breaks free of the trap, its movement is limited by the length of the chain (typically 3 feet long).",
      "A creature can use its action to make a DC 13 Strength check, freeing itself or another creature within its reach on a success. Each failed check deals 1 piercing damage to the trapped creature."
    ],
    "weight": 25
  },
  {
    "index": "ink-1-ounce-bottle",
    "name": "Ink (1 ounce bottle)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 0
  },
  {
    "index": "ink-pen",
    "name": "Ink pen",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "cp"
    },
    "weight": 0
  },
  {
    "index": "jug-or-pitcher",
    "name": "Jug or pitcher",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "cp"
    },
    "weight": 4
  },
  {
    "index": "climbers-kit",
    "name": "Climber's Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 12,
    "desc": [
      "A climber's kit includes special pitons, boot tips, gloves, and a harness. You can use the climber's kit as an action to anchor yourself; when you do, you can't fall more than 25 feet from the point where you anchored yourself, and you can't climb more than 25 feet away from that point without undoing the anchor."
    ]
  },
  {
    "index": "disguise-kit",
    "name": "Disguise Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "This pouch of cosmetics, hair dye, and small props lets you create disguises that change your physical appearance. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to create a visual disguise."
    ]
  },
  {
    "index": "forgery-kit",
    "name": "Forgery Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits"
    },
    "cost": {
      "quantity": 15,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "This small box contains a variety of papers and parchments, pens and inks, seals and sealing wax, gold and silver leaf, and other supplies necessary to create convincing forgeries of physical documents. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to create a physical forgery of a document."
    ]
  },
  {
    "index": "herbalism-kit",
    "name": "Herbalism Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "This kit contains a variety of instruments such as clippers, mortar and pestle, and pouches and vials used by herbalists to create remedies and potions. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to identify or apply herbs. Also, proficiency with this kit is required to create antitoxin and potions of healing."
    ]
  },
  {
    "index": "healers-kit",
    "name": "Healer's Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "This kit is a leather pouch containing bandages, salves, and splints. The kit has ten uses. As an action, you can expend one use of the kit to stabilize a creature that has 0 hit points, without needing to make a Wisdom (Medicine) check."
    ]
  },
  {
    "index": "mess-kit",
    "name": "Mess Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits"
    },
    "cost": {
      "quantity": 2,
      "unit": "sp"
    },
    "weight": 1,
    "desc": [
      "This tin box contains a cup and simple cutlery. The box clamps together, and one side can be used as a cooking pan and the other as a plate or shallow bowl."
    ]
  },
  {
    "index": "poisoners-kit",
    "name": "Poisoner's Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits"
    },
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "A poisoner's kit includes the vials, chemicals, and other equipment necessary for the creation of poisons. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to craft or use poisons."
    ]
  },
  {
    "index": "ladder-10-foot",
    "name": "Ladder (10-foot)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "sp"
    },
    "weight": 25
  },
  {
    "index": "lamp",
    "name": "Lamp",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 1,
    "desc": [
      "A lamp casts bright light in a 15-foot radius and dim light for an additional 30 feet. Once lit, it burns for 6 hours on a flask (1 pint) of oil."
    ]
  },
  {
    "index": "lantern-bullseye",
    "name": "Lantern, bullseye",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "A bullseye lantern casts bright light in a 60-foot cone and dim light for an additional 60 feet. Once lit, it burns for 6 hours on a flask (1 pint) of oil."
    ]
  },
  {
    "index": "lantern-hooded",
    "name": "Lantern, hooded",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "A hooded lantern casts bright light in a 30-foot radius and dim light for an additional 30 feet. Once lit, it burns for 6 hours on a flask (1 pint) of oil. As an action, you can lower the hood, reducing the light to dim light in a 5-foot radius."
    ]
  },
  {
    "index": "little-bag-of-sand",
    "name": "Little bag of sand",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A small bag of sand, typically found in a scholar's pack."
    ]
  },
  {
    "index": "lock",
    "name": "Lock",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "A key is provided with the lock. Without the key, a creature proficient with thieves' tools can pick this lock with a successful DC 15 Dexterity check. Your GM may decide that better locks are available for higher prices."
    ]
  },
  {
    "index": "magnifying-glass",
    "name": "Magnifying glass",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 100,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "This lens allows a closer look at small objects. It is also useful as a substitute for flint and steel when starting fires. Lighting a fire with a magnifying glass requires light as bright as sunlight to focus, tinder to ignite, and about 5 minutes for the fire to ignite.",
      "A magnifying glass grants advantage on any ability check made to appraise or inspect an item that is small or highly detailed."
    ]
  },
  {
    "index": "manacles",
    "name": "Manacles",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 6,
    "desc": [
      "These metal restraints can bind a Small or Medium creature. Escaping the manacles requires a successful DC 20 Dexterity check. Breaking them requires a successful DC 20 Strength check.",
      "Each set of manacles comes with one key. Without the key, a creature proficient with thieves' tools can pick the manacles' lock with a successful DC 15 Dexterity check. Manacles have 15 hit points."
    ]
  },
  {
    "index": "mirror-steel",
    "name": "Mirror, steel",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 0.5
  },
  {
    "index": "oil-flask",
    "name": "Oil (flask)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "sp"
    },
    "weight": 1,
    "desc": [
      "Oil usually comes in a clay flask that holds 1 pint.",
      "As an action, you can splash the oil in this flask onto a creature within 5 feet of you or throw it up to 20 feet, shattering it on impact. Make a ranged attack against a target creature or object, treating the oil as an improvised weapon.",
      "On a hit, the target is covered in oil. If the target takes any fire damage before the oil dries (after 1 minute), the target takes an additional 5 fire damage from the burning oil.",
      "You can also pour a flask of oil on the ground to cover a 5-foot-square area, provided that the surface is level.",
      "If lit, the oil burns for 2 rounds and deals 5 fire damage to any creature that enters the area or ends its turn in the area. A creature can take this damage only once per turn."
    ]
  },
  {
    "index": "paper-one-sheet",
    "name": "Paper (one sheet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "sp"
    },
    "weight": 0
  },
  {
    "index": "parchment-one-sheet",
    "name": "Parchment (one sheet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "sp"
    },
    "weight": 0
  },
  {
    "index": "perfume-vial",
    "name": "Perfume (vial)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 0
  },
  {
    "index": "pick-miners",
    "name": "Pick, miner's",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 10
  },
  {
    "index": "piton",
    "name": "Piton",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "weight": 0.25
  },
  {
    "index": "poison-basic-vial",
    "name": "Poison, basic (vial)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 100,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "You can use the poison in this vial to coat one slashing or piercing weapon or up to three pieces of ammunition. Applying the poison takes an action. A creature hit by the poisoned weapon or ammunition must make a DC 10 Constitution saving throw or take 1d4 poison damage. Once applied, the poison retains potency for 1 minute before drying."
    ]
  },
  {
    "index": "pole-10-foot",
    "name": "Pole (10-foot)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "weight": 7
  },
  {
    "index": "pot-iron",
    "name": "Pot, iron",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 10
  },
  {
    "index": "pouch",
    "name": "Pouch",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 1,
    "desc": [
      "A cloth or leather pouch can hold up to 20 sling bullets or 50 blowgun needles, among other things. A compartmentalized pouch for holding spell components is called a component pouch (described earlier in this section)."
    ]
  },
  {
    "index": "quiver",
    "name": "Quiver",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "A quiver can hold up to 20 arrows."
    ]
  },
  {
    "index": "ram-portable",
    "name": "Ram, portable",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 4,
      "unit": "gp"
    },
    "weight": 35,
    "desc": [
      "You can use a portable ram to break down doors. When doing so, you gain a +4 bonus on the Strength check. One other character can help you use the ram, giving you advantage on this check."
    ]
  },
  {
    "index": "rations-1-day",
    "name": "Rations (1 day)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 2,
    "desc": [
      "Rations consist of dry foods suitable for extended travel, including jerky, dried fruit, hardtack, and nuts."
    ]
  },
  {
    "index": "reliquary",
    "name": "Reliquary",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "holy-symbols",
      "name": "Holy Symbols"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "A holy symbol is a representation of a god or pantheon. It might be an amulet depicting a symbol representing a deity, the same symbol carefully engraved or inlaid as an emblem on a shield, or a tiny box holding a fragment of a sacred relic.",
      "Appendix B lists the symbols commonly associated with many gods in the multiverse. A cleric or paladin can use a holy symbol as a spellcasting focus. To use the symbol in this way, the caster must hold it in hand, wear it visibly, or bear it on a shield."
    ]
  },
  {
    "index": "robes",
    "name": "Robes",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 4
  },
  {
    "index": "rope-hempen-50-feet",
    "name": "Rope, hempen (50 feet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 10,
    "desc": [
      "Rope, whether made of hemp or silk, has 2 hit points and can be burst with a DC 17 Strength check."
    ]
  },
  {
    "index": "rope-silk-50-feet",
    "name": "Rope, silk (50 feet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "Rope, whether made of hemp or silk, has 2 hit points and can be burst with a DC 17 Strength check."
    ]
  },
  {
    "index": "sack",
    "name": "Sack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "cp"
    },
    "weight": 0.5
  },
  {
    "index": "scale-merchants",
    "name": "Scale, merchant's",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "A scale includes a small balance, pans, and a suitable assortment of weights up to 2 pounds. With it, you can measure the exact weight of small objects, such as raw precious metals or trade goods, to help determine their worth."
    ]
  },
  {
    "index": "sealing-wax",
    "name": "Sealing wax",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 0
  },
  {
    "index": "shovel",
    "name": "Shovel",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 5
  },
  {
    "index": "signal-whistle",
    "name": "Signal whistle",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "weight": 0
  },
  {
    "index": "signet-ring",
    "name": "Signet ring",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 0
  },
  {
    "index": "small-knife",
    "name": "Small knife",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A small knife, typically found in a scholar's pack."
    ]
  },
  {
    "index": "soap",
    "name": "Soap",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "cp"
    },
    "weight": 0
  },
  {
    "index": "spellbook",
    "name": "Spellbook",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "Essential for wizards, a spellbook is a leather-bound tome with 100 blank vellum pages suitable for recording spells."
    ]
  },
  {
    "index": "spike-iron",
    "name": "Spike, iron",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "sp"
    },
    "weight": 5
  },
  {
    "index": "spyglass",
    "name": "Spyglass",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1000,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "Objects viewed through a spyglass are magnified to twice their size."
    ]
  },
  {
    "index": "string-10-feet",
    "name": "String (10 feet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A 10-foot length of string, typically found in a burglar's pack."
    ]
  },
  {
    "index": "tent-two-person",
    "name": "Tent, two-person",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 20,
    "desc": [
      "A simple and portable canvas shelter, a tent sleeps two."
    ]
  },
  {
    "index": "tinderbox",
    "name": "Tinderbox",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 1,
    "desc": [
      "This small container holds flint, fire steel, and tinder (usually dry cloth soaked in light oil) used to kindle a fire. Using it to light a torch--or anything else with abundant, exposed fuel--takes an action.",
      "Lighting any other fire takes 1 minute."
    ]
  },
  {
    "index": "torch",
    "name": "Torch",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "cp"
    },
    "weight": 1,
    "desc": [
      "A torch burns for 1 hour, providing bright light in a 20-foot radius and dim light for an additional 20 feet. If you make a melee attack with a burning torch and hit, it deals 1 fire damage."
    ]
  },
  {
    "index": "vestments",
    "name": "Vestments",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "Religious clothing, typically found in a priest's pack."
    ]
  },
  {
    "index": "vial",
    "name": "Vial",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 0
  },
  {
    "index": "waterskin",
    "name": "Waterskin",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "sp"
    },
    "weight": 5
  },
  {
    "index": "whetstone",
    "name": "Whetstone",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "cp"
    },
    "weight": 1
  },
  {
    "index": "burglars-pack",
    "name": "Burglar's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs"
    },
    "cost": {
      "quantity": 16,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "ball-bearings-bag-of-1000",
          "name": "Ball bearings (bag of 1,000)"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "string-10-feet",
          "name": "String (10 feet)"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "bell",
          "name": "Bell"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "candle",
          "name": "Candle"
        },
        "quantity": 5
      },
      {
        "item": {
          "index": "crowbar",
          "name": "Crowbar"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "hammer",
          "name": "Hammer"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "piton",
          "name": "Piton"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "lantern-hooded",
          "name": "Lantern, hooded"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "oil-flask",
          "name": "Oil (flask)"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "rations-1-day",
          "name": "Rations (1 day)"
        },
        "quantity": 5
      },
      {
        "item": {
          "index": "tinderbox",
          "name": "Tinderbox"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "waterskin",
          "name": "Waterskin"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "rope-hempen-50-feet",
          "name": "Rope, hempen (50 feet)"
        },
        "quantity": 1
      }
    ]
  },
  {
    "index": "diplomats-pack",
    "name": "Diplomat's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs"
    },
    "cost": {
      "quantity": 39,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "chest",
          "name": "Chest"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "case-map-or-scroll",
          "name": "Case, map or scroll"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "clothes-fine",
          "name": "Clothes, fine"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "ink-1-ounce-bottle",
          "name": "Ink (1 ounce bottle)"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "ink-pen",
          "name": "Ink pen"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "lamp",
          "name": "Lamp"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "oil-flask",
          "name": "Oil (flask)"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "paper-one-sheet",
          "name": "Paper (one sheet)"
        },
        "quantity": 5
      },
      {
        "item": {
          "index": "perfume-vial",
          "name": "Perfume (vial)"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "sealing-wax",
          "name": "Sealing wax"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "soap",
          "name": "Soap"
        },
        "quantity": 1
      }
    ]
  },
  {
    "index": "dungeoneers-pack",
    "name": "Dungeoneer's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs"
    },
    "cost": {
      "quantity": 12,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "crowbar",
          "name": "Crowbar"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "hammer",
          "name": "Hammer"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "piton",
          "name": "Piton"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "torch",
          "name": "Torch"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "tinderbox",
          "name": "Tinderbox"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "rations-1-day",
          "name": "Rations (1 day)"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "waterskin",
          "name": "Waterskin"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "rope-hempen-50-feet",
          "name": "Rope, hempen (50 feet)"
        },
        "quantity": 1
      }
    ]
  },
  {
    "index": "entertainers-pack",
    "name": "Entertainer's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs"
    },
    "cost": {
      "quantity": 40,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "bedroll",
          "name": "Bedroll"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "clothes-costume",
          "name": "Clothes, costume"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "candle",
          "name": "Candle"
        },
        "quantity": 5
      },
      {
        "item": {
          "index": "rations-1-day",
          "name": "Rations (1 day)"
        },
        "quantity": 5
      },
      {
        "item": {
          "index": "waterskin",
          "name": "Waterskin"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "disguise-kit",
          "name": "Disguise Kit"
        },
        "quantity": 1
      }
    ]
  },
  {
    "index": "explorers-pack",
    "name": "Explorer's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "bedroll",
          "name": "Bedroll"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "mess-kit",
          "name": "Mess Kit"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "tinderbox",
          "name": "Tinderbox"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "torch",
          "name": "Torch"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "rations-1-day",
          "name": "Rations (1 day)"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "waterskin",
          "name": "Waterskin"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "rope-hempen-50-feet",
          "name": "Rope, hempen (50 feet)"
        },
        "quantity": 1
      }
    ]
  },
  {
    "index": "priests-pack",
    "name": "Priest's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs"
    },
    "cost": {
      "quantity": 19,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "blanket",
          "name": "Blanket"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "candle",
          "name": "Candle"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "tinderbox",
          "name": "Tinderbox"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "rations-1-day",
          "name": "Rations (1 day)"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "waterskin",
          "name": "Waterskin"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "alms-box",
          "name": "Alms box"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "block-of-incense",
          "name": "Block of incense"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "censer",
          "name": "Censer"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "vestments",
          "name": "Vestments"
        },
        "quantity": 1
      }
    ]
  },
  {
    "index": "scholars-pack",
    "name": "Scholar's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs"
    },
    "cost": {
      "quantity": 40,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "book",
          "name": "Book"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "ink-1-ounce-bottle",
          "name": "Ink (1 ounce bottle)"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "ink-pen",
          "name": "Ink pen"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "parchment-one-sheet",
          "name": "Parchment (one sheet)"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "little-bag-of-sand",
          "name": "Little bag of sand"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "small-knife",
          "name": "Small knife"
        },
        "quantity": 1
      }
    ]
  },
  {
    "index": "alchemists-supplies",
    "name": "Alchemist's Supplies",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "weight": 8,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "brewers-supplies",
    "name": "Brewer's Supplies",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 9,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "calligraphers-supplies",
    "name": "Calligrapher's Supplies",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "carpenters-tools",
    "name": "Carpenter's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 8,
      "unit": "gp"
    },
    "weight": 6,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "cartographers-tools",
    "name": "Cartographer's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 15,
      "unit": "gp"
    },
    "weight": 6,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "cobblers-tools",
    "name": "Cobbler's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "cooks-utensils",
    "name": "Cook's utensils",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 8,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "glassblowers-tools",
    "name": "Glassblower's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 30,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "jewelers-tools",
    "name": "Jeweler's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "leatherworkers-tools",
    "name": "Leatherworker's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "masons-tools",
    "name": "Mason's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 8,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "painters-supplies",
    "name": "Painter's Supplies",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "potters-tools",
    "name": "Potter's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "smiths-tools",
    "name": "Smith's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 8,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "tinkers-tools",
    "name": "Tinker's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "weight": 10,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "weavers-tools",
    "name": "Weaver's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "woodcarvers-tools",
    "name": "Woodcarver's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ]
  },
  {
    "index": "dice-set",
    "name": "Dice Set",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Gaming Sets",
    "cost": {
      "quantity": 1,
      "unit": "sp"
    },
    "weight": 0,
    "desc": [
      "This item encompasses a wide range of game pieces, including dice and decks of cards (for games such as Three-Dragon Ante). A few common examples appear on the Tools table, but other kinds of gaming sets exist. If you are proficient with a gaming set, you can add your proficiency bonus to ability checks you make to play a game with that set. Each type of gaming set requires a separate proficiency."
    ]
  },
  {
    "index": "playing-card-set",
    "name": "Playing Card Set",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Gaming Sets",
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 0,
    "desc": [
      "This item encompasses a wide range of game pieces, including dice and decks of cards (for games such as Three-Dragon Ante). A few common examples appear on the Tools table, but other kinds of gaming sets exist. If you are proficient with a gaming set, you can add your proficiency bonus to ability checks you make to play a game with that set. Each type of gaming set requires a separate proficiency."
    ],
    "image": "/api/images/equipment/playing-card-set.png"
  },
  {
    "index": "bagpipes",
    "name": "Bagpipes",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 30,
      "unit": "gp"
    },
    "weight": 6,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ]
  },
  {
    "index": "drum",
    "name": "Drum",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 6,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ]
  },
  {
    "index": "dulcimer",
    "name": "Dulcimer",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 10,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ],
    "image": "/api/images/equipment/dulcimer.png"
  },
  {
    "index": "flute",
    "name": "Flute",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ]
  },
  {
    "index": "lute",
    "name": "Lute",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 35,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ]
  },
  {
    "index": "lyre",
    "name": "Lyre",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 30,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ]
  },
  {
    "index": "horn",
    "name": "Horn",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 3,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ]
  },
  {
    "index": "pan-flute",
    "name": "Pan flute",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 12,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ]
  },
  {
    "index": "shawm",
    "name": "Shawm",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ]
  },
  {
    "index": "viol",
    "name": "Viol",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 30,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ]
  },
  {
    "index": "navigators-tools",
    "name": "Navigator's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Other Tools",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "This set of instruments is used for navigation at sea. Proficiency with navigator's tools lets you chart a ship's course and follow navigation charts. In addition, these tools allow you to add your proficiency bonus to any ability check you make to avoid getting lost at sea."
    ]
  },
  {
    "index": "thieves-tools",
    "name": "Thieves' Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools"
    },
    "tool_category": "Other Tools",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "This set of tools includes a small file, a set of lock picks, a small mirror mounted on a metal handle, a set of narrow-bladed scissors, and a pair of pliers. Proficiency with these tools lets you add your proficiency bonus to any ability checks you make to disarm traps or open locks."
    ]
  },
  {
    "index": "camel",
    "name": "Camel",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Mounts and Other Animals",
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "speed": {
      "quantity": 50,
      "unit": "ft/round"
    },
    "capacity": "480 lb."
  },
  {
    "index": "donkey",
    "name": "Donkey",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Mounts and Other Animals",
    "cost": {
      "quantity": 8,
      "unit": "gp"
    },
    "speed": {
      "quantity": 40,
      "unit": "ft/round"
    },
    "capacity": "420 lb."
  },
  {
    "index": "mule",
    "name": "Mule",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Mounts and Other Animals",
    "cost": {
      "quantity": 8,
      "unit": "gp"
    },
    "speed": {
      "quantity": 40,
      "unit": "ft/round"
    },
    "capacity": "420 lb."
  },
  {
    "index": "elephant",
    "name": "Elephant",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Mounts and Other Animals",
    "cost": {
      "quantity": 200,
      "unit": "gp"
    },
    "speed": {
      "quantity": 40,
      "unit": "ft/round"
    },
    "capacity": "1,320 lb."
  },
  {
    "index": "horse-draft",
    "name": "Horse, draft",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Mounts and Other Animals",
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "speed": {
      "quantity": 40,
      "unit": "ft/round"
    },
    "capacity": "540 lb."
  },
  {
    "index": "horse-riding",
    "name": "Horse, riding",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Mounts and Other Animals",
    "cost": {
      "quantity": 75,
      "unit": "gp"
    },
    "speed": {
      "quantity": 60,
      "unit": "ft/round"
    },
    "capacity": "480 lb."
  },
  {
    "index": "mastiff",
    "name": "Mastiff",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Mounts and Other Animals",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "speed": {
      "quantity": 40,
      "unit": "ft/round"
    },
    "capacity": "195 lb."
  },
  {
    "index": "pony",
    "name": "Pony",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Mounts and Other Animals",
    "cost": {
      "quantity": 30,
      "unit": "gp"
    },
    "speed": {
      "quantity": 40,
      "unit": "ft/round"
    },
    "capacity": "225 lb."
  },
  {
    "index": "warhorse",
    "name": "Warhorse",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Mounts and Other Animals",
    "cost": {
      "quantity": 400,
      "unit": "gp"
    },
    "speed": {
      "quantity": 60,
      "unit": "ft/round"
    },
    "capacity": "540 lb."
  },
  {
    "index": "barding-padded",
    "name": "Barding: Padded",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 16,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "barding-leather",
    "name": "Barding: Leather",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 40,
      "unit": "gp"
    },
    "weight": 20,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "barding-studded-leather",
    "name": "Barding: Studded Leather",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 180,
      "unit": "gp"
    },
    "weight": 26,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "barding-hide",
    "name": "Barding: Hide",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 40,
      "unit": "gp"
    },
    "weight": 24,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "barding-chain-shirt",
    "name": "Barding: Chain shirt",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 200,
      "unit": "gp"
    },
    "weight": 40,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "barding-scale-mail",
    "name": "Barding: Scale mail",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 200,
      "unit": "gp"
    },
    "weight": 90,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "barding-breastplate",
    "name": "Barding: Breastplate",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 1600,
      "unit": "gp"
    },
    "weight": 40,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "barding-half-plate",
    "name": "Barding: Half plate",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 3000,
      "unit": "gp"
    },
    "weight": 80,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "barding-ring-mail",
    "name": "Barding: Ring mail",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 12,
      "unit": "gp"
    },
    "weight": 80,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "barding-chain-mail",
    "name": "Barding: Chain mail",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 300,
      "unit": "gp"
    },
    "weight": 110,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "barding-splint",
    "name": "Barding: Splint",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 800,
      "unit": "gp"
    },
    "weight": 120,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "barding-plate",
    "name": "Barding: Plate",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 6000,
      "unit": "gp"
    },
    "weight": 130,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ]
  },
  {
    "index": "bit-and-bridle",
    "name": "Bit and bridle",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 1
  },
  {
    "index": "carriage",
    "name": "Carriage",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 100,
      "unit": "gp"
    },
    "weight": 600
  },
  {
    "index": "cart",
    "name": "Cart",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 15,
      "unit": "gp"
    },
    "weight": 200
  },
  {
    "index": "chariot",
    "name": "Chariot",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 250,
      "unit": "gp"
    },
    "weight": 100
  },
  {
    "index": "animal-feed-1-day",
    "name": "Animal Feed (1 day)",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "weight": 10
  },
  {
    "index": "saddle-exotic",
    "name": "Saddle, Exotic",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 60,
      "unit": "gp"
    },
    "weight": 50,
    "desc": [
      "An exotic saddle is required for riding any aquatic or flying mount."
    ]
  },
  {
    "index": "saddle-military",
    "name": "Saddle, Military",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 30,
    "desc": [
      "A military saddle braces the rider, helping you keep your seat on an active mount in battle. It gives you advantage on any check you make to remain mounted."
    ]
  },
  {
    "index": "saddle-pack",
    "name": "Saddle, Pack",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 15
  },
  {
    "index": "saddle-riding",
    "name": "Saddle, Riding",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 25
  },
  {
    "index": "saddlebags",
    "name": "Saddlebags",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 4,
      "unit": "gp"
    },
    "weight": 8
  },
  {
    "index": "sled",
    "name": "Sled",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 300
  },
  {
    "index": "stabling-1-day",
    "name": "Stabling (1 day)",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 0
  },
  {
    "index": "wagon",
    "name": "Wagon",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 35,
      "unit": "gp"
    },
    "weight": 400
  },
  {
    "index": "galley",
    "name": "Galley",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Waterborne Vehicles",
    "cost": {
      "quantity": 30000,
      "unit": "gp"
    },
    "speed": {
      "quantity": 4,
      "unit": "mph"
    }
  },
  {
    "index": "keelboat",
    "name": "Keelboat",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Waterborne Vehicles",
    "cost": {
      "quantity": 3000,
      "unit": "gp"
    },
    "speed": {
      "quantity": 1,
      "unit": "mph"
    },
    "desc": [
      "Keelboats and rowboats are used on lakes and rivers. If going downstream, add the speed of the current (typically 3 miles per hour) to the speed of the vehicle. These vehicles can't be rowed against any significant current, but they can be pulled upstream by draft animals on the shores. A rowboat weighs 100 pounds, in case adventurers carry it over land."
    ]
  },
  {
    "index": "longship",
    "name": "Longship",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Waterborne Vehicles",
    "cost": {
      "quantity": 10000,
      "unit": "gp"
    },
    "speed": {
      "quantity": 3,
      "unit": "mph"
    }
  },
  {
    "index": "rowboat",
    "name": "Rowboat",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Waterborne Vehicles",
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "speed": {
      "quantity": 1.5,
      "unit": "mph"
    },
    "desc": [
      "Keelboats and rowboats are used on lakes and rivers. If going downstream, add the speed of the current (typically 3 miles per hour) to the speed of the vehicle. These vehicles can't be rowed against any significant current, but they can be pulled upstream by draft animals on the shores. A rowboat weighs 100 pounds, in case adventurers carry it over land."
    ]
  },
  {
    "index": "sailing-ship",
    "name": "Sailing ship",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Waterborne Vehicles",
    "cost": {
      "quantity": 10000,
      "unit": "gp"
    },
    "speed": {
      "quantity": 2,
      "unit": "mph"
    }
  },
  {
    "index": "warship",
    "name": "Warship",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles"
    },
    "vehicle_category": "Waterborne Vehicles",
    "cost": {
      "quantity": 25000,
      "unit": "gp"
    },
    "speed": {
      "quantity": 2.5,
      "unit": "mph"
    }
  }
]`) as ReadonlyArray<SourceRow>;

export const EQUIPMENT_CATEGORY_RAW = JSON.parse(String.raw`[
  {
    "index": "weapon",
    "name": "Weapon",
    "equipment": [
      {
        "index": "club",
        "name": "Club"
      },
      {
        "index": "dagger",
        "name": "Dagger"
      },
      {
        "index": "greatclub",
        "name": "Greatclub"
      },
      {
        "index": "handaxe",
        "name": "Handaxe"
      },
      {
        "index": "javelin",
        "name": "Javelin"
      },
      {
        "index": "light-hammer",
        "name": "Light hammer"
      },
      {
        "index": "mace",
        "name": "Mace"
      },
      {
        "index": "quarterstaff",
        "name": "Quarterstaff"
      },
      {
        "index": "sickle",
        "name": "Sickle"
      },
      {
        "index": "spear",
        "name": "Spear"
      },
      {
        "index": "crossbow-light",
        "name": "Crossbow, light"
      },
      {
        "index": "dart",
        "name": "Dart"
      },
      {
        "index": "shortbow",
        "name": "Shortbow"
      },
      {
        "index": "sling",
        "name": "Sling"
      },
      {
        "index": "battleaxe",
        "name": "Battleaxe"
      },
      {
        "index": "flail",
        "name": "Flail"
      },
      {
        "index": "glaive",
        "name": "Glaive"
      },
      {
        "index": "greataxe",
        "name": "Greataxe"
      },
      {
        "index": "greatsword",
        "name": "Greatsword"
      },
      {
        "index": "halberd",
        "name": "Halberd"
      },
      {
        "index": "lance",
        "name": "Lance"
      },
      {
        "index": "longsword",
        "name": "Longsword"
      },
      {
        "index": "maul",
        "name": "Maul"
      },
      {
        "index": "morningstar",
        "name": "Morningstar"
      },
      {
        "index": "pike",
        "name": "Pike"
      },
      {
        "index": "rapier",
        "name": "Rapier"
      },
      {
        "index": "scimitar",
        "name": "Scimitar"
      },
      {
        "index": "shortsword",
        "name": "Shortsword"
      },
      {
        "index": "trident",
        "name": "Trident"
      },
      {
        "index": "war-pick",
        "name": "War pick"
      },
      {
        "index": "warhammer",
        "name": "Warhammer"
      },
      {
        "index": "whip",
        "name": "Whip"
      },
      {
        "index": "blowgun",
        "name": "Blowgun"
      },
      {
        "index": "crossbow-hand",
        "name": "Crossbow, hand"
      },
      {
        "index": "crossbow-heavy",
        "name": "Crossbow, heavy"
      },
      {
        "index": "longbow",
        "name": "Longbow"
      },
      {
        "index": "net",
        "name": "Net"
      },
      {
        "index": "berserker-axe",
        "name": "Berserker Axe"
      },
      {
        "index": "dagger-of-venom",
        "name": "Dagger of Venom"
      },
      {
        "index": "dancing-sword",
        "name": "Dancing Sword"
      },
      {
        "index": "defender",
        "name": "Defender"
      },
      {
        "index": "dragon-slayer",
        "name": "Dragon Slayer"
      },
      {
        "index": "dwarven-thrower",
        "name": "Dwarven Thrower"
      },
      {
        "index": "flame-tongue",
        "name": "Flame Tongue"
      },
      {
        "index": "frost-brand",
        "name": "Frost Brand"
      },
      {
        "index": "giant-slayer",
        "name": "Giant Slayer"
      },
      {
        "index": "hammer-of-thunderbolts",
        "name": "Hammer of Thunderbolts"
      },
      {
        "index": "holy-avenger",
        "name": "Holy Avenger"
      },
      {
        "index": "javelin-of-lightning",
        "name": "Javelin of Lightning"
      },
      {
        "index": "luck-blade",
        "name": "Luck Blade"
      },
      {
        "index": "mace-of-disruption",
        "name": "Mace of Disruption"
      },
      {
        "index": "mace-of-smiting",
        "name": "Mace of Smiting"
      },
      {
        "index": "mace-of-terror",
        "name": "Mace of Terror"
      },
      {
        "index": "nine-lives-stealer",
        "name": "Nine Lives Stealer"
      },
      {
        "index": "oathbow",
        "name": "Oathbow"
      },
      {
        "index": "scimitar-of-speed",
        "name": "Scimitar of Speed"
      },
      {
        "index": "sun-blade",
        "name": "Sun Blade"
      },
      {
        "index": "sword-of-life-stealing",
        "name": "Sword of Life Stealing"
      },
      {
        "index": "sword-of-sharpness",
        "name": "Sword of Sharpness"
      },
      {
        "index": "sword-of-wounding",
        "name": "Sword of Wounding"
      },
      {
        "index": "trident-of-fish-command",
        "name": "Trident of Fish Command"
      },
      {
        "index": "vicious-weapon",
        "name": "Vicious Weapon"
      },
      {
        "index": "vorpal-sword",
        "name": "Vorpal Sword"
      },
      {
        "index": "weapon",
        "name": "Weapon, +1, +2, or +3"
      },
      {
        "index": "weapon-1",
        "name": "Weapon, +1"
      },
      {
        "index": "weapon-2",
        "name": "Weapon, +2"
      },
      {
        "index": "weapon-3",
        "name": "Weapon, +3"
      }
    ]
  },
  {
    "index": "armor",
    "name": "Armor",
    "equipment": [
      {
        "index": "padded-armor",
        "name": "Padded Armor"
      },
      {
        "index": "leather-armor",
        "name": "Leather Armor"
      },
      {
        "index": "studded-leather-armor",
        "name": "Studded Leather Armor"
      },
      {
        "index": "hide-armor",
        "name": "Hide Armor"
      },
      {
        "index": "chain-shirt",
        "name": "Chain Shirt"
      },
      {
        "index": "scale-mail",
        "name": "Scale Mail"
      },
      {
        "index": "breastplate",
        "name": "Breastplate"
      },
      {
        "index": "half-plate-armor",
        "name": "Half Plate Armor"
      },
      {
        "index": "ring-mail",
        "name": "Ring Mail"
      },
      {
        "index": "chain-mail",
        "name": "Chain Mail"
      },
      {
        "index": "splint-armor",
        "name": "Splint Armor"
      },
      {
        "index": "plate-armor",
        "name": "Plate Armor"
      },
      {
        "index": "shield",
        "name": "Shield"
      },
      {
        "index": "adamantine-armor",
        "name": "Adamantine Armor"
      },
      {
        "index": "animated-shield",
        "name": "Animated Shield"
      },
      {
        "index": "armor",
        "name": "Armor, +1, +2, or +3"
      },
      {
        "index": "armor-of-invulnerability",
        "name": "Armor of Invulnerability"
      },
      {
        "index": "armor-of-resistance",
        "name": "Armor of Resistance"
      },
      {
        "index": "armor-of-vulnerability",
        "name": "Armor of Vulnerability"
      },
      {
        "index": "arrow-catching-shield",
        "name": "Arrow-Catching Shield"
      },
      {
        "index": "demon-armor",
        "name": "Demon Armor"
      },
      {
        "index": "dragon-scale-mail",
        "name": "Dragon Scale Mail"
      },
      {
        "index": "dwarven-plate",
        "name": "Dwarven Plate"
      },
      {
        "index": "elven-chain",
        "name": "Elven Chain"
      },
      {
        "index": "glamoured-studded-leather-armor",
        "name": "Glamoured Studded Leather Armor"
      },
      {
        "index": "mithral-armor",
        "name": "Mithral Armor"
      },
      {
        "index": "plate-armor-of-etherealness",
        "name": "Plate Armor of Etherealness"
      },
      {
        "index": "shield-of-missile-attraction",
        "name": "Shield of Missile Attraction"
      },
      {
        "index": "spellguard-shield",
        "name": "Spellguard Shield"
      },
      {
        "index": "armor-1",
        "name": "Armor, +1"
      },
      {
        "index": "armor-2",
        "name": "Armor, +2"
      },
      {
        "index": "armor-3",
        "name": "Armor, +3"
      },
      {
        "index": "dragon-scale-mail-black",
        "name": "Black Dragon Scale Mail"
      },
      {
        "index": "dragon-scale-mail-blue",
        "name": "Blue Dragon Scale Mail"
      },
      {
        "index": "dragon-scale-mail-brass",
        "name": "Brass Dragon Scale Mail"
      },
      {
        "index": "dragon-scale-mail-bronze",
        "name": "Bronze Dragon Scale Mail"
      },
      {
        "index": "dragon-scale-mail-copper",
        "name": "Copper Dragon Scale Mail"
      },
      {
        "index": "dragon-scale-mail-gold",
        "name": "Gold Dragon Scale Mail"
      },
      {
        "index": "dragon-scale-mail-green",
        "name": "Green Dragon Scale Mail"
      },
      {
        "index": "dragon-scale-mail-red",
        "name": "Red Dragon Scale Mail"
      },
      {
        "index": "dragon-scale-mail-silver",
        "name": "Silver Dragon Scale Mail"
      },
      {
        "index": "dragon-scale-mail-white",
        "name": "White Dragon Scale Mail"
      }
    ]
  },
  {
    "index": "adventuring-gear",
    "name": "Adventuring Gear",
    "equipment": [
      {
        "index": "abacus",
        "name": "Abacus"
      },
      {
        "index": "acid-vial",
        "name": "Acid (vial)"
      },
      {
        "index": "alchemists-fire-flask",
        "name": "Alchemist's fire (flask)"
      },
      {
        "index": "arrow",
        "name": "Arrow"
      },
      {
        "index": "blowgun-needle",
        "name": "Blowgun needle"
      },
      {
        "index": "crossbow-bolt",
        "name": "Crossbow bolt"
      },
      {
        "index": "sling-bullet",
        "name": "Sling bullet"
      },
      {
        "index": "alms-box",
        "name": "Alms box"
      },
      {
        "index": "amulet",
        "name": "Amulet"
      },
      {
        "index": "antitoxin-vial",
        "name": "Antitoxin (vial)"
      },
      {
        "index": "backpack",
        "name": "Backpack"
      },
      {
        "index": "ball-bearings-bag-of-1000",
        "name": "Ball bearings (bag of 1,000)"
      },
      {
        "index": "barrel",
        "name": "Barrel"
      },
      {
        "index": "basket",
        "name": "Basket"
      },
      {
        "index": "bedroll",
        "name": "Bedroll"
      },
      {
        "index": "bell",
        "name": "Bell"
      },
      {
        "index": "blanket",
        "name": "Blanket"
      },
      {
        "index": "block-and-tackle",
        "name": "Block and tackle"
      },
      {
        "index": "block-of-incense",
        "name": "Block of incense"
      },
      {
        "index": "book",
        "name": "Book"
      },
      {
        "index": "bottle-glass",
        "name": "Bottle, glass"
      },
      {
        "index": "bucket",
        "name": "Bucket"
      },
      {
        "index": "caltrops",
        "name": "Caltrops"
      },
      {
        "index": "candle",
        "name": "Candle"
      },
      {
        "index": "case-crossbow-bolt",
        "name": "Case, crossbow bolt"
      },
      {
        "index": "case-map-or-scroll",
        "name": "Case, map or scroll"
      },
      {
        "index": "censer",
        "name": "Censer"
      },
      {
        "index": "chain-10-feet",
        "name": "Chain (10 feet)"
      },
      {
        "index": "chalk-1-piece",
        "name": "Chalk (1 piece)"
      },
      {
        "index": "chest",
        "name": "Chest"
      },
      {
        "index": "clothes-common",
        "name": "Clothes, common"
      },
      {
        "index": "clothes-costume",
        "name": "Clothes, costume"
      },
      {
        "index": "clothes-fine",
        "name": "Clothes, fine"
      },
      {
        "index": "clothes-travelers",
        "name": "Clothes, traveler's"
      },
      {
        "index": "component-pouch",
        "name": "Component pouch"
      },
      {
        "index": "crowbar",
        "name": "Crowbar"
      },
      {
        "index": "emblem",
        "name": "Emblem"
      },
      {
        "index": "fishing-tackle",
        "name": "Fishing tackle"
      },
      {
        "index": "flask-or-tankard",
        "name": "Flask or tankard"
      },
      {
        "index": "grappling-hook",
        "name": "Grappling hook"
      },
      {
        "index": "hammer",
        "name": "Hammer"
      },
      {
        "index": "hammer-sledge",
        "name": "Hammer, sledge"
      },
      {
        "index": "holy-water-flask",
        "name": "Holy water (flask)"
      },
      {
        "index": "hourglass",
        "name": "Hourglass"
      },
      {
        "index": "hunting-trap",
        "name": "Hunting trap"
      },
      {
        "index": "ink-1-ounce-bottle",
        "name": "Ink (1 ounce bottle)"
      },
      {
        "index": "ink-pen",
        "name": "Ink pen"
      },
      {
        "index": "jug-or-pitcher",
        "name": "Jug or pitcher"
      },
      {
        "index": "climbers-kit",
        "name": "Climber's Kit"
      },
      {
        "index": "disguise-kit",
        "name": "Disguise Kit"
      },
      {
        "index": "forgery-kit",
        "name": "Forgery Kit"
      },
      {
        "index": "herbalism-kit",
        "name": "Herbalism Kit"
      },
      {
        "index": "healers-kit",
        "name": "Healer's Kit"
      },
      {
        "index": "mess-kit",
        "name": "Mess Kit"
      },
      {
        "index": "poisoners-kit",
        "name": "Poisoner's Kit"
      },
      {
        "index": "ladder-10-foot",
        "name": "Ladder (10-foot)"
      },
      {
        "index": "lamp",
        "name": "Lamp"
      },
      {
        "index": "lantern-bullseye",
        "name": "Lantern, bullseye"
      },
      {
        "index": "lantern-hooded",
        "name": "Lantern, hooded"
      },
      {
        "index": "little-bag-of-sand",
        "name": "Little bag of sand"
      },
      {
        "index": "lock",
        "name": "Lock"
      },
      {
        "index": "magnifying-glass",
        "name": "Magnifying glass"
      },
      {
        "index": "manacles",
        "name": "Manacles"
      },
      {
        "index": "mirror-steel",
        "name": "Mirror, steel"
      },
      {
        "index": "oil-flask",
        "name": "Oil (flask)"
      },
      {
        "index": "paper-one-sheet",
        "name": "Paper (one sheet)"
      },
      {
        "index": "parchment-one-sheet",
        "name": "Parchment (one sheet)"
      },
      {
        "index": "perfume-vial",
        "name": "Perfume (vial)"
      },
      {
        "index": "pick-miners",
        "name": "Pick, miner's"
      },
      {
        "index": "piton",
        "name": "Piton"
      },
      {
        "index": "poison-basic-vial",
        "name": "Poison, basic (vial)"
      },
      {
        "index": "pole-10-foot",
        "name": "Pole (10-foot)"
      },
      {
        "index": "pot-iron",
        "name": "Pot, iron"
      },
      {
        "index": "pouch",
        "name": "Pouch"
      },
      {
        "index": "quiver",
        "name": "Quiver"
      },
      {
        "index": "ram-portable",
        "name": "Ram, portable"
      },
      {
        "index": "rations-1-day",
        "name": "Rations (1 day)"
      },
      {
        "index": "reliquary",
        "name": "Reliquary"
      },
      {
        "index": "robes",
        "name": "Robes"
      },
      {
        "index": "rope-hempen-50-feet",
        "name": "Rope, hempen (50 feet)"
      },
      {
        "index": "rope-silk-50-feet",
        "name": "Rope, silk (50 feet)"
      },
      {
        "index": "sack",
        "name": "Sack"
      },
      {
        "index": "scale-merchants",
        "name": "Scale, merchant's"
      },
      {
        "index": "sealing-wax",
        "name": "Sealing wax"
      },
      {
        "index": "shovel",
        "name": "Shovel"
      },
      {
        "index": "signal-whistle",
        "name": "Signal whistle"
      },
      {
        "index": "signet-ring",
        "name": "Signet ring"
      },
      {
        "index": "small-knife",
        "name": "Small knife"
      },
      {
        "index": "soap",
        "name": "Soap"
      },
      {
        "index": "spellbook",
        "name": "Spellbook"
      },
      {
        "index": "spike-iron",
        "name": "Spike, iron"
      },
      {
        "index": "spyglass",
        "name": "Spyglass"
      },
      {
        "index": "string-10-feet",
        "name": "String (10 feet)"
      },
      {
        "index": "tent-two-person",
        "name": "Tent, two-person"
      },
      {
        "index": "tinderbox",
        "name": "Tinderbox"
      },
      {
        "index": "torch",
        "name": "Torch"
      },
      {
        "index": "vestments",
        "name": "Vestments"
      },
      {
        "index": "vial",
        "name": "Vial"
      },
      {
        "index": "waterskin",
        "name": "Waterskin"
      },
      {
        "index": "whetstone",
        "name": "Whetstone"
      },
      {
        "index": "burglars-pack",
        "name": "Burglar's Pack"
      },
      {
        "index": "diplomats-pack",
        "name": "Diplomat's Pack"
      },
      {
        "index": "dungeoneers-pack",
        "name": "Dungeoneer's Pack"
      },
      {
        "index": "entertainers-pack",
        "name": "Entertainer's Pack"
      },
      {
        "index": "explorers-pack",
        "name": "Explorer's Pack"
      },
      {
        "index": "priests-pack",
        "name": "Priest's Pack"
      },
      {
        "index": "scholars-pack",
        "name": "Scholar's Pack"
      },
      {
        "index": "crystal",
        "name": "Crystal"
      },
      {
        "index": "orb",
        "name": "Orb"
      },
      {
        "index": "rod",
        "name": "Rod"
      },
      {
        "index": "staff",
        "name": "Staff"
      },
      {
        "index": "wand",
        "name": "Wand"
      },
      {
        "index": "sprig-of-mistletoe",
        "name": "Sprig of mistletoe"
      },
      {
        "index": "totem",
        "name": "Totem"
      },
      {
        "index": "wooden-staff",
        "name": "Wooden staff"
      },
      {
        "index": "yew-wand",
        "name": "Yew wand"
      }
    ]
  },
  {
    "index": "ammunition",
    "name": "Ammunition",
    "equipment": [
      {
        "index": "arrow",
        "name": "Arrow"
      },
      {
        "index": "blowgun-needle",
        "name": "Blowgun needle"
      },
      {
        "index": "crossbow-bolt",
        "name": "Crossbow bolt"
      },
      {
        "index": "sling-bullet",
        "name": "Sling bullet"
      },
      {
        "index": "ammunition",
        "name": "Ammunition, +1, +2, or +3"
      },
      {
        "index": "arrow-of-slaying",
        "name": "Arrow of Slaying"
      },
      {
        "index": "ammunition-1",
        "name": "Ammunition, +1"
      },
      {
        "index": "ammunition-2",
        "name": "Ammunition, +2"
      },
      {
        "index": "ammunition-3",
        "name": "Ammunition, +3"
      }
    ]
  },
  {
    "index": "tools",
    "name": "Tools",
    "equipment": [
      {
        "index": "alchemists-supplies",
        "name": "Alchemist's Supplies"
      },
      {
        "index": "brewers-supplies",
        "name": "Brewer's Supplies"
      },
      {
        "index": "calligraphers-supplies",
        "name": "Calligrapher's Supplies"
      },
      {
        "index": "carpenters-tools",
        "name": "Carpenter's Tools"
      },
      {
        "index": "cartographers-tools",
        "name": "Cartographer's Tools"
      },
      {
        "index": "cobblers-tools",
        "name": "Cobbler's Tools"
      },
      {
        "index": "cooks-utensils",
        "name": "Cook's utensils"
      },
      {
        "index": "glassblowers-tools",
        "name": "Glassblower's Tools"
      },
      {
        "index": "jewelers-tools",
        "name": "Jeweler's Tools"
      },
      {
        "index": "leatherworkers-tools",
        "name": "Leatherworker's Tools"
      },
      {
        "index": "masons-tools",
        "name": "Mason's Tools"
      },
      {
        "index": "painters-supplies",
        "name": "Painter's Supplies"
      },
      {
        "index": "potters-tools",
        "name": "Potter's Tools"
      },
      {
        "index": "smiths-tools",
        "name": "Smith's Tools"
      },
      {
        "index": "tinkers-tools",
        "name": "Tinker's Tools"
      },
      {
        "index": "weavers-tools",
        "name": "Weaver's Tools"
      },
      {
        "index": "woodcarvers-tools",
        "name": "Woodcarver's Tools"
      },
      {
        "index": "dice-set",
        "name": "Dice Set"
      },
      {
        "index": "playing-card-set",
        "name": "Playing Card Set"
      },
      {
        "index": "bagpipes",
        "name": "Bagpipes"
      },
      {
        "index": "drum",
        "name": "Drum"
      },
      {
        "index": "dulcimer",
        "name": "Dulcimer"
      },
      {
        "index": "flute",
        "name": "Flute"
      },
      {
        "index": "lute",
        "name": "Lute"
      },
      {
        "index": "lyre",
        "name": "Lyre"
      },
      {
        "index": "horn",
        "name": "Horn"
      },
      {
        "index": "pan-flute",
        "name": "Pan flute"
      },
      {
        "index": "shawm",
        "name": "Shawm"
      },
      {
        "index": "viol",
        "name": "Viol"
      },
      {
        "index": "navigators-tools",
        "name": "Navigator's Tools"
      },
      {
        "index": "thieves-tools",
        "name": "Thieves' Tools"
      }
    ]
  },
  {
    "index": "mounts-and-vehicles",
    "name": "Mounts and Vehicles",
    "equipment": [
      {
        "index": "mule",
        "name": "Mule"
      },
      {
        "index": "elephant",
        "name": "Elephant"
      },
      {
        "index": "horse-draft",
        "name": "Horse, draft"
      },
      {
        "index": "horse-riding",
        "name": "Horse, riding"
      },
      {
        "index": "mastiff",
        "name": "Mastiff"
      },
      {
        "index": "pony",
        "name": "Pony"
      },
      {
        "index": "warhorse",
        "name": "Warhorse"
      },
      {
        "index": "barding-padded",
        "name": "Barding: Padded"
      },
      {
        "index": "barding-leather",
        "name": "Barding: Leather"
      },
      {
        "index": "barding-studded-leather",
        "name": "Barding: Studded Leather"
      },
      {
        "index": "barding-hide",
        "name": "Barding: Hide"
      },
      {
        "index": "barding-chain-shirt",
        "name": "Barding: Chain shirt"
      },
      {
        "index": "barding-scale-mail",
        "name": "Barding: Scale mail"
      },
      {
        "index": "barding-breastplate",
        "name": "Barding: Breastplate"
      },
      {
        "index": "barding-half-plate",
        "name": "Barding: Half plate"
      },
      {
        "index": "barding-ring-mail",
        "name": "Barding: Ring mail"
      },
      {
        "index": "barding-chain-mail",
        "name": "Barding: Chain mail"
      },
      {
        "index": "barding-splint",
        "name": "Barding: Splint"
      },
      {
        "index": "barding-plate",
        "name": "Barding: Plate"
      },
      {
        "index": "bit-and-bridle",
        "name": "Bit and bridle"
      },
      {
        "index": "carriage",
        "name": "Carriage"
      },
      {
        "index": "cart",
        "name": "Cart"
      },
      {
        "index": "chariot",
        "name": "Chariot"
      },
      {
        "index": "animal-feed-1-day",
        "name": "Animal Feed (1 day)"
      },
      {
        "index": "saddle-exotic",
        "name": "Saddle, Exotic"
      },
      {
        "index": "saddle-military",
        "name": "Saddle, Military"
      },
      {
        "index": "saddle-pack",
        "name": "Saddle, Pack"
      },
      {
        "index": "saddle-riding",
        "name": "Saddle, Riding"
      },
      {
        "index": "saddlebags",
        "name": "Saddlebags"
      },
      {
        "index": "sled",
        "name": "Sled"
      },
      {
        "index": "stabling-1-day",
        "name": "Stabling (1 day)"
      },
      {
        "index": "wagon",
        "name": "Wagon"
      },
      {
        "index": "barding-padded",
        "name": "Barding: Padded"
      },
      {
        "index": "barding-leather",
        "name": "Barding: Leather"
      },
      {
        "index": "barding-studded-leather",
        "name": "Barding: Studded Leather"
      },
      {
        "index": "barding-hide",
        "name": "Barding: Hide"
      },
      {
        "index": "barding-chain-shirt",
        "name": "Barding: Chain shirt"
      },
      {
        "index": "barding-scale-mail",
        "name": "Barding: Scale mail"
      },
      {
        "index": "barding-breastplate",
        "name": "Barding: Breastplate"
      },
      {
        "index": "barding-half-plate",
        "name": "Barding: Half plate"
      },
      {
        "index": "barding-ring-mail",
        "name": "Barding: Ring mail"
      },
      {
        "index": "barding-chain-mail",
        "name": "Barding: Chain mail"
      },
      {
        "index": "barding-splint",
        "name": "Barding: Splint"
      },
      {
        "index": "barding-plate",
        "name": "Barding: Plate"
      },
      {
        "index": "bit-and-bridle",
        "name": "Bit and bridle"
      },
      {
        "index": "carriage",
        "name": "Carriage"
      },
      {
        "index": "cart",
        "name": "Cart"
      },
      {
        "index": "chariot",
        "name": "Chariot"
      },
      {
        "index": "animal-feed-1-day",
        "name": "Animal Feed (1 day)"
      },
      {
        "index": "saddle-exotic",
        "name": "Saddle, Exotic"
      },
      {
        "index": "saddle-military",
        "name": "Saddle, Military"
      },
      {
        "index": "saddle-pack",
        "name": "Saddle, Pack"
      },
      {
        "index": "saddle-riding",
        "name": "Saddle, Riding"
      },
      {
        "index": "saddlebags",
        "name": "Saddlebags"
      },
      {
        "index": "sled",
        "name": "Sled"
      },
      {
        "index": "stabling-1-day",
        "name": "Stabling (1 day)"
      },
      {
        "index": "wagon",
        "name": "Wagon"
      },
      {
        "index": "galley",
        "name": "Galley"
      },
      {
        "index": "keelboat",
        "name": "Keelboat"
      },
      {
        "index": "longship",
        "name": "Longship"
      },
      {
        "index": "rowboat",
        "name": "Rowboat"
      },
      {
        "index": "sailing-ship",
        "name": "Sailing ship"
      },
      {
        "index": "warship",
        "name": "Warship"
      }
    ]
  },
  {
    "index": "simple-weapons",
    "name": "Simple Weapons",
    "equipment": [
      {
        "index": "club",
        "name": "Club"
      },
      {
        "index": "dagger",
        "name": "Dagger"
      },
      {
        "index": "greatclub",
        "name": "Greatclub"
      },
      {
        "index": "handaxe",
        "name": "Handaxe"
      },
      {
        "index": "javelin",
        "name": "Javelin"
      },
      {
        "index": "light-hammer",
        "name": "Light hammer"
      },
      {
        "index": "mace",
        "name": "Mace"
      },
      {
        "index": "quarterstaff",
        "name": "Quarterstaff"
      },
      {
        "index": "sickle",
        "name": "Sickle"
      },
      {
        "index": "spear",
        "name": "Spear"
      },
      {
        "index": "crossbow-light",
        "name": "Crossbow, light"
      },
      {
        "index": "dart",
        "name": "Dart"
      },
      {
        "index": "shortbow",
        "name": "Shortbow"
      },
      {
        "index": "sling",
        "name": "Sling"
      }
    ]
  },
  {
    "index": "martial-weapons",
    "name": "Martial Weapons",
    "equipment": [
      {
        "index": "battleaxe",
        "name": "Battleaxe"
      },
      {
        "index": "flail",
        "name": "Flail"
      },
      {
        "index": "glaive",
        "name": "Glaive"
      },
      {
        "index": "greataxe",
        "name": "Greataxe"
      },
      {
        "index": "greatsword",
        "name": "Greatsword"
      },
      {
        "index": "halberd",
        "name": "Halberd"
      },
      {
        "index": "lance",
        "name": "Lance"
      },
      {
        "index": "longsword",
        "name": "Longsword"
      },
      {
        "index": "maul",
        "name": "Maul"
      },
      {
        "index": "morningstar",
        "name": "Morningstar"
      },
      {
        "index": "pike",
        "name": "Pike"
      },
      {
        "index": "rapier",
        "name": "Rapier"
      },
      {
        "index": "scimitar",
        "name": "Scimitar"
      },
      {
        "index": "shortsword",
        "name": "Shortsword"
      },
      {
        "index": "trident",
        "name": "Trident"
      },
      {
        "index": "war-pick",
        "name": "War pick"
      },
      {
        "index": "warhammer",
        "name": "Warhammer"
      },
      {
        "index": "whip",
        "name": "Whip"
      },
      {
        "index": "blowgun",
        "name": "Blowgun"
      },
      {
        "index": "crossbow-hand",
        "name": "Crossbow, hand"
      },
      {
        "index": "crossbow-heavy",
        "name": "Crossbow, heavy"
      },
      {
        "index": "longbow",
        "name": "Longbow"
      },
      {
        "index": "net",
        "name": "Net"
      }
    ]
  },
  {
    "index": "melee-weapons",
    "name": "Melee Weapons",
    "equipment": [
      {
        "index": "battleaxe",
        "name": "Battleaxe"
      },
      {
        "index": "club",
        "name": "Club"
      },
      {
        "index": "dagger",
        "name": "Dagger"
      },
      {
        "index": "flail",
        "name": "Flail"
      },
      {
        "index": "glaive",
        "name": "Glaive"
      },
      {
        "index": "greataxe",
        "name": "Greataxe"
      },
      {
        "index": "greatclub",
        "name": "Greatclub"
      },
      {
        "index": "greatsword",
        "name": "Greatsword"
      },
      {
        "index": "halberd",
        "name": "Halberd"
      },
      {
        "index": "handaxe",
        "name": "Handaxe"
      },
      {
        "index": "javelin",
        "name": "Javelin"
      },
      {
        "index": "lance",
        "name": "Lance"
      },
      {
        "index": "light-hammer",
        "name": "Light hammer"
      },
      {
        "index": "longsword",
        "name": "Longsword"
      },
      {
        "index": "mace",
        "name": "Mace"
      },
      {
        "index": "maul",
        "name": "Maul"
      },
      {
        "index": "morningstar",
        "name": "Morningstar"
      },
      {
        "index": "pike",
        "name": "Pike"
      },
      {
        "index": "quarterstaff",
        "name": "Quarterstaff"
      },
      {
        "index": "rapier",
        "name": "Rapier"
      },
      {
        "index": "scimitar",
        "name": "Scimitar"
      },
      {
        "index": "shortsword",
        "name": "Shortsword"
      },
      {
        "index": "sickle",
        "name": "Sickle"
      },
      {
        "index": "spear",
        "name": "Spear"
      },
      {
        "index": "trident",
        "name": "Trident"
      },
      {
        "index": "war-pick",
        "name": "War pick"
      },
      {
        "index": "warhammer",
        "name": "Warhammer"
      },
      {
        "index": "whip",
        "name": "Whip"
      }
    ]
  },
  {
    "index": "ranged-weapons",
    "name": "Ranged Weapons",
    "equipment": [
      {
        "index": "blowgun",
        "name": "Blowgun"
      },
      {
        "index": "crossbow-hand",
        "name": "Crossbow, hand"
      },
      {
        "index": "crossbow-heavy",
        "name": "Crossbow, heavy"
      },
      {
        "index": "crossbow-light",
        "name": "Crossbow, light"
      },
      {
        "index": "dart",
        "name": "Dart"
      },
      {
        "index": "longbow",
        "name": "Longbow"
      },
      {
        "index": "net",
        "name": "Net"
      },
      {
        "index": "shortbow",
        "name": "Shortbow"
      },
      {
        "index": "sling",
        "name": "Sling"
      }
    ]
  },
  {
    "index": "simple-melee-weapons",
    "name": "Simple Melee Weapons",
    "equipment": [
      {
        "index": "club",
        "name": "Club"
      },
      {
        "index": "dagger",
        "name": "Dagger"
      },
      {
        "index": "greatclub",
        "name": "Greatclub"
      },
      {
        "index": "handaxe",
        "name": "Handaxe"
      },
      {
        "index": "javelin",
        "name": "Javelin"
      },
      {
        "index": "light-hammer",
        "name": "Light hammer"
      },
      {
        "index": "mace",
        "name": "Mace"
      },
      {
        "index": "quarterstaff",
        "name": "Quarterstaff"
      },
      {
        "index": "sickle",
        "name": "Sickle"
      },
      {
        "index": "spear",
        "name": "Spear"
      }
    ]
  },
  {
    "index": "simple-ranged-weapons",
    "name": "Simple Ranged Weapons",
    "equipment": [
      {
        "index": "crossbow-light",
        "name": "Crossbow, light"
      },
      {
        "index": "dart",
        "name": "Dart"
      },
      {
        "index": "shortbow",
        "name": "Shortbow"
      },
      {
        "index": "sling",
        "name": "Sling"
      }
    ]
  },
  {
    "index": "martial-melee-weapons",
    "name": "Martial Melee Weapons",
    "equipment": [
      {
        "index": "battleaxe",
        "name": "Battleaxe"
      },
      {
        "index": "flail",
        "name": "Flail"
      },
      {
        "index": "glaive",
        "name": "Glaive"
      },
      {
        "index": "greataxe",
        "name": "Greataxe"
      },
      {
        "index": "greatsword",
        "name": "Greatsword"
      },
      {
        "index": "halberd",
        "name": "Halberd"
      },
      {
        "index": "lance",
        "name": "Lance"
      },
      {
        "index": "longsword",
        "name": "Longsword"
      },
      {
        "index": "maul",
        "name": "Maul"
      },
      {
        "index": "morningstar",
        "name": "Morningstar"
      },
      {
        "index": "pike",
        "name": "Pike"
      },
      {
        "index": "rapier",
        "name": "Rapier"
      },
      {
        "index": "scimitar",
        "name": "Scimitar"
      },
      {
        "index": "shortsword",
        "name": "Shortsword"
      },
      {
        "index": "trident",
        "name": "Trident"
      },
      {
        "index": "war-pick",
        "name": "War pick"
      },
      {
        "index": "warhammer",
        "name": "Warhammer"
      },
      {
        "index": "whip",
        "name": "Whip"
      }
    ]
  },
  {
    "index": "martial-ranged-weapons",
    "name": "Martial Ranged Weapons",
    "equipment": [
      {
        "index": "blowgun",
        "name": "Blowgun"
      },
      {
        "index": "crossbow-hand",
        "name": "Crossbow, hand"
      },
      {
        "index": "crossbow-heavy",
        "name": "Crossbow, heavy"
      },
      {
        "index": "longbow",
        "name": "Longbow"
      },
      {
        "index": "net",
        "name": "Net"
      }
    ]
  },
  {
    "index": "light-armor",
    "name": "Light Armor",
    "equipment": [
      {
        "index": "padded-armor",
        "name": "Padded Armor"
      },
      {
        "index": "leather-armor",
        "name": "Leather Armor"
      },
      {
        "index": "studded-leather-armor",
        "name": "Studded Leather Armor"
      }
    ]
  },
  {
    "index": "medium-armor",
    "name": "Medium Armor",
    "equipment": [
      {
        "index": "hide-armor",
        "name": "Hide Armor"
      },
      {
        "index": "chain-shirt",
        "name": "Chain Shirt"
      },
      {
        "index": "scale-mail",
        "name": "Scale Mail"
      },
      {
        "index": "breastplate",
        "name": "Breastplate"
      },
      {
        "index": "half-plate-armor",
        "name": "Half Plate Armor"
      }
    ]
  },
  {
    "index": "heavy-armor",
    "name": "Heavy Armor",
    "equipment": [
      {
        "index": "ring-mail",
        "name": "Ring Mail"
      },
      {
        "index": "chain-mail",
        "name": "Chain Mail"
      },
      {
        "index": "splint-armor",
        "name": "Splint Armor"
      },
      {
        "index": "plate-armor",
        "name": "Plate Armor"
      }
    ]
  },
  {
    "index": "shields",
    "name": "Shields",
    "equipment": [
      {
        "index": "shield",
        "name": "Shield"
      }
    ]
  },
  {
    "index": "standard-gear",
    "name": "Standard Gear",
    "equipment": [
      {
        "index": "abacus",
        "name": "Abacus"
      },
      {
        "index": "acid-vial",
        "name": "Acid (vial)"
      },
      {
        "index": "alchemists-fire-flask",
        "name": "Alchemist's fire (flask)"
      },
      {
        "index": "arrow",
        "name": "Arrow"
      },
      {
        "index": "blowgun-needle",
        "name": "Blowgun needle"
      },
      {
        "index": "crossbow-bolt",
        "name": "Crossbow bolt"
      },
      {
        "index": "sling-bullet",
        "name": "Sling bullet"
      },
      {
        "index": "alms-box",
        "name": "Alms box"
      },
      {
        "index": "antitoxin-vial",
        "name": "Antitoxin (vial)"
      },
      {
        "index": "backpack",
        "name": "Backpack"
      },
      {
        "index": "ball-bearings-bag-of-1000",
        "name": "Ball bearings (bag of 1,000)"
      },
      {
        "index": "barrel",
        "name": "Barrel"
      },
      {
        "index": "basket",
        "name": "Basket"
      },
      {
        "index": "bedroll",
        "name": "Bedroll"
      },
      {
        "index": "bell",
        "name": "Bell"
      },
      {
        "index": "blanket",
        "name": "Blanket"
      },
      {
        "index": "block-and-tackle",
        "name": "Block and tackle"
      },
      {
        "index": "block-of-incense",
        "name": "Block of incense"
      },
      {
        "index": "book",
        "name": "Book"
      },
      {
        "index": "bottle-glass",
        "name": "Bottle, glass"
      },
      {
        "index": "bucket",
        "name": "Bucket"
      },
      {
        "index": "caltrops",
        "name": "Caltrops"
      },
      {
        "index": "candle",
        "name": "Candle"
      },
      {
        "index": "case-crossbow-bolt",
        "name": "Case, crossbow bolt"
      },
      {
        "index": "case-map-or-scroll",
        "name": "Case, map or scroll"
      },
      {
        "index": "censer",
        "name": "Censer"
      },
      {
        "index": "chain-10-feet",
        "name": "Chain (10 feet)"
      },
      {
        "index": "chalk-1-piece",
        "name": "Chalk (1 piece)"
      },
      {
        "index": "chest",
        "name": "Chest"
      },
      {
        "index": "clothes-common",
        "name": "Clothes, common"
      },
      {
        "index": "clothes-costume",
        "name": "Clothes, costume"
      },
      {
        "index": "clothes-fine",
        "name": "Clothes, fine"
      },
      {
        "index": "clothes-travelers",
        "name": "Clothes, traveler's"
      },
      {
        "index": "component-pouch",
        "name": "Component pouch"
      },
      {
        "index": "crowbar",
        "name": "Crowbar"
      },
      {
        "index": "fishing-tackle",
        "name": "Fishing tackle"
      },
      {
        "index": "flask-or-tankard",
        "name": "Flask or tankard"
      },
      {
        "index": "grappling-hook",
        "name": "Grappling hook"
      },
      {
        "index": "hammer",
        "name": "Hammer"
      },
      {
        "index": "hammer-sledge",
        "name": "Hammer, sledge"
      },
      {
        "index": "holy-water-flask",
        "name": "Holy water (flask)"
      },
      {
        "index": "hourglass",
        "name": "Hourglass"
      },
      {
        "index": "hunting-trap",
        "name": "Hunting trap"
      },
      {
        "index": "ink-1-ounce-bottle",
        "name": "Ink (1 ounce bottle)"
      },
      {
        "index": "ink-pen",
        "name": "Ink pen"
      },
      {
        "index": "hourglass",
        "name": "Hourglass"
      },
      {
        "index": "hunting-trap",
        "name": "Hunting trap"
      },
      {
        "index": "ink-1-ounce-bottle",
        "name": "Ink (1 ounce bottle)"
      },
      {
        "index": "ink-pen",
        "name": "Ink pen"
      },
      {
        "index": "jug-or-pitcher",
        "name": "Jug or pitcher"
      },
      {
        "index": "ladder-10-foot",
        "name": "Ladder (10-foot)"
      },
      {
        "index": "lamp",
        "name": "Lamp"
      },
      {
        "index": "lantern-bullseye",
        "name": "Lantern, bullseye"
      },
      {
        "index": "lantern-hooded",
        "name": "Lantern, hooded"
      },
      {
        "index": "little-bag-of-sand",
        "name": "Little bag of sand"
      },
      {
        "index": "lock",
        "name": "Lock"
      },
      {
        "index": "magnifying-glass",
        "name": "Magnifying glass"
      },
      {
        "index": "manacles",
        "name": "Manacles"
      },
      {
        "index": "mirror-steel",
        "name": "Mirror, steel"
      },
      {
        "index": "oil-flask",
        "name": "Oil (flask)"
      },
      {
        "index": "paper-one-sheet",
        "name": "Paper (one sheet)"
      },
      {
        "index": "parchment-one-sheet",
        "name": "Parchment (one sheet)"
      },
      {
        "index": "perfume-vial",
        "name": "Perfume (vial)"
      },
      {
        "index": "pick-miners",
        "name": "Pick, miner's"
      },
      {
        "index": "piton",
        "name": "Piton"
      },
      {
        "index": "poison-basic-vial",
        "name": "Poison, basic (vial)"
      },
      {
        "index": "pole-10-foot",
        "name": "Pole (10-foot)"
      },
      {
        "index": "pot-iron",
        "name": "Pot, iron"
      },
      {
        "index": "pouch",
        "name": "Pouch"
      },
      {
        "index": "quiver",
        "name": "Quiver"
      },
      {
        "index": "ram-portable",
        "name": "Ram, portable"
      },
      {
        "index": "rations-1-day",
        "name": "Rations (1 day)"
      },
      {
        "index": "robes",
        "name": "Robes"
      },
      {
        "index": "rope-hempen-50-feet",
        "name": "Rope, hempen (50 feet)"
      },
      {
        "index": "rope-silk-50-feet",
        "name": "Rope, silk (50 feet)"
      },
      {
        "index": "sack",
        "name": "Sack"
      },
      {
        "index": "scale-merchants",
        "name": "Scale, merchant's"
      },
      {
        "index": "sealing-wax",
        "name": "Sealing wax"
      },
      {
        "index": "shovel",
        "name": "Shovel"
      },
      {
        "index": "signal-whistle",
        "name": "Signal whistle"
      },
      {
        "index": "signet-ring",
        "name": "Signet ring"
      },
      {
        "index": "small-knife",
        "name": "Small knife"
      },
      {
        "index": "soap",
        "name": "Soap"
      },
      {
        "index": "spellbook",
        "name": "Spellbook"
      },
      {
        "index": "spike-iron",
        "name": "Spike, iron"
      },
      {
        "index": "spyglass",
        "name": "Spyglass"
      },
      {
        "index": "string-10-feet",
        "name": "String (10 feet)"
      },
      {
        "index": "tent-two-person",
        "name": "Tent, two-person"
      },
      {
        "index": "tinderbox",
        "name": "Tinderbox"
      },
      {
        "index": "vestments",
        "name": "Vestments"
      },
      {
        "index": "torch",
        "name": "Torch"
      },
      {
        "index": "vial",
        "name": "Vial"
      },
      {
        "index": "waterskin",
        "name": "Waterskin"
      },
      {
        "index": "whetstone",
        "name": "Whetstone"
      }
    ]
  },
  {
    "index": "kits",
    "name": "Kits",
    "equipment": [
      {
        "index": "climbers-kit",
        "name": "Climber's Kit"
      },
      {
        "index": "disguise-kit",
        "name": "Disguise Kit"
      },
      {
        "index": "forgery-kit",
        "name": "Forgery Kit"
      },
      {
        "index": "herbalism-kit",
        "name": "Herbalism Kit"
      },
      {
        "index": "healers-kit",
        "name": "Healer's Kit"
      },
      {
        "index": "mess-kit",
        "name": "Mess Kit"
      },
      {
        "index": "poisoners-kit",
        "name": "Poisoner's Kit"
      }
    ]
  },
  {
    "index": "equipment-packs",
    "name": "Equipment Packs",
    "equipment": [
      {
        "index": "burglars-pack",
        "name": "Burglar's Pack"
      },
      {
        "index": "diplomats-pack",
        "name": "Diplomat's Pack"
      },
      {
        "index": "dungeoneers-pack",
        "name": "Dungeoneer's Pack"
      },
      {
        "index": "entertainers-pack",
        "name": "Entertainer's Pack"
      },
      {
        "index": "explorers-pack",
        "name": "Explorer's Pack"
      },
      {
        "index": "priests-pack",
        "name": "Priest's Pack"
      },
      {
        "index": "scholars-pack",
        "name": "Scholar's Pack"
      }
    ]
  },
  {
    "index": "artisans-tools",
    "name": "Artisan's Tools",
    "equipment": [
      {
        "index": "alchemists-supplies",
        "name": "Alchemist's Supplies"
      },
      {
        "index": "brewers-supplies",
        "name": "Brewer's Supplies"
      },
      {
        "index": "calligraphers-supplies",
        "name": "Calligrapher's Supplies"
      },
      {
        "index": "carpenters-tools",
        "name": "Carpenter's Tools"
      },
      {
        "index": "cartographers-tools",
        "name": "Cartographer's Tools"
      },
      {
        "index": "cobblers-tools",
        "name": "Cobbler's Tools"
      },
      {
        "index": "cooks-utensils",
        "name": "Cook's utensils"
      },
      {
        "index": "glassblowers-tools",
        "name": "Glassblower's Tools"
      },
      {
        "index": "jewelers-tools",
        "name": "Jeweler's Tools"
      },
      {
        "index": "leatherworkers-tools",
        "name": "Leatherworker's Tools"
      },
      {
        "index": "masons-tools",
        "name": "Mason's Tools"
      },
      {
        "index": "painters-supplies",
        "name": "Painter's Supplies"
      },
      {
        "index": "potters-tools",
        "name": "Potter's Tools"
      },
      {
        "index": "smiths-tools",
        "name": "Smith's Tools"
      },
      {
        "index": "tinkers-tools",
        "name": "Tinker's Tools"
      },
      {
        "index": "weavers-tools",
        "name": "Weaver's Tools"
      },
      {
        "index": "woodcarvers-tools",
        "name": "Woodcarver's Tools"
      }
    ]
  },
  {
    "index": "gaming-sets",
    "name": "Gaming Sets",
    "equipment": [
      {
        "index": "dice-set",
        "name": "Dice Set"
      },
      {
        "index": "playing-card-set",
        "name": "Playing Card Set"
      }
    ]
  },
  {
    "index": "musical-instruments",
    "name": "Musical Instruments",
    "equipment": [
      {
        "index": "bagpipes",
        "name": "Bagpipes"
      },
      {
        "index": "drum",
        "name": "Drum"
      },
      {
        "index": "dulcimer",
        "name": "Dulcimer"
      },
      {
        "index": "flute",
        "name": "Flute"
      },
      {
        "index": "lute",
        "name": "Lute"
      },
      {
        "index": "lyre",
        "name": "Lyre"
      },
      {
        "index": "horn",
        "name": "Horn"
      },
      {
        "index": "pan-flute",
        "name": "Pan flute"
      },
      {
        "index": "shawm",
        "name": "Shawm"
      },
      {
        "index": "viol",
        "name": "Viol"
      }
    ]
  },
  {
    "index": "other-tools",
    "name": "Other Tools",
    "equipment": [
      {
        "index": "navigators-tools",
        "name": "Navigator's Tools"
      },
      {
        "index": "thieves-tools",
        "name": "Thieves' Tools"
      }
    ]
  },
  {
    "index": "mounts-and-other-animals",
    "name": "Mounts and Other Animals",
    "equipment": [
      {
        "index": "mule",
        "name": "Mule"
      },
      {
        "index": "elephant",
        "name": "Elephant"
      },
      {
        "index": "horse-draft",
        "name": "Horse, draft"
      },
      {
        "index": "horse-riding",
        "name": "Horse, riding"
      },
      {
        "index": "mastiff",
        "name": "Mastiff"
      },
      {
        "index": "pony",
        "name": "Pony"
      },
      {
        "index": "warhorse",
        "name": "Warhorse"
      }
    ]
  },
  {
    "index": "tack-harness-and-drawn-vehicles",
    "name": "Tack, Harness, and Drawn Vehicles",
    "equipment": [
      {
        "index": "barding-padded",
        "name": "Barding: Padded"
      },
      {
        "index": "barding-leather",
        "name": "Barding: Leather"
      },
      {
        "index": "barding-studded-leather",
        "name": "Barding: Studded Leather"
      },
      {
        "index": "barding-hide",
        "name": "Barding: Hide"
      },
      {
        "index": "barding-chain-shirt",
        "name": "Barding: Chain shirt"
      },
      {
        "index": "barding-scale-mail",
        "name": "Barding: Scale mail"
      },
      {
        "index": "barding-breastplate",
        "name": "Barding: Breastplate"
      },
      {
        "index": "barding-half-plate",
        "name": "Barding: Half plate"
      },
      {
        "index": "barding-ring-mail",
        "name": "Barding: Ring mail"
      },
      {
        "index": "barding-chain-mail",
        "name": "Barding: Chain mail"
      },
      {
        "index": "barding-splint",
        "name": "Barding: Splint"
      },
      {
        "index": "barding-plate",
        "name": "Barding: Plate"
      },
      {
        "index": "bit-and-bridle",
        "name": "Bit and bridle"
      },
      {
        "index": "carriage",
        "name": "Carriage"
      },
      {
        "index": "cart",
        "name": "Cart"
      },
      {
        "index": "chariot",
        "name": "Chariot"
      },
      {
        "index": "animal-feed-1-day",
        "name": "Animal Feed (1 day)"
      },
      {
        "index": "saddle-exotic",
        "name": "Saddle, Exotic"
      },
      {
        "index": "saddle-military",
        "name": "Saddle, Military"
      },
      {
        "index": "saddle-pack",
        "name": "Saddle, Pack"
      },
      {
        "index": "saddle-riding",
        "name": "Saddle, Riding"
      },
      {
        "index": "saddlebags",
        "name": "Saddlebags"
      },
      {
        "index": "sled",
        "name": "Sled"
      },
      {
        "index": "stabling-1-day",
        "name": "Stabling (1 day)"
      },
      {
        "index": "wagon",
        "name": "Wagon"
      }
    ]
  },
  {
    "index": "land-vehicles",
    "name": "Land Vehicles",
    "equipment": [
      {
        "index": "carriage",
        "name": "Carriage"
      },
      {
        "index": "cart",
        "name": "Cart"
      },
      {
        "index": "chariot",
        "name": "Chariot"
      },
      {
        "index": "sled",
        "name": "Sled"
      },
      {
        "index": "wagon",
        "name": "Wagon"
      }
    ]
  },
  {
    "index": "waterborne-vehicles",
    "name": "Waterborne Vehicles",
    "equipment": [
      {
        "index": "galley",
        "name": "Galley"
      },
      {
        "index": "keelboat",
        "name": "Keelboat"
      },
      {
        "index": "longship",
        "name": "Longship"
      },
      {
        "index": "rowboat",
        "name": "Rowboat"
      },
      {
        "index": "sailing-ship",
        "name": "Sailing ship"
      },
      {
        "index": "warship",
        "name": "Warship"
      }
    ]
  },
  {
    "index": "arcane-foci",
    "name": "Arcane Foci",
    "equipment": [
      {
        "index": "crystal",
        "name": "Crystal"
      },
      {
        "index": "orb",
        "name": "Orb"
      },
      {
        "index": "rod",
        "name": "Rod"
      },
      {
        "index": "staff",
        "name": "Staff"
      },
      {
        "index": "wand",
        "name": "Wand"
      }
    ]
  },
  {
    "index": "druidic-foci",
    "name": "Druidic Foci",
    "equipment": [
      {
        "index": "sprig-of-mistletoe",
        "name": "Sprig of mistletoe"
      },
      {
        "index": "totem",
        "name": "Totem"
      },
      {
        "index": "wooden-staff",
        "name": "Wooden staff"
      },
      {
        "index": "yew-wand",
        "name": "Yew wand"
      }
    ]
  },
  {
    "index": "holy-symbols",
    "name": "Holy Symbols",
    "equipment": [
      {
        "index": "amulet",
        "name": "Amulet"
      },
      {
        "index": "emblem",
        "name": "Emblem"
      },
      {
        "index": "reliquary",
        "name": "Reliquary"
      }
    ]
  },
  {
    "index": "wondrous-items",
    "name": "Wondrous Items",
    "equipment": [
      {
        "index": "amulet-of-health",
        "name": "Amulet of Health"
      },
      {
        "index": "amulet-of-proof-against-detection-and-location",
        "name": "Amulet of Proof against Detection and Location"
      },
      {
        "index": "amulet-of-the-planes",
        "name": "Amulet of the Planes"
      },
      {
        "index": "apparatus-of-the-crab",
        "name": "Apparatus of the Crab"
      },
      {
        "index": "bag-of-beans",
        "name": "Bag of Beans"
      },
      {
        "index": "bag-of-devouring",
        "name": "Bag of Devouring"
      },
      {
        "index": "bag-of-holding",
        "name": "Bag of Holding"
      },
      {
        "index": "bag-of-tricks",
        "name": "Bag of Tricks"
      },
      {
        "index": "bead-of-force",
        "name": "Bead of Force"
      },
      {
        "index": "belt-of-dwarvenkind",
        "name": "Belt of Dwarvenkind"
      },
      {
        "index": "belt-of-giant-strength",
        "name": "Belt of Giant Strength"
      },
      {
        "index": "boots-of-elvenkind",
        "name": "Boots of Elvenkind"
      },
      {
        "index": "boots-of-levitation",
        "name": "Boots of Levitation"
      },
      {
        "index": "boots-of-speed",
        "name": "Boots of Speed"
      },
      {
        "index": "boots-of-striding-and-springing",
        "name": "Boots of Striding and Springing"
      },
      {
        "index": "boots-of-the-winterlands",
        "name": "Boots of the Winterlands"
      },
      {
        "index": "bowl-of-commanding-water-elementals",
        "name": "Bowl of Commanding Water Elementals"
      },
      {
        "index": "bracers-of-archery",
        "name": "Bracers of Archery"
      },
      {
        "index": "bracers-of-defense",
        "name": "Bracers of Defense"
      },
      {
        "index": "brazier-of-commanding-fire-elementals",
        "name": "Brazier of Commanding Fire Elementals"
      },
      {
        "index": "brooch-of-shielding",
        "name": "Brooch of Shielding"
      },
      {
        "index": "broom-of-flying",
        "name": "Broom of Flying"
      },
      {
        "index": "candle-of-invocation",
        "name": "Candle of Invocation"
      },
      {
        "index": "cape-of-the-mountebank",
        "name": "Cape of the Mountebank"
      },
      {
        "index": "carpet-of-flying",
        "name": "Carpet of Flying"
      },
      {
        "index": "censer-of-controlling-air-elementals",
        "name": "Censer of Controlling Air Elementals"
      },
      {
        "index": "chime-of-opening",
        "name": "Chime of Opening"
      },
      {
        "index": "circlet-of-blasting",
        "name": "Circlet of Blasting"
      },
      {
        "index": "cloak-of-arachnida",
        "name": "Cloak of Arachnida"
      },
      {
        "index": "cloak-of-displacement",
        "name": "Cloak of Displacement"
      },
      {
        "index": "cloak-of-elvenkind",
        "name": "Cloak of Elvenkind"
      },
      {
        "index": "cloak-of-protection",
        "name": "Cloak of Protection"
      },
      {
        "index": "cloak-of-the-bat",
        "name": "Cloak of the Bat"
      },
      {
        "index": "cloak-of-the-manta-ray",
        "name": "Cloak of the Manta Ray"
      },
      {
        "index": "crystal-ball",
        "name": "Crystal Ball"
      },
      {
        "index": "cube-of-force",
        "name": "Cube of Force"
      },
      {
        "index": "cubic-gate",
        "name": "Cubic Gate"
      },
      {
        "index": "decanter-of-endless-water",
        "name": "Decanter of Endless Water"
      },
      {
        "index": "deck-of-illusions",
        "name": "Deck of Illusions"
      },
      {
        "index": "deck-of-many-things",
        "name": "Deck of Many Things"
      },
      {
        "index": "dimensional-shackles",
        "name": "Dimensional Shackles"
      },
      {
        "index": "dust-of-disappearance",
        "name": "Dust of Disappearance"
      },
      {
        "index": "dust-of-dryness",
        "name": "Dust of Dryness"
      },
      {
        "index": "dust-of-sneezing-and-choking",
        "name": "Dust of Sneezing and Choking"
      },
      {
        "index": "efficient-quiver",
        "name": "Efficient Quiver"
      },
      {
        "index": "efreeti-bottle",
        "name": "Efreeti Bottle"
      },
      {
        "index": "elemental-gem",
        "name": "Elemental Gem"
      },
      {
        "index": "eversmoking-bottle",
        "name": "Eversmoking Bottle"
      },
      {
        "index": "eyes-of-charming",
        "name": "Eyes of Charming"
      },
      {
        "index": "eyes-of-minute-seeing",
        "name": "Eyes of Minute Seeing"
      },
      {
        "index": "eyes-of-the-eagle",
        "name": "Eyes of the Eagle"
      },
      {
        "index": "feather-token",
        "name": "Feather Token"
      },
      {
        "index": "figurine-of-wondrous-power",
        "name": "Figurine of Wondrous Power"
      },
      {
        "index": "folding-boat",
        "name": "Folding Boat"
      },
      {
        "index": "gauntlets-of-ogre-power",
        "name": "Gauntlets of Ogre Power"
      },
      {
        "index": "gem-of-brightness",
        "name": "Gem of Brightness"
      },
      {
        "index": "gem-of-seeing",
        "name": "Gem of Seeing"
      },
      {
        "index": "gloves-of-missile-snaring",
        "name": "Gloves of Missile Snaring"
      },
      {
        "index": "gloves-of-swimming-and-climbing",
        "name": "Gloves of Swimming and Climbing"
      },
      {
        "index": "goggles-of-night",
        "name": "Goggles of Night"
      },
      {
        "index": "handy-haversack",
        "name": "Handy Haversack"
      },
      {
        "index": "hat-of-disguise",
        "name": "Hat of Disguise"
      },
      {
        "index": "headband-of-intellect",
        "name": "Headband of Intellect"
      },
      {
        "index": "helm-of-brilliance",
        "name": "Helm of Brilliance"
      },
      {
        "index": "helm-of-comprehending-languages",
        "name": "Helm of Comprehending Languages"
      },
      {
        "index": "helm-of-telepathy",
        "name": "Helm of Telepathy"
      },
      {
        "index": "helm-of-teleportation",
        "name": "Helm of Teleportation"
      },
      {
        "index": "horn-of-blasting",
        "name": "Horn of Blasting"
      },
      {
        "index": "horn-of-valhalla",
        "name": "Horn of Valhalla"
      },
      {
        "index": "horseshoes-of-a-zephyr",
        "name": "Horseshoes of a Zephyr"
      },
      {
        "index": "horseshoes-of-speed",
        "name": "Horseshoes of Speed"
      },
      {
        "index": "instant-fortress",
        "name": "Instant Fortress"
      },
      {
        "index": "ioun-stone",
        "name": "Ioun Stone"
      },
      {
        "index": "iron-bands-of-binding",
        "name": "Iron Bands of Binding"
      },
      {
        "index": "iron-flask",
        "name": "Iron Flask"
      },
      {
        "index": "lantern-of-revealing",
        "name": "Lantern of Revealing"
      },
      {
        "index": "mantle-of-spell-resistance",
        "name": "Mantle of Spell Resistance"
      },
      {
        "index": "manual-of-bodily-health",
        "name": "Manual of Bodily Health"
      },
      {
        "index": "manual-of-gainful-exercise",
        "name": "Manual of Gainful Exercise"
      },
      {
        "index": "manual-of-golems",
        "name": "Manual of Golems"
      },
      {
        "index": "manual-of-quickness-of-action",
        "name": "Manual of Quickness of Action"
      },
      {
        "index": "marvelous-pigments",
        "name": "Marvelous Pigments"
      },
      {
        "index": "medallion-of-thoughts",
        "name": "Medallion of Thoughts"
      },
      {
        "index": "mirror-of-life-trapping",
        "name": "Mirror of Life Trapping"
      },
      {
        "index": "necklace-of-adaptation",
        "name": "Necklace of Adaptation"
      },
      {
        "index": "necklace-of-fireballs",
        "name": "Necklace of Fireballs"
      },
      {
        "index": "necklace-of-prayer-beads",
        "name": "Necklace of Prayer Beads"
      },
      {
        "index": "pearl-of-power",
        "name": "Pearl of Power"
      },
      {
        "index": "periapt-of-health",
        "name": "Periapt of Health"
      },
      {
        "index": "periapt-of-proof-against-poison",
        "name": "Periapt of Proof against Poison"
      },
      {
        "index": "periapt-of-wound-closure",
        "name": "Periapt of Wound Closure"
      },
      {
        "index": "pipes-of-haunting",
        "name": "Pipes of Haunting"
      },
      {
        "index": "pipes-of-the-sewers",
        "name": "Pipes of the Sewers"
      },
      {
        "index": "portable-hole",
        "name": "Portable Hole"
      },
      {
        "index": "restorative-ointment",
        "name": "Restorative Ointment"
      },
      {
        "index": "robe-of-eyes",
        "name": "Robe of Eyes"
      },
      {
        "index": "robe-of-scintillating-colors",
        "name": "Robe of Scintillating Colors"
      },
      {
        "index": "robe-of-stars",
        "name": "Robe of Stars"
      },
      {
        "index": "robe-of-the-archmagi",
        "name": "Robe of the Archmagi"
      },
      {
        "index": "robe-of-useful-items",
        "name": "Robe of Useful Items"
      },
      {
        "index": "rope-of-climbing",
        "name": "Rope of Climbing"
      },
      {
        "index": "rope-of-entanglement",
        "name": "Rope of Entanglement"
      },
      {
        "index": "scarab-of-protection",
        "name": "Scarab of Protection"
      },
      {
        "index": "slippers-of-spider-climbing",
        "name": "Slippers of Spider Climbing"
      },
      {
        "index": "sovereign-glue",
        "name": "Sovereign Glue"
      },
      {
        "index": "sphere-of-annihilation",
        "name": "Sphere of Annihilation"
      },
      {
        "index": "stone-of-controlling-earth-elementals",
        "name": "Stone of Controlling Earth Elementals"
      },
      {
        "index": "stone-of-good-luck-luckstone",
        "name": "Stone of Good Luck (Luckstone)"
      },
      {
        "index": "talisman-of-pure-good",
        "name": "Talisman of Pure Good"
      },
      {
        "index": "talisman-of-the-sphere",
        "name": "Talisman of the Sphere"
      },
      {
        "index": "talisman-of-ultimate-evil",
        "name": "Talisman of Ultimate Evil"
      },
      {
        "index": "tome-of-clear-thought",
        "name": "Tome of Clear Thought"
      },
      {
        "index": "tome-of-leadership-and-influence",
        "name": "Tome of Leadership and Influence"
      },
      {
        "index": "tome-of-understanding",
        "name": "Tome of Understanding"
      },
      {
        "index": "universal-solvent",
        "name": "Universal Solvent"
      },
      {
        "index": "well-of-many-worlds",
        "name": "Well of Many Worlds"
      },
      {
        "index": "wind-fan",
        "name": "Wind Fan"
      },
      {
        "index": "winged-boots",
        "name": "Winged Boots"
      },
      {
        "index": "wings-of-flying",
        "name": "Wings of Flying"
      },
      {
        "index": "orb-of-dragonkind",
        "name": "Orb of Dragonkind"
      },
      {
        "index": "bag-of-tricks-gray",
        "name": "Gray Bag of Tricks"
      },
      {
        "index": "bag-of-tricks-rust",
        "name": "Rust Bag of Tricks"
      },
      {
        "index": "bag-of-tricks-tan",
        "name": "Tan Bag of Tricks"
      },
      {
        "index": "belt-of-giant-strength-hill",
        "name": "Belt of Hill Giant Strength"
      },
      {
        "index": "belt-of-giant-strength-stone",
        "name": "Belt of Stone Giant Strength"
      },
      {
        "index": "belt-of-giant-strength-frost",
        "name": "Belt of Frost Giant Strength"
      },
      {
        "index": "belt-of-giant-strength-fire",
        "name": "Belt of Fire Giant Strength"
      },
      {
        "index": "belt-of-giant-strength-cloud",
        "name": "Belt of Cloud Giant Strength"
      },
      {
        "index": "belt-of-giant-strength-storm",
        "name": "Belt of Storm Giant Strength"
      },
      {
        "index": "carpet-of-flying-3x5",
        "name": "Carpet of Flying (3 ft. × 5 ft.)"
      },
      {
        "index": "carpet-of-flying-4x6",
        "name": "Carpet of Flying (4 ft. × 6 ft.)"
      },
      {
        "index": "carpet-of-flying-5x7",
        "name": "Carpet of Flying (5 ft. × 7 ft.)"
      },
      {
        "index": "carpet-of-flying-6x9",
        "name": "Carpet of Flying (6 ft. × 9 ft.)"
      },
      {
        "index": "crystal-ball-of-mind-reading",
        "name": "Crystal Ball of Mind Reading"
      },
      {
        "index": "crystal-ball-of-telepathy",
        "name": "Crystal Ball of Telepathy"
      },
      {
        "index": "crystal-ball-of-true-seeing",
        "name": "Crystal Ball of True Seeing"
      },
      {
        "index": "elemental-gem-air",
        "name": "Air Elemental Gem"
      },
      {
        "index": "elemental-gem-earth",
        "name": "Earth Elemental Gem"
      },
      {
        "index": "elemental-gem-fire",
        "name": "Fire Elemental Gem"
      },
      {
        "index": "elemental-gem-water",
        "name": "Water Elemental Gem"
      },
      {
        "index": "feather-token-anchor",
        "name": "Anchor Feather Token"
      },
      {
        "index": "feather-token-bird",
        "name": "Bird Feather Token"
      },
      {
        "index": "feather-token-fan",
        "name": "Fan Feather Token"
      },
      {
        "index": "feather-token-swan-boat",
        "name": "Swan Boat Feather Token"
      },
      {
        "index": "feather-token-tree",
        "name": "Tree Feather Token"
      },
      {
        "index": "feather-token-whip",
        "name": "Whip Feather Token"
      },
      {
        "index": "figurine-of-wondrous-power-bronze-griffon",
        "name": "Bronze Griffon Figurine of Wondrous Power"
      },
      {
        "index": "figurine-of-wondrous-power-ebony-fly",
        "name": "Ebony Fly Figurine of Wondrous Power"
      },
      {
        "index": "figurine-of-wondrous-power-golden-lions",
        "name": "Golden Lions Figurine of Wondrous Power"
      },
      {
        "index": "figurine-of-wondrous-power-ivory-goats",
        "name": "Ivory Goats Figurine of Wondrous Power"
      },
      {
        "index": "figurine-of-wondrous-power-marble-elephant",
        "name": "Marble Elephant Figurine of Wondrous Power"
      },
      {
        "index": "figurine-of-wondrous-power-obsidian-steed",
        "name": "Obsidian Steed Figurine of Wondrous Power"
      },
      {
        "index": "figurine-of-wondrous-power-onyx-dog",
        "name": "Onyx Dog Figurine of Wondrous Power"
      },
      {
        "index": "figurine-of-wondrous-power-serpentine-owl",
        "name": "Serpentine Owl Figurine of Wondrous Power"
      },
      {
        "index": "figurine-of-wondrous-power-silver-raven",
        "name": "Silver Raven Figurine of Wondrous Power"
      },
      {
        "index": "horn-of-valhalla-silver",
        "name": "Silver Horn of Valhalla"
      },
      {
        "index": "horn-of-valhalla-brass",
        "name": "Brass Horn of Valhalla"
      },
      {
        "index": "horn-of-valhalla-bronze",
        "name": "Bronze Horn of Valhalla"
      },
      {
        "index": "horn-of-valhalla-iron",
        "name": "Iron Horn of Valhalla"
      },
      {
        "index": "ioun-stone-of-absorption",
        "name": "Ioun Stone of Absorption"
      },
      {
        "index": "ioun-stone-of-agility",
        "name": "Ioun Stone of Agility"
      },
      {
        "index": "ioun-stone-of-awareness",
        "name": "Ioun Stone of Awareness"
      },
      {
        "index": "ioun-stone-of-fortitude",
        "name": "Ioun Stone of Fortitude"
      },
      {
        "index": "ioun-stone-of-greater-absorption",
        "name": "Ioun Stone of Greater Absorption"
      },
      {
        "index": "ioun-stone-of-insight",
        "name": "Ioun Stone of Insight"
      },
      {
        "index": "ioun-stone-of-intellect",
        "name": "Ioun Stone of Intellect"
      },
      {
        "index": "ioun-stone-of-leadership",
        "name": "Ioun Stone of Leadership"
      },
      {
        "index": "ioun-stone-of-mastery",
        "name": "Ioun Stone of Mastery"
      },
      {
        "index": "ioun-stone-of-protection",
        "name": "Ioun Stone of Protection"
      },
      {
        "index": "ioun-stone-of-regeneration",
        "name": "Ioun Stone of Regeneration"
      },
      {
        "index": "ioun-stone-of-reserve",
        "name": "Ioun Stone of Reserve"
      },
      {
        "index": "ioun-stone-of-strength",
        "name": "Ioun Stone of Strength"
      },
      {
        "index": "ioun-stone-of-sustenance",
        "name": "Ioun Stone of Sustenance"
      },
      {
        "index": "manual-of-golems-clay",
        "name": "Manual of Clay Golems"
      },
      {
        "index": "manual-of-golems-flesh",
        "name": "Manual of Flesh Golems"
      },
      {
        "index": "manual-of-golems-iron",
        "name": "Manual of Iron Golems"
      },
      {
        "index": "manual-of-golems-stone",
        "name": "Manual of Stone Golems"
      }
    ]
  },
  {
    "index": "rod",
    "name": "Rod",
    "equipment": [
      {
        "index": "immovable-rod",
        "name": "Immovable Rod"
      },
      {
        "index": "rod-of-absorption",
        "name": "Rod of Absorption"
      },
      {
        "index": "rod-of-alertness",
        "name": "Rod of Alertness"
      },
      {
        "index": "rod-of-lordly-might",
        "name": "Rod of Lordly Might"
      },
      {
        "index": "rod-of-rulership",
        "name": "Rod of Rulership"
      },
      {
        "index": "rod-of-security",
        "name": "Rod of Security"
      }
    ]
  },
  {
    "index": "potion",
    "name": "Potion",
    "equipment": [
      {
        "index": "oil-of-etherealness",
        "name": "Oil of Etherealness"
      },
      {
        "index": "oil-of-sharpness",
        "name": "Oil of Sharpness"
      },
      {
        "index": "oil-of-slipperiness",
        "name": "Oil of Slipperiness"
      },
      {
        "index": "philter-of-love",
        "name": "Philter of Love"
      },
      {
        "index": "potion-of-animal-friendship",
        "name": "Potion of Animal Friendship"
      },
      {
        "index": "potion-of-clairvoyance",
        "name": "Potion of Clairvoyance"
      },
      {
        "index": "potion-of-climbing",
        "name": "Potion of Climbing"
      },
      {
        "index": "potion-of-diminution",
        "name": "Potion of Diminution"
      },
      {
        "index": "potion-of-flying",
        "name": "Potion of Flying"
      },
      {
        "index": "potion-of-gaseous-form",
        "name": "Potion of Gaseous Form"
      },
      {
        "index": "potion-of-giant-strength",
        "name": "Potion of Giant Strength"
      },
      {
        "index": "potion-of-growth",
        "name": "Potion of Growth"
      },
      {
        "index": "potion-of-healing",
        "name": "Potion of Healing"
      },
      {
        "index": "potion-of-heroism",
        "name": "Potion of Heroism"
      },
      {
        "index": "potion-of-invisibility",
        "name": "Potion of Invisibility"
      },
      {
        "index": "potion-of-mind-reading",
        "name": "Potion of Mind Reading"
      },
      {
        "index": "potion-of-poison",
        "name": "Potion of Poison"
      },
      {
        "index": "potion-of-resistance",
        "name": "Potion of Resistance"
      },
      {
        "index": "potion-of-speed",
        "name": "Potion of Speed"
      },
      {
        "index": "potion-of-water-breathing",
        "name": "Potion of Water Breathing"
      },
      {
        "index": "potion-of-giant-strength-hill",
        "name": "Potion of Hill Giant Strength"
      },
      {
        "index": "potion-of-giant-strength-frost",
        "name": "Potion of Frost Giant Strength"
      },
      {
        "index": "potion-of-giant-strength-stone",
        "name": "Potion of Stone Giant Strength"
      },
      {
        "index": "potion-of-giant-strength-fire",
        "name": "Potion of Fire Giant Strength"
      },
      {
        "index": "potion-of-giant-strength-cloud",
        "name": "Potion of Cloud Giant Strength"
      },
      {
        "index": "potion-of-giant-strength-storm",
        "name": "Potion of Storm Giant Strength"
      },
      {
        "index": "potion-of-healing-common",
        "name": "Potion of Healing"
      },
      {
        "index": "potion-of-healing-greater",
        "name": "Potion of Greater Healing"
      },
      {
        "index": "potion-of-healing-superior",
        "name": "Potion of Superior Healing"
      },
      {
        "index": "potion-of-healing-supreme",
        "name": "Potion of Supreme Healing"
      },
      {
        "index": "potion-of-resistance-acid",
        "name": "Potion of Acid Resistance"
      },
      {
        "index": "potion-of-resistance-cold",
        "name": "Potion of Cold Resistance"
      },
      {
        "index": "potion-of-resistance-fire",
        "name": "Potion of Fire Resistance"
      },
      {
        "index": "potion-of-resistance-force",
        "name": "Potion of Force Resistance"
      },
      {
        "index": "potion-of-resistance-lightning",
        "name": "Potion of Lightning Resistance"
      },
      {
        "index": "potion-of-resistance-necrotic",
        "name": "Potion of Necrotic Resistance"
      },
      {
        "index": "potion-of-resistance-poison",
        "name": "Potion of Poison Resistance"
      },
      {
        "index": "potion-of-resistance-psychic",
        "name": "Potion of Psychic Resistance"
      },
      {
        "index": "potion-of-resistance-radiant",
        "name": "Potion of Radiant Resistance"
      },
      {
        "index": "potion-of-resistance-thunder",
        "name": "Potion of Thunder Resistance"
      }
    ]
  },
  {
    "index": "ring",
    "name": "Ring",
    "equipment": [
      {
        "index": "ring-of-animal-influence",
        "name": "Ring of Animal Influence"
      },
      {
        "index": "ring-of-djinni-summoning",
        "name": "Ring of Djinni Summoning"
      },
      {
        "index": "ring-of-elemental-command",
        "name": "Ring of Elemental Command"
      },
      {
        "index": "ring-of-evasion",
        "name": "Ring of Evasion"
      },
      {
        "index": "ring-of-feather-falling",
        "name": "Ring of Feather Falling"
      },
      {
        "index": "ring-of-free-action",
        "name": "Ring of Free Action"
      },
      {
        "index": "ring-of-invisibility",
        "name": "Ring of Invisibility"
      },
      {
        "index": "ring-of-jumping",
        "name": "Ring of Jumping"
      },
      {
        "index": "ring-of-mind-shielding",
        "name": "Ring of Mind Shielding"
      },
      {
        "index": "ring-of-protection",
        "name": "Ring of Protection"
      },
      {
        "index": "ring-of-regeneration",
        "name": "Ring of Regeneration"
      },
      {
        "index": "ring-of-resistance",
        "name": "Ring of Resistance"
      },
      {
        "index": "ring-of-shooting-stars",
        "name": "Ring of Shooting Stars"
      },
      {
        "index": "ring-of-spell-storing",
        "name": "Ring of Spell Storing"
      },
      {
        "index": "ring-of-spell-turning",
        "name": "Ring of Spell Turning"
      },
      {
        "index": "ring-of-swimming",
        "name": "Ring of Swimming"
      },
      {
        "index": "ring-of-telekinesis",
        "name": "Ring of Telekinesis"
      },
      {
        "index": "ring-of-the-ram",
        "name": "Ring of the Ram"
      },
      {
        "index": "ring-of-three-wishes",
        "name": "Ring of Three Wishes"
      },
      {
        "index": "ring-of-warmth",
        "name": "Ring of Warmth"
      },
      {
        "index": "ring-of-water-walking",
        "name": "Ring of Water Walking"
      },
      {
        "index": "ring-of-x-ray-vision",
        "name": "Ring of X-ray Vision"
      },
      {
        "index": "ring-of-elemental-command-air",
        "name": "Ring of Air Elemental Command"
      },
      {
        "index": "ring-of-elemental-command-earth",
        "name": "Ring of Earth Elemental Command"
      },
      {
        "index": "ring-of-elemental-command-fire",
        "name": "Ring of Fire Elemental Command"
      },
      {
        "index": "ring-of-elemental-command-water",
        "name": "Ring of Water Elemental Command"
      },
      {
        "index": "ring-of-resistance-acid",
        "name": "Ring of Acid Resistance"
      },
      {
        "index": "ring-of-resistance-cold",
        "name": "Ring of Cold Resistance"
      },
      {
        "index": "ring-of-resistance-fire",
        "name": "Ring of Fire Resistance"
      },
      {
        "index": "ring-of-resistance-force",
        "name": "Ring of Force Resistance"
      },
      {
        "index": "ring-of-resistance-lightning",
        "name": "Ring of Lightning Resistance"
      },
      {
        "index": "ring-of-resistance-necrotic",
        "name": "Ring of Necrotic Resistance"
      },
      {
        "index": "ring-of-resistance-poison",
        "name": "Ring of Poison Resistance"
      },
      {
        "index": "ring-of-resistance-psychic",
        "name": "Ring of Psychic Resistance"
      },
      {
        "index": "ring-of-resistance-radiant",
        "name": "Ring of Radiant Resistance"
      },
      {
        "index": "ring-of-resistance-thunder",
        "name": "Ring of Thunder Resistance"
      }
    ]
  },
  {
    "index": "scroll",
    "name": "Scroll",
    "equipment": [
      {
        "index": "spell-scroll",
        "name": "Spell Scroll"
      },
      {
        "index": "spell-scroll-cantrip",
        "name": "Spell Scroll (Cantrip)"
      },
      {
        "index": "spell-scroll-1st",
        "name": "Spell Scroll (1st)"
      },
      {
        "index": "spell-scroll-2nd",
        "name": "Spell Scroll (2nd)"
      },
      {
        "index": "spell-scroll-3rd",
        "name": "Spell Scroll (3rd)"
      },
      {
        "index": "spell-scroll-4th",
        "name": "Spell Scroll (4th)"
      },
      {
        "index": "spell-scroll-5th",
        "name": "Spell Scroll (5th)"
      },
      {
        "index": "spell-scroll-6th",
        "name": "Spell Scroll (6th)"
      },
      {
        "index": "spell-scroll-7th",
        "name": "Spell Scroll (7th)"
      },
      {
        "index": "spell-scroll-8th",
        "name": "Spell Scroll (8th)"
      },
      {
        "index": "spell-scroll-9th",
        "name": "Spell Scroll (9th)"
      }
    ]
  },
  {
    "index": "staff",
    "name": "Staff",
    "equipment": [
      {
        "index": "staff-of-charming",
        "name": "Staff of Charming"
      },
      {
        "index": "staff-of-fire",
        "name": "Staff of Fire"
      },
      {
        "index": "staff-of-frost",
        "name": "Staff of Frost"
      },
      {
        "index": "staff-of-healing",
        "name": "Staff of Healing"
      },
      {
        "index": "staff-of-power",
        "name": "Staff of Power"
      },
      {
        "index": "staff-of-striking",
        "name": "Staff of Striking"
      },
      {
        "index": "staff-of-swarming-insects",
        "name": "Staff of Swarming Insects"
      },
      {
        "index": "staff-of-the-magi",
        "name": "Staff of the Magi"
      },
      {
        "index": "staff-of-the-python",
        "name": "Staff of the Python"
      },
      {
        "index": "staff-of-the-woodlands",
        "name": "Staff of the Woodlands"
      },
      {
        "index": "staff-of-thunder-and-lightning",
        "name": "Staff of Thunder and Lightning"
      },
      {
        "index": "staff-of-withering",
        "name": "Staff of Withering"
      }
    ]
  },
  {
    "index": "wand",
    "name": "Wand",
    "equipment": [
      {
        "index": "wand-of-binding",
        "name": "Wand of Binding"
      },
      {
        "index": "wand-of-enemy-detection",
        "name": "Wand of Enemy Detection"
      },
      {
        "index": "wand-of-fear",
        "name": "Wand of Fear"
      },
      {
        "index": "wand-of-fireballs",
        "name": "Wand of Fireballs"
      },
      {
        "index": "wand-of-lightning-bolts",
        "name": "Wand of Lightning Bolts"
      },
      {
        "index": "wand-of-magic-detection",
        "name": "Wand of Magic Detection"
      },
      {
        "index": "wand-of-magic-missiles",
        "name": "Wand of Magic Missiles"
      },
      {
        "index": "wand-of-paralysis",
        "name": "Wand of Paralysis"
      },
      {
        "index": "wand-of-polymorph",
        "name": "Wand of Polymorph"
      },
      {
        "index": "wand-of-secrets",
        "name": "Wand of Secrets"
      },
      {
        "index": "wand-of-the-war-mage",
        "name": "Wand of the War Mage, +1, +2, or +3"
      },
      {
        "index": "wand-of-web",
        "name": "Wand of Web"
      },
      {
        "index": "wand-of-wonder",
        "name": "Wand of Wonder"
      },
      {
        "index": "wand-of-the-war-mage-1",
        "name": "Wand of the War Mage, +1"
      },
      {
        "index": "wand-of-the-war-mage-2",
        "name": "Wand of the War Mage, +2"
      },
      {
        "index": "wand-of-the-war-mage-3",
        "name": "Wand of the War Mage, +3"
      }
    ]
  }
]`) as ReadonlyArray<SourceRow>;

export const WEAPON_PROPERTY_RAW = JSON.parse(String.raw`[
  {
    "index": "ammunition",
    "name": "Ammunition",
    "desc": [
      "You can use a weapon that has the ammunition property to make a ranged attack only if you have ammunition to fire from the weapon. Each time you attack with the weapon, you expend one piece of ammunition. Drawing the ammunition from a quiver, case, or other container is part of the attack (you need a free hand to load a one-handed weapon).",
      "At the end of the battle, you can recover half your expended ammunition by taking a minute to search the battlefield. If you use a weapon that has the ammunition property to make a melee attack, you treat the weapon as an improvised weapon (see \"Improvised Weapons\" later in the section). A sling must be loaded to deal any damage when used in this way."
    ]
  },
  {
    "index": "finesse",
    "name": "Finesse",
    "desc": [
      "When making an attack with a finesse weapon, you use your choice of your Strength or Dexterity modifier for the attack and damage rolls. You must use the same modifier for both rolls."
    ]
  },
  {
    "index": "heavy",
    "name": "Heavy",
    "desc": [
      "Small creatures have disadvantage on attack rolls with heavy weapons. A heavy weapon's size and bulk make it too large for a Small creature to use effectively."
    ]
  },
  {
    "index": "light",
    "name": "Light",
    "desc": [
      "A light weapon is small and easy to handle, making it ideal for use when fighting with two weapons."
    ]
  },
  {
    "index": "loading",
    "name": "Loading",
    "desc": [
      "Because of the time required to load this weapon, you can fire only one piece of ammunition from it when you use an action, bonus action, or reaction to fire it, regardless of the number of attacks you can normally make."
    ]
  },
  {
    "index": "reach",
    "name": "Reach",
    "desc": [
      "This weapon adds 5 feet to your reach when you attack with it, as well as when determining your reach for opportunity attacks with it."
    ]
  },
  {
    "index": "special",
    "name": "Special",
    "desc": [
      "A weapon with the special property has unusual rules governing its use, explained in the weapon's description (see \"Special Weapons\" later in this section)."
    ]
  },
  {
    "index": "thrown",
    "name": "Thrown",
    "desc": [
      "If a weapon has the thrown property, you can throw the weapon to make a ranged attack. If the weapon is a melee weapon, you use the same ability modifier for that attack roll and damage roll that you would use for a melee attack with the weapon. For example, if you throw a handaxe, you use your Strength, but if you throw a dagger, you can use either your Strength or your Dexterity, since the dagger has the finesse property."
    ]
  },
  {
    "index": "two-handed",
    "name": "Two-Handed",
    "desc": [
      "This weapon requires two hands when you attack with it."
    ]
  },
  {
    "index": "versatile",
    "name": "Versatile",
    "desc": [
      "This weapon can be used with one or two hands. A damage value in parentheses appears with the property--the damage when the weapon is used with two hands to make a melee attack."
    ]
  },
  {
    "index": "monk",
    "name": "Monk",
    "desc": [
      "Monks gain several benefits while unarmed or wielding only monk weapons while they aren't wearing armor or wielding shields."
    ]
  }
]`) as ReadonlyArray<SourceRow>;

export const DAMAGE_TYPE_RAW = JSON.parse(String.raw`[
  {
    "index": "acid",
    "name": "Acid",
    "desc": [
      "The corrosive spray of a black dragon's breath and the dissolving enzymes secreted by a black pudding deal acid damage."
    ]
  },
  {
    "index": "bludgeoning",
    "name": "Bludgeoning",
    "desc": [
      "Blunt force attacks, falling, constriction, and the like deal bludgeoning damage."
    ]
  },
  {
    "index": "cold",
    "name": "Cold",
    "desc": [
      "The infernal chill radiating from an ice devil's spear and the frigid blast of a white dragon's breath deal cold damage."
    ]
  },
  {
    "index": "fire",
    "name": "Fire",
    "desc": [
      "Red dragons breathe fire, and many spells conjure flames to deal fire damage."
    ]
  },
  {
    "index": "force",
    "name": "Force",
    "desc": [
      "Force is pure magical energy focused into a damaging form. Most effects that deal force damage are spells, including magic missile and spiritual weapon."
    ]
  },
  {
    "index": "lightning",
    "name": "Lightning",
    "desc": [
      "A lightning bolt spell and a blue dragon's breath deal lightning damage."
    ]
  },
  {
    "index": "necrotic",
    "name": "Necrotic",
    "desc": [
      "Necrotic damage, dealt by certain undead and a spell such as chill touch, withers matter and even the soul."
    ]
  },
  {
    "index": "piercing",
    "name": "Piercing",
    "desc": [
      "Puncturing and impaling attacks, including spears and monsters' bites, deal piercing damage."
    ]
  },
  {
    "index": "poison",
    "name": "Poison",
    "desc": [
      "Venomous stings and the toxic gas of a green dragon's breath deal poison damage."
    ]
  },
  {
    "index": "psychic",
    "name": "Psychic",
    "desc": [
      "Mental abilities such as a psionic blast deal psychic damage."
    ]
  },
  {
    "index": "radiant",
    "name": "Radiant",
    "desc": [
      "Radiant damage, dealt by a cleric's flame strike spell or an angel's smiting weapon, sears the flesh like fire and overloads the spirit with power."
    ]
  },
  {
    "index": "slashing",
    "name": "Slashing",
    "desc": [
      "Swords, axes, and monsters' claws deal slashing damage."
    ]
  },
  {
    "index": "thunder",
    "name": "Thunder",
    "desc": [
      "A concussive burst of sound, such as the effect of the thunderwave spell, deals thunder damage."
    ]
  }
]`) as ReadonlyArray<SourceRow>;
