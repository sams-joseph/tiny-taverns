import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import { ABILITY_KEYS, CampaignId } from "@taverns/api";
import { Schema } from "effect";
import { vi } from "vitest";
import { type HostedSession } from "../auth/hostedSession";

/**
 * The campaign view's test wire: fixtures, a stub server, and one way in.
 *
 * **The bodies here are the JSON the server actually sends, not the decoded
 * classes.** Everything passes through `packages/api`'s schemas on the way in,
 * so a field the contract renames fails the test rather than rendering
 * `undefined` — which is the property these files exist for, and the reason a
 * fixture may not be a `Partial<>` of anything.
 *
 * Shared between the read tests and the authoring tests so that a field added
 * to a shape upstream is one edit, not two. Add new ones here.
 */

export const campaignId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
export const sessionId = "2b1f2a1e-0000-4000-8000-000000000501";
export const encounterId = "2b1f2a1e-0000-4000-8000-000000000601";
export const sketchId = "2b1f2a1e-0000-4000-8000-000000000602";
export const prepItemId = "2b1f2a1e-0000-4000-8000-000000000701";
export const noteId = "2b1f2a1e-0000-4000-8000-000000000801";
export const goblinId = "2b1f2a1e-0000-4000-8000-000000000a01";
export const hagId = "2b1f2a1e-0000-4000-8000-000000000a02";
export const rosterRowId = "2b1f2a1e-0000-4000-8000-000000000b01";
/**
 * The DM's own account.
 *
 * Declared up here with the rest of the ids rather than beside `dmMember`,
 * because the Library fixtures below name it and a `const` is not hoisted.
 * `dmAccountId` is exported from its old place and is this value.
 */
const theDmAccountId = "2b1f2a1e-0000-4000-8000-0000000000a1";
export const druidOptionId = "2b1f2a1e-0000-4000-8000-000000000e01";
export const elfOptionId = "2b1f2a1e-0000-4000-8000-000000000e02";
export const bloodswornOptionId = "2b1f2a1e-0000-4000-8000-000000000e03";
export const marshfolkOptionId = "2b1f2a1e-0000-4000-8000-000000000e04";
export const bloodswornOriginalId = "2b1f2a1e-0000-4000-8000-000000000e05";
export const marshfolkOriginalId = "2b1f2a1e-0000-4000-8000-000000000e06";
export const saltRunnerOptionId = "2b1f2a1e-0000-4000-8000-000000000e07";
export const saltRunnerOriginalId = "2b1f2a1e-0000-4000-8000-000000000e08";
export const abilityStrengthId = "2b1f2a1e-0000-4000-8000-000000000f21";
export const abilityConstitutionId = "2b1f2a1e-0000-4000-8000-000000000f22";
export const commonLanguageId = "2b1f2a1e-0000-4000-8000-000000000f31";
export const dwarvishLanguageId = "2b1f2a1e-0000-4000-8000-000000000f32";
export const athleticsSkillId = "2b1f2a1e-0000-4000-8000-000000000f41";
export const athleticsProficiencyId = "2b1f2a1e-0000-4000-8000-000000000f51";
export const darkvisionTraitId = "2b1f2a1e-0000-4000-8000-000000000f61";
export const runId = "2b1f2a1e-0000-4000-8000-000000000c01";
export const combatantId = "2b1f2a1e-0000-4000-8000-000000000d01";
export const goblinCombatantId = "2b1f2a1e-0000-4000-8000-000000000d02";
export const spellId = "2b1f2a1e-0000-4000-8000-000000000f01";
export const equipmentId = "2b1f2a1e-0000-4000-8000-000000001001";
export const magicItemId = "2b1f2a1e-0000-4000-8000-000000001101";
export const ruleArticleId = "2b1f2a1e-0000-4000-8000-000000001201";
export const ruleSectionId = "2b1f2a1e-0000-4000-8000-000000001202";
export const grapplerFeatId = "2b1f2a1e-0000-4000-8000-000000001301";
export const grapplerOriginalFeatId = "2b1f2a1e-0000-4000-8000-000000001302";
export const tavernBrawlerFeatId = "2b1f2a1e-0000-4000-8000-000000001303";
export const tavernBrawlerOriginalFeatId = "2b1f2a1e-0000-4000-8000-000000001304";

/**
 * A list endpoint's body: one page, and no more.
 *
 * Every paged list answers `{ items, nextCursor }` — see `packages/api`'s
 * `Page.ts`. A test that wants a second page re-aims the route at
 * `page(rows, cursor)` and answers the follow-up separately; `nextCursor: null`
 * is what "this is the whole list" looks like on the wire, and it is what almost
 * every fixture here means.
 */
export const page = (
  items: ReadonlyArray<unknown>,
  nextCursor: unknown = null,
): { readonly items: ReadonlyArray<unknown>; readonly nextCursor: unknown } => ({
  items,
  nextCursor,
});

const stamps = { createdAt: "2026-08-04T13:03:28.070Z", updatedAt: "2026-08-04T13:03:28.070Z" };
const provenance = { origin: "authored", assistantTurnId: null };

/** The group the fixture campaign lives in — one per shared server. */
export const groupId = "5a1e2b3c-0000-4000-8000-00000000aaa1";

export const group = {
  id: groupId,
  name: "The Salt Company",
  ownerAccountId: theDmAccountId,
  archivedAt: null,
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-01T10:00:00.000Z",
};

export const campaign = {
  id: campaignId,
  groupId,
  creatorAccountId: theDmAccountId,
  name: "The Salt Road",
  partyName: "The Gilded Spoon",
  playerCount: 4,
  currentSessionId: sessionId,
  visibility: "dm",
  archivedAt: null,
  ...provenance,
  ...stamps,
};

/**
 * The same campaign, shelved — what `DELETE /campaigns/:c` answers and what
 * `GET /me/campaigns/archived` lists.
 *
 * `archivedAt` is the *only* field that differs, which is the whole of the
 * server-side decision: archiving stamps one column and touches nothing else,
 * so `currentSessionId` still names the open night. A fixture that also cleared
 * the pointer would quietly assert a behaviour the product deliberately does
 * not have.
 */
export const archivedCampaign = {
  ...campaign,
  archivedAt: "2026-08-11T09:00:00.000Z",
};

export const session = {
  id: sessionId,
  campaignId,
  number: 12,
  title: null,
  startedAt: null,
  endedAt: null,
  // "On the table now" — a pointer at the live `encounter_run`, null until the
  // DM starts a fight. Required on the wire, so a fixture that omits it fails
  // decoding rather than rendering nothing, which is the property this file
  // exists for. No screen reads it yet; the runner will.
  activeEncounterRunId: null,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

export const encounter = {
  id: encounterId,
  campaignId,
  name: "Ambush in the reeds",
  difficulty: "Medium",
  tags: ["Marsh", "Night"],
  // `sum(encounter_creature.count)`, computed by the server per read — the
  // prototype's "6 creatures" (`data.js:10`). Required on the wire, so a
  // fixture that omits it fails decoding rather than rendering `undefined`.
  creatureCount: 6,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

export const sketch = {
  ...encounter,
  id: sketchId,
  name: "Whatever is in the crate",
  difficulty: null,
  tags: ["Boss"],
  creatureCount: 1,
};

export const readAloud = {
  id: noteId,
  campaignId,
  title: "Read aloud at the water",
  body: "The reeds are taller than you are and they are not moving, even though there is a wind.",
  kind: "read_aloud",
  attachedTo: { kind: "encounter", id: encounterId },
  visibility: "dm",
  ...provenance,
  ...stamps,
};

/** Who owns Brannoc — the player, whose account the seat below names too. */
export const ilseAccountId = "2b1f2a1e-0000-4000-8000-0000000000a2";

export const character = {
  id: "2b1f2a1e-0000-4000-8000-000000000901",
  // Account-owned and campaign-scoped nowhere — the continuity decision's wire
  // shape. The campaign's claim on Brannoc is the seat below, and who at a
  // table may see them is the *seat's* visibility, so neither `campaignId`
  // nor `visibility` exists here to fixture.
  accountId: ilseAccountId,
  name: "Brannoc",
  playerName: "Ilse",
  level: 3,
  race: "Half-orc",
  subrace: null,
  className: "Paladin",
  // Derived by a generated column from the three above, never sent by a client
  // — so it is here as the server would send it and in neither payload.
  descriptor: "Level 3 Half-orc Paladin",
  ac: 18,
  hpMax: 52,
  // The live half (`0014`). A character carries where they are now, and null is
  // "nobody has said" rather than full or nothing — which is why this fixture
  // has a number and the row below it does not.
  hpCurrent: 44,
  tempHp: 0,
  conditions: [],
  sheetUrl: null,
  sheet: { notes: "Owes the ferryman a name.", abilities: [], traits: [] },
  // The optimistic-concurrency counter every write bumps.
  version: 1,
  ...provenance,
  ...stamps,
};

/** Brannoc's seat at this table — `campaign_character`, the campaign's half. */
export const seatId = "2b1f2a1e-0000-4000-8000-000000000951";

export const characterSeat = {
  id: seatId,
  campaignId,
  characterId: character.id,
  accountId: ilseAccountId,
  // Snapshotted at join time, so it survives a rename and the character's
  // deletion — the roster line is campaign history.
  displayName: "Brannoc",
  playerDisplayName: null,
  visibility: "dm",
  ...provenance,
  joinedAt: stamps.createdAt,
  ...stamps,
};

/** What `party.list` answers: the seat, and the shared character it holds. */
export const partySeat = { seat: characterSeat, character };

export const prepItem = {
  id: prepItemId,
  sessionId,
  label: "Reread the reeds ambush",
  done: false,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

const emptyStatBlock = { meta: "", ac: "", hp: "", speed: "", cr: "", abilities: [], traits: [] };

/**
 * The document half, as `data.js:23-33` writes it — the parenthetical in
 * `"17 (chain shirt, shield)"` being the whole reason it is not derived from
 * the `ac` column beside it.
 */
const goblinStatBlock = {
  meta: "Small humanoid (goblinoid), neutral evil",
  ac: "17 (chain shirt, shield)",
  hp: "21 (6d6)",
  speed: "30 ft.",
  cr: "1 (200 XP)",
  abilities: [
    { label: "STR", score: "10", modifier: "+0" },
    { label: "DEX", score: "14", modifier: "+2" },
  ],
  traits: [
    {
      name: "Nimble Escape",
      text: "The boss takes the Disengage or Hide action as a bonus action on each of its turns.",
    },
    {
      name: "Scimitar",
      text: "Melee weapon attack: +4 to hit, reach 5 ft., one target.",
      dice: "1d6+2",
    },
  ],
};

/**
 * A bundled `system` row: **owned by nobody**, which is what makes it global.
 *
 * Both ownership columns null. A Library entity is `campaignId: null` with an
 * `accountId`, and a campaign's own creature is the other way round — the three
 * positions are told apart by these two fields and never by `origin`.
 */
export const goblin = {
  id: goblinId,
  campaignId: null,
  accountId: null,
  derivedFrom: null,
  name: "Goblin Boss",
  size: "Small",
  type: "Humanoid",
  cr: "1",
  crSort: 1,
  ac: 17,
  hp: 21,
  environments: ["Marsh"],
  legendary: false,
  statBlock: goblinStatBlock,
  visibility: "dm",
  origin: "system",
  assistantTurnId: null,
  ...stamps,
};

/** No document at all — the honest "nothing written yet" case. */
export const hag = {
  ...goblin,
  statBlock: emptyStatBlock,
  id: hagId,
  name: "Marsh Hag",
  cr: "5",
  crSort: 5,
  ac: 17,
  hp: 82,
};

export const hempRope = {
  id: equipmentId,
  campaignId: null,
  accountId: null,
  derivedFrom: null,
  name: "Rope, hempen (50 feet)",
  sourceKey: "rope-hempen-50-feet",
  categoryIndex: "adventuring-gear",
  categoryName: "Adventuring Gear",
  costQuantity: 1,
  costUnit: "gp",
  costGp: 1,
  weight: 10,
  gearCategoryIndex: "standard-gear",
  gearCategoryName: "Standard Gear",
  armorCategory: null,
  weaponCategory: null,
  weaponRange: null,
  categoryRange: null,
  toolCategory: null,
  vehicleCategory: null,
  armorClassBase: null,
  armorClassDexBonus: null,
  armorClassMaxBonus: null,
  strengthMinimum: null,
  stealthDisadvantage: null,
  damageDice: null,
  damageTypeIndex: null,
  damageTypeName: null,
  twoHandedDamageDice: null,
  rangeNormal: null,
  rangeLong: null,
  throwRangeNormal: null,
  throwRangeLong: null,
  propertyIndexes: [],
  propertyNames: [],
  equipment: {
    equipmentCategory: {
      index: "adventuring-gear",
      name: "Adventuring Gear",
    },
    cost: { quantity: 1, unit: "gp" },
    weight: 10,
    gearCategory: {
      index: "standard-gear",
      name: "Standard Gear",
    },
    desc: ["A rope has 2 hit points and can be burst with a DC 17 Strength check."],
  },
  visibility: "shared",
  origin: "system",
  assistantTurnId: null,
  ...stamps,
};

export const lanternRing = {
  id: magicItemId,
  campaignId: null,
  accountId: null,
  derivedFrom: null,
  name: "Ring of Water Walking",
  categoryIndex: "ring",
  categoryName: "Ring",
  rarityIndex: "uncommon",
  rarityName: "Uncommon",
  raritySort: 20,
  requiresAttunement: false,
  attunementRequirement: null,
  isVariant: false,
  variantCount: 0,
  baseItemId: null,
  baseItemName: null,
  variantIds: [],
  variantNames: [],
  image: null,
  magicItem: {
    item: { index: "ring-of-water-walking", name: "Ring of Water Walking" },
    equipmentCategory: { index: "ring", name: "Ring" },
    rarity: { index: "uncommon", name: "Uncommon" },
    desc: ["While wearing this ring, you can stand on and move across any liquid surface."],
    requiresAttunement: false,
    variant: false,
    variants: [],
  },
  visibility: "shared",
  origin: "system",
  assistantTurnId: null,
  ...stamps,
};

export const fireball = {
  id: spellId,
  campaignId: null,
  accountId: null,
  derivedFrom: null,
  name: "Fireball",
  level: 3,
  schoolIndex: "evocation",
  schoolName: "Evocation",
  ritual: false,
  concentration: false,
  castingTime: "1 action",
  range: "150 feet",
  duration: "Instantaneous",
  classIndexes: ["sorcerer", "wizard"],
  classNames: ["Sorcerer", "Wizard"],
  subclassIndexes: [],
  subclassNames: [],
  spell: {
    desc: ["A bright streak flashes from your pointing finger."],
    components: ["V", "S", "M"],
    material: "A tiny ball of bat guano and sulfur.",
    school: { index: "evocation", name: "Evocation" },
    classes: [
      { index: "sorcerer", name: "Sorcerer" },
      { index: "wizard", name: "Wizard" },
    ],
    subclasses: [],
  },
  visibility: "shared",
  origin: "system",
  assistantTurnId: null,
  ...stamps,
};

/**
 * The rules vocabulary — the classes and race a character at this table is
 * built from.
 *
 * **Three positions, told apart by the two ownership columns and never by
 * `origin`**, exactly as a creature is: the bundle is owned by nobody, a
 * Library original has an `accountId`, and a campaign's copy has a
 * `campaignId`. Only the last of the three is a row this table's DM may edit,
 * and only the last of the three can be unshared.
 */
const bundledOption = {
  campaignId: null,
  accountId: null,
  derivedFrom: null,
  // Written `shared` by the seeder, deliberately and unlike the bundled
  // bestiary: a class vocabulary no player can read is not a vocabulary, and
  // the create form's pickers are a player's screen. See `ruleset/import.ts`.
  visibility: "shared",
  origin: "system",
  assistantTurnId: null,
  ...stamps,
};

/**
 * The bundled starter options, as the seeder writes them.
 *
 * Generated from a compact table rather than written out as repeated object
 * literals — the *values* are still exactly the JSON the server sends, which is
 * what this file's rule is about, and hand-copied blocks would be many chances
 * to paste the wrong hit die under the right name.
 *
 * They are here because **every campaign has them**: the bundle is unowned, so
 * `corpusRowReadable` returns it through whatever campaign is in the path. A
 * fixture with only the copies would make a picker with two entries in it,
 * which is not a state the product has.
 */
const bundled = (
  kind: "class" | "race" | "background",
  index: number,
  name: string,
  body: Record<string, unknown>,
) => ({
  ...bundledOption,
  // Twelve hex digits in the last group, like every other id in this file: a
  // short one decodes as *not a UUID* and the screen renders the schema's own
  // complaint instead of a picker.
  id: `2b1f2a1e-0000-4000-8000-${kind === "class" ? "f" : kind === "race" ? "e" : "d"}00000000${String(index).padStart(3, "0")}`,
  kind,
  name,
  body,
});

/** A bundled `equipment` row's weapon columns, as `details.equipment` carries them. */
export const longswordRow = {
  id: "2b1f2a1e-0000-4000-8000-0000000e0001",
  index: "longsword",
  name: "Longsword",
  weaponCategory: "Martial",
  weaponRange: "Melee",
  categoryRange: "Martial Melee",
  armorCategory: null,
  damageDice: "1d8",
  damageType: "Slashing",
  twoHandedDamageDice: "1d10",
  rangeNormal: 5,
  rangeLong: null,
  throwRangeNormal: null,
  throwRangeLong: null,
  properties: ["Versatile"],
  weight: 3,
  gearCategoryIndex: null,
  toolCategory: null,
};
const shieldRow = {
  ...longswordRow,
  id: "2b1f2a1e-0000-4000-8000-0000000e0003",
  index: "shield",
  name: "Shield",
  weaponCategory: null,
  weaponRange: null,
  categoryRange: null,
  armorCategory: "Shield",
  damageDice: null,
  damageType: null,
  twoHandedDamageDice: null,
  rangeNormal: null,
  properties: [],
  weight: 6,
};

/**
 * The one bundled class with its kit and its table written out, the way the
 * importer and `optionDetailsFor` really send them — cut to one choice and one
 * level, which is all the create form's kit picker needs to be driven.
 */
function fighterWithKit<A extends { readonly body: Record<string, unknown> }>(row: A) {
  return {
    ...row,
    body: {
      ...row.body,
      proficiencies: ["All armor", "Shields", "Simple Weapons", "Martial Weapons"],
      savingThrows: ["STR", "CON"],
      startingKit: {
        fixed: [],
        choices: [
          {
            desc: "(a) a martial weapon and a shield or (b) two martial weapons",
            options: [
              {
                label: "Any martial weapon, Shield",
                lines: [
                  {
                    name: "Any martial weapon",
                    quantity: 1,
                    category: { index: "martial-weapons", name: "Martial Weapons" },
                  },
                  { name: "Shield", quantity: 1, equipmentId: shieldRow.id },
                ],
              },
              {
                label: "2 × Any martial weapon",
                lines: [
                  {
                    name: "Any martial weapon",
                    quantity: 2,
                    category: { index: "martial-weapons", name: "Martial Weapons" },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    details: {
      subraces: [],
      abilityBonuses: [],
      languages: [],
      proficiencies: [],
      traits: [],
      choices: [],
      levelOneFeatures: [
        {
          id: "2b1f2a1e-0000-4000-8000-0000000f0010",
          index: "second-wind",
          name: "Second Wind",
          desc: ["You have a limited well of stamina."],
        },
      ],
      proficiencyBonus: 2,
      equipment: [longswordRow, shieldRow],
      classLevels: [
        {
          level: 1,
          proficiencyBonus: 2,
          features: [
            {
              id: "2b1f2a1e-0000-4000-8000-0000000f0010",
              index: "second-wind",
              name: "Second Wind",
            },
          ],
        },
      ],
    },
  };
}

const bundledClasses = (
  [
    ["Barbarian", 12, ["DEX", "CON"]],
    ["Bard", 8, ["DEX"]],
    ["Cleric", 8, ["DEX"]],
    ["Druid", 8, ["DEX"]],
    ["Fighter", 10, ["DEX"]],
    ["Monk", 8, ["DEX", "WIS"]],
    ["Paladin", 10, ["DEX"]],
    ["Ranger", 10, ["DEX"]],
    ["Rogue", 8, ["DEX"]],
    ["Sorcerer", 6, ["DEX"]],
    ["Warlock", 8, ["DEX"]],
    ["Wizard", 6, ["DEX"]],
  ] as ReadonlyArray<readonly [string, number, ReadonlyArray<string>]>
).map(([name, hitDie, unarmouredAc], index) =>
  name === "Fighter"
    ? fighterWithKit(bundled("class", index, name, { hitDie, unarmouredAc }))
    : bundled("class", index, name, { hitDie, unarmouredAc }),
);

const raceBody = (
  abilityBonuses: ReadonlyArray<{ readonly ability: string; readonly amount: number }>,
  extra: Record<string, unknown> = {},
) => ({
  speed: 30,
  size: "Medium",
  abilityBonuses,
  hpPerLevel: 0,
  traits: [],
  subraces: [],
  ...extra,
});

const bundledRace = (
  [
    [
      "Dragonborn",
      raceBody([
        { ability: "STR", amount: 2 },
        { ability: "CHA", amount: 1 },
      ]),
    ],
    [
      "Dwarf",
      raceBody([{ ability: "CON", amount: 2 }], {
        speed: 25,
        subraces: [
          {
            name: "Hill Dwarf",
            abilityBonuses: [{ ability: "WIS", amount: 1 }],
            hpPerLevel: 1,
            traits: ["Dwarven Toughness"],
          },
        ],
      }),
    ],
    [
      "Elf",
      raceBody([{ ability: "DEX", amount: 2 }], {
        subraces: [
          {
            name: "High Elf",
            abilityBonuses: [{ ability: "INT", amount: 1 }],
            traits: ["High Elf Cantrip"],
          },
        ],
      }),
    ],
    [
      "Gnome",
      raceBody([{ ability: "INT", amount: 2 }], {
        speed: 25,
        subraces: [
          {
            name: "Rock Gnome",
            abilityBonuses: [{ ability: "CON", amount: 1 }],
            traits: ["Artificer's Lore"],
          },
        ],
      }),
    ],
    [
      "Half-Elf",
      raceBody([{ ability: "CHA", amount: 2 }], {
        abilityBonusChoice: {
          choose: 2,
          bonuses: [
            { ability: "STR", amount: 1 },
            { ability: "DEX", amount: 1 },
            { ability: "CON", amount: 1 },
            { ability: "INT", amount: 1 },
            { ability: "WIS", amount: 1 },
          ],
        },
      }),
    ],
    [
      "Half-Orc",
      raceBody([
        { ability: "STR", amount: 2 },
        { ability: "CON", amount: 1 },
      ]),
    ],
    [
      "Halfling",
      raceBody([{ ability: "DEX", amount: 2 }], {
        speed: 25,
        subraces: [
          {
            name: "Lightfoot Halfling",
            abilityBonuses: [{ ability: "CHA", amount: 1 }],
            traits: ["Naturally Stealthy"],
          },
        ],
      }),
    ],
    ["Human", raceBody(ABILITY_KEYS.map((ability) => ({ ability, amount: 1 })))],
    [
      "Tiefling",
      raceBody([
        { ability: "INT", amount: 1 },
        { ability: "CHA", amount: 2 },
      ]),
    ],
  ] as ReadonlyArray<readonly [string, Record<string, unknown>]>
).map(([name, body], index) => bundled("race", index, name, body));

/** Three bundled `equipment` rows the Acolyte's kit names and offers. */
export const clothesRow = {
  ...shieldRow,
  id: "2b1f2a1e-0000-4000-8000-0000000e0011",
  index: "clothes-common",
  name: "Clothes, common",
  armorCategory: null,
  weight: 3,
  gearCategoryIndex: "standard-gear",
};
export const pouchRow = {
  ...clothesRow,
  id: "2b1f2a1e-0000-4000-8000-0000000e0012",
  index: "pouch",
  name: "Pouch",
  weight: 1,
};
export const amuletRow = {
  ...clothesRow,
  id: "2b1f2a1e-0000-4000-8000-0000000e0013",
  index: "amulet",
  name: "Amulet",
  weight: 1,
  gearCategoryIndex: "holy-symbols",
};

const bundledBackgrounds = ["Acolyte", "Sage", "Soldier", "Wayfarer"].map((name, index) => {
  const row = bundled("background", index, name, {
    proficiencies: [],
    languages: [],
    equipment: [],
    choices: [],
  });
  if (name !== "Acolyte") return row;
  /**
   * The one bundled background with its kit written out the way the importer
   * sends it since 2026-09-08: the prose list beside the structured kit, two
   * counted lines naming their rows and the holy-symbol category the player
   * picks from, with the rows on `details.equipment` as `optionDetailsFor`
   * hydrates them.
   */
  return {
    ...row,
    body: {
      ...row.body,
      equipment: ["1 × Clothes, common", "1 × Pouch", "Choose 1 equipment"],
      gold: "15 gp",
      startingKit: {
        fixed: [
          { name: "Clothes, common", quantity: 1, equipmentId: clothesRow.id },
          { name: "Pouch", quantity: 1, equipmentId: pouchRow.id },
        ],
        choices: [
          {
            desc: "",
            options: [
              {
                label: "Any holy symbol",
                lines: [
                  {
                    name: "Any holy symbol",
                    quantity: 1,
                    category: { index: "holy-symbols", name: "Holy Symbols" },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    details: {
      subraces: [],
      abilityBonuses: [],
      languages: [],
      proficiencies: [],
      traits: [],
      choices: [],
      equipment: [clothesRow, pouchRow, amuletRow],
    },
  };
});

/** Named for the tests that reach for one by hand. */
export const druidOption = { ...bundledClasses[3]!, id: druidOptionId };
export const elfOption = { ...bundledRace[2]!, id: elfOptionId };

/**
 * *Bloodsworn, d10, unarmoured AC DEX + CON* — the DM's own original, reaching
 * this table's vocabulary through the group share (the instancing decision of
 * 2026-09-02: a table's homebrew offering is shared originals, never campaign
 * copies).
 */
export const bloodswornOption = {
  ...bundledOption,
  id: bloodswornOptionId,
  accountId: ilseAccountId,
  origin: "authored",
  kind: "class",
  name: "Bloodsworn",
  body: { hitDie: 10, unarmouredAc: ["DEX", "CON"], summary: "Sworn to the marsh." },
};

/** A second shared original, a race. */
export const marshfolkOption = {
  ...bloodswornOption,
  id: marshfolkOptionId,
  kind: "race",
  name: "Marshfolk",
  body: raceBody([{ ability: "CON", amount: 2 }], {
    hpPerLevel: 2,
    summary: "Born in the reeds.",
  }),
};

export const saltRunnerOption = {
  ...bundledOption,
  id: saltRunnerOptionId,
  accountId: ilseAccountId,
  origin: "authored",
  kind: "background",
  name: "Salt-runner",
  body: {
    proficiencies: ["Athletics"],
    languages: ["River cant"],
    equipment: ["Travel-stained clothes", "ferryman's token"],
    gold: "15 gp",
    feature: { name: "Riverwise", text: "You know who watches the crossings." },
    choices: [],
    summary: "Raised on the barges, and still counting the tide.",
  },
};

/**
 * What this table offers: the bundle, plus what has been copied in.
 *
 * In the order the server sends — kind, then name — because both readers draw
 * the three kinds separately and `readOrder` is what decides which is which.
 * `background` sorts first, which is what `character_option.kind asc` does.
 */
const named = <A extends { readonly name: string }>(rows: ReadonlyArray<A>): ReadonlyArray<A> =>
  [...rows].sort((a, b) => a.name.localeCompare(b.name));

export const campaignOptions = [
  ...named([...bundledBackgrounds, saltRunnerOption]),
  ...named([...bundledClasses, bloodswornOption]),
  ...named([...bundledRace, marshfolkOption]),
];

/**
 * The DM's Library — the bundle, plus the **originals** the two copies above
 * were made from.
 *
 * Deliberately a superset with different ids: a copy is a separate row, so the
 * original is still here after it has been brought in. That is the model rather
 * than a fixture convenience, and it is what makes *Copy from your library*
 * able to offer something already on the table.
 */
export const libraryOptions = [
  { ...saltRunnerOption, id: saltRunnerOriginalId, campaignId: null, accountId: theDmAccountId },
  ...bundledBackgrounds,
  { ...bloodswornOption, id: bloodswornOriginalId, campaignId: null, accountId: theDmAccountId },
  ...bundledClasses,
  { ...marshfolkOption, id: marshfolkOriginalId, campaignId: null, accountId: theDmAccountId },
  ...bundledRace,
];

const ruleAbility = (id: string, index: string, name: string, fullName: string) => ({
  id,
  index,
  name,
  fullName,
  desc: [],
});

const strengthAbility = ruleAbility(abilityStrengthId, "str", "STR", "Strength");
const constitutionAbility = ruleAbility(abilityConstitutionId, "con", "CON", "Constitution");

export const optionVocabulary = {
  abilities: [constitutionAbility, strengthAbility],
  languages: [
    {
      id: commonLanguageId,
      index: "common",
      name: "Common",
      type: "Standard",
      script: "Common",
      typicalSpeakers: ["Humans"],
    },
    {
      id: dwarvishLanguageId,
      index: "dwarvish",
      name: "Dwarvish",
      type: "Standard",
      script: "Dwarvish",
      typicalSpeakers: ["Dwarves"],
    },
  ],
  skills: [
    {
      id: athleticsSkillId,
      index: "athletics",
      name: "Athletics",
      abilityScoreId: abilityStrengthId,
      ability: ruleAbility(abilityStrengthId, "str", "STR", "Strength"),
      desc: [],
    },
  ],
  proficiencies: [
    {
      id: athleticsProficiencyId,
      index: "skill-athletics",
      name: "Athletics",
      type: "Skills",
      referenceFamily: "skills",
      referenceKey: "athletics",
      skillId: athleticsSkillId,
      abilityScoreId: null,
    },
  ],
  traits: [
    {
      id: darkvisionTraitId,
      index: "darkvision",
      name: "Darkvision",
      parentTraitId: null,
      desc: ["Accustomed to twilight and caverns."],
    },
  ],
};

/**
 * A fight on the table: the run, and the two combatants it seeded.
 *
 * Shared with the runner's own tests for the reason this file exists — a field
 * renamed upstream is one edit here rather than one per test file — and the
 * bodies are the JSON the server sends, so a rename fails decoding rather than
 * rendering `undefined`.
 */
export const liveRun = {
  id: runId,
  sessionId,
  encounterId,
  encounterName: "Ambush in the reeds",
  round: 1,
  activeCombatantId: combatantId,
  startedAt: "2026-08-04T19:00:00.000Z",
  endedAt: null,
  // A live fight has no reason yet, and `resolved` is what the column says
  // until one of the two endings writes it. A test that wants a fight waiting
  // for the next night sets `endedAt` *and* `endedReason: "carried"` — the
  // database refuses the second without the first.
  endedReason: "resolved",
  allowHobDirectWrites: false,
  continuedFrom: null,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

/** A party member, seeded from `character`. */
export const brannoc = {
  id: combatantId,
  encounterRunId: runId,
  characterId: character.id,
  creatureId: null,
  displayName: "Brannoc",
  subtitle: "Half-orc paladin",
  playerName: "Ilse",
  initiative: 21,
  hpCurrent: 44,
  hpMax: 52,
  ac: 18,
  kind: "pc",
  conditions: [],
  visibility: "dm",
  ...provenance,
  ...stamps,
};

/** A monster, seeded from the roster — so it has a stat block to show. */
export const goblinBoss = {
  ...brannoc,
  id: goblinCombatantId,
  characterId: null,
  creatureId: goblinId,
  displayName: "Goblin Boss",
  subtitle: "Small humanoid",
  playerName: null,
  initiative: 19,
  hpCurrent: 21,
  hpMax: 21,
  ac: 17,
  kind: "npc",
  conditions: ["Hostile"],
};

/**
 * A roster line: this creature, this many times. `name` is the server's join
 * against the creature row — the roster is drawn from its own rows since the
 * instancing decision of 2026-09-02, because a line may point at an internal
 * campaign instance no corpus list returns.
 */
export const rosterRow = {
  id: rosterRowId,
  encounterId,
  creatureId: goblinId,
  name: "Goblin Boss",
  count: 6,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

export interface Answer {
  readonly status: number;
  readonly body?: unknown;
  /**
   * A pre-framed `text/event-stream` body, for the one endpoint that streams.
   *
   * `hob.ask` is the only route any of these fixtures answers with a stream, and
   * a JSON body cannot stand in for one: the derived client decodes SSE frames,
   * so a stubbed answer has to carry real `event:`/`data:` framing. When it is
   * set, `body` is ignored.
   */
  readonly sse?: string;
}

export interface Call {
  readonly method: string;
  readonly pathname: string;
  readonly search: string;
  readonly authorization?: string;
  readonly body: string;
}

/**
 * The DM's own account, and the membership `Campaigns.create` writes for it in
 * the transaction that makes the campaign.
 *
 * Here rather than in `party/party.fixtures.tsx` because it is not the party
 * screen's any more: **the sixth delivery folded the campaign screen's Party tab
 * into the Party screen**, so writing a character is a thing that happens there
 * and the shared server has to be able to draw it. One definition, imported by
 * the party's own fixtures — the rule this file exists for.
 */
export const dmAccountId = theDmAccountId;

export const dmMember = {
  accountId: dmAccountId,
  name: "Wren Alderby",
  relation: "creator",
  joinedAt: "2026-06-01T10:00:00.000Z",
};

export const combatRuleArticle = {
  id: ruleArticleId,
  campaignId: null,
  accountId: null,
  derivedFrom: null,
  sourceIndex: "combat",
  name: "Combat",
  intro: [{ kind: "paragraph", text: "The clatter of steel and snap of spellwork." }],
  sectionCount: 1,
  visibility: "shared",
  origin: "system",
  assistantTurnId: null,
  ...stamps,
};

const featPrereqGroupId = "2b1f2a1e-0000-4000-8000-000000001391";
const grapplerPrerequisite = {
  abilityScoreId: abilityStrengthId,
  ability: strengthAbility,
  minimumScore: 13,
  groupId: featPrereqGroupId,
  groupOrdinal: 0,
  ordinal: 0,
};

export const grapplerFeat = {
  id: grapplerFeatId,
  campaignId: null,
  accountId: null,
  derivedFrom: null,
  sourceIndex: "grappler",
  name: "Grappler",
  description: [
    "You’ve developed the skills necessary to hold your own in close-quarters grappling.",
    "You have advantage on attack rolls against a creature you are grappling.",
    "You can use your action to try to pin a creature grappled by you.",
  ],
  prerequisites: [grapplerPrerequisite],
  visibility: "shared",
  origin: "system",
  assistantTurnId: null,
  ...stamps,
};

export const tavernBrawlerFeat = {
  id: tavernBrawlerFeatId,
  campaignId,
  accountId: null,
  derivedFrom: tavernBrawlerOriginalFeatId,
  sourceIndex: null,
  name: "Tavern Brawler",
  description: ["Your fists and furniture are both dangerous."],
  prerequisites: [],
  visibility: "dm",
  origin: "authored",
  assistantTurnId: null,
  ...stamps,
};

export const libraryFeats = [
  grapplerFeat,
  {
    ...tavernBrawlerFeat,
    id: tavernBrawlerOriginalFeatId,
    campaignId: null,
    accountId: theDmAccountId,
  },
];

export const campaignFeats = [grapplerFeat, tavernBrawlerFeat];

export const combatRuleDetail = {
  article: combatRuleArticle,
  sections: [
    {
      id: ruleSectionId,
      articleId: ruleArticleId,
      parentSectionId: null,
      sourceIndex: "the-order-of-combat",
      title: "The Order of Combat",
      ordinal: 1,
      blocks: [
        { kind: "heading", depth: 2, text: "The Order of Combat" },
        { kind: "list", ordered: true, items: ["Determine surprise", "Roll initiative"] },
      ],
    },
  ],
};

/** Everything a fully populated campaign answers, before a test re-aims it. */
export const fullCampaign = (): Map<string, Answer> =>
  new Map<string, Answer>([
    [`GET /campaigns/${campaignId}`, { status: 200, body: campaign }],
    // The membership list decides which projection a campaign URL renders —
    // the relation replaced the global mode. A test that wants the player
    // side re-aims this at `relation: "player"`, which makes the same URL
    // render the participant projection.
    [
      "GET /me/campaigns",
      { status: 200, body: [{ campaign, relation: "creator", joinedAt: stamps.createdAt }] },
    ],
    // The group above the campaign: the directory, the roster, the list. The
    // campaign screens do not read these, but the group screen and the shell
    // may, and one shared server has to be able to answer them.
    // Who is reading — the group view derives `isOwner` from it.
    ["GET /me", { status: 200, body: { id: theDmAccountId, name: "Wren Alderby" } }],
    ["GET /groups", { status: 200, body: [{ group, isOwner: true, joinedAt: stamps.createdAt }] }],
    [`GET /groups/${groupId}`, { status: 200, body: group }],
    [
      `GET /groups/${groupId}/campaigns`,
      {
        status: 200,
        body: [
          {
            id: campaignId,
            groupId,
            creatorAccountId: theDmAccountId,
            creatorName: "Wren Alderby",
            name: campaign.name,
            relation: "creator",
            archivedAt: null,
            createdAt: stamps.createdAt,
          },
        ],
      },
    ],
    [
      `GET /groups/${groupId}/members`,
      {
        status: 200,
        body: [
          {
            accountId: dmAccountId,
            name: "Wren Alderby",
            isOwner: true,
            joinedAt: stamps.createdAt,
          },
        ],
      },
    ],
    // The other shelf, and empty is the ordinary answer. It is a *second URL*
    // rather than a parameter on the read above, so a test that wants an
    // archived campaign re-aims this one and cannot accidentally put one in the
    // live list — which is the property the split exists for.
    ["GET /me/campaigns/archived", { status: 200, body: [] }],
    [`DELETE /campaigns/${campaignId}`, { status: 200, body: archivedCampaign }],
    [`POST /campaigns/${campaignId}/restore`, { status: 200, body: campaign }],
    [`GET /campaigns/${campaignId}/encounters`, { status: 200, body: page([encounter, sketch]) }],
    [`GET /campaigns/${campaignId}/notes`, { status: 200, body: page([readAloud]) }],
    [`GET /campaigns/${campaignId}/party`, { status: 200, body: [partySeat] }],
    // The Party screen's own two reads. A campaign with only its DM in it and
    // nothing outstanding — `party/party.fixtures.tsx` is where a populated
    // roster lives, and it re-aims both.
    [`GET /campaigns/${campaignId}/members`, { status: 200, body: [dmMember] }],
    [`GET /groups/${groupId}/invites`, { status: 200, body: [] }],
    // The group's chronicle — empty is the ordinary state of a young group.
    [`GET /groups/${groupId}/history`, { status: 200, body: [] }],
    [`GET /groups/${groupId}/history/summary`, { status: 200, body: null }],
    [`GET /campaigns/${campaignId}/creatures`, { status: 200, body: page([goblin, hag]) }],
    ["GET /library/spells", { status: 200, body: page([fireball]) }],
    ["GET /library/equipment", { status: 200, body: page([hempRope]) }],
    ["GET /library/magic-items", { status: 200, body: page([lanternRing]) }],
    ["GET /library/compendium", { status: 200, body: page([combatRuleArticle]) }],
    ["GET /library/feats", { status: 200, body: page(libraryFeats) }],
    [`GET /library/compendium/${ruleArticleId}`, { status: 200, body: combatRuleDetail }],
    // The rules vocabulary this table builds characters from — the create
    // form's pickers: the shared bundle plus what reaches this table through
    // its group. The Library list beside it is this account's originals.
    [`GET /campaigns/${campaignId}/options`, { status: 200, body: campaignOptions }],
    ["GET /library/options", { status: 200, body: libraryOptions }],
    ["GET /library/options/vocabulary", { status: 200, body: optionVocabulary }],
    [
      `GET /campaigns/${campaignId}/encounters/${encounterId}/creatures`,
      { status: 200, body: [rosterRow] },
    ],
    // The nights this table has had — read by both doors into a session, and
    // only ever to work out the next number. Session 12 is the highest, so the
    // next one is 13 wherever it is opened from.
    [`GET /campaigns/${campaignId}/sessions`, { status: 200, body: [session] }],
    [`GET /campaigns/${campaignId}/sessions/${sessionId}`, { status: 200, body: session }],
    [
      `PATCH /campaigns/${campaignId}/sessions/${sessionId}`,
      { status: 200, body: { ...session, startedAt: stamps.updatedAt } },
    ],
    [`GET /campaigns/${campaignId}/sessions/${sessionId}/prep`, { status: 200, body: [prepItem] }],
    // No fight on the table. A test that wants one re-aims this at `[liveRun]`,
    // which is what turns the top bar's "Start session" into "Back to the
    // fight" and lights the encounter card.
    [`GET /campaigns/${campaignId}/sessions/${sessionId}/runs`, { status: 200, body: [] }],
    [
      `PATCH /campaigns/${campaignId}/sessions/${sessionId}/prep/${prepItemId}`,
      { status: 200, body: { ...prepItem, done: true } },
    ],
  ]);

export interface StubServer {
  /** `"POST /campaigns/…"` → answer. Re-aim it per test. */
  routes: Map<string, Answer>;
  readonly calls: Array<Call>;
  /** Every request rejects, the way an unreachable API does. */
  transportDown: boolean;
  readonly reset: () => void;
}

/**
 * Installs the one `fetch` stub this file's tests get.
 *
 * **Once per test file, at module scope.** `FetchHttpClient.Fetch` is a
 * `Context.Reference` and `Context` memoises a reference's default the first
 * time it is read, so a per-test `vi.stubGlobal` would keep serving the first
 * test's answers with nothing to notice. See `api/client.test.ts`.
 */
export const installStubServer = (): StubServer => {
  const server: StubServer = {
    routes: fullCampaign(),
    calls: [],
    transportDown: false,
    reset: () => {
      server.routes = fullCampaign();
      server.calls.length = 0;
      server.transportDown = false;
    },
  };

  vi.stubGlobal("fetch", (url: string | URL, init: RequestInit | undefined) => {
    if (server.transportDown) return Promise.reject(new TypeError("Failed to fetch"));

    const { pathname, search } = new URL(String(url));
    const method = init?.method ?? "GET";
    const headers = init?.headers as Record<string, string> | undefined;
    server.calls.push({
      method,
      pathname,
      search,
      authorization: headers?.["authorization"],
      body: init?.body === undefined ? "" : new TextDecoder().decode(init.body as Uint8Array),
    });

    const answer = server.routes.get(`${method} ${pathname}`) ?? {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    };
    return Promise.resolve(
      new Response(answer.status === 204 ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  return server;
};

/** A signed-in hosted session that mints a different token on every call. */
export const mintingSession = (): HostedSession & { readonly minted: () => number } => {
  let issued = 0;
  return {
    configured: true,
    signedIn: true,
    loading: false,
    fetchToken: () => Promise.resolve(`session-token-${++issued}`),
    minted: () => issued,
  };
};

export const noSession: HostedSession = {
  configured: false,
  signedIn: false,
  loading: false,
  fetchToken: () => Promise.resolve(undefined),
};

/**
 * Annotated `void`, not left inferred: Testing Library's `RenderResult` names a
 * type inside `@testing-library/dom`, which pnpm's isolated layout puts out of
 * reach of an exported signature here — the same TS2742 the server hits with
 * `@clerk/shared`. Nothing needs the handle anyway; queries go through `screen`.
 */
export const renderScreen = async (hosted: HostedSession = noSession): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}`, (screen) => (
    <HostedSessionScope session={hosted}>{screen}</HostedSessionScope>
  ));
};

/**
 * The campaign's other two destinations.
 *
 * **The sixth delivery split the campaign screen into three**, so a test that
 * used to click a tab now renders a URL — which is the whole point of the
 * change and is worth the tests saying out loud. All three compose the same
 * `CampaignChrome` over the same `loadCampaignView`, so the stub server serves
 * every one of them without a route being added.
 */
export const renderEncounters = async (hosted: HostedSession = noSession): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/encounters`, (screen) => (
    <HostedSessionScope session={hosted}>{screen}</HostedSessionScope>
  ));
};

export const renderNotes = async (hosted: HostedSession = noSession): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/notes`, (screen) => (
    <HostedSessionScope session={hosted}>{screen}</HostedSessionScope>
  ));
};

/**
 * The list of campaigns — the way in, and where a campaign is shelved and
 * brought back.
 *
 * Group home is the only campaign directory now; campaign relation is derived
 * per campaign instead of by a second `/play` route.
 */
export const renderCampaigns = async (
  path: "/groups" | "/" = "/groups",
  hosted: HostedSession = noSession,
): Promise<void> => {
  await renderAt(path, (screen) => (
    <HostedSessionScope session={hosted}>{screen}</HostedSessionScope>
  ));
};

/** The group above the fixture campaign — the directory and the roster. */
export const renderGroup = async (hosted: HostedSession = noSession): Promise<void> => {
  await renderAt(`/groups/${groupId}`, (screen) => (
    <HostedSessionScope session={hosted}>{screen}</HostedSessionScope>
  ));
};

/** The party screen, which is where a character is written since the split. */
export const renderParty = async (hosted: HostedSession = noSession): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/party`, (screen) => (
    <HostedSessionScope session={hosted}>{screen}</HostedSessionScope>
  ));
};

/**
 * jsdom here ships **no** `localStorage` at all, so exercising the stored
 * machine token needs one installed. It lives in `test/storage.ts` now — every
 * rendered route needs a credential since the signed-out gate landed, not only
 * this screen's — and is re-exported here so the call sites did not have to
 * move with it.
 */
export { installMemoryStorage } from "../test/storage";

/** The JSON body of the first call matching a method and a path fragment. */
export const bodyOf = (server: StubServer, method: string, fragment: string): unknown => {
  const call = server.calls.find(
    (entry) => entry.method === method && entry.pathname.includes(fragment),
  );
  return call === undefined || call.body === "" ? undefined : JSON.parse(call.body);
};
