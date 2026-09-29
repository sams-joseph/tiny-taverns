import {
  Actor,
  type AbilityScoreId,
  CurrentActor,
  type Feat,
  type FeatLibraryCreate,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient, Statement } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Feats } from "../src/repo/Feats.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { anAccount } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **A page of feats costs the same number of statements whatever its length.**
 *
 * `Feats` hydrates every row's description and prerequisites from their own
 * tables, and it used to do that one feat at a time: two statements per feat
 * on top of the page's own. The set-based read takes each child table once
 * for every feat on the page.
 *
 * Two things are pinned here, and neither is visible in a response:
 *
 *   1. **The count does not grow with the page.** Measured with
 *      `Statement.CurrentTransformer`, which sees every statement the effect
 *      puts on the wire and nothing any other fiber does.
 *   2. **Reading many at once answers what reading each alone does.** Filing
 *      children under their feat in JS is where a set-based read can go wrong,
 *      so every feat on the page is compared with the same feat read alone.
 */
const runtime = ManagedRuntime.make(
  Layer.mergeAll(Accounts.layer, Feats.layer).pipe(
    Layer.provideMerge(migratedDatabase("taverns_test_feats_hydration")),
  ),
);
afterAll(() => runtime.dispose());

const as =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** What `effect` answers, and the text of every statement it ran to answer it. */
const counted = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const statements: Array<string> = [];
    const value = yield* Effect.provideService(effect, Statement.CurrentTransformer, (statement) =>
      Effect.sync(() => {
        statements.push(statement.compile()[0]);
        return statement;
      }),
    );
    return { value, statements };
  });

const run = <A, E>(effect: Effect.Effect<A, E, Feats>) => runtime.runPromise(Effect.orDie(effect));

/**
 * The bundle's ability scores, and a creator whose Library holds a dozen feats
 * with every shape of child: no description or two lines, no prerequisite, one,
 * or two in one group — written in an order that is not the ability's name.
 */
const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment();
  yield* importSystemOptions();
  const feats = yield* Feats;
  const sql = yield* SqlClient.SqlClient;
  const abilities = yield* sql<{ readonly id: AbilityScoreId }>`
    select id::text from ability_score order by name desc
  `;

  const dm = yield* anAccount("Jo");
  const written: Array<Feat> = [];
  for (let index = 0; index < 12; index++) {
    const payload: FeatLibraryCreate = {
      name: `Salt-Road Feat ${String(index).padStart(2, "0")}`,
      description: index % 3 === 0 ? [] : [`First line of ${index}.`, `Second line of ${index}.`],
      prerequisites: [
        { abilityScoreId: abilities[index % abilities.length]!.id, minimumScore: 13 },
        { abilityScoreId: abilities[(index + 1) % abilities.length]!.id, minimumScore: 15 },
      ].slice(0, index % 3),
    };
    written.push(yield* as(dm)(feats.libraryCreate(payload)));
  }
  return { dm, written };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

describe("a page of feats", () => {
  it("runs the same statements for one feat as for every feat", async () => {
    const { dm, written } = fixture;
    const [one, all, none] = await run(
      Effect.gen(function* () {
        const feats = yield* Feats;
        return yield* as(dm)(
          Effect.all([
            counted(feats.library({ limit: 1 })),
            counted(feats.library({ limit: 200 })),
            counted(feats.library({ q: "nothing is called this" })),
          ]),
        );
      }),
    );

    expect(one.value.items).toHaveLength(1);
    expect(all.value.items.length).toBeGreaterThanOrEqual(written.length);
    // The page, then its descriptions and its prerequisites — once each.
    expect(all.statements).toHaveLength(3);
    expect(one.statements).toHaveLength(all.statements.length);
    // An empty page has no children to read.
    expect(none.value.items).toEqual([]);
    expect(none.statements).toHaveLength(1);
  });

  it("answers for each feat what reading that feat alone does", async () => {
    const { dm, written } = fixture;
    const [listed, alone] = await run(
      Effect.gen(function* () {
        const feats = yield* Feats;
        const listed = yield* as(dm)(feats.library({ limit: 200 }));
        const alone = yield* Effect.forEach(listed.items, (feat) =>
          as(dm)(feats.libraryFindById(feat.id)),
        );
        return [listed.items, alone] as const;
      }),
    );

    expect(listed).toEqual(alone);
    // And each is what was written, children in the order they were written.
    for (const feat of written) {
      const read = listed.find((candidate) => candidate.id === feat.id);
      expect(read).toEqual(feat);
    }
    expect(written.map((feat) => feat.prerequisites.length)).toContain(2);
    expect(written.map((feat) => feat.description.length)).toContain(0);
  });

  it("carries the page on from where it stopped, one feat at a time", async () => {
    const { dm } = fixture;
    const [paged, whole] = await run(
      Effect.gen(function* () {
        const feats = yield* Feats;
        const whole = yield* as(dm)(feats.library({ limit: 200 }));
        const paged: Array<Feat> = [];
        let page = yield* as(dm)(feats.library({ limit: 5 }));
        paged.push(...page.items);
        while (page.nextCursor !== null) {
          page = yield* as(dm)(feats.library({ limit: 5, cursor: page.nextCursor }));
          paged.push(...page.items);
        }
        return [paged, whole.items] as const;
      }),
    );

    expect(paged).toEqual(whole);
  });
});
