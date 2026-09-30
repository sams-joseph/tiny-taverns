import { describe, expect } from "@effect/vitest";
import {
  type Campaign,
  type CampaignId,
  CurrentActor,
  type CampaignInviteId,
  NotFound,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { Memberships } from "../src/repo/Memberships.js";
import { Notes } from "../src/repo/Notes.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aGroupMemberAt, anAccount, asDm, createCampaign, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { items } from "./support/paging.js";
import { describeLayer } from "./support/suite.js";

/**
 * The invitation, and **the first player actor the product has ever been able to
 * produce.**
 *
 * Everything before this step changed nothing a player could see, because there
 * were none: `repo/Memberships.ts` had one writer, it took no role, and it wrote
 * the owner's `dm` row. This is the release where a credential exists that
 * reaches a campaign its account does not own, so this file is where the
 * boundary is measured rather than argued.
 *
 * Five blocks:
 *
 *   1. what an invitation grants — a `player` row and nothing else
 *   2. what the player can then reach, and what it cannot, including the three
 *      live repositories the `CampaignCreatorActor` gate protects
 *   3. the lifetime rules: single-use, expiring, revocable, and revocable after
 *      acceptance
 *   4. `GET /me/campaigns`, from both sides of the table
 *   5. the invariants membership already had, still holding with a player in the
 *      campaign
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  Groups.layer,
  Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
  Creatures.layer,
  CampaignCreatorActors.layer,
  EncounterCreatures.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  Invites.layer,
  Memberships.layer,
  Notes.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_invites")));

const as =
  (actor: (typeof CurrentActor)["Service"]) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One DM with two tables and one shared note at the first, plus a stranger who
 * is a DM of their own campaign somewhere else.
 *
 * The first campaign is `shared` — the master toggle — so a refusal below is
 * about what a player may have rather than about a campaign nobody has opened.
 * The second is deliberately left private, which is the *ordinary* state and the
 * one `/me/campaigns` has to be honest about.
 */
const makeFixture = Effect.gen(function* () {
  const notes = yield* Notes;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Ada");
  const campaign = yield* as(dm)(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const otherTable = yield* as(dm)(createCampaign({ name: "Salt and Sixpence" }));
  const session = yield* as(dm)(sessions.create(campaign.id, { number: 12, visibility: "shared" }));
  const shared = yield* as(dm)(
    notes.create(campaign.id, { title: "The ferry", visibility: "shared" }),
  );
  const secret = yield* as(dm)(notes.create(campaign.id, { title: "Who the ferryman is" }));

  return {
    dm,
    stranger: yield* anAccount("Bo"),
    campaign,
    otherTable,
    session,
    shared,
    secret,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "invites.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

/**
 * Mints one as the campaign creator. Returns the plaintext token and the row.
 */
const mint = (campaign: Campaign, label: string) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const invites = yield* Invites;
    const creator = yield* asDm(fixture.dm, campaign.id);
    return yield* invites.createForCampaign(creator, { label });
  }).pipe(Effect.orDie);

const listInvites = (campaign: Campaign) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const invites = yield* Invites;
    const creator = yield* asDm(fixture.dm, campaign.id);
    return yield* invites.listForCampaign(creator);
  }).pipe(Effect.orDie);

const revokeInvite = (campaign: Campaign, inviteId: CampaignInviteId) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const invites = yield* Invites;
    const creator = yield* asDm(fixture.dm, campaign.id);
    return yield* invites.revokeForCampaign(creator, inviteId);
  }).pipe(Effect.orDie);

/** Redeems one as a fresh account, and hands back that account's actor. */
const joinAs = (name: string, token: string, campaignId: CampaignId) =>
  Effect.gen(function* () {
    const invites = yield* Invites;
    const account = yield* anAccount(name);
    const redeemed = yield* as(account)(invites.redeem(token));
    return { account: scopedTo(account, campaignId), redeemed };
  }).pipe(Effect.orDie);

const membershipRows = (campaignId: CampaignId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql<{
      readonly name: string;
      readonly is_creator: boolean;
      readonly revoked: boolean;
    }>`
        select account.name,
               (campaign.creator_account_id = campaign_member.account_id) as is_creator,
               campaign_member.revoked_at is not null as revoked
        from campaign_member
        join campaign on campaign.id = campaign_member.campaign_id
        join account on account.id = campaign_member.account_id
        where campaign_member.campaign_id = ${campaignId}
        order by campaign_member.created_at asc, account.name asc
      `;
  }).pipe(Effect.orDie);

describeLayer("invites", shared, (it) => {
  describe("what an invitation grants", () => {
    it.effect("previews before there is an account, and names the campaign and its creator", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The whole reason the preview exists: the person reading it has no
        // credential, so this is the one read in the product outside `health` with
        // no actor above it. What it discloses is bounded — a name, a name and a
        // deadline — to whoever holds a live token and nobody else.
        const issued = yield* mint(fixture.campaign, "Ilse");
        const preview = yield* Effect.flatMap(Invites, (invites) =>
          invites.preview(issued.token),
        ).pipe(Effect.orDie);

        expect(preview.kind).toBe("campaign");
        expect(preview.kind === "campaign" && preview.creatorName).toBe("Ada");
        expect(preview.kind === "campaign" && preview.campaignName).toBe("The Salt Road");
        expect(preview.kind === "campaign" && preview.sharedWorldName).toBe("The Salt Road group");
        // Server-set and never asked for: an eternal invitation is not expressible.
        expect(DateTime.toEpochMillis(preview.expiresAt)).toBeGreaterThan(Date.now());
      }),
    );

    it.effect(
      "writes a group membership and a participation, and nothing that could be mistaken for creator-ness",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const issued = yield* mint(fixture.campaign, "Pim");
          const { redeemed } = yield* joinAs("Pim", issued.token, fixture.campaign.id);

          expect(redeemed.kind).toBe("campaign");
          expect(redeemed.kind === "campaign" && redeemed.campaignName).toBe("The Salt Road");
          expect(redeemed.kind === "campaign" && redeemed.campaignId).toBe(fixture.campaign.id);
          expect(redeemed.kind === "campaign" && redeemed.shared).toBe(true);

          const rows = yield* membershipRows(fixture.campaign.id);
          const pim = rows.find((row) => row.name === "Pim");
          expect(pim).toEqual({ name: "Pim", is_creator: false, revoked: false });

          // …and the campaign still has exactly one creator, who is a column rather
          // than a row — nothing an invitation writes could have moved it.
          expect(rows.filter((row) => row.is_creator).map((row) => row.name)).toEqual(["Ada"]);
        }),
    );

    it.effect("grants at the invitation's campaign, because there is nowhere to name another", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // `redeem` takes a token and nothing else — no campaign id, no account id.
        // A caller therefore cannot redeem a token *at* a table of their choosing,
        // and cannot invite somebody else in. The membership lands where the
        // invitation was minted.
        const issued = yield* mint(fixture.otherTable, "Elsewhere");
        const { account } = yield* joinAs("Ori", issued.token, fixture.otherTable.id);

        const here = yield* membershipRows(fixture.campaign.id);
        const there = yield* membershipRows(fixture.otherTable.id);

        expect(here.map((row) => row.name)).not.toContain("Ori");
        expect(there.find((row) => row.name === "Ori")?.is_creator).toBe(false);
        expect(account.scope).toEqual({ _tag: "campaign", campaignId: fixture.otherTable.id });
      }),
    );

    it.effect("names the campaign creator rather than the Shared World owner", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const preview = yield* Effect.gen(function* () {
          const campaigns = yield* Campaigns;
          const invites = yield* Invites;
          const creator = yield* aGroupMemberAt(fixture.campaign.id, "Mara");
          const campaign = yield* as(creator)(
            campaigns.create(fixture.campaign.contextId, { name: "Mara's Crossing" }),
          );
          const proof = yield* asDm(creator, campaign.id);
          const issued = yield* invites.createForCampaign(proof, { label: "friend" });
          return yield* invites.preview(issued.token);
        }).pipe(Effect.orDie);

        expect(preview.kind).toBe("campaign");
        expect(preview.kind === "campaign" && preview.creatorName).toBe("Mara");
        expect(preview.kind === "campaign" && preview.sharedWorldName).toBe("The Salt Road group");
      }),
    );

    it.effect("does not disclose a standalone campaign's backing context", () =>
      Effect.gen(function* () {
        const seen = yield* Effect.gen(function* () {
          const campaigns = yield* Campaigns;
          const invites = yield* Invites;
          const creator = yield* anAccount("Standalone creator");
          const campaign = yield* as(creator)(
            campaigns.createStandalone({ name: "One Quiet Table" }),
          );
          const proof = yield* asDm(creator, campaign.id);
          const issued = yield* invites.createForCampaign(proof, { label: "guest" });
          const preview = yield* invites.preview(issued.token);
          const guest = yield* anAccount("Standalone guest");
          const redeemed = yield* as(guest)(invites.redeem(issued.token));
          return { preview, redeemed };
        }).pipe(Effect.orDie);

        expect(seen.preview.kind).toBe("campaign");
        expect(seen.preview.kind === "campaign" && seen.preview.sharedWorldName).toBeNull();
        expect(seen.redeemed.kind).toBe("campaign");
        expect(seen.redeemed.kind === "campaign" && seen.redeemed.sharedWorld).toBeNull();
      }),
    );

    it.effect("is the campaign creator's act — a member cannot manage invitations", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const issued = yield* mint(fixture.campaign, "Rin");
        const { account: player } = yield* joinAs("Rin", issued.token, fixture.campaign.id);
        const refused = yield* asDm(player, fixture.campaign.id).pipe(Effect.result);

        expect(refused._tag).toBe("Failure");
        expect(refused._tag === "Failure" && refused.failure).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("refuses a stranger's campaign outright", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const refused = yield* asDm(fixture.stranger, fixture.campaign.id).pipe(Effect.result);

        expect(refused._tag).toBe("Failure");
      }),
    );
  });

  describe("campaign-local invitations", () => {
    it.effect(
      "lets a campaign creator invite without owning the group, and revokes only that table",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const seen = yield* Effect.gen(function* () {
            const invites = yield* Invites;
            const campaigns = yield* Campaigns;
            const creators = yield* CampaignCreatorActors;
            const memberships = yield* Memberships;

            // Fen becomes an ordinary member of Ada's world, then founds two
            // campaigns there. Fen is their creator but not the world owner.
            const fen = yield* aGroupMemberAt(fixture.campaign.id, "Fen the campaign inviter");
            const first = yield* as(fen)(
              campaigns.create(fixture.campaign.contextId, {
                name: "Fen's first table",
                visibility: "shared",
              }),
            );
            const second = yield* as(fen)(
              campaigns.create(fixture.campaign.contextId, {
                name: "Fen's second table",
                visibility: "shared",
              }),
            );
            const firstCreator = yield* as(fen)(creators.of(first.id));
            const secondCreator = yield* as(fen)(creators.of(second.id));

            const issued = yield* invites.createForCampaign(firstCreator, { label: "Mara" });
            const listed = yield* invites.listForCampaign(firstCreator);
            const mara = yield* anAccount("Mara the campaign guest");
            yield* as(mara)(invites.redeem(issued.token));

            // A second seat has independent provenance and must survive taking
            // back the first campaign's invitation.
            yield* memberships.add(secondCreator, mara.accountId);
            const revoked = yield* invites.revokeForCampaign(firstCreator, issued.invite.id);
            const redundant = yield* invites.createForCampaign(secondCreator, {
              label: "Mara again",
            });
            yield* as(mara)(invites.redeem(redundant.token));
            yield* invites.revokeForCampaign(secondCreator, redundant.invite.id);
            const groupStillReadable = yield* as(mara)(
              Effect.flatMap(Groups, (groups) => groups.findById(first.contextId)),
            );

            return { first, second, listed, revoked, groupStillReadable };
          }).pipe(Effect.orDie);

          expect(seen.listed.map((invite) => invite.id)).toContain(seen.revoked.id);
          expect(seen.revoked.status).toBe("revoked");
          expect(seen.groupStillReadable.id).toBe(fixture.campaign.contextId);
          expect(
            (yield* membershipRows(seen.first.id)).find((row) => row.name.startsWith("Mara")),
          ).toEqual(expect.objectContaining({ revoked: true }));
          expect(
            (yield* membershipRows(seen.second.id)).find((row) => row.name.startsWith("Mara")),
          ).toEqual(expect.objectContaining({ revoked: false }));
        }),
    );
  });

  describe("the first player actor, and what it reaches", () => {
    it.effect("reads the shared row and not the DM's, at its own table and no other", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const issued = yield* mint(fixture.campaign, "Sova");
        const { account: player } = yield* joinAs("Sova", issued.token, fixture.campaign.id);

        const notes = yield* Effect.flatMap(Notes, (repo) =>
          as(player)(items(repo.listAsPlayer(fixture.campaign.id, {}))),
        ).pipe(Effect.orDie);
        // The other table is the same DM's, and membership is per campaign — so a
        // player at one is a stranger at the other, exactly as an account with no
        // membership is.
        const elsewhere = yield* Effect.flatMap(Notes, (repo) =>
          as(player)(items(repo.listAsPlayer(fixture.otherTable.id, {}))),
        ).pipe(Effect.result);

        expect(notes.map((note) => note.title)).toEqual(["The ferry"]);
        expect(elsewhere._tag).toBe("Failure");
      }),
    );

    it.effect("cannot write anything, though it can read the shared half", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // `campaignWritable`'s non-DM branch used to compile to the literal `false`;
        // since `0011` it is a row. This is that refusal, asked of a real player for
        // the first time rather than of a hand-built actor.
        const issued = yield* mint(fixture.campaign, "Tam");
        const { account: player } = yield* joinAs("Tam", issued.token, fixture.campaign.id);

        const wrote = yield* Effect.flatMap(Notes, (repo) =>
          as(player)(repo.create(fixture.campaign.id, { title: "mine now" })),
        ).pipe(Effect.result);
        const edited = yield* Effect.flatMap(Notes, (repo) =>
          as(player)(repo.update(fixture.campaign.id, fixture.shared.id, { title: "edited" })),
        ).pipe(Effect.result);
        const renamed = yield* Effect.flatMap(Campaigns, (repo) =>
          as(player)(repo.update(fixture.campaign.id, { name: "The Salt Road (mine)" })),
        ).pipe(Effect.result);

        expect(wrote._tag).toBe("Failure");
        expect(edited._tag).toBe("Failure");
        expect(renamed._tag).toBe("Failure");
      }),
    );

    it.effect("cannot reach the three live repositories the DM gate protects", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // **The point of this release.** `repo/CampaignCreatorActor.ts` landed before the invite
        // deliberately, so that when the first player actor appeared these methods
        // would already refuse it — a boundary put in afterwards is a race. This is
        // the first time there is a real player to try it with, and the refusal is
        // at the gate rather than at the read, so `runs`, `combatants` and the live
        // log are all covered by the one `NotFound`.
        const issued = yield* mint(fixture.campaign, "Vess");
        const { account: player } = yield* joinAs("Vess", issued.token, fixture.campaign.id);

        const proof = yield* asDm(player, fixture.campaign.id).pipe(Effect.result);

        expect(proof._tag).toBe("Failure");
        expect(proof._tag === "Failure" && proof.failure).toBeInstanceOf(NotFound);
        // Named for the campaign — the thing that could not be had — and a
        // `NotFound` rather than a `Forbidden`, because "it exists but is not yours"
        // is itself a disclosure.
        expect(proof._tag === "Failure" && (proof.failure as NotFound).resource).toBe("campaign");

        // And the DM's own proof still works, so the refusal above is about who is
        // asking rather than about a fixture that never worked.
        const dmProof = yield* asDm(fixture.dm, fixture.campaign.id).pipe(Effect.result);
        expect(dmProof._tag).toBe("Success");
      }),
    );
  });

  describe("the lifetime rules", () => {
    it.effect(
      "is single-use — a second account gets nothing, the same account gets the same answer",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const issued = yield* mint(fixture.campaign, "Wen");
          const { account: first, redeemed } = yield* joinAs(
            "Wen",
            issued.token,
            fixture.campaign.id,
          );

          // A double-tapped *Join* is one person joining once. Answering "no such
          // invitation" on the second tap would read as somebody having stolen it.
          const again = yield* Effect.flatMap(Invites, (invites) =>
            as(first)(invites.redeem(issued.token)),
          ).pipe(Effect.result);
          // Anybody else, though, is too late — and is told nothing about why.
          const second = yield* Effect.gen(function* () {
            const invites = yield* Invites;
            const other = yield* anAccount("Yara");
            return yield* as(other)(invites.redeem(issued.token));
          }).pipe(Effect.result);

          expect(again._tag).toBe("Success");
          expect(
            again._tag === "Success" && again.success.kind === "campaign"
              ? again.success.campaignId
              : undefined,
          ).toBe(redeemed.kind === "campaign" ? redeemed.campaignId : undefined);
          expect(second._tag).toBe("Failure");
          expect(second._tag === "Failure" && second.failure).toBeInstanceOf(NotFound);

          const rows = yield* membershipRows(fixture.campaign.id);
          expect(rows.map((row) => row.name)).not.toContain("Yara");
        }),
    );

    it.effect("expires, and says nothing more than an invented token would", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const issued = yield* mint(fixture.campaign, "Zed");
        // Reaching past the product on purpose: the expiry is server-set precisely
        // so no caller can choose one, which leaves moving the clock as the only
        // way to test the deadline.
        yield* Effect.flatMap(
          SqlClient.SqlClient,
          (sql) =>
            sql`update group_invite set expires_at = now() - interval '1 second' where id = ${issued.invite.id}`,
        ).pipe(Effect.orDie);

        const preview = yield* Effect.flatMap(Invites, (invites) =>
          invites.preview(issued.token),
        ).pipe(Effect.result);
        const redeemed = yield* Effect.gen(function* () {
          const invites = yield* Invites;
          const late = yield* anAccount("Late");
          return yield* as(late)(invites.redeem(issued.token));
        }).pipe(Effect.result);
        const invented = yield* Effect.flatMap(Invites, (invites) =>
          invites.preview("not-a-real-token"),
        ).pipe(Effect.result);

        expect(preview._tag).toBe("Failure");
        expect(redeemed._tag).toBe("Failure");
        // The same refusal, to the character: telling the holder of a dead token
        // which kind of dead it is discloses that it was ever alive.
        expect(preview._tag === "Failure" && preview.failure).toEqual(
          invented._tag === "Failure" ? invented.failure : undefined,
        );

        const listed = yield* listInvites(fixture.campaign);
        // The DM, who may see it, sees why.
        expect(listed.find((invite) => invite.id === issued.invite.id)?.status).toBe("expired");
      }),
    );

    it.effect("is revocable before anybody accepts it", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const issued = yield* mint(fixture.campaign, "Withdrawn");
        const revoked = yield* revokeInvite(fixture.campaign, issued.invite.id);

        const preview = yield* Effect.flatMap(Invites, (invites) =>
          invites.preview(issued.token),
        ).pipe(Effect.result);
        const redeemed = yield* Effect.gen(function* () {
          const invites = yield* Invites;
          const holder = yield* anAccount("Holder");
          return yield* as(holder)(invites.redeem(issued.token));
        }).pipe(Effect.result);

        expect(revoked.status).toBe("revoked");
        expect(preview._tag).toBe("Failure");
        expect(redeemed._tag).toBe("Failure");
        // Nothing was granted, so the link is inert rather than merely unlisted.
        const rows = yield* membershipRows(fixture.campaign.id);
        expect(rows.map((row) => row.name)).not.toContain("Holder");
      }),
    );

    it.effect("is revocable after acceptance, which is the remedy for a forwarded link", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The honest answer to "what happens if one is forwarded to somebody the DM
        // did not mean": they get in, the DM sees who, and one click takes it back.
        // A revoke that withdrew a spent invitation and left the person at the table
        // would do nothing at all, which is worse than no button.
        const issued = yield* mint(fixture.campaign, "for Ilse");
        const { account: wrongPerson } = yield* joinAs("Nem", issued.token, fixture.campaign.id);

        const before = yield* Effect.flatMap(Notes, (repo) =>
          as(wrongPerson)(items(repo.listAsPlayer(fixture.campaign.id, {}))),
        ).pipe(Effect.result);
        const listedBefore = yield* listInvites(fixture.campaign);

        const revoked = yield* revokeInvite(fixture.campaign, issued.invite.id);

        const after = yield* Effect.flatMap(Notes, (repo) =>
          as(wrongPerson)(items(repo.listAsPlayer(fixture.campaign.id, {}))),
        ).pipe(Effect.result);

        expect(before._tag).toBe("Success");
        // The DM can see who took it, which is what makes the wrong person visible
        // rather than merely possible.
        expect(listedBefore.find((invite) => invite.id === issued.invite.id)?.redeemedByName).toBe(
          "Nem",
        );
        expect(revoked.status).toBe("revoked");
        expect(revoked.redeemedByName).toBe("Nem");
        // Reach is gone: the read that succeeded a moment ago is a 404 now.
        expect(after._tag).toBe("Failure");

        const rows = yield* membershipRows(fixture.campaign.id);
        expect(rows.find((row) => row.name === "Nem")).toEqual({
          name: "Nem",
          is_creator: false,
          revoked: true,
        });
        // …and the creator is untouched, which `revokeMemberAt`'s
        // not-the-creator clause makes structural rather than incidental.
        expect(rows.find((row) => row.name === "Ada")?.revoked).toBe(false);
      }),
    );

    it.effect("refuses to revoke an invitation of another group, by id", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The invite id in a path is a client claim like every other parent id here.
        const issued = yield* mint(fixture.otherTable, "somewhere else");
        const refused = yield* Effect.gen(function* () {
          const invites = yield* Invites;
          const creator = yield* asDm(fixture.dm, fixture.campaign.id);
          return yield* invites.revokeForCampaign(creator, issued.invite.id);
        }).pipe(Effect.result);
        const invented = yield* Effect.gen(function* () {
          const invites = yield* Invites;
          const creator = yield* asDm(fixture.dm, fixture.campaign.id);
          return yield* invites.revokeForCampaign(creator, randomUUID() as CampaignInviteId);
        }).pipe(Effect.result);

        expect(refused._tag).toBe("Failure");
        expect(invented._tag).toBe("Failure");
      }),
    );
  });

  describe("the tables I am at", () => {
    it.effect("shows a player their table only once the DM has shared it", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // `Memberships.mine` composes `campaignReadable` and nothing else, so the
        // master toggle still governs: a player who has joined a campaign the DM has
        // not shared sees nothing. That is the designed behaviour rather than a gap,
        // and it is why `InviteRedeemed` carries `shared` — the moment to explain it
        // is the moment of joining.
        const issued = yield* mint(fixture.otherTable, "Private table");
        const { account: player, redeemed } = yield* joinAs(
          "Quill",
          issued.token,
          fixture.otherTable.id,
        );

        const beforeSharing = yield* Effect.flatMap(Memberships, (repo) =>
          as(player)(repo.mine("live")),
        ).pipe(Effect.orDie);

        yield* Effect.flatMap(Campaigns, (repo) =>
          as(fixture.dm)(repo.update(fixture.otherTable.id, { visibility: "shared" })),
        ).pipe(Effect.orDie);

        const afterSharing = yield* Effect.flatMap(Memberships, (repo) =>
          as(player)(repo.mine("live")),
        ).pipe(Effect.orDie);

        expect(redeemed.kind === "campaign" && redeemed.shared).toBe(false);
        expect(beforeSharing).toEqual([]);
        expect(afterSharing.map((row) => [row.campaign.name, row.relation])).toEqual([
          ["Salt and Sixpence", "player"],
        ]);
      }),
    );

    it.effect("shows a DM every table they run, and a stranger none of them", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const mine = yield* Effect.flatMap(Memberships, (repo) =>
          as(fixture.dm)(repo.mine("live")),
        ).pipe(Effect.orDie);
        const theirs = yield* Effect.flatMap(Memberships, (repo) =>
          as(fixture.stranger)(repo.mine("live")),
        ).pipe(Effect.orDie);

        expect([...mine.map((row) => row.campaign.name)].sort()).toEqual([
          "Salt and Sixpence",
          "The Salt Road",
        ]);
        expect(mine.every((row) => row.relation === "creator")).toBe(true);
        // An account nobody has invited anywhere is a legitimate steady state now,
        // and its answer is an empty list rather than an error.
        expect(theirs.map((row) => row.campaign.name)).toEqual([]);
      }),
    );

    it.effect("narrows to the one campaign a scoped credential was minted for", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // Membership and credential scope are two independent narrowings and both
        // apply here, exactly as they do to every other read.
        const scoped = scopedTo(fixture.dm, fixture.campaign.id);
        const seen = yield* Effect.flatMap(Memberships, (repo) =>
          as(scoped)(repo.mine("live")),
        ).pipe(Effect.orDie);

        expect(seen.map((row) => row.campaign.name)).toEqual(["The Salt Road"]);
      }),
    );
  });

  describe("what an invitation cannot do to the campaign it names", () => {
    it.effect("leaves the creator's participation unrepresentably intact", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // `campaign_creator_is_campaign_member` is the structural answer to "can
        // the DM's row go missing", and a table full of players must not have made
        // it any weaker. Driven against the real schema, with a player in the
        // campaign. There is no demotion to attempt: there is no role column.
        const attempt = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
          Effect.exit(effect);
        const sqlOf = <A>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown, never>) =>
          Effect.flatMap(SqlClient.SqlClient, f);

        const revoked = yield* attempt(
          sqlOf(
            (sql) =>
              sql`update campaign_member set revoked_at = now()
              where campaign_id = ${fixture.campaign.id} and account_id = ${fixture.dm.accountId}`,
          ),
        );

        expect(revoked._tag).toBe("Failure");
      }),
    );

    it.effect(
      "cannot be minted as a creator invitation, because there is nothing to mint one with",
      () =>
        Effect.gen(function* () {
          // The schema half of "an invitation admits a member": it carries no role,
          // so the statement that would grant creator-ness does not exist and cannot
          // be written by naming a column that is not there. `campaign_id` names
          // which table it also seats you at, never what you are at it.
          const columns = yield* Effect.flatMap(
            SqlClient.SqlClient,
            (sql) => sql<{ readonly column_name: string }>`
          select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'group_invite'
          order by column_name
        `,
          ).pipe(Effect.orDie);

          expect(columns.map((column) => column.column_name)).toEqual([
            "campaign_id",
            "created_at",
            "expires_at",
            "granted_campaign_membership",
            "group_id",
            "id",
            "label",
            "redeemed_at",
            "redeemed_by",
            "revoked_at",
            "token_hash",
          ]);
        }),
    );

    it.effect("stores no token in plaintext, and shows one exactly once", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const issued = yield* mint(fixture.campaign, "Secrecy");
        const stored = yield* Effect.flatMap(
          SqlClient.SqlClient,
          (sql) => sql<{ readonly token_hash: string }>`
          select token_hash from group_invite where id = ${issued.invite.id}
        `,
        ).pipe(Effect.orDie);
        const listed = yield* listInvites(fixture.campaign);

        expect(stored[0]!.token_hash).not.toBe(issued.token);
        expect(stored[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
        // Nothing a list returns can carry it: `CampaignInvite` has no such field.
        expect(JSON.stringify(listed)).not.toContain(issued.token);
      }),
    );
  });
});
