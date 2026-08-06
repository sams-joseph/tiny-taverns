import { Actor, type Campaign, CurrentActor, type Note } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Notes } from "../src/repo/Notes.js";
import { migratedDatabase } from "./support/database.js";

const runtime = ManagedRuntime.make(
  Layer.mergeAll(Accounts.layer, Campaigns.layer, Notes.layer).pipe(
    Layer.provideMerge(migratedDatabase("taverns_test_visibility")),
  ),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * Two campaigns from the same DM:
 *
 *   `campaign` — shared with players (the master toggle on), holding one `dm`
 *                note and one `shared` note
 *   `closed`   — left at the default, holding a `shared` note that must stay
 *                unreachable anyway
 */
const makeFixture = Effect.gen(function* () {
  const accounts = yield* Accounts;
  const campaigns = yield* Campaigns;
  const notes = yield* Notes;

  const issued = yield* accounts.issue("Jo");
  const dm = new Actor({ accountId: issued.accountId, role: "dm" });
  const player = new Actor({ accountId: issued.accountId, role: "player" });

  const campaign = yield* withActor(dm)(
    campaigns.create({ name: "The Reed Marches", visibility: "shared" }),
  );
  // Neither note payload mentions `visibility`… except the one that does. What
  // the first row ends up with is decided by the column default alone, which is
  // exactly what this file checks.
  const secret = yield* withActor(dm)(notes.create(campaign.id, { title: "The crate" }));
  const shared = yield* withActor(dm)(
    notes.create(campaign.id, { title: "The reeds", visibility: "shared" }),
  );

  const closed = yield* withActor(dm)(campaigns.create({ name: "The Hag's Bargain" }));
  const sharedInClosed = yield* withActor(dm)(
    notes.create(closed.id, { title: "Overheard at the ford", visibility: "shared" }),
  );

  return { dm, player, campaign, secret, shared, closed, sharedInClosed };
}).pipe(Effect.orDie);

let fixture: {
  dm: Actor;
  player: Actor;
  campaign: Campaign;
  secret: Note;
  shared: Note;
  closed: Campaign;
  sharedInClosed: Note;
};
let notes: (typeof Notes)["Service"];
let campaigns: (typeof Campaigns)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  notes = await runtime.runPromise(Notes);
  campaigns = await runtime.runPromise(Campaigns);
}, 60_000);

describe("visibility defaults to dm", () => {
  it("stores a row created with no explicit visibility as dm", () => {
    expect(fixture.secret.visibility).toBe("dm");
    expect(fixture.closed.visibility).toBe("dm");
    expect(fixture.shared.visibility).toBe("shared");
  });

  it("defaults at the column, not only in the payload schema", async () => {
    // A row inserted straight into the table, bypassing every TypeScript path,
    // still comes out `dm`. That is the property a table added later inherits
    // for free, and the reason the default lives in the migration.
    const rows = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{ readonly visibility: string; readonly origin: string }>`
          insert into note (campaign_id, title)
          values (${fixture.campaign.id}, 'inserted behind the repository')
          returning visibility, origin
        `;
      }).pipe(Effect.orDie),
    );

    expect(rows[0]).toEqual({ visibility: "dm", origin: "authored" });
  });
});

describe("a player actor", () => {
  it("cannot read a dm-visibility note", async () => {
    const error = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(notes.findById(fixture.campaign.id, fixture.secret.id)),
      ),
    );

    expect(error._tag).toBe("NotFound");
    expect(error.resource).toBe("note");
  });

  it("sees only the shared note when listing", async () => {
    const asDm = await runtime.runPromise(withActor(fixture.dm)(notes.list(fixture.campaign.id)));
    const asPlayer = await runtime.runPromise(
      withActor(fixture.player)(notes.list(fixture.campaign.id)),
    );

    expect(asDm.length).toBeGreaterThan(1);
    expect(asDm.map((note) => note.id)).toContain(fixture.secret.id);
    expect(asPlayer.map((note) => note.id)).toEqual([fixture.shared.id]);
  });

  it("cannot edit or delete even the shared note it can read", async () => {
    const updated = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          notes.update(fixture.campaign.id, fixture.shared.id, { title: "tampered" }),
        ),
      ),
    );
    const removed = await runtime.runPromise(
      Effect.flip(withActor(fixture.player)(notes.remove(fixture.campaign.id, fixture.shared.id))),
    );

    expect(updated._tag).toBe("NotFound");
    expect(removed._tag).toBe("NotFound");

    const stillThere = await runtime.runPromise(
      withActor(fixture.dm)(notes.findById(fixture.campaign.id, fixture.shared.id)),
    );
    expect(stillThere.title).toBe("The reeds");
  });

  it("cannot reach a shared note inside a campaign that is not shared", async () => {
    // The master toggle. Marking one note `shared` must not open the campaign
    // it sits in — otherwise sharing a single read-aloud silently exposes the
    // campaign's existence and every other shared row in it.
    const note = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(notes.findById(fixture.closed.id, fixture.sharedInClosed.id)),
      ),
    );
    const listed = await runtime.runPromise(
      Effect.flip(withActor(fixture.player)(notes.list(fixture.closed.id))),
    );

    expect(note._tag).toBe("NotFound");
    expect(listed._tag).toBe("NotFound");

    // …and the DM still sees it, so the note really is there to be missed.
    const asDm = await runtime.runPromise(withActor(fixture.dm)(notes.list(fixture.closed.id)));
    expect(asDm.map((note) => note.id)).toEqual([fixture.sharedInClosed.id]);
  });

  it("cannot create a note", async () => {
    const error = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(notes.create(fixture.campaign.id, { title: "from a player" })),
      ),
    );

    // `NotFound`, not `Forbidden`: telling a reader that the campaign exists but
    // is not theirs to write to is itself a disclosure.
    expect(error._tag).toBe("NotFound");
    expect(error.resource).toBe("campaign");
  });
});

describe("another account", () => {
  it("cannot reach a campaign it does not own", async () => {
    const outsider = await runtime.runPromise(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const issued = yield* accounts.issue("Someone else");
        return new Actor({ accountId: issued.accountId, role: "dm" });
      }).pipe(Effect.orDie),
    );

    const note = await runtime.runPromise(
      Effect.flip(withActor(outsider)(notes.findById(fixture.campaign.id, fixture.secret.id))),
    );
    const campaign = await runtime.runPromise(
      Effect.flip(withActor(outsider)(campaigns.findById(fixture.campaign.id))),
    );
    const listed = await runtime.runPromise(withActor(outsider)(campaigns.list));

    expect(note._tag).toBe("NotFound");
    expect(campaign._tag).toBe("NotFound");
    expect(listed).toEqual([]);
  });
});
