import { describe, expect } from "@effect/vitest";
import { Actor, type Campaign, CurrentActor } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { Accounts } from "../src/Accounts.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { aPlayerAt, anAccount, asDm, createCampaign, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { items } from "./support/paging.js";
import { describeLayer } from "./support/suite.js";

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  CampaignCreatorActors.layer,
  Groups.layer,
  Invites.layer,
  Notes.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_visibility")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * A read of the creator's `Note`, reached the shipped way: the proof first,
 * from this actor, for this campaign. Anybody but the creator fails at the
 * proof, which is the refusal the notes endpoints answer with.
 */
const asCreator = <A, E, R>(
  actor: Actor,
  campaignId: Campaign["id"],
  read: (creator: Effect.Success<ReturnType<typeof asDm>>) => Effect.Effect<A, E, R>,
) => Effect.flatMap(asDm(actor, campaignId), read);

/**
 * Three campaigns from the same DM — one DM running more than one table:
 *
 *   `campaign`   — shared with players (the master toggle on), holding one `dm`
 *                  note and one `shared` note
 *   `closed`     — left at the default, holding a `shared` note that must stay
 *                  unreachable anyway
 *   `otherTable` — a second, separately shared campaign. Nothing about
 *                  `campaign` may reach it, and vice versa.
 */
const makeFixture = Effect.gen(function* () {
  const notes = yield* Notes;

  const dm = yield* anAccount("Jo");

  const campaign = yield* withActor(dm)(
    createCampaign({ name: "The Reed Marches", visibility: "shared" }),
  );
  // Neither note payload mentions `visibility`… except the one that does. What
  // the first row ends up with is decided by the column default alone, which is
  // exactly what this file checks.
  const secret = yield* withActor(dm)(notes.create(campaign.id, { title: "The crate" }));
  const shared = yield* withActor(dm)(
    notes.create(campaign.id, { title: "The reeds", visibility: "shared" }),
  );

  const closed = yield* withActor(dm)(createCampaign({ name: "The Hag's Bargain" }));
  const sharedInClosed = yield* withActor(dm)(
    notes.create(closed.id, { title: "Overheard at the ford", visibility: "shared" }),
  );

  const otherTable = yield* withActor(dm)(
    createCampaign({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  const sharedElsewhere = yield* withActor(dm)(
    notes.create(otherTable.id, { title: "The harbourmaster's ledger", visibility: "shared" }),
  );

  // The player at the first table: their own account, a `player` membership
  // there, and a credential scoped to it — which is what an invite will mint.
  //
  // Their own account, and no longer the DM's, because a role stopped being a
  // property of the credential. It could not stay one: a person is the DM of
  // one table and a player at another on the same credential, and
  // `(campaign_id, account_id)` is a primary key, so the same account cannot be
  // both here.
  const player = yield* aPlayerAt(campaign.id, "Pim");

  return {
    dm,
    player,
    campaign,
    secret,
    shared,
    closed,
    sharedInClosed,
    otherTable,
    sharedElsewhere,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "visibility.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

describeLayer("visibility", shared, (it) => {
  describe("visibility defaults to dm", () => {
    it.effect("stores a row created with no explicit visibility as dm", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;

        expect(fixture.secret.visibility).toBe("dm");
        expect(fixture.closed.visibility).toBe("dm");
        expect(fixture.shared.visibility).toBe("shared");
      }),
    );

    it.effect("defaults at the column, not only in the payload schema", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;

        // A row inserted straight into the table, bypassing every TypeScript path,
        // still comes out `dm`. That is the property a table added later inherits
        // for free, and the reason the default lives in the migration.
        const rows = yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql<{ readonly visibility: string; readonly origin: string }>`
          insert into note (campaign_id, title)
          values (${fixture.campaign.id}, 'inserted behind the repository')
          returning visibility, origin
        `;
        }).pipe(Effect.orDie);

        expect(rows[0]).toEqual({ visibility: "dm", origin: "authored" });
      }),
    );
  });

  describe("a player actor", () => {
    it.effect("cannot read the creator's notes at all, not even the shared one", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;

        // `Note` is the creator's working record; a player's read is its own
        // projection. The refusal is the proof's, before any note row is read.
        for (const id of [fixture.secret.id, fixture.shared.id]) {
          const error = yield* Effect.flip(
            asCreator(fixture.player, fixture.campaign.id, (dm) => notes.findById(dm, id)),
          );
          expect(error._tag).toBe("NotFound");
          expect(error.resource).toBe("campaign");
        }
      }),
    );

    it.effect("sees only the shared note when listing", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;

        const asDm = yield* asCreator(fixture.dm, fixture.campaign.id, (dm) =>
          items(notes.list(dm, {})),
        );
        const asPlayer = yield* withActor(fixture.player)(
          items(notes.listAsPlayer(fixture.campaign.id, {})),
        );

        expect(asDm.length).toBeGreaterThan(1);
        expect(asDm.map((note) => note.id)).toContain(fixture.secret.id);
        expect(asPlayer.map((note) => note.id)).toEqual([fixture.shared.id]);
      }),
    );

    it.effect("cannot edit or delete even the shared note it can read", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;

        const updated = yield* Effect.flip(
          withActor(fixture.player)(
            notes.update(fixture.campaign.id, fixture.shared.id, { title: "tampered" }),
          ),
        );
        const removed = yield* Effect.flip(
          withActor(fixture.player)(notes.remove(fixture.campaign.id, fixture.shared.id)),
        );

        expect(updated._tag).toBe("NotFound");
        expect(removed._tag).toBe("NotFound");

        const stillThere = yield* asCreator(fixture.dm, fixture.campaign.id, (dm) =>
          notes.findById(dm, fixture.shared.id),
        );
        expect(stillThere.title).toBe("The reeds");
      }),
    );

    it.effect("cannot reach a shared note inside a campaign that is not shared", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;

        // The master toggle. Marking one note `shared` must not open the campaign
        // it sits in — otherwise sharing a single read-aloud silently exposes the
        // campaign's existence and every other shared row in it.
        const listed = yield* Effect.flip(
          withActor(fixture.player)(items(notes.listAsPlayer(fixture.closed.id, {}))),
        );

        expect(listed._tag).toBe("NotFound");

        // …and the DM still sees it, so the note really is there to be missed.
        const asDm = yield* asCreator(fixture.dm, fixture.closed.id, (dm) =>
          items(notes.list(dm, {})),
        );
        expect(asDm.map((note) => note.id)).toEqual([fixture.sharedInClosed.id]);
      }),
    );

    it.effect("cannot create a note", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;

        const error = yield* Effect.flip(
          withActor(fixture.player)(notes.create(fixture.campaign.id, { title: "from a player" })),
        );

        // `NotFound`, not `Forbidden`: telling a reader that the campaign exists but
        // is not theirs to write to is itself a disclosure.
        expect(error._tag).toBe("NotFound");
        expect(error.resource).toBe("campaign");
      }),
    );
  });

  describe("membership and credential scope narrow independently, and both apply", () => {
    // The two halves of `campaignInScope`, and the reason each needs its own
    // actor now. A player is a *different account* with a `campaign_member` row —
    // so what stops them reaching the DM's second table is membership, not scope,
    // and a test that used a player to prove scope would be passing for the wrong
    // reason. The scoped DM is a member of all three campaigns and reaches one;
    // the player is a member of one and reaches one. Only together do they say
    // that both clauses are live.

    it.effect("keeps a member out of a campaign they are not a member of", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;
        const campaigns = yield* Campaigns;

        // The DM here owns three campaigns, two of them separately shared. The
        // player belongs to one, so the other two are not theirs — including the
        // `shared` one, which is what makes this membership rather than visibility.
        const campaign = yield* Effect.flip(
          withActor(fixture.player)(campaigns.findById(fixture.otherTable.id)),
        );
        const listed = yield* Effect.flip(
          withActor(fixture.player)(items(notes.listAsPlayer(fixture.otherTable.id, {}))),
        );

        expect(campaign._tag).toBe("NotFound");
        expect(listed._tag).toBe("NotFound");

        // …and the second table's shared note really is there and really is shared,
        // so the assertions above are about reach and not about a missing fixture.
        const asDm = yield* asCreator(fixture.dm, fixture.otherTable.id, (dm) =>
          items(notes.list(dm, {})),
        );
        expect(asDm.map((note) => note.id)).toEqual([fixture.sharedElsewhere.id]);
        expect(asDm[0]!.visibility).toBe("shared");
      }),
    );

    it.effect("lists exactly the campaigns an account is a member of", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const campaigns = yield* Campaigns;

        const asPlayer = yield* withActor(fixture.player)(campaigns.list);

        expect(asPlayer.map((c) => c.id)).toEqual([fixture.campaign.id]);
      }),
    );

    it.effect("still reaches everything inside the campaign the membership is for", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;

        // Membership narrows, it does not replace the rest of the predicate: the
        // shared note in the member's own campaign is still readable.
        const listed = yield* withActor(fixture.player)(
          items(notes.listAsPlayer(fixture.campaign.id, {})),
        );

        expect(listed.map((note) => note.id)).toEqual([fixture.shared.id]);
      }),
    );

    it.effect("is a no-op for a null scope: the DM still sees every campaign they run", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const campaigns = yield* Campaigns;

        // The invariant the existing credentials rely on. A DM token carries
        // `campaignId: null` and the scope clause must not narrow anything for it —
        // membership is what decides, and `Campaigns.create` wrote all three rows.
        const listed = yield* withActor(fixture.dm)(campaigns.list);

        expect(listed.map((c) => c.id)).toEqual(
          expect.arrayContaining([fixture.campaign.id, fixture.closed.id, fixture.otherTable.id]),
        );
      }),
    );

    it.effect("narrows a DM's own credential too, so scope does not depend on the role", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;
        const campaigns = yield* Campaigns;

        // The clause that matters here, and the one a membership predicate could
        // silently absorb: this actor is a `dm` member of all three campaigns and
        // must still reach only the one its credential names. Nothing mints such a
        // credential today; the clause exists so that whatever mints one first
        // inherits it rather than needing an audit of every read.
        const scopedDm = scopedTo(fixture.dm, fixture.campaign.id);

        const reachable = yield* withActor(scopedDm)(campaigns.list);
        const other = yield* Effect.flip(
          withActor(scopedDm)(campaigns.findById(fixture.otherTable.id)),
        );
        const write = yield* Effect.flip(
          withActor(scopedDm)(notes.create(fixture.otherTable.id, { title: "out of scope" })),
        );

        expect(reachable.map((c) => c.id)).toEqual([fixture.campaign.id]);
        expect(other._tag).toBe("NotFound");
        expect(write._tag).toBe("NotFound");

        // …and it is really scope doing that, not membership: unscoped, the same
        // account reaches all three.
        const unscoped = yield* withActor(fixture.dm)(campaigns.list);
        expect(unscoped.length).toBeGreaterThan(1);
      }),
    );
  });

  describe("another account", () => {
    it.effect("cannot reach a campaign it is not a member of", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;
        const campaigns = yield* Campaigns;

        const outsider = yield* Effect.gen(function* () {
          return yield* anAccount("Someone else");
        }).pipe(Effect.orDie);

        const note = yield* Effect.flip(
          withActor(outsider)(items(notes.listAsPlayer(fixture.campaign.id, {}))),
        );
        const campaign = yield* Effect.flip(
          withActor(outsider)(campaigns.findById(fixture.campaign.id)),
        );
        const listed = yield* withActor(outsider)(campaigns.list);

        expect(note._tag).toBe("NotFound");
        expect(campaign._tag).toBe("NotFound");
        expect(listed).toEqual([]);
      }),
    );
  });
});
