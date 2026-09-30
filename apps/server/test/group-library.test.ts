import { describe, expect } from "@effect/vitest";
import { type Actor, CurrentActor, NotFound } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { Accounts } from "../src/Accounts.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { LibraryShares } from "../src/repo/LibraryShares.js";
import { aGroupMemberAt, anAccount, asDm, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

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

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  CampaignCreatorActors.layer,
  Creatures.layer,
  EncounterCreatures.layer,
  Encounters.layer,
  Groups.layer,
  Invites.layer,
  LibraryShares.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_group_library")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One group with two creators and a Library original each; a stranger with a
 * group and an original of their own. Jo shares the Bog Owlbear; Wren's
 * Reed Witch stays unshared — the difference the never-widen pin measures.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const creatures = yield* Creatures;

  const jo = yield* anAccount("Jo");
  const saltRoad = yield* withActor(jo)(createCampaign({ name: "The Salt Road" }));
  const groupId = saltRoad.contextId;

  const wren = yield* aGroupMemberAt(saltRoad.id, "Wren");
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
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "group-library.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const shares = <A, E>(
  use: (service: LibraryShares["Service"]) => Effect.Effect<A, E, CurrentActor>,
  actor: Actor,
) => withActor(actor)(Effect.flatMap(LibraryShares, use));

describeLayer("group-library", shared, (it) => {
  describe("the grant", () => {
    it.effect("is the owner's, over their own original, and twice is the same success", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const share = yield* shares(
          (s) =>
            s.share(fixture.groupId, {
              kind: "creature",
              resourceId: fixture.owlbear.id as string,
            }),
          fixture.jo,
        );
        expect(share.name).toBe("Bog Owlbear");
        expect(share.sharedByName).toBe("Jo");

        const again = yield* shares(
          (s) =>
            s.share(fixture.groupId, {
              kind: "creature",
              resourceId: fixture.owlbear.id as string,
            }),
          fixture.jo,
        );
        expect(again.resourceId).toBe(fixture.owlbear.id);

        const listed = yield* shares((s) => s.list(fixture.groupId), fixture.wren);
        expect(listed).toHaveLength(1);
      }),
    );

    it.effect("refuses a groupmate's original with the ordinary NotFound", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // Wren cannot share Jo's owlbear — a grant is the owner's act, and the
        // refusal says nothing about whether the row exists.
        const refused = yield* withActor(fixture.wren)(
          Effect.flatMap(LibraryShares, (s) =>
            s.share(fixture.groupId, {
              kind: "creature",
              resourceId: fixture.owlbear.id as string,
            }),
          ),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("refuses a campaign instance: only Library originals can be granted", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The one way a campaign row is minted now is the roster's internal
        // instancing — and even its owner cannot grant it to the group.
        const line = yield* withActor(fixture.jo)(
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
        );
        const refused = yield* withActor(fixture.jo)(
          Effect.flatMap(LibraryShares, (s) =>
            s.share(fixture.groupId, { kind: "creature", resourceId: line.creatureId as string }),
          ),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("is gated on live group membership, like everything at this level", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const refused = yield* withActor(fixture.fen)(
          Effect.flatMap(LibraryShares, (s) => s.list(fixture.groupId)),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NotFound);
      }),
    );
  });

  describe("what a grant grants — and the never-widen pin", () => {
    it.effect("makes the original usable in the group's campaigns, as a snapshot at use", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // Wren — who does not own the owlbear and could not use it yesterday —
        // sees it in their campaign's usable list and builds with it; the campaign
        // takes its internal instance at that moment.
        const usable = yield* withActor(fixture.wren)(
          Effect.flatMap(Creatures, (creatures) => creatures.list(fixture.hagsBargain.id, {})),
        );
        expect(usable.items.map((creature) => creature.id)).toContain(fixture.owlbear.id);

        const line = yield* withActor(fixture.wren)(
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
        );
        const instance = yield* withActor(fixture.wren)(
          Effect.flatMap(Creatures, (creatures) =>
            creatures.findById(fixture.hagsBargain.id, line.creatureId),
          ),
        );
        expect(instance.campaignId).toBe(fixture.hagsBargain.id);
        expect(instance.accountId).toBeNull();
        expect(instance.derivedFrom).toBe(fixture.owlbear.id);
        expect(instance.origin).toBe("authored");

        // A snapshot: Jo's later edit does not reach it.
        yield* withActor(fixture.jo)(
          Effect.flatMap(Creatures, (creatures) =>
            creatures.libraryUpdate(fixture.owlbear.id, { name: "Bog Owlbear (fixed)" }),
          ),
        );
        const after = yield* withActor(fixture.wren)(
          Effect.flatMap(Creatures, (creatures) =>
            creatures.findById(fixture.hagsBargain.id, line.creatureId),
          ),
        );
        expect(after.name).toBe("Bog Owlbear");
      }),
    );

    it.effect("never widens a Library: a groupmate's shelf shows nothing of the share", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // THE decision's sentence, measured: Wren's own Library answers their
        // original and the bundle — Jo's shared owlbear is not in it, because a
        // share is a grant to copy, not a view.
        const wrenLibrary = yield* withActor(fixture.wren)(
          Effect.flatMap(Creatures, (creatures) => creatures.library({})),
        );
        const names = wrenLibrary.items.map((creature) => creature.name);
        expect(names).toContain("Reed Witch");
        expect(names.some((name) => name.startsWith("Bog Owlbear"))).toBe(false);
      }),
    );

    it.effect("offers the original itself, and never the instances made from it", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The usable list is the picker: the shared original is in it (edited name
        // and all — a share is a live offer, not a copy), and the internal
        // instance the roster minted above is not, because instances are plumbing
        // no list returns.
        const bargainUsable = yield* withActor(fixture.wren)(
          Effect.flatMap(Creatures, (creatures) => creatures.list(fixture.hagsBargain.id, {})),
        );
        const owlbears = bargainUsable.items.filter((creature) =>
          creature.name.startsWith("Bog Owlbear"),
        );
        expect(owlbears).toHaveLength(1);
        expect(owlbears[0]?.id).toBe(fixture.owlbear.id);
        expect(owlbears[0]?.name).toBe("Bog Owlbear (fixed)");
      }),
    );

    it.effect("stops at the group: another group's creator cannot reach it", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const refused = yield* withActor(fixture.fen)(
          Effect.flatMap(Creatures, (creatures) =>
            creatures.findById(fixture.elsewhere.id, fixture.owlbear.id),
          ),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NotFound);
      }),
    );

    it.effect(
      "an unshared groupmate original is still unreachable — membership grants nothing",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          // Wren never shared the Reed Witch, so Jo cannot reach it whatever group
          // they share: the row's absence is the refusal.
          const refused = yield* withActor(fixture.jo)(
            Effect.flatMap(Creatures, (creatures) =>
              creatures.findById(fixture.saltRoad.id, fixture.witch.id),
            ),
          ).pipe(Effect.flip);
          expect(refused).toBeInstanceOf(NotFound);
        }),
    );
  });

  describe("withdrawing the grant", () => {
    it.effect("takes the reach away and leaves every copy standing", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        yield* shares(
          (s) =>
            s.unshare(fixture.groupId, {
              kind: "creature",
              resourceId: fixture.owlbear.id as string,
            }),
          fixture.jo,
        );

        // The reach is gone…
        const refused = yield* withActor(fixture.wren)(
          Effect.flatMap(Creatures, (creatures) =>
            creatures.findById(fixture.hagsBargain.id, fixture.owlbear.id),
          ),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NotFound);

        // …and the instance already minted is a snapshot: the built encounter
        // still names it, under the name it was shared as.
        const lines = yield* withActor(fixture.wren)(
          Effect.gen(function* () {
            const encounters = yield* Encounters;
            const roster = yield* EncounterCreatures;
            const dm = yield* asDm(fixture.wren, fixture.hagsBargain.id);
            const all = yield* encounters.list(dm, {});
            const encounter = all.items.find((row) => row.name === "The owlbear at the bargain")!;
            return yield* roster.list(dm, encounter.id);
          }),
        );
        expect(lines.map((line) => line.name)).toContain("Bog Owlbear");
      }),
    );

    it.effect("is the owner's act too: a groupmate's unshare is the ordinary NotFound", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        yield* shares(
          (s) =>
            s.share(fixture.groupId, {
              kind: "creature",
              resourceId: fixture.owlbear.id as string,
            }),
          fixture.jo,
        );
        const refused = yield* withActor(fixture.wren)(
          Effect.flatMap(LibraryShares, (s) =>
            s.unshare(fixture.groupId, {
              kind: "creature",
              resourceId: fixture.owlbear.id as string,
            }),
          ),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NotFound);
      }),
    );
  });
});
