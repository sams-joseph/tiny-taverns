import { Actor, type CreatureId, CurrentActor } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { importSystemCreatures } from "../src/bestiary/import.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { crSortFor, Creatures } from "../src/repo/Creatures.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { aPlayerAt, anAccount, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The bestiary's own visibility properties.
 *
 * `visibility.test.ts` and `prep-visibility.test.ts` establish the campaign-
 * scoped case. This file is about the one table that is *not* campaign-scoped:
 * a `system` creature has no `campaign_id` at all, so the ordinary predicate
 * does not apply to it and a new one does. A global row reachable by the wrong
 * actor is the failure mode, and reasoning about a `WHERE` clause is not
 * evidence — every claim here is a query someone actually ran.
 */
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Creatures.layer,
    EncounterCreatures.layer,
    Encounters.layer,
    Invites.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_bestiary"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One DM with two tables, a second DM with one, and the bundled corpus loaded
 * exactly as `pnpm -F server bestiary:import` loads it.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;

  yield* importSystemCreatures();

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road", visibility: "shared" }));
  const otherTable = yield* as(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );

  // No visibility named: what this comes out as is the column default's doing.
  const authored = yield* as(
    creatures.create(campaign.id, {
      name: "The Ferryman's Wife",
      size: "Medium",
      type: "Fey",
      cr: "5",
      ac: 17,
      hp: 82,
      environments: ["River"],
    }),
  );
  const sharedCreature = yield* as(
    creatures.create(campaign.id, {
      name: "Reed Skiff",
      type: "Beast",
      cr: "1/8",
      ac: 11,
      hp: 8,
      visibility: "shared",
    }),
  );
  const creatureElsewhere = yield* as(
    creatures.create(otherTable.id, {
      name: "Whatever Is In The Crate",
      type: "Aberration",
      cr: "8",
      ac: 16,
      hp: 110,
      visibility: "shared",
    }),
  );

  const encounter = yield* as(
    encounters.create(campaign.id, { name: "Ambush in the reeds", difficulty: "Medium" }),
  );
  const encounterElsewhere = yield* as(
    encounters.create(otherTable.id, { name: "Whatever is in the crate" }),
  );

  // The global corpus, found by name rather than by id — there is no endpoint
  // that mints one, which is the point of `bestiary/import.ts`.
  const corpus = yield* as(creatures.list(campaign.id, { scope: "system" }));
  const goblinBoss = corpus.find((creature) => creature.name === "Goblin Boss")!;

  const outsider = yield* anAccount("Someone else");
  const outsiderCampaign = yield* withActor(outsider)(
    campaigns.create({ name: "A different table", visibility: "shared" }),
  );

  const player = yield* aPlayerAt(campaign.id, "Pim");

  return {
    dm,
    player,
    outsider,
    outsiderCampaign,
    campaign,
    otherTable,
    authored,
    sharedCreature,
    creatureElsewhere,
    encounter,
    encounterElsewhere,
    goblinBoss,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;
let creatures: (typeof Creatures)["Service"];
let roster: (typeof EncounterCreatures)["Service"];
let encounters: (typeof Encounters)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  creatures = await runtime.runPromise(Creatures);
  roster = await runtime.runPromise(EncounterCreatures);
  encounters = await runtime.runPromise(Encounters);
}, 60_000);

describe("challenge ratings", () => {
  it("sort where they read, including the fractional ones", () => {
    // `"1/4"` (`data.js:38`) is the whole reason there are two columns.
    expect(crSortFor("1/8")).toBe(0.125);
    expect(crSortFor("1/4")).toBe(0.25);
    expect(crSortFor("1/2")).toBe(0.5);
    expect(crSortFor("1")).toBe(1);
    expect(crSortFor("30")).toBe(30);
  });

  it("puts a rating it cannot read first rather than refusing the creature", () => {
    // The DM asked to save a creature, not to satisfy a parser. `crSort` is
    // there to be overridden when this default is wrong.
    expect(crSortFor("—")).toBe(0);
    expect(crSortFor("Varies")).toBe(0);
    expect(crSortFor("")).toBe(0);
  });
});

describe("the new tables fail closed", () => {
  it("stores a creature created with no explicit visibility as dm", () => {
    expect(fixture.authored.visibility).toBe("dm");
    expect(fixture.authored.origin).toBe("authored");
    expect(fixture.authored.assistantTurnId).toBeNull();
  });

  it("defaults at the column, not only in the payload schema", async () => {
    // Inserted straight into the table, bypassing every TypeScript path — the
    // property a table added later inherits for free.
    const rows = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const creature = yield* sql<{
          readonly id: CreatureId;
          readonly visibility: string;
          readonly origin: string;
          readonly cr_sort: number;
        }>`
          insert into creature (campaign_id, name, type, cr, ac, hp)
          values (${fixture.campaign.id}, 'inserted behind the repository', 'Ooze', '1', 10, 10)
          returning id, visibility, origin, cr_sort
        `;
        const line = yield* sql<{
          readonly visibility: string;
          readonly origin: string;
          readonly count: number;
        }>`
          insert into encounter_creature (encounter_id, creature_id)
          values (${fixture.encounter.id}, ${creature[0]!.id})
          returning visibility, origin, count
        `;
        return { creature: creature[0]!, line: line[0]! };
      }).pipe(Effect.orDie),
    );

    expect(rows.creature.visibility).toBe("dm");
    expect(rows.creature.origin).toBe("authored");
    expect(rows.line).toEqual({ visibility: "dm", origin: "authored", count: 1 });
  });

  it("refuses a system creature that names a campaign, and a global one that does not", async () => {
    // `creature_system_is_global`. The two states are the same statement, so
    // there is no campaign-scoped system row and no global authored one — which
    // is what makes immutability a consequence of the write predicate rather
    // than a rule to remember.
    const insert = (origin: string, campaignId: string | null) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`
            insert into creature ${sql.insert({
              campaign_id: campaignId,
              origin,
              name: `${origin}-${String(campaignId)}`,
              type: "Ooze",
              cr: "1",
              ac: 10,
              hp: 10,
            })}
          `;
        }).pipe(Effect.result),
      );

    expect((await insert("system", fixture.campaign.id))._tag).toBe("Failure");
    expect((await insert("authored", null))._tag).toBe("Failure");
    expect((await insert("system", null))._tag).toBe("Success");

    // The one that succeeded is a real global row, and the corpus assertions
    // further down count. Put the shared corpus back the way the import left it
    // so the order of these tests does not matter.
    await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`delete from creature where name = 'system-null'`;
      }).pipe(Effect.orDie),
    );
  });
});

describe("the global system corpus", () => {
  it("is reachable from every campaign the actor can read", async () => {
    const here = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.campaign.id, { scope: "system" })),
    );
    const there = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.otherTable.id, { scope: "system" })),
    );

    expect(here.map((creature) => creature.name)).toContain("Goblin Boss");
    expect(there.map((creature) => creature.name)).toContain("Goblin Boss");
    // Global means "no campaign", not "some campaign".
    expect(here.every((creature) => creature.campaignId === null)).toBe(true);
    expect(here.every((creature) => creature.origin === "system")).toBe(true);
  });

  it("carries nothing campaign-scoped along with it", async () => {
    // The crisp pair: the same actor, the same corpus, two campaigns — and the
    // campaign's own creatures do not travel between them.
    const here = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.campaign.id, {})),
    );
    const there = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.otherTable.id, {})),
    );

    expect(here.map((creature) => creature.id)).toContain(fixture.authored.id);
    expect(there.map((creature) => creature.id)).not.toContain(fixture.authored.id);
    expect(here.map((creature) => creature.id)).not.toContain(fixture.creatureElsewhere.id);
    expect(there.map((creature) => creature.id)).toContain(fixture.creatureElsewhere.id);
  });

  it("is not reachable through a campaign the actor cannot read", async () => {
    // The failure this predicate exists to prevent. Written the natural way —
    // `campaign_id is null OR <the campaign-scoped test>` — a global row would
    // come back for *any* authenticated request naming *any* campaign id,
    // including one belonging to somebody else. `findById` is reached by path,
    // and a path is a claim.
    const listed = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.dm)(creatures.list(fixture.outsiderCampaign.id, { scope: "system" })),
      ),
    );
    const found = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.dm)(
          creatures.findById(fixture.outsiderCampaign.id, fixture.goblinBoss.id),
        ),
      ),
    );

    expect(listed._tag).toBe("NotFound");
    expect(found._tag).toBe("NotFound");
    expect(found.resource).toBe("creature");

    // …and the same creature through a campaign this DM does own is right there.
    const honest = await runtime.runPromise(
      withActor(fixture.dm)(creatures.findById(fixture.campaign.id, fixture.goblinBoss.id)),
    );
    expect(honest.name).toBe("Goblin Boss");
  });

  it("still answers to the row's own visibility, so a player gets no stat blocks", async () => {
    // "Global" means shared between a DM's campaigns, not shared with their
    // players. A stat block is exactly what the product says a player must not
    // have — the hag's legendary actions are the example.
    const listed = await runtime.runPromise(
      withActor(fixture.player)(creatures.list(fixture.campaign.id, {})),
    );
    const found = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(creatures.findById(fixture.campaign.id, fixture.goblinBoss.id)),
      ),
    );

    expect(found._tag).toBe("NotFound");
    // Only the one the DM deliberately shared, and nothing global.
    expect(listed.map((creature) => creature.id)).toEqual([fixture.sharedCreature.id]);
  });

  it("reaches a shared global row through a membership, which is what changed under it", async () => {
    // `corpusRowReadable` composes `campaignReadable`, so when reach stopped
    // meaning ownership this predicate quietly changed too and nothing in its
    // own text says so: a global row is now reachable through a **membership**
    // rather than through account ownership. The test above proves the default
    // still fails closed; this one proves the other half is really the row's own
    // visibility and not the campaign gate accidentally refusing everything.
    //
    // Written with raw SQL because nothing ships a way to share a system
    // creature — `bestiary/import.ts` never writes `visibility`, deliberately,
    // so an upgrade cannot un-share one. The point here is what the predicate
    // permits, not what a path does.
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`
          update creature set visibility = 'shared' where id = ${fixture.goblinBoss.id}
        `;
        const found = yield* Effect.provideService(
          creatures.findById(fixture.campaign.id, fixture.goblinBoss.id),
          CurrentActor,
          fixture.player,
        );
        // A stranger's membership reaches nothing, however global the row is:
        // the campaign gate sits outside the union, not inside a bare `OR`.
        const throughAnother = yield* Effect.provideService(
          creatures.findById(fixture.outsiderCampaign.id, fixture.goblinBoss.id),
          CurrentActor,
          fixture.player,
        ).pipe(Effect.flip);
        yield* sql`update creature set visibility = 'dm' where id = ${fixture.goblinBoss.id}`;
        return { found, throughAnother };
      }).pipe(Effect.orDie),
    );

    expect(seen.found.name).toBe("Goblin Boss");
    expect(seen.throughAnother._tag).toBe("NotFound");
  });

  it("is immutable, even to the DM whose campaign reaches it", async () => {
    // No `origin = 'system'` check anywhere in the repository. The write
    // predicate needs `campaign_id` to equal the campaign in the path, and a
    // null never does.
    const updated = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.dm)(
          creatures.update(fixture.campaign.id, fixture.goblinBoss.id, { name: "tampered" }),
        ),
      ),
    );
    const removed = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.dm)(creatures.remove(fixture.campaign.id, fixture.goblinBoss.id)),
      ),
    );

    expect(updated._tag).toBe("NotFound");
    expect(removed._tag).toBe("NotFound");

    const untouched = await runtime.runPromise(
      withActor(fixture.dm)(creatures.findById(fixture.campaign.id, fixture.goblinBoss.id)),
    );
    expect(untouched.name).toBe("Goblin Boss");
  });

  it("re-imports as an update, so a reskin's ancestor survives an upgrade", async () => {
    const again = await runtime.runPromise(importSystemCreatures().pipe(Effect.orDie));

    expect(again.inserted).toBe(0);
    expect(again.updated).toBeGreaterThan(0);

    const corpus = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.campaign.id, { scope: "system" })),
    );
    expect(corpus.filter((creature) => creature.name === "Goblin Boss")).toHaveLength(1);
  });
});

describe("deriving a copy — the reskin", () => {
  it("copies a system creature into the campaign, edits applied, ancestry kept", async () => {
    const copy = await runtime.runPromise(
      withActor(fixture.dm)(
        creatures.derive(fixture.campaign.id, fixture.goblinBoss.id, {
          name: "Grask, Boss of the Reeds",
          environments: ["Marsh"],
        }),
      ),
    );

    expect(copy.id).not.toBe(fixture.goblinBoss.id);
    expect(copy.derivedFrom).toBe(fixture.goblinBoss.id);
    expect(copy.campaignId).toBe(fixture.campaign.id);
    // The DM wrote the changes, so the DM is the author, whatever it came from.
    expect(copy.origin).toBe("authored");
    expect(copy.name).toBe("Grask, Boss of the Reeds");
    expect(copy.environments).toEqual(["Marsh"]);
    // Everything not patched came across, document and all.
    expect(copy.ac).toBe(17);
    expect(copy.cr).toBe("1");
    expect(copy.crSort).toBe(1);
    expect(copy.statBlock.traits.map((trait) => trait.name)).toContain("Nimble Escape");
    expect(copy.statBlock.traits.find((trait) => trait.name === "Scimitar")?.dice).toBe("1d6+2");
    // A copy is a new row, and a new row fails closed.
    expect(copy.visibility).toBe("dm");

    // …and unlike its ancestor, it is the DM's to change.
    const renamed = await runtime.runPromise(
      withActor(fixture.dm)(creatures.update(fixture.campaign.id, copy.id, { cr: "1/2" })),
    );
    expect(renamed.cr).toBe("1/2");
    expect(renamed.crSort).toBe(0.5);
  });

  it("cannot derive from a creature the actor cannot reach", async () => {
    const error = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.dm)(
          creatures.derive(fixture.campaign.id, fixture.creatureElsewhere.id, {}),
        ),
      ),
    );

    expect(error._tag).toBe("NotFound");
    expect(error.resource).toBe("creature");
  });

  it("is refused to a player, who cannot write to the campaign at all", async () => {
    const error = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          creatures.derive(fixture.campaign.id, fixture.sharedCreature.id, {}),
        ),
      ),
    );

    expect(error._tag).toBe("NotFound");
    expect(error.resource).toBe("campaign");
  });
});

describe("a campaign-scoped actor", () => {
  it("cannot read the other campaign's creatures, by either path", async () => {
    const honest = await runtime.runPromise(
      Effect.flip(withActor(fixture.player)(creatures.list(fixture.otherTable.id, {}))),
    );
    // Naming this campaign while asking for a creature that lives in the other
    // one — the shape that would work if the predicate trusted the id.
    const smuggled = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          creatures.findById(fixture.campaign.id, fixture.creatureElsewhere.id),
        ),
      ),
    );

    expect(honest._tag).toBe("NotFound");
    expect(smuggled._tag).toBe("NotFound");

    // …and it really is there and really is shared.
    const asDm = await runtime.runPromise(
      withActor(fixture.dm)(
        creatures.findById(fixture.otherTable.id, fixture.creatureElsewhere.id),
      ),
    );
    expect(asDm.visibility).toBe("shared");
  });

  it("narrows a dm-role actor too, so scope does not depend on the role", async () => {
    const scopedDm = scopedTo(fixture.dm, fixture.campaign.id);

    const listed = await runtime.runPromise(
      Effect.flip(withActor(scopedDm)(creatures.list(fixture.otherTable.id, {}))),
    );
    // The global corpus is no way around it either: it is reachable *through a
    // readable campaign*, and this credential does not reach that campaign.
    const corpus = await runtime.runPromise(
      Effect.flip(withActor(scopedDm)(creatures.list(fixture.otherTable.id, { scope: "system" }))),
    );

    expect(listed._tag).toBe("NotFound");
    expect(corpus._tag).toBe("NotFound");
  });
});

describe("another account", () => {
  it("reaches neither the campaign's creatures nor its roster", async () => {
    const creature = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.outsider)(
          creatures.findById(fixture.campaign.id, fixture.sharedCreature.id),
        ),
      ),
    );
    const line = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.outsider)(roster.list(fixture.campaign.id, fixture.encounter.id)),
      ),
    );

    expect(creature._tag).toBe("NotFound");
    expect(line._tag).toBe("NotFound");
  });
});

describe("an encounter's roster", () => {
  it("accepts a campaign creature and a global one, and makes the card's count true", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const encounter = yield* encounters.create(fixture.campaign.id, {
          name: "Six in the reeds",
        });
        const empty = yield* encounters.findById(fixture.campaign.id, encounter.id);

        const own = yield* roster.create(fixture.campaign.id, encounter.id, {
          creatureId: fixture.authored.id,
          count: 2,
        });
        const global = yield* roster.create(fixture.campaign.id, encounter.id, {
          creatureId: fixture.goblinBoss.id,
          count: 4,
        });

        const listed = yield* roster.list(fixture.campaign.id, encounter.id);
        const counted = yield* encounters.findById(fixture.campaign.id, encounter.id);
        const raised = yield* roster.update(fixture.campaign.id, encounter.id, own.id, {
          count: 3,
        });
        const afterRaise = yield* encounters.findById(fixture.campaign.id, encounter.id);
        yield* roster.remove(fixture.campaign.id, encounter.id, global.id);
        const afterRemove = yield* encounters.findById(fixture.campaign.id, encounter.id);

        return { encounter, empty, own, global, listed, counted, raised, afterRaise, afterRemove };
      }).pipe(withActor(fixture.dm), Effect.orDie),
    );

    expect(seen.empty.creatureCount).toBe(0);
    expect(seen.own.count).toBe(2);
    // The fixture's `count: 6` — `sum(encounter_creature.count)`, not a column.
    expect(seen.counted.creatureCount).toBe(6);
    expect(seen.listed.map((line) => line.creatureId)).toEqual([
      fixture.authored.id,
      fixture.goblinBoss.id,
    ]);
    expect(seen.raised.count).toBe(3);
    expect(seen.afterRaise.creatureCount).toBe(7);
    expect(seen.afterRemove.creatureCount).toBe(3);
  });

  it("counts what the actor can see, so the card and the list agree", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const encounter = yield* Effect.provideService(
          encounters.create(fixture.campaign.id, {
            name: "Half of it is hidden",
            visibility: "shared",
          }),
          CurrentActor,
          fixture.dm,
        );
        yield* Effect.provideService(
          roster.create(fixture.campaign.id, encounter.id, {
            creatureId: fixture.authored.id,
            count: 5,
          }),
          CurrentActor,
          fixture.dm,
        );
        yield* Effect.provideService(
          roster.create(fixture.campaign.id, encounter.id, {
            creatureId: fixture.sharedCreature.id,
            count: 2,
            visibility: "shared",
          }),
          CurrentActor,
          fixture.dm,
        );

        const asDm = yield* Effect.provideService(
          encounters.findById(fixture.campaign.id, encounter.id),
          CurrentActor,
          fixture.dm,
        );
        const asPlayer = yield* Effect.provideService(
          encounters.findById(fixture.campaign.id, encounter.id),
          CurrentActor,
          fixture.player,
        );
        const playerList = yield* Effect.provideService(
          roster.list(fixture.campaign.id, encounter.id),
          CurrentActor,
          fixture.player,
        );

        return { asDm, asPlayer, playerList };
      }).pipe(Effect.orDie),
    );

    expect(seen.asDm.creatureCount).toBe(7);
    expect(seen.asPlayer.creatureCount).toBe(2);
    expect(seen.playerList).toHaveLength(1);
  });

  it("refuses a creature from another campaign, and an encounter from another campaign", async () => {
    // Two different containments. The creature is checked against the same read
    // predicate a creature read uses — it cannot ride on a composite foreign key
    // the way `note.encounter_id` does, because half the rows it may point at
    // are global and have no campaign to name in one.
    const smuggledCreature = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.dm)(
          roster.create(fixture.campaign.id, fixture.encounter.id, {
            creatureId: fixture.creatureElsewhere.id,
          }),
        ),
      ),
    );
    // …and the encounter id is a claim like any other.
    const smuggledEncounter = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.dm)(
          roster.create(fixture.campaign.id, fixture.encounterElsewhere.id, {
            creatureId: fixture.authored.id,
          }),
        ),
      ),
    );

    // The 404 names the thing the caller asked for and could not have, which
    // is a different thing in each case.
    expect(smuggledCreature).toMatchObject({ _tag: "NotFound", resource: "creature" });
    expect(smuggledEncounter).toMatchObject({ _tag: "NotFound", resource: "encounter" });
  });

  it("reports a repeated creature as a conflict rather than doubling the roster", async () => {
    const error = await runtime.runPromise(
      Effect.gen(function* () {
        const encounter = yield* encounters.create(fixture.campaign.id, { name: "Twice" });
        yield* roster.create(fixture.campaign.id, encounter.id, {
          creatureId: fixture.authored.id,
        });
        return yield* Effect.flip(
          roster.create(fixture.campaign.id, encounter.id, { creatureId: fixture.authored.id }),
        );
      }).pipe(withActor(fixture.dm), Effect.orDie),
    );

    expect(error._tag).toBe("Conflict");
  });

  it("refuses to delete a creature that is still on one", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const creature = yield* creatures.create(fixture.campaign.id, {
          name: "Still in use",
          type: "Beast",
          cr: "1",
          ac: 12,
          hp: 20,
        });
        const encounter = yield* encounters.create(fixture.campaign.id, { name: "Using it" });
        const line = yield* roster.create(fixture.campaign.id, encounter.id, {
          creatureId: creature.id,
        });

        const refused = yield* Effect.flip(creatures.remove(fixture.campaign.id, creature.id));
        yield* roster.remove(fixture.campaign.id, encounter.id, line.id);
        const allowed = yield* Effect.result(creatures.remove(fixture.campaign.id, creature.id));

        return { refused, allowed };
      }).pipe(withActor(fixture.dm), Effect.orDie),
    );

    expect(seen.refused._tag).toBe("Conflict");
    expect(seen.allowed._tag).toBe("Success");
  });

  it("goes away with its encounter, without taking the creatures with it", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const encounter = yield* encounters.create(fixture.campaign.id, { name: "Doomed" });
        yield* roster.create(fixture.campaign.id, encounter.id, {
          creatureId: fixture.authored.id,
        });
        yield* encounters.remove(fixture.campaign.id, encounter.id);
        return yield* creatures.findById(fixture.campaign.id, fixture.authored.id);
      }).pipe(withActor(fixture.dm), Effect.orDie),
    );

    expect(seen.name).toBe("The Ferryman's Wife");
  });
});

describe("the bestiary's filters", () => {
  it("finds a creature by a substring of its name and by a word only the document has", async () => {
    const substring = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.campaign.id, { q: "gob" })),
    );
    const fullText = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.campaign.id, { q: "nimble escape" })),
    );

    // `Bestiary.jsx:11` is `name.includes(q)`, so half a word has to work…
    expect(substring.map((creature) => creature.name)).toContain("Goblin Boss");
    // …and a trait that is in no column at all has to work too.
    expect(fullText.map((creature) => creature.name)).toContain("Goblin Boss");
  });

  it("treats a query full of punctuation as a search, not as a syntax error", async () => {
    // `websearch_to_tsquery` rather than `to_tsquery`, and the `ILIKE`
    // wildcards escaped — a search box is not an expression language.
    const results = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.campaign.id, { q: "100% & _boss_ | (" })),
    );

    expect(results).toEqual([]);
  });

  it("matches any of the environment toggles, and orders by the sort the client asked for", async () => {
    const marsh = await runtime.runPromise(
      withActor(fixture.dm)(
        creatures.list(fixture.campaign.id, { environments: ["Marsh"], scope: "system" }),
      ),
    );
    const byCr = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.campaign.id, { sort: "cr", scope: "system" })),
    );
    const byName = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.campaign.id, { sort: "name", scope: "system" })),
    );

    expect(marsh.map((creature) => creature.name).sort()).toEqual([
      "Bullywug Croaker",
      "Giant Toad",
      "Goblin Boss",
      "Marsh Hag",
      "Will-o'-Wisp",
    ]);
    // "1/4" first, and it is the fractional one that proves the sort key works.
    expect(byCr[0]!.name).toBe("Bullywug Croaker");
    expect(byCr.map((creature) => creature.crSort)).toEqual([0.25, 1, 1, 2, 3, 5]);
    expect(byName.map((creature) => creature.name)).toEqual([
      "Bullywug Croaker",
      "Ferryman's Shade",
      "Giant Toad",
      "Goblin Boss",
      "Marsh Hag",
      "Will-o'-Wisp",
    ]);
  });

  it("splits the corpus the way the marketing copy does", async () => {
    // "Save your own creatures next to the official ones" — one list by
    // default, and the two halves nameable when a DM wants one of them.
    const all = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.campaign.id, {})),
    );
    const mine = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.campaign.id, { scope: "campaign" })),
    );
    const official = await runtime.runPromise(
      withActor(fixture.dm)(creatures.list(fixture.campaign.id, { scope: "system" })),
    );

    expect(mine.every((creature) => creature.campaignId === fixture.campaign.id)).toBe(true);
    expect(official.every((creature) => creature.campaignId === null)).toBe(true);
    expect(all).toHaveLength(mine.length + official.length);
  });
});
