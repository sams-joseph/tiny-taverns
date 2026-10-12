import { describe, expect } from "@effect/vitest";
import { type Actor, type CampaignId, CurrentActor, type StatBlock } from "@taverns/api";
import { Context, Effect, Layer, Stream } from "effect";
import { servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { HobToolkit, NO_VOCABULARY, playerToolkitOver } from "../src/assistant/toolkit.js";
import { transformedMonster } from "../src/bestiary/import.js";
import { MONSTER_RAW } from "../src/bestiary/systemMonsters.js";
import { BattleMaps } from "../src/repo/BattleMaps.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Party } from "../src/repo/Party.js";
import { Sessions } from "../src/repo/Sessions.js";
import { Spells } from "../src/repo/Spells.js";
import { TableFight } from "../src/repo/TableFight.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { SPELL_RAW } from "../src/spells/systemSpells.js";
import { aPlayerAt, anAccount, asDm, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { type ChatRequest, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";
import { describeLayer } from "./support/suite.js";

/**
 * **The fight on the table, as its creator reads it** (`repo/TableFight.ts`)
 * and as Hob's `readFight` reads it out to the model.
 *
 * Three claims: the creator reads the whole fight, a monster's options
 * included; a player, and a run of another campaign's, are `NotFound`; and
 * what reaches the provider is this table's fight and not one byte of
 * another's — nor any of it through a player's Hob, which has no such tool.
 */
const database = migratedDatabase("taverns_test_hob_read_fight");
const services = Layer.mergeAll(
  servicesOver(database),
  TableFight.unsigned.pipe(Layer.provide(database)),
  database,
);

const MAX_TOKENS = 512;

/** Planted in another campaign's fight; must never reach the model. */
const SENTINEL = "Quillvane-the-Unseen-7731";

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const priest = (() => {
  const row = (MONSTER_RAW as ReadonlyArray<Record<string, unknown>>).find(
    (monster) => monster.name === "Priest",
  );
  if (row === undefined) throw new Error("no SRD Priest");
  return transformedMonster(row).statBlock as StatBlock;
})();

/** A fight under way at a table: the Priest up, then the seated player's character. */
const aTableAtWar = (
  dm: Actor,
  name: string,
  options: { readonly monster: string; readonly hero: string },
) =>
  Effect.gen(function* () {
    const campaigns = yield* Campaigns;
    const characters = yield* Characters;
    const combatants = yield* Combatants;
    const creatures = yield* Creatures;
    const encounters = yield* Encounters;
    const party = yield* Party;
    const runs = yield* EncounterRuns;
    const sessions = yield* Sessions;
    const as = withActor(dm);

    const campaign = yield* as(createCampaign({ name, visibility: "shared" }));
    const player = yield* aPlayerAt(campaign.id, `${options.hero}'s player`);
    const character = yield* withActor(player)(
      characters.createOwn(campaign.id, {
        name: options.hero,
        playerName: "Pim",
        level: 3,
        className: "Fighter",
        ac: 18,
        hpMax: 31,
        sheet: { notes: "", abilities: [], traits: [], resources: [] },
      }),
    );
    yield* withActor(player)(party.join(campaign.id, { characterId: character.id }));
    const monster = yield* as(
      creatures.libraryCreate({
        name: options.monster,
        type: "Humanoid",
        cr: "2",
        ac: 13,
        hp: 27,
        statBlock: priest,
      }),
    );
    const session = yield* as(sessions.create(campaign.id, { number: 1, visibility: "shared" }));
    yield* as(campaigns.update(campaign.id, { currentSessionId: session.id }));
    const encounter = yield* as(
      encounters.create(campaign.id, {
        name: `${name} skirmish`,
        visibility: "shared",
        ready: true,
        tactics: ["The priest keeps the altar between itself and the party."],
        creatures: [{ creatureId: monster.id, count: 1 }],
      }),
    );
    const proof = yield* asDm(dm, campaign.id);
    const run = yield* runs.start(proof, session.id, {
      encounterId: encounter.id,
      includeParty: true,
      visibility: "shared",
    });
    const seeded = yield* combatants.list(proof, session.id, run.id);
    const hero = seeded.find((row) => row.kind === "pc")!;
    const foe = seeded.find((row) => row.kind === "npc")!;
    yield* combatants.setInitiative(proof, session.id, run.id, {
      entries: [
        { combatantId: foe.id, initiative: 20 },
        { combatantId: hero.id, initiative: 10 },
      ],
    });
    const begun = yield* runs.begin(proof, session.id, run.id, {});
    return { campaign, player, session, run: begun, hero, foe };
  }).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  // The Priest's spells, from the bundle, and nothing else of the corpus but
  // the classes a spell row names, and the gear those classes start with.
  yield* importSystemEquipment().pipe(Effect.orDie);
  yield* importSystemOptions().pipe(Effect.orDie);
  const named = new Set(
    priest.specialAbilities?.flatMap(
      (feature) => feature.spellcasting?.spells.map((spell) => spell.name) ?? [],
    ),
  );
  yield* importSystemSpells(
    (SPELL_RAW as ReadonlyArray<Record<string, unknown>>).filter((row) =>
      named.has(row.name as string),
    ),
    [],
  ).pipe(Effect.orDie);

  const dm = yield* anAccount("Fight Reading DM");
  // A Library spell sharing a bundle spell's name: the bundle's row is the
  // one a stat block names, so this one's bonus-action casting must not win.
  yield* withActor(dm)(
    Effect.flatMap(Spells, (spells) =>
      spells.libraryCreate({
        name: "Sacred Flame",
        level: 0,
        school: { index: "evocation", name: "Evocation" },
        castingTime: "1 bonus action",
        range: "Self",
        duration: "Instantaneous",
      }),
    ),
  );
  const ford = yield* aTableAtWar(dm, "The Ashen Ford", {
    monster: "Ford Priest",
    hero: "Brannoc",
  });

  const other = yield* anAccount("Another DM");
  const elsewhere = yield* aTableAtWar(other, "The Far Table", {
    monster: SENTINEL,
    hero: `${SENTINEL} hero`,
  });
  // The same DM's second table: its fight is still not this table's.
  const second = yield* aTableAtWar(dm, "The Second Table", {
    monster: `${SENTINEL} second`,
    hero: "Wren",
  });
  const quiet = yield* withActor(dm)(
    createCampaign({ name: "The Quiet Inn", visibility: "shared" }),
  );
  return { dm, other, ford, elsewhere, second, quiet };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-read-fight.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

/** Ask Hob, with a scripted model that calls `readFight` and then answers. */
const ask = (actor: Actor, campaignId: CampaignId, text: string) => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: MAX_TOKENS,
    rounds: [toolCallChunks("readFight", {}), textChunks("Brannoc is hurt.")],
  });
  return Effect.gen(function* () {
    const hob = yield* Hob;
    const stream = yield* hob.ask(campaignId, { text });
    const events = Array.from(yield* Stream.runCollect(stream));
    return { events, requests: model.requests() };
  }).pipe(
    withActor(actor),
    Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
  );
};

/** What `readFight` answered, as the provider was sent it on the next round. */
const fightSaid = (requests: ReadonlyArray<ChatRequest>): string =>
  requests
    .flatMap((request) =>
      (request.messages as ReadonlyArray<{ readonly role?: string; readonly content?: unknown }>)
        .filter((message) => message.role === "tool")
        .map((message) => (JSON.parse(String(message.content)) as { fight: string }).fight),
    )
    .join("\n");

describeLayer("hob-read-fight", shared, (it) => {
  describe("the creator's read of the fight on the table", () => {
    it.effect("reads the whole fight, and the options of the monster that is up", () =>
      Effect.gen(function* () {
        const { dm, ford } = yield* Fixture;
        const proof = yield* asDm(dm, ford.campaign.id);
        const read = yield* Effect.flatMap(TableFight, (fight) => fight.onTable(proof));
        expect(read?.run.id).toBe(ford.run.id);
        expect(read?.combatants.map((row) => row.displayName)).toEqual(["Ford Priest", "Brannoc"]);
        expect(read?.run.activeCombatantId).toBe(ford.foe.id);
        expect(read?.scene.beats.map((beat) => beat.text)).toEqual([
          "The priest keeps the altar between itself and the party.",
        ]);
        expect(read?.options?.up).toBe(true);
        const ids = read?.options?.options.map((option) => option.id) ?? [];
        expect(ids).toContain("actions/Mace");
        // The spells its spellcasting names, read from the bundle: a cantrip
        // the options offer, not one they leave out as unsupplied.
        const flame = read?.options?.options.find((option) => option.name === "Sacred Flame");
        expect(flame?.slot).toBe("action");
        expect(read?.options?.omitted.map((omission) => omission.reason)).not.toContain(
          "spell not supplied",
        );
        // Through `read` by path, the same answer.
        const byPath = yield* Effect.flatMap(TableFight, (fight) =>
          fight.read(proof, ford.session.id, ford.run.id),
        );
        expect(byPath.combatants.map((row) => row.id)).toEqual(
          read?.combatants.map((row) => row.id),
        );
      }),
    );

    it.effect("is no fight at a table with nothing on it", () =>
      Effect.gen(function* () {
        const { dm, quiet } = yield* Fixture;
        const proof = yield* asDm(dm, quiet.id);
        expect(yield* Effect.flatMap(TableFight, (fight) => fight.onTable(proof))).toBeUndefined();
      }),
    );

    it.effect("is NotFound to a player, who cannot be given the proof", () =>
      Effect.gen(function* () {
        const { ford } = yield* Fixture;
        const refused = yield* Effect.flip(asDm(ford.player, ford.campaign.id));
        expect(refused._tag).toBe("NotFound");
      }),
    );

    it.effect("is NotFound for another campaign's run, by its own night or this one", () =>
      Effect.gen(function* () {
        const { dm, ford, second, elsewhere } = yield* Fixture;
        const proof = yield* asDm(dm, ford.campaign.id);
        const fight = yield* TableFight;
        for (const [sessionId, runId] of [
          [second.session.id, second.run.id],
          [ford.session.id, second.run.id],
          [elsewhere.session.id, elsewhere.run.id],
        ] as const) {
          const refused = yield* Effect.flip(fight.read(proof, sessionId, runId));
          expect(refused._tag).toBe("NotFound");
        }
      }),
    );
  });

  describe("readFight", () => {
    it.effect("is offered to the creator's toolkit and to no player's", () =>
      Effect.sync(() => {
        expect(Object.keys(HobToolkit.tools)).toContain("readFight");
        expect(Object.keys(playerToolkitOver(NO_VOCABULARY).tools)).not.toContain("readFight");
      }),
    );

    it.effect("reads this table's fight out to the model, and not one byte of another's", () =>
      Effect.gen(function* () {
        const { dm, ford } = yield* Fixture;
        // Fog over the priest's square: the party cannot see it, and Hob is told.
        const proof = yield* asDm(dm, ford.campaign.id);
        const maps = yield* BattleMaps;
        const at = (yield* Effect.flatMap(TableFight, (fight) => fight.onTable(proof)))
          ?.combatants[0]?.position;
        if (at === undefined || at === null)
          return yield* Effect.die(new Error("the priest has no square"));
        yield* maps.updateFog(proof, ford.session.id, ford.run.id, { hide: [at] });
        const { requests } = yield* ask(
          dm,
          ford.campaign.id,
          "Who's hurt, and what can the priest do?",
        );
        yield* maps.updateFog(proof, ford.session.id, ford.run.id, { reveal: [at] });

        const first = JSON.stringify(requests[0]?.tools ?? []);
        expect(first).toContain("readFight");
        const said = fightSaid(requests);
        expect(said).toContain("Ford Priest");
        expect(said).toContain('#2 "Brannoc" (player character, initiative 10): HP 31/31, AC 18');
        expect(said).toContain('Up: #1 "Ford Priest".');
        expect(said).toContain("The priest keeps the altar between itself and the party.");
        expect(said).toContain("Fog covers 1 square.");
        expect(said).toMatch(/#1 ▶ "Ford Priest" \(monster, initiative 20\): [^\n]*; under fog\n/);
        expect(said).toContain("Options now:");
        expect(said).toContain("actions/Mace");
        // The bundle's Sacred Flame, an action; not the Library's bonus action.
        expect(said).toMatch(/\("Sacred Flame"\): action; cantrip; DC \d+ DEX save/);
        expect(said).toContain("Standard actions, each its action: standard/Dash");
        // Nothing signed: no picture, no portrait.
        expect(said).not.toMatch(/\/(portraits|campaign-images|battle-map)/);

        // The sentinel lives in another DM's fight and in this DM's other
        // table; neither reaches the provider in any request.
        expect(JSON.stringify(requests)).not.toContain(SENTINEL);
      }),
    );

    it.effect("says plainly when no fight is on the table", () =>
      Effect.gen(function* () {
        const { dm, quiet } = yield* Fixture;
        const { requests } = yield* ask(dm, quiet.id, "Who's hurt?");
        expect(fightSaid(requests)).toContain("No fight is on the table.");
        expect(JSON.stringify(requests)).not.toContain(SENTINEL);
      }),
    );

    it.effect("never reaches a player's Hob, which has no such tool", () =>
      Effect.gen(function* () {
        const { ford } = yield* Fixture;
        const { requests } = yield* ask(ford.player, ford.campaign.id, "How hurt is the priest?");
        const offered = (requests[0]?.tools ?? []).map(
          (tool) => (tool.function as { name?: string } | undefined)?.name,
        );
        expect(offered).not.toContain("readFight");
        const shown = JSON.stringify(requests);
        expect(shown).not.toContain("Ford Priest");
        expect(shown).not.toContain(SENTINEL);
      }),
    );
  });
});
