import {
  type Actor,
  type Campaign,
  type Creature,
  CurrentActor,
  type GroupId,
  NotFound,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { LibraryShares } from "../src/repo/LibraryShares.js";
import { anAccount, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * Explicit group Library sharing — the captain's decision of 2026-09-01,
 * measured from both sides.
 *
 * The decision's sentence is the test plan: *Library originals remain
 * account-owned; other group members and campaigns gain access only through a
 * concrete explicit share relationship; group membership alone never widens
 * Library visibility.* So the flagship pair here is the never-widen pin — a
 * groupmate's Library answers exactly what it did before the share — and the
 * one thing a share does grant: being a `derive` source for the group's
 * campaigns, landing as the ordinary snapshot.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Creatures.layer,
    EncounterCreatures.layer,
    Encounters.layer,
    Groups.layer,
    Invites.layer,
    LibraryShares.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_group_library"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run: <A, E>(effect: Effect.Effect<A, E, any>) => Promise<A> = (effect) =>
  runtime.runPromise(effect as never);

/**
 * One group with two creators and a Library original each; a stranger with a
 * group and an original of their own. Jo shares the Bog Owlbear; Wren's
 * Reed Witch stays unshared — the difference the never-widen pin measures.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const creatures = yield* Creatures;
  const invites = yield* Invites;

  const jo = yield* anAccount("Jo");
  const saltRoad = yield* withActor(jo)(createCampaign({ name: "The Salt Road" }));
  const groupId = saltRoad.groupId;

  const wren = yield* anAccount("Wren");
  const issued = yield* withActor(jo)(invites.create(groupId, { label: "Wren" })).pipe(
    Effect.orDie,
  );
  yield* withActor(wren)(invites.redeem(issued.token)).pipe(Effect.orDie);
  const hagsBargain = yield* withActor(wren)(
    campaigns.create(groupId, { name: "The Hag's Bargain" }),
  ).pipe(Effect.orDie);

  const owlbear = yield* withActor(jo)(
    creatures.libraryCreate({ name: "Bog Owlbear", type: "Monstrosity", cr: "3", ac: 14, hp: 59 }),
  ).pipe(Effect.orDie);
  const witch = yield* withActor(wren)(
    creatures.libraryCreate({ name: "Reed Witch", type: "Fey", cr: "2", ac: 12, hp: 44 }),
  ).pipe(Effect.orDie);

  const fen = yield* anAccount("Fen");
  const elsewhere = yield* withActor(fen)(createCampaign({ name: "Salt and Sixpence" }));

  return { jo, wren, fen, groupId, saltRoad, hagsBargain, elsewhere, owlbear, witch };
});

interface Fixture {
  readonly jo: Actor;
  readonly wren: Actor;
  readonly fen: Actor;
  readonly groupId: GroupId;
  readonly saltRoad: Campaign;
  readonly hagsBargain: Campaign;
  readonly elsewhere: Campaign;
  readonly owlbear: Creature;
  readonly witch: Creature;
}

let fixture: Fixture;
beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture.pipe(Effect.orDie));
});

const shares = <A, E>(
  use: (service: LibraryShares["Service"]) => Effect.Effect<A, E, CurrentActor>,
  actor: Actor,
) => run(withActor(actor)(Effect.flatMap(LibraryShares, use)));

describe("the grant", () => {
  it("is the owner's, over their own original, and twice is the same success", async () => {
    const share = await shares(
      (s) =>
        s.share(fixture.groupId, { kind: "creature", resourceId: fixture.owlbear.id as string }),
      fixture.jo,
    );
    expect(share.name).toBe("Bog Owlbear");
    expect(share.sharedByName).toBe("Jo");

    const again = await shares(
      (s) =>
        s.share(fixture.groupId, { kind: "creature", resourceId: fixture.owlbear.id as string }),
      fixture.jo,
    );
    expect(again.resourceId).toBe(fixture.owlbear.id);

    const listed = await shares((s) => s.list(fixture.groupId), fixture.wren);
    expect(listed).toHaveLength(1);
  });

  it("refuses a groupmate's original with the ordinary NotFound", async () => {
    // Wren cannot share Jo's owlbear — a grant is the owner's act, and the
    // refusal says nothing about whether the row exists.
    const refused = await run(
      withActor(fixture.wren)(
        Effect.flatMap(LibraryShares, (s) =>
          s.share(fixture.groupId, { kind: "creature", resourceId: fixture.owlbear.id as string }),
        ),
      ).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(NotFound);
  });

  it("refuses a campaign instance: only Library originals can be granted", async () => {
    // The one way a campaign row is minted now is the roster's internal
    // instancing — and even its owner cannot grant it to the group.
    const line = await run(
      withActor(fixture.jo)(
        Effect.gen(function* () {
          const encounters = yield* Encounters;
          const roster = yield* EncounterCreatures;
          const encounter = yield* encounters.create(fixture.saltRoad.id, {
            name: "For the share test",
          });
          return yield* roster.create(fixture.saltRoad.id, encounter.id, {
            creatureId: fixture.owlbear.id,
          });
        }),
      ),
    );
    const refused = await run(
      withActor(fixture.jo)(
        Effect.flatMap(LibraryShares, (s) =>
          s.share(fixture.groupId, { kind: "creature", resourceId: line.creatureId as string }),
        ),
      ).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(NotFound);
  });

  it("is gated on live group membership, like everything at this level", async () => {
    const refused = await run(
      withActor(fixture.fen)(Effect.flatMap(LibraryShares, (s) => s.list(fixture.groupId))).pipe(
        Effect.flip,
      ),
    );
    expect(refused).toBeInstanceOf(NotFound);
  });
});

describe("what a grant grants — and the never-widen pin", () => {
  it("makes the original usable in the group's campaigns, as a snapshot at use", async () => {
    // Wren — who does not own the owlbear and could not use it yesterday —
    // sees it in their campaign's usable list and builds with it; the campaign
    // takes its internal instance at that moment.
    const usable = await run(
      withActor(fixture.wren)(
        Effect.flatMap(Creatures, (creatures) => creatures.list(fixture.hagsBargain.id, {})),
      ),
    );
    expect(usable.items.map((creature) => creature.id)).toContain(fixture.owlbear.id);

    const line = await run(
      withActor(fixture.wren)(
        Effect.gen(function* () {
          const encounters = yield* Encounters;
          const roster = yield* EncounterCreatures;
          const encounter = yield* encounters.create(fixture.hagsBargain.id, {
            name: "The owlbear at the bargain",
          });
          return yield* roster.create(fixture.hagsBargain.id, encounter.id, {
            creatureId: fixture.owlbear.id,
          });
        }),
      ),
    );
    const instance = await run(
      withActor(fixture.wren)(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.findById(fixture.hagsBargain.id, line.creatureId),
        ),
      ),
    );
    expect(instance.campaignId).toBe(fixture.hagsBargain.id);
    expect(instance.accountId).toBeNull();
    expect(instance.derivedFrom).toBe(fixture.owlbear.id);
    expect(instance.origin).toBe("authored");

    // A snapshot: Jo's later edit does not reach it.
    await run(
      withActor(fixture.jo)(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.libraryUpdate(fixture.owlbear.id, { name: "Bog Owlbear (fixed)" }),
        ),
      ),
    );
    const after = await run(
      withActor(fixture.wren)(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.findById(fixture.hagsBargain.id, line.creatureId),
        ),
      ),
    );
    expect(after.name).toBe("Bog Owlbear");
  });

  it("never widens a Library: a groupmate's shelf shows nothing of the share", async () => {
    // THE decision's sentence, measured: Wren's own Library answers their
    // original and the bundle — Jo's shared owlbear is not in it, because a
    // share is a grant to copy, not a view.
    const wrenLibrary = await run(
      withActor(fixture.wren)(Effect.flatMap(Creatures, (creatures) => creatures.library({}))),
    );
    const names = wrenLibrary.items.map((creature) => creature.name);
    expect(names).toContain("Reed Witch");
    expect(names.some((name) => name.startsWith("Bog Owlbear"))).toBe(false);
  });

  it("offers the original itself, and never the instances made from it", async () => {
    // The usable list is the picker: the shared original is in it (edited name
    // and all — a share is a live offer, not a copy), and the internal
    // instance the roster minted above is not, because instances are plumbing
    // no list returns.
    const bargainUsable = await run(
      withActor(fixture.wren)(
        Effect.flatMap(Creatures, (creatures) => creatures.list(fixture.hagsBargain.id, {})),
      ),
    );
    const owlbears = bargainUsable.items.filter((creature) =>
      creature.name.startsWith("Bog Owlbear"),
    );
    expect(owlbears).toHaveLength(1);
    expect(owlbears[0]?.id).toBe(fixture.owlbear.id);
    expect(owlbears[0]?.name).toBe("Bog Owlbear (fixed)");
  });

  it("stops at the group: another group's creator cannot reach it", async () => {
    const refused = await run(
      withActor(fixture.fen)(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.findById(fixture.elsewhere.id, fixture.owlbear.id),
        ),
      ).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(NotFound);
  });

  it("an unshared groupmate original is still unreachable — membership grants nothing", async () => {
    // Wren never shared the Reed Witch, so Jo cannot reach it whatever group
    // they share: the row's absence is the refusal.
    const refused = await run(
      withActor(fixture.jo)(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.findById(fixture.saltRoad.id, fixture.witch.id),
        ),
      ).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(NotFound);
  });
});

describe("withdrawing the grant", () => {
  it("takes the reach away and leaves every copy standing", async () => {
    await shares(
      (s) =>
        s.unshare(fixture.groupId, { kind: "creature", resourceId: fixture.owlbear.id as string }),
      fixture.jo,
    );

    // The reach is gone…
    const refused = await run(
      withActor(fixture.wren)(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.findById(fixture.hagsBargain.id, fixture.owlbear.id),
        ),
      ).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(NotFound);

    // …and the instance already minted is a snapshot: the built encounter
    // still names it, under the name it was shared as.
    const lines = await run(
      withActor(fixture.wren)(
        Effect.gen(function* () {
          const encounters = yield* Encounters;
          const roster = yield* EncounterCreatures;
          const all = yield* encounters.list(fixture.hagsBargain.id, {});
          const encounter = all.items.find((row) => row.name === "The owlbear at the bargain")!;
          return yield* roster.list(fixture.hagsBargain.id, encounter.id);
        }),
      ),
    );
    expect(lines.map((line) => line.name)).toContain("Bog Owlbear");
  });

  it("is the owner's act too: a groupmate's unshare is the ordinary NotFound", async () => {
    await shares(
      (s) =>
        s.share(fixture.groupId, { kind: "creature", resourceId: fixture.owlbear.id as string }),
      fixture.jo,
    );
    const refused = await run(
      withActor(fixture.wren)(
        Effect.flatMap(LibraryShares, (s) =>
          s.unshare(fixture.groupId, {
            kind: "creature",
            resourceId: fixture.owlbear.id as string,
          }),
        ),
      ).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(NotFound);
  });
});
