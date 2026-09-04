import { NodeHttpServer } from "@effect/platform-node";
import {
  asBackgroundOption,
  asClassOption,
  asRaceOption,
  type CharacterOption,
  type CharacterSheet,
  emptyCharacterSheet,
  FEATURE_OVERLAY,
  identityGrants,
  optionNamed,
  RACIAL_TRAIT_OVERLAY,
  seedFor,
  sheetGrantsFor,
  TavernsApi,
  withSavingThrows,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **The corpus writes actions and resources onto a fresh sheet** — the actions
 * plan's slice 1, over the real application and the real 2014 bundle.
 *
 * Three things the plan measured had to become true, in order:
 *
 *   1. the importer keeps the casting ability and the kit as structure — a
 *      Wizard's class body says INT and a Paladin's says CHA, and re-running
 *      the import settles both on a database that predates them;
 *   2. every key in the curated overlay names a real bundled row, so a source
 *      rename cannot leave an entry matching nothing;
 *   3. a Fighter 1 written down through the real create endpoint comes back
 *      with a Longsword on its Actions section and Second Wind's one use on
 *      its resources — composed by the same `sheetGrantsFor` the form and Hob
 *      call, over the options the endpoint hydrates.
 */
const database = migratedDatabase("taverns_test_character_actions");
const services = servicesOver(database);

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

const as = <A, E>(
  token: string,
  use: (client: Effect.Success<ReturnType<typeof clientFor>>) => Effect.Effect<A, E>,
): Promise<A> => runtime.runPromise(Effect.flatMap(clientFor(token), use).pipe(Effect.orDie));

const sql = <A>(run: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>): Promise<A> =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, run).pipe(Effect.orDie));

let token: string;
let campaignId: string;

beforeAll(async () => {
  token = await runtime.runPromise(
    Effect.flatMap(Accounts, (accounts) => accounts.issue("Jo")).pipe(
      Effect.map((issued) => issued.token),
      Effect.orDie,
    ),
  );
  // The order the README states: equipment before the ruleset, because the
  // kit lines resolve equipment rows in the same transaction.
  await runtime.runPromise(importSystemEquipment().pipe(Effect.orDie));
  await runtime.runPromise(importSystemOptions().pipe(Effect.orDie));
  await runtime.runPromise(importSystemSpells().pipe(Effect.orDie));
  campaignId = (
    await as(token, (client) =>
      campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
    )
  ).id;
}, 120_000);

describe("the importer keeps what the sheet needs", () => {
  it("writes the casting ability per class: a Wizard says INT, a Paladin says CHA", async () => {
    const rows = await sql(
      (client) => client<{ readonly name: string; readonly ability: string | null }>`
        select name, body ->> 'spellcastingAbility' as ability
        from character_option
        where kind = 'class' and campaign_id is null and account_id is null
        order by name
      `,
    );
    const by = new Map(rows.map((row) => [row.name, row.ability]));
    expect(by.get("Wizard")).toBe("INT");
    expect(by.get("Paladin")).toBe("CHA");
    expect(by.get("Cleric")).toBe("WIS");
    expect(by.get("Sorcerer")).toBe("CHA");
    // A class that does not cast says nothing, rather than a made-up key.
    expect(by.get("Fighter")).toBeNull();
    expect(by.get("Barbarian")).toBeNull();
  });

  it("writes the kit as structure, every counted line naming its bundled row", async () => {
    const rows = await sql(
      (client) => client<{
        readonly kit: {
          readonly fixed: ReadonlyArray<unknown>;
          readonly choices: ReadonlyArray<{
            readonly desc: string;
            readonly options: ReadonlyArray<{
              readonly label: string;
              readonly lines: ReadonlyArray<Record<string, unknown>>;
            }>;
          }>;
        };
      }>`
        select body -> 'startingKit' as kit from character_option where name = 'Fighter'
      `,
    );
    const kit = rows[0]?.kit;
    expect(kit?.choices.map((choice) => choice.desc)).toEqual([
      "(a) chain mail or (b) leather armor, longbow, and 20 arrows",
      "(a) a martial weapon and a shield or (b) two martial weapons",
      "(a) a light crossbow and 20 bolts or (b) two handaxes",
      "(a) a dungeoneer’s pack or (b) an explorer’s pack",
    ]);
    // Side (b) of the first choice is three counted rows; side (a) of the
    // second is a category the player picks from plus a shield.
    expect(kit?.choices[0]?.options.map((option) => option.label)).toEqual([
      "Chain Mail",
      "Leather Armor, Longbow, 20 × Arrow",
    ]);
    expect(kit?.choices[1]?.options[0]?.lines.map((line) => line.name)).toEqual([
      "Any martial weapon",
      "Shield",
    ]);
    const counted = kit?.choices.flatMap((choice) =>
      choice.options.flatMap((option) =>
        option.lines.filter((line) => line.category === undefined),
      ),
    );
    expect(counted?.length).toBeGreaterThan(0);
    for (const line of counted ?? []) expect(typeof line.equipmentId).toBe("string");
  });

  it("settles both on re-import without inserting a second row", async () => {
    await expect(runtime.runPromise(importSystemOptions().pipe(Effect.orDie))).resolves.toEqual({
      inserted: 0,
      updated: 22,
    });
    const rows = await sql(
      (client) => client<{ readonly count: number; readonly ability: string | null }>`
        select count(*)::int as count, min(body ->> 'spellcastingAbility') as ability
        from character_option where name = 'Wizard' and kind = 'class'
      `,
    );
    expect(rows[0]).toEqual({ count: 1, ability: "INT" });
  });
});

describe("the overlay", () => {
  it("names only rows the bundle really has", async () => {
    const features = await sql(
      (client) => client<{ readonly key: string }>`
        select source_key as key from feature
        where campaign_id is null and account_id is null and source_key is not null
      `,
    );
    const traits = await sql(
      (client) => client<{ readonly key: string }>`
        select source_key as key from racial_trait where source_key is not null
      `,
    );
    const featureKeys = new Set(features.map((row) => row.key));
    const traitKeys = new Set(traits.map((row) => row.key));
    for (const key of Object.keys(FEATURE_OVERLAY)) expect(featureKeys.has(key), key).toBe(true);
    for (const key of Object.keys(RACIAL_TRAIT_OVERLAY)) expect(traitKeys.has(key), key).toBe(true);
  });
});

describe("a Fighter 1, written down through the real create endpoint", () => {
  let options: ReadonlyArray<CharacterOption>;

  beforeAll(async () => {
    options = await as(token, (client) =>
      client.options.list({ params: { campaignId: campaignId as never }, query: {} }),
    );
  });

  it("hydrates the class table and the kit's rows onto the option the picker reads", () => {
    const fighter = asClassOption(optionNamed(options, "class", "Fighter"));
    expect(fighter?.body.startingKit?.choices).toHaveLength(4);
    expect(fighter?.details?.classLevels).toHaveLength(20);
    expect(fighter?.details?.classLevels?.[0]).toMatchObject({ level: 1, proficiencyBonus: 2 });
    expect(fighter?.details?.classLevels?.[4]?.classSpecific).toEqual({
      action_surges: 1,
      extra_attacks: 1,
    });
    // Every martial weapon is pickable, because the kit says "any martial
    // weapon"; a longsword is one of them, with its weapon columns.
    const longsword = fighter?.details?.equipment?.find((row) => row.name === "Longsword");
    expect(longsword).toMatchObject({
      weaponCategory: "Martial",
      damageDice: "1d8",
      damageType: "Slashing",
      twoHandedDamageDice: "1d10",
      properties: ["Versatile"],
    });
    const paladin = asClassOption(optionNamed(options, "class", "Paladin"));
    expect(paladin?.body.spellcastingAbility).toBe("CHA");
    expect(paladin?.details?.classLevels?.[4]?.spellcasting).toEqual({ slots: [4, 2] });
    const wizard = asClassOption(optionNamed(options, "class", "Wizard"));
    expect(wizard?.details?.classLevels?.[2]?.spellcasting).toEqual({
      cantripsKnown: 3,
      slots: [4, 2],
    });
    expect(wizard?.details?.classLevels?.[2]?.classSpecific).toEqual({ arcane_recovery_levels: 2 });
  });

  it("comes back with a Longsword and Second Wind on its Actions, and the kit on its Gear", async () => {
    const fighter = asClassOption(optionNamed(options, "class", "Fighter"));
    const human = asRaceOption(optionNamed(options, "race", "Human"));
    const acolyte = asBackgroundOption(optionNamed(options, "background", "Acolyte"));
    const longsword = fighter?.details?.equipment?.find((row) => row.name === "Longsword");
    if (fighter === undefined || longsword === undefined) throw new Error("no fighter");

    // The form's composition, exactly: seed the cells, then the grants over
    // them, then the saving throws marked.
    const seed = seedFor({
      classEntry: fighter.body,
      raceEntry: human?.body,
      subraceEntry: undefined,
      abilities: [
        { label: "STR", score: "15", modifier: "+2" },
        { label: "DEX", score: "14", modifier: "+2" },
        { label: "CON", score: "13", modifier: "+1" },
        { label: "INT", score: "8", modifier: "-1" },
        { label: "WIS", score: "12", modifier: "+1" },
        { label: "CHA", score: "10", modifier: "+0" },
      ],
    });
    const grants = sheetGrantsFor({
      classOption: fighter,
      raceOption: human,
      backgroundOption: acolyte,
      level: 1,
      abilities: seed.abilities,
      kitChoices: [
        { option: 0, picks: [] },
        { option: 0, picks: [longsword.id] },
        { option: 0, picks: [] },
        { option: 1, picks: [] },
      ],
    });
    const sheet: CharacterSheet = {
      ...emptyCharacterSheet,
      abilities: withSavingThrows(seed.abilities, grants.savingThrows, grants.proficiencyBonus),
      traits: grants.traits,
      identity: identityGrants(grants),
      proficiencies: grants.proficiencies,
      inventory: grants.inventory,
      actions: grants.actions,
      resources: grants.resources,
      ...(grants.spellcasting === undefined ? {} : { spellcasting: grants.spellcasting }),
    };

    const created = await as(token, (client) =>
      client.me.createCharacter({
        params: { campaignId: campaignId as never },
        payload: {
          name: "Brannoc",
          level: 1,
          race: "Human",
          className: "Fighter",
          ac: seed.ac,
          ...(seed.hpMax === undefined ? {} : { hpMax: seed.hpMax }),
          sheet,
        },
      }),
    );

    // Human: +1 to everything, so STR 16 (+3) and DEX 15 (+2).
    expect(
      created.sheet.actions?.map((action) => [
        action.name,
        action.cost,
        action.hit,
        action.dice,
        action.damageType,
      ]),
    ).toEqual([
      ["Longsword", "action", "+5", "1d8+3", "Slashing"],
      ["Crossbow, light", "action", "+4", "1d8+2", "Piercing"],
      ["Second Wind", "bonus", undefined, "1d10+1", undefined],
    ]);
    expect(created.sheet.actions?.[0]).toMatchObject({
      source: "weapon",
      equipmentId: longsword.id,
      derived: true,
      text: "Martial Melee · Versatile (1d10)",
    });
    expect(created.sheet.actions?.[2]).toMatchObject({
      source: "feature",
      resource: "res:second-wind",
      derived: true,
    });
    expect(created.sheet.actions?.[2]?.featureId).toBeTypeOf("string");
    expect(created.sheet.resources).toEqual([
      {
        id: "hit-dice",
        name: "Hit dice",
        used: 0,
        max: 1,
        recharge: "long",
        unit: "d10",
        derived: true,
      },
      expect.objectContaining({ id: "res:second-wind", used: 0, max: 1, recharge: "short" }),
    ]);
    // No slots and no casting aside for a class that does not cast.
    expect(created.sheet.spellcasting).toBeUndefined();
    // The kit as picked: chain mail, the longsword and shield, the crossbow
    // and bolts, the explorer's pack, then the background's lines.
    expect(created.sheet.inventory?.map((item) => item.name)).toEqual([
      "Chain Mail",
      "Longsword",
      "Shield",
      "Crossbow, light",
      "Crossbow bolt",
      "Explorer's Pack",
      "1 × Clothes, common",
      "1 × Pouch",
      "Choose 1 equipment",
    ]);
    expect(created.sheet.inventory?.[1]?.equipmentId).toBe(longsword.id);
    expect(created.sheet.identity).toMatchObject({
      proficiency: "+2",
      hitDice: "1/1 d10",
      speed: "30 ft.",
    });
    expect(created.descriptor).toBe("Level 1 Human Fighter");
  }, 60_000);
});

describe("the character spell picker and level-up recompute", () => {
  it("answers class spells, saves selected spell ids, and rewrites derived slots on level-up", async () => {
    const made = await as(token, (client) =>
      client.me.createCharacter({
        params: { campaignId: campaignId as never },
        payload: {
          name: "Mira",
          level: 1,
          className: "Wizard",
          sheet: {
            ...emptyCharacterSheet,
            abilities: [{ label: "INT", score: "16", modifier: "+3" }],
            spellcasting: {
              ability: "INT",
              save: "13",
              attack: "+5",
              slots: [{ level: 1, used: 1, total: 2 }],
              known: [],
            },
            resources: [
              {
                id: "slot:1",
                name: "1st-level slots",
                used: 1,
                max: 2,
                recharge: "long",
                derived: true,
              },
              {
                id: "focus",
                name: "Arcane focus charge",
                used: 1,
                max: 1,
                recharge: "short",
              },
            ],
          },
        },
      }),
    );

    await as(token, (client) =>
      client.party.join({
        params: { campaignId: campaignId as never },
        payload: { characterId: made.id },
      }),
    );

    const book = await as(token, (client) =>
      client.me.characterSpells({ params: { characterId: made.id } }),
    );
    expect(book).toMatchObject({ className: "Wizard", mode: "spellbook", highestSlotLevel: 1 });
    expect(book.limits).toMatchObject({ cantripsKnown: 3, spellsKnown: 6, prepared: 4 });
    expect(book.spells.some((row) => row.spell.name === "Magic Missile")).toBe(true);
    expect(book.spells.some((row) => row.spell.name === "Fire Bolt")).toBe(true);
    expect(book.spells.some((row) => row.spell.name === "Fireball")).toBe(false);

    const magicMissile = book.spells.find((row) => row.spell.name === "Magic Missile")!;
    const withSpell = await as(token, (client) =>
      client.me.updateCharacter({
        params: { characterId: made.id },
        payload: {
          expectedVersion: made.version,
          sheet: {
            ...made.sheet,
            spellcasting: {
              ...made.sheet.spellcasting,
              known: [
                {
                  name: magicMissile.spell.name,
                  level: magicMissile.spell.level,
                  spellId: magicMissile.spell.id,
                  prepared: true,
                },
              ],
            },
            actions: [
              ...(made.sheet.actions ?? []),
              {
                id: `spell:${magicMissile.spell.id}`,
                name: magicMissile.spell.name,
                source: "spell",
                spellId: magicMissile.spell.id,
                resource: "slot:1",
                derived: true,
              },
            ],
          },
        },
      }),
    );
    expect(withSpell.sheet.spellcasting?.known?.[0]?.spellId).toBe(magicMissile.spell.id);

    const leveled = await as(token, (client) =>
      client.me.updateCharacter({
        params: { characterId: made.id },
        payload: { expectedVersion: withSpell.version, level: 3 },
      }),
    );

    expect(leveled.level).toBe(3);
    expect(leveled.sheet.spellcasting?.known?.map((spell) => spell.name)).toEqual([
      "Magic Missile",
    ]);
    expect(leveled.sheet.resources?.find((resource) => resource.id === "slot:1")).toMatchObject({
      max: 4,
      used: 1,
      derived: true,
    });
    expect(leveled.sheet.resources?.find((resource) => resource.id === "slot:2")).toMatchObject({
      max: 2,
      used: 0,
      derived: true,
    });
    expect(leveled.sheet.resources?.find((resource) => resource.id === "focus")).toMatchObject({
      max: 1,
      used: 1,
    });
    const action = leveled.sheet.actions?.find((row) => row.spellId === magicMissile.spell.id);
    expect(action).toMatchObject({ name: "Magic Missile", resource: "slot:1", derived: true });
  });
});
