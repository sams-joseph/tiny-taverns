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
 * THIRD_PARTY_NOTICES.md and rules_source_document rows written by equipment:import.
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
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Bludgeoning",
        "url": "/api/2014/damage-types/bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "light",
        "name": "Light",
        "url": "/api/2014/weapon-properties/light"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/weapon-properties/monk"
      }
    ],
    "url": "/api/2014/equipment/club"
  },
  {
    "index": "dagger",
    "name": "Dagger",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 1,
    "properties": [
      {
        "index": "finesse",
        "name": "Finesse",
        "url": "/api/2014/weapon-properties/finesse"
      },
      {
        "index": "light",
        "name": "Light",
        "url": "/api/2014/weapon-properties/light"
      },
      {
        "index": "thrown",
        "name": "Thrown",
        "url": "/api/2014/weapon-properties/thrown"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/weapon-properties/monk"
      }
    ],
    "throw_range": {
      "normal": 20,
      "long": 60
    },
    "url": "/api/2014/equipment/dagger"
  },
  {
    "index": "greatclub",
    "name": "Greatclub",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Bludgeoning",
        "url": "/api/2014/damage-types/bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 10,
    "properties": [
      {
        "index": "two-handed",
        "name": "Two-Handed",
        "url": "/api/2014/weapon-properties/two-handed"
      }
    ],
    "url": "/api/2014/equipment/greatclub"
  },
  {
    "index": "handaxe",
    "name": "Handaxe",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "light",
        "name": "Light",
        "url": "/api/2014/weapon-properties/light"
      },
      {
        "index": "thrown",
        "name": "Thrown",
        "url": "/api/2014/weapon-properties/thrown"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/weapon-properties/monk"
      }
    ],
    "throw_range": {
      "normal": 20,
      "long": 60
    },
    "url": "/api/2014/equipment/handaxe"
  },
  {
    "index": "javelin",
    "name": "Javelin",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "thrown",
        "name": "Thrown",
        "url": "/api/2014/weapon-properties/thrown"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/weapon-properties/monk"
      }
    ],
    "throw_range": {
      "normal": 30,
      "long": 120
    },
    "url": "/api/2014/equipment/javelin"
  },
  {
    "index": "light-hammer",
    "name": "Light hammer",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Bludgeoning",
        "url": "/api/2014/damage-types/bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "light",
        "name": "Light",
        "url": "/api/2014/weapon-properties/light"
      },
      {
        "index": "thrown",
        "name": "Thrown",
        "url": "/api/2014/weapon-properties/thrown"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/weapon-properties/monk"
      }
    ],
    "throw_range": {
      "normal": 20,
      "long": 60
    },
    "url": "/api/2014/equipment/light-hammer"
  },
  {
    "index": "mace",
    "name": "Mace",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Bludgeoning",
        "url": "/api/2014/damage-types/bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 4,
    "properties": [
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/weapon-properties/monk"
      }
    ],
    "url": "/api/2014/equipment/mace"
  },
  {
    "index": "quarterstaff",
    "name": "Quarterstaff",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Bludgeoning",
        "url": "/api/2014/damage-types/bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 4,
    "properties": [
      {
        "index": "versatile",
        "name": "Versatile",
        "url": "/api/2014/weapon-properties/versatile"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/weapon-properties/monk"
      }
    ],
    "two_handed_damage": {
      "damage_dice": "1d8",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning",
        "url": "/api/2014/damage-types/bludgeoning"
      }
    },
    "url": "/api/2014/equipment/quarterstaff"
  },
  {
    "index": "sickle",
    "name": "Sickle",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "light",
        "name": "Light",
        "url": "/api/2014/weapon-properties/light"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/weapon-properties/monk"
      }
    ],
    "url": "/api/2014/equipment/sickle"
  },
  {
    "index": "spear",
    "name": "Spear",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 3,
    "properties": [
      {
        "index": "thrown",
        "name": "Thrown",
        "url": "/api/2014/weapon-properties/thrown"
      },
      {
        "index": "versatile",
        "name": "Versatile",
        "url": "/api/2014/weapon-properties/versatile"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/weapon-properties/monk"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "url": "/api/2014/equipment/spear"
  },
  {
    "index": "crossbow-light",
    "name": "Crossbow, light",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
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
        "name": "Ammunition",
        "url": "/api/2014/weapon-properties/ammunition"
      },
      {
        "index": "loading",
        "name": "Loading",
        "url": "/api/2014/weapon-properties/loading"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed",
        "url": "/api/2014/weapon-properties/two-handed"
      }
    ],
    "url": "/api/2014/equipment/crossbow-light"
  },
  {
    "index": "dart",
    "name": "Dart",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
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
        "name": "Finesse",
        "url": "/api/2014/weapon-properties/finesse"
      },
      {
        "index": "thrown",
        "name": "Thrown",
        "url": "/api/2014/weapon-properties/thrown"
      }
    ],
    "throw_range": {
      "normal": 20,
      "long": 60
    },
    "url": "/api/2014/equipment/dart"
  },
  {
    "index": "shortbow",
    "name": "Shortbow",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
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
        "name": "Ammunition",
        "url": "/api/2014/weapon-properties/ammunition"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed",
        "url": "/api/2014/weapon-properties/two-handed"
      }
    ],
    "url": "/api/2014/equipment/shortbow"
  },
  {
    "index": "sling",
    "name": "Sling",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Bludgeoning",
        "url": "/api/2014/damage-types/bludgeoning"
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
        "name": "Ammunition",
        "url": "/api/2014/weapon-properties/ammunition"
      }
    ],
    "url": "/api/2014/equipment/sling"
  },
  {
    "index": "battleaxe",
    "name": "Battleaxe",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 4,
    "properties": [
      {
        "index": "versatile",
        "name": "Versatile",
        "url": "/api/2014/weapon-properties/versatile"
      }
    ],
    "two_handed_damage": {
      "damage_dice": "1d10",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "url": "/api/2014/equipment/battleaxe"
  },
  {
    "index": "flail",
    "name": "Flail",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Bludgeoning",
        "url": "/api/2014/damage-types/bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [],
    "url": "/api/2014/equipment/flail"
  },
  {
    "index": "glaive",
    "name": "Glaive",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 6,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy",
        "url": "/api/2014/weapon-properties/heavy"
      },
      {
        "index": "reach",
        "name": "Reach",
        "url": "/api/2014/weapon-properties/reach"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed",
        "url": "/api/2014/weapon-properties/two-handed"
      }
    ],
    "url": "/api/2014/equipment/glaive"
  },
  {
    "index": "greataxe",
    "name": "Greataxe",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 7,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy",
        "url": "/api/2014/weapon-properties/heavy"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed",
        "url": "/api/2014/weapon-properties/two-handed"
      }
    ],
    "url": "/api/2014/equipment/greataxe"
  },
  {
    "index": "greatsword",
    "name": "Greatsword",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 6,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy",
        "url": "/api/2014/weapon-properties/heavy"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed",
        "url": "/api/2014/weapon-properties/two-handed"
      }
    ],
    "url": "/api/2014/equipment/greatsword"
  },
  {
    "index": "halberd",
    "name": "Halberd",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 6,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy",
        "url": "/api/2014/weapon-properties/heavy"
      },
      {
        "index": "reach",
        "name": "Reach",
        "url": "/api/2014/weapon-properties/reach"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed",
        "url": "/api/2014/weapon-properties/two-handed"
      }
    ],
    "url": "/api/2014/equipment/halberd"
  },
  {
    "index": "lance",
    "name": "Lance",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 6,
    "properties": [
      {
        "index": "reach",
        "name": "Reach",
        "url": "/api/2014/weapon-properties/reach"
      },
      {
        "index": "special",
        "name": "Special",
        "url": "/api/2014/weapon-properties/special"
      }
    ],
    "special": [
      "You have disadvantage when you use a lance to attack a target within 5 feet of you. Also, a lance requires two hands to wield when you aren't mounted."
    ],
    "url": "/api/2014/equipment/lance"
  },
  {
    "index": "longsword",
    "name": "Longsword",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 3,
    "properties": [
      {
        "index": "versatile",
        "name": "Versatile",
        "url": "/api/2014/weapon-properties/versatile"
      }
    ],
    "two_handed_damage": {
      "damage_dice": "1d10",
      "damage_type": {
        "index": "slashing",
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "url": "/api/2014/equipment/longsword"
  },
  {
    "index": "maul",
    "name": "Maul",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Bludgeoning",
        "url": "/api/2014/damage-types/bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 10,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy",
        "url": "/api/2014/weapon-properties/heavy"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed",
        "url": "/api/2014/weapon-properties/two-handed"
      }
    ],
    "url": "/api/2014/equipment/maul"
  },
  {
    "index": "morningstar",
    "name": "Morningstar",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 4,
    "properties": [],
    "url": "/api/2014/equipment/morningstar"
  },
  {
    "index": "pike",
    "name": "Pike",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 18,
    "properties": [
      {
        "index": "heavy",
        "name": "Heavy",
        "url": "/api/2014/weapon-properties/heavy"
      },
      {
        "index": "reach",
        "name": "Reach",
        "url": "/api/2014/weapon-properties/reach"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed",
        "url": "/api/2014/weapon-properties/two-handed"
      }
    ],
    "url": "/api/2014/equipment/pike"
  },
  {
    "index": "rapier",
    "name": "Rapier",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "finesse",
        "name": "Finesse",
        "url": "/api/2014/weapon-properties/finesse"
      }
    ],
    "url": "/api/2014/equipment/rapier"
  },
  {
    "index": "scimitar",
    "name": "Scimitar",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 3,
    "properties": [
      {
        "index": "finesse",
        "name": "Finesse",
        "url": "/api/2014/weapon-properties/finesse"
      },
      {
        "index": "light",
        "name": "Light",
        "url": "/api/2014/weapon-properties/light"
      }
    ],
    "url": "/api/2014/equipment/scimitar"
  },
  {
    "index": "shortsword",
    "name": "Shortsword",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "finesse",
        "name": "Finesse",
        "url": "/api/2014/weapon-properties/finesse"
      },
      {
        "index": "light",
        "name": "Light",
        "url": "/api/2014/weapon-properties/light"
      },
      {
        "index": "monk",
        "name": "Monk",
        "url": "/api/2014/weapon-properties/monk"
      }
    ],
    "url": "/api/2014/equipment/shortsword"
  },
  {
    "index": "trident",
    "name": "Trident",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 4,
    "properties": [
      {
        "index": "thrown",
        "name": "Thrown",
        "url": "/api/2014/weapon-properties/thrown"
      },
      {
        "index": "versatile",
        "name": "Versatile",
        "url": "/api/2014/weapon-properties/versatile"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "url": "/api/2014/equipment/trident"
  },
  {
    "index": "war-pick",
    "name": "War pick",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [],
    "url": "/api/2014/equipment/war-pick"
  },
  {
    "index": "warhammer",
    "name": "Warhammer",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Bludgeoning",
        "url": "/api/2014/damage-types/bludgeoning"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 2,
    "properties": [
      {
        "index": "versatile",
        "name": "Versatile",
        "url": "/api/2014/weapon-properties/versatile"
      }
    ],
    "two_handed_damage": {
      "damage_dice": "1d10",
      "damage_type": {
        "index": "bludgeoning",
        "name": "Bludgeoning",
        "url": "/api/2014/damage-types/bludgeoning"
      }
    },
    "url": "/api/2014/equipment/warhammer"
  },
  {
    "index": "whip",
    "name": "Whip",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Slashing",
        "url": "/api/2014/damage-types/slashing"
      }
    },
    "range": {
      "normal": 5
    },
    "weight": 3,
    "properties": [
      {
        "index": "finesse",
        "name": "Finesse",
        "url": "/api/2014/weapon-properties/finesse"
      },
      {
        "index": "reach",
        "name": "Reach",
        "url": "/api/2014/weapon-properties/reach"
      }
    ],
    "url": "/api/2014/equipment/whip"
  },
  {
    "index": "blowgun",
    "name": "Blowgun",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
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
        "name": "Ammunition",
        "url": "/api/2014/weapon-properties/ammunition"
      },
      {
        "index": "loading",
        "name": "Loading",
        "url": "/api/2014/weapon-properties/loading"
      }
    ],
    "url": "/api/2014/equipment/blowgun"
  },
  {
    "index": "crossbow-hand",
    "name": "Crossbow, hand",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
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
        "name": "Ammunition",
        "url": "/api/2014/weapon-properties/ammunition"
      },
      {
        "index": "light",
        "name": "Light",
        "url": "/api/2014/weapon-properties/light"
      },
      {
        "index": "loading",
        "name": "Loading",
        "url": "/api/2014/weapon-properties/loading"
      }
    ],
    "url": "/api/2014/equipment/crossbow-hand"
  },
  {
    "index": "crossbow-heavy",
    "name": "Crossbow, heavy",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
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
        "name": "Ammunition",
        "url": "/api/2014/weapon-properties/ammunition"
      },
      {
        "index": "heavy",
        "name": "Heavy",
        "url": "/api/2014/weapon-properties/heavy"
      },
      {
        "index": "loading",
        "name": "Loading",
        "url": "/api/2014/weapon-properties/loading"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed",
        "url": "/api/2014/weapon-properties/two-handed"
      }
    ],
    "image": "/api/images/equipment/crossbow-heavy.png",
    "url": "/api/2014/equipment/crossbow-heavy"
  },
  {
    "index": "longbow",
    "name": "Longbow",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Piercing",
        "url": "/api/2014/damage-types/piercing"
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
        "name": "Ammunition",
        "url": "/api/2014/weapon-properties/ammunition"
      },
      {
        "index": "heavy",
        "name": "Heavy",
        "url": "/api/2014/weapon-properties/heavy"
      },
      {
        "index": "two-handed",
        "name": "Two-Handed",
        "url": "/api/2014/weapon-properties/two-handed"
      }
    ],
    "url": "/api/2014/equipment/longbow"
  },
  {
    "index": "net",
    "name": "Net",
    "equipment_category": {
      "index": "weapon",
      "name": "Weapon",
      "url": "/api/2014/equipment-categories/weapon"
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
        "name": "Thrown",
        "url": "/api/2014/weapon-properties/thrown"
      },
      {
        "index": "special",
        "name": "Special",
        "url": "/api/2014/weapon-properties/special"
      }
    ],
    "special": [
      "A Large or smaller creature hit by a net is restrained until it is freed. A net has no effect on creatures that are formless, or creatures that are Huge or larger. A creature can use its action to make a DC 10 Strength check, freeing itself or another creature within its reach on a success. Dealing 5 slashing damage to the net (AC 10) also frees the creature without harming it, ending the effect and destroying the net. When you use an action, bonus action, or reaction to attack with a net, you can make only one attack regardless of the number of attacks you can normally make."
    ],
    "throw_range": {
      "normal": 5,
      "long": 15
    },
    "url": "/api/2014/equipment/net"
  },
  {
    "index": "padded-armor",
    "name": "Padded Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/padded-armor"
  },
  {
    "index": "leather-armor",
    "name": "Leather Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/leather-armor"
  },
  {
    "index": "studded-leather-armor",
    "name": "Studded Leather Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/studded-leather-armor"
  },
  {
    "index": "hide-armor",
    "name": "Hide Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/hide-armor"
  },
  {
    "index": "chain-shirt",
    "name": "Chain Shirt",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/chain-shirt"
  },
  {
    "index": "scale-mail",
    "name": "Scale Mail",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/scale-mail"
  },
  {
    "index": "breastplate",
    "name": "Breastplate",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/breastplate"
  },
  {
    "index": "half-plate-armor",
    "name": "Half Plate Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/half-plate-armor"
  },
  {
    "index": "ring-mail",
    "name": "Ring Mail",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/ring-mail"
  },
  {
    "index": "chain-mail",
    "name": "Chain Mail",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/chain-mail"
  },
  {
    "index": "splint-armor",
    "name": "Splint Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/splint-armor"
  },
  {
    "index": "plate-armor",
    "name": "Plate Armor",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/plate-armor"
  },
  {
    "index": "shield",
    "name": "Shield",
    "equipment_category": {
      "index": "armor",
      "name": "Armor",
      "url": "/api/2014/equipment-categories/armor"
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
    },
    "url": "/api/2014/equipment/shield"
  },
  {
    "index": "abacus",
    "name": "Abacus",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 2,
    "url": "/api/2014/equipment/abacus"
  },
  {
    "index": "acid-vial",
    "name": "Acid (vial)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "As an action, you can splash the contents of this vial onto a creature within 5 feet of you or throw the vial up to 20 feet, shattering it on impact. In either case, make a ranged attack against a creature or object, treating the acid as an improvised weapon.",
      "On a hit, the target takes 2d6 acid damage."
    ],
    "url": "/api/2014/equipment/acid-vial"
  },
  {
    "index": "alchemists-fire-flask",
    "name": "Alchemist's fire (flask)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
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
    "weight": 1,
    "url": "/api/2014/equipment/alchemists-fire-flask"
  },
  {
    "index": "alms-box",
    "name": "Alms box",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A small box for alms, typically found in a priest's pack."
    ],
    "url": "/api/2014/equipment/alms-box"
  },
  {
    "index": "arrow",
    "name": "Arrow",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "ammunition",
      "name": "Ammunition",
      "url": "/api/2014/equipment-categories/ammunition"
    },
    "quantity": 20,
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1,
    "url": "/api/2014/equipment/arrow"
  },
  {
    "index": "block-of-incense",
    "name": "Block of incense",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A block of incense, typically found in a priest's pack."
    ],
    "url": "/api/2014/equipment/block-of-incense"
  },
  {
    "index": "blowgun-needle",
    "name": "Blowgun needle",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "ammunition",
      "name": "Ammunition",
      "url": "/api/2014/equipment-categories/ammunition"
    },
    "quantity": 50,
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1,
    "url": "/api/2014/equipment/blowgun-needle"
  },
  {
    "index": "censer",
    "name": "Censer",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A censer, typically found in a priest's pack."
    ],
    "url": "/api/2014/equipment/censer"
  },
  {
    "index": "crossbow-bolt",
    "name": "Crossbow bolt",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "ammunition",
      "name": "Ammunition",
      "url": "/api/2014/equipment-categories/ammunition"
    },
    "quantity": 20,
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1.5,
    "url": "/api/2014/equipment/crossbow-bolt"
  },
  {
    "index": "sling-bullet",
    "name": "Sling bullet",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "ammunition",
      "name": "Ammunition",
      "url": "/api/2014/equipment-categories/ammunition"
    },
    "quantity": 20,
    "cost": {
      "quantity": 4,
      "unit": "cp"
    },
    "weight": 1.5,
    "url": "/api/2014/equipment/sling-bullet"
  },
  {
    "index": "amulet",
    "name": "Amulet",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "holy-symbols",
      "name": "Holy Symbols",
      "url": "/api/2014/equipment-categories/holy-symbols"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "A holy symbol is a representation of a god or pantheon. It might be an amulet depicting a symbol representing a deity, the same symbol carefully engraved or inlaid as an emblem on a shield, or a tiny box holding a fragment of a sacred relic.",
      "Appendix B lists the symbols commonly associated with many gods in the multiverse. A cleric or paladin can use a holy symbol as a spellcasting focus. To use the symbol in this way, the caster must hold it in hand, wear it visibly, or bear it on a shield."
    ],
    "url": "/api/2014/equipment/amulet"
  },
  {
    "index": "antitoxin-vial",
    "name": "Antitoxin (vial)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "A creature that drinks this vial of liquid gains advantage on saving throws against poison for 1 hour. It confers no benefit to undead or constructs."
    ],
    "url": "/api/2014/equipment/antitoxin-vial"
  },
  {
    "index": "crystal",
    "name": "Crystal",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "arcane-foci",
      "name": "Arcane Foci",
      "url": "/api/2014/equipment-categories/arcane-foci"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus."
    ],
    "url": "/api/2014/equipment/crystal"
  },
  {
    "index": "orb",
    "name": "Orb",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "arcane-foci",
      "name": "Arcane Foci",
      "url": "/api/2014/equipment-categories/arcane-foci"
    },
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus."
    ],
    "url": "/api/2014/equipment/orb"
  },
  {
    "index": "rod",
    "name": "Rod",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "arcane-foci",
      "name": "Arcane Foci",
      "url": "/api/2014/equipment-categories/arcane-foci"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus."
    ],
    "url": "/api/2014/equipment/rod"
  },
  {
    "index": "staff",
    "name": "Staff",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "arcane-foci",
      "name": "Arcane Foci",
      "url": "/api/2014/equipment-categories/arcane-foci"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 4,
    "desc": [
      "An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus."
    ],
    "url": "/api/2014/equipment/staff"
  },
  {
    "index": "wand",
    "name": "Wand",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "arcane-foci",
      "name": "Arcane Foci",
      "url": "/api/2014/equipment-categories/arcane-foci"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus."
    ],
    "url": "/api/2014/equipment/wand"
  },
  {
    "index": "backpack",
    "name": "Backpack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 5,
    "url": "/api/2014/equipment/backpack"
  },
  {
    "index": "ball-bearings-bag-of-1000",
    "name": "Ball bearings (bag of 1,000)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
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
    "image": "/api/images/equipment/ball-bearings-bag-of-1000.png",
    "url": "/api/2014/equipment/ball-bearings-bag-of-1000"
  },
  {
    "index": "barrel",
    "name": "Barrel",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 70,
    "url": "/api/2014/equipment/barrel"
  },
  {
    "index": "basket",
    "name": "Basket",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 4,
      "unit": "sp"
    },
    "weight": 2,
    "url": "/api/2014/equipment/basket"
  },
  {
    "index": "bedroll",
    "name": "Bedroll",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 7,
    "url": "/api/2014/equipment/bedroll"
  },
  {
    "index": "bell",
    "name": "Bell",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/bell"
  },
  {
    "index": "blanket",
    "name": "Blanket",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 3,
    "url": "/api/2014/equipment/blanket"
  },
  {
    "index": "block-and-tackle",
    "name": "Block and tackle",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "A set of pulleys with a cable threaded through them and a hook to attach to objects, a block and tackle allows you to hoist up to four times the weight you can normally lift."
    ],
    "url": "/api/2014/equipment/block-and-tackle"
  },
  {
    "index": "book",
    "name": "Book",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "A book might contain poetry, historical accounts, information pertaining to a particular field of lore, diagrams and notes on gnomish contraptions, or just about anything else that can be represented using text or pictures. A book of spells is a spellbook (described later in this section)."
    ],
    "url": "/api/2014/equipment/book"
  },
  {
    "index": "bottle-glass",
    "name": "Bottle, glass",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 2,
    "url": "/api/2014/equipment/bottle-glass"
  },
  {
    "index": "bucket",
    "name": "Bucket",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "weight": 2,
    "url": "/api/2014/equipment/bucket"
  },
  {
    "index": "caltrops",
    "name": "Caltrops",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
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
    ],
    "url": "/api/2014/equipment/caltrops"
  },
  {
    "index": "candle",
    "name": "Candle",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "For 1 hour, a candle sheds bright light in a 5-foot radius and dim light for an additional 5 feet."
    ],
    "url": "/api/2014/equipment/candle"
  },
  {
    "index": "case-crossbow-bolt",
    "name": "Case, crossbow bolt",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "This wooden case can hold up to twenty crossbow bolts."
    ],
    "url": "/api/2014/equipment/case-crossbow-bolt"
  },
  {
    "index": "case-map-or-scroll",
    "name": "Case, map or scroll",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "This cylindrical leather case can hold up to ten rolled-up sheets of paper or five rolled-up sheets of parchment."
    ],
    "url": "/api/2014/equipment/case-map-or-scroll"
  },
  {
    "index": "chain-10-feet",
    "name": "Chain (10 feet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 10,
    "desc": [
      "A chain has 10 hit points. It can be burst with a successful DC 20 Strength check."
    ],
    "url": "/api/2014/equipment/chain-10-feet"
  },
  {
    "index": "chalk-1-piece",
    "name": "Chalk (1 piece)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "cp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/chalk-1-piece"
  },
  {
    "index": "chest",
    "name": "Chest",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 25,
    "url": "/api/2014/equipment/chest"
  },
  {
    "index": "clothes-common",
    "name": "Clothes, common",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 3,
    "url": "/api/2014/equipment/clothes-common"
  },
  {
    "index": "clothes-costume",
    "name": "Clothes, costume",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 4,
    "url": "/api/2014/equipment/clothes-costume"
  },
  {
    "index": "clothes-fine",
    "name": "Clothes, fine",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 15,
      "unit": "gp"
    },
    "weight": 6,
    "url": "/api/2014/equipment/clothes-fine"
  },
  {
    "index": "clothes-travelers",
    "name": "Clothes, traveler's",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 4,
    "url": "/api/2014/equipment/clothes-travelers"
  },
  {
    "index": "component-pouch",
    "name": "Component pouch",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "A component pouch is a small, watertight leather belt pouch that has compartments to hold all the material components and other special items you need to cast your spells, except for those components that have a specific cost (as indicated in a spell's description)."
    ],
    "url": "/api/2014/equipment/component-pouch"
  },
  {
    "index": "crowbar",
    "name": "Crowbar",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "Using a crowbar grants advantage to Strength checks where the crowbar's leverage can be applied."
    ],
    "url": "/api/2014/equipment/crowbar"
  },
  {
    "index": "sprig-of-mistletoe",
    "name": "Sprig of mistletoe",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "druidic-foci",
      "name": "Druidic Foci",
      "url": "/api/2014/equipment-categories/druidic-foci"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus."
    ],
    "url": "/api/2014/equipment/sprig-of-mistletoe"
  },
  {
    "index": "totem",
    "name": "Totem",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "druidic-foci",
      "name": "Druidic Foci",
      "url": "/api/2014/equipment-categories/druidic-foci"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus."
    ],
    "url": "/api/2014/equipment/totem"
  },
  {
    "index": "wooden-staff",
    "name": "Wooden staff",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "druidic-foci",
      "name": "Druidic Foci",
      "url": "/api/2014/equipment-categories/druidic-foci"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 4,
    "desc": [
      "A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus."
    ],
    "url": "/api/2014/equipment/wooden-staff"
  },
  {
    "index": "yew-wand",
    "name": "Yew wand",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "druidic-foci",
      "name": "Druidic Foci",
      "url": "/api/2014/equipment-categories/druidic-foci"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus."
    ],
    "url": "/api/2014/equipment/yew-wand"
  },
  {
    "index": "emblem",
    "name": "Emblem",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "holy-symbols",
      "name": "Holy Symbols",
      "url": "/api/2014/equipment-categories/holy-symbols"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "A holy symbol is a representation of a god or pantheon. It might be an amulet depicting a symbol representing a deity, the same symbol carefully engraved or inlaid as an emblem on a shield, or a tiny box holding a fragment of a sacred relic.",
      "Appendix B lists the symbols commonly associated with many gods in the multiverse. A cleric or paladin can use a holy symbol as a spellcasting focus. To use the symbol in this way, the caster must hold it in hand, wear it visibly, or bear it on a shield."
    ],
    "url": "/api/2014/equipment/emblem"
  },
  {
    "index": "fishing-tackle",
    "name": "Fishing tackle",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 4,
    "desc": [
      "This kit includes a wooden rod, silken line, corkwood bobbers, steel hooks, lead sinkers, velvet lures, and narrow netting."
    ],
    "url": "/api/2014/equipment/fishing-tackle"
  },
  {
    "index": "flask-or-tankard",
    "name": "Flask or tankard",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "cp"
    },
    "weight": 1,
    "url": "/api/2014/equipment/flask-or-tankard"
  },
  {
    "index": "grappling-hook",
    "name": "Grappling hook",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 4,
    "url": "/api/2014/equipment/grappling-hook"
  },
  {
    "index": "hammer",
    "name": "Hammer",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 3,
    "url": "/api/2014/equipment/hammer"
  },
  {
    "index": "hammer-sledge",
    "name": "Hammer, sledge",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 10,
    "url": "/api/2014/equipment/hammer-sledge"
  },
  {
    "index": "holy-water-flask",
    "name": "Holy water (flask)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
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
    ],
    "url": "/api/2014/equipment/holy-water-flask"
  },
  {
    "index": "hourglass",
    "name": "Hourglass",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 1,
    "url": "/api/2014/equipment/hourglass"
  },
  {
    "index": "hunting-trap",
    "name": "Hunting trap",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
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
    "weight": 25,
    "url": "/api/2014/equipment/hunting-trap"
  },
  {
    "index": "ink-1-ounce-bottle",
    "name": "Ink (1 ounce bottle)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/ink-1-ounce-bottle"
  },
  {
    "index": "ink-pen",
    "name": "Ink pen",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "cp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/ink-pen"
  },
  {
    "index": "jug-or-pitcher",
    "name": "Jug or pitcher",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "cp"
    },
    "weight": 4,
    "url": "/api/2014/equipment/jug-or-pitcher"
  },
  {
    "index": "climbers-kit",
    "name": "Climber's Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits",
      "url": "/api/2014/equipment-categories/kits"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 12,
    "desc": [
      "A climber's kit includes special pitons, boot tips, gloves, and a harness. You can use the climber's kit as an action to anchor yourself; when you do, you can't fall more than 25 feet from the point where you anchored yourself, and you can't climb more than 25 feet away from that point without undoing the anchor."
    ],
    "url": "/api/2014/equipment/climbers-kit"
  },
  {
    "index": "disguise-kit",
    "name": "Disguise Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits",
      "url": "/api/2014/equipment-categories/kits"
    },
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "This pouch of cosmetics, hair dye, and small props lets you create disguises that change your physical appearance. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to create a visual disguise."
    ],
    "url": "/api/2014/equipment/disguise-kit"
  },
  {
    "index": "forgery-kit",
    "name": "Forgery Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits",
      "url": "/api/2014/equipment-categories/kits"
    },
    "cost": {
      "quantity": 15,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "This small box contains a variety of papers and parchments, pens and inks, seals and sealing wax, gold and silver leaf, and other supplies necessary to create convincing forgeries of physical documents. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to create a physical forgery of a document."
    ],
    "url": "/api/2014/equipment/forgery-kit"
  },
  {
    "index": "herbalism-kit",
    "name": "Herbalism Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits",
      "url": "/api/2014/equipment-categories/kits"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "This kit contains a variety of instruments such as clippers, mortar and pestle, and pouches and vials used by herbalists to create remedies and potions. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to identify or apply herbs. Also, proficiency with this kit is required to create antitoxin and potions of healing."
    ],
    "url": "/api/2014/equipment/herbalism-kit"
  },
  {
    "index": "healers-kit",
    "name": "Healer's Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits",
      "url": "/api/2014/equipment-categories/kits"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "This kit is a leather pouch containing bandages, salves, and splints. The kit has ten uses. As an action, you can expend one use of the kit to stabilize a creature that has 0 hit points, without needing to make a Wisdom (Medicine) check."
    ],
    "url": "/api/2014/equipment/healers-kit"
  },
  {
    "index": "mess-kit",
    "name": "Mess Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits",
      "url": "/api/2014/equipment-categories/kits"
    },
    "cost": {
      "quantity": 2,
      "unit": "sp"
    },
    "weight": 1,
    "desc": [
      "This tin box contains a cup and simple cutlery. The box clamps together, and one side can be used as a cooking pan and the other as a plate or shallow bowl."
    ],
    "url": "/api/2014/equipment/mess-kit"
  },
  {
    "index": "poisoners-kit",
    "name": "Poisoner's Kit",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "kits",
      "name": "Kits",
      "url": "/api/2014/equipment-categories/kits"
    },
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "A poisoner's kit includes the vials, chemicals, and other equipment necessary for the creation of poisons. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to craft or use poisons."
    ],
    "url": "/api/2014/equipment/poisoners-kit"
  },
  {
    "index": "ladder-10-foot",
    "name": "Ladder (10-foot)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "sp"
    },
    "weight": 25,
    "url": "/api/2014/equipment/ladder-10-foot"
  },
  {
    "index": "lamp",
    "name": "Lamp",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 1,
    "desc": [
      "A lamp casts bright light in a 15-foot radius and dim light for an additional 30 feet. Once lit, it burns for 6 hours on a flask (1 pint) of oil."
    ],
    "url": "/api/2014/equipment/lamp"
  },
  {
    "index": "lantern-bullseye",
    "name": "Lantern, bullseye",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "A bullseye lantern casts bright light in a 60-foot cone and dim light for an additional 60 feet. Once lit, it burns for 6 hours on a flask (1 pint) of oil."
    ],
    "url": "/api/2014/equipment/lantern-bullseye"
  },
  {
    "index": "lantern-hooded",
    "name": "Lantern, hooded",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "A hooded lantern casts bright light in a 30-foot radius and dim light for an additional 30 feet. Once lit, it burns for 6 hours on a flask (1 pint) of oil. As an action, you can lower the hood, reducing the light to dim light in a 5-foot radius."
    ],
    "url": "/api/2014/equipment/lantern-hooded"
  },
  {
    "index": "little-bag-of-sand",
    "name": "Little bag of sand",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A small bag of sand, typically found in a scholar's pack."
    ],
    "url": "/api/2014/equipment/little-bag-of-sand"
  },
  {
    "index": "lock",
    "name": "Lock",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "A key is provided with the lock. Without the key, a creature proficient with thieves' tools can pick this lock with a successful DC 15 Dexterity check. Your GM may decide that better locks are available for higher prices."
    ],
    "url": "/api/2014/equipment/lock"
  },
  {
    "index": "magnifying-glass",
    "name": "Magnifying glass",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 100,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "This lens allows a closer look at small objects. It is also useful as a substitute for flint and steel when starting fires. Lighting a fire with a magnifying glass requires light as bright as sunlight to focus, tinder to ignite, and about 5 minutes for the fire to ignite.",
      "A magnifying glass grants advantage on any ability check made to appraise or inspect an item that is small or highly detailed."
    ],
    "url": "/api/2014/equipment/magnifying-glass"
  },
  {
    "index": "manacles",
    "name": "Manacles",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 6,
    "desc": [
      "These metal restraints can bind a Small or Medium creature. Escaping the manacles requires a successful DC 20 Dexterity check. Breaking them requires a successful DC 20 Strength check.",
      "Each set of manacles comes with one key. Without the key, a creature proficient with thieves' tools can pick the manacles' lock with a successful DC 15 Dexterity check. Manacles have 15 hit points."
    ],
    "url": "/api/2014/equipment/manacles"
  },
  {
    "index": "mirror-steel",
    "name": "Mirror, steel",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 0.5,
    "url": "/api/2014/equipment/mirror-steel"
  },
  {
    "index": "oil-flask",
    "name": "Oil (flask)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
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
    ],
    "url": "/api/2014/equipment/oil-flask"
  },
  {
    "index": "paper-one-sheet",
    "name": "Paper (one sheet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "sp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/paper-one-sheet"
  },
  {
    "index": "parchment-one-sheet",
    "name": "Parchment (one sheet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "sp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/parchment-one-sheet"
  },
  {
    "index": "perfume-vial",
    "name": "Perfume (vial)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/perfume-vial"
  },
  {
    "index": "pick-miners",
    "name": "Pick, miner's",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 10,
    "url": "/api/2014/equipment/pick-miners"
  },
  {
    "index": "piton",
    "name": "Piton",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "weight": 0.25,
    "url": "/api/2014/equipment/piton"
  },
  {
    "index": "poison-basic-vial",
    "name": "Poison, basic (vial)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 100,
      "unit": "gp"
    },
    "weight": 0,
    "desc": [
      "You can use the poison in this vial to coat one slashing or piercing weapon or up to three pieces of ammunition. Applying the poison takes an action. A creature hit by the poisoned weapon or ammunition must make a DC 10 Constitution saving throw or take 1d4 poison damage. Once applied, the poison retains potency for 1 minute before drying."
    ],
    "url": "/api/2014/equipment/poison-basic-vial"
  },
  {
    "index": "pole-10-foot",
    "name": "Pole (10-foot)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "weight": 7,
    "url": "/api/2014/equipment/pole-10-foot"
  },
  {
    "index": "pot-iron",
    "name": "Pot, iron",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 10,
    "url": "/api/2014/equipment/pot-iron"
  },
  {
    "index": "pouch",
    "name": "Pouch",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 1,
    "desc": [
      "A cloth or leather pouch can hold up to 20 sling bullets or 50 blowgun needles, among other things. A compartmentalized pouch for holding spell components is called a component pouch (described earlier in this section)."
    ],
    "url": "/api/2014/equipment/pouch"
  },
  {
    "index": "quiver",
    "name": "Quiver",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "A quiver can hold up to 20 arrows."
    ],
    "url": "/api/2014/equipment/quiver"
  },
  {
    "index": "ram-portable",
    "name": "Ram, portable",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 4,
      "unit": "gp"
    },
    "weight": 35,
    "desc": [
      "You can use a portable ram to break down doors. When doing so, you gain a +4 bonus on the Strength check. One other character can help you use the ram, giving you advantage on this check."
    ],
    "url": "/api/2014/equipment/ram-portable"
  },
  {
    "index": "rations-1-day",
    "name": "Rations (1 day)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 2,
    "desc": [
      "Rations consist of dry foods suitable for extended travel, including jerky, dried fruit, hardtack, and nuts."
    ],
    "url": "/api/2014/equipment/rations-1-day"
  },
  {
    "index": "reliquary",
    "name": "Reliquary",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "holy-symbols",
      "name": "Holy Symbols",
      "url": "/api/2014/equipment-categories/holy-symbols"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "A holy symbol is a representation of a god or pantheon. It might be an amulet depicting a symbol representing a deity, the same symbol carefully engraved or inlaid as an emblem on a shield, or a tiny box holding a fragment of a sacred relic.",
      "Appendix B lists the symbols commonly associated with many gods in the multiverse. A cleric or paladin can use a holy symbol as a spellcasting focus. To use the symbol in this way, the caster must hold it in hand, wear it visibly, or bear it on a shield."
    ],
    "url": "/api/2014/equipment/reliquary"
  },
  {
    "index": "robes",
    "name": "Robes",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 4,
    "url": "/api/2014/equipment/robes"
  },
  {
    "index": "rope-hempen-50-feet",
    "name": "Rope, hempen (50 feet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 10,
    "desc": [
      "Rope, whether made of hemp or silk, has 2 hit points and can be burst with a DC 17 Strength check."
    ],
    "url": "/api/2014/equipment/rope-hempen-50-feet"
  },
  {
    "index": "rope-silk-50-feet",
    "name": "Rope, silk (50 feet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "Rope, whether made of hemp or silk, has 2 hit points and can be burst with a DC 17 Strength check."
    ],
    "url": "/api/2014/equipment/rope-silk-50-feet"
  },
  {
    "index": "sack",
    "name": "Sack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "cp"
    },
    "weight": 0.5,
    "url": "/api/2014/equipment/sack"
  },
  {
    "index": "scale-merchants",
    "name": "Scale, merchant's",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "A scale includes a small balance, pans, and a suitable assortment of weights up to 2 pounds. With it, you can measure the exact weight of small objects, such as raw precious metals or trade goods, to help determine their worth."
    ],
    "url": "/api/2014/equipment/scale-merchants"
  },
  {
    "index": "sealing-wax",
    "name": "Sealing wax",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/sealing-wax"
  },
  {
    "index": "shovel",
    "name": "Shovel",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 5,
    "url": "/api/2014/equipment/shovel"
  },
  {
    "index": "signal-whistle",
    "name": "Signal whistle",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/signal-whistle"
  },
  {
    "index": "signet-ring",
    "name": "Signet ring",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/signet-ring"
  },
  {
    "index": "small-knife",
    "name": "Small knife",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A small knife, typically found in a scholar's pack."
    ],
    "url": "/api/2014/equipment/small-knife"
  },
  {
    "index": "soap",
    "name": "Soap",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "cp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/soap"
  },
  {
    "index": "spellbook",
    "name": "Spellbook",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "Essential for wizards, a spellbook is a leather-bound tome with 100 blank vellum pages suitable for recording spells."
    ],
    "url": "/api/2014/equipment/spellbook"
  },
  {
    "index": "spike-iron",
    "name": "Spike, iron",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "sp"
    },
    "weight": 5,
    "url": "/api/2014/equipment/spike-iron"
  },
  {
    "index": "spyglass",
    "name": "Spyglass",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1000,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "Objects viewed through a spyglass are magnified to twice their size."
    ],
    "url": "/api/2014/equipment/spyglass"
  },
  {
    "index": "string-10-feet",
    "name": "String (10 feet)",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "A 10-foot length of string, typically found in a burglar's pack."
    ],
    "url": "/api/2014/equipment/string-10-feet"
  },
  {
    "index": "tent-two-person",
    "name": "Tent, two-person",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 20,
    "desc": [
      "A simple and portable canvas shelter, a tent sleeps two."
    ],
    "url": "/api/2014/equipment/tent-two-person"
  },
  {
    "index": "tinderbox",
    "name": "Tinderbox",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 1,
    "desc": [
      "This small container holds flint, fire steel, and tinder (usually dry cloth soaked in light oil) used to kindle a fire. Using it to light a torch--or anything else with abundant, exposed fuel--takes an action.",
      "Lighting any other fire takes 1 minute."
    ],
    "url": "/api/2014/equipment/tinderbox"
  },
  {
    "index": "torch",
    "name": "Torch",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "cp"
    },
    "weight": 1,
    "desc": [
      "A torch burns for 1 hour, providing bright light in a 20-foot radius and dim light for an additional 20 feet. If you make a melee attack with a burning torch and hit, it deals 1 fire damage."
    ],
    "url": "/api/2014/equipment/torch"
  },
  {
    "index": "vestments",
    "name": "Vestments",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 0,
      "unit": "cp"
    },
    "weight": 0,
    "desc": [
      "Religious clothing, typically found in a priest's pack."
    ],
    "url": "/api/2014/equipment/vestments"
  },
  {
    "index": "vial",
    "name": "Vial",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/vial"
  },
  {
    "index": "waterskin",
    "name": "Waterskin",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 2,
      "unit": "sp"
    },
    "weight": 5,
    "url": "/api/2014/equipment/waterskin"
  },
  {
    "index": "whetstone",
    "name": "Whetstone",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "standard-gear",
      "name": "Standard Gear",
      "url": "/api/2014/equipment-categories/standard-gear"
    },
    "cost": {
      "quantity": 1,
      "unit": "cp"
    },
    "weight": 1,
    "url": "/api/2014/equipment/whetstone"
  },
  {
    "index": "burglars-pack",
    "name": "Burglar's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs",
      "url": "/api/2014/equipment-categories/equipment-packs"
    },
    "cost": {
      "quantity": 16,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack",
          "url": "/api/2014/equipment/backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "ball-bearings-bag-of-1000",
          "name": "Ball bearings (bag of 1,000)",
          "url": "/api/2014/equipment/ball-bearings-bag-of-1000"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "string-10-feet",
          "name": "String (10 feet)",
          "url": "/api/2014/equipment/string-10-feet"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "bell",
          "name": "Bell",
          "url": "/api/2014/equipment/bell"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "candle",
          "name": "Candle",
          "url": "/api/2014/equipment/candle"
        },
        "quantity": 5
      },
      {
        "item": {
          "index": "crowbar",
          "name": "Crowbar",
          "url": "/api/2014/equipment/crowbar"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "hammer",
          "name": "Hammer",
          "url": "/api/2014/equipment/hammer"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "piton",
          "name": "Piton",
          "url": "/api/2014/equipment/piton"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "lantern-hooded",
          "name": "Lantern, hooded",
          "url": "/api/2014/equipment/lantern-hooded"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "oil-flask",
          "name": "Oil (flask)",
          "url": "/api/2014/equipment/oil-flask"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "rations-1-day",
          "name": "Rations (1 day)",
          "url": "/api/2014/equipment/rations-1-day"
        },
        "quantity": 5
      },
      {
        "item": {
          "index": "tinderbox",
          "name": "Tinderbox",
          "url": "/api/2014/equipment/tinderbox"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "waterskin",
          "name": "Waterskin",
          "url": "/api/2014/equipment/waterskin"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "rope-hempen-50-feet",
          "name": "Rope, hempen (50 feet)",
          "url": "/api/2014/equipment/rope-hempen-50-feet"
        },
        "quantity": 1
      }
    ],
    "url": "/api/2014/equipment/burglars-pack"
  },
  {
    "index": "diplomats-pack",
    "name": "Diplomat's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs",
      "url": "/api/2014/equipment-categories/equipment-packs"
    },
    "cost": {
      "quantity": 39,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "chest",
          "name": "Chest",
          "url": "/api/2014/equipment/chest"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "case-map-or-scroll",
          "name": "Case, map or scroll",
          "url": "/api/2014/equipment/case-map-or-scroll"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "clothes-fine",
          "name": "Clothes, fine",
          "url": "/api/2014/equipment/clothes-fine"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "ink-1-ounce-bottle",
          "name": "Ink (1 ounce bottle)",
          "url": "/api/2014/equipment/ink-1-ounce-bottle"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "ink-pen",
          "name": "Ink pen",
          "url": "/api/2014/equipment/ink-pen"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "lamp",
          "name": "Lamp",
          "url": "/api/2014/equipment/lamp"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "oil-flask",
          "name": "Oil (flask)",
          "url": "/api/2014/equipment/oil-flask"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "paper-one-sheet",
          "name": "Paper (one sheet)",
          "url": "/api/2014/equipment/paper-one-sheet"
        },
        "quantity": 5
      },
      {
        "item": {
          "index": "perfume-vial",
          "name": "Perfume (vial)",
          "url": "/api/2014/equipment/perfume-vial"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "sealing-wax",
          "name": "Sealing wax",
          "url": "/api/2014/equipment/sealing-wax"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "soap",
          "name": "Soap",
          "url": "/api/2014/equipment/soap"
        },
        "quantity": 1
      }
    ],
    "url": "/api/2014/equipment/diplomats-pack"
  },
  {
    "index": "dungeoneers-pack",
    "name": "Dungeoneer's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs",
      "url": "/api/2014/equipment-categories/equipment-packs"
    },
    "cost": {
      "quantity": 12,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack",
          "url": "/api/2014/equipment/backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "crowbar",
          "name": "Crowbar",
          "url": "/api/2014/equipment/crowbar"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "hammer",
          "name": "Hammer",
          "url": "/api/2014/equipment/hammer"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "piton",
          "name": "Piton",
          "url": "/api/2014/equipment/piton"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "torch",
          "name": "Torch",
          "url": "/api/2014/equipment/torch"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "tinderbox",
          "name": "Tinderbox",
          "url": "/api/2014/equipment/tinderbox"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "rations-1-day",
          "name": "Rations (1 day)",
          "url": "/api/2014/equipment/rations-1-day"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "waterskin",
          "name": "Waterskin",
          "url": "/api/2014/equipment/waterskin"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "rope-hempen-50-feet",
          "name": "Rope, hempen (50 feet)",
          "url": "/api/2014/equipment/rope-hempen-50-feet"
        },
        "quantity": 1
      }
    ],
    "url": "/api/2014/equipment/dungeoneers-pack"
  },
  {
    "index": "entertainers-pack",
    "name": "Entertainer's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs",
      "url": "/api/2014/equipment-categories/equipment-packs"
    },
    "cost": {
      "quantity": 40,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack",
          "url": "/api/2014/equipment/backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "bedroll",
          "name": "Bedroll",
          "url": "/api/2014/equipment/bedroll"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "clothes-costume",
          "name": "Clothes, costume",
          "url": "/api/2014/equipment/clothes-costume"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "candle",
          "name": "Candle",
          "url": "/api/2014/equipment/candle"
        },
        "quantity": 5
      },
      {
        "item": {
          "index": "rations-1-day",
          "name": "Rations (1 day)",
          "url": "/api/2014/equipment/rations-1-day"
        },
        "quantity": 5
      },
      {
        "item": {
          "index": "waterskin",
          "name": "Waterskin",
          "url": "/api/2014/equipment/waterskin"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "disguise-kit",
          "name": "Disguise Kit",
          "url": "/api/2014/equipment/disguise-kit"
        },
        "quantity": 1
      }
    ],
    "url": "/api/2014/equipment/entertainers-pack"
  },
  {
    "index": "explorers-pack",
    "name": "Explorer's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs",
      "url": "/api/2014/equipment-categories/equipment-packs"
    },
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack",
          "url": "/api/2014/equipment/backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "bedroll",
          "name": "Bedroll",
          "url": "/api/2014/equipment/bedroll"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "mess-kit",
          "name": "Mess Kit",
          "url": "/api/2014/equipment/mess-kit"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "tinderbox",
          "name": "Tinderbox",
          "url": "/api/2014/equipment/tinderbox"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "torch",
          "name": "Torch",
          "url": "/api/2014/equipment/torch"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "rations-1-day",
          "name": "Rations (1 day)",
          "url": "/api/2014/equipment/rations-1-day"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "waterskin",
          "name": "Waterskin",
          "url": "/api/2014/equipment/waterskin"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "rope-hempen-50-feet",
          "name": "Rope, hempen (50 feet)",
          "url": "/api/2014/equipment/rope-hempen-50-feet"
        },
        "quantity": 1
      }
    ],
    "url": "/api/2014/equipment/explorers-pack"
  },
  {
    "index": "priests-pack",
    "name": "Priest's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs",
      "url": "/api/2014/equipment-categories/equipment-packs"
    },
    "cost": {
      "quantity": 19,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack",
          "url": "/api/2014/equipment/backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "blanket",
          "name": "Blanket",
          "url": "/api/2014/equipment/blanket"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "candle",
          "name": "Candle",
          "url": "/api/2014/equipment/candle"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "tinderbox",
          "name": "Tinderbox",
          "url": "/api/2014/equipment/tinderbox"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "rations-1-day",
          "name": "Rations (1 day)",
          "url": "/api/2014/equipment/rations-1-day"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "waterskin",
          "name": "Waterskin",
          "url": "/api/2014/equipment/waterskin"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "alms-box",
          "name": "Alms box",
          "url": "/api/2014/equipment/alms-box"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "block-of-incense",
          "name": "Block of incense",
          "url": "/api/2014/equipment/block-of-incense"
        },
        "quantity": 2
      },
      {
        "item": {
          "index": "censer",
          "name": "Censer",
          "url": "/api/2014/equipment/censer"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "vestments",
          "name": "Vestments",
          "url": "/api/2014/equipment/vestments"
        },
        "quantity": 1
      }
    ],
    "url": "/api/2014/equipment/priests-pack"
  },
  {
    "index": "scholars-pack",
    "name": "Scholar's Pack",
    "equipment_category": {
      "index": "adventuring-gear",
      "name": "Adventuring Gear",
      "url": "/api/2014/equipment-categories/adventuring-gear"
    },
    "gear_category": {
      "index": "equipment-packs",
      "name": "Equipment Packs",
      "url": "/api/2014/equipment-categories/equipment-packs"
    },
    "cost": {
      "quantity": 40,
      "unit": "gp"
    },
    "contents": [
      {
        "item": {
          "index": "backpack",
          "name": "Backpack",
          "url": "/api/2014/equipment/backpack"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "book",
          "name": "Book",
          "url": "/api/2014/equipment/book"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "ink-1-ounce-bottle",
          "name": "Ink (1 ounce bottle)",
          "url": "/api/2014/equipment/ink-1-ounce-bottle"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "ink-pen",
          "name": "Ink pen",
          "url": "/api/2014/equipment/ink-pen"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "parchment-one-sheet",
          "name": "Parchment (one sheet)",
          "url": "/api/2014/equipment/parchment-one-sheet"
        },
        "quantity": 10
      },
      {
        "item": {
          "index": "little-bag-of-sand",
          "name": "Little bag of sand",
          "url": "/api/2014/equipment/little-bag-of-sand"
        },
        "quantity": 1
      },
      {
        "item": {
          "index": "small-knife",
          "name": "Small knife",
          "url": "/api/2014/equipment/small-knife"
        },
        "quantity": 1
      }
    ],
    "url": "/api/2014/equipment/scholars-pack"
  },
  {
    "index": "alchemists-supplies",
    "name": "Alchemist's Supplies",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "weight": 8,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/alchemists-supplies"
  },
  {
    "index": "brewers-supplies",
    "name": "Brewer's Supplies",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 9,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/brewers-supplies"
  },
  {
    "index": "calligraphers-supplies",
    "name": "Calligrapher's Supplies",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/calligraphers-supplies"
  },
  {
    "index": "carpenters-tools",
    "name": "Carpenter's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 8,
      "unit": "gp"
    },
    "weight": 6,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/carpenters-tools"
  },
  {
    "index": "cartographers-tools",
    "name": "Cartographer's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 15,
      "unit": "gp"
    },
    "weight": 6,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/cartographers-tools"
  },
  {
    "index": "cobblers-tools",
    "name": "Cobbler's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/cobblers-tools"
  },
  {
    "index": "cooks-utensils",
    "name": "Cook's utensils",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 8,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/cooks-utensils"
  },
  {
    "index": "glassblowers-tools",
    "name": "Glassblower's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 30,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/glassblowers-tools"
  },
  {
    "index": "jewelers-tools",
    "name": "Jeweler's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/jewelers-tools"
  },
  {
    "index": "leatherworkers-tools",
    "name": "Leatherworker's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/leatherworkers-tools"
  },
  {
    "index": "masons-tools",
    "name": "Mason's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 8,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/masons-tools"
  },
  {
    "index": "painters-supplies",
    "name": "Painter's Supplies",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/painters-supplies"
  },
  {
    "index": "potters-tools",
    "name": "Potter's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/potters-tools"
  },
  {
    "index": "smiths-tools",
    "name": "Smith's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 8,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/smiths-tools"
  },
  {
    "index": "tinkers-tools",
    "name": "Tinker's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 50,
      "unit": "gp"
    },
    "weight": 10,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/tinkers-tools"
  },
  {
    "index": "weavers-tools",
    "name": "Weaver's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/weavers-tools"
  },
  {
    "index": "woodcarvers-tools",
    "name": "Woodcarver's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Artisan's Tools",
    "cost": {
      "quantity": 1,
      "unit": "gp"
    },
    "weight": 5,
    "desc": [
      "These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan's tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan's tools requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/woodcarvers-tools"
  },
  {
    "index": "dice-set",
    "name": "Dice Set",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Gaming Sets",
    "cost": {
      "quantity": 1,
      "unit": "sp"
    },
    "weight": 0,
    "desc": [
      "This item encompasses a wide range of game pieces, including dice and decks of cards (for games such as Three-Dragon Ante). A few common examples appear on the Tools table, but other kinds of gaming sets exist. If you are proficient with a gaming set, you can add your proficiency bonus to ability checks you make to play a game with that set. Each type of gaming set requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/dice-set"
  },
  {
    "index": "playing-card-set",
    "name": "Playing Card Set",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
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
    "image": "/api/images/equipment/playing-card-set.png",
    "url": "/api/2014/equipment/playing-card-set"
  },
  {
    "index": "bagpipes",
    "name": "Bagpipes",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 30,
      "unit": "gp"
    },
    "weight": 6,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/bagpipes"
  },
  {
    "index": "drum",
    "name": "Drum",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 6,
      "unit": "gp"
    },
    "weight": 3,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/drum"
  },
  {
    "index": "dulcimer",
    "name": "Dulcimer",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
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
    "image": "/api/images/equipment/dulcimer.png",
    "url": "/api/2014/equipment/dulcimer"
  },
  {
    "index": "flute",
    "name": "Flute",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/flute"
  },
  {
    "index": "lute",
    "name": "Lute",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 35,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/lute"
  },
  {
    "index": "lyre",
    "name": "Lyre",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 30,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/lyre"
  },
  {
    "index": "horn",
    "name": "Horn",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 3,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/horn"
  },
  {
    "index": "pan-flute",
    "name": "Pan flute",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 12,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/pan-flute"
  },
  {
    "index": "shawm",
    "name": "Shawm",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/shawm"
  },
  {
    "index": "viol",
    "name": "Viol",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Musical Instrument",
    "cost": {
      "quantity": 30,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency."
    ],
    "url": "/api/2014/equipment/viol"
  },
  {
    "index": "navigators-tools",
    "name": "Navigator's Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Other Tools",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 2,
    "desc": [
      "This set of instruments is used for navigation at sea. Proficiency with navigator's tools lets you chart a ship's course and follow navigation charts. In addition, these tools allow you to add your proficiency bonus to any ability check you make to avoid getting lost at sea."
    ],
    "url": "/api/2014/equipment/navigators-tools"
  },
  {
    "index": "thieves-tools",
    "name": "Thieves' Tools",
    "equipment_category": {
      "index": "tools",
      "name": "Tools",
      "url": "/api/2014/equipment-categories/tools"
    },
    "tool_category": "Other Tools",
    "cost": {
      "quantity": 25,
      "unit": "gp"
    },
    "weight": 1,
    "desc": [
      "This set of tools includes a small file, a set of lock picks, a small mirror mounted on a metal handle, a set of narrow-bladed scissors, and a pair of pliers. Proficiency with these tools lets you add your proficiency bonus to any ability checks you make to disarm traps or open locks."
    ],
    "url": "/api/2014/equipment/thieves-tools"
  },
  {
    "index": "camel",
    "name": "Camel",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
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
    "capacity": "480 lb.",
    "url": "/api/2014/equipment/camel"
  },
  {
    "index": "donkey",
    "name": "Donkey",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
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
    "capacity": "420 lb.",
    "url": "/api/2014/equipment/donkey"
  },
  {
    "index": "mule",
    "name": "Mule",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
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
    "capacity": "420 lb.",
    "url": "/api/2014/equipment/mule"
  },
  {
    "index": "elephant",
    "name": "Elephant",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
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
    "capacity": "1,320 lb.",
    "url": "/api/2014/equipment/elephant"
  },
  {
    "index": "horse-draft",
    "name": "Horse, draft",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
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
    "capacity": "540 lb.",
    "url": "/api/2014/equipment/horse-draft"
  },
  {
    "index": "horse-riding",
    "name": "Horse, riding",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
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
    "capacity": "480 lb.",
    "url": "/api/2014/equipment/horse-riding"
  },
  {
    "index": "mastiff",
    "name": "Mastiff",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
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
    "capacity": "195 lb.",
    "url": "/api/2014/equipment/mastiff"
  },
  {
    "index": "pony",
    "name": "Pony",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
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
    "capacity": "225 lb.",
    "url": "/api/2014/equipment/pony"
  },
  {
    "index": "warhorse",
    "name": "Warhorse",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
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
    "capacity": "540 lb.",
    "url": "/api/2014/equipment/warhorse"
  },
  {
    "index": "barding-padded",
    "name": "Barding: Padded",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 16,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-padded"
  },
  {
    "index": "barding-leather",
    "name": "Barding: Leather",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 40,
      "unit": "gp"
    },
    "weight": 20,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-leather"
  },
  {
    "index": "barding-studded-leather",
    "name": "Barding: Studded Leather",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 180,
      "unit": "gp"
    },
    "weight": 26,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-studded-leather"
  },
  {
    "index": "barding-hide",
    "name": "Barding: Hide",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 40,
      "unit": "gp"
    },
    "weight": 24,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-hide"
  },
  {
    "index": "barding-chain-shirt",
    "name": "Barding: Chain shirt",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 200,
      "unit": "gp"
    },
    "weight": 40,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-chain-shirt"
  },
  {
    "index": "barding-scale-mail",
    "name": "Barding: Scale mail",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 200,
      "unit": "gp"
    },
    "weight": 90,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-scale-mail"
  },
  {
    "index": "barding-breastplate",
    "name": "Barding: Breastplate",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 1600,
      "unit": "gp"
    },
    "weight": 40,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-breastplate"
  },
  {
    "index": "barding-half-plate",
    "name": "Barding: Half plate",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 3000,
      "unit": "gp"
    },
    "weight": 80,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-half-plate"
  },
  {
    "index": "barding-ring-mail",
    "name": "Barding: Ring mail",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 12,
      "unit": "gp"
    },
    "weight": 80,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-ring-mail"
  },
  {
    "index": "barding-chain-mail",
    "name": "Barding: Chain mail",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 300,
      "unit": "gp"
    },
    "weight": 110,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-chain-mail"
  },
  {
    "index": "barding-splint",
    "name": "Barding: Splint",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 800,
      "unit": "gp"
    },
    "weight": 120,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-splint"
  },
  {
    "index": "barding-plate",
    "name": "Barding: Plate",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 6000,
      "unit": "gp"
    },
    "weight": 130,
    "desc": [
      "Barding is armor designed to protect an animal's head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much."
    ],
    "url": "/api/2014/equipment/barding-plate"
  },
  {
    "index": "bit-and-bridle",
    "name": "Bit and bridle",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 2,
      "unit": "gp"
    },
    "weight": 1,
    "url": "/api/2014/equipment/bit-and-bridle"
  },
  {
    "index": "carriage",
    "name": "Carriage",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 100,
      "unit": "gp"
    },
    "weight": 600,
    "url": "/api/2014/equipment/carriage"
  },
  {
    "index": "cart",
    "name": "Cart",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 15,
      "unit": "gp"
    },
    "weight": 200,
    "url": "/api/2014/equipment/cart"
  },
  {
    "index": "chariot",
    "name": "Chariot",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 250,
      "unit": "gp"
    },
    "weight": 100,
    "url": "/api/2014/equipment/chariot"
  },
  {
    "index": "animal-feed-1-day",
    "name": "Animal Feed (1 day)",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 5,
      "unit": "cp"
    },
    "weight": 10,
    "url": "/api/2014/equipment/animal-feed-1-day"
  },
  {
    "index": "saddle-exotic",
    "name": "Saddle, Exotic",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 60,
      "unit": "gp"
    },
    "weight": 50,
    "desc": [
      "An exotic saddle is required for riding any aquatic or flying mount."
    ],
    "url": "/api/2014/equipment/saddle-exotic"
  },
  {
    "index": "saddle-military",
    "name": "Saddle, Military",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 30,
    "desc": [
      "A military saddle braces the rider, helping you keep your seat on an active mount in battle. It gives you advantage on any check you make to remain mounted."
    ],
    "url": "/api/2014/equipment/saddle-military"
  },
  {
    "index": "saddle-pack",
    "name": "Saddle, Pack",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 5,
      "unit": "gp"
    },
    "weight": 15,
    "url": "/api/2014/equipment/saddle-pack"
  },
  {
    "index": "saddle-riding",
    "name": "Saddle, Riding",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 10,
      "unit": "gp"
    },
    "weight": 25,
    "url": "/api/2014/equipment/saddle-riding"
  },
  {
    "index": "saddlebags",
    "name": "Saddlebags",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 4,
      "unit": "gp"
    },
    "weight": 8,
    "url": "/api/2014/equipment/saddlebags"
  },
  {
    "index": "sled",
    "name": "Sled",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 20,
      "unit": "gp"
    },
    "weight": 300,
    "url": "/api/2014/equipment/sled"
  },
  {
    "index": "stabling-1-day",
    "name": "Stabling (1 day)",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 5,
      "unit": "sp"
    },
    "weight": 0,
    "url": "/api/2014/equipment/stabling-1-day"
  },
  {
    "index": "wagon",
    "name": "Wagon",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Tack, Harness, and Drawn Vehicles",
    "cost": {
      "quantity": 35,
      "unit": "gp"
    },
    "weight": 400,
    "url": "/api/2014/equipment/wagon"
  },
  {
    "index": "galley",
    "name": "Galley",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Waterborne Vehicles",
    "cost": {
      "quantity": 30000,
      "unit": "gp"
    },
    "speed": {
      "quantity": 4,
      "unit": "mph"
    },
    "url": "/api/2014/equipment/galley"
  },
  {
    "index": "keelboat",
    "name": "Keelboat",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
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
    ],
    "url": "/api/2014/equipment/keelboat"
  },
  {
    "index": "longship",
    "name": "Longship",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Waterborne Vehicles",
    "cost": {
      "quantity": 10000,
      "unit": "gp"
    },
    "speed": {
      "quantity": 3,
      "unit": "mph"
    },
    "url": "/api/2014/equipment/longship"
  },
  {
    "index": "rowboat",
    "name": "Rowboat",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
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
    ],
    "url": "/api/2014/equipment/rowboat"
  },
  {
    "index": "sailing-ship",
    "name": "Sailing ship",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Waterborne Vehicles",
    "cost": {
      "quantity": 10000,
      "unit": "gp"
    },
    "speed": {
      "quantity": 2,
      "unit": "mph"
    },
    "url": "/api/2014/equipment/sailing-ship"
  },
  {
    "index": "warship",
    "name": "Warship",
    "equipment_category": {
      "index": "mounts-and-vehicles",
      "name": "Mounts and Vehicles",
      "url": "/api/2014/equipment-categories/mounts-and-vehicles"
    },
    "vehicle_category": "Waterborne Vehicles",
    "cost": {
      "quantity": 25000,
      "unit": "gp"
    },
    "speed": {
      "quantity": 2.5,
      "unit": "mph"
    },
    "url": "/api/2014/equipment/warship"
  }
]`) as ReadonlyArray<SourceRow>;

export const EQUIPMENT_CATEGORY_RAW = JSON.parse(String.raw`[
  {
    "index": "weapon",
    "name": "Weapon",
    "equipment": [
      {
        "index": "club",
        "name": "Club",
        "url": "/api/2014/equipment/club"
      },
      {
        "index": "dagger",
        "name": "Dagger",
        "url": "/api/2014/equipment/dagger"
      },
      {
        "index": "greatclub",
        "name": "Greatclub",
        "url": "/api/2014/equipment/greatclub"
      },
      {
        "index": "handaxe",
        "name": "Handaxe",
        "url": "/api/2014/equipment/handaxe"
      },
      {
        "index": "javelin",
        "name": "Javelin",
        "url": "/api/2014/equipment/javelin"
      },
      {
        "index": "light-hammer",
        "name": "Light hammer",
        "url": "/api/2014/equipment/light-hammer"
      },
      {
        "index": "mace",
        "name": "Mace",
        "url": "/api/2014/equipment/mace"
      },
      {
        "index": "quarterstaff",
        "name": "Quarterstaff",
        "url": "/api/2014/equipment/quarterstaff"
      },
      {
        "index": "sickle",
        "name": "Sickle",
        "url": "/api/2014/equipment/sickle"
      },
      {
        "index": "spear",
        "name": "Spear",
        "url": "/api/2014/equipment/spear"
      },
      {
        "index": "crossbow-light",
        "name": "Crossbow, light",
        "url": "/api/2014/equipment/crossbow-light"
      },
      {
        "index": "dart",
        "name": "Dart",
        "url": "/api/2014/equipment/dart"
      },
      {
        "index": "shortbow",
        "name": "Shortbow",
        "url": "/api/2014/equipment/shortbow"
      },
      {
        "index": "sling",
        "name": "Sling",
        "url": "/api/2014/equipment/sling"
      },
      {
        "index": "battleaxe",
        "name": "Battleaxe",
        "url": "/api/2014/equipment/battleaxe"
      },
      {
        "index": "flail",
        "name": "Flail",
        "url": "/api/2014/equipment/flail"
      },
      {
        "index": "glaive",
        "name": "Glaive",
        "url": "/api/2014/equipment/glaive"
      },
      {
        "index": "greataxe",
        "name": "Greataxe",
        "url": "/api/2014/equipment/greataxe"
      },
      {
        "index": "greatsword",
        "name": "Greatsword",
        "url": "/api/2014/equipment/greatsword"
      },
      {
        "index": "halberd",
        "name": "Halberd",
        "url": "/api/2014/equipment/halberd"
      },
      {
        "index": "lance",
        "name": "Lance",
        "url": "/api/2014/equipment/lance"
      },
      {
        "index": "longsword",
        "name": "Longsword",
        "url": "/api/2014/equipment/longsword"
      },
      {
        "index": "maul",
        "name": "Maul",
        "url": "/api/2014/equipment/maul"
      },
      {
        "index": "morningstar",
        "name": "Morningstar",
        "url": "/api/2014/equipment/morningstar"
      },
      {
        "index": "pike",
        "name": "Pike",
        "url": "/api/2014/equipment/pike"
      },
      {
        "index": "rapier",
        "name": "Rapier",
        "url": "/api/2014/equipment/rapier"
      },
      {
        "index": "scimitar",
        "name": "Scimitar",
        "url": "/api/2014/equipment/scimitar"
      },
      {
        "index": "shortsword",
        "name": "Shortsword",
        "url": "/api/2014/equipment/shortsword"
      },
      {
        "index": "trident",
        "name": "Trident",
        "url": "/api/2014/equipment/trident"
      },
      {
        "index": "war-pick",
        "name": "War pick",
        "url": "/api/2014/equipment/war-pick"
      },
      {
        "index": "warhammer",
        "name": "Warhammer",
        "url": "/api/2014/equipment/warhammer"
      },
      {
        "index": "whip",
        "name": "Whip",
        "url": "/api/2014/equipment/whip"
      },
      {
        "index": "blowgun",
        "name": "Blowgun",
        "url": "/api/2014/equipment/blowgun"
      },
      {
        "index": "crossbow-hand",
        "name": "Crossbow, hand",
        "url": "/api/2014/equipment/crossbow-hand"
      },
      {
        "index": "crossbow-heavy",
        "name": "Crossbow, heavy",
        "url": "/api/2014/equipment/crossbow-heavy"
      },
      {
        "index": "longbow",
        "name": "Longbow",
        "url": "/api/2014/equipment/longbow"
      },
      {
        "index": "net",
        "name": "Net",
        "url": "/api/2014/equipment/net"
      },
      {
        "index": "berserker-axe",
        "name": "Berserker Axe",
        "url": "/api/2014/magic-items/berserker-axe"
      },
      {
        "index": "dagger-of-venom",
        "name": "Dagger of Venom",
        "url": "/api/2014/magic-items/dagger-of-venom"
      },
      {
        "index": "dancing-sword",
        "name": "Dancing Sword",
        "url": "/api/2014/magic-items/dancing-sword"
      },
      {
        "index": "defender",
        "name": "Defender",
        "url": "/api/2014/magic-items/defender"
      },
      {
        "index": "dragon-slayer",
        "name": "Dragon Slayer",
        "url": "/api/2014/magic-items/dragon-slayer"
      },
      {
        "index": "dwarven-thrower",
        "name": "Dwarven Thrower",
        "url": "/api/2014/magic-items/dwarven-thrower"
      },
      {
        "index": "flame-tongue",
        "name": "Flame Tongue",
        "url": "/api/2014/magic-items/flame-tongue"
      },
      {
        "index": "frost-brand",
        "name": "Frost Brand",
        "url": "/api/2014/magic-items/frost-brand"
      },
      {
        "index": "giant-slayer",
        "name": "Giant Slayer",
        "url": "/api/2014/magic-items/giant-slayer"
      },
      {
        "index": "hammer-of-thunderbolts",
        "name": "Hammer of Thunderbolts",
        "url": "/api/2014/magic-items/hammer-of-thunderbolts"
      },
      {
        "index": "holy-avenger",
        "name": "Holy Avenger",
        "url": "/api/2014/magic-items/holy-avenger"
      },
      {
        "index": "javelin-of-lightning",
        "name": "Javelin of Lightning",
        "url": "/api/2014/magic-items/javelin-of-lightning"
      },
      {
        "index": "luck-blade",
        "name": "Luck Blade",
        "url": "/api/2014/magic-items/luck-blade"
      },
      {
        "index": "mace-of-disruption",
        "name": "Mace of Disruption",
        "url": "/api/2014/magic-items/mace-of-disruption"
      },
      {
        "index": "mace-of-smiting",
        "name": "Mace of Smiting",
        "url": "/api/2014/magic-items/mace-of-smiting"
      },
      {
        "index": "mace-of-terror",
        "name": "Mace of Terror",
        "url": "/api/2014/magic-items/mace-of-terror"
      },
      {
        "index": "nine-lives-stealer",
        "name": "Nine Lives Stealer",
        "url": "/api/2014/magic-items/nine-lives-stealer"
      },
      {
        "index": "oathbow",
        "name": "Oathbow",
        "url": "/api/2014/magic-items/oathbow"
      },
      {
        "index": "scimitar-of-speed",
        "name": "Scimitar of Speed",
        "url": "/api/2014/magic-items/scimitar-of-speed"
      },
      {
        "index": "sun-blade",
        "name": "Sun Blade",
        "url": "/api/2014/magic-items/sun-blade"
      },
      {
        "index": "sword-of-life-stealing",
        "name": "Sword of Life Stealing",
        "url": "/api/2014/magic-items/sword-of-life-stealing"
      },
      {
        "index": "sword-of-sharpness",
        "name": "Sword of Sharpness",
        "url": "/api/2014/magic-items/sword-of-sharpness"
      },
      {
        "index": "sword-of-wounding",
        "name": "Sword of Wounding",
        "url": "/api/2014/magic-items/sword-of-wounding"
      },
      {
        "index": "trident-of-fish-command",
        "name": "Trident of Fish Command",
        "url": "/api/2014/magic-items/trident-of-fish-command"
      },
      {
        "index": "vicious-weapon",
        "name": "Vicious Weapon",
        "url": "/api/2014/magic-items/vicious-weapon"
      },
      {
        "index": "vorpal-sword",
        "name": "Vorpal Sword",
        "url": "/api/2014/magic-items/vorpal-sword"
      },
      {
        "index": "weapon",
        "name": "Weapon, +1, +2, or +3",
        "url": "/api/2014/magic-items/weapon"
      },
      {
        "index": "weapon-1",
        "name": "Weapon, +1",
        "url": "/api/2014/magic-items/weapon-1"
      },
      {
        "index": "weapon-2",
        "name": "Weapon, +2",
        "url": "/api/2014/magic-items/weapon-2"
      },
      {
        "index": "weapon-3",
        "name": "Weapon, +3",
        "url": "/api/2014/magic-items/weapon-3"
      }
    ],
    "url": "/api/2014/equipment-categories/weapon"
  },
  {
    "index": "armor",
    "name": "Armor",
    "equipment": [
      {
        "index": "padded-armor",
        "name": "Padded Armor",
        "url": "/api/2014/equipment/padded-armor"
      },
      {
        "index": "leather-armor",
        "name": "Leather Armor",
        "url": "/api/2014/equipment/leather-armor"
      },
      {
        "index": "studded-leather-armor",
        "name": "Studded Leather Armor",
        "url": "/api/2014/equipment/studded-leather-armor"
      },
      {
        "index": "hide-armor",
        "name": "Hide Armor",
        "url": "/api/2014/equipment/hide-armor"
      },
      {
        "index": "chain-shirt",
        "name": "Chain Shirt",
        "url": "/api/2014/equipment/chain-shirt"
      },
      {
        "index": "scale-mail",
        "name": "Scale Mail",
        "url": "/api/2014/equipment/scale-mail"
      },
      {
        "index": "breastplate",
        "name": "Breastplate",
        "url": "/api/2014/equipment/breastplate"
      },
      {
        "index": "half-plate-armor",
        "name": "Half Plate Armor",
        "url": "/api/2014/equipment/half-plate-armor"
      },
      {
        "index": "ring-mail",
        "name": "Ring Mail",
        "url": "/api/2014/equipment/ring-mail"
      },
      {
        "index": "chain-mail",
        "name": "Chain Mail",
        "url": "/api/2014/equipment/chain-mail"
      },
      {
        "index": "splint-armor",
        "name": "Splint Armor",
        "url": "/api/2014/equipment/splint-armor"
      },
      {
        "index": "plate-armor",
        "name": "Plate Armor",
        "url": "/api/2014/equipment/plate-armor"
      },
      {
        "index": "shield",
        "name": "Shield",
        "url": "/api/2014/equipment/shield"
      },
      {
        "index": "adamantine-armor",
        "name": "Adamantine Armor",
        "url": "/api/2014/magic-items/adamantine-armor"
      },
      {
        "index": "animated-shield",
        "name": "Animated Shield",
        "url": "/api/2014/magic-items/animated-shield"
      },
      {
        "index": "armor",
        "name": "Armor, +1, +2, or +3",
        "url": "/api/2014/magic-items/armor"
      },
      {
        "index": "armor-of-invulnerability",
        "name": "Armor of Invulnerability",
        "url": "/api/2014/magic-items/armor-of-invulnerability"
      },
      {
        "index": "armor-of-resistance",
        "name": "Armor of Resistance",
        "url": "/api/2014/magic-items/armor-of-resistance"
      },
      {
        "index": "armor-of-vulnerability",
        "name": "Armor of Vulnerability",
        "url": "/api/2014/magic-items/armor-of-vulnerability"
      },
      {
        "index": "arrow-catching-shield",
        "name": "Arrow-Catching Shield",
        "url": "/api/2014/magic-items/arrow-catching-shield"
      },
      {
        "index": "demon-armor",
        "name": "Demon Armor",
        "url": "/api/2014/magic-items/demon-armor"
      },
      {
        "index": "dragon-scale-mail",
        "name": "Dragon Scale Mail",
        "url": "/api/2014/magic-items/dragon-scale-mail"
      },
      {
        "index": "dwarven-plate",
        "name": "Dwarven Plate",
        "url": "/api/2014/magic-items/dwarven-plate"
      },
      {
        "index": "elven-chain",
        "name": "Elven Chain",
        "url": "/api/2014/magic-items/elven-chain"
      },
      {
        "index": "glamoured-studded-leather-armor",
        "name": "Glamoured Studded Leather Armor",
        "url": "/api/2014/magic-items/glamoured-studded-leather-armor"
      },
      {
        "index": "mithral-armor",
        "name": "Mithral Armor",
        "url": "/api/2014/magic-items/mithral-armor"
      },
      {
        "index": "plate-armor-of-etherealness",
        "name": "Plate Armor of Etherealness",
        "url": "/api/2014/magic-items/plate-armor-of-etherealness"
      },
      {
        "index": "shield-of-missile-attraction",
        "name": "Shield of Missile Attraction",
        "url": "/api/2014/magic-items/shield-of-missile-attraction"
      },
      {
        "index": "spellguard-shield",
        "name": "Spellguard Shield",
        "url": "/api/2014/magic-items/spellguard-shield"
      },
      {
        "index": "armor-1",
        "name": "Armor, +1",
        "url": "/api/2014/magic-items/armor-1"
      },
      {
        "index": "armor-2",
        "name": "Armor, +2",
        "url": "/api/2014/magic-items/armor-2"
      },
      {
        "index": "armor-3",
        "name": "Armor, +3",
        "url": "/api/2014/magic-items/armor-3"
      },
      {
        "index": "dragon-scale-mail-black",
        "name": "Black Dragon Scale Mail",
        "url": "/api/2014/magic-items/dragon-scale-mail-black"
      },
      {
        "index": "dragon-scale-mail-blue",
        "name": "Blue Dragon Scale Mail",
        "url": "/api/2014/magic-items/dragon-scale-mail-blue"
      },
      {
        "index": "dragon-scale-mail-brass",
        "name": "Brass Dragon Scale Mail",
        "url": "/api/2014/magic-items/dragon-scale-mail-brass"
      },
      {
        "index": "dragon-scale-mail-bronze",
        "name": "Bronze Dragon Scale Mail",
        "url": "/api/2014/magic-items/dragon-scale-mail-bronze"
      },
      {
        "index": "dragon-scale-mail-copper",
        "name": "Copper Dragon Scale Mail",
        "url": "/api/2014/magic-items/dragon-scale-mail-copper"
      },
      {
        "index": "dragon-scale-mail-gold",
        "name": "Gold Dragon Scale Mail",
        "url": "/api/2014/magic-items/dragon-scale-mail-gold"
      },
      {
        "index": "dragon-scale-mail-green",
        "name": "Green Dragon Scale Mail",
        "url": "/api/2014/magic-items/dragon-scale-mail-green"
      },
      {
        "index": "dragon-scale-mail-red",
        "name": "Red Dragon Scale Mail",
        "url": "/api/2014/magic-items/dragon-scale-mail-red"
      },
      {
        "index": "dragon-scale-mail-silver",
        "name": "Silver Dragon Scale Mail",
        "url": "/api/2014/magic-items/dragon-scale-mail-silver"
      },
      {
        "index": "dragon-scale-mail-white",
        "name": "White Dragon Scale Mail",
        "url": "/api/2014/magic-items/dragon-scale-mail-white"
      }
    ],
    "url": "/api/2014/equipment-categories/armor"
  },
  {
    "index": "adventuring-gear",
    "name": "Adventuring Gear",
    "equipment": [
      {
        "index": "abacus",
        "name": "Abacus",
        "url": "/api/2014/equipment/abacus"
      },
      {
        "index": "acid-vial",
        "name": "Acid (vial)",
        "url": "/api/2014/equipment/acid-vial"
      },
      {
        "index": "alchemists-fire-flask",
        "name": "Alchemist's fire (flask)",
        "url": "/api/2014/equipment/alchemists-fire-flask"
      },
      {
        "index": "arrow",
        "name": "Arrow",
        "url": "/api/2014/equipment/arrow"
      },
      {
        "index": "blowgun-needle",
        "name": "Blowgun needle",
        "url": "/api/2014/equipment/blowgun-needle"
      },
      {
        "index": "crossbow-bolt",
        "name": "Crossbow bolt",
        "url": "/api/2014/equipment/crossbow-bolt"
      },
      {
        "index": "sling-bullet",
        "name": "Sling bullet",
        "url": "/api/2014/equipment/sling-bullet"
      },
      {
        "index": "alms-box",
        "name": "Alms box",
        "url": "/api/2014/equipment/alms-box"
      },
      {
        "index": "amulet",
        "name": "Amulet",
        "url": "/api/2014/equipment/amulet"
      },
      {
        "index": "antitoxin-vial",
        "name": "Antitoxin (vial)",
        "url": "/api/2014/equipment/antitoxin-vial"
      },
      {
        "index": "backpack",
        "name": "Backpack",
        "url": "/api/2014/equipment/backpack"
      },
      {
        "index": "ball-bearings-bag-of-1000",
        "name": "Ball bearings (bag of 1,000)",
        "url": "/api/2014/equipment/ball-bearings-bag-of-1000"
      },
      {
        "index": "barrel",
        "name": "Barrel",
        "url": "/api/2014/equipment/barrel"
      },
      {
        "index": "basket",
        "name": "Basket",
        "url": "/api/2014/equipment/basket"
      },
      {
        "index": "bedroll",
        "name": "Bedroll",
        "url": "/api/2014/equipment/bedroll"
      },
      {
        "index": "bell",
        "name": "Bell",
        "url": "/api/2014/equipment/bell"
      },
      {
        "index": "blanket",
        "name": "Blanket",
        "url": "/api/2014/equipment/blanket"
      },
      {
        "index": "block-and-tackle",
        "name": "Block and tackle",
        "url": "/api/2014/equipment/block-and-tackle"
      },
      {
        "index": "block-of-incense",
        "name": "Block of incense",
        "url": "/api/2014/equipment/block-of-incense"
      },
      {
        "index": "book",
        "name": "Book",
        "url": "/api/2014/equipment/book"
      },
      {
        "index": "bottle-glass",
        "name": "Bottle, glass",
        "url": "/api/2014/equipment/bottle-glass"
      },
      {
        "index": "bucket",
        "name": "Bucket",
        "url": "/api/2014/equipment/bucket"
      },
      {
        "index": "caltrops",
        "name": "Caltrops",
        "url": "/api/2014/equipment/caltrops"
      },
      {
        "index": "candle",
        "name": "Candle",
        "url": "/api/2014/equipment/candle"
      },
      {
        "index": "case-crossbow-bolt",
        "name": "Case, crossbow bolt",
        "url": "/api/2014/equipment/case-crossbow-bolt"
      },
      {
        "index": "case-map-or-scroll",
        "name": "Case, map or scroll",
        "url": "/api/2014/equipment/case-map-or-scroll"
      },
      {
        "index": "censer",
        "name": "Censer",
        "url": "/api/2014/equipment/censer"
      },
      {
        "index": "chain-10-feet",
        "name": "Chain (10 feet)",
        "url": "/api/2014/equipment/chain-10-feet"
      },
      {
        "index": "chalk-1-piece",
        "name": "Chalk (1 piece)",
        "url": "/api/2014/equipment/chalk-1-piece"
      },
      {
        "index": "chest",
        "name": "Chest",
        "url": "/api/2014/equipment/chest"
      },
      {
        "index": "clothes-common",
        "name": "Clothes, common",
        "url": "/api/2014/equipment/clothes-common"
      },
      {
        "index": "clothes-costume",
        "name": "Clothes, costume",
        "url": "/api/2014/equipment/clothes-costume"
      },
      {
        "index": "clothes-fine",
        "name": "Clothes, fine",
        "url": "/api/2014/equipment/clothes-fine"
      },
      {
        "index": "clothes-travelers",
        "name": "Clothes, traveler's",
        "url": "/api/2014/equipment/clothes-travelers"
      },
      {
        "index": "component-pouch",
        "name": "Component pouch",
        "url": "/api/2014/equipment/component-pouch"
      },
      {
        "index": "crowbar",
        "name": "Crowbar",
        "url": "/api/2014/equipment/crowbar"
      },
      {
        "index": "emblem",
        "name": "Emblem",
        "url": "/api/2014/equipment/emblem"
      },
      {
        "index": "fishing-tackle",
        "name": "Fishing tackle",
        "url": "/api/2014/equipment/fishing-tackle"
      },
      {
        "index": "flask-or-tankard",
        "name": "Flask or tankard",
        "url": "/api/2014/equipment/flask-or-tankard"
      },
      {
        "index": "grappling-hook",
        "name": "Grappling hook",
        "url": "/api/2014/equipment/grappling-hook"
      },
      {
        "index": "hammer",
        "name": "Hammer",
        "url": "/api/2014/equipment/hammer"
      },
      {
        "index": "hammer-sledge",
        "name": "Hammer, sledge",
        "url": "/api/2014/equipment/hammer-sledge"
      },
      {
        "index": "holy-water-flask",
        "name": "Holy water (flask)",
        "url": "/api/2014/equipment/holy-water-flask"
      },
      {
        "index": "hourglass",
        "name": "Hourglass",
        "url": "/api/2014/equipment/hourglass"
      },
      {
        "index": "hunting-trap",
        "name": "Hunting trap",
        "url": "/api/2014/equipment/hunting-trap"
      },
      {
        "index": "ink-1-ounce-bottle",
        "name": "Ink (1 ounce bottle)",
        "url": "/api/2014/equipment/ink-1-ounce-bottle"
      },
      {
        "index": "ink-pen",
        "name": "Ink pen",
        "url": "/api/2014/equipment/ink-pen"
      },
      {
        "index": "jug-or-pitcher",
        "name": "Jug or pitcher",
        "url": "/api/2014/equipment/jug-or-pitcher"
      },
      {
        "index": "climbers-kit",
        "name": "Climber's Kit",
        "url": "/api/2014/equipment/climbers-kit"
      },
      {
        "index": "disguise-kit",
        "name": "Disguise Kit",
        "url": "/api/2014/equipment/disguise-kit"
      },
      {
        "index": "forgery-kit",
        "name": "Forgery Kit",
        "url": "/api/2014/equipment/forgery-kit"
      },
      {
        "index": "herbalism-kit",
        "name": "Herbalism Kit",
        "url": "/api/2014/equipment/herbalism-kit"
      },
      {
        "index": "healers-kit",
        "name": "Healer's Kit",
        "url": "/api/2014/equipment/healers-kit"
      },
      {
        "index": "mess-kit",
        "name": "Mess Kit",
        "url": "/api/2014/equipment/mess-kit"
      },
      {
        "index": "poisoners-kit",
        "name": "Poisoner's Kit",
        "url": "/api/2014/equipment/poisoners-kit"
      },
      {
        "index": "ladder-10-foot",
        "name": "Ladder (10-foot)",
        "url": "/api/2014/equipment/ladder-10-foot"
      },
      {
        "index": "lamp",
        "name": "Lamp",
        "url": "/api/2014/equipment/lamp"
      },
      {
        "index": "lantern-bullseye",
        "name": "Lantern, bullseye",
        "url": "/api/2014/equipment/lantern-bullseye"
      },
      {
        "index": "lantern-hooded",
        "name": "Lantern, hooded",
        "url": "/api/2014/equipment/lantern-hooded"
      },
      {
        "index": "little-bag-of-sand",
        "name": "Little bag of sand",
        "url": "/api/2014/equipment/little-bag-of-sand"
      },
      {
        "index": "lock",
        "name": "Lock",
        "url": "/api/2014/equipment/lock"
      },
      {
        "index": "magnifying-glass",
        "name": "Magnifying glass",
        "url": "/api/2014/equipment/magnifying-glass"
      },
      {
        "index": "manacles",
        "name": "Manacles",
        "url": "/api/2014/equipment/manacles"
      },
      {
        "index": "mirror-steel",
        "name": "Mirror, steel",
        "url": "/api/2014/equipment/mirror-steel"
      },
      {
        "index": "oil-flask",
        "name": "Oil (flask)",
        "url": "/api/2014/equipment/oil-flask"
      },
      {
        "index": "paper-one-sheet",
        "name": "Paper (one sheet)",
        "url": "/api/2014/equipment/paper-one-sheet"
      },
      {
        "index": "parchment-one-sheet",
        "name": "Parchment (one sheet)",
        "url": "/api/2014/equipment/parchment-one-sheet"
      },
      {
        "index": "perfume-vial",
        "name": "Perfume (vial)",
        "url": "/api/2014/equipment/perfume-vial"
      },
      {
        "index": "pick-miners",
        "name": "Pick, miner's",
        "url": "/api/2014/equipment/pick-miners"
      },
      {
        "index": "piton",
        "name": "Piton",
        "url": "/api/2014/equipment/piton"
      },
      {
        "index": "poison-basic-vial",
        "name": "Poison, basic (vial)",
        "url": "/api/2014/equipment/poison-basic-vial"
      },
      {
        "index": "pole-10-foot",
        "name": "Pole (10-foot)",
        "url": "/api/2014/equipment/pole-10-foot"
      },
      {
        "index": "pot-iron",
        "name": "Pot, iron",
        "url": "/api/2014/equipment/pot-iron"
      },
      {
        "index": "pouch",
        "name": "Pouch",
        "url": "/api/2014/equipment/pouch"
      },
      {
        "index": "quiver",
        "name": "Quiver",
        "url": "/api/2014/equipment/quiver"
      },
      {
        "index": "ram-portable",
        "name": "Ram, portable",
        "url": "/api/2014/equipment/ram-portable"
      },
      {
        "index": "rations-1-day",
        "name": "Rations (1 day)",
        "url": "/api/2014/equipment/rations-1-day"
      },
      {
        "index": "reliquary",
        "name": "Reliquary",
        "url": "/api/2014/equipment/reliquary"
      },
      {
        "index": "robes",
        "name": "Robes",
        "url": "/api/2014/equipment/robes"
      },
      {
        "index": "rope-hempen-50-feet",
        "name": "Rope, hempen (50 feet)",
        "url": "/api/2014/equipment/rope-hempen-50-feet"
      },
      {
        "index": "rope-silk-50-feet",
        "name": "Rope, silk (50 feet)",
        "url": "/api/2014/equipment/rope-silk-50-feet"
      },
      {
        "index": "sack",
        "name": "Sack",
        "url": "/api/2014/equipment/sack"
      },
      {
        "index": "scale-merchants",
        "name": "Scale, merchant's",
        "url": "/api/2014/equipment/scale-merchants"
      },
      {
        "index": "sealing-wax",
        "name": "Sealing wax",
        "url": "/api/2014/equipment/sealing-wax"
      },
      {
        "index": "shovel",
        "name": "Shovel",
        "url": "/api/2014/equipment/shovel"
      },
      {
        "index": "signal-whistle",
        "name": "Signal whistle",
        "url": "/api/2014/equipment/signal-whistle"
      },
      {
        "index": "signet-ring",
        "name": "Signet ring",
        "url": "/api/2014/equipment/signet-ring"
      },
      {
        "index": "small-knife",
        "name": "Small knife",
        "url": "/api/2014/equipment/small-knife"
      },
      {
        "index": "soap",
        "name": "Soap",
        "url": "/api/2014/equipment/soap"
      },
      {
        "index": "spellbook",
        "name": "Spellbook",
        "url": "/api/2014/equipment/spellbook"
      },
      {
        "index": "spike-iron",
        "name": "Spike, iron",
        "url": "/api/2014/equipment/spike-iron"
      },
      {
        "index": "spyglass",
        "name": "Spyglass",
        "url": "/api/2014/equipment/spyglass"
      },
      {
        "index": "string-10-feet",
        "name": "String (10 feet)",
        "url": "/api/2014/equipment/string-10-feet"
      },
      {
        "index": "tent-two-person",
        "name": "Tent, two-person",
        "url": "/api/2014/equipment/tent-two-person"
      },
      {
        "index": "tinderbox",
        "name": "Tinderbox",
        "url": "/api/2014/equipment/tinderbox"
      },
      {
        "index": "torch",
        "name": "Torch",
        "url": "/api/2014/equipment/torch"
      },
      {
        "index": "vestments",
        "name": "Vestments",
        "url": "/api/2014/equipment/vestments"
      },
      {
        "index": "vial",
        "name": "Vial",
        "url": "/api/2014/equipment/vial"
      },
      {
        "index": "waterskin",
        "name": "Waterskin",
        "url": "/api/2014/equipment/waterskin"
      },
      {
        "index": "whetstone",
        "name": "Whetstone",
        "url": "/api/2014/equipment/whetstone"
      },
      {
        "index": "burglars-pack",
        "name": "Burglar's Pack",
        "url": "/api/2014/equipment/burglars-pack"
      },
      {
        "index": "diplomats-pack",
        "name": "Diplomat's Pack",
        "url": "/api/2014/equipment/diplomats-pack"
      },
      {
        "index": "dungeoneers-pack",
        "name": "Dungeoneer's Pack",
        "url": "/api/2014/equipment/dungeoneers-pack"
      },
      {
        "index": "entertainers-pack",
        "name": "Entertainer's Pack",
        "url": "/api/2014/equipment/entertainers-pack"
      },
      {
        "index": "explorers-pack",
        "name": "Explorer's Pack",
        "url": "/api/2014/equipment/explorers-pack"
      },
      {
        "index": "priests-pack",
        "name": "Priest's Pack",
        "url": "/api/2014/equipment/priests-pack"
      },
      {
        "index": "scholars-pack",
        "name": "Scholar's Pack",
        "url": "/api/2014/equipment/scholars-pack"
      },
      {
        "index": "crystal",
        "name": "Crystal",
        "url": "/api/2014/equipment/crystal"
      },
      {
        "index": "orb",
        "name": "Orb",
        "url": "/api/2014/equipment/orb"
      },
      {
        "index": "rod",
        "name": "Rod",
        "url": "/api/2014/equipment/rod"
      },
      {
        "index": "staff",
        "name": "Staff",
        "url": "/api/2014/equipment/staff"
      },
      {
        "index": "wand",
        "name": "Wand",
        "url": "/api/2014/equipment/wand"
      },
      {
        "index": "sprig-of-mistletoe",
        "name": "Sprig of mistletoe",
        "url": "/api/2014/equipment/sprig-of-mistletoe"
      },
      {
        "index": "totem",
        "name": "Totem",
        "url": "/api/2014/equipment/totem"
      },
      {
        "index": "wooden-staff",
        "name": "Wooden staff",
        "url": "/api/2014/equipment/wooden-staff"
      },
      {
        "index": "yew-wand",
        "name": "Yew wand",
        "url": "/api/2014/equipment/yew-wand"
      }
    ],
    "url": "/api/2014/equipment-categories/adventuring-gear"
  },
  {
    "index": "ammunition",
    "name": "Ammunition",
    "equipment": [
      {
        "index": "arrow",
        "name": "Arrow",
        "url": "/api/2014/equipment/arrow"
      },
      {
        "index": "blowgun-needle",
        "name": "Blowgun needle",
        "url": "/api/2014/equipment/blowgun-needle"
      },
      {
        "index": "crossbow-bolt",
        "name": "Crossbow bolt",
        "url": "/api/2014/equipment/crossbow-bolt"
      },
      {
        "index": "sling-bullet",
        "url": "/api/2014/equipment/sling-bullet",
        "name": "Sling bullet"
      },
      {
        "index": "ammunition",
        "name": "Ammunition, +1, +2, or +3",
        "url": "/api/2014/magic-items/ammunition"
      },
      {
        "index": "arrow-of-slaying",
        "name": "Arrow of Slaying",
        "url": "/api/2014/magic-items/arrow-of-slaying"
      },
      {
        "index": "ammunition-1",
        "name": "Ammunition, +1",
        "url": "/api/2014/magic-items/ammunition-1"
      },
      {
        "index": "ammunition-2",
        "name": "Ammunition, +2",
        "url": "/api/2014/magic-items/ammunition-2"
      },
      {
        "index": "ammunition-3",
        "name": "Ammunition, +3",
        "url": "/api/2014/magic-items/ammunition-3"
      }
    ],
    "url": "/api/2014/equipment-categories/ammunition"
  },
  {
    "index": "tools",
    "name": "Tools",
    "equipment": [
      {
        "index": "alchemists-supplies",
        "name": "Alchemist's Supplies",
        "url": "/api/2014/equipment/alchemists-supplies"
      },
      {
        "index": "brewers-supplies",
        "name": "Brewer's Supplies",
        "url": "/api/2014/equipment/brewers-supplies"
      },
      {
        "index": "calligraphers-supplies",
        "name": "Calligrapher's Supplies",
        "url": "/api/2014/equipment/calligraphers-supplies"
      },
      {
        "index": "carpenters-tools",
        "name": "Carpenter's Tools",
        "url": "/api/2014/equipment/carpenters-tools"
      },
      {
        "index": "cartographers-tools",
        "name": "Cartographer's Tools",
        "url": "/api/2014/equipment/cartographers-tools"
      },
      {
        "index": "cobblers-tools",
        "name": "Cobbler's Tools",
        "url": "/api/2014/equipment/cobblers-tools"
      },
      {
        "index": "cooks-utensils",
        "name": "Cook's utensils",
        "url": "/api/2014/equipment/cooks-utensils"
      },
      {
        "index": "glassblowers-tools",
        "name": "Glassblower's Tools",
        "url": "/api/2014/equipment/glassblowers-tools"
      },
      {
        "index": "jewelers-tools",
        "name": "Jeweler's Tools",
        "url": "/api/2014/equipment/jewelers-tools"
      },
      {
        "index": "leatherworkers-tools",
        "name": "Leatherworker's Tools",
        "url": "/api/2014/equipment/leatherworkers-tools"
      },
      {
        "index": "masons-tools",
        "name": "Mason's Tools",
        "url": "/api/2014/equipment/masons-tools"
      },
      {
        "index": "painters-supplies",
        "name": "Painter's Supplies",
        "url": "/api/2014/equipment/painters-supplies"
      },
      {
        "index": "potters-tools",
        "name": "Potter's Tools",
        "url": "/api/2014/equipment/potters-tools"
      },
      {
        "index": "smiths-tools",
        "name": "Smith's Tools",
        "url": "/api/2014/equipment/smiths-tools"
      },
      {
        "index": "tinkers-tools",
        "name": "Tinker's Tools",
        "url": "/api/2014/equipment/tinkers-tools"
      },
      {
        "index": "weavers-tools",
        "name": "Weaver's Tools",
        "url": "/api/2014/equipment/weavers-tools"
      },
      {
        "index": "woodcarvers-tools",
        "name": "Woodcarver's Tools",
        "url": "/api/2014/equipment/woodcarvers-tools"
      },
      {
        "index": "dice-set",
        "name": "Dice Set",
        "url": "/api/2014/equipment/dice-set"
      },
      {
        "index": "playing-card-set",
        "name": "Playing Card Set",
        "url": "/api/2014/equipment/playing-card-set"
      },
      {
        "index": "bagpipes",
        "name": "Bagpipes",
        "url": "/api/2014/equipment/bagpipes"
      },
      {
        "index": "drum",
        "name": "Drum",
        "url": "/api/2014/equipment/drum"
      },
      {
        "index": "dulcimer",
        "name": "Dulcimer",
        "url": "/api/2014/equipment/dulcimer"
      },
      {
        "index": "flute",
        "name": "Flute",
        "url": "/api/2014/equipment/flute"
      },
      {
        "index": "lute",
        "name": "Lute",
        "url": "/api/2014/equipment/lute"
      },
      {
        "index": "lyre",
        "name": "Lyre",
        "url": "/api/2014/equipment/lyre"
      },
      {
        "index": "horn",
        "name": "Horn",
        "url": "/api/2014/equipment/horn"
      },
      {
        "index": "pan-flute",
        "name": "Pan flute",
        "url": "/api/2014/equipment/pan-flute"
      },
      {
        "index": "shawm",
        "name": "Shawm",
        "url": "/api/2014/equipment/shawm"
      },
      {
        "index": "viol",
        "name": "Viol",
        "url": "/api/2014/equipment/viol"
      },
      {
        "index": "navigators-tools",
        "name": "Navigator's Tools",
        "url": "/api/2014/equipment/navigators-tools"
      },
      {
        "index": "thieves-tools",
        "name": "Thieves' Tools",
        "url": "/api/2014/equipment/thieves-tools"
      }
    ],
    "url": "/api/2014/equipment-categories/tools"
  },
  {
    "index": "mounts-and-vehicles",
    "name": "Mounts and Vehicles",
    "equipment": [
      {
        "index": "mule",
        "name": "Mule",
        "url": "/api/2014/equipment/mule"
      },
      {
        "index": "elephant",
        "name": "Elephant",
        "url": "/api/2014/equipment/elephant"
      },
      {
        "index": "horse-draft",
        "name": "Horse, draft",
        "url": "/api/2014/equipment/horse-draft"
      },
      {
        "index": "horse-riding",
        "name": "Horse, riding",
        "url": "/api/2014/equipment/horse-riding"
      },
      {
        "index": "mastiff",
        "name": "Mastiff",
        "url": "/api/2014/equipment/mastiff"
      },
      {
        "index": "pony",
        "name": "Pony",
        "url": "/api/2014/equipment/pony"
      },
      {
        "index": "warhorse",
        "name": "Warhorse",
        "url": "/api/2014/equipment/warhorse"
      },
      {
        "index": "barding-padded",
        "name": "Barding: Padded",
        "url": "/api/2014/equipment/barding-padded"
      },
      {
        "index": "barding-leather",
        "name": "Barding: Leather",
        "url": "/api/2014/equipment/barding-leather"
      },
      {
        "index": "barding-studded-leather",
        "name": "Barding: Studded Leather",
        "url": "/api/2014/equipment/barding-studded-leather"
      },
      {
        "index": "barding-hide",
        "name": "Barding: Hide",
        "url": "/api/2014/equipment/barding-hide"
      },
      {
        "index": "barding-chain-shirt",
        "name": "Barding: Chain shirt",
        "url": "/api/2014/equipment/barding-chain-shirt"
      },
      {
        "index": "barding-scale-mail",
        "name": "Barding: Scale mail",
        "url": "/api/2014/equipment/barding-scale-mail"
      },
      {
        "index": "barding-breastplate",
        "name": "Barding: Breastplate",
        "url": "/api/2014/equipment/barding-breastplate"
      },
      {
        "index": "barding-half-plate",
        "name": "Barding: Half plate",
        "url": "/api/2014/equipment/barding-half-plate"
      },
      {
        "index": "barding-ring-mail",
        "name": "Barding: Ring mail",
        "url": "/api/2014/equipment/barding-ring-mail"
      },
      {
        "index": "barding-chain-mail",
        "name": "Barding: Chain mail",
        "url": "/api/2014/equipment/barding-chain-mail"
      },
      {
        "index": "barding-splint",
        "name": "Barding: Splint",
        "url": "/api/2014/equipment/barding-splint"
      },
      {
        "index": "barding-plate",
        "name": "Barding: Plate",
        "url": "/api/2014/equipment/barding-plate"
      },
      {
        "index": "bit-and-bridle",
        "name": "Bit and bridle",
        "url": "/api/2014/equipment/bit-and-bridle"
      },
      {
        "index": "carriage",
        "name": "Carriage",
        "url": "/api/2014/equipment/carriage"
      },
      {
        "index": "cart",
        "name": "Cart",
        "url": "/api/2014/equipment/cart"
      },
      {
        "index": "chariot",
        "name": "Chariot",
        "url": "/api/2014/equipment/chariot"
      },
      {
        "index": "animal-feed-1-day",
        "name": "Animal Feed (1 day)",
        "url": "/api/2014/equipment/animal-feed-1-day"
      },
      {
        "index": "saddle-exotic",
        "name": "Saddle, Exotic",
        "url": "/api/2014/equipment/saddle-exotic"
      },
      {
        "index": "saddle-military",
        "name": "Saddle, Military",
        "url": "/api/2014/equipment/saddle-military"
      },
      {
        "index": "saddle-pack",
        "name": "Saddle, Pack",
        "url": "/api/2014/equipment/saddle-pack"
      },
      {
        "index": "saddle-riding",
        "name": "Saddle, Riding",
        "url": "/api/2014/equipment/saddle-riding"
      },
      {
        "index": "saddlebags",
        "name": "Saddlebags",
        "url": "/api/2014/equipment/saddlebags"
      },
      {
        "index": "sled",
        "name": "Sled",
        "url": "/api/2014/equipment/sled"
      },
      {
        "index": "stabling-1-day",
        "name": "Stabling (1 day)",
        "url": "/api/2014/equipment/stabling-1-day"
      },
      {
        "index": "wagon",
        "name": "Wagon",
        "url": "/api/2014/equipment/wagon"
      },
      {
        "index": "barding-padded",
        "name": "Barding: Padded",
        "url": "/api/2014/equipment/barding-padded"
      },
      {
        "index": "barding-leather",
        "name": "Barding: Leather",
        "url": "/api/2014/equipment/barding-leather"
      },
      {
        "index": "barding-studded-leather",
        "name": "Barding: Studded Leather",
        "url": "/api/2014/equipment/barding-studded-leather"
      },
      {
        "index": "barding-hide",
        "name": "Barding: Hide",
        "url": "/api/2014/equipment/barding-hide"
      },
      {
        "index": "barding-chain-shirt",
        "name": "Barding: Chain shirt",
        "url": "/api/2014/equipment/barding-chain-shirt"
      },
      {
        "index": "barding-scale-mail",
        "name": "Barding: Scale mail",
        "url": "/api/2014/equipment/barding-scale-mail"
      },
      {
        "index": "barding-breastplate",
        "name": "Barding: Breastplate",
        "url": "/api/2014/equipment/barding-breastplate"
      },
      {
        "index": "barding-half-plate",
        "name": "Barding: Half plate",
        "url": "/api/2014/equipment/barding-half-plate"
      },
      {
        "index": "barding-ring-mail",
        "name": "Barding: Ring mail",
        "url": "/api/2014/equipment/barding-ring-mail"
      },
      {
        "index": "barding-chain-mail",
        "name": "Barding: Chain mail",
        "url": "/api/2014/equipment/barding-chain-mail"
      },
      {
        "index": "barding-splint",
        "name": "Barding: Splint",
        "url": "/api/2014/equipment/barding-splint"
      },
      {
        "index": "barding-plate",
        "name": "Barding: Plate",
        "url": "/api/2014/equipment/barding-plate"
      },
      {
        "index": "bit-and-bridle",
        "name": "Bit and bridle",
        "url": "/api/2014/equipment/bit-and-bridle"
      },
      {
        "index": "carriage",
        "name": "Carriage",
        "url": "/api/2014/equipment/carriage"
      },
      {
        "index": "cart",
        "name": "Cart",
        "url": "/api/2014/equipment/cart"
      },
      {
        "index": "chariot",
        "name": "Chariot",
        "url": "/api/2014/equipment/chariot"
      },
      {
        "index": "animal-feed-1-day",
        "name": "Animal Feed (1 day)",
        "url": "/api/2014/equipment/animal-feed-1-day"
      },
      {
        "index": "saddle-exotic",
        "name": "Saddle, Exotic",
        "url": "/api/2014/equipment/saddle-exotic"
      },
      {
        "index": "saddle-military",
        "name": "Saddle, Military",
        "url": "/api/2014/equipment/saddle-military"
      },
      {
        "index": "saddle-pack",
        "name": "Saddle, Pack",
        "url": "/api/2014/equipment/saddle-pack"
      },
      {
        "index": "saddle-riding",
        "name": "Saddle, Riding",
        "url": "/api/2014/equipment/saddle-riding"
      },
      {
        "index": "saddlebags",
        "name": "Saddlebags",
        "url": "/api/2014/equipment/saddlebags"
      },
      {
        "index": "sled",
        "name": "Sled",
        "url": "/api/2014/equipment/sled"
      },
      {
        "index": "stabling-1-day",
        "name": "Stabling (1 day)",
        "url": "/api/2014/equipment/stabling-1-day"
      },
      {
        "index": "wagon",
        "name": "Wagon",
        "url": "/api/2014/equipment/wagon"
      },
      {
        "index": "galley",
        "name": "Galley",
        "url": "/api/2014/equipment/galley"
      },
      {
        "index": "keelboat",
        "name": "Keelboat",
        "url": "/api/2014/equipment/keelboat"
      },
      {
        "index": "longship",
        "name": "Longship",
        "url": "/api/2014/equipment/longship"
      },
      {
        "index": "rowboat",
        "name": "Rowboat",
        "url": "/api/2014/equipment/rowboat"
      },
      {
        "index": "sailing-ship",
        "name": "Sailing ship",
        "url": "/api/2014/equipment/sailing-ship"
      },
      {
        "index": "warship",
        "name": "Warship",
        "url": "/api/2014/equipment/warship"
      }
    ],
    "url": "/api/2014/equipment-categories/mounts-and-vehicles"
  },
  {
    "index": "simple-weapons",
    "name": "Simple Weapons",
    "equipment": [
      {
        "index": "club",
        "name": "Club",
        "url": "/api/2014/equipment/club"
      },
      {
        "index": "dagger",
        "name": "Dagger",
        "url": "/api/2014/equipment/dagger"
      },
      {
        "index": "greatclub",
        "name": "Greatclub",
        "url": "/api/2014/equipment/greatclub"
      },
      {
        "index": "handaxe",
        "name": "Handaxe",
        "url": "/api/2014/equipment/handaxe"
      },
      {
        "index": "javelin",
        "name": "Javelin",
        "url": "/api/2014/equipment/javelin"
      },
      {
        "index": "light-hammer",
        "name": "Light hammer",
        "url": "/api/2014/equipment/light-hammer"
      },
      {
        "index": "mace",
        "name": "Mace",
        "url": "/api/2014/equipment/mace"
      },
      {
        "index": "quarterstaff",
        "name": "Quarterstaff",
        "url": "/api/2014/equipment/quarterstaff"
      },
      {
        "index": "sickle",
        "name": "Sickle",
        "url": "/api/2014/equipment/sickle"
      },
      {
        "index": "spear",
        "name": "Spear",
        "url": "/api/2014/equipment/spear"
      },
      {
        "index": "crossbow-light",
        "name": "Crossbow, light",
        "url": "/api/2014/equipment/crossbow-light"
      },
      {
        "index": "dart",
        "name": "Dart",
        "url": "/api/2014/equipment/dart"
      },
      {
        "index": "shortbow",
        "name": "Shortbow",
        "url": "/api/2014/equipment/shortbow"
      },
      {
        "index": "sling",
        "name": "Sling",
        "url": "/api/2014/equipment/sling"
      }
    ],
    "url": "/api/2014/equipment-categories/simple-weapons"
  },
  {
    "index": "martial-weapons",
    "name": "Martial Weapons",
    "equipment": [
      {
        "index": "battleaxe",
        "name": "Battleaxe",
        "url": "/api/2014/equipment/battleaxe"
      },
      {
        "index": "flail",
        "name": "Flail",
        "url": "/api/2014/equipment/flail"
      },
      {
        "index": "glaive",
        "name": "Glaive",
        "url": "/api/2014/equipment/glaive"
      },
      {
        "index": "greataxe",
        "name": "Greataxe",
        "url": "/api/2014/equipment/greataxe"
      },
      {
        "index": "greatsword",
        "name": "Greatsword",
        "url": "/api/2014/equipment/greatsword"
      },
      {
        "index": "halberd",
        "name": "Halberd",
        "url": "/api/2014/equipment/halberd"
      },
      {
        "index": "lance",
        "name": "Lance",
        "url": "/api/2014/equipment/lance"
      },
      {
        "index": "longsword",
        "name": "Longsword",
        "url": "/api/2014/equipment/longsword"
      },
      {
        "index": "maul",
        "name": "Maul",
        "url": "/api/2014/equipment/maul"
      },
      {
        "index": "morningstar",
        "name": "Morningstar",
        "url": "/api/2014/equipment/morningstar"
      },
      {
        "index": "pike",
        "name": "Pike",
        "url": "/api/2014/equipment/pike"
      },
      {
        "index": "rapier",
        "name": "Rapier",
        "url": "/api/2014/equipment/rapier"
      },
      {
        "index": "scimitar",
        "name": "Scimitar",
        "url": "/api/2014/equipment/scimitar"
      },
      {
        "index": "shortsword",
        "name": "Shortsword",
        "url": "/api/2014/equipment/shortsword"
      },
      {
        "index": "trident",
        "name": "Trident",
        "url": "/api/2014/equipment/trident"
      },
      {
        "index": "war-pick",
        "name": "War pick",
        "url": "/api/2014/equipment/war-pick"
      },
      {
        "index": "warhammer",
        "name": "Warhammer",
        "url": "/api/2014/equipment/warhammer"
      },
      {
        "index": "whip",
        "name": "Whip",
        "url": "/api/2014/equipment/whip"
      },
      {
        "index": "blowgun",
        "name": "Blowgun",
        "url": "/api/2014/equipment/blowgun"
      },
      {
        "index": "crossbow-hand",
        "name": "Crossbow, hand",
        "url": "/api/2014/equipment/crossbow-hand"
      },
      {
        "index": "crossbow-heavy",
        "name": "Crossbow, heavy",
        "url": "/api/2014/equipment/crossbow-heavy"
      },
      {
        "index": "longbow",
        "name": "Longbow",
        "url": "/api/2014/equipment/longbow"
      },
      {
        "index": "net",
        "name": "Net",
        "url": "/api/2014/equipment/net"
      }
    ],
    "url": "/api/2014/equipment-categories/martial-weapons"
  },
  {
    "index": "melee-weapons",
    "name": "Melee Weapons",
    "equipment": [
      {
        "index": "battleaxe",
        "name": "Battleaxe",
        "url": "/api/2014/equipment/battleaxe"
      },
      {
        "index": "club",
        "name": "Club",
        "url": "/api/2014/equipment/club"
      },
      {
        "index": "dagger",
        "name": "Dagger",
        "url": "/api/2014/equipment/dagger"
      },
      {
        "index": "flail",
        "name": "Flail",
        "url": "/api/2014/equipment/flail"
      },
      {
        "index": "glaive",
        "name": "Glaive",
        "url": "/api/2014/equipment/glaive"
      },
      {
        "index": "greataxe",
        "name": "Greataxe",
        "url": "/api/2014/equipment/greataxe"
      },
      {
        "index": "greatclub",
        "name": "Greatclub",
        "url": "/api/2014/equipment/greatclub"
      },
      {
        "index": "greatsword",
        "name": "Greatsword",
        "url": "/api/2014/equipment/greatsword"
      },
      {
        "index": "halberd",
        "name": "Halberd",
        "url": "/api/2014/equipment/halberd"
      },
      {
        "index": "handaxe",
        "name": "Handaxe",
        "url": "/api/2014/equipment/handaxe"
      },
      {
        "index": "javelin",
        "name": "Javelin",
        "url": "/api/2014/equipment/javelin"
      },
      {
        "index": "lance",
        "name": "Lance",
        "url": "/api/2014/equipment/lance"
      },
      {
        "index": "light-hammer",
        "name": "Light hammer",
        "url": "/api/2014/equipment/light-hammer"
      },
      {
        "index": "longsword",
        "name": "Longsword",
        "url": "/api/2014/equipment/longsword"
      },
      {
        "index": "mace",
        "name": "Mace",
        "url": "/api/2014/equipment/mace"
      },
      {
        "index": "maul",
        "name": "Maul",
        "url": "/api/2014/equipment/maul"
      },
      {
        "index": "morningstar",
        "name": "Morningstar",
        "url": "/api/2014/equipment/morningstar"
      },
      {
        "index": "pike",
        "name": "Pike",
        "url": "/api/2014/equipment/pike"
      },
      {
        "index": "quarterstaff",
        "name": "Quarterstaff",
        "url": "/api/2014/equipment/quarterstaff"
      },
      {
        "index": "rapier",
        "name": "Rapier",
        "url": "/api/2014/equipment/rapier"
      },
      {
        "index": "scimitar",
        "name": "Scimitar",
        "url": "/api/2014/equipment/scimitar"
      },
      {
        "index": "shortsword",
        "name": "Shortsword",
        "url": "/api/2014/equipment/shortsword"
      },
      {
        "index": "sickle",
        "name": "Sickle",
        "url": "/api/2014/equipment/sickle"
      },
      {
        "index": "spear",
        "name": "Spear",
        "url": "/api/2014/equipment/spear"
      },
      {
        "index": "trident",
        "name": "Trident",
        "url": "/api/2014/equipment/trident"
      },
      {
        "index": "war-pick",
        "name": "War pick",
        "url": "/api/2014/equipment/war-pick"
      },
      {
        "index": "warhammer",
        "name": "Warhammer",
        "url": "/api/2014/equipment/warhammer"
      },
      {
        "index": "whip",
        "name": "Whip",
        "url": "/api/2014/equipment/whip"
      }
    ],
    "url": "/api/2014/equipment-categories/melee-weapons"
  },
  {
    "index": "ranged-weapons",
    "name": "Ranged Weapons",
    "equipment": [
      {
        "index": "blowgun",
        "name": "Blowgun",
        "url": "/api/2014/equipment/blowgun"
      },
      {
        "index": "crossbow-hand",
        "name": "Crossbow, hand",
        "url": "/api/2014/equipment/crossbow-hand"
      },
      {
        "index": "crossbow-heavy",
        "name": "Crossbow, heavy",
        "url": "/api/2014/equipment/crossbow-heavy"
      },
      {
        "index": "crossbow-light",
        "name": "Crossbow, light",
        "url": "/api/2014/equipment/crossbow-light"
      },
      {
        "index": "dart",
        "name": "Dart",
        "url": "/api/2014/equipment/dart"
      },
      {
        "index": "longbow",
        "name": "Longbow",
        "url": "/api/2014/equipment/longbow"
      },
      {
        "index": "net",
        "name": "Net",
        "url": "/api/2014/equipment/net"
      },
      {
        "index": "shortbow",
        "name": "Shortbow",
        "url": "/api/2014/equipment/shortbow"
      },
      {
        "index": "sling",
        "name": "Sling",
        "url": "/api/2014/equipment/sling"
      }
    ],
    "url": "/api/2014/equipment-categories/ranged-weapons"
  },
  {
    "index": "simple-melee-weapons",
    "name": "Simple Melee Weapons",
    "equipment": [
      {
        "index": "club",
        "name": "Club",
        "url": "/api/2014/equipment/club"
      },
      {
        "index": "dagger",
        "name": "Dagger",
        "url": "/api/2014/equipment/dagger"
      },
      {
        "index": "greatclub",
        "name": "Greatclub",
        "url": "/api/2014/equipment/greatclub"
      },
      {
        "index": "handaxe",
        "name": "Handaxe",
        "url": "/api/2014/equipment/handaxe"
      },
      {
        "index": "javelin",
        "name": "Javelin",
        "url": "/api/2014/equipment/javelin"
      },
      {
        "index": "light-hammer",
        "name": "Light hammer",
        "url": "/api/2014/equipment/light-hammer"
      },
      {
        "index": "mace",
        "name": "Mace",
        "url": "/api/2014/equipment/mace"
      },
      {
        "index": "quarterstaff",
        "name": "Quarterstaff",
        "url": "/api/2014/equipment/quarterstaff"
      },
      {
        "index": "sickle",
        "name": "Sickle",
        "url": "/api/2014/equipment/sickle"
      },
      {
        "index": "spear",
        "name": "Spear",
        "url": "/api/2014/equipment/spear"
      }
    ],
    "url": "/api/2014/equipment-categories/simple-melee-weapons"
  },
  {
    "index": "simple-ranged-weapons",
    "name": "Simple Ranged Weapons",
    "equipment": [
      {
        "index": "crossbow-light",
        "name": "Crossbow, light",
        "url": "/api/2014/equipment/crossbow-light"
      },
      {
        "index": "dart",
        "name": "Dart",
        "url": "/api/2014/equipment/dart"
      },
      {
        "index": "shortbow",
        "name": "Shortbow",
        "url": "/api/2014/equipment/shortbow"
      },
      {
        "index": "sling",
        "name": "Sling",
        "url": "/api/2014/equipment/sling"
      }
    ],
    "url": "/api/2014/equipment-categories/simple-ranged-weapons"
  },
  {
    "index": "martial-melee-weapons",
    "name": "Martial Melee Weapons",
    "equipment": [
      {
        "index": "battleaxe",
        "name": "Battleaxe",
        "url": "/api/2014/equipment/battleaxe"
      },
      {
        "index": "flail",
        "name": "Flail",
        "url": "/api/2014/equipment/flail"
      },
      {
        "index": "glaive",
        "name": "Glaive",
        "url": "/api/2014/equipment/glaive"
      },
      {
        "index": "greataxe",
        "name": "Greataxe",
        "url": "/api/2014/equipment/greataxe"
      },
      {
        "index": "greatsword",
        "name": "Greatsword",
        "url": "/api/2014/equipment/greatsword"
      },
      {
        "index": "halberd",
        "name": "Halberd",
        "url": "/api/2014/equipment/halberd"
      },
      {
        "index": "lance",
        "name": "Lance",
        "url": "/api/2014/equipment/lance"
      },
      {
        "index": "longsword",
        "name": "Longsword",
        "url": "/api/2014/equipment/longsword"
      },
      {
        "index": "maul",
        "name": "Maul",
        "url": "/api/2014/equipment/maul"
      },
      {
        "index": "morningstar",
        "name": "Morningstar",
        "url": "/api/2014/equipment/morningstar"
      },
      {
        "index": "pike",
        "name": "Pike",
        "url": "/api/2014/equipment/pike"
      },
      {
        "index": "rapier",
        "name": "Rapier",
        "url": "/api/2014/equipment/rapier"
      },
      {
        "index": "scimitar",
        "name": "Scimitar",
        "url": "/api/2014/equipment/scimitar"
      },
      {
        "index": "shortsword",
        "name": "Shortsword",
        "url": "/api/2014/equipment/shortsword"
      },
      {
        "index": "trident",
        "name": "Trident",
        "url": "/api/2014/equipment/trident"
      },
      {
        "index": "war-pick",
        "name": "War pick",
        "url": "/api/2014/equipment/war-pick"
      },
      {
        "index": "warhammer",
        "name": "Warhammer",
        "url": "/api/2014/equipment/warhammer"
      },
      {
        "index": "whip",
        "name": "Whip",
        "url": "/api/2014/equipment/whip"
      }
    ],
    "url": "/api/2014/equipment-categories/martial-melee-weapons"
  },
  {
    "index": "martial-ranged-weapons",
    "name": "Martial Ranged Weapons",
    "equipment": [
      {
        "index": "blowgun",
        "name": "Blowgun",
        "url": "/api/2014/equipment/blowgun"
      },
      {
        "index": "crossbow-hand",
        "name": "Crossbow, hand",
        "url": "/api/2014/equipment/crossbow-hand"
      },
      {
        "index": "crossbow-heavy",
        "name": "Crossbow, heavy",
        "url": "/api/2014/equipment/crossbow-heavy"
      },
      {
        "index": "longbow",
        "name": "Longbow",
        "url": "/api/2014/equipment/longbow"
      },
      {
        "index": "net",
        "name": "Net",
        "url": "/api/2014/equipment/net"
      }
    ],
    "url": "/api/2014/equipment-categories/martial-ranged-weapons"
  },
  {
    "index": "light-armor",
    "name": "Light Armor",
    "equipment": [
      {
        "index": "padded-armor",
        "name": "Padded Armor",
        "url": "/api/2014/equipment/padded-armor"
      },
      {
        "index": "leather-armor",
        "name": "Leather Armor",
        "url": "/api/2014/equipment/leather-armor"
      },
      {
        "index": "studded-leather-armor",
        "name": "Studded Leather Armor",
        "url": "/api/2014/equipment/studded-leather-armor"
      }
    ],
    "url": "/api/2014/equipment-categories/light-armor"
  },
  {
    "index": "medium-armor",
    "name": "Medium Armor",
    "equipment": [
      {
        "index": "hide-armor",
        "name": "Hide Armor",
        "url": "/api/2014/equipment/hide-armor"
      },
      {
        "index": "chain-shirt",
        "name": "Chain Shirt",
        "url": "/api/2014/equipment/chain-shirt"
      },
      {
        "index": "scale-mail",
        "name": "Scale Mail",
        "url": "/api/2014/equipment/scale-mail"
      },
      {
        "index": "breastplate",
        "name": "Breastplate",
        "url": "/api/2014/equipment/breastplate"
      },
      {
        "index": "half-plate-armor",
        "name": "Half Plate Armor",
        "url": "/api/2014/equipment/half-plate-armor"
      }
    ],
    "url": "/api/2014/equipment-categories/medium-armor"
  },
  {
    "index": "heavy-armor",
    "name": "Heavy Armor",
    "equipment": [
      {
        "index": "ring-mail",
        "name": "Ring Mail",
        "url": "/api/2014/equipment/ring-mail"
      },
      {
        "index": "chain-mail",
        "name": "Chain Mail",
        "url": "/api/2014/equipment/chain-mail"
      },
      {
        "index": "splint-armor",
        "name": "Splint Armor",
        "url": "/api/2014/equipment/splint-armor"
      },
      {
        "index": "plate-armor",
        "name": "Plate Armor",
        "url": "/api/2014/equipment/plate-armor"
      }
    ],
    "url": "/api/2014/equipment-categories/heavy-armor"
  },
  {
    "index": "shields",
    "name": "Shields",
    "equipment": [
      {
        "index": "shield",
        "name": "Shield",
        "url": "/api/2014/equipment/shield"
      }
    ],
    "url": "/api/2014/equipment-categories/shields"
  },
  {
    "index": "standard-gear",
    "name": "Standard Gear",
    "equipment": [
      {
        "index": "abacus",
        "name": "Abacus",
        "url": "/api/2014/equipment/abacus"
      },
      {
        "index": "acid-vial",
        "name": "Acid (vial)",
        "url": "/api/2014/equipment/acid-vial"
      },
      {
        "index": "alchemists-fire-flask",
        "name": "Alchemist's fire (flask)",
        "url": "/api/2014/equipment/alchemists-fire-flask"
      },
      {
        "index": "arrow",
        "name": "Arrow",
        "url": "/api/2014/equipment/arrow"
      },
      {
        "index": "blowgun-needle",
        "name": "Blowgun needle",
        "url": "/api/2014/equipment/blowgun-needle"
      },
      {
        "index": "crossbow-bolt",
        "name": "Crossbow bolt",
        "url": "/api/2014/equipment/crossbow-bolt"
      },
      {
        "index": "sling-bullet",
        "name": "Sling bullet",
        "url": "/api/2014/equipment/sling-bullet"
      },
      {
        "index": "alms-box",
        "name": "Alms box",
        "url": "/api/2014/equipment/alms-box"
      },
      {
        "index": "antitoxin-vial",
        "name": "Antitoxin (vial)",
        "url": "/api/2014/equipment/antitoxin-vial"
      },
      {
        "index": "backpack",
        "name": "Backpack",
        "url": "/api/2014/equipment/backpack"
      },
      {
        "index": "ball-bearings-bag-of-1000",
        "name": "Ball bearings (bag of 1,000)",
        "url": "/api/2014/equipment/ball-bearings-bag-of-1000"
      },
      {
        "index": "barrel",
        "name": "Barrel",
        "url": "/api/2014/equipment/barrel"
      },
      {
        "index": "basket",
        "name": "Basket",
        "url": "/api/2014/equipment/basket"
      },
      {
        "index": "bedroll",
        "name": "Bedroll",
        "url": "/api/2014/equipment/bedroll"
      },
      {
        "index": "bell",
        "name": "Bell",
        "url": "/api/2014/equipment/bell"
      },
      {
        "index": "blanket",
        "name": "Blanket",
        "url": "/api/2014/equipment/blanket"
      },
      {
        "index": "block-and-tackle",
        "name": "Block and tackle",
        "url": "/api/2014/equipment/block-and-tackle"
      },
      {
        "index": "block-of-incense",
        "name": "Block of incense",
        "url": "/api/2014/equipment/block-of-incense"
      },
      {
        "index": "book",
        "name": "Book",
        "url": "/api/2014/equipment/book"
      },
      {
        "index": "bottle-glass",
        "name": "Bottle, glass",
        "url": "/api/2014/equipment/bottle-glass"
      },
      {
        "index": "bucket",
        "name": "Bucket",
        "url": "/api/2014/equipment/bucket"
      },
      {
        "index": "caltrops",
        "name": "Caltrops",
        "url": "/api/2014/equipment/caltrops"
      },
      {
        "index": "candle",
        "name": "Candle",
        "url": "/api/2014/equipment/candle"
      },
      {
        "index": "case-crossbow-bolt",
        "name": "Case, crossbow bolt",
        "url": "/api/2014/equipment/case-crossbow-bolt"
      },
      {
        "index": "case-map-or-scroll",
        "name": "Case, map or scroll",
        "url": "/api/2014/equipment/case-map-or-scroll"
      },
      {
        "index": "censer",
        "name": "Censer",
        "url": "/api/2014/equipment/censer"
      },
      {
        "index": "chain-10-feet",
        "name": "Chain (10 feet)",
        "url": "/api/2014/equipment/chain-10-feet"
      },
      {
        "index": "chalk-1-piece",
        "name": "Chalk (1 piece)",
        "url": "/api/2014/equipment/chalk-1-piece"
      },
      {
        "index": "chest",
        "name": "Chest",
        "url": "/api/2014/equipment/chest"
      },
      {
        "index": "clothes-common",
        "name": "Clothes, common",
        "url": "/api/2014/equipment/clothes-common"
      },
      {
        "index": "clothes-costume",
        "name": "Clothes, costume",
        "url": "/api/2014/equipment/clothes-costume"
      },
      {
        "index": "clothes-fine",
        "name": "Clothes, fine",
        "url": "/api/2014/equipment/clothes-fine"
      },
      {
        "index": "clothes-travelers",
        "name": "Clothes, traveler's",
        "url": "/api/2014/equipment/clothes-travelers"
      },
      {
        "index": "component-pouch",
        "name": "Component pouch",
        "url": "/api/2014/equipment/component-pouch"
      },
      {
        "index": "crowbar",
        "name": "Crowbar",
        "url": "/api/2014/equipment/crowbar"
      },
      {
        "index": "fishing-tackle",
        "name": "Fishing tackle",
        "url": "/api/2014/equipment/fishing-tackle"
      },
      {
        "index": "flask-or-tankard",
        "name": "Flask or tankard",
        "url": "/api/2014/equipment/flask-or-tankard"
      },
      {
        "index": "grappling-hook",
        "name": "Grappling hook",
        "url": "/api/2014/equipment/grappling-hook"
      },
      {
        "index": "hammer",
        "name": "Hammer",
        "url": "/api/2014/equipment/hammer"
      },
      {
        "index": "hammer-sledge",
        "name": "Hammer, sledge",
        "url": "/api/2014/equipment/hammer-sledge"
      },
      {
        "index": "holy-water-flask",
        "name": "Holy water (flask)",
        "url": "/api/2014/equipment/holy-water-flask"
      },
      {
        "index": "hourglass",
        "name": "Hourglass",
        "url": "/api/2014/equipment/hourglass"
      },
      {
        "index": "hunting-trap",
        "name": "Hunting trap",
        "url": "/api/2014/equipment/hunting-trap"
      },
      {
        "index": "ink-1-ounce-bottle",
        "name": "Ink (1 ounce bottle)",
        "url": "/api/2014/equipment/ink-1-ounce-bottle"
      },
      {
        "index": "ink-pen",
        "name": "Ink pen",
        "url": "/api/2014/equipment/ink-pen"
      },
      {
        "index": "hourglass",
        "name": "Hourglass",
        "url": "/api/2014/equipment/hourglass"
      },
      {
        "index": "hunting-trap",
        "name": "Hunting trap",
        "url": "/api/2014/equipment/hunting-trap"
      },
      {
        "index": "ink-1-ounce-bottle",
        "name": "Ink (1 ounce bottle)",
        "url": "/api/2014/equipment/ink-1-ounce-bottle"
      },
      {
        "index": "ink-pen",
        "name": "Ink pen",
        "url": "/api/2014/equipment/ink-pen"
      },
      {
        "index": "jug-or-pitcher",
        "name": "Jug or pitcher",
        "url": "/api/2014/equipment/jug-or-pitcher"
      },
      {
        "index": "ladder-10-foot",
        "name": "Ladder (10-foot)",
        "url": "/api/2014/equipment/ladder-10-foot"
      },
      {
        "index": "lamp",
        "name": "Lamp",
        "url": "/api/2014/equipment/lamp"
      },
      {
        "index": "lantern-bullseye",
        "name": "Lantern, bullseye",
        "url": "/api/2014/equipment/lantern-bullseye"
      },
      {
        "index": "lantern-hooded",
        "name": "Lantern, hooded",
        "url": "/api/2014/equipment/lantern-hooded"
      },
      {
        "index": "little-bag-of-sand",
        "name": "Little bag of sand",
        "url": "/api/2014/equipment/little-bag-of-sand"
      },
      {
        "index": "lock",
        "name": "Lock",
        "url": "/api/2014/equipment/lock"
      },
      {
        "index": "magnifying-glass",
        "name": "Magnifying glass",
        "url": "/api/2014/equipment/magnifying-glass"
      },
      {
        "index": "manacles",
        "name": "Manacles",
        "url": "/api/2014/equipment/manacles"
      },
      {
        "index": "mirror-steel",
        "name": "Mirror, steel",
        "url": "/api/2014/equipment/mirror-steel"
      },
      {
        "index": "oil-flask",
        "name": "Oil (flask)",
        "url": "/api/2014/equipment/oil-flask"
      },
      {
        "index": "paper-one-sheet",
        "name": "Paper (one sheet)",
        "url": "/api/2014/equipment/paper-one-sheet"
      },
      {
        "index": "parchment-one-sheet",
        "name": "Parchment (one sheet)",
        "url": "/api/2014/equipment/parchment-one-sheet"
      },
      {
        "index": "perfume-vial",
        "name": "Perfume (vial)",
        "url": "/api/2014/equipment/perfume-vial"
      },
      {
        "index": "pick-miners",
        "name": "Pick, miner's",
        "url": "/api/2014/equipment/pick-miners"
      },
      {
        "index": "piton",
        "name": "Piton",
        "url": "/api/2014/equipment/piton"
      },
      {
        "index": "poison-basic-vial",
        "name": "Poison, basic (vial)",
        "url": "/api/2014/equipment/poison-basic-vial"
      },
      {
        "index": "pole-10-foot",
        "name": "Pole (10-foot)",
        "url": "/api/2014/equipment/pole-10-foot"
      },
      {
        "index": "pot-iron",
        "name": "Pot, iron",
        "url": "/api/2014/equipment/pot-iron"
      },
      {
        "index": "pouch",
        "name": "Pouch",
        "url": "/api/2014/equipment/pouch"
      },
      {
        "index": "quiver",
        "name": "Quiver",
        "url": "/api/2014/equipment/quiver"
      },
      {
        "index": "ram-portable",
        "name": "Ram, portable",
        "url": "/api/2014/equipment/ram-portable"
      },
      {
        "index": "rations-1-day",
        "name": "Rations (1 day)",
        "url": "/api/2014/equipment/rations-1-day"
      },
      {
        "index": "robes",
        "name": "Robes",
        "url": "/api/2014/equipment/robes"
      },
      {
        "index": "rope-hempen-50-feet",
        "name": "Rope, hempen (50 feet)",
        "url": "/api/2014/equipment/rope-hempen-50-feet"
      },
      {
        "index": "rope-silk-50-feet",
        "name": "Rope, silk (50 feet)",
        "url": "/api/2014/equipment/rope-silk-50-feet"
      },
      {
        "index": "sack",
        "name": "Sack",
        "url": "/api/2014/equipment/sack"
      },
      {
        "index": "scale-merchants",
        "name": "Scale, merchant's",
        "url": "/api/2014/equipment/scale-merchants"
      },
      {
        "index": "sealing-wax",
        "name": "Sealing wax",
        "url": "/api/2014/equipment/sealing-wax"
      },
      {
        "index": "shovel",
        "name": "Shovel",
        "url": "/api/2014/equipment/shovel"
      },
      {
        "index": "signal-whistle",
        "name": "Signal whistle",
        "url": "/api/2014/equipment/signal-whistle"
      },
      {
        "index": "signet-ring",
        "name": "Signet ring",
        "url": "/api/2014/equipment/signet-ring"
      },
      {
        "index": "small-knife",
        "name": "Small knife",
        "url": "/api/2014/equipment/small-knife"
      },
      {
        "index": "soap",
        "name": "Soap",
        "url": "/api/2014/equipment/soap"
      },
      {
        "index": "spellbook",
        "name": "Spellbook",
        "url": "/api/2014/equipment/spellbook"
      },
      {
        "index": "spike-iron",
        "name": "Spike, iron",
        "url": "/api/2014/equipment/spike-iron"
      },
      {
        "index": "spyglass",
        "name": "Spyglass",
        "url": "/api/2014/equipment/spyglass"
      },
      {
        "index": "string-10-feet",
        "name": "String (10 feet)",
        "url": "/api/2014/equipment/string-10-feet"
      },
      {
        "index": "tent-two-person",
        "name": "Tent, two-person",
        "url": "/api/2014/equipment/tent-two-person"
      },
      {
        "index": "tinderbox",
        "name": "Tinderbox",
        "url": "/api/2014/equipment/tinderbox"
      },
      {
        "index": "vestments",
        "name": "Vestments",
        "url": "/api/2014/equipment/vestments"
      },
      {
        "index": "torch",
        "name": "Torch",
        "url": "/api/2014/equipment/torch"
      },
      {
        "index": "vial",
        "name": "Vial",
        "url": "/api/2014/equipment/vial"
      },
      {
        "index": "waterskin",
        "name": "Waterskin",
        "url": "/api/2014/equipment/waterskin"
      },
      {
        "index": "whetstone",
        "name": "Whetstone",
        "url": "/api/2014/equipment/whetstone"
      }
    ],
    "url": "/api/2014/equipment-categories/standard-gear"
  },
  {
    "index": "kits",
    "name": "Kits",
    "equipment": [
      {
        "index": "climbers-kit",
        "name": "Climber's Kit",
        "url": "/api/2014/equipment/climbers-kit"
      },
      {
        "index": "disguise-kit",
        "name": "Disguise Kit",
        "url": "/api/2014/equipment/disguise-kit"
      },
      {
        "index": "forgery-kit",
        "name": "Forgery Kit",
        "url": "/api/2014/equipment/forgery-kit"
      },
      {
        "index": "herbalism-kit",
        "name": "Herbalism Kit",
        "url": "/api/2014/equipment/herbalism-kit"
      },
      {
        "index": "healers-kit",
        "name": "Healer's Kit",
        "url": "/api/2014/equipment/healers-kit"
      },
      {
        "index": "mess-kit",
        "name": "Mess Kit",
        "url": "/api/2014/equipment/mess-kit"
      },
      {
        "index": "poisoners-kit",
        "name": "Poisoner's Kit",
        "url": "/api/2014/equipment/poisoners-kit"
      }
    ],
    "url": "/api/2014/equipment-categories/kits"
  },
  {
    "index": "equipment-packs",
    "name": "Equipment Packs",
    "equipment": [
      {
        "index": "burglars-pack",
        "name": "Burglar's Pack",
        "url": "/api/2014/equipment/burglars-pack"
      },
      {
        "index": "diplomats-pack",
        "name": "Diplomat's Pack",
        "url": "/api/2014/equipment/diplomats-pack"
      },
      {
        "index": "dungeoneers-pack",
        "name": "Dungeoneer's Pack",
        "url": "/api/2014/equipment/dungeoneers-pack"
      },
      {
        "index": "entertainers-pack",
        "name": "Entertainer's Pack",
        "url": "/api/2014/equipment/entertainers-pack"
      },
      {
        "index": "explorers-pack",
        "name": "Explorer's Pack",
        "url": "/api/2014/equipment/explorers-pack"
      },
      {
        "index": "priests-pack",
        "name": "Priest's Pack",
        "url": "/api/2014/equipment/priests-pack"
      },
      {
        "index": "scholars-pack",
        "name": "Scholar's Pack",
        "url": "/api/2014/equipment/scholars-pack"
      }
    ],
    "url": "/api/2014/equipment-categories/equipment-packs"
  },
  {
    "index": "artisans-tools",
    "name": "Artisan's Tools",
    "equipment": [
      {
        "index": "alchemists-supplies",
        "name": "Alchemist's Supplies",
        "url": "/api/2014/equipment/alchemists-supplies"
      },
      {
        "index": "brewers-supplies",
        "name": "Brewer's Supplies",
        "url": "/api/2014/equipment/brewers-supplies"
      },
      {
        "index": "calligraphers-supplies",
        "name": "Calligrapher's Supplies",
        "url": "/api/2014/equipment/calligraphers-supplies"
      },
      {
        "index": "carpenters-tools",
        "name": "Carpenter's Tools",
        "url": "/api/2014/equipment/carpenters-tools"
      },
      {
        "index": "cartographers-tools",
        "name": "Cartographer's Tools",
        "url": "/api/2014/equipment/cartographers-tools"
      },
      {
        "index": "cobblers-tools",
        "name": "Cobbler's Tools",
        "url": "/api/2014/equipment/cobblers-tools"
      },
      {
        "index": "cooks-utensils",
        "name": "Cook's utensils",
        "url": "/api/2014/equipment/cooks-utensils"
      },
      {
        "index": "glassblowers-tools",
        "name": "Glassblower's Tools",
        "url": "/api/2014/equipment/glassblowers-tools"
      },
      {
        "index": "jewelers-tools",
        "name": "Jeweler's Tools",
        "url": "/api/2014/equipment/jewelers-tools"
      },
      {
        "index": "leatherworkers-tools",
        "name": "Leatherworker's Tools",
        "url": "/api/2014/equipment/leatherworkers-tools"
      },
      {
        "index": "masons-tools",
        "name": "Mason's Tools",
        "url": "/api/2014/equipment/masons-tools"
      },
      {
        "index": "painters-supplies",
        "name": "Painter's Supplies",
        "url": "/api/2014/equipment/painters-supplies"
      },
      {
        "index": "potters-tools",
        "name": "Potter's Tools",
        "url": "/api/2014/equipment/potters-tools"
      },
      {
        "index": "smiths-tools",
        "name": "Smith's Tools",
        "url": "/api/2014/equipment/smiths-tools"
      },
      {
        "index": "tinkers-tools",
        "name": "Tinker's Tools",
        "url": "/api/2014/equipment/tinkers-tools"
      },
      {
        "index": "weavers-tools",
        "name": "Weaver's Tools",
        "url": "/api/2014/equipment/weavers-tools"
      },
      {
        "index": "woodcarvers-tools",
        "name": "Woodcarver's Tools",
        "url": "/api/2014/equipment/woodcarvers-tools"
      }
    ],
    "url": "/api/2014/equipment-categories/artisans-tools"
  },
  {
    "index": "gaming-sets",
    "name": "Gaming Sets",
    "equipment": [
      {
        "index": "dice-set",
        "name": "Dice Set",
        "url": "/api/2014/equipment/dice-set"
      },
      {
        "index": "playing-card-set",
        "name": "Playing Card Set",
        "url": "/api/2014/equipment/playing-card-set"
      }
    ],
    "url": "/api/2014/equipment-categories/gaming-sets"
  },
  {
    "index": "musical-instruments",
    "name": "Musical Instruments",
    "equipment": [
      {
        "index": "bagpipes",
        "name": "Bagpipes",
        "url": "/api/2014/equipment/bagpipes"
      },
      {
        "index": "drum",
        "name": "Drum",
        "url": "/api/2014/equipment/drum"
      },
      {
        "index": "dulcimer",
        "name": "Dulcimer",
        "url": "/api/2014/equipment/dulcimer"
      },
      {
        "index": "flute",
        "name": "Flute",
        "url": "/api/2014/equipment/flute"
      },
      {
        "index": "lute",
        "name": "Lute",
        "url": "/api/2014/equipment/lute"
      },
      {
        "index": "lyre",
        "name": "Lyre",
        "url": "/api/2014/equipment/lyre"
      },
      {
        "index": "horn",
        "name": "Horn",
        "url": "/api/2014/equipment/horn"
      },
      {
        "index": "pan-flute",
        "name": "Pan flute",
        "url": "/api/2014/equipment/pan-flute"
      },
      {
        "index": "shawm",
        "name": "Shawm",
        "url": "/api/2014/equipment/shawm"
      },
      {
        "index": "viol",
        "name": "Viol",
        "url": "/api/2014/equipment/viol"
      }
    ],
    "url": "/api/2014/equipment-categories/musical-instruments"
  },
  {
    "index": "other-tools",
    "name": "Other Tools",
    "equipment": [
      {
        "index": "navigators-tools",
        "name": "Navigator's Tools",
        "url": "/api/2014/equipment/navigators-tools"
      },
      {
        "index": "thieves-tools",
        "name": "Thieves' Tools",
        "url": "/api/2014/equipment/thieves-tools"
      }
    ],
    "url": "/api/2014/equipment-categories/other-tools"
  },
  {
    "index": "mounts-and-other-animals",
    "name": "Mounts and Other Animals",
    "equipment": [
      {
        "index": "mule",
        "name": "Mule",
        "url": "/api/2014/equipment/mule"
      },
      {
        "index": "elephant",
        "name": "Elephant",
        "url": "/api/2014/equipment/elephant"
      },
      {
        "index": "horse-draft",
        "name": "Horse, draft",
        "url": "/api/2014/equipment/horse-draft"
      },
      {
        "index": "horse-riding",
        "name": "Horse, riding",
        "url": "/api/2014/equipment/horse-riding"
      },
      {
        "index": "mastiff",
        "name": "Mastiff",
        "url": "/api/2014/equipment/mastiff"
      },
      {
        "index": "pony",
        "name": "Pony",
        "url": "/api/2014/equipment/pony"
      },
      {
        "index": "warhorse",
        "name": "Warhorse",
        "url": "/api/2014/equipment/warhorse"
      }
    ],
    "url": "/api/2014/equipment-categories/mounts-and-other-animals"
  },
  {
    "index": "tack-harness-and-drawn-vehicles",
    "name": "Tack, Harness, and Drawn Vehicles",
    "equipment": [
      {
        "index": "barding-padded",
        "name": "Barding: Padded",
        "url": "/api/2014/equipment/barding-padded"
      },
      {
        "index": "barding-leather",
        "name": "Barding: Leather",
        "url": "/api/2014/equipment/barding-leather"
      },
      {
        "index": "barding-studded-leather",
        "name": "Barding: Studded Leather",
        "url": "/api/2014/equipment/barding-studded-leather"
      },
      {
        "index": "barding-hide",
        "name": "Barding: Hide",
        "url": "/api/2014/equipment/barding-hide"
      },
      {
        "index": "barding-chain-shirt",
        "name": "Barding: Chain shirt",
        "url": "/api/2014/equipment/barding-chain-shirt"
      },
      {
        "index": "barding-scale-mail",
        "name": "Barding: Scale mail",
        "url": "/api/2014/equipment/barding-scale-mail"
      },
      {
        "index": "barding-breastplate",
        "name": "Barding: Breastplate",
        "url": "/api/2014/equipment/barding-breastplate"
      },
      {
        "index": "barding-half-plate",
        "name": "Barding: Half plate",
        "url": "/api/2014/equipment/barding-half-plate"
      },
      {
        "index": "barding-ring-mail",
        "name": "Barding: Ring mail",
        "url": "/api/2014/equipment/barding-ring-mail"
      },
      {
        "index": "barding-chain-mail",
        "name": "Barding: Chain mail",
        "url": "/api/2014/equipment/barding-chain-mail"
      },
      {
        "index": "barding-splint",
        "name": "Barding: Splint",
        "url": "/api/2014/equipment/barding-splint"
      },
      {
        "index": "barding-plate",
        "name": "Barding: Plate",
        "url": "/api/2014/equipment/barding-plate"
      },
      {
        "index": "bit-and-bridle",
        "name": "Bit and bridle",
        "url": "/api/2014/equipment/bit-and-bridle"
      },
      {
        "index": "carriage",
        "name": "Carriage",
        "url": "/api/2014/equipment/carriage"
      },
      {
        "index": "cart",
        "name": "Cart",
        "url": "/api/2014/equipment/cart"
      },
      {
        "index": "chariot",
        "name": "Chariot",
        "url": "/api/2014/equipment/chariot"
      },
      {
        "index": "animal-feed-1-day",
        "name": "Animal Feed (1 day)",
        "url": "/api/2014/equipment/animal-feed-1-day"
      },
      {
        "index": "saddle-exotic",
        "name": "Saddle, Exotic",
        "url": "/api/2014/equipment/saddle-exotic"
      },
      {
        "index": "saddle-military",
        "name": "Saddle, Military",
        "url": "/api/2014/equipment/saddle-military"
      },
      {
        "index": "saddle-pack",
        "name": "Saddle, Pack",
        "url": "/api/2014/equipment/saddle-pack"
      },
      {
        "index": "saddle-riding",
        "name": "Saddle, Riding",
        "url": "/api/2014/equipment/saddle-riding"
      },
      {
        "index": "saddlebags",
        "name": "Saddlebags",
        "url": "/api/2014/equipment/saddlebags"
      },
      {
        "index": "sled",
        "name": "Sled",
        "url": "/api/2014/equipment/sled"
      },
      {
        "index": "stabling-1-day",
        "name": "Stabling (1 day)",
        "url": "/api/2014/equipment/stabling-1-day"
      },
      {
        "index": "wagon",
        "name": "Wagon",
        "url": "/api/2014/equipment/wagon"
      }
    ],
    "url": "/api/2014/equipment-categories/tack-harness-and-drawn-vehicles"
  },
  {
    "index": "land-vehicles",
    "name": "Land Vehicles",
    "equipment": [
      {
        "index": "carriage",
        "name": "Carriage",
        "url": "/api/2014/equipment/carriage"
      },
      {
        "index": "cart",
        "name": "Cart",
        "url": "/api/2014/equipment/cart"
      },
      {
        "index": "chariot",
        "name": "Chariot",
        "url": "/api/2014/equipment/chariot"
      },
      {
        "index": "sled",
        "name": "Sled",
        "url": "/api/2014/equipment/sled"
      },
      {
        "index": "wagon",
        "name": "Wagon",
        "url": "/api/2014/equipment/wagon"
      }
    ],
    "url": "/api/2014/equipment-categories/land-vehicles"
  },
  {
    "index": "waterborne-vehicles",
    "name": "Waterborne Vehicles",
    "equipment": [
      {
        "index": "galley",
        "name": "Galley",
        "url": "/api/2014/equipment/galley"
      },
      {
        "index": "keelboat",
        "name": "Keelboat",
        "url": "/api/2014/equipment/keelboat"
      },
      {
        "index": "longship",
        "name": "Longship",
        "url": "/api/2014/equipment/longship"
      },
      {
        "index": "rowboat",
        "name": "Rowboat",
        "url": "/api/2014/equipment/rowboat"
      },
      {
        "index": "sailing-ship",
        "name": "Sailing ship",
        "url": "/api/2014/equipment/sailing-ship"
      },
      {
        "index": "warship",
        "name": "Warship",
        "url": "/api/2014/equipment/warship"
      }
    ],
    "url": "/api/2014/equipment-categories/waterborne-vehicles"
  },
  {
    "index": "arcane-foci",
    "name": "Arcane Foci",
    "equipment": [
      {
        "index": "crystal",
        "name": "Crystal",
        "url": "/api/2014/equipment/crystal"
      },
      {
        "index": "orb",
        "name": "Orb",
        "url": "/api/2014/equipment/orb"
      },
      {
        "index": "rod",
        "name": "Rod",
        "url": "/api/2014/equipment/rod"
      },
      {
        "index": "staff",
        "name": "Staff",
        "url": "/api/2014/equipment/staff"
      },
      {
        "index": "wand",
        "name": "Wand",
        "url": "/api/2014/equipment/wand"
      }
    ],
    "url": "/api/2014/equipment-categories/arcane-foci"
  },
  {
    "index": "druidic-foci",
    "name": "Druidic Foci",
    "equipment": [
      {
        "index": "sprig-of-mistletoe",
        "name": "Sprig of mistletoe",
        "url": "/api/2014/equipment/sprig-of-mistletoe"
      },
      {
        "index": "totem",
        "name": "Totem",
        "url": "/api/2014/equipment/totem"
      },
      {
        "index": "wooden-staff",
        "name": "Wooden staff",
        "url": "/api/2014/equipment/wooden-staff"
      },
      {
        "index": "yew-wand",
        "name": "Yew wand",
        "url": "/api/2014/equipment/yew-wand"
      }
    ],
    "url": "/api/2014/equipment-categories/druidic-foci"
  },
  {
    "index": "holy-symbols",
    "name": "Holy Symbols",
    "equipment": [
      {
        "index": "amulet",
        "name": "Amulet",
        "url": "/api/2014/equipment/amulet"
      },
      {
        "index": "emblem",
        "name": "Emblem",
        "url": "/api/2014/equipment/emblem"
      },
      {
        "index": "reliquary",
        "name": "Reliquary",
        "url": "/api/2014/equipment/reliquary"
      }
    ],
    "url": "/api/2014/equipment-categories/holy-symbols"
  },
  {
    "index": "wondrous-items",
    "name": "Wondrous Items",
    "equipment": [
      {
        "index": "amulet-of-health",
        "name": "Amulet of Health",
        "url": "/api/2014/magic-items/amulet-of-health"
      },
      {
        "index": "amulet-of-proof-against-detection-and-location",
        "name": "Amulet of Proof against Detection and Location",
        "url": "/api/2014/magic-items/amulet-of-proof-against-detection-and-location"
      },
      {
        "index": "amulet-of-the-planes",
        "name": "Amulet of the Planes",
        "url": "/api/2014/magic-items/amulet-of-the-planes"
      },
      {
        "index": "apparatus-of-the-crab",
        "name": "Apparatus of the Crab",
        "url": "/api/2014/magic-items/apparatus-of-the-crab"
      },
      {
        "index": "bag-of-beans",
        "name": "Bag of Beans",
        "url": "/api/2014/magic-items/bag-of-beans"
      },
      {
        "index": "bag-of-devouring",
        "name": "Bag of Devouring",
        "url": "/api/2014/magic-items/bag-of-devouring"
      },
      {
        "index": "bag-of-holding",
        "name": "Bag of Holding",
        "url": "/api/2014/magic-items/bag-of-holding"
      },
      {
        "index": "bag-of-tricks",
        "name": "Bag of Tricks",
        "url": "/api/2014/magic-items/bag-of-tricks"
      },
      {
        "index": "bead-of-force",
        "name": "Bead of Force",
        "url": "/api/2014/magic-items/bead-of-force"
      },
      {
        "index": "belt-of-dwarvenkind",
        "name": "Belt of Dwarvenkind",
        "url": "/api/2014/magic-items/belt-of-dwarvenkind"
      },
      {
        "index": "belt-of-giant-strength",
        "name": "Belt of Giant Strength",
        "url": "/api/2014/magic-items/belt-of-giant-strength"
      },
      {
        "index": "boots-of-elvenkind",
        "name": "Boots of Elvenkind",
        "url": "/api/2014/magic-items/boots-of-elvenkind"
      },
      {
        "index": "boots-of-levitation",
        "name": "Boots of Levitation",
        "url": "/api/2014/magic-items/boots-of-levitation"
      },
      {
        "index": "boots-of-speed",
        "name": "Boots of Speed",
        "url": "/api/2014/magic-items/boots-of-speed"
      },
      {
        "index": "boots-of-striding-and-springing",
        "name": "Boots of Striding and Springing",
        "url": "/api/2014/magic-items/boots-of-striding-and-springing"
      },
      {
        "index": "boots-of-the-winterlands",
        "name": "Boots of the Winterlands",
        "url": "/api/2014/magic-items/boots-of-the-winterlands"
      },
      {
        "index": "bowl-of-commanding-water-elementals",
        "name": "Bowl of Commanding Water Elementals",
        "url": "/api/2014/magic-items/bowl-of-commanding-water-elementals"
      },
      {
        "index": "bracers-of-archery",
        "name": "Bracers of Archery",
        "url": "/api/2014/magic-items/bracers-of-archery"
      },
      {
        "index": "bracers-of-defense",
        "name": "Bracers of Defense",
        "url": "/api/2014/magic-items/bracers-of-defense"
      },
      {
        "index": "brazier-of-commanding-fire-elementals",
        "name": "Brazier of Commanding Fire Elementals",
        "url": "/api/2014/magic-items/brazier-of-commanding-fire-elementals"
      },
      {
        "index": "brooch-of-shielding",
        "name": "Brooch of Shielding",
        "url": "/api/2014/magic-items/brooch-of-shielding"
      },
      {
        "index": "broom-of-flying",
        "name": "Broom of Flying",
        "url": "/api/2014/magic-items/broom-of-flying"
      },
      {
        "index": "candle-of-invocation",
        "name": "Candle of Invocation",
        "url": "/api/2014/magic-items/candle-of-invocation"
      },
      {
        "index": "cape-of-the-mountebank",
        "name": "Cape of the Mountebank",
        "url": "/api/2014/magic-items/cape-of-the-mountebank"
      },
      {
        "index": "carpet-of-flying",
        "name": "Carpet of Flying",
        "url": "/api/2014/magic-items/carpet-of-flying"
      },
      {
        "index": "censer-of-controlling-air-elementals",
        "name": "Censer of Controlling Air Elementals",
        "url": "/api/2014/magic-items/censer-of-controlling-air-elementals"
      },
      {
        "index": "chime-of-opening",
        "name": "Chime of Opening",
        "url": "/api/2014/magic-items/chime-of-opening"
      },
      {
        "index": "circlet-of-blasting",
        "name": "Circlet of Blasting",
        "url": "/api/2014/magic-items/circlet-of-blasting"
      },
      {
        "index": "cloak-of-arachnida",
        "name": "Cloak of Arachnida",
        "url": "/api/2014/magic-items/cloak-of-arachnida"
      },
      {
        "index": "cloak-of-displacement",
        "name": "Cloak of Displacement",
        "url": "/api/2014/magic-items/cloak-of-displacement"
      },
      {
        "index": "cloak-of-elvenkind",
        "name": "Cloak of Elvenkind",
        "url": "/api/2014/magic-items/cloak-of-elvenkind"
      },
      {
        "index": "cloak-of-protection",
        "name": "Cloak of Protection",
        "url": "/api/2014/magic-items/cloak-of-protection"
      },
      {
        "index": "cloak-of-the-bat",
        "name": "Cloak of the Bat",
        "url": "/api/2014/magic-items/cloak-of-the-bat"
      },
      {
        "index": "cloak-of-the-manta-ray",
        "name": "Cloak of the Manta Ray",
        "url": "/api/2014/magic-items/cloak-of-the-manta-ray"
      },
      {
        "index": "crystal-ball",
        "name": "Crystal Ball",
        "url": "/api/2014/magic-items/crystal-ball"
      },
      {
        "index": "cube-of-force",
        "name": "Cube of Force",
        "url": "/api/2014/magic-items/cube-of-force"
      },
      {
        "index": "cubic-gate",
        "name": "Cubic Gate",
        "url": "/api/2014/magic-items/cubic-gate"
      },
      {
        "index": "decanter-of-endless-water",
        "name": "Decanter of Endless Water",
        "url": "/api/2014/magic-items/decanter-of-endless-water"
      },
      {
        "index": "deck-of-illusions",
        "name": "Deck of Illusions",
        "url": "/api/2014/magic-items/deck-of-illusions"
      },
      {
        "index": "deck-of-many-things",
        "name": "Deck of Many Things",
        "url": "/api/2014/magic-items/deck-of-many-things"
      },
      {
        "index": "dimensional-shackles",
        "name": "Dimensional Shackles",
        "url": "/api/2014/magic-items/dimensional-shackles"
      },
      {
        "index": "dust-of-disappearance",
        "name": "Dust of Disappearance",
        "url": "/api/2014/magic-items/dust-of-disappearance"
      },
      {
        "index": "dust-of-dryness",
        "name": "Dust of Dryness",
        "url": "/api/2014/magic-items/dust-of-dryness"
      },
      {
        "index": "dust-of-sneezing-and-choking",
        "name": "Dust of Sneezing and Choking",
        "url": "/api/2014/magic-items/dust-of-sneezing-and-choking"
      },
      {
        "index": "efficient-quiver",
        "name": "Efficient Quiver",
        "url": "/api/2014/magic-items/efficient-quiver"
      },
      {
        "index": "efreeti-bottle",
        "name": "Efreeti Bottle",
        "url": "/api/2014/magic-items/efreeti-bottle"
      },
      {
        "index": "elemental-gem",
        "name": "Elemental Gem",
        "url": "/api/2014/magic-items/elemental-gem"
      },
      {
        "index": "eversmoking-bottle",
        "name": "Eversmoking Bottle",
        "url": "/api/2014/magic-items/eversmoking-bottle"
      },
      {
        "index": "eyes-of-charming",
        "name": "Eyes of Charming",
        "url": "/api/2014/magic-items/eyes-of-charming"
      },
      {
        "index": "eyes-of-minute-seeing",
        "name": "Eyes of Minute Seeing",
        "url": "/api/2014/magic-items/eyes-of-minute-seeing"
      },
      {
        "index": "eyes-of-the-eagle",
        "name": "Eyes of the Eagle",
        "url": "/api/2014/magic-items/eyes-of-the-eagle"
      },
      {
        "index": "feather-token",
        "name": "Feather Token",
        "url": "/api/2014/magic-items/feather-token"
      },
      {
        "index": "figurine-of-wondrous-power",
        "name": "Figurine of Wondrous Power",
        "url": "/api/2014/magic-items/figurine-of-wondrous-power"
      },
      {
        "index": "folding-boat",
        "name": "Folding Boat",
        "url": "/api/2014/magic-items/folding-boat"
      },
      {
        "index": "gauntlets-of-ogre-power",
        "name": "Gauntlets of Ogre Power",
        "url": "/api/2014/magic-items/gauntlets-of-ogre-power"
      },
      {
        "index": "gem-of-brightness",
        "name": "Gem of Brightness",
        "url": "/api/2014/magic-items/gem-of-brightness"
      },
      {
        "index": "gem-of-seeing",
        "name": "Gem of Seeing",
        "url": "/api/2014/magic-items/gem-of-seeing"
      },
      {
        "index": "gloves-of-missile-snaring",
        "name": "Gloves of Missile Snaring",
        "url": "/api/2014/magic-items/gloves-of-missile-snaring"
      },
      {
        "index": "gloves-of-swimming-and-climbing",
        "name": "Gloves of Swimming and Climbing",
        "url": "/api/2014/magic-items/gloves-of-swimming-and-climbing"
      },
      {
        "index": "goggles-of-night",
        "name": "Goggles of Night",
        "url": "/api/2014/magic-items/goggles-of-night"
      },
      {
        "index": "handy-haversack",
        "name": "Handy Haversack",
        "url": "/api/2014/magic-items/handy-haversack"
      },
      {
        "index": "hat-of-disguise",
        "name": "Hat of Disguise",
        "url": "/api/2014/magic-items/hat-of-disguise"
      },
      {
        "index": "headband-of-intellect",
        "name": "Headband of Intellect",
        "url": "/api/2014/magic-items/headband-of-intellect"
      },
      {
        "index": "helm-of-brilliance",
        "name": "Helm of Brilliance",
        "url": "/api/2014/magic-items/helm-of-brilliance"
      },
      {
        "index": "helm-of-comprehending-languages",
        "name": "Helm of Comprehending Languages",
        "url": "/api/2014/magic-items/helm-of-comprehending-languages"
      },
      {
        "index": "helm-of-telepathy",
        "name": "Helm of Telepathy",
        "url": "/api/2014/magic-items/helm-of-telepathy"
      },
      {
        "index": "helm-of-teleportation",
        "name": "Helm of Teleportation",
        "url": "/api/2014/magic-items/helm-of-teleportation"
      },
      {
        "index": "horn-of-blasting",
        "name": "Horn of Blasting",
        "url": "/api/2014/magic-items/horn-of-blasting"
      },
      {
        "index": "horn-of-valhalla",
        "name": "Horn of Valhalla",
        "url": "/api/2014/magic-items/horn-of-valhalla"
      },
      {
        "index": "horseshoes-of-a-zephyr",
        "name": "Horseshoes of a Zephyr",
        "url": "/api/2014/magic-items/horseshoes-of-a-zephyr"
      },
      {
        "index": "horseshoes-of-speed",
        "name": "Horseshoes of Speed",
        "url": "/api/2014/magic-items/horseshoes-of-speed"
      },
      {
        "index": "instant-fortress",
        "name": "Instant Fortress",
        "url": "/api/2014/magic-items/instant-fortress"
      },
      {
        "index": "ioun-stone",
        "name": "Ioun Stone",
        "url": "/api/2014/magic-items/ioun-stone"
      },
      {
        "index": "iron-bands-of-binding",
        "name": "Iron Bands of Binding",
        "url": "/api/2014/magic-items/iron-bands-of-binding"
      },
      {
        "index": "iron-flask",
        "name": "Iron Flask",
        "url": "/api/2014/magic-items/iron-flask"
      },
      {
        "index": "lantern-of-revealing",
        "name": "Lantern of Revealing",
        "url": "/api/2014/magic-items/lantern-of-revealing"
      },
      {
        "index": "mantle-of-spell-resistance",
        "name": "Mantle of Spell Resistance",
        "url": "/api/2014/magic-items/mantle-of-spell-resistance"
      },
      {
        "index": "manual-of-bodily-health",
        "name": "Manual of Bodily Health",
        "url": "/api/2014/magic-items/manual-of-bodily-health"
      },
      {
        "index": "manual-of-gainful-exercise",
        "name": "Manual of Gainful Exercise",
        "url": "/api/2014/magic-items/manual-of-gainful-exercise"
      },
      {
        "index": "manual-of-golems",
        "name": "Manual of Golems",
        "url": "/api/2014/magic-items/manual-of-golems"
      },
      {
        "index": "manual-of-quickness-of-action",
        "name": "Manual of Quickness of Action",
        "url": "/api/2014/magic-items/manual-of-quickness-of-action"
      },
      {
        "index": "marvelous-pigments",
        "name": "Marvelous Pigments",
        "url": "/api/2014/magic-items/marvelous-pigments"
      },
      {
        "index": "medallion-of-thoughts",
        "name": "Medallion of Thoughts",
        "url": "/api/2014/magic-items/medallion-of-thoughts"
      },
      {
        "index": "mirror-of-life-trapping",
        "name": "Mirror of Life Trapping",
        "url": "/api/2014/magic-items/mirror-of-life-trapping"
      },
      {
        "index": "necklace-of-adaptation",
        "name": "Necklace of Adaptation",
        "url": "/api/2014/magic-items/necklace-of-adaptation"
      },
      {
        "index": "necklace-of-fireballs",
        "name": "Necklace of Fireballs",
        "url": "/api/2014/magic-items/necklace-of-fireballs"
      },
      {
        "index": "necklace-of-prayer-beads",
        "name": "Necklace of Prayer Beads",
        "url": "/api/2014/magic-items/necklace-of-prayer-beads"
      },
      {
        "index": "pearl-of-power",
        "name": "Pearl of Power",
        "url": "/api/2014/magic-items/pearl-of-power"
      },
      {
        "index": "periapt-of-health",
        "name": "Periapt of Health",
        "url": "/api/2014/magic-items/periapt-of-health"
      },
      {
        "index": "periapt-of-proof-against-poison",
        "name": "Periapt of Proof against Poison",
        "url": "/api/2014/magic-items/periapt-of-proof-against-poison"
      },
      {
        "index": "periapt-of-wound-closure",
        "name": "Periapt of Wound Closure",
        "url": "/api/2014/magic-items/periapt-of-wound-closure"
      },
      {
        "index": "pipes-of-haunting",
        "name": "Pipes of Haunting",
        "url": "/api/2014/magic-items/pipes-of-haunting"
      },
      {
        "index": "pipes-of-the-sewers",
        "name": "Pipes of the Sewers",
        "url": "/api/2014/magic-items/pipes-of-the-sewers"
      },
      {
        "index": "portable-hole",
        "name": "Portable Hole",
        "url": "/api/2014/magic-items/portable-hole"
      },
      {
        "index": "restorative-ointment",
        "name": "Restorative Ointment",
        "url": "/api/2014/magic-items/restorative-ointment"
      },
      {
        "index": "robe-of-eyes",
        "name": "Robe of Eyes",
        "url": "/api/2014/magic-items/robe-of-eyes"
      },
      {
        "index": "robe-of-scintillating-colors",
        "name": "Robe of Scintillating Colors",
        "url": "/api/2014/magic-items/robe-of-scintillating-colors"
      },
      {
        "index": "robe-of-stars",
        "name": "Robe of Stars",
        "url": "/api/2014/magic-items/robe-of-stars"
      },
      {
        "index": "robe-of-the-archmagi",
        "name": "Robe of the Archmagi",
        "url": "/api/2014/magic-items/robe-of-the-archmagi"
      },
      {
        "index": "robe-of-useful-items",
        "name": "Robe of Useful Items",
        "url": "/api/2014/magic-items/robe-of-useful-items"
      },
      {
        "index": "rope-of-climbing",
        "name": "Rope of Climbing",
        "url": "/api/2014/magic-items/rope-of-climbing"
      },
      {
        "index": "rope-of-entanglement",
        "name": "Rope of Entanglement",
        "url": "/api/2014/magic-items/rope-of-entanglement"
      },
      {
        "index": "scarab-of-protection",
        "name": "Scarab of Protection",
        "url": "/api/2014/magic-items/scarab-of-protection"
      },
      {
        "index": "slippers-of-spider-climbing",
        "name": "Slippers of Spider Climbing",
        "url": "/api/2014/magic-items/slippers-of-spider-climbing"
      },
      {
        "index": "sovereign-glue",
        "name": "Sovereign Glue",
        "url": "/api/2014/magic-items/sovereign-glue"
      },
      {
        "index": "sphere-of-annihilation",
        "name": "Sphere of Annihilation",
        "url": "/api/2014/magic-items/sphere-of-annihilation"
      },
      {
        "index": "stone-of-controlling-earth-elementals",
        "name": "Stone of Controlling Earth Elementals",
        "url": "/api/2014/magic-items/stone-of-controlling-earth-elementals"
      },
      {
        "index": "stone-of-good-luck-luckstone",
        "name": "Stone of Good Luck (Luckstone)",
        "url": "/api/2014/magic-items/stone-of-good-luck-luckstone"
      },
      {
        "index": "talisman-of-pure-good",
        "name": "Talisman of Pure Good",
        "url": "/api/2014/magic-items/talisman-of-pure-good"
      },
      {
        "index": "talisman-of-the-sphere",
        "name": "Talisman of the Sphere",
        "url": "/api/2014/magic-items/talisman-of-the-sphere"
      },
      {
        "index": "talisman-of-ultimate-evil",
        "name": "Talisman of Ultimate Evil",
        "url": "/api/2014/magic-items/talisman-of-ultimate-evil"
      },
      {
        "index": "tome-of-clear-thought",
        "name": "Tome of Clear Thought",
        "url": "/api/2014/magic-items/tome-of-clear-thought"
      },
      {
        "index": "tome-of-leadership-and-influence",
        "name": "Tome of Leadership and Influence",
        "url": "/api/2014/magic-items/tome-of-leadership-and-influence"
      },
      {
        "index": "tome-of-understanding",
        "name": "Tome of Understanding",
        "url": "/api/2014/magic-items/tome-of-understanding"
      },
      {
        "index": "universal-solvent",
        "name": "Universal Solvent",
        "url": "/api/2014/magic-items/universal-solvent"
      },
      {
        "index": "well-of-many-worlds",
        "name": "Well of Many Worlds",
        "url": "/api/2014/magic-items/well-of-many-worlds"
      },
      {
        "index": "wind-fan",
        "name": "Wind Fan",
        "url": "/api/2014/magic-items/wind-fan"
      },
      {
        "index": "winged-boots",
        "name": "Winged Boots",
        "url": "/api/2014/magic-items/winged-boots"
      },
      {
        "index": "wings-of-flying",
        "name": "Wings of Flying",
        "url": "/api/2014/magic-items/wings-of-flying"
      },
      {
        "index": "orb-of-dragonkind",
        "name": "Orb of Dragonkind",
        "url": "/api/2014/magic-items/orb-of-dragonkind"
      },
      {
        "index": "bag-of-tricks-gray",
        "name": "Gray Bag of Tricks",
        "url": "/api/2014/magic-items/bag-of-tricks-gray"
      },
      {
        "index": "bag-of-tricks-rust",
        "name": "Rust Bag of Tricks",
        "url": "/api/2014/magic-items/bag-of-tricks-rust"
      },
      {
        "index": "bag-of-tricks-tan",
        "name": "Tan Bag of Tricks",
        "url": "/api/2014/magic-items/bag-of-tricks-tan"
      },
      {
        "index": "belt-of-giant-strength-hill",
        "name": "Belt of Hill Giant Strength",
        "url": "/api/2014/magic-items/belt-of-giant-strength-hill"
      },
      {
        "index": "belt-of-giant-strength-stone",
        "name": "Belt of Stone Giant Strength",
        "url": "/api/2014/magic-items/belt-of-giant-strength-stone"
      },
      {
        "index": "belt-of-giant-strength-frost",
        "name": "Belt of Frost Giant Strength",
        "url": "/api/2014/magic-items/belt-of-giant-strength-frost"
      },
      {
        "index": "belt-of-giant-strength-fire",
        "name": "Belt of Fire Giant Strength",
        "url": "/api/2014/magic-items/belt-of-giant-strength-fire"
      },
      {
        "index": "belt-of-giant-strength-cloud",
        "name": "Belt of Cloud Giant Strength",
        "url": "/api/2014/magic-items/belt-of-giant-strength-cloud"
      },
      {
        "index": "belt-of-giant-strength-storm",
        "name": "Belt of Storm Giant Strength",
        "url": "/api/2014/magic-items/belt-of-giant-strength-storm"
      },
      {
        "index": "carpet-of-flying-3x5",
        "name": "Carpet of Flying (3 ft. × 5 ft.)",
        "url": "/api/2014/magic-items/carpet-of-flying-3x5"
      },
      {
        "index": "carpet-of-flying-4x6",
        "name": "Carpet of Flying (4 ft. × 6 ft.)",
        "url": "/api/2014/magic-items/carpet-of-flying-4x6"
      },
      {
        "index": "carpet-of-flying-5x7",
        "name": "Carpet of Flying (5 ft. × 7 ft.)",
        "url": "/api/2014/magic-items/carpet-of-flying-5x7"
      },
      {
        "index": "carpet-of-flying-6x9",
        "name": "Carpet of Flying (6 ft. × 9 ft.)",
        "url": "/api/2014/magic-items/carpet-of-flying-6x9"
      },
      {
        "index": "crystal-ball-of-mind-reading",
        "name": "Crystal Ball of Mind Reading",
        "url": "/api/2014/magic-items/crystal-ball-of-mind-reading"
      },
      {
        "index": "crystal-ball-of-telepathy",
        "name": "Crystal Ball of Telepathy",
        "url": "/api/2014/magic-items/crystal-ball-of-telepathy"
      },
      {
        "index": "crystal-ball-of-true-seeing",
        "name": "Crystal Ball of True Seeing",
        "url": "/api/2014/magic-items/crystal-ball-of-true-seeing"
      },
      {
        "index": "elemental-gem-air",
        "name": "Air Elemental Gem",
        "url": "/api/2014/magic-items/elemental-gem-air"
      },
      {
        "index": "elemental-gem-earth",
        "name": "Earth Elemental Gem",
        "url": "/api/2014/magic-items/elemental-gem-earth"
      },
      {
        "index": "elemental-gem-fire",
        "name": "Fire Elemental Gem",
        "url": "/api/2014/magic-items/elemental-gem-fire"
      },
      {
        "index": "elemental-gem-water",
        "name": "Water Elemental Gem",
        "url": "/api/2014/magic-items/elemental-gem-water"
      },
      {
        "index": "feather-token-anchor",
        "name": "Anchor Feather Token",
        "url": "/api/2014/magic-items/feather-token-anchor"
      },
      {
        "index": "feather-token-bird",
        "name": "Bird Feather Token",
        "url": "/api/2014/magic-items/feather-token-bird"
      },
      {
        "index": "feather-token-fan",
        "name": "Fan Feather Token",
        "url": "/api/2014/magic-items/feather-token-fan"
      },
      {
        "index": "feather-token-swan-boat",
        "name": "Swan Boat Feather Token",
        "url": "/api/2014/magic-items/feather-token-swan-boat"
      },
      {
        "index": "feather-token-tree",
        "name": "Tree Feather Token",
        "url": "/api/2014/magic-items/feather-token-tree"
      },
      {
        "index": "feather-token-whip",
        "name": "Whip Feather Token",
        "url": "/api/2014/magic-items/feather-token-whip"
      },
      {
        "index": "figurine-of-wondrous-power-bronze-griffon",
        "name": "Bronze Griffon Figurine of Wondrous Power",
        "url": "/api/2014/magic-items/figurine-of-wondrous-power-bronze-griffon"
      },
      {
        "index": "figurine-of-wondrous-power-ebony-fly",
        "name": "Ebony Fly Figurine of Wondrous Power",
        "url": "/api/2014/magic-items/figurine-of-wondrous-power-ebony-fly"
      },
      {
        "index": "figurine-of-wondrous-power-golden-lions",
        "name": "Golden Lions Figurine of Wondrous Power",
        "url": "/api/2014/magic-items/figurine-of-wondrous-power-golden-lions"
      },
      {
        "index": "figurine-of-wondrous-power-ivory-goats",
        "name": "Ivory Goats Figurine of Wondrous Power",
        "url": "/api/2014/magic-items/figurine-of-wondrous-power-ivory-goats"
      },
      {
        "index": "figurine-of-wondrous-power-marble-elephant",
        "name": "Marble Elephant Figurine of Wondrous Power",
        "url": "/api/2014/magic-items/figurine-of-wondrous-power-marble-elephant"
      },
      {
        "index": "figurine-of-wondrous-power-obsidian-steed",
        "name": "Obsidian Steed Figurine of Wondrous Power",
        "url": "/api/2014/magic-items/figurine-of-wondrous-power-obsidian-steed"
      },
      {
        "index": "figurine-of-wondrous-power-onyx-dog",
        "name": "Onyx Dog Figurine of Wondrous Power",
        "url": "/api/2014/magic-items/figurine-of-wondrous-power-onyx-dog"
      },
      {
        "index": "figurine-of-wondrous-power-serpentine-owl",
        "name": "Serpentine Owl Figurine of Wondrous Power",
        "url": "/api/2014/magic-items/figurine-of-wondrous-power-serpentine-owl"
      },
      {
        "index": "figurine-of-wondrous-power-silver-raven",
        "name": "Silver Raven Figurine of Wondrous Power",
        "url": "/api/2014/magic-items/figurine-of-wondrous-power-silver-raven"
      },
      {
        "index": "horn-of-valhalla-silver",
        "name": "Silver Horn of Valhalla",
        "url": "/api/2014/magic-items/horn-of-valhalla-silver"
      },
      {
        "index": "horn-of-valhalla-brass",
        "name": "Brass Horn of Valhalla",
        "url": "/api/2014/magic-items/horn-of-valhalla-brass"
      },
      {
        "index": "horn-of-valhalla-bronze",
        "name": "Bronze Horn of Valhalla",
        "url": "/api/2014/magic-items/horn-of-valhalla-bronze"
      },
      {
        "index": "horn-of-valhalla-iron",
        "name": "Iron Horn of Valhalla",
        "url": "/api/2014/magic-items/horn-of-valhalla-iron"
      },
      {
        "index": "ioun-stone-of-absorption",
        "name": "Ioun Stone of Absorption",
        "url": "/api/2014/magic-items/ioun-stone-of-absorption"
      },
      {
        "index": "ioun-stone-of-agility",
        "name": "Ioun Stone of Agility",
        "url": "/api/2014/magic-items/ioun-stone-of-agility"
      },
      {
        "index": "ioun-stone-of-awareness",
        "name": "Ioun Stone of Awareness",
        "url": "/api/2014/magic-items/ioun-stone-of-awareness"
      },
      {
        "index": "ioun-stone-of-fortitude",
        "name": "Ioun Stone of Fortitude",
        "url": "/api/2014/magic-items/ioun-stone-of-fortitude"
      },
      {
        "index": "ioun-stone-of-greater-absorption",
        "name": "Ioun Stone of Greater Absorption",
        "url": "/api/2014/magic-items/ioun-stone-of-greater-absorption"
      },
      {
        "index": "ioun-stone-of-insight",
        "name": "Ioun Stone of Insight",
        "url": "/api/2014/magic-items/ioun-stone-of-insight"
      },
      {
        "index": "ioun-stone-of-intellect",
        "name": "Ioun Stone of Intellect",
        "url": "/api/2014/magic-items/ioun-stone-of-intellect"
      },
      {
        "index": "ioun-stone-of-leadership",
        "name": "Ioun Stone of Leadership",
        "url": "/api/2014/magic-items/ioun-stone-of-leadership"
      },
      {
        "index": "ioun-stone-of-mastery",
        "name": "Ioun Stone of Mastery",
        "url": "/api/2014/magic-items/ioun-stone-of-mastery"
      },
      {
        "index": "ioun-stone-of-protection",
        "name": "Ioun Stone of Protection",
        "url": "/api/2014/magic-items/ioun-stone-of-protection"
      },
      {
        "index": "ioun-stone-of-regeneration",
        "name": "Ioun Stone of Regeneration",
        "url": "/api/2014/magic-items/ioun-stone-of-regeneration"
      },
      {
        "index": "ioun-stone-of-reserve",
        "name": "Ioun Stone of Reserve",
        "url": "/api/2014/magic-items/ioun-stone-of-reserve"
      },
      {
        "index": "ioun-stone-of-strength",
        "name": "Ioun Stone of Strength",
        "url": "/api/2014/magic-items/ioun-stone-of-strength"
      },
      {
        "index": "ioun-stone-of-sustenance",
        "name": "Ioun Stone of Sustenance",
        "url": "/api/2014/magic-items/ioun-stone-of-sustenance"
      },
      {
        "index": "manual-of-golems-clay",
        "name": "Manual of Clay Golems",
        "url": "/api/2014/magic-items/manual-of-golems-clay"
      },
      {
        "index": "manual-of-golems-flesh",
        "name": "Manual of Flesh Golems",
        "url": "/api/2014/magic-items/manual-of-golems-flesh"
      },
      {
        "index": "manual-of-golems-iron",
        "name": "Manual of Iron Golems",
        "url": "/api/2014/magic-items/manual-of-golems-iron"
      },
      {
        "index": "manual-of-golems-stone",
        "name": "Manual of Stone Golems",
        "url": "/api/2014/magic-items/manual-of-golems-stone"
      }
    ],
    "url": "/api/2014/equipment-categories/wondrous-items"
  },
  {
    "index": "rod",
    "name": "Rod",
    "equipment": [
      {
        "index": "immovable-rod",
        "name": "Immovable Rod",
        "url": "/api/2014/magic-items/immovable-rod"
      },
      {
        "index": "rod-of-absorption",
        "name": "Rod of Absorption",
        "url": "/api/2014/magic-items/rod-of-absorption"
      },
      {
        "index": "rod-of-alertness",
        "name": "Rod of Alertness",
        "url": "/api/2014/magic-items/rod-of-alertness"
      },
      {
        "index": "rod-of-lordly-might",
        "name": "Rod of Lordly Might",
        "url": "/api/2014/magic-items/rod-of-lordly-might"
      },
      {
        "index": "rod-of-rulership",
        "name": "Rod of Rulership",
        "url": "/api/2014/magic-items/rod-of-rulership"
      },
      {
        "index": "rod-of-security",
        "name": "Rod of Security",
        "url": "/api/2014/magic-items/rod-of-security"
      }
    ],
    "url": "/api/2014/equipment-categories/rod"
  },
  {
    "index": "potion",
    "name": "Potion",
    "equipment": [
      {
        "index": "oil-of-etherealness",
        "name": "Oil of Etherealness",
        "url": "/api/2014/magic-items/oil-of-etherealness"
      },
      {
        "index": "oil-of-sharpness",
        "name": "Oil of Sharpness",
        "url": "/api/2014/magic-items/oil-of-sharpness"
      },
      {
        "index": "oil-of-slipperiness",
        "name": "Oil of Slipperiness",
        "url": "/api/2014/magic-items/oil-of-slipperiness"
      },
      {
        "index": "philter-of-love",
        "name": "Philter of Love",
        "url": "/api/2014/magic-items/philter-of-love"
      },
      {
        "index": "potion-of-animal-friendship",
        "name": "Potion of Animal Friendship",
        "url": "/api/2014/magic-items/potion-of-animal-friendship"
      },
      {
        "index": "potion-of-clairvoyance",
        "name": "Potion of Clairvoyance",
        "url": "/api/2014/magic-items/potion-of-clairvoyance"
      },
      {
        "index": "potion-of-climbing",
        "name": "Potion of Climbing",
        "url": "/api/2014/magic-items/potion-of-climbing"
      },
      {
        "index": "potion-of-diminution",
        "name": "Potion of Diminution",
        "url": "/api/2014/magic-items/potion-of-diminution"
      },
      {
        "index": "potion-of-flying",
        "name": "Potion of Flying",
        "url": "/api/2014/magic-items/potion-of-flying"
      },
      {
        "index": "potion-of-gaseous-form",
        "name": "Potion of Gaseous Form",
        "url": "/api/2014/magic-items/potion-of-gaseous-form"
      },
      {
        "index": "potion-of-giant-strength",
        "name": "Potion of Giant Strength",
        "url": "/api/2014/magic-items/potion-of-giant-strength"
      },
      {
        "index": "potion-of-growth",
        "name": "Potion of Growth",
        "url": "/api/2014/magic-items/potion-of-growth"
      },
      {
        "index": "potion-of-healing",
        "name": "Potion of Healing",
        "url": "/api/2014/magic-items/potion-of-healing"
      },
      {
        "index": "potion-of-heroism",
        "name": "Potion of Heroism",
        "url": "/api/2014/magic-items/potion-of-heroism"
      },
      {
        "index": "potion-of-invisibility",
        "name": "Potion of Invisibility",
        "url": "/api/2014/magic-items/potion-of-invisibility"
      },
      {
        "index": "potion-of-mind-reading",
        "name": "Potion of Mind Reading",
        "url": "/api/2014/magic-items/potion-of-mind-reading"
      },
      {
        "index": "potion-of-poison",
        "name": "Potion of Poison",
        "url": "/api/2014/magic-items/potion-of-poison"
      },
      {
        "index": "potion-of-resistance",
        "name": "Potion of Resistance",
        "url": "/api/2014/magic-items/potion-of-resistance"
      },
      {
        "index": "potion-of-speed",
        "name": "Potion of Speed",
        "url": "/api/2014/magic-items/potion-of-speed"
      },
      {
        "index": "potion-of-water-breathing",
        "name": "Potion of Water Breathing",
        "url": "/api/2014/magic-items/potion-of-water-breathing"
      },
      {
        "index": "potion-of-giant-strength-hill",
        "name": "Potion of Hill Giant Strength",
        "url": "/api/2014/magic-items/potion-of-giant-strength-hill"
      },
      {
        "index": "potion-of-giant-strength-frost",
        "name": "Potion of Frost Giant Strength",
        "url": "/api/2014/magic-items/potion-of-giant-strength-frost"
      },
      {
        "index": "potion-of-giant-strength-stone",
        "name": "Potion of Stone Giant Strength",
        "url": "/api/2014/magic-items/potion-of-giant-strength-stone"
      },
      {
        "index": "potion-of-giant-strength-fire",
        "name": "Potion of Fire Giant Strength",
        "url": "/api/2014/magic-items/potion-of-giant-strength-fire"
      },
      {
        "index": "potion-of-giant-strength-cloud",
        "name": "Potion of Cloud Giant Strength",
        "url": "/api/2014/magic-items/potion-of-giant-strength-cloud"
      },
      {
        "index": "potion-of-giant-strength-storm",
        "name": "Potion of Storm Giant Strength",
        "url": "/api/2014/magic-items/potion-of-giant-strength-storm"
      },
      {
        "index": "potion-of-healing-common",
        "name": "Potion of Healing",
        "url": "/api/2014/magic-items/potion-of-healing-common"
      },
      {
        "index": "potion-of-healing-greater",
        "name": "Potion of Greater Healing",
        "url": "/api/2014/magic-items/potion-of-healing-greater"
      },
      {
        "index": "potion-of-healing-superior",
        "name": "Potion of Superior Healing",
        "url": "/api/2014/magic-items/potion-of-healing-superior"
      },
      {
        "index": "potion-of-healing-supreme",
        "name": "Potion of Supreme Healing",
        "url": "/api/2014/magic-items/potion-of-healing-supreme"
      },
      {
        "index": "potion-of-resistance-acid",
        "name": "Potion of Acid Resistance",
        "url": "/api/2014/magic-items/potion-of-resistance-acid"
      },
      {
        "index": "potion-of-resistance-cold",
        "name": "Potion of Cold Resistance",
        "url": "/api/2014/magic-items/potion-of-resistance-cold"
      },
      {
        "index": "potion-of-resistance-fire",
        "name": "Potion of Fire Resistance",
        "url": "/api/2014/magic-items/potion-of-resistance-fire"
      },
      {
        "index": "potion-of-resistance-force",
        "name": "Potion of Force Resistance",
        "url": "/api/2014/magic-items/potion-of-resistance-force"
      },
      {
        "index": "potion-of-resistance-lightning",
        "name": "Potion of Lightning Resistance",
        "url": "/api/2014/magic-items/potion-of-resistance-lightning"
      },
      {
        "index": "potion-of-resistance-necrotic",
        "name": "Potion of Necrotic Resistance",
        "url": "/api/2014/magic-items/potion-of-resistance-necrotic"
      },
      {
        "index": "potion-of-resistance-poison",
        "name": "Potion of Poison Resistance",
        "url": "/api/2014/magic-items/potion-of-resistance-poison"
      },
      {
        "index": "potion-of-resistance-psychic",
        "name": "Potion of Psychic Resistance",
        "url": "/api/2014/magic-items/potion-of-resistance-psychic"
      },
      {
        "index": "potion-of-resistance-radiant",
        "name": "Potion of Radiant Resistance",
        "url": "/api/2014/magic-items/potion-of-resistance-radiant"
      },
      {
        "index": "potion-of-resistance-thunder",
        "name": "Potion of Thunder Resistance",
        "url": "/api/2014/magic-items/potion-of-resistance-thunder"
      }
    ],
    "url": "/api/2014/equipment-categories/potion"
  },
  {
    "index": "ring",
    "name": "Ring",
    "equipment": [
      {
        "index": "ring-of-animal-influence",
        "name": "Ring of Animal Influence",
        "url": "/api/2014/magic-items/ring-of-animal-influence"
      },
      {
        "index": "ring-of-djinni-summoning",
        "name": "Ring of Djinni Summoning",
        "url": "/api/2014/magic-items/ring-of-djinni-summoning"
      },
      {
        "index": "ring-of-elemental-command",
        "name": "Ring of Elemental Command",
        "url": "/api/2014/magic-items/ring-of-elemental-command"
      },
      {
        "index": "ring-of-evasion",
        "name": "Ring of Evasion",
        "url": "/api/2014/magic-items/ring-of-evasion"
      },
      {
        "index": "ring-of-feather-falling",
        "name": "Ring of Feather Falling",
        "url": "/api/2014/magic-items/ring-of-feather-falling"
      },
      {
        "index": "ring-of-free-action",
        "name": "Ring of Free Action",
        "url": "/api/2014/magic-items/ring-of-free-action"
      },
      {
        "index": "ring-of-invisibility",
        "name": "Ring of Invisibility",
        "url": "/api/2014/magic-items/ring-of-invisibility"
      },
      {
        "index": "ring-of-jumping",
        "name": "Ring of Jumping",
        "url": "/api/2014/magic-items/ring-of-jumping"
      },
      {
        "index": "ring-of-mind-shielding",
        "name": "Ring of Mind Shielding",
        "url": "/api/2014/magic-items/ring-of-mind-shielding"
      },
      {
        "index": "ring-of-protection",
        "name": "Ring of Protection",
        "url": "/api/2014/magic-items/ring-of-protection"
      },
      {
        "index": "ring-of-regeneration",
        "name": "Ring of Regeneration",
        "url": "/api/2014/magic-items/ring-of-regeneration"
      },
      {
        "index": "ring-of-resistance",
        "name": "Ring of Resistance",
        "url": "/api/2014/magic-items/ring-of-resistance"
      },
      {
        "index": "ring-of-shooting-stars",
        "name": "Ring of Shooting Stars",
        "url": "/api/2014/magic-items/ring-of-shooting-stars"
      },
      {
        "index": "ring-of-spell-storing",
        "name": "Ring of Spell Storing",
        "url": "/api/2014/magic-items/ring-of-spell-storing"
      },
      {
        "index": "ring-of-spell-turning",
        "name": "Ring of Spell Turning",
        "url": "/api/2014/magic-items/ring-of-spell-turning"
      },
      {
        "index": "ring-of-swimming",
        "name": "Ring of Swimming",
        "url": "/api/2014/magic-items/ring-of-swimming"
      },
      {
        "index": "ring-of-telekinesis",
        "name": "Ring of Telekinesis",
        "url": "/api/2014/magic-items/ring-of-telekinesis"
      },
      {
        "index": "ring-of-the-ram",
        "name": "Ring of the Ram",
        "url": "/api/2014/magic-items/ring-of-the-ram"
      },
      {
        "index": "ring-of-three-wishes",
        "name": "Ring of Three Wishes",
        "url": "/api/2014/magic-items/ring-of-three-wishes"
      },
      {
        "index": "ring-of-warmth",
        "name": "Ring of Warmth",
        "url": "/api/2014/magic-items/ring-of-warmth"
      },
      {
        "index": "ring-of-water-walking",
        "name": "Ring of Water Walking",
        "url": "/api/2014/magic-items/ring-of-water-walking"
      },
      {
        "index": "ring-of-x-ray-vision",
        "name": "Ring of X-ray Vision",
        "url": "/api/2014/magic-items/ring-of-x-ray-vision"
      },
      {
        "index": "ring-of-elemental-command-air",
        "name": "Ring of Air Elemental Command",
        "url": "/api/2014/magic-items/ring-of-elemental-command-air"
      },
      {
        "index": "ring-of-elemental-command-earth",
        "name": "Ring of Earth Elemental Command",
        "url": "/api/2014/magic-items/ring-of-elemental-command-earth"
      },
      {
        "index": "ring-of-elemental-command-fire",
        "name": "Ring of Fire Elemental Command",
        "url": "/api/2014/magic-items/ring-of-elemental-command-fire"
      },
      {
        "index": "ring-of-elemental-command-water",
        "name": "Ring of Water Elemental Command",
        "url": "/api/2014/magic-items/ring-of-elemental-command-water"
      },
      {
        "index": "ring-of-resistance-acid",
        "name": "Ring of Acid Resistance",
        "url": "/api/2014/magic-items/ring-of-resistance-acid"
      },
      {
        "index": "ring-of-resistance-cold",
        "name": "Ring of Cold Resistance",
        "url": "/api/2014/magic-items/ring-of-resistance-cold"
      },
      {
        "index": "ring-of-resistance-fire",
        "name": "Ring of Fire Resistance",
        "url": "/api/2014/magic-items/ring-of-resistance-fire"
      },
      {
        "index": "ring-of-resistance-force",
        "name": "Ring of Force Resistance",
        "url": "/api/2014/magic-items/ring-of-resistance-force"
      },
      {
        "index": "ring-of-resistance-lightning",
        "name": "Ring of Lightning Resistance",
        "url": "/api/2014/magic-items/ring-of-resistance-lightning"
      },
      {
        "index": "ring-of-resistance-necrotic",
        "name": "Ring of Necrotic Resistance",
        "url": "/api/2014/magic-items/ring-of-resistance-necrotic"
      },
      {
        "index": "ring-of-resistance-poison",
        "name": "Ring of Poison Resistance",
        "url": "/api/2014/magic-items/ring-of-resistance-poison"
      },
      {
        "index": "ring-of-resistance-psychic",
        "name": "Ring of Psychic Resistance",
        "url": "/api/2014/magic-items/ring-of-resistance-psychic"
      },
      {
        "index": "ring-of-resistance-radiant",
        "name": "Ring of Radiant Resistance",
        "url": "/api/2014/magic-items/ring-of-resistance-radiant"
      },
      {
        "index": "ring-of-resistance-thunder",
        "name": "Ring of Thunder Resistance",
        "url": "/api/2014/magic-items/ring-of-resistance-thunder"
      }
    ],
    "url": "/api/2014/equipment-categories/ring"
  },
  {
    "index": "scroll",
    "name": "Scroll",
    "equipment": [
      {
        "index": "spell-scroll",
        "name": "Spell Scroll",
        "url": "/api/2014/magic-items/spell-scroll"
      },
      {
        "index": "spell-scroll-cantrip",
        "name": "Spell Scroll (Cantrip)",
        "url": "/api/2014/magic-items/spell-scroll-cantrip"
      },
      {
        "index": "spell-scroll-1st",
        "name": "Spell Scroll (1st)",
        "url": "/api/2014/magic-items/spell-scroll-1st"
      },
      {
        "index": "spell-scroll-2nd",
        "name": "Spell Scroll (2nd)",
        "url": "/api/2014/magic-items/spell-scroll-2nd"
      },
      {
        "index": "spell-scroll-3rd",
        "name": "Spell Scroll (3rd)",
        "url": "/api/2014/magic-items/spell-scroll-3rd"
      },
      {
        "index": "spell-scroll-4th",
        "name": "Spell Scroll (4th)",
        "url": "/api/2014/magic-items/spell-scroll-4th"
      },
      {
        "index": "spell-scroll-5th",
        "name": "Spell Scroll (5th)",
        "url": "/api/2014/magic-items/spell-scroll-5th"
      },
      {
        "index": "spell-scroll-6th",
        "name": "Spell Scroll (6th)",
        "url": "/api/2014/magic-items/spell-scroll-6th"
      },
      {
        "index": "spell-scroll-7th",
        "name": "Spell Scroll (7th)",
        "url": "/api/2014/magic-items/spell-scroll-7th"
      },
      {
        "index": "spell-scroll-8th",
        "name": "Spell Scroll (8th)",
        "url": "/api/2014/magic-items/spell-scroll-8th"
      },
      {
        "index": "spell-scroll-9th",
        "name": "Spell Scroll (9th)",
        "url": "/api/2014/magic-items/spell-scroll-9th"
      }
    ],
    "url": "/api/2014/equipment-categories/scroll"
  },
  {
    "index": "staff",
    "name": "Staff",
    "equipment": [
      {
        "index": "staff-of-charming",
        "name": "Staff of Charming",
        "url": "/api/2014/magic-items/staff-of-charming"
      },
      {
        "index": "staff-of-fire",
        "name": "Staff of Fire",
        "url": "/api/2014/magic-items/staff-of-fire"
      },
      {
        "index": "staff-of-frost",
        "name": "Staff of Frost",
        "url": "/api/2014/magic-items/staff-of-frost"
      },
      {
        "index": "staff-of-healing",
        "name": "Staff of Healing",
        "url": "/api/2014/magic-items/staff-of-healing"
      },
      {
        "index": "staff-of-power",
        "name": "Staff of Power",
        "url": "/api/2014/magic-items/staff-of-power"
      },
      {
        "index": "staff-of-striking",
        "name": "Staff of Striking",
        "url": "/api/2014/magic-items/staff-of-striking"
      },
      {
        "index": "staff-of-swarming-insects",
        "name": "Staff of Swarming Insects",
        "url": "/api/2014/magic-items/staff-of-swarming-insects"
      },
      {
        "index": "staff-of-the-magi",
        "name": "Staff of the Magi",
        "url": "/api/2014/magic-items/staff-of-the-magi"
      },
      {
        "index": "staff-of-the-python",
        "name": "Staff of the Python",
        "url": "/api/2014/magic-items/staff-of-the-python"
      },
      {
        "index": "staff-of-the-woodlands",
        "name": "Staff of the Woodlands",
        "url": "/api/2014/magic-items/staff-of-the-woodlands"
      },
      {
        "index": "staff-of-thunder-and-lightning",
        "name": "Staff of Thunder and Lightning",
        "url": "/api/2014/magic-items/staff-of-thunder-and-lightning"
      },
      {
        "index": "staff-of-withering",
        "name": "Staff of Withering",
        "url": "/api/2014/magic-items/staff-of-withering"
      }
    ],
    "url": "/api/2014/equipment-categories/staff"
  },
  {
    "index": "wand",
    "name": "Wand",
    "equipment": [
      {
        "index": "wand-of-binding",
        "name": "Wand of Binding",
        "url": "/api/2014/magic-items/wand-of-binding"
      },
      {
        "index": "wand-of-enemy-detection",
        "name": "Wand of Enemy Detection",
        "url": "/api/2014/magic-items/wand-of-enemy-detection"
      },
      {
        "index": "wand-of-fear",
        "name": "Wand of Fear",
        "url": "/api/2014/magic-items/wand-of-fear"
      },
      {
        "index": "wand-of-fireballs",
        "name": "Wand of Fireballs",
        "url": "/api/2014/magic-items/wand-of-fireballs"
      },
      {
        "index": "wand-of-lightning-bolts",
        "name": "Wand of Lightning Bolts",
        "url": "/api/2014/magic-items/wand-of-lightning-bolts"
      },
      {
        "index": "wand-of-magic-detection",
        "name": "Wand of Magic Detection",
        "url": "/api/2014/magic-items/wand-of-magic-detection"
      },
      {
        "index": "wand-of-magic-missiles",
        "name": "Wand of Magic Missiles",
        "url": "/api/2014/magic-items/wand-of-magic-missiles"
      },
      {
        "index": "wand-of-paralysis",
        "name": "Wand of Paralysis",
        "url": "/api/2014/magic-items/wand-of-paralysis"
      },
      {
        "index": "wand-of-polymorph",
        "name": "Wand of Polymorph",
        "url": "/api/2014/magic-items/wand-of-polymorph"
      },
      {
        "index": "wand-of-secrets",
        "name": "Wand of Secrets",
        "url": "/api/2014/magic-items/wand-of-secrets"
      },
      {
        "index": "wand-of-the-war-mage",
        "name": "Wand of the War Mage, +1, +2, or +3",
        "url": "/api/2014/magic-items/wand-of-the-war-mage"
      },
      {
        "index": "wand-of-web",
        "name": "Wand of Web",
        "url": "/api/2014/magic-items/wand-of-web"
      },
      {
        "index": "wand-of-wonder",
        "name": "Wand of Wonder",
        "url": "/api/2014/magic-items/wand-of-wonder"
      },
      {
        "index": "wand-of-the-war-mage-1",
        "name": "Wand of the War Mage, +1",
        "url": "/api/2014/magic-items/wand-of-the-war-mage-1"
      },
      {
        "index": "wand-of-the-war-mage-2",
        "name": "Wand of the War Mage, +2",
        "url": "/api/2014/magic-items/wand-of-the-war-mage-2"
      },
      {
        "index": "wand-of-the-war-mage-3",
        "name": "Wand of the War Mage, +3",
        "url": "/api/2014/magic-items/wand-of-the-war-mage-3"
      }
    ],
    "url": "/api/2014/equipment-categories/wand"
  }
]`) as ReadonlyArray<SourceRow>;

export const WEAPON_PROPERTY_RAW = JSON.parse(String.raw`[
  {
    "index": "ammunition",
    "name": "Ammunition",
    "desc": [
      "You can use a weapon that has the ammunition property to make a ranged attack only if you have ammunition to fire from the weapon. Each time you attack with the weapon, you expend one piece of ammunition. Drawing the ammunition from a quiver, case, or other container is part of the attack (you need a free hand to load a one-handed weapon).",
      "At the end of the battle, you can recover half your expended ammunition by taking a minute to search the battlefield. If you use a weapon that has the ammunition property to make a melee attack, you treat the weapon as an improvised weapon (see \"Improvised Weapons\" later in the section). A sling must be loaded to deal any damage when used in this way."
    ],
    "url": "/api/2014/weapon-properties/ammunition"
  },
  {
    "index": "finesse",
    "name": "Finesse",
    "desc": [
      "When making an attack with a finesse weapon, you use your choice of your Strength or Dexterity modifier for the attack and damage rolls. You must use the same modifier for both rolls."
    ],
    "url": "/api/2014/weapon-properties/finesse"
  },
  {
    "index": "heavy",
    "name": "Heavy",
    "desc": [
      "Small creatures have disadvantage on attack rolls with heavy weapons. A heavy weapon's size and bulk make it too large for a Small creature to use effectively."
    ],
    "url": "/api/2014/weapon-properties/heavy"
  },
  {
    "index": "light",
    "name": "Light",
    "desc": [
      "A light weapon is small and easy to handle, making it ideal for use when fighting with two weapons."
    ],
    "url": "/api/2014/weapon-properties/light"
  },
  {
    "index": "loading",
    "name": "Loading",
    "desc": [
      "Because of the time required to load this weapon, you can fire only one piece of ammunition from it when you use an action, bonus action, or reaction to fire it, regardless of the number of attacks you can normally make."
    ],
    "url": "/api/2014/weapon-properties/loading"
  },
  {
    "index": "reach",
    "name": "Reach",
    "desc": [
      "This weapon adds 5 feet to your reach when you attack with it, as well as when determining your reach for opportunity attacks with it."
    ],
    "url": "/api/2014/weapon-properties/reach"
  },
  {
    "index": "special",
    "name": "Special",
    "desc": [
      "A weapon with the special property has unusual rules governing its use, explained in the weapon's description (see \"Special Weapons\" later in this section)."
    ],
    "url": "/api/2014/weapon-properties/special"
  },
  {
    "index": "thrown",
    "name": "Thrown",
    "desc": [
      "If a weapon has the thrown property, you can throw the weapon to make a ranged attack. If the weapon is a melee weapon, you use the same ability modifier for that attack roll and damage roll that you would use for a melee attack with the weapon. For example, if you throw a handaxe, you use your Strength, but if you throw a dagger, you can use either your Strength or your Dexterity, since the dagger has the finesse property."
    ],
    "url": "/api/2014/weapon-properties/thrown"
  },
  {
    "index": "two-handed",
    "name": "Two-Handed",
    "desc": [
      "This weapon requires two hands when you attack with it."
    ],
    "url": "/api/2014/weapon-properties/two-handed"
  },
  {
    "index": "versatile",
    "name": "Versatile",
    "desc": [
      "This weapon can be used with one or two hands. A damage value in parentheses appears with the property--the damage when the weapon is used with two hands to make a melee attack."
    ],
    "url": "/api/2014/weapon-properties/versatile"
  },
  {
    "index": "monk",
    "name": "Monk",
    "desc": [
      "Monks gain several benefits while unarmed or wielding only monk weapons while they aren't wearing armor or wielding shields."
    ],
    "url": "/api/2014/weapon-properties/monk"
  }
]`) as ReadonlyArray<SourceRow>;

export const DAMAGE_TYPE_RAW = JSON.parse(String.raw`[
  {
    "index": "acid",
    "name": "Acid",
    "desc": [
      "The corrosive spray of a black dragon's breath and the dissolving enzymes secreted by a black pudding deal acid damage."
    ],
    "url": "/api/2014/damage-types/acid"
  },
  {
    "index": "bludgeoning",
    "name": "Bludgeoning",
    "desc": [
      "Blunt force attacks, falling, constriction, and the like deal bludgeoning damage."
    ],
    "url": "/api/2014/damage-types/bludgeoning"
  },
  {
    "index": "cold",
    "name": "Cold",
    "desc": [
      "The infernal chill radiating from an ice devil's spear and the frigid blast of a white dragon's breath deal cold damage."
    ],
    "url": "/api/2014/damage-types/cold"
  },
  {
    "index": "fire",
    "name": "Fire",
    "desc": [
      "Red dragons breathe fire, and many spells conjure flames to deal fire damage."
    ],
    "url": "/api/2014/damage-types/fire"
  },
  {
    "index": "force",
    "name": "Force",
    "desc": [
      "Force is pure magical energy focused into a damaging form. Most effects that deal force damage are spells, including magic missile and spiritual weapon."
    ],
    "url": "/api/2014/damage-types/force"
  },
  {
    "index": "lightning",
    "name": "Lightning",
    "desc": [
      "A lightning bolt spell and a blue dragon's breath deal lightning damage."
    ],
    "url": "/api/2014/damage-types/lightning"
  },
  {
    "index": "necrotic",
    "name": "Necrotic",
    "desc": [
      "Necrotic damage, dealt by certain undead and a spell such as chill touch, withers matter and even the soul."
    ],
    "url": "/api/2014/damage-types/necrotic"
  },
  {
    "index": "piercing",
    "name": "Piercing",
    "desc": [
      "Puncturing and impaling attacks, including spears and monsters' bites, deal piercing damage."
    ],
    "url": "/api/2014/damage-types/piercing"
  },
  {
    "index": "poison",
    "name": "Poison",
    "desc": [
      "Venomous stings and the toxic gas of a green dragon's breath deal poison damage."
    ],
    "url": "/api/2014/damage-types/poison"
  },
  {
    "index": "psychic",
    "name": "Psychic",
    "desc": [
      "Mental abilities such as a psionic blast deal psychic damage."
    ],
    "url": "/api/2014/damage-types/psychic"
  },
  {
    "index": "radiant",
    "name": "Radiant",
    "desc": [
      "Radiant damage, dealt by a cleric's flame strike spell or an angel's smiting weapon, sears the flesh like fire and overloads the spirit with power."
    ],
    "url": "/api/2014/damage-types/radiant"
  },
  {
    "index": "slashing",
    "name": "Slashing",
    "desc": [
      "Swords, axes, and monsters' claws deal slashing damage."
    ],
    "url": "/api/2014/damage-types/slashing"
  },
  {
    "index": "thunder",
    "name": "Thunder",
    "desc": [
      "A concussive burst of sound, such as the effect of the thunderwave spell, deals thunder damage."
    ],
    "url": "/api/2014/damage-types/thunder"
  }
]`) as ReadonlyArray<SourceRow>;
