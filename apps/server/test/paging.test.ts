import {
  type Actor,
  type Beat,
  type CampaignId,
  type CreatedOrder,
  type Creature,
  type CreatureSort,
  CurrentActor,
  type Encounter,
  MAX_PAGE_SIZE,
  type Note,
  type Page,
  type PageCursor,
  type SessionId,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Creatures } from "../src/repo/Creatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aPlayerAt, anAccount } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * Pagination, end to end at the repository: the boundaries, the ordering, and
 * the one property that makes a paged read safe.
 *
 * **The safety property is that a page is a `where` clause.** `AGENTS.md`'s
 * actor and visibility contract calls post-filtering in a handler the leak
 * pattern; paging has the same failure mode one step on. Narrow after the
 * predicate and a player asking for five rows gets a handful of somebody else's
 * and then a page of two — a disclosure *and* a short page. So the test that
 * matters most here walks a mixed corpus one row at a time as a player and
 * checks both halves: nothing forbidden, and no page shorter than it should be.
 *
 * The other tests are about the boundary itself. Every one of them compares a
 * walk against an unpaged read of the same query, because the failure a keyset
 * actually has is a repeated or lost row at a page edge and no single-page
 * assertion can see one.
 */
const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  Creatures.layer,
  Encounters.layer,
  Invites.layer,
  Notes.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
);

const runtime = ManagedRuntime.make(
  services.pipe(Layer.provideMerge(migratedDatabase("taverns_test_paging"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * Eleven of each, which is deliberately not a multiple of the page sizes below:
 * a walk that only ever divides exactly never meets the last, short page.
 */
const COUNT = 11;

/** Names that do not sort the same way as insertion order, so `name` is a real ordering. */
const NAMES = [
  "Quaggoth",
  "Bullywug",
  "Marsh Hag",
  "Reed Stalker",
  "Ferryman's Shade",
  "Goblin Boss",
  "Crate Horror",
  "Night Heron",
  "Salt Wraith",
  "Iron Toad",
  "Ash Hound",
];

/** Ratings with repeats, so the `cr` ordering has ties for the tiebreak to settle. */
const RATINGS = ["1/4", "2", "1/4", "5", "1", "2", "1/8", "5", "1", "1/4", "2"];

const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const notes = yield* Notes;
  const beats = yield* Beats;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road", visibility: "shared" }));
  const night = yield* as(sessions.create(campaign.id, { number: 12, visibility: "shared" }));

  for (let index = 0; index < COUNT; index++) {
    // Alternating visibility, so a player's view of every one of these lists is
    // a strict subset with gaps in it — which is what a page boundary has to
    // survive.
    const visibility = index % 2 === 0 ? "shared" : "dm";
    yield* as(
      creatures.create(campaign.id, {
        name: NAMES[index]!,
        type: "Beast",
        cr: RATINGS[index]!,
        ac: 10 + index,
        hp: 10 + index,
        // Every third one lives in a cave, so a filter narrows to a number that
        // is neither everything nor nothing.
        environments: index % 3 === 0 ? ["Cave"] : ["Marsh"],
        visibility,
      }),
    );
    yield* as(notes.create(campaign.id, { title: `Note ${String(index)}`, visibility }));
    yield* as(encounters.create(campaign.id, { name: `Encounter ${String(index)}`, visibility }));
    yield* as(beats.create(campaign.id, night.id, { body: `Beat ${String(index)}`, visibility }));
  }

  const player = yield* aPlayerAt(campaign.id, "Sova");

  return { dm, player, campaign, night };
});

let fixture: Effect.Success<typeof makeFixture>;
beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

/**
 * Walk a paged list to the end, one page at a time, collecting the rows and the
 * size of each page.
 *
 * Bounded so a cursor that never advances fails the test rather than hanging it
 * — a keyset that compares `>=` somewhere loops forever, and a test that hangs
 * is a test nobody reads.
 */
const walk = <A, O extends string>(
  read: (cursor: PageCursor<O> | undefined) => Effect.Effect<Page<A, O>, never, never>,
) =>
  Effect.gen(function* () {
    const rows: Array<A> = [];
    const sizes: Array<number> = [];
    let cursor: PageCursor<O> | undefined = undefined;
    for (let guard = 0; guard < 200; guard++) {
      const page: Page<A, O> = yield* read(cursor);
      rows.push(...page.items);
      sizes.push(page.items.length);
      if (page.nextCursor === null) return { rows, sizes, pages: sizes.length };
      cursor = page.nextCursor;
    }
    throw new Error("a paged walk did not terminate");
  });

const creaturesOf = (actor: Actor, campaignId: CampaignId) =>
  Effect.flatMap(Creatures, (repo) =>
    Effect.succeed(
      (
        sort: CreatureSort,
        limit: number | undefined,
        cursor: PageCursor<CreatureSort> | undefined,
      ) => withActor(actor)(repo.list(campaignId, { sort, limit, cursor })).pipe(Effect.orDie),
    ),
  );

describe("walking a paged list", () => {
  it.each(["cr", "name", "recent"] as const)(
    "returns every row exactly once, in the unpaged order — sorted by %s",
    async (sort) => {
      const seen = await runtime.runPromise(
        Effect.gen(function* () {
          const list = yield* creaturesOf(fixture.dm, fixture.campaign.id);
          // The whole list in one answer, which is what a walk has to reproduce.
          const whole = yield* list(sort, MAX_PAGE_SIZE, undefined);
          const walked = yield* walk<Creature, CreatureSort>((cursor) => list(sort, 3, cursor));
          return { whole, walked };
        }),
      );

      expect(seen.whole.items.length).toBe(COUNT);
      expect(seen.whole.nextCursor).toBeNull();
      expect(seen.walked.rows.map((creature) => creature.id)).toEqual(
        seen.whole.items.map((creature) => creature.id),
      );
      // 3 + 3 + 3 + 2 — the last page short, and no page repeated.
      expect(seen.walked.sizes).toEqual([3, 3, 3, 2]);
    },
    60_000,
  );

  it("ends with a null cursor even when the page size divides the list exactly", async () => {
    // The `limit + 1` probe row is the whole of this: without it a list of
    // eleven read eleven at a time would hand back a cursor, and the page after
    // it would be empty.
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const list = yield* creaturesOf(fixture.dm, fixture.campaign.id);
        return {
          exact: yield* list("name", COUNT, undefined),
          oneShort: yield* list("name", COUNT - 1, undefined),
        };
      }),
    );

    expect(seen.exact.items.length).toBe(COUNT);
    expect(seen.exact.nextCursor).toBeNull();
    expect(seen.oneShort.items.length).toBe(COUNT - 1);
    expect(seen.oneShort.nextCursor).not.toBeNull();
  }, 60_000);

  it("carries on from the cursor rather than from a count", async () => {
    // The property an offset does not have. A row inserted *before* the cursor's
    // position between two pages shifts every offset by one; a keyset names the
    // last row it returned, so page two is unaffected either way.
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const creatures = yield* Creatures;
        const list = yield* creaturesOf(fixture.dm, fixture.campaign.id);
        const first = yield* list("name", 4, undefined);
        yield* withActor(fixture.dm)(
          creatures.create(fixture.campaign.id, {
            // Sorts first by name, so an offset walk would repeat a row here.
            name: "Aardvark",
            type: "Beast",
            cr: "0",
            ac: 10,
            hp: 4,
          }),
        ).pipe(Effect.orDie);
        const second = yield* list("name", 4, first.nextCursor ?? undefined);
        yield* Effect.promise(() =>
          runtime.runPromise(
            Effect.flatMap(Creatures, (repo) =>
              withActor(fixture.dm)(
                repo.list(fixture.campaign.id, { q: "Aardvark", limit: 1 }),
              ).pipe(
                Effect.flatMap((page) =>
                  withActor(fixture.dm)(repo.remove(fixture.campaign.id, page.items[0]!.id)),
                ),
                Effect.orDie,
              ),
            ),
          ),
        );
        return { first, second };
      }),
    );

    const overlap = seen.second.items.filter((creature) =>
      seen.first.items.some((earlier) => earlier.id === creature.id),
    );
    expect(overlap).toEqual([]);
    expect(seen.second.items.length).toBe(4);
  }, 60_000);
});

describe("visibility on a paged read", () => {
  it("gives a player the shared rows only, in full pages", async () => {
    // **The clause is inside the predicate, not applied to the answer.** Half
    // this corpus is `dm`, so a page narrowed afterwards would come back with
    // two or three rows in it and the DM's rows would have been read to produce
    // them. Full pages are the evidence that the database did the narrowing.
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const list = yield* creaturesOf(fixture.player, fixture.campaign.id);
        const asDm = yield* creaturesOf(fixture.dm, fixture.campaign.id);
        const walked = yield* walk<Creature, CreatureSort>((cursor) => list("name", 2, cursor));
        const whole = yield* asDm("name", MAX_PAGE_SIZE, undefined);
        return { walked, whole };
      }),
    );

    const shared = seen.whole.items.filter((creature) => creature.visibility === "shared");
    expect(seen.walked.rows.map((creature) => creature.name)).toEqual(
      shared.map((creature) => creature.name),
    );
    expect(seen.walked.rows.every((creature) => creature.visibility === "shared")).toBe(true);
    // Six shared rows at two a page: 2, 2, 2 — never a page cut short by rows
    // that were read and then dropped.
    expect(seen.walked.sizes).toEqual([2, 2, 2]);
  }, 60_000);

  it("holds for notes, encounters and beats too", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const notes = yield* Notes;
        const encounters = yield* Encounters;
        const beats = yield* Beats;
        const campaignId: CampaignId = fixture.campaign.id;
        const nightId: SessionId = fixture.night.id;
        const player = withActor(fixture.player);
        return {
          notes: yield* walk<Note, CreatedOrder>((cursor) =>
            player(notes.list(campaignId, { limit: 2, cursor })).pipe(Effect.orDie),
          ),
          encounters: yield* walk<Encounter, CreatedOrder>((cursor) =>
            player(encounters.list(campaignId, { limit: 2, cursor })).pipe(Effect.orDie),
          ),
          beats: yield* walk<Beat, CreatedOrder>((cursor) =>
            player(beats.list(campaignId, nightId, { limit: 2, cursor })).pipe(Effect.orDie),
          ),
        };
      }),
    );

    for (const [name, walked] of Object.entries(seen)) {
      expect(walked.sizes, name).toEqual([2, 2, 2]);
      expect(walked.rows.length, name).toBe(6);
      expect(
        walked.rows.every((row) => (row as { visibility: string }).visibility === "shared"),
        name,
      ).toBe(true);
    }
  }, 60_000);

  it("walks the three chronologies in the order they happened", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const notes = yield* Notes;
        const dm = withActor(fixture.dm);
        const whole = yield* dm(notes.list(fixture.campaign.id, { limit: MAX_PAGE_SIZE })).pipe(
          Effect.orDie,
        );
        const walked = yield* walk<Note, CreatedOrder>((cursor) =>
          dm(notes.list(fixture.campaign.id, { limit: 4, cursor })).pipe(Effect.orDie),
        );
        return { whole, walked };
      }),
    );

    expect(seen.whole.items.map((note) => note.title)).toEqual(
      Array.from({ length: COUNT }, (_, index) => `Note ${String(index)}`),
    );
    expect(seen.walked.rows.map((note) => note.title)).toEqual(
      seen.whole.items.map((note) => note.title),
    );
  }, 60_000);
});

describe("the filters, against the paged query", () => {
  it("narrows to one environment — the case the wire used to refuse", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const creatures = yield* Creatures;
        const dm = withActor(fixture.dm);
        const oneChip = yield* dm(
          creatures.list(fixture.campaign.id, { environments: ["Cave"], sort: "name" }),
        ).pipe(Effect.orDie);
        const twoChips = yield* dm(
          creatures.list(fixture.campaign.id, {
            environments: ["Cave", "Marsh"],
            sort: "name",
          }),
        ).pipe(Effect.orDie);
        const noChips = yield* dm(
          creatures.list(fixture.campaign.id, { environments: [], sort: "name" }),
        ).pipe(Effect.orDie);
        const nothing = yield* dm(
          creatures.list(fixture.campaign.id, { environments: ["Moon"], sort: "name" }),
        ).pipe(Effect.orDie);
        const walked = yield* walk<Creature, CreatureSort>((cursor) =>
          dm(
            creatures.list(fixture.campaign.id, {
              environments: ["Cave"],
              sort: "name",
              limit: 2,
              cursor,
            }),
          ).pipe(Effect.orDie),
        );
        return { oneChip, twoChips, noChips, nothing, walked };
      }),
    );

    // Every third of eleven — 0, 3, 6, 9.
    expect(seen.oneChip.items.length).toBe(4);
    expect(seen.oneChip.items.every((creature) => creature.environments.includes("Cave"))).toBe(
      true,
    );
    // Any-of, so the two chips together are the whole corpus.
    expect(seen.twoChips.items.length).toBe(COUNT);
    // No chips is not a filter at all.
    expect(seen.noChips.items.length).toBe(COUNT);
    // A chip nothing wears narrows to nothing, and says so with a null cursor
    // rather than an error.
    expect(seen.nothing.items).toEqual([]);
    expect(seen.nothing.nextCursor).toBeNull();
    // And the narrowing survives a page boundary, which is the point of doing
    // the two together: it is the *query* that is narrow, so page two of a
    // filtered list is page two of the filtered list.
    expect(seen.walked.rows.map((creature) => creature.id)).toEqual(
      seen.oneChip.items.map((creature) => creature.id),
    );
    expect(seen.walked.sizes).toEqual([2, 2]);
  }, 60_000);

  it("offers the chip vocabulary over the same predicate the list uses", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const creatures = yield* Creatures;
        return {
          dm: yield* withActor(fixture.dm)(creatures.environments(fixture.campaign.id)).pipe(
            Effect.orDie,
          ),
          player: yield* withActor(fixture.player)(
            creatures.environments(fixture.campaign.id),
          ).pipe(Effect.orDie),
        };
      }),
    );

    expect(seen.dm).toEqual(["Cave", "Marsh"]);
    // The player sees both too, because both are worn by a `shared` row here —
    // what matters is that it is the same predicate, which the next assertion
    // is the real test of: it never names something the list cannot return.
    expect(seen.player.every((environment) => seen.dm.includes(environment))).toBe(true);
  }, 60_000);
});

describe("the cursor", () => {
  it("decides the ordering, whatever sort is sent beside it", async () => {
    // Otherwise a key taken in one order is compared against the columns of
    // another, which is a coherent-looking answer that is simply wrong.
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const list = yield* creaturesOf(fixture.dm, fixture.campaign.id);
        const byName = yield* list("name", 4, undefined);
        const creatures = yield* Creatures;
        const contradicted = yield* withActor(fixture.dm)(
          creatures.list(fixture.campaign.id, {
            sort: "recent",
            limit: 4,
            cursor: byName.nextCursor ?? undefined,
          }),
        ).pipe(Effect.orDie);
        const honest = yield* list("name", 4, byName.nextCursor ?? undefined);
        return { contradicted, honest };
      }),
    );

    expect(seen.contradicted.items.map((creature) => creature.name)).toEqual(
      seen.honest.items.map((creature) => creature.name),
    );
  }, 60_000);

  it("continues from nowhere when it was not minted here", async () => {
    // A forged cursor whose key has the wrong number of columns cannot name a
    // position, and answering the first page instead would silently restart a
    // walk. An empty page is the answer that cannot be mistaken for progress.
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const creatures = yield* Creatures;
        return yield* withActor(fixture.dm)(
          creatures.list(fixture.campaign.id, {
            cursor: { o: "name", k: ["Goblin Boss"] } as PageCursor<CreatureSort>,
          }),
        ).pipe(Effect.orDie);
      }),
    );

    expect(seen.items).toEqual([]);
    expect(seen.nextCursor).toBeNull();
  }, 60_000);
});
