import { type Actor, CurrentActor, NotFound } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { admitToGroup, Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Memberships } from "../src/repo/Memberships.js";
import { Notes } from "../src/repo/Notes.js";
import { aGroupMemberAt, anAccount, aPlayerAt, asDm, scopedToGroup } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { items } from "./support/paging.js";

/**
 * The group: the top-level container, and the three boundaries the captain's
 * decisions of 2026-09-01 drew through it.
 *
 * 1. **Membership is eligibility, not participation.** A live group member
 *    sees the group — its card directory, its roster — and reads *nothing* of
 *    a campaign's content, shared or not, until that campaign's creator names
 *    them a participant.
 * 2. **Campaigns govern participation; members create campaigns.** The Shared
 *    World roster is context, not a second onboarding or removal surface.
 * 3. **Cross-group isolation is absolute.** Another group answers `NotFound`
 *    to everything, whatever this account is elsewhere.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    CampaignCreatorActors.layer,
    Campaigns.layer,
    Groups.layer,
    Invites.layer,
    Memberships.layer,
    Notes.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_groups"))),
);
afterAll(() => runtime.dispose());

const as =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One group with an owner, a campaign creator who is not the owner, a player
 * at that campaign, a member who participates in nothing, and a stranger who
 * owns a group of their own.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const groups = yield* Groups;
  const notes = yield* Notes;
  const sql = yield* SqlClient.SqlClient;

  const owner = yield* anAccount("Ada");
  const group = yield* as(owner)(groups.create({ name: "The Salt Company" }));

  // Seed eligibility directly: campaign invitations are tested end to end in
  // invites.test, while this fixture needs a member before their first table
  // exists in this already-created Shared World.
  const creator = yield* anAccount("Fen");
  yield* admitToGroup(sql, group.id, creator.accountId);
  const campaign = yield* as(creator)(
    campaigns.create(group.id, { name: "The Salt Road", visibility: "shared" }),
  );
  const secret = yield* as(creator)(notes.create(campaign.id, { title: "Who the ferryman is" }));
  const shared = yield* as(creator)(
    notes.create(campaign.id, { title: "The ferry", visibility: "shared" }),
  );

  // A player at Fen's table, and a member who sits at none.
  const player = yield* aPlayerAt(campaign.id, "Pim");
  const bystander = yield* aGroupMemberAt(campaign.id, "Wren");

  // A stranger with a whole group of their own, so refusals below are about
  // reach rather than about an account with nothing anywhere.
  const stranger = yield* anAccount("Bo");
  const strangerGroup = yield* as(stranger)(groups.create({ name: "The Hag's Bargain Co" }));

  return {
    owner,
    creator,
    player,
    bystander,
    stranger,
    sharedWorld: group,
    strangerGroup,
    campaign,
    secret,
    shared,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

describe("membership is eligibility, not participation", () => {
  it("lets a live member create a campaign, and a stranger not", async () => {
    // The fixture already proved the member half — `campaign` above is Fen's,
    // and Fen is not the owner. The stranger's half:
    const refused = await runtime.runPromise(
      Effect.flatMap(Campaigns, (repo) =>
        as(fixture.stranger)(repo.create(fixture.sharedWorld.id, { name: "Not my group" })),
      ).pipe(Effect.result),
    );
    expect(refused._tag).toBe("Failure");
    expect(refused._tag === "Failure" && (refused.failure as NotFound)._tag).toBe("NotFound");
  }, 60_000);

  it("shows a non-participating member the directory card, and none of the content", async () => {
    // **The participation decision in one test.** Wren is a live member of the
    // group; the campaign is `shared`. They still read nothing of it: `shared`
    // means shared with the campaign's participants, not with the whole group.
    const cards = await runtime.runPromise(
      Effect.flatMap(Groups, (repo) =>
        as(fixture.bystander)(repo.campaigns(fixture.sharedWorld.id)),
      ).pipe(Effect.orDie),
    );
    const card = cards.find((row) => row.id === fixture.campaign.id);
    expect(card?.name).toBe("The Salt Road");
    expect(card?.creatorName).toBe("Fen");
    expect(card?.relation).toBe("none");

    const campaignRow = await runtime.runPromise(
      Effect.flatMap(Campaigns, (repo) =>
        as(fixture.bystander)(repo.findById(fixture.campaign.id)),
      ).pipe(Effect.result),
    );
    const noteRows = await runtime.runPromise(
      Effect.flatMap(Notes, (repo) =>
        as(fixture.bystander)(items(repo.list(fixture.campaign.id, {}))),
      ).pipe(Effect.result),
    );
    const roster = await runtime.runPromise(
      asDm(fixture.bystander, fixture.campaign.id).pipe(Effect.result),
    );

    expect(campaignRow._tag).toBe("Failure");
    expect(noteRows._tag).toBe("Failure");
    expect(roster._tag).toBe("Failure");
  }, 60_000);

  it("gives a participant the shared content and the creator everything", async () => {
    const playerNotes = await runtime.runPromise(
      Effect.flatMap(Notes, (repo) =>
        as(fixture.player)(items(repo.list(fixture.campaign.id, {}))),
      ).pipe(Effect.orDie),
    );
    const creatorNotes = await runtime.runPromise(
      Effect.flatMap(Notes, (repo) =>
        as(fixture.creator)(items(repo.list(fixture.campaign.id, {}))),
      ).pipe(Effect.orDie),
    );

    expect(playerNotes.map((note) => note.title)).toEqual(["The ferry"]);
    expect([...creatorNotes.map((note) => note.title)].sort()).toEqual([
      "The ferry",
      "Who the ferryman is",
    ]);
  }, 60_000);

  it("derives the directory relation per reader", async () => {
    const relationSeenBy = (actor: Actor) =>
      runtime.runPromise(
        Effect.flatMap(Groups, (repo) => as(actor)(repo.campaigns(fixture.sharedWorld.id))).pipe(
          Effect.map((cards) => cards.find((row) => row.id === fixture.campaign.id)?.relation),
          Effect.orDie,
        ),
      );

    expect(await relationSeenBy(fixture.creator)).toBe("creator");
    expect(await relationSeenBy(fixture.player)).toBe("player");
    expect(await relationSeenBy(fixture.owner)).toBe("none");
  }, 60_000);

  it("is the creator's act to admit a group member, and the member must be one", async () => {
    const admitted = await runtime.runPromise(
      Effect.gen(function* () {
        const memberships = yield* Memberships;
        const creator = yield* asDm(fixture.creator, fixture.campaign.id);
        return yield* memberships.add(creator, fixture.bystander.accountId);
      }).pipe(Effect.orDie),
    );
    expect(admitted.name).toBe("Wren");
    expect(admitted.relation).toBe("player");

    // An account outside the group cannot be seated — eligibility first.
    const outsider = await runtime.runPromise(
      Effect.gen(function* () {
        const memberships = yield* Memberships;
        const creator = yield* asDm(fixture.creator, fixture.campaign.id);
        return yield* memberships.add(creator, fixture.stranger.accountId);
      }).pipe(Effect.result),
    );
    expect(outsider._tag).toBe("Failure");
    expect(outsider._tag === "Failure" && (outsider.failure as NotFound).resource).toBe("member");

    // …and a player cannot admit anybody: the proof does not mint for them.
    const playerAdds = await runtime.runPromise(
      asDm(fixture.player, fixture.campaign.id).pipe(Effect.result),
    );
    expect(playerAdds._tag).toBe("Failure");

    // Put the fixture back: Wren participates in nothing.
    await runtime.runPromise(
      Effect.gen(function* () {
        const memberships = yield* Memberships;
        const creator = yield* asDm(fixture.creator, fixture.campaign.id);
        yield* memberships.remove(creator, fixture.bystander.accountId);
      }).pipe(Effect.orDie),
    );
  }, 60_000);
});

describe("Shared World membership is context", () => {
  it("lets every live member read the group and its roster", async () => {
    const roster = await runtime.runPromise(
      Effect.flatMap(Groups, (repo) =>
        as(fixture.bystander)(repo.members(fixture.sharedWorld.id)),
      ).pipe(Effect.orDie),
    );
    expect(roster.map((member) => [member.name, member.isOwner])).toEqual([
      ["Ada", true],
      ["Fen", false],
      ["Pim", false],
      ["Wren", false],
    ]);
  }, 60_000);

  it("still reserves Shared World settings for the owner", async () => {
    const renamed = await runtime.runPromise(
      Effect.flatMap(Groups, (repo) =>
        as(fixture.creator)(repo.update(fixture.sharedWorld.id, { name: "Fen's Company" })),
      ).pipe(Effect.result),
    );
    expect(renamed._tag).toBe("Failure");
    expect(renamed._tag === "Failure" && renamed.failure).toBeInstanceOf(NotFound);
  }, 60_000);
});

describe("cross-group isolation", () => {
  it("answers NotFound about another group, whatever this account is elsewhere", async () => {
    // The owner of one group is a stranger at another — being an owner
    // anywhere grants nothing here.
    const read = await runtime.runPromise(
      Effect.flatMap(Groups, (repo) =>
        as(fixture.stranger)(repo.findById(fixture.sharedWorld.id)),
      ).pipe(Effect.result),
    );
    const roster = await runtime.runPromise(
      Effect.flatMap(Groups, (repo) =>
        as(fixture.stranger)(repo.members(fixture.sharedWorld.id)),
      ).pipe(Effect.result),
    );
    const cards = await runtime.runPromise(
      Effect.flatMap(Groups, (repo) =>
        as(fixture.stranger)(repo.campaigns(fixture.sharedWorld.id)),
      ).pipe(Effect.result),
    );

    for (const refusal of [read, roster, cards]) {
      expect(refusal._tag).toBe("Failure");
      expect(refusal._tag === "Failure" && refusal.failure).toBeInstanceOf(NotFound);
    }

    const mine = await runtime.runPromise(
      Effect.flatMap(Groups, (repo) => as(fixture.owner)(repo.mine)).pipe(Effect.orDie),
    );
    expect(mine.map((row) => row.sharedWorld.name)).toEqual(["The Salt Company"]);
    expect(mine[0]!.isOwner).toBe(true);
  }, 60_000);

  it("narrows a group-scoped credential to its one group", async () => {
    // Scope and membership narrow independently, one level up from the
    // campaign-scoped case `visibility.test.ts` pins.
    const scoped = scopedToGroup(fixture.owner, fixture.strangerGroup.id);
    const ownGroup = await runtime.runPromise(
      Effect.flatMap(Groups, (repo) => as(scoped)(repo.findById(fixture.sharedWorld.id))).pipe(
        Effect.result,
      ),
    );
    // Scoped to a group the account is not even a member of, it reaches
    // nothing at all: membership still applies.
    const scopedElsewhere = await runtime.runPromise(
      Effect.flatMap(Groups, (repo) => as(scoped)(repo.findById(fixture.strangerGroup.id))).pipe(
        Effect.result,
      ),
    );

    expect(ownGroup._tag).toBe("Failure");
    expect(scopedElsewhere._tag).toBe("Failure");
  }, 60_000);

  it("keeps a campaign-scoped credential inside its campaign's group", async () => {
    const scoped = await runtime.runPromise(
      Effect.gen(function* () {
        const dmHere = yield* aPlayerAt(fixture.campaign.id, "Quill");
        const groups = yield* Groups;
        const ownGroupCard = yield* Effect.result(
          as(dmHere)(groups.findById(fixture.sharedWorld.id)),
        );
        const otherGroup = yield* Effect.result(
          as(dmHere)(groups.findById(fixture.strangerGroup.id)),
        );
        return { ownGroupCard, otherGroup };
      }).pipe(Effect.orDie),
    );

    // A campaign-scoped credential reaches its campaign's own group context…
    expect(scoped.ownGroupCard._tag).toBe("Success");
    // …and no other group, member or not.
    expect(scoped.otherGroup._tag).toBe("Failure");
  }, 60_000);
});

describe("the group's own lifecycle", () => {
  it("keeps a standalone campaign's context off every Shared World surface until promotion", async () => {
    const journey = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const groups = yield* Groups;
        const invites = yield* Invites;
        const memberships = yield* Memberships;
        const founder = yield* anAccount("Wayfarer");
        const campaign = yield* as(founder)(
          campaigns.createStandalone({ name: "A Road of Its Own" }),
        );

        // The backing row still does its campaign job. What it cannot do is
        // answer any endpoint that presents it as a Shared World.
        const campaignBefore = yield* Effect.result(as(founder)(campaigns.findById(campaign.id)));
        const groupBefore = yield* Effect.result(as(founder)(groups.findById(campaign.contextId)));
        const rosterBefore = yield* Effect.result(as(founder)(groups.members(campaign.contextId)));
        const directoryBefore = yield* Effect.result(
          as(founder)(groups.campaigns(campaign.contextId)),
        );
        const creator = yield* asDm(founder, campaign.id);
        const inviteBefore = yield* invites.createForCampaign(creator, { label: "A player" });
        const secondCampaignBefore = yield* Effect.result(
          as(founder)(campaigns.create(campaign.contextId, { name: "Too soon" })),
        );
        const membershipBefore = yield* as(founder)(memberships.mine("live"));

        const promoted = yield* groups.promote(creator, { name: "The Roads Between" });
        const groupAfter = yield* as(founder)(groups.findById(campaign.contextId));
        const directoryAfter = yield* as(founder)(groups.campaigns(campaign.contextId));
        const membershipAfter = yield* as(founder)(memberships.mine("live"));

        return {
          campaignBefore,
          groupBefore,
          rosterBefore,
          directoryBefore,
          inviteBefore,
          secondCampaignBefore,
          membershipBefore,
          promoted,
          groupAfter,
          directoryAfter,
          membershipAfter,
        };
      }).pipe(Effect.orDie),
    );

    expect(journey.campaignBefore._tag).toBe("Success");
    for (const refusal of [
      journey.groupBefore,
      journey.rosterBefore,
      journey.directoryBefore,
      journey.secondCampaignBefore,
    ]) {
      expect(refusal._tag).toBe("Failure");
      if (refusal._tag === "Failure") expect(refusal.failure).toBeInstanceOf(NotFound);
    }
    expect(journey.inviteBefore.invite.campaignId).toBe(
      journey.campaignBefore._tag === "Success" ? journey.campaignBefore.success.id : undefined,
    );
    expect(journey.groupAfter.name).toBe("The Roads Between");
    expect(journey.directoryAfter.map((campaign) => campaign.name)).toEqual(["A Road of Its Own"]);
    expect(journey.membershipBefore[0]?.sharedWorld).toBeNull();
    expect(journey.membershipAfter[0]?.sharedWorld).toEqual({
      id: journey.promoted.id,
      name: "The Roads Between",
    });
  }, 60_000);

  it("does not let a campaign creator promote somebody else's group", async () => {
    const refused = await runtime.runPromise(
      Effect.gen(function* () {
        const groups = yield* Groups;
        const creator = yield* asDm(fixture.creator, fixture.campaign.id);
        return yield* groups.promote(creator, { name: "Not Fen's World" });
      }).pipe(Effect.result),
    );

    expect(refused._tag).toBe("Failure");
    if (refused._tag === "Failure") expect(refused.failure).toBeInstanceOf(NotFound);
  });

  it("archives and restores as one column, owner-only", async () => {
    const journey = await runtime.runPromise(
      Effect.gen(function* () {
        const groups = yield* Groups;
        const founder = yield* anAccount("Shelver");
        const group = yield* as(founder)(groups.create({ name: "A Shelf-bound Company" }));
        const archived = yield* as(founder)(groups.archive(group.id));
        const listedWhileShelved = yield* as(founder)(groups.mine);
        const restored = yield* as(founder)(groups.restore(group.id));
        const listedBack = yield* as(founder)(groups.mine);
        return { archived, listedWhileShelved, restored, listedBack };
      }).pipe(Effect.orDie),
    );

    expect(journey.archived.archivedAt).not.toBeNull();
    expect(journey.listedWhileShelved.map((row) => row.sharedWorld.name)).toEqual([]);
    expect(journey.restored.archivedAt).toBeNull();
    expect(journey.listedBack.map((row) => row.sharedWorld.name)).toEqual([
      "A Shelf-bound Company",
    ]);
  }, 60_000);

  it("lets a campaign creator run their table while the owner runs the group", async () => {
    // The everyday split, end to end: Fen runs the table while Ada owns the
    // Shared World. Fen's campaign member list works with the proof:
    const roster = await runtime.runPromise(
      Effect.gen(function* () {
        const memberships = yield* Memberships;
        const creator = yield* asDm(fixture.creator, fixture.campaign.id);
        return yield* memberships.list(creator);
      }).pipe(Effect.orDie),
    );
    expect(roster[0]!.relation).toBe("creator");
    expect(roster[0]!.name).toBe("Fen");

    // …and the owner, who does not participate, cannot mint the proof at all.
    const ownerProof = await runtime.runPromise(
      asDm(fixture.owner, fixture.campaign.id).pipe(Effect.result),
    );
    expect(ownerProof._tag).toBe("Failure");
  }, 60_000);
});
