import { Actor, CurrentActor, NotFound, type SpellCreate } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { servicesOver } from "../src/app.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Invites } from "../src/repo/Invites.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Spells } from "../src/repo/Spells.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells, type ImportSpellsResult } from "../src/spells/import.js";
import { SPELL_RAW } from "../src/spells/systemSpells.js";
import { aPlayerAt } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

const database = migratedDatabase("taverns_test_spells");
const services = servicesOver(database);
const runtime = ManagedRuntime.make(services.pipe(Layer.provideMerge(database)));
afterAll(() => runtime.dispose());

const run = <A, E>(
  effect: Effect.Effect<A, E, Accounts | Campaigns | Invites | Spells | SqlClient.SqlClient>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const attempt = <A, E>(
  effect: Effect.Effect<A, E, Accounts | Campaigns | Invites | Spells | SqlClient.SqlClient>,
) => runtime.runPromise(Effect.result(effect));

const sql = <A>(effect: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  run(Effect.flatMap(SqlClient.SqlClient, effect));

let firstImport: ImportSpellsResult;

beforeAll(async () => {
  await run(importSystemEquipment());
  await run(importSystemOptions());
  firstImport = await run(importSystemSpells());
}, 60_000);

const dmCampaign = (name: string) =>
  Effect.gen(function* () {
    const accounts = yield* Accounts;
    const campaigns = yield* Campaigns;
    const issued = yield* accounts.issue(`${name} DM`);
    const actor = new Actor({ accountId: issued.accountId, campaignId: null });
    const campaign = yield* Effect.provideService(
      campaigns.create({ name, visibility: "shared" }),
      CurrentActor,
      actor,
    );
    return { actor, campaign };
  });

const withActor = <A, E, R>(actor: Actor, effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, CurrentActor, actor);

const firstSpellNamed = (name: string) =>
  Effect.flatMap(Spells, (spells) =>
    Effect.map(spells.library({ q: name, sort: "name", limit: 5 }), (page) => {
      const match = page.items.find((spell) => spell.name === name);
      if (match === undefined) throw new Error(`expected ${name}`);
      return match;
    }),
  );

const customSpell = (name: string, classIndex = "wizard"): SpellCreate => ({
  name,
  level: 1,
  school: { index: "evocation", name: "Evocation" },
  ritual: false,
  concentration: false,
  castingTime: "1 action",
  range: "Self",
  duration: "Instantaneous",
  classes: [{ index: classIndex, name: "Wizard" }],
  spell: {
    desc: [`${name} flashes once.`],
    components: ["V", "S"],
    school: { index: "evocation", name: "Evocation" },
    classes: [{ index: classIndex, name: "Wizard" }],
    subclasses: [],
  },
});

describe("2014 SRD spells", () => {
  it("imports exactly the pinned 319 spell corpus, idempotently and offline", async () => {
    expect(firstImport).toEqual({ seen: 319, inserted: 319, updated: 0 });

    const count = await sql(
      (client) => client<{ readonly count: number }>`
        select count(*)::int as count from spell where origin = 'system'
      `,
    );
    expect(count).toEqual([{ count: 319 }]);

    await expect(run(importSystemSpells())).resolves.toEqual({
      seen: 319,
      inserted: 0,
      updated: 319,
    });
  }, 60_000);

  it("records concrete relationships to schools, classes, damage types and DC abilities", async () => {
    const links = await sql(
      (client) => client<{
        readonly relation: string;
        readonly target_family: string;
        readonly target_index: string;
      }>`
        select 'school' as relation, 'magic-schools' as target_family, magic_school.source_key as target_index
        from spell
        join magic_school on magic_school.id = spell.school_id
        where spell.source_key = 'fireball'
        union all
        select 'dc-type' as relation, 'ability-scores' as target_family, ability_score.source_key as target_index
        from spell
        join ability_score on ability_score.id = spell.dc_ability_id
        where spell.source_key = 'fireball'
        union all
        select 'class' as relation, character_option.source_family as target_family, character_option.source_key as target_index
        from spell
        join spell_class on spell_class.spell_id = spell.id
        join character_option on character_option.id = spell_class.class_option_id
        where spell.source_key = 'fireball'
        union all
        select 'damage-type' as relation, 'damage-types' as target_family, damage_type.source_key as target_index
        from spell
        join spell_damage_type on spell_damage_type.spell_id = spell.id
        join damage_type on damage_type.id = spell_damage_type.damage_type_id
        where spell.source_key = 'fireball'
        union all
        select 'subclass' as relation, subclass.source_family as target_family, subclass.source_key as target_index
        from spell
        join spell_subclass on spell_subclass.spell_id = spell.id
        join subclass on subclass.id = spell_subclass.subclass_id
        where spell.source_key = 'acid-arrow'
        order by relation, target_index
      `,
    );

    expect(links).toEqual(
      expect.arrayContaining([
        { relation: "school", target_family: "magic-schools", target_index: "evocation" },
        { relation: "class", target_family: "classes", target_index: "sorcerer" },
        { relation: "class", target_family: "classes", target_index: "wizard" },
        { relation: "damage-type", target_family: "damage-types", target_index: "fire" },
        { relation: "dc-type", target_family: "ability-scores", target_index: "dex" },
        { relation: "subclass", target_family: "subclasses", target_index: "land" },
        { relation: "subclass", target_family: "subclasses", target_index: "lore" },
      ]),
    );
  });

  it("filters in SQL by one-value arrays and spell-specific booleans", async () => {
    const { actor, campaign } = await run(dmCampaign("The Spell Road"));
    const page = await run(
      withActor(
        actor,
        Effect.flatMap(Spells, (spells) =>
          spells.list(campaign.id, {
            q: "explosion of flame",
            levels: ["3"],
            schools: ["evocation"],
            classes: ["wizard"],
            concentration: false,
            ritual: false,
            sort: "level",
            limit: 10,
          }),
        ),
      ),
    );

    expect(page.items.map((spell) => spell.name)).toContain("Fireball");
    expect(page.items.every((spell) => spell.level === 3)).toBe(true);
    expect(page.items.every((spell) => spell.schoolIndex === "evocation")).toBe(true);
    expect(page.items.every((spell) => spell.classIndexes.includes("wizard"))).toBe(true);
    expect(page.items.every((spell) => !spell.ritual && !spell.concentration)).toBe(true);
  });

  it("does not let a stranger read bundled spells through a campaign they cannot reach", async () => {
    const { campaign } = await run(dmCampaign("The Gated Spellbook"));
    const issued = await run(
      Effect.flatMap(Accounts, (accounts) => accounts.issue("Spell Stranger")),
    );
    const stranger = new Actor({ accountId: issued.accountId, campaignId: null });

    const result = await attempt(
      withActor(
        stranger,
        Effect.flatMap(Spells, (spells) => spells.list(campaign.id, { q: "Fireball", limit: 5 })),
      ),
    );

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
    expect(result._tag === "Failure" && (result.failure as NotFound).resource).toBe("campaign");
  });

  it("keeps Library originals out of campaign lists until they are copied", async () => {
    const { actor: firstDm, campaign } = await run(dmCampaign("The Private Grimoire"));
    const { actor: secondDm } = await run(dmCampaign("The Other Grimoire"));

    const original = await run(
      withActor(
        firstDm,
        Effect.flatMap(Spells, (spells) => spells.libraryCreate(customSpell("Fen's Private Bolt"))),
      ),
    );

    const beforeCopy = await run(
      withActor(
        firstDm,
        Effect.flatMap(Spells, (spells) => spells.list(campaign.id, { q: "Fen's Private Bolt" })),
      ),
    );
    const strangerLibrary = await run(
      withActor(
        secondDm,
        Effect.flatMap(Spells, (spells) => spells.library({ q: "Fen's Private Bolt" })),
      ),
    );

    expect(beforeCopy.items).toEqual([]);
    expect(strangerLibrary.items).toEqual([]);

    const copy = await run(
      withActor(
        firstDm,
        Effect.flatMap(Spells, (spells) => spells.derive(campaign.id, original.id, {})),
      ),
    );
    const afterCopy = await run(
      withActor(
        firstDm,
        Effect.flatMap(Spells, (spells) => spells.list(campaign.id, { q: "Fen's Private Bolt" })),
      ),
    );

    expect(copy.campaignId).toBe(campaign.id);
    expect(copy.accountId).toBeNull();
    expect(copy.derivedFrom).toBe(original.id);
    expect(afterCopy.items.map((spell) => spell.id)).toEqual([copy.id]);
  });

  it("copies a spell as a campaign snapshot and does not follow later source updates", async () => {
    const { actor, campaign } = await run(dmCampaign("The Snapshot Spellbook"));
    const source = await run(withActor(actor, firstSpellNamed("Magic Missile")));
    const copy = await run(
      withActor(
        actor,
        Effect.flatMap(Spells, (spells) =>
          spells.derive(campaign.id, source.id, { name: "Salt Road Missile" }),
        ),
      ),
    );

    const raw = SPELL_RAW.find((spell) => spell.index === "magic-missile");
    if (raw === undefined) throw new Error("expected raw Magic Missile");
    await run(importSystemSpells([{ ...raw, name: "Magic Missile, Revised" }]));

    const copiedAgain = await run(
      withActor(
        actor,
        Effect.flatMap(Spells, (spells) => spells.findById(campaign.id, copy.id)),
      ),
    );
    const revisedSource = await run(withActor(actor, firstSpellNamed("Magic Missile, Revised")));

    expect(copiedAgain.name).toBe("Salt Road Missile");
    expect(copiedAgain.spell.desc).toEqual(source.spell.desc);
    expect(revisedSource.id).toBe(source.id);
  }, 60_000);

  it("lets a player read shared spell rows but not a campaign's DM-only copy", async () => {
    const { actor, campaign } = await run(dmCampaign("The Shared Spellbook"));
    const player = await run(aPlayerAt(campaign.id, "Spell Player"));
    const source = await run(withActor(actor, firstSpellNamed("Cure Wounds")));
    const dmOnlyCopy = await run(
      withActor(
        actor,
        Effect.flatMap(Spells, (spells) =>
          spells.derive(campaign.id, source.id, { name: "Quiet Cure" }),
        ),
      ),
    );

    const playerBeforeShare = await run(
      withActor(
        player,
        Effect.flatMap(Spells, (spells) => spells.list(campaign.id, { q: "Quiet Cure" })),
      ),
    );
    expect(playerBeforeShare.items).toEqual([]);

    const playerSystem = await run(
      withActor(
        player,
        Effect.flatMap(Spells, (spells) => spells.list(campaign.id, { q: "Cure Wounds" })),
      ),
    );
    expect(playerSystem.items.map((spell) => spell.name)).toContain("Cure Wounds");

    await run(
      withActor(
        actor,
        Effect.flatMap(Spells, (spells) =>
          spells.update(campaign.id, dmOnlyCopy.id, { visibility: "shared" }),
        ),
      ),
    );
    const playerAfterShare = await run(
      withActor(
        player,
        Effect.flatMap(Spells, (spells) => spells.list(campaign.id, { q: "Quiet Cure" })),
      ),
    );
    expect(playerAfterShare.items.map((spell) => spell.name)).toEqual(["Quiet Cure"]);
  });
});
