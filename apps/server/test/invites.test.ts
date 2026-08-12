import { type CampaignId, CurrentActor, type InviteId, NotFound } from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { DmActors } from "../src/repo/DmActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { Memberships } from "../src/repo/Memberships.js";
import { Notes } from "../src/repo/Notes.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount, asDm, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

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
 *      live repositories the `DmActor` gate protects
 *   3. the lifetime rules: single-use, expiring, revocable, and revocable after
 *      acceptance
 *   4. `GET /me/campaigns`, from both sides of the table
 *   5. the invariants membership already had, still holding with a player in the
 *      campaign
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
  Creatures.layer,
  DmActors.layer,
  EncounterCreatures.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  Invites.layer,
  Memberships.layer,
  Notes.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_invites")));
const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

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
  const campaigns = yield* Campaigns;
  const notes = yield* Notes;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Ada");
  const campaign = yield* as(dm)(campaigns.create({ name: "The Salt Road", visibility: "shared" }));
  const otherTable = yield* as(dm)(campaigns.create({ name: "Salt and Sixpence" }));
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

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

/** Mints one, as the campaign's DM. Returns the plaintext token and the row. */
const mint = (campaignId: CampaignId, label: string) =>
  runtime.runPromise(
    Effect.flatMap(Invites, (invites) =>
      as(fixture.dm)(invites.create(campaignId, { label })),
    ).pipe(Effect.orDie),
  );

/** Redeems one as a fresh account, and hands back that account's actor. */
const joinAs = (name: string, token: string, campaignId: CampaignId) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const invites = yield* Invites;
      const account = yield* anAccount(name);
      const redeemed = yield* as(account)(invites.redeem(token));
      return { account: scopedTo(account, campaignId), redeemed };
    }).pipe(Effect.orDie),
  );

const membershipRows = (campaignId: CampaignId) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return yield* sql<{
        readonly name: string;
        readonly role: string;
        readonly is_dm: boolean;
        readonly revoked: boolean;
      }>`
        select account.name, campaign_member.role, campaign_member.is_dm,
               campaign_member.revoked_at is not null as revoked
        from campaign_member
        join account on account.id = campaign_member.account_id
        where campaign_member.campaign_id = ${campaignId}
        order by campaign_member.created_at asc, account.name asc
      `;
    }).pipe(Effect.orDie),
  );

describe("what an invitation grants", () => {
  it("previews before there is an account, and names the DM from the membership", async () => {
    // The whole reason the preview exists: the person reading it has no
    // credential, so this is the one read in the product outside `health` with
    // no actor above it. What it discloses is bounded — a name, a name and a
    // deadline — to whoever holds a live token and nobody else.
    const issued = await mint(fixture.campaign.id, "Ilse");
    const preview = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) => invites.preview(issued.token)).pipe(Effect.orDie),
    );

    expect(preview.campaignName).toBe("The Salt Road");
    expect(preview.dmName).toBe("Ada");
    // Server-set and never asked for: an eternal invitation is not expressible.
    expect(DateTime.toEpochMillis(preview.expiresAt)).toBeGreaterThan(Date.now());
  }, 60_000);

  it("writes a player membership, and nothing that could be mistaken for a DM one", async () => {
    const issued = await mint(fixture.campaign.id, "Pim");
    const { redeemed } = await joinAs("Pim", issued.token, fixture.campaign.id);

    expect(redeemed.campaignName).toBe("The Salt Road");
    expect(redeemed.campaignId).toBe(fixture.campaign.id);
    expect(redeemed.shared).toBe(true);

    const rows = await membershipRows(fixture.campaign.id);
    const pim = rows.find((row) => row.name === "Pim");
    expect(pim).toEqual({ name: "Pim", role: "player", is_dm: false, revoked: false });

    // …and the campaign still has exactly one DM, who is still its owner. The
    // composite key would refuse anything else, and this is what says the invite
    // path never went near it.
    expect(rows.filter((row) => row.is_dm).map((row) => row.name)).toEqual(["Ada"]);
  }, 60_000);

  it("grants at the invitation's campaign, because there is nowhere to name another", async () => {
    // `redeem` takes a token and nothing else — no campaign id, no account id.
    // A caller therefore cannot redeem a token *at* a table of their choosing,
    // and cannot invite somebody else in. The membership lands where the
    // invitation was minted.
    const issued = await mint(fixture.otherTable.id, "Elsewhere");
    const { account } = await joinAs("Ori", issued.token, fixture.otherTable.id);

    const here = await membershipRows(fixture.campaign.id);
    const there = await membershipRows(fixture.otherTable.id);

    expect(here.map((row) => row.name)).not.toContain("Ori");
    expect(there.find((row) => row.name === "Ori")?.role).toBe("player");
    expect(account.campaignId).toBe(fixture.otherTable.id);
  }, 60_000);

  it("is a DM act to mint, list or revoke — a player at the table cannot", async () => {
    // An invitation is a credential, so the DM side is gated by the ordinary
    // `campaignWritable` and a player gets the ordinary `NotFound`.
    const issued = await mint(fixture.campaign.id, "Rin");
    const { account: player } = await joinAs("Rin", issued.token, fixture.campaign.id);

    const minted = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) =>
        as(player)(invites.create(fixture.campaign.id, { label: "a friend of mine" })),
      ).pipe(Effect.result),
    );
    const listed = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) => as(player)(invites.list(fixture.campaign.id))).pipe(
        Effect.result,
      ),
    );
    const revoked = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) =>
        as(player)(invites.revoke(fixture.campaign.id, issued.invite.id)),
      ).pipe(Effect.result),
    );

    for (const refusal of [minted, listed, revoked]) {
      expect(refusal._tag).toBe("Failure");
      expect(refusal._tag === "Failure" && refusal.failure).toBeInstanceOf(NotFound);
    }
  }, 60_000);

  it("refuses a stranger's campaign outright", async () => {
    const refused = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) =>
        as(fixture.stranger)(invites.create(fixture.campaign.id, { label: "let me in" })),
      ).pipe(Effect.result),
    );

    expect(refused._tag).toBe("Failure");
  }, 60_000);
});

describe("the first player actor, and what it reaches", () => {
  it("reads the shared row and not the DM's, at its own table and no other", async () => {
    const issued = await mint(fixture.campaign.id, "Sova");
    const { account: player } = await joinAs("Sova", issued.token, fixture.campaign.id);

    const notes = await runtime.runPromise(
      Effect.flatMap(Notes, (repo) => as(player)(repo.list(fixture.campaign.id))).pipe(
        Effect.orDie,
      ),
    );
    // The other table is the same DM's, and membership is per campaign — so a
    // player at one is a stranger at the other, exactly as an account with no
    // membership is.
    const elsewhere = await runtime.runPromise(
      Effect.flatMap(Notes, (repo) => as(player)(repo.list(fixture.otherTable.id))).pipe(
        Effect.result,
      ),
    );

    expect(notes.map((note) => note.title)).toEqual(["The ferry"]);
    expect(elsewhere._tag).toBe("Failure");
  }, 60_000);

  it("cannot write anything, though it can read the shared half", async () => {
    // `campaignWritable`'s non-DM branch used to compile to the literal `false`;
    // since `0011` it is a row. This is that refusal, asked of a real player for
    // the first time rather than of a hand-built actor.
    const issued = await mint(fixture.campaign.id, "Tam");
    const { account: player } = await joinAs("Tam", issued.token, fixture.campaign.id);

    const wrote = await runtime.runPromise(
      Effect.flatMap(Notes, (repo) =>
        as(player)(repo.create(fixture.campaign.id, { title: "mine now" })),
      ).pipe(Effect.result),
    );
    const edited = await runtime.runPromise(
      Effect.flatMap(Notes, (repo) =>
        as(player)(repo.update(fixture.campaign.id, fixture.shared.id, { title: "edited" })),
      ).pipe(Effect.result),
    );
    const renamed = await runtime.runPromise(
      Effect.flatMap(Campaigns, (repo) =>
        as(player)(repo.update(fixture.campaign.id, { name: "The Salt Road (mine)" })),
      ).pipe(Effect.result),
    );

    expect(wrote._tag).toBe("Failure");
    expect(edited._tag).toBe("Failure");
    expect(renamed._tag).toBe("Failure");
  }, 60_000);

  it("cannot reach the three live repositories the DM gate protects", async () => {
    // **The point of this release.** `repo/DmActor.ts` landed before the invite
    // deliberately, so that when the first player actor appeared these methods
    // would already refuse it — a boundary put in afterwards is a race. This is
    // the first time there is a real player to try it with, and the refusal is
    // at the gate rather than at the read, so `runs`, `combatants` and the live
    // log are all covered by the one `NotFound`.
    const issued = await mint(fixture.campaign.id, "Vess");
    const { account: player } = await joinAs("Vess", issued.token, fixture.campaign.id);

    const proof = await runtime.runPromise(asDm(player, fixture.campaign.id).pipe(Effect.result));

    expect(proof._tag).toBe("Failure");
    expect(proof._tag === "Failure" && proof.failure).toBeInstanceOf(NotFound);
    // Named for the campaign — the thing that could not be had — and a
    // `NotFound` rather than a `Forbidden`, because "it exists but is not yours"
    // is itself a disclosure.
    expect(proof._tag === "Failure" && (proof.failure as NotFound).resource).toBe("campaign");

    // And the DM's own proof still works, so the refusal above is about who is
    // asking rather than about a fixture that never worked.
    const dmProof = await runtime.runPromise(
      asDm(fixture.dm, fixture.campaign.id).pipe(Effect.result),
    );
    expect(dmProof._tag).toBe("Success");
  }, 60_000);
});

describe("the lifetime rules", () => {
  it("is single-use — a second account gets nothing, the same account gets the same answer", async () => {
    const issued = await mint(fixture.campaign.id, "Wen");
    const { account: first, redeemed } = await joinAs("Wen", issued.token, fixture.campaign.id);

    // A double-tapped *Join* is one person joining once. Answering "no such
    // invitation" on the second tap would read as somebody having stolen it.
    const again = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) => as(first)(invites.redeem(issued.token))).pipe(
        Effect.result,
      ),
    );
    // Anybody else, though, is too late — and is told nothing about why.
    const second = await runtime.runPromise(
      Effect.gen(function* () {
        const invites = yield* Invites;
        const other = yield* anAccount("Yara");
        return yield* as(other)(invites.redeem(issued.token));
      }).pipe(Effect.result),
    );

    expect(again._tag).toBe("Success");
    expect(again._tag === "Success" && again.success.campaignId).toBe(redeemed.campaignId);
    expect(second._tag).toBe("Failure");
    expect(second._tag === "Failure" && second.failure).toBeInstanceOf(NotFound);

    const rows = await membershipRows(fixture.campaign.id);
    expect(rows.map((row) => row.name)).not.toContain("Yara");
  }, 60_000);

  it("expires, and says nothing more than an invented token would", async () => {
    const issued = await mint(fixture.campaign.id, "Zed");
    // Reaching past the product on purpose: the expiry is server-set precisely
    // so no caller can choose one, which leaves moving the clock as the only
    // way to test the deadline.
    await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) =>
          sql`update campaign_invite set expires_at = now() - interval '1 second' where id = ${issued.invite.id}`,
      ).pipe(Effect.orDie),
    );

    const preview = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) => invites.preview(issued.token)).pipe(Effect.result),
    );
    const redeemed = await runtime.runPromise(
      Effect.gen(function* () {
        const invites = yield* Invites;
        const late = yield* anAccount("Late");
        return yield* as(late)(invites.redeem(issued.token));
      }).pipe(Effect.result),
    );
    const invented = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) => invites.preview("not-a-real-token")).pipe(Effect.result),
    );

    expect(preview._tag).toBe("Failure");
    expect(redeemed._tag).toBe("Failure");
    // The same refusal, to the character: telling the holder of a dead token
    // which kind of dead it is discloses that it was ever alive.
    expect(preview._tag === "Failure" && preview.failure).toEqual(
      invented._tag === "Failure" ? invented.failure : undefined,
    );

    const listed = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) => as(fixture.dm)(invites.list(fixture.campaign.id))).pipe(
        Effect.orDie,
      ),
    );
    // The DM, who may see it, sees why.
    expect(listed.find((invite) => invite.id === issued.invite.id)?.status).toBe("expired");
  }, 60_000);

  it("is revocable before anybody accepts it", async () => {
    const issued = await mint(fixture.campaign.id, "Withdrawn");
    const revoked = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) =>
        as(fixture.dm)(invites.revoke(fixture.campaign.id, issued.invite.id)),
      ).pipe(Effect.orDie),
    );

    const preview = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) => invites.preview(issued.token)).pipe(Effect.result),
    );
    const redeemed = await runtime.runPromise(
      Effect.gen(function* () {
        const invites = yield* Invites;
        const holder = yield* anAccount("Holder");
        return yield* as(holder)(invites.redeem(issued.token));
      }).pipe(Effect.result),
    );

    expect(revoked.status).toBe("revoked");
    expect(preview._tag).toBe("Failure");
    expect(redeemed._tag).toBe("Failure");
    // Nothing was granted, so the link is inert rather than merely unlisted.
    const rows = await membershipRows(fixture.campaign.id);
    expect(rows.map((row) => row.name)).not.toContain("Holder");
  }, 60_000);

  it("is revocable after acceptance, which is the remedy for a forwarded link", async () => {
    // The honest answer to "what happens if one is forwarded to somebody the DM
    // did not mean": they get in, the DM sees who, and one click takes it back.
    // A revoke that withdrew a spent invitation and left the person at the table
    // would do nothing at all, which is worse than no button.
    const issued = await mint(fixture.campaign.id, "for Ilse");
    const { account: wrongPerson } = await joinAs("Nem", issued.token, fixture.campaign.id);

    const before = await runtime.runPromise(
      Effect.flatMap(Notes, (repo) => as(wrongPerson)(repo.list(fixture.campaign.id))).pipe(
        Effect.result,
      ),
    );
    const listedBefore = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) => as(fixture.dm)(invites.list(fixture.campaign.id))).pipe(
        Effect.orDie,
      ),
    );

    const revoked = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) =>
        as(fixture.dm)(invites.revoke(fixture.campaign.id, issued.invite.id)),
      ).pipe(Effect.orDie),
    );

    const after = await runtime.runPromise(
      Effect.flatMap(Notes, (repo) => as(wrongPerson)(repo.list(fixture.campaign.id))).pipe(
        Effect.result,
      ),
    );

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

    const rows = await membershipRows(fixture.campaign.id);
    expect(rows.find((row) => row.name === "Nem")).toEqual({
      name: "Nem",
      role: "player",
      is_dm: false,
      revoked: true,
    });
    // …and the DM is untouched, which `revokePlayerAt`'s `role = 'player'`
    // clause makes structural rather than incidental.
    expect(rows.find((row) => row.name === "Ada")?.revoked).toBe(false);
  }, 60_000);

  it("refuses to revoke an invitation of another campaign, by id", async () => {
    // The invite id in a path is a client claim like every other parent id here.
    const issued = await mint(fixture.otherTable.id, "somewhere else");
    const refused = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) =>
        as(fixture.dm)(invites.revoke(fixture.campaign.id, issued.invite.id)),
      ).pipe(Effect.result),
    );
    const invented = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) =>
        as(fixture.dm)(invites.revoke(fixture.campaign.id, randomUUID() as InviteId)),
      ).pipe(Effect.result),
    );

    expect(refused._tag).toBe("Failure");
    expect(invented._tag).toBe("Failure");
  }, 60_000);
});

describe("the tables I am at", () => {
  it("shows a player their table only once the DM has shared it", async () => {
    // `Memberships.mine` composes `campaignReadable` and nothing else, so the
    // master toggle still governs: a player who has joined a campaign the DM has
    // not shared sees nothing. That is the designed behaviour rather than a gap,
    // and it is why `InviteRedeemed` carries `shared` — the moment to explain it
    // is the moment of joining.
    const issued = await mint(fixture.otherTable.id, "Private table");
    const { account: player, redeemed } = await joinAs(
      "Quill",
      issued.token,
      fixture.otherTable.id,
    );

    const beforeSharing = await runtime.runPromise(
      Effect.flatMap(Memberships, (repo) => as(player)(repo.mine)).pipe(Effect.orDie),
    );

    await runtime.runPromise(
      Effect.flatMap(Campaigns, (repo) =>
        as(fixture.dm)(repo.update(fixture.otherTable.id, { visibility: "shared" })),
      ).pipe(Effect.orDie),
    );

    const afterSharing = await runtime.runPromise(
      Effect.flatMap(Memberships, (repo) => as(player)(repo.mine)).pipe(Effect.orDie),
    );

    expect(redeemed.shared).toBe(false);
    expect(beforeSharing).toEqual([]);
    expect(afterSharing.map((row) => [row.campaign.name, row.role])).toEqual([
      ["Salt and Sixpence", "player"],
    ]);
  }, 60_000);

  it("shows a DM every table they run, and a stranger none of them", async () => {
    const mine = await runtime.runPromise(
      Effect.flatMap(Memberships, (repo) => as(fixture.dm)(repo.mine)).pipe(Effect.orDie),
    );
    const theirs = await runtime.runPromise(
      Effect.flatMap(Memberships, (repo) => as(fixture.stranger)(repo.mine)).pipe(Effect.orDie),
    );

    expect([...mine.map((row) => row.campaign.name)].sort()).toEqual([
      "Salt and Sixpence",
      "The Salt Road",
    ]);
    expect(mine.every((row) => row.role === "dm")).toBe(true);
    // An account nobody has invited anywhere is a legitimate steady state now,
    // and its answer is an empty list rather than an error.
    expect(theirs.map((row) => row.campaign.name)).toEqual([]);
  }, 60_000);

  it("narrows to the one campaign a scoped credential was minted for", async () => {
    // Membership and credential scope are two independent narrowings and both
    // apply here, exactly as they do to every other read.
    const scoped = scopedTo(fixture.dm, fixture.campaign.id);
    const seen = await runtime.runPromise(
      Effect.flatMap(Memberships, (repo) => as(scoped)(repo.mine)).pipe(Effect.orDie),
    );

    expect(seen.map((row) => row.campaign.name)).toEqual(["The Salt Road"]);
  }, 60_000);
});

describe("what an invitation cannot do to the campaign it names", () => {
  it("leaves the owner's DM membership unrepresentably intact", async () => {
    // `campaign_owner_is_dm_member` is what bought back the one thing membership
    // weakened, and a table full of players must not have made it any weaker.
    // Driven against the real schema, with a player in the campaign.
    const attempt = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      runtime.runPromise(Effect.exit(effect));
    const sqlOf = <A>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown, never>) =>
      Effect.flatMap(SqlClient.SqlClient, f);

    const demoted = await attempt(
      sqlOf(
        (sql) =>
          sql`update campaign_member set role = 'player'
              where campaign_id = ${fixture.campaign.id} and account_id = ${fixture.dm.accountId}`,
      ),
    );
    const revoked = await attempt(
      sqlOf(
        (sql) =>
          sql`update campaign_member set revoked_at = now()
              where campaign_id = ${fixture.campaign.id} and account_id = ${fixture.dm.accountId}`,
      ),
    );

    expect(demoted._tag).toBe("Failure");
    expect(revoked._tag).toBe("Failure");
  }, 60_000);

  it("cannot be minted as a DM invitation, because there is nothing to mint one with", async () => {
    // The schema half of "only player memberships may be minted": the invitation
    // carries no role, so the statement that would grant a `dm` row does not
    // exist and cannot be written by naming a column that is not there.
    const columns = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql<{ readonly column_name: string }>`
          select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'campaign_invite'
          order by column_name
        `,
      ).pipe(Effect.orDie),
    );

    expect(columns.map((column) => column.column_name)).toEqual([
      "campaign_id",
      "created_at",
      "expires_at",
      "id",
      "label",
      "redeemed_at",
      "redeemed_by",
      "revoked_at",
      "token_hash",
    ]);
  }, 60_000);

  it("stores no token in plaintext, and shows one exactly once", async () => {
    const issued = await mint(fixture.campaign.id, "Secrecy");
    const stored = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql<{ readonly token_hash: string }>`
          select token_hash from campaign_invite where id = ${issued.invite.id}
        `,
      ).pipe(Effect.orDie),
    );
    const listed = await runtime.runPromise(
      Effect.flatMap(Invites, (invites) => as(fixture.dm)(invites.list(fixture.campaign.id))).pipe(
        Effect.orDie,
      ),
    );

    expect(stored[0]!.token_hash).not.toBe(issued.token);
    expect(stored[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    // Nothing a list returns can carry it: `CampaignInvite` has no such field.
    expect(JSON.stringify(listed)).not.toContain(issued.token);
  }, 60_000);
});
