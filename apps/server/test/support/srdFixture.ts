import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { transformedMonster } from "../../src/bestiary/import.js";
import { SYSTEM_CREATURES } from "../../src/bestiary/systemCreatures.js";
import { MONSTER_RAW } from "../../src/bestiary/systemMonsters.js";
import { transformedSpell } from "../../src/spells/import.js";
import { SPELL_RAW } from "../../src/spells/systemSpells.js";

/**
 * Real SRD stat blocks for `packages/api`'s NPC turn options tests, as the
 * import writes them today. `packages/api` cannot reach the server's corpus,
 * so a handful is checked in as JSON beside the test that reads it;
 * `srd-turn-fixture.test.ts` fails when the import's output moves away from
 * it, and running this file writes it again:
 *
 *     pnpm -F server exec tsx test/support/srdFixture.ts && pnpm format
 *
 * Chosen for what each one exercises: reach and range, a multiattack and its
 * alternatives, recharge, choices, legendary actions that cost and that point
 * at other actions, a burst, a point area, a wide line, slots, innate uses,
 * bonus actions always and on a trigger, a reaction, a +0 to-hit and reach 0,
 * a multiattack naming its strikes otherwise than its actions;
 * and the starter bundle's Goblin Boss, whose attacks are typed traits.
 */
export const SRD_FIXTURE_MONSTERS = [
  "Goblin",
  "Orc",
  "Bandit Captain",
  "Cat",
  "Lion",
  "Swarm of Rats",
  "Adult Red Dragon",
  "Adult Brass Dragon",
  "Ancient Blue Dragon",
  "Storm Giant",
  "Kraken",
  "Mummy Lord",
  "Lich",
  "Priest",
  "Drow",
  "Vampire, Vampire Form",
] as const;

const monsters = MONSTER_RAW as ReadonlyArray<Record<string, unknown>>;
const spells = SPELL_RAW as ReadonlyArray<Record<string, unknown>>;

export const srdFixture = () => {
  const statBlocks = Object.fromEntries(
    SRD_FIXTURE_MONSTERS.map((name) => {
      const row = monsters.find((monster) => monster.name === name);
      if (row === undefined) throw new Error(`no SRD monster named ${name}`);
      return [name, transformedMonster(row).statBlock];
    }),
  );
  const named = new Set(
    Object.values(statBlocks).flatMap((block) =>
      [block?.specialAbilities ?? [], block?.actions ?? []].flatMap((features) =>
        features.flatMap((feature) =>
          (feature.spellcasting?.spells ?? []).map((spell) => spell.name.toLowerCase()),
        ),
      ),
    ),
  );
  const spellRows = Object.fromEntries(
    spells
      .filter((row) => typeof row.name === "string" && named.has(row.name.toLowerCase()))
      .map((row) => {
        const spell = transformedSpell(row);
        return [
          spell.name.toLowerCase(),
          {
            name: spell.name,
            level: spell.level,
            range: spell.range,
            castingTime: spell.castingTime,
            spell: {
              ...(spell.body.attackType === undefined ? {} : { attackType: spell.body.attackType }),
              ...(spell.body.dc === undefined ? {} : { dc: spell.body.dc }),
              ...(spell.body.areaOfEffect === undefined
                ? {}
                : { areaOfEffect: spell.body.areaOfEffect }),
              ...(spell.body.damage === undefined ? {} : { damage: spell.body.damage }),
            },
          },
        ];
      })
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
  // The starter bundle's one stat block, written the way the creature form
  // writes one: its attacks are traits, with no section.
  const goblinBoss = SYSTEM_CREATURES.find((creature) => creature.name === "Goblin Boss");
  if (goblinBoss?.statBlock === undefined) throw new Error("the starter bundle has no Goblin Boss");
  return { statBlocks, starter: { "Goblin Boss": goblinBoss.statBlock }, spells: spellRows };
};

export const SRD_FIXTURE_PATH = new URL(
  "../../../../packages/api/src/fixtures/srd-turn.json",
  import.meta.url,
);

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(SRD_FIXTURE_PATH, `${JSON.stringify(srdFixture(), null, 2)}\n`);
}
