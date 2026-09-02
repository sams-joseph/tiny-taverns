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

  it("refuses a campaign copy: only Library originals can be granted", async () => {
    const copy = await run(
      withActor(fixture.jo)(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.derive(fixture.saltRoad.id, fixture.owlbear.id, {}),
        ),
      ),
    );
    const refused = await run(
      withActor(fixture.jo)(
        Effect.flatMap(LibraryShares, (s) =>
          s.share(fixture.groupId, { kind: "creature", resourceId: copy.id as string }),
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
  it("makes the original a derive source for the group's campaigns, as a snapshot", async () => {
    // Wren — who does not own the owlbear and could not copy it yesterday —
    // derives Jo's shared original into their own campaign.
    const copy = await run(
      withActor(fixture.wren)(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.derive(fixture.hagsBargain.id, fixture.owlbear.id, {}),
        ),
      ),
    );
    expect(copy.campaignId).toBe(fixture.hagsBargain.id);
    expect(copy.accountId).toBeNull();
    expect(copy.derivedFrom).toBe(fixture.owlbear.id);
    expect(copy.origin).toBe("authored");

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
          creatures.findById(fixture.hagsBargain.id, copy.id),
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

  it("does not put the original in the campaign corpus: a share is not a copy", async () => {
    const bargainBestiary = await run(
      withActor(fixture.wren)(
        Effect.flatMap(Creatures, (creatures) => creatures.list(fixture.hagsBargain.id, {})),
      ),
    );
    // The copy Wren derived is there; the *original* is not — it enters a
    // campaign by snapshot and no other way.
    const owlbears = bargainBestiary.items.filter((creature) =>
      creature.name.startsWith("Bog Owlbear"),
    );
    expect(owlbears).toHaveLength(1);
    expect(owlbears[0]?.id).not.toBe(fixture.owlbear.id);
  });

  it("stops at the group: another group's creator cannot derive it", async () => {
    const refused = await run(
      withActor(fixture.fen)(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.derive(fixture.elsewhere.id, fixture.owlbear.id, {}),
        ),
      ).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(NotFound);
  });

  it("an unshared groupmate original is still unreachable — membership grants nothing", async () => {
    // Wren never shared the Reed Witch, so Jo cannot derive it whatever group
    // they share: the row's absence is the refusal.
    const refused = await run(
      withActor(fixture.jo)(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.derive(fixture.saltRoad.id, fixture.witch.id, {}),
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
          creatures.derive(fixture.hagsBargain.id, fixture.owlbear.id, {}),
        ),
      ).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(NotFound);

    // …and the copy already made is a snapshot and stands.
    const bargainBestiary = await run(
      withActor(fixture.wren)(
        Effect.flatMap(Creatures, (creatures) => creatures.list(fixture.hagsBargain.id, {})),
      ),
    );
    expect(bargainBestiary.items.some((creature) => creature.name === "Bog Owlbear")).toBe(true);
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
